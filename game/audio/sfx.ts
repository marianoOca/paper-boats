// Synthesized sound effects + sea ambience (Web Audio, no asset files).
// Browsers (iOS strictly) only start audio inside a user gesture, so the context
// is created/resumed by the first tap or key, and re-resumed after iOS suspends it.
//
// Graph: voices -> comp (compressor) -> trim -> mute gain -> speakers, plus a per-voice
// send into a shared reverb that also lands in comp. Far sounds get more reverb.
import { localBoat } from "../state/localBoat";

const MUTE_KEY = "pa-muted";
const HEAR_DIST = 25; // world units at which a sound plays at half volume
const TRIM = 0.75; // the compressor adds makeup gain; this keeps the loudest hit (cannon) under clipping

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let comp: DynamicsCompressorNode | null = null;
let verb: ConvolverNode | null = null;
let noise: AudioBuffer | null = null;
let sea: { srcs: AudioScheduledSourceNode[] } | null = null;
let seaWanted = false;
let muted = false;
const muteListeners = new Set<() => void>();

if (typeof window !== "undefined") {
  try {
    muted = localStorage.getItem(MUTE_KEY) === "1";
  } catch {}
  const unlock = () => {
    if (!ctx) {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 1;
      master.connect(ctx.destination);
      comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16;
      comp.ratio.value = 5;
      comp.attack.value = 0.003;
      comp.release.value = 0.3;
      const trim = ctx.createGain();
      trim.gain.value = TRIM;
      comp.connect(trim).connect(master);
      verb = ctx.createConvolver();
      verb.buffer = makeImpulse(ctx, 2.6);
      verb.connect(comp);
      noise = makeNoise(ctx);
    }
    if (ctx.state !== "running") ctx.resume().catch(() => {});
    if (seaWanted && !sea) startSea();
  };
  for (const ev of ["pointerdown", "touchend", "keydown"]) window.addEventListener(ev, unlock, true);
}

function makeNoise(c: BaseAudioContext) {
  const buf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

// Stereo decaying noise = a big open-air reverb tail.
function makeImpulse(c: BaseAudioContext, sec: number) {
  const len = Math.floor(c.sampleRate * sec);
  const buf = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  }
  return buf;
}

export const isMuted = () => muted;
export function onMuteChange(fn: () => void) {
  muteListeners.add(fn);
  return () => void muteListeners.delete(fn);
}
export function setMuted(m: boolean) {
  muted = m;
  try {
    localStorage.setItem(MUTE_KEY, m ? "1" : "0");
  } catch {}
  if (ctx && master) master.gain.setTargetAtTime(m ? 0 : 1, ctx.currentTime, 0.02);
  muteListeners.forEach((fn) => fn());
}

// Volume for a sound at world point p, heard from the local boat.
function near(p?: [number, number, number]) {
  if (!p || !localBoat.present) return 1;
  const d = Math.hypot(p[0] - localBoat.x, p[1] - localBoat.y, p[2] - localBoat.z);
  return 1 / (1 + d / HEAR_DIST);
}

// ---- building blocks -------------------------------------------------------
type Voice = { vol: number; attack?: number; decay: number; at?: number; wet?: number; drive?: number };

// Envelope gain -> (optional soft-clip) -> comp, plus a reverb send.
function out({ vol, attack = 0.004, decay, at = 0, wet = 0, drive = 0 }: Voice): AudioNode {
  const c = ctx!;
  const t = c.currentTime + at;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  let tail: AudioNode = g;
  if (drive > 0) {
    const ws = c.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < curve.length; i++) curve[i] = Math.tanh((i / 511.5 - 1) * (1 + drive * 8));
    ws.curve = curve;
    g.connect(ws);
    tail = ws;
  }
  route(tail, wet);
  return g;
}

function route(node: AudioNode, wet: number) {
  node.connect(comp!);
  if (wet > 0) {
    const send = ctx!.createGain();
    send.gain.value = wet;
    node.connect(send).connect(verb!);
  }
}

// NES-style noise: random +-1 values, each held `hold` samples. Longer hold = lower,
// grittier noise (the chip's noise "period").
const heldNoise = new Map<number, AudioBuffer>();
function chipNoiseBuffer(hold: number) {
  let buf = heldNoise.get(hold);
  if (!buf) {
    buf = ctx!.createBuffer(1, ctx!.sampleRate, ctx!.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i += hold) d.fill(Math.random() < 0.5 ? -1 : 1, i, i + hold);
    heldNoise.set(hold, buf);
  }
  return buf;
}

// Chip noise voice: volume steps down at 60 Hz in 16 levels, like an 8-bit console.
function chip(vol: number, decay: number, hold: number, at = 0, wet = 0) {
  const c = ctx!;
  const t = c.currentTime + at;
  const src = c.createBufferSource();
  src.buffer = chipNoiseBuffer(hold);
  src.loop = true;
  const g = c.createGain();
  const frames = Math.ceil(decay * 60);
  for (let i = 0; i <= frames; i++) g.gain.setValueAtTime((vol * Math.round(15 * Math.exp((-4 * i) / frames))) / 15, t + i / 60);
  g.gain.setValueAtTime(0, t + (frames + 1) / 60);
  src.connect(g);
  route(g, wet);
  src.start(t, Math.random());
  src.stop(t + (frames + 2) / 60);
}

function burst(v: Voice, type: BiquadFilterType, f0: number, f1: number, q = 1) {
  const c = ctx!;
  const t = c.currentTime + (v.at ?? 0);
  const end = (v.attack ?? 0.004) + v.decay;
  const src = c.createBufferSource();
  src.buffer = noise;
  src.loop = true;
  src.playbackRate.value = 0.8 + Math.random() * 0.4; // no two bursts alike
  const f = c.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(f0, t);
  f.frequency.exponentialRampToValueAtTime(f1, t + end);
  src.connect(f).connect(out(v));
  src.start(t, Math.random());
  src.stop(t + end + 0.05);
}

function tone(v: Voice, type: OscillatorType, f0: number, f1: number, wobble = 0) {
  const c = ctx!;
  const t = c.currentTime + (v.at ?? 0);
  const end = (v.attack ?? 0.004) + v.decay;
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + end);
  if (wobble) {
    const lfo = c.createOscillator();
    lfo.frequency.value = 7 + Math.random() * 5;
    const depth = c.createGain();
    depth.gain.value = wobble;
    lfo.connect(depth).connect(o.frequency);
    lfo.start(t);
    lfo.stop(t + end + 0.05);
  }
  o.connect(out(v));
  o.start(t);
  o.stop(t + end + 0.05);
}

// Wood breaking: a scatter of short, resonant noise ticks.
function splinters(vol: number, n: number, spread: number, wet: number) {
  for (let i = 0; i < n; i++) {
    const f = 1500 + Math.random() * 3000;
    burst({ vol: vol * (0.5 + Math.random() * 0.5), decay: 0.03 + Math.random() * 0.08, at: Math.random() * spread, wet }, "bandpass", f, f * 0.7, 5);
  }
}

const ready = () => !!ctx && ctx.state === "running";

// ---- effects ---------------------------------------------------------------
export function sfxFire(p?: [number, number, number]) {
  if (!ready()) return;
  const v = near(p);
  const wet = 0.35 + (1 - v) * 0.6; // distant guns roll like thunder
  burst({ vol: 0.9 * v, decay: 0.05, wet }, "highpass", 5000, 2500); // crack
  burst({ vol: 1.0 * v, attack: 0.002, decay: 1.5, wet, drive: 0.6 }, "lowpass", 5000, 70); // blast
  tone({ vol: 1.0 * v, attack: 0.002, decay: 1.0, wet: wet * 0.4, drive: 0.4 }, "sine", 170, 26); // chest thump
  burst({ vol: 0.4 * v, attack: 0.08, decay: 2.4, at: 0.05, wet }, "lowpass", 260, 90); // rumble tail
}

export function sfxSplash(p?: [number, number, number]) {
  if (!ready()) return;
  const v = near(p);
  const wet = 0.1 + (1 - v) * 0.3;
  chip(0.8 * v, 0.3, 4, 0, wet); // impact crunch
  chip(0.9 * v, 0.25, 12, 0, wet); // low body
  chip(0.4 * v, 0.85, 3, 0.04, wet); // spray tail
}

export function sfxHit(kind: "ball" | "ram", p?: [number, number, number]) {
  if (!ready()) return;
  const v = near(p);
  const wet = 0.4 + (1 - v) * 0.4;
  if (kind === "ball") {
    tone({ vol: 1.0 * v, attack: 0.002, decay: 0.5, wet, drive: 0.7 }, "sine", 140, 35); // impact
    burst({ vol: 1.0 * v, attack: 0.002, decay: 0.6, wet, drive: 0.8 }, "lowpass", 3000, 200); // crunch
    splinters(0.9 * v, 9, 0.35, wet);
    tone({ vol: 0.3 * v, attack: 0.05, decay: 0.7, at: 0.1, wet }, "sawtooth", 320, 170, 18); // timber groan
  } else {
    tone({ vol: 1.0 * v, attack: 0.003, decay: 0.8, wet, drive: 0.8 }, "sine", 85, 28); // hull slam
    burst({ vol: 0.85 * v, attack: 0.003, decay: 0.9, wet, drive: 0.4 }, "lowpass", 1600, 120); // crash
    tone({ vol: 0.4 * v, attack: 0.08, decay: 1.1, at: 0.05, wet }, "sawtooth", 150, 85, 10); // hull groan
    splinters(0.6 * v, 6, 0.5, wet);
  }
}

// Bow-to-bow, glancing, or invulnerable contact: a hollow knock, no crunch.
export function sfxBump(p?: [number, number, number]) {
  if (!ready()) return;
  const v = near(p);
  tone({ vol: 1.0 * v, decay: 0.28, wet: 0.25 }, "triangle", 200, 165);
  tone({ vol: 0.6 * v, decay: 0.2, wet: 0.25 }, "triangle", 310, 270);
  burst({ vol: 0.5 * v, decay: 0.06, wet: 0.2 }, "bandpass", 900, 700, 2);
}

export function sfxSink(mine: boolean) {
  if (!ready()) return;
  const v = mine ? 0.7 : 0.35;
  tone({ vol: v, decay: 1.4, wet: 0.3 }, "triangle", 420, 70);
  for (let i = 0; i < 5; i++) tone({ vol: v * 0.4, decay: 0.08, at: 0.3 + i * 0.22 }, "sine", 500 + Math.random() * 500, 900 + Math.random() * 400);
}

export function sfxBeep(go: boolean) {
  if (!ready()) return;
  const f = go ? 880 : 440;
  tone({ vol: 0.25, decay: go ? 0.4 : 0.15 }, "square", f, f);
}

export function sfxResult(won: boolean) {
  if (!ready()) return;
  const notes = won ? [523, 659, 784, 1047] : [392, 330, 262];
  notes.forEach((f, i) => tone({ vol: 0.22, decay: 0.22, at: i * 0.16, wet: 0.2 }, won ? "square" : "triangle", f, f));
}

// ---- sea ambience ----------------------------------------------------------
// Low-passed noise whose volume swells slowly, like waves rolling in.
function startSea() {
  if (!ctx || !master || !noise) return;
  const src = ctx.createBufferSource();
  src.buffer = noise;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = 420;
  const g = ctx.createGain();
  g.gain.value = 0.12;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.13;
  const depth = ctx.createGain();
  depth.gain.value = 0.06;
  lfo.connect(depth).connect(g.gain);
  src.connect(f).connect(g).connect(master);
  src.start();
  lfo.start();
  sea = { srcs: [src, lfo] };
}

export function playSea(on: boolean) {
  seaWanted = on;
  if (on && !sea && ready()) startSea();
  if (!on && sea) {
    sea.srcs.forEach((s) => s.stop());
    sea = null;
  }
}

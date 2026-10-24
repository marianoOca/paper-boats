// Synthesized sound effects + sea ambience (Web Audio, no asset files).
// Browsers (iOS strictly) only start audio inside a user gesture, so the context
// is created/resumed by the first tap or key, and re-resumed after iOS suspends it.
import { localBoat } from "../state/localBoat";

const MUTE_KEY = "pa-muted";
const HEAR_DIST = 25; // world units at which a sound plays at half volume

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;
let sea: { src: AudioBufferSourceNode; lfo: OscillatorNode } | null = null;
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
      noise = makeNoise(ctx);
    }
    if (ctx.state !== "running") ctx.resume().catch(() => {});
    if (seaWanted && !sea) startSea();
  };
  for (const ev of ["pointerdown", "touchend", "keydown"]) window.addEventListener(ev, unlock, true);
}

function makeNoise(c: AudioContext) {
  const buf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
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
function env(vol: number, attack: number, decay: number, at = 0) {
  const g = ctx!.createGain();
  const t = ctx!.currentTime + at;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  g.connect(master!);
  return g;
}

function burst(vol: number, type: BiquadFilterType, f0: number, f1: number, decay: number) {
  const src = ctx!.createBufferSource();
  src.buffer = noise;
  const f = ctx!.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(f0, ctx!.currentTime);
  f.frequency.exponentialRampToValueAtTime(f1, ctx!.currentTime + decay);
  src.connect(f).connect(env(vol, 0.005, decay));
  src.start();
  src.stop(ctx!.currentTime + decay + 0.05);
}

function tone(vol: number, type: OscillatorType, f0: number, f1: number, decay: number, at = 0) {
  const o = ctx!.createOscillator();
  o.type = type;
  const t = ctx!.currentTime + at;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + decay);
  o.connect(env(vol, 0.005, decay, at));
  o.start(t);
  o.stop(t + decay + 0.05);
}

const ready = () => !!ctx && ctx.state === "running";

// ---- effects ---------------------------------------------------------------
export function sfxFire(p?: [number, number, number]) {
  if (!ready()) return;
  const v = near(p);
  burst(0.9 * v, "lowpass", 1400, 120, 0.7);
  tone(0.8 * v, "sine", 120, 35, 0.45);
}

export function sfxSplash(p?: [number, number, number]) {
  if (!ready()) return;
  burst(0.5 * near(p), "bandpass", 1800, 350, 0.55);
}

export function sfxHit(kind: "ball" | "ram", p?: [number, number, number]) {
  if (!ready()) return;
  const v = near(p);
  if (kind === "ball") {
    burst(0.8 * v, "highpass", 2500, 600, 0.12);
    tone(0.5 * v, "square", 220, 70, 0.2);
  } else {
    tone(0.9 * v, "sine", 95, 45, 0.3);
    burst(0.5 * v, "lowpass", 500, 150, 0.25);
  }
}

export function sfxSink(mine: boolean) {
  if (!ready()) return;
  const v = mine ? 0.7 : 0.35;
  tone(v, "triangle", 420, 70, 1.4);
  for (let i = 0; i < 5; i++) tone(v * 0.4, "sine", 500 + Math.random() * 500, 900 + Math.random() * 400, 0.08, 0.3 + i * 0.22);
}

export function sfxBeep(go: boolean) {
  if (!ready()) return;
  tone(0.25, "square", go ? 880 : 440, go ? 880 : 440, go ? 0.4 : 0.15);
}

export function sfxResult(won: boolean) {
  if (!ready()) return;
  const notes = won ? [523, 659, 784, 1047] : [392, 330, 262];
  notes.forEach((f, i) => tone(0.22, won ? "square" : "triangle", f, f, 0.22, i * 0.16));
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
  g.gain.value = 0.09;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.13;
  const depth = ctx.createGain();
  depth.gain.value = 0.05;
  lfo.connect(depth).connect(g.gain);
  src.connect(f).connect(g).connect(master);
  src.start();
  lfo.start();
  sea = { src, lfo };
}

export function playSea(on: boolean) {
  seaWanted = on;
  if (on && !sea && ready()) startSea();
  if (!on && sea) {
    sea.src.stop();
    sea.lfo.stop();
    sea = null;
  }
}

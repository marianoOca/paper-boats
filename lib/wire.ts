// Binary wire codec for the two high-frequency messages (snap, input).
// Everything else stays JSON (see protocol.ts). Frames are little-endian and
// tagged by byte 0. Decoders emit the exact EntTuple/BallTuple/BoatInput shapes
// the rest of the app already consumes, so interpolation and sim are untouched.

import type { BallTuple, EntTuple, Mode } from "../game/net/protocol";
import type { BoatInput } from "../game/net/hostInputs";

export const TAG_SNAP = 0x01;
export const TAG_INPUT = 0x03;

// quantization: positions over ±POS_RANGE, angles/quat-comps over their range.
// 256 (not 128) so a fast ball in edge arena (~200 u travel) never clips.
const POS_RANGE = 256;
const ANG_RANGE = Math.PI;

const q16 = (v: number, range: number) =>
  Math.max(-32767, Math.min(32767, Math.round((v / range) * 32767)));
const dq16 = (i: number, range: number) => (i / 32767) * range;

// ---- snap ----------------------------------------------------------------

export interface SnapEnt {
  idx: number;
  x: number; y: number; z: number;
  qx: number; qy: number; qz: number; qw: number;
  lives: number;
  flags: number;
  aimYaw: number;
}
export interface SnapBall {
  idx: number; // ball id slot (ballSeq & 0xFF)
  x: number; y: number; z: number;
}

const ENT_BYTES = 1 + 6 + 8 + 1 + 2; // idx + xyz + quat + lives|flags + aimYaw = 18
const BALL_BYTES = 1 + 6; // idx + xyz = 7

export function encodeSnap(simTimeMs: number, ents: SnapEnt[], balls: SnapBall[]): ArrayBuffer {
  const len = 1 + 4 + 1 + ents.length * ENT_BYTES + 1 + balls.length * BALL_BYTES;
  const buf = new ArrayBuffer(len);
  const dv = new DataView(buf);
  let o = 0;
  dv.setUint8(o, TAG_SNAP); o += 1;
  dv.setUint32(o, simTimeMs >>> 0, true); o += 4;
  dv.setUint8(o, ents.length); o += 1;
  for (const e of ents) {
    dv.setUint8(o, e.idx); o += 1;
    dv.setInt16(o, q16(e.x, POS_RANGE), true); o += 2;
    dv.setInt16(o, q16(e.y, POS_RANGE), true); o += 2;
    dv.setInt16(o, q16(e.z, POS_RANGE), true); o += 2;
    dv.setInt16(o, q16(e.qx, 1), true); o += 2;
    dv.setInt16(o, q16(e.qy, 1), true); o += 2;
    dv.setInt16(o, q16(e.qz, 1), true); o += 2;
    dv.setInt16(o, q16(e.qw, 1), true); o += 2;
    dv.setUint8(o, (e.lives & 0x0f) | ((e.flags & 0x0f) << 4)); o += 1;
    dv.setInt16(o, q16(e.aimYaw, ANG_RANGE), true); o += 2;
  }
  dv.setUint8(o, balls.length); o += 1;
  for (const b of balls) {
    dv.setUint8(o, b.idx); o += 1;
    dv.setInt16(o, q16(b.x, POS_RANGE), true); o += 2;
    dv.setInt16(o, q16(b.y, POS_RANGE), true); o += 2;
    dv.setInt16(o, q16(b.z, POS_RANGE), true); o += 2;
  }
  return buf;
}

/** Decode a snap. `idToIdx` maps wire slot -> player id; ents with an unknown
 *  slot (map not synced yet) are skipped. Returns null if the buffer is short. */
export function decodeSnap(
  buf: ArrayBuffer,
  idForIdx: (string | undefined)[]
): { simTime: number; ents: EntTuple[]; balls: BallTuple[] } | null {
  const dv = new DataView(buf);
  if (dv.byteLength < 6) return null;
  let o = 1; // skip tag
  const simTime = dv.getUint32(o, true) / 1000; o += 4;
  const entCount = dv.getUint8(o); o += 1;
  const ents: EntTuple[] = [];
  for (let i = 0; i < entCount; i++) {
    const idx = dv.getUint8(o); o += 1;
    const x = dq16(dv.getInt16(o, true), POS_RANGE); o += 2;
    const y = dq16(dv.getInt16(o, true), POS_RANGE); o += 2;
    const z = dq16(dv.getInt16(o, true), POS_RANGE); o += 2;
    let qx = dq16(dv.getInt16(o, true), 1); o += 2;
    let qy = dq16(dv.getInt16(o, true), 1); o += 2;
    let qz = dq16(dv.getInt16(o, true), 1); o += 2;
    let qw = dq16(dv.getInt16(o, true), 1); o += 2;
    const lf = dv.getUint8(o); o += 1;
    const aimYaw = dq16(dv.getInt16(o, true), ANG_RANGE); o += 2;
    // re-normalize: independent int16 quant breaks unit length, and slerp needs it
    const n = Math.hypot(qx, qy, qz, qw) || 1;
    qx /= n; qy /= n; qz /= n; qw /= n;
    const id = idForIdx[idx];
    if (id === undefined) continue;
    ents.push([id, x, y, z, qx, qy, qz, qw, lf & 0x0f, (lf >> 4) & 0x0f, aimYaw]);
  }
  const ballCount = dv.getUint8(o); o += 1;
  const balls: BallTuple[] = [];
  for (let i = 0; i < ballCount; i++) {
    const bidx = dv.getUint8(o); o += 1;
    const x = dq16(dv.getInt16(o, true), POS_RANGE); o += 2;
    const y = dq16(dv.getInt16(o, true), POS_RANGE); o += 2;
    const z = dq16(dv.getInt16(o, true), POS_RANGE); o += 2;
    balls.push([`b${bidx}`, x, y, z]);
  }
  return { simTime, ents, balls };
}

// ---- input ---------------------------------------------------------------
// client sends [tag, payload]; the server inserts the sender's idx after the
// tag, so the host decodes [tag, idx, payload].

const IN_PAYLOAD = 1 + 1 + 1 + 2 + 2 + 2; // throttle,steer,mode,aimYaw,aimPitch,fireSeq = 9

export function encodeInput(i: BoatInput): ArrayBuffer {
  const buf = new ArrayBuffer(1 + IN_PAYLOAD);
  const dv = new DataView(buf);
  let o = 0;
  dv.setUint8(o, TAG_INPUT); o += 1;
  dv.setInt8(o, Math.round(i.throttle * 127)); o += 1;
  dv.setInt8(o, Math.round(i.steer * 127)); o += 1;
  dv.setUint8(o, i.mode); o += 1;
  dv.setInt16(o, q16(i.aimYaw, ANG_RANGE), true); o += 2;
  dv.setInt16(o, q16(i.aimPitch, ANG_RANGE), true); o += 2;
  dv.setUint16(o, i.fireSeq & 0xffff, true); o += 2;
  return buf;
}

/** Host-side: decode an input frame carrying the sender's idx (server-inserted). */
export function decodeInput(buf: ArrayBuffer): { idx: number } & BoatInput {
  const dv = new DataView(buf);
  let o = 1; // skip tag
  const idx = dv.getUint8(o); o += 1;
  const throttle = dv.getInt8(o) / 127; o += 1;
  const steer = dv.getInt8(o) / 127; o += 1;
  const mode = dv.getUint8(o) as Mode; o += 1;
  const aimYaw = dq16(dv.getInt16(o, true), ANG_RANGE); o += 2;
  const aimPitch = dq16(dv.getInt16(o, true), ANG_RANGE); o += 2;
  const fireSeq = dv.getUint16(o, true); o += 2;
  return { idx, throttle, steer, mode, aimYaw, aimPitch, fireSeq };
}

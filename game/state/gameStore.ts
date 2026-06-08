import { create } from "zustand";
import { Quaternion } from "three";
import type { BallTuple, EntTuple, GameEvent } from "../net/protocol";
import { INTERP_DELAY_MS } from "../../lib/constants";
import { lerp } from "../../lib/math";
import { renderState } from "./fx";

interface Snap {
  recvAt: number;
  tick: number;
  simTime: number;
  ents: EntTuple[];
  balls: BallTuple[];
}

export interface SampledEnt {
  x: number;
  y: number;
  z: number;
  qx: number;
  qy: number;
  qz: number;
  qw: number;
  lives: number;
  flags: number;
  ay: number;
}

export interface Sample {
  time: number;
  ents: Map<string, SampledEnt>;
  balls: Map<string, [number, number, number]>;
}

interface GameState {
  snaps: Snap[];
  events: GameEvent[];
  pushSnap: (s: Omit<Snap, "recvAt">) => void;
  pushEvent: (e: GameEvent) => void;
  drainEvents: () => GameEvent[];
  clear: () => void;
}

const MAX_SNAPS = 16;

export const useGameStore = create<GameState>((set, get) => ({
  snaps: [],
  events: [],
  pushSnap: (s) => {
    const snaps = get().snaps;
    snaps.push({ ...s, recvAt: performance.now() });
    if (snaps.length > MAX_SNAPS) snaps.splice(0, snaps.length - MAX_SNAPS);
    set({ snaps: snaps.slice() });
  },
  pushEvent: (e) => set({ events: [...get().events, e] }),
  drainEvents: () => {
    const e = get().events;
    if (e.length) set({ events: [] });
    return e;
  },
  clear: () => set({ snaps: [], events: [] }),
}));

const qa = new Quaternion();
const qb = new Quaternion();

/** Interpolate the world `INTERP_DELAY_MS` in the past for smooth remote motion. */
export function sampleWorld(now: number): Sample {
  const snaps = useGameStore.getState().snaps;
  const ents = new Map<string, SampledEnt>();
  const balls = new Map<string, [number, number, number]>();
  if (snaps.length === 0) return { time: renderState.simTime, ents, balls };

  const renderAt = now - INTERP_DELAY_MS;

  // find bracketing snapshots by local arrival time
  let a = snaps[0];
  let b = snaps[snaps.length - 1];
  if (renderAt <= a.recvAt) b = a;
  else if (renderAt >= b.recvAt) a = b;
  else {
    for (let i = 0; i < snaps.length - 1; i++) {
      if (snaps[i].recvAt <= renderAt && renderAt <= snaps[i + 1].recvAt) {
        a = snaps[i];
        b = snaps[i + 1];
        break;
      }
    }
  }
  const span = b.recvAt - a.recvAt;
  const alpha = span > 0 ? (renderAt - a.recvAt) / span : 0;

  const bEnts = new Map(b.ents.map((e) => [e[0], e] as const));
  for (const ea of a.ents) {
    const eb = bEnts.get(ea[0]) ?? ea;
    qa.set(ea[4], ea[5], ea[6], ea[7]);
    qb.set(eb[4], eb[5], eb[6], eb[7]);
    qa.slerp(qb, alpha);
    ents.set(ea[0], {
      x: lerp(ea[1], eb[1], alpha),
      y: lerp(ea[2], eb[2], alpha),
      z: lerp(ea[3], eb[3], alpha),
      qx: qa.x,
      qy: qa.y,
      qz: qa.z,
      qw: qa.w,
      lives: eb[8],
      flags: eb[9],
      ay: lerp(ea[10], eb[10], alpha),
    });
  }
  // entities present only in the newer snapshot
  for (const eb of b.ents) {
    if (!ents.has(eb[0])) {
      ents.set(eb[0], {
        x: eb[1], y: eb[2], z: eb[3],
        qx: eb[4], qy: eb[5], qz: eb[6], qw: eb[7],
        lives: eb[8], flags: eb[9], ay: eb[10],
      });
    }
  }

  const bBalls = new Map(b.balls.map((x) => [x[0], x] as const));
  for (const ba of a.balls) {
    const bb = bBalls.get(ba[0]) ?? ba;
    balls.set(ba[0], [lerp(ba[1], bb[1], alpha), lerp(ba[2], bb[2], alpha), lerp(ba[3], bb[3], alpha)]);
  }
  for (const bb of b.balls) if (!balls.has(bb[0])) balls.set(bb[0], [bb[1], bb[2], bb[3]]);

  const time = lerp(a.simTime, b.simTime, alpha);
  renderState.simTime = time;
  return { time, ents, balls };
}

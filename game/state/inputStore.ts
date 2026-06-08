import { create } from "zustand";
import { MODE_MOVE, type Mode } from "../net/protocol";

interface InputState {
  throttle: number; // -1..1
  steer: number; // -1..1
  mode: Mode;
  aimYaw: number; // cannon aim, relative to boat heading (rad)
  aimPitch: number;
  fireSeq: number; // bumps on each fire request
  lastFireAt: number; // performance.now() of last local fire (HUD reload bar)
  lookYaw: number; // move-mode camera look offset (rad), decays to 0
  lookPitch: number;
  setMode: (m: Mode) => void;
  bumpFire: () => void;
  penaltyReload: () => void; // early-fire penalty: resets reload without shooting
}

export const useInputStore = create<InputState>((set, get) => ({
  throttle: 0,
  steer: 0,
  mode: MODE_MOVE,
  aimYaw: 0,
  aimPitch: 0.18,
  fireSeq: 0,
  lastFireAt: 0,
  lookYaw: 0,
  lookPitch: 0,
  setMode: (mode) => set({ mode }),
  bumpFire: () => set({ fireSeq: get().fireSeq + 1, lastFireAt: performance.now() }),
  penaltyReload: () => set({ lastFireAt: performance.now() }),
}));

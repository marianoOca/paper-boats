import { create } from "zustand";
import { MODE_CANNON, MODE_MOVE, type Mode } from "../net/protocol";
import { CANNON } from "../../lib/constants";
import { useLobbyStore } from "./lobbyStore";

interface InputState {
  throttle: number; // -1..1
  steer: number; // -1..1
  mode: Mode;
  aimYaw: number; // cannon aim, relative to boat heading (rad)
  aimPitch: number;
  fireSeq: number; // bumps on each launch (host fires on rising edge)
  lastFireAt: number; // performance.now() of last click (HUD reload bar)
  charging: boolean; // windup in progress (click → launch)
  lookYaw: number; // move-mode camera look offset (rad), decays to 0
  lookPitch: number;
  spamCount: number; // clicks while reloading without a real fire in between
  setMode: (m: Mode) => void;
  requestFire: () => void; // click: reserve reload now, launch after windupMs with latest aim
  resetSpamCount: () => void;
}

export const useInputStore = create<InputState>((set, get) => ({
  throttle: 0,
  steer: 0,
  mode: MODE_MOVE,
  aimYaw: 0,
  aimPitch: 0.18,
  fireSeq: 0,
  lastFireAt: 0,
  charging: false,
  lookYaw: 0,
  lookPitch: 0,
  spamCount: 0,
  setMode: (mode) => set({ mode }),
  requestFire: () => {
    const s = get();
    if (s.charging) return; // one shot per windup
    if ((performance.now() - s.lastFireAt) / CANNON.reloadMs < 1) {
      set({ lastFireAt: performance.now(), spamCount: s.spamCount + 1 }); // early-click penalty
      return;
    }
    // reserve reload immediately (bar feedback + spam block); launch after the windup
    set({ charging: true, lastFireAt: performance.now(), spamCount: 0 });
    setTimeout(() => {
      const st = useLobbyStore.getState();
      const me = st.players.find((p) => p.id === st.myId);
      const launchable = st.phase === "playing" && !!me?.alive && get().mode === MODE_CANNON;
      set(launchable ? { charging: false, fireSeq: get().fireSeq + 1 } : { charging: false });
    }, CANNON.windupMs);
  },
  resetSpamCount: () => set({ spamCount: 0 }),
}));

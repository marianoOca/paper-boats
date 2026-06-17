import { create } from "zustand";
import type { Phase, PlayerMeta, RoomSettings } from "../net/protocol";

interface LobbyState {
  myId: string;
  connected: boolean;
  gotRoom: boolean; // a `room` message has been received (slot info is now trustworthy)
  full: boolean;
  phase: Phase;
  hostId: string;
  settings: RoomSettings;
  players: PlayerMeta[];
  startEpoch: number | null;
  endReason: "timeout" | "combat" | null;

  pendingName: string;
  setPendingName: (n: string) => void;

  setMyId: (id: string) => void;
  setConnected: (c: boolean) => void;
  setFull: (f: boolean) => void;
  resetConnection: () => void;
  applyRoom: (r: {
    phase: Phase;
    hostId: string;
    settings: RoomSettings;
    players: PlayerMeta[];
    startEpoch: number | null;
    endReason: "timeout" | "combat" | null;
  }) => void;
}

export const useLobbyStore = create<LobbyState>((set) => ({
  pendingName: "",
  setPendingName: (n) => set({ pendingName: n }),

  myId: "",
  connected: false,
  gotRoom: false,
  full: false,
  phase: "lobby",
  hostId: "",
  settings: { timerSec: 120, arenaMode: "walls", startLives: 3 },
  players: [],
  startEpoch: null,
  endReason: null,

  setMyId: (myId) => set({ myId }),
  setConnected: (connected) => set({ connected }),
  setFull: (full) => set({ full }),
  resetConnection: () => set({ connected: false, gotRoom: false, players: [], full: false }),
  applyRoom: (r) => set({ ...r, gotRoom: true }),
}));

// selector helpers
export const selectMe = (s: LobbyState): PlayerMeta | undefined =>
  s.players.find((p) => p.id === s.myId);
export const selectIsHost = (s: LobbyState) => s.myId !== "" && s.myId === s.hostId;

/** idx -> player id, for decoding binary snaps. Call imperatively (rebuilds a Map). */
export const idxToId = (): (string | undefined)[] => {
  const map: (string | undefined)[] = [];
  for (const p of useLobbyStore.getState().players) map[p.idx] = p.id;
  return map;
};

import { create } from "zustand";
import type { Phase, PlayerMeta, RoomSettings } from "../net/protocol";

interface LobbyState {
  myId: string;
  connected: boolean;
  full: boolean;
  phase: Phase;
  hostId: string;
  settings: RoomSettings;
  players: PlayerMeta[];
  startEpoch: number | null;
  endReason: "timeout" | "combat" | null;

  setMyId: (id: string) => void;
  setConnected: (c: boolean) => void;
  setFull: (f: boolean) => void;
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
  myId: "",
  connected: false,
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
  applyRoom: (r) => set({ ...r }),
}));

// selector helpers
export const selectMe = (s: LobbyState): PlayerMeta | undefined =>
  s.players.find((p) => p.id === s.myId);
export const selectIsHost = (s: LobbyState) => s.myId !== "" && s.myId === s.hostId;

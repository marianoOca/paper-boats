import { create } from "zustand";
import type PartySocket from "partysocket";
import { json, type ClientMsg } from "../net/protocol";

interface NetState {
  socket: PartySocket | null;
  serverOffset: number; // serverClock - localClock (ms)
  setSocket: (s: PartySocket | null) => void;
  setOffset: (o: number) => void;
  send: (m: ClientMsg) => void;
  sendRaw: (buf: ArrayBuffer) => void;
  serverNow: () => number;
}

export const useNetStore = create<NetState>((set, get) => ({
  socket: null,
  serverOffset: 0,
  setSocket: (socket) => set({ socket }),
  setOffset: (serverOffset) => set({ serverOffset }),
  send: (m) => {
    const s = get().socket;
    if (s && s.readyState === s.OPEN) s.send(json(m));
  },
  sendRaw: (buf) => {
    const s = get().socket;
    if (s && s.readyState === s.OPEN) s.send(buf);
  },
  serverNow: () => Date.now() + get().serverOffset,
}));

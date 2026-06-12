"use client";
import { useEffect } from "react";
import PartySocket from "partysocket";
import type { ServerMsg } from "./protocol";
import { json } from "./protocol";
import { useNetStore } from "../state/netStore";
import { useLobbyStore, idxToId } from "../state/lobbyStore";
import { useGameStore } from "../state/gameStore";
import { hostInputs } from "./hostInputs";
import { TAG_SNAP, TAG_INPUT, decodeSnap, decodeInput } from "../../lib/wire";

const PARTY_HOST = process.env.NEXT_PUBLIC_PARTYKIT_HOST || "127.0.0.1:1999";

export function useConnection(code: string, profile: { name: string; color?: string }) {
  useEffect(() => {
    if (!code || !profile.name) return;
    const socket = new PartySocket({ host: PARTY_HOST, room: code.toUpperCase() });
    socket.binaryType = "arraybuffer";
    useNetStore.getState().setSocket(socket);

    let pingTimer: ReturnType<typeof setInterval> | undefined;

    const onOpen = () => {
      socket.binaryType = "arraybuffer"; // re-affirm: PartySocket recreates the WS on reconnect
      useLobbyStore.getState().setConnected(true);
      socket.send(json({ t: "join", name: profile.name }));
      if (profile.color) socket.send(json({ t: "setColor", color: profile.color }));
      pingTimer = setInterval(() => socket.send(json({ t: "ping", ts: Date.now() })), 3000);
      socket.send(json({ t: "ping", ts: Date.now() }));
    };

    const onMessage = (e: MessageEvent) => {
      // binary frames: snap (-> clients) and input (-> host)
      if (e.data instanceof ArrayBuffer) {
        const tag = new Uint8Array(e.data, 0, 1)[0];
        if (tag === TAG_SNAP) {
          const s = decodeSnap(e.data, idxToId());
          if (s) useGameStore.getState().pushSnap(s);
        } else if (tag === TAG_INPUT) {
          const { idx, ...input } = decodeInput(e.data);
          const id = idxToId()[idx];
          if (id) hostInputs.set(id, input);
        }
        return;
      }
      let m: ServerMsg | { t: "full" };
      try {
        m = JSON.parse(e.data);
      } catch {
        return;
      }
      switch (m.t) {
        case "welcome":
          useLobbyStore.getState().setMyId(m.id);
          break;
        case "room":
          useLobbyStore.getState().applyRoom({
            phase: m.phase,
            hostId: m.hostId,
            settings: m.settings,
            players: m.players,
            startEpoch: m.startEpoch,
            endReason: m.endReason,
          });
          break;
        case "ev":
          useGameStore.getState().pushEvent(m.ev);
          break;
        case "pong": {
          const rtt = Date.now() - m.ts;
          useNetStore.getState().setOffset(m.server + rtt / 2 - Date.now());
          break;
        }
        case "full":
          useLobbyStore.getState().setFull(true);
          break;
      }
    };

    const onClose = () => useLobbyStore.getState().setConnected(false);

    socket.addEventListener("open", onOpen);
    socket.addEventListener("message", onMessage);
    socket.addEventListener("close", onClose);

    return () => {
      if (pingTimer) clearInterval(pingTimer);
      socket.removeEventListener("open", onOpen);
      socket.removeEventListener("message", onMessage);
      socket.removeEventListener("close", onClose);
      socket.close();
      useNetStore.getState().setSocket(null);
      useLobbyStore.getState().setConnected(false);
      useGameStore.getState().clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, profile.name, profile.color]);
}

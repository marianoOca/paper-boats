"use client";
import { useEffect, useRef } from "react";
import PartySocket from "partysocket";
import type { ServerMsg } from "./protocol";
import { json } from "./protocol";
import { useNetStore } from "../state/netStore";
import { useLobbyStore, idxToId } from "../state/lobbyStore";
import { useGameStore } from "../state/gameStore";
import { hostState } from "../sim/hostState";
import { hostInputs } from "./hostInputs";
import { TAG_SNAP, TAG_INPUT, decodeSnap, decodeInput } from "../../lib/wire";

export function useConnection(code: string, profile: { name: string; color?: string }, clientId?: string) {
  // Latest name, read inside the socket's onOpen without re-opening the socket.
  const nameRef = useRef(profile.name);
  nameRef.current = profile.name;

  // Socket lifecycle is keyed on (code, clientId) only — NOT the name. A returning
  // tab connects with its saved id before it has a name, so the server can tell it
  // whether its id already owns a boat. The `join` (which commits a name and creates
  // a fresh slot) is sent separately, below.
  useEffect(() => {
    if (!code || !clientId) return;
    // When no explicit host is configured, reuse whatever host served the page so
    // LAN devices reach the dev machine (not their own 127.0.0.1). Prod sets the env.
    const partyHost = process.env.NEXT_PUBLIC_PARTYKIT_HOST || `${window.location.hostname}:1999`;
    // Stable id => conn.id survives reconnects (and tab close, via localStorage), so
    // the server matches a returning socket to its existing slot (boat, lives, stats).
    const socket = new PartySocket({ host: partyHost, room: code.toUpperCase(), id: clientId });
    socket.binaryType = "arraybuffer";
    useNetStore.getState().setSocket(socket);

    let pingTimer: ReturnType<typeof setInterval> | undefined;

    // Tell the server whether this tab is foreground. Host failover only promotes a
    // visible tab — a backgrounded one can't run the rAF sim (snaps would stall).
    const sendVis = () => {
      if (socket.readyState === socket.OPEN) {
        socket.send(json({ t: "vis", v: document.visibilityState === "visible" }));
      }
    };

    const onOpen = () => {
      socket.binaryType = "arraybuffer"; // re-affirm: PartySocket recreates the WS on reconnect
      useLobbyStore.getState().setConnected(true);
      // Re-affirm our name if one is already committed (covers reconnect after a blip
      // for a player who already joined). A name-less discovery socket sends nothing.
      if (nameRef.current) socket.send(json({ t: "join", name: nameRef.current }));
      sendVis(); // current foreground state (also self-corrects after a reconnect)
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
          if (id) {
            hostState.syncFireSeq(id, input.fireSeq); // adopt baseline post-takeover (no-op otherwise)
            hostInputs.set(id, input);
          }
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
    document.addEventListener("visibilitychange", sendVis);

    return () => {
      if (pingTimer) clearInterval(pingTimer);
      socket.removeEventListener("open", onOpen);
      socket.removeEventListener("message", onMessage);
      socket.removeEventListener("close", onClose);
      document.removeEventListener("visibilitychange", sendVis);
      socket.close();
      useNetStore.getState().setSocket(null);
      useLobbyStore.getState().setConnected(false);
      useGameStore.getState().clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, clientId]);

  // Commit the name once the player picks one (the Landing screen). The socket is
  // already open by now, so send `join` directly — the server creates the slot.
  useEffect(() => {
    if (!profile.name) return;
    const s = useNetStore.getState().socket;
    if (s && s.readyState === s.OPEN) s.send(json({ t: "join", name: profile.name }));
  }, [profile.name]);
}

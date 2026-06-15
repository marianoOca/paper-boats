"use client";
import { useEffect, useState } from "react";
import { useConnection } from "../../../game/net/useConnection";
import { useGameInput } from "../../../game/input/useGameInput";
import { useLobbyStore } from "../../../game/state/lobbyStore";
import { GameCanvas } from "../../../components/game/GameCanvas";
import { Lobby } from "../../../components/ui/Lobby";
import { Hud } from "../../../components/ui/Hud";
import { Countdown } from "../../../components/ui/Countdown";
import { Leaderboard } from "../../../components/ui/Leaderboard";
import { Landing } from "../../../components/ui/Landing";
import { TouchControls } from "../../../components/ui/TouchControls";
import { useDevice } from "../../../components/ui/useDevice";
import { FONT_MONO } from "../../../lib/uiStyles";

// crypto.randomUUID only exists in secure contexts (https / localhost); LAN http
// access has none. We only need per-tab uniqueness, not crypto strength.
function makeClientId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `cid-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export default function RoomPage({ params }: { params: { code: string } }) {
  const code = (params.code || "").toUpperCase();
  const [name, setName] = useState<string | null>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Stable id in localStorage so a reopened tab (or refresh) resumes the same slot —
    // not just sessionStorage, which dies with the tab and would mint a new sailor.
    let cid = localStorage.getItem("pa_cid");
    if (!cid) {
      cid = makeClientId();
      localStorage.setItem("pa_cid", cid);
    }
    setClientId(cid);
    setMounted(true);
  }, []);

  // hooks must run every render; the socket opens on the id alone, and only commits a
  // name (creating a slot) once `name` is set below.
  useConnection(code, { name: name || "" }, clientId || undefined);
  useGameInput();

  const phase = useLobbyStore((s) => s.phase);
  const full = useLobbyStore((s) => s.full);
  const connected = useLobbyStore((s) => s.connected);
  const gotRoom = useLobbyStore((s) => s.gotRoom);
  const hasSlot = useLobbyStore((s) => s.myId !== "" && s.players.some((p) => p.id === s.myId));
  const { isTouch } = useDevice();

  if (!mounted) return null;
  if (full) return <Center>Room is full — 12 sailors aboard</Center>;

  // Wait for the first `room` before deciding: a reopened mid-match tab that still owns
  // a boat (its id is in the roster) must skip the name screen — flashing Landing first
  // would be wrong. Only once we know the roster can we tell that apart from a player
  // who isn't in this match.
  if (!gotRoom && !name) return <Center>Connecting to room {code}…</Center>;

  // No boat for our id and no chosen name => ask for one. A reconnecting player who is
  // still part of this match already has a slot, so falls straight through to the game;
  // anyone else (fresh lobby player, or a newcomer joining mid-match) enters a name.
  // Exception: at the post-match leaderboard there's nothing to drive — a returning
  // player sees their ranking and a newcomer just spectates (they'll be asked for a
  // name at the next lobby), so never prompt during `ended`.
  if (!hasSlot && !name && phase !== "ended") {
    return <Landing onPlay={(n) => setName(n)} />;
  }

  const inMatch = phase === "countdown" || phase === "playing" || phase === "ended";

  return (
    <>
      {inMatch && <GameCanvas />}
      {phase === "lobby" && <Lobby />}
      {(phase === "countdown" || phase === "playing") && <Hud />}
      {(phase === "countdown" || phase === "playing") && isTouch && <TouchControls />}
      {phase === "countdown" && <Countdown />}
      {phase === "ended" && <Leaderboard />}
      {!connected && <Center>Connecting to room {code}…</Center>}
    </>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "grid",
        placeItems: "center",
        background: "radial-gradient(circle at 50% 30%, #1d4a63, #0b1d28)",
        color: "#f3e2bf",
        fontFamily: FONT_MONO,
        fontSize: 22,
        zIndex: 50,
      }}
    >
      {children}
    </div>
  );
}

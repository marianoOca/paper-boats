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

export default function RoomPage({ params }: { params: { code: string } }) {
  const code = (params.code || "").toUpperCase();
  const [name, setName] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setName(sessionStorage.getItem("pa_name"));
    setMounted(true);
  }, []);

  // hooks must run every render; they no-op until a name exists
  useConnection(code, { name: name || "" });
  useGameInput();

  const phase = useLobbyStore((s) => s.phase);
  const full = useLobbyStore((s) => s.full);
  const connected = useLobbyStore((s) => s.connected);
  const { isTouch } = useDevice();

  if (!mounted) return null;

  if (!name) {
    return <Landing onPlay={(n) => setName(n)} />;
  }
  if (full) return <Center>Room is full — 12 sailors aboard</Center>;

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

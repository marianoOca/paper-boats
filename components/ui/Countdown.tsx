"use client";
import { useNetStore } from "../../game/state/netStore";
import { useLobbyStore } from "../../game/state/lobbyStore";
import { COUNTDOWN_MS } from "../../lib/constants";
import { FONT_MONO } from "../../lib/uiStyles";
import { useEffect } from "react";
import { sfxBeep } from "../../game/audio/sfx";
import { useTick } from "./useTick";

export function Countdown() {
  useTick(60);
  const startEpoch = useLobbyStore((s) => s.startEpoch);
  const serverNow = useNetStore((s) => s.serverNow);
  const remaining = startEpoch == null ? COUNTDOWN_MS : COUNTDOWN_MS - (serverNow() - startEpoch);
  const n = Math.ceil(remaining / 1000);
  const label = remaining <= 0 ? "GO!" : String(n);
  useEffect(() => {
    if (startEpoch != null && label !== "GO!") sfxBeep(false);
  }, [label, startEpoch]);
  // The overlay unmounts the moment play starts, usually before "GO!" renders.
  useEffect(() => () => sfxBeep(true), []);
  if (startEpoch == null) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "grid",
        placeItems: "center",
        pointerEvents: "none",
        fontFamily: FONT_MONO,
      }}
    >
      <div
        key={label}
        style={{
          fontSize: 160,
          fontWeight: 900,
          color: remaining <= 0 ? "#7CFC00" : "#f3e2bf",
          textShadow: "6px 6px 0 #000",
          animation: "pa-pop 0.4s ease-out",
        }}
      >
        {label}
      </div>
      <style>{`@keyframes pa-pop{from{transform:scale(0.4);opacity:0}to{transform:scale(1);opacity:1}}`}</style>
    </div>
  );
}

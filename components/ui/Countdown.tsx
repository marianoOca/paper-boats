"use client";
import { useNetStore } from "../../game/state/netStore";
import { useLobbyStore } from "../../game/state/lobbyStore";
import { COUNTDOWN_MS } from "../../lib/constants";
import { useTick } from "./useTick";

export function Countdown() {
  useTick(60);
  const startEpoch = useLobbyStore((s) => s.startEpoch);
  const serverNow = useNetStore((s) => s.serverNow);
  if (startEpoch == null) return null;
  const remaining = COUNTDOWN_MS - (serverNow() - startEpoch);
  const n = Math.ceil(remaining / 1000);
  const label = remaining <= 0 ? "GO!" : String(n);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "grid",
        placeItems: "center",
        pointerEvents: "none",
        fontFamily: "ui-monospace, monospace",
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

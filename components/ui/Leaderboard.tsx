"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useNetStore } from "../../game/state/netStore";
import { useLobbyStore, selectIsHost, selectMe } from "../../game/state/lobbyStore";
import type { PlayerMeta } from "../../game/net/protocol";

function medal(rank?: number) {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return `#${rank ?? "-"}`;
}

function status(p: PlayerMeta) {
  return p.alive ? `afloat · ${p.lives}♥` : "sunk";
}

export function Leaderboard() {
  const router = useRouter();
  const send = useNetStore((s) => s.send);
  const players = useLobbyStore((s) => s.players);
  const me = useLobbyStore(selectMe);
  const isHost = useLobbyStore(selectIsHost);
  const endReason = useLobbyStore((s) => s.endReason);
  const [splashVisible, setSplashVisible] = useState(endReason === "timeout");
  const [reveal, setReveal] = useState(false);

  useEffect(() => {
    if (endReason !== "timeout") {
      const t = setTimeout(() => setReveal(true), 1700);
      return () => clearTimeout(t);
    }
    const hideSplash = setTimeout(() => setSplashVisible(false), 1800);
    const showReveal = setTimeout(() => setReveal(true), 3200);
    return () => { clearTimeout(hideSplash); clearTimeout(showReveal); };
  }, [endReason]);

  const ranked = [...players]
    .filter((p) => p.name)
    .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99) || a.name.localeCompare(b.name));

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: reveal ? 28 : 0,
        background: "rgba(7,20,28,0.78)",
        fontFamily: "ui-monospace, monospace",
        color: "#f3e2bf",
        padding: 20,
      }}
    >
      {endReason === "timeout" && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(7,20,28,0.92)",
            zIndex: 10,
            opacity: splashVisible ? 1 : 0,
            transition: "opacity 0.6s ease",
            pointerEvents: "none",
          }}
        >
          <div style={{ fontSize: 22, letterSpacing: 4, opacity: 0.7, marginBottom: 10 }}>MATCH OVER</div>
          <div style={{ fontSize: 72, fontWeight: 900, textShadow: "0 0 40px #f3e2bf88" }}>⏱ TIME'S UP!</div>
        </div>
      )}
      {/* your result card */}
      <div
        style={{
          background: "var(--parchment)",
          color: "var(--ink)",
          border: "4px solid var(--wood)",
          borderRadius: 10,
          padding: reveal ? "20px 26px" : "40px 60px",
          textAlign: "center",
          transition: "all 0.6s cubic-bezier(.2,.8,.2,1)",
          transform: reveal ? "scale(0.92)" : "scale(1.1)",
          boxShadow: "0 12px 0 rgba(0,0,0,0.3)",
        }}
      >
        <div style={{ fontSize: reveal ? 16 : 22, opacity: 0.7 }}>YOU FINISHED</div>
        <div style={{ fontSize: reveal ? 64 : 92, fontWeight: 900 }}>{medal(me?.rank)}</div>
        <div style={{ fontSize: 20, fontWeight: 700 }}>{me?.name}</div>
        <div style={{ marginTop: 6, opacity: 0.8 }}>
          {me ? status(me) : ""} · {me?.damageDealt ?? 0} hits
        </div>
      </div>

      {/* full leaderboard */}
      <div
        style={{
          width: 420,
          maxWidth: "92vw",
          opacity: reveal ? 1 : 0,
          transform: reveal ? "translateX(0)" : "translateX(40px)",
          transition: "all 0.6s ease 0.1s",
          pointerEvents: reveal ? "auto" : "none",
        }}
      >
        <h2 style={{ marginBottom: 10, textShadow: "2px 2px 0 #000" }}>⚓ Leaderboard</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {ranked.map((p) => (
            <div
              key={p.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 12px",
                background: p.id === me?.id ? "#fff7e6" : "#e9d8b0cc",
                color: "var(--ink)",
                border: `2px solid ${p.id === me?.id ? "#000" : "var(--wood)"}`,
                borderRadius: 6,
              }}
            >
              <span style={{ width: 34, fontWeight: 800 }}>{medal(p.rank)}</span>
              <span style={{ width: 16, height: 16, background: p.color, borderRadius: 3, border: "1px solid #0003" }} />
              <span style={{ flex: 1, fontWeight: 700 }}>{p.name}</span>
              <span style={{ opacity: 0.8 }}>{status(p)}</span>
              <span style={{ width: 70, textAlign: "right" }}>{p.damageDealt} hits</span>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          {isHost ? (
            <button onClick={() => send({ t: "rematch" })} style={lbBtn("#2e7d32")}>
              ↻ Play again
            </button>
          ) : (
            <div style={{ flex: 1, alignSelf: "center", opacity: 0.75 }}>Waiting for host…</div>
          )}
          <button onClick={() => router.push("/")} style={lbBtn("#6b4423")}>
            Leave
          </button>
        </div>
      </div>
    </div>
  );
}

function lbBtn(bg: string): React.CSSProperties {
  return {
    flex: 1,
    background: bg,
    color: "#f3e2bf",
    border: "2px solid rgba(0,0,0,0.3)",
    borderRadius: 6,
    padding: "10px 14px",
    fontWeight: 700,
    fontFamily: "inherit",
  };
}

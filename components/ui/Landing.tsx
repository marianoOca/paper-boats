"use client";
import { useEffect, useState } from "react";
import { FONT_MONO, PANEL, pirateBtn, INPUT, PIRATE_GOLD } from "../../lib/uiStyles";
import { SPLASHES } from "../../lib/copy";
import { PixelAnchor } from "./PixelIcons";

export function Landing({ onPlay }: { onPlay: (name: string) => void }) {
  const [name, setName] = useState("");
  const [splash, setSplash] = useState("");

  useEffect(() => {
    setName(localStorage.getItem("pa_name") || "");
    setSplash(SPLASHES[Math.floor(Math.random() * SPLASHES.length)]);
  }, []);

  const canGo = name.trim().length > 0;

  const play = () => {
    if (!canGo) return;
    const n = name.trim().slice(0, 16);
    localStorage.setItem("pa_name", n);
    onPlay(n);
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "grid",
        placeItems: "center",
        background: "radial-gradient(circle at 50% 25%, #1d4a63, #0b1d28)",
        fontFamily: FONT_MONO,
        padding: 20,
      }}
    >
      <div
        style={{
          ...PANEL,
          padding: 30,
          width: "min(440px, 94vw)",
          textAlign: "center",
          position: "relative",
          overflow: "visible",
        }}
      >
        {splash && <span style={splashStyle}>{splash}</span>}
        <h1 style={{ fontSize: 38, letterSpacing: 1 }}><PixelAnchor size={32} /> PAPER ARMADA</h1>
        <p style={{ opacity: 0.75, margin: "6px 0 22px" }}>Sink the fleet. Last paper boat afloat wins.</p>

        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          maxLength={16}
          onKeyDown={(e) => e.key === "Enter" && play()}
          style={input}
        />

        <button onClick={play} disabled={!canGo} style={{ ...btn("#c0392b"), width: "100%", fontSize: 20, marginTop: 14, opacity: canGo ? 1 : 0.5 }}>
          Play
        </button>
      </div>
    </div>
  );
}


const splashStyle: React.CSSProperties = {
  position: "absolute",
  top: 0,
  left: -110,

  transform: "translateX(-50%) rotate(-30deg)",
  transformOrigin: "center center",

  display: "inline-block",
  color: PIRATE_GOLD,
  fontWeight: 800,
  fontSize: 17,
  lineHeight: 1.2,
  maxWidth: 350,
  textAlign: "center",

  textShadow: "2px 2px 0 #5a3e00",
  animation: "splash-pulse 0.9s ease-in-out infinite",

  pointerEvents: "none",
};

const input: React.CSSProperties = { width: "100%", ...INPUT };

const btn = (bg: string): React.CSSProperties =>
  pirateBtn(bg, { padding: "12px 16px", fontFamily: "inherit", cursor: "pointer" });

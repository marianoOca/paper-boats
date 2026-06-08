"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FONT_MONO, PANEL, pirateBtn, INPUT } from "../lib/uiStyles";

export default function Landing() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [splash, setSplash] = useState("");

  useEffect(() => {
    setName(sessionStorage.getItem("pa_name") || "");
    setSplash(SPLASHES[Math.floor(Math.random() * SPLASHES.length)]);
  }, []);

  const canGo = name.trim().length > 0;

  const play = () => {
    if (!canGo) return;
    sessionStorage.setItem("pa_name", name.trim().slice(0, 16));
    router.push("/room/GAME");
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
        <h1 style={{ fontSize: 38, letterSpacing: 1 }}>⚓ PAPER ARMADA</h1>
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
          ⚔ Play
        </button>
      </div>
    </div>
  );
}

const SPLASHES = [
  "As pirates stole the gold, we'll steal your code!",
  "git push --force, ye scallywag!",
  "Plunder the repo!",
  "Memory leak?!, WALK THE PLANK!!",
  "Now with 100% more cannonballs!",
  "Ship it or walk the plank!",
  "X marks the merge conflict!",
  "No bugs, only barnacles!",
  "Powered by rum and React!",
  "Yarr-chitecture!",
  "Sink your tech debt!",
  "Commit early, plunder often!",
  "Avast! Don't deploy on Friday!",
  "Hoist the main branch!",
  "Made by software pirates!",
  "Steal the booty, ship the code!",
  "Dead men tell no tales. Production logs tell everything!",
  "Raise the flag! the build finally passed!",
  "Ye call it technical debt. We pirates call it buried treasure",
  "Only 3Rs: Rum, rebellion and refactoring!",
  "A pirate fears no ocean monster… except merge conflicts",
  "The sea shows no mercy. Neither does production!",
  "Trust the compass. Distrust the legacy code!",
  "We set sail with dreams and return with stack traces",
  "A smooth sea never made a senior developer!",
  "404 Treasure Not Found",
  "Permission denied? Mutiny!",
  "Never listen to the sirens! (AI suggestions)",
  "Arrr-gument type mismatch!",
  "Ahoy! New pull request incoming!",
  "A true pirate never reads the documentation!",
  "Code review? Sounds like mutiny!",
  "Cap'n, the Docker container is sinking!",
  "Buried under deep dependencies!",
];

const splashStyle: React.CSSProperties = {
  position: "absolute",
  top: 0,
  left: -110,

  transform: "translateX(-50%) rotate(-30deg)",
  transformOrigin: "center center",

  display: "inline-block",
  color: "#ffeb3b",
  fontWeight: 800,
  fontSize: 17,
  lineHeight: 1.2,
  maxWidth: 350,
  textAlign: "center",

  textShadow: "2px 2px 0 #7a5d00",
  animation: "splash-pulse 0.9s ease-in-out infinite",

  pointerEvents: "none",
};

const input: React.CSSProperties = { width: "100%", ...INPUT };

const btn = (bg: string): React.CSSProperties =>
  pirateBtn(bg, { padding: "12px 16px", fontFamily: "inherit", cursor: "pointer" });

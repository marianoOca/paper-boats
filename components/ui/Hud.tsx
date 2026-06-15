"use client";
import { useState, useRef, useEffect } from "react";
import { useNetStore } from "../../game/state/netStore";
import { useLobbyStore, selectMe } from "../../game/state/lobbyStore";
import { useInputStore } from "../../game/state/inputStore";
import { useTauntStore } from "../../game/state/tauntStore";
import { MODE_CANNON } from "../../game/net/protocol";
import { CANNON, COUNTDOWN_MS } from "../../lib/constants";
import { FONT_MONO, TEXT_SHADOW, PIRATE_GOLD } from "../../lib/uiStyles";
import { PixelHourglass, PixelHeart, PixelBoat } from "./PixelIcons";
import { clamp } from "../../lib/math";
import { useTick } from "./useTick";
import { useDevice } from "./useDevice";
import { CANNON_SPAM } from "../../lib/copy";

function fmt(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function Hud() {
  useTick(80);
  const me = useLobbyStore(selectMe);
  const players = useLobbyStore((s) => s.players);
  const phase = useLobbyStore((s) => s.phase);
  const settings = useLobbyStore((s) => s.settings);
  const startEpoch = useLobbyStore((s) => s.startEpoch);
  const mode = useInputStore((s) => s.mode);
  const lastFireAt = useInputStore((s) => s.lastFireAt);
  const charging = useInputStore((s) => s.charging);
  const spamCount = useInputStore((s) => s.spamCount);
  const resetSpamCount = useInputStore((s) => s.resetSpamCount);

  const [spamMsg, setSpamMsg] = useState<string | null>(null);
  const spamTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (spamCount >= 3 && !spamTimerRef.current) {
      setSpamMsg(CANNON_SPAM[Math.floor(Math.random() * CANNON_SPAM.length)]);
      resetSpamCount();
      spamTimerRef.current = setTimeout(() => {
        setSpamMsg(null);
        spamTimerRef.current = null;
      }, 5000);
    }
  }, [spamCount, resetSpamCount]);
  const serverNow = useNetStore((s) => s.serverNow);
  const myTaunt = useTauntStore((s) => (me ? s.taunts[me.id] : undefined));
  const { isTouch } = useDevice();

  const alive = players.filter((p) => p.alive && p.name).length;
  const lives = me?.lives ?? 0;
  const cannon = mode === MODE_CANNON;
  const reload = clamp((performance.now() - lastFireAt) / CANNON.reloadMs, 0, 1);
  const ready = reload >= 1;
  const charge = clamp((performance.now() - lastFireAt) / CANNON.windupMs, 0, 1);
  const barPct = charging ? charge * 100 : reload * 100;
  const barColor = charging ? "#e6433f" : ready ? PIRATE_GOLD : "#a07830";
  const barLabel = charging ? "SHOOTING" : ready ? "FIRE READY" : "RELOADING";

  let timeStr = "∞";
  if (settings.timerSec != null && startEpoch != null) {
    const end = startEpoch + COUNTDOWN_MS + settings.timerSec * 1000;
    timeStr = fmt(Math.max(0, (end - serverNow()) / 1000));
  }

  const txt: React.CSSProperties = { textShadow: TEXT_SHADOW };

  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", fontFamily: FONT_MONO }}>
      {/* top bar */}
      <div style={{ position: "absolute", top: 12, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 24, ...txt }}>
        <span style={{ fontSize: 26, fontWeight: 700 }}><PixelHourglass size={22} /> {timeStr}</span>
        <span style={{ fontSize: 26, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 8 }}>
          <PixelBoat /> {alive} afloat
        </span>
        {isTouch && (
          <span style={{ fontSize: 26, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 2 }}>
            {Array.from({ length: lives }, (_, i) => <PixelHeart key={i} size={18} color="#e6433f" />)}
            {Array.from({ length: Math.max(0, settings.startLives - lives) }, (_, i) => <PixelHeart key={`e${i}`} size={18} color="#00000066" />)}
          </span>
        )}
      </div>

      {me?.alive && myTaunt && (
        <div style={{ position: "absolute", top: 50, left: 0, right: 0, textAlign: "center", ...txt }}>
          <span style={{ fontSize: 22, fontStyle: "italic", color: PIRATE_GOLD }}>&ldquo;{myTaunt}&rdquo;</span>
        </div>
      )}

      {/* lives (bottom-left on desktop; moved up next to "afloat" on touch) */}
      {!isTouch && (
        <div style={{ position: "absolute", left: 16, bottom: 16, display: "flex", gap: 3, alignItems: "center", ...txt }}>
          {Array.from({ length: lives }, (_, i) => <PixelHeart key={i} size={22} color="#e6433f" />)}
          {Array.from({ length: Math.max(0, settings.startLives - lives) }, (_, i) => <PixelHeart key={`e${i}`} size={22} color="#00000055" />)}
        </div>
      )}

      {/* crosshair / cannon reticle */}
      {cannon && (me?.alive ?? true) && (
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            width: 26,
            height: 26,
            transform: "translate(-50%,-50%)",
            border: `3px solid ${ready ? PIRATE_GOLD : "#a07830"}`,
            borderRadius: "50%",
            boxShadow: "0 0 0 2px #000",
          }}
        />
      )}

      {/* reload bar */}
      {cannon && (me?.alive ?? true) && (
        <div style={{ position: "absolute", left: "50%", bottom: 70, transform: "translateX(-50%)", width: 220 }}>
          {spamMsg && (
            <div style={{ textAlign: "center", fontSize: 14, fontWeight: 700, color: "#e6433f", marginBottom: 4, ...txt }}>
              {spamMsg}
            </div>
          )}
          <div style={{ height: 12, background: "#0007", border: "2px solid #000", borderRadius: 4 }}>
            <div
              style={{
                height: "100%",
                width: `${barPct}%`,
                background: barColor,
                transition: "width 80ms linear",
              }}
            />
          </div>
          <div style={{ textAlign: "center", fontWeight: 700, ...txt }}>{barLabel}</div>
        </div>
      )}

      {/* controls hint (desktop only — touch devices use on-screen controls) */}
      {!isTouch && (
        <div style={{ position: "absolute", right: 16, bottom: 14, textAlign: "right", fontSize: 13, opacity: 0.85, ...txt }}>
          <div>WASD / arrows — sail</div>
          <div>Mouse — {cannon ? "aim" : "look"}</div>
          <div>Click — {cannon ? "shoot" : "cannon"}</div>
          <div>Esc — release mouse</div>
        </div>
      )}

      {!me?.alive && me && (
        <div style={{ position: "absolute", left: "50%", top: "42%", transform: "translate(-50%,-50%)", textAlign: "center", ...txt }}>
          <div style={{ fontSize: 40, fontWeight: 800, color: "#e6433f" }}>SUNK! spectating</div>
          {myTaunt && <div style={{ fontSize: 20, fontStyle: "italic", color: PIRATE_GOLD, marginTop: 8 }}>&ldquo;{myTaunt}&rdquo;</div>}
        </div>
      )}
    </div>
  );
}

"use client";
import { useNetStore } from "../../game/state/netStore";
import { useLobbyStore, selectMe } from "../../game/state/lobbyStore";
import { useInputStore } from "../../game/state/inputStore";
import { useTauntStore } from "../../game/state/tauntStore";
import { MODE_CANNON } from "../../game/net/protocol";
import { CANNON, COUNTDOWN_MS } from "../../lib/constants";
import { clamp } from "../../lib/math";
import { useTick } from "./useTick";

function fmt(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

// Side-view origami paper boat as pixel art — triangular sail/peak over a flared
// hull, derived from the 3D boat silhouette. '#' = filled cell.
const BOAT_PIXELS = [
  "..........#.........",
  ".........###........",
  ".........###........",
  "........#####.......",
  "........#####.......",
  ".......#######......",
  "####################",
  ".##################.",
  ".##################.",
  "..################..",
  "..################..",
  "...##############...",
  "....############....",
];
function BoatIcon({ size = 26, color = "#f3e2bf" }: { size?: number; color?: string }) {
  const w = BOAT_PIXELS[0].length;
  const h = BOAT_PIXELS.length;
  const rects: React.ReactElement[] = [];
  BOAT_PIXELS.forEach((row, y) =>
    [...row].forEach((c, x) => {
      if (c === "#") rects.push(<rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} />);
    }),
  );
  return (
    <svg
      width={(size * w) / h}
      height={size}
      viewBox={`0 0 ${w} ${h}`}
      shapeRendering="crispEdges"
      fill={color}
      style={{ verticalAlign: "-0.18em", filter: "drop-shadow(1px 1px 0 #000)" }}
    >
      {rects}
    </svg>
  );
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
  const serverNow = useNetStore((s) => s.serverNow);
  const myTaunt = useTauntStore((s) => (me ? s.taunts[me.id] : undefined));

  const alive = players.filter((p) => p.alive && p.name).length;
  const lives = me?.lives ?? 0;
  const cannon = mode === MODE_CANNON;
  const reload = clamp((performance.now() - lastFireAt) / CANNON.reloadMs, 0, 1);
  const ready = reload >= 1;

  let timeStr = "∞";
  if (settings.timerSec != null && startEpoch != null) {
    const end = startEpoch + COUNTDOWN_MS + settings.timerSec * 1000;
    timeStr = fmt(Math.max(0, (end - serverNow()) / 1000));
  }

  const txt: React.CSSProperties = { textShadow: "2px 2px 0 #000" };

  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", fontFamily: "ui-monospace, monospace" }}>
      {/* top bar */}
      <div style={{ position: "absolute", top: 12, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 24, ...txt }}>
        <span style={{ fontSize: 26, fontWeight: 700 }}>⏱ {timeStr}</span>
        <span style={{ fontSize: 26, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 8 }}>
          <BoatIcon /> {alive} afloat
        </span>
      </div>

      {me?.alive && myTaunt && (
        <div style={{ position: "absolute", top: 50, left: 0, right: 0, textAlign: "center", ...txt }}>
          <span style={{ fontSize: 22, fontStyle: "italic", color: "#ffe08a" }}>&ldquo;{myTaunt}&rdquo;</span>
        </div>
      )}

      {/* lives */}
      <div style={{ position: "absolute", left: 16, bottom: 16, fontSize: 34, ...txt }}>
        <span style={{ color: "#e6433f" }}>{"♥".repeat(lives)}</span>
        <span style={{ color: "#00000066" }}>{"♥".repeat(Math.max(0, settings.startLives - lives))}</span>
      </div>

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
            border: `3px solid ${ready ? "#7CFC00" : "#ffd24a"}`,
            borderRadius: "50%",
            boxShadow: "0 0 0 2px #000",
          }}
        />
      )}

      {/* reload bar */}
      {cannon && (
        <div style={{ position: "absolute", left: "50%", bottom: 70, transform: "translateX(-50%)", width: 220 }}>
          <div style={{ height: 12, background: "#0007", border: "2px solid #000", borderRadius: 4 }}>
            <div
              style={{
                height: "100%",
                width: `${reload * 100}%`,
                background: ready ? "#7CFC00" : "#ffd24a",
                transition: "width 80ms linear",
              }}
            />
          </div>
          <div style={{ textAlign: "center", fontWeight: 700, ...txt }}>{ready ? "FIRE READY" : "RELOADING"}</div>
        </div>
      )}

      {/* controls hint */}
      <div style={{ position: "absolute", right: 16, bottom: 14, textAlign: "right", fontSize: 13, opacity: 0.85, ...txt }}>
        <div>WASD / arrows — sail</div>
        <div>Mouse — {cannon ? "aim" : "look"}</div>
        <div>Click — {cannon ? "shoot" : "cannon"}</div>
      </div>

      {!me?.alive && me && (
        <div style={{ position: "absolute", left: "50%", top: "42%", transform: "translate(-50%,-50%)", textAlign: "center", ...txt }}>
          <div style={{ fontSize: 40, fontWeight: 800, color: "#e6433f" }}>SUNK! spectating</div>
          {myTaunt && <div style={{ fontSize: 20, fontStyle: "italic", color: "#ffe08a", marginTop: 8 }}>&ldquo;{myTaunt}&rdquo;</div>}
        </div>
      )}
    </div>
  );
}

"use client";
import { useNetStore } from "../../game/state/netStore";
import { useLobbyStore, selectIsHost, selectMe } from "../../game/state/lobbyStore";
import { BOAT_COLORS, MIN_PLAYERS_TO_START, TIMER_OPTIONS } from "../../lib/constants";
import { pirateBtn } from "../../lib/uiStyles";
import { Heart } from "../Heart";

const panel: React.CSSProperties = {
  background: "var(--parchment)",
  color: "var(--ink)",
  border: "4px solid var(--wood)",
  borderRadius: 8,
  boxShadow: "0 10px 0 rgba(0,0,0,0.25)",
  padding: 20,
};

function timerLabel(sec: number | null) {
  if (sec == null) return "No timer";
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}

export function Lobby() {
  const send = useNetStore((s) => s.send);
  const players = useLobbyStore((s) => s.players);
  const settings = useLobbyStore((s) => s.settings);
  const me = useLobbyStore(selectMe);
  const isHost = useLobbyStore(selectIsHost);

  const namedCount = players.filter((p) => p.name).length;
  const usedByOthers = new Set(players.filter((p) => p.id !== me?.id).map((p) => p.color));

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "grid",
        placeItems: "center",
        background: "radial-gradient(circle at 50% 30%, #1d4a63, #0b1d28)",
        overflow: "auto",
        padding: 20,
      }}
    >
      <div style={{ ...panel, width: "min(680px, 94vw)" }}>
        <h1 style={{ fontSize: 30, letterSpacing: 1 }}>⚓ PAPER ARMADA</h1>

        <p style={{ margin: "6px 0 16px", opacity: 0.8 }}>
          {players.length} sailor{players.length === 1 ? "" : "s"} aboard
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px,1fr))", gap: 8 }}>
          {players.map((p) => (
            <div
              key={p.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 10px",
                background: p.id === me?.id ? "#fff7e6" : "#e9d8b0",
                border: "2px solid var(--wood)",
                borderRadius: 6,
              }}
            >
              <span style={{ width: 18, height: 18, background: p.color, borderRadius: 3, border: "1px solid #0003" }} />
              <span style={{ fontWeight: 700, flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>
                {p.name || "…"}
              </span>
              {p.isHost && <span title="host">👑</span>}
            </div>
          ))}
        </div>

        <hr style={{ margin: "18px 0", border: 0, borderTop: "2px dashed var(--wood)" }} />

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Your boat color</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {BOAT_COLORS.map((c) => {
              const taken = usedByOthers.has(c);
              const mine = me?.color === c;
              return (
                <button
                  key={c}
                  disabled={taken}
                  onClick={() => send({ t: "setColor", color: c })}
                  title={taken ? "taken" : c}
                  style={{
                    width: 30,
                    height: 30,
                    background: c,
                    borderRadius: 5,
                    border: mine ? "3px solid #000" : "2px solid #0004",
                    opacity: taken ? 0.25 : 1,
                    cursor: taken ? "not-allowed" : "pointer",
                  }}
                />
              );
            })}
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Lives</div>
          <div style={{ display: "flex", gap: 6 }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                disabled={!isHost}
                onClick={() => isHost && send({ t: "setLives", startLives: n })}
                style={{
                  background: settings.startLives >= n ? "#e6433f" : "#6b4423",
                  border: "2px solid rgba(0,0,0,0.3)",
                  borderRadius: 6,
                  padding: "8px 10px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 36,
                  height: 36,
                  opacity: isHost ? 1 : 0.7,
                  cursor: isHost ? "pointer" : "not-allowed",
                }}
              >
                <Heart filled={false} />
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", gap: 20, marginBottom: 14 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Match timer</div>
            <div style={{ display: "flex", gap: 6 }}>
              {TIMER_OPTIONS.map((sec) => (
                <button
                  key={String(sec)}
                  disabled={!isHost}
                  onClick={() => isHost && send({ t: "setTimer", timerSec: sec })}
                  style={{
                    ...btn(settings.timerSec === sec ? "#2e7d32" : "#6b4423"),
                    opacity: isHost ? 1 : 0.7,
                    cursor: isHost ? "pointer" : "not-allowed",
                  }}
                >
                  {timerLabel(sec)}
                </button>
              ))}
            </div>
          </div>

          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Arena</div>
            <div style={{ display: "flex", gap: 6 }}>
              {([
                ["walls", "Walls"],
                ["edge", "Edge"],
              ] as const).map(([mode, label]) => (
                <button
                  key={mode}
                  disabled={!isHost}
                  onClick={() => isHost && send({ t: "setArenaMode", arenaMode: mode })}
                  title={mode === "walls" ? "Bounce off the bucket walls" : "Fall off the edge to sink"}
                  style={{
                    ...btn(settings.arenaMode === mode ? "#2e7d32" : "#6b4423"),
                    opacity: isHost ? 1 : 0.7,
                    cursor: isHost ? "pointer" : "not-allowed",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div style={{ marginTop: 18 }}>
          <button
            disabled={!isHost || namedCount < MIN_PLAYERS_TO_START}
            onClick={() => isHost && send({ t: "start" })}
            style={{
              ...btn(namedCount < MIN_PLAYERS_TO_START ? "#888" : "#c0392b"),
              width: "100%",
              fontSize: 18,
              cursor:
                !isHost || namedCount < MIN_PLAYERS_TO_START
                  ? "not-allowed"
                  : "pointer",
              opacity: isHost ? 1 : 0.7,
            }}
          >
            ⚔ Start ({namedCount}/{MIN_PLAYERS_TO_START}+)
          </button>
        </div>
        {!isHost && (
          <p style={{ marginTop: 18, textAlign: "center", opacity: 0.7 }}>
            Waiting for the host to start…
          </p>
        )}
      </div>
    </div>
  );
}

const btn = (bg: string): React.CSSProperties => pirateBtn(bg, { padding: "8px 12px" });

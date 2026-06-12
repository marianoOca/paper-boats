"use client";
import { useEffect, useRef } from "react";
import { useInputStore } from "../../game/state/inputStore";
import { useLobbyStore, selectMe } from "../../game/state/lobbyStore";
import { MODE_CANNON, MODE_MOVE } from "../../game/net/protocol";
import { CANNON } from "../../lib/constants";
import { clamp, deg } from "../../lib/math";
import { FONT_MONO, TEXT_SHADOW } from "../../lib/uiStyles";
import { PixelBoat, PixelCannon } from "./PixelIcons";
import { useTick } from "./useTick";

const DEADZONE = 0.12;
const AIM_RATE = 1.9; // rad/s at full deflection (cannon aim)
const LOOK_RATE = 3.0; // higher: must outpace the 1.5/s look decay in MOVE mode
const MAX_AIM_YAW = deg(CANNON.maxAimYaw);
const MIN_PITCH = deg(CANNON.minPitchDeg);
const MAX_PITCH = deg(CANNON.maxPitchDeg);

const BASE_SIZE = "clamp(92px, 20vw, 128px)";

// Chrome shared with FullscreenButton: flat translucent wood, thin dark border,
// flat drop-shadow. Keeps every on-screen control visually identical.
const WOOD_BTN = "rgba(91,58,26,0.72)";
const BTN_BORDER = "2px solid rgba(0,0,0,0.35)";
const DROP = `drop-shadow(${TEXT_SHADOW})`;

type Stick = { id: number | null; cx: number; cy: number; r: number };
type Vec = { x: number; y: number } | null;

// On-screen touch controls. Mounted only on touch devices, during play. Writes
// the same inputStore fields the network send-loop already streams, so there are
// no protocol/server/sim changes — this is purely a second input source.
//
// MOVE: left stick = steer/throttle, right stick = look, button = "CANNON".
// CANNON: left stick becomes FIRE, right stick = aim, button = "SAIL".
export function TouchControls() {
  const mode = useInputStore((s) => s.mode);
  const me = useLobbyStore(selectMe);
  const alive = me?.alive ?? true;
  const cannon = mode === MODE_CANNON;
  useTick(80); // re-render to animate the fire-button reload state

  const leftVec = useRef<Vec>(null);
  const rightVec = useRef<Vec>(null);
  const leftStick = useRef<Stick>({ id: null, cx: 0, cy: 0, r: 1 });
  const rightStick = useRef<Stick>({ id: null, cx: 0, cy: 0, r: 1 });
  const leftKnob = useRef<HTMLDivElement>(null);
  const rightKnob = useRef<HTMLDivElement>(null);

  // Integration loop: stick deflection -> inputStore, every frame.
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const step = () => {
      const now = performance.now();
      let dt = (now - last) / 1000;
      last = now;
      if (dt > 0.05) dt = 0.05; // clamp post-stall spikes so aim doesn't jump
      const s = useInputStore.getState();
      const lv = leftVec.current;
      const rv = rightVec.current;
      const { myId, players } = useLobbyStore.getState();
      const sunk = !(players.find((p) => p.id === myId)?.alive ?? true);

      if (s.mode === MODE_MOVE) {
        if (lv) useInputStore.setState({ throttle: -lv.y, steer: lv.x });
        else if (s.throttle !== 0 || s.steer !== 0)
          useInputStore.setState({ throttle: 0, steer: 0 });
        if (rv) {
          const ly = s.lookYaw - rv.x * LOOK_RATE * dt;
          useInputStore.setState({
            lookYaw: sunk ? ly : clamp(ly, -deg(120), deg(120)),
            lookPitch: clamp(s.lookPitch + rv.y * LOOK_RATE * dt, -deg(35), deg(55)),
          });
        }
      } else if (rv) {
        useInputStore.setState({
          aimYaw: clamp(s.aimYaw - rv.x * AIM_RATE * dt, -MAX_AIM_YAW, MAX_AIM_YAW),
          aimPitch: clamp(s.aimPitch + rv.y * AIM_RATE * dt, MIN_PITCH, MAX_PITCH),
        });
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Stale-input guard: a stick can unmount mid-press when the mode flips (left
  // stick -> fire button), so its pointerup never fires. Clear held state on
  // every mode change and reset the throttle when switching into cannon.
  useEffect(() => {
    leftVec.current = null;
    rightVec.current = null;
    leftStick.current.id = null;
    rightStick.current.id = null;
    if (leftKnob.current) leftKnob.current.style.transform = "translate(0px,0px)";
    if (rightKnob.current) rightKnob.current.style.transform = "translate(0px,0px)";
    if (mode === MODE_CANNON) useInputStore.setState({ throttle: 0, steer: 0 });
  }, [mode]);

  const stickHandlers = (
    st: React.MutableRefObject<Stick>,
    vec: React.MutableRefObject<Vec>,
    knob: React.RefObject<HTMLDivElement>,
  ) => {
    const apply = (clientX: number, clientY: number) => {
      const { cx, cy, r } = st.current;
      const dx = clientX - cx;
      const dy = clientY - cy;
      const dist = Math.hypot(dx, dy);
      const cd = Math.min(dist, r);
      const ux = dist > 0 ? dx / dist : 0;
      const uy = dist > 0 ? dy / dist : 0;
      if (knob.current) knob.current.style.transform = `translate(${ux * cd}px,${uy * cd}px)`;
      let n = cd / r;
      n = n < DEADZONE ? 0 : (n - DEADZONE) / (1 - DEADZONE);
      vec.current = { x: ux * n, y: uy * n };
    };
    const release = (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.pointerId !== st.current.id) return;
      st.current.id = null;
      vec.current = null;
      if (knob.current) knob.current.style.transform = "translate(0px,0px)";
    };
    return {
      onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => {
        if (st.current.id != null) return;
        const rect = e.currentTarget.getBoundingClientRect();
        st.current = {
          id: e.pointerId,
          cx: rect.left + rect.width / 2,
          cy: rect.top + rect.height / 2,
          r: rect.width / 2,
        };
        e.currentTarget.setPointerCapture(e.pointerId);
        apply(e.clientX, e.clientY);
      },
      onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => {
        if (e.pointerId !== st.current.id) return;
        apply(e.clientX, e.clientY);
      },
      onPointerUp: release,
      onPointerCancel: release,
    };
  };

  const fire = (e: React.PointerEvent) => {
    e.preventDefault();
    useInputStore.getState().requestFire();
  };
  const toggleMode = (e: React.PointerEvent) => {
    e.preventDefault();
    const { mode: cur, setMode } = useInputStore.getState();
    setMode(cur === MODE_CANNON ? MODE_MOVE : MODE_CANNON);
  };

  const reload = clamp((performance.now() - useInputStore.getState().lastFireAt) / CANNON.reloadMs, 0, 1);
  const ready = reload >= 1;

  const stickBase: React.CSSProperties = {
    width: BASE_SIZE,
    height: BASE_SIZE,
    borderRadius: "50%",
    background: WOOD_BTN,
    border: BTN_BORDER,
    filter: DROP,
    pointerEvents: "auto",
    touchAction: "none",
    display: "grid",
    placeItems: "center",
  };
  const knobStyle: React.CSSProperties = {
    width: "46%",
    height: "46%",
    borderRadius: "50%",
    background: "rgba(176,120,64,0.85)",
    border: BTN_BORDER,
    willChange: "transform",
  };
  const label: React.CSSProperties = { textAlign: "center", fontSize: 12, fontWeight: 800, color: "#f3e2bf", textShadow: TEXT_SHADOW, letterSpacing: 1, opacity: 0.9 };
  const group: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 6, alignItems: "center" };

  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", touchAction: "none", fontFamily: FONT_MONO, color: "#f3e2bf", zIndex: 20 }}>
      {/* left column: mode toggle on top, stick/fire below */}
      {alive && (
        <div style={{ position: "absolute", left: 20, bottom: 24, display: "flex", flexDirection: "column", gap: 14, alignItems: "center", pointerEvents: "none" }}>
          <div style={group}>
            <button
              onPointerDown={toggleMode}
              style={{
                pointerEvents: "auto",
                touchAction: "none",
                padding: "10px 16px",
                background: WOOD_BTN,
                border: BTN_BORDER,
                borderRadius: 8,
                filter: DROP,
                display: "grid",
                placeItems: "center",
              }}
            >
              {cannon ? <PixelBoat size={28} /> : <PixelCannon size={28} />}
            </button>
            <div style={label}>{cannon ? "SAIL" : "GUNS"}</div>
          </div>

          <div style={group}>
            <div style={label}>{cannon ? "FIRE" : "MOVE"}</div>
            {cannon ? (
              <button
                onPointerDown={fire}
                style={{
                  pointerEvents: "auto",
                  touchAction: "none",
                  width: BASE_SIZE,
                  height: BASE_SIZE,
                  borderRadius: "50%",
                  display: "grid",
                  placeItems: "center",
                  fontFamily: FONT_MONO,
                  fontWeight: 800,
                  fontSize: 22,
                  color: "#f3e2bf",
                  textShadow: TEXT_SHADOW,
                  background: ready ? "rgba(200,40,40,0.80)" : WOOD_BTN,
                  border: BTN_BORDER,
                  filter: DROP,
                  transition: "background 120ms",
                }}
              >
                {ready ? <PixelCannon size={44} /> : "···"}
              </button>
            ) : (
              <div style={stickBase} {...stickHandlers(leftStick, leftVec, leftKnob)}>
                <div ref={leftKnob} style={knobStyle} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* right column: aim/look stick */}
      <div style={{ position: "absolute", right: 20, bottom: 24, ...group, pointerEvents: "none" }}>
        <div style={label}>{cannon ? "AIM" : "LOOK"}</div>
        <div style={stickBase} {...stickHandlers(rightStick, rightVec, rightKnob)}>
          <div ref={rightKnob} style={knobStyle} />
        </div>
      </div>
    </div>
  );
}

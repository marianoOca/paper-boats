"use client";
import { useEffect } from "react";
import { useInputStore } from "../state/inputStore";
import { useLobbyStore } from "../state/lobbyStore";
import { useNetStore } from "../state/netStore";
import { MODE_CANNON, MODE_MOVE } from "../net/protocol";
import { INPUT_HZ, CANNON } from "../../lib/constants";
import { clamp, deg } from "../../lib/math";
import { encodeInput } from "../../lib/wire";

const SENS = 0.0024;
const MAX_AIM_YAW = deg(CANNON.maxAimYaw);
const MIN_PITCH = deg(CANNON.minPitchDeg);
const MAX_PITCH = deg(CANNON.maxPitchDeg);

export function useGameInput() {
  useEffect(() => {
    // Touch devices use on-screen controls (TouchControls). Skip the mouse path:
    // pointer lock is unsupported on mobile, and a synthetic mousedown from a tap
    // on empty screen would otherwise flip the boat into cannon mode.
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const held = new Set<string>();
    const canvas = () => document.querySelector("canvas");
    const locked = () => document.pointerLockElement != null;
    const playing = () => useLobbyStore.getState().phase === "playing";
    const isSunk = () => {
      const { myId, players } = useLobbyStore.getState();
      const me = players.find((p) => p.id === myId);
      return me && !me.alive;
    };

    const applyAxes = () => {
      const up = held.has("KeyW") || held.has("ArrowUp");
      const down = held.has("KeyS") || held.has("ArrowDown");
      const left = held.has("KeyA") || held.has("ArrowLeft");
      const right = held.has("KeyD") || held.has("ArrowRight");
      useInputStore.setState({
        throttle: (up ? 1 : 0) - (down ? 1 : 0),
        steer: (right ? 1 : 0) - (left ? 1 : 0),
      });
    };

    const tryLock = () => {
      if (!locked()) canvas()?.requestPointerLock();
    };

    const switchToCannon = () => {
      useInputStore.getState().setMode(MODE_CANNON);
      held.clear();
      useInputStore.setState({ throttle: 0, steer: 0 });
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (!playing() || isSunk()) return;
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code))
        e.preventDefault();
      if (e.repeat) return;

      const cur = useInputStore.getState().mode;

      if (cur === MODE_CANNON) {
        const isMoveKey = ["KeyW", "KeyS", "KeyA", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code);
        if (isMoveKey || e.code === "Space") {
          useInputStore.getState().setMode(MODE_MOVE);
          if (isMoveKey) {
            held.add(e.code);
            applyAxes();
          }
        }
        return;
      }

      // MODE_MOVE
      if (e.code === "Space") {
        switchToCannon();
        tryLock();
        return;
      }

      held.add(e.code);
      applyAxes();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      held.delete(e.code);
      applyAxes();
    };

    const onMouseDown = (e: MouseEvent) => {
      if (coarse || !playing()) return;
      if (isSunk()) {
        tryLock();
        return;
      }
      tryLock();
      const cur = useInputStore.getState().mode;
      if (cur === MODE_MOVE) {
        switchToCannon();
      } else if (e.button === 0) {
        useInputStore.getState().requestFire();
      }
    };
    const onContext = (e: Event) => e.preventDefault();

    const onMouseMove = (e: MouseEvent) => {
      if (coarse || !locked() || !playing()) return;
      const s = useInputStore.getState();
      if (s.mode === MODE_CANNON && !isSunk()) {
        useInputStore.setState({
          aimYaw: clamp(s.aimYaw - e.movementX * SENS, -MAX_AIM_YAW, MAX_AIM_YAW),
          aimPitch: clamp(s.aimPitch + e.movementY * SENS, MIN_PITCH, MAX_PITCH),
        });
      } else {
        useInputStore.setState({
          lookYaw: isSunk()
            ? s.lookYaw - e.movementX * SENS
            : clamp(s.lookYaw - e.movementX * SENS, -deg(120), deg(120)),
          lookPitch: clamp(s.lookPitch + e.movementY * SENS, -deg(35), deg(55)),
        });
      }
    };

    // send + decay loop. Binary, send-on-change (idle = zero packets). The host
    // reads its own input locally, so it never sends `in` over the network.
    const amHost = () => {
      const st = useLobbyStore.getState();
      return st.myId !== "" && st.myId === st.hostId;
    };
    let last = performance.now();
    let lastBuf: Uint8Array | null = null;
    const tick = setInterval(() => {
      const now = performance.now();
      const dt = (now - last) / 1000;
      last = now;
      const s = useInputStore.getState();
      // look offset decays back to centered when in move mode (not when spectating)
      if (s.mode === MODE_MOVE && !isSunk()) {
        const k = Math.exp(-1.5 * dt);
        useInputStore.setState({ lookYaw: s.lookYaw * k, lookPitch: s.lookPitch * k, aimYaw: s.aimYaw * k, aimPitch: s.aimPitch * k });
      }
      if (!playing() || amHost()) {
        lastBuf = null; // re-baseline so the first send of a match always goes out
        return;
      }
      const c = useInputStore.getState();
      const buf = new Uint8Array(encodeInput({
        throttle: c.throttle, steer: c.steer, mode: c.mode,
        aimYaw: c.aimYaw, aimPitch: c.aimPitch, fireSeq: c.fireSeq,
      }));
      if (lastBuf && lastBuf.length === buf.length && lastBuf.every((b, i) => b === buf[i])) return;
      lastBuf = buf;
      useNetStore.getState().sendRaw(buf.buffer);
    }, 1000 / INPUT_HZ);

    let prevPhase = useLobbyStore.getState().phase;
    const unsubPhase = useLobbyStore.subscribe((s) => {
      if (s.phase !== "playing" && document.pointerLockElement != null) {
        document.exitPointerLock();
      }
      // New match starting: reset to move view so players always begin steering.
      if (s.phase === "countdown" && prevPhase !== "countdown") {
        useInputStore.getState().setMode(MODE_MOVE);
      }
      prevPhase = s.phase;
    });

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("contextmenu", onContext);

    return () => {
      clearInterval(tick);
      unsubPhase();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("contextmenu", onContext);
    };
  }, []);
}

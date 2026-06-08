"use client";
import { useMemo } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { localBoat } from "../../game/state/localBoat";
import { useInputStore } from "../../game/state/inputStore";
import { renderState } from "../../game/state/fx";
import { useLobbyStore, selectMe } from "../../game/state/lobbyStore";
import { MODE_CANNON } from "../../game/net/protocol";
import { CANNON, GRAVITY_Y } from "../../lib/constants";
import { waveHeight } from "../../lib/waves";
import { computeAim } from "../../game/sim/aim";

const STEPS = 50;
const DT = 0.045;

export function TrajectoryPreview() {
  const me = useLobbyStore(selectMe);

  const { line, marker, positions } = useMemo(() => {
    const positions = new Float32Array(STEPS * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const line = new THREE.Line(
      geo,
      new THREE.LineBasicMaterial({ color: "#ffd24a", transparent: true, opacity: 0.85 })
    );
    line.frustumCulled = false;
    const marker = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 0.8, 16),
      new THREE.MeshBasicMaterial({ color: "#ffd24a", transparent: true, opacity: 0.9, side: THREE.DoubleSide })
    );
    marker.rotation.x = -Math.PI / 2;
    return { line, marker, positions };
  }, []);

  useFrame(() => {
    const ins = useInputStore.getState();
    const show = ins.mode === MODE_CANNON && localBoat.present && (me?.alive ?? true);
    line.visible = show;
    marker.visible = show;
    if (!show) return;

    const a = computeAim(ins.aimYaw, ins.aimPitch);
    let px = a.tx;
    let py = a.ty;
    let pz = a.tz;
    let vx = a.dx * CANNON.ballSpeed;
    let vy = a.dy * CANNON.ballSpeed;
    let vz = a.dz * CANNON.ballSpeed;

    let count = 0;
    for (let i = 0; i < STEPS; i++) {
      positions[i * 3] = px;
      positions[i * 3 + 1] = py;
      positions[i * 3 + 2] = pz;
      count = i + 1;
      const surf = waveHeight(px, pz, renderState.simTime);
      if (py <= surf && i > 1) {
        marker.position.set(px, surf + 0.05, pz);
        break;
      }
      px += vx * DT;
      py += vy * DT;
      pz += vz * DT;
      vy += GRAVITY_Y * DT;
    }
    // collapse unused points onto the last one
    for (let i = count; i < STEPS; i++) {
      positions[i * 3] = px;
      positions[i * 3 + 1] = py;
      positions[i * 3 + 2] = pz;
    }
    line.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <>
      <primitive object={line} />
      <primitive object={marker} />
    </>
  );
}

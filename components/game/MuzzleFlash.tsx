"use client";
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useInputStore } from "../../game/state/inputStore";
import { MUZZLE_TIP_Z } from "./Cannon";

// Tiny muzzle flash for the LOCAL player only. Rendered as a child of CannonRig's
// barrel group, so it inherits yaw + elevation and stays glued to the muzzle.
// Sits at the muzzle tip and puffs forward (+Z = barrel direction) on each launch.
const DUR = 0.26; // seconds

export function MuzzleFlash() {
  const groupRef = useRef<THREE.Group>(null);
  const coreRef = useRef<THREE.MeshBasicMaterial>(null);
  const puffRef = useRef<THREE.MeshBasicMaterial>(null);
  const lastFireSeq = useRef(useInputStore.getState().fireSeq);
  const t = useRef(Infinity); // Infinity = idle

  useFrame((_, dt) => {
    const fireSeq = useInputStore.getState().fireSeq;
    if (fireSeq !== lastFireSeq.current) {
      lastFireSeq.current = fireSeq;
      t.current = 0; // trigger
    }

    const g = groupRef.current;
    if (!g) return;

    if (t.current >= DUR) {
      if (g.visible) g.visible = false;
      return;
    }
    g.visible = true;
    t.current += dt;

    const p = Math.min(1, t.current / DUR);
    const fade = 1 - p;
    // ease-out expansion
    const s = 0.18 + (1 - fade * fade) * 0.55;
    g.scale.setScalar(s);
    if (coreRef.current) coreRef.current.opacity = fade;
    if (puffRef.current) puffRef.current.opacity = fade * 0.7;
  });

  return (
    // muzzle tip, nudged a hair forward so the puff blooms out of the bore mouth
    <group ref={groupRef} position={[0, 0, MUZZLE_TIP_Z + 0.1]} visible={false}>
      {/* bright inner core */}
      <mesh>
        <icosahedronGeometry args={[0.45, 0]} />
        <meshBasicMaterial ref={coreRef} color="#fff3c0" transparent opacity={1} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      {/* outer puff */}
      <mesh scale={1.6}>
        <icosahedronGeometry args={[0.45, 0]} />
        <meshBasicMaterial ref={puffRef} color="#ff8a3c" transparent opacity={0.7} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
    </group>
  );
}

"use client";
import { useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { useInputStore } from "../../game/state/inputStore";
import { localBoat } from "../../game/state/localBoat";
import { computeAim, BARREL_LEN } from "../../game/sim/aim";

// The local player's cannon, mounted on the boat's stern and rotated to the aim
// direction. It rides the boat (position+heading from localBoat) so it stays
// attached through bobbing and hit-lurches; the trajectory line shares the exact
// same muzzle via computeAim().
export function LocalCannon() {
  const ref = useRef<THREE.Group>(null);

  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    if (!localBoat.present) {
      g.visible = false;
      return;
    }
    const ins = useInputStore.getState();
    const a = computeAim(ins.aimYaw, ins.aimPitch);
    g.visible = true;
    g.position.set(a.px, a.py, a.pz);
    g.quaternion.set(a.qx, a.qy, a.qz, a.qw);
  });

  return (
    <group ref={ref}>
      {/* barrel along local +Z (the aim direction) */}
      <mesh ref={barrelRef} position={[0, 0, BARREL_LEN / 2]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.13, 0.18, BARREL_LEN, 10]} />
        <meshStandardMaterial color="#2a2622" metalness={0.45} roughness={0.55} />
      </mesh>
      {/* muzzle band */}
      <mesh position={[0, 0, BARREL_LEN]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.19, 0.19, 0.14, 10]} />
        <meshStandardMaterial color="#15110d" metalness={0.5} roughness={0.5} />
      </mesh>
      {/* swivel base */}
      <mesh>
        <boxGeometry args={[0.4, 0.3, 0.4]} />
        <meshStandardMaterial color="#3a3026" flatShading />
      </mesh>
    </group>
  );
}

"use client";
// THROWAWAY preview route to eyeball the Boat model in isolation. Delete when done.
import { useMemo } from "react";
import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Grid, useGLTF } from "@react-three/drei";
import { Boat } from "../../components/game/Boat";
import { Cannon } from "../../components/game/Cannon";
import { BOAT_COLORS } from "../../lib/constants";

// Reference cannon (high-poly source) shown large + isolated to study its shape.
function CannonRef() {
  const { scene } = useGLTF("/models/cannon-ref.glb");
  const obj = useMemo(() => {
    const root = scene.clone(true);
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.material = new THREE.MeshStandardMaterial({ color: "#4a443a", metalness: 0.5, roughness: 0.55, flatShading: true });
      m.castShadow = true;
    });
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    root.position.sub(center);
    const w = new THREE.Group();
    w.add(root);
    w.scale.setScalar(4 / Math.max(size.x, size.y, size.z));
    return w;
  }, [scene]);
  return <primitive object={obj} position={[-3, 3, 6]} />;
}

export default function BoatPreview() {
  return (
    <div style={{ width: "100vw", height: "100vh", background: "#1b2733" }}>
      <Canvas camera={{ position: [9, 6, 13], fov: 45 }} shadows>
        <ambientLight intensity={0.6} />
        <directionalLight position={[6, 10, 4]} intensity={1.4} castShadow />
        <Grid args={[40, 40]} cellColor="#33414f" sectionColor="#46586b" infiniteGrid fadeDistance={40} />

        {/* comparison: high-poly reference (left) vs low-poly recreation (right) */}
        <CannonRef />
        <group position={[2, 2.5, 9]} rotation={[0, -Math.PI / 2, 0]} scale={6}>
          <Cannon />
        </group>

        {/* other boat (shows flag + stern cannon) */}
        <group position={[0, 0, 0]}>
          <Boat color={BOAT_COLORS[0]} name="RED" lives={3} showLabel />
        </group>
        {/* local boat (no flag/cannon, bow pointing +Z) */}
        <group position={[4.5, 0, 0]}>
          <Boat color={BOAT_COLORS[1]} name="BLUE" lives={2} showLabel={false} />
        </group>
        {/* sunk boat */}
        <group position={[-4.5, 0, 0]}>
          <Boat color={BOAT_COLORS[2]} name="GREEN" lives={0} sunk showLabel />
        </group>

        <OrbitControls makeDefault />
      </Canvas>
    </div>
  );
}

"use client";
import { useMemo } from "react";
import * as THREE from "three";
import { Html } from "@react-three/drei";

// Procedural stand-in paper boat. Built to be swapped for a sourced low-poly
// .glb later without touching game logic: keep the same local axes
// (forward +Z, up +Y, cannon at back -Z) and the wrapper transform stays valid.
function useHullGeometry() {
  return useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(0, 2.1); // bow (+length)
    shape.quadraticCurveTo(1.05, 0.2, 0, -2.0); // starboard curve to stern
    shape.quadraticCurveTo(-1.05, 0.2, 0, 2.1); // port curve back to bow
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: 0.7,
      bevelEnabled: true,
      bevelThickness: 0.12,
      bevelSize: 0.12,
      bevelSegments: 1,
      steps: 1,
    });
    geo.rotateX(-Math.PI / 2); // lay flat: length along Z, thickness along Y
    geo.translate(0, 0.35, 0);
    geo.computeVertexNormals();
    return geo;
  }, []);
}

export interface BoatVisualProps {
  color: string;
  name?: string;
  lives?: number;
  sunk?: boolean;
  showLabel?: boolean;
}

export function Boat({ color, name, lives = 3, sunk, showLabel }: BoatVisualProps) {
  const hull = useHullGeometry();
  return (
    <group>
      {/* hull */}
      <mesh geometry={hull} castShadow receiveShadow>
        <meshStandardMaterial
          color={sunk ? "#5a5650" : color}
          flatShading
          roughness={0.85}
          metalness={0}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* paper center fold (the origami ridge) */}
      <mesh position={[0, 0.95, 0]} rotation={[0, 0, 0]}>
        <coneGeometry args={[0.5, 1.4, 4, 1]} />
        <meshStandardMaterial color={sunk ? "#4d4943" : color} flatShading roughness={0.9} />
      </mesh>
      {/* mast + colored flag to read the player's color even when pixelated.
          Hidden for the local player (showLabel === false) so it never blocks
          the first-person cannon view. */}
      {showLabel && (
        <>
          <mesh position={[0, 1.9, 0]}>
            <cylinderGeometry args={[0.04, 0.04, 1.6, 4]} />
            <meshStandardMaterial color="#caa46a" />
          </mesh>
          <mesh position={[0.32, 2.4, 0]}>
            <planeGeometry args={[0.6, 0.4]} />
            <meshStandardMaterial color={color} side={THREE.DoubleSide} flatShading />
          </mesh>
        </>
      )}
      {/* static stern cannon for OTHER boats; the local player's is the aiming
          LocalCannon, so skip it here when this is the local boat. */}
      {showLabel && (
        <group position={[0, 0.95, -1.5]} rotation={[Math.PI / 2.6, 0, 0]}>
          <mesh>
            <cylinderGeometry args={[0.16, 0.2, 0.9, 6]} />
            <meshStandardMaterial color="#2a2622" metalness={0.4} roughness={0.6} />
          </mesh>
        </group>
      )}

      {showLabel && name && (
        <Html position={[0, 3.0, 0]} center distanceFactor={28} zIndexRange={[10, 0]} prepend>
          <div
            style={{
              fontFamily: "ui-monospace, monospace",
              fontSize: 14,
              whiteSpace: "nowrap",
              color: "#f3e2bf",
              textShadow: "1px 1px 0 #000",
              transform: "translateY(-50%)",
              pointerEvents: "none",
            }}
          >
            {name} <span style={{ color: "#e6433f" }}>{"♥".repeat(Math.max(0, lives))}</span>
          </div>
        </Html>
      )}
    </group>
  );
}

"use client";
import { useMemo } from "react";
import * as THREE from "three";
import { ARENA_RADIUS, WALL_HEIGHT } from "../../lib/constants";

const R = ARENA_RADIUS; // inner face aligned with foam/waterfall/ocean rim

export function Bucket({ mode = "walls" }: { mode?: "walls" | "edge" }) {
  if (mode === "edge") return <Plate />;

  const wallMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.DoubleSide,
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          varying vec2 vUv;
          float hash(float x) { return fract(sin(x * 127.1) * 43758.5453); }
          void main() {
            float plankCount = 24.0;
            float plankId    = floor(vUv.x * plankCount);
            float plankU     = fract(vUv.x * plankCount);

            // dark gap between planks
            float gap = step(0.055, plankU) * step(plankU, 0.945);

            // pick 1 of 3 wood tones per plank
            float h = hash(plankId);
            vec3 c0 = vec3(0.350, 0.210, 0.095); // medium oak
            vec3 c1 = vec3(0.240, 0.130, 0.050); // dark walnut
            vec3 c2 = vec3(0.420, 0.265, 0.120); // lighter pine
            vec3 wood = h < 0.33 ? c0 : (h < 0.66 ? c1 : c2);

            // subtle horizontal grain lines per plank
            float grain = sin(vUv.y * 75.0 + plankId * 4.1) * 0.025;
            wood = clamp(wood + grain, 0.0, 1.0);

            // shadow inside gap
            wood *= mix(0.12, 1.0, gap);

            gl_FragColor = vec4(wood, 1.0);
          }
        `,
      }),
    []
  );

  return (
    <group>
      <mesh position={[0, WALL_HEIGHT / 2 - 4, 0]} material={wallMat}>
        <cylinderGeometry args={[R, R, WALL_HEIGHT, 144, 1, true]} />
      </mesh>
      {/* metal hoops */}
      {[WALL_HEIGHT - 5, -2.5].map((y, i) => (
        <mesh key={i} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[R + 0.4, 0.35, 6, 48]} />
          <meshStandardMaterial color="#3a3a40" metalness={0.6} roughness={0.5} />
        </mesh>
      ))}
    </group>
  );
}

function Plate() {
  return null;
}

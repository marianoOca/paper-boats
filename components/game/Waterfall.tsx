"use client";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { ARENA_RADIUS, WALL_HEIGHT, WATER_LEVEL } from "../../lib/constants";
import { renderState } from "../../game/state/fx";

const FALL_H = WALL_HEIGHT + 14;
const TOP_R = ARENA_RADIUS; // flush with ocean clip radius
const FOAM_H = 1; // foam mound height
const FOAM_WIDTH = 8; // foam mound width
const FOAM_TIP_DEPTH = 1; // how far below sea level the inner tip dips

/** Animated curtain of water pouring off the plate rim — Edge mode only. */
export function Waterfall() {
  const fallGeo = useMemo(
    () => new THREE.CylinderGeometry(TOP_R, TOP_R + 2.5, FALL_H, 96, 1, true),
    []
  );

  // On the sea, inner edge fades in, outer edge = rim = waterfall
  const foamGeo = useMemo(() => {
    const g = new THREE.RingGeometry(ARENA_RADIUS - FOAM_WIDTH, ARENA_RADIUS + 20, 128, 12);
    g.rotateX(-Math.PI / 2);
    return g;
  }, []);

  const fallMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
        uniforms: { uTime: { value: 0 } },
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main(){
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform float uTime;
          varying vec2 vUv;
          float hash(float x){ return fract(sin(x * 91.17) * 43758.5453); }
          void main(){
            float lane = floor(vUv.x * 220.0);
            float speed = 0.7 + hash(lane) * 0.9;
            float v = fract(vUv.y * 3.0 + uTime * speed);
            float streak = smoothstep(0.0, 0.5, v) * (0.55 + 0.45 * hash(lane + 7.0));
            vec3 deep = vec3(0.10, 0.34, 0.50);
            vec3 foam = vec3(0.90, 0.96, 0.99);
            float topFade = smoothstep(1.0, 0.78, vUv.y);
            vec3 col = mix(deep, foam, topFade * 0.8 + streak * 0.3);
            float alpha = (0.45 + streak * 0.45) * smoothstep(0.0, 0.12, vUv.y);
            gl_FragColor = vec4(col, alpha);
          }
        `,
      }),
    []
  );

  const foamMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        uniforms: { uTime: { value: 0 } },
        vertexShader: /* glsl */ `
          uniform float uTime;
          varying vec2 vUv;
          varying vec3 vPos;
          varying float vHeight;

          float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float noise(vec2 p){
            vec2 i = floor(p); vec2 f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            return mix(mix(h2(i), h2(i+vec2(1,0)), f.x), mix(h2(i+vec2(0,1)), h2(i+vec2(1,1)), f.x), f.y);
          }

          void main(){
            vUv = uv;
            // World-space radius — independent of ring UV mapping
            float worldR = length(position.xz);
            // Gradual rise from inner sea, sharp cliff at rim (waterfall line)
            // C (2/3): inclined from inner edge up; B (1/3): flat top to waterfall rim
            float profile = smoothstep(${(ARENA_RADIUS - FOAM_WIDTH).toFixed(1)}, ${(ARENA_RADIUS - FOAM_WIDTH / 3).toFixed(1)}, worldR)
                          * step(worldR, ${ARENA_RADIUS.toFixed(1)});
            float n1 = noise(position.xz * 0.65 + vec2(uTime * 0.55, uTime * 0.40));
            float n2 = noise(position.xz * 2.1  + vec2(-uTime * 0.95, uTime * 0.80));
            float n3 = noise(position.xz * 5.3  + vec2(uTime * 1.65, -uTime * 1.20));
            float bump = n1 * 1.5 + n2 * 0.75 + n3 * 0.28; // 0..2.53
            // Strong per-vertex variance → triangles tilt into distinct 3D facets
            float foamH = profile * (${FOAM_H.toFixed(2)} + (bump - 1.265) * ${(FOAM_H * 0.9).toFixed(2)});
            vHeight = foamH;
            float innerStart = ${(ARENA_RADIUS - FOAM_WIDTH).toFixed(1)};
            float tipMask = 1.0 - smoothstep(innerStart, innerStart + 1.0, worldR);
            float tipDip = tipMask * ${FOAM_TIP_DEPTH.toFixed(2)};
            vPos = vec3(position.x, position.y + foamH - tipDip, position.z);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(vPos, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform float uTime;
          varying vec2 vUv;
          varying vec3 vPos;
          varying float vHeight;

          float hash(float x){ return fract(sin(x * 91.17) * 43758.5); }
          float hash2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

          float voronoi(vec2 p, float spd) {
            vec2 cell = floor(p);
            vec2 f = fract(p);
            float v = 8.0;
            for(int i=-1; i<=1; i++) for(int j=-1; j<=1; j++){
              vec2 n = vec2(float(i), float(j));
              float h = hash2(cell + n);
              vec2 r = n - f + vec2(
                0.5 + 0.45 * sin(uTime * spd + h * 6.28),
                0.5 + 0.45 * cos(uTime * spd * 0.8 + (h + 0.37) * 6.28)
              );
              v = min(v, length(r));
            }
            return smoothstep(0.52, 0.04, v);
          }

          void main(){
            float radial  = vUv.x;
            float angular = vUv.y;

            // World-space profile — same shape as vertex shader (smooth)
            float worldR  = length(vPos.xz);
            float profile = smoothstep(${(ARENA_RADIUS - FOAM_WIDTH).toFixed(1)}, ${(ARENA_RADIUS - FOAM_WIDTH / 3).toFixed(1)}, worldR)
                          * step(worldR, ${ARENA_RADIUS.toFixed(1)});
            float edgeBias   = clamp((worldR - ${(ARENA_RADIUS - FOAM_WIDTH).toFixed(1)}) / ${FOAM_WIDTH.toFixed(1)}, 0.0, 1.0);
            float heightGlow = clamp(vHeight / ${FOAM_H.toFixed(2)}, 0.0, 1.0);

            float c1 = voronoi(vec2(angular * 14.0, radial * 5.0 + uTime * 1.1), 1.8);
            float c2 = voronoi(vec2(angular * 40.0 + uTime * 0.12, radial * 13.0 + uTime * 2.9), 3.6);

            float lane    = floor(angular * 54.0);
            float laneU   = fract(angular * 54.0);
            float laneW   = 0.28 + hash(lane) * 0.22;
            float laneSpd = 1.6 + hash(lane * 3.7) * 2.2;
            float streakV = fract(radial * 2.6 - uTime * laneSpd);
            float streak  = smoothstep(laneW, 0.0, abs(laneU - 0.5))
                          * (1.0 - streakV * 0.65)
                          * smoothstep(0.08, 0.5, radial);

            float burst = 0.0;
            for(int k = 0; k < 7; k++){
              float fi     = float(k);
              float bSpd   = 0.45 + hash(fi * 5.3) * 0.75;
              float bPhase = fract(uTime * bSpd + hash(fi * 2.7));
              float bCtr   = hash(fi * 3.1 + floor(uTime * bSpd + hash(fi * 2.7)));
              float angD   = abs(fract(angular - bCtr + 0.5) - 0.5) * 2.0;
              float b      = smoothstep(0.16, 0.0, angD) * smoothstep(0.2, 0.68, radial);
              b *= smoothstep(0.0, 0.18, bPhase) * smoothstep(1.0, 0.38, bPhase);
              burst += b;
            }
            burst = clamp(burst * 1.9, 0.0, 1.0);

            float foam  = c1 * 0.65 + c2 * 1.15 + streak * 0.95 + burst * 1.5;
            foam = clamp(foam * edgeBias + heightGlow * 0.55, 0.0, 1.0);

            float alpha = clamp((foam + heightGlow * 0.4 + 0.35) * profile * 0.90, 0.0, 1.0);

            vec3 base = mix(vec3(0.07, 0.40, 0.70), vec3(0.93, 0.98, 1.0),
                            clamp(c1 * 0.5 + c2 * 0.85 + streak * 0.6 + heightGlow * 0.8, 0.0, 1.0));
            vec3 col  = mix(base, vec3(1.0), burst * 0.85 + heightGlow * 0.4);

            // --- 3D faceted shading: flat per-triangle normal via screen derivatives ---
            // dFdx/dFdy of world pos are constant across a triangle → one normal
            // per facet → crisp low-poly foam peaks that catch the light.
            vec3 nrm  = normalize(cross(dFdx(vPos), dFdy(vPos)));
            vec3 L    = normalize(vec3(0.35, 0.85, 0.40));
            float diff = clamp(dot(nrm, L), 0.0, 1.0);
            // Specular glint on up-facing facets — wet foam highlight.
            vec3  V    = vec3(0.0, 1.0, 0.0);
            vec3  H    = normalize(L + V);
            float spec = pow(clamp(dot(nrm, H), 0.0, 1.0), 24.0);
            float shade = 0.55 + 0.55 * diff;
            col = col * shade + vec3(1.0) * spec * 0.6;

            gl_FragColor = vec4(col, alpha);
          }
        `,
      }),
    []
  );

  const fallRef = useRef<THREE.ShaderMaterial>(fallMat);
  const foamRef = useRef<THREE.ShaderMaterial>(foamMat);

  useFrame(() => {
    fallRef.current.uniforms.uTime.value = renderState.simTime;
    foamRef.current.uniforms.uTime.value = renderState.simTime;
  });

  return (
    <group>
      <mesh
        geometry={fallGeo}
        material={fallMat}
        position={[0, WATER_LEVEL - FALL_H / 2, 0]}
      />
      <mesh
        geometry={foamGeo}
        material={foamMat}
        position={[0, WATER_LEVEL, 0]}
      />
    </group>
  );
}

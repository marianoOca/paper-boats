"use client";
import { useMemo } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { waveGLSL } from "../../lib/waves";
import { ARENA_RADIUS } from "../../lib/constants";
import { renderState } from "../../game/state/fx";

const SIZE = ARENA_RADIUS * 2 + 60;
const SEG = 80; // coarse enough that triangles read as low-poly facets

export function Ocean({ mode = "walls" }: { mode?: "walls" | "edge" }) {
  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
    g.rotateX(-Math.PI / 2); // lie flat in XZ, +Y up
    return g;
  }, []);

  const material = useMemo(() => {
    const wave = waveGLSL();
    return new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uClipR: { value: mode === "edge" ? ARENA_RADIUS : 0 } },
      vertexShader: /* glsl */ `
        uniform float uTime;
        varying vec3 vPos;
        varying float vH;
        varying vec2 vXZ;
        ${wave}
        void main(){
          vec3 p = position;
          vXZ = p.xz;
          float h = waveHeight(p.xz, uTime);
          p.y += h;
          vPos = p;
          vH = h;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uClipR;
        varying vec3 vPos;
        varying float vH;
        varying vec2 vXZ;
        void main(){
          if (uClipR > 0.0 && length(vXZ) > uClipR) discard;
          // Flat per-triangle normal — constant across each facet → low-poly sea.
          vec3 nrm = normalize(cross(dFdx(vPos), dFdy(vPos)));
          if (nrm.y < 0.0) nrm = -nrm;
          vec3 L = normalize(vec3(0.4, 0.9, 0.3));
          float d = max(dot(nrm, L), 0.0);
          vec3 deep = vec3(0.08, 0.30, 0.44);
          vec3 shallow = vec3(0.20, 0.56, 0.62);
          vec3 col = mix(deep, shallow, clamp(vH * 0.5 + 0.5, 0.0, 1.0));
          col *= 0.5 + 0.65 * d;
          float foam = smoothstep(0.55, 0.95, vH);
          col = mix(col, vec3(0.92, 0.96, 0.98), foam * 0.55);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
  }, [mode]);

  useFrame(() => {
    material.uniforms.uTime.value = renderState.simTime;
  });

  return <mesh geometry={geometry} material={material} />;
}

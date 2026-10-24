"use client";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { waveGLSL } from "../../lib/waves";
import { ARENA_RADIUS, BOAT, MAX_PLAYERS } from "../../lib/constants";
import { renderState } from "../../game/state/fx";
import { boatPoses } from "../../game/state/boatPoses";
import { useLobbyStore } from "../../game/state/lobbyStore";
import { OCEAN_SEG, OCEAN_SIZE } from "./Ocean";

// Foam that follows every boat, built like the rim foam (Waterfall.tsx): coarse
// geometry pushed up by animated noise into faceted mounds, shaded per facet,
// whiter the higher it stands. A collar rises around each hull (a bow wave at
// speed) and the wake leaves two ridges that shrink and sink back into the sea.

// Hull bottom outline (just above the keel), measured from paper-boat.glb as
// Boat.tsx normalizes it. The hull flares above it, up to a 0.94 x 2.5 diamond, and
// floats with the keel above the sea, so the collar hangs from this edge down to
// the water: foam touches the hull instead of leaving a ring of open sea.
const HULL_BOTTOM_HALF_W = 0.49;
const HULL_BOTTOM_HALF_L = 1.37;
const HULL_TIP_OVERHANG = 1.13; // silhouette tip (2.5) past the bottom tip
const KEEL_Y = -BOAT.half.y + 0.05; // bottom outline height in hull-mesh space
const STALE_MS = 250; // pose not written for this long = boat gone
const COLLAR_AROUND = 40; // coarse on purpose: big triangles = visible facets
const COLLAR_ACROSS = 4;
const WAKE_N = 16; // wake points kept per boat
const WAKE_ACROSS = 6;
const WAKE_EVERY = 0.1; // s between wake points (spacing = facet length)
const WAKE_LIFE = 1.5; // s a wake point lives
const MIN_SPEED = 0.8; // world units/s below which a boat lays no wake

const f = (n: number) => n.toFixed(4);
const CELL = OCEAN_SIZE / OCEAN_SEG;

const VERT_COMMON = /* glsl */ `
  uniform float uTime;
  ${waveGLSL()}

  // The Ocean mesh is a grid of flat triangles: interpolate waveHeight across the
  // same triangle so foam sits on the sea the player sees, not the exact wave.
  float seaSurface(vec2 p){
    vec2 g = (p + ${f(OCEAN_SIZE / 2)}) / ${f(CELL)};
    vec2 i = floor(g);
    vec2 t = g - i;
    vec2 o = i * ${f(CELL)} - ${f(OCEAN_SIZE / 2)};
    float hb = waveHeight(o + vec2(0.0, ${f(CELL)}), uTime);
    float hd = waveHeight(o + vec2(${f(CELL)}, 0.0), uTime);
    if (t.x + t.y <= 1.0) {
      float ha = waveHeight(o, uTime);
      return ha + t.x * (hd - ha) + t.y * (hb - ha);
    }
    float hc = waveHeight(o + vec2(${f(CELL)}), uTime);
    return hc + (1.0 - t.x) * (hb - hc) + (1.0 - t.y) * (hd - hc);
  }

  // Same value noise + octave mix as the rim foam: strong per-vertex variance
  // tilts triangles into distinct facets. Returns -1..1.
  float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p){
    vec2 i = floor(p); vec2 q = fract(p);
    q = q * q * (3.0 - 2.0 * q);
    return mix(mix(h2(i), h2(i + vec2(1, 0)), q.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), q.x), q.y);
  }
  float bump(vec2 p){
    float n1 = noise(p * 1.3 + vec2(uTime * 0.55, uTime * 0.40));
    float n2 = noise(p * 3.4 + vec2(-uTime * 0.95, uTime * 0.80));
    float n3 = noise(p * 8.0 + vec2(uTime * 1.65, -uTime * 1.20));
    return (n1 * 1.5 + n2 * 0.75 + n3 * 0.28 - 1.265) / 1.265;
  }

  varying vec3 vPos;
  varying float vGlow;  // 0..1, height relative to the mound's full height
  varying float vEdge;  // 0..1, fades the mound's thin outer rim
`;

const FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uClipR;
  uniform vec4 uHulls[${MAX_PLAYERS}]; // x, z, forward.x, forward.z
  uniform int uHullCount;
  varying vec3 vPos;
  varying float vGlow;
  varying float vEdge;

  float hash2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float voronoi(vec2 p, float spd){
    vec2 cell = floor(p), q = fract(p);
    float v = 8.0;
    for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++) {
      vec2 n = vec2(float(i), float(j));
      float h = hash2(cell + n);
      vec2 r = n - q + vec2(0.5 + 0.45 * sin(uTime * spd + h * 6.28), 0.5 + 0.45 * cos(uTime * spd * 0.8 + (h + 0.37) * 6.28));
      v = min(v, length(r));
    }
    return smoothstep(0.52, 0.04, v);
  }

  void main(){
    vec2 p = vPos.xz;
    if (uClipR > 0.0 && length(p) > uClipR) discard;
    for (int i = 0; i < ${MAX_PLAYERS}; i++) {
      if (i >= uHullCount) break;
      vec2 d = p - uHulls[i].xy;
      vec2 fw = uHulls[i].zw;
      if (abs(dot(d, vec2(fw.y, -fw.x))) / ${f(HULL_BOTTOM_HALF_W)} + abs(dot(d, fw)) / ${f(HULL_BOTTOM_HALF_L)} < 1.0) discard;
    }

    // rim foam colouring: blue water -> white froth, whiter on the peaks
    float c1 = voronoi(p * 0.8 + vec2(0.0, uTime * 0.4), 1.8);
    float c2 = voronoi(p * 2.2 + vec2(uTime * 0.12, uTime * 0.9), 3.6);
    float foam = clamp(c1 * 0.65 + c2 * 1.15 + vGlow * 0.35, 0.0, 1.0);
    vec3 base = mix(vec3(0.07, 0.40, 0.70), vec3(0.93, 0.98, 1.0), clamp(c1 * 0.5 + c2 * 0.85 + vGlow * 0.5, 0.0, 1.0));
    vec3 col = mix(base, vec3(1.0), vGlow * 0.4);

    // flat per-facet normal -> crisp low-poly peaks, plus a wet glint
    vec3 nrm = normalize(cross(dFdx(vPos), dFdy(vPos)));
    vec3 L = normalize(vec3(0.35, 0.85, 0.40));
    float diff = clamp(dot(nrm, L), 0.0, 1.0);
    float spec = pow(clamp(dot(nrm, normalize(L + vec3(0.0, 1.0, 0.0))), 0.0, 1.0), 24.0);
    col = col * (0.55 + 0.55 * diff) + vec3(1.0) * spec * 0.6;

    // breaks into chunks of froth with sea showing between them
    float alpha = smoothstep(0.3, 0.75, foam * 0.8 + vGlow * 0.3 + vEdge * 0.25) * vEdge * 0.9;
    if (alpha < 0.02) discard;
    gl_FragColor = vec4(col, alpha);
  }
`;

// Collar: a ring around the hull. aRing.x = position around (0..1), aRing.y =
// across (0 on the hull's bottom edge, 1 out on the sea). Shape is computed here
// so it follows the hull's tilt and height and the bow wave grows with speed.
const COLLAR_VERT = /* glsl */ `
  ${VERT_COMMON}
  attribute vec2 aRing;
  uniform vec3 uPos;    // physics body position
  uniform vec4 uQuat;   // body rotation
  uniform float uLift;  // hull mesh height above the body
  uniform float uSpeed; // 0..1 of max speed
  uniform float uDir;   // +1 sailing forward, -1 reversing
  uniform float uAlive; // 0 once sunk

  vec2 diamond(float s, float w, float l){
    float q = fract(s) * 4.0;
    float k = fract(q);
    float side = floor(q);
    vec2 a = side < 1.0 ? vec2(0.0, l) : side < 2.0 ? vec2(w, 0.0) : side < 3.0 ? vec2(0.0, -l) : vec2(-w, 0.0);
    vec2 b = side < 1.0 ? vec2(w, 0.0) : side < 2.0 ? vec2(0.0, -l) : side < 3.0 ? vec2(-w, 0.0) : vec2(0.0, l);
    return mix(a, b, k);
  }

  vec3 rot(vec4 q, vec3 v){ return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v); }

  void main(){
    float r = aRing.y;
    vec2 inner = diamond(aRing.x, ${f(HULL_BOTTOM_HALF_W)}, ${f(HULL_BOTTOM_HALF_L)});
    float tip = abs(inner.y) / ${f(HULL_BOTTOM_HALF_L)};                   // 1 at bow/stern points
    float ahead = clamp(inner.y * uDir / ${f(HULL_BOTTOM_HALF_L)}, 0.0, 1.0); // 1 at the leading tip

    // r = 0: on the hull's bottom edge, moving and tilting with the boat
    vec3 hull = uPos + rot(uQuat, vec3(inner.x, ${f(KEEL_Y)} + uLift, inner.y));
    // r = 1: out on the sea, past the overhanging tips; the bow wave reaches further
    vec3 fw3 = rot(uQuat, vec3(0.0, 0.0, 1.0));
    vec2 fw = normalize(fw3.xz);
    vec2 n = normalize(inner / vec2(${f(HULL_BOTTOM_HALF_W ** 2)}, ${f(HULL_BOTTOM_HALF_L ** 2)}));
    vec2 outer = inner + n * (0.5 + ${f(HULL_TIP_OVERHANG)} * tip + uSpeed * (0.3 + 1.6 * ahead * ahead));
    vec2 outerW = uPos.xz + outer.x * vec2(fw.y, -fw.x) + outer.y * fw;

    vec2 w = mix(hull.xz, outerW, r);
    float sea = seaSurface(w);
    // a skirt from the hull edge down onto the sea (or the sea itself where the hull sits lower)
    float base = max(mix(hull.y, sea, smoothstep(0.0, 0.25, r)), sea);
    float profile = 1.0 - smoothstep(0.3, 0.9, r);
    float H = (0.08 + uSpeed * (0.14 + 0.35 * ahead)) * uAlive;
    float h = profile * H * (1.0 + 0.9 * bump(w));
    vGlow = clamp(h / max(H, 1e-3), 0.0, 1.0);
    vEdge = (1.0 - smoothstep(0.2 + 0.35 * uSpeed, 0.55 + 0.45 * uSpeed, r)) * uAlive; // thin when idle
    vPos = vec3(w.x, base + h - smoothstep(0.75, 1.0, r) * 0.12, w.y);
    gl_Position = projectionMatrix * viewMatrix * vec4(vPos, 1.0);
  }
`;

// Wake: ribbon of past trailing-tip positions. aFoam = across (-1..1), age (0..1),
// speed when laid (0..1). Two ridges (the V's arms) plus a churned middle near the
// boat; as it ages the mounds shrink and sink into the sea instead of fading.
const WAKE_VERT = /* glsl */ `
  ${VERT_COMMON}
  attribute vec3 aFoam;
  void main(){
    float u = abs(aFoam.x);
    float age = aFoam.y;
    float arms = smoothstep(0.55, 0.8, u) * (1.0 - smoothstep(0.85, 1.0, u));
    float churn = 0.8 * (1.0 - u) * (1.0 - smoothstep(0.0, 0.25, age));
    float profile = max(arms, churn);
    float H = aFoam.z * 0.28 * pow(1.0 - age, 1.3);
    vec2 w = position.xz;
    float h = profile * H * (1.0 + 0.9 * bump(w));
    vGlow = clamp(h / max(aFoam.z * 0.28, 1e-3), 0.0, 1.0);
    vEdge = smoothstep(0.0, 0.3, profile) * (1.0 - smoothstep(0.75, 1.0, age));
    vPos = vec3(w.x, seaSurface(w) + h - (1.0 - profile) * 0.12 - age * 0.25, w.y);
    gl_Position = projectionMatrix * viewMatrix * vec4(vPos, 1.0);
  }
`;

interface WakePoint {
  x: number;
  z: number;
  rx: number; // right of travel, unit
  rz: number;
  sp: number; // speed 0..1 when laid
  born: number; // s
}

interface BoatFoamState {
  collar: THREE.Mesh;
  u: {
    uPos: { value: THREE.Vector3 };
    uQuat: { value: THREE.Vector4 };
    uLift: { value: number };
    uSpeed: { value: number };
    uDir: { value: number };
    uAlive: { value: number };
  };
  wake: THREE.Mesh;
  wakePos: Float32Array;
  wakeFoam: Float32Array;
  points: WakePoint[];
  px: number;
  pz: number;
  speed: number; // smoothed, world units/s
  dir: number;
  sampleT: number;
}

function collarGeometry() {
  const ring: number[] = [];
  const index: number[] = [];
  const cols = COLLAR_ACROSS + 1;
  for (let a = 0; a <= COLLAR_AROUND; a++) for (let c = 0; c < cols; c++) ring.push(a / COLLAR_AROUND, c / COLLAR_ACROSS);
  for (let a = 0; a < COLLAR_AROUND; a++)
    for (let c = 0; c < COLLAR_ACROSS; c++) {
      const i = a * cols + c;
      index.push(i, i + cols, i + 1, i + 1, i + cols, i + cols + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("aRing", new THREE.Float32BufferAttribute(ring, 2));
  g.setAttribute("position", new THREE.Float32BufferAttribute(new Array(ring.length * 1.5).fill(0), 3)); // placed in the shader
  g.setIndex(index);
  return g;
}

function wakeIndex() {
  const index: number[] = [];
  const cols = WAKE_ACROSS + 1;
  for (let i = 0; i < WAKE_N; i++)
    for (let c = 0; c < WAKE_ACROSS; c++) {
      const v = i * cols + c;
      index.push(v, v + cols, v + 1, v + 1, v + cols, v + cols + 1);
    }
  return index;
}

export function BoatFoam() {
  const arenaMode = useLobbyStore((s) => s.settings.arenaMode);
  const group = useRef<THREE.Group>(null);
  const boats = useRef(new Map<string, BoatFoamState>());

  const shared = useMemo(
    () => ({
      uTime: { value: 0 },
      uClipR: { value: 0 },
      uHulls: { value: Array.from({ length: MAX_PLAYERS }, () => new THREE.Vector4()) },
      uHullCount: { value: 0 },
    }),
    []
  );
  shared.uClipR.value = arenaMode === "edge" ? ARENA_RADIUS : 0;

  const res = useMemo(() => {
    const matOpts = { fragmentShader: FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide };
    return {
      collarGeo: collarGeometry(),
      wakeIndex: wakeIndex(),
      wakeMat: new THREE.ShaderMaterial({ ...matOpts, uniforms: shared, vertexShader: WAKE_VERT }),
      matOpts,
    };
  }, [shared]);

  useEffect(
    () => () => {
      for (const b of boats.current.values()) {
        (b.collar.material as THREE.Material).dispose();
        b.wake.geometry.dispose();
      }
      res.collarGeo.dispose();
      res.wakeMat.dispose();
    },
    [res]
  );

  function create(id: string, p: { x: number; z: number }): BoatFoamState {
    const u = {
      uPos: { value: new THREE.Vector3() },
      uQuat: { value: new THREE.Vector4() },
      uLift: { value: 0 },
      uSpeed: { value: 0 },
      uDir: { value: 1 },
      uAlive: { value: 1 },
    };
    const collar = new THREE.Mesh(res.collarGeo, new THREE.ShaderMaterial({ ...res.matOpts, uniforms: { ...shared, ...u }, vertexShader: COLLAR_VERT }));
    const verts = (WAKE_N + 1) * (WAKE_ACROSS + 1);
    const wakePos = new Float32Array(verts * 3);
    const wakeFoam = new Float32Array(verts * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(wakePos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute("aFoam", new THREE.BufferAttribute(wakeFoam, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setIndex(res.wakeIndex);
    const wake = new THREE.Mesh(geo, res.wakeMat);
    collar.frustumCulled = wake.frustumCulled = false; // vertices are placed in the shader
    collar.renderOrder = wake.renderOrder = 1;
    group.current!.add(collar, wake);
    const st: BoatFoamState = { collar, u, wake, wakePos, wakeFoam, points: [], px: p.x, pz: p.z, speed: 0, dir: 1, sampleT: 0 };
    boats.current.set(id, st);
    return st;
  }

  function remove(id: string, b: BoatFoamState) {
    group.current?.remove(b.collar, b.wake);
    (b.collar.material as THREE.Material).dispose();
    b.wake.geometry.dispose();
    boats.current.delete(id);
  }

  useFrame((_, dtRaw) => {
    if (!group.current) return;
    const dt = Math.min(dtRaw, 0.05);
    const now = performance.now();
    const t = now / 1000;
    shared.uTime.value = renderState.simTime;

    // hull masks: every boat afloat
    let n = 0;
    for (const p of boatPoses.values()) {
      if (n >= MAX_PLAYERS || !p.alive || now - p.at > STALE_MS) continue;
      shared.uHulls.value[n++].set(p.x, p.z, p.fx, p.fz);
    }
    shared.uHullCount.value = n;

    for (const [id, p] of boatPoses) {
      let b = boats.current.get(id);
      if (now - p.at > STALE_MS) {
        if (b) remove(id, b);
        continue;
      }
      if (!b) b = create(id, p);

      // speed + travel direction from the rendered motion
      if (Math.hypot(p.x - b.px, p.z - b.pz) > 3) b.points.length = 0; // respawn teleport: no wake across the map
      const vx = (p.x - b.px) / Math.max(dt, 1e-3);
      const vz = (p.z - b.pz) / Math.max(dt, 1e-3);
      b.px = p.x;
      b.pz = p.z;
      const v = Math.min(Math.hypot(vx, vz), BOAT.maxSpeed * 1.5);
      b.speed += (v - b.speed) * Math.min(1, dt * 6);
      if (v > 0.3) b.dir = vx * p.fx + vz * p.fz >= 0 ? 1 : -1;
      const sp = Math.min(1, b.speed / BOAT.maxSpeed);

      b.u.uPos.value.set(p.x, p.y, p.z);
      b.u.uQuat.value.set(p.qx, p.qy, p.qz, p.qw);
      b.u.uLift.value = p.lift;
      b.u.uSpeed.value = sp;
      b.u.uDir.value = b.dir;
      b.u.uAlive.value += ((p.alive ? 1 : 0) - b.u.uAlive.value) * Math.min(1, dt * 3);

      // wake: a point at the trailing tip every WAKE_EVERY while moving
      const tipX = p.x - p.fx * HULL_BOTTOM_HALF_L * b.dir;
      const tipZ = p.z - p.fz * HULL_BOTTOM_HALF_L * b.dir;
      const rx = p.fz * b.dir; // right of travel
      const rz = -p.fx * b.dir;
      b.sampleT += dt;
      if (b.sampleT >= WAKE_EVERY) {
        b.sampleT = 0;
        if (p.alive && b.speed > MIN_SPEED) {
          b.points.push({ x: tipX, z: tipZ, rx, rz, sp, born: t });
          if (b.points.length > WAKE_N) b.points.shift();
        }
      }
      while (b.points.length && t - b.points[0].born > WAKE_LIFE) b.points.shift();

      // ribbon rows: oldest -> newest, then a live row glued to the tip
      const live = p.alive && b.speed > MIN_SPEED && b.points.length > 0;
      const rows = b.points.length + (live ? 1 : 0);
      const cols = WAKE_ACROSS + 1;
      for (let i = 0; i < rows; i++) {
        const q = i < b.points.length ? b.points[i] : { x: tipX, z: tipZ, rx, rz, sp, born: t };
        const age = Math.min(1, (t - q.born) / WAKE_LIFE);
        const hw = 0.35 + age * WAKE_LIFE * (0.5 + 1.0 * q.sp); // the V spreads with age, wider when fast
        for (let c = 0; c < cols; c++) {
          const across = (c / WAKE_ACROSS) * 2 - 1;
          const o = (i * cols + c) * 3;
          b.wakePos[o] = q.x + q.rx * hw * across;
          b.wakePos[o + 2] = q.z + q.rz * hw * across;
          b.wakeFoam[o] = across;
          b.wakeFoam[o + 1] = age;
          b.wakeFoam[o + 2] = q.sp;
        }
      }
      const geo = b.wake.geometry;
      geo.attributes.position.needsUpdate = true;
      geo.attributes.aFoam.needsUpdate = true;
      geo.setDrawRange(0, Math.max(0, rows - 1) * WAKE_ACROSS * 6);
    }
  });

  return <group ref={group} />;
}

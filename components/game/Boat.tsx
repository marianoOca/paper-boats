"use client";
import { type Ref, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { Html, useGLTF } from "@react-three/drei";
import { CannonRig } from "./Cannon";
import { MuzzleFlash } from "./MuzzleFlash";
import { PixelSkull } from "../ui/PixelIcons";
import { useInputStore } from "../../game/state/inputStore";
import { BOAT, DISCONNECT_GRACE_MS, START_LIVES } from "../../lib/constants";

const DISCONNECT_MSG = "having connection issues, please don't shoot me >.<";

const BUBBLE_COUNT = 12;
const BUBBLE_OFFSETS = Array.from({ length: BUBBLE_COUNT }, (_, i) => ({
  x: Math.sin(i * 2.4) * 0.85,
  z: Math.cos(i * 2.4) * 0.85,
  speed: 0.8 + (i % 4) * 0.25,
  delay: (i / BUBBLE_COUNT) * 1.2,
}));

function BubbleEffect({ active }: { active: boolean }) {
  const pointsRef = useRef<THREE.Points>(null);
  const matRef = useRef<THREE.PointsMaterial>(null);
  const startRef = useRef<number | null>(null);
  const prevActive = useRef(false);

  const geo = useMemo(() => {
    const positions = new Float32Array(BUBBLE_COUNT * 3);
    BUBBLE_OFFSETS.forEach((b, i) => {
      positions[i * 3] = b.x;
      positions[i * 3 + 1] = 0;
      positions[i * 3 + 2] = b.z;
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    return g;
  }, []);

  useFrame(() => {
    const pts = pointsRef.current;
    const mat = matRef.current;
    if (!pts || !mat) return;
    if (!prevActive.current && active) startRef.current = performance.now();
    prevActive.current = active;
    if (!active || startRef.current === null) { pts.visible = false; return; }
    const t = (performance.now() - startRef.current) / 1000;
    if (t > 4.5) { pts.visible = false; return; }
    pts.visible = true;
    const pos = geo.getAttribute("position") as THREE.BufferAttribute;
    BUBBLE_OFFSETS.forEach((b, i) => {
      const bt = Math.max(0, t - b.delay);
      pos.setX(i, b.x + Math.sin(bt * 2.5 + i * 1.7) * 0.14);
      pos.setY(i, bt * b.speed * 2.2);
      pos.setZ(i, b.z + Math.cos(bt * 2.0 + i * 1.3) * 0.1);
    });
    pos.needsUpdate = true;
    mat.opacity = Math.max(0, 1 - t / 3.5);
  });

  return (
    <points ref={pointsRef} geometry={geo} visible={false}>
      <pointsMaterial ref={matRef} size={0.14} color="#b8ddf0" transparent opacity={0} sizeAttenuation depthWrite={false} />
    </points>
  );
}

// Sourced low-poly origami boat (.glb). Local axes match game convention:
//   forward = +Z (bow), back/cannon = -Z (stern), up = +Y.
// The asset ships with a baked node scale and arbitrary orientation, so instead
// of hardcoding numbers we AUTO-FIT at load: measure the real world bbox, scale
// the longest horizontal axis to the collider length, and rotate that axis onto
// +Z. Texture is stripped — only the silhouette matters — and the body is tinted
// to the player color (grey when sunk).
const MODEL_URL = "/models/paper-boat.glb";
const TARGET_LEN = 5.0; // collider length = 2 * half.z

export interface BoatVisualProps {
  color: string;
  name?: string;
  lives?: number;
  maxLives?: number;
  sunk?: boolean;
  connected?: boolean;
  showLabel?: boolean;
  isLocal?: boolean;
  taunt?: string;
  cannonYawRef?: Ref<THREE.Group>;
}

// Max world-units the hull lowers as lives are lost (fully sunk = this offset).
const SINK_MAX = 0.9;

// Bake the glb into one editable geometry, tint it, normalize it (center, scale
// longest horizontal axis -> TARGET_LEN, length onto +Z), then clip ONLY the stern
// hull above the table plane so the folded gun deck shows. New instance per color.
function useBoatScene(color: string, sunk?: boolean) {
  const { scene } = useGLTF(MODEL_URL);
  return useMemo(() => {
    const src = scene.clone(true);
    src.updateMatrixWorld(true);

    // bake every mesh into one position array (in the gltf's world space)
    const parts: number[] = [];
    src.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      g.applyMatrix4(m.matrixWorld);
      const p = g.getAttribute("position");
      for (let i = 0; i < p.array.length; i++) parts.push(p.array[i] as number);
    });

    const baked = new THREE.BufferGeometry();
    baked.setAttribute("position", new THREE.Float32BufferAttribute(parts, 3));

    // normalize into boat-local space
    baked.computeBoundingBox();
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    baked.boundingBox!.getSize(size);
    baked.boundingBox!.getCenter(center);
    const sc = TARGET_LEN / (Math.max(size.x, size.z) || 1);
    const mtx = new THREE.Matrix4().makeTranslation(-center.x, -center.y, -center.z);
    if (size.x > size.z) mtx.premultiply(new THREE.Matrix4().makeRotationY(Math.PI / 2));
    mtx.premultiply(new THREE.Matrix4().makeScale(sc, sc, sc));
    baked.applyMatrix4(mtx);

    // Bbox-centering puts the geometric midpoint at y=0, but the tall pyramid skews
    // it far above the keel, so in the game (body.y≈0 at buoyancy equilibrium) the
    // keel would be way below the water surface. Shift the mesh up so the keel lands
    // at y = -BOAT.half.y (matching the physics cuboid bottom). yFix is returned so
    // the fold group can be translated by the same amount.
    const keel = -(size.y * sc) / 2; // keel y after bbox-centering (always negative)
    const yFix = -BOAT.half.y - keel; // how far to shift the mesh up

    // Clip ONLY the back of the hull above the table plane: drop triangles whose
    // centroid is behind the fold cut (z < zCut) AND above the plane (y > yPlane).
    // The rest of the boat is untouched. Plane + cut come from the stern group
    // offset ([0, 0.02, -0.9]) plus the FOLD values, so it tracks cutY.
    const yPlane = 0.02 + FOLD.cutY;
    const zCut = -0.9 + FOLD.cutZ;
    const pos = baked.getAttribute("position");
    let maxY = -Infinity;
    for (let v = 0; v < pos.count; v++) maxY = Math.max(maxY, pos.getY(v));
    // crossing point where edge A->B meets the plane y=yPlane
    const lerpY = (A: number[], B: number[]) => {
      const f = (yPlane - A[1]) / (B[1] - A[1]);
      return [A[0] + f * (B[0] - A[0]), yPlane, A[2] + f * (B[2] - A[2])];
    };
    // Clip each BACK triangle (centroid z < zCut) against the plane, keeping ONLY
    // the part below it (removes the stern hull above cutY). Front triangles are
    // kept whole — the rest of the boat is untouched. The hull is coarse, so we must
    // split spanning triangles, not drop them by centroid.
    const kept: number[] = [];
    for (let i = 0; i < pos.count; i += 3) {
      const tri = [
        [pos.getX(i), pos.getY(i), pos.getZ(i)],
        [pos.getX(i + 1), pos.getY(i + 1), pos.getZ(i + 1)],
        [pos.getX(i + 2), pos.getY(i + 2), pos.getZ(i + 2)],
      ];
      const cz = (tri[0][2] + tri[1][2] + tri[2][2]) / 3;
      // spare the central tower: any triangle touching the boat's top apex (max y)
      const isTower = Math.max(tri[0][1], tri[1][1], tri[2][1]) >= maxY - 1e-3;
      let out: number[][][];
      if (cz >= zCut || isTower) {
        out = [tri]; // front of the boat, or the central tower — untouched
      } else {
        const below = tri.filter((v) => v[1] <= yPlane);
        const above = tri.filter((v) => v[1] > yPlane);
        if (above.length === 0) out = [tri]; // fully below — keep
        else if (above.length === 3) out = []; // fully above — drop
        else if (below.length === 2) {
          const [b0, b1] = below, a0 = above[0];
          const p0 = lerpY(b1, a0), p1 = lerpY(b0, a0);
          out = [[b0, b1, p0], [b0, p0, p1]]; // quad below -> 2 tris
        } else {
          const b0 = below[0], [a0, a1] = above;
          out = [[b0, lerpY(b0, a0), lerpY(b0, a1)]]; // 1 tri below
        }
      }
      for (const t2 of out) for (const v of t2) kept.push(v[0], v[1], v[2]);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(kept, 3));
    geo.computeVertexNormals();
    // Apply the keel-alignment shift; translation doesn't change normals.
    geo.applyMatrix4(new THREE.Matrix4().makeTranslation(0, yFix, 0));

    const mat = new THREE.MeshStandardMaterial({
      color: sunk ? "#5a5650" : color,
      flatShading: true,
      metalness: 0,
      roughness: 0.85,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return { mesh, yFix };
  }, [scene, color, sunk]);
}

// Folded-paper gun platform for the stern: the deck paper creased UP on the two
// long sides into a raised flat top (cannon sits on it). Two side flaps only,
// open fore/aft — matches "bend both sides". Built from flat quads with flat
// shading + DoubleSide so it reads as the same sheet of paper as the hull.

// Only cutY (the table-plane height, stern-group local) is a knob. The hull section
// dims are LINEAR in it (the hull faces are flat), fit from the glb section over
// cutY (-0.09 to 0.33) — change cutY and the beam/apex points track the hull.
const FOLD = (() => {
  const cutY = -0.05;
  return {
    cutY,
    cutX: 0.7332 - 2.1969 * cutY, // hull beam half-width on the plane
    cutZ: 0.3545 - 5.8567 * cutY, // hull beam z (fold-local)
    tipZ: -1.313 - 0.8601 * cutY, // hull apex z (fold-local)
  };
})();
const FOLD_ANGLE = (9.1 * Math.PI) / 180; // angle between R->L2 and the hull edge (R->T)

// The fold's key points on the table plane (fold-local; y = cutY).
function foldPoints() {
  const { cutY, cutX, cutZ, tipZ } = FOLD;
  const T = [0, cutY, tipZ]; // stern peak (apex)
  const R = [-cutX, cutY, cutZ]; // port hull edge at the cut
  const L = [cutX, cutY, cutZ]; // starboard hull edge at the cut
  // L2 on line T->L so R->L2 makes FOLD_ANGLE with the hull edge R->T:
  //   t = tanθ * |a|² / (cross(a,d) - tanθ * dot(a,d)),  a = R->T, d = T->L (x,z)
  const ax = T[0] - R[0], az = T[2] - R[2];
  const dx = L[0] - T[0], dz = L[2] - T[2];
  const tan = Math.tan(FOLD_ANGLE);
  const t = (tan * (ax * ax + az * az)) / (ax * dz - az * dx - tan * (ax * dx + az * dz));
  const L2 = [T[0] + t * (L[0] - T[0]), cutY, T[2] + t * (L[2] - T[2])];
  const R2 = [-L2[0], cutY, L2[2]]; // mirror on the port side
  // P = intersection of R->L2 and L->R2 (on the centreline x=0 by mirror symmetry)
  const s = cutX / (L2[0] + cutX);
  const P = [0, cutY, cutZ + s * (L2[2] - cutZ)];
  return { T, R, L, L2, R2, P };
}

function useSternFoldGeometry() {
  return useMemo(() => {
    const { T, R, L, L2, R2 } = foldPoints();
    const tris = [
      [T, R, L2], // right fold
      [T, L, R2], // left fold
    ];
    const pos: number[] = [];
    for (const [a, b, c] of tris) pos.push(...a, ...b, ...c);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.computeVertexNormals();
    return geo;
  }, []);
}

function SternFold({ color, sunk }: { color: string; sunk?: boolean }) {
  const geo = useSternFoldGeometry();
  return (
    <mesh geometry={geo} castShadow receiveShadow>
      <meshStandardMaterial color={sunk ? "#5a5650" : color} flatShading roughness={0.85} metalness={0} side={THREE.DoubleSide} />
    </mesh>
  );
}

function LocalCannonRig({ position }: { position: [number, number, number] }) {
  const yawRef = useRef<THREE.Group>(null);
  const elevRef = useRef<THREE.Group>(null);
  useFrame(() => {
    const { aimYaw, aimPitch } = useInputStore.getState();
    if (yawRef.current) yawRef.current.rotation.y = aimYaw + Math.PI;
    if (elevRef.current) elevRef.current.rotation.x = aimPitch;
  });
  return (
    <group position={position}>
      <CannonRig yawRef={yawRef} elevRef={elevRef}>
        <MuzzleFlash />
      </CannonRig>
    </group>
  );
}

function TauntBubble({ text }: { text: string }) {
  return (
    <div
      style={{
        marginTop: 3,
        fontSize: 11,
        fontStyle: "italic",
        color: "#ffe08a",
        textShadow: "1px 1px 0 #000",
        whiteSpace: "nowrap",
      }}
    >
      “{text}”
    </div>
  );
}

export function Boat({ color, name, lives = 3, maxLives = START_LIVES, sunk, connected = true, showLabel, isLocal, taunt, cannonYawRef }: BoatVisualProps) {
  // Show the "connection issues" banner only after the grace window, clear on reconnect.
  const [showDisconnect, setShowDisconnect] = useState(false);
  useEffect(() => {
    if (connected) {
      setShowDisconnect(false);
      return;
    }
    const t = setTimeout(() => setShowDisconnect(true), DISCONNECT_GRACE_MS);
    return () => clearTimeout(t);
  }, [connected]);

  const { mesh, yFix } = useBoatScene(color, sunk);
  const fold = foldPoints();
  const sinkFraction = Math.min(1, Math.max(0, (maxLives - lives) / maxLives));

  const groupRef = useRef<THREE.Group>(null);
  const animRef = useRef({ phase: 0 as 0 | 1 | 2 | 3 | 4, t: 0, prevSunk: false });

  useFrame((_, dt) => {
    const g = groupRef.current;
    if (!g) return;
    const anim = animRef.current;

    if (!sunk && anim.prevSunk) {
      // respawn: reset to living state
      anim.phase = 0; anim.t = 0;
      g.rotation.set(0, 0, 0);
      g.position.y = -sinkFraction * SINK_MAX;
    }
    if (sunk && !anim.prevSunk) {
      // death: start animation
      anim.phase = 1; anim.t = 0;
    }
    anim.prevSunk = !!sunk;

    if (!sunk) {
      if (anim.phase === 0) g.position.y = 0.4 -sinkFraction * SINK_MAX;
      return;
    }

    anim.t += dt;
    const t = anim.t;

    if (anim.phase === 1) {
      // shudder
      const fade = Math.max(0, 1 - t / 0.5);
      g.rotation.z = Math.sin(t * 40) * 0.14 * fade;
      g.rotation.x = Math.sin(t * 29 + 1.4) * 0.08 * fade;
      g.position.y = -SINK_MAX;
      if (t > 0.5) { anim.phase = 2; anim.t = 0; }
    } else if (anim.phase === 2) {
      // dramatic roll & sink
      const dur = 1.8;
      const p = Math.min(1, t / dur);
      const roll = 1 - (1 - p) * (1 - p) * (1 - p); // ease-out cubic
      const sink = p * p * (3 - 2 * p); // smoothstep
      g.rotation.z = roll * (Math.PI / 2 + 0.3);
      g.rotation.x = Math.sin(p * Math.PI) * 0.25;
      g.position.y = -SINK_MAX - sink * 4.2;
      if (t > dur) { anim.phase = 3; anim.t = 0; }
    } else if (anim.phase === 3) {
      // settle
      const p = Math.min(1, t / 1.0);
      const ease = 1 - (1 - p) * (1 - p);
      g.rotation.z = Math.PI / 2 + 0.3 + ease * 0.15;
      g.rotation.x = (1 - p) * 0.1 * Math.sin(t * 12);
      g.position.y = -SINK_MAX - 4.2 - ease * 0.8;
      if (t > 1.0) { anim.phase = 4; }
    } else {
      // resting underwater — gentle drift
      g.position.y = -SINK_MAX - 5.0 + Math.sin(t * 0.35) * 0.12;
      g.rotation.z = Math.PI / 2 + 0.45 + Math.sin(t * 0.27) * 0.05;
      g.rotation.x = Math.sin(t * 0.43) * 0.04;
    }
  });

  return (
    <>
      <group ref={groupRef}>
        <primitive object={mesh} />
        {/* stern fold always shown (structural); cannon dynamic for local player, static for remote */}
        <group position={[0, 0.02 + yFix, -0.9]}>
          <SternFold color={color} sunk={sunk} />
          {isLocal ? (
            <LocalCannonRig position={[fold.P[0], fold.P[1], fold.P[2]]} />
          ) : showLabel ? (
            <group position={[fold.P[0], fold.P[1], fold.P[2]]}>
              <CannonRig yaw={Math.PI} yawRef={cannonYawRef} />
            </group>
          ) : null}
        </group>

        {showLabel && name && !sunk && !isLocal && (
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
              {taunt && <TauntBubble text={taunt} />}
              {showDisconnect && <TauntBubble text={DISCONNECT_MSG} />}
            </div>
          </Html>
        )}
      </group>
      {showLabel && isLocal && !sunk && taunt && (
        <Html position={[0, 3.0, 0]} center distanceFactor={28} zIndexRange={[10, 0]} prepend>
          <TauntBubble text={taunt} />
        </Html>
      )}
      {showLabel && name && sunk && !isLocal && (
        <Html position={[0, 3.0, 0]} center distanceFactor={28} zIndexRange={[10, 0]} prepend>
          <div
            style={{
              fontFamily: "ui-monospace, monospace",
              fontSize: 14,
              whiteSpace: "nowrap",
              color: "#8a7868",
              textShadow: "1px 1px 0 #000",
              transform: "translateY(-50%)",
              pointerEvents: "none",
            }}
          >
            <PixelSkull /> {name}
            {taunt && <TauntBubble text={taunt} />}
          </div>
        </Html>
      )}
      <BubbleEffect active={!!sunk} />
    </>
  );
}

useGLTF.preload(MODEL_URL);

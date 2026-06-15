"use client";
import { useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { localBoat } from "../../game/state/localBoat";
import { useInputStore } from "../../game/state/inputStore";
import { fx } from "../../game/state/fx";
import { MODE_CANNON } from "../../game/net/protocol";
import { clamp, damp } from "../../lib/math";
import { ARENA_RADIUS, CANNON } from "../../lib/constants";
import { useLobbyStore } from "../../game/state/lobbyStore";

const TP_DIST = 11;
const TP_HEIGHT = 3;
const TP_BASE_PITCH = 0.40;

const INTRO_HEIGHT = 34;   // start height above boat for the spawn intro
const INTRO_BACK = 6;      // start offset behind boat (gives the down-arc, avoids gimbal lock)
const INTRO_SPRING = 3.2;  // decay rate → ~1s visible descent (damp reaches ~5% at 3/λ)

const desired = new THREE.Vector3();
const target = new THREE.Vector3();
const boatPos = new THREE.Vector3();
const boatQuat = new THREE.Quaternion();
const fwd = new THREE.Vector3();
const muzzleW = new THREE.Vector3();
const aimDir = new THREE.Vector3();

export function CameraRig() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const blend = useRef(0); // 0 = move (3rd person), 1 = cannon (1st person)
  const lookTarget = useRef(new THREE.Vector3(0, 1, 0));
  const alive = useLobbyStore((s) => s.players.find((p) => p.id === s.myId)?.alive ?? true);
  const lastFireSeq = useRef(0);
  const recoilZ = useRef(0);
  const wasPresent = useRef(false);
  const intro = useRef(0); // 1 = top-down spawn intro, decays to 0 = normal chase

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    if (!localBoat.present) { wasPresent.current = false; return; }
    const firstFrame = !wasPresent.current;
    wasPresent.current = true;
    const ins = useInputStore.getState();
    const isSunk = !alive;

    // Spawn intro: arm on first frame, decay each frame (top-down → default chase)
    if (firstFrame) intro.current = 1;
    intro.current = damp(intro.current, 0, INTRO_SPRING, dt);

    // Detect fire and trigger recoil
    if (ins.fireSeq !== lastFireSeq.current) {
      lastFireSeq.current = ins.fireSeq;
      recoilZ.current = -CANNON.camRecoilDist; // knockback distance
    }

    // Animate recoil (spring back to 0)
    recoilZ.current = damp(recoilZ.current, 0, CANNON.camRecoilSpring, dt);

    boatPos.set(localBoat.x, localBoat.y, localBoat.z);
    boatQuat.set(localBoat.qx, localBoat.qy, localBoat.qz, localBoat.qw);

    // For third-person only: apply recoil offset (cannon camera stays stable on barrel)
    const boatPosWithRecoil = desired.copy(boatPos);
    if (recoilZ.current !== 0) {
      fwd.set(0, 0, 1).applyQuaternion(boatQuat);
      boatPosWithRecoil.addScaledVector(fwd, recoilZ.current);
    }
    fwd.set(0, 0, 1).applyQuaternion(boatQuat);
    const boatYaw = Math.atan2(fwd.x, fwd.z);

    const wantCannon = !isSunk && ins.mode === MODE_CANNON ? 1 : 0;
    blend.current = damp(blend.current, wantCannon, 7, dt);
    const b = blend.current;

    // --- third-person target ---
    const camYaw = boatYaw + ins.lookYaw;
    // Chase elevation: clamp so the camera always stays above the look target —
    // otherwise a strong up-look (negative lookPitch) sinks the eye below the
    // boat and lookAt flips skyward.
    const pitch = clamp(TP_BASE_PITCH + ins.lookPitch, 0.12, 1.25);
    const cp = Math.cos(pitch);
    const tpPos = desired.set(
      boatPosWithRecoil.x - Math.sin(camYaw) * TP_DIST * cp,
      boatPosWithRecoil.y + TP_HEIGHT + Math.sin(pitch) * TP_DIST,
      boatPosWithRecoil.z - Math.cos(camYaw) * TP_DIST * cp
    );
    const tpTarget = target.set(boatPos.x, boatPos.y + 1.2, boatPos.z);

    // --- cannon first-person target ---
    const aimYaw = boatYaw + ins.aimYaw + Math.PI;
    const aimPitch = ins.aimPitch;
    // cannon pivot in world space (includes boat roll/pitch from waves)
    muzzleW.set(0, 1.1, -1.6).applyQuaternion(boatQuat).add(boatPos);
    const acp = Math.cos(aimPitch);
    aimDir.set(Math.sin(aimYaw) * acp, -Math.sin(aimPitch), Math.cos(aimYaw) * acp);

    // eye: orbits pivot horizontally with yaw, fixed height — pitch only steers look target
    const eyeX = muzzleW.x - Math.sin(aimYaw) * 0.9;
    const eyeY = muzzleW.y + 0.5;
    const eyeZ = muzzleW.z - Math.cos(aimYaw) * 0.3;
    const fpTX = muzzleW.x + aimDir.x * 15;
    const fpTY = muzzleW.y + aimDir.y * 15;
    const fpTZ = muzzleW.z + aimDir.z * 15;

    // blend position & look target
    let px = THREE.MathUtils.lerp(tpPos.x, eyeX, b);
    let py = THREE.MathUtils.lerp(tpPos.y, eyeY, b);
    let pz = THREE.MathUtils.lerp(tpPos.z, eyeZ, b);
    const tx = THREE.MathUtils.lerp(tpTarget.x, fpTX, b);
    const ty = THREE.MathUtils.lerp(tpTarget.y, fpTY, b);
    const tz = THREE.MathUtils.lerp(tpTarget.z, fpTZ, b);

    // Spawn intro: pull camera position toward a high pose behind the boat, decaying to default.
    // boatYaw (not camYaw) keeps the start framing stable regardless of look input.
    if (intro.current > 0.001) {
      const topX = boatPos.x - Math.sin(boatYaw) * INTRO_BACK;
      const topY = boatPos.y + INTRO_HEIGHT;
      const topZ = boatPos.z - Math.cos(boatYaw) * INTRO_BACK;
      px = THREE.MathUtils.lerp(px, topX, intro.current);
      py = THREE.MathUtils.lerp(py, topY, intro.current);
      pz = THREE.MathUtils.lerp(pz, topZ, intro.current);
    }

    // smooth follow (snappier in cannon mode); snap on first frame
    const k = 10 + b * 14;
    if (firstFrame) {
      camera.position.set(px, py, pz);
      lookTarget.current.set(tx, ty, tz);
    }
    camera.position.x = damp(camera.position.x, px, k, dt);
    camera.position.y = damp(camera.position.y, py, k, dt);
    camera.position.z = damp(camera.position.z, pz, k, dt);

    // In Walls mode keep camera inside the bucket — it has no physics body so clamp manually.
    // Pull 1.5 units inward from the wall face so the frustum never clips through the wall.
    if (useLobbyStore.getState().settings.arenaMode === "walls") {
      const CAM_MAX_R = ARENA_RADIUS - 1.5;
      const d = Math.hypot(camera.position.x, camera.position.z);
      if (d > CAM_MAX_R) {
        const s = CAM_MAX_R / d;
        camera.position.x *= s;
        camera.position.z *= s;
      }
    }

    lookTarget.current.x = damp(lookTarget.current.x, tx, k, dt);
    lookTarget.current.y = damp(lookTarget.current.y, ty, k, dt);
    lookTarget.current.z = damp(lookTarget.current.z, tz, k, dt);

    // camera shake from hits
    if (fx.shake > 0.001) {
      const s = fx.shake;
      camera.position.x += (Math.random() - 0.5) * s;
      camera.position.y += (Math.random() - 0.5) * s;
      camera.position.z += (Math.random() - 0.5) * s;
      fx.shake = damp(fx.shake, 0, 6, dt);
    }

    camera.lookAt(lookTarget.current);

    const fov = THREE.MathUtils.lerp(58, 74, b);
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
  });

  return null;
}

import { Quaternion, Vector3 } from "three";
import type { RapierRigidBody } from "@react-three/rapier";
import { waveHeight } from "../../lib/waves";
import { BOAT, RAM } from "../../lib/constants";
import { clamp, deg } from "../../lib/math";
import type { BoatInput } from "../net/hostInputs";

const _q = new Quaternion();
const _f = new Vector3();
const _l = new Vector3();
const _up = new Vector3();
const _axis = new Vector3();
const WORLD_UP = new Vector3(0, 1, 0);

export function boatForward(body: RapierRigidBody, out = new Vector3()): Vector3 {
  const r = body.rotation();
  _q.set(r.x, r.y, r.z, r.w);
  return out.set(0, 0, 1).applyQuaternion(_q);
}

export function boatYaw(body: RapierRigidBody): number {
  const f = boatForward(body, _f);
  return Math.atan2(f.x, f.z);
}

/** Thrust + boat-like steering + top-speed clamp. */
export function applyBoatControl(body: RapierRigidBody, input: BoatInput, dt: number) {
  const f = boatForward(body, _f);
  const mag = input.throttle >= 0 ? input.throttle * BOAT.thrust : input.throttle * BOAT.reverse;
  body.applyImpulse({ x: f.x * mag * dt, y: 0, z: f.z * mag * dt }, true);

  const lv = body.linvel();
  const speed = Math.hypot(lv.x, lv.z);
  const speedFactor = Math.min(1, 0.25 + speed / BOAT.maxSpeed);
  const yaw = -input.steer * BOAT.steerTorque * speedFactor * dt;
  body.applyTorqueImpulse({ x: 0, y: yaw, z: 0 }, true);

  if (speed > BOAT.maxSpeed) {
    const s = BOAT.maxSpeed / speed;
    body.setLinvel({ x: lv.x * s, y: lv.y, z: lv.z * s }, true);
  }
}

/** Four-point buoyancy against the shared wave field → heave + natural rocking. */
export function applyBuoyancy(body: RapierRigidBody, t: number, dt: number) {
  const m = body.mass() || BOAT.mass;
  const r = body.rotation();
  _q.set(r.x, r.y, r.z, r.w);
  const pos = body.translation();
  const lv = body.linvel();
  const sx = BOAT.sampleX;
  const sz = BOAT.sampleZ;
  const hy = -BOAT.half.y;
  const pts = [
    [sx, hy, sz],
    [-sx, hy, sz],
    [sx, hy, -sz],
    [-sx, hy, -sz],
  ];
  for (const p of pts) {
    _l.set(p[0], p[1], p[2]).applyQuaternion(_q);
    const wx = pos.x + _l.x;
    const wy = pos.y + _l.y;
    const wz = pos.z + _l.z;
    const depth = waveHeight(wx, wz, t) - wy;
    if (depth > 0) {
      const up = (BOAT.buoyStiffness * depth - BOAT.buoyDamp * lv.y) * m * 0.25 * dt;
      if (up > 0) body.applyImpulseAtPoint({ x: 0, y: up, z: 0 }, { x: wx, y: wy, z: wz }, true);
    }
  }
}

/**
 * Restoring torque that rotates the boat's up-axis back toward world-up, so a
 * cannon/ram hit can pitch it violently but it always rolls upright again.
 * Angle-based (not just the cross product) so it still recovers from a full flip.
 */
export function applyRighting(body: RapierRigidBody, dt: number) {
  const r = body.rotation();
  _q.set(r.x, r.y, r.z, r.w);
  _up.set(0, 1, 0).applyQuaternion(_q);
  const av = body.angvel();
  const m = body.mass() || BOAT.mass;

  // axis to rotate boat-up toward world-up
  _axis.crossVectors(_up, WORLD_UP);
  if (_axis.lengthSq() < 1e-6) {
    // perfectly upright (no-op) or perfectly inverted (pick an axis to tip over)
    if (_up.y >= 0) _axis.set(0, 0, 0);
    else boatForward(body, _axis); // fallback flip axis when fully capsized
  } else {
    _axis.normalize();
  }
  const angle = Math.acos(clamp(_up.dot(WORLD_UP), -1, 1)); // 0 upright .. π inverted

  body.applyTorqueImpulse(
    {
      x: (_axis.x * angle * BOAT.rightK - av.x * BOAT.rightDamp) * m * dt,
      y: -av.y * BOAT.rightDamp * 0.15 * m * dt, // gentle yaw damping (don't fight steering)
      z: (_axis.z * angle * BOAT.rightK - av.z * BOAT.rightDamp) * m * dt,
    },
    true
  );

  // clamp roll/pitch spin so a hit can't send it tumbling
  const mv = BOAT.maxTiltAngVel;
  if (Math.abs(av.x) > mv || Math.abs(av.z) > mv) {
    body.setAngvel({ x: clamp(av.x, -mv, mv), y: av.y, z: clamp(av.z, -mv, mv) }, true);
  }
}

const FRONT_THR = Math.cos(deg(RAM.frontHalfAngleDeg));

export interface RamClass {
  dir: Vector3; // unit, from a toward b
  aFront: boolean;
  bFront: boolean;
}

export function classifyRam(a: RapierRigidBody, b: RapierRigidBody): RamClass {
  const ap = a.translation();
  const bp = b.translation();
  const dir = new Vector3(bp.x - ap.x, 0, bp.z - ap.z);
  if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
  dir.normalize();
  const af = boatForward(a, new Vector3());
  const bf = boatForward(b, new Vector3());
  return {
    dir,
    aFront: af.dot(dir) > FRONT_THR,
    bFront: bf.dot(dir.clone().negate()) > FRONT_THR,
  };
}

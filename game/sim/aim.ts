import { Euler, Quaternion, Vector3 } from "three";
import { CANNON } from "../../lib/constants";
import { MUZZLE_TIP_Z, TRUNNION_Z, BASE_CENTER_Z } from "../../components/game/Cannon";
import { localBoat } from "../state/localBoat";

// One source of truth for where the local player's cannon points, so the cannon
// model, the trajectory preview, and (matching) the host's spawned ball all agree.

// Distance from trunnion pivot to muzzle tip, derived from the cannon mesh geometry.
export const BARREL_LEN = MUZZLE_TIP_Z - TRUNNION_Z;

// The rig yaws about its base-center, but the trunnion sits this far ahead of that
// axis — so the trunnion ORBITS the yaw axis as you aim left/right. muzzleLocal is
// the trunnion at straight-back (yaw=PI); we re-derive its orbit for any yaw.
const TRUNNION_AHEAD = TRUNNION_Z - BASE_CENTER_Z;

const _boatQ = new Quaternion();
const _aimE = new Euler();
const _aimQ = new Quaternion();
const _pivot = new Vector3();
const _dir = new Vector3();

export interface Aim {
  // mount pivot at the stern (world)
  px: number; py: number; pz: number;
  // aim direction (world, unit)
  dx: number; dy: number; dz: number;
  // muzzle tip (world) = pivot + dir * BARREL_LEN
  tx: number; ty: number; tz: number;
  // orientation of the barrel (boat heading * aim)
  qx: number; qy: number; qz: number; qw: number;
}

const out: Aim = { px: 0, py: 0, pz: 0, dx: 0, dy: 0, dz: 1, tx: 0, ty: 0, tz: 0, qx: 0, qy: 0, qz: 0, qw: 1 };

/** Compute the local cannon pivot, direction and muzzle tip from the boat + aim. */
export function computeAim(aimYaw: number, aimPitch: number): Aim {
  _boatQ.set(localBoat.qx, localBoat.qy, localBoat.qz, localBoat.qw);

  // pivot = trunnion, orbiting the rig's yaw axis (boat-local), then to world.
  // At theta=PI this reduces to muzzleLocal (straight-back).
  const theta = aimYaw + Math.PI;
  _pivot.set(
    CANNON.muzzleLocal.x + TRUNNION_AHEAD * Math.sin(theta),
    CANNON.muzzleLocal.y,
    CANNON.muzzleLocal.z + TRUNNION_AHEAD * (1 + Math.cos(theta))
  ).applyQuaternion(_boatQ);
  out.px = localBoat.x + _pivot.x;
  out.py = localBoat.y + _pivot.y;
  out.pz = localBoat.z + _pivot.z;

  // barrel orientation = boat heading * aim(yaw,pitch)
  _aimE.set(aimPitch, aimYaw + Math.PI, 0, "YXZ");
  _aimQ.setFromEuler(_aimE);
  _aimQ.premultiply(_boatQ); // boatQ * aimQ
  out.qx = _aimQ.x; out.qy = _aimQ.y; out.qz = _aimQ.z; out.qw = _aimQ.w;

  _dir.set(0, 0, 1).applyQuaternion(_aimQ).normalize();
  out.dx = _dir.x; out.dy = _dir.y; out.dz = _dir.z;

  out.tx = out.px + _dir.x * BARREL_LEN;
  out.ty = out.py + _dir.y * BARREL_LEN;
  out.tz = out.pz + _dir.z * BARREL_LEN;
  return out;
}

// Rendered pose of every boat this frame, for effects that follow boats (foam).
// Written by whichever system draws the boats (HostWorld on the host, ClientBoats
// elsewhere). Kept out of React state to avoid per-frame re-renders.

export interface BoatPose {
  x: number; // physics body position
  y: number;
  z: number;
  qx: number; // body rotation
  qy: number;
  qz: number;
  qw: number;
  fx: number; // heading on the sea plane, unit (x, z)
  fz: number;
  lift: number; // hull mesh height above the body (Boat.tsx hullLift)
  alive: boolean;
  at: number; // performance.now() of the last write; stale = boat gone
}

export const boatPoses = new Map<string, BoatPose>();

export function setBoatPose(
  id: string,
  pos: { x: number; y: number; z: number },
  q: { x: number; y: number; z: number; w: number },
  lift: number,
  alive: boolean
) {
  // boat forward (+Z) rotated by the quaternion, flattened onto the sea
  const fx = 2 * (q.x * q.z + q.w * q.y);
  const fz = 1 - 2 * (q.x * q.x + q.y * q.y);
  const n = Math.hypot(fx, fz) || 1;
  const p = boatPoses.get(id) ?? ({} as BoatPose);
  Object.assign(p, { x: pos.x, y: pos.y, z: pos.z, qx: q.x, qy: q.y, qz: q.z, qw: q.w, fx: fx / n, fz: fz / n, lift, alive, at: performance.now() });
  boatPoses.set(id, p);
}

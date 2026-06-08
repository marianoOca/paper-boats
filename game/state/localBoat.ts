// Live transform of the local player's boat, written each frame by whichever
// system owns it (HostWorld on the host, ClientBoats elsewhere) and read by the
// camera rig. Kept out of React state to avoid per-frame re-renders.

export const localBoat = {
  present: false,
  x: 0,
  y: 0,
  z: 0,
  qx: 0,
  qy: 0,
  qz: 0,
  qw: 1,
};

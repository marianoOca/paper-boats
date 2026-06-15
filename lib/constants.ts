// Central tunables. Forward direction of a boat is local +Z. Back (cannon) is -Z.

export const TICK_HZ = 60; // host sim step target
export const SNAPSHOT_HZ = 30; // host broadcast rate (binary snaps, lib/wire.ts)
export const INPUT_HZ = 30; // client input send-on-change check rate
export const INTERP_DELAY_MS = 90; // client interpolation buffer depth (~2.7 snaps @30Hz)

export const MAX_PLAYERS = 12;
export const MIN_PLAYERS_TO_START = 2;
export const START_LIVES = 3;
export const COUNTDOWN_MS = 3000;
export const DISCONNECT_GRACE_MS = 2000; // grace before disconnect banner + host failover (also: host-stall handoff)

export const ARENA_RADIUS = 60; // inner radius of the wooden bucket
export const WALL_HEIGHT = 16;
export const WATER_LEVEL = 0;

export const GRAVITY_Y = -26;

export const BOAT = {
  mass: 1.5,
  thrust: 26, // forward force
  reverse: 14, // backward force
  steerTorque: 7, // yaw torque, scaled by current speed fraction
  maxSpeed: 15,
  linDamp: 0.9,
  angDamp: 2.4,
  // collider half-extents (x = beam, y = height, z = length)
  half: { x: 1.0, y: 0.7, z: 2.0 },
  buoyStiffness: 150, // restoring force toward wave surface
  buoyDamp: 22,
  sampleZ: 1.4, // bow/stern buoyancy sample offset along z
  sampleX: 0.55, // port/starboard sample offset along x (smaller = less side roll)
  // self-righting: keeps boats upright (weeble) so a hit can lurch them hard but
  // they always roll back to the surface instead of capsizing.
  rightK: 28, // righting torque toward upright
  rightDamp: 6, // roll/pitch angular damping
  maxTiltAngVel: 3, // clamp on roll/pitch angular velocity
} as const;

export const RAM = {
  frontHalfAngleDeg: 42, // a contact within ±this of forward counts as "front"
  knockback: 16, // backward impulse on the rammer
  victimImpulse: 10, // shove imparted to the victim
  invulnMs: 900, // post-hit invulnerability (1 collision = 1 life)
  cooldownMs: 600, // rammer recovery window
} as const;

export const CANNON = {
  reloadMs: 2200,
  windupMs: 500, // delay between click and launch — masks net latency, lets aim settle

  ballSpeed: 36,
  ballRadius: 0.32,
  ballMass: 0.6,
  hitImpulse: 18,
  hitTorque: 5, // lurch, not capsize (self-righting recovers the rest)
  recoilImpulse: 2, // boat slide-back on fire
  recoilTorque: 4, // boat tilt/rock kick on fire
  camRecoilDist: 0.4, // 3rd-person camera kickback distance on fire
  camRecoilSpring: 8, // how fast camera springs back (higher = snappier)
  ballLifeMs: 6000,
  muzzleLocal: { x: 0, y: 1.1, z: -1.72 }, // trunnion pivot on the stern
  minPitchDeg: -10,
  maxPitchDeg: 15,
  maxAimYaw: 140,
} as const;

// 12 visually distinct boat colors.
export const BOAT_COLORS = [
  "#e6433f", // red
  "#3f7de6", // blue
  "#43c267", // green
  "#e6c93f", // yellow
  "#b34fe6", // purple
  "#e6883f", // orange
  "#3fd6d6", // cyan
  "#e63f9c", // pink
  "#9be63f", // lime
  "#7a8a99", // slate
  "#e6e1d2", // bone
  "#1f2a36", // navy
  "#8b4513", // brown
  "#ff6b81", // coral
  "#6a994e", // olive
] as const;

export const TIMER_OPTIONS: (number | null)[] = [null, 120, 240, 300];

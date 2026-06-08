"use client";
import type { Ref } from "react";
// Low-poly cannon rebuilt from cannon.md. Side-view segments muzzle->breech:
//   A swell · B 70° taper · C chase · D 45° taper · E breech · F neck · G box.
// The side profile has TALL end blocks (A, E) and a THIN chase (C) between them;
// front view is an octagon, so every round part is an 8-sided prism (cheap +
// faceted to match the paper-boat look). ~500 tris. Muzzle points local +Z.
// Built at ~19 internal length-units, then scaled so the whole piece is LEN long.
const LEN = 1.5; // overall length in game units
const S = LEN / 19;
const IRON = "#33302b";
const DARK = "#15110d";

// radii: chase (C) thin, breech (E) thick, muzzle swell (A) = 1.2 × E (cannon.md line 12).
// End blocks are deliberately fat vs length to match the diagram's height:length ≈ 1:4.
const rC = 1.6;
const rE = 2.0;
const rA = rE * 1.0;

// reference side view
//  _       ____|__
// | \_____/       \ _
// |           /\   | |
// |  _____    \/   |_|
// |_/     \_______/
// AABCCCCCDEEEEEEEFGGG
const lenA = 1;
const lenC = 3;
const lenE = 6;
const lenG = 0.5;


// taper lengths are DERIVED from the radius change and the required incline
// (measured from the cannon axis): len = Δradius / tan(angle). Keeps each slope
// at its spec angle even when the radii change. cannon.md: B=70°, D=45°, F=80°.
const DEG = Math.PI / 180;
const rFback = rE * 0.5; // F tapers the breech down to this radius
const lenB = Math.abs(rA - rC) / Math.tan(70 * DEG);
const lenD = Math.abs(rE - rC) / Math.tan(45 * DEG);
const lenF = Math.abs(rE - rFback) / Math.tan(80 * DEG);

// Segment CENTER z's, walked from the muzzle tip toward the breech. Every z is
// derived from the lengths, so changing lenC or lenE keeps all segments butted
// together — the chain can't gap or tear apart.
const zTip = 7.9; // A front face = muzzle, where the ball exits
const zA = zTip - lenA / 2;
const zB = zTip - lenA - lenB / 2;
const zC = zTip - lenA - lenB - lenC / 2;
const zD = zTip - lenA - lenB - lenC - lenD / 2;
const frontE = zTip - lenA - lenB - lenC - lenD; // E's front face (where D ends)
const zE = frontE - lenE / 2;
const zF = frontE - lenE - lenF / 2;
const zG = frontE - lenE - lenF - lenG / 2;

// muzzle tip in <Cannon/> local space (after scale); Boat anchors this on CANNON.muzzleLocal.
export const MUZZLE_TIP_Z = zTip * S;

// Elevation pivot: the breech-side octagon bolts (trunnions) sit at
// (±rE*0.95, 0, frontE-1.5) pre-scale. The cannon elevates about the X axis through
// this z at y=0 — CannonRig pivots the barrel here.
export const TRUNNION_Z = (frontE - 1.5) * S; // in <Cannon/> output space

// Carriage dimensions, shared so CannonRig can pivot about the base centre.
const BASE_TOP = 0, BASE_BOT = -5.5, BASE_NLEVELS = 4;
const BASE_H = BASE_TOP - BASE_BOT;
const BASE_U = BASE_H / BASE_NLEVELS;
const BASE_CF = frontE - 1.5 + 1.5 * BASE_U; // carriage front z (pre-scale)
const BASE_CZ = BASE_CF - ((BASE_NLEVELS + 2) / 2) * BASE_U; // carriage centre z (pre-scale)
// base footprint centre in <Cannon/> output space (y = underside, z = centre)
export const BASE_CENTER_Z = BASE_CZ * S;
export const BASE_BOTTOM_Y = BASE_BOT * S;

function Octa({ rf, rb, len, z }: { rf: number; rb: number; len: number; z: number }) {
  // cylinder axis is +Y by default; rotate so it runs along Z, rf at +Z (front).
  return (
    <mesh position={[0, 0, z]} rotation={[Math.PI / 2, 0, 0]} castShadow>
      <cylinderGeometry args={[rf, rb, len, 8, 1, false, Math.PI / 8]} />
      <meshStandardMaterial color={IRON} metalness={0.35} roughness={0.6} flatShading />
    </mesh>
  );
}

export function Cannon() {
  return (
    <group scale={S}>
      {/* A — muzzle swell (octagon block), widest part */}
      <Octa rf={rA} rb={rA} len={lenA} z={zA} />
      {/* bore recess in the muzzle face */}
      <mesh position={[0, 0, zTip - 0.3]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[rA * 0.5, rA * 0.5, 0.7, 8, 1, false, Math.PI / 8]} />
        <meshStandardMaterial color={DARK} metalness={0.2} roughness={0.85} />
      </mesh>
      {/* B — 70° taper, swell down to chase */}
      <Octa rf={rA} rb={rC} len={lenB} z={zB} />
      {/* C — chase (the thin barrel tube) */}
      <Octa rf={rC} rb={rC} len={lenC} z={zC} />
      {/* D — 45° taper, chase up to breech */}
      <Octa rf={rC} rb={rE} len={lenD} z={zD} />
      {/* E — breech block (length = 1.2 × C, cannon.md line 23) */}
      <Octa rf={rE} rb={rE} len={lenE} z={zE} />
      {/* F — 80° taper */}
      <Octa rf={rE} rb={rFback} len={lenF} z={zF} />
      {/* G — small rectangular box at the rear (cascabel / mount) */}
      <mesh position={[0, 0, zG]} castShadow>
        <boxGeometry args={[1, 1, lenG]} />
        <meshStandardMaterial color={IRON} metalness={0.35} roughness={0.6} flatShading />
      </mesh>

      {/* octagon bolt on the breech sides ("bolt that goes to the stair"), pinned to E's front */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * rE * 0.95, 0, frontE - 1.5]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.6, 0.6, 1.6, 8]} />
          <meshStandardMaterial color={IRON} metalness={0.45} roughness={0.55} flatShading />
        </mesh>
      ))}

      {/* sight on top of E: stem + wide crossbar (the solid T/anchor shape), pinned to E's front */}
      <mesh position={[0, rE + 0.20, frontE - 0.7]} castShadow>
        <boxGeometry args={[0.32, 0.9, 0.45]} />
        <meshStandardMaterial color={IRON} metalness={0.35} roughness={0.6} flatShading />
      </mesh>
      <mesh position={[0, rE + 0.70, frontE - 0.7]} castShadow>
        <boxGeometry args={[1.0, 0.3, 0.6]} />
        <meshStandardMaterial color={IRON} metalness={0.35} roughness={0.6} flatShading />
      </mesh>
    </group>
  );
}

// --- carriage / base (cannon.md "base") ------------------------------------
// Two side cheeks the trunnions rest on, joined by a bottom slab + a front cross
// wall, hollow down the middle so the barrel clears, with a 4-step stair at the
// back. Built in the same pre-scale units as the cannon, then scaled by S so it
// lines up under the barrel.
const WOOD = "#5a3d22";

function CannonBase() {
  const TX = rE * 1.2; // cheek center x — sets WALL SEPARATION (inner gap = 2*TX - WALL)
  const WALL = 0.9; // wall thickness (cannon.md: all walls same thickness)
  const TOP = BASE_TOP; // cheek top = trunnion height
  const BOT = BASE_BOT; // carriage bottom
  const H = BASE_H;
  // Side panel = a staircase of unit squares (cannon.md). For a height of nLevels
  // squares the profile, front -> back, is: lip(full) · notch(top square cut) ·
  // platform(full) · then descending steps nLevels-1, nLevels-2, … , 1. Every piece
  // is a multiple of one square `u`, so the steps stay consistent at any height:
  //   X·X / XXXX / XXXXX / XXXXXX   (for nLevels = 4)
  const nLevels = BASE_NLEVELS; // side panel height in squares
  const u = BASE_U; // one square — height-driven so squares stay square
  const nCols = nLevels + 2; // lip + notch + platform + (nLevels-1) descending steps
  const zNotchC = frontE - 1.5; // trunnion z
  const zCF = zNotchC + 1.5 * u; // front, so column 1 (the notch) lands on the trunnion
  const zCB = zCF - nCols * u; // carriage back

  // height (in squares) of each column, front -> back
  const colSquares = (i: number) =>
    i === 0 ? nLevels : // lip (full height)
    i === 1 ? nLevels - 1 : // notch — top square removed (the trunnion-bolt cut)
    i === 2 ? nLevels : // platform (full height)
    nLevels - (i - 2); // steps: nLevels-1, nLevels-2, … , 1

  const mat = <meshStandardMaterial color={WOOD} metalness={0.05} roughness={0.85} flatShading />;
  return (
    <group scale={S}>
      {/* two lateral walls (cheeks), each a unit-square staircase */}
      {[-1, 1].map((s) => (
        <group key={s} position={[s * TX, 0, 0]}>
          {Array.from({ length: nCols }, (_, i) => {
            const h = colSquares(i) * u;
            const zc = zCF - (i + 0.5) * u; // column centers, front -> back
            return (
              <mesh key={i} position={[0, BOT + h / 2, zc]} castShadow receiveShadow>
                <boxGeometry args={[WALL, h, u]} />
                {mat}
              </mesh>
            );
          })}
        </group>
      ))}
      {/* front cross wall joining the cheeks, kept below the barrel */}
      <mesh position={[0, BOT + H * 0.3, zCF - u / 2]} castShadow>
        <boxGeometry args={[2 * TX + WALL, H * 0.6, WALL]} />
        {mat}
      </mesh>
    </group>
  );
}

// Cannon + carriage rig. `yaw` rotates the WHOLE rig (base + cannon) together;
// `elevation` rotates ONLY the cannon about its trunnion axis (the breech-side
// octagon bolts). Drive these two props to aim/animate.
export function CannonRig({ elevation = 0, yaw = 0, yawRef, elevRef }: { elevation?: number; yaw?: number; yawRef?: Ref<any>; elevRef?: Ref<any> }) {
  return (
    // yaw pivots about the rig origin; we place that origin at the base footprint
    // centre (x=0, z=BASE_CENTER_Z, y=underside) by shifting the contents below.
    <group ref={yawRef} rotation={[0, yaw, 0]}>
      <group position={[0, -BASE_BOTTOM_Y, -BASE_CENTER_Z]}>
        <CannonBase />
        {/* elevation pivots the barrel about the trunnion */}
        <group ref={elevRef} position={[0, 0, TRUNNION_Z]} rotation={[elevation, 0, 0]}>
          <group position={[0, 0, -TRUNNION_Z]}>
            <Cannon />
          </group>
        </group>
      </group>
    </group>
  );
}

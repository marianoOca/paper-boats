// Shared ocean wave field. The SAME function is evaluated by:
//   - the host physics (buoyancy sampling), in JS below, and
//   - the ocean vertex shader (visual displacement), via waveGLSL().
// Both are generated from one WAVES table so they can never drift apart.

export interface Wave {
  dirX: number;
  dirZ: number;
  amp: number;
  freq: number;
  speed: number;
  phase: number;
}

export const WAVES: Wave[] = [
  { dirX: 1.0, dirZ: 0.0, amp: 0.55, freq: 0.16, speed: 1.1, phase: 0.0 },
  { dirX: 0.4, dirZ: 1.0, amp: 0.34, freq: 0.24, speed: 0.9, phase: 1.7 },
  { dirX: -0.7, dirZ: 0.5, amp: 0.2, freq: 0.4, speed: 1.6, phase: 4.2 },
];

const norm = (w: Wave) => {
  const len = Math.hypot(w.dirX, w.dirZ) || 1;
  return { nx: w.dirX / len, nz: w.dirZ / len };
};

/** Surface height at world (x,z) and time t (seconds). */
export function waveHeight(x: number, z: number, t: number): number {
  let h = 0;
  for (const w of WAVES) {
    const { nx, nz } = norm(w);
    h += w.amp * Math.sin((nx * x + nz * z) * w.freq + t * w.speed + w.phase);
  }
  return h;
}

/** Upward surface normal at world (x,z) and time t. */
export function waveNormal(x: number, z: number, t: number): [number, number, number] {
  let dx = 0;
  let dz = 0;
  for (const w of WAVES) {
    const { nx, nz } = norm(w);
    const c = w.amp * w.freq * Math.cos((nx * x + nz * z) * w.freq + t * w.speed + w.phase);
    dx += nx * c;
    dz += nz * c;
  }
  const len = Math.hypot(dx, 1, dz) || 1;
  return [-dx / len, 1 / len, -dz / len];
}

/** GLSL source for `float waveHeight(vec2 p, float t)` with the table baked in. */
export function waveGLSL(): string {
  const lines = WAVES.map((w) => {
    const { nx, nz } = norm(w);
    return `  h += ${w.amp.toFixed(4)} * sin((${nx.toFixed(4)}*p.x + ${nz.toFixed(
      4
    )}*p.y) * ${w.freq.toFixed(4)} + t * ${w.speed.toFixed(4)} + ${w.phase.toFixed(4)});`;
  });
  return `float waveHeight(vec2 p, float t){\n  float h = 0.0;\n${lines.join(
    "\n"
  )}\n  return h;\n}`;
}

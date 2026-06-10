import * as THREE from "three";
import { BOAT } from "../../lib/constants";

// Shared boat foam: ambient hull foam (always on while alive) + V-wake trail
// ribbon that lingers where the boat was and fades with age. Mesh + ShaderMaterial
// to match the game's existing voronoi foam (Waterfall.tsx), not particles.
// Driven by both ClientBoats (interpolated snapshots) and HostWorld (Rapier bodies).

const TRAIL_HISTORY = 32; // ring buffer capacity
const TRAIL_SAMPLE_INTERVAL = 0.06; // seconds between trail samples
const TRAIL_MAX_AGE = 1.5; // seconds before a trail point expires
const TRAIL_WIDTH_NEAR = 0.4; // ribbon half-width at newest point
const TRAIL_WIDTH_FAR = 2.5; // ribbon half-width at oldest point
const TRAIL_SPEED_THRESHOLD = 0.3;
const HULL_W = 2.4; // hull foam mesh width (hugs BOAT.half.x=1.0 beam + small margin)
const HULL_L = 4.4; // hull foam mesh length (hugs BOAT.half.z=2.0 + small margin)
const HULL_SEG_W = 12; // hull subdivisions across — enough triangles for faceted low-poly
const HULL_SEG_L = 18;
const HULL_FOAM_H = 0.45; // hull foam mound height (vertex displacement)
const TRAIL_BUMP = 0.22; // trail ribbon vertical noise amplitude

const _stern = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _right = new THREE.Vector3();

interface TrailPoint {
  wx: number;
  wz: number;
  wy: number; // world stern position
  rx: number;
  rz: number; // right-perpendicular unit vector (boat +X in world XZ)
  age: number;
}

interface BoatFoamState {
  hullMesh: THREE.Mesh;
  hullMat: THREE.ShaderMaterial;
  trailMesh: THREE.Mesh;
  trailGeo: THREE.BufferGeometry;
  trailMat: THREE.ShaderMaterial;
  trailPos: Float32Array; // TRAIL_HISTORY * 2 * 3
  trailUv: Float32Array; // TRAIL_HISTORY * 2 * 2
  history: TrailPoint[]; // ring buffer length TRAIL_HISTORY
  histHead: number;
  activeCount: number;
  prevX: number;
  prevZ: number;
  sampleTimer: number;
}

const VORONOI_GLSL = /* glsl */ `
  float _h2(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
  float voronoi(vec2 p, float spd, float t){
    vec2 cell=floor(p); vec2 f=fract(p); float v=8.0;
    for(int i=-1;i<=1;i++) for(int j=-1;j<=1;j++){
      vec2 n=vec2(float(i),float(j)); float h=_h2(cell+n);
      vec2 r=n-f+vec2(0.5+0.45*sin(t*spd+h*6.28),0.5+0.45*cos(t*spd*0.8+(h+0.37)*6.28));
      v=min(v,length(r));
    }
    return smoothstep(0.52,0.04,v);
  }
`;

// Value noise for vertex displacement (gives the bumpy surface whose triangles
// tilt into distinct 3D facets — same idea as Waterfall.tsx).
const NOISE_GLSL = /* glsl */ `
  float _hn(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
  float vnoise(vec2 p){
    vec2 i=floor(p); vec2 f=fract(p); f=f*f*(3.0-2.0*f);
    return mix(mix(_hn(i),_hn(i+vec2(1,0)),f.x), mix(_hn(i+vec2(0,1)),_hn(i+vec2(1,1)),f.x), f.y);
  }
`;

// Flat per-triangle normal via screen-space derivatives → crisp low-poly facets.
const FACET_GLSL = /* glsl */ `
  vec3 facetShade(vec3 col, vec3 vpos){
    vec3 nrm = normalize(cross(dFdx(vpos), dFdy(vpos)));
    if(nrm.y < 0.0) nrm = -nrm;
    vec3 L = normalize(vec3(0.35, 0.85, 0.40));
    float diff = clamp(dot(nrm, L), 0.0, 1.0);
    vec3 H = normalize(L + vec3(0.0, 1.0, 0.0));
    float spec = pow(clamp(dot(nrm, H), 0.0, 1.0), 24.0);
    return col * (0.55 + 0.55 * diff) + vec3(1.0) * spec * 0.6;
  }
`;

const HULL_VERT = /* glsl */ `
  uniform float uTime;
  varying vec2 vUv; varying vec3 vPos; varying float vH;
  ${NOISE_GLSL}
  void main(){
    vUv = uv;
    vec2 uvc = uv * 2.0 - 1.0;
    float d = abs(uvc.x) + abs(uvc.y);                      // diamond (pointed bow/stern)
    float prof = 1.0 - smoothstep(0.5, 1.0, d);             // mound, tall in center
    float n1 = vnoise(position.xz * 1.3 + vec2(uTime * 0.50, uTime * 0.35));
    float n2 = vnoise(position.xz * 3.1 + vec2(-uTime * 0.80, uTime * 0.60));
    float bump = n1 * 0.7 + n2 * 0.3;                       // 0..1
    float h = prof * (${HULL_FOAM_H.toFixed(2)} * (0.4 + bump));
    vH = h;
    vPos = vec3(position.x, position.y + h, position.z);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(vPos, 1.0);
  }
`;

const HULL_FRAG = /* glsl */ `
  uniform float uTime; varying vec2 vUv; varying vec3 vPos; varying float vH;
  ${VORONOI_GLSL}
  ${FACET_GLSL}
  void main(){
    vec2 uvc = vUv * 2.0 - 1.0;
    float d = abs(uvc.x) + abs(uvc.y);                      // diamond mask
    float edgeFade = 1.0 - smoothstep(0.92, 1.0, d);        // crisp edge → sharp bow/stern points
    if(edgeFade <= 0.001) discard;
    vec2 fuv = vUv * vec2(3.0, 4.5);
    float foam = clamp(voronoi(fuv + vec2(uTime * 0.3, 0.0), 1.6, uTime) * 0.7
                     + voronoi(fuv * 1.8 + vec2(0.0, uTime * 0.5), 2.8, uTime) * 0.9, 0.0, 1.0);
    float heightGlow = clamp(vH / ${HULL_FOAM_H.toFixed(2)}, 0.0, 1.0);
    vec3 base = mix(vec3(0.55, 0.82, 0.92), vec3(1.0), clamp(foam * 0.7 + heightGlow * 0.6, 0.0, 1.0));
    vec3 col = facetShade(base, vPos);
    float alpha = clamp((foam * 0.7 + heightGlow * 0.45 + 0.25) * edgeFade, 0.0, 1.0) * 0.9;
    if(alpha < 0.01) discard;
    gl_FragColor = vec4(col, alpha);
  }
`;

const TRAIL_VERT = /* glsl */ `
  uniform float uTime;
  varying vec2 vUv; varying vec3 vPos;
  ${NOISE_GLSL}
  void main(){
    vUv = uv;
    float n = vnoise(position.xz * 1.5 + vec2(uTime * 0.5, uTime * 0.4));
    float bump = (n - 0.5) * ${TRAIL_BUMP.toFixed(2)};
    vPos = vec3(position.x, position.y + bump, position.z);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(vPos, 1.0);
  }
`;

const TRAIL_FRAG = /* glsl */ `
  uniform float uTime; varying vec2 vUv; varying vec3 vPos;
  ${VORONOI_GLSL}
  ${FACET_GLSL}
  void main(){
    float ageFrac = vUv.x;
    float sideFade = smoothstep(0.0, 0.35, 1.0 - abs(vUv.y * 2.0 - 1.0));
    float foam = voronoi(vec2(ageFrac * 6.0 + uTime * 0.4, vUv.y * 2.5), 2.2, uTime);
    vec3 base = mix(vec3(0.6, 0.88, 0.94), vec3(1.0), foam * 0.6);
    vec3 col = facetShade(base, vPos);
    float alpha = (1.0 - ageFrac) * sideFade * foam * 0.85; if(alpha < 0.01) discard;
    gl_FragColor = vec4(col, alpha);
  }
`;

function buildTrailIndex(n: number): Uint16Array {
  const idx = new Uint16Array((n - 1) * 6);
  for (let i = 0; i < n - 1; i++) {
    const o = i * 6,
      a = 2 * i,
      b = 2 * i + 1,
      c = 2 * (i + 1),
      d = 2 * (i + 1) + 1;
    idx[o] = a;
    idx[o + 1] = c;
    idx[o + 2] = b;
    idx[o + 3] = b;
    idx[o + 4] = c;
    idx[o + 5] = d;
  }
  return idx;
}

function makeBoatFoamState(): BoatFoamState {
  // Hull mesh
  const hullGeo = new THREE.PlaneGeometry(HULL_W, HULL_L, HULL_SEG_W, HULL_SEG_L);
  hullGeo.rotateX(-Math.PI / 2);
  const hullMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 } },
    vertexShader: HULL_VERT,
    fragmentShader: HULL_FRAG,
  });
  const hullMesh = new THREE.Mesh(hullGeo, hullMat);
  hullMesh.frustumCulled = false;

  // Trail ribbon — pre-allocate max-size index buffer ONCE
  const trailPos = new Float32Array(TRAIL_HISTORY * 2 * 3);
  for (let i = 0; i < TRAIL_HISTORY * 2; i++) trailPos[i * 3 + 1] = -9999;
  const trailUv = new Float32Array(TRAIL_HISTORY * 2 * 2);
  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute("position", new THREE.BufferAttribute(trailPos, 3));
  trailGeo.setAttribute("uv", new THREE.BufferAttribute(trailUv, 2));
  trailGeo.setIndex(new THREE.BufferAttribute(buildTrailIndex(TRAIL_HISTORY), 1));
  trailGeo.setDrawRange(0, 0);
  const trailMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 } },
    vertexShader: TRAIL_VERT,
    fragmentShader: TRAIL_FRAG,
  });
  const trailMesh = new THREE.Mesh(trailGeo, trailMat);
  trailMesh.frustumCulled = false;

  return {
    hullMesh,
    hullMat,
    trailMesh,
    trailGeo,
    trailMat,
    trailPos,
    trailUv,
    history: Array.from({ length: TRAIL_HISTORY }, () => ({
      wx: 0,
      wz: 0,
      wy: 0,
      rx: 1,
      rz: 0,
      age: TRAIL_MAX_AGE,
    })),
    histHead: 0,
    activeCount: 0,
    prevX: 0,
    prevZ: 0,
    sampleTimer: 0,
  };
}

export class BoatFoam {
  private states = new Map<string, BoatFoamState>();
  constructor(private scene: THREE.Scene) {}

  /** Called when the player set changes. Adds missing, removes departed. */
  sync(ids: string[]) {
    const want = new Set(ids);
    for (const id of ids) {
      if (!this.states.has(id)) {
        const fs = makeBoatFoamState();
        this.states.set(id, fs);
        this.scene.add(fs.hullMesh, fs.trailMesh);
      }
    }
    for (const [id, fs] of this.states) {
      if (!want.has(id)) {
        this.removeState(fs);
        this.states.delete(id);
      }
    }
  }

  /** Per-frame, one boat. `now` = performance.now()/1000 (same value for all boats in a frame). */
  update(
    id: string,
    x: number,
    y: number,
    z: number,
    qx: number,
    qy: number,
    qz: number,
    qw: number,
    alive: boolean,
    dt: number,
    now: number
  ) {
    const fs = this.states.get(id);
    if (!fs) return;

    // Layer 1: hull foam — follows boat XZ + yaw, flat at waterline
    fs.hullMesh.visible = alive;
    if (alive) {
      _q.set(qx, qy, qz, qw);
      fs.hullMesh.position.set(x, y - 0.6, z);
      _stern.set(0, 0, 1).applyQuaternion(_q); // project boat +Z for yaw
      fs.hullMesh.rotation.set(0, Math.atan2(_stern.x, _stern.z), 0);
      fs.hullMat.uniforms.uTime.value = now;
    }

    // Layer 2: trail sampling at the stern
    const dx = x - fs.prevX,
      dz = z - fs.prevZ;
    const speed = Math.sqrt(dx * dx + dz * dz) / Math.max(dt, 0.001);
    fs.prevX = x;
    fs.prevZ = z;
    fs.sampleTimer -= dt;

    if (alive && fs.sampleTimer <= 0 && speed > TRAIL_SPEED_THRESHOLD) {
      fs.sampleTimer = TRAIL_SAMPLE_INTERVAL;
      _q.set(qx, qy, qz, qw);
      _stern.set(0, 0, -BOAT.half.z).applyQuaternion(_q); // local-space offset
      _right.set(1, 0, 0).applyQuaternion(_q);
      const slot = fs.history[fs.histHead % TRAIL_HISTORY];
      slot.wx = _stern.x + x;
      slot.wz = _stern.z + z;
      slot.wy = _stern.y + y;
      slot.rx = _right.x;
      slot.rz = _right.z;
      slot.age = 0;
      fs.histHead++;
    }

    // Age all points
    let active = 0;
    for (let i = 0; i < TRAIL_HISTORY; i++) {
      fs.history[i].age += dt;
      if (fs.history[i].age < TRAIL_MAX_AGE) active++;
    }

    // Rebuild ribbon
    if (active < 2) {
      fs.trailGeo.setDrawRange(0, 0);
    } else {
      fs.trailMat.uniforms.uTime.value = now;
      const pts: TrailPoint[] = []; // newest → oldest
      for (let i = fs.histHead - 1; i >= fs.histHead - TRAIL_HISTORY; i--) {
        const pt = fs.history[((i % TRAIL_HISTORY) + TRAIL_HISTORY) % TRAIL_HISTORY];
        if (pt.age < TRAIL_MAX_AGE) pts.push(pt);
      }
      const n = pts.length;
      for (let i = 0; i < n; i++) {
        const pt = pts[i];
        // Age-based (NOT index-based i/(n-1)): when the oldest point expires and n
        // drops, an index-based frac makes every point jump width/fade. Real age is
        // continuous — expiring point fades to alpha~0 before it leaves the buffer.
        const ageFrac = Math.min(pt.age / TRAIL_MAX_AGE, 1);
        const halfW = TRAIL_WIDTH_NEAR + (TRAIL_WIDTH_FAR - TRAIL_WIDTH_NEAR) * ageFrac;
        const vi0 = 2 * i * 3,
          vi1 = (2 * i + 1) * 3,
          ui0 = 2 * i * 2,
          ui1 = (2 * i + 1) * 2;
        fs.trailPos[vi0] = pt.wx - pt.rx * halfW;
        fs.trailPos[vi0 + 1] = pt.wy;
        fs.trailPos[vi0 + 2] = pt.wz - pt.rz * halfW;
        fs.trailPos[vi1] = pt.wx + pt.rx * halfW;
        fs.trailPos[vi1 + 1] = pt.wy;
        fs.trailPos[vi1 + 2] = pt.wz + pt.rz * halfW;
        fs.trailUv[ui0] = ageFrac;
        fs.trailUv[ui0 + 1] = 0.0;
        fs.trailUv[ui1] = ageFrac;
        fs.trailUv[ui1 + 1] = 1.0;
      }
      fs.trailGeo.attributes.position.needsUpdate = true;
      fs.trailGeo.attributes.uv.needsUpdate = true;
      fs.trailGeo.setDrawRange(0, (n - 1) * 6);
    }
    fs.activeCount = active;
  }

  private removeState(fs: BoatFoamState) {
    this.scene.remove(fs.hullMesh, fs.trailMesh);
    fs.hullMesh.geometry.dispose();
    fs.hullMat.dispose();
    fs.trailGeo.dispose();
    fs.trailMat.dispose();
  }

  dispose() {
    for (const fs of this.states.values()) this.removeState(fs);
    this.states.clear();
  }
}

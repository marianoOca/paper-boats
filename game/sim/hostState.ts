import { Euler, Quaternion, Vector3 } from "three";
import type { RapierRigidBody } from "@react-three/rapier";
import { BOAT, CANNON, RAM, START_LIVES } from "../../lib/constants";
import { SUNK_TAUNTS, KILL_TAUNTS } from "../../lib/taunts";
import { BARREL_LEN } from "./aim";
import { classifyRam } from "./physicsHelpers";
import { useNetStore } from "../state/netStore";
import { useGameStore } from "../state/gameStore";
import type { BoatInput } from "../net/hostInputs";
import type { GameEvent, StatPatch } from "../net/protocol";

export interface BoatRT {
  id: string;
  lives: number;
  alive: boolean;
  invulnUntil: number;
  reloadUntil: number;
  ramCdUntil: number;
  lastFireSeq: number;
  deathTick: number | null;
  damageDealt: number;
  fellOff: boolean;
}

export interface BallSpec {
  id: string;
  ownerId: string;
  origin: [number, number, number];
  vel: [number, number, number];
}

function emit(ev: GameEvent) {
  useNetStore.getState().send({ t: "ev", ev });
  useGameStore.getState().pushEvent(ev); // host sees its own FX too
}

function randomTaunts() {
  return {
    sunkTaunt: Math.floor(Math.random() * SUNK_TAUNTS.length),
    killTaunt: Math.floor(Math.random() * KILL_TAUNTS.length),
  };
}

const _q = new Quaternion();
const _aim = new Quaternion();
const _v = new Vector3();
const _dir = new Vector3();
const _up = new Vector3(0, 1, 0);

// Horizontal knockback along `dir` (sign flips for the rammer vs the victim).
const knock = (b: RapierRigidBody, dir: Vector3, mag: number, sign: number) =>
  b.applyImpulse({ x: sign * dir.x * mag, y: 0, z: sign * dir.z * mag }, true);

class HostState {
  bodies = new Map<string, RapierRigidBody>();
  ballBodies = new Map<string, RapierRigidBody>();
  rt = new Map<string, BoatRT>();
  simTime = 0;
  tick = 0;
  statsDirty = true;
  ballSeq = 0;
  pendingSpawns: BallSpec[] = [];
  startLives = START_LIVES;

  reset() {
    this.bodies.clear();
    this.ballBodies.clear();
    this.rt.clear();
    this.simTime = 0;
    this.tick = 0;
    this.statsDirty = true;
    this.ballSeq = 0;
    this.pendingSpawns = [];
  }

  ensure(id: string): BoatRT {
    let r = this.rt.get(id);
    if (!r) {
      r = {
        id,
        lives: this.startLives,
        alive: true,
        invulnUntil: 0,
        reloadUntil: 0,
        ramCdUntil: 0,
        lastFireSeq: 0,
        deathTick: null,
        damageDealt: 0,
        fellOff: false,
      };
      this.rt.set(id, r);
    }
    return r;
  }

  now() {
    return performance.now();
  }

  aliveCount() {
    let n = 0;
    for (const r of this.rt.values()) if (r.alive) n++;
    return n;
  }

  /** Rising-edge fire request from a player's input. */
  tryFire(id: string, input: BoatInput) {
    const rt = this.ensure(id);
    if (input.fireSeq <= rt.lastFireSeq) return;
    rt.lastFireSeq = input.fireSeq;
    const now = this.now();
    if (!rt.alive || input.mode !== 1 || now < rt.reloadUntil) return;
    const body = this.bodies.get(id);
    if (!body) return;
    rt.reloadUntil = now + CANNON.reloadMs;

    const rot = body.rotation();
    _q.set(rot.x, rot.y, rot.z, rot.w);
    _aim.setFromEuler(new Euler(input.aimPitch, input.aimYaw + Math.PI, 0, "YXZ"));
    _q.multiply(_aim);
    _dir.set(0, 0, 1).applyQuaternion(_q).normalize();

    const pos = body.translation();
    _v.set(CANNON.muzzleLocal.x, CANNON.muzzleLocal.y, CANNON.muzzleLocal.z);
    const rot2 = body.rotation();
    _q.set(rot2.x, rot2.y, rot2.z, rot2.w);
    _v.applyQuaternion(_q);
    const ox = pos.x + _v.x + _dir.x * BARREL_LEN;
    const oy = pos.y + _v.y + _dir.y * BARREL_LEN;
    const oz = pos.z + _v.z + _dir.z * BARREL_LEN;

    const bv = body.linvel();
    const speed = CANNON.ballSpeed;
    const vel: [number, number, number] = [
      _dir.x * speed + bv.x * 0.4,
      _dir.y * speed + bv.y * 0.4,
      _dir.z * speed + bv.z * 0.4,
    ];
    const ballId = `b${this.ballSeq++}`;
    this.pendingSpawns.push({ id: ballId, ownerId: id, origin: [ox, oy, oz], vel });
    const m = body.mass() || BOAT.mass;
    body.applyImpulse(
      { x: -_dir.x * CANNON.recoilImpulse * m, y: 0, z: -_dir.z * CANNON.recoilImpulse * m },
      true
    );
    body.applyTorqueImpulse(
      { x: -_dir.z * CANNON.recoilTorque, y: 0, z: _dir.x * CANNON.recoilTorque },
      true
    );
    emit({ k: "fire", owner: id, origin: [ox, oy, oz], dir: [_dir.x, _dir.y, _dir.z] });
  }

  private damage(victimId: string, attackerId: string, kind: "ball" | "ram", push: Vector3) {
    const v = this.ensure(victimId);
    const now = this.now();
    if (!v.alive || now < v.invulnUntil || victimId === attackerId) return false;
    v.lives -= 1;
    v.invulnUntil = now + RAM.invulnMs;
    this.ensure(attackerId).damageDealt += 1;
    this.statsDirty = true;

    const body = this.bodies.get(victimId);
    if (body) {
      const m = body.mass() || BOAT.mass;
      const k = (kind === "ball" ? CANNON.hitImpulse : RAM.victimImpulse) * m;
      body.applyImpulse({ x: push.x * k, y: 0.5 * k, z: push.z * k }, true);
      body.applyTorqueImpulse(
        { x: (push.z) * CANNON.hitTorque, y: 0, z: -(push.x) * CANNON.hitTorque },
        true
      );
    }
    const p = body ? body.translation() : { x: 0, y: 0, z: 0 };
    emit({ k: "hit", victim: victimId, attacker: attackerId, point: [p.x, p.y, p.z], kind });
    if (v.lives <= 0) {
      v.lives = 0;
      v.alive = false;
      v.deathTick = this.tick;
      emit({ k: "death", id: victimId, by: attackerId, ...randomTaunts() });
    }
    return true;
  }

  /** No-damage elimination: boat fell off the plate edge (Edge arena mode). */
  onFellOff(id: string) {
    const v = this.ensure(id);
    if (!v.alive) return;
    v.lives = 0;
    v.alive = false;
    v.deathTick = this.tick;
    this.statsDirty = true;
    emit({ k: "death", id, by: null, ...randomTaunts() });
  }

  onBallHit(ownerId: string, victimId: string, ball: RapierRigidBody) {
    const lv = ball.linvel();
    _dir.set(lv.x, 0, lv.z);
    if (_dir.lengthSq() < 1e-4) _dir.set(0, 0, 1);
    _dir.normalize();
    this.damage(victimId, ownerId, "ball", _dir);
  }

  onRam(aId: string, bId: string) {
    const A = this.bodies.get(aId);
    const B = this.bodies.get(bId);
    if (!A || !B) return;
    const now = this.now();
    const { dir, aFront, bFront } = classifyRam(A, B); // dir: a -> b
    const ra = this.ensure(aId);
    const rb = this.ensure(bId);
    const mA = A.mass() || BOAT.mass;
    const mB = B.mass() || BOAT.mass;

    if (aFront && bFront) {
      // both fronts = safe zone: bounce apart, no damage
      knock(A, dir, RAM.knockback * mA, -1);
      knock(B, dir, RAM.knockback * mB, 1);
      ra.ramCdUntil = now + RAM.cooldownMs;
      rb.ramCdUntil = now + RAM.cooldownMs;
      return;
    }
    if (aFront && !bFront) {
      if (now > ra.ramCdUntil) {
        knock(A, dir, RAM.knockback * mA, -1);
        ra.ramCdUntil = now + RAM.cooldownMs;
      }
      this.damage(bId, aId, "ram", dir);
    } else if (bFront && !aFront) {
      if (now > rb.ramCdUntil) {
        knock(B, dir, RAM.knockback * mB, 1);
        rb.ramCdUntil = now + RAM.cooldownMs;
      }
      this.damage(aId, bId, "ram", dir.clone().negate());
    } else {
      // side/side glance: tiny separation, no damage
      knock(A, dir, 2 * mA, -1);
      knock(B, dir, 2 * mB, 1);
    }
  }

  collectStats(): StatPatch[] {
    const out: StatPatch[] = [];
    for (const r of this.rt.values()) {
      out.push({
        id: r.id,
        lives: r.lives,
        alive: r.alive,
        deathTick: r.deathTick,
        damageDealt: r.damageDealt,
      });
    }
    return out;
  }
}

export const hostState = new HostState();

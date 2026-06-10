"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Physics, RigidBody, CuboidCollider } from "@react-three/rapier";
import { useFrame, useThree } from "@react-three/fiber";
import { PhysicsBoat } from "./PhysicsBoat";
import { HostBall } from "./HostBall";
import { BoatFoam } from "./boatFoam";
import { hostState, type BallSpec } from "../../game/sim/hostState";
import { applyBoatControl, applyBuoyancy, applyRighting } from "../../game/sim/physicsHelpers";
import { hostInputs, NEUTRAL_INPUT, type BoatInput } from "../../game/net/hostInputs";
import { useLobbyStore } from "../../game/state/lobbyStore";
import { useTauntStore } from "../../game/state/tauntStore";
import { useNetStore } from "../../game/state/netStore";
import { useInputStore } from "../../game/state/inputStore";
import { localBoat } from "../../game/state/localBoat";
import { renderState } from "../../game/state/fx";
import {
  ARENA_RADIUS,
  COUNTDOWN_MS,
  GRAVITY_Y,
  SNAPSHOT_HZ,
  TICK_HZ,
  WALL_HEIGHT,
  WATER_LEVEL,
} from "../../lib/constants";
import { FLAG_ALIVE, type BallTuple, type EntTuple } from "../../game/net/protocol";

function spawn(index: number, total: number): { pos: [number, number, number]; yaw: number } {
  const a = (index / Math.max(1, total)) * Math.PI * 2;
  const r = ARENA_RADIUS * 0.62;
  const x = Math.cos(a) * r;
  const z = Math.sin(a) * r;
  return { pos: [x, 1.2, z], yaw: Math.atan2(-x, -z) };
}

function Walls() {
  const segs = useMemo(() => {
    const n = 32;
    // inner face of bucket visual is at ARENA_RADIUS + 2.5; collider half-depth is 0.6
    // so center = 2.5 + 0.6 = 3.1 outward to align contact surface with the wood
    const R = ARENA_RADIUS + 0.6; // inner face at ARENA_RADIUS, aligned with foam/waterfall
    const hw = R * Math.sin(Math.PI / n) * 1.3;
    const out: { pos: [number, number, number]; ry: number; hw: number }[] = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      out.push({ pos: [Math.cos(a) * R, 2, Math.sin(a) * R], ry: -a, hw });
    }
    return out;
  }, []);
  return (
    <RigidBody type="fixed" colliders={false} userData={{ kind: "wall" }}>
      {segs.map((s, i) => (
        <CuboidCollider key={i} position={s.pos} rotation={[0, s.ry, 0]} args={[0.6, WALL_HEIGHT / 2 + 2, s.hw]} />
      ))}
    </RigidBody>
  );
}

function readSelfInput(): BoatInput {
  const s = useInputStore.getState();
  return {
    throttle: s.throttle,
    steer: s.steer,
    mode: s.mode,
    aimYaw: s.aimYaw,
    aimPitch: s.aimPitch,
    fireSeq: s.fireSeq,
  };
}

interface DirectorState {
  playingSent: boolean;
  endSent: boolean;
  matchEndAt: number;
  endDeferAt: number;
}

function HostLoop({ onSpawn, foam }: { onSpawn: (s: BallSpec) => void; foam: BoatFoam }) {
  const acc = useRef({ snap: 0, stats: 0 });
  const dir = useRef<DirectorState>({ playingSent: false, endSent: false, matchEndAt: 0, endDeferAt: 0 });

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const now = performance.now() / 1000;
    const send = useNetStore.getState().send;
    const sNow = useNetStore.getState().serverNow();
    const lobby = useLobbyStore.getState();
    const players = lobby.players.filter((p) => p.name);
    const myId = lobby.myId;
    const playing = lobby.phase === "playing";
    const arenaMode = lobby.settings.arenaMode;

    hostState.simTime += dt;
    hostState.tick++;
    renderState.simTime = hostState.simTime; // host drives the ocean clock directly

    for (const p of players) {
      const body = hostState.bodies.get(p.id);
      if (!body) continue;
      const input = p.id === myId ? readSelfInput() : hostInputs.get(p.id) ?? NEUTRAL_INPUT;
      const rt = hostState.ensure(p.id);
      const t = body.translation();
      const r = body.rotation();

      // Edge arena: boats that drive past the rim fall off the plate and sink.
      if (arenaMode === "edge") {
        if (!rt.fellOff && Math.hypot(t.x, t.z) > ARENA_RADIUS) rt.fellOff = true;
        if (rt.fellOff && rt.alive && t.y < WATER_LEVEL) hostState.onFellOff(p.id);
      }

      if (!rt.fellOff) applyBuoyancy(body, hostState.simTime, dt);
      applyRighting(body, dt);
      if (playing && rt.alive) {
        applyBoatControl(body, input, dt);
        hostState.tryFire(p.id, input);
      }
      foam.update(p.id, t.x, t.y, t.z, r.x, r.y, r.z, r.w, rt.alive, dt, now);
      if (p.id === myId) {
        localBoat.present = true;
        localBoat.x = t.x;
        localBoat.y = t.y;
        localBoat.z = t.z;
        localBoat.qx = r.x;
        localBoat.qy = r.y;
        localBoat.qz = r.z;
        localBoat.qw = r.w;
      }
    }

    if (hostState.pendingSpawns.length) {
      const list = hostState.pendingSpawns;
      hostState.pendingSpawns = [];
      for (const s of list) onSpawn(s);
    }

    // snapshot broadcast
    acc.current.snap += dt;
    if (acc.current.snap >= 1 / SNAPSHOT_HZ) {
      acc.current.snap = 0;
      const ents: EntTuple[] = [];
      for (const [id, body] of hostState.bodies) {
        const t = body.translation();
        const r = body.rotation();
        const rt = hostState.rt.get(id);
        ents.push([id, t.x, t.y, t.z, r.x, r.y, r.z, r.w, rt ? rt.lives : 3, rt?.alive ? FLAG_ALIVE : 0, hostInputs.get(id)?.aimYaw ?? 0]);
      }
      const balls: BallTuple[] = [];
      for (const [id, b] of hostState.ballBodies) {
        const t = b.translation();
        balls.push([id, t.x, t.y, t.z]);
      }
      send({ t: "snap", tick: hostState.tick, simTime: hostState.simTime, ents, balls });
    }

    // authoritative stats
    if (hostState.statsDirty) {
      acc.current.stats += dt;
      if (acc.current.stats >= 0.15) {
        acc.current.stats = 0;
        hostState.statsDirty = false;
        send({ t: "stats", players: hostState.collectStats() });
      }
    }

    // director: countdown -> playing -> ended
    const d = dir.current;
    if (lobby.phase === "lobby") {
      d.playingSent = false;
      d.endSent = false;
      d.matchEndAt = 0;
      d.endDeferAt = 0;
    } else if (lobby.phase === "countdown" && lobby.startEpoch != null && !d.playingSent) {
      if (sNow - lobby.startEpoch >= COUNTDOWN_MS) {
        d.playingSent = true;
        d.matchEndAt = lobby.settings.timerSec ? sNow + lobby.settings.timerSec * 1000 : 0;
        send({ t: "phase", phase: "playing" });
      }
    } else if (lobby.phase === "playing" && !d.endSent) {
      const timeUp = d.matchEndAt > 0 && sNow >= d.matchEndAt;
      const lastStanding = players.length > 1 && hostState.aliveCount() <= 1;
      if (timeUp || lastStanding) {
        // Defer 2s so the final sinking animation is visible before leaderboard.
        if (d.endDeferAt === 0) d.endDeferAt = sNow + 2000;
        if (sNow >= d.endDeferAt) {
          d.endSent = true;
          send({ t: "phase", phase: "ended", endReason: timeUp ? "timeout" : "combat" });
        }
      }
    }
  });

  return null;
}

export function HostWorld() {
  const [balls, setBalls] = useState<BallSpec[]>([]);
  const players = useLobbyStore((s) => s.players.filter((p) => p.name));
  const myId = useLobbyStore((s) => s.myId);
  const arenaMode = useLobbyStore((s) => s.settings.arenaMode);
  const taunts = useTauntStore((s) => s.taunts);
  const { scene } = useThree();
  const foam = useRef<BoatFoam | null>(null);
  if (!foam.current) foam.current = new BoatFoam(scene);

  // Reset during render (before child RigidBody ref callbacks register bodies);
  // an effect here would run AFTER children mount and wipe their registrations.
  const inited = useRef(false);
  if (!inited.current) {
    inited.current = true;
    hostState.startLives = useLobbyStore.getState().settings.startLives;
    hostState.reset();
  }
  useEffect(() => () => hostState.reset(), []);
  useEffect(() => { foam.current!.sync(players.map((p) => p.id)); }, [players]);
  useEffect(() => () => foam.current?.dispose(), []);

  const onSpawn = useCallback((s: BallSpec) => setBalls((b) => [...b, s]), []);
  const removeBall = useCallback((id: string) => setBalls((b) => b.filter((x) => x.id !== id)), []);

  const layout = useMemo(
    () => players.map((p, i) => ({ p, ...spawn(i, players.length) })),
    // re-layout only when the set of players changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [players.map((p) => p.id).join(",")]
  );

  return (
    <Physics gravity={[0, GRAVITY_Y, 0]} timeStep={1 / TICK_HZ}>
      {arenaMode === "walls" && <Walls />}
      {layout.map(({ p: layoutPlayer, pos, yaw }) => {
        const livePlayer = players.find((x) => x.id === layoutPlayer.id) ?? layoutPlayer;
        return <PhysicsBoat key={layoutPlayer.id} player={livePlayer} selfId={myId} pos={pos} yaw={yaw} taunt={taunts[livePlayer.id]} />;
      })}
      {balls.map((b) => (
        <HostBall key={b.id} spec={b} onDone={removeBall} />
      ))}
      <HostLoop onSpawn={onSpawn} foam={foam.current} />
    </Physics>
  );
}

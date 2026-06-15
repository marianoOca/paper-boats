"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Physics, RigidBody, CuboidCollider } from "@react-three/rapier";
import { useFrame } from "@react-three/fiber";
import { PhysicsBoat } from "./PhysicsBoat";
import { HostBall } from "./HostBall";
import { hostState, type BallSpec } from "../../game/sim/hostState";
import { applyBoatControl, applyBuoyancy, applyRighting } from "../../game/sim/physicsHelpers";
import { hostInputs, NEUTRAL_INPUT, type BoatInput } from "../../game/net/hostInputs";
import { useLobbyStore } from "../../game/state/lobbyStore";
import { useGameStore, sampleWorld, type Sample } from "../../game/state/gameStore";
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
import { FLAG_ALIVE } from "../../game/net/protocol";
import { encodeSnap, type SnapBall, type SnapEnt } from "../../lib/wire";

const SPAWN_HEIGHT = 6; // boats spawn above the surface and fall down at match start

function spawn(index: number, total: number): { pos: [number, number, number]; yaw: number } {
  const a = (index / Math.max(1, total)) * Math.PI * 2;
  const r = ARENA_RADIUS * 0.62;
  const x = Math.cos(a) * r;
  const z = Math.sin(a) * r;
  return { pos: [x, SPAWN_HEIGHT, z], yaw: Math.atan2(-x, -z) };
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
  endDeferAt: number;
}

function HostLoop({ onSpawn }: { onSpawn: (s: BallSpec) => void }) {
  const acc = useRef({ snap: 0, stats: 0 });
  const dir = useRef<DirectorState>({ playingSent: false, endSent: false, endDeferAt: 0 });

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
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
      const input =
        p.id === myId ? readSelfInput()
        : p.connected === false ? NEUTRAL_INPUT // disconnected: coast to a stop, no fire
        : hostInputs.get(p.id) ?? NEUTRAL_INPUT;
      const rt = hostState.ensure(p.id);
      const t = body.translation();

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
      if (p.id === myId) {
        const r = body.rotation();
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

    // snapshot broadcast (binary; see lib/wire.ts)
    acc.current.snap += dt;
    if (acc.current.snap >= 1 / SNAPSHOT_HZ) {
      acc.current.snap = 0;
      const idxOf = new Map(players.map((p) => [p.id, p.idx]));
      const selfAimYaw = useInputStore.getState().aimYaw; // host doesn't round-trip its own input
      const ents: SnapEnt[] = [];
      for (const [id, body] of hostState.bodies) {
        const idx = idxOf.get(id);
        if (idx === undefined) continue;
        const t = body.translation();
        const r = body.rotation();
        const rt = hostState.rt.get(id);
        ents.push({
          idx,
          x: t.x, y: t.y, z: t.z,
          qx: r.x, qy: r.y, qz: r.z, qw: r.w,
          lives: rt ? rt.lives : 3,
          flags: rt?.alive ? FLAG_ALIVE : 0,
          aimYaw: id === myId ? selfAimYaw : hostInputs.get(id)?.aimYaw ?? 0,
        });
      }
      const balls: SnapBall[] = [];
      for (const [id, b] of hostState.ballBodies) {
        const t = b.translation();
        balls.push({ idx: parseInt(id.slice(1), 10) & 0xff, x: t.x, y: t.y, z: t.z });
      }
      useNetStore.getState().sendRaw(encodeSnap(Math.round(hostState.simTime * 1000), ents, balls));
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
      d.endDeferAt = 0;
    } else if (lobby.phase === "countdown" && lobby.startEpoch != null && !d.playingSent) {
      if (sNow - lobby.startEpoch >= COUNTDOWN_MS) {
        d.playingSent = true;
        send({ t: "phase", phase: "playing" });
      }
    } else if (lobby.phase === "playing" && !d.endSent) {
      // Derive the deadline from server-authoritative startEpoch (preserved across a
      // host switch) so a host that took over mid-match — and never saw the countdown
      // transition — still ends the match on time.
      const endAt =
        lobby.startEpoch != null && lobby.settings.timerSec
          ? lobby.startEpoch + COUNTDOWN_MS + lobby.settings.timerSec * 1000
          : 0;
      const timeUp = endAt > 0 && sNow >= endAt;
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

  // Reset during render (before child RigidBody ref callbacks register bodies);
  // an effect here would run AFTER children mount and wipe their registrations.
  // If we're taking over a match in progress (old host dropped), reconstruct the
  // sim from the last snapshot instead of resetting to a fresh game.
  const takeover = useRef<Sample | null>(null);
  const inited = useRef(false);
  if (!inited.current) {
    inited.current = true;
    const lobby = useLobbyStore.getState();
    hostState.startLives = lobby.settings.startLives;
    // Takeover = HostWorld mounts while a match is already *playing* (mid-match host
    // promotion). The original host always mounts at "countdown" -> fresh spawn ring,
    // so stale snaps from a previous match can't be mistaken for live state.
    const midMatch = lobby.phase === "playing" && useGameStore.getState().snaps.length > 0;
    if (midMatch) {
      const sample = sampleWorld(performance.now());
      takeover.current = sample;
      hostState.restoreFrom(lobby.players.filter((p) => p.name), sample.time);
      // self input bypasses syncFireSeq, so adopt its baseline here too
      const self = hostState.rt.get(lobby.myId);
      if (self) {
        self.lastFireSeq = useInputStore.getState().fireSeq;
        self.fireSeqSynced = true;
      }
    } else {
      hostState.reset();
    }
  }
  useEffect(() => () => hostState.reset(), []);

  const onSpawn = useCallback((s: BallSpec) => setBalls((b) => [...b, s]), []);
  const removeBall = useCallback((id: string) => setBalls((b) => b.filter((x) => x.id !== id)), []);

  // Freeze each boat's initial transform per id. Recomputing spawn(i, total) on every
  // roster change (e.g. a late joiner bumps players.length) would feed already-mounted
  // RigidBodies a new `position` prop, teleporting existing boats off where they are.
  const spawns = useRef(
    new Map<string, { pos: [number, number, number]; yaw: number; quat?: [number, number, number, number] }>()
  );
  const layout = useMemo(
    () =>
      players.map((p, i) => {
        let s = spawns.current.get(p.id);
        if (!s) {
          // takeover: spawn each boat where the last snapshot left it; else the ring
          const t = takeover.current?.ents.get(p.id);
          s = t
            ? { pos: [t.x, t.y, t.z], yaw: 0, quat: [t.qx, t.qy, t.qz, t.qw] }
            : { ...spawn(i, players.length), quat: undefined };
          spawns.current.set(p.id, s);
        }
        return { p, ...s };
      }),
    // re-layout only when the set of players changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [players.map((p) => p.id).join(",")]
  );

  return (
    <Physics gravity={[0, GRAVITY_Y, 0]} timeStep={1 / TICK_HZ}>
      {arenaMode === "walls" && <Walls />}
      {layout.map(({ p: layoutPlayer, pos, yaw, quat }) => {
        const livePlayer = players.find((x) => x.id === layoutPlayer.id) ?? layoutPlayer;
        return <PhysicsBoat key={layoutPlayer.id} player={livePlayer} selfId={myId} pos={pos} yaw={yaw} quat={quat} taunt={taunts[livePlayer.id]} />;
      })}
      {balls.map((b) => (
        <HostBall key={b.id} spec={b} onDone={removeBall} />
      ))}
      <HostLoop onSpawn={onSpawn} />
    </Physics>
  );
}

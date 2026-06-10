"use client";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { Boat } from "./Boat";
import { sampleWorld } from "../../game/state/gameStore";
import { useLobbyStore } from "../../game/state/lobbyStore";
import { useTauntStore } from "../../game/state/tauntStore";
import { localBoat } from "../../game/state/localBoat";
import { CANNON } from "../../lib/constants";
import { FLAG_ALIVE } from "../../game/net/protocol";
import { BoatFoam } from "./boatFoam";

const BALL_POOL = 40;

export function ClientBoats() {
  const players = useLobbyStore((s) => s.players.filter((p) => p.name));
  const myId = useLobbyStore((s) => s.myId);
  const taunts = useTauntStore((s) => s.taunts);
  const groups = useRef(new Map<string, THREE.Group>());
  const balls = useRef<(THREE.Mesh | null)[]>([]);
  const cannonRefs = useRef(new Map<string, THREE.Group>());
  const { scene } = useThree();
  const foam = useRef<BoatFoam | null>(null);
  if (!foam.current) foam.current = new BoatFoam(scene);

  useEffect(() => {
    foam.current!.sync(players.map((p) => p.id));
  }, [players]);
  useEffect(() => () => foam.current?.dispose(), []);

  useFrame((_, dt) => {
    const sample = sampleWorld(performance.now());
    const now = performance.now() / 1000;
    for (const [id, g] of groups.current) {
      const e = sample.ents.get(id);
      if (e) {
        g.visible = true;
        g.position.set(e.x, e.y, e.z);
        g.quaternion.set(e.qx, e.qy, e.qz, e.qw);
        if (id === myId) {
          localBoat.present = true;
          localBoat.x = e.x;
          localBoat.y = e.y;
          localBoat.z = e.z;
          localBoat.qx = e.qx;
          localBoat.qy = e.qy;
          localBoat.qz = e.qz;
          localBoat.qw = e.qw;
        }
        const cr = cannonRefs.current.get(id);
        if (cr && id !== myId) cr.rotation.y = e.ay + Math.PI;

        foam.current!.update(id, e.x, e.y, e.z, e.qx, e.qy, e.qz, e.qw,
          (e.flags & FLAG_ALIVE) !== 0, dt, now);
      } else {
        g.visible = false;
      }
    }
    const arr = [...sample.balls.values()];
    for (let i = 0; i < balls.current.length; i++) {
      const m = balls.current[i];
      if (!m) continue;
      if (i < arr.length) {
        m.visible = true;
        m.position.set(arr[i][0], arr[i][1], arr[i][2]);
      } else {
        m.visible = false;
      }
    }
  });

  return (
    <>
      {players.map((p) => (
        <group
          key={p.id}
          ref={(g) => {
            if (g) groups.current.set(p.id, g);
            else groups.current.delete(p.id);
          }}
        >
          <Boat
            color={p.color}
            name={p.name}
            lives={p.lives}
            sunk={!p.alive}
            showLabel
            isLocal={p.id === myId}
            taunt={taunts[p.id]}
            cannonYawRef={p.id !== myId ? (g: THREE.Group | null) => {
              if (g) cannonRefs.current.set(p.id, g);
              else cannonRefs.current.delete(p.id);
            } : undefined}
          />
        </group>
      ))}
      {Array.from({ length: BALL_POOL }).map((_, i) => (
        <mesh
          key={i}
          visible={false}
          ref={(m) => {
            balls.current[i] = m as THREE.Mesh | null;
          }}
        >
          <sphereGeometry args={[CANNON.ballRadius, 8, 8]} />
          <meshStandardMaterial color="#15110d" roughness={0.5} metalness={0.3} />
        </mesh>
      ))}
    </>
  );
}

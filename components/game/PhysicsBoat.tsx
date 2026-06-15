"use client";
import { useCallback, useEffect, useRef } from "react";
import * as THREE from "three";
import { RigidBody, CuboidCollider, type RapierRigidBody } from "@react-three/rapier";
import { useFrame } from "@react-three/fiber";
import { Boat } from "./Boat";
import { hostState } from "../../game/sim/hostState";
import { hostInputs } from "../../game/net/hostInputs";
import { BOAT } from "../../lib/constants";
import type { PlayerMeta } from "../../game/net/protocol";

export function PhysicsBoat({
  player,
  selfId,
  pos,
  yaw,
  quat,
  taunt,
}: {
  player: PlayerMeta;
  selfId: string;
  pos: [number, number, number];
  yaw: number;
  quat?: [number, number, number, number];
  taunt?: string;
}) {
  const ref = useRef<RapierRigidBody | null>(null);
  // takeover: seed the body at the snapshot's full orientation; else upright + yaw
  const rotation = useRef<[number, number, number]>(
    quat
      ? (() => {
          const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion(quat[0], quat[1], quat[2], quat[3]));
          return [e.x, e.y, e.z];
        })()
      : [0, yaw, 0]
  ).current;

  const setRef = useCallback(
    (b: RapierRigidBody | null) => {
      ref.current = b;
      if (b) {
        hostState.bodies.set(player.id, b);
        hostState.ensure(player.id);
      }
    },
    [player.id]
  );

  useEffect(() => {
    const id = player.id;
    return () => {
      hostState.bodies.delete(id);
    };
  }, [player.id]);

  useEffect(() => {
    if (!player.alive) ref.current?.setEnabled(false);
  }, [player.alive]);

  const cannonRef = useRef<THREE.Group>(null);
  useFrame(() => {
    if (player.id !== selfId && cannonRef.current) {
      cannonRef.current.rotation.y = (hostInputs.get(player.id)?.aimYaw ?? 0) + Math.PI;
    }
  });

  return (
    <RigidBody
      ref={setRef}
      colliders={false}
      position={pos}
      rotation={rotation}
      linearDamping={BOAT.linDamp}
      angularDamping={BOAT.angDamp}
      canSleep={false}
      ccd
      userData={{ kind: "boat", id: player.id }}
      onCollisionEnter={({ other }) => {
        const ud = other.rigidBody?.userData as { kind?: string; id?: string } | undefined;
        if (ud?.kind === "boat" && ud.id && player.id < ud.id) {
          hostState.onRam(player.id, ud.id);
        }
      }}
    >
      <CuboidCollider args={[BOAT.half.x, BOAT.half.y, BOAT.half.z]} density={BOAT.mass / (BOAT.half.x * BOAT.half.y * BOAT.half.z * 8)} />
      <Boat
        color={player.color}
        name={player.name}
        lives={player.lives}
        maxLives={hostState.startLives}
        sunk={!player.alive}
        connected={player.connected !== false}
        showLabel
        isLocal={player.id === selfId}
        taunt={taunt}
        cannonYawRef={player.id !== selfId ? cannonRef : undefined}
      />
    </RigidBody>
  );
}

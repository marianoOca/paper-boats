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
  taunt,
}: {
  player: PlayerMeta;
  selfId: string;
  pos: [number, number, number];
  yaw: number;
  taunt?: string;
}) {
  const ref = useRef<RapierRigidBody | null>(null);

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
      rotation={[0, yaw, 0]}
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
        showLabel
        isLocal={player.id === selfId}
        taunt={taunt}
        cannonYawRef={player.id !== selfId ? cannonRef : undefined}
      />
    </RigidBody>
  );
}

"use client";
import { useCallback, useEffect } from "react";
import { RigidBody, type RapierRigidBody } from "@react-three/rapier";
import { hostState, type BallSpec } from "../../game/sim/hostState";
import { CANNON } from "../../lib/constants";

export function HostBall({ spec, onDone }: { spec: BallSpec; onDone: (id: string) => void }) {
  const setRef = useCallback(
    (b: RapierRigidBody | null) => {
      if (b) hostState.ballBodies.set(spec.id, b);
    },
    [spec.id]
  );

  useEffect(() => {
    const id = spec.id;
    const t = setTimeout(() => onDone(id), CANNON.ballLifeMs);
    return () => {
      clearTimeout(t);
      hostState.ballBodies.delete(id);
    };
  }, [spec.id, onDone]);

  return (
    <RigidBody
      ref={setRef}
      colliders="ball"
      position={spec.origin}
      linearVelocity={spec.vel}
      ccd
      canSleep={false}
      userData={{ kind: "ball", id: spec.id, ownerId: spec.ownerId }}
      onCollisionEnter={({ other }) => {
        const ud = other.rigidBody?.userData as
          | { kind?: string; id?: string }
          | undefined;
        if (ud?.kind === "boat") {
          if (ud.id && ud.id !== spec.ownerId) {
            const ball = hostState.ballBodies.get(spec.id);
            if (ball) hostState.onBallHit(spec.ownerId, ud.id, ball);
            onDone(spec.id);
          }
          // hitting the owner: ignore, let it pass
        } else {
          onDone(spec.id); // wall / floor
        }
      }}
    >
      <mesh castShadow>
        <sphereGeometry args={[CANNON.ballRadius, 8, 8]} />
        <meshStandardMaterial color="#15110d" roughness={0.5} metalness={0.3} />
      </mesh>
    </RigidBody>
  );
}

"use client";
import { Billboard } from "@react-three/drei";
import { Ocean } from "./Ocean";
import { Bucket } from "./Bucket";
import { Waterfall } from "./Waterfall";
import { HostWorld } from "./HostWorld";
import { ClientBoats } from "./ClientBoats";
import { CameraRig } from "./CameraRig";
import { EventFX } from "./EventFX";
import { TrajectoryPreview } from "./TrajectoryPreview";
import { useLobbyStore, selectIsHost } from "../../game/state/lobbyStore";

// Direction matches directional light [40, 60, 20] — pushed far away.
const SUN_POS: [number, number, number] = [320, 480, 160];

function Sun() {
  return (
    <Billboard position={SUN_POS} follow={true}>
      {/* soft glow halo behind the disc */}
      <mesh position={[0, 0, -1]}>
        <planeGeometry args={[72, 72]} />
        <meshBasicMaterial color="#fff8c0" transparent opacity={0.18} depthWrite={false} />
      </mesh>
      {/* Minecraft-style square sun */}
      <mesh>
        <planeGeometry args={[46, 46]} />
        <meshBasicMaterial color="#fffacc" />
      </mesh>
    </Billboard>
  );
}

const SKY = "#6ab0e8";

export function Scene() {
  const isHost = useLobbyStore(selectIsHost);
  const arenaMode = useLobbyStore((s) => s.settings.arenaMode);
  return (
    <>
      <color attach="background" args={[SKY]} />
      <fog attach="fog" args={[SKY, 80, 200]} />
      <hemisphereLight args={["#c8e4ff", "#2a4a30", 0.65]} />
      <directionalLight position={SUN_POS} intensity={1.3} color="#fff8e0" />
      <ambientLight intensity={0.28} />
      <Sun />
      <Ocean mode={arenaMode} />
      <Bucket mode={arenaMode} />
      <Waterfall />
      {isHost ? <HostWorld /> : <ClientBoats />}
      <TrajectoryPreview />
      <CameraRig />
      <EventFX />
    </>
  );
}

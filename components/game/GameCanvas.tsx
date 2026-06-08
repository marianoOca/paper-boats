"use client";
import { Canvas } from "@react-three/fiber";
import { Scene } from "./Scene";

export function GameCanvas() {
  return (
    <Canvas
      className="pixelated"
      dpr={0.45} // render small, upscale with nearest-neighbour for the pixel look
      gl={{ antialias: false, powerPreference: "high-performance" }}
      camera={{ position: [0, 9, -16], fov: 58, near: 0.1, far: 400 }}
      style={{ position: "fixed", inset: 0, width: "100vw", height: "100vh", touchAction: "none" }}
    >
      <Scene />
    </Canvas>
  );
}

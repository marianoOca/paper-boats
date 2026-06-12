"use client";
import { FONT_MONO, TEXT_SHADOW } from "../../lib/uiStyles";
import { PixelPhone } from "./PixelIcons";
import { useDevice } from "./useDevice";

// Hard block shown to phones held in portrait. Covers everything (mounted in the
// root layout) and auto-dismisses the moment the device is rotated to landscape.
export function OrientationGate() {
  const { isTouch, isPortrait } = useDevice();
  if (!isTouch || !isPortrait) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "grid",
        placeItems: "center",
        background: "radial-gradient(circle at 50% 30%, #1d4a63, #0b1d28)",
        color: "#f3e2bf",
        fontFamily: FONT_MONO,
        textAlign: "center",
        padding: 24,
      }}
    >
      <div>
        <div style={{ animation: "rotate-phone 2.2s ease-in-out infinite", display: "inline-block", marginBottom: 22 }}>
          <PixelPhone size={80} />
        </div>
        <div style={{ fontSize: 24, fontWeight: 800, textShadow: TEXT_SHADOW }}>
          Rotate your device
        </div>
        <div style={{ fontSize: 16, marginTop: 8, opacity: 0.85, textShadow: TEXT_SHADOW }}>
          Turn sideways to landscape to set sail
        </div>
      </div>
    </div>
  );
}

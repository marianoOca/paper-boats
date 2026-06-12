"use client";
import { useEffect, useState } from "react";
import { TEXT_SHADOW } from "../../lib/uiStyles";
import { useDevice } from "./useDevice";

// Mobile-only fullscreen toggle, top-right. Mounted globally (lobby + game).
// Hidden where the Fullscreen API is unavailable (e.g. iPhone Safari).
export function FullscreenButton() {
  const { isTouch } = useDevice();
  const [fs, setFs] = useState(false);
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    setSupported(!!document.documentElement.requestFullscreen);
    const onChange = () => setFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  if (!isTouch || !supported) return null;

  const toggle = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen().catch(() => {});
  };

  return (
    <button
      onClick={toggle}
      aria-label={fs ? "Exit fullscreen" : "Enter fullscreen"}
      style={{
        position: "fixed",
        top: 12,
        right: 12,
        zIndex: 30,
        width: 44,
        height: 44,
        display: "grid",
        placeItems: "center",
        background: "rgba(91,58,26,0.72)",
        border: "2px solid rgba(0,0,0,0.35)",
        borderRadius: 8,
        filter: `drop-shadow(${TEXT_SHADOW})`,
      }}
    >
      <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#f3e2bf" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        {fs ? (
          <>
            <path d="M8 3v3a2 2 0 0 1-2 2H3" />
            <path d="M21 8h-3a2 2 0 0 1-2-2V3" />
            <path d="M3 16h3a2 2 0 0 1 2 2v3" />
            <path d="M16 21v-3a2 2 0 0 1 2-2h3" />
          </>
        ) : (
          <>
            <path d="M8 3H5a2 2 0 0 0-2 2v3" />
            <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
            <path d="M3 16v3a2 2 0 0 0 2 2h3" />
            <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
          </>
        )}
      </svg>
    </button>
  );
}

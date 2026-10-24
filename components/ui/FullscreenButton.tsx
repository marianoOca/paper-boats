"use client";
import { useEffect, useState } from "react";
import { FONT_MONO, ICON_BTN, TEXT_SHADOW } from "../../lib/uiStyles";
import { useDevice } from "./useDevice";

// Mobile-only fullscreen toggle, top-right (layout places it). Mounted globally (lobby + game).
// iPhone Safari has no Fullscreen API: there the button explains Add to Home Screen
// (the installed app opens fullscreen, see app/manifest.ts) and hides once installed.
export function FullscreenButton() {
  const { isTouch } = useDevice();
  const [fs, setFs] = useState(false);
  const [supported, setSupported] = useState(false);
  const [iosBrowser, setIosBrowser] = useState(false);
  const [hint, setHint] = useState(false);

  useEffect(() => {
    setSupported(!!document.documentElement.requestFullscreen);
    // `navigator.standalone` exists only on iOS: false in Safari, true when launched from the home screen.
    setIosBrowser((navigator as { standalone?: boolean }).standalone === false);
    const onChange = () => setFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  if (!isTouch || !(supported || iosBrowser)) return null;

  const toggle = () => {
    if (!supported) setHint((h) => !h);
    else if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen().catch(() => {});
  };

  return (
    <>
    {hint && (
      <div
        onClick={() => setHint(false)}
        style={{
          position: "fixed",
          top: 64,
          right: 12,
          zIndex: 30,
          maxWidth: 260,
          padding: "10px 12px",
          background: "rgba(91,58,26,0.92)",
          border: "2px solid rgba(0,0,0,0.35)",
          borderRadius: 8,
          color: "#f3e2bf",
          fontFamily: FONT_MONO,
          fontSize: 14,
          lineHeight: 1.35,
          textShadow: TEXT_SHADOW,
        }}
      >
        For fullscreen, tap Share, then &ldquo;Add to Home Screen&rdquo;, and play from the new icon.
      </div>
    )}
    <button
      onClick={toggle}
      aria-label={fs ? "Exit fullscreen" : "Enter fullscreen"}
      style={ICON_BTN}
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
    </>
  );
}

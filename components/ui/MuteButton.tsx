"use client";
import { useEffect, useState } from "react";
import { ICON_BTN } from "../../lib/uiStyles";
import { isMuted, onMuteChange, setMuted } from "../../game/audio/sfx";

// Sound on/off, top-right (layout places it). Remembered per browser.
export function MuteButton() {
  const [muted, setState] = useState(false);
  useEffect(() => {
    setState(isMuted());
    return onMuteChange(() => setState(isMuted()));
  }, []);

  return (
    <button onClick={() => setMuted(!muted)} aria-label={muted ? "Unmute sound" : "Mute sound"} style={ICON_BTN}>
      <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#f3e2bf" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 5 6 9H2v6h4l5 4V5z" />
        {muted ? (
          <>
            <path d="m22 9-6 6" />
            <path d="m16 9 6 6" />
          </>
        ) : (
          <>
            <path d="M15.5 8.5a5 5 0 0 1 0 7" />
            <path d="M19 5a10 10 0 0 1 0 14" />
          </>
        )}
      </svg>
    </button>
  );
}

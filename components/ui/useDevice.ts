"use client";
import { useEffect, useState } from "react";

// Touch-capability + orientation, derived from media queries. Both start false so
// the server render and first client paint match (no hydration mismatch); the
// real values arrive in the effect. `isTouch` keys off the primary pointer being
// coarse — a touch laptop driven by its trackpad keeps the desktop controls.
export function useDevice() {
  const [state, setState] = useState({ isTouch: false, isPortrait: false });

  useEffect(() => {
    const coarse = window.matchMedia("(pointer: coarse)");
    const portrait = window.matchMedia("(orientation: portrait)");
    const update = () => setState({ isTouch: coarse.matches, isPortrait: portrait.matches });
    update();
    coarse.addEventListener("change", update);
    portrait.addEventListener("change", update);
    return () => {
      coarse.removeEventListener("change", update);
      portrait.removeEventListener("change", update);
    };
  }, []);

  return state;
}

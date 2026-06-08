"use client";
import { useEffect, useState } from "react";

/** Forces a re-render every `ms` for time-based HUD elements. */
export function useTick(ms: number) {
  const [, set] = useState(0);
  useEffect(() => {
    const i = setInterval(() => set((v) => (v + 1) % 1e9), ms);
    return () => clearInterval(i);
  }, [ms]);
}

import type { CSSProperties } from "react";

// Shared UI style atoms. Only the bits that are byte-identical across screens
// live here; per-site differences (padding, gradients, transforms) stay inline.

export const FONT_MONO = "ui-monospace, monospace";
export const TEXT_SHADOW = "2px 2px 0 #000";

// Parchment card used by the landing and leaderboard screens.
export const PANEL: CSSProperties = {
  background: "var(--parchment)",
  color: "var(--ink)",
  border: "4px solid var(--wood)",
  borderRadius: 10,
  boxShadow: "0 12px 0 rgba(0,0,0,0.3)",
};

// Pirate button base. Callers pass per-site overrides (padding, cursor,
// fontFamily, flex) so each call renders exactly as before.
export const pirateBtn = (bg: string, extra?: CSSProperties): CSSProperties => ({
  background: bg,
  color: "#f3e2bf",
  border: "2px solid rgba(0,0,0,0.3)",
  borderRadius: 6,
  fontWeight: 700,
  ...extra,
});

// Parchment text input (landing + name gate). Caller adds width where needed.
export const INPUT: CSSProperties = {
  padding: "12px 14px",
  fontSize: 18,
  fontFamily: "inherit",
  border: "3px solid var(--wood)",
  borderRadius: 6,
  background: "#fff7e6",
  color: "var(--ink)",
};

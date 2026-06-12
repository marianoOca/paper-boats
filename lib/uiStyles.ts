import type { CSSProperties } from "react";

// Shared UI style atoms. Only the bits that are byte-identical across screens
// live here; per-site differences (padding, gradients, transforms) stay inline.

export const FONT_MONO = "ui-monospace, monospace";
export const TEXT_SHADOW = "2px 2px 0 #000";
export const PIRATE_GOLD = "#d4a84b"; // treasure gold — ready/active/highlight
export const WOOD_ACTIVE = "#7a5218"; // dark amber — selected toggle state

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
  border: "2px solid #2a1a0a",
  borderRadius: 6,
  fontWeight: 700,
  boxShadow: "0 4px 0 rgba(0,0,0,0.4)",
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

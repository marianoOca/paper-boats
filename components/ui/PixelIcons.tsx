import type { CSSProperties, ReactElement } from "react";
import { PIRATE_GOLD } from "../../lib/uiStyles";

// Multi-color pixel art renderer.
// grid: string[] where each char maps to a color via colorMap; '.' = transparent.
function px(
  grid: string[],
  colorMap: Record<string, string>,
  size: number,
  style?: CSSProperties,
) {
  const w = grid[0].length;
  const h = grid.length;
  const rects: ReactElement[] = [];
  grid.forEach((row, y) =>
    [...row].forEach((c, x) => {
      const color = colorMap[c];
      if (color) rects.push(<rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={color} />);
    }),
  );
  return (
    <svg
      width={(size * w) / h}
      height={size}
      viewBox={`0 0 ${w} ${h}`}
      shapeRendering="crispEdges"
      style={{ verticalAlign: "-0.18em", filter: "drop-shadow(1px 1px 0 #000)", ...style }}
    >
      {rects}
    </svg>
  );
}

const INK = "#2a1a0a"; // outline
const IVORY = "#f3e2bf"; // parchment / sail — default fill
const GOLD = PIRATE_GOLD; // treasure gold — single source in uiStyles
const GOLD_HI = "#ffe09a"; // gold highlight
const GOLD_MID = "#e8b94a"; // gold accent (jewels, sand)

// Lighten (amt > 0) or darken (amt < 0) a hex color, so highlights/shadows
// always match whatever `color` prop is passed in.
function shade(hex: string, amt: number): string {
  const n = hex.replace("#", "");
  const full = n.length === 3 ? [...n].map((c) => c + c).join("") : n.slice(0, 6);
  const ch = (i: number) => {
    const v = parseInt(full.slice(i, i + 2), 16);
    const t = amt > 0 ? v + (255 - v) * amt : v * (1 + amt);
    return Math.max(0, Math.min(255, Math.round(t)))
      .toString(16)
      .padStart(2, "0");
  };
  return `#${ch(0)}${ch(2)}${ch(4)}`;
}

// ─── Pixel grids ─────────────────────────────────────────────────────────────
// '#' = ink outline, 'o' = mid fill, '+' = highlight, '-' = shadow,
// '*' = accent, '~' = water, 'r' = ribbon

const ANCHOR_GRID = [
  "................",
  "......####......",
  ".....##..##.....",
  ".....#....#.....",
  ".....##..##.....",
  "......####......",
  ".......##.......",
  "...##########...",
  ".......##.......",
  ".......##.......",
  ".......##.......",
  "..#....##....#..",
  "..##...##...##..",
  "..##..####..##..",
  "...##########...",
  ".....######.....",
];

const CROWN_GRID = [
  "................",
  "................",
  "................",
  ".##....##....##.",
  "#*#...#o+#...#o#",
  "#*#...#o+#...#o#",
  "#**#..#o+#..#oo#",
  "#**#..#o+#..#oo#",
  "#***##oo++##ooo#",
  "#****ooo++ooooo#",
  "#****ooo++ooooo#",
  "#--------------#",
  "#****ooo++ooooo#",
  "################",
  "................",
  "................",
];


const HOURGLASS_GRID = [
  "###############.",
  "#ooooooooooooo#.",
  ".#ooooooooooo#..",
  "..#oooooo***#...",
  "...#oo*****#....",
  "....#*****#.....",
  ".....#***#......",
  "......#*#.......",
  "......#o#.......",
  ".....#ooo#......",
  "....#oo*oo#.....",
  "...#ooo*ooo#....",
  "..#oooo***oo#...",
  ".#ooo******oo#..",
  "#oo*********oo#.",
  "###############.",
];

export const HEART_GRID = [
  "................",
  "...###....###...",
  "..#++o#..#ooo#..",
  ".#+++oo##ooooo#.",
  ".#+ooooooooooo#.",
  ".#+oooooooooo-#.",
  ".#ooooooooooo-#.",
  "..#ooooooooo-#..",
  "...#ooooooo-#...",
  "....#ooooo-#....",
  ".....#ooo-#.....",
  "......#o-#......",
  ".......##.......",
  "................",
  "................",
  "................",
];

const BOAT_GRID = [
  "................",
  "..........*......",
  "........#*......",
  ".......#+#......",
  ".......#+#......",
  "......#++o#.....",
  "......#++o#.....",
  ".....#+++oo#....",
  "####.#+++oo#####",
  ".#+o########oo#.",
  ".#oooooooooooo#.",
  "..#oooooooooo#..",
  "..#----------#..",
  "...##########...",
  "................",
  "................",
];

const CANNON_GRID = [
  "................",
  "................",
  ".....#r.........",
  ".....#r.....##..",
  ".############+#.",
  "#++++++++++#+-o#",
  "#ooooooooo#+---#",
  "#ooooooooo#+---#",
  "#---##--##-#o-o#",
  ".####r##r####o#.",
  "...##r*rr#..##..",
  "..##rrrr*#......",
  ".##*rrrr*#......",
  "##########......",
  "................",
  "................",
];

const PHONE_GRID = [
  "....########....",
  "...#oo####oo#...",
  "...#o++++++o#...",
  "...#o****++o#...",
  "...#o++++++o#...",
  "...#o+**+++o#...",
  "...#o++++++o#...",
  "...#o+***++o#...",
  "...#o++++++o#...",
  "...#o****++o#...",
  "...#o++++++o#...",
  "...#o++++++o#...",
  "...#oooooooo#...",
  "...#oo#++#oo#...",
  "....########....",
  "................",
];

const MEDAL_GRID = [
  "...---....rrr...",
  "....---..rrr....",
  ".....---rrr.....",
  "......-rrr......",
  ".....######.....",
  "...##******##...",
  "..#**oooooo**#..",
  "..#*oooooooo*#..",
  "..#*oooooooo*#..",
  "..#*oooooooo*#..",
  "..#*oooooooo*#..",
  "..#*oooooooo*#..",
  "..#**oooooo**#..",
  "...##******##...",
  ".....######.....",
  "................",
];

// 4x5 rank digits, stamped into the medal face.
const MEDAL_DIGITS: Record<number, string[]> = {
  1: [".#..", "##..", ".#..", ".#..", "###."],
  2: ["####", "...#", "####", "#...", "####"],
  3: ["####", "...#", ".###", "...#", "####"],
};

// ─── Exported components ──────────────────────────────────────────────────────

export function PixelAnchor({ size = 20, color = IVORY }: { size?: number; color?: string }) {
  return px(ANCHOR_GRID, { "#": INK, o: color, "+": shade(color, 0.5) }, size);
}

export function PixelCrown({ size = 14 }: { size?: number }) {
  return px(CROWN_GRID, { "#": INK, o: GOLD, "+": GOLD_HI, "*": GOLD_MID }, size);
}

export function PixelHourglass({ size = 20, color = IVORY }: { size?: number; color?: string }) {
  return px(
    HOURGLASS_GRID,
    { "#": INK, o: color, "+": shade(color, 0.5), "*": GOLD_MID },
    size,
  );
}

export function PixelHeart({ size = 16, color = "#e6433f" }: { size?: number; color?: string }) {
  const empty = color.startsWith("#0000");
  return px(
    HEART_GRID,
    {
      "#": INK,
      o: color,
      "+": empty ? color : shade(color, 0.55),
      "-": empty ? color : shade(color, -0.3),
    },
    size,
  );
}

export function PixelBoat({ size = 26, color = IVORY }: { size?: number; color?: string }) {
  return px(
    BOAT_GRID,
    {
      "#": INK,
      o: color,
      "+": shade(color, 0.5),
      "-": shade(color, -0.25),
      "*": "#b5443c",
    },
    size,
  );
}

export function PixelCannon({ size = 32 }: { size?: number }) {
  return px(
    CANNON_GRID,
    {
      "#": INK,
      o: "#3d4258", // navy barrel
      "+": "#5c647f", // barrel highlight / muzzle rim
      "-": "#262a3b", // barrel shadow / muzzle opening
      r: "#c96a2e", // brick carriage
      "*": "#e0913f", // brick highlight
    },
    size,
  );
}

export function PixelPhone({ size = 80, style }: { size?: number; style?: CSSProperties }) {
  return px(
    PHONE_GRID,
    { "#": INK, o: "#5a3a1a", "+": IVORY, "*": "#2e7d4f" },
    size,
    style,
  );
}

const MEDAL_SHADES: Record<number,{ o: string; mid: string; hi: string; rb: string; rd: string }> = {
  1: { o: "#ffd700", mid: "#caa200", hi: "#fff3b0", rb: "#e23c32", rd: "#9e1f1a" }, // gold, red ribbon
  2: { o: "#cdd2d8", mid: "#8e969f", hi: "#ffffff", rb: "#2f6fd0", rd: "#173f8a" }, // silver, blue ribbon
  3: { o: "#cd7f32", mid: "#9c5e22", hi: "#f0b074", rb: "#2aa64a", rd: "#15672c" }, // bronze, green ribbon
};

function stamp(base: string[], mark: string[], ox: number, oy: number, ch: string): string[] {
  return base.map((row, y) => {
    const sy = y - oy;
    if (sy < 0 || sy >= mark.length) return row;
    return [...row]
      .map((c, x) => {
        const sx = x - ox;
        return sx >= 0 && sx < mark[sy].length && mark[sy][sx] === "#" ? ch : c;
      })
      .join("");
  });
}

export function PixelMedal({ rank, size = 18 }: { rank: number; size?: number }) {
  const s = MEDAL_SHADES[rank];
  const digit = MEDAL_DIGITS[rank];
  if (!s || !digit) return null;
  // mid-tone shadow offset by 1px, light digit on top — embossed look
  const grid = stamp(stamp(MEDAL_GRID, digit, 7, 8, "*"), digit, 6, 7, "+");
  return px(grid, { "#": INK, o: s.o, "*": s.mid, "+": s.hi, r: s.rb, "-": s.rd }, size);
}

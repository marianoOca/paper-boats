import { HEART_GRID } from "./ui/PixelIcons";

export function Heart() {
  const color = "#fff";
  const w = HEART_GRID[0].length;
  const h = HEART_GRID.length;
  const rects: React.ReactElement[] = [];
  HEART_GRID.forEach((row, y) =>
    [...row].forEach((c, x) => {
      if (c !== ".") rects.push(<rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} />);
    }),
  );
  return (
    <svg width={(16 * w) / h} height={16} viewBox={`0 0 ${w} ${h}`} shapeRendering="crispEdges" fill={color} style={{ display: "inline-block", filter: "drop-shadow(1px 1px 0 #0006)" }}>
      {rects}
    </svg>
  );
}

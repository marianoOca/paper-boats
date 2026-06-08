export function Heart({ filled = false }: { filled?: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" style={{ display: "inline-block" }}>
      <style>{`
        .heart-fill { fill: ${filled ? "#e6433f" : "#e6e1d2"}; }
        .heart-stroke { stroke: ${filled ? "#8b0000" : "#6b4423"}; }
      `}</style>
      <g className="heart-stroke" strokeWidth="0.5" fill="none" vectorEffect="non-scaling-stroke">
        <path
          d="M8 14L2 8.5C0.5 7 0 5.5 0 4.5C0 2 2 0 4 0C5 0 6 0.5 8 2C10 0.5 11 0 12 0C14 0 16 2 16 4.5C16 5.5 15.5 7 14 8.5L8 14Z"
          className="heart-fill"
        />
      </g>
    </svg>
  );
}

import React, { useMemo, useState } from "react";

/**
 * Minimal hand-rolled SVG sparkline (no chart library).
 *
 * Props:
 *   samples:   [{ sample_date: "YYYY-MM-DD", value: number|null, ... }]
 *   width / height: SVG dimensions (default 240 × 80)
 *   color:     line color
 *   unitLabel: shown top-right (e.g. "mg/L")
 */
function Sparkline({
  samples,
  width = 240,
  height = 80,
  color = "#2f4858",
  unitLabel = "",
}) {
  const [hoverIdx, setHoverIdx] = useState(null);

  const { points, vMin, vMax, dateMin, dateMax } = useMemo(() => {
    const pts = (samples || [])
      .filter((s) => s && s.value != null && !Number.isNaN(s.value))
      .map((s) => ({ d: s.sample_date, v: Number(s.value) }))
      .filter((s) => s.d);
    if (pts.length === 0) {
      return { points: [], vMin: 0, vMax: 0, dateMin: null, dateMax: null };
    }
    pts.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
    let vmin = pts[0].v;
    let vmax = pts[0].v;
    for (const p of pts) {
      if (p.v < vmin) vmin = p.v;
      if (p.v > vmax) vmax = p.v;
    }
    return {
      points: pts,
      vMin: vmin,
      vMax: vmax,
      dateMin: pts[0].d,
      dateMax: pts[pts.length - 1].d,
    };
  }, [samples]);

  if (points.length === 0) {
    return (
      <div
        style={{
          width,
          height,
          fontSize: 12,
          color: "var(--ink-4)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: "1px dashed var(--hairline-strong)",
          borderRadius: 6,
        }}
      >
        No data
      </div>
    );
  }

  const padX = 6;
  const padY = 8;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;
  const vRange = vMax - vMin || 1;

  // Index-based x mapping (not real date spacing) — data is sparse, even
  // distribution reads more cleanly
  const xs = points.map((_, i) =>
    points.length === 1
      ? padX + innerW / 2
      : padX + (i / (points.length - 1)) * innerW,
  );
  const ys = points.map(
    (p) => padY + innerH - ((p.v - vMin) / vRange) * innerH,
  );

  const pathD = points
    .map((_, i) => `${i === 0 ? "M" : "L"} ${xs[i].toFixed(1)} ${ys[i].toFixed(1)}`)
    .join(" ");

  const hover = hoverIdx != null ? points[hoverIdx] : null;

  return (
    <div style={{ position: "relative", width, height }}>
      <svg
        width={width}
        height={height}
        style={{ display: "block", overflow: "visible" }}
        onMouseLeave={() => setHoverIdx(null)}
      >
        {/* min / max guide lines */}
        <line
          x1={padX}
          x2={width - padX}
          y1={padY}
          y2={padY}
          stroke="rgba(0,0,0,0.08)"
          strokeDasharray="2 3"
        />
        <line
          x1={padX}
          x2={width - padX}
          y1={height - padY}
          y2={height - padY}
          stroke="rgba(0,0,0,0.08)"
          strokeDasharray="2 3"
        />
        {/* Polyline */}
        <path d={pathD} fill="none" stroke={color} strokeWidth={1.5} />
        {/* Invisible hit-rects for hover */}
        {points.map((_, i) => (
          <rect
            key={i}
            x={i === 0 ? 0 : (xs[i] + xs[i - 1]) / 2}
            y={0}
            width={
              i === 0
                ? (xs[1] || width) / 2
                : i === points.length - 1
                  ? width - (xs[i] + xs[i - 1]) / 2
                  : (xs[i + 1] - xs[i - 1]) / 2
            }
            height={height}
            fill="transparent"
            onMouseEnter={() => setHoverIdx(i)}
          />
        ))}
        {/* hover dot */}
        {hoverIdx != null ? (
          <circle
            cx={xs[hoverIdx]}
            cy={ys[hoverIdx]}
            r={3}
            fill={color}
            stroke="#fff"
            strokeWidth={1.5}
          />
        ) : null}
      </svg>
      {/* Corner annotations */}
      <div
        style={{
          position: "absolute",
          top: 0,
          right: 2,
          fontSize: 10,
          color: "var(--ink-4)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        max {vMax.toFixed(2)} {unitLabel}
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 0,
          right: 2,
          fontSize: 10,
          color: "var(--ink-4)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        min {vMin.toFixed(2)}
      </div>
      <div
        style={{
          position: "absolute",
          bottom: -16,
          left: 2,
          right: 2,
          display: "flex",
          justifyContent: "space-between",
          fontSize: 10,
          color: "var(--ink-4)",
        }}
      >
        <span>{dateMin}</span>
        <span>{dateMax}</span>
      </div>
      {/* hover tooltip */}
      {hover ? (
        <div
          style={{
            position: "absolute",
            top: -4,
            left: 4,
            fontSize: 11,
            color: "var(--ink)",
            background: "var(--surface-strong)",
            padding: "1px 5px",
            borderRadius: 4,
            border: "1px solid var(--hairline)",
            pointerEvents: "none",
          }}
        >
          {hover.d}: <strong>{hover.v.toFixed(2)}</strong> {unitLabel}
        </div>
      ) : null}
    </div>
  );
}

export default Sparkline;

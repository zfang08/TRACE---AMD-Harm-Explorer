import React from "react";

function StatusBar({ lng, lat, zoom, featureCount }) {
  const latStr = `${Math.abs(lat).toFixed(3)}°${lat >= 0 ? "N" : "S"}`;
  const lngStr = `${Math.abs(lng).toFixed(3)}°${lng >= 0 ? "E" : "W"}`;

  return (
    <div
      className="font-mono surface"
      style={{
        position: "absolute",
        top: 14,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 5,
        padding: "5px 13px",
        borderRadius: 999,
        fontSize: 10,
        color: "var(--ink-2)",
        letterSpacing: "0.02em",
        display: "flex",
        alignItems: "center",
        gap: 10,
        pointerEvents: "none",
        userSelect: "none",
        whiteSpace: "nowrap",
      }}
    >
      <span>{latStr} · {lngStr}</span>
      <span style={{ color: "var(--hairline-strong)", fontSize: 9 }}>|</span>
      <span>z {zoom.toFixed(1)}</span>
      {featureCount > 0 && (
        <>
          <span style={{ color: "var(--hairline-strong)", fontSize: 9 }}>|</span>
          <span style={{ color: "var(--ink-3)" }}>
            ◐ {featureCount.toLocaleString()}
          </span>
        </>
      )}
    </div>
  );
}

export default StatusBar;

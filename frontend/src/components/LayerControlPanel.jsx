import React, { useState } from "react";

/**
 * Floating top-right layer + legend panel.
 *
 * props:
 *   visibleLayers: { collieries, stations, sources, streams }
 *   onChange: (next) => void
 *   counts:   { collieries, stations, sources, streams }
 *   is3D, onToggle3D — pure camera tilt control
 */

const LAYER_LEGENDS = {
  collieries: {
    label: "Collieries",
    shape: "house",
    description: "PA DEP coal mining permit points",
    chips: [
      { color: "#1e293b", label: "Active" },
      { color: "#94a3b8", label: "Inactive" },
      { color: "#475569", label: "Abandoned" },
      { color: "#65a30d", label: "Reclaimed" },
      { color: "#e2e8f0", label: "Proposed" },
    ],
  },
  stations: {
    label: "Stations",
    shape: "diamond",
    description: "USGS NWIS + EPA WQP",
    chips: [
      { color: "#5b21b6", label: "WQP + NWIS" },
      { color: "#a78bfa", label: "Single source" },
    ],
  },
  sources: {
    label: "AMD discharge",
    shape: "droplet",
    description: "PA DEP AML inventory · severity from data",
    chips: [
      { color: "#7f1d1d", label: "Extreme" },
      { color: "#b91c1c", label: "High" },
      { color: "#dc2626", label: "Medium" },
      { color: "#fda4af", label: "Low" },
    ],
  },
  streams: {
    label: "Streams",
    shape: "line",
    description: "USGS NHD HR flowlines",
    chips: [{ color: "#94a3b8", label: "Stream / artificial path" }],
  },
};

// SVG chip: viewBox 22×22, same coordinate system as MapView.makeShapeIcon,
// rendered at 13 px on screen.
const SVG_SIZE = 13;
const STROKE = "rgba(15,23,42,0.45)";

function Chip({ color, shape = "circle" }) {
  const common = {
    display: "inline-block",
    marginRight: 4,
    verticalAlign: "middle",
    flex: "none",
  };

  if (shape === "house") {
    return (
      <svg width={SVG_SIZE} height={SVG_SIZE} viewBox="0 0 22 22" style={common}>
        <path
          d="M4 19.4 L4 12.1 L11 4 L18 12.1 L18 19.4 Z"
          fill={color}
          stroke={STROKE}
          strokeWidth="1"
          strokeLinejoin="round"
        />
        <rect
          x="13.6"
          y="5.5"
          width="2.2"
          height="3.3"
          fill={color}
          stroke={STROKE}
          strokeWidth="0.8"
        />
      </svg>
    );
  }

  if (shape === "diamond") {
    return (
      <svg width={SVG_SIZE} height={SVG_SIZE} viewBox="0 0 22 22" style={common}>
        <polygon
          points="11,2.2 19.8,11 11,19.8 2.2,11"
          fill={color}
          stroke={STROKE}
          strokeWidth="1"
          strokeLinejoin="round"
        />
        <circle cx="11" cy="11" r="2.2" fill="#ffffff" />
      </svg>
    );
  }

  if (shape === "droplet") {
    return (
      <svg width={SVG_SIZE} height={SVG_SIZE} viewBox="0 0 22 22" style={common}>
        <path
          d="M11 2.2 C17.8 8 17.8 16.5 11 20.2 C4.2 16.5 4.2 8 11 2.2 Z"
          fill={color}
          stroke={STROKE}
          strokeWidth="1"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (shape === "line") {
    return (
      <span
        style={{
          ...common,
          width: 14,
          height: 3,
          background: color,
          borderRadius: 2,
        }}
      />
    );
  }

  // fallback circle
  return (
    <span
      style={{
        ...common,
        width: 10,
        height: 10,
        borderRadius: "50%",
        background: color,
        border: `1px solid ${STROKE}`,
      }}
    />
  );
}

function LayerRow({ layerKey, on, count, onChange }) {
  const meta = LAYER_LEGENDS[layerKey];
  return (
    <div
      style={{
        padding: "8px 10px",
        borderTop: "1px solid rgba(15,23,42,0.06)",
      }}
    >
      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          cursor: "pointer",
          fontSize: 12,
          fontWeight: 500,
          letterSpacing: "0.02em",
        }}
      >
        <input
          type="checkbox"
          checked={on}
          onChange={(e) => onChange(layerKey, e.target.checked)}
          style={{ cursor: "pointer" }}
        />
        <span style={{ flex: 1 }}>{meta.label}</span>
        <span
          style={{
            color: "#94a3b8",
            fontWeight: 400,
            fontVariantNumeric: "tabular-nums",
            fontStyle: "italic",
          }}
        >
          {count?.toLocaleString?.() ?? count}
        </span>
      </label>
      <div
        style={{
          fontSize: 10,
          fontStyle: "italic",
          color: "#94a3b8",
          marginTop: 3,
          marginLeft: 22,
          marginBottom: 6,
          letterSpacing: "0.02em",
        }}
      >
        {meta.description}
      </div>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 6,
          marginLeft: 22,
          fontSize: 10,
          color: "#475569",
        }}
      >
        {meta.chips.map((c) => (
          <span key={c.label} style={{ whiteSpace: "nowrap" }}>
            <Chip color={c.color} shape={meta.shape} />
            {c.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function ViewModeRow({ is3D, onToggle3D }) {
  const btn = (active) => ({
    flex: 1,
    background: active ? "#1e293b" : "transparent",
    color: active ? "#f8fafc" : "#475569",
    border: "1px solid rgba(15,23,42,0.15)",
    padding: "6px 0",
    fontSize: 11,
    fontWeight: 500,
    letterSpacing: "0.16em",
    cursor: "pointer",
    borderRadius: 6,
    fontFamily: "inherit",
    transition: "background 150ms ease, color 150ms ease",
  });
  return (
    <div
      style={{
        padding: "8px 10px",
        borderBottom: "1px solid rgba(15,23,42,0.06)",
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          color: "#475569",
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          marginBottom: 8,
        }}
      >
        View
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <button
          type="button"
          onClick={() => onToggle3D?.(false)}
          style={btn(!is3D)}
        >
          2D
        </button>
        <button
          type="button"
          onClick={() => onToggle3D?.(true)}
          style={btn(is3D)}
        >
          3D
        </button>
      </div>
    </div>
  );
}

function LayerControlPanel({
  visibleLayers,
  onChange,
  counts,
  is3D,
  onToggle3D,
}) {
  const [collapsed, setCollapsed] = useState(false);

  const setLayer = (layer, on) => {
    onChange({ ...visibleLayers, [layer]: on });
  };

  return (
    <div
      style={{
        position: "absolute",
        top: 12,
        right: 12,
        zIndex: 5,
        width: collapsed ? "auto" : 240,
        background: "rgba(248,250,252,0.94)", // slate-50 透明
        border: "1px solid rgba(15,23,42,0.08)",
        borderRadius: 8,
        boxShadow:
          "0 1px 2px rgba(15,23,42,0.04), 0 8px 24px rgba(15,23,42,0.08)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        fontSize: 12,
        color: "#0f172a",
        overflow: "hidden",
        letterSpacing: "0.01em",
      }}
    >
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        aria-label={collapsed ? "Expand layer panel" : "Collapse layer panel"}
        style={{
          width: "100%",
          background: "transparent",
          border: "none",
          padding: "10px 14px",
          textAlign: "left",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 10,
          fontSize: 12,
          fontWeight: 400,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "#0f172a",
          fontFamily: "inherit",
        }}
      >
        <span style={{ fontSize: 11, color: "#94a3b8" }}>
          {collapsed ? "▸" : "▾"}
        </span>
        <span>Layers</span>
        {!collapsed ? (
          <span
            style={{
              marginLeft: "auto",
              fontSize: 9.5,
              fontWeight: 400,
              fontStyle: "italic",
              color: "#94a3b8",
              letterSpacing: "0.06em",
              textTransform: "none",
            }}
          >
            Legend
          </span>
        ) : null}
      </button>
      {!collapsed ? (
        <div>
          {onToggle3D ? (
            <ViewModeRow is3D={is3D} onToggle3D={onToggle3D} />
          ) : null}
          <LayerRow
            layerKey="collieries"
            on={visibleLayers.collieries}
            count={counts?.collieries}
            onChange={setLayer}
          />
          <LayerRow
            layerKey="stations"
            on={visibleLayers.stations}
            count={counts?.stations}
            onChange={setLayer}
          />
          <LayerRow
            layerKey="sources"
            on={visibleLayers.sources}
            count={counts?.sources}
            onChange={setLayer}
          />
          <LayerRow
            layerKey="streams"
            on={visibleLayers.streams}
            count={counts?.streams}
            onChange={setLayer}
          />
        </div>
      ) : null}
    </div>
  );
}

export default LayerControlPanel;

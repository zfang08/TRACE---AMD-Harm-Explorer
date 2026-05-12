import React, { useEffect, useState } from "react";

/**
 * Floating top-right layer + legend panel.
 *
 * props:
 *   visibleLayers: { collieries, stations, sources, streams }
 *   onChange: (next) => void
 *   counts:   { collieries, stations, sources, streams }
 *   is3D, onToggle3D — pure camera tilt control
 */

const PANEL_WIDTH_EXPANDED = 220;
const PANEL_WIDTH_COLLAPSED = 100;
// 慢一点更稳重，跟镜头入场 (~2.2s) 的节奏对齐；超过 600 会显得拖
const ANIM_MS = 580;
const ANIM_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

const LAYER_LEGENDS = {
  collieries: {
    label: "Collieries",
    shape: "house",
    description: "PA DEP coal mining permit points",
    subFilterKey: "collieryStatus",
    chips: [
      { color: "#0a0a0a", label: "Active",   key: "active"   },
      { color: "#a3a3a3", label: "Inactive", key: "inactive" },
      { color: "#65a30d", label: "Reclaimed", key: "reclaimed" },
    ],
  },
  stations: {
    label: "Stations",
    shape: "diamond",
    description: "USGS NWIS + EPA WQP",
    chips: [
      { color: "#2f4858", label: "WQP + NWIS" },
      { color: "#94a8b6", label: "Single source" },
    ],
  },
  sources: {
    label: "AMD discharge",
    shape: "droplet",
    description: "PA DEP AML inventory · severity from data",
    subFilterKey: "sourceSeverity",
    chips: [
      { color: "#7a1e10", label: "Extreme + High", key: "extremeHigh" },
      { color: "#b9341e", label: "Medium",         key: "medium"      },
      { color: "#fda4af", label: "Low",            key: "low"         },
    ],
  },
  streams: {
    label: "Streams",
    shape: "line",
    description: "USGS NHD HR flowlines",
    chips: [{ color: "#a3a3a3", label: "Stream / artificial path" }],
  },
};

// SVG chip: viewBox 22×22, same coordinate system as MapView.makeShapeIcon,
// rendered at 12 px on screen (TV-friendly tighter scale).
const SVG_SIZE = 12;
const STROKE = "rgba(0, 0, 0, 0.6)";

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
          d="M3.3 19.1 L3.3 11.4 L11 3.5 L18.7 11.4 L18.7 19.1 Z"
          fill={color}
          stroke={STROKE}
          strokeWidth="1"
          strokeLinejoin="round"
        />
        <rect
          x="8.6"
          y="13.6"
          width="4.8"
          height="5.5"
          rx="0.9"
          fill="rgba(255,255,255,0.55)"
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
        <circle cx="11" cy="11" r="4.0" fill="#ffffff" />
      </svg>
    );
  }

  if (shape === "droplet") {
    return (
      <svg width={SVG_SIZE} height={SVG_SIZE} viewBox="0 0 22 22" style={common}>
        <path
          d="M11 1.5 C19.1 7.1 19.1 13.4 11 20.5 C2.9 13.4 2.9 7.1 11 1.5 Z"
          fill={color}
          stroke={STROKE}
          strokeWidth="1"
          strokeLinejoin="round"
        />
        <circle cx="11" cy="9.8" r="2.2" fill="rgba(255,255,255,0.58)" />
      </svg>
    );
  }

  if (shape === "line") {
    return (
      <span
        style={{
          ...common,
          width: 13,
          height: 2.5,
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
        width: 9,
        height: 9,
        borderRadius: "50%",
        background: color,
        border: `1px solid ${STROKE}`,
      }}
    />
  );
}

/* Custom hairline toggle — sits perfectly in the white aesthetic
   (browser checkbox is the giveaway sign of a non-designed UI). */
function HairlineToggle({ on, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      style={{
        width: 24,
        height: 14,
        borderRadius: 999,
        border: `1px solid ${on ? "var(--ink)" : "var(--hairline-strong)"}`,
        background: on ? "var(--ink)" : "transparent",
        position: "relative",
        cursor: "pointer",
        padding: 0,
        transition:
          "background 200ms var(--ease-out), border-color 200ms var(--ease-out)",
        flex: "none",
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 1,
          left: on ? 11 : 1,
          width: 10,
          height: 10,
          borderRadius: 999,
          background: on ? "#fff" : "var(--ink-3)",
          transition: "left 200ms var(--ease-out), background 200ms var(--ease-out)",
        }}
      />
    </button>
  );
}

function LayerRow({ layerKey, on, count, subFilter, subCounts, onSubFilter, onChange }) {
  const meta = LAYER_LEGENDS[layerKey];
  const isInteractive = !!meta.subFilterKey;

  return (
    <div style={{ padding: "12px 14px", borderTop: "1px solid var(--hairline-soft)" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          fontSize: 11.5,
          fontWeight: 500,
          letterSpacing: "-0.005em",
          color: "var(--ink)",
        }}
      >
        <HairlineToggle on={on} onChange={(v) => onChange(layerKey, v)} />
        <span style={{ flex: 1 }}>{meta.label}</span>
        <span
          className="font-mono"
          style={{
            color: "var(--ink-3)",
            fontWeight: 500,
            fontVariantNumeric: "tabular-nums",
            fontSize: 9.5,
            letterSpacing: "0.01em",
            padding: "2px 7px",
            border: "1px solid var(--hairline)",
            borderRadius: 999,
            background: "var(--surface-quiet)",
          }}
        >
          {count?.toLocaleString?.() ?? count}
        </span>
      </div>
      <div
        style={{
          fontSize: 10,
          color: "var(--ink-3)",
          marginTop: 6,
          marginLeft: 34,
          marginBottom: 9,
          letterSpacing: "-0.005em",
          lineHeight: 1.45,
        }}
      >
        {meta.description}
      </div>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 6,
          marginLeft: 34,
          fontSize: 9.5,
          color: "var(--ink-2)",
          lineHeight: 1.5,
          opacity: !on ? 0.4 : 1,
          transition: "opacity 200ms var(--ease-out)",
          pointerEvents: !on ? "none" : "auto",
        }}
      >
        {meta.chips.map((c) => {
          const active = !isInteractive || (subFilter?.[c.key] !== false);
          return isInteractive ? (
            <button
              key={c.key}
              type="button"
              onClick={() => onSubFilter?.(meta.subFilterKey, c.key, !active)}
              style={{
                whiteSpace: "nowrap",
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                padding: "2px 8px 2px 6px",
                border: `1px solid ${active ? "var(--hairline-strong)" : "var(--hairline)"}`,
                borderRadius: 999,
                background: active ? "var(--surface-strong)" : "var(--surface-quiet)",
                cursor: "pointer",
                opacity: active ? 1 : 0.38,
                transition: "opacity 160ms var(--ease-out), border-color 160ms var(--ease-out), background 160ms var(--ease-out)",
              }}
            >
              <Chip color={active ? c.color : "var(--ink-5)"} shape={meta.shape} />
              {c.label}
            </button>
          ) : (
            <span
              key={c.label}
              style={{
                whiteSpace: "nowrap",
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                padding: "2px 8px 2px 6px",
                border: "1px solid var(--hairline)",
                borderRadius: 999,
                background: "var(--surface-quiet)",
              }}
            >
              <Chip color={c.color} shape={meta.shape} />
              {c.label}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/* iOS-style segmented control: one pill track, sliding ink "thumb"
   indicates the active option. Pure white aesthetic, no gradients. */
function ViewModeRow({ is3D, onToggle3D }) {
  return (
    <div
      style={{
        padding: "12px 14px 14px",
        borderBottom: "1px solid var(--hairline-soft)",
      }}
    >
      <div
        className="font-mono"
        style={{
          fontSize: 9,
          fontWeight: 500,
          color: "var(--ink-3)",
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          marginBottom: 8,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span>View</span>
        <span style={{ flex: 1, height: 1, background: "var(--hairline)" }} />
      </div>

      <div
        style={{
          position: "relative",
          display: "flex",
          padding: 2,
          background: "var(--bg-3)",
          borderRadius: 999,
          border: "1px solid var(--hairline)",
          fontFamily: "var(--font-mono)",
        }}
      >
        <span
          aria-hidden
          style={{
            position: "absolute",
            top: 2,
            bottom: 2,
            left: is3D ? "50%" : 2,
            width: "calc(50% - 2px)",
            background: "var(--ink)",
            borderRadius: 999,
            transition: "left 280ms var(--ease-out)",
            boxShadow: "0 1px 2px rgba(0,0,0,0.2)",
          }}
        />
        {[
          { label: "2D", active: !is3D, onClick: () => onToggle3D?.(false) },
          { label: "3D", active: is3D, onClick: () => onToggle3D?.(true) },
        ].map(({ label, active, onClick }) => (
          <button
            key={label}
            type="button"
            onClick={onClick}
            style={{
              position: "relative",
              flex: 1,
              background: "transparent",
              border: "none",
              padding: "5px 0",
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: "0.18em",
              color: active ? "var(--bg)" : "var(--ink-2)",
              cursor: "pointer",
              fontFamily: "inherit",
              transition: "color 280ms var(--ease-out)",
              zIndex: 1,
            }}
          >
            {label}
          </button>
        ))}
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
  const [hasMounted, setHasMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setHasMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const visiblyCollapsed = !hasMounted || collapsed;

  const setLayer = (layer, on) => onChange({ ...visibleLayers, [layer]: on });

  // sub-filter toggle: onChange({ ...visibleLayers, collieryStatus: { ...cur, [key]: val } })
  const setSubFilter = (groupKey, key, val) => {
    onChange({
      ...visibleLayers,
      [groupKey]: { ...(visibleLayers[groupKey] || {}), [key]: val },
    });
  };

  return (
    <div
      className="surface"
      style={{
        position: "absolute",
        top: 14,
        right: 14,
        zIndex: 5,
        width: visiblyCollapsed ? PANEL_WIDTH_COLLAPSED : PANEL_WIDTH_EXPANDED,
        fontSize: 11,
        overflow: "hidden",
        transition: `width ${ANIM_MS}ms ${ANIM_EASE}, border-radius ${ANIM_MS}ms ${ANIM_EASE}`,
        borderRadius: visiblyCollapsed ? 999 : "var(--radius-lg)",
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
          padding: "12px 14px 12px",
          textAlign: "left",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 10,
          color: "var(--ink)",
        }}
      >
        <span
          style={{
            fontSize: 9,
            color: "var(--ink-3)",
            transform: visiblyCollapsed ? "rotate(0deg)" : "rotate(90deg)",
            transition: `transform ${ANIM_MS}ms ${ANIM_EASE}`,
            display: "inline-block",
            lineHeight: 1,
            width: 9,
          }}
        >
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none" style={{ display: "block" }}>
            <path d="M2 1.5l3 2.5-3 2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </span>
        <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: "-0.015em", lineHeight: 1, color: "var(--ink)" }}>
          Legend
        </span>
        <span
          className="font-mono"
          style={{
            marginLeft: "auto",
            fontSize: 8.5,
            fontWeight: 500,
            color: "var(--ink-3)",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            opacity: visiblyCollapsed ? 0 : 1,
            transition: `opacity ${ANIM_MS}ms ${ANIM_EASE}`,
            whiteSpace: "nowrap",
            padding: "2px 8px",
            border: "1px solid var(--hairline)",
            borderRadius: 999,
            background: "var(--surface-quiet)",
          }}
        >
          Layers
        </span>
      </button>
      <div
        style={{
          maxHeight: visiblyCollapsed ? 0 : "calc(100vh - 80px)",
          opacity: visiblyCollapsed ? 0 : 1,
          overflow: "hidden",
          transition: `max-height ${ANIM_MS}ms ${ANIM_EASE}, opacity ${Math.round(ANIM_MS * 0.7)}ms ${ANIM_EASE}`,
        }}
        aria-hidden={visiblyCollapsed}
      >
        {onToggle3D ? <ViewModeRow is3D={is3D} onToggle3D={onToggle3D} /> : null}
        <LayerRow
          layerKey="collieries"
          on={visibleLayers.collieries}
          count={counts?.collieries}
          subFilter={visibleLayers.collieryStatus}
          subCounts={counts?.collieryStatus}
          onSubFilter={setSubFilter}
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
          subFilter={visibleLayers.sourceSeverity}
          subCounts={counts?.sourceSeverity}
          onSubFilter={setSubFilter}
          onChange={setLayer}
        />
        <LayerRow
          layerKey="streams"
          on={visibleLayers.streams}
          count={counts?.streams}
          onChange={setLayer}
        />
      </div>
    </div>
  );
}

export default LayerControlPanel;

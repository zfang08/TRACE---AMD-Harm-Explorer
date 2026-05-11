import React, { useState } from "react";

/**
 * Inline "Simulate transport" block embedded in HarmPanel and
 * PollutionSourcePanel. Toggles the particle simulation; explains what the
 * animation actually models.
 *
 * 多源支持：simulationSourceIds 是当前参与模拟的 AMD 集合，第 0 个是 anchor
 * （即 analysisFocus 当前选中的 AMD），不能被移除；剩下的是用户在 addMode
 * 下在地图上点选加进来的 extras，可以用 chip 上的 × 摘掉。
 */

const SEVERITY_DOT = {
  extreme: "#7f1d1d",
  high: "#b91c1c",
  medium: "#dc2626",
  low: "#fda4af",
};

function SourceChip({ source, isAnchor, onRemove }) {
  const sev = source?.severity || "low";
  const name = source?.name || source?.id || "—";
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "3px 8px 3px 6px",
        background: "rgba(255,255,255,0.85)",
        border: "1px solid rgba(15,23,42,0.14)",
        borderRadius: 999,
        fontSize: 10,
        color: "#0f172a",
        fontFamily: "inherit",
        maxWidth: "100%",
      }}
    >
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: SEVERITY_DOT[sev] || "#94a3b8",
          flex: "none",
        }}
      />
      {isAnchor ? (
        <span
          style={{
            fontSize: 8.5,
            color: "#94a3b8",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            fontWeight: 700,
          }}
          title="Anchor source (the AMD currently in analysis)"
        >
          anchor
        </span>
      ) : null}
      <span
        style={{
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          maxWidth: 120,
        }}
        title={name}
      >
        {name}
      </span>
      {!isAnchor && onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${name}`}
          style={{
            background: "transparent",
            border: "none",
            color: "#64748b",
            cursor: "pointer",
            fontSize: 12,
            lineHeight: 1,
            padding: "0 0 0 2px",
            fontFamily: "inherit",
          }}
        >
          ×
        </button>
      ) : null}
    </div>
  );
}

function SimulateBlock({
  simulating,
  onToggle,
  simulationSourceIds = [],
  sourceById,
  addMode = false,
  onToggleAddMode,
  onRemoveExtraSource,
  maxSimSources = 30,
}) {
  const [hovering, setHovering] = useState(false);

  const ids = simulationSourceIds || [];
  const anchorId = ids[0] || null;
  const total = ids.length;
  const atCap = total >= maxSimSources;

  return (
    <div
      style={{
        marginTop: 16,
        padding: "12px 14px",
        background: "rgba(15,23,42,0.04)",
        border: "1px solid rgba(15,23,42,0.08)",
        borderRadius: 10,
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        style={{
          width: "100%",
          background: simulating
            ? "rgba(127,29,29,0.92)"
            : hovering
              ? "#0f172a"
              : "#1e293b",
          color: "#f8fafc",
          border: "none",
          padding: "9px 14px",
          borderRadius: 8,
          fontSize: 11,
          fontWeight: 500,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          transition: "background 180ms ease",
          fontFamily: "inherit",
        }}
      >
        {simulating
          ? `⏸  Stop simulation${total > 1 ? ` (${total})` : ""}`
          : `▶  Simulate transport${total > 1 ? ` (${total} sources)` : ""}`}
      </button>

      {/* Sources roster: anchor + extras as chips, with counter */}
      {anchorId && sourceById ? (
        <div style={{ marginTop: 14 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              marginBottom: 8,
              fontSize: 9.5,
              fontWeight: 600,
              color: "#475569",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
            }}
          >
            <span>Sources in simulation</span>
            <span
              style={{
                color: atCap ? "#7f1d1d" : "#94a3b8",
                fontWeight: 500,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {total} / {maxSimSources}
            </span>
          </div>
          <div
            className="sidebar-scroll"
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 6,
              maxHeight: 120,
              overflowY: "auto",
            }}
          >
            {ids.map((id) => {
              const isAnchor = id === anchorId;
              const source = sourceById.get
                ? sourceById.get(id)
                : sourceById?.[id];
              return (
                <SourceChip
                  key={id}
                  source={source || { id }}
                  isAnchor={isAnchor}
                  onRemove={
                    !isAnchor && onRemoveExtraSource
                      ? () => onRemoveExtraSource(id)
                      : null
                  }
                />
              );
            })}
          </div>

          {/* Add-mode toggle: in this mode, clicking AMD points on the map adds
              them to the sim instead of switching analysis focus. */}
          {onToggleAddMode ? (
            <button
              type="button"
              onClick={onToggleAddMode}
              disabled={atCap && !addMode}
              style={{
                marginTop: 12,
                width: "100%",
                background: addMode ? "#0f172a" : "transparent",
                color: addMode ? "#f8fafc" : "#1e293b",
                border: addMode
                  ? "1px solid #0f172a"
                  : "1px dashed rgba(15,23,42,0.3)",
                padding: "7px 10px",
                borderRadius: 8,
                fontSize: 10,
                fontWeight: 500,
                letterSpacing: "0.06em",
                cursor: atCap && !addMode ? "not-allowed" : "pointer",
                opacity: atCap && !addMode ? 0.5 : 1,
                fontFamily: "inherit",
              }}
            >
              {addMode
                ? "✓  Done — back to analysis clicks"
                : atCap
                  ? `At cap (${maxSimSources}) — remove one to add`
                  : "+  Add more sources from the map"}
            </button>
          ) : null}

          {addMode ? (
            <div
              style={{
                marginTop: 10,
                padding: "8px 10px",
                background: "rgba(15,23,42,0.06)",
                border: "1px dashed rgba(15,23,42,0.18)",
                borderRadius: 8,
                fontSize: 10,
                color: "#334155",
                lineHeight: 1.55,
                fontStyle: "italic",
              }}
            >
              Click any AMD discharge on the map to add it; click an already
              selected one to remove. Selected sources have a navy halo.
            </div>
          ) : null}
        </div>
      ) : null}

      <div
        style={{
          marginTop: 12,
          fontSize: 10.5,
          lineHeight: 1.6,
          color: "#475569",
          letterSpacing: "0.01em",
        }}
      >
        <strong style={{ color: "#0f172a", fontWeight: 700 }}>
          What this animates:
        </strong>{" "}
        each particle is a numerical sample of the{" "}
        <em style={{ fontStyle: "italic" }}>advection-diffusion</em> equation.{" "}
        <span style={{ color: "#7f1d1d", fontWeight: 700 }}>Flow</span> pushes
        pollution downstream (advection),{" "}
        <span style={{ color: "#475569", fontWeight: 700 }}>turbulence</span>{" "}
        spreads the plume (diffusion), and{" "}
        <span style={{ color: "#94a3b8", fontWeight: 700 }}>
          metal precipitation + tributary dilution
        </span>{" "}
        attenuate concentration at distance (decay). Particle color starts at
        the source severity and fades to muted slate as concentration drops.
      </div>
    </div>
  );
}

export default SimulateBlock;

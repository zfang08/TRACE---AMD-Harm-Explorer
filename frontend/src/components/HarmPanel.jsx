import React, { useMemo, useState } from "react";
import SimulateBlock from "./SimulateBlock";

const fmt = (v, digits = 2, suffix = "") =>
  v == null || Number.isNaN(v) ? "—" : `${v.toFixed(digits)}${suffix}`;

const SEVERITY_BG = {
  extreme: "#7f1d1d",
  high: "#b91c1c",
  medium: "#dc2626",
  low: "#fda4af",
};
const SEVERITY_FG = {
  extreme: "#ffffff",
  high: "#ffffff",
  medium: "#ffffff",
  low: "#7f1d1d",
};

// Threshold predicates — over-threshold values render in red with ⚠
const METRIC_THRESHOLDS = {
  ph: (v) => v != null && v < 5,
  iron: (v) => v != null && v > 1,
  manganese: (v) => v != null && v > 0.5,
  acidity: (v) => v != null && v > 50,
};

const STATION_PREVIEW_LIMIT = 3;

function Section({ title, count, children }) {
  return (
    <div style={{ marginTop: 20 }}>
      <div
        style={{
          fontSize: 9.5,
          fontWeight: 600,
          color: "#64748b",
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          marginBottom: 10,
          display: "flex",
          alignItems: "baseline",
          gap: 6,
        }}
      >
        <span>{title}</span>
        {count != null ? (
          <span style={{ color: "#cbd5e1", fontWeight: 500 }}>({count})</span>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function MetricCell({ label, value, unit, warn }) {
  const hasValue = value != null && !Number.isNaN(value);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span
        style={{
          fontSize: 9,
          color: "#94a3b8",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          fontWeight: 500,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 12,
          fontWeight: 500,
          color: warn ? "#7f1d1d" : hasValue ? "#0f172a" : "#cbd5e1",
          fontVariantNumeric: "tabular-nums",
          letterSpacing: 0,
        }}
      >
        {hasValue
          ? `${value.toFixed(value < 10 ? 1 : 0)}${unit ? ` ${unit}` : ""}`
          : "—"}
        {warn ? " ⚠" : ""}
      </span>
    </div>
  );
}

function StationCard({ station, onClick }) {
  const s = station;
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        background: "rgba(248,250,252,0.6)",
        border: "1px solid rgba(15,23,42,0.06)",
        borderRadius: 8,
        padding: "10px 12px",
        marginBottom: 9,
        cursor: onClick ? "pointer" : "default",
        fontFamily: "inherit",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 9,
          gap: 8,
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 500,
            color: "#0f172a",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            letterSpacing: "0.01em",
          }}
        >
          {s.name || s.id}
        </span>
        <span
          style={{
            fontSize: 9.5,
            color: "#94a3b8",
            fontVariantNumeric: "tabular-nums",
            flex: "none",
            fontStyle: "italic",
          }}
        >
          n = {s.n_samples ?? 0}
        </span>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          rowGap: 9,
          columnGap: 12,
        }}
      >
        <MetricCell
          label="pH"
          value={s.ph}
          warn={METRIC_THRESHOLDS.ph(s.ph)}
        />
        <MetricCell
          label="Fe"
          value={s.iron}
          unit="mg/L"
          warn={METRIC_THRESHOLDS.iron(s.iron)}
        />
        <MetricCell
          label="Mn"
          value={s.manganese}
          unit="mg/L"
          warn={METRIC_THRESHOLDS.manganese(s.manganese)}
        />
        <MetricCell
          label="Acidity"
          value={s.acidity_mgL_caco3}
          unit="mg/L"
          warn={METRIC_THRESHOLDS.acidity(s.acidity_mgL_caco3)}
        />
      </div>
    </button>
  );
}

function ExpandToggle({ onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        marginTop: 6,
        background: "transparent",
        border: "1px solid rgba(15,23,42,0.12)",
        borderRadius: 6,
        padding: "4px 12px",
        cursor: "pointer",
        fontSize: 10,
        color: "#475569",
        letterSpacing: "0.02em",
        fontFamily: "inherit",
      }}
    >
      {children}
    </button>
  );
}

function HarmPanel({
  harm,
  onBack,
  backLabel,
  onFocus,
  simulating,
  onToggleSimulate,
  simulationSourceIds,
  sourceById,
  addMode,
  onToggleAddMode,
  onRemoveExtraSource,
  maxSimSources,
}) {
  const [stationsExpanded, setStationsExpanded] = useState(false);
  const [collieriesExpanded, setCollieriesExpanded] = useState(false);

  const tw = harm?.time_window;
  const km = harm?.key_metrics || {};
  const stations = harm?.stations || [];
  const collieries = harm?.source_collieries || [];

  const sortedStations = useMemo(
    () => [...stations].sort((a, b) => (b.n_samples || 0) - (a.n_samples || 0)),
    [stations],
  );
  const visibleStations = stationsExpanded
    ? sortedStations
    : sortedStations.slice(0, STATION_PREVIEW_LIMIT);

  const sev = harm?.severity || "low";

  return (
    <div style={{ padding: 14, fontSize: 11.5 }}>
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          style={{
            background: "transparent",
            border: "none",
            cursor: "pointer",
            fontSize: 10,
            color: "#64748b",
            padding: "0 0 10px 0",
            letterSpacing: "0.02em",
            fontFamily: "inherit",
          }}
        >
          ← {backLabel || "Back"}
        </button>
      ) : null}

      {/* Header — title + severity pill on the same row */}
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          flexWrap: "wrap",
          gap: 8,
          marginTop: 2,
        }}
      >
        <span
          style={{
            fontSize: 13.5,
            fontWeight: 500,
            color: "#0f172a",
            lineHeight: 1.4,
            letterSpacing: "0.01em",
            flex: "1 1 auto",
            minWidth: 0,
          }}
        >
          {harm?.name || harm?.id}
        </span>
        <span
          style={{
            display: "inline-block",
            background: SEVERITY_BG[sev] || "#94a3b8",
            color: SEVERITY_FG[sev] || "#ffffff",
            padding: "3px 9px",
            borderRadius: 4,
            fontSize: 8.5,
            fontWeight: 700,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            flex: "none",
          }}
        >
          {sev}
        </span>
      </div>

      {/* One-liner: affected length · reach count · flow gpm */}
      <div
        style={{
          fontSize: 11,
          color: "#64748b",
          marginTop: 7,
          fontStyle: "italic",
          fontVariantNumeric: "tabular-nums",
          letterSpacing: "0.01em",
          lineHeight: 1.55,
        }}
      >
        {km.total_reach_length_km != null
          ? `Impacts ${km.total_reach_length_km.toFixed(1)} km across ${km.n_reaches ?? 0} reaches`
          : ""}
        {km.flow_gpm != null ? ` · ${km.flow_gpm} gpm` : ""}
      </div>

      {onToggleSimulate ? (
        <SimulateBlock
          simulating={!!simulating}
          onToggle={onToggleSimulate}
          simulationSourceIds={simulationSourceIds}
          sourceById={sourceById}
          addMode={addMode}
          onToggleAddMode={onToggleAddMode}
          onRemoveExtraSource={onRemoveExtraSource}
          maxSimSources={maxSimSources}
        />
      ) : null}

      {/* Monitoring evidence — one chemistry card per station (2×2 grid) */}
      {sortedStations.length > 0 ? (
        <Section title="Monitoring evidence" count={sortedStations.length}>
          {visibleStations.map((s) => (
            <StationCard
              key={s.id}
              station={s}
              onClick={onFocus ? () => onFocus("station", s.id) : null}
            />
          ))}
          {sortedStations.length > STATION_PREVIEW_LIMIT ? (
            <ExpandToggle onClick={() => setStationsExpanded((v) => !v)}>
              {stationsExpanded
                ? "Collapse"
                : `Show ${sortedStations.length - STATION_PREVIEW_LIMIT} more`}
            </ExpandToggle>
          ) : null}
        </Section>
      ) : (
        <Section title="Monitoring evidence">
          <div
            style={{
              color: "#94a3b8",
              fontSize: 11,
              fontStyle: "italic",
              lineHeight: 1.55,
            }}
          >
            No stations along the 20 km downstream chain recorded sample data.
          </div>
        </Section>
      )}

      {/* Source collieries — collapsed by default, sorted by distance */}
      {collieries.length > 0 ? (
        <Section title="Source collieries" count={collieries.length}>
          {!collieriesExpanded ? (
            <ExpandToggle onClick={() => setCollieriesExpanded(true)}>
              Show list
            </ExpandToggle>
          ) : (
            <>
              {collieries.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onFocus?.("colliery", c.id)}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    background: "transparent",
                    border: "none",
                    borderBottom: "1px solid rgba(15,23,42,0.05)",
                    padding: "7px 0",
                    cursor: onFocus ? "pointer" : "default",
                    fontFamily: "inherit",
                  }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      color: "#0f172a",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {c.name || c.id}
                    {c.distance_m != null ? (
                      <span
                        style={{
                          color: "#94a3b8",
                          fontStyle: "italic",
                          fontWeight: 400,
                        }}
                      >
                        {" · "}
                        {c.distance_m} m
                      </span>
                    ) : null}
                  </div>
                  {c.status ? (
                    <div
                      style={{
                        fontSize: 9.5,
                        color: "#94a3b8",
                        fontStyle: "italic",
                        marginTop: 2,
                      }}
                    >
                      {c.status}
                    </div>
                  ) : null}
                </button>
              ))}
              <ExpandToggle onClick={() => setCollieriesExpanded(false)}>
                Collapse
              </ExpandToggle>
            </>
          )}
        </Section>
      ) : null}

      {/* Footer */}
      <div
        style={{
          marginTop: 24,
          paddingTop: 12,
          borderTop: "1px solid rgba(15,23,42,0.08)",
          fontSize: 9.5,
          color: "#94a3b8",
          lineHeight: 1.7,
          letterSpacing: "0.02em",
          fontStyle: "italic",
        }}
      >
        {tw?.start && tw?.end ? (
          <div>
            Sample window · {tw.start} → {tw.end}
          </div>
        ) : null}
        {km.sf_priority ? <div>PA DEP priority · {km.sf_priority}</div> : null}
        <div>Source · PA DEP AML Inventory</div>
      </div>
    </div>
  );
}

export default HarmPanel;

import React, { useEffect, useState } from "react";
import { getHarmById } from "../services/api";
import SimulateBlock from "./SimulateBlock";

const SEVERITY_BG = {
  extreme: "#7a1e10",
  high: "#b9341e",
  medium: "#b9341e",
  low: "#fda4af",
};
const SEVERITY_FG = {
  extreme: "#ffffff",
  high: "#ffffff",
  medium: "#ffffff",
  low: "#7a1e10",
};

function PollutionSourcePanel({
  pollutionSourceId,
  onHarmSelect,
  simulating,
  onToggleSimulate,
  simulationSourceIds,
  sourceById,
  addMode,
  onToggleAddMode,
  onRemoveExtraSource,
  maxSimSources,
}) {
  // undefined = fetch in progress, null = not found, object = found
  const [harm, setHarm] = useState(undefined);

  useEffect(() => {
    if (!pollutionSourceId) { setHarm(undefined); return; }
    setHarm(undefined);
    let cancelled = false;
    getHarmById(`harm-${pollutionSourceId}`)
      .then((h) => !cancelled && setHarm(h ?? null))
      .catch(() => !cancelled && setHarm(null));
    return () => { cancelled = true; };
  }, [pollutionSourceId]);

  if (harm === undefined) {
    return (
      <div style={{ padding: 14, display: "flex", alignItems: "center", gap: 8 }}>
        <span className="font-mono" style={{ fontSize: 9.5, color: "var(--ink-4)", letterSpacing: "0.14em", textTransform: "uppercase" }}>
          Loading
        </span>
        <span className="loading-dot" />
        <span className="loading-dot" />
        <span className="loading-dot" />
      </div>
    );
  }

  if (!harm) {
    return (
      <div style={{ padding: "14px 16px", fontSize: 11, color: "var(--ink-4)", lineHeight: 1.55 }}>
        No AMD discharge record registered for this source.
      </div>
    );
  }

  const km = harm.key_metrics || {};
  const sev = harm.severity || "low";

  return (
    <div style={{ padding: 14, fontSize: 11.5 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <h2
          style={{
            margin: 0,
            fontSize: 13.5,
            fontWeight: 500,
            color: "var(--ink)",
            lineHeight: 1.4,
            flex: "1 1 auto",
            minWidth: 0,
          }}
        >
          AMD discharge {harm.pollution_source_id || pollutionSourceId}
        </h2>
        <span
          style={{
            display: "inline-block",
            background: SEVERITY_BG[sev] || "var(--ink-4)",
            color: SEVERITY_FG[sev] || "#ffffff",
            padding: "2px 9px",
            borderRadius: 999,
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
      <p style={{ margin: "5px 0 0", fontSize: 11, color: "var(--ink-3)", lineHeight: 1.55 }}>
        {harm.name}
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "auto 1fr",
          gap: "8px 12px",
          fontSize: 11,
          marginTop: 14,
          alignItems: "center",
        }}
      >
        <span className="font-mono" style={{ fontSize: 9, color: "var(--ink-4)", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 500 }}>PA DEP priority</span>
        <span className="font-mono" style={{ fontSize: 10.5, color: "var(--ink)" }}>{km.sf_priority || "—"}</span>

        <span className="font-mono" style={{ fontSize: 9, color: "var(--ink-4)", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 500 }}>Reported flow</span>
        <span className="font-mono" style={{ fontSize: 10.5, color: "var(--ink)", fontVariantNumeric: "tabular-nums" }}>
          {km.flow_gpm != null ? `${km.flow_gpm} gpm` : "—"}
        </span>

        {harm.time_window?.start && (
          <>
            <span className="font-mono" style={{ fontSize: 9, color: "var(--ink-4)", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 500 }}>Sample window</span>
            <span className="font-mono" style={{ fontSize: 10.5, color: "var(--ink)" }}>
              {harm.time_window.start} → {harm.time_window.end}
            </span>
          </>
        )}
      </div>

      <div
        style={{
          marginTop: 14,
          padding: "10px 12px",
          background: "var(--bg-3)",
          border: "1px solid var(--hairline)",
          borderRadius: "var(--radius-md)",
          fontSize: 11,
          lineHeight: 1.7,
          color: "var(--ink-2)",
          display: "flex",
          flexWrap: "wrap",
          gap: "4px 8px",
          alignItems: "center",
        }}
      >
        <span>Downstream:</span>
        <span className="pill-badge font-mono" style={{ fontSize: 10 }}>{km.n_reaches ?? 0} reaches</span>
        <span>over</span>
        <span className="pill-badge font-mono" style={{ fontSize: 10 }}>{(km.total_reach_length_km ?? 0).toFixed(1)} km</span>
        <span style={{ color: "var(--hairline-strong)", padding: "0 2px" }}>·</span>
        <span className="pill-badge font-mono" style={{ fontSize: 10 }}>{km.n_collieries ?? 0} collieries</span>
        <span style={{ fontSize: 10, color: "var(--ink-4)" }}>within 2 km</span>
        <span style={{ color: "var(--hairline-strong)", padding: "0 2px" }}>·</span>
        <span className="pill-badge font-mono" style={{ fontSize: 10 }}>{km.n_stations ?? 0} stations</span>
        <span style={{ fontSize: 10, color: "var(--ink-4)" }}>with data</span>
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

      <button
        type="button"
        onClick={() => onHarmSelect(harm.id)}
        className="pill-btn"
        style={{
          marginTop: 14,
          width: "100%",
          padding: "9px 10px",
          justifyContent: "center",
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.02em",
        }}
        data-active="true"
      >
        See full harm evidence
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ display: "inline-block", verticalAlign: "middle", marginLeft: 5 }}>
          <path d="M2.5 6h7M7 2.5l3.5 3.5L7 9.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
    </div>
  );
}

export default PollutionSourcePanel;

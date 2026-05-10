import React, { useEffect, useState } from "react";
import { getHarmById } from "../services/api";
import SimulateBlock from "./SimulateBlock";

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

/**
 * Pollution-source detail panel. Each source maps 1:1 to a harm, so we display
 * source-level fields here and link out to the full HarmPanel for evidence.
 */
function PollutionSourcePanel({
  pollutionSourceId,
  onHarmSelect,
  simulating,
  onToggleSimulate,
}) {
  const [harm, setHarm] = useState(null);

  useEffect(() => {
    if (!pollutionSourceId) {
      setHarm(null);
      return;
    }
    let cancelled = false;
    getHarmById(`harm-${pollutionSourceId}`)
      .then((h) => !cancelled && setHarm(h))
      .catch(() => !cancelled && setHarm(null));
    return () => {
      cancelled = true;
    };
  }, [pollutionSourceId]);

  if (!harm) {
    return (
      <div
        style={{
          padding: 16,
          color: "#64748b",
          fontSize: 13,
          fontStyle: "italic",
        }}
      >
        Loading…
      </div>
    );
  }

  const km = harm.key_metrics || {};
  const sev = harm.severity || "low";

  return (
    <div style={{ padding: 16, fontSize: 13 }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: 15,
            fontWeight: 500,
            color: "#0f172a",
            lineHeight: 1.4,
            letterSpacing: "0.01em",
            flex: "1 1 auto",
            minWidth: 0,
          }}
        >
          AMD discharge {harm.pollution_source_id || pollutionSourceId}
        </h2>
        <span
          style={{
            display: "inline-block",
            background: SEVERITY_BG[sev] || "#94a3b8",
            color: SEVERITY_FG[sev] || "#ffffff",
            padding: "3px 9px",
            borderRadius: 4,
            fontSize: 9.5,
            fontWeight: 700,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            flex: "none",
          }}
        >
          {sev}
        </span>
      </div>
      <p
        style={{
          margin: "4px 0 0",
          fontSize: 12,
          fontStyle: "italic",
          color: "#64748b",
        }}
      >
        {harm.name}
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "auto 1fr",
          gap: "4px 12px",
          fontSize: 12.5,
          marginTop: 14,
        }}
      >
        <strong style={{ color: "#475569" }}>PA DEP priority</strong>
        <span style={{ color: "#0f172a" }}>{km.sf_priority || "—"}</span>
        <strong style={{ color: "#475569" }}>Reported flow</strong>
        <span style={{ color: "#0f172a", fontVariantNumeric: "tabular-nums" }}>
          {km.flow_gpm != null ? `${km.flow_gpm} gpm` : "—"}
        </span>
        {harm.time_window?.start ? (
          <>
            <strong style={{ color: "#475569" }}>Sample window</strong>
            <span style={{ color: "#0f172a" }}>
              {harm.time_window.start} → {harm.time_window.end}
            </span>
          </>
        ) : null}
      </div>

      <div
        style={{
          marginTop: 14,
          padding: "10px 12px",
          background: "rgba(241,245,249,0.7)",
          borderRadius: 8,
          fontSize: 12,
          lineHeight: 1.6,
          color: "#0f172a",
        }}
      >
        <div>
          Downstream impact: <strong>{km.n_reaches ?? 0}</strong> reaches over{" "}
          <strong>{(km.total_reach_length_km ?? 0).toFixed(1)} km</strong>
        </div>
        <div>
          Linked collieries within 2 km:{" "}
          <strong>{km.n_collieries ?? 0}</strong>
        </div>
        <div>
          Supporting stations with data: <strong>{km.n_stations ?? 0}</strong>
        </div>
      </div>

      {onToggleSimulate ? (
        <SimulateBlock
          simulating={!!simulating}
          onToggle={onToggleSimulate}
        />
      ) : null}

      <button
        type="button"
        onClick={() => onHarmSelect(harm.id)}
        style={{
          marginTop: 14,
          width: "100%",
          padding: "9px 10px",
          background: "#1e293b",
          color: "#f8fafc",
          border: "none",
          borderRadius: 8,
          cursor: "pointer",
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: "0.04em",
          fontFamily: "inherit",
        }}
      >
        See full harm evidence →
      </button>
    </div>
  );
}

export default PollutionSourcePanel;

import React, { useEffect, useState } from "react";
import { getHarmById, getHarmNarrative, askHarmQuestion } from "../services/api";
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
  const [narrative, setNarrative] = useState(null);
  const [narrativeLoading, setNarrativeLoading] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState(null);
  const [answerLoading, setAnswerLoading] = useState(false);

  useEffect(() => {
    if (!pollutionSourceId) { setHarm(undefined); return; }
    setHarm(undefined);
    let cancelled = false;
    getHarmById(`harm-${pollutionSourceId}`)
      .then((h) => !cancelled && setHarm(h ?? null))
      .catch(() => !cancelled && setHarm(null));
    return () => { cancelled = true; };
  }, [pollutionSourceId]);

  useEffect(() => {
    const harmId = harm?.id;
    if (!harmId) return;
    let cancelled = false;
    setNarrative(null);
    setNarrativeLoading(true);
    getHarmNarrative(harmId)
      .then((d) => { if (!cancelled) setNarrative(d.narrative ?? "—"); })
      .catch((e) => { if (!cancelled) setNarrative(`Error: ${e.message}`); })
      .finally(() => { if (!cancelled) setNarrativeLoading(false); });
    return () => { cancelled = true; };
  }, [harm?.id]);

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

      {(narrativeLoading || narrative !== null) ? (
        <div
          style={{
            marginTop: 16,
            padding: "10px 12px",
            background: "var(--bg-3)",
            border: "1px solid var(--hairline)",
            borderRadius: 10,
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
              marginBottom: 7,
            }}
          >
            AI Summary
          </div>

          {narrativeLoading ? (
            <div style={{ height: 28, background: "var(--hairline)", borderRadius: 3, opacity: 0.5 }} />
          ) : (
            <p style={{ margin: 0, fontSize: 11, lineHeight: 1.65, color: "var(--ink-2)" }}>
              {narrative}
            </p>
          )}

          <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
            <input
              type="text"
              placeholder="Ask AI…"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && question.trim() && !answerLoading && harm?.id) {
                  setAnswer(null);
                  setAnswerLoading(true);
                  askHarmQuestion(harm.id, question)
                    .then((d) => setAnswer(d.answer ?? "—"))
                    .catch((e) => setAnswer(`Error: ${e.message}`))
                    .finally(() => setAnswerLoading(false));
                }
              }}
              style={{
                flex: 1,
                minWidth: 0,
                padding: "5px 10px",
                borderRadius: 999,
                border: "1px solid var(--hairline-strong)",
                background: "var(--bg)",
                fontSize: 10.5,
                color: "var(--ink)",
                fontFamily: "inherit",
                outline: "none",
              }}
            />
            <button
              type="button"
              disabled={!question.trim() || answerLoading}
              className="pill-btn"
              style={{ fontSize: 11, padding: "4px 10px", flex: "none", opacity: question.trim() ? 1 : 0.4 }}
              onClick={() => {
                if (!question.trim() || answerLoading || !harm?.id) return;
                setAnswer(null);
                setAnswerLoading(true);
                askHarmQuestion(harm.id, question)
                  .then((d) => setAnswer(d.answer ?? "—"))
                  .catch((e) => setAnswer(`Error: ${e.message}`))
                  .finally(() => setAnswerLoading(false));
              }}
            >
              ↵
            </button>
          </div>

          {answerLoading ? (
            <div style={{ height: 24, background: "var(--hairline)", borderRadius: 3, opacity: 0.5, marginTop: 8 }} />
          ) : answer ? (
            <p style={{ margin: "8px 0 0", fontSize: 11, lineHeight: 1.65, color: "var(--ink)" }}>
              {answer}
            </p>
          ) : null}
        </div>
      ) : null}

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

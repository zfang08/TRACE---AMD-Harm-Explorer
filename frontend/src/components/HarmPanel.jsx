import React, { useEffect, useMemo, useState } from "react";
import SimulateBlock from "./SimulateBlock";
import { getHarmNarrative, askHarmQuestion } from "../services/api";

const fmt = (v, digits = 2, suffix = "") =>
  v == null || Number.isNaN(v) ? "—" : `${v.toFixed(digits)}${suffix}`;

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

const METRIC_THRESHOLDS = {
  ph: (v) => v != null && v < 5,
  iron: (v) => v != null && v > 1,
  manganese: (v) => v != null && v > 0.5,
  acidity: (v) => v != null && v > 50,
};

const STATION_PREVIEW_LIMIT = 3;

function SectionHeader({ title, count }) {
  return (
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
      <span>{title}</span>
      {count != null && (
        <span
          className="pill-badge"
          style={{ fontSize: 8, padding: "1px 6px", lineHeight: 1.6 }}
        >
          {count}
        </span>
      )}
      <span style={{ flex: 1, height: 1, background: "var(--hairline)" }} />
    </div>
  );
}

function Section({ title, count, children }) {
  return (
    <div style={{ marginTop: 20 }}>
      <SectionHeader title={title} count={count} />
      {children}
    </div>
  );
}

function MetricCell({ label, value, unit, warn }) {
  const hasValue = value != null && !Number.isNaN(value);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <span
        className="font-mono"
        style={{
          fontSize: 8.5,
          color: "var(--ink-4)",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          fontWeight: 500,
        }}
      >
        {label}
      </span>
      <span
        className="font-mono"
        style={{
          fontSize: 11.5,
          fontWeight: 500,
          color: warn ? "var(--accent-deep)" : hasValue ? "var(--ink)" : "var(--ink-5)",
          fontVariantNumeric: "tabular-nums",
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
        background: "var(--surface-quiet)",
        border: "1px solid var(--hairline)",
        borderRadius: "var(--radius-md)",
        padding: "10px 12px",
        marginBottom: 8,
        cursor: onClick ? "pointer" : "default",
        fontFamily: "inherit",
        transition: "background 180ms var(--ease-out), border-color 180ms var(--ease-out)",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg)"; e.currentTarget.style.borderColor = "var(--hairline-strong)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "var(--surface-quiet)"; e.currentTarget.style.borderColor = "var(--hairline)"; }}
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
            color: "var(--ink)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {s.name || s.id}
        </span>
        <span
          className="font-mono pill-badge"
          style={{ fontSize: 9, padding: "1px 7px", color: "var(--ink-3)" }}
        >
          n={s.n_samples ?? 0}
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
        <MetricCell label="pH" value={s.ph} warn={METRIC_THRESHOLDS.ph(s.ph)} />
        <MetricCell label="Fe" value={s.iron} unit="mg/L" warn={METRIC_THRESHOLDS.iron(s.iron)} />
        <MetricCell label="Mn" value={s.manganese} unit="mg/L" warn={METRIC_THRESHOLDS.manganese(s.manganese)} />
        <MetricCell label="Acidity" value={s.acidity_mgL_caco3} unit="mg/L" warn={METRIC_THRESHOLDS.acidity(s.acidity_mgL_caco3)} />
      </div>
    </button>
  );
}

function AiCard({ narrative, narrativeLoading, question, onQuestionChange, answer, answerLoading, onAsk }) {
  return (
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
          onChange={(e) => onQuestionChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") onAsk(); }}
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
          onClick={onAsk}
          disabled={!question.trim() || answerLoading}
          className="pill-btn"
          style={{ fontSize: 11, padding: "4px 10px", flex: "none", opacity: question.trim() ? 1 : 0.4 }}
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
  const [narrative, setNarrative] = useState(null);
  const [narrativeLoading, setNarrativeLoading] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState(null);
  const [answerLoading, setAnswerLoading] = useState(false);

  useEffect(() => {
    if (!harm?.id) return;
    let cancelled = false;
    setNarrative(null);
    setNarrativeLoading(true);
    getHarmNarrative(harm.id)
      .then((d) => { if (!cancelled) setNarrative(d.narrative ?? "—"); })
      .catch((e) => { if (!cancelled) setNarrative(`Error: ${e.message}`); })
      .finally(() => { if (!cancelled) setNarrativeLoading(false); });
    return () => { cancelled = true; };
  }, [harm?.id]);

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
          className="pill-btn"
          style={{ fontSize: 10, padding: "3px 10px", marginBottom: 12 }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ display: "block" }}>
            <path d="M9.5 6h-7M5 2.5L1.5 6 5 9.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          {backLabel || "Back"}
        </button>
      ) : null}

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
            color: "var(--ink)",
            lineHeight: 1.4,
            flex: "1 1 auto",
            minWidth: 0,
          }}
        >
          {harm?.name || harm?.id}
        </span>
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

      <div
        style={{
          fontSize: 11,
          color: "var(--ink-3)",
          marginTop: 7,
          lineHeight: 1.55,
          display: "flex",
          flexWrap: "wrap",
          gap: 6,
          alignItems: "center",
        }}
      >
        {km.total_reach_length_km != null && (
          <>
            <span>Impacts</span>
            <span className="pill-badge font-mono" style={{ fontSize: 10 }}>
              {km.total_reach_length_km.toFixed(1)} km
            </span>
            <span>across</span>
            <span className="pill-badge font-mono" style={{ fontSize: 10 }}>
              {km.n_reaches ?? 0} reaches
            </span>
          </>
        )}
        {km.flow_gpm != null && (
          <>
            <span style={{ color: "var(--hairline-strong)" }}>·</span>
            <span className="pill-badge font-mono" style={{ fontSize: 10 }}>
              {km.flow_gpm} gpm
            </span>
          </>
        )}
      </div>

      {(narrativeLoading || narrative !== null) ? (
        <AiCard
          narrative={narrative}
          narrativeLoading={narrativeLoading}
          question={question}
          onQuestionChange={setQuestion}
          answer={answer}
          answerLoading={answerLoading}
          onAsk={() => {
            if (!question.trim() || answerLoading || !harm?.id) return;
            setAnswer(null);
            setAnswerLoading(true);
            askHarmQuestion(harm.id, question)
              .then((d) => setAnswer(d.answer ?? "—"))
              .catch((e) => setAnswer(`Error: ${e.message}`))
              .finally(() => setAnswerLoading(false));
          }}
        />
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
            <button
              type="button"
              className="pill-btn"
              onClick={() => setStationsExpanded((v) => !v)}
              style={{ marginTop: 4, fontSize: 10 }}
            >
              {stationsExpanded
                ? "Collapse"
                : `Show ${sortedStations.length - STATION_PREVIEW_LIMIT} more`}
            </button>
          ) : null}
        </Section>
      ) : (
        <Section title="Monitoring evidence">
          <div style={{ color: "var(--ink-4)", fontSize: 11, lineHeight: 1.55 }}>
            No stations along the 20 km downstream chain recorded sample data.
          </div>
        </Section>
      )}

      {collieries.length > 0 ? (
        <Section title="Source collieries" count={collieries.length}>
          {!collieriesExpanded ? (
            <button
              type="button"
              className="pill-btn"
              onClick={() => setCollieriesExpanded(true)}
              style={{ fontSize: 10 }}
            >
              Show list
            </button>
          ) : (
            <>
              {collieries.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onFocus?.("colliery", c.id)}
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    gap: 8,
                    width: "100%",
                    textAlign: "left",
                    background: "transparent",
                    border: "none",
                    borderBottom: "1px solid var(--hairline-soft)",
                    padding: "7px 0",
                    cursor: onFocus ? "pointer" : "default",
                    fontFamily: "inherit",
                  }}
                >
                  <span style={{ fontSize: 11, color: "var(--ink)", flex: 1, minWidth: 0 }}>
                    {c.name || c.id}
                  </span>
                  {c.distance_m != null && (
                    <span className="font-mono pill-badge" style={{ fontSize: 9, padding: "1px 6px", color: "var(--ink-4)" }}>
                      {c.distance_m} m
                    </span>
                  )}
                  {c.status && (
                    <span style={{ fontSize: 9.5, color: "var(--ink-4)" }}>
                      {c.status}
                    </span>
                  )}
                </button>
              ))}
              <button
                type="button"
                className="pill-btn"
                onClick={() => setCollieriesExpanded(false)}
                style={{ marginTop: 6, fontSize: 10 }}
              >
                Collapse
              </button>
            </>
          )}
        </Section>
      ) : null}

      <div
        style={{
          marginTop: 24,
          paddingTop: 12,
          borderTop: "1px solid var(--hairline)",
          fontSize: 9.5,
          color: "var(--ink-4)",
          lineHeight: 1.7,
          letterSpacing: "0.01em",
        }}
      >
        {tw?.start && tw?.end ? (
          <div>Sample window · {tw.start} → {tw.end}</div>
        ) : null}
        {km.sf_priority ? <div>PA DEP priority · {km.sf_priority}</div> : null}
        <div>Source · PA DEP AML Inventory</div>
      </div>
    </div>
  );
}

export default HarmPanel;

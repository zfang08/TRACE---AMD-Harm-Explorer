import React, { useEffect, useState } from "react";
import { getHarmsBySegmentId } from "../services/api";

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

const STATUS_COLOR = {
  ACTIVE: "#0a0a0a",
  RECLAMATION_COMPLETED: "#65a30d",
};
const STATUS_LABEL = {
  ACTIVE: "Active",
  INACTIVE: "Inactive",
  ABANDONED: "Abandoned",
  PROPOSED_NEVER_REALIZED: "Proposed",
  RECLAMATION_COMPLETED: "Reclaimed",
};
const STATUS_ORDER = { ACTIVE: 0, INACTIVE: 1, ABANDONED: 2, PROPOSED_NEVER_REALIZED: 3, RECLAMATION_COMPLETED: 4 };

const KM_OPTIONS = [20, 50, 100];

function KmSelector({ value, onChange }) {
  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        padding: 2,
        background: "var(--bg-3)",
        borderRadius: 999,
        border: "1px solid var(--hairline)",
      }}
    >
      <span
        aria-hidden
        style={{
          position: "absolute",
          top: 2,
          bottom: 2,
          left: value === 20 ? 2 : value === 50 ? "calc(33.33% + 0px)" : "calc(66.67% - 2px)",
          width: "calc(33.33% - 2px)",
          background: "var(--ink)",
          borderRadius: 999,
          transition: "left 240ms cubic-bezier(0.22,1,0.36,1)",
          boxShadow: "0 1px 2px rgba(0,0,0,0.2)",
        }}
      />
      {KM_OPTIONS.map((km) => (
        <button
          key={km}
          type="button"
          onClick={() => onChange(km)}
          style={{
            position: "relative",
            flex: 1,
            background: "transparent",
            border: "none",
            padding: "4px 0",
            fontSize: 9.5,
            fontWeight: 600,
            letterSpacing: "0.08em",
            color: value === km ? "var(--bg)" : "var(--ink-3)",
            cursor: "pointer",
            fontFamily: "var(--font-mono)",
            transition: "color 240ms cubic-bezier(0.22,1,0.36,1)",
            zIndex: 1,
          }}
        >
          {km} km
        </button>
      ))}
    </div>
  );
}

function LoadingDots() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
      <span className="font-mono" style={{ fontSize: 9.5, color: "var(--ink-4)", letterSpacing: "0.14em", textTransform: "uppercase" }}>Loading</span>
      <span className="loading-dot" />
      <span className="loading-dot" />
      <span className="loading-dot" />
    </div>
  );
}

function SegmentPanel({
  segmentProperties,
  onHarmSelect,
  upstreamKm = 20,
  onUpstreamKmChange,
  upstreamResult,
}) {
  const segmentId = segmentProperties?.id;
  const [harms, setHarms] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!segmentId) { setHarms([]); return; }
    let cancelled = false;
    setLoading(true);
    getHarmsBySegmentId(segmentId)
      .then((rows) => { if (!cancelled) { setHarms(rows || []); setLoading(false); } })
      .catch(() => { if (!cancelled) { setHarms([]); setLoading(false); } });
    return () => { cancelled = true; };
  }, [segmentId]);

  if (!segmentProperties) {
    return (
      <div style={{ padding: 14, color: "var(--ink-4)", fontSize: 11, lineHeight: 1.55 }}>
        No properties for this segment yet — streams layer still loading.
      </div>
    );
  }

  const sortedHarms = [...harms].sort((a, b) => {
    const order = { extreme: 4, high: 3, medium: 2, low: 1 };
    return (order[b.severity] || 0) - (order[a.severity] || 0);
  });

  const upstreamCollieries = upstreamResult?.collieries
    ? [...upstreamResult.collieries].sort(
        (a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9)
      )
    : null;

  const upstreamSegCount = upstreamResult?.segmentIds?.length ?? null;

  return (
    <div style={{ padding: 14, fontSize: 11.5 }}>
      <h2 style={{ margin: 0, fontSize: 13.5, fontWeight: 500, color: "var(--ink)", lineHeight: 1.4 }}>
        {segmentProperties.name || (
          <em style={{ fontStyle: "italic", color: "var(--ink-3)" }}>unnamed creek</em>
        )}
      </h2>
      <p className="font-mono" style={{ margin: "5px 0 0", fontSize: 9.5, color: "var(--ink-4)", letterSpacing: "0.04em" }}>
        NHD ID {segmentId}
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
        <span className="font-mono" style={{ fontSize: 9, color: "var(--ink-4)", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 500 }}>HUC8</span>
        <span className="font-mono" style={{ fontSize: 10.5, color: "var(--ink)" }}>{segmentProperties.huc8 || "—"}</span>

        <span className="font-mono" style={{ fontSize: 9, color: "var(--ink-4)", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 500 }}>Length</span>
        <span className="font-mono" style={{ fontSize: 10.5, color: "var(--ink)", fontVariantNumeric: "tabular-nums" }}>
          {segmentProperties.length_km != null
            ? `${segmentProperties.length_km.toFixed(2)} km`
            : "—"}
        </span>

        <span className="font-mono" style={{ fontSize: 9, color: "var(--ink-4)", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 500 }}>Type</span>
        <span className="font-mono" style={{ fontSize: 10.5, color: "var(--ink)" }}>{segmentProperties.ftype || "—"}</span>
      </div>

      {/* ── Upstream attribution ── */}
      <div style={{ marginTop: 20 }}>
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
          <span>Upstream attribution</span>
          {upstreamCollieries != null && (
            <span className="pill-badge" style={{ fontSize: 8, padding: "1px 6px", lineHeight: 1.6 }}>
              {upstreamCollieries.length} mines
            </span>
          )}
          <span style={{ flex: 1, height: 1, background: "var(--hairline)" }} />
        </div>

        <KmSelector value={upstreamKm} onChange={onUpstreamKmChange} />

        {upstreamSegCount != null && (
          <p className="font-mono" style={{ margin: "8px 0 0", fontSize: 9, color: "var(--ink-4)", letterSpacing: "0.06em" }}>
            {upstreamSegCount} reaches traced · {upstreamCollieries?.length ?? 0} collieries found
          </p>
        )}

        {upstreamCollieries == null ? (
          <LoadingDots />
        ) : upstreamCollieries.length === 0 ? (
          <p style={{ color: "var(--ink-4)", fontSize: 11, marginTop: 8, lineHeight: 1.55 }}>
            No collieries within {upstreamKm} km upstream.
          </p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: "10px 0 0" }}>
            {upstreamCollieries.map((c) => {
              const statusColor = STATUS_COLOR[c.status] || "#a3a3a3";
              const statusLabel = STATUS_LABEL[c.status] || c.status || "Unknown";
              return (
                <li key={c.id} style={{ marginBottom: 5 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "6px 10px",
                      background: "var(--surface-quiet)",
                      border: "1px solid var(--hairline)",
                      borderRadius: "var(--radius-md)",
                    }}
                  >
                    <span
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: 1,
                        background: statusColor,
                        flex: "none",
                        transform: "rotate(45deg)",
                      }}
                    />
                    <span style={{ flex: 1, fontSize: 10.5, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
                      {c.name || c.id}
                    </span>
                    <span className="font-mono" style={{ fontSize: 8, color: statusColor, letterSpacing: "0.08em", textTransform: "uppercase", flex: "none" }}>
                      {statusLabel}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* ── Harms passing through ── */}
      <div style={{ marginTop: 20 }}>
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
          <span>Harms passing through</span>
          {!loading && (
            <span className="pill-badge" style={{ fontSize: 8, padding: "1px 6px", lineHeight: 1.6 }}>
              {sortedHarms.length}
            </span>
          )}
          <span style={{ flex: 1, height: 1, background: "var(--hairline)" }} />
        </div>

        {loading ? (
          <LoadingDots />
        ) : sortedHarms.length === 0 ? (
          <p style={{ color: "var(--ink-4)", fontSize: 11, marginTop: 8, lineHeight: 1.55 }}>
            No AMD harms flow through this reach.
          </p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: "8px 0 0" }}>
            {sortedHarms.map((h) => {
              const sev = h.severity || "low";
              return (
                <li key={h.id} style={{ marginBottom: 6 }}>
                  <button
                    type="button"
                    onClick={() => onHarmSelect(h.id)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      width: "100%",
                      background: "var(--surface-quiet)",
                      border: "1px solid var(--hairline)",
                      borderRadius: "var(--radius-md)",
                      padding: "7px 10px",
                      cursor: "pointer",
                      fontSize: 11,
                      textAlign: "left",
                      transition: "background 160ms var(--ease-out), border-color 160ms var(--ease-out)",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg)"; e.currentTarget.style.borderColor = "var(--hairline-strong)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "var(--surface-quiet)"; e.currentTarget.style.borderColor = "var(--hairline)"; }}
                  >
                    <span
                      style={{
                        display: "inline-block",
                        background: SEVERITY_BG[sev] || "var(--ink-4)",
                        color: SEVERITY_FG[sev] || "#ffffff",
                        padding: "2px 7px",
                        borderRadius: 999,
                        fontSize: 8.5,
                        fontWeight: 700,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                        flex: "none",
                      }}
                    >
                      {sev}
                    </span>
                    <span style={{ color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
                      {h.name || h.id}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

export default SegmentPanel;

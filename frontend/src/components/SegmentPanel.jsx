import React, { useEffect, useState } from "react";
import { getHarmsBySegmentId } from "../services/api";

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
 * Stream-segment detail panel. Shows segment props + the harms whose downstream
 * chain passes through this reach.
 */
function SegmentPanel({ segmentProperties, onHarmSelect }) {
  const segmentId = segmentProperties?.id;
  const [harms, setHarms] = useState([]);

  useEffect(() => {
    if (!segmentId) {
      setHarms([]);
      return;
    }
    let cancelled = false;
    getHarmsBySegmentId(segmentId)
      .then((rows) => !cancelled && setHarms(rows || []))
      .catch(() => !cancelled && setHarms([]));
    return () => {
      cancelled = true;
    };
  }, [segmentId]);

  if (!segmentProperties) {
    return (
      <div
        style={{
          padding: 16,
          color: "#94a3b8",
          fontSize: 12,
          fontStyle: "italic",
        }}
      >
        No properties for this segment yet — streams layer still loading.
      </div>
    );
  }

  const sortedHarms = [...harms].sort((a, b) => {
    const order = { extreme: 4, high: 3, medium: 2, low: 1 };
    return (order[b.severity] || 0) - (order[a.severity] || 0);
  });

  return (
    <div style={{ padding: 16, fontSize: 13 }}>
      <h2
        style={{
          margin: 0,
          fontSize: 15,
          fontWeight: 500,
          color: "#0f172a",
          lineHeight: 1.4,
          letterSpacing: "0.01em",
        }}
      >
        {segmentProperties.name || (
          <em style={{ fontStyle: "italic", color: "#64748b" }}>
            unnamed creek
          </em>
        )}
      </h2>
      <p
        style={{
          margin: "4px 0 0",
          fontSize: 11,
          fontStyle: "italic",
          color: "#94a3b8",
        }}
      >
        NHD ID {segmentId}
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "auto 1fr",
          gap: "4px 12px",
          fontSize: 12.5,
          marginTop: 12,
        }}
      >
        <strong style={{ color: "#475569" }}>HUC8</strong>
        <span style={{ color: "#0f172a" }}>
          {segmentProperties.huc8 || "—"}
        </span>
        <strong style={{ color: "#475569" }}>Length</strong>
        <span style={{ color: "#0f172a", fontVariantNumeric: "tabular-nums" }}>
          {segmentProperties.length_km != null
            ? `${segmentProperties.length_km.toFixed(2)} km`
            : "—"}
        </span>
        <strong style={{ color: "#475569" }}>Type</strong>
        <span style={{ color: "#0f172a" }}>
          {segmentProperties.ftype || "—"}
        </span>
      </div>

      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          color: "#475569",
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          marginTop: 18,
        }}
      >
        Harms passing through{" "}
        <span style={{ color: "#cbd5e1", fontWeight: 500 }}>
          ({sortedHarms.length})
        </span>
      </div>

      {sortedHarms.length === 0 ? (
        <p
          style={{
            color: "#94a3b8",
            fontSize: 12,
            fontStyle: "italic",
            marginTop: 8,
          }}
        >
          No AMD harms flow through this reach (outside any 20 km downstream
          chain).
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
                    background: "transparent",
                    border: "1px solid rgba(15,23,42,0.12)",
                    borderRadius: 6,
                    padding: "5px 8px",
                    cursor: "pointer",
                    fontSize: 12,
                    textAlign: "left",
                    fontFamily: "inherit",
                  }}
                >
                  <span
                    style={{
                      display: "inline-block",
                      background: SEVERITY_BG[sev] || "#94a3b8",
                      color: SEVERITY_FG[sev] || "#ffffff",
                      padding: "2px 6px",
                      borderRadius: 3,
                      fontSize: 9,
                      fontWeight: 700,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      flex: "none",
                    }}
                  >
                    {sev}
                  </span>
                  <span
                    style={{
                      color: "#0f172a",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      minWidth: 0,
                    }}
                  >
                    {h.name || h.id}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default SegmentPanel;

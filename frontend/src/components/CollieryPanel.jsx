
import React from "react";

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

function CollieryPanel({ colliery, onHarmSelect }) {
  // linked_harms is injected server-side as [{id, name, severity}, ...]
  const linkedHarms = colliery?.linked_harms || [];

  return (
    <div style={{ padding: 14, fontSize: 11.5 }}>
      <h2
        style={{
          margin: 0,
          fontSize: 13.5,
          fontWeight: 500,
          color: "#0f172a",
          lineHeight: 1.4,
          letterSpacing: "0.01em",
        }}
      >
        {colliery?.name || "—"}
      </h2>
      {colliery?.operator ? (
        <p
          style={{
            margin: "5px 0 0",
            fontSize: 11,
            fontStyle: "italic",
            color: "#64748b",
            lineHeight: 1.55,
          }}
        >
          {colliery.operator}
        </p>
      ) : null}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "auto 1fr",
          gap: "6px 12px",
          fontSize: 11,
          marginTop: 14,
        }}
      >
        <strong style={{ color: "#475569" }}>Status</strong>
        <span style={{ color: "#0f172a" }}>{colliery?.status || "—"}</span>
      </div>

      <div
        style={{
          marginTop: 20,
          fontSize: 9.5,
          fontWeight: 600,
          color: "#64748b",
          letterSpacing: "0.14em",
          textTransform: "uppercase",
        }}
      >
        Linked AMD harms{" "}
        <span style={{ color: "#cbd5e1", fontWeight: 500 }}>
          ({linkedHarms.length})
        </span>
      </div>

      {linkedHarms.length === 0 ? (
        <p
          style={{
            color: "#94a3b8",
            fontSize: 11,
            fontStyle: "italic",
            marginTop: 8,
            lineHeight: 1.55,
          }}
        >
          No AMD harms linked. (No registered AMD discharge within a 2 km
          radius of this colliery.)
        </p>
      ) : (
        <ul
          style={{
            listStyle: "none",
            padding: 0,
            margin: "8px 0 0",
          }}
        >
          {linkedHarms.map((h) => {
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
                    padding: "6px 9px",
                    cursor: "pointer",
                    fontSize: 11,
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
                      fontSize: 8.5,
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

export default CollieryPanel;

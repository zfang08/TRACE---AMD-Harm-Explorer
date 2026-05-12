import React from "react";

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

function CollieryPanel({ colliery, onHarmSelect }) {
  const linkedHarms = colliery?.linked_harms || [];

  return (
    <div style={{ padding: 14, fontSize: 11.5 }}>
      <h2
        style={{
          margin: 0,
          fontSize: 13.5,
          fontWeight: 500,
          color: "var(--ink)",
          lineHeight: 1.4,
        }}
      >
        {colliery?.name || "—"}
      </h2>
      {colliery?.operator ? (
        <p style={{ margin: "5px 0 0", fontSize: 11, color: "var(--ink-3)", lineHeight: 1.55 }}>
          {colliery.operator}
        </p>
      ) : null}

      <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 8 }}>
        <span className="font-mono" style={{ fontSize: 9, color: "var(--ink-4)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
          Status
        </span>
        <span className="pill-badge font-mono" style={{ fontSize: 10 }}>
          {colliery?.status || "—"}
        </span>
      </div>

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
          <span>Linked AMD harms</span>
          <span className="pill-badge" style={{ fontSize: 8, padding: "1px 6px", lineHeight: 1.6 }}>
            {linkedHarms.length}
          </span>
          <span style={{ flex: 1, height: 1, background: "var(--hairline)" }} />
        </div>

        {linkedHarms.length === 0 ? (
          <p style={{ color: "var(--ink-4)", fontSize: 11, marginTop: 8, lineHeight: 1.55 }}>
            No AMD harms linked. (No registered AMD discharge within a 2 km radius of this colliery.)
          </p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: "8px 0 0" }}>
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
                      background: "var(--surface-quiet)",
                      border: "1px solid var(--hairline)",
                      borderRadius: "var(--radius-md)",
                      padding: "7px 10px",
                      cursor: "pointer",
                      fontSize: 11,
                      textAlign: "left",
                      fontFamily: "inherit",
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
                    <span
                      style={{
                        color: "var(--ink)",
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
    </div>
  );
}

export default CollieryPanel;

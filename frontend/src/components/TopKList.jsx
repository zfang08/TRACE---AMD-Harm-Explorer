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

// Colliery status colors — kept in sync with MapView (earth / stone palette)
const STATUS_COLOR = {
  ACTIVE: "#1e293b",
  INACTIVE: "#94a3b8",
  ABANDONED: "#475569",
  RECLAMATION_COMPLETED: "#65a30d",
  PROPOSED_NEVER_REALIZED: "#cbd5e1",
};

function SectionTitle({ title, subtitle }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          color: "#475569",
          letterSpacing: "0.14em",
          textTransform: "uppercase",
        }}
      >
        {title}
      </div>
      {subtitle ? (
        <div
          style={{
            fontSize: 10,
            color: "#94a3b8",
            fontStyle: "italic",
            marginTop: 3,
            letterSpacing: "0.02em",
            lineHeight: 1.5,
          }}
        >
          {subtitle}
        </div>
      ) : null}
    </div>
  );
}

function CollieryRow({ rank, item, onPick }) {
  return (
    <button
      type="button"
      onClick={() => onPick?.(item.id)}
      style={{
        display: "grid",
        gridTemplateColumns: "20px 1fr auto",
        alignItems: "center",
        gap: 8,
        width: "100%",
        textAlign: "left",
        padding: "6px 6px",
        background: "transparent",
        border: "none",
        borderBottom: "1px solid rgba(15,23,42,0.04)",
        cursor: "pointer",
        fontSize: 12,
      }}
      onMouseEnter={(e) =>
        (e.currentTarget.style.background = "rgba(15,23,42,0.04)")
      }
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <span
        style={{
          fontSize: 11,
          color: "#cbd5e1",
          fontWeight: 500,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {rank}
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
        <span
          style={{
            display: "inline-block",
            width: 6,
            height: 6,
            borderRadius: 1,
            background: STATUS_COLOR[item.status] || "#9ca3af",
            marginRight: 6,
            verticalAlign: "middle",
          }}
        />
        {item.name}
      </span>
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: "#475569",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {item.score}
      </span>
    </button>
  );
}

function HarmRow({ rank, item, onPick }) {
  const sev = item.severity || "low";
  return (
    <button
      type="button"
      onClick={() => onPick?.(item.id)}
      style={{
        display: "grid",
        gridTemplateColumns: "20px 56px 1fr auto",
        alignItems: "center",
        gap: 8,
        width: "100%",
        textAlign: "left",
        padding: "6px 6px",
        background: "transparent",
        border: "none",
        borderBottom: "1px solid rgba(15,23,42,0.04)",
        cursor: "pointer",
        fontSize: 12,
      }}
      onMouseEnter={(e) =>
        (e.currentTarget.style.background = "rgba(15,23,42,0.04)")
      }
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <span
        style={{
          fontSize: 11,
          color: "#cbd5e1",
          fontWeight: 500,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {rank}
      </span>
      <span
        style={{
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          background: SEVERITY_BG[sev] || "#94a3b8",
          color: SEVERITY_FG[sev] || "#fff",
          padding: "2px 4px",
          borderRadius: 3,
          textAlign: "center",
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
        {item.name}
      </span>
      <span
        style={{
          fontSize: 10,
          color: "#94a3b8",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {item.flow_gpm != null ? `${item.flow_gpm} gpm` : "—"}
      </span>
    </button>
  );
}

function TopKList({ title, subtitle, items, kind, onPick }) {
  if (!items || items.length === 0) {
    return (
      <div style={{ marginTop: 14 }}>
        <SectionTitle title={title} subtitle={subtitle} />
        <div style={{ fontSize: 11, color: "#94a3b8", padding: "6px 0" }}>
          Loading…
        </div>
      </div>
    );
  }
  return (
    <div style={{ marginTop: 14 }}>
      <SectionTitle title={title} subtitle={subtitle} />
      <div>
        {items.map((it, i) =>
          kind === "harm" ? (
            <HarmRow key={it.id} rank={i + 1} item={it} onPick={onPick} />
          ) : (
            <CollieryRow key={it.id} rank={i + 1} item={it} onPick={onPick} />
          ),
        )}
      </div>
    </div>
  );
}

export default TopKList;

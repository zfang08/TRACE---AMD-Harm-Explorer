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

const STATUS_COLOR = {
  ACTIVE: "#0a0a0a",
  INACTIVE: "#a3a3a3",
  ABANDONED: "#404040",
  RECLAMATION_COMPLETED: "#65a30d",
  PROPOSED_NEVER_REALIZED: "#d4d4d4",
};

function SectionTitle({ title, subtitle }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div
        className="font-mono"
        style={{
          fontSize: 9,
          fontWeight: 500,
          color: "var(--ink-3)",
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span>{title}</span>
        <span style={{ flex: 1, height: 1, background: "var(--hairline)" }} />
      </div>
      {subtitle ? (
        <div style={{ fontSize: 9.5, color: "var(--ink-4)", marginTop: 4, lineHeight: 1.55 }}>
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
        gridTemplateColumns: "18px 1fr auto",
        alignItems: "center",
        gap: 8,
        width: "100%",
        textAlign: "left",
        padding: "6px 4px",
        background: "transparent",
        border: "none",
        borderBottom: "1px solid var(--hairline-soft)",
        cursor: "pointer",
        fontSize: 11,
        fontFamily: "inherit",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(0,0,0,0.03)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <span className="font-mono" style={{ fontSize: 9.5, color: "var(--ink-5)", fontVariantNumeric: "tabular-nums" }}>
        {rank}
      </span>
      <span style={{ color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
        <span
          style={{
            display: "inline-block",
            width: 6,
            height: 6,
            borderRadius: 1,
            background: STATUS_COLOR[item.status] || "var(--ink-4)",
            marginRight: 6,
            verticalAlign: "middle",
          }}
        />
        {item.name}
      </span>
      <span className="font-mono" style={{ fontSize: 10, fontWeight: 600, color: "var(--ink-2)", fontVariantNumeric: "tabular-nums" }}>
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
        gridTemplateColumns: "18px 48px 1fr auto",
        alignItems: "center",
        gap: 8,
        width: "100%",
        textAlign: "left",
        padding: "6px 4px",
        background: "transparent",
        border: "none",
        borderBottom: "1px solid var(--hairline-soft)",
        cursor: "pointer",
        fontSize: 11,
        fontFamily: "inherit",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(0,0,0,0.03)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <span className="font-mono" style={{ fontSize: 9.5, color: "var(--ink-5)", fontVariantNumeric: "tabular-nums" }}>
        {rank}
      </span>
      <span
        style={{
          fontSize: 8.5,
          fontWeight: 700,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          background: SEVERITY_BG[sev] || "var(--ink-4)",
          color: SEVERITY_FG[sev] || "#fff",
          padding: "2px 6px",
          borderRadius: 999,
          textAlign: "center",
        }}
      >
        {sev}
      </span>
      <span style={{ color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
        {item.name}
      </span>
      <span className="font-mono" style={{ fontSize: 9.5, color: "var(--ink-4)", fontVariantNumeric: "tabular-nums" }}>
        {item.flow_gpm != null ? `${item.flow_gpm} gpm` : "—"}
      </span>
    </button>
  );
}

function TopKList({ title, subtitle, items, kind, onPick }) {
  if (!items || items.length === 0) {
    return (
      <div style={{ marginTop: 16 }}>
        <SectionTitle title={title} subtitle={subtitle} />
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0" }}>
          <span className="font-mono" style={{ fontSize: 9.5, color: "var(--ink-4)", letterSpacing: "0.14em", textTransform: "uppercase" }}>Loading</span>
          <span className="loading-dot" />
          <span className="loading-dot" />
          <span className="loading-dot" />
        </div>
      </div>
    );
  }
  return (
    <div style={{ marginTop: 16 }}>
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

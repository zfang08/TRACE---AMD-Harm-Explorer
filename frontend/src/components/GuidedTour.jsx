import React from "react";

// Swatara Creek AMD — the canonical causal chain in this dataset:
// 8 collieries → discharge point 2039-07 → 21.5 km of Swatara Creek
export const TOUR_STEPS = [
  {
    id: "overview",
    label: "Context",
    title: "Pennsylvania's AMD Crisis",
    body: "More than 2,500 km of streams in the Anthracite coal region are acidified by abandoned mine drainage. This tour traces one discharge — from colliery to creek — using real PA DEP data.",
    camera: { center: [-76.38, 40.67], zoom: 10, pitch: 40, bearing: -15, duration: 2200 },
    action: null,
  },
  {
    id: "colliery",
    label: "Source",
    title: "KEYSTONE MINE — Active Operation",
    body: "COMM ENV SYS LDFL KEYSTONE MINE sits 654 m uphill from the discharge point. Decades of underground mining have fractured the local aquifer, letting iron-rich groundwater pool in the abandoned void.",
    camera: { center: [-76.3658, 40.675], zoom: 14, pitch: 50, bearing: 10, duration: 1800 },
    action: { type: "focus", kind: "colliery", id: "coll_4605" },
  },
  {
    id: "discharge",
    label: "Discharge",
    title: "AMD Point 2039-07",
    body: "PA DEP AML site #816083 — status \"Abandoned,\" remediation priority not yet assigned. It discharges 6 GPM of acidic water directly into the headwaters of Swatara Creek.",
    camera: { center: [-76.3653, 40.6809], zoom: 14, pitch: 50, bearing: -20, duration: 1800 },
    action: { type: "focus", kind: "pollution_source", id: "amd-816083" },
  },
  {
    id: "simulate",
    label: "Flow",
    title: "Downstream Advection",
    body: "Watch acidic particles travel south through the stream network. The gradient — deep rust fading to grey — represents pH dilution as the plume mixes with cleaner tributaries.",
    camera: { center: [-76.39, 40.655], zoom: 12, pitch: 45, bearing: -10, duration: 2000 },
    action: { type: "simulate" },
  },
  {
    id: "station",
    label: "Monitor",
    title: "Station SWAT_HW — pH 5.12",
    body: "The SWAT_HW monitoring station records mean pH 5.12 — more than a full unit below the EPA threshold of 6.5. At this acidity, aquatic invertebrates and cold-water fish cannot survive.",
    camera: { center: [-76.3456, 40.6583], zoom: 14, pitch: 35, bearing: 5, duration: 1800 },
    action: { type: "focus", kind: "station", id: "21PA_WQX-SWAT_HW" },
  },
  {
    id: "harm",
    label: "Evidence",
    title: "The Harm Evidence Packet",
    body: "The AMD Harm record links 8 collieries, 4 monitoring stations, and 15 stream reaches across 21.5 km of Swatara Creek — all causally traced to this single discharge point.",
    camera: { center: [-76.4, 40.63], zoom: 11, pitch: 45, bearing: -25, duration: 2200 },
    action: { type: "harm", id: "harm-amd-816083" },
  },
];

export default function GuidedTour({ stepIndex, onNext, onBack, onExit }) {
  const step = TOUR_STEPS[stepIndex];
  const total = TOUR_STEPS.length;
  if (!step) return null;

  const isFirst = stepIndex === 0;
  const isLast = stepIndex === total - 1;

  return (
    <div style={{ padding: "10px 12px 14px", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span
            className="font-mono"
            style={{
              fontSize: 8.5,
              fontWeight: 600,
              color: "var(--accent)",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
            }}
          >
            TOUR
          </span>
          <span
            className="font-mono"
            style={{ fontSize: 8.5, color: "var(--ink-4)", letterSpacing: "0.06em" }}
          >
            {String(stepIndex + 1).padStart(2, "0")}&thinsp;/&thinsp;{String(total).padStart(2, "0")}
          </span>
        </div>
        <button
          type="button"
          onClick={onExit}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            fontSize: 9,
            color: "var(--ink-3)",
            background: "none",
            border: "none",
            cursor: "pointer",
            fontFamily: "inherit",
            padding: "2px 4px",
            letterSpacing: "0.04em",
          }}
        >
          <span style={{ fontSize: 8 }}>✕</span>
          Exit
        </button>
      </div>

      {/* Progress bar segments */}
      <div style={{ display: "flex", gap: 3, marginBottom: 16 }}>
        {TOUR_STEPS.map((s, i) => (
          <div
            key={s.id}
            style={{
              height: 2,
              flex: 1,
              borderRadius: 999,
              background: i <= stepIndex ? "var(--accent)" : "var(--hairline-strong)",
              transition: "background 300ms var(--ease-out)",
            }}
          />
        ))}
      </div>

      {/* Step label */}
      <div
        className="font-mono"
        style={{
          fontSize: 8.5,
          fontWeight: 600,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--ink-3)",
          marginBottom: 5,
        }}
      >
        {step.label}
      </div>

      {/* Title */}
      <h3
        style={{
          margin: "0 0 10px",
          fontSize: 14,
          fontWeight: 500,
          letterSpacing: "-0.02em",
          lineHeight: 1.2,
          color: "var(--ink)",
        }}
      >
        {step.title}
      </h3>

      {/* Body */}
      <p
        style={{
          margin: "0 0 18px",
          fontSize: 10.5,
          lineHeight: 1.65,
          color: "var(--ink-2)",
          letterSpacing: "-0.005em",
        }}
      >
        {step.body}
      </p>

      {/* Navigation */}
      <div style={{ display: "flex", gap: 6 }}>
        <button
          type="button"
          onClick={onBack}
          disabled={isFirst}
          style={{
            flex: 1,
            padding: "6px 10px",
            fontSize: 10,
            fontWeight: 500,
            fontFamily: "inherit",
            border: "1px solid var(--hairline-strong)",
            borderRadius: 999,
            background: "var(--surface-strong)",
            color: isFirst ? "var(--ink-5)" : "var(--ink-2)",
            cursor: isFirst ? "default" : "pointer",
            letterSpacing: "-0.005em",
            transition: "background 160ms var(--ease-out), color 160ms var(--ease-out)",
          }}
        >
          ← Back
        </button>
        <button
          type="button"
          onClick={onNext}
          style={{
            flex: 1.8,
            padding: "6px 10px",
            fontSize: 10,
            fontWeight: 500,
            fontFamily: "inherit",
            border: `1px solid ${isLast ? "var(--accent)" : "var(--ink)"}`,
            borderRadius: 999,
            background: isLast ? "var(--accent)" : "var(--ink)",
            color: "var(--bg)",
            cursor: "pointer",
            letterSpacing: "-0.005em",
            transition: "background 160ms var(--ease-out), border-color 160ms var(--ease-out)",
          }}
        >
          {isLast ? "Finish" : "Next →"}
        </button>
      </div>
    </div>
  );
}

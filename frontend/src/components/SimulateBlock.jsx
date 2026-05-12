import React, { useState } from "react";
import { createPortal } from "react-dom";
import katex from "katex";
import "katex/dist/katex.min.css";

function Tex({ children, block = false }) {
  const html = katex.renderToString(children, {
    displayMode: block,
    throwOnError: false,
    strict: false,
  });
  return block ? (
    <div
      dangerouslySetInnerHTML={{ __html: html }}
      style={{ overflowX: "auto", margin: "10px 0" }}
    />
  ) : (
    <span dangerouslySetInnerHTML={{ __html: html }} />
  );
}

/**
 * Inline "Simulate transport" block embedded in HarmPanel and
 * PollutionSourcePanel. Toggles the particle simulation; explains what the
 * animation actually models.
 *
 * 多源支持：simulationSourceIds 是当前参与模拟的 AMD 集合，第 0 个是 anchor
 * （即 analysisFocus 当前选中的 AMD），不能被移除；剩下的是用户在 addMode
 * 下在地图上点选加进来的 extras，可以用 chip 上的 × 摘掉。
 */

const SEVERITY_DOT = {
  extreme: "#7a1e10",
  high: "#b9341e",
  medium: "#b9341e",
  low: "#fda4af",
};

function SourceChip({ source, isAnchor, onRemove }) {
  const sev = source?.severity || "low";
  const name = source?.name || source?.id || "—";
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "3px 8px 3px 6px",
        background: "rgba(255,255,255,0.85)",
        border: "1px solid var(--hairline-strong)",
        borderRadius: 999,
        fontSize: 10,
        color: "var(--ink)",
        fontFamily: "inherit",
        maxWidth: "100%",
      }}
    >
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: SEVERITY_DOT[sev] || "var(--ink-4)",
          flex: "none",
        }}
      />
      {isAnchor ? (
        <span
          style={{
            fontSize: 8.5,
            color: "var(--ink-4)",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            fontWeight: 700,
          }}
          title="Anchor source (the AMD currently in analysis)"
        >
          anchor
        </span>
      ) : null}
      <span
        style={{
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          maxWidth: 120,
        }}
        title={name}
      >
        {name}
      </span>
      {!isAnchor && onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${name}`}
          style={{
            background: "transparent",
            border: "none",
            color: "var(--ink-3)",
            cursor: "pointer",
            fontSize: 12,
            lineHeight: 1,
            padding: "0 0 0 2px",
            fontFamily: "inherit",
          }}
        >
          ×
        </button>
      ) : null}
    </div>
  );
}

// ─── Learn More modal ────────────────────────────────────────────────────────

const SECTION_STYLE = {
  marginBottom: 22,
};
const H_STYLE = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "var(--ink)",
  marginBottom: 8,
  marginTop: 0,
};
const P_STYLE = {
  fontSize: 12,
  lineHeight: 1.7,
  color: "var(--ink-2)",
  margin: "0 0 8px 0",
};

const BADGE_STYLE = (color) => ({
  display: "inline-block",
  padding: "1px 7px",
  borderRadius: 999,
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.06em",
  background: color + "22",
  color: color,
  marginRight: 4,
});

function LearnMoreModal({ onClose }) {
  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg)",
          borderRadius: 14,
          boxShadow: "0 24px 64px rgba(0,0,0,0.22)",
          width: "100%",
          maxWidth: 560,
          maxHeight: "82vh",
          overflow: "hidden",
          fontFamily: "inherit",
          position: "relative",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          className="sidebar-scroll"
          style={{ overflowY: "auto", padding: "28px 30px 32px", flex: 1 }}
        >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 22 }}>
          <div>
            <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--ink-4)", marginBottom: 4 }}>
              Simulation
            </div>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "var(--ink)", lineHeight: 1.3 }}>
              How the transport model works
            </h2>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "rgba(0,0,0,0.06)",
              border: "none",
              borderRadius: 8,
              width: 30,
              height: 30,
              fontSize: 16,
              cursor: "pointer",
              color: "var(--ink-2)",
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "inherit",
            }}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Disclaimer banner */}
        <div style={{ padding: "9px 12px", background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.35)", borderRadius: 8, fontSize: 11, color: "#92400e", lineHeight: 1.55, marginBottom: 24 }}>
          <strong>Visual model, not a certified forecast.</strong> Flow speeds and diffusion coefficients are scaled ~1000× for legibility. The animation shows the <em>shape</em> of contamination spread, not precise concentrations or travel times.
        </div>

        {/* 1 — What the particles represent */}
        <div style={SECTION_STYLE}>
          <p style={H_STYLE}>1 · What each particle represents</p>
          <p style={P_STYLE}>
            Each moving dot is a numerical sample drawn from the{" "}
            <strong>advection–diffusion–decay</strong> partial differential equation (PDE):
          </p>
          <Tex block>{String.raw`\frac{\partial C}{\partial t} + u\frac{\partial C}{\partial x} = D\frac{\partial^2 C}{\partial x^2} - kC`}</Tex>
          <p style={{ ...P_STYLE, marginTop: 4 }}>
            <span style={BADGE_STYLE("#7a1e10")}><Tex>C</Tex></span> AMD concentration at position <Tex>x</Tex>, time <Tex>t</Tex><br />
            <span style={BADGE_STYLE("#2f4858")}><Tex>u</Tex></span> mean stream velocity (advection)<br />
            <span style={BADGE_STYLE("#2f4858")}><Tex>D</Tex></span> longitudinal dispersion coefficient<br />
            <span style={BADGE_STYLE("var(--ink-2)")}><Tex>k</Tex></span> first-order decay — neutralisation + metal precipitation
          </p>
          <p style={P_STYLE}>
            The Lagrangian (particle) form is mathematically equivalent: the density of infinitely many particles at any point converges to the PDE solution. Each particle moves as:
          </p>
          <Tex block>{String.raw`\Delta x = u\,\Delta t + \sqrt{2D\,\Delta t}\;\mathcal{N}(0,1)`}</Tex>
          <Tex block>{String.raw`m \;\leftarrow\; m \cdot e^{-k\,\Delta t}`}</Tex>
        </div>

        {/* 2 — Stream network */}
        <div style={SECTION_STYLE}>
          <p style={H_STYLE}>2 · Stream network routing</p>
          <p style={P_STYLE}>
            Particles follow the <strong>downstream_id chain</strong> embedded in
            each stream segment. The path for a given AMD source is built by walking
            that linked list from the source's attachment segment to the terminal
            reach (up to 200 hops, cycle-safe).
          </p>
          <p style={P_STYLE}>
            <strong>Premise:</strong> the network is single-thread — tributary
            merges are not modelled. Contamination that enters a main stem via a
            side tributary is represented by a separate source on that main stem, not
            by routing from the tributary.
          </p>
        </div>

        {/* 3 — River width */}
        <div style={SECTION_STYLE}>
          <p style={H_STYLE}>3 · River width — hydraulic geometry</p>
          <p style={P_STYLE}>
            Lateral spread scales with channel width. Width is estimated from{" "}
            <strong>Leopold & Maddock (1953)</strong> hydraulic geometry, calibrated
            to Pennsylvania anthracite streams using USGS gauge drainage-area data:
          </p>
          <Tex block>{String.raw`W\;(\text{m}) = 0.9\times\sqrt{A_{\text{sq\,mi}}}\qquad A\in[2,150]\text{ m}`}</Tex>
          <p style={P_STYLE}>
            ~884 monitoring stations carry a drainage-area value, giving measured
            widths along major reaches. Unmapped segments fall back to a linear
            taper: 5 m (headwaters) → 30 m (mouth).
          </p>
        </div>

        {/* 4 — 2D lateral spread */}
        <div style={SECTION_STYLE}>
          <p style={H_STYLE}>4 · 2-D lateral diffusion</p>
          <p style={P_STYLE}>
            Beyond the 1-D along-stream PDE, particles also spread across the
            channel (and beyond its banks). The lateral diffusion coefficient follows{" "}
            <strong>Fischer et al. (1979)</strong>:
          </p>
          <Tex block>{String.raw`D_y = \frac{h_w^2}{12}\qquad(h_w = \text{half-width})`}</Tex>
          <p style={P_STYLE}>
            Each frame, a particle's lateral offset is updated by:
          </p>
          <Tex block>{String.raw`\Delta y \;=\; h_w \sqrt{\frac{\Delta t\cdot T_s}{6}}\;\mathcal{N}(0,1)`}</Tex>
          <p style={P_STYLE}>
            <strong>No bank reflection.</strong> Particles that drift beyond the
            channel edge represent AMD seeping into riparian soil via capillary
            action — a real pathway, not a simulation artefact.
          </p>
        </div>

        {/* 5 — Time compression */}
        <div style={SECTION_STYLE}>
          <p style={H_STYLE}>5 · Visual time compression</p>
          <p style={P_STYLE}>
            Real Pennsylvania streams flow at ~0.3 m/s. At that speed, a plume
            travelling 10 km takes ~9 hours — invisible on screen. The visual
            velocity is set to 380 m/s (~1267×), so the full downstream journey
            completes in seconds.
          </p>
          <p style={P_STYLE}>
            Lateral diffusion is scaled by <strong><Tex>{String.raw`\sqrt{T_s} \approx 35`}</Tex></strong> to preserve
            the ratio of lateral-to-longitudinal spread (Taylor Péclet conservation).
            Without this correction, the plume would appear unnaturally narrow.
          </p>
          <Tex block>{String.raw`T = \frac{u_{\text{visual}}}{u_{\text{real}}} \approx 1267 \qquad T_s = \sqrt{T} \approx 35`}</Tex>
        </div>

        {/* 6 — What is not modelled */}
        <div style={{ ...SECTION_STYLE, marginBottom: 0 }}>
          <p style={H_STYLE}>6 · What this model does not include</p>
          <ul style={{ ...P_STYLE, paddingLeft: 18, margin: 0 }}>
            <li style={{ marginBottom: 5 }}>Groundwater or subsurface flow paths</li>
            <li style={{ marginBottom: 5 }}>Chemical speciation (iron, aluminium, sulphate are treated as a single lumped tracer)</li>
            <li style={{ marginBottom: 5 }}>Seasonal or storm-event variability in flow or AMD discharge rate</li>
            <li style={{ marginBottom: 5 }}>Tributary dilution as a separate mass-balance term (approximated by the decay constant k)</li>
            <li>Sediment transport or pH buffering kinetics</li>
          </ul>
        </div>
        </div>{/* end scrollable inner */}
      </div>
    </div>,
    document.body,
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

function SimulateBlock({
  simulating,
  onToggle,
  simulationSourceIds = [],
  sourceById,
  addMode = false,
  onToggleAddMode,
  onRemoveExtraSource,
  maxSimSources = 30,
}) {
  const [hovering, setHovering] = useState(false);
  const [learnMore, setLearnMore] = useState(false);

  const ids = simulationSourceIds || [];
  const anchorId = ids[0] || null;
  const total = ids.length;
  const atCap = total >= maxSimSources;

  return (
    <div
      style={{
        marginTop: 16,
        padding: "12px 14px",
        background: "var(--bg-3)",
        border: "1px solid var(--hairline)",
        borderRadius: 10,
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        style={{
          width: "100%",
          background: simulating
            ? "rgba(122,30,16,0.92)"
            : hovering
              ? "var(--ink)"
              : "var(--ink)",
          color: "var(--bg)",
          border: "none",
          padding: "9px 14px",
          borderRadius: 8,
          fontSize: 11,
          fontWeight: 500,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          transition: "background 180ms ease",
          fontFamily: "inherit",
        }}
      >
        {simulating
          ? `⏸  Stop simulation${total > 1 ? ` (${total})` : ""}`
          : `▶  Simulate transport${total > 1 ? ` (${total} sources)` : ""}`}
      </button>

      {/* Sources roster: anchor + extras as chips, with counter */}
      {anchorId && sourceById ? (
        <div style={{ marginTop: 14 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              marginBottom: 8,
              fontSize: 9.5,
              fontWeight: 600,
              color: "var(--ink-2)",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
            }}
          >
            <span>Sources in simulation</span>
            <span
              style={{
                color: atCap ? "#7a1e10" : "var(--ink-4)",
                fontWeight: 500,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {total} / {maxSimSources}
            </span>
          </div>
          <div
            className="sidebar-scroll"
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 6,
              maxHeight: 120,
              overflowY: "auto",
            }}
          >
            {ids.map((id) => {
              const isAnchor = id === anchorId;
              const source = sourceById.get
                ? sourceById.get(id)
                : sourceById?.[id];
              return (
                <SourceChip
                  key={id}
                  source={source || { id }}
                  isAnchor={isAnchor}
                  onRemove={
                    !isAnchor && onRemoveExtraSource
                      ? () => onRemoveExtraSource(id)
                      : null
                  }
                />
              );
            })}
          </div>

          {/* Add-mode toggle: in this mode, clicking AMD points on the map adds
              them to the sim instead of switching analysis focus. */}
          {onToggleAddMode ? (
            <button
              type="button"
              onClick={onToggleAddMode}
              disabled={atCap && !addMode}
              style={{
                marginTop: 12,
                width: "100%",
                background: addMode ? "var(--ink)" : "transparent",
                color: addMode ? "var(--bg)" : "var(--ink)",
                border: addMode
                  ? "1px solid var(--ink)"
                  : "1px dashed var(--hairline-strong)",
                padding: "7px 10px",
                borderRadius: 8,
                fontSize: 10,
                fontWeight: 500,
                letterSpacing: "0.06em",
                cursor: atCap && !addMode ? "not-allowed" : "pointer",
                opacity: atCap && !addMode ? 0.5 : 1,
                fontFamily: "inherit",
              }}
            >
              {addMode
                ? "✓  Done — back to analysis clicks"
                : atCap
                  ? `At cap (${maxSimSources}) — remove one to add`
                  : "+  Add more sources from the map"}
            </button>
          ) : null}

          {addMode ? (
            <div
              style={{
                marginTop: 10,
                padding: "8px 10px",
                background: "var(--bg-3)",
                border: "1px dashed var(--hairline-strong)",
                borderRadius: 8,
                fontSize: 10,
                color: "var(--ink-2)",
                lineHeight: 1.55,
                fontStyle: "italic",
              }}
            >
              Click any AMD discharge on the map to add it; click an already
              selected one to remove. Selected sources have a navy halo.
            </div>
          ) : null}
        </div>
      ) : null}

      <div
        style={{
          marginTop: 12,
          fontSize: 10.5,
          lineHeight: 1.6,
          color: "var(--ink-2)",
          letterSpacing: "0.01em",
        }}
      >
        <strong style={{ color: "var(--ink)", fontWeight: 700 }}>
          What this animates:
        </strong>{" "}
        each particle is a numerical sample of the{" "}
        <em style={{ fontStyle: "italic" }}>advection-diffusion</em> equation.{" "}
        <span style={{ color: "#7a1e10", fontWeight: 700 }}>Flow</span> pushes
        pollution downstream (advection),{" "}
        <span style={{ color: "var(--ink-2)", fontWeight: 700 }}>turbulence</span>{" "}
        spreads the plume (diffusion), and{" "}
        <span style={{ color: "var(--ink-4)", fontWeight: 700 }}>
          metal precipitation + tributary dilution
        </span>{" "}
        attenuate concentration at distance (decay). Particle color starts at
        the source severity and fades to muted slate as concentration drops.
      </div>

      <button
        type="button"
        onClick={() => setLearnMore(true)}
        style={{
          marginTop: 10,
          background: "transparent",
          border: "none",
          padding: 0,
          fontSize: 10.5,
          color: "#2f4858",
          cursor: "pointer",
          fontFamily: "inherit",
          letterSpacing: "0.01em",
          textDecoration: "underline",
          textDecorationColor: "rgba(3,105,161,0.4)",
          textUnderlineOffset: 2,
        }}
      >
        Learn more about the model
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none" style={{ display: "inline-block", verticalAlign: "middle", marginLeft: 4 }}>
          <path d="M2.5 6h7M7 2.5l3.5 3.5L7 9.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {learnMore ? (
        <LearnMoreModal onClose={() => setLearnMore(false)} />
      ) : null}
    </div>
  );
}

export default SimulateBlock;

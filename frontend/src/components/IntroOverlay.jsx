import React, { useState } from "react";

/**
 * Splash overlay: frosted glass over the orbiting map; centered title +
 * Enter button. Click Enter → 600ms fade-out while MapView eases out of orbit.
 */
function IntroOverlay({ onEnter }) {
  const [exiting, setExiting] = useState(false);
  const [hovering, setHovering] = useState(false);

  const handleClick = () => {
    if (exiting) return;
    setExiting(true);
    setTimeout(onEnter, 620);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 100,
        background:
          "linear-gradient(135deg, rgba(255,255,255,0.34), rgba(241,245,249,0.22))",
        backdropFilter: "blur(14px) saturate(140%)",
        WebkitBackdropFilter: "blur(14px) saturate(140%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        opacity: exiting ? 0 : 1,
        transition: "opacity 600ms ease-out",
        pointerEvents: exiting ? "none" : "auto",
        color: "#0f172a",
        letterSpacing: "0.01em",
      }}
    >
      <div
        style={{
          textAlign: "center",
          padding: "0 40px",
          maxWidth: 560,
          transform: exiting ? "translateY(-12px)" : "translateY(0)",
          transition: "transform 600ms ease-out",
        }}
      >
        <div
          style={{
            fontSize: 10.5,
            color: "#64748b",
            letterSpacing: "0.36em",
            textTransform: "uppercase",
            fontWeight: 500,
            marginBottom: 28,
          }}
        >
          Pennsylvania Anthracite Region
        </div>

        <h1
          style={{
            fontSize: "clamp(48px, 7vw, 92px)",
            fontWeight: 400,
            letterSpacing: "0.14em",
            color: "#0f172a",
            margin: 0,
            lineHeight: 1,
            paddingLeft: "0.14em" /* nudge to balance trailing kerning */,
          }}
        >
          TRACE
        </h1>

        <div
          style={{
            marginTop: 24,
            fontSize: 14,
            fontStyle: "italic",
            color: "#475569",
            lineHeight: 1.65,
            letterSpacing: "0.02em",
            maxWidth: 460,
            marginLeft: "auto",
            marginRight: "auto",
            fontWeight: 400,
          }}
        >
          An atlas for acid mine drainage — mines, discharge points, monitoring
          stations and downstream impact, in one map.
        </div>

        <button
          type="button"
          onClick={handleClick}
          onMouseEnter={() => setHovering(true)}
          onMouseLeave={() => setHovering(false)}
          style={{
            marginTop: 48,
            background: hovering ? "#0f172a" : "#1e293b",
            color: "#f8fafc",
            border: "none",
            padding: "13px 36px",
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 500,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            cursor: "pointer",
            boxShadow: hovering
              ? "0 8px 24px rgba(15,23,42,0.28)"
              : "0 4px 14px rgba(15,23,42,0.18)",
            transition:
              "background 200ms ease, box-shadow 200ms ease, transform 200ms ease",
            transform: hovering ? "translateY(-1px)" : "translateY(0)",
            fontFamily: "inherit",
          }}
        >
          Enter the map →
        </button>

        <div
          style={{
            marginTop: 68,
            fontSize: 10,
            color: "#94a3b8",
            letterSpacing: "0.24em",
            textTransform: "uppercase",
            fontWeight: 400,
          }}
        >
          Data · PA DEP AML · USGS NWIS · EPA WQP · NHD HR
        </div>
      </div>
    </div>
  );
}

export default IntroOverlay;

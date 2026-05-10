import React, { useState } from "react";

/**
 * Inline "Simulate transport" block embedded in HarmPanel and
 * PollutionSourcePanel. Toggles the particle simulation; explains what the
 * animation actually models.
 */
function SimulateBlock({ simulating, onToggle }) {
  const [hovering, setHovering] = useState(false);

  return (
    <div
      style={{
        marginTop: 16,
        padding: "12px 14px",
        background: "rgba(15,23,42,0.04)",
        border: "1px solid rgba(15,23,42,0.08)",
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
            ? "rgba(127,29,29,0.92)"
            : hovering
              ? "#0f172a"
              : "#1e293b",
          color: "#f8fafc",
          border: "none",
          padding: "10px 14px",
          borderRadius: 8,
          fontSize: 12,
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
        {simulating ? "⏸  Stop simulation" : "▶  Simulate transport"}
      </button>

      <div
        style={{
          marginTop: 10,
          fontSize: 11.5,
          lineHeight: 1.55,
          color: "#475569",
          letterSpacing: "0.01em",
        }}
      >
        <strong style={{ color: "#0f172a", fontWeight: 700 }}>
          What this animates:
        </strong>{" "}
        each particle is a numerical sample of the{" "}
        <em style={{ fontStyle: "italic" }}>advection-diffusion</em> equation.{" "}
        <span style={{ color: "#7f1d1d", fontWeight: 700 }}>Flow</span> pushes
        pollution downstream (advection),{" "}
        <span style={{ color: "#475569", fontWeight: 700 }}>turbulence</span>{" "}
        spreads the plume (diffusion), and{" "}
        <span style={{ color: "#94a3b8", fontWeight: 700 }}>
          metal precipitation + tributary dilution
        </span>{" "}
        attenuate concentration at distance (decay). Particle color starts at
        the source severity and fades to muted slate as concentration drops.
      </div>
    </div>
  );
}

export default SimulateBlock;

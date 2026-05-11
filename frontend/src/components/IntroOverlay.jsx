import React, { useEffect, useState } from "react";

/**
 * Splash overlay: frosted glass over the orbiting map; centered title +
 * Enter button. Content fades in stage-by-stage on mount (deliberate "lights
 * up" feel). On click, the overlay fades out over ~720ms while MapView
 * performs its two-phase camera entry (dive-in then pull-back).
 */
const STAGES = [
  { delay: 80 }, // 0: top label
  { delay: 240 }, // 1: TRACE title
  { delay: 540 }, // 2: subtitle
  { delay: 820 }, // 3: enter button
  { delay: 1080 }, // 4: data attribution
];
const STAGE_DURATION = 700;

function IntroOverlay({ onEnter }) {
  const [entered, setEntered] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [hovering, setHovering] = useState(false);

  // On mount → next frame flip entered=true to trigger the staged transitions
  useEffect(() => {
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const handleClick = () => {
    if (exiting) return;
    setExiting(true);
    setTimeout(onEnter, 720);
  };

  // Per-stage style: before `entered`, translateY(14px) + opacity 0; after,
  // settle. Stagger via transitionDelay so the page "lights up" top-down.
  const stageStyle = (i, extra = {}) => {
    const settled = entered && !exiting;
    return {
      opacity: settled ? 1 : 0,
      transform: settled ? "translateY(0)" : "translateY(14px)",
      transition: `opacity ${STAGE_DURATION}ms cubic-bezier(0.4, 0, 0.2, 1) ${STAGES[i].delay}ms, transform ${STAGE_DURATION}ms cubic-bezier(0.4, 0, 0.2, 1) ${STAGES[i].delay}ms`,
      ...extra,
    };
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
        transition: "opacity 720ms cubic-bezier(0.4, 0, 0.2, 1)",
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
          // 退场时整体轻微上抬 + 微缩 — 像往后退一步淡出
          transform: exiting ? "translateY(-12px) scale(0.985)" : "translateY(0) scale(1)",
          transition:
            "transform 720ms cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      >
        {/* 0: 顶部地域小标 */}
        <div
          style={stageStyle(0, {
            fontSize: 10.5,
            color: "#64748b",
            letterSpacing: "0.36em",
            textTransform: "uppercase",
            fontWeight: 500,
            marginBottom: 28,
          })}
        >
          Pennsylvania Anthracite Region
        </div>

        {/* 1: 主 wordmark */}
        <h1
          style={stageStyle(1, {
            fontSize: "clamp(48px, 7vw, 96px)",
            fontWeight: 400,
            letterSpacing: "0.14em",
            color: "#0f172a",
            margin: 0,
            lineHeight: 1,
            paddingLeft: "0.14em" /* nudge to balance trailing kerning */,
          })}
        >
          TRACE
        </h1>

        {/* 2: 一行 hairline + subtitle */}
        <div
          style={stageStyle(2, {
            marginTop: 22,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: 14,
          })}
        >
          <span
            style={{
              width: 40,
              height: 1,
              background: "rgba(15,23,42,0.25)",
              flex: "none",
            }}
          />
          <span
            style={{
              fontSize: 10.5,
              color: "#475569",
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              fontWeight: 500,
            }}
          >
            AMD Harm Atlas
          </span>
          <span
            style={{
              width: 40,
              height: 1,
              background: "rgba(15,23,42,0.25)",
              flex: "none",
            }}
          />
        </div>

        <div
          style={stageStyle(2, {
            marginTop: 18,
            fontSize: 14,
            fontStyle: "italic",
            color: "#475569",
            lineHeight: 1.65,
            letterSpacing: "0.02em",
            maxWidth: 460,
            marginLeft: "auto",
            marginRight: "auto",
            fontWeight: 400,
          })}
        >
          An atlas for acid mine drainage — mines, discharge points, monitoring
          stations and downstream impact, in one map.
        </div>

        {/* 3: 进场按钮 */}
        <div style={stageStyle(3, { marginTop: 48 })}>
          <button
            type="button"
            onClick={handleClick}
            onMouseEnter={() => setHovering(true)}
            onMouseLeave={() => setHovering(false)}
            style={{
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
                ? "0 10px 28px rgba(15,23,42,0.32)"
                : "0 4px 14px rgba(15,23,42,0.18)",
              transition:
                "background 200ms ease, box-shadow 200ms ease, transform 200ms ease",
              transform: hovering ? "translateY(-1px)" : "translateY(0)",
              fontFamily: "inherit",
            }}
          >
            Enter the map →
          </button>
        </div>

        {/* 4: data attribution */}
        <div
          style={stageStyle(4, {
            marginTop: 64,
            fontSize: 10,
            color: "#94a3b8",
            letterSpacing: "0.24em",
            textTransform: "uppercase",
            fontWeight: 400,
          })}
        >
          Data · PA DEP AML · USGS NWIS · EPA WQP · NHD HR
        </div>
      </div>
    </div>
  );
}

export default IntroOverlay;

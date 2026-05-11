import React, { useEffect, useState } from "react";

/**
 * Splash overlay — cool technical white aesthetic.
 * Pure white frosted glass over the orbiting map; mono pill badges
 * for archival metadata; tightly-tracked Inter wordmark; pill CTA
 * with hairline border. Every element is precision-machined, nothing
 * decorative.
 */
const STAGES = [
  { delay: 80 },   // 0: top mono pill
  { delay: 240 },  // 1: TRACE wordmark
  { delay: 540 },  // 2: hairline rule + tagline
  { delay: 820 },  // 3: enter button
  { delay: 1080 }, // 4: data pills strip
];
const STAGE_DURATION = 760;
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

function IntroOverlay({ onEnter }) {
  const [entered, setEntered] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [hovering, setHovering] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const handleClick = () => {
    if (exiting) return;
    setExiting(true);
    setTimeout(onEnter, 720);
  };

  const stageStyle = (i, extra = {}) => {
    const settled = entered && !exiting;
    return {
      opacity: settled ? 1 : 0,
      transform: settled ? "translateY(0)" : "translateY(10px)",
      transition: `opacity ${STAGE_DURATION}ms ${EASE} ${STAGES[i].delay}ms, transform ${STAGE_DURATION}ms ${EASE} ${STAGES[i].delay}ms`,
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
          "linear-gradient(180deg, rgba(255,255,255,0.78) 0%, rgba(250,250,250,0.74) 50%, rgba(244,244,245,0.78) 100%)",
        backdropFilter: "blur(36px) saturate(170%)",
        WebkitBackdropFilter: "blur(36px) saturate(170%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        opacity: exiting ? 0 : 1,
        transition: `opacity 720ms ${EASE}`,
        pointerEvents: exiting ? "none" : "auto",
        color: "var(--ink)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          textAlign: "center",
          padding: "0 40px",
          maxWidth: 680,
          transform: exiting
            ? "translateY(-8px) scale(0.99)"
            : "translateY(0) scale(1)",
          transition: `transform 720ms ${EASE}`,
        }}
      >
        {/* 0: mono pill — coordinates, like a CAD readout */}
        <div style={stageStyle(0, { marginBottom: 44 })}>
          <span
            className="pill-badge"
            style={{ fontSize: 10.5, padding: "5px 12px" }}
          >
            <span
              style={{
                width: 5,
                height: 5,
                borderRadius: 999,
                background: "var(--accent)",
                display: "inline-block",
                boxShadow: "0 0 0 3px rgba(185,52,30,0.18)",
              }}
            />
            PA · ANTHRACITE · 41.20°N 76.00°W
          </span>
        </div>

        {/* 1: wordmark — Inter, very tight tracking, instrument-precise */}
        <h1
          style={stageStyle(1, {
            fontSize: "clamp(76px, 11vw, 156px)",
            fontWeight: 500,
            letterSpacing: "-0.045em",
            color: "var(--ink)",
            margin: 0,
            lineHeight: 0.92,
            fontFeatureSettings: '"ss01" on, "ss02" on, "cv11" on',
          })}
        >
          TRACE<span style={{ color: "var(--accent)" }}>.</span>
        </h1>

        {/* 2: hairline + sub-label */}
        <div
          style={stageStyle(2, {
            marginTop: 30,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: 14,
          })}
        >
          <span
            style={{
              width: 48,
              height: 1,
              background: "var(--hairline-strong)",
              flex: "none",
            }}
          />
          <span
            className="font-mono"
            style={{
              fontSize: 10,
              color: "var(--ink-2)",
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              fontWeight: 500,
            }}
          >
            AMD Harm Atlas — v0.1
          </span>
          <span
            style={{
              width: 48,
              height: 1,
              background: "var(--hairline-strong)",
              flex: "none",
            }}
          />
        </div>

        {/* tagline — Inter, restrained, instrument-spec language */}
        <div
          style={stageStyle(2, {
            marginTop: 22,
            fontSize: "clamp(14px, 1.25vw, 16px)",
            fontWeight: 400,
            color: "var(--ink-2)",
            lineHeight: 1.55,
            letterSpacing: "-0.005em",
            maxWidth: 480,
            marginLeft: "auto",
            marginRight: "auto",
          })}
        >
          Mines, discharge points, monitoring stations and the streams
          downstream — read as one continuous record.
        </div>

        {/* 3: pill CTA — hairline, frosted, fills ink on hover */}
        <div style={stageStyle(3, { marginTop: 52 })}>
          <button
            type="button"
            onClick={handleClick}
            onMouseEnter={() => setHovering(true)}
            onMouseLeave={() => setHovering(false)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
              background: hovering ? "var(--ink)" : "rgba(255,255,255,0.92)",
              color: hovering ? "var(--bg)" : "var(--ink)",
              border: `1px solid ${
                hovering ? "var(--ink)" : "var(--hairline-strong)"
              }`,
              padding: "11px 24px",
              borderRadius: 999,
              fontSize: 12.5,
              fontWeight: 500,
              letterSpacing: "-0.005em",
              cursor: "pointer",
              boxShadow: hovering
                ? "0 12px 28px -10px rgba(0,0,0,0.32), inset 0 0 0 1px rgba(255,255,255,0.06)"
                : "0 1px 0 rgba(0,0,0,0.02), 0 8px 22px -10px rgba(0,0,0,0.10)",
              transition: `background 260ms ${EASE}, color 260ms ${EASE}, border-color 260ms ${EASE}, box-shadow 260ms ${EASE}, transform 200ms ${EASE}`,
              transform: hovering ? "translateY(-1px)" : "translateY(0)",
              fontFamily: "inherit",
              backdropFilter: "blur(12px) saturate(160%)",
              WebkitBackdropFilter: "blur(12px) saturate(160%)",
            }}
          >
            <span>Open the atlas</span>
            <span
              style={{
                fontSize: 14,
                lineHeight: 1,
                transform: hovering ? "translateX(2px)" : "translateX(0)",
                transition: `transform 260ms ${EASE}`,
              }}
            >
              →
            </span>
          </button>
        </div>

        {/* 4: source attribution — 4 mono pills, tight spacing */}
        <div
          style={stageStyle(4, {
            marginTop: 64,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: 6,
            flexWrap: "wrap",
          })}
        >
          {["PA DEP · AML", "USGS · NWIS", "EPA · WQP", "NHD · HR"].map(
            (label) => (
              <span
                key={label}
                className="pill-badge"
                style={{
                  fontSize: 9.5,
                  padding: "3px 9px",
                  color: "var(--ink-3)",
                  background: "rgba(255,255,255,0.62)",
                }}
              >
                {label}
              </span>
            ),
          )}
        </div>
      </div>
    </div>
  );
}

export default IntroOverlay;

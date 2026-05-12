import React, { useEffect, useMemo, useState } from "react";
import {
  getCollieryById,
  getHarmById,
  getStationById,
} from "../services/api";
import CollieryPanel from "./CollieryPanel";
import HarmPanel from "./HarmPanel";
import PollutionSourcePanel from "./PollutionSourcePanel";
import SegmentPanel from "./SegmentPanel";
import StationPanel from "./StationPanel";
import TopKList from "./TopKList";

// Chrome handled by .surface utility class (see styles.css).
// Width 配额：宽屏（TV）显示，单位 px。展开宽度比之前 320 缩到 272；折叠态
// 取一个固定宽度（不再用 width:auto），这样 CSS transition 才能丝滑收放。
const SIDEBAR_WIDTH_EXPANDED = 282;
const SIDEBAR_WIDTH_COLLAPSED = 96;
// 慢一点更稳重，跟镜头入场 (~2.2s) 的节奏对齐；超过 600 会显得拖
const ANIM_MS = 580;
const ANIM_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

function VizToggle({ on, label, color, hint, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        width: "100%",
        padding: "9px 13px",
        marginBottom: 6,
        background: on ? "var(--ink)" : "var(--surface-strong)",
        color: on ? "var(--bg)" : "var(--ink)",
        border: `1px solid ${on ? "var(--ink)" : "var(--hairline)"}`,
        borderRadius: 999,
        cursor: "pointer",
        fontSize: 11,
        fontWeight: 500,
        letterSpacing: "-0.005em",
        transition:
          "background 220ms var(--ease-out), color 220ms var(--ease-out), border-color 220ms var(--ease-out)",
        fontFamily: "inherit",
        textAlign: "left",
      }}
    >
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: 999,
          background: on ? color : "var(--ink-5)",
          boxShadow: on
            ? `0 0 0 3px ${color}33`
            : `0 0 0 0 transparent`,
          transition: "box-shadow 220ms var(--ease-out), background 220ms var(--ease-out)",
          flex: "none",
        }}
      />
      <span style={{ flex: 1 }}>{label}</span>
      <span
        className="font-mono"
        style={{
          fontSize: 9,
          color: on ? "rgba(255,255,255,0.55)" : "var(--ink-4)",
          fontWeight: 500,
          textTransform: "uppercase",
          letterSpacing: "0.1em",
        }}
      >
        {hint}
      </span>
    </button>
  );
}

function Sidebar({
  analysisFocus,
  selectedHarmId,
  onHarmSelect,
  onHarmBack,
  onFocus,
  onExitFocus,
  searchIndex,
  collapsed,
  onToggle,
  simulating,
  onToggleSimulate,
  topCollieries,
  topHarms,
  vizColliery,
  vizAmd,
  onToggleVizColliery,
  onToggleVizAmd,
  simulationSourceIds,
  sourceById,
  addMode,
  onToggleAddMode,
  onRemoveExtraSource,
  maxSimSources,
  upstreamKm,
  onUpstreamKmChange,
  upstreamResult,
}) {
  // undefined = fetch in progress, null = fetch done but not found, object = found
  const [colliery, setColliery] = useState(undefined);
  const [station, setStation] = useState(undefined);
  const [harm, setHarm] = useState(undefined);
  const [searchQ, setSearchQ] = useState("");

  // 进场动画：首次挂载时强制视觉上是 collapsed，下一帧再切到 props.collapsed
  // 的真实值（默认 false），这样 CSS transition 会从"收起"漂亮地动到"展开"。
  // 之后用户手动切换 collapsed 也会走同一套 transition。
  const [hasMounted, setHasMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setHasMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const visiblyCollapsed = !hasMounted || collapsed;

  // colliery detail
  useEffect(() => {
    if (analysisFocus?.kind !== "colliery") {
      setColliery(undefined);
      return;
    }
    setColliery(undefined); // reset to loading when id changes
    let cancelled = false;
    getCollieryById(analysisFocus.id)
      .then((c) => !cancelled && setColliery(c ?? null))
      .catch(() => !cancelled && setColliery(null));
    return () => { cancelled = true; };
  }, [analysisFocus]);

  // station detail
  useEffect(() => {
    if (analysisFocus?.kind !== "station") {
      setStation(undefined);
      return;
    }
    setStation(undefined);
    let cancelled = false;
    getStationById(analysisFocus.id)
      .then((s) => !cancelled && setStation(s ?? null))
      .catch(() => !cancelled && setStation(null));
    return () => { cancelled = true; };
  }, [analysisFocus]);

  // harm detail (drill-down)
  useEffect(() => {
    if (!selectedHarmId) {
      setHarm(undefined);
      return;
    }
    setHarm(undefined);
    let cancelled = false;
    getHarmById(selectedHarmId)
      .then((h) => !cancelled && setHarm(h ?? null))
      .catch(() => !cancelled && setHarm(null));
    return () => { cancelled = true; };
  }, [selectedHarmId]);

  // segment props piggy-back from MapView click; no separate fetch needed
  const segmentProperties = useMemo(() => {
    if (analysisFocus?.kind !== "segment") return null;
    return {
      id: analysisFocus.id,
      name: analysisFocus.props?.name,
      huc8: analysisFocus.props?.huc8,
      length_km: analysisFocus.props?.length_km,
      ftype: analysisFocus.props?.ftype,
    };
  }, [analysisFocus]);

  // search
  const searchResults = (() => {
    const q = searchQ.trim().toLowerCase();
    if (!q || !searchIndex) return [];
    const hits = [];
    for (const c of searchIndex.collieries || []) {
      if (
        (c.name || "").toLowerCase().includes(q) ||
        (c.operator || "").toLowerCase().includes(q)
      ) {
        hits.push({
          kind: "colliery",
          id: c.id,
          label: c.name || c.id,
          sub: c.operator || "",
        });
        if (hits.length >= 8) return hits;
      }
    }
    for (const s of searchIndex.stations || []) {
      if (
        (s.name || "").toLowerCase().includes(q) ||
        (s.id || "").toLowerCase().includes(q)
      ) {
        hits.push({
          kind: "station",
          id: s.id,
          label: s.name || s.id,
          sub: s.agency || "",
        });
        if (hits.length >= 8) return hits;
      }
    }
    for (const h of searchIndex.harms || []) {
      if ((h.name || "").toLowerCase().includes(q)) {
        hits.push({
          kind: "harm",
          id: h.id,
          label: h.name,
          sub: h.severity || "",
        });
        if (hits.length >= 8) return hits;
      }
    }
    return hits;
  })();

  function handleSearchPick(hit) {
    setSearchQ("");
    if (hit.kind === "colliery") onFocus?.("colliery", hit.id);
    else if (hit.kind === "station") onFocus?.("station", hit.id);
    else if (hit.kind === "harm") onHarmSelect?.(hit.id);
  }

  // ── Choose what main panel to render
  // multi-source sim 的全套 prop 打包传给 HarmPanel/PollutionSourcePanel
  const simProps = {
    simulating,
    onToggleSimulate,
    simulationSourceIds,
    sourceById,
    addMode,
    onToggleAddMode,
    onRemoveExtraSource,
    maxSimSources,
  };
  let mainPanel = null;
  if (selectedHarmId) {
    if (harm === undefined) {
      mainPanel = <Loading />;
    } else if (harm) {
      mainPanel = (
        <HarmPanel
          harm={harm}
          onBack={onHarmBack}
          backLabel="Back"
          onFocus={onFocus}
          {...simProps}
        />
      );
    } else {
      mainPanel = <NotFound label="Harm record not found." />;
    }
  } else if (analysisFocus) {
    if (analysisFocus.kind === "colliery") {
      if (colliery === undefined) {
        mainPanel = <Loading />;
      } else if (colliery) {
        mainPanel = <CollieryPanel colliery={colliery} onHarmSelect={onHarmSelect} />;
      } else {
        mainPanel = <NotFound label="Colliery record not found." />;
      }
    } else if (analysisFocus.kind === "station") {
      if (station === undefined) {
        mainPanel = <Loading />;
      } else if (station) {
        mainPanel = <StationPanel station={station} onHarmSelect={onHarmSelect} />;
      } else {
        mainPanel = <NotFound label="Station record not found." />;
      }
    } else if (analysisFocus.kind === "pollution_source") {
      mainPanel = (
        <PollutionSourcePanel
          pollutionSourceId={analysisFocus.id}
          onHarmSelect={onHarmSelect}
          {...simProps}
        />
      );
    } else if (analysisFocus.kind === "segment") {
      mainPanel = (
        <SegmentPanel
          segmentProperties={segmentProperties}
          onHarmSelect={onHarmSelect}
          upstreamKm={upstreamKm}
          onUpstreamKmChange={onUpstreamKmChange}
          upstreamResult={upstreamResult}
        />
      );
    }
  } else {
    mainPanel = (
      <div
        style={{
          color: "var(--ink-2)",
          fontSize: 11.5,
          lineHeight: 1.6,
          padding: "16px 14px 20px",
        }}
      >
        <span
          className="pill-badge"
          style={{ fontSize: 9, padding: "3px 9px", marginBottom: 14 }}
        >
          <span
            style={{
              width: 4,
              height: 4,
              borderRadius: 999,
              background: "var(--accent)",
              display: "inline-block",
            }}
          />
          ATLAS · v0.1
        </span>

        <h2
          style={{
            margin: "10px 0 0",
            color: "var(--ink)",
            fontSize: 19,
            lineHeight: 1.15,
            letterSpacing: "-0.025em",
            fontWeight: 500,
          }}
        >
          Pennsylvania
          <br />
          Anthracite AMD
        </h2>

        <p
          style={{
            color: "var(--ink-3)",
            fontSize: 11.5,
            marginTop: 10,
            marginBottom: 22,
            letterSpacing: "-0.005em",
            lineHeight: 1.55,
          }}
        >
          Pick a top-ranked entity below, or click any map marker to drill in.
        </p>

        <div
          className="font-mono"
          style={{
            fontSize: 9,
            fontWeight: 500,
            color: "var(--ink-3)",
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            marginBottom: 10,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span>Intensity</span>
          <span
            style={{ flex: 1, height: 1, background: "var(--hairline)" }}
          />
        </div>
        <VizToggle
          on={!!vizColliery}
          label="Colliery pollution"
          color="var(--ink-2)"
          hint={vizColliery ? "heatmap" : "off"}
          onClick={onToggleVizColliery}
        />
        <VizToggle
          on={!!vizAmd}
          label="AMD discharge"
          color="var(--accent-steel)"
          hint={vizAmd ? "heatmap" : "off"}
          onClick={onToggleVizAmd}
        />

        <TopKList
          title="Top 8 collieries"
          subtitle="Severity-weighted score across linked harms"
          items={topCollieries}
          kind="colliery"
          onPick={(id) => onFocus?.("colliery", id)}
        />

        <TopKList
          title="Top 8 AMD harms"
          subtitle="Severity rank, flow tiebreak"
          items={topHarms}
          kind="harm"
          onPick={(harmId) => onHarmSelect?.(harmId)}
        />

        <p
          className="font-mono"
          style={{
            color: "var(--ink-4)",
            fontSize: 9,
            marginTop: 20,
            letterSpacing: "0.14em",
            lineHeight: 1.55,
            textTransform: "uppercase",
          }}
        >
          ↗ Legend &amp; view mode — top-right
        </p>
      </div>
    );
  }

  // ── Floating panel; collapsed = compact pill, expanded = full panel
  return (
    <aside
      className="surface"
      style={{
        position: "absolute",
        top: 14,
        left: 14,
        zIndex: 5,
        width: visiblyCollapsed
          ? SIDEBAR_WIDTH_COLLAPSED
          : SIDEBAR_WIDTH_EXPANDED,
        maxHeight: "calc(100vh - 28px)",
        fontSize: 11,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        transition: `width ${ANIM_MS}ms ${ANIM_EASE}, border-radius ${ANIM_MS}ms ${ANIM_EASE}`,
        borderRadius: visiblyCollapsed ? 999 : "var(--radius-lg)",
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-label={collapsed ? "Expand TRACE" : "Collapse TRACE"}
        style={{
          width: "100%",
          background: "transparent",
          border: "none",
          borderBottom: visiblyCollapsed
            ? "1px solid transparent"
            : "1px solid var(--hairline-soft)",
          padding: "12px 14px 12px",
          textAlign: "left",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 10,
          color: "var(--ink)",
          fontFamily: "inherit",
          flex: "none",
          transition: `border-color ${ANIM_MS}ms ${ANIM_EASE}`,
        }}
      >
        <span
          style={{
            fontSize: 9,
            color: "var(--ink-3)",
            transform: visiblyCollapsed ? "rotate(0deg)" : "rotate(90deg)",
            transition: `transform ${ANIM_MS}ms ${ANIM_EASE}`,
            display: "inline-block",
            lineHeight: 1,
            width: 9,
          }}
        >
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none" style={{ display: "block" }}>
            <path d="M2 1.5l3 2.5-3 2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </span>
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: "-0.015em",
            lineHeight: 1,
            color: "var(--ink)",
          }}
        >
          TRACE
          <span style={{ color: "var(--accent)" }}>.</span>
        </span>
        <span
          className="font-mono"
          style={{
            marginLeft: "auto",
            fontSize: 8.5,
            fontWeight: 500,
            color: "var(--ink-3)",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            opacity: visiblyCollapsed ? 0 : 1,
            transition: `opacity ${ANIM_MS}ms ${ANIM_EASE}`,
            whiteSpace: "nowrap",
            padding: "2px 8px",
            border: "1px solid var(--hairline)",
            borderRadius: 999,
            background: "var(--surface-quiet)",
          }}
        >
          Harm Atlas
        </span>
      </button>

      {/* Inner content wrapper: 走 max-height + opacity transition 实现丝滑收放。
          overflow:hidden 防止收起过程中 search 下拉等内容溢出。 */}
      <div
        style={{
          maxHeight: visiblyCollapsed ? 0 : "calc(100vh - 80px)",
          opacity: visiblyCollapsed ? 0 : 1,
          overflow: "hidden",
          transition: `max-height ${ANIM_MS}ms ${ANIM_EASE}, opacity ${Math.round(ANIM_MS * 0.7)}ms ${ANIM_EASE}`,
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
        }}
        aria-hidden={visiblyCollapsed}
      >
        {/* search + (optional) exit-analysis pill */}
        <div
          style={{
            padding: "10px 12px 12px",
            borderBottom: "1px solid var(--hairline-soft)",
            position: "relative",
            flex: "none",
          }}
        >
          <input
            type="search"
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            placeholder="Search collieries, stations, harms…"
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "7px 14px",
              borderRadius: 999,
              border: "1px solid var(--hairline)",
              background: "var(--surface-input)",
              fontSize: 11,
              color: "var(--ink)",
              outline: "none",
              fontFamily: "inherit",
              letterSpacing: "-0.005em",
              transition:
                "border-color 200ms var(--ease-out), background 200ms var(--ease-out), box-shadow 200ms var(--ease-out)",
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = "var(--ink)";
              e.currentTarget.style.background = "var(--surface-input-focus)";
              e.currentTarget.style.boxShadow = "0 0 0 3px rgba(0,0,0,0.04)";
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = "var(--hairline)";
              e.currentTarget.style.background = "var(--surface-input)";
              e.currentTarget.style.boxShadow = "none";
            }}
          />
          {searchResults.length > 0 ? (
            <div
              style={{
                position: "absolute",
                top: "calc(100% - 2px)",
                left: 12,
                right: 12,
                zIndex: 10,
                background: "var(--surface-strong)",
                border: "1px solid var(--hairline)",
                borderRadius: 12,
                boxShadow: "var(--shadow-panel)",
                maxHeight: 280,
                overflow: "auto",
                backdropFilter: "blur(40px) saturate(180%)",
                WebkitBackdropFilter: "blur(40px) saturate(180%)",
              }}
              className="sidebar-scroll"
            >
              {searchResults.map((hit, idx) => (
                <button
                  key={`${hit.kind}-${hit.id}`}
                  type="button"
                  onClick={() => handleSearchPick(hit)}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "8px 12px",
                    background: "transparent",
                    border: "none",
                    borderBottom:
                      idx < searchResults.length - 1
                        ? "1px solid var(--hairline-soft)"
                        : "none",
                    cursor: "pointer",
                    fontSize: 11,
                    color: "var(--ink)",
                    fontFamily: "inherit",
                    transition: "background 120ms var(--ease-out)",
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background = "rgba(0,0,0,0.04)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = "transparent")
                  }
                >
                  <span
                    className="font-mono"
                    style={{
                      color:
                        hit.kind === "colliery"
                          ? "var(--accent-deep)"
                          : hit.kind === "station"
                            ? "var(--accent-steel)"
                            : "var(--accent)",
                      fontWeight: 500,
                      fontSize: 8.5,
                      letterSpacing: "0.14em",
                      textTransform: "uppercase",
                      marginRight: 8,
                      padding: "2px 7px",
                      border: "1px solid currentColor",
                      borderRadius: 999,
                      opacity: 0.85,
                    }}
                  >
                    {hit.kind}
                  </span>
                  {hit.label}
                  {hit.sub ? (
                    <span
                      style={{
                        color: "var(--ink-4)",
                        marginLeft: 6,
                      }}
                    >
                      — {hit.sub}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          ) : null}

          {analysisFocus ? (
            <button
              type="button"
              onClick={onExitFocus}
              style={{
                marginTop: 10,
                fontSize: 10.5,
                color: "var(--ink-2)",
                background: "var(--surface-strong)",
                border: "1px solid var(--hairline)",
                borderRadius: 999,
                padding: "4px 12px",
                cursor: "pointer",
                fontFamily: "inherit",
                letterSpacing: "-0.005em",
                fontWeight: 500,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                transition:
                  "background 200ms var(--ease-out), color 200ms var(--ease-out), border-color 200ms var(--ease-out)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--ink)";
                e.currentTarget.style.color = "var(--bg)";
                e.currentTarget.style.borderColor = "var(--ink)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "var(--surface-strong)";
                e.currentTarget.style.color = "var(--ink-2)";
                e.currentTarget.style.borderColor = "var(--hairline)";
              }}
            >
              <span style={{ fontSize: 9, lineHeight: 1 }}>✕</span>
              Exit
            </button>
          ) : null}
        </div>

        {/* main panel — entity detail or welcome */}
        <div
          className="sidebar-scroll"
          style={{
            flex: 1,
            overflow: "auto",
            minHeight: 0,
          }}
        >
          {mainPanel}
        </div>
      </div>
    </aside>
  );
}

function Loading() {
  return (
    <div style={{ padding: 16, display: "flex", alignItems: "center", gap: 8 }}>
      <span className="font-mono" style={{ fontSize: 9.5, color: "var(--ink-4)", letterSpacing: "0.14em", textTransform: "uppercase" }}>
        Loading
      </span>
      <span className="loading-dot" />
      <span className="loading-dot" />
      <span className="loading-dot" />
    </div>
  );
}

function NotFound({ label }) {
  return (
    <div style={{ padding: "14px 16px", fontSize: 11, color: "var(--ink-4)", lineHeight: 1.55 }}>
      {label || "No data available."}
    </div>
  );
}

export default Sidebar;

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

// Floating panel chrome — mirrors LayerControlPanel for visual consistency
const PANEL_BG = "rgba(248,250,252,0.94)";
const PANEL_BORDER = "1px solid rgba(15,23,42,0.08)";
const PANEL_RADIUS = 10;
const PANEL_SHADOW =
  "0 1px 2px rgba(15,23,42,0.04), 0 12px 32px rgba(15,23,42,0.10)";

// Width 配额：宽屏（TV）显示，单位 px。展开宽度比之前 320 缩到 272；折叠态
// 取一个固定宽度（不再用 width:auto），这样 CSS transition 才能丝滑收放。
const SIDEBAR_WIDTH_EXPANDED = 272;
const SIDEBAR_WIDTH_COLLAPSED = 92;
// 慢一点更稳重，跟镜头入场 (~2.2s) 的节奏对齐；超过 600 会显得拖
const ANIM_MS = 580;
const ANIM_EASE = "cubic-bezier(0.4, 0, 0.2, 1)";

function VizToggle({ on, label, color, hint, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        width: "100%",
        padding: "7px 10px",
        marginBottom: 6,
        background: on ? color : "rgba(255,255,255,0.7)",
        color: on ? "#ffffff" : "#1e293b",
        border: `1px solid ${on ? color : "rgba(15,23,42,0.15)"}`,
        borderRadius: 8,
        cursor: "pointer",
        fontSize: 11,
        fontWeight: 500,
        letterSpacing: "0.04em",
        transition: "background 150ms ease, color 150ms ease",
        fontFamily: "inherit",
      }}
    >
      <span
        style={{
          width: 13,
          height: 13,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          border: `1px solid ${on ? "#ffffff" : "rgba(15,23,42,0.3)"}`,
          borderRadius: 3,
          fontSize: 9,
          background: on ? "rgba(255,255,255,0.18)" : "transparent",
        }}
      >
        {on ? "✓" : ""}
      </span>
      <span style={{ flex: 1, textAlign: "left" }}>{label}</span>
      <span
        style={{
          fontSize: 9.5,
          color: on ? "rgba(255,255,255,0.7)" : "#94a3b8",
          fontWeight: 400,
          fontStyle: "italic",
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
}) {
  const [colliery, setColliery] = useState(null);
  const [station, setStation] = useState(null);
  const [harm, setHarm] = useState(null);
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
      setColliery(null);
      return;
    }
    let cancelled = false;
    getCollieryById(analysisFocus.id)
      .then((c) => !cancelled && setColliery(c))
      .catch(() => !cancelled && setColliery(null));
    return () => {
      cancelled = true;
    };
  }, [analysisFocus]);

  // station detail
  useEffect(() => {
    if (analysisFocus?.kind !== "station") {
      setStation(null);
      return;
    }
    let cancelled = false;
    getStationById(analysisFocus.id)
      .then((s) => !cancelled && setStation(s))
      .catch(() => !cancelled && setStation(null));
    return () => {
      cancelled = true;
    };
  }, [analysisFocus]);

  // harm detail (drill-down)
  useEffect(() => {
    if (!selectedHarmId) {
      setHarm(null);
      return;
    }
    let cancelled = false;
    getHarmById(selectedHarmId)
      .then((h) => !cancelled && setHarm(h))
      .catch(() => !cancelled && setHarm(null));
    return () => {
      cancelled = true;
    };
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
  if (selectedHarmId && harm) {
    mainPanel = (
      <HarmPanel
        harm={harm}
        onBack={onHarmBack}
        backLabel="Back"
        onFocus={onFocus}
        {...simProps}
      />
    );
  } else if (analysisFocus) {
    if (analysisFocus.kind === "colliery") {
      mainPanel = colliery ? (
        <CollieryPanel colliery={colliery} onHarmSelect={onHarmSelect} />
      ) : (
        <Loading />
      );
    } else if (analysisFocus.kind === "station") {
      mainPanel = station ? (
        <StationPanel station={station} onHarmSelect={onHarmSelect} />
      ) : (
        <Loading />
      );
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
        />
      );
    }
  } else {
    mainPanel = (
      <div
        style={{ color: "#475569", fontSize: 11.5, lineHeight: 1.6, padding: 14 }}
      >
        <p
          style={{
            marginTop: 0,
            color: "#1e293b",
            fontWeight: 500,
            fontSize: 12.5,
            letterSpacing: "0.01em",
            marginBottom: 8,
          }}
        >
          Pennsylvania Anthracite AMD Atlas
        </p>
        <p
          style={{
            color: "#64748b",
            fontSize: 10.5,
            fontStyle: "italic",
            marginTop: 0,
            marginBottom: 20,
            letterSpacing: "0.02em",
            lineHeight: 1.6,
          }}
        >
          Pick a top-ranked entity below, or click any map marker to drill in.
        </p>

        <div
          style={{
            fontSize: 9.5,
            fontWeight: 600,
            color: "#475569",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            marginBottom: 10,
          }}
        >
          Intensity Layers
        </div>
        <VizToggle
          on={!!vizColliery}
          label="Colliery pollution"
          color="#7f1d1d"
          hint={vizColliery ? "heatmap + columns" : "off"}
          onClick={onToggleVizColliery}
        />
        <VizToggle
          on={!!vizAmd}
          label="AMD discharge"
          color="#b91c1c"
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
          style={{
            color: "#94a3b8",
            fontSize: 9.5,
            fontStyle: "italic",
            marginTop: 20,
            letterSpacing: "0.02em",
            lineHeight: 1.55,
          }}
        >
          See top-right panel for full legend and view mode.
        </p>
      </div>
    );
  }

  // ── Floating panel; collapsed = compact pill, expanded = full panel
  return (
    <aside
      style={{
        position: "absolute",
        top: 12,
        left: 12,
        zIndex: 5,
        width: visiblyCollapsed
          ? SIDEBAR_WIDTH_COLLAPSED
          : SIDEBAR_WIDTH_EXPANDED,
        maxHeight: "calc(100vh - 24px)",
        background: PANEL_BG,
        border: PANEL_BORDER,
        borderRadius: PANEL_RADIUS,
        boxShadow: PANEL_SHADOW,
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        fontSize: 11,
        color: "#0f172a",
        overflow: "hidden",
        letterSpacing: "0.01em",
        display: "flex",
        flexDirection: "column",
        transition: `width ${ANIM_MS}ms ${ANIM_EASE}`,
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
          padding: "10px 14px",
          textAlign: "left",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 10,
          fontSize: 11,
          fontWeight: 400,
          letterSpacing: "0.2em",
          textTransform: "uppercase",
          color: "#0f172a",
          fontFamily: "inherit",
          flex: "none",
        }}
      >
        <span style={{ fontSize: 10, color: "#94a3b8" }}>
          {visiblyCollapsed ? "▸" : "▾"}
        </span>
        <span>TRACE</span>
        <span
          style={{
            marginLeft: "auto",
            fontSize: 8.5,
            fontWeight: 400,
            fontStyle: "italic",
            color: "#94a3b8",
            letterSpacing: "0.06em",
            textTransform: "none",
            opacity: visiblyCollapsed ? 0 : 1,
            transition: `opacity ${ANIM_MS}ms ${ANIM_EASE}`,
            whiteSpace: "nowrap",
          }}
        >
          AMD Harm Atlas
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
            padding: "0 12px 10px",
            borderBottom: "1px solid rgba(15,23,42,0.06)",
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
              padding: "6px 10px",
              borderRadius: 8,
              border: "1px solid rgba(15,23,42,0.15)",
              background: "rgba(255,255,255,0.7)",
              fontSize: 11,
              outline: "none",
              fontFamily: "inherit",
            }}
          />
          {searchResults.length > 0 ? (
            <div
              style={{
                position: "absolute",
                top: "calc(100% - 4px)",
                left: 12,
                right: 12,
                zIndex: 10,
                background: "rgba(255,255,255,0.98)",
                border: "1px solid rgba(15,23,42,0.12)",
                borderRadius: 8,
                boxShadow: "0 8px 24px rgba(15,23,42,0.18)",
                maxHeight: 280,
                overflow: "auto",
              }}
              className="sidebar-scroll"
            >
              {searchResults.map((hit) => (
                <button
                  key={`${hit.kind}-${hit.id}`}
                  type="button"
                  onClick={() => handleSearchPick(hit)}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "6px 10px",
                    background: "transparent",
                    border: "none",
                    borderBottom: "1px solid rgba(15,23,42,0.06)",
                    cursor: "pointer",
                    fontSize: 11,
                    fontFamily: "inherit",
                  }}
                >
                  <span
                    style={{
                      color:
                        hit.kind === "colliery"
                          ? "#7f1d1d"
                          : hit.kind === "station"
                            ? "#5b21b6"
                            : "#0f172a",
                      fontWeight: 700,
                      fontSize: 8.5,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      marginRight: 8,
                    }}
                  >
                    {hit.kind}
                  </span>
                  {hit.label}
                  {hit.sub ? (
                    <span
                      style={{
                        color: "#94a3b8",
                        fontStyle: "italic",
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
                marginTop: 8,
                fontSize: 10,
                color: "#475569",
                background: "transparent",
                border: "1px solid rgba(15,23,42,0.18)",
                borderRadius: 6,
                padding: "3px 10px",
                cursor: "pointer",
                fontFamily: "inherit",
                letterSpacing: "0.02em",
              }}
            >
              ✕ Exit analysis
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
    <div
      style={{
        padding: 16,
        color: "#64748b",
        fontSize: 11.5,
        fontStyle: "italic",
      }}
    >
      Loading…
    </div>
  );
}

export default Sidebar;

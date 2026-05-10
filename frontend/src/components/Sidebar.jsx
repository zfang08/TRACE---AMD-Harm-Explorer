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
        padding: "8px 10px",
        marginBottom: 6,
        background: on ? color : "rgba(255,255,255,0.7)",
        color: on ? "#ffffff" : "#1e293b",
        border: `1px solid ${on ? color : "rgba(15,23,42,0.15)"}`,
        borderRadius: 8,
        cursor: "pointer",
        fontSize: 12,
        fontWeight: 500,
        letterSpacing: "0.04em",
        transition: "background 150ms ease, color 150ms ease",
        fontFamily: "inherit",
      }}
    >
      <span
        style={{
          width: 14,
          height: 14,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          border: `1px solid ${on ? "#ffffff" : "rgba(15,23,42,0.3)"}`,
          borderRadius: 3,
          fontSize: 10,
          background: on ? "rgba(255,255,255,0.18)" : "transparent",
        }}
      >
        {on ? "✓" : ""}
      </span>
      <span style={{ flex: 1, textAlign: "left" }}>{label}</span>
      <span
        style={{
          fontSize: 10,
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
}) {
  const [colliery, setColliery] = useState(null);
  const [station, setStation] = useState(null);
  const [harm, setHarm] = useState(null);
  const [searchQ, setSearchQ] = useState("");

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
  let mainPanel = null;
  if (selectedHarmId && harm) {
    mainPanel = (
      <HarmPanel
        harm={harm}
        onBack={onHarmBack}
        backLabel="Back"
        onFocus={onFocus}
        simulating={simulating}
        onToggleSimulate={onToggleSimulate}
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
          simulating={simulating}
          onToggleSimulate={onToggleSimulate}
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
        style={{ color: "#475569", fontSize: 13, lineHeight: 1.55, padding: 14 }}
      >
        <p
          style={{
            marginTop: 0,
            color: "#1e293b",
            fontWeight: 500,
            fontSize: 14,
            letterSpacing: "0.01em",
          }}
        >
          Pennsylvania Anthracite AMD Atlas
        </p>
        <p
          style={{
            color: "#64748b",
            fontSize: 12,
            fontStyle: "italic",
            marginTop: 6,
            marginBottom: 18,
            letterSpacing: "0.02em",
            lineHeight: 1.6,
          }}
        >
          Pick a top-ranked entity below, or click any map marker to drill in.
        </p>

        <div
          style={{
            fontSize: 10,
            fontWeight: 600,
            color: "#475569",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            marginBottom: 8,
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
            fontSize: 10.5,
            fontStyle: "italic",
            marginTop: 18,
            letterSpacing: "0.02em",
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
        width: collapsed ? "auto" : 320,
        maxHeight: "calc(100vh - 24px)",
        background: PANEL_BG,
        border: PANEL_BORDER,
        borderRadius: PANEL_RADIUS,
        boxShadow: PANEL_SHADOW,
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        fontSize: 12,
        color: "#0f172a",
        overflow: "hidden",
        letterSpacing: "0.01em",
        display: "flex",
        flexDirection: "column",
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
          fontSize: 12,
          fontWeight: 400,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "#0f172a",
          fontFamily: "inherit",
        }}
      >
        <span style={{ fontSize: 11, color: "#94a3b8" }}>
          {collapsed ? "▸" : "▾"}
        </span>
        <span>TRACE</span>
        {!collapsed ? (
          <span
            style={{
              marginLeft: "auto",
              fontSize: 9.5,
              fontWeight: 400,
              fontStyle: "italic",
              color: "#94a3b8",
              letterSpacing: "0.06em",
              textTransform: "none",
            }}
          >
            AMD Harm Atlas
          </span>
        ) : null}
      </button>

      {!collapsed ? (
        <>
          {/* search + (optional) exit-analysis pill */}
          <div
            style={{
              padding: "0 12px 10px",
              borderBottom: "1px solid rgba(15,23,42,0.06)",
              position: "relative",
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
                fontSize: 12,
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
                      fontSize: 12,
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
                        fontSize: 9,
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
                  fontSize: 11,
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
            style={{
              flex: 1,
              overflow: "auto",
              minHeight: 0,
            }}
          >
            {mainPanel}
          </div>
        </>
      ) : null}
    </aside>
  );
}

function Loading() {
  return (
    <div
      style={{
        padding: 16,
        color: "#64748b",
        fontSize: 13,
        fontStyle: "italic",
      }}
    >
      Loading…
    </div>
  );
}

export default Sidebar;

import React, { useEffect, useMemo, useState } from "react";
import IntroOverlay from "./components/IntroOverlay";
import LayerControlPanel from "./components/LayerControlPanel";
import MapView from "./components/MapView";
import Sidebar from "./components/Sidebar";
import {
  getCollieries,
  getHarms,
  getPollutionSources,
  getRelatedIds,
  getStations,
  getWqSummary,
} from "./services/api";

const EMPTY_RELATED = {
  harm_ids: [],
  pollution_source_ids: [],
  station_ids: [],
  segment_ids: [],
  colliery_ids: [],
};

// Top-K ranking 用：严重度权重
const SEVERITY_WEIGHT = { extreme: 4, high: 3, medium: 2, low: 1 };
const TOP_K = 5;
// 多源粒子模拟最大同时参与的 AMD 数（含 anchor）。粒子总预算在 MapView 控制。
const MAX_SIM_SOURCES = 30;
const INACTIVE_STATUSES = ["INACTIVE", "ABANDONED", "PROPOSED_NEVER_REALIZED"];

function App() {
  // analysisFocus = { kind: "colliery"|"station"|"pollution_source"|"segment", id }
  // null = 浏览模式
  const [analysisFocus, setAnalysisFocus] = useState(null);
  // 二级选中：已经在分析模式时再点 harm 列表里的某条 harm 进 HarmPanel 详情
  const [selectedHarmId, setSelectedHarmId] = useState(null);
  // dim/highlight 用的相关 entity id 集合
  const [relatedIds, setRelatedIds] = useState(EMPTY_RELATED);

  const [visibleLayers, setVisibleLayers] = useState({
    collieries: true,
    collieryStatus: { active: true, inactive: true, reclaimed: true },
    stations: true,
    sources: true,
    sourceSeverity: { extremeHigh: true, medium: true, low: true },
    streams: true,
  });

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  // Splash 页：默认显示，点击进入后翻 false
  const [introVisible, setIntroVisible] = useState(true);
  // 粒子模拟开关：用户在 source/harm panel 上点 simulate 按钮才启动
  const [simulating, setSimulating] = useState(false);
  // 上游溯源：距离挡位 + 结果
  const [upstreamKm, setUpstreamKm] = useState(20);
  const [upstreamResult, setUpstreamResult] = useState(null);
  // 2D / 3D 视角：默认 3D（splash 退出后 pitch=45°），右上 panel 切换
  const [is3D, setIs3D] = useState(true);
  // Viz 强度图层开关（独立于 2D/3D 相机）：sidebar 上的 toggle 控制
  const [vizColliery, setVizColliery] = useState(true);
  const [vizAmd, setVizAmd] = useState(true);
  const [vizPh, setVizPh] = useState(true);
  const [vizMetal, setVizMetal] = useState(true);
  // 水质摘要：pH + Iron 均值，按站点
  const [wqSummary, setWqSummary] = useState(null);

  // 多源粒子模拟：anchor = analysisFocus.id (kind=pollution_source)，
  // extraSourceIds = 用户在 SimulateBlock 里勾选的额外 AMD 源 id。
  // addMode 打开时，地图上点 AMD 不再切换 focus，而是 toggle 进 extras。
  const [extraSourceIds, setExtraSourceIds] = useState([]);
  const [addMode, setAddMode] = useState(false);

  // 全局 prefetch：搜索 / 计数 / SegmentPanel 都要拿这 3 个 list
  const [searchIndex, setSearchIndex] = useState({
    collieries: [],
    stations: [],
    harms: [],
  });
  // 完整 harm list（带 source_collieries / key_metrics），Top-K 计算用
  const [allHarms, setAllHarms] = useState([]);
  // 全量 pollution sources：SimulateBlock 渲染 chip 需要拿到 name/severity/lat-lon
  const [allSources, setAllSources] = useState([]);
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getCollieries(),
      getStations(),
      getHarms(),
      getPollutionSources(),
      getWqSummary(),
    ])
      .then(([collieries, stations, harms, sources, wqData]) => {
        if (cancelled) return;
        setSearchIndex({
          collieries: collieries || [],
          stations: stations || [],
          harms: (harms || []).map((h) => ({
            id: h.id,
            name: h.name,
            severity: h.severity,
          })),
        });
        setAllHarms(harms || []);
        setAllSources(sources || []);
        setWqSummary(wqData || []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // sourceId → { id, name, latitude, longitude, severity } lookup
  // SimulateBlock 渲染 chip 用；severity 来自 harms（source 自己没存）。
  const sourceById = useMemo(() => {
    const sevByPid = new Map();
    for (const h of allHarms) {
      if (h?.pollution_source_id && h?.severity) {
        sevByPid.set(h.pollution_source_id, h.severity);
      }
    }
    const m = new Map();
    for (const s of allSources) {
      m.set(s.id, {
        id: s.id,
        name: s.name,
        latitude: s.latitude,
        longitude: s.longitude,
        severity: sevByPid.get(s.id) || null,
      });
    }
    return m;
  }, [allSources, allHarms]);

  // 全量带 score 和 lat/lon 的 colliery 排行——给 3D extrusion + sidebar Top-K 共用
  const scoredCollieries = useMemo(() => {
    const collieryById = new Map();
    for (const c of searchIndex.collieries || []) collieryById.set(c.id, c);

    const scored = new Map();
    for (const h of allHarms) {
      const w = SEVERITY_WEIGHT[h.severity] || 0;
      if (w === 0) continue;
      for (const c of h.source_collieries || []) {
        if (!c?.id) continue;
        const full = collieryById.get(c.id);
        // 没找到完整 colliery 记录就跳过（拿不到 lat/lon，extrude 不出柱）
        if (!full) continue;
        const cur = scored.get(c.id) || {
          id: c.id,
          name: c.name || full.name || c.id,
          operator: c.operator || full.operator || "",
          status: c.status || full.status || "",
          latitude: full.latitude,
          longitude: full.longitude,
          score: 0,
          harmCount: 0,
        };
        cur.score += w;
        cur.harmCount += 1;
        scored.set(c.id, cur);
      }
    }
    return Array.from(scored.values())
      .filter((c) => c.latitude != null && c.longitude != null)
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  }, [allHarms, searchIndex.collieries]);

  // sidebar Top-K 取前 8
  const topCollieries = useMemo(
    () => scoredCollieries.slice(0, TOP_K),
    [scoredCollieries],
  );

  // AMD source 强度热力图用：每个 source 一个 weight = harm severity weight。
  // 没有关联 harm 的 source 也纳入，给一个基础权重 0.4，确保全地图都有热力覆盖。
  const scoredAmdSources = useMemo(() => {
    const scored = new Map();
    for (const h of allHarms) {
      const w = SEVERITY_WEIGHT[h.severity] || 0;
      if (w === 0) continue;
      const sid = h.pollution_source_id;
      if (!sid) continue;
      scored.set(sid, { id: sid, weight: w, severity: h.severity });
    }
    // unregistered sources: baseline weight so they still show on the heatmap
    for (const s of allSources) {
      if (!scored.has(s.id)) {
        scored.set(s.id, { id: s.id, weight: 0.4, severity: null });
      }
    }
    return Array.from(scored.values());
  }, [allHarms, allSources]);

  // Top-K harm：按 (severity_rank desc, flow_gpm desc) 字典序
  const topHarms = useMemo(() => {
    return [...allHarms]
      .sort((a, b) => {
        const sa = SEVERITY_WEIGHT[a.severity] || 0;
        const sb = SEVERITY_WEIGHT[b.severity] || 0;
        if (sa !== sb) return sb - sa;
        const fa = a.key_metrics?.flow_gpm ?? 0;
        const fb = b.key_metrics?.flow_gpm ?? 0;
        return fb - fa;
      })
      .slice(0, TOP_K)
      .map((h) => ({
        id: h.id,
        name: h.name,
        severity: h.severity,
        flow_gpm: h.key_metrics?.flow_gpm ?? null,
        n_reaches: h.key_metrics?.n_reaches ?? null,
      }));
  }, [allHarms]);

  // 切换 analysisFocus → 立刻清空 relatedIds（防止上一次的关联在新 entity 的
  // 视图里残留高亮），然后异步拉新的 related set。
  useEffect(() => {
    setRelatedIds(EMPTY_RELATED);
    if (!analysisFocus) return;
    let cancelled = false;
    getRelatedIds(analysisFocus.kind, analysisFocus.id)
      .then((ids) => {
        if (cancelled) return;
        setRelatedIds({ ...EMPTY_RELATED, ...ids });
      })
      .catch(() => {
        if (!cancelled) setRelatedIds(EMPTY_RELATED);
      });
    return () => {
      cancelled = true;
    };
  }, [analysisFocus]);

  // 切换 / 退出 focus 时同步清空 relatedIds + 关闭 simulation——避免 React 渲染
  // 顺序导致 MapView 的 paint effect 用"新 focus + 上一个 entity 的 relatedIds"
  // 画一帧；同时切换实体时模拟应该重置回未启动状态。
  // 多源 sim 的 extraSourceIds / addMode 也一并清掉：换 anchor 就换新一组。
  const focus = (kind, id) => {
    setAnalysisFocus({ kind, id });
    setSelectedHarmId(null);
    setRelatedIds(EMPTY_RELATED);
    setSimulating(false);
    setExtraSourceIds([]);
    setAddMode(false);
  };
  const exitFocus = () => {
    setAnalysisFocus(null);
    setSelectedHarmId(null);
    setRelatedIds(EMPTY_RELATED);
    setSimulating(false);
    setExtraSourceIds([]);
    setAddMode(false);
  };
  const enterHarm = (harmId) => {
    const sourceId = (harmId || "").replace(/^harm-/, "");
    if (sourceId) {
      setAnalysisFocus({ kind: "pollution_source", id: sourceId });
    }
    setSelectedHarmId(harmId);
    setRelatedIds(EMPTY_RELATED);
    setSimulating(false);
    setExtraSourceIds([]);
    setAddMode(false);
  };

  // simulationSourceIds = anchor + extras（去重 + 30 上限）。
  // 没 anchor 就是空：粒子完全不跑。
  const simulationSourceIds = useMemo(() => {
    if (analysisFocus?.kind !== "pollution_source") return [];
    const anchor = analysisFocus.id;
    const list = [anchor];
    for (const id of extraSourceIds) {
      if (id !== anchor && list.length < MAX_SIM_SOURCES) list.push(id);
    }
    return list;
  }, [analysisFocus, extraSourceIds]);

  // 多源高亮：后端 getRelatedIds 只针对 anchor，extras 的下游 / 源矿井 / 监测站
  // 也要并进同一个 relatedIds 集合让 MapView 的 paint 表达式一并 highlight。
  // 直接从 allHarms 客户端 join，不再多 N 次 HTTP。
  const extendedRelatedIds = useMemo(() => {
    if (analysisFocus?.kind !== "pollution_source") return relatedIds;
    if (extraSourceIds.length === 0) return relatedIds;

    const harmsByPid = new Map();
    for (const h of allHarms) {
      if (h?.pollution_source_id) harmsByPid.set(h.pollution_source_id, h);
    }

    const segIds = new Set(relatedIds.segment_ids || []);
    const collIds = new Set(relatedIds.colliery_ids || []);
    const stnIds = new Set(relatedIds.station_ids || []);
    const psIds = new Set(relatedIds.pollution_source_ids || []);
    const harmIds = new Set(relatedIds.harm_ids || []);

    for (const sid of extraSourceIds) {
      const h = harmsByPid.get(sid);
      if (!h) continue;
      for (const s of h.affected_streams || []) {
        if (s?.id) segIds.add(s.id);
      }
      for (const c of h.source_collieries || []) {
        if (c?.id) collIds.add(c.id);
      }
      for (const s of h.stations || []) {
        if (s?.id) stnIds.add(s.id);
      }
      psIds.add(sid);
      if (h.id) harmIds.add(h.id);
    }

    return {
      segment_ids: Array.from(segIds),
      colliery_ids: Array.from(collIds),
      station_ids: Array.from(stnIds),
      pollution_source_ids: Array.from(psIds),
      harm_ids: Array.from(harmIds),
    };
  }, [analysisFocus, extraSourceIds, relatedIds, allHarms]);

  // 地图上点了一个 AMD（在 addMode 下）→ toggle 进 extras 集合。
  // 不能 toggle 掉 anchor（anchor 是 focus 本身，要换 anchor 得点别处或 exit）。
  const toggleSourceInSim = (id) => {
    if (!id) return;
    if (analysisFocus?.kind !== "pollution_source") return;
    if (id === analysisFocus.id) return;
    setExtraSourceIds((cur) => {
      if (cur.includes(id)) return cur.filter((x) => x !== id);
      // anchor 占一位 → extras 上限是 MAX-1
      if (cur.length + 1 >= MAX_SIM_SOURCES) return cur;
      return [...cur, id];
    });
  };
  // SimulateBlock 的 chip × 按钮调用：只能移除 extras，不能移 anchor。
  const removeExtraSource = (id) => {
    setExtraSourceIds((cur) => cur.filter((x) => x !== id));
  };
  const toggleAddMode = () => setAddMode((v) => !v);

  const collieryStatusCounts = useMemo(() => ({
    active:   searchIndex.collieries.filter((c) => c.status === "ACTIVE").length,
    inactive: searchIndex.collieries.filter((c) => INACTIVE_STATUSES.includes(c.status)).length,
    reclaimed: searchIndex.collieries.filter((c) => c.status === "RECLAMATION_COMPLETED").length,
  }), [searchIndex.collieries]);

  const sourceSeverityCounts = useMemo(() => ({
    extremeHigh: searchIndex.harms.filter((h) => h.severity === "extreme" || h.severity === "high").length,
    medium: searchIndex.harms.filter((h) => h.severity === "medium").length,
    low:    searchIndex.harms.filter((h) => h.severity === "low").length,
  }), [searchIndex.harms]);

  const counts = {
    collieries: searchIndex.collieries.length,
    collieryStatus: collieryStatusCounts,
    stations: searchIndex.stations.length,
    sources: searchIndex.harms.length,
    sourceSeverity: sourceSeverityCounts,
    streams: 20033,
  };

  return (
    <div
      style={{
        position: "relative",
        height: "100vh",
        width: "100%",
        overflow: "hidden",
      }}
    >
      <MapView
        visibleLayers={visibleLayers}
        analysisFocus={analysisFocus}
        relatedIds={extendedRelatedIds}
        onFocus={focus}
        onExitFocus={exitFocus}
        orbit={introVisible}
        simulating={simulating}
        is3D={is3D}
        scoredCollieries={scoredCollieries}
        scoredAmdSources={scoredAmdSources}
        vizColliery={vizColliery}
        vizAmd={vizAmd}
        vizPh={vizPh}
        vizMetal={vizMetal}
        wqSummary={wqSummary}
        simulationSourceIds={simulationSourceIds}
        extraSourceIds={extraSourceIds}
        addMode={addMode}
        onToggleSourceInSim={toggleSourceInSim}
        upstreamKm={upstreamKm}
        onUpstreamResult={setUpstreamResult}
      />

      {introVisible ? (
        <IntroOverlay onEnter={() => setIntroVisible(false)} />
      ) : null}

      {/* Splash exit: both panels float over the map; sidebar handles its own
          positioning + collapsed state, mirroring LayerControlPanel's pattern */}
      {!introVisible ? (
        <>
          <LayerControlPanel
            visibleLayers={visibleLayers}
            onChange={setVisibleLayers}
            counts={counts}
            is3D={is3D}
            onToggle3D={setIs3D}
          />

          <Sidebar
            analysisFocus={analysisFocus}
            selectedHarmId={selectedHarmId}
            onHarmSelect={enterHarm}
            onHarmBack={() => setSelectedHarmId(null)}
            onFocus={focus}
            onExitFocus={exitFocus}
            searchIndex={searchIndex}
            collapsed={sidebarCollapsed}
            onToggle={() => setSidebarCollapsed((v) => !v)}
            simulating={simulating}
            onToggleSimulate={() => setSimulating((v) => !v)}
            topCollieries={topCollieries}
            topHarms={topHarms}
            vizColliery={vizColliery}
            vizAmd={vizAmd}
            vizPh={vizPh}
            vizMetal={vizMetal}
            onToggleVizColliery={() => setVizColliery((v) => !v)}
            onToggleVizAmd={() => setVizAmd((v) => !v)}
            onToggleVizPh={() => setVizPh((v) => !v)}
            onToggleVizMetal={() => setVizMetal((v) => !v)}
            simulationSourceIds={simulationSourceIds}
            extraSourceIds={extraSourceIds}
            sourceById={sourceById}
            addMode={addMode}
            onToggleAddMode={toggleAddMode}
            onRemoveExtraSource={removeExtraSource}
            maxSimSources={MAX_SIM_SOURCES}
            upstreamKm={upstreamKm}
            onUpstreamKmChange={setUpstreamKm}
            upstreamResult={upstreamResult}
          />
        </>
      ) : null}
    </div>
  );
}

export default App;

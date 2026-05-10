import React, { useEffect, useMemo, useState } from "react";
import IntroOverlay from "./components/IntroOverlay";
import LayerControlPanel from "./components/LayerControlPanel";
import MapView from "./components/MapView";
import Sidebar from "./components/Sidebar";
import {
  getCollieries,
  getHarms,
  getRelatedIds,
  getStations,
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
const TOP_K = 8;

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
    stations: true,
    sources: true,
    streams: true,
  });

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  // Splash 页：默认显示，点击进入后翻 false
  const [introVisible, setIntroVisible] = useState(true);
  // 粒子模拟开关：用户在 source/harm panel 上点 simulate 按钮才启动
  const [simulating, setSimulating] = useState(false);
  // 2D / 3D 视角：默认 3D（splash 退出后 pitch=45°），右上 panel 切换
  const [is3D, setIs3D] = useState(true);
  // Viz 强度图层开关（独立于 2D/3D 相机）：sidebar 上的两个 toggle 控制
  const [vizColliery, setVizColliery] = useState(true);
  const [vizAmd, setVizAmd] = useState(true);

  // 全局 prefetch：搜索 / 计数 / SegmentPanel 都要拿这 3 个 list
  const [searchIndex, setSearchIndex] = useState({
    collieries: [],
    stations: [],
    harms: [],
  });
  // 完整 harm list（带 source_collieries / key_metrics），Top-K 计算用
  const [allHarms, setAllHarms] = useState([]);
  useEffect(() => {
    let cancelled = false;
    Promise.all([getCollieries(), getStations(), getHarms()])
      .then(([collieries, stations, harms]) => {
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
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

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

  // AMD source 强度热力图用：每个 source 一个 weight = harm severity weight
  // 注：harm.id = "harm-{source.id}"，所以从 allHarms 反推 source 的 severity
  const scoredAmdSources = useMemo(() => {
    const points = [];
    for (const h of allHarms) {
      const w = SEVERITY_WEIGHT[h.severity] || 0;
      if (w === 0) continue;
      const sid = h.pollution_source_id;
      if (!sid) continue;
      // pollution_source 的 lat/lon 在 harm 里没有；MapView 自己有 sources 列表
      // 所以这里只 export id+weight，MapView 收到后自己 join 坐标
      points.push({ id: sid, weight: w, severity: h.severity });
    }
    return points;
  }, [allHarms]);

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
  const focus = (kind, id) => {
    setAnalysisFocus({ kind, id });
    setSelectedHarmId(null);
    setRelatedIds(EMPTY_RELATED);
    setSimulating(false);
  };
  const exitFocus = () => {
    setAnalysisFocus(null);
    setSelectedHarmId(null);
    setRelatedIds(EMPTY_RELATED);
    setSimulating(false);
  };
  const enterHarm = (harmId) => {
    const sourceId = (harmId || "").replace(/^harm-/, "");
    if (sourceId) {
      setAnalysisFocus({ kind: "pollution_source", id: sourceId });
    }
    setSelectedHarmId(harmId);
    setRelatedIds(EMPTY_RELATED);
    setSimulating(false);
  };

  const counts = {
    collieries: searchIndex.collieries.length,
    stations: searchIndex.stations.length,
    sources: searchIndex.harms.length, // 1:1 对应 pollution source
    streams: 20033, // 静态：data/final/stream_segments.geojson
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
        relatedIds={relatedIds}
        onFocus={focus}
        onExitFocus={exitFocus}
        orbit={introVisible}
        simulating={simulating}
        is3D={is3D}
        scoredCollieries={scoredCollieries}
        scoredAmdSources={scoredAmdSources}
        vizColliery={vizColliery}
        vizAmd={vizAmd}
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
            onToggleVizColliery={() => setVizColliery((v) => !v)}
            onToggleVizAmd={() => setVizAmd((v) => !v)}
          />
        </>
      ) : null}
    </div>
  );
}

export default App;

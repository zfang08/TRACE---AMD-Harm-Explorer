import React, { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import {
  getCollieries,
  getHarms,
  getPollutionSources,
  getStations,
  getStreamSegments,
} from "../services/api";
import { buildSegmentsById } from "../sim/segmentGraph";
import {
  buildPolylineFromPath,
  pointAndTangentAtDistance,
} from "../sim/polyline";

// 粒子流：跟随 analysisFocus = pollution_source 时自动启动；其他状态停止
const RUN_PARTICLE_SIM = true;

const COLL_SOURCE_ID = "collieries-source";
const COLL_LAYER_ID = "collieries-layer";
const STATION_SOURCE_ID = "stations-source";
const STATION_LAYER_ID = "stations-layer";
const STREAM_SOURCE_ID = "streams-source";
const STREAM_LAYER_ID = "streams-layer";
const ACTIVE_PATH_LAYER_ID = "active-path-layer";
const SRC_SOURCE_ID = "pollution-sources-source";
const SRC_LAYER_ID = "pollution-sources-layer";
const PARTICLES_SOURCE_ID = "particles-source";
const PARTICLES_LAYER_ID = "particles-layer";
const PARTICLES_GLOW_LAYER_ID = "particles-glow-layer";
const COLL_EXTRUDE_SOURCE_ID = "colliery-extrude-source";
const COLL_EXTRUDE_LAYER_ID = "colliery-extrude-layer";
const COLL_HEATMAP_SOURCE_ID = "colliery-heatmap-source";
const COLL_HEATMAP_LAYER_ID = "colliery-heatmap-layer";
const AMD_HEATMAP_SOURCE_ID = "amd-heatmap-source";
const AMD_HEATMAP_LAYER_ID = "amd-heatmap-layer";
// 多源 sim：参与模拟的 AMD 在地图上画一圈白色光环以示"已加入"
const SIM_HALO_SOURCE_ID = "sim-halo-source";
const SIM_HALO_LAYER_ID = "sim-halo-layer";

// 3D 柱：半径 200m（远视图也看得见），高度 = score × 80
const EXTRUDE_RADIUS_M = 200;
const EXTRUDE_HEIGHT_PER_SCORE = 80;

// 把单个点合成 12-边形圆 polygon，作为 fill-extrusion 的几何体（mapbox 不能
// 直接 extrude point；polygon 是必需的）。半径用 m，按当地纬度换 deg。
function makeCirclePolygon(lon, lat, radiusM, sides = 12) {
  const M_PER_DEG_LAT = 111320;
  const mPerDegLon = Math.cos((lat * Math.PI) / 180) * M_PER_DEG_LAT || 1;
  const ring = [];
  for (let i = 0; i <= sides; i += 1) {
    const a = (i / sides) * 2 * Math.PI;
    const dx = radiusM * Math.cos(a);
    const dy = radiusM * Math.sin(a);
    ring.push([lon + dx / mPerDegLon, lat + dy / M_PER_DEG_LAT]);
  }
  return { type: "Polygon", coordinates: [ring] };
}

function buildExtrudeFeatureCollection(scoredCollieries) {
  return {
    type: "FeatureCollection",
    features: (scoredCollieries || []).map((c) => ({
      type: "Feature",
      geometry: makeCirclePolygon(c.longitude, c.latitude, EXTRUDE_RADIUS_M),
      properties: {
        id: c.id,
        score: c.score,
        status: c.status || "",
      },
    })),
  };
}

// 热力图：每个 colliery 一个 Point feature，weight = score
function buildHeatmapFeatureCollection(scoredCollieries) {
  return {
    type: "FeatureCollection",
    features: (scoredCollieries || []).map((c) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [c.longitude, c.latitude] },
      properties: { weight: c.score },
    })),
  };
}

// 粒子起点颜色按 source.severity 取深红梯度，终点固定 cold slate
const PARTICLE_HOT_COLOR = {
  extreme: "#7f1d1d",
  high: "#b91c1c",
  medium: "#dc2626",
  low: "#fda4af",
  DEFAULT: "#dc2626",
};
const PARTICLE_COLD_COLOR = "#94a3b8";

// Box-Muller：标准正态采样。粒子 random walk 用。
function randn() {
  const u1 = Math.max(1e-9, Math.random());
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

// 把 (srcLon, srcLat) 垂直投影到 polyline 上，返回沿 polyline 的累计米数。
// snap_to_segments 只确保 source.attach_segment_id 是最近 segment，不保证 source
// 就在该 segment 的起点。粒子起点应该是真实投影位置，不然会"凭空多出一段上游"。
// 计算在 lon/lat 度空间做（小区域内近似 Cartesian），距离比较时用度²即可。
function projectOntoPolyline(srcLon, srcLat, polyline) {
  const { coords, segLens } = polyline;
  if (!coords || coords.length < 2) return 0;
  let bestDistSq = Infinity;
  let bestAlong = 0;
  let cumLen = 0;
  for (let i = 0; i < coords.length - 1; i += 1) {
    const [ax, ay] = coords[i];
    const [bx, by] = coords[i + 1];
    const dx = bx - ax;
    const dy = by - ay;
    const segLenSq = dx * dx + dy * dy;
    let t = 0;
    if (segLenSq > 1e-14) {
      t = ((srcLon - ax) * dx + (srcLat - ay) * dy) / segLenSq;
      if (t < 0) t = 0;
      else if (t > 1) t = 1;
    }
    const projX = ax + t * dx;
    const projY = ay + t * dy;
    const ddx = srcLon - projX;
    const ddy = srcLat - projY;
    const distSq = ddx * ddx + ddy * ddy;
    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      bestAlong = cumLen + t * (segLens[i] || 0);
    }
    cumLen += segLens[i] || 0;
  }
  return bestAlong;
}

// Advection-diffusion 物理参数（视觉值）。再往上推一波：更快、更宽、更密。
const PARTICLE_PHYSICS = {
  u: 380, // m/s 平流速度（明显更快）
  D: 8000, // m²/s 扩散（u 翻倍后传输时间减半，D 也要 ×2 才能保持视觉宽度）
  k: 0.012, // 1/s 衰减——快了之后整体寿命短，k 也要适度上调让末端褪色
  jitterSigma: 25, // m 起点横向 jitter
};

const PARTICLE_DEFAULTS = {
  // 多源模式下粒子总预算共享。单源时 ~1800 已经够"plume"感；多源时拉到 4500
  // 让 30 个源各自能维持 ~100 粒子的可见密度而不内卷。
  maxParticles: 4500,
  particleSize: 2.2, // 单粒子明显变小，让密度成主视觉而非个体
  particleLife: 90,
  emissionGain: 8, // spawn rate 压缩系数（继续上调）
  emissionMin: 8,
  emissionMax: 100, // 高流量 source 现在能飙到 100 spawn/s
  speedJitterMin: 0.6,
  speedJitterSpan: 0.8, // speedMul ∈ [0.6, 1.4]，更分散的速度场
};

// 高级灰主调：colliery 走 slate 单色梯度（深 → 浅）+ 一个 lime 绿 accent 标
// "已修复"。Station 走 violet（紫罗兰），冷色但跟河网蓝、source 红都不撞。
// Source 是红色梯度（唯一暖色），全场仅它独占 attention 重量。
const COLLIERY_COLORS = {
  ACTIVE: "#1e293b",                 // slate-800   深炭：还在挖（最重）
  INACTIVE: "#94a3b8",               // slate-400   中灰：暂停
  ABANDONED: "#475569",              // slate-600   暗灰：废弃（AMD 威胁）
  RECLAMATION_COMPLETED: "#65a30d",  // lime-600    绿：唯一 accent，"已修复"
  PROPOSED_NEVER_REALIZED: "#e2e8f0",// slate-200   极浅：从未动工
  DEFAULT: "#9ca3af",                // gray-400
};

const STATION_COLORS = {
  DUAL: "#5b21b6",    // violet-700  深紫罗兰：双源（NWIS+WQP），最可信
  SINGLE: "#a78bfa",  // violet-400  浅紫：单源
};

// "icon-image" 用 match 表达式按 feature 属性挑预生成的图标
const COLLIERY_ICON_EXPR = [
  "match",
  ["get", "status"],
  "ACTIVE", "coll-ACTIVE",
  "INACTIVE", "coll-INACTIVE",
  "ABANDONED", "coll-ABANDONED",
  "RECLAMATION_COMPLETED", "coll-RECLAMATION_COMPLETED",
  "PROPOSED_NEVER_REALIZED", "coll-PROPOSED_NEVER_REALIZED",
  "coll-DEFAULT",
];

const STATION_ICON_EXPR = [
  "case",
  ["==", ["length", ["coalesce", ["get", "sourcesStr"], ""]], 8],
  "station-DUAL",
  "station-SINGLE",
];

// 单色红梯度。全场唯一暖色，独占 attention 重量。
// 跨度：red-900（深酒红）→ rose-300（柔粉），4 档过渡均匀，可读性高。
const SOURCE_COLORS = {
  extreme: "#7f1d1d", // red-900    深酒红
  high: "#b91c1c",    // red-700    深红
  medium: "#dc2626",  // red-600    标准红
  low: "#fda4af",     // rose-300   柔粉（可读但 recede）
  DEFAULT: "#fee2e2", // red-100
};

const SOURCE_ICON_EXPR = [
  "match",
  ["get", "severity"],
  "extreme", "src-extreme",
  "high", "src-high",
  "medium", "src-medium",
  "low", "src-low",
  "src-DEFAULT",
];

// ------- analysis paint helpers -------
// 三态：选中 / 相关 / dim（非相关）。要分清"浏览模式"和"分析模式但本层没相关"
// 这俩——后者必须把整层 dim 掉，不能 fall back 到 browse default。
function opacityExpr(focusedId, relatedIds, browseDefault, isAnalysisActive) {
  if (!isAnalysisActive) return browseDefault;
  if (!focusedId && (!relatedIds || relatedIds.length === 0)) {
    // 分析模式开着、但本层既无选中也无相关 → 整层 dim
    return 0.15;
  }
  return [
    "case",
    ["==", ["get", "id"], focusedId || "_none_"],
    1,
    ["in", ["get", "id"], ["literal", relatedIds || []]],
    0.95,
    0.15,
  ];
}

function sizeExpr(focusedId, relatedIds, sizes, isAnalysisActive) {
  // sizes = {sel, rel, dim, browse}
  if (!isAnalysisActive) return sizes.browse;
  if (!focusedId && (!relatedIds || relatedIds.length === 0)) {
    return sizes.dim;
  }
  return [
    "case",
    ["==", ["get", "id"], focusedId || "_none_"],
    sizes.sel,
    ["in", ["get", "id"], ["literal", relatedIds || []]],
    sizes.rel,
    sizes.dim,
  ];
}

// ------- 程序生成 marker 图标（canvas → ImageData → mapbox addImage）------
// 22 logical px，pixelRatio 2 对高 DPI 屏幕清晰；
// house = 矿厂 / diamond = 监测站 / droplet = AMD 排放点
function makeShapeIcon(shape, fillColor) {
  const ratio = 2;
  const sizeLogical = 22;
  const sizePx = sizeLogical * ratio;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = sizePx;
  const ctx = canvas.getContext("2d");
  ctx.scale(ratio, ratio);
  ctx.fillStyle = fillColor;
  // off-white 描边，避免纯白在浅色地图上"漂"；细一点显得克制
  ctx.strokeStyle = "#f8fafc"; // slate-50
  ctx.lineWidth = 1.2;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  const c = sizeLogical / 2;

  if (shape === "house") {
    // 房子：矩形底 + 三角顶（联想"矿厂"）
    const roofTop = sizeLogical * 0.18;
    const roofBottom = sizeLogical * 0.55;
    const baseBottom = sizeLogical * 0.88;
    const left = sizeLogical * 0.18;
    const right = sizeLogical * 0.82;
    // 用一条 path 一次画完，避免边缝
    ctx.beginPath();
    ctx.moveTo(left, baseBottom);
    ctx.lineTo(left, roofBottom);
    ctx.lineTo(c, roofTop);
    ctx.lineTo(right, roofBottom);
    ctx.lineTo(right, baseBottom);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // 烟囱（小矩形在屋顶右上）
    const chW = sizeLogical * 0.1;
    const chX = sizeLogical * 0.62;
    const chTop = sizeLogical * 0.25;
    const chBot = sizeLogical * 0.4;
    ctx.beginPath();
    ctx.rect(chX, chTop, chW, chBot - chTop);
    ctx.fill();
    ctx.stroke();
  } else if (shape === "diamond") {
    // 菱形 + 内白点（联想"仪器/data point"）
    ctx.beginPath();
    ctx.moveTo(c, sizeLogical * 0.1);
    ctx.lineTo(sizeLogical * 0.9, c);
    ctx.lineTo(c, sizeLogical * 0.9);
    ctx.lineTo(sizeLogical * 0.1, c);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(c, c, sizeLogical * 0.1, 0, Math.PI * 2);
    ctx.fill();
  } else if (shape === "droplet") {
    // 水滴（teardrop pointing down，联想"AMD 排放"）
    // 顶部尖点 + 两侧 bezier 曲到底部圆滑
    const top = sizeLogical * 0.1;
    const bottom = sizeLogical * 0.92;
    const wide = sizeLogical * 0.62;
    ctx.beginPath();
    ctx.moveTo(c, top);
    ctx.bezierCurveTo(
      c + wide / 2,
      sizeLogical * 0.4,
      c + wide / 2,
      sizeLogical * 0.78,
      c,
      bottom,
    );
    ctx.bezierCurveTo(
      c - wide / 2,
      sizeLogical * 0.78,
      c - wide / 2,
      sizeLogical * 0.4,
      c,
      top,
    );
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // 高光：左上一道小弧（让水滴更立体）
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(c - wide * 0.18, sizeLogical * 0.36);
    ctx.bezierCurveTo(
      c - wide * 0.3,
      sizeLogical * 0.5,
      c - wide * 0.3,
      sizeLogical * 0.65,
      c - wide * 0.18,
      sizeLogical * 0.74,
    );
    ctx.stroke();
  }
  return { image: ctx.getImageData(0, 0, sizePx, sizePx), pixelRatio: ratio };
}

function registerMarkerIcons(map) {
  const defs = [
    // colliery — 房子形
    ["coll-ACTIVE", "house", COLLIERY_COLORS.ACTIVE],
    ["coll-INACTIVE", "house", COLLIERY_COLORS.INACTIVE],
    ["coll-ABANDONED", "house", COLLIERY_COLORS.ABANDONED],
    ["coll-RECLAMATION_COMPLETED", "house", COLLIERY_COLORS.RECLAMATION_COMPLETED],
    ["coll-PROPOSED_NEVER_REALIZED", "house", COLLIERY_COLORS.PROPOSED_NEVER_REALIZED],
    ["coll-DEFAULT", "house", COLLIERY_COLORS.DEFAULT],
    // station — 菱形
    ["station-DUAL", "diamond", STATION_COLORS.DUAL],
    ["station-SINGLE", "diamond", STATION_COLORS.SINGLE],
    // source — 水滴
    ["src-extreme", "droplet", SOURCE_COLORS.extreme],
    ["src-high", "droplet", SOURCE_COLORS.high],
    ["src-medium", "droplet", SOURCE_COLORS.medium],
    ["src-low", "droplet", SOURCE_COLORS.low],
    ["src-DEFAULT", "droplet", SOURCE_COLORS.DEFAULT],
  ];
  for (const [name, shape, color] of defs) {
    if (!map.hasImage(name)) {
      const { image, pixelRatio } = makeShapeIcon(shape, color);
      map.addImage(name, image, { pixelRatio });
    }
  }
}

function MapView({
  visibleLayers,
  analysisFocus,
  relatedIds,
  onFocus,
  onExitFocus,
  orbit,
  simulating,
  is3D,
  scoredCollieries,
  scoredAmdSources,
  vizColliery,
  vizAmd,
  simulationSourceIds,
  extraSourceIds,
  addMode,
  onToggleSourceInSim,
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const popupRef = useRef(null);
  // 把最新的 callback / state 同步到 ref，方便 click handler 闭包始终读到 fresh 值
  // analysisFocus 也进 ref：click handler 要根据当前 focus kind 决定 stream click 是
  // 切到 segment 还是当成"空白"退出。
  const cbRef = useRef({
    onFocus,
    onExitFocus,
    onToggleSourceInSim,
    addMode,
    analysisFocus,
  });
  useEffect(() => {
    cbRef.current = {
      onFocus,
      onExitFocus,
      onToggleSourceInSim,
      addMode,
      analysisFocus,
    };
  }, [onFocus, onExitFocus, onToggleSourceInSim, addMode, analysisFocus]);
  // 加载完毕的标志——用 state 不用 ref：让分析 paint 的 useEffect 能在
  // "图层刚注册完"这个变化上自动重跑一次。否则用户在 loadAll 完成前点击就会
  // 永远看不到第一次的高亮（要再点一次触发 analysisFocus 重新变化才行）。
  const [layersReady, setLayersReady] = useState(false);

  // 聚焦 zoom-in 时按 entity id 查坐标用——loadAll 跑完之后塞进来
  const dataRefs = useRef({
    collieries: [],
    stations: [],
    sources: [],
    streamsGeoJSON: null,
  });

  // 粒子流状态——全部 mutate in place 避免 re-render
  // 多源版：sources 是 sourceId → { polyline, hotColor, emissionRate, spawnDist,
  // spawnAcc } 的 Map；particles 每个带 sourceId，渲染/物理时按 source 查参数。
  const simRef = useRef({
    segmentsById: null,
    active: false,
    sources: new Map(),
    particles: [],
    lastT: null,
    raf: null,
  });

  // ============= 1. 初始化 mapbox 实例 =============
  useEffect(() => {
    if (!containerRef.current) return;
    const token = import.meta.env.VITE_MAPBOX_TOKEN;
    if (!token) {
      const el = document.createElement("div");
      el.style.cssText =
        "width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#f6f6f6;color:#444;padding:24px;box-sizing:border-box;text-align:center;line-height:1.5;";
      el.textContent =
        "Mapbox token missing. Set VITE_MAPBOX_TOKEN in frontend/.env and restart the dev server.";
      containerRef.current.appendChild(el);
      return () => {
        if (containerRef.current?.contains(el)) el.remove();
      };
    }

    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/light-v11",
      center: [-76.3, 40.8],
      zoom: 8,
    });
    mapRef.current = map;
    // top-right 已经被 LayerControlPanel 占了，挪到 bottom-right 错开
    map.addControl(new mapboxgl.NavigationControl(), "bottom-right");

    popupRef.current = new mapboxgl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 8,
      maxWidth: "260px",
    });

    return () => {
      mapRef.current = null;
      popupRef.current?.remove();
      popupRef.current = null;
      map.remove();
    };
  }, []);

  // ============= 2. 加载 + 渲染所有图层（一次性，不依赖 props） =============
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    let cancelled = false;

    async function loadAll() {
      try {
        const [streamsGeoJSON, sources, harms, collieries, stations] =
          await Promise.all([
            getStreamSegments(),
            getPollutionSources(),
            getHarms(),
            getCollieries(),
            getStations(),
          ]);
        if (cancelled) return;

        // sources need severity from harms
        const severityByPid = new Map();
        for (const h of harms || []) {
          if (h?.pollution_source_id && h?.severity) {
            severityByPid.set(h.pollution_source_id, h.severity);
          }
        }

        // 聚焦 zoom-in effect 要用——按 id 查 entity 坐标
        // harmsByPid 给多源 sim 用：避免 N 个 source 时一次 fetch N 个 harm
        const harmsByPid = new Map();
        for (const h of harms || []) {
          if (h?.pollution_source_id) harmsByPid.set(h.pollution_source_id, h);
        }
        dataRefs.current = {
          collieries: collieries || [],
          stations: stations || [],
          sources: sources || [],
          streamsGeoJSON,
          harmsByPid,
        };

        // 粒子流要用 segmentsById lookup（一次性 build，loadAll 阶段做完最快）
        simRef.current.segmentsById = buildSegmentsById(streamsGeoJSON);

        const collieryFC = {
          type: "FeatureCollection",
          features: (collieries || [])
            .filter(
              (c) =>
                typeof c.longitude === "number" &&
                typeof c.latitude === "number",
            )
            .map((c) => ({
              type: "Feature",
              geometry: {
                type: "Point",
                coordinates: [c.longitude, c.latitude],
              },
              properties: {
                id: c.id,
                name: c.name,
                status: c.status || "",
                operator: c.operator || "",
              },
            })),
        };

        const stationFC = {
          type: "FeatureCollection",
          features: (stations || [])
            .filter(
              (s) =>
                typeof s.longitude === "number" &&
                typeof s.latitude === "number",
            )
            .map((s) => ({
              type: "Feature",
              geometry: {
                type: "Point",
                coordinates: [s.longitude, s.latitude],
              },
              properties: {
                id: s.id,
                name: s.name,
                type: s.type || "",
                agency: s.agency || "",
                sourcesStr: Array.isArray(s.sources) ? s.sources.join("+") : "",
              },
            })),
        };

        const sourceFC = {
          type: "FeatureCollection",
          features: (sources || [])
            .filter(
              (s) =>
                typeof s.longitude === "number" &&
                typeof s.latitude === "number",
            )
            .map((s) => ({
              type: "Feature",
              geometry: {
                type: "Point",
                coordinates: [s.longitude, s.latitude],
              },
              properties: {
                id: s.id,
                name: s.name,
                severity: severityByPid.get(s.id) || null,
                sf_priority: s.source?.sf_priority || "",
                sf_status: s.source?.sf_status || "",
              },
            })),
        };

        function setupLayers() {
          // 必须在 addLayer(symbol) 之前完成图标注册
          registerMarkerIcons(map);

          // streams — 撤后的 slate-blue，浏览态低 opacity 不抢 marker 戏
          if (!map.getSource(STREAM_SOURCE_ID)) {
            map.addSource(STREAM_SOURCE_ID, {
              type: "geojson",
              data: streamsGeoJSON,
            });
            map.addLayer({
              id: STREAM_LAYER_ID,
              type: "line",
              source: STREAM_SOURCE_ID,
              paint: {
                "line-color": "#94a3b8", // slate-400 muted
                "line-width": 1.1,
                "line-opacity": 0.45,
              },
            });
            // 高亮关联河段：分析模式下 filter 才匹得到，颜色用 slate-700 而非
            // 鲜蓝，跟整体高级灰调子一致
            map.addLayer({
              id: ACTIVE_PATH_LAYER_ID,
              type: "line",
              source: STREAM_SOURCE_ID,
              filter: ["==", ["get", "id"], "_none_"],
              paint: {
                "line-color": "#334155", // slate-700
                "line-width": 2.4,
              },
            });
          }

          // 3D extrusion: colliery score 柱。半径 200m / 高度 score×80m，红色梯度
          // （pollution = 红 的视觉语义）。插在 stream/active-path 之后、marker
          // symbols 之前——markers 始终在最上层。
          if (!map.getSource(COLL_EXTRUDE_SOURCE_ID)) {
            map.addSource(COLL_EXTRUDE_SOURCE_ID, {
              type: "geojson",
              data: { type: "FeatureCollection", features: [] },
            });
            map.addLayer(
              {
                id: COLL_EXTRUDE_LAYER_ID,
                type: "fill-extrusion",
                source: COLL_EXTRUDE_SOURCE_ID,
                paint: {
                  "fill-extrusion-height": [
                    "*",
                    ["get", "score"],
                    EXTRUDE_HEIGHT_PER_SCORE,
                  ],
                  "fill-extrusion-base": 0,
                  "fill-extrusion-color": [
                    "interpolate",
                    ["linear"],
                    ["get", "score"],
                    1, "#fecaca", // red-200 浅
                    10, "#fca5a5", // red-300
                    20, "#ef4444", // red-500
                    35, "#b91c1c", // red-700
                    50, "#7f1d1d", // red-900 最深
                  ],
                  "fill-extrusion-opacity": 0.82,
                },
              },
            );
          }

          // Colliery 强度热力图：weight = score（severity 加权和）
          // AMD 强度热力图：weight = 单 source 的 severity weight
          // 两个热力图独立控制 visibility（左 sidebar 两个 toggle）
          if (!map.getSource(COLL_HEATMAP_SOURCE_ID)) {
            map.addSource(COLL_HEATMAP_SOURCE_ID, {
              type: "geojson",
              data: { type: "FeatureCollection", features: [] },
            });
            map.addLayer(
              {
                id: COLL_HEATMAP_LAYER_ID,
                type: "heatmap",
                source: COLL_HEATMAP_SOURCE_ID,
                paint: {
                  // weight 直接用 score（已是 1-50），mapbox 会自动归一化
                  "heatmap-weight": ["coalesce", ["get", "weight"], 1],
                  // intensity 控制 zoom 不同时整体强度（远视图 / 近视图都看得见）
                  "heatmap-intensity": [
                    "interpolate",
                    ["linear"],
                    ["zoom"],
                    7, 0.6,
                    10, 1.5,
                    13, 3,
                  ],
                  // radius 像素半径——zoom 远的时候大，近时小
                  "heatmap-radius": [
                    "interpolate",
                    ["linear"],
                    ["zoom"],
                    7, 28,
                    10, 50,
                    13, 80,
                  ],
                  "heatmap-color": [
                    "interpolate",
                    ["linear"],
                    ["heatmap-density"],
                    0, "rgba(0,0,0,0)",
                    0.15, "rgba(254,202,202,0.3)", // red-200
                    0.4, "rgba(252,165,165,0.6)", // red-300
                    0.65, "rgba(220,38,38,0.78)", // red-600
                    0.85, "rgba(153,27,27,0.88)", // red-800
                    1, "rgba(127,29,29,0.95)", // red-900
                  ],
                  "heatmap-opacity": 0.85,
                },
              },
            );
          }

          // AMD source 强度热力图：每个 source 一个 Point，weight = severity_weight
          if (!map.getSource(AMD_HEATMAP_SOURCE_ID)) {
            map.addSource(AMD_HEATMAP_SOURCE_ID, {
              type: "geojson",
              data: { type: "FeatureCollection", features: [] },
            });
            map.addLayer(
              {
                id: AMD_HEATMAP_LAYER_ID,
                type: "heatmap",
                source: AMD_HEATMAP_SOURCE_ID,
                paint: {
                  "heatmap-weight": ["coalesce", ["get", "weight"], 1],
                  "heatmap-intensity": [
                    "interpolate",
                    ["linear"],
                    ["zoom"],
                    7, 0.7,
                    10, 1.6,
                    13, 3.2,
                  ],
                  "heatmap-radius": [
                    "interpolate",
                    ["linear"],
                    ["zoom"],
                    7, 22,
                    10, 42,
                    13, 70,
                  ],
                  // 颜色用稍橙红的色阶，跟 colliery 红区分
                  "heatmap-color": [
                    "interpolate",
                    ["linear"],
                    ["heatmap-density"],
                    0, "rgba(0,0,0,0)",
                    0.15, "rgba(254,215,170,0.35)", // orange-200
                    0.4, "rgba(251,146,60,0.65)", // orange-400
                    0.65, "rgba(234,88,12,0.8)", // orange-600
                    0.85, "rgba(194,65,12,0.9)", // orange-700
                    1, "rgba(124,45,18,0.95)", // orange-900
                  ],
                  "heatmap-opacity": 0.8,
                },
              },
            );
          }

          // collieries — symbol 方块图标。TV 显示尺寸：整体 ~0.72× 缩小。
          if (!map.getSource(COLL_SOURCE_ID)) {
            map.addSource(COLL_SOURCE_ID, { type: "geojson", data: collieryFC });
            map.addLayer({
              id: COLL_LAYER_ID,
              type: "symbol",
              source: COLL_SOURCE_ID,
              layout: {
                "icon-image": COLLIERY_ICON_EXPR,
                "icon-size": 0.5,
                "icon-allow-overlap": true,
                "icon-ignore-placement": true,
              },
              paint: { "icon-opacity": 0.9 },
            });
          }
          // stations — symbol 三角图标
          if (!map.getSource(STATION_SOURCE_ID)) {
            map.addSource(STATION_SOURCE_ID, {
              type: "geojson",
              data: stationFC,
            });
            map.addLayer({
              id: STATION_LAYER_ID,
              type: "symbol",
              source: STATION_SOURCE_ID,
              layout: {
                "icon-image": STATION_ICON_EXPR,
                "icon-size": 0.4,
                "icon-allow-overlap": true,
                "icon-ignore-placement": true,
              },
              paint: { "icon-opacity": 0.85 },
            });
          }
          // pollution sources — symbol 水滴图标
          if (!map.getSource(SRC_SOURCE_ID)) {
            map.addSource(SRC_SOURCE_ID, {
              type: "geojson",
              data: sourceFC,
            });
            map.addLayer({
              id: SRC_LAYER_ID,
              type: "symbol",
              source: SRC_SOURCE_ID,
              layout: {
                "icon-image": SOURCE_ICON_EXPR,
                "icon-size": 0.58,
                "icon-allow-overlap": true,
                "icon-ignore-placement": true,
                // 水滴顶尖向下（默认朝上），不旋转 —— 我画的就是 pointing-down
              },
              paint: { "icon-opacity": 0.95 },
            });
          }

          // sim halo：参与模拟的 AMD（anchor + extras）统一用一个鲜亮色。
          // navy blue-900 #1e3a8a，跟 cream 底色高对比，比浅蓝沉稳。
          if (!map.getSource(SIM_HALO_SOURCE_ID)) {
            map.addSource(SIM_HALO_SOURCE_ID, {
              type: "geojson",
              data: { type: "FeatureCollection", features: [] },
            });
            map.addLayer(
              {
                id: SIM_HALO_LAYER_ID,
                type: "circle",
                source: SIM_HALO_SOURCE_ID,
                paint: {
                  "circle-radius": 12,
                  "circle-color": "rgba(30, 58, 138, 0.12)",
                  "circle-stroke-color": "#1e3a8a",
                  "circle-stroke-width": 2.4,
                  "circle-stroke-opacity": 0.95,
                },
              },
              SRC_LAYER_ID,
            );
          }

          // particles — Lagrangian advection-diffusion 解的可视化。插在 COLL
          // 之前 → 渲染顺序：streams → active path → particle glow → particle
          // → markers (coll/station/source)。markers 始终在最上不被粒子糊掉。
          if (!map.getSource(PARTICLES_SOURCE_ID)) {
            map.addSource(PARTICLES_SOURCE_ID, {
              type: "geojson",
              data: { type: "FeatureCollection", features: [] },
            });
            const colorByProgress = [
              "interpolate",
              ["linear"],
              ["coalesce", ["get", "progress"], 0],
              0,
              ["coalesce", ["get", "hot"], PARTICLE_HOT_COLOR.DEFAULT],
              1,
              PARTICLE_COLD_COLOR,
            ];
            map.addLayer(
              {
                id: PARTICLES_GLOW_LAYER_ID,
                type: "circle",
                source: PARTICLES_SOURCE_ID,
                paint: {
                  "circle-radius": [
                    "*",
                    ["coalesce", ["get", "size"], 2.2],
                    2.8, // 粒子小了 → 光晕倍数大一点保持 halo 感
                  ],
                  "circle-color": colorByProgress,
                  "circle-opacity": [
                    "*",
                    ["coalesce", ["get", "mass"], 1],
                    0.22,
                  ],
                  "circle-blur": 0.9,
                },
              },
              COLL_LAYER_ID,
            );
            map.addLayer(
              {
                id: PARTICLES_LAYER_ID,
                type: "circle",
                source: PARTICLES_SOURCE_ID,
                paint: {
                  "circle-radius": ["coalesce", ["get", "size"], 5],
                  "circle-color": colorByProgress,
                  "circle-opacity": ["coalesce", ["get", "mass"], 1],
                  "circle-blur": 0.18,
                },
              },
              COLL_LAYER_ID,
            );
          }

          // ============ 全局 click：用 queryRenderedFeatures 派发 ============
          map.on("click", (e) => {
            const isAddMode = !!cbRef.current.addMode;
            const layers = [
              SRC_LAYER_ID,
              COLL_LAYER_ID,
              STATION_LAYER_ID,
              STREAM_LAYER_ID,
            ].filter((l) => map.getLayer(l));
            const feats = map.queryRenderedFeatures(e.point, { layers });
            if (!feats.length) {
              cbRef.current.onExitFocus?.();
              return;
            }
            const f = feats[0];
            const id = f.properties?.id;
            if (!id) return;
            const layerId = f.layer?.id;

            // addMode 下：只接受 AMD 点击（进/出 extras）；station/colliery/
            // stream 一律忽略，避免用户在策展 sim 时被意外切焦干扰。
            if (isAddMode) {
              if (layerId === SRC_LAYER_ID) {
                cbRef.current.onToggleSourceInSim?.(id);
              }
              return;
            }

            // 已经在 pollution_source / colliery / station 分析模式时，点 stream
            // 通常是误击高亮链（active-path 的粗黑线视觉上像 marker 的延伸），
            // 用户预期是 reset 而不是切到 SegmentPanel。直接 exit。
            const focusKind = cbRef.current.analysisFocus?.kind;
            if (
              layerId === STREAM_LAYER_ID &&
              focusKind &&
              focusKind !== "segment"
            ) {
              cbRef.current.onExitFocus?.();
              return;
            }

            const fn = cbRef.current.onFocus;
            if (!fn) return;
            if (layerId === COLL_LAYER_ID) fn("colliery", id);
            else if (layerId === STATION_LAYER_ID) fn("station", id);
            else if (layerId === SRC_LAYER_ID) fn("pollution_source", id);
            else if (layerId === STREAM_LAYER_ID)
              fn("segment", id, {
                // SegmentPanel 用：把 feature.properties 透传过去
                name: f.properties?.name,
                huc8: f.properties?.huc8,
                length_km: f.properties?.length_km,
                ftype: f.properties?.ftype,
              });
          });

          // ============ Hover popup ============
          const popup = popupRef.current;
          function showPopup(e, html) {
            if (!popup) return;
            map.getCanvas().style.cursor = "pointer";
            popup.setLngLat(e.lngLat).setHTML(html).addTo(map);
          }
          function hidePopup() {
            if (!popup) return;
            // 恢复到全局默认 cursor（crosshair，CSS 里定义）
            map.getCanvas().style.cursor = "";
            popup.remove();
          }

          // All popups inherit Helvetica from <body>; weights drive hierarchy.
          const popupBase = `font-family:Helvetica,'Helvetica Neue',Arial,sans-serif;font-size:12px;line-height:1.4`;

          map.on("mouseenter", COLL_LAYER_ID, (e) => {
            const f = e.features?.[0];
            if (!f) return;
            const p = f.properties || {};
            showPopup(
              e,
              `<div style="${popupBase}">
                <div style="font-weight:700;color:#0f172a">${p.name || p.id}</div>
                <div style="color:#475569;font-style:italic">${p.operator || ""}</div>
                <div style="color:#94a3b8;font-size:10px;letter-spacing:0.06em;text-transform:uppercase">${p.status || ""}</div>
              </div>`,
            );
          });
          map.on("mouseleave", COLL_LAYER_ID, hidePopup);

          map.on("mouseenter", STATION_LAYER_ID, (e) => {
            const f = e.features?.[0];
            if (!f) return;
            const p = f.properties || {};
            showPopup(
              e,
              `<div style="${popupBase}">
                <div style="font-weight:700;color:#0f172a">${p.name || p.id}</div>
                <div style="color:#475569;font-style:italic">${p.type || ""}</div>
                <div style="color:#94a3b8;font-size:10px">${p.agency || ""}</div>
              </div>`,
            );
          });
          map.on("mouseleave", STATION_LAYER_ID, hidePopup);

          map.on("mouseenter", SRC_LAYER_ID, (e) => {
            const f = e.features?.[0];
            if (!f) return;
            const p = f.properties || {};
            showPopup(
              e,
              `<div style="${popupBase}">
                <div style="font-weight:700;color:#0f172a">AMD discharge ${p.name || p.id}</div>
                <div style="color:#475569;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;font-size:10px">${p.severity || "—"}</div>
                <div style="color:#94a3b8;font-size:10px;font-style:italic">${p.sf_priority || ""}</div>
              </div>`,
            );
          });
          map.on("mouseleave", SRC_LAYER_ID, hidePopup);

          map.on("mouseenter", STREAM_LAYER_ID, (e) => {
            const f = e.features?.[0];
            if (!f) return;
            const p = f.properties || {};
            showPopup(
              e,
              `<div style="${popupBase}">
                <div style="font-weight:700;color:#0f172a">${p.name || "Unnamed creek"}</div>
                <div style="color:#94a3b8;font-size:10px;font-style:italic">HUC ${p.huc8 || "—"} · ${p.length_km != null ? p.length_km.toFixed(2) + " km" : ""}</div>
              </div>`,
            );
          });
          map.on("mouseleave", STREAM_LAYER_ID, hidePopup);

          setLayersReady(true);
        }

        if (map.loaded()) setupLayers();
        else map.once("load", setupLayers);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("Failed to load layers:", err);
      }
    }

    loadAll();

    return () => {
      cancelled = true;
      // 不在 cleanup 里 setState——unmount 时直接由 React 回收 state，否则
      // 在 StrictMode 里可能触发 "setState on unmounted component" 警告。
    };
  }, []);

  // ============= 2b. scoredCollieries 变化 → 刷 extrude + colliery heatmap =====
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !layersReady) return;
    const ext = map.getSource(COLL_EXTRUDE_SOURCE_ID);
    if (ext) {
      ext.setData(buildExtrudeFeatureCollection(scoredCollieries || []));
    }
    const heat = map.getSource(COLL_HEATMAP_SOURCE_ID);
    if (heat) {
      heat.setData(buildHeatmapFeatureCollection(scoredCollieries || []));
    }
  }, [scoredCollieries, layersReady]);

  // ============= 2c. scoredAmdSources 变化 → 刷 AMD heatmap =====
  // scoredAmdSources 只带 id+weight，要跟 dataRefs.current.sources 配 lat/lon
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !layersReady) return;
    const heat = map.getSource(AMD_HEATMAP_SOURCE_ID);
    if (!heat) return;
    const sourceById = new Map();
    for (const s of dataRefs.current.sources || []) {
      sourceById.set(s.id, s);
    }
    const features = [];
    for (const p of scoredAmdSources || []) {
      const s = sourceById.get(p.id);
      if (!s) continue;
      if (typeof s.longitude !== "number" || typeof s.latitude !== "number")
        continue;
      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [s.longitude, s.latitude] },
        properties: { weight: p.weight },
      });
    }
    heat.setData({ type: "FeatureCollection", features });
  }, [scoredAmdSources, layersReady]);

  // ============= 2d. simulationSourceIds 变化 → 刷 halo layer =====
  // 参与模拟的每个 AMD 一个 Point feature，anchor=1 标记 anchor 用不同色描边。
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !layersReady) return;
    const halo = map.getSource(SIM_HALO_SOURCE_ID);
    if (!halo) return;
    const ids = simulationSourceIds || [];
    const anchorId = ids[0];
    const sourceById = new Map();
    for (const s of dataRefs.current.sources || []) sourceById.set(s.id, s);
    const features = [];
    for (const id of ids) {
      const s = sourceById.get(id);
      if (!s) continue;
      if (typeof s.longitude !== "number" || typeof s.latitude !== "number")
        continue;
      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [s.longitude, s.latitude] },
        properties: { id, anchor: id === anchorId ? 1 : 0 },
      });
    }
    halo.setData({ type: "FeatureCollection", features });
  }, [simulationSourceIds, layersReady]);

  // ============= 3. visibleLayers 切换 → setLayoutProperty =============
  // 依赖 layersReady 确保图层注册完之后再跑（用户在加载期间切 toggle 也能生效）
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !visibleLayers || !layersReady) return;
    const setVis = (layerId, on) => {
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, "visibility", on ? "visible" : "none");
      }
    };
    setVis(COLL_LAYER_ID, visibleLayers.collieries);
    // 强度可视化：跟 viz toggle 走，跟 2D/3D 解耦。柱体在低 zoom 几乎看不见，
    // 但 zoom 进去（focus）时跟 heatmap 互补——所以两层都开着，view 决定哪个
    // 视觉上占主导。
    setVis(COLL_EXTRUDE_LAYER_ID, !!vizColliery);
    setVis(COLL_HEATMAP_LAYER_ID, !!vizColliery);
    setVis(AMD_HEATMAP_LAYER_ID, !!vizAmd);
    setVis(STATION_LAYER_ID, visibleLayers.stations);
    setVis(SRC_LAYER_ID, visibleLayers.sources);
    // halo 跟 source 图层联动：用户隐藏 AMD 时光环也应该一起隐
    setVis(SIM_HALO_LAYER_ID, visibleLayers.sources);
    setVis(STREAM_LAYER_ID, visibleLayers.streams);
    setVis(ACTIVE_PATH_LAYER_ID, visibleLayers.streams);
  }, [visibleLayers, layersReady, vizColliery, vizAmd]);

  // ============= 4. analysisFocus / relatedIds → 重画 paint expression =============
  // 依赖 layersReady：图层刚注册完时也会触发一次，让用户首次点击的 focus
  // 在加载完成的瞬间应用上去（而不是等用户再点一次）。
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !layersReady) return;
    const apply = () => {
      const isAnalysis = !!analysisFocus;
      const focusKind = analysisFocus?.kind;
      const focusedId = analysisFocus?.id;

      const collFocus = focusKind === "colliery" ? focusedId : null;
      const stFocus = focusKind === "station" ? focusedId : null;
      const srcFocus = focusKind === "pollution_source" ? focusedId : null;
      const segFocus = focusKind === "segment" ? focusedId : null;

      const r = relatedIds || {};
      // 同类 sibling（比如点了 colliery 后它的"同伙 colliery"）从地图高亮里
      // 排除——它们只是恰好和被点中的 entity 共享 harm，并不是用户想看的"这个
      // entity 的影响范围"。Sibling 信息已经在 sidebar 的 harm 列表里反映了。
      // Segment 例外：河链是分析模式的核心可视化，必须保留。
      //
      // 多源 sim 例外：用户显式选进 extras 的 AMD 不算 sibling，要按 "related"
      // 高亮（不然刚加的源会瞬间被 dim 到 0.4 opacity，跟"已选中"完全相反）。
      const relColl = focusKind === "colliery" ? [] : r.colliery_ids || [];
      const relStn = focusKind === "station" ? [] : r.station_ids || [];
      const relSrc =
        focusKind === "pollution_source"
          ? extraSourceIds || []
          : r.pollution_source_ids || [];
      const relSeg = r.segment_ids || [];

      // collieries (symbol layer：方块图标)
      if (map.getLayer(COLL_LAYER_ID)) {
        map.setPaintProperty(
          COLL_LAYER_ID,
          "icon-opacity",
          opacityExpr(collFocus, relColl, 0.9, isAnalysis),
        );
        map.setLayoutProperty(
          COLL_LAYER_ID,
          "icon-size",
          sizeExpr(
            collFocus,
            relColl,
            { sel: 1.1, rel: 0.72, dim: 0.32, browse: 0.5 },
            isAnalysis,
          ),
        );
      }
      // stations (symbol layer：三角图标)
      if (map.getLayer(STATION_LAYER_ID)) {
        map.setPaintProperty(
          STATION_LAYER_ID,
          "icon-opacity",
          opacityExpr(stFocus, relStn, 0.85, isAnalysis),
        );
        map.setLayoutProperty(
          STATION_LAYER_ID,
          "icon-size",
          sizeExpr(
            stFocus,
            relStn,
            { sel: 0.95, rel: 0.62, dim: 0.25, browse: 0.4 },
            isAnalysis,
          ),
        );
      }
      // pollution sources (symbol layer：水滴图标)
      if (map.getLayer(SRC_LAYER_ID)) {
        map.setPaintProperty(
          SRC_LAYER_ID,
          "icon-opacity",
          opacityExpr(srcFocus, relSrc, 0.95, isAnalysis),
        );
        map.setLayoutProperty(
          SRC_LAYER_ID,
          "icon-size",
          sizeExpr(
            srcFocus,
            relSrc,
            { sel: 1.15, rel: 0.76, dim: 0.3, browse: 0.58 },
            isAnalysis,
          ),
        );
      }
      // streams (background)
      if (map.getLayer(STREAM_LAYER_ID)) {
        map.setPaintProperty(
          STREAM_LAYER_ID,
          "line-opacity",
          isAnalysis ? 0.18 : 0.55,
        );
      }
      // active path（高亮关联河段 + 选中河段）
      if (map.getLayer(ACTIVE_PATH_LAYER_ID)) {
        const ids = segFocus ? [...relSeg, segFocus] : relSeg;
        if (ids.length > 0) {
          map.setFilter(ACTIVE_PATH_LAYER_ID, [
            "in",
            ["get", "id"],
            ["literal", ids],
          ]);
        } else {
          map.setFilter(ACTIVE_PATH_LAYER_ID, ["==", ["get", "id"], "_none_"]);
        }
      }
    };
    // 直接 apply：layersReady=true 保证 layer 已注册，setPaintProperty/
    // setLayoutProperty/setFilter 都是同步安全调用，跟 map.loaded() 无关。
    // 之前用 map.once("load", apply) 是个 bug：load 事件只在初次启动时触发一次，
    // easeTo 期间 map.loaded() 会暂时变 false，apply 就被挂到永远不再触发的
    // load listener 上，导致退出分析时 marker 不复位。
    apply();
  }, [analysisFocus, relatedIds, layersReady, extraSourceIds]);

  // ============= 4b. analysisFocus 变化时给一个聚焦 zoom-in 效果 =============
  // splash 页 (orbit) 期间不触发，避免抢镜头；entity 没坐标也不触发。
  // 退出分析（analysisFocus: 非空 → null）时反向 ease 回 overview，避免用户
  // 卡在 zoom-11 的近景。prevFocusRef 记录上一次的 focus，用来区分"挂载初始
  // null"和"刚从分析退出的 null"——前者不该有动画。
  const prevFocusRef = useRef(null);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !layersReady || orbit) {
      // 不更新 prevFocusRef，等下次条件满足时再做判断
      return;
    }

    const prevFocus = prevFocusRef.current;
    prevFocusRef.current = analysisFocus;

    if (!analysisFocus) {
      // 只在"刚从分析退出"这一刻 ease 出来，挂载初次 null 不做
      if (prevFocus) {
        // 从当前 zoom 后退 ~1.5 级，最低 9.2，避免一下蹦回 overview 太远；
        // center 不动，让用户保持空间感（"往后退一步"而不是"传送回家"）
        const currentZoom = map.getZoom();
        const targetZoom = Math.max(9.2, currentZoom - 1.5);
        map.easeTo({
          zoom: targetZoom,
          duration: 700,
          easing: (t) => 1 - Math.pow(1 - t, 3),
        });
      }
      return;
    }

    const { kind, id } = analysisFocus;
    const data = dataRefs.current;
    let center = null;

    if (kind === "colliery") {
      const c = data.collieries.find((x) => x.id === id);
      if (c) center = [c.longitude, c.latitude];
    } else if (kind === "station") {
      const s = data.stations.find((x) => x.id === id);
      if (s) center = [s.longitude, s.latitude];
    } else if (kind === "pollution_source") {
      const p = data.sources.find((x) => x.id === id);
      if (p) center = [p.longitude, p.latitude];
    } else if (kind === "segment") {
      const f = data.streamsGeoJSON?.features?.find(
        (x) => x.properties?.id === id,
      );
      const coords = f?.geometry?.coordinates;
      if (coords && coords.length > 0) {
        center = coords[Math.floor(coords.length / 2)]; // 取中点
      }
    }

    if (!center) return;

    // 已经够近就只 pan 不缩；远的话拉到 zoom 11
    const targetZoom = Math.max(map.getZoom(), 11);
    map.easeTo({
      center,
      zoom: targetZoom,
      duration: 700,
      easing: (t) => 1 - Math.pow(1 - t, 3),
    });
  }, [analysisFocus, layersReady, orbit]);

  // ============= 5. orbit：splash 页时倾斜 + 持续旋转 =============
  // 等 layersReady（数据图层注册完）再开始旋转，避免影响初次渲染。
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !layersReady) return;

    if (orbit) {
      // 倾斜瞬间到位 + 拉近 zoom，让数据点密度填满屏幕。Center 选 anthracite
      // 的"密集中段"（介于 Schuylkill 和 Lackawanna 谷地之间，markers 最稠）。
      map.jumpTo({
        center: [-76.1, 40.85],
        zoom: 9,
        pitch: 55,
        bearing: map.getBearing(),
      });

      let raf;
      let bearing = map.getBearing();
      const tick = () => {
        if (!mapRef.current) return;
        bearing = (bearing + 0.06) % 360;
        map.setBearing(bearing);
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);

      return () => {
        if (raf) cancelAnimationFrame(raf);
      };
    } else {
      // 退出 splash → 两段式镜头入场，影院感：
      //   Phase 1 (0–760ms): 冲近 + bearing 微扭，ease-in 给"推进"的力度；
      //   Phase 2 (760ms 后): 拉回 overview (zoom 8, bearing 0)，ease-out 收尾。
      // pitch 跟随 is3D：默认 45° 让 3D 柱可见；2D 状态下 phase 2 拉平。
      const currentBearing = map.getBearing();
      map.easeTo({
        center: [-76.15, 40.84],
        zoom: 10.6,
        pitch: 64,
        bearing: currentBearing + 28,
        duration: 760,
        easing: (t) => t * t, // ease-in
      });
      const t2 = setTimeout(() => {
        if (!mapRef.current) return;
        map.easeTo({
          pitch: is3D ? 45 : 0,
          bearing: 0,
          center: [-76.3, 40.8],
          zoom: 8,
          duration: 1400,
          easing: (t) => 1 - Math.pow(1 - t, 3), // ease-out cubic
        });
      }, 740);
      return () => clearTimeout(t2);
    }
  }, [orbit, layersReady]);

  // ============= 5b. 用户切换 2D / 3D（splash 之后）=============
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !layersReady || orbit) return;
    map.easeTo({
      pitch: is3D ? 45 : 0,
      duration: 600,
      easing: (t) => 1 - Math.pow(1 - t, 3),
    });
  }, [is3D, layersReady, orbit]);

  // ============= 6. 粒子流：多源 Lagrangian advection-diffusion =============
  // simulationSourceIds = [anchor, ...extras]，每个源沿其 harm 下游链跑粒子。
  // 每帧逐粒子：
  //   dist += u·dt + √(2D·dt)·randn()    — advection + diffusion
  //   mass *= exp(−k·dt)                  — first-order decay
  // 所有 source 共享 maxParticles 全局上限；超额时按 desired 比例缩放 spawn。
  //
  // 增量同步策略：simulationSourceIds 变化（用户加/减 extras）时只更新 sources
  // Map，不重置 in-flight 粒子，也不重启 RAF —— 加一个源像"新的水龙头打开"。
  useEffect(() => {
    const map = mapRef.current;

    const stop = () => {
      const s = simRef.current;
      if (s.raf) cancelAnimationFrame(s.raf);
      s.raf = null;
      s.active = false;
      s.particles = [];
      s.sources = new Map();
      s.lastT = null;
      const src = map?.getSource?.(PARTICLES_SOURCE_ID);
      if (src) src.setData({ type: "FeatureCollection", features: [] });
    };

    if (!RUN_PARTICLE_SIM) return stop();
    if (!map || !layersReady || orbit) return stop();
    if (!simulating) return stop();
    if (!simulationSourceIds || simulationSourceIds.length === 0) return stop();
    if (!simRef.current.segmentsById) return stop();
    if (!dataRefs.current.harmsByPid) return stop();

    const segmentsById = simRef.current.segmentsById;
    const harmsByPid = dataRefs.current.harmsByPid;
    const srcById = new Map();
    for (const s of dataRefs.current.sources || []) srcById.set(s.id, s);

    // 增量构建 next：已经存在的 source 直接复用（保留 spawnAcc/polyline），新
    // 的现 build。
    const prev = simRef.current.sources;
    const next = new Map();
    for (const sid of simulationSourceIds) {
      const existing = prev.get(sid);
      if (existing) {
        next.set(sid, existing);
        continue;
      }
      const harm = harmsByPid.get(sid);
      if (!harm) continue;
      const segIds = (harm.affected_streams || []).map((seg) => seg.id);
      if (segIds.length === 0) continue;
      const polyline = buildPolylineFromPath(segIds, segmentsById);
      if (!polyline || polyline.totalMeters < 1) continue;

      const src = srcById.get(sid);
      const rawGpm = src?.emission_rate ?? 6;
      const compressed =
        Math.log10(1 + rawGpm) * PARTICLE_DEFAULTS.emissionGain;
      const emissionRate = Math.max(
        PARTICLE_DEFAULTS.emissionMin,
        Math.min(PARTICLE_DEFAULTS.emissionMax, compressed),
      );
      let spawnDist = 0;
      if (
        src &&
        typeof src.longitude === "number" &&
        typeof src.latitude === "number"
      ) {
        spawnDist = projectOntoPolyline(src.longitude, src.latitude, polyline);
        if (polyline.totalMeters - spawnDist < 1) spawnDist = 0;
      }
      next.set(sid, {
        polyline,
        hotColor:
          PARTICLE_HOT_COLOR[harm.severity] ?? PARTICLE_HOT_COLOR.DEFAULT,
        emissionRate,
        spawnDist,
        spawnAcc: 0,
      });
    }

    if (next.size === 0) return stop();

    const st = simRef.current;
    st.sources = next;
    // 已被用户移除的 source 上残留的粒子直接丢
    st.particles = st.particles.filter((p) => next.has(p.sourceId));
    st.active = true;

    if (!st.raf) startParticleLoop(map);

    // 注意：不在 cleanup 里调 stop。每次 chip 加/减 simulationSourceIds 都变身份，
    // effect 重跑——上面的 guards 已经覆盖了"该停"的所有情况。强制 stop 会让
    // 加 chip 时整个场景刷掉。
  }, [layersReady, orbit, simulating, simulationSourceIds]);

  // 卸载时取消 RAF。map 实例的 cleanup 由初始化 effect 负责。
  useEffect(() => {
    return () => {
      const s = simRef.current;
      if (s.raf) cancelAnimationFrame(s.raf);
      s.raf = null;
      s.active = false;
    };
  }, []);

  // ============= 6b. RAF loop helper（不依赖 React 渲染） =============
  // 全部 mutation in-place 不触发 re-render。每帧遍历 sources spawn、遍历
  // particles advect、最后一次 setData 把所有粒子打成一个 FeatureCollection。
  function startParticleLoop(map) {
    const s = simRef.current;
    if (s.raf) cancelAnimationFrame(s.raf);

    const tick = (now) => {
      const st = simRef.current;
      if (!st.active || st.sources.size === 0) {
        st.raf = null;
        return;
      }
      if (st.lastT == null) st.lastT = now;
      const dt = Math.min(0.05, (now - st.lastT) / 1000);
      st.lastT = now;

      const { u, D, k, jitterSigma } = PARTICLE_PHYSICS;
      const sqrt2Ddt = Math.sqrt(2 * D * dt);

      // -- spawn: 各 source 算 desired，总和超 room 时按比例缩放，公平分配 --
      const desired = new Map();
      let totalDesired = 0;
      for (const [sid, src] of st.sources) {
        src.spawnAcc += src.emissionRate * dt;
        const n = Math.floor(src.spawnAcc);
        desired.set(sid, n);
        totalDesired += n;
      }
      const room = Math.max(
        0,
        PARTICLE_DEFAULTS.maxParticles - st.particles.length,
      );
      const scale =
        totalDesired > room && totalDesired > 0 ? room / totalDesired : 1;

      for (const [sid, n] of desired) {
        const src = st.sources.get(sid);
        if (!src) continue;
        const actual = Math.floor(n * scale);
        src.spawnAcc -= actual; // 保留小数余量给下一帧
        for (let i = 0; i < actual; i += 1) {
          st.particles.push({
            sourceId: sid,
            dist: src.spawnDist,
            lateral: randn() * jitterSigma,
            mass: 1,
            age: 0,
            speedMul:
              PARTICLE_DEFAULTS.speedJitterMin +
              Math.random() * PARTICLE_DEFAULTS.speedJitterSpan,
          });
        }
      }

      // -- advance + filter --
      const next = [];
      for (const p of st.particles) {
        const src = st.sources.get(p.sourceId);
        if (!src) continue; // source 已被移除
        p.dist += u * p.speedMul * dt + sqrt2Ddt * randn();
        if (p.dist < src.spawnDist) p.dist = src.spawnDist;
        p.mass *= Math.exp(-k * dt);
        p.age += dt;
        if (p.dist > src.polyline.totalMeters) continue;
        if (p.mass < 0.02) continue;
        if (p.age > PARTICLE_DEFAULTS.particleLife) continue;
        next.push(p);
      }
      st.particles = next;

      // -- render --
      const features = [];
      for (const p of st.particles) {
        const src = st.sources.get(p.sourceId);
        if (!src) continue;
        const polyline = src.polyline;
        const pt = pointAndTangentAtDistance(polyline, p.dist);
        if (!pt) continue;
        const { point, tangent } = pt;
        const nx = -tangent[1];
        const ny = tangent[0];
        const lat = point[1];
        const mPerDegLat = 111320;
        const mPerDegLon = Math.cos((lat * Math.PI) / 180) * 111320 || 1;
        const coord = [
          point[0] + (p.lateral / mPerDegLon) * nx,
          point[1] + (p.lateral / mPerDegLat) * ny,
        ];
        // progress 用本源 spawnDist→末端 的相对位置，颜色梯度从真正源头开始
        const denom = Math.max(1, polyline.totalMeters - src.spawnDist);
        const progress = Math.min(
          1,
          Math.max(0, (p.dist - src.spawnDist) / denom),
        );
        features.push({
          type: "Feature",
          geometry: { type: "Point", coordinates: coord },
          properties: {
            mass: Math.min(1, p.mass),
            progress,
            hot: src.hotColor, // 每个粒子带本源的 hot 色：多色汇流可视化
            size: PARTICLE_DEFAULTS.particleSize,
          },
        });
      }
      const sourceMb = map.getSource(PARTICLES_SOURCE_ID);
      if (sourceMb) {
        sourceMb.setData({ type: "FeatureCollection", features });
      }

      st.raf = requestAnimationFrame(tick);
    };

    s.raf = requestAnimationFrame(tick);
  }

  return (
    <div
      ref={containerRef}
      style={{
        position: "absolute",
        inset: 0,
      }}
    />
  );
}

export default MapView;

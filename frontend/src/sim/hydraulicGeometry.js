// Leopold & Maddock (1953) 水文几何经验公式，宾州无烟煤区域标定：
//   W(m) = 0.9 × √(A_sqmi)
// 系数 0.9 来自 Schuylkill / Susquehanna 流域 USGS 测站中位数。
export function estimateWidth(drainageAreaSqMi) {
  if (!(drainageAreaSqMi > 0)) return null;
  return Math.max(2, Math.min(150, 0.9 * Math.sqrt(drainageAreaSqMi)));
}

// 从监测站列表构建 segment_id → 河宽(m) 的查找表。
// 每个站的 drainage_area_sq_mi 作为该节点集水面积的代理。
export function buildSegmentWidthMap(stations) {
  const map = new Map();
  for (const st of stations || []) {
    if (!st.attach_segment_id) continue;
    const w = estimateWidth(st.drainage_area_sq_mi);
    if (!w) continue;
    // 同一 segment 有多个站时保留最大估计值
    if (w > (map.get(st.attach_segment_id) ?? 0)) {
      map.set(st.attach_segment_id, w);
    }
  }
  return map;
}

// 给定有序路径段 ID、各段起点累积距离（来自 buildPolylineFromPath）和宽度表，
// 返回函数 halfWidthAtDist(dist) → 半宽（米）。
// 无站点数据的段用线性插值；整条路径都没有数据时用 5→30 m 的下游渐宽回退。
export function buildHalfWidthFn(pathIds, segmentStartDists, widthBySegment, totalMeters) {
  const pts = [];
  for (let i = 0; i < pathIds.length; i++) {
    const w = widthBySegment.get(pathIds[i]);
    if (w) pts.push({ d: segmentStartDists[i] ?? 0, hw: w / 2 });
  }

  if (pts.length === 0) {
    // 无站点数据：上游 5 m → 下游 30 m 线性渐宽
    return (dist) => {
      const t = totalMeters > 0 ? Math.max(0, Math.min(1, dist / totalMeters)) : 0;
      return (5 + 25 * t) / 2;
    };
  }

  return (dist) => {
    if (pts.length === 1) return pts[0].hw;
    if (dist <= pts[0].d) return pts[0].hw;
    if (dist >= pts[pts.length - 1].d) return pts[pts.length - 1].hw;
    let lo = 0, hi = pts.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (pts[mid].d <= dist) lo = mid; else hi = mid;
    }
    const t = (dist - pts[lo].d) / (pts[hi].d - pts[lo].d);
    return pts[lo].hw + (pts[hi].hw - pts[lo].hw) * t;
  };
}

// 横向扩散系数 Dy（m²/s），由河宽推导。
// Fischer et al. (1979): Dy ≈ 0.6 W u*；视觉尺度下标定为 W²/48。
// sqrt(2·Dy·dt_physical) = W·sqrt(dt·timeScale/6)
// timeScale = √(u_visual/u_real) ≈ 35，保持 Pe_y/Pe_x 比例（Taylor 扩散）。
export function lateralSigmaScale(dt, timeScale) {
  return Math.sqrt(dt * timeScale / 6);
}

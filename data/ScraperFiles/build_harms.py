#!/usr/bin/env python3
"""
build_harms.py — 从 data/final/ 里 5 份数据合成 harms.json

设计规则（已与用户确认）：
  - 一个 pollution_source = 一个 harm（仅处理 attach_segment_id 非 null 的 ~538 个）
  - 沿 stream_segments.downstream_id 累积 length_km，到 20 km 截断
  - colliery 半径：haversine 2 km 内的算 source_colliery
  - sample 聚合在 build 时预烘到 station 对象上 — service 层 passthrough，HarmPanel 直接读

Severity 规则（OR，从严到宽）:
  extreme:  sf_priority "Extreme Health or Safety Impact"  OR  任一 pH<3  OR  Fe_dissolved>5 mg/L
  high:     sf_priority "Health or Safety Impact"          OR  任一 pH<4  OR  Fe_dissolved>1 mg/L  OR  (Acid>50 AND Acid>Alk)
  medium:   sf_priority "Environmental Impact"             OR  任一 pH<6  OR  Fe_dissolved>0.3 mg/L
  low:      其他

输出：data/final/harms.json，扁平 ~538 条，denormalized（每条自带 station/colliery/stream 展开字段）。

只用 stdlib。
"""

from __future__ import annotations

import json
import math
import sys
from collections import Counter, defaultdict
from pathlib import Path
from statistics import median
from typing import Any, Optional

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")


ROOT = Path(__file__).resolve().parent.parent / "final"

# ---------- 常量 ----------------------------------------------------------

DOWNSTREAM_MAX_KM = 20.0
DOWNSTREAM_MAX_HOPS = 200  # 镜像 frontend/src/sim/segmentGraph.js
COLLIERY_RADIUS_KM = 2.0

# WQP characteristic 名字按"逻辑指标"分桶
PH_NAMES = {"pH"}
IRON_NAMES = {"Iron"}
MN_NAMES = {"Manganese"}
AL_NAMES = {"Aluminum"}
ACIDITY_NAMES = {
    "Acidity, (H+)",
    "Acidity, hydrogen ion (H+)",
    "Acidity, hydrogen ion (H+) as CaCO3",
    "Acidity, mineral methyl orange (as CaCO3)",
    "Acidity, total, phenolphthalein (as CaCO3)",
}
ALKALINITY_NAMES = {
    "Alkalinity",
    "Alkalinity, total",
    "Alkalinity, bicarbonate",
    "Alkalinity, Bicarbonate as CaCO3",
    "Alkalinity, carbonate",
    "Alkalinity, Carbonate as CaCO3",
    "Alkalinity, Phenolphthalein (total hydroxide+1/2 carbonate)",
}

# ---------- 几何 ----------------------------------------------------------


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0088  # 地球平均半径 km
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


# ---------- IO ------------------------------------------------------------


def _load(name: str) -> Any:
    return json.loads((ROOT / name).read_text(encoding="utf-8"))


def _save(name: str, data: Any) -> None:
    (ROOT / name).write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


# ---------- 下游遍历 ------------------------------------------------------


def walk_downstream(
    start_id: str,
    segments_by_id: dict[str, dict],
    max_km: float = DOWNSTREAM_MAX_KM,
    max_hops: int = DOWNSTREAM_MAX_HOPS,
) -> list[str]:
    """
    沿 downstream_id 走，累积 length_km；到 max_km 截断、到 max_hops 截断、
    遇到 cycle 截断（镜像 segmentGraph.js 的 Set 防环）。返回 segment id list（含起点）。
    """
    path: list[str] = []
    seen: set[str] = set()
    cur: Optional[str] = start_id
    cum_km = 0.0
    steps = 0
    while cur and steps < max_hops:
        if cur in seen:
            break
        seg = segments_by_id.get(cur)
        if seg is None:
            break
        seen.add(cur)
        path.append(cur)
        cum_km += float(seg.get("length_km") or 0.0)
        if cum_km >= max_km:
            break
        cur = seg.get("downstream_id")
        steps += 1
    return path


# ---------- 单位归一化 ----------------------------------------------------


def normalize_metal_mgL(value, unit: str, fraction: str) -> Optional[float]:
    """Iron/Mn/Al：保留 fraction == 'Dissolved' 或空（多数 PA DEP 报告留空意为 dissolved），
    丢 Total / 沉积物单位。统一到 mg/L。"""
    if value is None:
        return None
    if fraction not in ("Dissolved", ""):
        return None
    u = (unit or "").strip().lower()
    if u in ("mg/l", "mg/l caco3", "mg/l as caco3"):
        return float(value)
    if u in ("ug/l", "ug/l caco3"):
        return float(value) / 1000.0
    if u in ("ug/g", "mg/kg", "%", "ng/l"):
        return None
    if u == "":
        # 启发式：AMD 金属浓度 mg/L 量级在 0.01~50 区间；如果值 > 100 大概率被报成 ug/L
        v = float(value)
        return v / 1000.0 if v > 100 else v
    return None


def normalize_caco3_mgL(value, unit: str) -> Optional[float]:
    """Acidity/Alkalinity：绝大多数是 mg/L 或 mg/l CaCO3（语义同），统一到 mg/L CaCO3。"""
    if value is None:
        return None
    u = (unit or "").strip().lower()
    if u in ("mg/l", "mg/l caco3", "mg/l as caco3", ""):
        return float(value)
    if u == "ug/l":
        return float(value) / 1000.0
    return None


# ---------- station 样本聚合 ----------------------------------------------


def aggregate_station_samples(samples: list[dict]) -> dict:
    ph_vals: list[float] = []
    fe_vals: list[float] = []
    mn_vals: list[float] = []
    al_vals: list[float] = []
    acid_vals: list[float] = []
    alk_vals: list[float] = []
    dates: list[str] = []

    for s in samples:
        char = s.get("characteristic") or ""
        v = s.get("value")
        u = s.get("unit") or ""
        f = s.get("fraction") or ""
        d = s.get("sample_date") or ""
        if d:
            dates.append(d)

        if char in PH_NAMES:
            if v is not None:
                ph_vals.append(float(v))
        elif char in IRON_NAMES:
            n = normalize_metal_mgL(v, u, f)
            if n is not None:
                fe_vals.append(n)
        elif char in MN_NAMES:
            n = normalize_metal_mgL(v, u, f)
            if n is not None:
                mn_vals.append(n)
        elif char in AL_NAMES:
            n = normalize_metal_mgL(v, u, f)
            if n is not None:
                al_vals.append(n)
        elif char in ACIDITY_NAMES:
            n = normalize_caco3_mgL(v, u)
            if n is not None:
                acid_vals.append(n)
        elif char in ALKALINITY_NAMES:
            n = normalize_caco3_mgL(v, u)
            if n is not None:
                alk_vals.append(n)

    def _med(xs):
        return round(median(xs), 2) if xs else None

    def _avg(xs):
        return round(sum(xs) / len(xs), 3) if xs else None

    def _max(xs):
        return round(max(xs), 2) if xs else None

    return {
        "ph": _med(ph_vals),
        "iron": _avg(fe_vals),
        "manganese": _avg(mn_vals),
        "aluminum": _avg(al_vals),
        "acidity_mgL_caco3": _max(acid_vals),
        "alkalinity_mgL_caco3": _avg(alk_vals),
        "n_samples": len(samples),
        "sample_window": {
            "start": min(dates) if dates else None,
            "end": max(dates) if dates else None,
        },
    }


# ---------- severity 分类 -------------------------------------------------


def classify_severity(sf_priority: str, station_aggs: list[dict]) -> str:
    sf = (sf_priority or "").strip()
    if sf == "Extreme Health or Safety Impact":
        return "extreme"
    for agg in station_aggs:
        ph = agg.get("ph")
        fe = agg.get("iron")
        if ph is not None and ph < 3:
            return "extreme"
        if fe is not None and fe > 5:
            return "extreme"

    if sf == "Health or Safety Impact":
        return "high"
    for agg in station_aggs:
        ph = agg.get("ph")
        fe = agg.get("iron")
        ac = agg.get("acidity_mgL_caco3")
        al = agg.get("alkalinity_mgL_caco3")
        if ph is not None and ph < 4:
            return "high"
        if fe is not None and fe > 1:
            return "high"
        if ac is not None and al is not None and ac > 50 and ac > al:
            return "high"

    if sf == "Environmental Impact":
        return "medium"
    for agg in station_aggs:
        ph = agg.get("ph")
        fe = agg.get("iron")
        if ph is not None and ph < 6:
            return "medium"
        if fe is not None and fe > 0.3:
            return "medium"

    return "low"


# ---------- main ----------------------------------------------------------


def main() -> int:
    print(f"Loading data from {ROOT} ...")
    pollution_sources = _load("pollution_sources.json")
    monitoring_stations = _load("monitoring_stations.json")
    samples = _load("water_quality_samples.json")
    collieries = _load("collieries.json")
    sg_fc = _load("stream_segments.geojson")

    # ----- 索引 -----
    print("Indexing ...")

    # segment id -> properties dict (含 downstream_id, length_km, name, huc8)
    segments_by_id: dict[str, dict] = {}
    for feat in sg_fc.get("features", []):
        props = feat.get("properties", {})
        sid = props.get("id")
        if sid:
            segments_by_id[sid] = props

    # station_id -> samples list
    samples_by_station: dict[str, list[dict]] = defaultdict(list)
    for s in samples:
        sid = s.get("station_id")
        if sid:
            samples_by_station[sid].append(s)

    # segment_id -> stations attached to it
    stations_by_segment: dict[str, list[dict]] = defaultdict(list)
    for st in monitoring_stations:
        seg = st.get("attach_segment_id")
        if seg:
            stations_by_segment[seg].append(st)

    print(f"  {len(segments_by_id)} segments, {len(samples_by_station)} stations with samples, "
          f"{len(monitoring_stations)} stations total, {len(collieries)} collieries, "
          f"{len(pollution_sources)} pollution sources.")

    # ----- 主循环：每个 pollution_source 一个 harm -----
    print(f"\nBuilding harms (downstream_max={DOWNSTREAM_MAX_KM} km, "
          f"colliery_radius={COLLIERY_RADIUS_KM} km) ...")

    harms: list[dict] = []
    n_skipped_no_attach = 0
    n_skipped_segment_missing = 0

    for p in pollution_sources:
        attach = p.get("attach_segment_id")
        if not attach:
            n_skipped_no_attach += 1
            continue
        if attach not in segments_by_id:
            n_skipped_segment_missing += 1
            continue

        # 1) 下游 reach 路径
        reach_ids = walk_downstream(attach, segments_by_id)
        reach_id_set = set(reach_ids)

        # 2) 哪些 station 落在路径上 — 只保留有样本的（n_samples > 0），
        # 没样本的 station 即使物理上贴在 reach 上也不能算"supporting evidence"
        supporting_stations: list[dict] = []
        all_dates: list[str] = []
        for rid in reach_ids:
            for st in stations_by_segment.get(rid, []):
                station_samples = samples_by_station.get(st["id"], [])
                if not station_samples:
                    continue
                agg = aggregate_station_samples(station_samples)
                supporting_stations.append({
                    "id": st["id"],
                    "name": st.get("name", ""),
                    "ph": agg["ph"],
                    "iron": agg["iron"],
                    "manganese": agg["manganese"],
                    "aluminum": agg["aluminum"],
                    "acidity_mgL_caco3": agg["acidity_mgL_caco3"],
                    "alkalinity_mgL_caco3": agg["alkalinity_mgL_caco3"],
                    "n_samples": agg["n_samples"],
                    "sample_window": agg["sample_window"],
                })
                w = agg["sample_window"]
                if w["start"]:
                    all_dates.append(w["start"])
                if w["end"]:
                    all_dates.append(w["end"])

        # 3) colliery 半径搜
        p_lat = p["latitude"]
        p_lon = p["longitude"]
        source_collieries: list[dict] = []
        for c in collieries:
            d_km = haversine_km(p_lat, p_lon, c["latitude"], c["longitude"])
            if d_km <= COLLIERY_RADIUS_KM:
                source_collieries.append({
                    "id": c["id"],
                    "name": c.get("name", ""),
                    "operator": c.get("operator", ""),
                    "status": c.get("status", ""),
                    "distance_m": int(round(d_km * 1000)),
                })
        source_collieries.sort(key=lambda x: x["distance_m"])

        # 4) affected_streams 展开
        affected_streams: list[dict] = []
        total_reach_km = 0.0
        for rid in reach_ids:
            seg = segments_by_id[rid]
            length_km = seg.get("length_km") or 0.0
            total_reach_km += length_km
            affected_streams.append({
                "id": rid,
                "name": seg.get("name") or None,
                "length_km": length_km,
                "huc8": seg.get("huc8") or None,
            })

        # 5) severity + time_window
        severity = classify_severity(
            (p.get("source") or {}).get("sf_priority", ""),
            supporting_stations,
        )
        time_window = {
            "start": min(all_dates) if all_dates else None,
            "end": max(all_dates) if all_dates else None,
        }

        # 6) name — 在没 PA DEP gnis 名时用 source 名 + 第一段河名做提示
        first_named_stream = next(
            (s["name"] for s in affected_streams if s["name"]),
            None,
        )
        name = f"AMD discharge {p.get('name', p['id'])}"
        if first_named_stream:
            name += f" → {first_named_stream}"

        harm = {
            "id": f"harm-{p['id']}",
            "name": name,
            "severity": severity,
            "time_window": time_window,
            "pollution_source_id": p["id"],
            "source_collieries": source_collieries,
            "stations": supporting_stations,
            "affected_streams": affected_streams,
            "key_metrics": {
                "n_collieries": len(source_collieries),
                "n_stations": len(supporting_stations),
                "n_reaches": len(affected_streams),
                "total_reach_length_km": round(total_reach_km, 2),
                "flow_gpm": p.get("source", {}).get("flow_gpm_reported"),
                "sf_priority": p.get("source", {}).get("sf_priority"),
            },
        }
        harms.append(harm)

    # ----- 输出 + 汇总 -----
    _save("harms.json", harms)

    print(f"\nWrote harms.json — {len(harms)} harm(s).")
    print(f"  skipped (no attach_segment_id): {n_skipped_no_attach}")
    print(f"  skipped (attach_segment_id 不在 segment 集合): {n_skipped_segment_missing}")

    sev = Counter(h["severity"] for h in harms)
    print("\nSeverity distribution:")
    for k in ("extreme", "high", "medium", "low"):
        print(f"  {sev.get(k, 0):>4}  {k}")

    if harms:
        n_coll = [h["key_metrics"]["n_collieries"] for h in harms]
        n_stn = [h["key_metrics"]["n_stations"] for h in harms]
        n_rch = [h["key_metrics"]["n_reaches"] for h in harms]
        print("\nKey metric distribution (mean / max):")
        print(f"  collieries  per harm: {sum(n_coll)/len(n_coll):.2f} / {max(n_coll)}")
        print(f"  stations    per harm: {sum(n_stn)/len(n_stn):.2f} / {max(n_stn)}")
        print(f"  reaches     per harm: {sum(n_rch)/len(n_rch):.2f} / {max(n_rch)}")

        with_collieries = sum(1 for h in harms if h["key_metrics"]["n_collieries"] > 0)
        with_stations = sum(1 for h in harms if h["key_metrics"]["n_stations"] > 0)
        print(f"\n  harms with at least 1 colliery within 2km: {with_collieries} ({with_collieries/len(harms)*100:.1f}%)")
        print(f"  harms with at least 1 supporting station:  {with_stations} ({with_stations/len(harms)*100:.1f}%)")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

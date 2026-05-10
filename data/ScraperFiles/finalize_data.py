#!/usr/bin/env python3
"""
把 data/newData/ 里来自不同 scraper / 队友的原始文件清洗、过滤、规范化后
统一落到 data/final/。一次跑完即可生成 MVP 用的全套数据。

做的事情：
  1. 读 pollution_sources / monitoring_stations / water_quality_samples（已经
     是清洗后的格式）— 直接复制。
  2. 读 coal_mining_operations.json — 处理 BOM、过滤 bbox、丢坏坐标、规范
     status、把 lat/lon 改成 latitude/longitude、加 attach_segment_id=null。
     输出到 final/collieries.json。
  3. 读 stream_segments_slim.json — 处理 BOM、过滤 bbox、丢非自然河段
     （Pipeline/Coastline/Connector/CanalDitch/ArtificialPath?）、丢坏的
     downstream_id、转成 GeoJSON FeatureCollection。输出 final/stream_segments.geojson。
  4. 顺带把 anthracite bbox 写到 final/_bbox.json，方便其他脚本引用。

只用 stdlib。脚本是幂等的，可以反复跑。
"""

from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path
from typing import Any

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")


ROOT = Path(__file__).resolve().parent.parent  # data/
SRC = ROOT / "newData"
DST = ROOT / "final"
TOY = ROOT / "toy_models"

# Anthracite Region bbox (W, S, E, N) — 与所有 scraper 保持一致
ANTHRACITE_BBOX = (-76.85, 40.50, -75.20, 41.65)

# 哪些 stream ftype 留下做 AMD 故事
# StreamRiver = 自然河流；ArtificialPath 穿湖也保留（拓扑连续性需要）；其他丢
STREAM_FTYPE_KEEP = {"StreamRiver", "ArtificialPath"}


def _in_bbox(lon: float, lat: float) -> bool:
    return (
        ANTHRACITE_BBOX[0] <= lon <= ANTHRACITE_BBOX[2]
        and ANTHRACITE_BBOX[1] <= lat <= ANTHRACITE_BBOX[3]
    )


def _load_json(path: Path) -> Any:
    """utf-8-sig 处理 BOM；普通 json.load 不会自动剥。"""
    return json.loads(path.read_text(encoding="utf-8-sig"))


def _save_json(path: Path, data: Any, *, indent: int = 2) -> None:
    path.write_text(json.dumps(data, indent=indent, ensure_ascii=False), encoding="utf-8")


def passthrough(name: str) -> int:
    """把 newData 里已经清洗好的文件直接 copy 到 final（跑一次性"绑定"）。"""
    src = SRC / name
    dst = DST / name
    if not src.exists():
        print(f"  ! missing {src}")
        return 0
    shutil.copy2(src, dst)
    # 用 size 做个 sanity check
    n_bytes = dst.stat().st_size
    print(f"  copied {name} ({n_bytes/1024:.1f} KB)")
    # 顶层是 list 时回报条数
    try:
        d = _load_json(dst)
        if isinstance(d, list):
            return len(d)
    except Exception:
        pass
    return 0


# ---------- collieries -------------------------------------------------------

# 状态归一化映射 — 修 typo + 大小写
COLLIERY_STATUS_MAP = {
    "ACTIVE": "ACTIVE",
    "Active": "ACTIVE",
    "INACTIVE": "INACTIVE",
    "ABANDONED": "ABANDONED",
    "RECLAMATION COMPLETED": "RECLAMATION_COMPLETED",
    "PROPOSED BUT NEVER MATERIALIZED": "PROPOSED_NEVER_REALIZED",
    "Unavaialble": "UNKNOWN",
    "": "UNKNOWN",
}


def build_collieries() -> dict:
    """coal_mining_operations.json -> collieries.json。"""
    src_path = SRC / "coal_mining_operations.json"
    cm = _load_json(src_path)

    out: list[dict] = []
    n_skip_bad_coords = 0
    n_skip_out_of_bbox = 0
    n_status_unmapped = 0

    for r in cm:
        lon = r.get("lon")
        lat = r.get("lat")
        if lon is None or lat is None or abs(lon) < 0.01 or abs(lat) < 0.01:
            n_skip_bad_coords += 1
            continue
        if not _in_bbox(lon, lat):
            n_skip_out_of_bbox += 1
            continue
        raw_status = r.get("status", "")
        status = COLLIERY_STATUS_MAP.get(raw_status)
        if status is None:
            status = "UNKNOWN"
            n_status_unmapped += 1
        out.append({
            "id": r["id"],
            "name": r.get("name", "") or "",
            "operator": r.get("operator", "") or "",
            "status": status,
            "latitude": lat,
            "longitude": lon,
            "attach_segment_id": None,
        })

    _save_json(DST / "collieries.json", out)
    return {
        "in_count": len(cm),
        "out_count": len(out),
        "skip_bad_coords": n_skip_bad_coords,
        "skip_out_of_bbox": n_skip_out_of_bbox,
        "status_unmapped": n_status_unmapped,
    }


# ---------- stream segments ---------------------------------------------------

def build_stream_segments() -> dict:
    """stream_segments_slim.json -> stream_segments.geojson (FeatureCollection)。"""
    src_path = SRC / "stream_segments_slim.json"
    ss = _load_json(src_path)

    # 第一遍：过滤 bbox + ftype，构造保留集合
    kept: list[dict] = []
    n_skip_ftype = 0
    n_skip_bbox = 0
    n_skip_no_midpoint = 0
    for r in ss:
        ft = r.get("ftype", "")
        if ft not in STREAM_FTYPE_KEEP:
            n_skip_ftype += 1
            continue
        mid = r.get("midpoint")
        if not mid or len(mid) != 2:
            n_skip_no_midpoint += 1
            continue
        if not _in_bbox(mid[0], mid[1]):
            n_skip_bbox += 1
            continue
        kept.append(r)

    # 第二遍：清理 downstream_id —— 指向不在 kept 集合的 id 改 null
    kept_ids = {r["id"] for r in kept}
    n_downstream_dangling = 0
    n_downstream_invalid_format = 0
    features: list[dict] = []
    for r in kept:
        ds = r.get("downstream_id")
        # 砸掉 GUID / "0" / 不在集合的
        if ds is not None:
            if ds == "0" or "{" in ds or "-" in ds and len(ds) > 30:
                n_downstream_invalid_format += 1
                ds = None
            elif ds not in kept_ids:
                n_downstream_dangling += 1
                ds = None

        # 用 start->mid->end 三点拼成 polyline；frontend / 后端的
        # MapView.jsx 和 polyline.js 都期待 LineString 几何
        coords = []
        for key in ("start_point", "midpoint", "end_point"):
            p = r.get(key)
            if p and len(p) == 2:
                coords.append([p[0], p[1]])
        if len(coords) < 2:
            continue

        features.append({
            "type": "Feature",
            "properties": {
                "id": r["id"],
                "name": r.get("name") or None,
                "downstream_id": ds,
                "length_km": r.get("length_km"),
                "ftype": r.get("ftype"),
                "huc8": r.get("huc8"),
            },
            "geometry": {
                "type": "LineString",
                "coordinates": coords,
            },
        })

    fc = {"type": "FeatureCollection", "features": features}
    _save_json(DST / "stream_segments.geojson", fc)
    return {
        "in_count": len(ss),
        "out_count": len(features),
        "skip_ftype": n_skip_ftype,
        "skip_bbox": n_skip_bbox,
        "skip_no_midpoint": n_skip_no_midpoint,
        "downstream_dangling_to_null": n_downstream_dangling,
        "downstream_invalid_format_to_null": n_downstream_invalid_format,
    }


# ---------- main --------------------------------------------------------------

def main() -> int:
    DST.mkdir(parents=True, exist_ok=True)

    print(f"Anthracite bbox (W,S,E,N): {ANTHRACITE_BBOX}")
    print(f"Source dir: {SRC}")
    print(f"Output dir: {DST}\n")

    print("[1/5] Pass-through cleaned files:")
    n_ps = passthrough("pollution_sources.json")
    n_ms = passthrough("monitoring_stations.json")
    n_wq = passthrough("water_quality_samples.json")

    # simulation_config.json 没经过 scraper —— 它是设计参数，住在 toy_models/
    sim_cfg_src = TOY / "simulation_config.json"
    if sim_cfg_src.exists():
        shutil.copy2(sim_cfg_src, DST / "simulation_config.json")
        print(f"  copied simulation_config.json from toy_models/")
    else:
        print(f"  ! simulation_config.json not found in {TOY}")

    print("\n[2/5] Build collieries.json from coal_mining_operations.json:")
    col_stats = build_collieries()
    for k, v in col_stats.items():
        print(f"  {k}: {v}")

    print("\n[3/5] Build stream_segments.geojson from stream_segments_slim.json:")
    seg_stats = build_stream_segments()
    for k, v in seg_stats.items():
        print(f"  {k}: {v}")

    print("\n[4/5] Write _bbox.json:")
    _save_json(DST / "_bbox.json", {
        "west": ANTHRACITE_BBOX[0],
        "south": ANTHRACITE_BBOX[1],
        "east": ANTHRACITE_BBOX[2],
        "north": ANTHRACITE_BBOX[3],
        "name": "Pennsylvania Anthracite Region",
    })
    print("  done")

    print("\n[5/5] Summary of files in data/final/:")
    counts = {
        "pollution_sources.json": n_ps,
        "monitoring_stations.json": n_ms,
        "water_quality_samples.json": n_wq,
        "collieries.json": col_stats["out_count"],
        "stream_segments.geojson (features)": seg_stats["out_count"],
    }
    for k, v in counts.items():
        size_kb = (DST / k.split(" ")[0]).stat().st_size / 1024
        print(f"  {k:<45} {v:>7} records  ({size_kb:>10.1f} KB)")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""
把 pollution_sources.json 和 monitoring_stations.json 里 attach_segment_id 为
null 的点，snap 到 stream_segments.geojson 中最近的 LineString 段。

为什么需要这个：
  - 前端粒子模拟 (MapView.jsx 里 buildDownstreamPath) 用 attach_segment_id 找
    起点河段，否则粒子流根本启动不了。
  - 后端 AMDHarm.affected_reach_ids 想关联污染源 → 河段，也要靠这个字段。

什么时候要重新跑：
  - stream_segments.geojson 被替换成真实 NHDPlus HR flowline 之后，要把所有
    attach_segment_id 重置回 null 然后再跑这个脚本一次。
  - 加新的 pollution_sources / monitoring_stations 数据时同理。

距离算法：等距矩形投影（equirectangular），在 bbox 中心做局部展开。对 ~1°
范围内 (我们的 bbox 约 1.65° × 1.15°) 误差小于 0.1%，对 snap 任务足够。

只用 stdlib。
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path
from typing import Iterable, Optional

# Windows 上 stdout 默认 cp1252，会卡死中文/emoji 输出
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")


METERS_PER_DEG_LAT = 111_320.0   # ~ constant
SNAP_CAP_METERS_DEFAULT = 5000.0  # 不 snap 超过 5 km 的点（数据 bug 兜底）


def lonlat_to_local_xy(lon: float, lat: float, lat_origin: float) -> tuple[float, float]:
    """等距矩形：lat_origin 决定 x 方向的伸缩。"""
    x = math.radians(lon) * math.cos(math.radians(lat_origin)) * 6_371_008.8
    y = math.radians(lat) * 6_371_008.8
    return x, y


def point_to_segment_distance(
    px: float, py: float, ax: float, ay: float, bx: float, by: float,
) -> float:
    """点 (px,py) 到线段 (a→b) 的最短距离（同坐标系下的欧氏距离）。"""
    dx, dy = bx - ax, by - ay
    if dx == 0.0 and dy == 0.0:
        return math.hypot(px - ax, py - ay)
    t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)
    t = max(0.0, min(1.0, t))
    qx, qy = ax + t * dx, ay + t * dy
    return math.hypot(px - qx, py - qy)


def nearest_segment_id(
    px: float,
    py: float,
    segments_xy: list[tuple[str, list[tuple[float, float]]]],
    snap_cap_m: float,
) -> tuple[Optional[str], float]:
    """
    点已经投影到米坐标系 (px, py) — 调用方负责确保投影 lat_origin 与
    segments_xy 用的是同一个。返回 (最近 segment id, 距离米)。
    超出 snap_cap_m 时返回 (None, dist)。
    """
    if not segments_xy:
        return None, math.inf

    best_id: Optional[str] = None
    best_dist = math.inf

    for sid, coords_xy in segments_xy:
        for (ax, ay), (bx, by) in zip(coords_xy, coords_xy[1:]):
            d = point_to_segment_distance(px, py, ax, ay, bx, by)
            if d < best_dist:
                best_dist = d
                best_id = sid

    if best_dist > snap_cap_m:
        return None, best_dist
    return best_id, best_dist


def load_segments_xy(
    geojson_path: Path,
) -> tuple[list[tuple[str, list[tuple[float, float]]]], float]:
    """
    返回 (segments_xy, lat_origin)。每个 segment 是 (id, [(x,y), ...])。
    所有点都按同一 lat_origin 投影，确保跨 segment 距离可比较。
    """
    fc = json.loads(geojson_path.read_text())
    feats = fc.get("features", [])
    if not feats:
        raise RuntimeError(f"{geojson_path} 里没有 features")

    # 用所有顶点的平均 lat 作为投影中心
    all_lats: list[float] = []
    for f in feats:
        coords = f.get("geometry", {}).get("coordinates", [])
        for c in _iter_linestring_points(coords, f.get("geometry", {}).get("type")):
            all_lats.append(c[1])
    lat_origin = sum(all_lats) / len(all_lats) if all_lats else 41.0

    segments_xy: list[tuple[str, list[tuple[float, float]]]] = []
    for f in feats:
        sid = f.get("properties", {}).get("id")
        if not sid:
            continue
        geom = f.get("geometry") or {}
        gtype = geom.get("type")
        coords = geom.get("coordinates") or []
        for line in _iter_lines(coords, gtype):
            xy = [lonlat_to_local_xy(lon, lat, lat_origin) for lon, lat in line]
            if len(xy) >= 2:
                segments_xy.append((sid, xy))

    return segments_xy, lat_origin


def _iter_lines(coords, gtype: str):
    """统一处理 LineString 和 MultiLineString — 真实 NHD 数据可能是 MLS。"""
    if gtype == "LineString":
        yield coords
    elif gtype == "MultiLineString":
        for line in coords:
            yield line
    # 其他类型（Point/Polygon）静默跳过


def _iter_linestring_points(coords, gtype: str):
    for line in _iter_lines(coords, gtype):
        for pt in line:
            yield pt


def snap_points_file(
    points_path: Path,
    segments_xy: list[tuple[str, list[tuple[float, float]]]],
    lat_origin: float,
    *,
    lon_key: str,
    lat_key: str,
    snap_cap_m: float,
    force: bool,
    dry_run: bool,
) -> dict:
    """
    给一个 list-of-dicts 文件每条记录填 attach_segment_id。
    返回汇总字典。lat_origin 必须和 segments_xy 用的同一个，否则坐标系不一致。
    """
    points = json.loads(points_path.read_text())

    if not isinstance(points, list):
        raise RuntimeError(f"{points_path} 不是 list；先看下数据格式")

    n_total = len(points)
    n_skip_already = 0
    n_skip_no_coords = 0
    n_assigned = 0
    n_over_cap = 0
    dist_samples: list[float] = []

    for p in points:
        if p.get("attach_segment_id") is not None and not force:
            n_skip_already += 1
            continue
        lon = p.get(lon_key)
        lat = p.get(lat_key)
        if lon is None or lat is None:
            n_skip_no_coords += 1
            continue
        px, py = lonlat_to_local_xy(lon, lat, lat_origin)
        sid, dist = nearest_segment_id(px, py, segments_xy, snap_cap_m)
        if sid is None:
            n_over_cap += 1
            p["attach_segment_id"] = None
        else:
            p["attach_segment_id"] = sid
            n_assigned += 1
            dist_samples.append(dist)

    summary = {
        "file": points_path.name,
        "total": n_total,
        "skip_already_set": n_skip_already,
        "skip_no_coords": n_skip_no_coords,
        "assigned": n_assigned,
        "over_cap": n_over_cap,
        "dist_p50_m": round(_quantile(dist_samples, 0.50), 1) if dist_samples else None,
        "dist_p90_m": round(_quantile(dist_samples, 0.90), 1) if dist_samples else None,
        "dist_max_m": round(max(dist_samples), 1) if dist_samples else None,
    }

    if not dry_run and (n_assigned or force):
        points_path.write_text(json.dumps(points, indent=2))

    return summary


def _quantile(xs: list[float], q: float) -> float:
    if not xs:
        return 0.0
    s = sorted(xs)
    i = max(0, min(len(s) - 1, int(round(q * (len(s) - 1)))))
    return s[i]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--data-dir",
        default=str(Path(__file__).resolve().parent.parent / "final"),
        help="data/final 目录的路径（默认按相对路径）。",
    )
    parser.add_argument(
        "--segments",
        default="stream_segments.geojson",
        help="相对 --data-dir 的 stream segments GeoJSON 文件路径。",
    )
    parser.add_argument(
        "--snap-cap-m",
        type=float,
        default=SNAP_CAP_METERS_DEFAULT,
        help=f"最大 snap 距离（米，超过则保持 null）。默认 {SNAP_CAP_METERS_DEFAULT}。",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="即使 attach_segment_id 已有值也强制重 snap（替换河网时用）。",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="只算不写。",
    )
    args = parser.parse_args()

    data_dir = Path(args.data_dir).resolve()
    seg_path = (data_dir / args.segments).resolve()
    if not seg_path.exists():
        print(f"找不到 {seg_path}", file=sys.stderr)
        return 1

    print(f"Loading segments from {seg_path} ...")
    segments_xy, lat_origin = load_segments_xy(seg_path)
    n_segs = len({sid for sid, _ in segments_xy})
    n_edges = sum(len(c) - 1 for _, c in segments_xy)
    print(f"  {n_segs} segment(s), {n_edges} edge(s); projection origin lat={lat_origin:.4f}")
    if n_segs <= 5:
        print("  ⚠️  segment 数极少，可能还是 toy 数据；跑完之后 attach_segment_id 会几乎全部贴到同一段。"
              " 真实 NHDPlus HR 落地后用 --force 重跑。")

    targets = [
        # (相对 --data-dir 的路径, 经度字段名, 纬度字段名)
        # 默认 --data-dir 已经是 data/final，所以这里只写文件名
        (Path("pollution_sources.json"), "longitude", "latitude"),
        (Path("monitoring_stations.json"), "longitude", "latitude"),
        (Path("collieries.json"), "longitude", "latitude"),
    ]

    print(f"\nSnap cap: {args.snap_cap_m} m  | force={args.force}  | dry_run={args.dry_run}\n")

    summaries: list[dict] = []
    for rel, lon_key, lat_key in targets:
        path = (data_dir / rel).resolve()
        if not path.exists():
            print(f"  跳过 {path}（不存在）")
            continue
        print(f"  -> {rel} ...", end=" ", flush=True)
        s = snap_points_file(
            path,
            segments_xy,
            lat_origin,
            lon_key=lon_key,
            lat_key=lat_key,
            snap_cap_m=args.snap_cap_m,
            force=args.force,
            dry_run=args.dry_run,
        )
        print("done")
        summaries.append(s)

    print("\n=== Summary ===")
    for s in summaries:
        print(json.dumps(s, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

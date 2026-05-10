"""水质样本数据加载与按 station_id 索引（lazy + 内存缓存）。

water_quality_samples.json 是 27 MB / 75k 条，每次请求都重读太重，
首次访问时一次性 build 成 station_id → samples list 索引，后续 O(1)。
"""
import json
import os
from typing import Optional

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "data", "final")

_CACHE: dict[str, list[dict]] | None = None


def _build_index() -> dict[str, list[dict]]:
    path = os.path.join(DATA_DIR, "water_quality_samples.json")
    with open(path, encoding="utf-8") as f:
        rows = json.load(f)
    by_station: dict[str, list[dict]] = {}
    for r in rows:
        sid = r.get("station_id")
        if not sid:
            continue
        by_station.setdefault(sid, []).append(r)
    # 每个站点的样本按 sample_date 升序——前端折线图直接用
    for arr in by_station.values():
        arr.sort(key=lambda s: s.get("sample_date") or "")
    return by_station


def _ensure_loaded() -> dict[str, list[dict]]:
    global _CACHE
    if _CACHE is None:
        _CACHE = _build_index()
    return _CACHE


def get_samples_for_station(
    station_id: str,
    *,
    characteristic: Optional[str] = None,
    fraction: Optional[str] = None,
) -> list[dict]:
    idx = _ensure_loaded()
    rows = idx.get(station_id, [])
    if characteristic is not None:
        rows = [r for r in rows if r.get("characteristic") == characteristic]
    if fraction is not None:
        rows = [r for r in rows if (r.get("fraction") or "") == fraction]
    return rows


def list_characteristics_for_station(station_id: str) -> list[dict]:
    """返回该站点拥有的 characteristic 列表（按数量降序），用于前端下拉。"""
    rows = _ensure_loaded().get(station_id, [])
    counts: dict[str, int] = {}
    for r in rows:
        c = r.get("characteristic")
        if c:
            counts[c] = counts.get(c, 0) + 1
    return sorted(
        [{"name": k, "count": v} for k, v in counts.items()],
        key=lambda x: -x["count"],
    )

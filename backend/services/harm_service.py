"""AMDHarm 数据加载与 evidence 拼装。

harms.json 现在由 data/ScraperFiles/build_harms.py 预烘成 denormalized
evidence packet（每个 harm 自带展开后的 source_collieries / stations /
affected_streams 列表 + 单位归一化好的样本聚合值），所以本 service 退化为
纯 passthrough，不再做 colliery / station / stream 的运行时 JOIN。

如果数据流有变（重新 scrape、改 snap、改下游半径），重跑 build_harms.py
重新生成 harms.json 即可。
"""
import json
import os

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "data", "final")


def load_harms():
    path = os.path.join(DATA_DIR, "harms.json")
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def get_harm_by_id(harm_id: str):
    harms = load_harms()
    for h in harms:
        if h.get("id") == harm_id:
            return h
    return None


def build_harm_evidence(harm_id: str):
    """
    返回 harm 记录本身——它已经是前端 HarmPanel 期望的 evidence packet 形态：
    {id, name, severity, time_window, source_collieries[...], stations[...],
     affected_streams[...], key_metrics, ...}
    """
    return get_harm_by_id(harm_id)


# ---------- Reverse-lookup helpers (Phase 2) -----------------------------
# 给定一个 colliery / station / segment / pollution-source id，返回它所属的 harm
# 列表的"摘要"形态（只 id + name + severity，足以让前端展示按钮）。
#
# 所有 lookup 都做线性扫描——538 个 harm × 平均 10 colliery / 2.5 station /
# 16.6 reach 总共大概 ~16K id 比较，每次请求几毫秒，MVP 阶段不必加索引。

def _harm_summary(h: dict) -> dict:
    return {
        "id": h.get("id"),
        "name": h.get("name"),
        "severity": h.get("severity"),
    }


def harms_for_colliery(colliery_id: str) -> list[dict]:
    return [
        _harm_summary(h)
        for h in load_harms()
        if any(c.get("id") == colliery_id for c in h.get("source_collieries", []))
    ]


def harms_for_station(station_id: str) -> list[dict]:
    return [
        _harm_summary(h)
        for h in load_harms()
        if any(s.get("id") == station_id for s in h.get("stations", []))
    ]


def harms_for_segment(segment_id: str) -> list[dict]:
    return [
        _harm_summary(h)
        for h in load_harms()
        if any(s.get("id") == segment_id for s in h.get("affected_streams", []))
    ]


def harm_for_pollution_source(pollution_source_id: str):
    """1:1 映射 — harm id 直接是 'harm-' + pollution_source_id。"""
    return get_harm_by_id(f"harm-{pollution_source_id}")


def _harms_for(kind: str, entity_id: str) -> list[dict]:
    """根据 kind 找出包含该 entity 的所有 harm 完整记录（不是 summary）。"""
    if kind == "colliery":
        return [h for h in load_harms()
                if any(c.get("id") == entity_id
                       for c in h.get("source_collieries", []))]
    if kind == "station":
        return [h for h in load_harms()
                if any(s.get("id") == entity_id
                       for s in h.get("stations", []))]
    if kind == "segment":
        return [h for h in load_harms()
                if any(s.get("id") == entity_id
                       for s in h.get("affected_streams", []))]
    if kind == "pollution_source":
        h = get_harm_by_id(f"harm-{entity_id}")
        return [h] if h else []
    return []


def related_ids_for(kind: str, entity_id: str) -> dict:
    """
    给定一个 entity（colliery / station / pollution_source / segment），返回
    它所属 harm 集合里所有相关 entity 的 id 集合。前端用这套 id set 在地图上做
    "高亮关联 + dim 不相关"。

    返回结构（每个值都是 list[str]）：
      {
        "harm_ids":             [...],
        "pollution_source_ids": [...],
        "station_ids":          [...],
        "segment_ids":          [...],
        "colliery_ids":         [...],
      }

    入参 entity 自身的 id 会从对应桶里排除——前端单独标"selected"。
    """
    out = {
        "harm_ids": set(),
        "pollution_source_ids": set(),
        "station_ids": set(),
        "segment_ids": set(),
        "colliery_ids": set(),
    }
    for h in _harms_for(kind, entity_id):
        out["harm_ids"].add(h.get("id"))
        psid = h.get("pollution_source_id")
        if psid:
            out["pollution_source_ids"].add(psid)
        for c in h.get("source_collieries", []):
            cid = c.get("id")
            if cid:
                out["colliery_ids"].add(cid)
        for s in h.get("stations", []):
            sid = s.get("id")
            if sid:
                out["station_ids"].add(sid)
        for s in h.get("affected_streams", []):
            sid = s.get("id")
            if sid:
                out["segment_ids"].add(sid)

    # 排除入参 entity 自身
    if kind == "colliery":
        out["colliery_ids"].discard(entity_id)
    elif kind == "station":
        out["station_ids"].discard(entity_id)
    elif kind == "segment":
        out["segment_ids"].discard(entity_id)
    elif kind == "pollution_source":
        out["pollution_source_ids"].discard(entity_id)

    # set → sorted list（前端 ["literal", [...]] 用得到稳定顺序方便调试）
    return {k: sorted(v) for k, v in out.items()}

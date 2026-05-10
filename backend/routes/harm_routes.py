from flask import Blueprint, jsonify

from services.harm_service import (
    build_harm_evidence,
    harms_for_segment,
    load_harms,
    related_ids_for,
)

harm_routes = Blueprint("harm_routes", __name__, url_prefix="/api/harms")


@harm_routes.get("")
def list_harms():
    """返回所有 Harm 列表（用于 Sidebar 或调试）。"""
    return jsonify(load_harms())


@harm_routes.get("/<harm_id>")
def get_harm(harm_id: str):
    """返回单个 Harm 的完整 evidence（煤矿、监测站、受影响河段）。"""
    evidence = build_harm_evidence(harm_id)
    if not evidence:
        return jsonify({"error": "Not found"}), 404
    return jsonify(evidence)


@harm_routes.get("/by-segment/<segment_id>")
def list_harms_by_segment(segment_id: str):
    """返回所有"流过"该 stream segment 的 harm 摘要列表（id / name / severity）。"""
    return jsonify(harms_for_segment(segment_id))


@harm_routes.get("/related/<kind>/<entity_id>")
def get_related(kind: str, entity_id: str):
    """
    返回与给定 entity 相关的所有 entity id 集合，前端用来做 "highlight 关联 + dim 不相关"。
    kind ∈ {colliery, station, pollution_source, segment}
    Response: {harm_ids, pollution_source_ids, station_ids, segment_ids, colliery_ids}
    """
    if kind not in ("colliery", "station", "pollution_source", "segment"):
        return jsonify({"error": f"unknown kind: {kind!r}"}), 400
    return jsonify(related_ids_for(kind, entity_id))


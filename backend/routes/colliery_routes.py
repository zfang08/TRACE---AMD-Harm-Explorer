from flask import Blueprint, jsonify

from services.colliery_service import get_colliery_by_id, load_collieries
from services.harm_service import harms_for_colliery

colliery_routes = Blueprint("colliery_routes", __name__, url_prefix="/api/collieries")


@colliery_routes.get("")
def list_collieries():
    """返回所有煤矿（用于地图点图层）。"""
    return jsonify(load_collieries())


@colliery_routes.get("/<colliery_id>")
def get_colliery(colliery_id: str):
    """返回单个煤矿详情 + 它命中的 AMD harm 列表（每个 harm 只带 id/name/severity）。"""
    c = get_colliery_by_id(colliery_id)
    if not c:
        return jsonify({"error": "Not found"}), 404
    return jsonify({**c, "linked_harms": harms_for_colliery(colliery_id)})


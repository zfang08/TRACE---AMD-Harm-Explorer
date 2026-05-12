from flask import Blueprint, jsonify, request

from services.harm_service import harms_for_station
from services.sample_service import (
    get_samples_for_station,
    get_wq_summary,
    list_characteristics_for_station,
)
from services.station_service import get_station_by_id, load_stations

station_routes = Blueprint("station_routes", __name__, url_prefix="/api/stations")


@station_routes.get("")
def list_stations():
    """返回所有监测站。"""
    return jsonify(load_stations())


@station_routes.get("/wq-summary")
def wq_summary():
    """每个站点的 pH 和 Iron 均值，附带经纬度，供前端水质热力图使用。"""
    summaries = {s["station_id"]: s for s in get_wq_summary()}
    stations_by_id = {s["id"]: s for s in load_stations()}
    result = []
    for station_id, summary in summaries.items():
        s = stations_by_id.get(station_id)
        if not s or s.get("latitude") is None or s.get("longitude") is None:
            continue
        result.append({**summary, "lat": s["latitude"], "lon": s["longitude"]})
    return jsonify(result)


@station_routes.get("/<station_id>")
def get_station(station_id: str):
    """返回单个监测站详情 + 它出现的 AMD harm 列表 + 它有的 characteristic 列表。"""
    s = get_station_by_id(station_id)
    if not s:
        return jsonify({"error": "Not found"}), 404
    return jsonify({
        **s,
        "linked_harms": harms_for_station(station_id),
        "available_characteristics": list_characteristics_for_station(station_id),
    })


@station_routes.get("/<station_id>/samples")
def get_station_samples(station_id: str):
    """
    返回指定 station 的样本（可按 characteristic / fraction 过滤）。
    每条 sample 已按 sample_date 升序排列。前端用来画时序折线。
    Query params:
      - characteristic (optional): 严格匹配（如 "Iron"、"pH"）
      - fraction (optional): 严格匹配（如 "Dissolved"；空串也是合法值）
    """
    characteristic = request.args.get("characteristic")
    fraction = request.args.get("fraction")
    rows = get_samples_for_station(
        station_id,
        characteristic=characteristic,
        fraction=fraction,
    )
    return jsonify(rows)


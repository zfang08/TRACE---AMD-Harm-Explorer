"""MonitoringStation 数据加载与查询。"""
import json
import os

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "data", "final")


def load_stations():
    path = os.path.join(DATA_DIR, "monitoring_stations.json")
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def get_station_by_id(station_id: str):
    stations = load_stations()
    for s in stations:
        if s.get("id") == station_id:
            return s
    return None

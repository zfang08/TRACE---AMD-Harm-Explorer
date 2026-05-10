import json
import os

from flask import Blueprint, jsonify


simulation_routes = Blueprint("simulation_routes", __name__, url_prefix="/api/sim")

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "data", "final")


def _read_json(filename: str):
    path = os.path.join(DATA_DIR, filename)
    with open(path, encoding="utf-8") as f:
        return json.load(f)


@simulation_routes.get("/stream-segments")
def get_stream_segments():
    return jsonify(_read_json("stream_segments.geojson"))


@simulation_routes.get("/sources")
def get_pollution_sources():
    return jsonify(_read_json("pollution_sources.json"))


@simulation_routes.get("/config")
def get_simulation_config():
    return jsonify(_read_json("simulation_config.json"))


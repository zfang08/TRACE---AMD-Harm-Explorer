"""Colliery 数据加载与查询。"""
import json
import os

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "data", "final")


def load_collieries():
    path = os.path.join(DATA_DIR, "collieries.json")
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def get_colliery_by_id(colliery_id: str):
    collieries = load_collieries()
    for c in collieries:
        if c.get("id") == colliery_id:
            return c
    return None

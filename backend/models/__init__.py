"""
领域模型（Domain Models）。

这些 dataclass 与 ProjectPlan.md / 类图保持一致，用于在 service 层中以更清晰的对象形式表达数据。
当前后端仍然可以同时接受 dict 与 dataclass，逐步演进。
"""

from .geo_entity import GeoEntity
from .colliery_model import Colliery
from .station_model import MonitoringStation
from .harm_model import AMDHarm
from .stream_segment import StreamSegment
from .samples import WaterQualitySample

__all__ = [
    "GeoEntity",
    "Colliery",
    "MonitoringStation",
    "AMDHarm",
    "StreamSegment",
    "WaterQualitySample",
]


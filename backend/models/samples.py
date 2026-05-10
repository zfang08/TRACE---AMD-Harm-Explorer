from __future__ import annotations

from dataclasses import dataclass


@dataclass
class WaterQualitySample:
  """
  水质样本数据结构。
  """

  sample_id: str
  station_id: str
  timestamp: str  # ISO8601 字符串
  parameter: str
  value: float
  unit: str


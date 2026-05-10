from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from .geo_entity import GeoEntity


@dataclass
class MonitoringStation(GeoEntity):
  """
  监测站数据结构。
  """

  station_code: Optional[str] = None
  agency: Optional[str] = None
  station_type: Optional[str] = None


from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from .geo_entity import GeoEntity


@dataclass
class StreamSegment(GeoEntity):
  """
  河流河段（Reach）数据结构。
  """

  reach_id: Optional[str] = None
  watershed_id: Optional[str] = None
  length_km: Optional[float] = None
  impaired_status: Optional[str] = None
  impairment_cause: Optional[str] = None


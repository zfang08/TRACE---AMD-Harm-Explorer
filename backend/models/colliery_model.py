from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from .geo_entity import GeoEntity


@dataclass
class Colliery(GeoEntity):
  """
  Colliery 数据结构。

  与 ProjectPlan 中的 Colliery/CoalUnit 设计对应，这里只建模 Colliery 本身。
  """

  operator: Optional[str] = None
  status: Optional[str] = None
  production_tons: Optional[float] = None
  opened_year: Optional[int] = None
  closed_year: Optional[int] = None


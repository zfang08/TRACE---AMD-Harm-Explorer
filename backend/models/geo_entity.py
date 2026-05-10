from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


Geometry = Dict[str, Any]


@dataclass
class GeoEntity:
  """
  空间实体抽象基类。

  在当前项目中不会直接实例化，而是被 Colliery / MonitoringStation /
  StreamSegment 等具体类继承。
  """

  id: str
  name: str
  geometry: Optional[Geometry] = None
  source_refs: List[str] = field(default_factory=list)


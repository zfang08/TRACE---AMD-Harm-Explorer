from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Sequence

from .geo_entity import GeoEntity
from .samples import WaterQualitySample


@dataclass
class AMDHarm(GeoEntity):
  """
  AMD Harm 数据结构（对应类图中的 AMDHarm）。
  """

  harm_id: str = ""
  label: Optional[str] = None
  time_window_start: Optional[str] = None  # ISO8601 字符串
  time_window_end: Optional[str] = None
  severity: Optional[str] = None

  source_colliery_ids: List[str] = field(default_factory=list)
  supporting_station_ids: List[str] = field(default_factory=list)
  affected_reach_ids: List[str] = field(default_factory=list)

  key_metrics: Dict[str, Any] = field(default_factory=dict)
  notes: Optional[str] = None

  def summarize(self, samples: Sequence[WaterQualitySample]) -> Dict[str, Any]:
    """
    简单样本汇总（MVP 版本）：
    - 只统计样本数量和按参数的计数，作为 keyMetrics 的默认实现。
    """
    total = len(samples)
    by_param: Dict[str, int] = {}
    for s in samples:
      by_param[s.parameter] = by_param.get(s.parameter, 0) + 1

    self.key_metrics = {
      "sample_count": total,
      "samples_by_parameter": by_param,
    }
    return self.key_metrics

  def to_evidence_packet(self, payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    生成前端消费的 evidence 包装。

    payload 期望包含：
    - collieries: List[dict]
    - stations: List[dict]
    - streams: List[dict]
    - samples: List[dict] （可选）
    """
    packet: Dict[str, Any] = {
      "harm_id": self.harm_id or self.id,
      "label": self.label or self.name,
      "severity": self.severity,
      "time_window": {
        "start": self.time_window_start,
        "end": self.time_window_end,
      },
      "source_collieries": payload.get("collieries", []),
      "stations": payload.get("stations", []),
      "affected_streams": payload.get("streams", []),
    }

    if "samples" in payload:
      packet["samples"] = payload["samples"]

    if self.key_metrics:
      packet["key_metrics"] = self.key_metrics

    if self.notes:
      packet["notes"] = self.notes

    return packet


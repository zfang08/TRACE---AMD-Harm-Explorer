function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(Δφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Build reverse index: segId → [upstream segId, ...]
export function buildUpstreamMap(segmentsById) {
  const map = {};
  for (const id of Object.keys(segmentsById)) {
    const downId = segmentsById[id].downstreamId;
    if (!downId) continue;
    if (!map[downId]) map[downId] = [];
    map[downId].push(id);
  }
  return map;
}

// BFS upstream from startId, stopping when cumulative river length exceeds maxKm.
// Returns array of upstream segment IDs (not including startId itself).
export function traceUpstream(segmentsById, upstreamMap, startId, maxKm) {
  const visited = new Set([startId]);
  const result = [];
  const queue = [{ id: startId, dist: 0 }];

  while (queue.length > 0) {
    const { id, dist } = queue.shift();
    for (const upId of upstreamMap[id] || []) {
      if (visited.has(upId)) continue;
      const seg = segmentsById[upId];
      if (!seg) continue;
      const newDist = dist + (seg.feature?.properties?.length_km || 0);
      if (newDist > maxKm) continue;
      visited.add(upId);
      result.push(upId);
      queue.push({ id: upId, dist: newDist });
    }
  }

  return result;
}

// Find collieries whose territory overlaps the upstream segment set.
// Primary: attach_segment_id match. Fallback: haversine to segment midpoint ≤ bufferKm.
export function findUpstreamCollieries(
  upstreamSegIds,
  segmentsById,
  collieries,
  bufferKm = 2,
) {
  if (!upstreamSegIds.length || !collieries.length) return [];

  const upstreamSet = new Set(upstreamSegIds);

  const midpoints = upstreamSegIds.flatMap((id) => {
    const coords = segmentsById[id]?.coordinates || [];
    if (!coords.length) return [];
    const mid = coords[Math.floor(coords.length / 2)];
    return [{ lat: mid[1], lng: mid[0] }];
  });

  const result = [];
  for (const c of collieries) {
    if (c.latitude == null || c.longitude == null) continue;
    if (c.attach_segment_id && upstreamSet.has(String(c.attach_segment_id))) {
      result.push(c);
      continue;
    }
    if (midpoints.some((mp) => haversineKm(c.latitude, c.longitude, mp.lat, mp.lng) <= bufferKm)) {
      result.push(c);
    }
  }

  return result;
}

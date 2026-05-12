function haversineMeters(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const [lon1, lat1] = a;
  const [lon2, lat2] = b;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLon / 2);
  const q =
    s1 * s1 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * (s2 * s2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(q)));
}

export function buildPolylineFromPath(pathIds, segmentsById) {
  const coords = [];
  const segCoordStartIdx = []; // 每段在 coords[] 中的起始索引

  for (const id of pathIds) {
    const seg = segmentsById[id];
    const segCoords = seg?.coordinates || [];
    if (segCoords.length === 0) {
      segCoordStartIdx.push(Math.max(0, coords.length - 1));
      continue;
    }
    if (coords.length === 0) {
      segCoordStartIdx.push(0);
      coords.push(...segCoords);
    } else {
      // 避免段与段之间重复首点
      const last = coords[coords.length - 1];
      const first = segCoords[0];
      const same =
        Array.isArray(last) &&
        Array.isArray(first) &&
        last[0] === first[0] &&
        last[1] === first[1];
      if (same) {
        segCoordStartIdx.push(coords.length - 1);
        coords.push(...segCoords.slice(1));
      } else {
        segCoordStartIdx.push(coords.length);
        coords.push(...segCoords);
      }
    }
  }

  const segLens = [];
  const cum = [0];
  let total = 0;
  for (let i = 0; i < coords.length - 1; i += 1) {
    const len = haversineMeters(coords[i], coords[i + 1]);
    segLens.push(len);
    total += len;
    cum.push(total);
  }

  // 每段的起始累积距离（供 buildHalfWidthFn 插值用）
  const segmentStartDists = segCoordStartIdx.map(
    (idx) => cum[Math.min(idx, cum.length - 1)] ?? 0,
  );

  return { coords, segLens, cum, totalMeters: total, segmentStartDists };
}

export function pointAtDistance(polyline, distanceMeters) {
  const { coords, segLens, cum, totalMeters } = polyline;
  if (!coords || coords.length === 0) return null;
  if (coords.length === 1) return coords[0];

  const d = Math.max(0, Math.min(distanceMeters, totalMeters));

  // 找到所在的小段 i，使得 cum[i] <= d < cum[i+1]
  let i = 0;
  while (i < cum.length - 1 && cum[i + 1] < d) i += 1;

  const segLen = segLens[i] || 0;
  if (segLen <= 0) return coords[i];

  const t = (d - cum[i]) / segLen;
  const [lon1, lat1] = coords[i];
  const [lon2, lat2] = coords[i + 1];
  return [lon1 + (lon2 - lon1) * t, lat1 + (lat2 - lat1) * t];
}

export function pointAndTangentAtDistance(polyline, distanceMeters) {
  const { coords, segLens, cum, totalMeters } = polyline;
  if (!coords || coords.length === 0) return null;
  if (coords.length === 1) {
    return { point: coords[0], tangent: [1, 0] };
  }

  const d = Math.max(0, Math.min(distanceMeters, totalMeters));

  let i = 0;
  while (i < cum.length - 1 && cum[i + 1] < d) i += 1;

  const segLen = segLens[i] || 0;
  const [lon1, lat1] = coords[i];
  const [lon2, lat2] = coords[i + 1] || coords[i];

  if (segLen <= 0) {
    return { point: coords[i], tangent: [1, 0] };
  }

  const t = (d - cum[i]) / segLen;
  const point = [lon1 + (lon2 - lon1) * t, lat1 + (lat2 - lat1) * t];

  // 近似切线方向（经纬度空间）
  const dx = lon2 - lon1;
  const dy = lat2 - lat1;
  const mag = Math.hypot(dx, dy) || 1;
  const tangent = [dx / mag, dy / mag];

  return { point, tangent };
}


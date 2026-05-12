const API_BASE = "/api";

export async function getCollieries() {
  const res = await fetch(`${API_BASE}/collieries`);
  if (!res.ok) throw new Error("Failed to fetch collieries");
  return res.json();
}

export async function getCollieryById(id) {
  const res = await fetch(`${API_BASE}/collieries/${id}`);
  if (!res.ok) throw new Error("Failed to fetch colliery");
  return res.json();
}

export async function getHarms() {
  const res = await fetch(`${API_BASE}/harms`);
  if (!res.ok) throw new Error("Failed to fetch harms");
  return res.json();
}

export async function getHarmById(id) {
  const res = await fetch(`${API_BASE}/harms/${id}`);
  if (!res.ok) throw new Error("Failed to fetch harm");
  return res.json();
}

export async function getStations() {
  const res = await fetch(`${API_BASE}/stations`);
  if (!res.ok) throw new Error("Failed to fetch stations");
  return res.json();
}

export async function getStationById(id) {
  const res = await fetch(`${API_BASE}/stations/${id}`);
  if (!res.ok) throw new Error("Failed to fetch station");
  return res.json();
}

export async function getStreamSegments() {
  const res = await fetch(`${API_BASE}/sim/stream-segments`);
  if (!res.ok) throw new Error("Failed to fetch stream segments");
  return res.json();
}

export async function getPollutionSources() {
  const res = await fetch(`${API_BASE}/sim/sources`);
  if (!res.ok) throw new Error("Failed to fetch pollution sources");
  return res.json();
}

export async function getSimulationConfig() {
  const res = await fetch(`${API_BASE}/sim/config`);
  if (!res.ok) throw new Error("Failed to fetch simulation config");
  return res.json();
}

export async function getHarmsBySegmentId(segmentId) {
  const res = await fetch(
    `${API_BASE}/harms/by-segment/${encodeURIComponent(segmentId)}`,
  );
  if (!res.ok) throw new Error("Failed to fetch harms by segment");
  return res.json();
}

export async function getRelatedIds(kind, id) {
  const res = await fetch(
    `${API_BASE}/harms/related/${encodeURIComponent(kind)}/${encodeURIComponent(id)}`,
  );
  if (!res.ok) throw new Error("Failed to fetch related ids");
  return res.json();
}

export async function getWqSummary() {
  const res = await fetch(`${API_BASE}/stations/wq-summary`);
  if (!res.ok) throw new Error("Failed to fetch wq summary");
  return res.json();
}

export async function getStationSamples(stationId, opts = {}) {
  const params = new URLSearchParams();
  if (opts.characteristic) params.set("characteristic", opts.characteristic);
  if (opts.fraction != null) params.set("fraction", opts.fraction);
  const qs = params.toString();
  const url =
    `${API_BASE}/stations/${encodeURIComponent(stationId)}/samples` +
    (qs ? `?${qs}` : "");
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch station samples");
  return res.json();
}

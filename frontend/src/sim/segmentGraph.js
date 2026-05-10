export function buildSegmentsById(streamsGeoJSON) {
  const segmentsById = {};

  const features = streamsGeoJSON?.features || [];
  for (const f of features) {
    const props = f?.properties || {};
    const id = props.id;
    if (!id) continue;

    const downstreamId =
      props.downstream_id === undefined ? null : props.downstream_id;
    const coordinates = f?.geometry?.coordinates || [];

    segmentsById[id] = {
      id,
      downstreamId,
      coordinates,
      feature: f,
    };
  }

  return segmentsById;
}

export function buildDownstreamPath({
  startSegmentId,
  segmentsById,
  maxSteps = 200,
}) {
  const path = [];
  const seen = new Set();

  let cur = startSegmentId;
  let steps = 0;

  while (cur && steps < maxSteps) {
    if (seen.has(cur)) break; // 防止意外环
    seen.add(cur);

    const seg = segmentsById[cur];
    if (!seg) break;

    path.push(cur);
    cur = seg.downstreamId;
    steps += 1;
  }

  return path;
}


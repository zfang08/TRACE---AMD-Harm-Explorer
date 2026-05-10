#!/usr/bin/env python3
"""
Scrape AMD discharge points from PASDA's PA DEP MapServer for the
Pennsylvania Anthracite Region.

Source:
    https://mapservices.pasda.psu.edu/server/rest/services/pasda/DEP/MapServer/0
    Layer 0: AML Inventory Points (2026_04)
    Maintained by PA Department of Environmental Protection.

Strategy:
    1. Query the layer with a bounding box covering the four Anthracite
       Coal Fields (Northern, Eastern Middle, Western Middle, Southern).
    2. Filter to features whose problem type indicates Abandoned Mine
       Drainage / discharge.
    3. Page through results (server cap = 1000 per request) using
       resultOffset / resultRecordCount.
    4. Write two outputs:
         - amd_discharges_raw.geojson   (everything as returned)
         - pollution_sources.json       (project-shaped, ready to drop into
                                         the demo's data/ folder)

No third-party packages required — uses only stdlib (urllib + json).

Usage:
    python scrape_amd_discharges.py
    python scrape_amd_discharges.py --no-bbox   # statewide, then post-filter
    python scrape_amd_discharges.py --inspect   # print field codes / types
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

# ----------------------------------------------------------------------------
# Constants
# ----------------------------------------------------------------------------

LAYER_URL = (
    "https://mapservices.pasda.psu.edu/server/rest/services/"
    "pasda/DEP/MapServer/0"
)
QUERY_URL = f"{LAYER_URL}/query"

# Bounding box covering all four Pennsylvania Anthracite Coal Fields.
# Reference: SRBC Anthracite Region Mine Drainage Strategy (2011) Figure 1.
# Counties touched: Lackawanna, Luzerne, Schuylkill, Northumberland,
# Columbia, Carbon, Dauphin, parts of Wayne / Sullivan / Wyoming.
# Coordinates are WGS84 / NAD83 lon-lat (the layer's native SR is 4269).
ANTHRACITE_BBOX = {
    "xmin": -76.85,
    "ymin": 40.50,
    "xmax": -75.20,
    "ymax": 41.65,
}

# Problem-type codes / keywords that indicate Abandoned Mine Drainage.
# The OSMRE AML inventory uses a controlled vocabulary; the most common
# AMD-related sf_type values are listed below. We match case-insensitively
# on substring so we catch variants like "Polluted Water: Mine Drainage".
AMD_TYPE_KEYWORDS = [
    "mine drainage",
    "polluted water",     # legacy OSMRE wording for AMD
    "amd",
    "discharge",
]

PAGE_SIZE = 1000          # server's MaxRecordCount
REQUEST_TIMEOUT = 60       # seconds
RETRY_LIMIT = 3
RETRY_BACKOFF = 2.0       # seconds between retries

# ----------------------------------------------------------------------------
# HTTP helpers
# ----------------------------------------------------------------------------


def _http_get_json(url: str, params: dict) -> dict:
    """GET <url>?<params>, return parsed JSON. Retries on transient errors."""
    full = f"{url}?{urlencode(params)}"
    last_error: Exception | None = None

    for attempt in range(1, RETRY_LIMIT + 1):
        try:
            req = Request(full, headers={"User-Agent": "amd-scraper/1.0"})
            with urlopen(req, timeout=REQUEST_TIMEOUT) as resp:
                payload = resp.read().decode("utf-8")
            return json.loads(payload)
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            if attempt < RETRY_LIMIT:
                wait = RETRY_BACKOFF * attempt
                print(
                    f"  [retry {attempt}/{RETRY_LIMIT}] {exc!r} — sleeping "
                    f"{wait}s",
                    file=sys.stderr,
                )
                time.sleep(wait)

    raise RuntimeError(f"GET failed after {RETRY_LIMIT} attempts: {last_error}")


# ----------------------------------------------------------------------------
# Discovery helpers (run once, mainly for sanity / debugging)
# ----------------------------------------------------------------------------


def fetch_layer_metadata() -> dict:
    """Return the layer's JSON description (fields, extent, max records)."""
    return _http_get_json(LAYER_URL, {"f": "json"})


def fetch_distinct_types() -> list[str]:
    """
    Return the distinct values of sf_type that exist in the layer.

    Useful for verifying which type strings actually represent AMD before
    we hard-code our keyword filter.
    """
    params = {
        "f": "json",
        "where": "1=1",
        "returnGeometry": "false",
        "outFields": "sf_type",
        "returnDistinctValues": "true",
        "orderByFields": "sf_type",
    }
    data = _http_get_json(QUERY_URL, params)
    return [
        row["attributes"].get("sf_type", "")
        for row in data.get("features", [])
        if row.get("attributes", {}).get("sf_type")
    ]


def fetch_feature_count(where: str, bbox: dict | None) -> int:
    """Server-side count for a where clause + optional bbox."""
    params: dict[str, str] = {
        "f": "json",
        "where": where,
        "returnCountOnly": "true",
    }
    if bbox is not None:
        params.update(_bbox_params(bbox))
    data = _http_get_json(QUERY_URL, params)
    return int(data.get("count", 0))


def _bbox_params(bbox: dict) -> dict[str, str]:
    """Build the geometry parameters for a bbox query (in EPSG:4326 lon-lat)."""
    geom = json.dumps(
        {
            "xmin": bbox["xmin"],
            "ymin": bbox["ymin"],
            "xmax": bbox["xmax"],
            "ymax": bbox["ymax"],
            "spatialReference": {"wkid": 4326},
        }
    )
    return {
        "geometry": geom,
        "geometryType": "esriGeometryEnvelope",
        "inSR": "4326",
        "spatialRel": "esriSpatialRelIntersects",
    }


# ----------------------------------------------------------------------------
# Main paged fetch
# ----------------------------------------------------------------------------


def build_where_clause() -> str:
    """
    Build a SQL WHERE clause matching AMD-related problem types.

    We use UPPER(sf_type) LIKE '%KEYWORD%' OR UPPER(sf_probl_1) LIKE ...
    so we catch the type field as well as the problem description.
    """
    clauses = []
    for kw in AMD_TYPE_KEYWORDS:
        kw_upper = kw.upper()
        clauses.append(f"UPPER(sf_type) LIKE '%{kw_upper}%'")
        clauses.append(f"UPPER(sf_probl_1) LIKE '%{kw_upper}%'")
    return "(" + " OR ".join(clauses) + ")"


def fetch_all_features(where: str, bbox: dict | None) -> list[dict]:
    """Page through all features matching the query."""
    total = fetch_feature_count(where, bbox)
    print(f"Server reports {total} matching feature(s).")
    if total == 0:
        return []

    all_features: list[dict] = []
    offset = 0
    page = 0

    while offset < total:
        page += 1
        params: dict[str, str] = {
            "f": "geojson",                # ask for GeoJSON directly
            "where": where,
            "outFields": "*",
            "returnGeometry": "true",
            "outSR": "4326",               # WGS84 lon/lat — what Mapbox wants
            "resultOffset": str(offset),
            "resultRecordCount": str(PAGE_SIZE),
            "orderByFields": "OBJECTID",   # stable ordering for paging
        }
        if bbox is not None:
            params.update(_bbox_params(bbox))

        print(f"  page {page}: offset={offset} ...", end=" ", flush=True)
        data = _http_get_json(QUERY_URL, params)
        feats = data.get("features", [])
        print(f"got {len(feats)}")

        if not feats:
            # Defensive: server cut us off early.
            break

        all_features.extend(feats)
        offset += len(feats)

        # Tiny delay so we are polite to the public service.
        time.sleep(0.25)

    return all_features


# ----------------------------------------------------------------------------
# Output shaping
# ----------------------------------------------------------------------------


def features_to_pollution_sources(features: list[dict]) -> list[dict]:
    """
    Transform raw GeoJSON features into the project's pollution_sources.json
    shape. Each entry has the fields the demo needs:

        id, name, latitude, longitude, emission_rate, intensity, color,
        attach_segment_id (left null — populated later by snap-to-network),
        and a `source` block of provenance.

    `emission_rate` uses flow_gpm (gallons per minute). If flow_gpm is null
    or 0 we fall back to a default so particles still spawn in the demo.
    """
    out: list[dict] = []
    DEFAULT_RATE = 50  # gpm — placeholder when DEP has no flow on file

    for feat in features:
        props = feat.get("properties", {})
        geom = feat.get("geometry", {})
        if geom.get("type") != "Point":
            continue
        lon, lat = geom["coordinates"][:2]

        sf_id = props.get("sf_id")
        sf_name = props.get("sf_name") or f"AML-{sf_id}"
        flow_gpm = props.get("flow_gpm")
        try:
            flow_gpm_num = float(flow_gpm) if flow_gpm not in (None, "") else 0
        except (TypeError, ValueError):
            flow_gpm_num = 0

        emission_rate = flow_gpm_num if flow_gpm_num > 0 else DEFAULT_RATE
        intensity = min(1.0, emission_rate / 1000.0) if flow_gpm_num else 0.3

        out.append(
            {
                "id": f"amd-{sf_id}",
                "name": sf_name,
                "latitude": lat,
                "longitude": lon,
                "attach_segment_id": None,   # filled in later by snap script
                "emission_rate": emission_rate,
                "intensity": round(intensity, 3),
                "color": "#c97a3f",          # iron-oxide orange — Anthracite AMD
                "source": {
                    "dataset": "PA DEP AML Inventory Points",
                    "layer_url": LAYER_URL,
                    "sf_id": sf_id,
                    "sf_type": props.get("sf_type"),
                    "sf_status": props.get("sf_status"),
                    "sf_priority": props.get("sf_prior_1"),
                    "problem": props.get("sf_probl_1"),
                    "flow_gpm_reported": flow_gpm,
                },
            }
        )

    return out


# ----------------------------------------------------------------------------
# Driver
# ----------------------------------------------------------------------------


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--no-bbox",
        action="store_true",
        help=(
            "Skip the Anthracite bounding-box filter and pull every "
            "AMD-coded point statewide. Use this if the bbox seems to be "
            "missing real points along its edge."
        ),
    )
    parser.add_argument(
        "--inspect",
        action="store_true",
        help="Print the layer's distinct sf_type values and exit.",
    )
    parser.add_argument(
        "--outdir",
        default=".",
        help="Directory to write outputs into (default: current dir).",
    )
    args = parser.parse_args()

    outdir = Path(args.outdir).expanduser().resolve()
    outdir.mkdir(parents=True, exist_ok=True)

    if args.inspect:
        print("Distinct sf_type values in layer 0:")
        for t in fetch_distinct_types():
            print(f"  - {t}")
        return 0

    where = build_where_clause()
    bbox = None if args.no_bbox else ANTHRACITE_BBOX

    print("Where clause:")
    print(f"  {where}")
    print(f"BBox filter: {bbox if bbox else '(none — statewide)'}")
    print()

    features = fetch_all_features(where, bbox)
    print(f"\nFetched {len(features)} feature(s) total.")

    # Write raw GeoJSON
    raw_path = outdir / "amd_discharges_raw.geojson"
    fc = {"type": "FeatureCollection", "features": features}
    raw_path.write_text(json.dumps(fc, indent=2))
    print(f"Wrote raw GeoJSON -> {raw_path}")

    # Write project-shaped JSON
    sources = features_to_pollution_sources(features)
    proj_path = outdir / "pollution_sources.json"
    proj_path.write_text(json.dumps(sources, indent=2))
    print(f"Wrote project shape -> {proj_path}  ({len(sources)} sources)")

    # Quick summary so you can sanity-check before importing.
    if sources:
        with_flow = sum(1 for s in sources if s["source"]["flow_gpm_reported"])
        print(
            f"\nSummary: {with_flow}/{len(sources)} discharges have a "
            f"reported flow_gpm value."
        )
        print("Top 5 by reported flow_gpm:")
        ranked = sorted(
            sources,
            key=lambda s: float(s["source"]["flow_gpm_reported"] or 0),
            reverse=True,
        )[:5]
        for s in ranked:
            print(
                f"  {s['source']['flow_gpm_reported']:>8} gpm  "
                f"{s['name']!r}"
            )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

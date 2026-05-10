#!/usr/bin/env python3
"""
Scrape monitoring stations and water-quality samples for the
Pennsylvania Anthracite Region.

We hit two services because they're complementary:

  1) USGS NWIS Site Service     — finds gauges/stations by bbox, returns
     metadata + period-of-record. RDB (tab-separated) format.
       https://waterservices.usgs.gov/nwis/site/

  2) Water Quality Portal       — the canonical aggregator for discrete
     water-chemistry samples (USGS + EPA STORET + state agencies like
     PA DEP). CSV format.
       https://www.waterqualitydata.us/

Why both: NWIS gives us the well-known continuous gauges (Lackawanna at
Old Forge etc.), but the AMD-relevant chemistry — Fe, Mn, Al, SO4,
acidity — mostly lives in WQP because it's submitted by PA DEP, EPCAMR,
SRBC and watershed groups, not USGS. Together they cover both the
continuous-monitoring sites and the discrete grab-sample sites.

The script writes four files into --outdir:
  - nwis_sites_raw.tsv            verbatim NWIS output
  - wqp_stations_raw.csv          verbatim WQP station list
  - monitoring_stations.json      project schema (deduped, joined)
  - water_quality_samples.json    project schema (one entry per sample)

No third-party packages — only stdlib (urllib + csv + json).
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import sys
import time
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

# ----------------------------------------------------------------------------
# Constants
# ----------------------------------------------------------------------------

NWIS_SITE_URL = "https://waterservices.usgs.gov/nwis/site/"
WQP_STATION_URL = "https://www.waterqualitydata.us/data/Station/search"
WQP_RESULT_URL = "https://www.waterqualitydata.us/data/Result/search"

# Anthracite Region bbox (WGS84 / NAD83 lon-lat).
# Same box as the AMD-discharge scraper so the data layers line up.
# NWIS bBox argument is: west, south, east, north (in that order).
ANTHRACITE_BBOX = {
    "west": -76.85,
    "south": 40.50,
    "east": -75.20,
    "north": 41.65,
}

# AMD-relevant characteristics. WQP uses human-readable names rather than
# USGS pCodes. These names are the canonical ones in the WQP characteristic
# vocabulary, so they catch results uploaded by USGS, PA DEP, and EPCAMR
# alike. Keep this list focused — every name added means one more HTTP
# request per station batch.
AMD_CHARACTERISTICS = [
    "pH",
    "Specific conductance",
    "Acidity",
    "Alkalinity",
    "Iron",
    "Manganese",
    "Aluminum",
    "Sulfate",
    "Dissolved oxygen (DO)",
    "Temperature, water",
]

# WQP Result service caps requests at 2 `characteristicName` parameters
# (anything ≥3 returns 400 Bad Request — empirical, undocumented), and
# rejects URLs over ~8KB with 414. So we chunk on BOTH axes: many site
# IDs per request, but at most 2 characteristics. Total requests ≈
# ceil(stations/RESULT_BATCH_SIZE) × ceil(chars/RESULT_CHAR_BATCH_SIZE).
RESULT_BATCH_SIZE = 200       # site IDs per Result request
RESULT_CHAR_BATCH_SIZE = 2    # characteristic names per Result request
PAGE_DELAY_SEC = 0.5          # politeness delay between requests
REQUEST_TIMEOUT = 120         # seconds — WQP can be slow on first hit
RETRY_LIMIT = 3
RETRY_BACKOFF = 3.0

# How far back to pull samples by default. AMD characteristics change
# slowly so a 10-year window gives a good signal without exploding size.
DEFAULT_START_DATE = "2015-01-01"


# ----------------------------------------------------------------------------
# HTTP helper
# ----------------------------------------------------------------------------


def _http_get(url: str, params: dict, accept: str = "*/*") -> str:
    """GET <url>?<params> and return the body as text. Retries on errors."""
    full = f"{url}?{urlencode(params, doseq=True)}"
    last_error: Exception | None = None

    for attempt in range(1, RETRY_LIMIT + 1):
        try:
            req = Request(
                full,
                headers={
                    "User-Agent": "anthracite-amd-scraper/1.0",
                    "Accept": accept,
                    "Accept-Encoding": "gzip, deflate",
                },
            )
            with urlopen(req, timeout=REQUEST_TIMEOUT) as resp:
                raw = resp.read()
                # Handle gzip ourselves since we asked for it.
                if resp.headers.get("Content-Encoding") == "gzip":
                    import gzip
                    raw = gzip.decompress(raw)
            return raw.decode("utf-8", errors="replace")
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
# NWIS — find USGS sites in the bbox
# ----------------------------------------------------------------------------


def fetch_nwis_sites(bbox: dict) -> tuple[str, list[dict]]:
    """
    Hit the NWIS Site Service, return (raw_rdb_text, parsed_rows).

    We ask only for surface-water stream stations (siteType=ST) since
    AMD impacts are surface-water phenomena. Drop siteType to widen the
    net to springs / wells if needed.
    """
    params = {
        "format": "rdb",
        "bBox": (
            f"{bbox['west']},{bbox['south']},"
            f"{bbox['east']},{bbox['north']}"
        ),
        "siteType": "ST",       # streams; ST-CA/DCH/TS auto-included
        "siteOutput": "expanded",
        "siteStatus": "all",
    }
    print("Fetching NWIS sites for bbox ...")
    raw = _http_get(NWIS_SITE_URL, params)
    rows = _parse_rdb(raw)
    print(f"  NWIS returned {len(rows)} site(s).")
    return raw, rows


def _parse_rdb(text: str) -> list[dict]:
    """
    Parse USGS RDB (tab-delimited with comment lines starting #).

    Returns a list of dicts keyed by column name. The second non-comment
    line is a column-format spec like "5s 15s 50s ..." which we skip.
    """
    lines = [ln for ln in text.splitlines() if not ln.startswith("#")]
    if len(lines) < 2:
        return []
    header = lines[0].split("\t")
    # lines[1] is the format spec — skip it.
    out: list[dict] = []
    for ln in lines[2:]:
        if not ln.strip():
            continue
        cells = ln.split("\t")
        # Pad short rows (the format-spec line had 11 cols, data may differ)
        if len(cells) < len(header):
            cells = cells + [""] * (len(header) - len(cells))
        out.append(dict(zip(header, cells)))
    return out


# ----------------------------------------------------------------------------
# Water Quality Portal — stations
# ----------------------------------------------------------------------------


def fetch_wqp_stations(bbox: dict, start_date: str) -> tuple[str, list[dict]]:
    """
    Pull every WQP station inside the bbox that has data on or after
    `start_date`. WQP's bBox is west,south,east,north (same as NWIS).
    """
    params = {
        "bBox": (
            f"{bbox['west']},{bbox['south']},"
            f"{bbox['east']},{bbox['north']}"
        ),
        "startDateLo": _to_wqp_date(start_date),
        "mimeType": "csv",
        "zip": "no",
        # Pull from all three providers so we get USGS, EPA STORET legacy,
        # and STEWARDS (USDA-ARS, less relevant here but cheap to include).
        "providers": ["NWIS", "STORET", "STEWARDS"],
    }
    print("Fetching WQP stations for bbox ...")
    raw = _http_get(WQP_STATION_URL, params, accept="text/csv")
    rows = list(csv.DictReader(io.StringIO(raw)))
    print(f"  WQP returned {len(rows)} station(s).")
    return raw, rows


def _to_wqp_date(iso: str) -> str:
    """WQP wants MM-DD-YYYY, our default is ISO. Convert."""
    y, m, d = iso.split("-")
    return f"{m}-{d}-{y}"


# ----------------------------------------------------------------------------
# Water Quality Portal — sample results
# ----------------------------------------------------------------------------


def fetch_wqp_results(
    site_ids: list[str],
    characteristics: list[str],
    start_date: str,
) -> list[dict]:
    """
    Pull AMD-relevant sample results for the given site IDs, batched.

    site_ids must be in WQP form: "AGENCY-STATION", e.g. "USGS-01536500"
    or "21PA_WQX-WQN0123". The Station service hands those back in the
    `MonitoringLocationIdentifier` column.
    """
    all_rows: list[dict] = []
    site_batches = (len(site_ids) + RESULT_BATCH_SIZE - 1) // RESULT_BATCH_SIZE
    char_batches = (
        len(characteristics) + RESULT_CHAR_BATCH_SIZE - 1
    ) // RESULT_CHAR_BATCH_SIZE
    total_batches = site_batches * char_batches
    batch_n = 0

    for site_idx in range(site_batches):
        site_chunk = site_ids[
            site_idx * RESULT_BATCH_SIZE : (site_idx + 1) * RESULT_BATCH_SIZE
        ]
        for char_idx in range(char_batches):
            char_chunk = characteristics[
                char_idx * RESULT_CHAR_BATCH_SIZE : (char_idx + 1)
                * RESULT_CHAR_BATCH_SIZE
            ]
            batch_n += 1
            params = {
                "siteid": site_chunk,           # urlencode(doseq=True) handles list
                "characteristicName": char_chunk,
                "startDateLo": _to_wqp_date(start_date),
                "mimeType": "csv",
                "zip": "no",
            }
            print(
                f"  Result batch {batch_n}/{total_batches} "
                f"({len(site_chunk)} site(s) x {len(char_chunk)} char(s): "
                f"{', '.join(char_chunk)}) ...",
                end=" ",
                flush=True,
            )
            try:
                raw = _http_get(WQP_RESULT_URL, params, accept="text/csv")
            except Exception as exc:  # noqa: BLE001
                print(f"FAILED ({exc!r}) -- skipping batch")
                continue

            rows = list(csv.DictReader(io.StringIO(raw)))
            print(f"got {len(rows)} row(s)")
            all_rows.extend(rows)

            time.sleep(PAGE_DELAY_SEC)

    return all_rows


# ----------------------------------------------------------------------------
# Output shaping
# ----------------------------------------------------------------------------


def _safe_float(s: str | None) -> float | None:
    if s is None or s == "":
        return None
    try:
        return float(s)
    except ValueError:
        return None


def build_monitoring_stations(
    nwis_rows: list[dict],
    wqp_rows: list[dict],
) -> list[dict]:
    """
    Merge NWIS sites and WQP stations into a single deduped list shaped
    for the project's monitoring_stations.json.

    Dedup key: WQP MonitoringLocationIdentifier (e.g., "USGS-01536500").
    Every NWIS USGS site appears under that same ID in WQP, so a NWIS
    row maps to "USGS-{site_no}". When both sources have the same site,
    we prefer WQP for the canonical ID and merge in any NWIS extras.
    """
    by_id: dict[str, dict] = {}

    # Seed with WQP stations (these are richer and use the canonical id).
    for r in wqp_rows:
        sid = r.get("MonitoringLocationIdentifier", "").strip()
        if not sid:
            continue
        lat = _safe_float(r.get("LatitudeMeasure"))
        lon = _safe_float(r.get("LongitudeMeasure"))
        if lat is None or lon is None:
            continue
        by_id[sid] = {
            "id": sid,
            "name": r.get("MonitoringLocationName", "").strip(),
            "latitude": lat,
            "longitude": lon,
            "type": r.get("MonitoringLocationTypeName", "").strip(),
            "agency": r.get("OrganizationFormalName", "").strip(),
            "huc": r.get("HUCEightDigitCode", "").strip(),
            "attach_segment_id": None,   # populated later by snap step
            "sources": ["WQP"],
        }

    # Add NWIS-only sites (those that didn't appear in WQP for whatever
    # reason — usually because they have no discrete-sample data).
    for r in nwis_rows:
        site_no = r.get("site_no", "").strip()
        if not site_no:
            continue
        sid = f"USGS-{site_no}"
        lat = _safe_float(r.get("dec_lat_va"))
        lon = _safe_float(r.get("dec_long_va"))
        if lat is None or lon is None:
            continue
        if sid in by_id:
            by_id[sid]["sources"].append("NWIS")
            # Stash extras NWIS gives us that WQP doesn't.
            by_id[sid]["drainage_area_sq_mi"] = _safe_float(
                r.get("drain_area_va")
            )
            by_id[sid]["altitude_ft"] = _safe_float(r.get("alt_va"))
        else:
            by_id[sid] = {
                "id": sid,
                "name": r.get("station_nm", "").strip(),
                "latitude": lat,
                "longitude": lon,
                "type": r.get("site_tp_cd", "").strip(),
                "agency": r.get("agency_cd", "").strip(),
                "huc": r.get("huc_cd", "").strip(),
                "attach_segment_id": None,
                "drainage_area_sq_mi": _safe_float(r.get("drain_area_va")),
                "altitude_ft": _safe_float(r.get("alt_va")),
                "sources": ["NWIS"],
            }

    return sorted(by_id.values(), key=lambda s: s["id"])


def build_water_quality_samples(wqp_results: list[dict]) -> list[dict]:
    """
    Reshape raw WQP Result rows into the project's sample schema.

    Each WQP row is one measurement (one characteristic at one
    site at one timestamp). We keep them flat — the demo can group
    them by station id when rendering.
    """
    out: list[dict] = []
    for r in wqp_results:
        sid = r.get("MonitoringLocationIdentifier", "").strip()
        char = r.get("CharacteristicName", "").strip()
        value = _safe_float(r.get("ResultMeasureValue"))
        if not sid or not char:
            continue
        out.append(
            {
                "station_id": sid,
                "characteristic": char,
                "value": value,
                "value_raw": r.get("ResultMeasureValue", ""),
                "unit": r.get("ResultMeasure/MeasureUnitCode", "").strip(),
                "sample_date": r.get("ActivityStartDate", "").strip(),
                "sample_time": r.get(
                    "ActivityStartTime/Time", ""
                ).strip(),
                "fraction": r.get("ResultSampleFractionText", "").strip(),
                "method": r.get("ResultAnalyticalMethod/MethodName", "").strip(),
                "agency": r.get("OrganizationFormalName", "").strip(),
                "activity_id": r.get("ActivityIdentifier", "").strip(),
            }
        )
    return out


# ----------------------------------------------------------------------------
# Driver
# ----------------------------------------------------------------------------


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--outdir",
        default=".",
        help="Directory to write outputs into (default: current dir).",
    )
    parser.add_argument(
        "--start-date",
        default=DEFAULT_START_DATE,
        help=(
            f"Earliest sample date to retrieve, ISO format YYYY-MM-DD "
            f"(default: {DEFAULT_START_DATE})."
        ),
    )
    parser.add_argument(
        "--stations-only",
        action="store_true",
        help=(
            "Only fetch the station inventory; skip the (slow) Result "
            "download. Use this first to see what's out there."
        ),
    )
    parser.add_argument(
        "--max-stations",
        type=int,
        default=None,
        help=(
            "Cap the number of WQP stations sent to the Result service. "
            "Useful for a quick sanity-check run."
        ),
    )
    args = parser.parse_args()

    outdir = Path(args.outdir).expanduser().resolve()
    outdir.mkdir(parents=True, exist_ok=True)

    print(
        f"Bounding box (W,S,E,N): "
        f"{ANTHRACITE_BBOX['west']}, {ANTHRACITE_BBOX['south']}, "
        f"{ANTHRACITE_BBOX['east']}, {ANTHRACITE_BBOX['north']}"
    )
    print(f"Sample window: {args.start_date} → present\n")

    # --- Step 1: NWIS site list -------------------------------------------
    nwis_raw, nwis_rows = fetch_nwis_sites(ANTHRACITE_BBOX)
    (outdir / "nwis_sites_raw.tsv").write_text(nwis_raw)

    # --- Step 2: WQP station list ----------------------------------------
    wqp_raw, wqp_rows = fetch_wqp_stations(ANTHRACITE_BBOX, args.start_date)
    (outdir / "wqp_stations_raw.csv").write_text(wqp_raw)

    # --- Step 3: merge into project schema -------------------------------
    stations = build_monitoring_stations(nwis_rows, wqp_rows)
    (outdir / "monitoring_stations.json").write_text(
        json.dumps(stations, indent=2)
    )
    print(
        f"\nWrote monitoring_stations.json — {len(stations)} unique "
        f"station(s)."
    )

    if args.stations_only:
        print("\n--stations-only set; skipping sample download.")
        return 0

    # --- Step 4: sample results ------------------------------------------
    site_ids = [s["id"] for s in stations]
    if args.max_stations is not None:
        site_ids = site_ids[: args.max_stations]
        print(f"\nLimiting Result query to first {len(site_ids)} station(s).")

    print(
        f"\nFetching WQP samples for {len(site_ids)} station(s) "
        f"× {len(AMD_CHARACTERISTICS)} characteristic(s) ..."
    )
    results = fetch_wqp_results(site_ids, AMD_CHARACTERISTICS, args.start_date)
    print(f"  Total result rows: {len(results)}")

    samples = build_water_quality_samples(results)
    (outdir / "water_quality_samples.json").write_text(
        json.dumps(samples, indent=2)
    )
    print(f"\nWrote water_quality_samples.json — {len(samples)} sample(s).")

    # Quick summary
    if samples:
        from collections import Counter
        char_counts = Counter(s["characteristic"] for s in samples)
        print("\nSamples per characteristic:")
        for char, n in char_counts.most_common():
            print(f"  {n:>6}  {char}")

        station_counts = Counter(s["station_id"] for s in samples)
        print(f"\n{len(station_counts)} unique station(s) have sample data.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

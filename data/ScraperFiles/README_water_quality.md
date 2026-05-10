# Water Quality Scraper — Pennsylvania Anthracite Region

Pulls **monitoring stations** and **AMD-relevant water-chemistry samples**
from two US federal water APIs and emits two files matching the demo's
data schema, plus the raw responses for auditing.

## Two sources, on purpose

| Source | What it gives us |
| --- | --- |
| **USGS NWIS Site Service** | Surface-water gauges (continuous monitoring): site ID, station name, lat/lon, drainage area, altitude, HUC. Used to find the well-known stations like Lackawanna River at Old Forge. |
| **Water Quality Portal (WQP)** | Discrete water-chemistry samples (pH, Fe, Mn, Al, SO4, acidity, etc.) submitted by USGS, EPA STORET, **PA DEP**, **EPCAMR**, and watershed groups. This is where AMD chemistry actually lives. |

**Why both**: NWIS knows about the gauges, but as of February 2024 the
NWIS Site Service stopped returning new water-quality sample data. WQP
is now the canonical home for discrete chemistry. We pull the station
inventory from both and merge on station ID.

## Outputs

| File | Purpose |
| --- | --- |
| `nwis_sites_raw.tsv` | Verbatim NWIS RDB response (audit trail) |
| `wqp_stations_raw.csv` | Verbatim WQP station list (audit trail) |
| `monitoring_stations.json` | Deduped/merged stations, project schema |
| `water_quality_samples.json` | Flat list of samples, project schema |

## Quick start

```bash
# Pure stdlib — no pip install needed
python scrape_water_quality.py

# Just see the station inventory first (fast)
python scrape_water_quality.py --stations-only

# Pull longer history
python scrape_water_quality.py --start-date 2000-01-01

# Quick sanity-check run with only 10 stations' samples
python scrape_water_quality.py --max-stations 10
```

## Recommended first run

```bash
python scrape_water_quality.py --stations-only --outdir ./data
```

This finishes in ~5 seconds and tells you how many stations exist in
the bbox. Then look at `monitoring_stations.json` — if the count looks
right, kick off the full run (which can take a few minutes because
the WQP Result service is slow on big queries).

## What characteristics get pulled

Defined at the top of the script as `AMD_CHARACTERISTICS`:

- pH
- Specific conductance
- Acidity
- Alkalinity
- Iron
- Manganese
- Aluminum
- Sulfate
- Dissolved oxygen (DO)
- Temperature, water

These are the standard AMD-impact suite. Edit the list to add nitrogen,
metals like zinc/copper, etc. The strings are WQP characteristic names —
case- and punctuation-sensitive. The full vocabulary is at
<https://www.waterqualitydata.us/Codes/characteristicname>.

## Output schemas

### `monitoring_stations.json`

```json
{
  "id": "USGS-01536500",
  "name": "LACKAWANNA RIVER AT OLD FORGE, PA",
  "latitude": 41.4778,
  "longitude": -75.7341,
  "type": "Stream",
  "agency": "U.S. Geological Survey-WI",
  "huc": "02050107",
  "attach_segment_id": null,
  "drainage_area_sq_mi": 332.0,
  "altitude_ft": 528.0,
  "sources": ["WQP", "NWIS"]
}
```

### `water_quality_samples.json`

```json
{
  "station_id": "USGS-01536500",
  "characteristic": "Iron",
  "value": 2.34,
  "value_raw": "2.34",
  "unit": "mg/l",
  "sample_date": "2023-06-14",
  "sample_time": "10:30:00",
  "fraction": "Dissolved",
  "method": "ICP-MS",
  "agency": "USGS Pennsylvania Water Science Center",
  "activity_id": "nwispa.0123.4567"
}
```

Each row is one measurement. Group by `station_id` in your service
layer when building the evidence packets.

## Notes & caveats

- **Bbox limit**: NWIS rejects bboxes whose lon × lat product exceeds
  25 sq deg. The Anthracite box is ~1.9 sq deg, well under.
- **WQP date format**: WQP wants `MM-DD-YYYY` while NWIS uses
  `YYYY-MM-DD`. The script handles the conversion internally — pass
  ISO format on the command line.
- **Provisional data**: Recent USGS samples may not have received
  Director's approval yet. The `value_raw` field preserves the original
  string so you can spot censored values like "<0.005" that don't
  parse to a float.
- **Result service speed**: WQP Result responses for a busy bbox can
  take 30+ seconds for a single batch. The script uses `--max-stations`
  to make a quick test possible.
- **Station ID format**: WQP IDs are `AGENCY-NUMBER` (e.g.
  `USGS-01536500`, `21PA_WQX-WQN0123`). Use these as-is — they're the
  stable joins across the two services.

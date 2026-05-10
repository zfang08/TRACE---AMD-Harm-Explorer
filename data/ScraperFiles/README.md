# AMD Discharge Scraper — Pennsylvania Anthracite Region

Pulls AMD (Abandoned Mine Drainage) discharge points from PA DEP's
public ArcGIS REST service and emits two files:

- `amd_discharges_raw.geojson` — verbatim features (use in QGIS/ArcGIS)
- `pollution_sources.json` — reshaped for the demo's `data/` folder

## Source

| Item | Value |
| --- | --- |
| Service | `mapservices.pasda.psu.edu` (PASDA — Penn State / PA DEP) |
| MapServer | `pasda/DEP/MapServer` |
| Layer | `0 — AML Inventory Points 2026_04` |
| License | Public domain (PA DEP, OSMRE AML Inventory) |
| Spatial reference (native) | EPSG:4269 (NAD83) — we request EPSG:4326 for output |
| Page size cap | 1000 features per query (handled by the script) |

## Quick start

```bash
# No dependencies — pure stdlib
python scrape_amd_discharges.py
```

Outputs land in the current directory. Pass `--outdir ../data` to drop
them straight into the demo project.

## Useful flags

```bash
# See what problem-type strings actually exist in the layer.
# Run this once before trusting the keyword filter.
python scrape_amd_discharges.py --inspect

# Pull everything statewide (no Anthracite bbox).
# Use this if the bbox seems to clip real Anthracite points along the edge.
python scrape_amd_discharges.py --no-bbox
```

## Anthracite bounding box

The script clips to the four Anthracite Coal Fields:

```
xmin = -76.85   ymin = 40.50   xmax = -75.20   ymax = 41.65
```

Counties touched: Lackawanna, Luzerne, Schuylkill, Northumberland,
Columbia, Carbon, Dauphin, plus slivers of Wayne / Sullivan / Wyoming.
This is wider than the coal field outlines themselves so we don't lose
points near the boundary; if you need the precise field polygons, clip
the output in QGIS using EPCAMR's coal-field shapefile.

## What "AMD" means in this layer

OSMRE's AML inventory uses a controlled-vocabulary `sf_type`. We match
case-insensitively on these substrings in either `sf_type` or
`sf_probl_1`:

- `mine drainage`
- `polluted water`  (legacy OSMRE wording for AMD)
- `amd`
- `discharge`

Run `--inspect` first to confirm — if PA DEP added a new code, just edit
`AMD_TYPE_KEYWORDS` at the top of the script.

## Output shape — `pollution_sources.json`

```json
{
  "id": "amd-12345",
  "name": "Otto Discharge",
  "latitude": 40.6712,
  "longitude": -76.2918,
  "attach_segment_id": null,
  "emission_rate": 1100,
  "intensity": 1.0,
  "color": "#c97a3f",
  "source": {
    "dataset": "PA DEP AML Inventory Points",
    "layer_url": "https://mapservices.pasda.psu.edu/.../MapServer/0",
    "sf_id": 12345,
    "sf_type": "Polluted Water: Mine Drainage",
    "sf_status": "Unreclaimed",
    "sf_priority": "Priority 2",
    "problem": "...",
    "flow_gpm_reported": 1100
  }
}
```

`attach_segment_id` is intentionally null — that field is populated by a
later snap-to-network step against your stream segments GeoJSON.

## Notes on data quality

- `flow_gpm` is missing for many entries; the script falls back to a
  default of 50 gpm so the visualization still spawns particles. The
  reported value is preserved under `source.flow_gpm_reported` so you
  can tell real data from defaults.
- This layer is the **OSMRE AML inventory**. It does NOT include all
  active or recently-permitted discharges — those live in PA DEP's
  Coal Mining Operations layer (Layer 6 of the same MapServer) under
  the "Discharge Point" sub-facility type. If you want both, run the
  scraper twice with the two layer URLs and merge.
- Coordinates are returned in WGS84 lon/lat (EPSG:4326), suitable for
  Mapbox GL directly.

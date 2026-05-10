# TRACE — AMD Harm Atlas

An interactive atlas for **acid mine drainage (AMD)** in the Pennsylvania
Anthracite Region. TRACE traces the full causal chain of post-mining water
pollution:

```
   Coal mining operations  ─►  AMD discharge points  ─►  Stream segments  ─►  Monitoring evidence
        (collieries)              (pollution sources)        (NHD reaches)        (chemistry samples)
```

It joins five public datasets — PA DEP coal mine permits, PA DEP AML inventory,
USGS NHD high-resolution flowlines, USGS NWIS gauging sites, EPA Water Quality
Portal samples — into 538 *harm objects*, each a self-contained "evidence
packet" describing one AMD discharge, the mines that feed it, the river chain
it pollutes, and the monitoring stations that document the impact. A small
particle simulation visualizes the advection-diffusion of pollution along
each downstream chain.

The audience is investigators, regulators, journalists, and students who want
a one-screen, drill-down view of where the worst AMD pollution is — not a
hydrology research tool.

---

## Table of contents

1. [What you can do](#what-you-can-do) — a tour of the user flow
2. [Quick start](#quick-start) — install and run
3. [Architecture overview](#architecture-overview)
4. [Data pipeline](#data-pipeline)
5. [Backend reference](#backend-reference)
6. [Frontend reference](#frontend-reference)
7. [Particle simulation physics](#particle-simulation-physics)
8. [Data file formats](#data-file-formats)
9. [Scripts reference](#scripts-reference)
10. [Project conventions](#project-conventions)
11. [Roadmap and known limits](#roadmap-and-known-limits)
12. [Data sources and credits](#data-sources-and-credits)

---

## What you can do

The user flow is intentionally short. Three screens, four kinds of map markers,
two side panels.

### 1. Splash

When the page loads, an orbiting tilted view of the anthracite region appears
under a frosted-glass overlay. The title `TRACE` is centered with a subtitle
and a single **Enter the map** button. The map below is already rendering
your data as it orbits — collieries, monitoring stations, AMD discharge
markers, and the river network. This screen exists to create a sense of
"where am I" before throwing the full UI at you.

### 2. Browse

After clicking Enter, the camera eases into a 45° tilt and the two floating
panels slide in:

- **Top-left — TRACE panel.** Search, two intensity-visualization toggles
  (Colliery pollution / AMD discharge), and two ranked Top-8 lists
  (collieries and AMD harms, both sorted by severity-weighted score). This
  is the "where do I start" panel.
- **Top-right — Layers panel.** Independent toggles for the four map marker
  classes (collieries / stations / AMD discharges / streams), a 2D / 3D
  camera switch, and the legend (shape and color for each marker type).

In browse mode the four map layers are all visible. Hovering any marker
pops a small tooltip with key facts. Clicking enters analysis mode.

The intensity heatmaps and the 3D extrusion columns ("pollution terrain")
are independent of marker visibility — they're driven by the two toggles
in the TRACE panel and stay coherent across 2D and 3D modes.

### 3. Analyze

Clicking any marker enters analysis. The selected entity is highlighted and
zoomed-in to; the related entities (those sharing a harm with the focus)
keep their normal color while everything else dims to 15%. The TRACE panel
swaps the welcome content for an entity-specific detail panel:

| You clicked | Panel shown | What it tells you |
| --- | --- | --- |
| **Colliery** (square icon) | `CollieryPanel` | Operator, status, list of linked AMD harms (severity-pilled) |
| **Station** (diamond icon) | `StationPanel` | Type, agency, HUC8, drainage, time-series sparkline of one chemistry parameter, list of linked harms |
| **AMD discharge** (droplet icon) | `PollutionSourcePanel` | Severity, PA DEP priority, reported flow, downstream impact summary, link to full harm |
| **Stream segment** (blue line) | `SegmentPanel` | Length, HUC8, list of harms whose downstream chain passes through |

From any of these, clicking a linked harm jumps into the most detailed view:
**`HarmPanel`**. This is the heart of the app. It shows:

- A severity badge and one-line summary ("Impacts 20.2 km across 36 reaches · 5 gpm")
- A **Simulate transport** button + an explainer of what the animation models
- **Monitoring evidence** — per-station chemistry cards (pH / Fe / Mn / Acidity)
  with thresholds tagged as ⚠ when over the red line; top 3 by sample count,
  expandable
- **Source collieries** — collapsed list, expandable, sorted by distance
- A footer with the sample window, PA DEP priority, and source attribution

Clicking the simulate button starts a particle animation along the harm's
20 km downstream chain — the visualization of the advection-diffusion
model described below.

You can navigate freely between entities by clicking inside any panel: any
station / colliery name in HarmPanel jumps focus to it. Click the empty
map or the `✕ Exit analysis` pill in the TRACE panel to return to browse.

---

## Quick start

You need Python 3, Node 18+, and a Mapbox access token. The dev setup is
two terminals.

### One-time setup

```bash
# from the repo root
python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # macOS / Linux
pip install -r requirements.txt

cd frontend
npm install
echo "VITE_MAPBOX_TOKEN=pk.your_token_here" > .env
```

### Run

```bash
# Terminal 1 — backend (Flask, port 5000)
.venv\Scripts\activate
cd backend
python app.py

# Terminal 2 — frontend (Vite, port 3000)
cd frontend
npm run dev
```

Open <http://localhost:3000>. Vite proxies `/api/*` to `http://127.0.0.1:5000`
so you don't need CORS in dev.

If you don't see your data on the map after entering, hard-reload the tab
(`Ctrl+Shift+R`) to drop any HMR / favicon caches.

### Build for production

```bash
cd frontend
npm run build       # outputs to frontend/dist
```

There is no test suite or linter — Vite build + manual smoke check is the
verification path.

---

## Architecture overview

```
┌───────────────────────────────────────────────────────────────────────────┐
│ Browser (Vite dev server :3000)                                           │
│                                                                           │
│   ┌──────────────────────────────────────────────────────────────────┐    │
│   │ App.jsx — global state                                            │    │
│   │   • analysisFocus = { kind, id }                                  │    │
│   │   • selectedHarmId  (drill-down)                                  │    │
│   │   • visibleLayers, vizColliery, vizAmd, is3D, simulating          │    │
│   │   • prefetched: collieries, stations, harms (full)                │    │
│   │   • derived (useMemo): scoredCollieries, topCollieries,           │    │
│   │                         topHarms, scoredAmdSources                │    │
│   └──────────────────────────────────────────────────────────────────┘    │
│       │                                          │                         │
│       ▼                                          ▼                         │
│   ┌─────────────┐                          ┌─────────────────────┐         │
│   │ MapView.jsx │  ──── Mapbox GL JS ────► │ Layer panel  + Sidebar│         │
│   │             │                          │                     │         │
│   │ runs:       │                          │ panels:             │         │
│   │  · 4 marker │                          │  · Top-K, search    │         │
│   │  · streams  │                          │  · Harm / Colliery  │         │
│   │  · heatmaps │                          │  · Station / Source │         │
│   │  · 3D cols  │                          │  · Segment          │         │
│   │  · particle │                          │                     │         │
│   │    RAF loop │                          │                     │         │
│   └─────────────┘                          └─────────────────────┘         │
│            │                                                               │
│            │  fetch /api/*                                                 │
│            ▼                                                               │
└────────────┼───────────────────────────────────────────────────────────────┘
             │
┌────────────▼───────────────────────────────────────────────────────────────┐
│ Flask (port 5000)                                                          │
│                                                                            │
│  routes/                            services/                              │
│   ├ harm_routes        ──► harm_service       ─┐                           │
│   ├ colliery_routes    ──► colliery_service    │  read JSON                │
│   ├ station_routes     ──► station_service     ├─ from data/final/         │
│   │                        sample_service      │  on every request         │
│   └ simulation_routes  ──► (no service)       ─┘                           │
│                                                                            │
│  No database. No simulation on the backend. Pure JSON read-through.        │
└────────────────────────────────────────────────────────────────────────────┘
                              ▲
                              │  (offline pipeline; never runs at request time)
              ┌───────────────┴────────────────┐
              │ data/ScraperFiles/             │
              │   scrape_amd_discharges.py     │
              │   scrape_water_quality.py      │
              │   scrape_acidity_alkalinity.py │
              │   finalize_data.py             │
              │   snap_to_segments.py          │
              │   build_harms.py               │
              └────────────────────────────────┘
                              │
                              ▼
              data/final/  ◄── what the backend serves
                  ├ collieries.json
                  ├ pollution_sources.json
                  ├ monitoring_stations.json
                  ├ water_quality_samples.json
                  ├ stream_segments.geojson
                  ├ harms.json   (derived)
                  └ simulation_config.json
```

Three deliberate constraints shape the architecture:

1. **No database.** Every endpoint reads JSON from `data/final/` on each
   request. With ~3 MB of harms and 28 MB of samples, this is cheap and
   removes an entire layer of operational complexity.
2. **No backend simulation.** The advection-diffusion particle model runs
   entirely in the browser via `requestAnimationFrame`. Backend ships data;
   frontend animates it.
3. **Offline data pipeline.** Scraping, cleaning, snapping, and harm
   synthesis happen as a one-shot pipeline producing `data/final/`. The
   running app never re-fetches from PA DEP / USGS / EPA.

---

## Data pipeline

The pipeline transforms five live web services into one folder of denormalized
JSON. Run order matters; each script is idempotent and re-runnable.

```
External APIs                    Raw                              Cleaned                    Production
─────────────                    ───                              ───────                    ──────────

PA DEP / PASDA                   amd_discharges_raw.geojson  ──►  pollution_sources.json
  AML Inventory          ┐                                                                          │
                         │ scrape_amd_discharges                                                   │
                         │                                                                         │
PA DEP / PASDA           │       coal_mining_operations.json ───────────────────────────► collieries.json
  Coal Mining Ops        │                                                                         │
                         ▼                                                                         │
USGS NWIS Site Service ──┬───►   nwis_sites_raw.tsv                                                │
                         │                                       monitoring_stations.json ────────►│
EPA Water Quality Portal ┴───►   wqp_stations_raw.csv  ────►                                       │
  scrape_water_quality                                                                             │
  + scrape_acidity_alkalinity    (WQP Result rows)         ──►   water_quality_samples.json ──────►│
                                                                                                   │
USGS NHD HR (offline DL) ────►   stream_segments_slim.json ─────────────────────────► stream_segments.geojson
                                                                                                   │
                                                                                                   ▼
                                                                       finalize_data.py        data/final/
                                                                                                   │
                                                                       snap_to_segments.py        │  fills attach_segment_id
                                                                                                   │
                                                                       build_harms.py              │  synthesizes harms.json
                                                                                                   ▼
                                                                                              data/final/harms.json
```

**Pipeline run order**:

```bash
cd data/ScraperFiles
python scrape_amd_discharges.py        # 630 AMD discharge points (PA DEP AML)
python scrape_water_quality.py         # NWIS + WQP stations and samples (~67k)
python scrape_acidity_alkalinity.py    # patches Acidity / Alkalinity samples
                                       # (the main scraper missed them due to a
                                       # CharacteristicName vocabulary bug)

python finalize_data.py                # bbox-filter, BOM-strip, schema-rename,
                                       # convert NHD slim list → GeoJSON FC,
                                       # write data/final/

python snap_to_segments.py             # spatial-snap collieries / sources /
                                       # stations to nearest stream segment
                                       # within 5 km, write attach_segment_id

python build_harms.py                  # 1 harm per pollution_source: walks
                                       # 20 km downstream chain, joins
                                       # collieries (2 km), supporting stations,
                                       # aggregates samples, classifies severity.
                                       # Writes data/final/harms.json
```

Read `data/final/README.md`, `data/newData/README_all.md`, and the per-script
docstrings for the gritty details — this section is just the map.

---

## Backend reference

### Stack

- Python 3
- Flask 3.1, flask-cors
- No database, no ORM, no async

### Layout

```
backend/
├── app.py              # create_app() factory, registers four blueprints
├── routes/
│   ├── colliery_routes.py
│   ├── station_routes.py
│   ├── harm_routes.py
│   └── simulation_routes.py
├── services/
│   ├── colliery_service.py     # read collieries.json
│   ├── station_service.py      # read monitoring_stations.json
│   ├── harm_service.py         # read harms.json + reverse-lookup helpers
│   └── sample_service.py       # lazy-loaded station_id index over 75k samples
└── models/                      # dataclasses (descriptive only; services pass dicts)
    ├── geo_entity.py
    ├── colliery_model.py
    ├── station_model.py
    ├── harm_model.py
    ├── stream_segment.py
    └── samples.py
```

### Working-directory contract

Every service computes
`DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "data", "final")`
and `app.py` uses bare imports (`from routes.harm_routes import ...`). Both
rely on `backend/` being the cwd. Don't refactor to package-relative imports
without also fixing the launcher.

### REST endpoints

All endpoints return JSON. CORS is enabled; the Vite dev server proxies
`/api/*` to <http://127.0.0.1:5000>.

| Method | Path | Returns |
| --- | --- | --- |
| GET | `/api/health` | `{"status": "ok"}` |
| GET | `/api/collieries` | Array of all 1,320 colliery records |
| GET | `/api/collieries/<id>` | Single colliery + `linked_harms[]` summary list |
| GET | `/api/stations` | Array of all 2,083 monitoring station records |
| GET | `/api/stations/<id>` | Single station + `linked_harms[]` + `available_characteristics[]` |
| GET | `/api/stations/<id>/samples?characteristic=&fraction=` | Time-series samples (optional filters) |
| GET | `/api/harms` | Array of all 538 harm records (denormalized) |
| GET | `/api/harms/<id>` | Single harm (already shaped as the evidence packet) |
| GET | `/api/harms/by-segment/<segment_id>` | Harm summaries whose chain includes this segment |
| GET | `/api/harms/related/<kind>/<entity_id>` | Reverse-lookup: all related entity ids for analysis-mode highlight. `kind ∈ {colliery, station, pollution_source, segment}` |
| GET | `/api/sim/stream-segments` | Full `stream_segments.geojson` |
| GET | `/api/sim/sources` | Full `pollution_sources.json` |
| GET | `/api/sim/config` | Particle-simulation defaults |

### Why harms are denormalized

`build_harms.py` pre-bakes per-station chemistry summaries (pH median, Fe avg,
acidity max, etc.) into each harm record. This means `harm_service.build_harm_evidence`
is a passthrough — no JOIN logic at request time. The cost is ~3 MB on disk
for `harms.json`; the win is HarmPanel renders instantly without N+1 fetches.

---

## Frontend reference

### Stack

- React 18 (functional components only, JSX, no TypeScript)
- Vite 5 dev / build
- Mapbox GL JS 3
- Inline styles + Helvetica typography (no CSS framework)

### Layout

```
frontend/src/
├── index.jsx, index.html      # bootstrap; sets Helvetica, line-height, letter-spacing
├── App.jsx                    # global state, prefetch, derived useMemo, top-level layout
├── services/
│   └── api.js                 # fetch wrappers
├── sim/
│   ├── segmentGraph.js        # buildSegmentsById, buildDownstreamPath
│   └── polyline.js            # buildPolylineFromPath, pointAndTangentAtDistance
└── components/
    ├── IntroOverlay.jsx       # splash with TRACE wordmark
    ├── MapView.jsx            # all Mapbox layers + RAF particle loop
    ├── LayerControlPanel.jsx  # top-right: 2D/3D + layer toggles + legend
    ├── Sidebar.jsx            # top-left: search + Top-K + (one of:) detail panel
    ├── TopKList.jsx           # ranked Top-8 list, used twice in welcome
    ├── HarmPanel.jsx          # the main evidence panel
    ├── CollieryPanel.jsx
    ├── StationPanel.jsx
    ├── PollutionSourcePanel.jsx
    ├── SegmentPanel.jsx
    ├── SimulateBlock.jsx      # the "▶ Simulate transport" button + explainer
    └── Sparkline.jsx          # hand-rolled SVG time-series chart
```

### State model

`App.jsx` owns it all. Three categories:

| Category | State | Notes |
| --- | --- | --- |
| **Selection** | `analysisFocus = { kind, id } \| null`, `selectedHarmId` | `analysisFocus` is the primary selection; `selectedHarmId` is a drill-down on top of it. Panels render based on both. |
| **View toggles** | `is3D`, `vizColliery`, `vizAmd`, `simulating`, `visibleLayers`, `introVisible`, `sidebarCollapsed` | All independent; the camera tilt is decoupled from the heatmap/extrusion visibility (one of the more important UX decisions in the project). |
| **Prefetch** | `searchIndex` (slim), `allHarms` (full) | Loaded once on mount; powers search and Top-K useMemos. |

Selection mutators always reset interrelated state in the same render to
avoid stale layer paint:

```js
const focus = (kind, id) => {
  setAnalysisFocus({ kind, id });
  setSelectedHarmId(null);
  setRelatedIds(EMPTY_RELATED);
  setSimulating(false);
};
```

### Map layer stack (z-order, bottom to top)

```
basemap (Mapbox light-v11)
streams                   (line, slate-400, opacity 0.45 in browse)
active-path-layer         (line, slate-700, filtered to focused chain)
colliery-extrude-layer    (fill-extrusion, red gradient, height ∝ score)
colliery-heatmap-layer    (heatmap, red, weight = score)
amd-heatmap-layer         (heatmap, orange, weight = severity)
particles-glow-layer      (circle, blurred halo)
particles-layer           (circle, sharp)
collieries-layer          (symbol, house icon by status)
stations-layer            (symbol, diamond icon by source count)
pollution-sources-layer   (symbol, droplet icon by severity)
```

Markers always sit on top so they're never covered by the heatmap or
extrusion. This is enforced by **adding marker layers last** in `setupLayers`
(an earlier bug had viz layers added with `beforeId: COLL_LAYER_ID` before
COLL_LAYER existed, silently dropped — see `MapView.jsx` comments).

### Selection highlight model

Analysis-mode highlight uses Mapbox `case` expressions on layer paint,
keyed off feature `id`:

```
opacity = ["case",
  ["==", ["get", "id"], focusedId],          1,      // selected
  ["in", ["get", "id"], ["literal", related]], 0.95, // related
  0.15,                                              // dimmed
]
```

A subtle rule: when focusing kind X, we **exclude** other entities of kind X
from the related set. Sibling collieries that share a harm with the clicked
colliery are real connections, but visualizing them confuses "what does THIS
colliery cause" with "who else is in the same neighborhood". Sibling info is
preserved in the panel's harm list.

The exception is segments — when you click a segment, we keep all chain
segments highlighted so the river path remains visible.

---

## Particle simulation physics

The Simulate transport button starts a Lagrangian particle simulation of the
1-D advection-diffusion-decay equation along the harm's 20 km downstream
chain:

```
∂C/∂t  +  u ∂C/∂x  =  D ∂²C/∂x²  −  k C  +  S(x, t)
```

Each particle is one stochastic sample of `C(x, t)`. The per-frame update is

```js
dist += u · dt + √(2D dt) · randn()       // advection + Brownian diffusion
mass *= exp(−k · dt)                       // first-order decay
// removed when dist > totalMeters or mass < 0.02
```

Implementation notes:

- **u, D, k are visual values, not physical.** Real river velocity is ~0.3 m/s;
  visual u is 380 m/s so the animation is watchable. D and k were tuned to
  produce a recognizable spreading plume that fades by the chain end.
- **Spawn position is the source's perpendicular projection onto the polyline,**
  not the polyline start. `snap_to_segments` only guarantees the source's
  `attach_segment_id` is the *nearest* segment, not that the source is at
  that segment's start. We use `projectOntoPolyline()` to compute the
  along-chain meters at which to spawn.
- **One source at a time.** Particles only run when `analysisFocus.kind === "pollution_source"`
  (which is the focus a HarmPanel sets when entered).
- **Color = `progress` interpolated** from the source's severity color (e.g.
  `#7f1d1d` for extreme) at the spawn point to slate `#94a3b8` at the chain
  end; opacity follows `mass`.

Tunables live in `MapView.jsx` near the top:

```js
const PARTICLE_PHYSICS  = { u: 380, D: 8000, k: 0.012, jitterSigma: 25 };
const PARTICLE_DEFAULTS = { maxParticles: 1800, particleSize: 2.2,
                            particleLife: 90, emissionGain: 8, ... };
```

The model is a deliberate visual aid — *not* a hydrology simulator. Don't
quote particle counts as concentration estimates.

---

## Data file formats

All files in `data/final/` are JSON or GeoJSON. The schemas are documented in
`data/final/README.md` (and the per-source provenance in `data/newData/`).
Quick reference:

### `pollution_sources.json` (630 records)

```json
{
  "id": "amd-816083",
  "name": "2039-07",
  "latitude": 40.6808,
  "longitude": -76.3653,
  "attach_segment_id": "26060188",     // null for ~92 unsnapped sources
  "emission_rate": 6.0,                 // gpm flow (raw)
  "intensity": 0.006,
  "color": "#c97a3f",                   // unused; severity-coloring is now done in App
  "source": {                           // PA DEP audit metadata
    "sf_id": 816083, "sf_status": "Abandoned",
    "sf_priority": "Environmental Impact", ...
  }
}
```

### `collieries.json` (1,320 records, anthracite-bbox)

```json
{
  "id": "coll_1",
  "name": "READING ANTHRACITE W SPRING MINE",
  "operator": "WEST SPRING ENERGY LLC",
  "status": "ACTIVE",                  // one of ACTIVE / INACTIVE / ABANDONED /
                                       //        RECLAMATION_COMPLETED /
                                       //        PROPOSED_NEVER_REALIZED / UNKNOWN
  "latitude": 40.755, "longitude": -76.4906,
  "attach_segment_id": "26049981"      // null if outside 5 km snap radius
}
```

### `monitoring_stations.json` (2,083 records)

```json
{
  "id": "USGS-01536500",                  // AGENCY-NUMBER format
  "name": "LACKAWANNA RIVER AT OLD FORGE, PA",
  "latitude": 41.4778, "longitude": -75.7341,
  "type": "Stream",                       // mixed short codes (NWIS) and long names (WQP)
  "agency": "USGS Pennsylvania Water Science Center",
  "huc": "02050107",                      // 8-digit HUC
  "attach_segment_id": "26049981",
  "drainage_area_sq_mi": 332.0,           // null for WQP-only sites
  "altitude_ft": 528.0,                   // null for WQP-only sites
  "sources": ["WQP", "NWIS"]              // 84 dual-source / 1115 WQP-only / 884 NWIS-only
}
```

### `water_quality_samples.json` (75,249 records)

One row per measurement. 13 characteristic types — pH, Specific conductance,
Iron, Manganese, Aluminum, Sulfate, Dissolved oxygen, Temperature water,
Alkalinity (4 variants), Acidity (1 variant). Key field: `station_id` joins
to `monitoring_stations.id`.

### `stream_segments.geojson` (20,033 features)

USGS NHD HR LineStrings, bbox- and ftype-filtered to anthracite + valid
hydrology types only. Each feature has `properties.id`,
`properties.downstream_id` (the chain pointer used by walks), `length_km`,
`name` (29% have one), `huc8`, `ftype`.

### `harms.json` (538 records)

Per pollution source. The denormalized evidence packet:

```json
{
  "id": "harm-amd-816083",
  "name": "AMD discharge 2039-07 → Stumps Run",
  "severity": "extreme",                       // extreme / high / medium / low
  "time_window": { "start": "2018-03-15", "end": "2024-09-12" },
  "pollution_source_id": "amd-816083",
  "source_collieries": [
    { "id": "coll_1", "name": "...", "operator": "...",
      "status": "ABANDONED", "distance_m": 850 }
  ],
  "stations": [
    { "id": "USGS-...", "name": "...",
      "ph": 5.4, "iron": 1.2, "manganese": 0.8,
      "acidity_mgL_caco3": 80, "alkalinity_mgL_caco3": 12,
      "n_samples": 47,
      "sample_window": { "start": "2018-03", "end": "2024-09" } }
  ],
  "affected_streams": [
    { "id": "26060188", "name": "Stumps Run",
      "length_km": 1.003, "huc8": "02050305" }
  ],
  "key_metrics": {
    "n_collieries": 3, "n_stations": 5, "n_reaches": 22,
    "total_reach_length_km": 4.2,
    "flow_gpm": 6, "sf_priority": "Environmental Impact"
  }
}
```

The harm `id` convention is `harm-{pollution_source_id}` — a 1:1 mapping.
This is exploited everywhere (`enterHarm`, particle source lookup, etc.).

---

## Scripts reference

All in `data/ScraperFiles/`. Stdlib-only (no extra pip installs).

| Script | Purpose |
| --- | --- |
| `scrape_amd_discharges.py` | Pulls PA DEP AML inventory points (630 AMD discharges) and writes the cleaned `pollution_sources.json` plus the raw `amd_discharges_raw.geojson` |
| `scrape_water_quality.py` | Pulls USGS NWIS site list + EPA Water Quality Portal stations and samples; writes `monitoring_stations.json` and `water_quality_samples.json` |
| `scrape_acidity_alkalinity.py` | Patches Acidity / Alkalinity samples that the main WQP scraper missed (the literal "Acidity" / "Alkalinity" CharacteristicName values aren't in WQP's enum; the script tries the actual canonical names like `"Acidity, (H+)"`, `"Alkalinity, total"`) and merges into `water_quality_samples.json` by `(activity_id, characteristic)` |
| `probe_wqp_acidity.py` | One-shot diagnostic that prints WQP's actual enumerated `Acidity` / `Alkalinity` names; only useful when the WQP vocabulary changes |
| `inspect_new_data.py` | Sanity-check report on `coal_mining_operations.json` and `stream_segments_slim.json` from teammates: bbox coverage, ftype distribution, downstream-id integrity |
| `finalize_data.py` | Reads the seven cleaned files in `data/newData/` and `data/toy_models/`, applies bbox filtering, BOM stripping, schema renames (`lat`/`lon` → `latitude`/`longitude`), ftype filtering on streams, and writes `data/final/` |
| `snap_to_segments.py` | Spatial join: for each colliery / station / pollution_source, finds the nearest stream segment within 5 km (equirectangular projection at bbox center) and writes `attach_segment_id` back into the JSON |
| `build_harms.py` | The synthesis step. For each pollution source with an `attach_segment_id`: walks 20 km of `downstream_id`, gathers stations on that chain, gathers collieries within 2 km, aggregates per-station chemistry with unit normalization, classifies severity, and writes one harm. Emits 538 records (out of 630 sources; 92 are skipped because they don't snap) |
| `inspect_harms.py` | One-shot spot-check: prints severity distribution + sample harm + counts of harms with no stations |

---

## Project conventions

- **No database.** Backend reads JSON per request. Don't add an ORM.
- **No backend simulation.** All animation runs in the browser RAF loop.
- **Working-directory contract.** Backend services use bare imports and
  expect `cwd = backend/`. The Vite proxy assumes both servers run on the
  hard-coded ports.
- **One README per data folder.** `data/final/README.md` describes the
  production schema; `data/newData/README_all.md` documents the cleaning
  intermediate; `data/ScraperFiles/README*.md` documents the pipeline.
- **English UI, Helvetica typography.** Hierarchy is established by weight
  (Regular 400 / Medium 500 / SemiBold 600) and italic. Bold (700) is
  reserved for severity pills and a few key emphases.
- **No CSS framework.** Inline styles only. Component files are
  self-contained.
- **No linter, no test suite.** Vite's `npm run build` is the syntax check;
  manual smoke is the functional check.
- **Comments in Chinese are intentional.** Some files in `frontend/src/components/`
  carry Chinese comments documenting design rationale. The rule: keep them
  in nearby code edits; don't translate wholesale.

---

## Roadmap and known limits

Not built (deliberately or yet):

- **Acidity ÷ Alkalinity net-acid scoring** — the per-station summaries
  carry both, but severity classification still uses absolute Acidity
  threshold. Net acid would be more diagnostic.
- **Multi-source particle simulation** — only the focused source runs
  particles. Showing all 538 simultaneously is a fps cliff.
- **HUC8 watershed polygons** — not in any current dataset; would let us
  draw colored basins.
- **Time-aware filtering** — `harms.json` carries `time_window` per harm
  but the UI doesn't expose a year slider.
- **Export / share view URL** — no permalinks for analysis state.
- **Offline / static deploy** — backend is required at runtime; building a
  static export would mean shipping the JSON to the browser directly.

Known limits in the data:

- **`attach_segment_id`** is null for ~7% of pollution sources (off-stream
  reclamation sites) and ~17% of collieries (proposed mines that never broke
  ground or sites snapped beyond the 5 km cap). These show up as map markers
  but generate no harm and no particles.
- **Station coverage is 35%** — only 720 of 2,083 stations have any samples
  in the 2015-2025 window. The other 1,363 are listed in NWIS / WQP but
  inactive in the timeframe.
- **Acidity / Alkalinity are sparse** — only ~5,940 + ~3,111 samples across
  the whole bbox. Many harms have no acidity-bearing supporting station and
  fall through to default severity classification.
- **Visual particle physics is not real.** u, D, k were chosen for legibility,
  not calibration. Don't infer downstream concentrations.

---

## Data sources and credits

| Source | Used for |
| --- | --- |
| **PA DEP — PASDA AML Inventory** ([PASDA](https://www.pasda.psu.edu/)) | 630 AMD discharge points, severity priorities, reported flow |
| **PA DEP — Coal Mining Operations** (PASDA layer 6) | 1,320 colliery permit points, operator names, status |
| **USGS — NHDPlus High Resolution** ([National Map](https://apps.nationalmap.gov/downloader/)) | 20,033 stream segments with topology + name + HUC8 |
| **USGS — NWIS Site Service** ([waterservices.usgs.gov](https://waterservices.usgs.gov/)) | 968 monitoring sites, drainage area, altitude |
| **EPA — Water Quality Portal** ([waterqualitydata.us](https://www.waterqualitydata.us/)) | 1,199 stations + 75,249 chemistry samples |

The bbox of interest is the Pennsylvania Anthracite Region:
`west=-76.85, south=40.50, east=-75.20, north=41.65`. Outside this box,
nothing is loaded.

License: this project is a research / education prototype. Public-domain
upstream data is used under the source agencies' terms. The synthesized
`harms.json` is derivative; treat it as illustrative, not authoritative.

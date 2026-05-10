# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

A Flask + React + Mapbox demo that tells the causal story **Colliery → AMDHarm → StreamSegment** (acid mine drainage from coal mines, propagated as harm objects, and visualized as polluted river segments). Note: design docs (`README.md`, `ProjectPlan.md`, `SIMULATION.md`, `SIMULATION_IMPLEMENTATION_PLAN.md`) are written in Chinese — read them for narrative/scope context that isn't in the code.

The repo has **two parallel concerns** that share the same data files:
1. **AMD Harm object model** (REST API + Sidebar panels): static evidence packets joining collieries, monitoring stations, and stream segments via `harms.json`.
2. **AMD flow simulation** (frontend particle animation): visual, network-constrained particle flow along stream segments — *not* a hydrology or chemistry simulator. All simulation logic runs in the browser; the backend only serves data.

## Run commands

Two dev servers are required and the proxy assumes both:

```powershell
# Backend (port 5000) — must be launched from backend/ so its bare imports resolve
.venv\Scripts\activate
cd backend
python app.py

# Frontend (port 3000) — Vite proxies /api → 127.0.0.1:5000
cd frontend
npm install   # first run only
npm run dev
```

There is no test suite, no linter, and no build step beyond `npm run build` (Vite). Don't fabricate test/lint commands.

A Mapbox token is required in `frontend/.env` as `VITE_MAPBOX_TOKEN=...` (a demo token is committed). If missing, `MapView.jsx` renders a fallback placeholder instead of the map.

## Architecture

### Backend (Flask, JSON-only data layer)

- `backend/app.py` is a `create_app()` factory that registers four blueprints: `harm_routes`, `colliery_routes`, `station_routes`, `simulation_routes`. There is no database — services read directly from `data/*.json` and `data/*.geojson` on each request.
- **Working-directory contract**: every service computes `DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "data")` and `app.py` uses bare imports like `from routes.harm_routes import harm_routes`. Both rely on `backend/` being the cwd. Don't refactor to package-relative imports without also fixing the launcher.
- **Models vs services**: `backend/models/` holds dataclasses (`GeoEntity`, `Colliery`, `MonitoringStation`, `AMDHarm`, `StreamSegment`, `WaterQualitySample`) that mirror the design's class diagram, but services currently still pass dicts. `AMDHarm.to_evidence_packet()` exists as the target shape; `harm_service.build_harm_evidence` is the dict-based MVP equivalent. When adding evidence fields, keep both in sync or migrate the service to use the dataclass.
- **Endpoint shape**: `GET /api/harms/<id>` returns the *evidence packet* (joined collieries + stations + affected stream segments), not the raw harm. `GET /api/sim/{stream-segments,sources,config}` are dumb passthroughs of the corresponding files in `data/`.

### Frontend (React + Vite + Mapbox GL)

- `App.jsx` owns global state: `selectedCollieryId`, `selectedHarmId`, sim play/reset/overrides. State flows down to `MapView` and `Sidebar`; selection callbacks flow up. The simulation overrides object is the canonical place to expose tunable particle parameters.
- `MapView.jsx` is the heart of the simulation. It manages **all** Mapbox sources/layers (`streams`, `active-path`, `pollution-sources`, `particles` + a glow layer) and runs the `requestAnimationFrame` particle loop. `simRef` (a ref, not state) holds the live particle array, polyline cache, and config — particles are mutated in place each frame to avoid re-renders. The `playing` flag and `overrides` are mirrored from props into `simRef` via small effects so the loop always reads fresh values without restart.
- `SHOW_COLLIERIES` is a hardcoded boolean in `MapView.jsx` that currently hides colliery points to keep the simulation view uncluttered. Flipping it re-enables the colliery click-to-select flow that feeds `selectedCollieryId`.
- `frontend/src/sim/`:
  - `segmentGraph.js` — builds `segmentsById` from the GeoJSON and walks `downstream_id` pointers to produce a path. Has cycle protection (`seen` set, `maxSteps`).
  - `polyline.js` — concatenates path segments into one polyline, computes haversine-meter cumulative lengths, and exposes `pointAndTangentAtDistance` for placing/orienting particles. The lateral offset for the "wide flow" effect comes from the tangent's perpendicular here.
- **MVP shortcut**: the particle loop only animates the **first** pollution source's downstream path. Multiple sources will require per-source polylines and per-source spawn accumulators.

### Data contract (kept consistent across both concerns)

- `stream_segments.geojson` features must carry `properties.id` and `properties.downstream_id` (or null for terminal segments). Both the harm evidence join and the simulation graph key off `id`.
- `pollution_sources.json` entries need `attach_segment_id` matching a `stream_segments` `id`, plus `emission_rate`, `intensity`, `color`.
- `harms.json` references entities by id arrays (`source_collieries`, `supporting_stations`, `affected_stream_segments`); changing an id in any data file requires sweeping the others.

## Conventions

- Python 3 dataclasses; Chinese docstrings/comments are the existing style — keep them when editing nearby code, don't translate wholesale.
- React: functional components only, `.jsx` extension, no TypeScript, no CSS framework (inline styles + `styles.css`).
- Don't add a database layer or a backend simulation loop — the design explicitly keeps simulation in the browser and data flat-file.

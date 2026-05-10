# Implementation Brief
## AMD Flow Visualization MVP
### Stream Segment -> Particle Flow on Mapbox

## Project Goal

Build a frontend visualization module that shows AMD pollution as an animated downstream flow on top of a Mapbox map.

This is **not** a full physics or hydrology simulator.  
This is a **network-based visual simulation** for demo and thesis presentation.

The visualization should communicate:

- where AMD enters the system
- how pollution moves through stream segments
- how harm propagates downstream over time

---

## Core Decision

Use:

- **stream network geometry**
- **source points**
- **particle flow constrained to stream paths**
- **Mapbox rendering**

Do **not** build:
- a vector-field wind simulation
- a full fluid engine
- a chemistry solver

Reason:
AMD is better represented as **hydrologically constrained downstream movement**, not free-field motion.

---

## MVP Scope

### Must Have
1. Load stream segments on a Mapbox map
2. Load AMD source points
3. Attach each source to a stream segment
4. Emit particles from each source
5. Move particles downstream along connected stream geometry
6. Fade particles over time
7. Render particles as animated points or short trails
8. Expose a few parameters for tuning

### Nice to Have
1. Slight jitter around stream centerline
2. Variable particle speed
3. Pause / play / reset controls
4. Different colors by source intensity
5. Segment highlighting when active

### Out of Scope
1. Full hydrological accuracy
2. Terrain-derived flow calculation
3. Real-time chemistry modeling
4. GPU physics engine
5. Backend simulation loop

---

## Recommended Tech Stack

### Frontend
- JavaScript
- Mapbox GL JS
- HTML / CSS

### Data
- GeoJSON for stream segments
- JSON for source points and simulation config

### Optional
- deck.gl only if animation is hard to manage directly in Mapbox
- otherwise stay inside Mapbox + custom animation loop

---

## Architecture

```text
Input Data
  - stream_segments.geojson
  - pollution_sources.json
  - simulation_config.json

        ↓

Preprocessing
  - build stream lookup by segment id
  - build downstream connectivity
  - assign source to stream segment
  - prepare downstream path chain

        ↓

Simulation Engine
  - spawn particles
  - move particles along segment paths
  - update age / opacity
  - remove dead particles

        ↓

Renderer
  - convert particle states to GeoJSON or render layer data
  - update map source every frame
  - animate in browser

        ↓

Mapbox UI
  - show stream network
  - show sources
  - animate pollution flow
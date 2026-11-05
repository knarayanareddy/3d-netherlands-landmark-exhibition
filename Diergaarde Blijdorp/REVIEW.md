# Review: `3d-netherlands-landmark-exhibition` → photoreal Diergaarde Blijdorp

## What the repo does well
- **Clear architecture.** `Exhibition.ts` (engine) / `landmarks/*.ts` (one builder per landmark) / `kit.ts` (materials + helpers) / `Minimap.tsx`. Adding a landmark is just a new `buildX(): Landmark` plus an entry in `landmarks.ts`.
- **Good "exhibition" framing**: orbit + walk modes, a day/dusk/night preset system with eased transitions, minimap teleport, labels, tour mode.
- **Sensible tech**: Three.js + Vite + TS, PMREM environment from a procedural `Sky`, shadow-following sun, glow registry for night emissives.

## Why the landmarks cannot look photoreal yet (and what I changed for Blijdorp)
| Finding in the repo | Effect | What this project does instead |
|---|---|---|
| **Everything is procedural + canvas-painted textures** (`kit.ts`: `drawBricks`, `speckle`, …) | Flat, repeating, "toy" surfaces; no real micro-detail | Real **CC0 PBR textures** (Poly Haven: stucco, cobbles, clinker, grass, brick, …) with normal maps; world-scale UVs (`wuv`) so texel density is constant in metres |
| **Landmarks are miniatures** (radius ≈ 9 units; people-scale is lost) | You can't "be inside" a monument | Blijdorp is modelled **at 1 unit = 1 m** and explored at 1.65 m eye height |
| **Walk mode is a single floor height + circle colliders per landmark** (`floor()` / `colliders`) | No interiors, steps, stages, doorways | AABB + arc colliders, per-region floor heights (hall, stage, wing, round pavilions), eased eye height, door openings, 4 enterable interiors |
| **Lighting is Sky-only** (no photographic reference light) | Soft, synthetic ambience | Real **HDRI** (sun direction measured from the file and matched by the shadow light); per-material env-map intensity (interiors darker than exteriors) |
| **No post-processing / anti-aliasing strategy** | Aliased edges, no filmic response | MSAA HDR render target → bloom → vignette → ACES output |
| **One texture-tiling strategy (UV tiling only)** | Visible repetition on large ground areas | Shader patch (`patch()` in `mats.ts`) adds macro colour variation and wall grime/streaks in world space |
| **Foliage** is geometry blobs | Reads as low-poly | Instanced alpha-tested leaf-cluster crowns with spherical normals (soft volumetric shading) |
| **Single monolithic `Exhibition` class (~830 lines)** with build + UI + input + tour | Hard to give a landmark its own "explore" mode | `World.ts` is a self-contained *explorer* for one site; reusable for other monuments (see below) |

### Smaller things worth fixing in the repo
1. `dispose()` does not release geometries/materials/textures (leaks when switching landmarks).
2. `memo()` caches materials globally; texture/material lifetime is never tied to a landmark.
3. Colliders are only axis-aligned boxes: curved walls (Evoluon, Euromast bowl) need arc/polygon colliders (`arcWall` / `polyWall` here).
4. Night glow is a global registry; a per-landmark registry would let each monument manage its own lighting.
5. Asset strategy: keep photographic assets under a common `src/assets/` folder and inline them via `vite-plugin-singlefile` only for builds that need a single file.

## How Blijdorp is modelled (sources)
Facts used (Rijksdienst monument description, Rijnmond, architectenweb, Broekbakema):
- Architect **Sybold van Ravesteyn** (commissioned Nov 1938); Rivièrahal opened **7 Dec 1940**; neo-baroque / functionalist.
- **Steel frame with a sculpted concrete shell**; long central hall with a **curved, ridgeless roof**, two narrower side aisles each ending in a **round pavilion**; continuous clerestory strips; **glazed tiles on roof edges**; **four full-height columns** between glass walls.
- South front: two entrances under a **canopy**, a **semicircular bay** with rounded concrete parapet; **Charles Eyck** sculptures (figures with deer).
- North front: **angel and two unicorns** (W. van Kuilenburg) on the roof; demolished **47 m lookout tower** with two diagonal café/restaurant pavilions (toggle "1940 tower"); terrace hall since the 1970s.
- Interior: few partitions, **scalloped concrete walls with harp-shaped skylights**, orchestra podium on the north wall, **fountain with mosaic** (creation story), **Victoria house** with a round pond and *Victoria amazonica*.
- Site: formal axis **tea house → pond → Rivièrahal**, ditches instead of bars, restored monumental entrance (gates, ticket booths, Winkel van Sinkel, director's building).

Interpreted / simplified (marked as such in the UI): the tea house, the mosaic design, the star-sky pavilion, wing interiors (terrarium windows), the tower's exact shape.

## Integrating into the existing repo
1. Copy `src/three/blijdorp/**`, `src/assets/**`, `src/vite-env.d.ts` and `App.tsx` (or just its UI parts).
2. In `landmarks.ts`, add an entry for `blijdorp` and give it a "Enter monument" action that mounts `<World>` full-screen (or swaps the camera/scene), then disposes it on exit.
3. If you want the miniature in the map exhibition too, export a simplified `buildBlijdorpMini()` that scales the hall + wings group by ~0.03 and reuses `mats.ts`.
4. Next monuments: copy `World.ts`, replace `buildRivierahal` / `buildGrounds`, `poi.ts` and the HDRI.

## Controls
`W A S D` / arrows move · `Shift` run · drag (or `L` for mouse capture) look · scroll zoom · `1 2 3` day / golden / night · `M` aerial ↔ walking · `T` guided tour · minimap click to teleport.

# Review — 3d-netherlands-landmark-exhibition (+ ARTIS Royal Zoo exploration)

## What the repo is
A React 19 + Three.js + Vite + Tailwind 4 exhibition: ~12 procedurally modelled landmarks (≈4.5k lines) placed on a stylised
map of the Netherlands, with orbit/walk modes, day/dusk/night, a minimap and a guided tour. Everything is generated in code
(canvas textures, merged primitives) — no external assets.

## Strengths
* Clean separation: `Exhibition.ts` (engine) / `landmarks/*.ts` (builders) / `kit.ts` (materials + primitives) / React HUD.
* Geometry is baked and merged per material (`bake`) → few draw calls; good use of `Sky` + PMREM for image-based light.
* Time-of-day presets are interpolated, not switched; shadows follow the camera; resource disposal exists.
* Good UX ideas: minimap teleport, label hotspots, guided tour.

## Issues / risks found
1. **Scale mismatch** – landmarks are 10–30 m "dioramas" (e.g. `rijks.ts` uses R = 12.2 for the whole museum), so a first-person
   camera at eye height 1.7 m sees toy-sized buildings. Photoreal exploration needs *real-world metres* per monument.
2. **Procedural-only surfaces** – canvas-drawn brick/stone has no normal/roughness/AO and visibly tiles. Real CC0 PBR photo
   textures (Poly Haven) + world-space macro variation give the biggest realism jump for the least code.
3. **Windows/doors are painted into textures** – no depth, no reveals, no reflections. Use real surround geometry + glass with env reflections.
4. **No interiors / collision** – walk mode has no wall, tree or step collision and no enterable buildings.
5. **Post-processing & AA** – renderer uses MSAA only on the canvas; no HDR pipeline / bloom, so night lights and glass don't glow.
6. **Type safety** – `landmarks.ts` casts every entry `as any` (11×); define `LandmarkDef` input type instead.
7. **Memory** – `tree()` builds new `colorMat`/geometry per call; share materials/instances for large scenes.
8. **Project hygiene** – no tests, no lint config, `package.json` name is still `react-vite-tailwind`; README lacks screenshots/controls.
9. **Accuracy** – blurbs are good, but there is no ARTIS, no per-monument "detail scene" route; each landmark should be able to
   load as its own full-scale scene (lazy-loaded chunk) from the map.

## What was added: `src/artis/` (drop-in module)
Full-scale (1 unit = 1 m) walkable ARTIS Amsterdam Royal Zoo:
* Main gate (piers, gilded eagles, society motto sign), Ledenlokalen (1868), Groote Museum (1850–55, Ionic portico),
  Aquarium (1882: temple front with Corinthian columns, pavilions, copper-domed apse) and **an enterable Aquarium hall**
  with four animated biotope tanks (reef, Amazon, canal, ocean), caustics, bubbles and swimming fish schools.
* Gardens: fountain + tulip beds, ~600 instanced foliage-card trees, wind-swayed grass, pond with island, pier, flamingos, ducks,
  lamps, benches, fence, Amsterdam street with tram rails, bicycles and canal houses.
* Engine: HDR pipeline + bloom, Sky/clouds/stars, Day / Golden hour / Night, camera-following shadows, first-person controller
  (collision, ramps/steps, run, touch joystick, pointer-lock optional), aerial orbit, guided flights, projected hotspot labels,
  procedural ambience + footsteps, 3 quality tiers.
* Everything is exposed through one class: `new ArtisWorld(container, events).init()`; `dispose()` cleans up.

### Integrating into your repo
1. Copy `src/artis/` and `src/assets/tex/` (4 MB of compressed Poly Haven CC0 textures).
2. Add `src/vite-env.d.ts` (`/// <reference types="vite/client" />`).
3. In `landmarks.ts` add an entry whose "Enter" action mounts `ArtisWorld` (lazy `import('./artis/world')`).
4. Pattern for further monuments: copy `buildings.ts` helpers (`Frame`, `win`, `columnGeo`, `roofHip`…) and `gfx.ts` materials.

## Honest limits
Procedural geometry + PBR photo textures gets close to a "game-quality" realism, **not** photogrammetry. ARTIS details are
reconstructed from public descriptions (monument registry entries, Wikipedia, tourism sources); proportions are approximations.
For true likeness, import photogrammetry/LiDAR glTF (compressed with Draco/KTX2) for the façades and keep this engine for
lighting, collision and navigation.

# Review: 3d-netherlands-landmark-exhibition → Diergaarde Blijdorp (whole zoo)

## What the repo does well
- Clear split: engine (`Exhibition.ts`) / one builder per landmark / shared kit / minimap.
- Good exhibition framing: orbit + walk modes, day/dusk/night presets, minimap teleport, guided tour.
- Sensible stack (Three.js + Vite + TS + Tailwind).

## Why the existing landmarks can't feel "explorable / photoreal" yet
| Finding | Effect | What this project does instead |
|---|---|---|
| Landmarks are miniatures (~9 unit radius) | You can't "be inside" a monument | Blijdorp is modelled at **1 unit = 1 m**, explored at 1.7 m eye height |
| Procedural canvas textures only | Flat, toy-like surfaces | **CC0 PBR textures** (Poly Haven) with normal maps, world-scale UVs, plus a shader patch for macro colour variation and wall grime (no visible tiling) |
| Single floor height + circle colliders | No interiors, doorways, tunnels | Segment colliders (walls, arcs, door gaps), spatial hash grid, 10+ enterable interiors |
| Sky-only lighting, no AA, no post | Aliased, synthetic look | Procedural Sky → PMREM env, shadow-following sun/moon, MSAA HDR target → bloom → ACES |
| Everything is separate meshes | Draw-call bound at scale | `Builder` batches static geometry into per-material 70 m chunks (frustum-culled); animals/fish/butterflies are LOD'd by distance |
| Original Blijdorp folder modelled only the Rivièrahal | No zoo | Full park: 7 continents, ~45 habitats, Oceanium, Amazonica, Taman Indah, railway underpass |

## Coverage of the new Blijdorp scene
Entrance & tea house/pond axis, Rivièrahal (arched roof, glass front, Biotopia, gorilla house, giraffe wing, Victoria + terrarium pavilions),
Africa (savanna, gorilla island, Crocodile River, Oewanja Lodge), Asia (Taman Indah with indoor elephants, elephant yard, camels, tigers,
red pandas, Burung Asia aviary), Europe (wolves, reindeer, rock garden), Australia (wallaby walk-through), railway embankment with a
walk-through tunnel and moving train, Oceanium (shark tunnel, penguins, North Sea / reef tanks), Madagascar lemur walk-through,
Amazonica butterfly house, Arctica polar bears, prairie dogs, raccoons, South America paddock, flamingo beach, main gate.

## Honest limitations
- Animals, buildings and layout are **procedural reconstructions** (simplified proportions, interpreted floor plans), not photogrammetry.
  True photorealism needs scanned/artist-made glTF assets (animals, building facades) and baked lighting; the loaders and batching
  pipeline are ready for them (see `animals.ts` GLB loader).
- Flying birds use the three.js example models; everything else is generated in code.
- Next steps: swap in CC0/licensed animal glTFs, add Quaternius/Sketchfab-licensed models, bake lightmaps for interiors,
  add audio, and compare against survey data (OSM / Rijksmonument drawings) for exact footprints.

## Controls
`W A S D` move · `Shift` run · mouse look (click to capture) · `F` fly · `1 2 3` day/golden/night · `M` big map · `Tab` destinations · `T` guided tour · click minimap to teleport.

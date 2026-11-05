# Review: 3d-netherlands-landmark-exhibition

Reviewed: https://github.com/knarayanareddy/3d-netherlands-landmark-exhibition (cloned and read: `Exhibition.ts`, `kit.ts`, `landmarks/euromast.ts`, `landmarks.ts`, `App.tsx`).

## What's good
- Clean separation: `kit.ts` (primitives, procedural textures, `bake()` mesh merging), one builder per landmark, one `Exhibition` engine, a thin React shell.
- `bake()` merges geometry per material, which keeps draw calls low.
- The engine already has orbit/walk modes, time of day, a minimap, a tour, a DPR governor and a proper `dispose()`.
- The procedural textures need no assets, so the app works as a single HTML file.

## Why the Euromast doesn't look like the real one
1. **Scale.** The model is ~21 units tall for a 185 m tower (about 1 unit = 9 m). First-person walking at a 1.7 m eye height can't feel real on a diorama. A "feel like you're there" experience needs 1 unit = 1 m, as in `src/euromast`.
2. **Wrong silhouette.** The Space Tower is modelled as a 3-leg steel lattice. The real one is a white tubular mast with a rotating glass Euroscope capsule. The white cantilevered platform at ~28 m is missing. The shaft is a straight cone with box "slits", not a slightly tapered shaft with formwork joints and tie holes.
3. **No interior.** The nest is a lathe bowl with a glass cylinder. There is no restaurant, terrace, lift, stairs or boarding platform, so nothing is explorable.
4. **Lighting and material realism.**
   - `toneMappingExposure` ≈ 0.62 makes the scene flat.
   - There is no post-processing: no bloom, grade or MSAA on a float target.
   - Textures have no normal or roughness maps, only bump maps.
   - Foliage is flat-shaded low poly.
   - The sky is the stock `Sky` shader with no clouds.
5. **Shadows.** One 4096 map covers the whole 60-unit map. It should follow the player (texel-snapped), and normalBias should scale with the frustum.
6. **Collisions.** Boxes only, with a single floor function per landmark. Multi-level interiors (lobby → nest → terrace → platform) need zone-based floors, which `src/euromast/Experience.ts` demonstrates.
7. **Housekeeping.** `package.json` name is still `react-vite-tailwind`. There are no tests. Everything ships in one chunk (`vite-plugin-singlefile`), so consider lazy-loading each landmark.

## What was built here (`src/euromast/`)
Real-scale (1 unit = 1 m) Euromast in its Rotterdam setting:
- Dimensions from public sources: 185 m total, 96 m crow's nest, 9 m internal bore, 30 cm wall, 1960 shaft, 1970 Space Tower.
- Walkable ground, lobby, lift, restaurant, terrace, stair to the Euroscope station, and a rideable Euroscope up to 185 m.
- Aerial orbit with clickable hotspots.
- Day / overcast / golden hour / night, with lit windows and aviation beacons.
- Rotterdam context: Nieuwe Maas, Erasmus Bridge, Kop van Zuid towers, ships, harbour cranes, Het Park with ~600 trees.

### Porting into the original repo
- `tower.ts`, `interior.ts`, `kit.ts`, `materials.ts` and `textures.ts` are self-contained three.js modules. Wrap `buildTower()` in a `Landmark` (`{ group, radius, colliders, update }`) to drop it into the exhibition map.
- Use `Experience.ts` as the template for a "enter landmark" mode: zone-based collision, fades, a follow-camera shadow frustum, and a post-processing chain.

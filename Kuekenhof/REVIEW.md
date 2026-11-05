# Review of `3d-netherlands-landmark-exhibition` + Keukenhof explorable scene

Reviewed: README, `package.json`, `landmarks.ts` (registry), `landmarks/keukenhof.ts`, `kit.ts` (exports, `bake()`), and the top / walk / collision / render-loop parts of `Exhibition.ts`.

## What the repo does well
- **Clean separation**: `Landmark { group, radius, update, colliders, floor }` + a registry (`landmarks.ts`) + a shared procedural "kit" (`kit.ts`). Adding a landmark is cheap.
- **No external assets**: PBR materials from canvas textures (brick, slate, thatch, gravel…), so the project is tiny and works offline.
- **Good exhibition UX**: orbit/walk modes, time of day, minimap teleport, guided tour.
- **Sensible rendering baseline**: ACES tone mapping, PMREM env from a sky, shadow-camera snapping, `dispose()` implemented.
- **Factually solid blurbs**: Keukenhof 1950, ~7 M bulbs, 32 ha, Jacoba of Bavaria / "kitchen garden" are all correct.

## Findings (things I'd change)
1. **Scale mismatch is the core blocker for "explorable" monuments.** Keukenhof is a ~20-unit diorama disc (`R = 10.2`, a ~9 unit windmill) while walk mode uses `eyeY = 1.7`. A human-height camera on a miniature can never feel like "being there". Each monument that should be walkable needs its **own 1 unit = 1 m scene** (this is what `src/keukenhof/` is).
2. **Collision is hard-coded AABBs** (`colliders: [cx, cz, hx, hz][]`) with an optional `floor()`. That is fine for a diorama, but real exploration needs height-aware surfaces (stairs, decks, banks) and polygon obstacles (flower beds, water). The new scene uses a surface solver (`surface(x, z, currentY)`) with step-up / no-step-off rules.
3. **`bake()` drops data**: it keeps only `position/normal/uv`, so vertex colours / second UVs are silently removed, skips material arrays, and calls `toNonIndexed()` (≈3× vertex memory). Consider keeping indices and a whitelist of attributes.
4. **Tulips are one `LatheGeometry` (6 segments), no LOD, no wind, no per-instance variation beyond colour.** Fine at diorama distance, unconvincing at eye level. Replaced by a 3-level-of-detail tulip/daffodil/hyacinth kit with shared instance buffers.
5. **`as any` on every raw landmark** in `landmarks.ts` bypasses the `Raw` type. Fix the type (`Omit<LandmarkDef, 'pin'|'radius'|'build'> & { build }`) instead.
6. **Build/tooling**: `vite-plugin-singlefile` inlines everything, so lazy-loading each heavy landmark (`import()`) won't actually split. For per-monument experiences either drop singlefile for production or keep one HTML but accept ~1 MB JS. No lint/test scripts, no `LICENSE` file although README says MIT, `package.json` name is still `react-vite-tailwind`.
7. **Accessibility / input**: walk mode relies on keyboard+mouse; no touch controls, no reduced-motion option.
8. **Performance safety net**: fixed `setPixelRatio(min(dpr, 1.75))`, no adaptive resolution. The new scene adds adaptive DPR + Low/Medium/High presets.

## What was built: `src/keukenhof/` (self-contained, 1 unit = 1 m)
| Area | Techniques |
|---|---|
| Terrain | 380² heightfield (lake + canal banks), splat-mapped shader (grass ×3 scales, gravel, pavers, soil, wet mud), procedural **bulb-field stripes** to the horizon, far-land plane with canal cut |
| Flowers | ~40 drifts of tulips (cup / lily-flowered / double), daffodils, hyacinths, grape hyacinths; **3-LOD instanced** models with shared instance buffers, wind sway in the vertex shader, per-instance colour jitter, naturalised bulbs in lawns, cultivar names (look down at a bed) |
| Trees | Procedural branching trunks + alpha-card canopies with radial normals, AO-tinted vertex colours, back-lit leaf translucency, wind; cherry blossom, beech, oak, plane, birch, magnolia, willow, poplar |
| Grass | Streamed 16 m chunks of wind-swaying tufts with distance shrink-fade, reeds on shore |
| Architecture | **Windmill** (octagonal brick tower, gallery, stair you can walk up, tarred cap, lattice sails that turn with the wind), entrance gate with sign, glasshouse pavilion with raised indoor beds (enterable), café with terrace, benches, lamps, white picket fences |
| Life | Swans, whisper boats, fountain particles, ripples |
| Atmosphere | Physically-based sky, procedural clouds, sun by hour (7:30–20:20), weather cover, wind, PMREM environment, planar water reflections |
| Post | MSAA HDR target, bloom, ACES, colour grade, vignette, grain |
| Audio | Procedural birdsong, wind, water, crowd, surface-dependent footsteps |
| Controls | Pointer-lock FPS, touch joystick, drone mode (F), teleports, minimap click, photo mode |

Facts used in the scene (verified): the mill was built **1892 at Scharmer (Groningen)** as a polder mill and donated by the **Holland America Line in 1957**; there is a platform around its base looking over the bulb fields; Zocher & Zocher redesigned the estate in **1857**; ~15 km of paths. The pavilion/café are *interpretive* stand-ins, not copies of specific buildings.

## Integrating into the exhibition repo
1. Copy `src/keukenhof/` and `src/components/Minimap.tsx`; `npm i three@0.170` (same version as the repo).
2. In the Keukenhof info card add an **"Enter garden"** button that mounts the experience full-screen, lazily:
   ```ts
   const { KeukenhofExperience } = await import('./keukenhof/Experience')
   const exp = new KeukenhofExperience(div, 'medium', { onProgress, onHud, onPins })
   await exp.init()          // ~8 s on a laptop
   // …on close:
   exp.dispose()             // frees GL resources & listeners
   ```
3. Pause / dispose the exhibition renderer while inside (only one WebGL context needed).
4. Repeat the pattern per monument: one `XxxExperience` class with `init / dispose`, reusing the texture / shader helpers.

## Known limits / next steps
- Photorealism here is "procedural PBR", not photogrammetry. The biggest further jump would be baked photo-scanned textures / glTF assets (tulip PBR scans, bark, brick) loaded as KTX2 — the material slots already exist.
- No people yet (crowd billboards/animated figures would add scale).
- Real bed layout is stylised; replace `buildBeds()` with surveyed polygons if you have them.
- Tested headlessly (software GL) at Low/Medium; High adds 4096 shadows, bloom and denser planting for real GPUs.

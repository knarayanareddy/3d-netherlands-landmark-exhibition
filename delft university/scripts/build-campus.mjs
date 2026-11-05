// Converts raw OpenStreetMap (Overpass "out geom") extracts into the compact
// campus dataset used by the 3D scene.  Data (c) OpenStreetMap contributors, ODbL.
//
// usage: node scripts/build-campus.mjs <dir-with-overpass-json> > src/data/campus.json
import fs from 'node:fs'
import path from 'node:path'

const dir = process.argv[2] || '/tmp'
const LAT0 = 51.999
const LON0 = 4.3745
const KX = 111320 * Math.cos((LAT0 * Math.PI) / 180)
const KY = 110540
const X_MIN = -760, X_MAX = 960, Z_MIN = -1270, Z_MAX = 1270

const load = (names) => {
  const m = new Map()
  for (const n of names) {
    const f = path.join(dir, n + '.json')
    if (!fs.existsSync(f)) continue
    try {
      for (const e of JSON.parse(fs.readFileSync(f, 'utf8')).elements) m.set(e.type + e.id, e)
    } catch { /* skip */ }
  }
  return [...m.values()]
}
const proj = (g) => g.map((p) => [(p.lon - LON0) * KX, -(p.lat - LAT0) * KY])
const area = (P) => {
  let a = 0
  for (let i = 0; i < P.length; i++) { const j = (i + 1) % P.length; a += P[i][0] * P[j][1] - P[j][0] * P[i][1] }
  return a / 2
}
const cen = (P) => [P.reduce((s, p) => s + p[0], 0) / P.length, P.reduce((s, p) => s + p[1], 0) / P.length]
const inside = (pt, P) => {
  let c = false
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    if (P[i][1] > pt[1] !== P[j][1] > pt[1] && pt[0] < ((P[j][0] - P[i][0]) * (pt[1] - P[i][1])) / (P[j][1] - P[i][1]) + P[i][0]) c = !c
  }
  return c
}
const clean = (P, closed) => {
  const o = []
  for (const p of P) {
    const l = o[o.length - 1]
    if (!l || Math.hypot(p[0] - l[0], p[1] - l[1]) > 0.25) o.push(p)
  }
  if (closed && o.length > 2 && Math.hypot(o[0][0] - o[o.length - 1][0], o[0][1] - o[o.length - 1][1]) < 0.3) o.pop()
  return o
}
const flat = (P) => P.flatMap((p) => [Math.round(p[0] * 10), Math.round(p[1] * 10)]) // decimetres
const inBox = (c) => c[0] > X_MIN && c[0] < X_MAX && c[1] > Z_MIN && c[1] < Z_MAX
const num = (v) => { const n = parseFloat(String(v || '').replace(',', '.')); return Number.isFinite(n) ? n : 0 }

// ---------------------------------------------------------------- buildings
const bways = load(['b', 'b_N', 'b_S']).filter((e) => e.geometry && e.tags && e.tags.building)
const pways = load(['parts']).filter((e) => e.geometry && e.tags && e.tags['building:part'])
const pushB = (e, isPart) => {
  const P = clean(proj(e.geometry), true)
  if (P.length < 3) return null
  const a = Math.abs(area(P))
  if (a < 6) return null
  const t = e.tags
  const lv = num(t['building:levels'])
  return {
    id: e.id, P, a, c: cen(P), part: isPart,
    b: isPart ? t['building:part'] : t.building,
    h: num(t.height) || 0, mh: num(t.min_height) || (t['building:min_level'] ? num(t['building:min_level']) * 3.2 : 0),
    lv, roof: t['roof:shape'] || '', rh: num(t['roof:height']), col: t['building:colour'] || '', mat: t['building:material'] || '',
    ref: t['ref:tudelft'] || '', name: t.name || t['name:en'] || '', layer: num(t.layer),
  }
}
const B = bways.map((e) => pushB(e, false)).filter(Boolean).filter((b) => inBox(b.c))
const PT = pways.map((e) => pushB(e, true)).filter(Boolean)
const byId = new Map(B.map((b) => [b.id, b]))
for (const p of PT) if (byId.has(p.id)) byId.get(p.id).selfPart = true
const parts = PT.filter((p) => !byId.has(p.id))
for (const b of B) b.parts = []
for (const p of parts) {
  for (const b of B) {
    if (Math.abs(b.c[0] - p.c[0]) < 200 && Math.abs(b.c[1] - p.c[1]) < 200 && inside(p.c, b.P)) { b.parts.push(p); break }
  }
}
const heightOf = (b) => {
  if (b.h) return b.h
  if (b.lv) return b.lv * (b.b === 'apartments' || b.b === 'dormitory' ? 3 : 3.4) + (b.roof === 'gabled' || b.roof === 'hipped' ? 1.5 : 0.4)
  switch (b.b) {
    case 'house': case 'detached': case 'semidetached_house': case 'terrace': return 7.5
    case 'shed': case 'garage': case 'garages': case 'roof': case 'service': case 'container': case 'guardhouse': return 3
    case 'apartments': case 'dormitory': return 14
    case 'university': case 'school': return b.a > 2500 ? 14 : 10
    case 'industrial': case 'warehouse': return 9
    case 'retail': case 'commercial': case 'office': return 10
    case 'church': return 16
    case 'parking': return 12
    case 'construction': return 8
    case 'hotel': return 20
    default: return 8
  }
}
const out = { buildings: [], roads: [], areas: [], water: [], trees: [], meta: { lat0: LAT0, lon0: LON0 } }
for (const b of B) {
  let covered = 0
  const ps = []
  for (const p of b.parts) {
    covered += p.a
    ps.push({ p: flat(p.P), h: Math.round((p.h || heightOf({ ...b, h: 0 })) * 10) / 10, mh: p.mh, roof: p.roof, col: p.col, mat: p.mat, name: p.name, lv: p.lv })
  }
  const skipBase = b.parts.length > 0 && covered / b.a > 0.6
  if (b.selfPart && !b.h) b.h = 11
  out.buildings.push({
    id: b.id, p: flat(b.P), h: Math.round(heightOf(b) * 10) / 10, mh: b.mh, t: b.b, roof: b.roof, rh: b.rh, col: b.col, mat: b.mat,
    ref: b.ref, name: b.name, lv: b.lv, a: Math.round(b.a), cx: Math.round(b.c[0]), cz: Math.round(b.c[1]), skip: skipBase ? 1 : 0, parts: ps,
  })
}

// ---------------------------------------------------------------- roads
const rways = load(['r', 'r2', 'r_N', 'r_S']).filter((e) => e.geometry && e.tags && e.tags.highway)
const WIDTH = { motorway: 12, trunk: 10, primary: 9, secondary: 8, tertiary: 7, unclassified: 5.5, residential: 5.5, living_street: 5, service: 3.6, pedestrian: 5, footway: 1.8, path: 1.6, cycleway: 2.4, steps: 1.6, track: 3, bridleway: 2 }
for (const e of rways) {
  const t = e.tags
  const k = t.highway
  if (!WIDTH[k]) continue
  if (t.tunnel && t.tunnel !== 'no') continue
  if (num(t.layer) < 0) continue
  const P = clean(proj(e.geometry), false)
  if (P.length < 2) continue
  const c = cen(P)
  if (!inBox(c)) continue
  let w = num(t.width) || WIDTH[k]
  if (!num(t.width) && num(t.lanes) > 2) w += (num(t.lanes) - 2) * 3
  out.roads.push({ k, w: Math.round(w * 10) / 10, br: t.bridge && t.bridge !== 'no' ? 1 : 0, p: flat(P), nm: t.name || '', fw: t.surface || '' })
}

// ---------------------------------------------------------------- areas / water
const wways = load(['w', 'w_N', 'w_S']).filter((e) => e.geometry && e.tags)
const WW = { river: 14, canal: 12, stream: 3, ditch: 2.5, drain: 2 }
for (const e of wways) {
  const t = e.tags
  const closed = e.geometry.length > 3 && e.geometry[0].lat === e.geometry[e.geometry.length - 1].lat && e.geometry[0].lon === e.geometry[e.geometry.length - 1].lon
  if (t.waterway && WW[t.waterway] && !closed) {
    if (t.tunnel && t.tunnel !== 'no') continue
    const P = clean(proj(e.geometry), false)
    if (P.length < 2 || !inBox(cen(P))) continue
    out.water.push({ w: num(t.width) || WW[t.waterway], p: flat(P), br: 0 })
    continue
  }
  if (!closed) continue
  const P = clean(proj(e.geometry), true)
  if (P.length < 3) continue
  const c = cen(P)
  if (!inBox(c)) continue
  let k = ''
  if (t.natural === 'water' || t.waterway === 'riverbank' || t.landuse === 'basin' || t.landuse === 'reservoir') k = 'water'
  else if (t.amenity === 'parking') k = 'parking'
  else if (t.leisure === 'pitch' || t.leisure === 'track') k = t.sport === 'tennis' ? 'court' : 'pitch'
  else if (t.landuse === 'forest' || t.natural === 'wood') k = 'wood'
  else if (t.landuse === 'farmland' || t.landuse === 'meadow' || t.landuse === 'orchard') k = 'meadow'
  else if (t.landuse === 'grass' || t.leisure === 'park' || t.leisure === 'garden' || t.leisure === 'playground' || t.landuse === 'recreation_ground' || t.landuse === 'village_green' || t.leisure === 'nature_reserve' || t.leisure === 'common') k = 'grass'
  else if (t.landuse === 'industrial' || t.landuse === 'commercial' || t.landuse === 'retail') k = 'paved'
  else if (t.landuse === 'residential') k = 'garden'
  else if (t.landuse === 'cemetery') k = 'grass'
  else continue
  out.areas.push({ k, p: flat(P), a: Math.round(Math.abs(area(P))) })
}
out.areas.sort((a, b) => b.a - a.a)

// ---------------------------------------------------------------- trees
for (const e of load(['t', 't_N', 't_S'])) {
  if (e.type !== 'node') continue
  const x = (e.lon - LON0) * KX, z = -(e.lat - LAT0) * KY
  if (inBox([x, z])) out.trees.push(Math.round(x * 10), Math.round(z * 10))
}

process.stdout.write(JSON.stringify(out))
process.stderr.write(`buildings ${out.buildings.length} (parts ${out.buildings.reduce((s, b) => s + b.parts.length, 0)}), roads ${out.roads.length}, areas ${out.areas.length}, water lines ${out.water.length}, trees ${out.trees.length / 2}\n`)

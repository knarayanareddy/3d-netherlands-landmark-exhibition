import { Pt, clamp, distToPath, fbm, hash2, lerp, pointInPoly, polyBounds, rng, shuffle, smooth, smoothPath, TAU } from './util'

/* ------------------------------------------------------------------ constants */
export const WATER_Y = -0.32
export const GROUND_HALF = 190
export const MILL = { x: 0, z: -88, rBase: 4.4, rTop: 2.9, h: 12.5, galleryY: 3.7, galleryR: 5.9 }
export const CANAL_Z = -104
export const CANAL_HW = 4.6
export const LAKE_C: Pt = [0, -42]
export const START = { x: 0, z: 121, yaw: 0 }

/* ------------------------------------------------------------------ varieties */
export type Species = 'tulip' | 'daffodil' | 'hyacinth' | 'muscari'
export type Shape = 'cup' | 'lily' | 'double'
export interface Variety {
  name: string
  kind: string
  species: Species
  shape: Shape
  color: string
  note: string
}
export const VARIETIES: Variety[] = [
  { name: 'Apeldoorn', kind: 'Darwin Hybrid tulip', species: 'tulip', shape: 'cup', color: '#d8281c', note: 'A tall, sturdy classic of the Dutch bulb fields.' },
  { name: 'Strong Gold', kind: 'Single late tulip', species: 'tulip', shape: 'cup', color: '#f2c312', note: 'Bright butter-yellow cups on strong stems.' },
  { name: 'Queen of Night', kind: 'Single late tulip', species: 'tulip', shape: 'cup', color: '#3a1030', note: 'Famed for its velvety, almost-black maroon petals.' },
  { name: 'Pink Impression', kind: 'Darwin Hybrid tulip', species: 'tulip', shape: 'cup', color: '#e86a98', note: 'Large, rose-pink blooms.' },
  { name: 'Ballerina', kind: 'Lily-flowered tulip', species: 'tulip', shape: 'lily', color: '#f28414', note: 'Elegant pointed petals in glowing orange.' },
  { name: 'White Triumphator', kind: 'Lily-flowered tulip', species: 'tulip', shape: 'lily', color: '#f5f2e8', note: 'Slender, pure-white lily-shaped flowers.' },
  { name: 'Purple Prince', kind: 'Single early tulip', species: 'tulip', shape: 'cup', color: '#7c2d9c', note: 'A rich royal purple.' },
  { name: 'Orange Emperor', kind: 'Fosteriana tulip', species: 'tulip', shape: 'cup', color: '#f26412', note: 'Early, big-cupped and brilliantly orange.' },
  { name: 'Don Quichotte', kind: 'Triumph tulip', species: 'tulip', shape: 'cup', color: '#cf3283', note: 'Vivid magenta-pink.' },
  { name: 'Angélique', kind: 'Double late tulip', species: 'tulip', shape: 'double', color: '#f3bdd0', note: 'Peony-like, softly blushed double blossoms.' },
  { name: 'Monte Carlo', kind: 'Double early tulip', species: 'tulip', shape: 'double', color: '#f7d22c', note: 'Sunny, fragrant double flowers.' },
  { name: 'Red Impression', kind: 'Darwin Hybrid tulip', species: 'tulip', shape: 'cup', color: '#c4141f', note: 'Deep scarlet, a long-lasting favourite.' },
  { name: 'Tête-à-tête', kind: 'Dwarf daffodil', species: 'daffodil', shape: 'cup', color: '#f7cd18', note: 'Early, sunny, and cheerful.' },
  { name: 'Ice Follies', kind: 'Large-cupped daffodil', species: 'daffodil', shape: 'cup', color: '#fff2b0', note: 'Creamy petals around a pale lemon cup.' },
  { name: 'Delft Blue', kind: 'Hyacinth', species: 'hyacinth', shape: 'cup', color: '#7592dc', note: 'Soft porcelain-blue, intensely scented.' },
  { name: 'Pink Pearl', kind: 'Hyacinth', species: 'hyacinth', shape: 'cup', color: '#e585ae', note: 'Deep rose-pink, richly fragrant.' },
  { name: 'Woodstock', kind: 'Hyacinth', species: 'hyacinth', shape: 'cup', color: '#7a2c68', note: 'Plum-purple spires.' },
  { name: 'Grape hyacinth', kind: 'Muscari armeniacum', species: 'muscari', shape: 'cup', color: '#3a4ec6', note: 'Tiny cobalt-blue bells, planted in rivers.' },
]
const TULIP_IDS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]

/* ------------------------------------------------------------------ geometry types */
export interface PathDef {
  pts: Pt[]
  w: number
  kind: 'gravel' | 'paver'
  closed?: boolean
}
export interface Bed {
  id: number
  poly: Pt[]
  cx: number
  cz: number
  b: { x0: number; z0: number; x1: number; z1: number }
  area: number
  species: Species
  shape: Shape
  va: number
  vb: number
  mode: 'solo' | 'stripes' | 'drift' | 'border'
  y: number
  indoor?: boolean
  seed: number
}
export interface Rect {
  x0: number
  z0: number
  x1: number
  z1: number
}
export interface Box {
  cx: number
  cz: number
  hx: number
  hz: number
}
export type TreeKind = 'beech' | 'oak' | 'cherry' | 'magnolia' | 'birch' | 'poplar' | 'willow' | 'plane'
export interface TreeDef {
  x: number
  z: number
  kind: TreeKind
  s: number
  rot: number
  v: number
}
export interface PoiDef {
  id: string
  name: string
  x: number
  z: number
  y: number
  eye?: number
  look: number // yaw to face when teleporting
  tag: string
  text: string
  facts: [string, string][]
}

/* ------------------------------------------------------------------ lake & canal */
const lakeR = (t: number) => 1 + 0.1 * Math.sin(2 * t + 1) + 0.07 * Math.sin(3 * t + 2) + 0.045 * Math.sin(5 * t + 0.4) + 0.03 * Math.sin(7 * t)
function lakeOutline(off: number, n = 120): Pt[] {
  const out: Pt[] = []
  for (let i = 0; i < n; i++) {
    const t = (i / n) * TAU
    const f = lakeR(t)
    out.push([LAKE_C[0] + (62 * f + off) * Math.cos(t), LAKE_C[1] + (23 * f + off) * Math.sin(t)])
  }
  return out
}
export const lakePoly = lakeOutline(0)
const lakeBox = polyBounds(lakePoly)

export function waterSD(x: number, z: number): number {
  let d = 99
  if (x > lakeBox.x0 - 20 && x < lakeBox.x1 + 20 && z > lakeBox.z0 - 20 && z < lakeBox.z1 + 20) {
    d = distToPath(x, z, lakePoly, true)
    if (pointInPoly(x, z, lakePoly)) d = -d
  }
  const c = Math.abs(z - CANAL_Z) - CANAL_HW
  return Math.min(d, c)
}

/* ------------------------------------------------------------------ buildings */
export const PAVILION = { cx: -60, cz: 36, hx: 22, hz: 9, h: 7.4 }
export const CAFE = { cx: 62, cz: 36, hx: 13, hz: 7, h: 5.2 }
export const GATE = { z: 124, hw: 9.5 }
export const buildings: Box[] = [
  { cx: PAVILION.cx, cz: PAVILION.cz, hx: PAVILION.hx, hz: PAVILION.hz },
  { cx: CAFE.cx, cz: CAFE.cz, hx: CAFE.hx, hz: CAFE.hz },
]
export const plazas: Rect[] = [
  { x0: -74, z0: 44, x1: -46, z1: 62 },
  { x0: 48, z0: 42, x1: 76, z1: 62 },
  { x0: -26, z0: 100, x1: 26, z1: 138 },
]
export const MILL_APRON = 8.2

/* ------------------------------------------------------------------ paths */
function buildPaths(): PathDef[] {
  const P: PathDef[] = []
  const sp = (pts: Pt[], w: number, kind: 'gravel' | 'paver' = 'gravel', closed = false) => P.push({ pts: smoothPath(pts, closed, 10), w, kind, closed })
  sp([[0, 138], [0, 100], [0, 56], [0, 18], [0, -8]], 8.5)
  sp(lakeOutline(8.2, 40), 5, 'gravel', true)
  sp([[-100, 62], [-50, 62], [0, 62], [50, 62], [100, 62]], 5)
  sp([[-100, 15], [-50, 15], [0, 15], [50, 15], [100, 15]], 5)
  sp([[72, -36], [90, -18], [98, 15]], 5)
  sp([[-72, -36], [-90, -18], [-98, 15]], 5)
  sp([[100, 15], [100, 62]], 5)
  sp([[-100, 15], [-100, 62]], 5)
  sp([[100, 62], [88, 88], [56, 106], [26, 112]], 5)
  sp([[-100, 62], [-88, 88], [-56, 106], [-26, 112]], 5)
  sp([[0, -74], [0, -82]], 4.5)
  return P
}
export const paths = buildPaths()

/* ------------------------------------------------------------------ queries */
export function pathSD(x: number, z: number): number {
  let d = 99
  for (const p of paths) {
    const dd = distToPath(x, z, p.pts, !!p.closed) - p.w / 2
    if (dd < d) d = dd
  }
  for (const r of plazas) {
    const dx = Math.max(r.x0 - x, 0, x - r.x1)
    const dz = Math.max(r.z0 - z, 0, z - r.z1)
    d = Math.min(d, Math.hypot(dx, dz) - (dx === 0 && dz === 0 ? 1 : 0))
  }
  d = Math.min(d, Math.hypot(x - MILL.x, z - MILL.z) - MILL_APRON)
  return d
}
function boxSD(x: number, z: number, b: Box) {
  return Math.max(Math.abs(x - b.cx) - b.hx, Math.abs(z - b.cz) - b.hz)
}
export function insideBuilding(x: number, z: number, m = 0) {
  return buildings.some((b) => boxSD(x, z, b) < m)
}

/** Gravel ground: smooth bank profile around water, tiny lawn undulation, mill mound. */
export function groundHeight(x: number, z: number): number {
  const d = waterSD(x, z)
  let h = 0
  const und = (fbm(x * 0.02, z * 0.02, 3, 4) - 0.5) * 0.22
  h += und * smooth(-1, 6, d) // flatten at the shore
  if (d < 0) {
    const t = smooth(0.6, -5, d)
    h = lerp(h, -1.7, t)
  } else if (d < 3) {
    h -= 0.1 * (1 - d / 3) // slight shore dip
  }
  const rm = Math.hypot(x - MILL.x, z - MILL.z)
  h += 0.35 * smooth(14, 6, rm)
  if (insideBuilding(x, z, 0.5)) h = Math.max(h, 0.05)
  return h
}

/* ------------------------------------------------------------------ beds */
function superellipse(cx: number, cz: number, rx: number, rz: number, seed: number, n = 28): Pt[] {
  const pts: Pt[] = []
  for (let i = 0; i < n; i++) {
    const t = (i / n) * TAU
    const c = Math.cos(t)
    const s = Math.sin(t)
    const e = 2 / 3.2
    const px = Math.sign(c) * Math.pow(Math.abs(c), e)
    const pz = Math.sign(s) * Math.pow(Math.abs(s), e)
    const w = 1 + (fbm(cx * 0.3 + Math.cos(t) * 2 + seed, cz * 0.3 + Math.sin(t) * 2, 2, seed) - 0.5) * 0.28
    pts.push([cx + px * rx * w, cz + pz * rz * w])
  }
  return pts
}
const scalePoly = (p: Pt[], cx: number, cz: number, k: number): Pt[] => p.map(([x, z]) => [cx + (x - cx) * k, cz + (z - cz) * k])

function indoorBeds(): Bed[] {
  const mk = (id: number, x0: number, z0: number, x1: number, z1: number, species: Species, shape: Shape, va: number, vb: number, mode: Bed['mode']): Bed => {
    const c = 0.9
    const poly: Pt[] = [[x0 + c, z0], [x1 - c, z0], [x1, z0 + c], [x1, z1 - c], [x1 - c, z1], [x0 + c, z1], [x0, z1 - c], [x0, z0 + c]]
    return { id, poly, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, b: { x0, z0, x1, z1 }, area: (x1 - x0) * (z1 - z0), species, shape, va, vb, mode, y: 0.55, indoor: true, seed: id * 13 }
  }
  const { cx, cz } = PAVILION
  return [
    mk(900, cx - 20, cz - 7, cx - 6, cz - 1.2, 'tulip', 'double', 9, 3, 'stripes'),
    mk(901, cx - 20, cz + 1.8, cx - 6, cz + 6.5, 'tulip', 'lily', 4, 5, 'drift'),
    mk(902, cx + 6, cz - 7, cx + 20, cz - 1.2, 'tulip', 'lily', 5, 4, 'stripes'),
    mk(903, cx + 6, cz + 1.8, cx + 20, cz + 6.5, 'tulip', 'double', 10, 9, 'drift'),
    mk(904, cx - 3.2, cz - 7, cx + 3.2, cz - 1.5, 'hyacinth', 'cup', 14, 15, 'border'),
  ]
}

function buildBeds(fixedTrees: TreeDef[]) {
  const r = rng(2024)
  const beds: Bed[] = []
  const expanded: Pt[][] = []
  let area = 0
  const clear = (x: number, z: number, m: number) => {
    if (x < -112 || x > 112 || z < -97 || z > 108) return false
    if (pathSD(x, z) < m) return false
    if (waterSD(x, z) < m + 1.5) return false
    if (insideBuilding(x, z, m + 1.5)) return false
    for (const t of fixedTrees) if (Math.hypot(x - t.x, z - t.z) < 1.8) return false
    if (x > MILL.x + 2 && x < MILL.x + 18 && Math.abs(z - MILL.z) < 5) return false // keep the mill stair clear
    return true
  }
  // fill the garden with drifts: jittered cells, each trying progressively smaller shapes until it fits
  const cells: [number, number][] = []
  for (let gz = -94, row = 0; gz <= 106; gz += 15.5, row++) {
    for (let gx = -108 + (row % 2) * 6; gx <= 108; gx += 12) cells.push([gx, gz])
  }
  shuffle(cells, r)
  const keyOf = (c: [number, number]) => Math.min(pathSD(c[0], c[1]), 30) + r() * 14
  cells.sort((a, b) => keyOf(a) - keyOf(b))
  for (const [gx, gz] of cells) {
    if (area > 11500) break
    const cx0 = gx + (r() - 0.5) * 3
    const cz0 = gz + (r() - 0.5) * 3
    const near = pathSD(cx0, cz0) < 16 || waterSD(cx0, cz0) < 20
    if (!near && r() < 0.3) continue
    const swap = r() < 0.4
    for (const k of [1, 0.84, 0.68, 0.52]) {
      const a = (4.3 + r() * 1.3) * k
      const b = (5.8 + r() * 2.4) * k
      const rx = swap ? b : a
      const rz = swap ? a : b
      const cx = cx0
      const cz = cz0
      if (!clear(cx, cz, 2.5)) continue
      const poly = superellipse(cx, cz, rx, rz, Math.floor(r() * 90))
      if (!poly.every(([x, z]) => clear(x, z, 1.4))) continue
      const ex = scalePoly(poly, cx, cz, 1 + 0.8 / Math.min(rx, rz))
      if (expanded.some((o, i) => poly.some(([x, z]) => pointInPoly(x, z, o)) || ex.some(([x, z]) => pointInPoly(x, z, beds[i].poly)) || pointInPoly(beds[i].cx, beds[i].cz, ex) || pointInPoly(cx, cz, o))) continue
      const bnd = polyBounds(poly)
      const ar = (bnd.x1 - bnd.x0) * (bnd.z1 - bnd.z0) * 0.8
      const q = r()
      let species: Species = 'tulip'
      if (q > 0.95) species = 'muscari'
      else if (q > 0.88) species = 'hyacinth'
      else if (q > 0.8) species = 'daffodil'
      const sq = r()
      const shape: Shape = species === 'tulip' ? (sq < 0.62 ? 'cup' : sq < 0.84 ? 'lily' : 'double') : 'cup'
      const pool = species === 'tulip' ? TULIP_IDS.filter((i) => VARIETIES[i].shape === shape) : species === 'daffodil' ? [12, 13] : species === 'hyacinth' ? [14, 15, 16] : [17]
      const va = pool[Math.floor(r() * pool.length)]
      let vb = pool[Math.floor(r() * pool.length)]
      if (vb === va) vb = species === 'tulip' && shape === 'cup' ? TULIP_IDS.filter((i) => VARIETIES[i].shape === 'cup' && i !== va)[Math.floor(r() * 7)] : pool[(pool.indexOf(va) + 1) % pool.length]
      const mq = r()
      const mode: Bed['mode'] = mq < 0.3 ? 'solo' : mq < 0.55 ? 'stripes' : mq < 0.85 ? 'drift' : 'border'
      beds.push({ id: beds.length, poly, cx, cz, b: bnd, area: ar, species, shape, va, vb, mode, y: 0, seed: Math.floor(r() * 1000) })
      expanded.push(ex)
      area += ar
      break
    }
  }
  // keep indoor beds separately at the end
  return beds.concat(indoorBeds())
}

/* ------------------------------------------------------------------ trees */
function buildTrees(): { fixed: TreeDef[]; fn: (beds: Bed[]) => TreeDef[] } {
  const r = rng(77)
  const fixed: TreeDef[] = []
  for (let z = 112; z > -2; z -= 11.5) {
    for (const s of [-1, 1]) {
      const kind: TreeKind = Math.floor(z / 11.5) % 3 === 0 ? 'cherry' : 'plane'
      fixed.push({ x: s * (6.6 + r() * 0.5), z: z + (r() - 0.5) * 2, kind, s: 0.9 + r() * 0.22, rot: r() * TAU, v: Math.floor(r() * 3) })
    }
  }
  const fn = (beds: Bed[]): TreeDef[] => {
    const out: TreeDef[] = [...fixed]
    const r2 = rng(311)
    const inBed = (x: number, z: number, m: number) => beds.some((b) => !b.indoor && x > b.b.x0 - m && x < b.b.x1 + m && z > b.b.z0 - m && z < b.b.z1 + m && pointInPoly(x, z, scalePoly(b.poly, b.cx, b.cz, 1 + m / 4)))
    const ok = (x: number, z: number, m: number, sep: number) => {
      if (pathSD(x, z) < m) return false
      if (waterSD(x, z) < 1.5) return false
      if (insideBuilding(x, z, m + 1)) return false
      if (Math.hypot(x - MILL.x, z - MILL.z) < 14) return false
      if (inBed(x, z, 1.2)) return false
      for (const t of out) if (Math.hypot(x - t.x, z - t.z) < sep) return false
      return true
    }
    const pick = (): TreeKind => {
      const q = r2()
      return q < 0.26 ? 'beech' : q < 0.44 ? 'oak' : q < 0.7 ? 'cherry' : q < 0.8 ? 'magnolia' : q < 0.92 ? 'birch' : 'plane'
    }
    // groves in the park
    for (let i = 0; i < 2600 && out.length < 150; i++) {
      const x = (r2() * 2 - 1) * 125
      const z = -98 + r2() * 232
      const g = fbm(x * 0.025 + 3, z * 0.025, 3, 8)
      const edge = Math.abs(x) > 96 || z > 110 ? 0.25 : 0
      if (g + edge < 0.5 && r2() > 0.06) continue
      if (!ok(x, z, 2.4, 7.5)) continue
      const kind = pick()
      out.push({ x, z, kind, s: (kind === 'magnolia' ? 0.75 : 0.85) + r2() * 0.55, rot: r2() * TAU, v: Math.floor(r2() * 3) })
    }
    // willows on the lake shore
    for (let i = 0; i < 400; i++) {
      const t = r2() * TAU
      const f = lakeR(t)
      const off = 4 + r2() * 1.5
      const x = LAKE_C[0] + (62 * f + off) * Math.cos(t)
      const z = LAKE_C[1] + (23 * f + off) * Math.sin(t)
      if (z < -62 && Math.abs(x) < 20) continue
      if (!ok(x, z, 3.4, 14)) continue
      out.push({ x, z, kind: 'willow', s: 0.95 + r2() * 0.4, rot: r2() * TAU, v: Math.floor(r2() * 3) })
      if (out.filter((t) => t.kind === 'willow').length > 7) break
    }
    // poplar rows along the canal and the horizon
    for (let x = -330; x < 330; x += 17 + hash2(x, 1) * 7) {
      out.push({ x, z: -118 - hash2(x, 3) * 6, kind: 'poplar', s: 1.1 + hash2(x, 5) * 0.5, rot: r2() * TAU, v: Math.floor(r2() * 3) })
    }
    for (let x = -330; x < 330; x += 11 + hash2(x, 2) * 14) {
      const z = 150 + hash2(x, 6) * 60
      if (Math.abs(x) < 40 && z < 190) continue
      out.push({ x, z: z + 20, kind: hash2(x, 8) > 0.5 ? 'poplar' : 'oak', s: 1 + hash2(x, 9) * 0.6, rot: r2() * TAU, v: Math.floor(r2() * 3) })
    }
    for (let i = 0; i < 70; i++) {
      const a = r2() * TAU
      const rad = 230 + r2() * 220
      const x = Math.cos(a) * rad
      const z = Math.sin(a) * rad
      if (z < -135 && r2() > 0.3) continue
      out.push({ x, z, kind: r2() > 0.4 ? 'poplar' : 'beech', s: 1.2 + r2() * 0.7, rot: r2() * TAU, v: Math.floor(r2() * 3) })
    }
    return out
  }
  return { fixed, fn }
}

/* ------------------------------------------------------------------ benches / lamps */
export interface Prop {
  x: number
  z: number
  rot: number
}
function buildProps(trees: TreeDef[]) {
  const r = rng(8)
  const benches: Prop[] = []
  const lamps: Prop[] = []
  const place = (list: Prop[], p: Pt[], every: number, off: number, sepSame: number, side = 1) => {
    let acc = 0
    for (let i = 0; i < p.length - 1; i++) {
      const [ax, az] = p[i]
      const [bx, bz] = p[i + 1]
      const l = Math.hypot(bx - ax, bz - az)
      acc += l
      if (acc > every) {
        acc = 0
        const nx = -(bz - az) / l
        const nz = (bx - ax) / l
        const x = (ax + bx) / 2 + nx * off * side
        const z = (az + bz) / 2 + nz * off * side
        if (waterSD(x, z) < 2.5 || insideBuilding(x, z, 2)) continue
        if (trees.some((t) => Math.hypot(t.x - x, t.z - z) < 2.2)) continue
        if (list.some((q) => Math.hypot(q.x - x, q.z - z) < sepSame)) continue
        list.push({ x, z, rot: Math.atan2(-nx * side, -nz * side) })
      }
    }
  }
  const [avenue, ring, cross1, cross2] = paths
  place(benches, avenue.pts, 26, 5.6, 14, 1)
  place(benches, avenue.pts, 31, 5.6, 14, -1)
  place(benches, ring.pts, 22, 3.9, 12, -1)
  place(benches, cross1.pts, 40, 3.5, 14, 1)
  place(benches, cross2.pts, 40, 3.5, 14, -1)
  place(lamps, avenue.pts, 24, 4.9, 20, 1)
  place(lamps, avenue.pts, 24, 4.9, 20, -1)
  place(lamps, cross1.pts, 36, 3, 20, 1)
  void r
  return { benches, lamps }
}

/* ------------------------------------------------------------------ POIs */
export const POIS: PoiDef[] = [
  {
    id: 'gate', name: 'Main Entrance', x: 0, z: 118, y: 6.5, look: 0, tag: 'Welcome',
    text: 'Keukenhof — the “Garden of Europe” — opens its gates for about eight weeks each spring. The word means “kitchen garden”: in the 15th century this was the herb and kitchen garden of Countess Jacoba of Bavaria’s castle.',
    facts: [['Opened to the public', '1950'], ['Area', '32 hectares'], ['Season', 'mid-March – mid-May']],
  },
  {
    id: 'avenue', name: 'The Flower Beds', x: 14, z: 72, y: 3.2, look: 0.5, tag: 'Plantings',
    text: 'Every autumn some seven million bulbs are planted here by hand, in loosely woven “drifts” rather than rigid blocks. Stand still for a moment — each swathe is a different cultivar, chosen so that colour and flowering time overlap across the season.',
    facts: [['Bulbs planted / year', '~7 million'], ['Footpaths', '~15 km'], ['Tip', 'Look at a bed to read its cultivar']],
  },
  {
    id: 'pavilion', name: 'Glasshouse Pavilion', x: -60, z: 47, y: 9, look: 0, tag: 'Indoor show',
    text: 'The park’s indoor pavilions stage weather-proof flower shows. Raised beds of lily-flowered and double tulips, and fragrant hyacinths, are arranged for close-up viewing — a place to see petal detail at eye level. (Interpretive recreation.)',
    facts: [['Highlights', 'Lily-flowered & double tulips'], ['Design idea', 'Glass walls, white frame']],
  },
  {
    id: 'cafe', name: 'Garden Café & Terrace', x: 62, z: 46, y: 6, look: 0, tag: 'Rest stop',
    text: 'A sunny terrace for coffee and poffertjes between beds. Original estate designers Zocher & Zocher (who also drew Amsterdam’s Vondelpark) laid out the winding English-landscape paths that still shape the park today.',
    facts: [['Landscape architects', 'J.D. & L.P. Zocher'], ['Landscape redesign', '1857']],
  },
  {
    id: 'lake', name: 'The Water Garden', x: 0, z: -9, y: 3, look: 0, tag: 'Water & wildlife',
    text: 'Still water doubles every colour. Swans glide past willows and reeds, and quiet electric “whisper boats” explore the canals along the bulb fields. The lake’s curved banks follow the original English landscape style.',
    facts: [['Wildlife', 'Swans, coots, ducks'], ['Boats', 'Electric “whisper” boats']],
  },
  {
    id: 'mill', name: 'The Windmill', x: 3, z: -80, y: 18, look: 0.1, tag: 'Icon',
    text: 'Built in 1892 at Scharmer in Groningen as a polder mill to pump water from drained land, this mill was bought by the Holland America Line and donated to Keukenhof in 1957. A platform around its base looks out across the commercial bulb fields. Climb the stairs and enjoy the view.',
    facts: [['Built', '1892 (Scharmer, Groningen)'], ['Moved to Keukenhof', '1957'], ['Original purpose', 'Polder drainage']],
  },
  {
    id: 'fields', name: 'The Bulb Fields', x: 0, z: -135, y: 6, look: Math.PI, tag: 'Beyond the garden',
    text: 'Beyond the canal lie the working bulb fields of the Bollenstreek — the famous stripes in every Dutch spring photograph. Growers cut the flower heads so the bulbs underground grow fat for next year.',
    facts: [['Region', 'Bollenstreek, Zuid-Holland'], ['Pattern', 'Long single-colour stripes']],
  },
]

/* ------------------------------------------------------------------ build */
export interface Layout {
  beds: Bed[]
  trees: TreeDef[]
  benches: Prop[]
  lamps: Prop[]
}
let cached: Layout | null = null
export function getLayout(): Layout {
  if (cached) return cached
  const t = buildTrees()
  const beds = buildBeds(t.fixed)
  const trees = t.fn(beds.filter((b) => !b.indoor))
  const { benches, lamps } = buildProps(trees)
  cached = { beds, trees, benches, lamps }
  return cached
}

/** Is a point plain walkable lawn (no path, bed, water, building)? */
export function isLawn(x: number, z: number, beds: Bed[]) {
  if (z < CANAL_Z + CANAL_HW + 2) return false
  if (waterSD(x, z) < 0.5) return false
  if (pathSD(x, z) < 0.3) return false
  if (insideBuilding(x, z, 0.5)) return false
  for (const b of beds) if (!b.indoor && x > b.b.x0 - 0.5 && x < b.b.x1 + 0.5 && z > b.b.z0 - 0.5 && z < b.b.z1 + 0.5 && pointInPoly(x, z, b.poly)) return false
  return true
}

export function bedAt(x: number, z: number, beds: Bed[]): Bed | null {
  for (const b of beds) if (x > b.b.x0 && x < b.b.x1 && z > b.b.z0 && z < b.b.z1 && pointInPoly(x, z, b.poly)) return b
  return null
}

/** which variety index is growing at a point inside a bed */
export function varietyAt(b: Bed, x: number, z: number): number {
  const n = fbm(x * 0.35 + b.seed, z * 0.35, 3, b.seed)
  switch (b.mode) {
    case 'solo':
      return n > 0.9 ? b.vb : b.va
    case 'stripes': {
      const k = Math.floor((b.b.x1 - b.b.x0 > b.b.z1 - b.b.z0 ? x : z) / 1.7 + n * 0.7)
      return k % 2 === 0 ? b.va : b.vb
    }
    case 'drift':
      return n > 0.52 ? b.vb : b.va
    case 'border': {
      const d = Math.min(Math.abs(x - b.cx) / ((b.b.x1 - b.b.x0) / 2), Math.abs(z - b.cz) / ((b.b.z1 - b.b.z0) / 2))
      return d > 0.62 + (n - 0.5) * 0.2 ? b.vb : b.va
    }
  }
}
export { clamp }

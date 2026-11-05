// Cross-section of the Afsluitdijk (units: metres, y = height above NAP).
// World axes: +x runs along the dike towards Friesland, -z is north (Wadden Sea), +z is south (IJsselmeer).

import { smoothstep } from './noise'

export const ROAD_Y = 7.6
export const ROAD_HALF = 11.9
export const MEDIAN_HALF = 1.6
export const IJ_LEVEL = -0.4
export const X_LIMIT = 1700

export const tideLevel = (t: number) => 0.2 + 0.7 * Math.sin(t * 0.03)

function trap(x: number, x0: number, x1: number, ramp: number) {
  return smoothstep(x0 - ramp, x0, x) * smoothstep(x1 + ramp, x1, x)
}

/** Southern monument plaza (parking, Dudok tower) */
export const PLAZA_S = { x0: -62, x1: 22, ramp: 22, depth: 26 }
/** Northern terrace (Lely statue) */
export const TERRACE_N = { x0: -14, x1: 34, ramp: 16, depth: 24 }

export const dS = (x: number) => PLAZA_S.depth * trap(x, PLAZA_S.x0, PLAZA_S.x1, PLAZA_S.ramp)
export const dN = (x: number) => TERRACE_N.depth * trap(x, TERRACE_N.x0, TERRACE_N.x1, TERRACE_N.ramp)

export type SegId =
  | 'bedN'
  | 'levvel'
  | 'berm'
  | 'basalt'
  | 'kerbFace'
  | 'kerbTop'
  | 'terraceN'
  | 'cycleN'
  | 'vergeN'
  | 'road'
  | 'vergeS'
  | 'cycleS'
  | 'plazaS'
  | 'slopeS'
  | 'shoreS'
  | 'bedS'

interface SegDef {
  id: SegId
  w: (x: number) => number
  y0: number
  y1: number
}

// ordered outward from the road
const N_DEFS: SegDef[] = [
  { id: 'vergeN', w: () => 2.4, y0: 7.6, y1: 7.5 },
  { id: 'cycleN', w: () => 3.6, y0: 7.5, y1: 7.4 },
  { id: 'terraceN', w: dN, y0: 7.4, y1: 7.4 },
  { id: 'kerbTop', w: () => 0.6, y0: 7.4, y1: 7.5 },
  { id: 'kerbFace', w: () => 0.35, y0: 7.5, y1: 6.95 },
  { id: 'basalt', w: () => 9, y0: 6.95, y1: 4.1 },
  { id: 'berm', w: () => 4, y0: 4.1, y1: 4.0 },
  { id: 'levvel', w: () => 26, y0: 4.0, y1: -2.8 },
  { id: 'bedN', w: () => 70, y0: -2.8, y1: -5.2 },
]
const S_DEFS: SegDef[] = [
  { id: 'vergeS', w: () => 2.4, y0: 7.6, y1: 7.5 },
  { id: 'cycleS', w: () => 3.2, y0: 7.5, y1: 7.4 },
  { id: 'plazaS', w: dS, y0: 7.4, y1: 7.4 },
  { id: 'slopeS', w: () => 26, y0: 7.4, y1: 0.3 },
  { id: 'shoreS', w: () => 6, y0: 0.3, y1: -0.9 },
  { id: 'bedS', w: () => 70, y0: -0.9, y1: -3.2 },
]

export interface Seg {
  id: SegId
  za: number // northern z (smaller)
  ya: number
  zb: number
  yb: number
}

/** Segments ordered north -> south at position x. */
export function segmentsAt(x: number): Seg[] {
  const out: Seg[] = []
  // north side, built outward then reversed
  let z = -ROAD_HALF
  const north: Seg[] = []
  for (const d of N_DEFS) {
    const w = d.w(x)
    north.push({ id: d.id, za: z - w, ya: d.y1, zb: z, yb: d.y0 })
    z -= w
  }
  north.reverse()
  out.push(...north)
  out.push({ id: 'road', za: -ROAD_HALF, ya: ROAD_Y, zb: ROAD_HALF, yb: ROAD_Y })
  z = ROAD_HALF
  for (const d of S_DEFS) {
    const w = d.w(x)
    out.push({ id: d.id, za: z, ya: d.y0, zb: z + w, yb: d.y1 })
    z += w
  }
  return out
}

/** Terrain height of the dike at (x, z). */
export function terrainY(x: number, z: number): number {
  const segs = segmentsAt(x)
  if (z <= segs[0].za) return segs[0].ya
  for (const s of segs) {
    if (z >= s.za && z <= s.zb) {
      const w = s.zb - s.za
      if (w < 1e-6) continue
      return s.ya + ((z - s.za) / w) * (s.yb - s.ya)
    }
  }
  return segs[segs.length - 1].yb
}

/** Handy named z positions (outside the plaza/terrace ramps). */
export const Z = {
  roadN: -ROAD_HALF,
  roadS: ROAD_HALF,
  laneEastInner: 3.35,
  laneEastOuter: 6.85,
  laneWestInner: -3.35,
  laneWestOuter: -6.85,
  railN: -ROAD_HALF - 0.9,
  railS: ROAD_HALF + 0.9,
  cycleN: -(ROAD_HALF + 2.4 + 1.8),
  cycleS: ROAD_HALF + 2.4 + 1.6,
  terraceNStart: -(ROAD_HALF + 2.4 + 3.6),
  plazaSStart: ROAD_HALF + 2.4 + 3.2,
  bermN: -(ROAD_HALF + 2.4 + 3.6 + 0.95 + 9 + 2),
}

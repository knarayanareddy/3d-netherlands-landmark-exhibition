import * as THREE from 'three'
import { DATA, Grid, bbox, ptsOf, type BuildingData } from './data'
import { Mesher, ccw, obb, pointInPoly, distToSeg, signedArea, type Pt, type OBB } from './geo'
import type { Mats, FacadeKey } from './materials'
import { hash, rng } from './noise'

/** buildings that are modelled by hand in landmarks.ts */
export const CUSTOM_IDS = new Set<number>([60302729, 44383989])

const FAC: Record<FacadeKey, { bay: number; fh: number }> = {
  brickRed: { bay: 3.2, fh: 3.2 }, brickBrown: { bay: 3.2, fh: 3.2 }, brickYellow: { bay: 3.2, fh: 3.2 },
  houseRed: { bay: 3.2, fh: 3.2 }, houseBrown: { bay: 3.2, fh: 3.2 },
  ribbon: { bay: 3.6, fh: 3.4 }, ribbonDark: { bay: 3.6, fh: 3.4 },
  curtainBlue: { bay: 1.5, fh: 3.8 }, curtainGreen: { bay: 1.5, fh: 3.8 },
  panelWhite: { bay: 3.0, fh: 3.6 }, panelWarm: { bay: 3.0, fh: 3.6 }, industrial: { bay: 3.0, fh: 4.0 },
}

const STYLE_OVERRIDE: Record<number, FacadeKey> = {
  44383236: 'brickRed', 44383737: 'brickYellow', 551121051: 'ribbon', 253721837: 'ribbon', 253722326: 'ribbonDark',
  44385776: 'panelWhite', 44385782: 'industrial', 775124204: 'brickBrown', 720565368: 'brickBrown', 720565367: 'ribbon',
  720565371: 'ribbon', 253722455: 'curtainGreen', 886526035: 'panelWarm', 385279659: 'curtainBlue', 1147063317: 'panelWhite',
  779656995: 'panelWhite', 44385979: 'panelWarm', 253722355: 'curtainBlue', 124259673: 'panelWhite', 531561222: 'ribbonDark',
  158716548: 'panelWhite', 253722357: 'brickBrown', 253721840: 'brickBrown', 68512537: 'panelWarm', 44385169: 'industrial',
  253724107: 'industrial', 32738710: 'brickBrown', 417081436: 'industrial', 417081438: 'industrial', 60302729: 'curtainGreen',
}
const HEIGHT_OVERRIDE: Record<number, number> = { 44383989: 9.2, 44383236: 19, 44383737: 16, 551121051: 15 }

const HOUSE = new Set(['house', 'detached', 'semidetached_house', 'terrace', 'residential', 'bungalow', 'farm'])
const SHEDS = new Set(['shed', 'garage', 'garages', 'roof', 'service', 'container', 'guardhouse', 'industrial', 'warehouse', 'greenhouse', 'construction'])

function styleFor(b: BuildingData): FacadeKey {
  if (STYLE_OVERRIDE[b.id]) return STYLE_OVERRIDE[b.id]
  const r = hash(b.id, 3, 1)
  const t = b.t
  if (HOUSE.has(t)) return r < 0.6 ? 'houseRed' : 'houseBrown'
  if (t === 'apartments' || t === 'dormitory') return r < 0.4 ? 'brickRed' : r < 0.7 ? 'brickBrown' : 'panelWarm'
  if (SHEDS.has(t)) return t === 'shed' || t === 'garage' || t === 'garages' ? (r < 0.5 ? 'houseBrown' : 'industrial') : 'industrial'
  if (t === 'university' || t === 'school') return r < 0.3 ? 'ribbon' : r < 0.55 ? 'panelWhite' : r < 0.8 ? 'brickBrown' : 'curtainBlue'
  if (t === 'commercial' || t === 'retail' || t === 'office' || t === 'hotel') return r < 0.35 ? 'panelWhite' : r < 0.65 ? 'panelWarm' : r < 0.85 ? 'curtainBlue' : 'brickRed'
  if (t === 'church') return 'brickBrown'
  return r < 0.5 ? 'panelWhite' : 'brickBrown'
}

export interface BuildingInfo { id: number; cx: number; cz: number; h: number; P: Pt[]; o: OBB; ref: string; name: string }

export interface BuildingsResult {
  group: THREE.Group
  grid: Grid<{ P: Pt[]; id: number }>
  info: Map<number, BuildingInfo>
}

export function buildBuildings(mats: Mats): BuildingsResult {
  const group = new THREE.Group()
  const wallM: Partial<Record<FacadeKey, Mesher>> = {}
  const wall = (k: FacadeKey) => (wallM[k] ??= new Mesher())
  const roofM = new Mesher(), tilesM = new Mesher(), equipM = new Mesher()
  const grid = new Grid<{ P: Pt[]; id: number }>(24)
  const info = new Map<number, BuildingInfo>()

  for (const b of DATA.buildings) {
    if (CUSTOM_IDS.has(b.id) && b.id !== 44383989) continue // library is handled by landmarks.ts (Aula keeps colliders)
    const P0 = ptsOf(b.p)
    const Pc = ccw(P0)
    const bb = bbox(Pc)
    grid.addBox(bb.x0 - 0.5, bb.z0 - 0.5, bb.x1 + 0.5, bb.z1 + 0.5, { P: Pc, id: b.id })
    const bo = obb(Pc)
    let top = HEIGHT_OVERRIDE[b.id] ?? b.h
    for (const p of b.parts) top = Math.max(top, p.h)
    info.set(b.id, { id: b.id, cx: b.cx, cz: b.cz, h: top, P: Pc, o: bo, ref: b.ref, name: b.name })
    if (CUSTOM_IDS.has(b.id)) continue

    const style = styleFor(b)
    const items: { P: Pt[]; h: number; mh: number; roof: string; seed: number; style: FacadeKey; t: string; mat: string }[] = []
    if (!b.skip) items.push({ P: Pc, h: HEIGHT_OVERRIDE[b.id] ?? b.h, mh: b.mh, roof: b.roof, seed: b.id, style, t: b.t, mat: b.mat })
    b.parts.forEach((p, i) => {
      const pp = ccw(ptsOf(p.p))
      let ps = style
      if (p.mat === 'glass' || p.h >= 60) ps = 'curtainBlue'
      else if (p.mat === 'concrete' || p.mat === 'metal') ps = 'ribbonDark'
      items.push({ P: pp, h: p.h, mh: p.mh, roof: p.roof, seed: b.id * 31 + i, style: ps, t: b.t, mat: p.mat })
    })

    for (const it of items) {
      const area = Math.abs(signedArea(it.P))
      const f = FAC[it.style]
      const r1 = hash(it.seed, 1, 5), r2 = hash(it.seed, 2, 5), r3 = hash(it.seed, 3, 5)
      const base = 0.9 + 0.18 * r1
      const tint: [number, number, number] = [base, base * (0.97 + 0.06 * r2), base * (0.94 + 0.1 * r3)]
      const uOff = Math.floor(r2 * 4) / 4
      let y1 = it.h
      const y0 = it.mh
      let gable = false
      let o: OBB | null = null
      const gabledTag = it.roof === 'gabled' || it.roof === 'hipped' || it.roof === 'gambrel' || it.roof === 'half-hipped' || it.roof === 'side_hipped' || it.roof === 'pyramidal' && area < 60
      if (area < 450 && it.P.length <= 12 && it.roof !== 'flat' && (gabledTag || (HOUSE.has(it.t) && !it.roof) || (it.t === 'apartments' && it.roof === 'gabled'))) {
        o = obb(it.P)
        if (o.fill > 0.82 && o.hz * 2 > 3.2) gable = true
      }
      let rise = 0
      if (gable && o) {
        const pitch = 0.62
        rise = Math.min(o.hz * Math.tan(pitch), 4.5)
        y1 = Math.max(y0 + 2.8, it.h - rise)
      }
      wall(it.style).walls(it.P, y0, y1, { bay: f.bay, floorH: f.fh, uOff, tint })
      if (gable && o) {
        const sh: [number, number, number] = [0.8 + r1 * 0.3, 0.8 + r2 * 0.3, 0.8 + r3 * 0.25]
        tilesM.gable(o, y1, 0.62, sh)
        wall(it.style).gableEnds(o, y1, rise, f.bay, tint)
        // chimney
        if (it.t === 'house' || HOUSE.has(it.t)) {
          const c = Math.cos(o.ang), s = Math.sin(o.ang)
          if (r3 > 0.4) equipM.box(o.cx + c * o.hx * 0.45, o.cz + s * o.hx * 0.45, 0.7, 0.7, o.ang, y1, y1 + rise + 0.9, [0.55, 0.3, 0.24])
        }
      } else {
        const rt = 0.85 + r1 * 0.3
        roofM.poly(it.P, y1, [rt, rt, rt])
        // rooftop plant on large roofs
        if (area > 500 && y1 - y0 > 6) {
          const R = rng(it.seed)
          const ob = o ?? obb(it.P)
          const n = Math.min(7, 1 + Math.floor(area / 900))
          for (let k = 0; k < n; k++) {
            const lx = (R() - 0.5) * ob.hx * 1.5, lz = (R() - 0.5) * ob.hz * 1.5
            const c = Math.cos(ob.ang), s = Math.sin(ob.ang)
            const x = ob.cx + lx * c - lz * s, z = ob.cz + lx * s + lz * c
            const sx = 1.5 + R() * 4, sz = 1.5 + R() * 3, hh = 0.9 + R() * 2.4
            let ok = true
            for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
              const px = x + (dx * sx) / 2 * c - (dz * sz) / 2 * s, pz = z + (dx * sx) / 2 * s + (dz * sz) / 2 * c
              if (!pointInPoly(px, pz, it.P)) { ok = false; break }
              // keep away from the edge
              for (let q = 0; q < it.P.length; q++) if (distToSeg(px, pz, it.P[q], it.P[(q + 1) % it.P.length]) < 0.8) { ok = false; break }
              if (!ok) break
            }
            if (ok) {
              const g = 0.55 + R() * 0.35
              equipM.box(x, z, sx, sz, ob.ang, y1, y1 + hh, [g, g, g * 1.02])
            }
          }
        }
      }
    }
  }

  const add = (m: Mesher, mat: THREE.Material) => {
    if (m.count === 0) return
    const mesh = new THREE.Mesh(m.build(), mat)
    mesh.castShadow = true
    mesh.receiveShadow = true
    group.add(mesh)
  }
  for (const k of Object.keys(wallM) as FacadeKey[]) add(wallM[k]!, mats.facade[k])
  add(roofM, mats.roofing)
  add(tilesM, mats.tiles)
  add(equipM, mats.metal)
  return { group, grid, info }
}

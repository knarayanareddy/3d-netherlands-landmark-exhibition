import * as THREE from 'three'
import { clamp, fbm, lerp, smooth } from './gfx'
import { M } from './materials'

/* The Molenvliet canal: a gentle S-curve described as z = f(x). Distances are measured perpendicular to it. */
export const canalZ = (x: number) => 22 * Math.sin(x / 210 + 0.4) + 7 * Math.sin(x / 83 + 1.2)
export const canalDz = (x: number) => (22 / 210) * Math.cos(x / 210 + 0.4) + (7 / 83) * Math.cos(x / 83 + 1.2)

export function frameAt(x: number) {
  const dz = canalDz(x)
  const n = 1 / Math.sqrt(1 + dz * dz)
  return { x, z: canalZ(x), tx: n, tz: dz * n, nx: -dz * n, nz: n }
}
/** World point at canal parameter x and signed offset d (positive = +z bank) */
export function pointAt(x: number, d: number): [number, number] {
  const f = frameAt(x)
  return [f.x + f.nx * d, f.z + f.nz * d]
}
export function signedDist(x: number, z: number) {
  const dz = canalDz(x)
  return (z - canalZ(x)) / Math.sqrt(1 + dz * dz)
}

export const WATER_Y = 0
export const CREST = 0.65
export const POLDER = -0.35
export const ROAD_D = 9.6

export interface Pad {
  x: number
  z: number
  flat: number
  blend: number
  h: number
}
export const pads: Pad[] = []

export function baseHeight(x: number, z: number) {
  const d = signedDist(x, z)
  // meandering bank edge
  const ad = Math.abs(d) + (fbm(x * 0.09, z * 0.09, 3, 3) - 0.45) * 1.7
  const dike = lerp(CREST, POLDER, smooth(12.5, 27, ad))
  const bank = lerp(-1.75, dike, smooth(4.3, 7.2, ad))
  let h = bank
  // polder micro-relief
  const far = smooth(8, 30, ad)
  h += (fbm(x * 0.021, z * 0.021, 7, 3) - 0.5) * 0.28 * far
  h += (fbm(x * 0.2, z * 0.2, 9, 2) - 0.5) * 0.06 * far
  // crest crown + slight irregularity
  h += (fbm(x * 0.12, z * 0.12, 11, 2) - 0.5) * 0.05 * smooth(6, 8, ad) * (1 - far)
  return h
}

export function heightAt(x: number, z: number) {
  let h = baseHeight(x, z)
  for (const p of pads) {
    const dx = x - p.x
    const dz = z - p.z
    const r2 = dx * dx + dz * dz
    const b2 = p.blend * p.blend
    if (r2 > b2) continue
    const r = Math.sqrt(r2)
    const t = 1 - smooth(p.flat, p.blend, r)
    h = lerp(h, p.h, t)
  }
  return h
}

export function addPad(x: number, z: number, flat: number, blend: number, h?: number) {
  pads.push({ x, z, flat, blend, h: h ?? baseHeight(x, z) })
}

/* ------------------------------------------------------------- terrain mesh */
function axis(half: number, fine: number, step: number, grow: number, end: number) {
  const a: number[] = []
  for (let v = -fine; v <= fine + 1e-6; v += step) a.push(v)
  let s = step
  let p = fine
  while (p < end) {
    s *= grow
    p += s
    a.push(Math.min(p, end))
  }
  p = -fine
  s = step
  const lo: number[] = []
  while (p > -end) {
    s *= grow
    p -= s
    lo.push(Math.max(p, -end))
  }
  void half
  return [...lo.reverse(), ...a]
}

export const TERRAIN_X = 1100
export const TERRAIN_Z = 800

export function buildTerrain() {
  const xs = axis(0, 270, 1.5, 1.07, TERRAIN_X)
  const zs = axis(0, 150, 1.5, 1.07, TERRAIN_Z)
  const nx = xs.length
  const nz = zs.length
  const pos = new Float32Array(nx * nz * 3)
  const uv = new Float32Array(nx * nz * 2)
  const col = new Float32Array(nx * nz * 3)
  const mud = new Float32Array(nx * nz)
  const TILE = 3.2
  // The canal runs through z=canalZ(x); shift the z grid so the rows follow the canal near the centre for smoother banks.
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const x = xs[i]
      const z = zs[j] + canalZ(x) * (1 - smooth(120, 330, Math.abs(zs[j])))
      const edge = Math.min(smooth(TERRAIN_X - 150, TERRAIN_X, Math.abs(x)), 1)
      let h = heightAt(x, z)
      const e2 = Math.max(edge, smooth(TERRAIN_Z - 150, TERRAIN_Z, Math.abs(z)))
      h = lerp(h, POLDER, e2)
      const k = j * nx + i
      pos[k * 3] = x
      pos[k * 3 + 1] = h
      pos[k * 3 + 2] = z
      uv[k * 2] = x / TILE
      uv[k * 2 + 1] = z / TILE
      // macro colour variation
      const f1 = fbm(x * 0.018, z * 0.018, 21, 3)
      const f2 = fbm(x * 0.07, z * 0.07, 22, 2)
      const dry = smooth(0.55, 0.8, f1)
      const ad = Math.abs(signedDist(x, z))
      const mow = 1 - smooth(8, 16, ad) * 0.0
      const lush = 0.82 + f2 * 0.45
      col[k * 3] = (0.42 + dry * 0.2) * lush * mow
      col[k * 3 + 1] = (0.92 - dry * 0.08) * lush
      col[k * 3 + 2] = (0.30 + dry * 0.04) * lush
      mud[k] = ad < 14 ? 1 - smooth(-0.15, 0.32, h) : 0
    }
  const idx = new Uint32Array((nx - 1) * (nz - 1) * 6)
  let q = 0
  for (let j = 0; j < nz - 1; j++)
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i
      const b = a + 1
      const c = a + nx
      const d = c + 1
      idx[q++] = a
      idx[q++] = c
      idx[q++] = b
      idx[q++] = b
      idx[q++] = c
      idx[q++] = d
    }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  g.setAttribute('aMud', new THREE.BufferAttribute(mud, 1))
  g.setIndex(new THREE.BufferAttribute(idx, 1))
  g.computeVertexNormals()
  const mesh = new THREE.Mesh(g, M.grass)
  mesh.receiveShadow = true
  mesh.frustumCulled = false
  return mesh
}

/** Water surface ribbon following the canal (extends under the banks). */
export function buildWaterGeo(half = 9, x0 = -TERRAIN_X, x1 = TERRAIN_X) {
  const pts: number[] = []
  const idx: number[] = []
  const step = 12
  let n = 0
  for (let x = x0; x <= x1 + 0.1; x += step) {
    const [lx, lz] = pointAt(x, -half)
    const [rx, rz] = pointAt(x, half)
    pts.push(lx, WATER_Y, lz, rx, WATER_Y, rz)
    if (n > 0) {
      const a = (n - 1) * 2
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }
    n++
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  // ensure normals face up
  const nr = g.attributes.normal
  for (let i = 0; i < nr.count; i++) nr.setXYZ(i, 0, 1, 0)
  return g
}

/** Textured strip following the canal at offset d (road/path). */
export function buildRibbon(d: number, width: number, x0: number, x1: number, mat: THREE.Material, lift = 0.035, tile = 3, step = 1.5) {
  const pos: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  let acc = 0
  let px = 0
  let pz = 0
  let n = 0
  for (let x = x0; x <= x1 + 0.01; x += step) {
    const [cx, cz] = pointAt(x, d)
    if (n > 0) acc += Math.hypot(cx - px, cz - pz)
    px = cx
    pz = cz
    const f = frameAt(x)
    for (const s of [-1, 1]) {
      const wx = cx + f.nx * s * (width / 2)
      const wz = cz + f.nz * s * (width / 2)
      pos.push(wx, heightAt(wx, wz) + lift, wz)
      uv.push((s < 0 ? 0 : width) / tile, acc / tile)
    }
    if (n > 0) {
      const a = (n - 1) * 2
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
    }
    n++
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  const m = new THREE.Mesh(g, mat)
  m.receiveShadow = true
  m.castShadow = false
  return m
}

/* ------------------------------------------------------------------ bridges */
export interface BridgeDef {
  x: number
  halfLen: number
  halfW: number
  rise: number
}
export const bridges: BridgeDef[] = []

export function bridgeLocal(b: BridgeDef, x: number, z: number) {
  const f = frameAt(b.x)
  const dx = x - f.x
  const dz = z - f.z
  return { u: dx * f.nx + dz * f.nz, w: dx * f.tx + dz * f.tz }
}
export const deckY = (b: BridgeDef, u: number) => CREST + 0.06 + b.rise * (1 - Math.pow(clamp(u / b.halfLen, -1, 1), 2))

/** Returns deck height if (x,z) is on a bridge, else null */
export function bridgeY(x: number, z: number): number | null {
  for (const b of bridges) {
    const { u, w } = bridgeLocal(b, x, z)
    if (Math.abs(u) <= b.halfLen && Math.abs(w) <= b.halfW + 0.05) return deckY(b, u)
  }
  return null
}

export function groundY(x: number, z: number) {
  const b = bridgeY(x, z)
  const h = heightAt(x, z)
  return b !== null ? Math.max(b, h) : h
}

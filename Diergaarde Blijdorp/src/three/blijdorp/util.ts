import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { Mats } from './mats'

export const TAU = Math.PI * 2
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
export const smooth = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}

export function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface Collider { x0: number; z0: number; x1: number; z1: number; when?: 'tower' | 'today' }
export interface FloorRegion { x0: number; z0: number; x1: number; z1: number; h: number; round?: boolean }
export interface Zone { id: string; name: string; x0: number; z0: number; x1: number; z1: number }

export interface BuildCtx {
  root: THREE.Group
  m: Mats
  colliders: Collider[]
  floors: FloorRegion[]
  zones: Zone[]
  /** materials that glow at night */
  glow: { mat: THREE.MeshStandardMaterial; k: number }[]
  /** materials that look bright by day (light slits, skylights) */
  dayGlow: { mat: THREE.MeshStandardMaterial; k: number }[]
  lights: { light: THREE.Light; day: number; night: number }[]
  anim: ((t: number, dt: number) => void)[]
  waters: THREE.Mesh[]
  tower: THREE.Object3D[]
  today: THREE.Object3D[]
  interior: THREE.Object3D[]
}

/** Project world-scale (metre) UVs so PBR textures keep a constant real-world size */
export function wuv<T extends THREE.BufferGeometry>(g: T, scale = 1): T {
  const p = g.attributes.position
  const n = g.attributes.normal
  if (!n) g.computeVertexNormals()
  const nn = g.attributes.normal
  const uv = new Float32Array(p.count * 2)
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(nn.getX(i)), ay = Math.abs(nn.getY(i)), az = Math.abs(nn.getZ(i))
    let u: number, v: number
    if (ay >= ax && ay >= az) { u = p.getX(i); v = p.getZ(i) }
    else if (ax >= az) { u = p.getZ(i); v = p.getY(i) }
    else { u = p.getX(i); v = p.getY(i) }
    uv[i * 2] = u * scale
    uv[i * 2 + 1] = v * scale
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  return g
}

export function mesh(parent: THREE.Object3D, g: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0, o: { cast?: boolean; recv?: boolean; ry?: number } = {}) {
  const m = new THREE.Mesh(g, mat)
  m.position.set(x, y, z)
  if (o.ry) m.rotation.y = o.ry
  m.castShadow = o.cast ?? true
  m.receiveShadow = o.recv ?? true
  parent.add(m)
  return m
}

/** box with centre x,z and base y0 */
export function slab(parent: THREE.Object3D, mat: THREE.Material, cx: number, cz: number, w: number, d: number, y0: number, h: number, ry = 0, o: { cast?: boolean; recv?: boolean } = {}) {
  const g = wuv(new THREE.BoxGeometry(w, h, d))
  return mesh(parent, g, mat, cx, y0 + h / 2, cz, { ry, ...o })
}

export function cyl(parent: THREE.Object3D, mat: THREE.Material, rt: number, rb: number, h: number, cx: number, y0: number, cz: number, seg = 32, open = false, o: { cast?: boolean; recv?: boolean } = {}) {
  const g = wuv(new THREE.CylinderGeometry(rt, rb, h, seg, 1, open))
  return mesh(parent, g, mat, cx, y0 + h / 2, cz, o)
}

/** merge many geometries into one mesh (all share the same material) */
export function mergeMesh(parent: THREE.Object3D, mat: THREE.Material, geos: THREE.BufferGeometry[], o: { cast?: boolean; recv?: boolean } = {}) {
  if (!geos.length) return null
  const g = mergeGeometries(geos.map((x) => (x.index ? x.toNonIndexed() : x)), false)!
  geos.forEach((x) => x.dispose())
  return mesh(parent, g, mat, 0, 0, 0, o)
}

export function boxGeo(w: number, h: number, d: number, x: number, y0: number, z: number, ry = 0) {
  const g = new THREE.BoxGeometry(w, h, d)
  if (ry) g.rotateY(ry)
  g.translate(x, y0 + h / 2, z)
  return wuv(g)
}

/** a wall made of several AABB colliders is registered with this helper */
export function wall(ctx: BuildCtx, x0: number, z0: number, x1: number, z1: number) {
  ctx.colliders.push({ x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1) })
}

/** flat ribbon along a path with metre UVs */
export function ribbon(pts: THREE.Vector2[], width: number, y: number, mat: THREE.Material, parent: THREE.Object3D, step = 1.2) {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p.x, 0, p.y)), false, 'catmullrom', 0.3)
  const len = curve.getLength()
  const n = Math.max(2, Math.floor(len / step))
  const pos: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const p = curve.getPoint(t)
    const tg = curve.getTangent(t)
    const nx = -tg.z, nz = tg.x
    for (const s of [-1, 1]) {
      pos.push(p.x + nx * (width / 2) * s, y, p.z + nz * (width / 2) * s)
      uv.push((s * width) / 2, t * len)
    }
    if (i < n) {
      const a = i * 2
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  const m = mesh(parent, g, mat, 0, 0, 0, { cast: false })
  return m
}

/** flat shape on the ground. Build the shape with (x, -z) coordinates (see shapeXZ) */
export function flatShape(shape: THREE.Shape, y: number, mat: THREE.Material, parent: THREE.Object3D) {
  const g = new THREE.ShapeGeometry(shape, 24)
  g.rotateX(-Math.PI / 2) // shape (x, -z) -> world (x, z), normal up
  const pos = g.attributes.position
  const uv = new Float32Array(pos.count * 2)
  for (let i = 0; i < pos.count; i++) { uv[i * 2] = pos.getX(i); uv[i * 2 + 1] = pos.getZ(i) }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  const m = mesh(parent, g, mat, 0, y, 0, { cast: false })
  return m
}

export const v2 = (x: number, y: number) => new THREE.Vector2(x, y)

export const shapeXZ = (pts: [number, number][]) => new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)))
export const pathXZ = (pts: [number, number][]) => new THREE.Path(pts.map(([x, z]) => new THREE.Vector2(x, -z)))

/** approximate a curved wall by small boxes along an arc */
export function arcWall(ctx: BuildCtx, cx: number, cz: number, r: number, a0: number, a1: number, when?: 'tower' | 'today') {
  const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) * r / 0.5))
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n
    const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r
    ctx.colliders.push({ x0: x - 0.3, x1: x + 0.3, z0: z - 0.3, z1: z + 0.3, when })
  }
}

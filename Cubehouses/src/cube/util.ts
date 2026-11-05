import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

export const TAU = Math.PI * 2

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

export function mkCanvas(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return { c, g: c.getContext('2d')! }
}

export function canvasTex(c: HTMLCanvasElement, srgb = true, repeat: [number, number] | null = null) {
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.anisotropy = 8
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
  if (repeat) t.repeat.set(repeat[0], repeat[1])
  return t
}

/* ---------- night glow registry (emissive materials that switch on after dusk) ---------- */
const glow: { m: THREE.MeshStandardMaterial; k: number }[] = []
export function registerGlow<T extends THREE.MeshStandardMaterial>(m: T, k = 1): T {
  glow.push({ m, k })
  m.emissiveIntensity = 0
  return m
}
export function setNightGlow(n: number) {
  for (const g of glow) g.m.emissiveIntensity = g.k * n
}

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t

export function shade<T extends THREE.Mesh>(m: T, cast = true, receive = true) {
  m.castShadow = cast
  m.receiveShadow = receive
  return m
}

/** Scale box UVs so textures map in metres. */
export function boxUV(geo: THREE.BoxGeometry, w: number, h: number, d: number, tile: [number, number] = [1, 1]) {
  const uv = geo.attributes.uv
  const dims = [
    [d, h], [d, h], // +x -x
    [w, d], [w, d], // +y -y
    [w, h], [w, h], // +z -z
  ]
  for (let f = 0; f < 6; f++) {
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i
      uv.setXY(k, (uv.getX(k) * dims[f][0]) / tile[0], (uv.getY(k) * dims[f][1]) / tile[1])
    }
  }
  return geo
}

export function box(
  parent: THREE.Object3D,
  w: number,
  h: number,
  d: number,
  mat: THREE.Material | THREE.Material[],
  x = 0,
  y = 0,
  z = 0,
  tile?: [number, number],
) {
  const geo = new THREE.BoxGeometry(w, h, d)
  const m0 = Array.isArray(mat) ? mat[0] : mat
  boxUV(geo, w, h, d, tile ?? ((m0.userData.tile as [number, number]) || [1, 1]))
  const mesh = shade(new THREE.Mesh(geo, mat))
  mesh.position.set(x, y + h / 2, z) // y is the BOTTOM
  parent.add(mesh)
  return mesh
}

export function cyl(
  parent: THREE.Object3D,
  rt: number,
  rb: number,
  h: number,
  mat: THREE.Material,
  x = 0,
  y = 0,
  z = 0,
  seg = 24,
  open = false,
) {
  const geo = new THREE.CylinderGeometry(rt, rb, h, seg, 1, open)
  const t = mat.userData.tile as [number, number] | undefined
  if (t) {
    const uv = geo.attributes.uv
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * TAU * ((rt + rb) / 2)) / t[0], (uv.getY(i) * h) / t[1])
  }
  const mesh = shade(new THREE.Mesh(geo, mat))
  mesh.position.set(x, y + h / 2, z)
  parent.add(mesh)
  return mesh
}

export function sph(parent: THREE.Object3D, r: number, mat: THREE.Material, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, seg = 20) {
  const mesh = shade(new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.max(8, seg / 2)), mat))
  mesh.position.set(x, y, z)
  mesh.scale.set(sx, sy, sz)
  parent.add(mesh)
  return mesh
}

/** Merge all static meshes in `root` by material (one draw call per material). */
export function mergeByMaterial(root: THREE.Object3D, keepShadow = true): THREE.Group {
  root.updateMatrixWorld(true)
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert()
  const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>()
  const remove: THREE.Mesh[] = []
  root.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh || Array.isArray(m.material) || (m as any).isInstancedMesh) return
    const geo = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()
    geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld))
    for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k)
    if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2))
    geo.clearGroups()
    const list = buckets.get(m.material as THREE.Material) ?? []
    list.push(geo)
    buckets.set(m.material as THREE.Material, list)
    remove.push(m)
  })
  for (const m of remove) m.parent?.remove(m)
  for (const [mat, list] of buckets) {
    const merged = mergeGeometries(list, false)
    if (!merged) continue
    const mesh = new THREE.Mesh(merged, mat)
    mesh.castShadow = keepShadow && !(mat as any).transparent
    mesh.receiveShadow = true
    root.add(mesh)
    list.forEach((g) => g.dispose())
  }
  return root as THREE.Group
}

/* ---------- 2D polygon helpers (x,z plane) ---------- */
export type V2 = [number, number]

export function polyArea(p: V2[]) {
  let a = 0
  for (let i = 0; i < p.length; i++) {
    const [x1, z1] = p[i]
    const [x2, z2] = p[(i + 1) % p.length]
    a += x1 * z2 - x2 * z1
  }
  return a / 2
}

/** push point inside convex polygon (CCW when viewed with x right / z down => area sign handled) */
export function constrainConvex(p: THREE.Vector2, poly: V2[], margin: number) {
  const sgn = polyArea(poly) >= 0 ? 1 : -1
  for (let iter = 0; iter < 3; iter++) {
    for (let i = 0; i < poly.length; i++) {
      const [ax, az] = poly[i]
      const [bx, bz] = poly[(i + 1) % poly.length]
      const ex = bx - ax
      const ez = bz - az
      const L = Math.hypot(ex, ez)
      // outward normal
      const nx = (ez / L) * sgn
      const nz = (-ex / L) * sgn
      const d = (p.x - ax) * nx + (p.y - az) * nz + margin
      if (d > 0) {
        p.x -= nx * d
        p.y -= nz * d
      }
    }
  }
}

export function makeDisposable<T extends THREE.Object3D>(o: T) {
  return o
}

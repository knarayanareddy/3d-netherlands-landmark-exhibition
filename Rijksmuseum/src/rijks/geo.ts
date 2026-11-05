import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

export const PI = Math.PI

/* ------------------------------------------------------------------ */
/*  UV + geometry preparation                                          */
/* ------------------------------------------------------------------ */

/** Planar "world-scale" UVs (1 uv unit == 1 metre), chosen per vertex normal. */
export function worldUV(geo: THREE.BufferGeometry) {
  const pos = geo.attributes.position
  const nor = geo.attributes.normal
  const uv = new Float32Array(pos.count * 2)
  for (let i = 0; i < pos.count; i++) {
    const nx = nor.getX(i), ny = nor.getY(i), nz = nor.getZ(i)
    let tx: number, tz: number
    if (Math.abs(ny) > 0.97) { tx = 1; tz = 0 } else {
      tx = nz; tz = -nx
      const l = Math.hypot(tx, tz) || 1
      tx /= l; tz /= l
    }
    // b = n x t   (t has no y component)
    const bx = -nz * 0 + ny * tz
    const by = nz * tx - nx * tz
    const bz = -ny * tx
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i)
    uv[i * 2] = x * tx + z * tz
    uv[i * 2 + 1] = x * bx + y * by + z * bz
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
}

function prep(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const geo = g.index ? g.toNonIndexed() : g.clone()
  for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k)
  if (!geo.attributes.normal) geo.computeVertexNormals()
  if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2))
  geo.clearGroups()
  return geo
}

function flipWinding(geo: THREE.BufferGeometry) {
  for (const k of ['position', 'normal', 'uv']) {
    const a = geo.attributes[k] as THREE.BufferAttribute
    const n = a.itemSize
    const arr = a.array as Float32Array
    for (let t = 0; t + 2 < a.count; t += 3) {
      for (let c = 0; c < n; c++) {
        const i1 = (t + 1) * n + c, i2 = (t + 2) * n + c
        const tmp = arr[i1]; arr[i1] = arr[i2]; arr[i2] = tmp
      }
    }
    a.needsUpdate = true
  }
}

/* ------------------------------------------------------------------ */
/*  Batch: collects geometry per material, merges into few draw calls   */
/* ------------------------------------------------------------------ */
export class Batch {
  private buckets = new Map<THREE.Material, THREE.BufferGeometry[]>()
  private mirror = false
  private nocast = new Set<THREE.Material>()

  setMirror(v: boolean) { this.mirror = v }
  noShadow(m: THREE.Material) { this.nocast.add(m) }

  /** add geometry that is already in world space */
  add(mat: THREE.Material, geo: THREE.BufferGeometry, uv: 'world' | 'keep' = 'world') {
    const g = prep(geo)
    if (this.mirror) {
      g.applyMatrix4(new THREE.Matrix4().makeScale(-1, 1, 1))
      flipWinding(g)
    }
    if (uv === 'world') worldUV(g)
    const list = this.buckets.get(mat) ?? []
    list.push(g)
    this.buckets.set(mat, list)
  }

  build(parent: THREE.Object3D) {
    for (const [mat, list] of this.buckets) {
      const merged = mergeGeometries(list, false)
      if (!merged) continue
      merged.computeBoundingSphere()
      const mesh = new THREE.Mesh(merged, mat)
      mesh.castShadow = !this.nocast.has(mat) && !(mat as THREE.MeshStandardMaterial).transparent
      mesh.receiveShadow = true
      parent.add(mesh)
      for (const g of list) g.dispose()
    }
    this.buckets.clear()
  }
}

/* ------------------------------------------------------------------ */
/*  primitives                                                         */
/* ------------------------------------------------------------------ */
/** box with bottom at y, centred on x,z, optional rotation about Y */
export function box(b: Batch, mat: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number, ry = 0) {
  const g = new THREE.BoxGeometry(w, h, d)
  if (ry) g.rotateY(ry)
  g.translate(x, y + h / 2, z)
  b.add(mat, g)
}
/** box from min/max corners */
export function boxMM(b: Batch, mat: THREE.Material, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) {
  const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0)
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)
  b.add(mat, g)
}

export function cylinder(b: Batch, mat: THREE.Material, rTop: number, rBot: number, h: number, x: number, y: number, z: number, seg = 16) {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, seg)
  g.translate(x, y + h / 2, z)
  b.add(mat, g)
}

export function sphere(b: Batch, mat: THREE.Material, r: number, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, seg = 12) {
  const g = new THREE.SphereGeometry(r, seg, Math.max(6, seg >> 1))
  g.scale(sx, sy, sz)
  g.translate(x, y, z)
  b.add(mat, g)
}

/** Arbitrary triangle soup (9 numbers per triangle) with flat normals. */
export function polyGeo(tris: number[][]): THREE.BufferGeometry {
  const p: number[] = []
  for (const t of tris) p.push(...t)
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3))
  g.computeVertexNormals()
  return g
}
const quad = (a: number[], b: number[], c: number[], d: number[]): number[][] => [[...a, ...b, ...c], [...a, ...c, ...d]]

/** Frustum with rectangular base w0 x d0 and top w1 x d1 (may be 0). Base centred on origin. */
export function frustum(w0: number, d0: number, w1: number, d1: number, h: number): THREE.BufferGeometry {
  const a = [-w0 / 2, 0, d0 / 2], b = [w0 / 2, 0, d0 / 2], c = [w0 / 2, 0, -d0 / 2], d = [-w0 / 2, 0, -d0 / 2]
  const A = [-w1 / 2, h, d1 / 2], B = [w1 / 2, h, d1 / 2], C = [w1 / 2, h, -d1 / 2], D = [-w1 / 2, h, -d1 / 2]
  const tris: number[][] = [...quad(a, b, B, A), ...quad(b, c, C, B), ...quad(c, d, D, C), ...quad(d, a, A, D)]
  if (w1 > 0.001 && d1 > 0.001) tris.push(...quad(A, B, C, D))
  return polyGeo(tris)
}

/** Gable roof prism: ridge along local X, span along Z. Base at y=0. */
export function gablePrism(len: number, span: number, rise: number): { slopes: THREE.BufferGeometry; ends: THREE.BufferGeometry } {
  const L = len / 2, S = span / 2
  const slopes = polyGeo([
    ...quad([-L, 0, S], [L, 0, S], [L, rise, 0], [-L, rise, 0]),
    ...quad([L, 0, -S], [-L, 0, -S], [-L, rise, 0], [L, rise, 0]),
  ])
  const ends = polyGeo([[L, 0, S, L, 0, -S, L, rise, 0], [-L, 0, -S, -L, 0, S, -L, rise, 0]])
  return { slopes, ends }
}

/* ------------------------------------------------------------------ */
/*  openings & shapes                                                  */
/* ------------------------------------------------------------------ */
export type OpenKind = 'rect' | 'arch' | 'ellipse' | 'pointed'
export interface Opening {
  u: number // centre along wall
  w: number
  y0: number
  y1: number // top of opening (including arch)
  kind: OpenKind
  rise?: number // for ellipse arches (height of the curved part)
}

/** outline of an opening, expanded by `e` metres all round */
export function openingPath(o: Opening, e = 0, into: THREE.Path = new THREE.Shape()): THREE.Path {
  const hw = o.w / 2 + e
  const yb = o.y0 - e
  const x0 = o.u - hw, x1 = o.u + hw
  into.moveTo(x0, yb)
  into.lineTo(x1, yb)
  if (o.kind === 'rect') {
    into.lineTo(x1, o.y1 + e)
    into.lineTo(x0, o.y1 + e)
  } else if (o.kind === 'arch') {
    const spring = o.y1 - o.w / 2
    into.lineTo(x1, spring)
    into.absarc(o.u, spring, hw, 0, PI, false)
  } else if (o.kind === 'ellipse') {
    const r = o.rise ?? o.w / 4
    const spring = o.y1 - r
    into.lineTo(x1, spring)
    into.absellipse(o.u, spring, hw, r + e, 0, PI, false, 0)
  } else {
    const spring = o.y1 - o.w * 0.62
    const apex = o.y1 + e
    into.lineTo(x1, spring)
    into.quadraticCurveTo(x1 - hw * 0.08, spring + (apex - spring) * 0.78, o.u, apex)
    into.quadraticCurveTo(x0 + hw * 0.08, spring + (apex - spring) * 0.78, x0, spring)
  }
  into.lineTo(x0, yb)
  return into
}

export function springOf(o: Opening) {
  return o.kind === 'arch' ? o.y1 - o.w / 2 : o.kind === 'ellipse' ? o.y1 - (o.rise ?? o.w / 4) : o.kind === 'pointed' ? o.y1 - o.w * 0.62 : o.y1
}

export function extrudeShape(shape: THREE.Shape, depth: number, curveSegments = 14): THREE.BufferGeometry {
  return new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments, steps: 1 })
}

/* ------------------------------------------------------------------ */
/*  Facade: a placed plane that wall panels / dressings are built on     */
/* ------------------------------------------------------------------ */
export interface WinMats { glass: THREE.Material; frame: THREE.Material; stone: THREE.Material }

export class Facade {
  m = new THREE.Matrix4()
  /** ry: facing angle (0 = +z, PI = -z, PI/2 = +x, -PI/2 = -x), D: signed distance of the face plane from origin along the facing dir */
  constructor(private b: Batch, public ry: number, public D: number, public t = 1) {
    const d = new THREE.Vector3(Math.sin(ry), 0, Math.cos(ry))
    const o = d.multiplyScalar(D - t)
    this.m.compose(o, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(1, 1, 1))
  }
  /** local (u, y, zFront) -> world */
  world(u: number, y: number, zFront = 0) { return new THREE.Vector3(u, y, this.t + zFront).applyMatrix4(this.m) }
  add(mat: THREE.Material, geo: THREE.BufferGeometry) {
    geo.applyMatrix4(this.m)
    this.b.add(mat, geo)
  }
  /** wall panel with holes; spans u0..u1, y0..y1 (face at local z = t) */
  wall(mat: THREE.Material, u0: number, u1: number, y0: number, y1: number, holes: Opening[] = [], t = this.t) {
    const s = new THREE.Shape()
    s.moveTo(u0, y0); s.lineTo(u1, y0); s.lineTo(u1, y1); s.lineTo(u0, y1); s.lineTo(u0, y0)
    for (const h of holes) s.holes.push(openingPath(h))
    const g = extrudeShape(s, t)
    g.translate(0, 0, this.t - t)
    this.add(mat, g)
  }
  /** arbitrary shape extruded outward from the face */
  shape(mat: THREE.Material, s: THREE.Shape, depth: number, z0 = this.t) {
    const g = extrudeShape(s, depth)
    g.translate(0, 0, z0)
    this.add(mat, g)
  }
  surround(mat: THREE.Material, o: Opening, margin = 0.3, depth = 0.14, z0 = this.t - 0.02) {
    const s = openingPath(o, margin) as THREE.Shape
    s.holes.push(openingPath(o, 0))
    this.shape(mat, s, depth, z0)
  }
  pane(mat: THREE.Material, o: Opening, setback = 0.45) {
    const g = new THREE.ShapeGeometry(openingPath(o) as THREE.Shape, 14)
    g.translate(0, 0, this.t - setback)
    this.add(mat, g)
  }
  /** box in local coordinates: u centre, y bottom, zFront = centre distance in front of face plane */
  box(mat: THREE.Material, w: number, h: number, d: number, u: number, y: number, zFront: number) {
    const g = new THREE.BoxGeometry(w, h, d)
    g.translate(u, y + h / 2, this.t + zFront)
    this.add(mat, g)
  }
  /** a framed, glazed, recessed window: pane + mullions + stone surround (+ sill) */
  window(mats: WinMats, o: Opening, opt: { setback?: number; surround?: number; sill?: boolean; transom?: number; mullions?: number } = {}) {
    const setback = opt.setback ?? 0.45
    this.pane(mats.glass, o, setback)
    const zf = this.t - setback + 0.05
    const mull = opt.mullions ?? 1
    const spring = springOf(o)
    for (let i = 1; i <= mull; i++) {
      const u = o.u - o.w / 2 + (o.w * i) / (mull + 1)
      let top = o.y1
      if (o.kind === 'arch') top = spring + Math.sqrt(Math.max(0, (o.w / 2) ** 2 - (u - o.u) ** 2))
      else if (o.kind === 'ellipse') top = spring + (o.rise ?? o.w / 4) * Math.sqrt(Math.max(0, 1 - ((u - o.u) / (o.w / 2)) ** 2))
      else if (o.kind === 'pointed') top = o.y1 - 0.2
      const g = new THREE.BoxGeometry(0.07, top - o.y0, 0.08)
      g.translate(u, (o.y0 + top) / 2, zf)
      this.add(mats.frame, g)
    }
    const ty = o.y0 + (spring - o.y0) * (opt.transom ?? 0.62)
    {
      const g = new THREE.BoxGeometry(o.w, 0.07, 0.08)
      g.translate(o.u, ty, zf)
      this.add(mats.frame, g)
    }
    const lip = openingPath(o, 0) as THREE.Shape
    lip.holes.push(openingPath(o, -0.07))
    {
      const g = extrudeShape(lip, 0.1)
      g.translate(0, 0, this.t - setback)
      this.add(mats.frame, g)
    }
    const sm = opt.surround ?? 0.3
    if (sm > 0) this.surround(mats.stone, o, sm)
    if (opt.sill !== false) this.box(mats.stone, o.w + sm * 2 + 0.3, 0.14, 0.4, o.u, o.y0 - sm - 0.12, 0.12)
  }
}

/* ------------------------------------------------------------------ */
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

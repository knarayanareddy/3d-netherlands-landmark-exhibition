import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

export const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

export function rng(seed: number) {
  let s = seed >>> 0 || 1
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function merge(list: THREE.BufferGeometry[]) {
  const norm = list.map((g) => {
    const c = g.index ? g.toNonIndexed() : g
    for (const k of Object.keys(c.attributes)) if (!['position', 'normal', 'uv'].includes(k)) c.deleteAttribute(k)
    if (!c.attributes.uv) c.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(c.attributes.position.count * 2), 2))
    return c
  })
  return mergeGeometries(norm, false)!
}

/** Re-project UVs of a (box-like) geometry into metres / tile, per dominant normal axis. */
export function metricUV(geo: THREE.BufferGeometry, tile = 4) {
  const p = geo.attributes.position
  const n = geo.attributes.normal
  const uv = new Float32Array(p.count * 2)
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i))
    const ay = Math.abs(n.getY(i))
    const az = Math.abs(n.getZ(i))
    let u: number, v: number
    if (ax >= ay && ax >= az) {
      u = p.getZ(i)
      v = p.getY(i)
    } else if (ay >= az) {
      u = p.getX(i)
      v = p.getZ(i)
    } else {
      u = p.getX(i)
      v = p.getY(i)
    }
    uv[i * 2] = u / tile
    uv[i * 2 + 1] = v / tile
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  return geo
}

export function boxGeo(w: number, h: number, d: number, x = 0, y = 0, z = 0, tile = 4) {
  const g = new THREE.BoxGeometry(w, h, d)
  metricUV(g, tile)
  g.translate(x, y, z)
  return g
}

/** Oriented flat-shaded frustum between two points (used for the pylon, legs, beams). */
export function taper(a: THREE.Vector3, b: THREE.Vector3, wa: number, da: number, wb: number, db: number, tile = 5) {
  const dir = b.clone().sub(a)
  const len = dir.length()
  dir.normalize()
  const zAxis = v3(0, 0, 1)
  let s = zAxis.clone().sub(dir.clone().multiplyScalar(dir.dot(zAxis)))
  if (s.lengthSq() < 1e-6) s = v3(1, 0, 0)
  s.normalize() // cross-width direction
  const t = new THREE.Vector3().crossVectors(dir, s).normalize() // thickness direction
  const corner = (c: THREE.Vector3, w: number, d: number, sx: number, sy: number) => c.clone().addScaledVector(s, (sx * w) / 2).addScaledVector(t, (sy * d) / 2)
  const A = [corner(a, wa, da, -1, -1), corner(a, wa, da, 1, -1), corner(a, wa, da, 1, 1), corner(a, wa, da, -1, 1)]
  const B = [corner(b, wb, db, -1, -1), corner(b, wb, db, 1, -1), corner(b, wb, db, 1, 1), corner(b, wb, db, -1, 1)]
  const pos: number[] = []
  const uvs: number[] = []
  const quad = (p0: THREE.Vector3, p1: THREE.Vector3, p2: THREE.Vector3, p3: THREE.Vector3, u0: number, u1: number, v1: number) => {
    const push = (p: THREE.Vector3) => pos.push(p.x, p.y, p.z)
    push(p0), push(p1), push(p2), push(p0), push(p2), push(p3)
    uvs.push(u0, 0, u1, 0, u1, v1, u0, 0, u1, v1, u0, v1)
  }
  const L = len / tile
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4
    const wI = A[i].distanceTo(A[j]) / tile
    quad(A[i], A[j], B[j], B[i], 0, wI, L)
  }
  quad(A[3], A[2], A[1], A[0], 0, wa / tile, da / tile)
  quad(B[0], B[1], B[2], B[3], 0, wb / tile, db / tile)
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  g.computeVertexNormals()
  // make sure faces point outwards
  const c = a.clone().add(b).multiplyScalar(0.5)
  const P = g.attributes.position
  const N = g.attributes.normal
  let bad = 0
  for (let i = 0; i < P.count; i += 3) {
    const out = v3(P.getX(i) - c.x, P.getY(i) - c.y, P.getZ(i) - c.z)
    if (out.dot(v3(N.getX(i), N.getY(i), N.getZ(i))) < 0) bad++
  }
  if (bad > P.count / 6) {
    for (let i = 0; i < P.count; i += 3) {
      for (const k of [1, 2]) {
        const x = P.getX(i + k), y = P.getY(i + k), z = P.getZ(i + k)
        // swap vertices 1 and 2
        if (k === 1) {
          P.setXYZ(i + 1, P.getX(i + 2), P.getY(i + 2), P.getZ(i + 2))
          P.setXYZ(i + 2, x, y, z)
        }
      }
    }
    g.computeVertexNormals()
  }
  return g
}

/** A cylinder between two points. */
export function rod(a: THREE.Vector3, b: THREE.Vector3, r: number, seg = 8, rb = r) {
  const len = a.distanceTo(b)
  const g = new THREE.CylinderGeometry(rb, r, len, seg, 1)
  const q = new THREE.Quaternion().setFromUnitVectors(v3(0, 1, 0), b.clone().sub(a).normalize())
  g.applyQuaternion(q)
  const c = a.clone().add(b).multiplyScalar(0.5)
  g.translate(c.x, c.y, c.z)
  return g
}

type Pt = [number, number]
/**
 * Sweep a 2D profile (z, y) along +x. Every profile edge gets its own vertex row so edges stay crisp.
 * `profileAt(x)` must always return the same number of points. y is relative to `yfn(x)`.
 */
export function sweep(profileAt: (x: number) => Pt[], xs: number[], yfn: (x: number) => number, closed = true, tile = 4) {
  const first = profileAt(xs[0])
  const n = first.length
  const edges = closed ? n : n - 1
  const pos: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  // orientation of polygon (for closed profiles) so that we can flip winding to face outwards
  let area = 0
  if (closed) for (let i = 0; i < n; i++) area += first[i][0] * first[(i + 1) % n][1] - first[(i + 1) % n][0] * first[i][1]
  const sgn = closed ? (area >= 0 ? 1 : -1) : 1
  let cum = 0
  for (let e = 0; e < edges; e++) {
    const base = pos.length / 3
    const p0 = first[e]
    const p1 = first[(e + 1) % n]
    const eLen = Math.hypot(p1[0] - p0[0], p1[1] - p0[1])
    for (let s = 0; s < xs.length; s++) {
      const x = xs[s]
      const pr = profileAt(x)
      const y0 = yfn(x)
      const a = pr[e]
      const b = pr[(e + 1) % n]
      pos.push(x, y0 + a[1], a[0], x, y0 + b[1], b[0])
      uv.push(x / tile, cum / tile, x / tile, (cum + eLen) / tile)
    }
    cum += eLen
    for (let s = 0; s < xs.length - 1; s++) {
      const i = base + s * 2
      if (sgn > 0) idx.push(i, i + 1, i + 3, i, i + 3, i + 2)
      else idx.push(i, i + 3, i + 1, i, i + 2, i + 3)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  // verify winding using the first quad: outward for a closed profile; "up" for open strips
  const N = g.attributes.normal
  const P = g.attributes.position
  if (!closed) {
    if (N.getY(0) < 0) flip(g)
  } else {
    // pick a vertex on the top-most edge and compare against polygon centroid
    let cz = 0, cy = 0
    for (const p of first) (cz += p[0]), (cy += p[1])
    cz /= n
    cy /= n
    const y0 = yfn(xs[0])
    const ox = P.getZ(0) - cz
    const oy = P.getY(0) - y0 - cy
    if (ox * N.getZ(0) + oy * N.getY(0) < 0) flip(g)
  }
  return g
}

function flip(g: THREE.BufferGeometry) {
  const ix = g.index!
  for (let i = 0; i < ix.count; i += 3) {
    const a = ix.getX(i + 1)
    ix.setX(i + 1, ix.getX(i + 2))
    ix.setX(i + 2, a)
  }
  g.computeVertexNormals()
}

/** Flat horizontal strip at height offset `dy`, from z0 to z1, following yfn along xs. UV in metres/tile. */
export function strip(z0: number, z1: number, xs: number[], yfn: (x: number) => number, dy = 0, tile = 4, vRepeat = 1) {
  const g = sweep(() => [[z0, dy], [z1, dy]], xs, yfn, false, tile)
  if (vRepeat !== 1) {
    const uv = g.attributes.uv
    for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * vRepeat)
  }
  return g
}

export function wallBox(w: number, h: number, d: number, x: number, y: number, z: number, rotY = 0, tile = 28.8) {
  // four side faces only (no top / bottom); UV in metres / tile
  const full = new THREE.BoxGeometry(w, h, d).toNonIndexed()
  const keep = [0, 1, 4, 5] // +x, -x, +z, -z (6 vertices each)
  const pos: number[] = []
  const nrm: number[] = []
  for (const f of keep) {
    for (let k = 0; k < 6; k++) {
      const i = f * 6 + k
      pos.push(full.attributes.position.getX(i), full.attributes.position.getY(i), full.attributes.position.getZ(i))
      nrm.push(full.attributes.normal.getX(i), full.attributes.normal.getY(i), full.attributes.normal.getZ(i))
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3))
  metricUV(g, tile)
  g.translate(0, h / 2, 0)
  g.rotateY(rotY)
  g.translate(x, y, z)
  return g
}

export function roofCap(w: number, d: number, x: number, y: number, z: number, rotY = 0) {
  const g = new THREE.PlaneGeometry(w, d)
  g.rotateX(-Math.PI / 2)
  g.rotateY(rotY)
  g.translate(x, y, z)
  const uv = g.attributes.uv
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w * 0.1, uv.getY(i) * d * 0.1)
  return g
}

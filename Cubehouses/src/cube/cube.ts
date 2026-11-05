import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { V2, shade } from './util'
import { blindMat, concreteMat, frameMat, glassMat, plasterMat, sidingMat, slateMat, trimMat } from './textures'

/* ---------------------------------------------------------------------------
 * Cube geometry. Piet Blom's cube houses are cubes tipped 45° onto one corner
 * and balanced on a hexagonal concrete pylon. The three faces that touch the
 * lowest corner ("lower" faces) are the painted yellow walls; the three faces
 * around the top corner are the slate-grey "roof" faces.
 * ------------------------------------------------------------------------- */
export const S = 6.4 // cube edge (m)
export const WALL = 0.2
export const D = S * Math.sqrt(3) // body diagonal = total cube height
export const UP = new THREE.Vector3(0, 1, 0)
export const TILT = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 1, 1).normalize(), UP)

/** Horizontal cross-section of the tilted cube at height h above the cube centre. Returns (x,z) polygon, sorted by angle. */
export function crossSection(h: number): V2[] {
  const hs = S / 2
  const verts: THREE.Vector3[] = []
  for (const x of [-hs, hs]) for (const y of [-hs, hs]) for (const z of [-hs, hs]) verts.push(new THREE.Vector3(x, y, z).applyQuaternion(TILT))
  const edges: [number, number][] = []
  for (let i = 0; i < 8; i++)
    for (let j = i + 1; j < 8; j++) {
      const diff = (i ^ j)
      if (diff === 1 || diff === 2 || diff === 4) edges.push([i, j])
    }
  const pts: V2[] = []
  for (const [i, j] of edges) {
    const a = verts[i]
    const b = verts[j]
    if ((a.y - h) * (b.y - h) < 0) {
      const t = (h - a.y) / (b.y - a.y)
      pts.push([a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t])
    }
  }
  pts.sort((p, q) => Math.atan2(p[1], p[0]) - Math.atan2(q[1], q[0]))
  return pts
}

/** Inset a regular (point-symmetric about origin) cross-section polygon by horizontal distance `inset`. */
export function insetPoly(poly: V2[], inset: number): V2[] {
  // apothem
  let apo = Infinity
  for (let i = 0; i < poly.length; i++) {
    const [ax, az] = poly[i]
    const [bx, bz] = poly[(i + 1) % poly.length]
    const L = Math.hypot(bx - ax, bz - az)
    const d = Math.abs(ax * bz - bx * az) / L
    apo = Math.min(apo, d)
  }
  const k = Math.max(0.01, (apo - inset) / apo)
  return poly.map(([x, z]) => [x * k, z * k] as V2)
}

export function apothem(poly: V2[]) {
  let apo = Infinity
  for (let i = 0; i < poly.length; i++) {
    const [ax, az] = poly[i]
    const [bx, bz] = poly[(i + 1) % poly.length]
    apo = Math.min(apo, Math.abs(ax * bz - bx * az) / Math.hypot(bx - ax, bz - az))
  }
  return apo
}

export interface FacePlane {
  nx: number
  nz: number
  ny: number
  nh: number
  upper: boolean
}
/** The six face planes as horizontal half-planes: n̂·p ≤ (S/2 − ny·h)/nh, with h = height above the cube centre. */
export function facePlanes(): FacePlane[] {
  const out: FacePlane[] = []
  for (const id of ['+x', '-x', '+y', '-y', '+z', '-z']) {
    const axis = id[1] === 'x' ? 0 : id[1] === 'y' ? 1 : 2
    const s = id[0] === '+' ? 1 : -1
    const n = new THREE.Vector3()
    n.setComponent(axis, s)
    n.applyQuaternion(TILT)
    const nh = Math.hypot(n.x, n.z)
    out.push({ nx: n.x / nh, nz: n.z / nh, ny: n.y, nh, upper: s > 0 })
  }
  return out
}
export const planeDist = (p: { ny: number; nh: number }, h: number) => (S / 2 - p.ny * h) / p.nh

/** Horizontal angle (atan2(z,x)) of the outward normal of the +x cube face (at yaw 0). All face normals sit at a0 + k*60°. */
export function faceAngle0() {
  const n = new THREE.Vector3(1, 0, 0).applyQuaternion(TILT)
  return Math.atan2(n.z, n.x)
}

/* ------------------------------------------------------------------ faces */
export type FaceId = '+x' | '-x' | '+y' | '-y' | '+z' | '-z'
export const FACES: FaceId[] = ['+x', '-x', '+y', '-y', '+z', '-z']
export interface WinDef {
  cx: number
  cy: number
  w: number
  h: number
  cols: number
  rows: number
}
export type Layout = Record<FaceId, WinDef[]>

const AX: Record<string, [THREE.Vector3, THREE.Vector3, THREE.Vector3]> = {
  x: [new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0)],
  y: [new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0)],
  z: [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)],
}

function faceMatrix(id: FaceId) {
  const axis = id[1]
  const sign = id[0] === '+' ? 1 : -1
  const [p, q, n] = AX[axis]
  const P = p.clone()
  const Q = q.clone().multiplyScalar(sign)
  const N = n.clone().multiplyScalar(sign)
  const m = new THREE.Matrix4().makeBasis(P, Q, N)
  m.setPosition(N.clone().multiplyScalar(S / 2))
  return { m, sign, axis }
}

function clipHalfPlane(pts: V2[], a: number, b: number, c: number): V2[] {
  // keep a*x + b*y >= c
  const out: V2[] = []
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]
    const q = pts[(i + 1) % pts.length]
    const dp = a * p[0] + b * p[1] - c
    const dq = a * q[0] + b * q[1] - c
    if (dp >= 0) out.push(p)
    if (dp >= 0 !== dq >= 0) {
      const t = dp / (dp - dq)
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t])
    }
  }
  return out
}

/** Footprint of a face slab in *cube* (p,q) coordinates, with priority-shrinking so slabs butt together. */
function footprint(axis: string, sign: number, half: number, shrink: number, cutD: number | null): V2[] {
  const hp = axis === 'x' ? half : axis === 'y' ? half : half - shrink
  const hq = axis === 'x' ? half : half - shrink
  const hq2 = axis === 'z' ? half - shrink : hq
  let pts: V2[] = [
    [-hp, -hq2],
    [hp, -hq2],
    [hp, hq2],
    [-hp, hq2],
  ]
  if (cutD !== null && sign < 0) {
    // truncate the bottom corner: keep p+q >= m
    const m = cutD * Math.sqrt(3) - S
    pts = clipHalfPlane(pts, 1, 1, m)
  }
  return pts
}

function shapeFrom(pts: V2[], sign: number, holes: WinDef[], inflate = 0): THREE.Shape {
  // convert cube (p,q) -> face (u,v): u=p, v=sign*q
  const f = pts.map(([p, q]) => new THREE.Vector2(p, sign * q))
  // ensure CCW
  let a = 0
  for (let i = 0; i < f.length; i++) {
    const p1 = f[i]
    const p2 = f[(i + 1) % f.length]
    a += p1.x * p2.y - p2.x * p1.y
  }
  if (a < 0) f.reverse()
  const sh = new THREE.Shape(f)
  for (const w of holes) {
    const x0 = w.cx - w.w / 2 - inflate
    const x1 = w.cx + w.w / 2 + inflate
    const y0 = w.cy - w.h / 2 - inflate
    const y1 = w.cy + w.h / 2 + inflate
    const hole = new THREE.Path()
    hole.moveTo(x0, y0)
    hole.lineTo(x0, y1)
    hole.lineTo(x1, y1)
    hole.lineTo(x1, y0)
    hole.closePath()
    sh.holes.push(hole)
  }
  return sh
}

function extrudeFace(shape: THREE.Shape, depth: number, m: THREE.Matrix4, zShift: number) {
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 1 })
  geo.translate(0, 0, zShift - depth) // outer plane at zShift
  geo.applyMatrix4(m)
  return geo
}

/* ------------------------------------------------------------------ window layouts */
const W = (cx: number, cy: number, w: number, h: number, cols = 2, rows = 1): WinDef => ({ cx, cy, w, h, cols, rows })

export const LAYOUTS: Layout[] = [
  // A: big roof windows, tall lower windows
  {
    '+x': [W(0.0, 0.1, 4.0, 3.2, 3, 2)],
    '+y': [W(0.0, 0.1, 4.0, 3.2, 3, 2)],
    '+z': [W(0.0, 0.1, 4.0, 3.2, 3, 2)],
    '-x': [W(0.2, 0.2, 2.3, 2.7, 2, 2)],
    '-y': [W(0.2, 0.2, 2.3, 2.7, 2, 2)],
    '-z': [W(0.2, 0.2, 2.3, 2.7, 2, 2)],
  },
  // B: wide lower windows, split roof windows
  {
    '+x': [W(-1.15, 0.1, 1.9, 3.0, 2, 2), W(1.35, 0.1, 1.9, 3.0, 2, 2)],
    '+y': [W(0.0, 0.1, 4.2, 3.0, 3, 1)],
    '+z': [W(0.0, 0.1, 3.6, 3.4, 3, 2)],
    '-x': [W(0.3, 0.3, 3.2, 2.0, 3, 1)],
    '-y': [W(0.3, 0.3, 3.2, 2.0, 3, 1)],
    '-z': [W(0.3, 0.3, 2.0, 3.0, 2, 2)],
  },
  // C: mix with a solid face
  {
    '+x': [W(0.0, 0.0, 4.4, 2.8, 4, 1)],
    '+y': [W(0.0, 0.1, 3.6, 3.4, 3, 2)],
    '+z': [W(-0.6, 0.1, 2.4, 3.2, 2, 2), W(1.9, 0.1, 1.2, 3.2, 1, 2)],
    '-x': [W(0.2, 0.2, 2.6, 2.4, 2, 2)],
    '-y': [],
    '-z': [W(0.2, 0.2, 2.6, 2.4, 2, 2)],
  },
]

/* ------------------------------------------------------------------ shell builder */
export interface ShellOpts {
  layout: Layout
  show?: boolean // visitable cube (real interior lining, no fake blinds, clean glass)
  truncate?: number | null // cut bottom corner at this distance above the lowest vertex
  seed?: number
}

export function buildCubeShell(o: ShellOpts): THREE.Group {
  const root = new THREE.Group()
  root.quaternion.copy(TILT)
  const hs = S / 2
  const wall = sidingMat()
  const slate = slateMat()
  const trim = trimMat()
  const plaster = plasterMat()
  const frameGeos: THREE.BufferGeometry[] = []
  const glassGeos: THREE.BufferGeometry[] = []
  const blindGeos: Record<number, THREE.BufferGeometry[]> = {}
  let blindIdx = o.seed ?? 0

  for (const id of FACES) {
    const { m, sign, axis } = faceMatrix(id)
    const upper = sign > 0
    const wins = o.layout[id]
    const fp = footprint(axis, sign, hs, WALL, o.truncate ?? null)
    const shape = shapeFrom(fp, sign, wins)
    // thick structural slab: cladding on the outside, dark reveals
    const geo = extrudeFace(shape, WALL, m, 0)
    const mesh = shade(new THREE.Mesh(geo, [upper ? slate : wall, trim]))
    root.add(mesh)

    // inner lining (visitable cube only)
    if (o.show) {
      const ih = hs - WALL
      const ifp = footprint(axis, sign, ih, 0, o.truncate !== null && o.truncate !== undefined ? o.truncate - WALL * 0.8 : null)
      const ishape = shapeFrom(ifp, sign, wins)
      const lg = extrudeFace(ishape, 0.03, m, -WALL)
      const lining = shade(new THREE.Mesh(lg, [plaster, plaster]), false, true)
      root.add(lining)
    }

    // frames, glass, blinds
    for (const w of wins) {
      const fw = 0.075
      const fd = 0.11
      const z0 = -0.05 - fd / 2
      const bars: [number, number, number, number][] = []
      bars.push([w.cx, w.cy + w.h / 2 - fw / 2, w.w, fw])
      bars.push([w.cx, w.cy - w.h / 2 + fw / 2, w.w, fw])
      bars.push([w.cx - w.w / 2 + fw / 2, w.cy, fw, w.h])
      bars.push([w.cx + w.w / 2 - fw / 2, w.cy, fw, w.h])
      for (let i = 1; i < w.cols; i++) bars.push([w.cx - w.w / 2 + (w.w * i) / w.cols, w.cy, 0.045, w.h])
      for (let j = 1; j < w.rows; j++) bars.push([w.cx, w.cy - w.h / 2 + (w.h * j) / w.rows, w.w, 0.045])
      for (const [bx, by, bw, bh] of bars) {
        const g = new THREE.BoxGeometry(bw, bh, fd)
        g.translate(bx, by, z0)
        g.applyMatrix4(m)
        frameGeos.push(g)
      }
      // outer sill lip (dark metal flashing around the opening)
      const lip = 0.035
      const lipBars: [number, number, number, number][] = [
        [w.cx, w.cy + w.h / 2 + lip / 2, w.w + lip * 2, lip],
        [w.cx, w.cy - w.h / 2 - lip / 2, w.w + lip * 2, lip],
        [w.cx - w.w / 2 - lip / 2, w.cy, lip, w.h],
        [w.cx + w.w / 2 + lip / 2, w.cy, lip, w.h],
      ]
      for (const [bx, by, bw, bh] of lipBars) {
        const g = new THREE.BoxGeometry(bw, bh, 0.03)
        g.translate(bx, by, 0.012)
        g.applyMatrix4(m)
        frameGeos.push(g)
      }
      const gg = new THREE.PlaneGeometry(w.w - fw, w.h - fw)
      gg.translate(w.cx, w.cy, -0.1)
      gg.applyMatrix4(m)
      glassGeos.push(gg)
      if (!o.show) {
        const variant = (blindIdx++ * 7 + (upper ? 1 : 0)) % 4
        const bg = new THREE.PlaneGeometry(w.w - fw, w.h - fw)
        bg.rotateY(Math.PI) // face inward
        bg.translate(w.cx, w.cy, -WALL + 0.04)
        bg.applyMatrix4(m)
        ;(blindGeos[variant] ??= []).push(bg)
      }
    }
  }

  const frames = new THREE.Mesh(mergeGeometries(frameGeos, false)!, frameMat())
  shade(frames)
  root.add(frames)
  const glass = new THREE.Mesh(mergeGeometries(glassGeos, false)!, glassMat(o.show ? 0.16 : 0.3))
  glass.renderOrder = 2
  glass.userData.noAO = true
  root.add(glass)
  for (const [v, list] of Object.entries(blindGeos)) {
    const bm = new THREE.Mesh(mergeGeometries(list, false)!, blindMat(+v))
    bm.userData.noAO = true
    root.add(bm)
  }
  // dark interior box (blocks see-through for non-visitable cubes)
  if (!o.show) {
    const inner = new THREE.Mesh(new THREE.BoxGeometry(S - WALL * 2.2, S - WALL * 2.2, S - WALL * 2.2), new THREE.MeshStandardMaterial({ color: '#cfc6b5', roughness: 1, side: THREE.BackSide }))
    inner.userData.noAO = true
    root.add(inner)
  }
  return root
}

/* ------------------------------------------------------------------ pylon */
/** Hexagon (flat sides facing angles a0 + k*60°) as (x,z) points, circumradius R. */
export function hexPoints(apo: number, a0: number, off = 0): V2[] {
  const R = apo / Math.cos(Math.PI / 6)
  const pts: V2[] = []
  for (let i = 0; i < 6; i++) {
    const a = a0 + Math.PI / 6 + off + (i * Math.PI) / 3
    pts.push([Math.cos(a) * R, Math.sin(a) * R])
  }
  return pts
}

export function buildSolidPylon(apo: number, height: number, a0: number): THREE.Mesh {
  const pts = hexPoints(apo, a0)
  const shape = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)))
  const geo = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false })
  geo.rotateX(-Math.PI / 2)
  const mesh = shade(new THREE.Mesh(geo, concreteMat()))
  return mesh
}

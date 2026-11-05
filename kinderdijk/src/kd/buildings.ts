import * as THREE from 'three'
import { Batch, TAU, beamGeo, boxGeo, frustumGeo, gableEndsGeo, gableRoofGeo, hipRoofGeo, rng } from './gfx'
import { M } from './materials'
import { BridgeDef, deckY, frameAt, heightAt } from './canal'

const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)
const T = (x: number, y: number, z: number) => new THREE.Matrix4().makeTranslation(x, y, z)

function window(b: Batch, m: THREE.Matrix4, w: number, h: number, shutters = true, arch = false) {
  const at = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => b.add(geo, mat, m.clone().multiply(T(x, y, z)))
  at(boxGeo(w + 0.26, h + 0.26, 0.14, 0.5), M.paint, 0, 0, 0)
  at(boxGeo(w, h, 0.1, 0.5), M.glass, 0, 0, 0.06)
  at(boxGeo(0.05, h, 0.04, 0.5), M.paint, 0, 0, 0.11)
  at(boxGeo(w, 0.05, 0.04, 0.5), M.paint, 0, h * 0.18, 0.11)
  at(boxGeo(w + 0.5, 0.08, 0.3, 0.5), M.stone, 0, -(h / 2 + 0.17), 0.1)
  if (arch) at(boxGeo(w + 0.5, 0.2, 0.2, 0.5), M.stone, 0, h / 2 + 0.2, 0.06)
  if (shutters) for (const s of [-1, 1]) at(boxGeo(w * 0.52, h + 0.26, 0.05, 0.5), M.paintGreen, s * (w * 0.5 + 0.3 + w * 0.26 - 0.1), 0, 0.1)
}

export interface Built {
  group: THREE.Group
  colliders: [number, number, number][] // local x,z,r
  w: number
  d: number
}

export function farmhouse(o: { w: number; d: number; seed: number; roof: 'tiles' | 'dark' | 'thatch' }): Built {
  const { w, d } = o
  const r = rng(o.seed)
  const b = new Batch()
  const wallH = 3.1
  const roofH = 2.9
  const brick = r() < 0.5 ? M.brick : M.brickB
  b.add(boxGeo(w, wallH, d, 1.4), brick, T(0, wallH / 2, 0))
  b.add(boxGeo(w + 0.2, 0.45, d + 0.2, 1.4), M.stone, T(0, 0.22, 0))
  b.add(gableEndsGeo(w, d, roofH, 1.4), brick, T(0, wallH, 0))
  const roofMat = o.roof === 'tiles' ? M.tiles : o.roof === 'dark' ? M.tilesDark : M.thatchC
  b.add(gableRoofGeo(w, d, roofH, 0.5, o.roof === 'thatch' ? 1.6 : 1.2), roofMat, T(0, wallH, 0))
  b.add(boxGeo(w + 1.1, 0.16, 0.22, 1), o.roof === 'thatch' ? M.woodDark : M.tilesDark, T(0, wallH + roofH + 0.05, 0))
  // chimneys
  for (const cx of [-w * 0.28, w * 0.3]) {
    b.add(boxGeo(0.8, 2.6, 0.8, 0.9), brick, T(cx, wallH + 1.3, -d * 0.12))
    b.add(boxGeo(1.0, 0.14, 1.0, 0.9), M.stone, T(cx, wallH + 2.52, -d * 0.12))
  }
  // front facade (+z) and rear (-z)
  const fz = d / 2
  const nWin = Math.max(2, Math.round(w / 3.6))
  const doorIdx = Math.floor(nWin / 2)
  for (let i = 0; i < nWin; i++) {
    const x = -w / 2 + (w / nWin) * (i + 0.5)
    if (i === doorIdx) {
      b.add(boxGeo(1.2, 2.25, 0.16, 0.6), M.paintGreen, T(x, 1.25, fz + 0.04))
      b.add(boxGeo(1.55, 0.14, 0.26, 0.6), M.paint, T(x, 2.43, fz + 0.06))
      b.add(boxGeo(1.4, 0.2, 0.7, 0.6), M.stone, T(x, 0.3, fz + 0.3))
    } else {
      window(b, T(x, 1.75, fz), 0.95, 1.3, true)
      window(b, new THREE.Matrix4().makeRotationY(Math.PI).setPosition(-x, 1.75, -fz), 0.95, 1.3, false)
    }
  }
  // dormers
  for (const dx of [-w * 0.25, w * 0.25]) {
    b.add(boxGeo(1.6, 1.3, 1.0, 1), brick, T(dx, wallH + 0.9, fz - 0.9))
    b.add(gableRoofGeo(1.6, 1.0, 0.7, 0.2, 1.2).rotateY(Math.PI / 2), roofMat, T(dx, wallH + 1.55, fz - 0.9))
    window(b, T(dx, wallH + 0.9, fz - 0.38), 0.7, 0.8, false)
  }
  // white-painted barge boards
  b.add(beamGeo(v3(-w / 2 - 0.2, wallH - 0.1, fz + 0.45), v3(0, wallH + roofH + 0.1, fz + 0.45), 0.08, 0.1, 1), M.paint)
  // garden wall + hedge
  b.add(boxGeo(w + 4, 0.8, 0.28, 1.2), brick, T(0, 0.4, fz + 3.0))
  const body = b.build()
  return { group: body, colliders: [[-w * 0.3, 0, d * 0.62], [w * 0.3, 0, d * 0.62], [0, 0, d * 0.62]], w, d }
}

/** The Wisboom steam pumping station (1868): brick engine house, slate roof, tall octagonal chimney. */
export function pumpingStation(): Built {
  const b = new Batch()
  const w = 17
  const d = 9.5
  const H = 7.6
  b.add(boxGeo(w, H, d, 1.4), M.brickB, T(0, H / 2, 0))
  b.add(boxGeo(w + 0.4, 0.8, d + 0.4, 1.4), M.stone, T(0, 0.4, 0))
  b.add(boxGeo(w + 0.5, 0.35, d + 0.5, 1.4), M.stone, T(0, H + 0.1, 0))
  b.add(gableEndsGeo(w, d, 3.4, 1.4), M.brickB, T(0, H, 0))
  b.add(gableRoofGeo(w, d, 3.4, 0.5, 1.1), M.slate, T(0, H + 0.2, 0))
  // boiler house
  b.add(boxGeo(8, 5, 7, 1.4), M.brickB, T(-w / 2 - 3.8, 2.5, -1))
  b.add(gableEndsGeo(8, 7, 2, 1.4), M.brickB, T(-w / 2 - 3.8, 5, -1))
  b.add(gableRoofGeo(8, 7, 2, 0.4, 1.1), M.slate, T(-w / 2 - 3.8, 5.05, -1))
  // chimney: octagonal tapering brick shaft with stone bands
  const ch = 24
  b.add(frustumGeo(1.9, 1.55, 3, 8, 1.4, false), M.stone, T(-w / 2 - 3.8, 0, -4.4))
  b.add(frustumGeo(1.45, 0.95, ch, 8, 1.4, false), M.brickB, T(-w / 2 - 3.8, 3, -4.4))
  b.add(frustumGeo(1.18, 1.18, 0.5, 8, 1), M.stone, T(-w / 2 - 3.8, ch + 2.5, -4.4).clone())
  for (const y of [9, 15, 21]) b.add(frustumGeo(1.15 - (y - 3) * 0.0235 + 0.07, 1.1 - (y - 3) * 0.0235 + 0.07, 0.3, 8, 1), M.stone, T(-w / 2 - 3.8, y, -4.4))
  // arched windows (front +z and rear)
  const n = 5
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + (w / n) * (i + 0.5)
    for (const s of [1, -1]) {
      const m = new THREE.Matrix4().makeRotationY(s > 0 ? 0 : Math.PI).setPosition(s > 0 ? x : -x, 0, s * d / 2)
      b.add(boxGeo(1.7, 3.8, 0.2, 0.6), M.stone, m.clone().multiply(T(0, 4.1, 0)))
      b.add(boxGeo(1.4, 3.5, 0.2, 0.6), M.glass, m.clone().multiply(T(0, 4.1, 0.08)))
      b.add(boxGeo(0.06, 3.5, 0.06, 0.6), M.paint, m.clone().multiply(T(0, 4.1, 0.2)))
      for (const yy of [3.1, 4.1, 5.1]) b.add(boxGeo(1.4, 0.05, 0.06, 0.6), M.paint, m.clone().multiply(T(0, yy, 0.2)))
      const arch = new THREE.CylinderGeometry(0.7, 0.7, 0.2, 14, 1, false, 0, Math.PI)
      arch.rotateX(Math.PI / 2)
      arch.rotateZ(Math.PI / 2 * 0)
      b.add(arch, M.glass, m.clone().multiply(T(0, 5.85, 0.08)))
    }
  }
  b.add(boxGeo(3, 4.6, 0.3, 0.6), M.paintGreen, T(0, 2.3, d / 2 + 0.05))
  b.add(boxGeo(3.6, 0.3, 0.5, 0.6), M.stone, T(0, 4.8, d / 2 + 0.1))
  return { group: b.build(), colliders: [[-5, 0, 6.5], [0, 0, 6.5], [5, 0, 6.5], [-w / 2 - 4, -1, 5.5]], w, d }
}

/** Arched timber footbridge crossing the canal at parameter b.x */
export function footbridge(bd: BridgeDef): THREE.Group {
  const f = frameAt(bd.x)
  const P = (u: number, w: number, y?: number) => v3(f.x + f.nx * u + f.tx * w, y ?? deckY(bd, u), f.z + f.nz * u + f.tz * w)
  const b = new Batch()
  const N = 40
  const L = bd.halfLen
  const W = bd.halfW
  const yaw = Math.atan2(f.nx, f.nz)
  for (let i = 0; i < N; i++) {
    const u0 = -L + (2 * L * i) / N
    const u1 = -L + (2 * L * (i + 1)) / N
    const a = P(u0, 0)
    const c = P(u1, 0)
    const mid = a.clone().add(c).multiplyScalar(0.5)
    const len = a.distanceTo(c)
    const pitch = Math.atan2(c.y - a.y, Math.hypot(c.x - a.x, c.z - a.z))
    const m = new THREE.Matrix4().compose(mid, new THREE.Quaternion().setFromEuler(new THREE.Euler(-pitch, yaw, 0, 'YXZ')), v3(1, 1, 1))
    // planks (each segment is 2 boards)
    b.add(boxGeo(W * 2, 0.1, len * 1.01, 0.6), M.wood, m.clone().multiply(T(0, -0.04, 0)))
    // under stringers
    for (const s of [-0.7, 0, 0.7]) b.add(boxGeo(0.16, 0.5, len * 1.04, 0.6), M.woodDark, m.clone().multiply(T(s * W * 0.75, -0.34, 0)))
    // rails
    for (const s of [-1, 1]) {
      b.add(boxGeo(0.1, 0.1, len * 1.02, 0.6), M.wood, m.clone().multiply(T(s * (W + 0.02), 1.0, 0)))
      b.add(boxGeo(0.06, 0.06, len * 1.02, 0.6), M.wood, m.clone().multiply(T(s * (W + 0.02), 0.55, 0)))
      if (i % 2 === 0) b.add(boxGeo(0.12, 1.0, 0.12, 0.6), M.wood, m.clone().multiply(T(s * (W + 0.02), 0.5, -len * 0.5)))
    }
  }
  // end posts
  for (const e of [-1, 1])
    for (const s of [-1, 1]) {
      const p = P(e * L, s * (W + 0.02))
      b.add(boxGeo(0.16, 1.3, 0.16, 0.6), M.woodDark, T(p.x, p.y + 0.55, p.z))
    }
  // deck bearers sit on timber abutments
  for (const e of [-1, 1]) {
    const p = P(e * (L - 0.6), 0)
    const g = boxGeo(W * 2 + 0.4, 0.5, 1.2, 0.6)
    b.add(g, M.woodDark, new THREE.Matrix4().compose(v3(p.x, heightAt(p.x, p.z) - 0.05, p.z), new THREE.Quaternion().setFromAxisAngle(v3(0, 1, 0), yaw), v3(1, 1, 1)))
  }
  return b.build()
}

const boatMat = new THREE.MeshStandardMaterial({ color: '#2d4639', roughness: 0.45, metalness: 0.0, side: THREE.DoubleSide })
const boatInner = new THREE.MeshStandardMaterial({ color: '#cfc5aa', roughness: 0.7, side: THREE.DoubleSide })

export function rowBoat(seed = 1, color?: string): THREE.Group {
  const r = rng(seed)
  const L = 3.9 + r() * 0.6
  const B = 1.35
  const nu = 24
  const nv = 8
  const pos: number[] = []
  const idx: number[] = []
  for (let side = 0; side < 2; side++)
    for (let i = 0; i <= nu; i++) {
      const u = i / nu
      const x = (u - 0.5) * L
      const taper = Math.pow(Math.sin(Math.PI * Math.pow(u, 0.9)), 0.62)
      const half = (B / 2) * taper
      const gun = 0.46 + 0.28 * Math.pow(Math.abs(2 * u - 1), 3)
      const keel = 0.08 + 0.1 * Math.pow(Math.abs(2 * u - 1), 2)
      for (let j = 0; j <= nv; j++) {
        const v = j / nv
        const a = (v * Math.PI) / 2
        const wy = keel + (gun - keel) * (1 - Math.cos(a)) * 0.0 - 0 + (gun - keel) * v
        const wz = half * Math.pow(Math.sin(a), 0.85) * (side ? -1 : 1)
        pos.push(x, wy, wz)
      }
    }
  const row = nv + 1
  for (let side = 0; side < 2; side++)
    for (let i = 0; i < nu; i++)
      for (let j = 0; j < nv; j++) {
        const a = side * (nu + 1) * row + i * row + j
        idx.push(a, a + row, a + 1, a + 1, a + row, a + row + 1)
      }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  const grp = new THREE.Group()
  const hull = new THREE.Mesh(g, color ? new THREE.MeshStandardMaterial({ color, roughness: 0.45, side: THREE.DoubleSide }) : boatMat)
  hull.castShadow = true
  hull.receiveShadow = true
  grp.add(hull)
  const b = new Batch()
  for (const x of [-0.9, 0.2, 1.1]) b.add(boxGeo(0.3, 0.05, B * 0.8, 0.5), M.wood, T(x, 0.3, 0))
  b.add(boxGeo(L * 0.8, 0.05, 0.4, 0.5), M.wood, T(0, 0.08, 0))
  b.add(boxGeo(L * 0.96, 0.05, 0.05, 0.5), boatInner, T(0, 0.74, B * 0.0 + 0.0))
  // oars shipped across
  b.add(beamGeo(v3(0.2, 0.55, -1.2), v3(0.2, 0.55, 1.4), 0.045, 0.045, 1), M.wood)
  grp.add(b.build())
  void TAU
  return grp
}

export function fenceRun(a: THREE.Vector3, c: THREE.Vector3, hFn?: (x: number, z: number) => number) {
  const b = new Batch()
  const len = a.distanceTo(c)
  const n = Math.max(1, Math.round(len / 2.2))
  const pts: THREE.Vector3[] = []
  for (let i = 0; i <= n; i++) {
    const p = a.clone().lerp(c, i / n)
    p.y = hFn ? hFn(p.x, p.z) : p.y
    pts.push(p)
  }
  pts.forEach((p) => b.add(boxGeo(0.12, 1.1, 0.12, 0.6), M.wood, T(p.x, p.y + 0.5, p.z)))
  for (let i = 0; i < n; i++)
    for (const hh of [0.45, 0.85]) b.add(beamGeo(pts[i].clone().add(v3(0, hh, 0)), pts[i + 1].clone().add(v3(0, hh, 0)), 0.05, 0.1, 0.6), M.wood)
  return b.build()
}

export function hipBarn(w: number, d: number, seed: number): Built {
  void seed
  const b = new Batch()
  const wallH = 3.4
  b.add(boxGeo(w, wallH, d, 1.4), M.brick, T(0, wallH / 2, 0))
  b.add(boxGeo(w + 0.2, 0.4, d + 0.2, 1.4), M.stone, T(0, 0.2, 0))
  b.add(hipRoofGeo(w, d, 6.0, 0.7, 1.7), M.thatchC, T(0, wallH, 0))
  b.add(boxGeo(3.6, 3.0, 0.2, 0.6), M.tar, T(0, 1.5, d / 2 + 0.05))
  b.add(boxGeo(4.0, 0.3, 0.3, 0.6), M.paint, T(0, 3.1, d / 2 + 0.1))
  return { group: b.build(), colliders: [[0, 0, Math.max(w, d) * 0.5]], w, d }
}

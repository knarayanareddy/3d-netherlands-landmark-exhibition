import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { TAU, fbm, lerp, rng, smooth, taperedTube } from './gfx'
import { M } from './materials'
import { canalZ, heightAt, signedDist } from './canal'

const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

/** Crossed cutout cards with upward normals (soft, uniform lighting like real grass). */
export function cardGeo(w: number, h: number, planes = 2) {
  const pos: number[] = []
  const nor: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  for (let p = 0; p < planes; p++) {
    const a = (p / planes) * Math.PI
    const dx = Math.cos(a) * (w / 2)
    const dz = Math.sin(a) * (w / 2)
    const o = pos.length / 3
    pos.push(-dx, 0, -dz, dx, 0, dz, dx, h, dz, -dx, h, -dz)
    for (let i = 0; i < 4; i++) nor.push(0, 1, 0)
    uv.push(0, 0, 1, 0, 1, 1, 0, 1)
    idx.push(o, o + 1, o + 2, o, o + 2, o + 3)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  return g
}

export interface ScatterOpts {
  allowed: (x: number, z: number, ad: number) => boolean
  density: number
}

export class GrassField {
  group = new THREE.Group()
  chunks: { mesh: THREE.InstancedMesh; cx: number; cz: number; full: number }[] = []
  private density = 1

  constructor(o: ScatterOpts, x0 = -255, x1 = 255) {
    const CH = 24
    const r = rng(2024)
    const gA = cardGeo(0.95, 1.0, 2)
    const gB = cardGeo(0.9, 1.1, 2)
    const gF = cardGeo(0.5, 0.5, 2)
    const m4 = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const col = new THREE.Color()
    const buckets = new Map<string, { A: number[][]; B: number[][]; F: number[][] }>()
    const put = (key: string, kind: 'A' | 'B' | 'F', rec: number[]) => {
      let b = buckets.get(key)
      if (!b) buckets.set(key, (b = { A: [], B: [], F: [] }))
      b[kind].push(rec)
    }
    const step = 0.82 / Math.sqrt(o.density)
    for (let x = x0; x < x1; x += step)
      for (let dd = -82; dd < 82; dd += step) {
        const jx = x + (r() - 0.5) * step * 1.2
        const jd = dd + (r() - 0.5) * step * 1.2
        const f = { z: canalZ(jx) }
        const dzdx = (canalZ(jx + 1) - canalZ(jx - 1)) / 2
        const n = 1 / Math.sqrt(1 + dzdx * dzdx)
        const px = jx - dzdx * n * jd
        const pz = f.z + n * jd
        const ad = Math.abs(jd)
        if (ad < 6.3) continue
        if (!o.allowed(px, pz, ad)) continue
        const h = heightAt(px, pz)
        if (h < 0.02 && ad < 12) continue
        const cx = Math.floor(px / CH)
        const cz = Math.floor(pz / CH)
        const key = cx + ',' + cz
        const patch = fbm(px * 0.05, pz * 0.05, 31, 2)
        const tall = ad > 14 ? 1 : 0.62
        const s = (0.55 + r() * 0.75) * tall * (0.8 + patch * 0.5)
        const br = 0.62 + r() * 0.5
        const dry = smooth(0.58, 0.78, fbm(px * 0.02, pz * 0.02, 21, 3))
        const rec = [px, h - 0.03, pz, r() * TAU, s, br, dry]
        if (r() < 0.3) put(key, 'B', rec)
        else put(key, 'A', rec)
        if (r() < 0.05 * smooth(0.45, 0.6, patch) * 2.2) put(key, 'F', [px + (r() - 0.5) * 0.6, h - 0.02, pz + (r() - 0.5) * 0.6, r() * TAU, 0.7 + r() * 0.7, 1, 0])
      }
    const mk = (geo: THREE.BufferGeometry, mat: THREE.Material, recs: number[][], cx: number, cz: number, flower = false) => {
      if (!recs.length) return
      const mesh = new THREE.InstancedMesh(geo, mat, recs.length)
      recs.forEach((rc, i) => {
        q.setFromAxisAngle(v3(0, 1, 0), rc[3])
        m4.compose(v3(rc[0], rc[1], rc[2]), q, v3(rc[4] * (flower ? 1 : 1.1), rc[4], rc[4] * (flower ? 1 : 1.1)))
        mesh.setMatrixAt(i, m4)
        if (flower) col.setRGB(1, 1, 1)
        else col.setHSL(lerp(0.24, 0.17, rc[6]), lerp(0.42, 0.3, rc[6]), 0.95 * rc[5])
        mesh.setColorAt(i, col)
      })
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
      mesh.receiveShadow = true
      mesh.castShadow = false
      mesh.frustumCulled = true
      mesh.computeBoundingSphere()
      this.group.add(mesh)
      this.chunks.push({ mesh, cx: (cx + 0.5) * CH, cz: (cz + 0.5) * CH, full: recs.length })
    }
    buckets.forEach((b, key) => {
      const [cx, cz] = key.split(',').map(Number)
      mk(gA, M.grassCard, b.A, cx, cz)
      mk(gB, M.grassCardB, b.B, cx, cz)
      mk(gF, M.flowerCard, b.F, cx, cz, true)
    })
  }

  setDensity(d: number) {
    this.density = d
    for (const c of this.chunks) c.mesh.count = Math.max(1, Math.floor(c.full * d))
  }
  update(px: number, pz: number, range: number) {
    for (const c of this.chunks) {
      const d = Math.hypot(c.cx - px, c.cz - pz)
      c.mesh.visible = d < range
    }
  }
  getDensity() {
    return this.density
  }
}

export function buildReeds(allowed: (x: number, z: number) => boolean, x0 = -330, x1 = 330) {
  const r = rng(808)
  const g = cardGeo(1.5, 2.1, 2)
  const recs: number[][] = []
  for (let x = x0; x < x1; x += 0.38)
    for (const side of [-1, 1]) {
      const d = side * (4.6 + r() * 2.6)
      const dz = (canalZ(x + 1) - canalZ(x - 1)) / 2
      const n = 1 / Math.sqrt(1 + dz * dz)
      const px = x - dz * n * d
      const pz = canalZ(x) + n * d
      const h = heightAt(px, pz)
      if (h < -0.85 || h > 0.28) continue
      const patch = fbm(x * 0.05 + side * 9, d * 0.3, 55, 3)
      if (patch < 0.46 + (h > 0 ? 0.05 : 0)) continue
      if (!allowed(px, pz)) continue
      const s = 0.55 + r() * 0.6 + patch * 0.5
      recs.push([px, Math.min(h, 0.05) - 0.12, pz, r() * TAU, s, 0.75 + r() * 0.35])
    }
  const mesh = new THREE.InstancedMesh(g, M.reedCard, recs.length)
  const m4 = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const c = new THREE.Color()
  recs.forEach((rc, i) => {
    q.setFromAxisAngle(v3(0, 1, 0), rc[3])
    m4.compose(v3(rc[0], rc[1], rc[2]), q, v3(rc[4], rc[4], rc[4]))
    mesh.setMatrixAt(i, m4)
    c.setRGB(rc[5], rc[5], rc[5] * 0.9)
    mesh.setColorAt(i, c)
  })
  mesh.castShadow = true
  mesh.receiveShadow = true
  mesh.frustumCulled = false
  return mesh
}

/* --------------------------------------------------------------------- trees */
export interface TreeGeo {
  trunk: THREE.BufferGeometry
  leaves: THREE.BufferGeometry
  height: number
  mat: THREE.Material
}

class LeafBuilder {
  pos: number[] = []
  nor: number[] = []
  uv: number[] = []
  col: number[] = []
  idx: number[] = []
  /** anchor: 'center' or 'top' (hanging) */
  card(p: THREE.Vector3, w: number, h: number, yaw: number, tilt: number, roll: number, normal: THREE.Vector3, bright: number, anchor: 'center' | 'top', r: () => number) {
    const e = new THREE.Euler(tilt, yaw, roll, 'YXZ')
    const m = new THREE.Matrix4().compose(p, new THREE.Quaternion().setFromEuler(e), v3(1, 1, 1))
    const y0 = anchor === 'center' ? -h / 2 : -h
    const y1 = anchor === 'center' ? h / 2 : 0
    const mir = r() < 0.5
    const corners = [v3(-w / 2, y0, 0), v3(w / 2, y0, 0), v3(w / 2, y1, 0), v3(-w / 2, y1, 0)]
    const o = this.pos.length / 3
    const uvs = mir ? [1, 0, 0, 0, 0, 1, 1, 1] : [0, 0, 1, 0, 1, 1, 0, 1]
    corners.forEach((c, i) => {
      c.applyMatrix4(m)
      this.pos.push(c.x, c.y, c.z)
      this.nor.push(normal.x, normal.y, normal.z)
      this.uv.push(uvs[i * 2], uvs[i * 2 + 1])
      // slight vertical gradient: darker low
      const k = bright * (i < 2 ? 0.86 : 1)
      this.col.push(k, k, k)
    })
    this.idx.push(o, o + 1, o + 2, o, o + 2, o + 3)
  }
  geo() {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3))
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2))
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3))
    g.setIndex(this.idx)
    return g
  }
}

export function genTree(kind: 'round' | 'willow' | 'poplar', seed: number): TreeGeo {
  const r = rng(seed * 977 + (kind === 'round' ? 1 : kind === 'willow' ? 2 : 3))
  const lb = new LeafBuilder()
  const tubes: THREE.BufferGeometry[] = []
  const tile = 1.3
  let height = 10

  const limb = (a: THREE.Vector3, dir: THREE.Vector3, len: number, r0: number, r1: number, depth: number, leafFn: (p: THREE.Vector3, d: THREE.Vector3, depth: number) => void) => {
    const pts: THREE.Vector3[] = [a.clone()]
    let p = a.clone()
    const d = dir.clone().normalize()
    const nseg = 3
    for (let i = 0; i < nseg; i++) {
      d.add(v3((r() - 0.5) * 0.35, (kind === 'willow' ? -0.1 : 0.04) + (r() - 0.5) * 0.2, (r() - 0.5) * 0.35)).normalize()
      p = p.clone().addScaledVector(d, len / nseg)
      pts.push(p)
    }
    tubes.push(taperedTube(pts, r0, r1, 6, tile))
    leafFn(p, d, depth)
    return { end: p, dir: d, pts }
  }

  if (kind === 'round') {
    const th = 2.6 + r() * 1.2
    const trunkPts = [v3(0, -0.3, 0), v3((r() - 0.5) * 0.3, th * 0.5, (r() - 0.5) * 0.3), v3((r() - 0.5) * 0.5, th, (r() - 0.5) * 0.5)]
    tubes.push(taperedTube(trunkPts, 0.36, 0.22, 8, tile))
    const top = trunkPts[2]
    const centre = v3(top.x, th + 3.1, top.z)
    const R = 4.1 + r() * 0.8
    const leaf = (p: THREE.Vector3, bright = 1, n = 16) => {
      for (let i = 0; i < n; i++) {
        const off = v3((r() - 0.5) * 2.2, (r() - 0.3) * 1.6, (r() - 0.5) * 2.2)
        const q = p.clone().add(off)
        const nrm = q.clone().sub(centre).normalize()
        nrm.y = nrm.y * 0.7 + 0.35
        nrm.normalize()
        const dist = q.distanceTo(centre) / R
        const sz = 1.0 + r() * 0.9
        lb.card(q, sz, sz, r() * TAU, (r() - 0.5) * 1.6, (r() - 0.5) * 1.2, nrm, bright * (0.5 + 0.55 * Math.min(1, dist) + r() * 0.16), 'center', r)
      }
    }
    const nb = 6
    for (let i = 0; i < nb; i++) {
      const a = (i / nb) * TAU + r()
      const dir = v3(Math.cos(a) * 0.8, 0.85 + r() * 0.3, Math.sin(a) * 0.8)
      const b = limb(top.clone().add(v3(0, -0.3 - r() * 0.5, 0)), dir, 3.2 + r() * 1.6, 0.17, 0.07, 1, () => {})
      for (let k = 0; k < 3; k++) {
        const a2 = a + (r() - 0.5) * 1.5
        const dir2 = v3(Math.cos(a2) * 1.0, 0.4 + r() * 0.6, Math.sin(a2) * 1.0)
        limb(b.pts[2 + (k % 2)].clone(), dir2, 1.8 + r() * 1.6, 0.06, 0.03, 2, (p) => leaf(p, 1, 14))
      }
      leaf(b.end, 1, 10)
    }
    // fill canopy interior
    for (let i = 0; i < 46; i++) {
      const a = r() * TAU
      const rr = Math.sqrt(r()) * R * 0.85
      leaf(v3(centre.x + Math.cos(a) * rr, centre.y + (r() - 0.35) * R * 0.9, centre.z + Math.sin(a) * rr), 0.9, 2)
    }
    height = th + 3.1 + R
  } else if (kind === 'willow') {
    const th = 1.8 + r() * 1.0
    const trunkPts = [v3(0, -0.3, 0), v3((r() - 0.5) * 0.25, th * 0.5, (r() - 0.5) * 0.25), v3((r() - 0.5) * 0.4, th, (r() - 0.5) * 0.4)]
    tubes.push(taperedTube(trunkPts, 0.55, 0.38, 8, tile))
    const top = trunkPts[2]
    const nb = 7
    const strand = (p: THREE.Vector3, cutR: number) => {
      const n = 1 + Math.floor(r() * 2.2)
      for (let i = 0; i < n; i++) {
        const q = p.clone().add(v3((r() - 0.5) * 0.9, (r() - 0.5) * 0.4, (r() - 0.5) * 0.9))
        const L = 2.0 + r() * 2.4
        const out = v3(q.x - top.x, 0.5, q.z - top.z).normalize()
        const dim = 0.55 + Math.min(1, Math.hypot(q.x, q.z) / cutR) * 0.45
        lb.card(q, 0.55 + r() * 0.4, L, r() * TAU, (r() - 0.5) * 0.18, (r() - 0.5) * 0.25, out, dim * (0.7 + r() * 0.45), 'top', r)
      }
    }
    for (let i = 0; i < nb; i++) {
      const a = (i / nb) * TAU + r() * 0.5
      const dir = v3(Math.cos(a) * 0.85, 0.75 + r() * 0.35, Math.sin(a) * 0.85)
      const b = limb(top.clone(), dir, 3.0 + r() * 1.5, 0.19, 0.08, 1, () => {})
      // arching secondary limbs with hanging strands
      for (let k = 0; k < 3; k++) {
        const a2 = a + (r() - 0.5) * 1.1
        const dir2 = v3(Math.cos(a2), 0.45 + r() * 0.35, Math.sin(a2))
        const sub = limb(b.pts[1 + (k % 3)].clone(), dir2, 2.2 + r() * 1.6, 0.07, 0.03, 2, () => {})
        for (let s = 1; s < sub.pts.length; s++) strand(sub.pts[s], 4.5)
        strand(sub.end, 4.5)
      }
      for (let s = 1; s < b.pts.length; s++) strand(b.pts[s], 4.5)
    }
    height = th + 6
  } else {
    const th = 3.8 + r() * 1.5
    const trunkPts = [v3(0, -0.3, 0), v3((r() - 0.5) * 0.2, th * 0.5, (r() - 0.5) * 0.2), v3((r() - 0.5) * 0.35, th, (r() - 0.5) * 0.35)]
    tubes.push(taperedTube(trunkPts, 0.3, 0.2, 8, tile))
    const H = 14 + r() * 4
    const centre = v3(0, th + (H - th) * 0.5, 0)
    // spine
    tubes.push(taperedTube([v3(0, th, 0), v3(0.1, th + (H - th) * 0.5, 0), v3(0, H, 0)], 0.2, 0.04, 6, tile))
    for (let i = 0; i < 12; i++) {
      const y = th + 0.8 + (i / 12) * (H - th - 1.5)
      const a = r() * TAU
      const rad = lerp(1.1, 1.8, Math.sin(Math.min(1, (y - th) / (H - th)) * Math.PI)) 
      limb(v3(0, y, 0), v3(Math.cos(a) * 0.5, 0.7, Math.sin(a) * 0.5), rad * 1.4, 0.05, 0.02, 2, () => {})
    }
    for (let i = 0; i < 240; i++) {
      const t = Math.pow(r(), 0.85)
      const y = th + 0.5 + t * (H - th - 0.5)
      const prof = Math.sin(Math.min(1, (y - th) / (H - th)) * Math.PI * 0.92 + 0.12)
      const rad = Math.sqrt(r()) * (0.5 + 2.0 * prof)
      const a = r() * TAU
      const q = v3(Math.cos(a) * rad, y, Math.sin(a) * rad)
      const nrm = q.clone().sub(v3(0, y, 0))
      nrm.y = 0.35
      nrm.normalize()
      const sz = 1.0 + r() * 0.8
      lb.card(q, sz, sz, r() * TAU, (r() - 0.5) * 1.4, (r() - 0.5) * 1.0, nrm, 0.5 + 0.55 * Math.min(1, rad / 2.2) + r() * 0.15, 'center', r)
    }
    void centre
    height = H
  }
  const trunk = mergeGeometries(tubes, false)!
  tubes.forEach((t) => t.dispose())
  const mat = kind === 'round' ? M.leafRound : kind === 'willow' ? M.leafWillow : M.leafPoplar
  return { trunk, leaves: lb.geo(), height, mat }
}

export function treeMesh(t: TreeGeo, x: number, y: number, z: number, scale: number, yaw: number) {
  const g = new THREE.Group()
  const trunk = new THREE.Mesh(t.trunk, M.bark)
  const leaves = new THREE.Mesh(t.leaves, t.mat)
  for (const m of [trunk, leaves]) {
    m.castShadow = true
    m.receiveShadow = true
  }
  g.add(trunk, leaves)
  g.position.set(x, y, z)
  g.scale.setScalar(scale)
  g.rotation.y = yaw
  return g
}

export const distToCanal = signedDist

import * as THREE from 'three'

export type Pt = [number, number]

/** decode decimetre-packed coordinates into metres */
export const decode = (p: number[]): Pt[] => {
  const o: Pt[] = []
  for (let i = 0; i < p.length; i += 2) o.push([p[i] / 10, p[i + 1] / 10])
  return o
}

export const signedArea = (P: Pt[]) => {
  let a = 0
  for (let i = 0; i < P.length; i++) { const j = (i + 1) % P.length; a += P[i][0] * P[j][1] - P[j][0] * P[i][1] }
  return a / 2
}
/** orient so that shoelace area in (x,z) is positive (outward normal = (dz,-dx)) */
export const ccw = (P: Pt[]) => (signedArea(P) < 0 ? [...P].reverse() : P)

export const centroid = (P: Pt[]): Pt => {
  let x = 0, z = 0
  for (const p of P) { x += p[0]; z += p[1] }
  return [x / P.length, z / P.length]
}

export function pointInPoly(x: number, z: number, P: Pt[]) {
  let c = false
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const a = P[i], b = P[j]
    if (a[1] > z !== b[1] > z && x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]) c = !c
  }
  return c
}

export function distToSeg(px: number, pz: number, a: Pt, b: Pt) {
  const dx = b[0] - a[0], dz = b[1] - a[1]
  const l2 = dx * dx + dz * dz
  let t = l2 ? ((px - a[0]) * dx + (pz - a[1]) * dz) / l2 : 0
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(px - (a[0] + dx * t), pz - (a[1] + dz * t))
}

export interface OBB { cx: number; cz: number; ang: number; hx: number; hz: number; fill: number }
/** minimum-area oriented bounding box (rotating over polygon edge directions) */
export function obb(P: Pt[]): OBB {
  let best: OBB | null = null
  let bestA = Infinity
  const n = P.length
  const step = n > 120 ? Math.ceil(n / 120) : 1
  for (let i = 0; i < n; i += step) {
    const a = P[i], b = P[(i + 1) % n]
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0])
    const c = Math.cos(ang), s = Math.sin(ang)
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity
    for (const p of P) {
      const x = p[0] * c + p[1] * s, z = -p[0] * s + p[1] * c
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z
    }
    const A = (x1 - x0) * (z1 - z0)
    if (A < bestA) {
      bestA = A
      const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2
      best = { cx: mx * c - mz * s, cz: mx * s + mz * c, ang, hx: (x1 - x0) / 2, hz: (z1 - z0) / 2, fill: 0 }
    }
  }
  const o = best!
  o.fill = Math.abs(signedArea(P)) / bestA
  // make hx the long axis
  if (o.hz > o.hx) { const t = o.hx; o.hx = o.hz; o.hz = t; o.ang += Math.PI / 2 }
  return o
}

export class Mesher {
  pos: number[] = []
  nor: number[] = []
  uv: number[] = []
  col: number[] = []
  idx: number[] = []
  get count() { return this.pos.length / 3 }

  v(x: number, y: number, z: number, nx: number, ny: number, nz: number, u: number, v: number, r = 1, g = 1, b = 1) {
    this.pos.push(x, y, z)
    this.nor.push(nx, ny, nz)
    this.uv.push(u, v)
    this.col.push(r, g, b)
    return this.pos.length / 3 - 1
  }
  tri(a: number, b: number, c: number) { this.idx.push(a, b, c) }
  quad(a: number, b: number, c: number, d: number) { this.idx.push(a, b, c, a, c, d) }
  /** add a triangle wound so that it faces the given normal */
  triFacing(a: number, b: number, c: number, nx: number, ny: number, nz: number) {
    const P = this.pos
    const ax = P[a * 3], ay = P[a * 3 + 1], az = P[a * 3 + 2]
    const ux = P[b * 3] - ax, uy = P[b * 3 + 1] - ay, uz = P[b * 3 + 2] - az
    const vx = P[c * 3] - ax, vy = P[c * 3 + 1] - ay, vz = P[c * 3 + 2] - az
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx
    if (cx * nx + cy * ny + cz * nz >= 0) this.idx.push(a, b, c)
    else this.idx.push(a, c, b)
  }

  /** textured facade walls around a CCW ring */
  walls(P: Pt[], y0: number, y1: number, o: { bay: number; floorH: number; uOff?: number; tint?: [number, number, number]; ao?: number; cells?: number; closed?: boolean }) {
    const cells = o.cells ?? 4
    const tint = o.tint ?? [1, 1, 1]
    const ao = o.ao ?? 0.72
    const hgt = y1 - y0
    if (hgt < 0.05) return
    const floors = Math.max(1, Math.round(hgt / o.floorH))
    const vTop = floors / cells
    const aoY = Math.min(hgt, 2.6)
    const vAo = (aoY / hgt) * vTop
    const n = P.length
    let uAcc = o.uOff ?? 0
    const edges = o.closed === false ? n - 1 : n
    for (let i = 0; i < edges; i++) {
      const a = P[i], b = P[(i + 1) % n]
      const dx = b[0] - a[0], dz = b[1] - a[1]
      const len = Math.hypot(dx, dz)
      if (len < 0.05) continue
      const nx = dz / len, nzz = -dx / len
      const cnt = len < o.bay * 0.75 ? len / o.bay : Math.max(1, Math.round(len / o.bay))
      const u0 = uAcc, u1 = uAcc + cnt / cells
      uAcc = u1
      const i0 = this.v(a[0], y0, a[1], nx, 0, nzz, u0, 0, tint[0] * ao, tint[1] * ao, tint[2] * ao)
      const i1 = this.v(b[0], y0, b[1], nx, 0, nzz, u1, 0, tint[0] * ao, tint[1] * ao, tint[2] * ao)
      const im0 = this.v(a[0], y0 + aoY, a[1], nx, 0, nzz, u0, vAo, tint[0], tint[1], tint[2])
      const im1 = this.v(b[0], y0 + aoY, b[1], nx, 0, nzz, u1, vAo, tint[0], tint[1], tint[2])
      const it0 = this.v(a[0], y1, a[1], nx, 0, nzz, u0, vTop, tint[0], tint[1], tint[2])
      const it1 = this.v(b[0], y1, b[1], nx, 0, nzz, u1, vTop, tint[0], tint[1], tint[2])
      // outward winding
      this.triFacing(i0, im1, i1, nx, 0, nzz); this.triFacing(i0, im0, im1, nx, 0, nzz)
      if (aoY < hgt) { this.triFacing(im0, it1, im1, nx, 0, nzz); this.triFacing(im0, it0, it1, nx, 0, nzz) }
    }
  }

  /** flat polygon at height y, world-space UVs, normal up */
  poly(P: Pt[], y: number, tint: [number, number, number] = [1, 1, 1], down = false) {
    if (P.length < 3) return
    const contour = P.map((p) => new THREE.Vector2(p[0], p[1]))
    let tris: number[][]
    try { tris = THREE.ShapeUtils.triangulateShape(contour, []) } catch { return }
    const base = this.count
    const ny = down ? -1 : 1
    for (const p of P) this.v(p[0], y, p[1], 0, ny, 0, p[0], p[1], tint[0], tint[1], tint[2])
    for (const t of tris) {
      const a = P[t[0]], b = P[t[1]], c = P[t[2]]
      const cr = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
      const up = down ? cr > 0 : cr < 0
      if (up) this.tri(base + t[0], base + t[1], base + t[2])
      else this.tri(base + t[0], base + t[2], base + t[1])
    }
  }

  /** axis box in rotated frame (cx,cz,ang), world UVs on all faces */
  box(cx: number, cz: number, sx: number, sz: number, ang: number, y0: number, y1: number, tint: [number, number, number] = [1, 1, 1]) {
    const c = Math.cos(ang), s = Math.sin(ang)
    const pts: Pt[] = [[-sx / 2, -sz / 2], [sx / 2, -sz / 2], [sx / 2, sz / 2], [-sx / 2, sz / 2]].map(([x, z]) => [cx + x * c - z * s, cz + x * s + z * c] as Pt)
    const R = ccw(pts)
    for (let i = 0; i < 4; i++) {
      const a = R[i], b = R[(i + 1) % 4]
      const dx = b[0] - a[0], dz = b[1] - a[1]
      const l = Math.hypot(dx, dz)
      const nx = dz / l, nzz = -dx / l
      const q0 = this.v(a[0], y0, a[1], nx, 0, nzz, 0, y0, tint[0], tint[1], tint[2])
      const q1 = this.v(b[0], y0, b[1], nx, 0, nzz, l, y0, tint[0], tint[1], tint[2])
      const q2 = this.v(b[0], y1, b[1], nx, 0, nzz, l, y1, tint[0], tint[1], tint[2])
      const q3 = this.v(a[0], y1, a[1], nx, 0, nzz, 0, y1, tint[0], tint[1], tint[2])
      this.triFacing(q0, q2, q1, nx, 0, nzz); this.triFacing(q0, q3, q2, nx, 0, nzz)
    }
    this.poly(R, y1, tint)
  }

  /** ribbon along a polyline at constant height; world UVs */
  ribbon(P: Pt[], w: number, y: number, tint: [number, number, number] = [1, 1, 1]) {
    const n = P.length
    if (n < 2) return
    const L: Pt[] = [], R: Pt[] = []
    for (let i = 0; i < n; i++) {
      const p = P[i]
      let dx0 = 0, dz0 = 0, dx1 = 0, dz1 = 0
      if (i > 0) { dx0 = p[0] - P[i - 1][0]; dz0 = p[1] - P[i - 1][1]; const l = Math.hypot(dx0, dz0) || 1; dx0 /= l; dz0 /= l }
      if (i < n - 1) { dx1 = P[i + 1][0] - p[0]; dz1 = P[i + 1][1] - p[1]; const l = Math.hypot(dx1, dz1) || 1; dx1 /= l; dz1 /= l }
      if (i === 0) { dx0 = dx1; dz0 = dz1 }
      if (i === n - 1) { dx1 = dx0; dz1 = dz0 }
      let mx = dx0 + dx1, mz = dz0 + dz1
      let ml = Math.hypot(mx, mz)
      if (ml < 1e-3) { mx = dx1; mz = dz1; ml = 1 }
      mx /= ml; mz /= ml
      const nx = -mz, nz = mx
      const dot = Math.max(0.45, nx * -dz1 + nz * dx1) // miter length compensation (clamped)
      const k = w / 2 / dot
      L.push([p[0] + nx * k, p[1] + nz * k])
      R.push([p[0] - nx * k, p[1] - nz * k])
    }
    const base = this.count
    for (let i = 0; i < n; i++) {
      this.v(L[i][0], y, L[i][1], 0, 1, 0, L[i][0], L[i][1], tint[0], tint[1], tint[2])
      this.v(R[i][0], y, R[i][1], 0, 1, 0, R[i][0], R[i][1], tint[0], tint[1], tint[2])
    }
    for (let i = 0; i < n - 1; i++) {
      const a = base + i * 2, b = a + 1, c = a + 2, d = a + 3
      // normal up: (a,c,b) check orientation by computing sign
      this.triFacing(a, b, c, 0, 1, 0); this.triFacing(b, d, c, 0, 1, 0)
    }
  }

  /** gabled roof over an OBB with eaves (roof slopes only). pitch in radians */
  gable(o: OBB, y: number, pitch: number, tint: [number, number, number] = [1, 1, 1], eave = 0.3) {
    const c = Math.cos(o.ang), s = Math.sin(o.ang)
    const X = (lx: number, lz: number): Pt => [o.cx + lx * c - lz * s, o.cz + lx * s + lz * c]
    const hx = o.hx + 0.15, hz = o.hz + eave
    const rise = Math.min(o.hz * Math.tan(pitch), 4.5)
    const slope = Math.hypot(hz, rise)
    const ey = y - 0.2, ry = y + rise
    for (const side of [-1, 1]) {
      const lnz = side * Math.sin(pitch), lny = Math.cos(pitch)
      const nx = -lnz * s, nzz = lnz * c
      const p0 = X(-hx, side * hz), p1 = X(hx, side * hz), r1 = X(hx, 0), r0 = X(-hx, 0)
      const a = this.v(p0[0], ey, p0[1], nx, lny, nzz, 0, 0, tint[0], tint[1], tint[2])
      const b = this.v(p1[0], ey, p1[1], nx, lny, nzz, hx * 2, 0, tint[0], tint[1], tint[2])
      const cc = this.v(r1[0], ry, r1[1], nx, lny, nzz, hx * 2, slope, tint[0], tint[1], tint[2])
      const d = this.v(r0[0], ry, r0[1], nx, lny, nzz, 0, slope, tint[0], tint[1], tint[2])
      this.triFacing(a, b, cc, nx, lny, nzz); this.triFacing(a, cc, d, nx, lny, nzz)
    }
    return rise
  }

  /** the two triangular gable-end walls (added to a facade mesher) */
  gableEnds(o: OBB, y: number, rise: number, bay: number, tint: [number, number, number] = [1, 1, 1]) {
    const c = Math.cos(o.ang), s = Math.sin(o.ang)
    const X = (lx: number, lz: number): Pt => [o.cx + lx * c - lz * s, o.cz + lx * s + lz * c]
    for (const side of [-1, 1]) {
      const lx = side * o.hx
      const a = X(lx, -o.hz), b = X(lx, o.hz), t = X(lx, 0)
      const nx = side * c, nzz = side * s
      const w = o.hz * 2
      const cnt = Math.max(1, Math.round(w / bay))
      const uu = cnt / 4
      const vT = Math.max(0.01, (rise / 3.2) / 4)
      const ia = this.v(a[0], y, a[1], nx, 0, nzz, 0, 0, tint[0], tint[1], tint[2])
      const ib = this.v(b[0], y, b[1], nx, 0, nzz, uu, 0, tint[0], tint[1], tint[2])
      const it = this.v(t[0], y + rise, t[1], nx, 0, nzz, uu / 2, vT, tint[0], tint[1], tint[2])
      this.triFacing(ia, ib, it, nx, 0, nzz)
    }
  }
  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3))
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2))
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3))
    g.setIndex(this.count > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1))
    g.computeBoundingSphere()
    g.computeBoundingBox()
    return g
  }
}

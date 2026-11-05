/** Small math / noise / polygon helpers shared by the Keukenhof experience. */

export const TAU = Math.PI * 2
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
export const smooth = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}

export type Rng = () => number
export function rng(seed: number): Rng {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function hash2(x: number, y: number, seed = 0): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 2147483647)) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

const q = (t: number) => t * t * t * (t * (t * 6 - 15) + 10)

/** Value noise, optionally periodic (period in lattice cells). */
export function vnoise(x: number, y: number, seed = 0, period = 0): number {
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const fx = q(x - x0)
  const fy = q(y - y0)
  let xi = x0
  let yi = y0
  let xj = x0 + 1
  let yj = y0 + 1
  if (period) {
    xi = ((xi % period) + period) % period
    yi = ((yi % period) + period) % period
    xj = ((xj % period) + period) % period
    yj = ((yj % period) + period) % period
  }
  const a = hash2(xi, yi, seed)
  const b = hash2(xj, yi, seed)
  const c = hash2(xi, yj, seed)
  const d = hash2(xj, yj, seed)
  return lerp(lerp(a, b, fx), lerp(c, d, fx), fy)
}

/** Non-periodic fbm, output 0..1 */
export function fbm(x: number, y: number, oct = 4, seed = 0): number {
  let s = 0
  let a = 0.5
  let f = 1
  let n = 0
  for (let i = 0; i < oct; i++) {
    s += a * vnoise(x * f, y * f, seed + i * 17)
    n += a
    a *= 0.5
    f *= 2
  }
  return s / n
}

/** Tileable fbm: u,v in [0,1) */
export function tfbm(u: number, v: number, base: number, oct: number, seed = 0): number {
  let s = 0
  let a = 0.5
  let f = base
  let n = 0
  for (let i = 0; i < oct; i++) {
    s += a * vnoise(u * f, v * f, seed + i * 31, f)
    n += a
    a *= 0.5
    f *= 2
  }
  return s / n
}

/** Tileable Worley noise: returns [F1, F2] in cell units. */
export function tworley(u: number, v: number, f: number, seed = 0): [number, number] {
  const x = u * f
  const y = v * f
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  let d1 = 9
  let d2 = 9
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const cx = ix + i
      const cy = iy + j
      const wx = ((cx % f) + f) % f
      const wy = ((cy % f) + f) % f
      const px = cx + hash2(wx, wy, seed)
      const py = cy + hash2(wx, wy, seed + 91)
      const d = Math.hypot(px - x, py - y)
      if (d < d1) {
        d2 = d1
        d1 = d
      } else if (d < d2) d2 = d
    }
  }
  return [d1, d2]
}

export type Pt = [number, number]

export function pointInPoly(x: number, z: number, p: Pt[]): boolean {
  let inside = false
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, zi] = p[i]
    const [xj, zj] = p[j]
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside
  }
  return inside
}

export function polyBounds(p: Pt[]) {
  let x0 = Infinity
  let z0 = Infinity
  let x1 = -Infinity
  let z1 = -Infinity
  for (const [x, z] of p) {
    if (x < x0) x0 = x
    if (x > x1) x1 = x
    if (z < z0) z0 = z
    if (z > z1) z1 = z
  }
  return { x0, z0, x1, z1 }
}

export function distToSeg(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax
  const dz = bz - az
  const l2 = dx * dx + dz * dz
  let t = l2 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0
  t = clamp(t, 0, 1)
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t))
}

/** Distance from point to polyline / closed polygon outline */
export function distToPath(px: number, pz: number, pts: Pt[], closed = false): number {
  let d = Infinity
  const n = pts.length
  for (let i = 0; i < n - (closed ? 0 : 1); i++) {
    const a = pts[i]
    const b = pts[(i + 1) % n]
    d = Math.min(d, distToSeg(px, pz, a[0], a[1], b[0], b[1]))
  }
  return d
}

/** Catmull-Rom smoothing of a polyline */
export function smoothPath(pts: Pt[], closed = false, per = 8): Pt[] {
  const out: Pt[] = []
  const n = pts.length
  const get = (i: number) => (closed ? pts[((i % n) + n) % n] : pts[clamp(i, 0, n - 1)])
  const segs = closed ? n : n - 1
  for (let i = 0; i < segs; i++) {
    const p0 = get(i - 1)
    const p1 = get(i)
    const p2 = get(i + 1)
    const p3 = get(i + 2)
    for (let k = 0; k < per; k++) {
      const t = k / per
      const t2 = t * t
      const t3 = t2 * t
      const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3)
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])])
    }
  }
  if (!closed) out.push(pts[n - 1])
  return out
}

export function shuffle<T>(a: T[], r: Rng) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export const tick = () => new Promise<void>((r) => setTimeout(r, 0))

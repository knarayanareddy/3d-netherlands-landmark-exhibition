// Small deterministic noise toolkit used to synthesise tileable PBR textures.

export function mulberry32(seed: number) {
  let a = seed | 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function hash2(x: number, y: number, seed = 0): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 1442695041)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

const mod = (a: number, n: number) => ((a % n) + n) % n

/** Periodic value noise. x,y are in lattice units; the pattern repeats every `period` cells. */
export function vnoise(x: number, y: number, period: number, seed = 0): number {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const xf = x - xi
  const yf = y - yi
  const u = xf * xf * (3 - 2 * xf)
  const v = yf * yf * (3 - 2 * yf)
  const x0 = mod(xi, period)
  const x1 = mod(xi + 1, period)
  const y0 = mod(yi, period)
  const y1 = mod(yi + 1, period)
  const a = hash2(x0, y0, seed)
  const b = hash2(x1, y0, seed)
  const c = hash2(x0, y1, seed)
  const d = hash2(x1, y1, seed)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}

export function fbm(x: number, y: number, period: number, oct = 4, seed = 0, gain = 0.5): number {
  let sum = 0
  let amp = 0.5
  let norm = 0
  let p = period
  let fx = x
  let fy = y
  for (let i = 0; i < oct; i++) {
    sum += amp * vnoise(fx, fy, p, seed + i * 17)
    norm += amp
    amp *= gain
    fx *= 2
    fy *= 2
    p *= 2
  }
  return sum / norm
}

/** Periodic worley noise. u,v in 0..1. Returns [nearest distance, 2nd nearest, cell id 0..1, cellX, cellY]. */
export function worley(u: number, v: number, cells: number, seed = 0, jitter = 1): [number, number, number, number, number] {
  const px = u * cells
  const py = v * cells
  const ix = Math.floor(px)
  const iy = Math.floor(py)
  let f1 = 9
  let f2 = 9
  let id = 0
  let cx = 0
  let cy = 0
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const gx = ix + i
      const gy = iy + j
      const wx = mod(gx, cells)
      const wy = mod(gy, cells)
      const fx = gx + 0.5 + (hash2(wx, wy, seed) - 0.5) * jitter
      const fy = gy + 0.5 + (hash2(wx, wy, seed + 91) - 0.5) * jitter
      const dx = fx - px
      const dy = fy - py
      const d = Math.sqrt(dx * dx + dy * dy)
      if (d < f1) {
        f2 = f1
        f1 = d
        id = hash2(wx, wy, seed + 5)
        cx = wx
        cy = wy
      } else if (d < f2) f2 = d
    }
  }
  return [f1, f2, id, cx, cy]
}

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
export const smoothstep = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a))
  return t * t * (3 - 2 * t)
}

// Small deterministic noise helpers (value noise, fbm, periodic variants for tileable textures)

export function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function hash2(ix: number, iy: number, seed = 0) {
  let h = Math.imul(ix | 0, 374761393) ^ Math.imul(iy | 0, 668265263) ^ Math.imul(seed | 0, 1442695041)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

const sm = (t: number) => t * t * (3 - 2 * t)

export function vnoise(x: number, y: number, seed = 0) {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const u = sm(x - ix)
  const v = sm(y - iy)
  const a = hash2(ix, iy, seed)
  const b = hash2(ix + 1, iy, seed)
  const c = hash2(ix, iy + 1, seed)
  const d = hash2(ix + 1, iy + 1, seed)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}

export function fbm(x: number, y: number, oct = 5, seed = 0) {
  let a = 0.5
  let f = 1
  let s = 0
  let n = 0
  for (let i = 0; i < oct; i++) {
    s += a * vnoise(x * f, y * f, seed + i * 17)
    n += a
    a *= 0.5
    f *= 2.03
  }
  return s / n
}

const wrap = (i: number, p: number) => ((i % p) + p) % p

/** periodic value noise: repeats every px / py lattice cells */
export function pnoise(x: number, y: number, px: number, py: number, seed = 0) {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const u = sm(x - ix)
  const v = sm(y - iy)
  const a = hash2(wrap(ix, px), wrap(iy, py), seed)
  const b = hash2(wrap(ix + 1, px), wrap(iy, py), seed)
  const c = hash2(wrap(ix, px), wrap(iy + 1, py), seed)
  const d = hash2(wrap(ix + 1, px), wrap(iy + 1, py), seed)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}

/** tileable fbm for u,v in [0,1) */
export function pfbm(u: number, v: number, px: number, py: number, oct = 4, seed = 0) {
  let a = 0.5
  let s = 0
  let n = 0
  let fx = px
  let fy = py
  for (let i = 0; i < oct; i++) {
    s += a * pnoise(u * fx, v * fy, fx, fy, seed + i * 31)
    n += a
    a *= 0.5
    fx *= 2
    fy *= 2
  }
  return s / n
}

export const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x))
export const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}
export const mix = (a: number, b: number, t: number) => a + (b - a) * t

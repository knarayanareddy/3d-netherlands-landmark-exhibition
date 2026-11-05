// Fast tileable noise built from a pre-baked lattice table so that per-pixel
// texture baking stays cheap.

export const hash = (x: number, y: number, s = 0) => {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041)) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967295
}

export const clamp = (v: number, a = 0, b = 1) => (v < a ? a : v > b ? b : v)
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
export const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}

const NS = 256
const table = new Float32Array(NS * NS)

function buildTable() {
  let max = -1
  let min = 2
  const octaves = [4, 8, 16, 32, 64, 128]
  for (let oi = 0; oi < octaves.length; oi++) {
    const P = octaves[oi]
    const amp = Math.pow(0.55, oi)
    const grid = new Float32Array(P * P)
    for (let i = 0; i < P * P; i++) grid[i] = hash(i % P, Math.floor(i / P), 77 + oi * 13)
    for (let y = 0; y < NS; y++) {
      const fy = (y / NS) * P
      const y0 = Math.floor(fy)
      const ty = fy - y0
      const sy = ty * ty * (3 - 2 * ty)
      for (let x = 0; x < NS; x++) {
        const fx = (x / NS) * P
        const x0 = Math.floor(fx)
        const tx = fx - x0
        const sx = tx * tx * (3 - 2 * tx)
        const a = grid[(y0 % P) * P + (x0 % P)]
        const b = grid[(y0 % P) * P + ((x0 + 1) % P)]
        const c = grid[((y0 + 1) % P) * P + (x0 % P)]
        const d = grid[((y0 + 1) % P) * P + ((x0 + 1) % P)]
        const v = lerp(lerp(a, b, sx), lerp(c, d, sx), sy)
        table[y * NS + x] += v * amp
      }
    }
  }
  for (let i = 0; i < table.length; i++) {
    if (table[i] > max) max = table[i]
    if (table[i] < min) min = table[i]
  }
  for (let i = 0; i < table.length; i++) table[i] = (table[i] - min) / (max - min)
}
buildTable()

/** tileable fbm-like noise, (u,v) in "turns" (1.0 = one full table). 0..1 */
export function nz(u: number, v: number) {
  const fx = (u - Math.floor(u)) * NS
  const fy = (v - Math.floor(v)) * NS
  const x0 = Math.floor(fx) & (NS - 1)
  const y0 = Math.floor(fy) & (NS - 1)
  const x1 = (x0 + 1) & (NS - 1)
  const y1 = (y0 + 1) & (NS - 1)
  const tx = fx - Math.floor(fx)
  const ty = fy - Math.floor(fy)
  const a = table[y0 * NS + x0]
  const b = table[y0 * NS + x1]
  const c = table[y1 * NS + x0]
  const d = table[y1 * NS + x1]
  return lerp(lerp(a, b, tx), lerp(c, d, tx), ty)
}

/** Seeded mulberry32 */
export function rng(seed: number) {
  let a = seed | 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

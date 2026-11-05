import * as THREE from 'three'

export const TAU = Math.PI * 2
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
export const smooth = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}

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

export function makeCanvas(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return { c, g: c.getContext('2d', { willReadFrequently: true })! }
}

/** Tileable (wrapping) multi-octave value noise in [0,1]. */
export function fbm(W: number, H: number, cx: number, cy: number, oct: number, seed: number, gain = 0.5): Float32Array {
  const out = new Float32Array(W * H)
  let amp = 1
  let tot = 0
  for (let o = 0; o < oct; o++) {
    const nx = Math.max(1, Math.round(cx * 2 ** o))
    const ny = Math.max(1, Math.round(cy * 2 ** o))
    const r = rng(seed * 7919 + o * 104729)
    const lat = new Float32Array(nx * ny)
    for (let i = 0; i < lat.length; i++) lat[i] = r()
    for (let y = 0; y < H; y++) {
      const fy = (y / H) * ny
      const y0 = Math.floor(fy)
      let ty = fy - y0
      ty = ty * ty * (3 - 2 * ty)
      const ya = (y0 % ny) * nx
      const yb = ((y0 + 1) % ny) * nx
      for (let x = 0; x < W; x++) {
        const fx = (x / W) * nx
        const x0 = Math.floor(fx)
        let tx = fx - x0
        tx = tx * tx * (3 - 2 * tx)
        const xa = x0 % nx
        const xb = (x0 + 1) % nx
        const v = lat[ya + xa] * (1 - tx) * (1 - ty) + lat[ya + xb] * tx * (1 - ty) + lat[yb + xa] * (1 - tx) * ty + lat[yb + xb] * tx * ty
        out[y * W + x] += v * amp
      }
    }
    tot += amp
    amp *= gain
  }
  for (let i = 0; i < out.length; i++) out[i] /= tot
  return out
}

export function heightToNormal(h: Float32Array, W: number, H: number, strength: number) {
  const d = new Uint8ClampedArray(W * H * 4)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const l = h[y * W + ((x + W - 1) % W)]
      const r = h[y * W + ((x + 1) % W)]
      const u = h[((y + H - 1) % H) * W + x]
      const b = h[((y + 1) % H) * W + x]
      let nx = (l - r) * strength
      let ny = (b - u) * strength
      const len = Math.hypot(nx, ny, 1)
      nx /= len
      ny /= len
      const i = (y * W + x) * 4
      d[i] = (nx * 0.5 + 0.5) * 255
      d[i + 1] = (ny * 0.5 + 0.5) * 255
      d[i + 2] = ((1 / len) * 0.5 + 0.5) * 255
      d[i + 3] = 255
    }
  }
  return d
}

export interface TexOpts {
  repeat?: [number, number]
  srgb?: boolean
  aniso?: number
  wrap?: THREE.Wrapping
}
export function canvasTex(c: HTMLCanvasElement, o: TexOpts = {}) {
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = o.wrap ?? THREE.RepeatWrapping
  t.anisotropy = o.aniso ?? 16
  t.colorSpace = o.srgb === false ? THREE.NoColorSpace : THREE.SRGBColorSpace
  t.generateMipmaps = true
  t.minFilter = THREE.LinearMipmapLinearFilter
  if (o.repeat) t.repeat.set(o.repeat[0], o.repeat[1])
  t.needsUpdate = true
  return t
}
export function dataTex(d: Uint8ClampedArray, W: number, H: number, o: TexOpts = {}) {
  const { c, g } = makeCanvas(W, H)
  g.putImageData(new ImageData(new Uint8ClampedArray(d), W, H), 0, 0)
  return canvasTex(c, o)
}

export function pbrTextures(W: number, H: number, alb: Uint8ClampedArray, hgt: Float32Array, nStrength: number, o: TexOpts = {}) {
  const map = dataTex(alb, W, H, { ...o, srgb: true })
  const normalMap = dataTex(heightToNormal(hgt, W, H, nStrength), W, H, { ...o, srgb: false })
  return { map, normalMap }
}

/** Is a point inside polygon (array of [x,z]) */
export function inPoly(x: number, z: number, p: [number, number][]) {
  let inside = false
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, zi] = p[i]
    const [xj, zj] = p[j]
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside
  }
  return inside
}

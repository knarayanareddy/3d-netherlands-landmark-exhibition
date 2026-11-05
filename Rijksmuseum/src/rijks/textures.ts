import * as THREE from 'three'
import { rng } from './geo'

/* ------------------------------------------------------------------ */
/*  low level helpers                                                  */
/* ------------------------------------------------------------------ */
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
const mix = (a: number, b: number, t: number) => a + (b - a) * t

function hash2(x: number, y: number, s: number) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041)) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

/** tileable fractal value noise in [0,1] */
export function fbm(w: number, h: number, cx: number, cy: number, oct: number, seed: number, gain = 0.5): Float32Array {
  const out = new Float32Array(w * h)
  let amp = 1, tot = 0
  for (let o = 0; o < oct; o++) {
    const nx = Math.max(1, Math.round(cx * 2 ** o)), ny = Math.max(1, Math.round(cy * 2 ** o))
    const lat = new Float32Array(nx * ny)
    for (let i = 0; i < lat.length; i++) lat[i] = hash2(i % nx, (i / nx) | 0, seed + o * 131)
    for (let y = 0; y < h; y++) {
      const fy = (y / h) * ny
      const y0 = Math.floor(fy), ty = smooth(0, 1, fy - y0)
      const ya = (y0 % ny) * nx, yb = ((y0 + 1) % ny) * nx
      for (let x = 0; x < w; x++) {
        const fx = (x / w) * nx
        const x0 = Math.floor(fx), tx = smooth(0, 1, fx - x0)
        const xa = x0 % nx, xb = (x0 + 1) % nx
        const v = mix(mix(lat[ya + xa], lat[ya + xb], tx), mix(lat[yb + xa], lat[yb + xb], tx), ty)
        out[y * w + x] += v * amp
      }
    }
    tot += amp
    amp *= gain
  }
  for (let i = 0; i < out.length; i++) out[i] /= tot
  return out
}

function mkCanvas(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

/** height field -> tangent-space normal map canvas (wraps) */
function heightToNormal(H: Float32Array, w: number, h: number, strength: number): HTMLCanvasElement {
  const c = mkCanvas(w, h)
  const g = c.getContext('2d')!
  const img = g.createImageData(w, h)
  const d = img.data
  for (let y = 0; y < h; y++) {
    const ym = ((y - 1 + h) % h) * w, yp = ((y + 1) % h) * w, yc = y * w
    for (let x = 0; x < w; x++) {
      const xm = (x - 1 + w) % w, xp = (x + 1) % w
      const dx = (H[yc + xp] - H[yc + xm]) * strength
      const dy = (H[yp + x] - H[ym + x]) * strength
      let nx = -dx, ny = dy, nz = 1
      const l = Math.hypot(nx, ny, nz)
      nx /= l; ny /= l; nz /= l
      const i = (yc + x) * 4
      d[i] = (nx * 0.5 + 0.5) * 255
      d[i + 1] = (ny * 0.5 + 0.5) * 255
      d[i + 2] = (nz * 0.5 + 0.5) * 255
      d[i + 3] = 255
    }
  }
  g.putImageData(img, 0, 0)
  return c
}

function grayCanvas(F: Float32Array, w: number, h: number): HTMLCanvasElement {
  const c = mkCanvas(w, h)
  const g = c.getContext('2d')!
  const img = g.createImageData(w, h)
  for (let i = 0; i < F.length; i++) {
    const v = Math.max(0, Math.min(1, F[i])) * 255
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v
    img.data[i * 4 + 3] = 255
  }
  g.putImageData(img, 0, 0)
  return c
}

function tex(c: HTMLCanvasElement, srgb: boolean, wm: number, hm: number) {
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
  t.anisotropy = 16
  t.generateMipmaps = true
  t.minFilter = THREE.LinearMipmapLinearFilter
  t.repeat.set(1 / wm, 1 / hm)
  return t
}

export interface PBR {
  map: THREE.Texture
  normalMap?: THREE.Texture
  roughnessMap?: THREE.Texture
}

const nextFrame = () => new Promise<void>((r) => setTimeout(r, 0))

/* ------------------------------------------------------------------ */
/*  masonry (bricks, pavers, ashlar blocks)                             */
/* ------------------------------------------------------------------ */
export interface MasonryOpts {
  w: number; h: number
  cols: number; rows: number
  wm: number; hm: number // world size of the tile in metres
  jointX: number; jointY: number // joint thickness in px
  palette: [number, number, number][]
  mortar: [number, number, number]
  seed: number
  bevel: number // px
  grain: number // 0..1
  variation: number // per-unit brightness variation
  rare?: number // chance of dark/pale outliers
  normal: number
  bond?: 'running' | 'stack'
  roughBase?: number
}

export function masonry(o: MasonryOpts): PBR {
  const { w, h, cols, rows } = o
  const px = w / cols, py = h / rows
  const col = mkCanvas(w, h)
  const g = col.getContext('2d')!
  const img = g.createImageData(w, h)
  const d = img.data
  const H = new Float32Array(w * h)
  const R = new Float32Array(w * h)
  const grainA = fbm(w, h, 96, 96 * (h / w), 3, o.seed + 1)
  const grainB = fbm(w, h, 8, 8 * (h / w), 3, o.seed + 2)
  const fine = fbm(w, h, 400, 400 * (h / w), 1, o.seed + 3)
  for (let y = 0; y < h; y++) {
    const row = Math.floor(y / py)
    const ly = y - row * py
    const off = o.bond === 'stack' ? 0 : (row % 2) * (px / 2)
    for (let x = 0; x < w; x++) {
      const xx = (x + w - off) % w
      const c = Math.floor(xx / px)
      const lx = xx - c * px
      const dxE = Math.min(lx - o.jointX / 2, px - o.jointX / 2 - lx)
      const dyE = Math.min(ly - o.jointY / 2, py - o.jointY / 2 - ly)
      const e = Math.min(dxE, dyE)
      const i = y * w + x
      const gr = grainA[i], gb = grainB[i], fn = fine[i]
      let r: number, gg: number, b: number, hh: number, rough: number
      if (e < 0) {
        // mortar
        const m = 0.82 + gr * 0.3 + (fn - 0.5) * 0.25
        r = o.mortar[0] * m; gg = o.mortar[1] * m; b = o.mortar[2] * m
        hh = 0.08 + gr * 0.08
        rough = 0.97
      } else {
        const id1 = hash2(c, row, o.seed), id2 = hash2(c, row, o.seed + 77)
        const pi = id1 * (o.palette.length - 1)
        const p0 = o.palette[Math.floor(pi)], p1 = o.palette[Math.min(o.palette.length - 1, Math.floor(pi) + 1)]
        const f = pi - Math.floor(pi)
        r = mix(p0[0], p1[0], f); gg = mix(p0[1], p1[1], f); b = mix(p0[2], p1[2], f)
        let br = 1 + (id2 - 0.5) * 2 * o.variation
        const rare = o.rare ?? 0
        const id3 = hash2(c, row, o.seed + 5)
        if (id3 < rare) { br *= 0.72; r *= 0.95 }
        else if (id3 > 1 - rare) { br *= 1.14; gg *= 1.03; b *= 0.96 }
        // streaky "flashing" typical of fired clay + noise
        br *= 1 + (gb - 0.5) * 0.55 * o.grain + (gr - 0.5) * 0.5 * o.grain + (fn - 0.5) * 0.35 * o.grain
        // gradient across each unit (kiln side)
        br *= 1 + (lx / px - 0.5) * 0.12 * (id1 - 0.5)
        const cav = smooth(0, o.bevel, e)
        br *= 0.72 + 0.28 * cav
        r *= br; gg *= br; b *= br
        hh = 0.35 + 0.65 * cav
        hh += (gr - 0.5) * 0.18 * o.grain + (fn - 0.5) * 0.2 * o.grain
        rough = (o.roughBase ?? 0.88) + (fn - 0.5) * 0.12
      }
      H[i] = hh
      R[i] = rough
      const k = i * 4
      d[k] = Math.min(255, r); d[k + 1] = Math.min(255, gg); d[k + 2] = Math.min(255, b); d[k + 3] = 255
    }
  }
  g.putImageData(img, 0, 0)
  return {
    map: tex(col, true, o.wm, o.hm),
    normalMap: tex(heightToNormal(H, w, h, o.normal), false, o.wm, o.hm),
    roughnessMap: tex(grayCanvas(R, w, h), false, o.wm, o.hm),
  }
}

/* ------------------------------------------------------------------ */
/*  slate roof                                                         */
/* ------------------------------------------------------------------ */
export function slate(seed = 21): PBR {
  const w = 1024, h = 1024, cols = 8, rows = 10
  const px = w / cols, py = h / rows
  const col = mkCanvas(w, h)
  const g = col.getContext('2d')!
  const img = g.createImageData(w, h)
  const d = img.data
  const H = new Float32Array(w * h)
  const R = new Float32Array(w * h)
  const gn = fbm(w, h, 64, 64, 3, seed)
  const gm = fbm(w, h, 6, 6, 3, seed + 3)
  for (let y = 0; y < h; y++) {
    const row = Math.floor(y / py)
    const ly = (y - row * py) / py
    const off = (row % 2) * (px / 2)
    for (let x = 0; x < w; x++) {
      const xx = (x + w - off) % w
      const c = Math.floor(xx / px)
      const lx = (xx - c * px) / px
      const i = y * w + x
      const id = hash2(c, row, seed), id2 = hash2(c, row, seed + 9)
      // base slate colour (cool blue-grey, slightly purple)
      let br = 0.82 + id * 0.36 + (gn[i] - 0.5) * 0.35 + (gm[i] - 0.5) * 0.25
      // shadow of the overlapping row above
      br *= 0.55 + 0.45 * smooth(0, 0.35, ly)
      // bright, worn lower edge
      br *= 1 + 0.35 * smooth(0.9, 1.0, ly) * (0.5 + id2)
      // joints between neighbouring slates
      const side = Math.min(lx, 1 - lx)
      br *= 0.5 + 0.5 * smooth(0, 0.03, side)
      // decorative lighter bands every few courses
      const band = row % 5 === 2 ? 1.1 : 1
      const k = i * 4
      d[k] = 58 * br * band; d[k + 1] = 66 * br * band; d[k + 2] = 80 * br * band; d[k + 3] = 255
      H[i] = smooth(0, 0.9, ly) * 0.9 + smooth(0, 0.03, side) * 0.1 + gn[i] * 0.05
      R[i] = 0.55 + gn[i] * 0.3 + (id2 - 0.5) * 0.12
    }
  }
  g.putImageData(img, 0, 0)
  return {
    map: tex(col, true, 2.4, 2.0),
    normalMap: tex(heightToNormal(H, w, h, 3.0), false, 2.4, 2.0),
    roughnessMap: tex(grayCanvas(R, w, h), false, 2.4, 2.0),
  }
}

/* ------------------------------------------------------------------ */
/*  polished limestone floor                                           */
/* ------------------------------------------------------------------ */
export function limestone(seed = 5, n = 4, wm = 2.4, base: [number, number, number] = [214, 206, 190]): PBR {
  const w = 1024, h = 1024
  const t = w / n
  const col = mkCanvas(w, h)
  const g = col.getContext('2d')!
  const img = g.createImageData(w, h)
  const d = img.data
  const H = new Float32Array(w * h)
  const R = new Float32Array(w * h)
  const f1 = fbm(w, h, 3, 3, 5, seed)
  const f2 = fbm(w, h, 12, 12, 3, seed + 1)
  const fn = fbm(w, h, 300, 300, 1, seed + 2)
  for (let y = 0; y < h; y++) {
    const ty = Math.floor(y / t), ly = y - ty * t
    for (let x = 0; x < w; x++) {
      const tx = Math.floor(x / t), lx = x - tx * t
      const i = y * w + x
      const e = Math.min(lx, t - lx, ly, t - ly)
      const id = hash2(tx, ty, seed)
      const vein = Math.abs(Math.sin((f1[i] * 9 + f2[i] * 1.5 + id * 6) * Math.PI))
      const v = Math.pow(1 - vein, 14) * 0.12
      let br = 0.94 + id * 0.1 + (f2[i] - 0.5) * 0.14 - v + (fn[i] - 0.5) * 0.04
      let joint = 1
      if (e < 2.2) joint = 0.55 + e * 0.2
      br *= joint
      const k = i * 4
      d[k] = base[0] * br; d[k + 1] = base[1] * br * 0.995; d[k + 2] = base[2] * br * 0.98; d[k + 3] = 255
      H[i] = e < 2.2 ? 0 : 0.5 + (fn[i] - 0.5) * 0.02
      R[i] = e < 2.2 ? 0.8 : 0.22 + f2[i] * 0.2 + (fn[i] - 0.5) * 0.1
    }
  }
  g.putImageData(img, 0, 0)
  return {
    map: tex(col, true, wm, wm),
    normalMap: tex(heightToNormal(H, w, h, 2), false, wm, wm),
    roughnessMap: tex(grayCanvas(R, w, h), false, wm, wm),
  }
}

/* ------------------------------------------------------------------ */
/*  oak boards                                                         */
/* ------------------------------------------------------------------ */
export function boards(seed = 9): PBR {
  const w = 1024, h = 1024, n = 14
  const bw = w / n
  const col = mkCanvas(w, h)
  const g = col.getContext('2d')!
  const img = g.createImageData(w, h)
  const d = img.data
  const H = new Float32Array(w * h)
  const R = new Float32Array(w * h)
  const grain = fbm(w, h, 70, 2, 4, seed)
  const warp = fbm(w, h, 5, 3, 3, seed + 1)
  const r = rng(seed)
  // staggered board end joints
  const ends: number[][] = []
  for (let c = 0; c < n; c++) {
    const a: number[] = []
    let y = r() * 400
    while (y < h + 400) { a.push(y); y += 280 + r() * 380 }
    ends.push(a)
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = Math.floor(x / bw)
      const lx = x - c * bw
      const i = y * w + x
      const list = ends[c]
      let seg = 0, dEnd = 999
      for (let s = 0; s < list.length; s++) {
        const dd = ((y - list[s]) % h + h) % h
        if (s === 0 || dd < dEnd) { dEnd = dd; seg = s }
      }
      const tail = Math.min(dEnd, ((list[(seg + 1) % list.length] - y) % h + h) % h)
      const id = hash2(c, seg, seed)
      const gr = grain[i] * 0.7 + warp[i] * 0.3
      const ring = 0.5 + 0.5 * Math.sin((lx / bw * 6 + gr * 14 + id * 10) * 2)
      let br = 0.82 + id * 0.3 + (gr - 0.5) * 0.35 + ring * 0.12
      const edge = Math.min(lx, bw - lx)
      if (edge < 1.5) br *= 0.55
      if (tail < 1.5) br *= 0.55
      const k = i * 4
      d[k] = 176 * br; d[k + 1] = 126 * br; d[k + 2] = 78 * br; d[k + 3] = 255
      H[i] = (edge < 1.5 || tail < 1.5 ? 0 : 0.6) + ring * 0.05
      R[i] = 0.38 + gr * 0.25
    }
  }
  g.putImageData(img, 0, 0)
  return {
    map: tex(col, true, 1.75, 1.75),
    normalMap: tex(heightToNormal(H, w, h, 1.6), false, 1.75, 1.75),
    roughnessMap: tex(grayCanvas(R, w, h), false, 1.75, 1.75),
  }
}

/* ------------------------------------------------------------------ */
/*  plaster / asphalt style noise textures                               */
/* ------------------------------------------------------------------ */
export function noiseSurface(opts: { base: [number, number, number]; seed: number; wm: number; contrast: number; speck?: number; normal?: number; rough?: number; size?: number }): PBR {
  const w = opts.size ?? 512, h = w
  const col = mkCanvas(w, h)
  const g = col.getContext('2d')!
  const img = g.createImageData(w, h)
  const d = img.data
  const a = fbm(w, h, 4, 4, 5, opts.seed)
  const b = fbm(w, h, 120, 120, 1, opts.seed + 4)
  const H = new Float32Array(w * h)
  const sp = opts.speck ?? 0
  for (let i = 0; i < w * h; i++) {
    let br = 1 + (a[i] - 0.5) * opts.contrast + (b[i] - 0.5) * opts.contrast * 0.6
    if (sp && b[i] > 0.82) br *= 1 + sp
    if (sp && b[i] < 0.15) br *= 1 - sp
    const k = i * 4
    d[k] = opts.base[0] * br; d[k + 1] = opts.base[1] * br; d[k + 2] = opts.base[2] * br; d[k + 3] = 255
    H[i] = a[i] * 0.5 + b[i] * 0.5
  }
  g.putImageData(img, 0, 0)
  const R = new Float32Array(w * h).fill(opts.rough ?? 0.9)
  return {
    map: tex(col, true, opts.wm, opts.wm),
    normalMap: tex(heightToNormal(H, w, h, opts.normal ?? 1.5), false, opts.wm, opts.wm),
    roughnessMap: tex(grayCanvas(R, w, h), false, opts.wm, opts.wm),
  }
}

/* ------------------------------------------------------------------ */
/*  grass                                                              */
/* ------------------------------------------------------------------ */
export function grass(seed = 3): PBR {
  const w = 1024, h = 1024
  const c = mkCanvas(w, h)
  const g = c.getContext('2d')!
  const r = rng(seed)
  g.fillStyle = '#4c7a2c'
  g.fillRect(0, 0, w, h)
  const m = fbm(w, h, 5, 5, 4, seed)
  const img = g.getImageData(0, 0, w, h)
  for (let i = 0; i < m.length; i++) {
    const t = 0.78 + m[i] * 0.5
    img.data[i * 4] *= t; img.data[i * 4 + 1] *= t; img.data[i * 4 + 2] *= t * 0.9
  }
  g.putImageData(img, 0, 0)
  const greens = ['#3c6a22', '#4f8530', '#628f34', '#2f5a1c', '#789c3e', '#557f2a', '#8aa64a', '#3d7227']
  g.lineCap = 'round'
  for (let i = 0; i < 52000; i++) {
    const x = r() * w, y = r() * h
    const len = 6 + r() * 12
    const dx = (r() - 0.5) * 7
    g.strokeStyle = greens[(r() * greens.length) | 0]
    g.globalAlpha = 0.55 + r() * 0.4
    g.lineWidth = 0.8 + r() * 1.2
    for (const ox of [0, x < 24 ? w : x > w - 24 ? -w : 0]) for (const oy of [0, y < 24 ? h : y > h - 24 ? -h : 0]) {
      g.beginPath()
      g.moveTo(x + ox, y + oy)
      g.quadraticCurveTo(x + ox + dx * 0.4, y + oy - len * 0.5, x + ox + dx, y + oy - len)
      g.stroke()
    }
  }
  g.globalAlpha = 1
  // clover / dry speckles
  for (let i = 0; i < 2500; i++) {
    g.fillStyle = r() < 0.7 ? 'rgba(200,190,110,0.25)' : 'rgba(30,60,20,0.35)'
    g.fillRect(r() * w, r() * h, 2, 2)
  }
  const H = new Float32Array(w * h)
  const hh = fbm(w, h, 160, 160, 2, seed + 7)
  for (let i = 0; i < H.length; i++) H[i] = hh[i]
  const R = new Float32Array(w * h).fill(0.95)
  return {
    map: tex(c, true, 4, 4),
    normalMap: tex(heightToNormal(H, w, h, 2.5), false, 4, 4),
    roughnessMap: tex(grayCanvas(R, w, h), false, 4, 4),
  }
}

/* ------------------------------------------------------------------ */
/*  tree bark + leaf card                                              */
/* ------------------------------------------------------------------ */
export function bark(seed = 8): PBR {
  const w = 256, h = 512
  const col = mkCanvas(w, h)
  const g = col.getContext('2d')!
  const img = g.createImageData(w, h)
  const a = fbm(w, h, 14, 2, 5, seed)
  const b = fbm(w, h, 40, 6, 2, seed + 1)
  const H = new Float32Array(w * h)
  for (let i = 0; i < w * h; i++) {
    const ridge = Math.abs(a[i] - 0.5) * 2
    const br = 0.45 + ridge * 0.7 + (b[i] - 0.5) * 0.3
    img.data[i * 4] = 78 * br; img.data[i * 4 + 1] = 64 * br; img.data[i * 4 + 2] = 52 * br; img.data[i * 4 + 3] = 255
    H[i] = ridge
  }
  g.putImageData(img, 0, 0)
  return { map: tex(col, true, 1.2, 2.4), normalMap: tex(heightToNormal(H, w, h, 4), false, 1.2, 2.4) }
}

export function leafCard(seed = 31): THREE.CanvasTexture {
  const S = 256
  const c = mkCanvas(S, S)
  const g = c.getContext('2d')!
  const r = rng(seed)
  g.clearRect(0, 0, S, S)
  const greens = ['#3f7a2a', '#4d8c32', '#5d9a3a', '#356d25', '#6aa63f', '#2e6322']
  const leaves = 46
  for (let i = 0; i < leaves; i++) {
    const a = r() * Math.PI * 2
    const dist = Math.pow(r(), 0.7) * 100
    const x = S / 2 + Math.cos(a) * dist, y = S / 2 + Math.sin(a) * dist
    const rot = r() * Math.PI * 2
    const len = 22 + r() * 16, wid = len * (0.42 + r() * 0.12)
    g.save()
    g.translate(x, y)
    g.rotate(rot)
    const gr = g.createLinearGradient(-len / 2, 0, len / 2, 0)
    const c0 = greens[(r() * greens.length) | 0]
    gr.addColorStop(0, c0)
    gr.addColorStop(1, greens[(r() * greens.length) | 0])
    g.fillStyle = gr
    g.beginPath()
    g.moveTo(-len / 2, 0)
    g.quadraticCurveTo(0, -wid, len / 2, 0)
    g.quadraticCurveTo(0, wid, -len / 2, 0)
    g.fill()
    g.strokeStyle = 'rgba(210,230,150,0.45)'
    g.lineWidth = 1
    g.beginPath(); g.moveTo(-len / 2, 0); g.lineTo(len / 2, 0); g.stroke()
    g.restore()
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

/* ------------------------------------------------------------------ */
/*  painted ornament (Cuypers-style polychrome vault decoration)         */
/* ------------------------------------------------------------------ */
export function ornament(seed = 2): PBR {
  const S = 1024
  const c = mkCanvas(S, S)
  const g = c.getContext('2d')!
  const r = rng(seed)
  g.fillStyle = '#d9c79a'
  g.fillRect(0, 0, S, S)
  // plaster mottling
  const m = fbm(S, S, 5, 5, 4, seed)
  const img = g.getImageData(0, 0, S, S)
  for (let i = 0; i < m.length; i++) {
    const t = 0.88 + m[i] * 0.22
    img.data[i * 4] *= t; img.data[i * 4 + 1] *= t; img.data[i * 4 + 2] *= t
  }
  g.putImageData(img, 0, 0)
  // diamond lattice
  const n = 4
  const cell = S / n
  g.lineWidth = 7
  g.strokeStyle = '#8c2f2a'
  for (let i = -n; i <= n * 2; i++) {
    g.beginPath(); g.moveTo(i * cell, 0); g.lineTo(i * cell + S, S); g.stroke()
    g.beginPath(); g.moveTo(i * cell, 0); g.lineTo(i * cell - S, S); g.stroke()
  }
  g.lineWidth = 2.5
  g.strokeStyle = '#c19a3b'
  for (let i = -n; i <= n * 2; i++) {
    g.beginPath(); g.moveTo(i * cell + 8, 0); g.lineTo(i * cell + S + 8, S); g.stroke()
    g.beginPath(); g.moveTo(i * cell + 8, 0); g.lineTo(i * cell - S + 8, S); g.stroke()
  }
  // motifs in diamonds
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const cx = (i + 0.5) * cell, cy = (j + 0.5) * cell
    g.save()
    g.translate(cx, cy)
    g.fillStyle = '#23407a'
    g.beginPath(); g.arc(0, 0, 34, 0, Math.PI * 2); g.fill()
    g.fillStyle = '#c19a3b'
    for (let p = 0; p < 6; p++) {
      g.rotate(Math.PI / 3)
      g.beginPath(); g.ellipse(0, -22, 7, 15, 0, 0, Math.PI * 2); g.fill()
    }
    g.fillStyle = '#8c2f2a'
    g.beginPath(); g.arc(0, 0, 9, 0, Math.PI * 2); g.fill()
    g.restore()
    g.fillStyle = '#2f5b46'
    for (const [ox, oy] of [[0, -cell / 2], [cell / 2, 0], [0, cell / 2], [-cell / 2, 0]]) {
      g.beginPath(); g.arc(cx + ox, cy + oy, 11, 0, Math.PI * 2); g.fill()
    }
  }
  void r
  return { map: tex(c, true, 3, 3) }
}

/** blue-and-white glazed tile panel */
export function delftTiles(): THREE.CanvasTexture {
  const S = 512
  const c = mkCanvas(S, S)
  const g = c.getContext('2d')!
  const n = 4, t = S / n
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    g.fillStyle = (i + j) % 2 ? '#dfe6ef' : '#eef0ec'
    g.fillRect(i * t, j * t, t, t)
    g.strokeStyle = '#a9b3c4'
    g.lineWidth = 2
    g.strokeRect(i * t + 1, j * t + 1, t - 2, t - 2)
    g.strokeStyle = '#2a4f9a'
    g.fillStyle = '#2a4f9a'
    g.lineWidth = 6
    const cx = i * t + t / 2, cy = j * t + t / 2
    g.beginPath(); g.arc(cx, cy, t * 0.2, 0, Math.PI * 2); g.stroke()
    g.beginPath(); g.arc(cx, cy, t * 0.06, 0, Math.PI * 2); g.fill()
    for (const [sx, sy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      g.beginPath(); g.arc(i * t + sx * t, j * t + sy * t, t * 0.2, 0, Math.PI * 2); g.stroke()
    }
  }
  const tx = new THREE.CanvasTexture(c)
  tx.colorSpace = THREE.SRGBColorSpace
  tx.wrapS = tx.wrapT = THREE.RepeatWrapping
  tx.anisotropy = 8
  return tx
}


/** brick town-house facade with painted sash windows (colour + emissive window mask) */
export function townFacade(seed = 6): { map: THREE.CanvasTexture; emissive: THREE.CanvasTexture } {
  const W = 512, H = 1024 // 6.4 m x 12.8 m  (4 bays x 4 floors)
  const c = mkCanvas(W, H), e = mkCanvas(W, H)
  const g = c.getContext('2d')!, ge = e.getContext('2d')!
  const r = rng(seed)
  g.fillStyle = '#7d3b2b'
  g.fillRect(0, 0, W, H)
  // brick courses
  for (let y = 0; y < H; y += 6) {
    for (let x = ((y / 6) % 2) * 8; x < W; x += 16) {
      const t = 0.8 + r() * 0.4
      g.fillStyle = `rgb(${135 * t},${60 * t},${44 * t})`
      g.fillRect(x + 0.5, y + 0.5, 15, 5)
    }
  }
  ge.fillStyle = '#000'
  ge.fillRect(0, 0, W, H)
  const bays = 4, floors = 4
  for (let f = 0; f < floors; f++) for (let b = 0; b < bays; b++) {
    const bw = W / bays, bh = H / floors
    const x = b * bw + bw * 0.22, y = f * bh + bh * 0.2
    const ww = bw * 0.56, hh = bh * (f === 0 ? 0.6 : 0.58)
    g.fillStyle = '#d8d2c0'
    g.fillRect(x - 6, y - 6, ww + 12, hh + 12)
    g.fillStyle = '#16232d'
    g.fillRect(x, y, ww, hh)
    const sky = g.createLinearGradient(0, y, 0, y + hh)
    sky.addColorStop(0, 'rgba(150,185,210,0.55)')
    sky.addColorStop(1, 'rgba(40,60,75,0.2)')
    g.fillStyle = sky
    g.fillRect(x, y, ww, hh)
    g.fillStyle = '#efece2'
    g.fillRect(x + ww / 2 - 2, y, 4, hh)
    g.fillRect(x, y + hh * 0.45, ww, 4)
    const lit = r() < 0.55
    if (lit) {
      ge.fillStyle = `rgb(${200 + r() * 55},${150 + r() * 40},${80 + r() * 40})`
      ge.fillRect(x + 3, y + 3, ww / 2 - 5, hh * 0.45 - 4)
      ge.fillRect(x + ww / 2 + 3, y + hh * 0.45 + 5, ww / 2 - 6, hh * 0.55 - 8)
    }
  }
  const t1 = new THREE.CanvasTexture(c)
  t1.colorSpace = THREE.SRGBColorSpace
  t1.wrapS = t1.wrapT = THREE.RepeatWrapping
  t1.anisotropy = 8
  t1.repeat.set(1 / 6.4, 1 / 12.8)
  const t2 = new THREE.CanvasTexture(e)
  t2.colorSpace = THREE.SRGBColorSpace
  t2.wrapS = t2.wrapT = THREE.RepeatWrapping
  t2.repeat.set(1 / 6.4, 1 / 12.8)
  return { map: t1, emissive: t2 }
}

export { nextFrame }

import * as THREE from 'three'
import { clamp, hash2, mix, pfbm, pnoise, rng, smoothstep } from './noise'

function canvas(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return { c, g: c.getContext('2d')!, }
}

function tex(c: HTMLCanvasElement, srgb: boolean, repeat = true) {
  const t = new THREE.CanvasTexture(c)
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.anisotropy = 8
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
  t.generateMipmaps = true
  t.minFilter = THREE.LinearMipmapLinearFilter
  return t
}

export interface PBRSet {
  map: THREE.Texture
  bump: THREE.Texture
  rough: THREE.Texture
}

/** Weathered cast-in-place concrete: formwork panels, tie holes, rain streaks, stains. Tile = 6 m. */
export function concreteSet(size = 1024): PBRSet {
  const col = canvas(size, size)
  const bmp = canvas(size, size)
  const rgh = canvas(size, size)
  const ci = col.g.createImageData(size, size)
  const bi = bmp.g.createImageData(size, size)
  const ri = rgh.g.createImageData(size, size)
  const cols = 2
  const rows = 4
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size
      const v = y / size
      const n1 = pfbm(u, v, 5, 5, 4, 3)
      const n2 = pfbm(u, v, 64, 64, 3, 9)
      const streak = pfbm(u, v, 48, 2, 4, 21)
      const stain = pfbm(u, v, 3, 3, 3, 40)
      // formwork panels
      const pu = u * cols
      const pv = v * rows
      const pc = Math.floor(pu)
      const pr = Math.floor(pv)
      const fu = pu - pc
      const fv = pv - pr
      const panelTone = (hash2(pc, pr, 5) - 0.5) * 0.09
      const seam = Math.min(Math.min(fu, 1 - fu) * size / cols, Math.min(fv, 1 - fv) * size / rows)
      const seamK = 1 - smoothstep(0.6, 2.8, seam)
      // tie holes
      let hole = 0
      for (const hx of [0.14, 0.86]) {
        for (const hy of [0.22, 0.78]) {
          const dx = (fu - hx) * size / cols
          const dy = (fv - hy) * size / rows
          const d = Math.sqrt(dx * dx + dy * dy)
          hole = Math.max(hole, 1 - smoothstep(2.0, 4.2, d))
        }
      }
      let b = 0.74 + 0.34 * n1 + 0.12 * (n2 - 0.5) + panelTone
      b *= 1 - 0.28 * smoothstep(0.52, 0.82, streak) // vertical rain streaks
      b *= 1 - 0.18 * smoothstep(0.55, 0.85, stain)
      b *= 1 - 0.32 * seamK
      b *= 1 - 0.7 * hole
      // warm tan-grey concrete as seen on the real piers
      const r = 148 * b
      const g = 140 * b
      const bl = 125 * b
      const i = (y * size + x) * 4
      ci.data[i] = clamp(r, 0, 255)
      ci.data[i + 1] = clamp(g, 0, 255)
      ci.data[i + 2] = clamp(bl, 0, 255)
      ci.data[i + 3] = 255
      const h = 0.62 + 0.2 * (n2 - 0.5) + 0.08 * n1 - 0.38 * seamK - 0.5 * hole
      const hv = clamp(h * 255, 0, 255)
      bi.data[i] = bi.data[i + 1] = bi.data[i + 2] = hv
      bi.data[i + 3] = 255
      const rv = clamp((0.86 + 0.12 * (n2 - 0.5) - 0.12 * smoothstep(0.55, 0.85, streak)) * 255, 0, 255)
      ri.data[i] = ri.data[i + 1] = ri.data[i + 2] = rv
      ri.data[i + 3] = 255
    }
  }
  col.g.putImageData(ci, 0, 0)
  bmp.g.putImageData(bi, 0, 0)
  rgh.g.putImageData(ri, 0, 0)
  return { map: tex(col.c, true), bump: tex(bmp.c, false), rough: tex(rgh.c, false) }
}

/** Basalt / rock riprap made of voronoi stones. Tile = 8 m */
export function rockSet(size = 512): PBRSet {
  const col = canvas(size, size)
  const bmp = canvas(size, size)
  const ci = col.g.createImageData(size, size)
  const bi = bmp.g.createImageData(size, size)
  const G = 7
  const pts: [number, number][] = []
  for (let gy = 0; gy < G; gy++) for (let gx = 0; gx < G; gx++) pts.push([gx + 0.15 + hash2(gx, gy, 71) * 0.7, gy + 0.15 + hash2(gx, gy, 72) * 0.7])
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * G
      const v = (y / size) * G
      const gx0 = Math.floor(u)
      const gy0 = Math.floor(v)
      let f1 = 9
      let f2 = 9
      let id = 0
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          const cx = gx0 + ox
          const cy = gy0 + oy
          const wx = ((cx % G) + G) % G
          const wy = ((cy % G) + G) % G
          const p = pts[wy * G + wx]
          const dx = cx + (p[0] - wx) - u
          const dy = cy + (p[1] - wy) - v
          const d = Math.sqrt(dx * dx + dy * dy)
          if (d < f1) {
            f2 = f1
            f1 = d
            id = wy * G + wx
          } else if (d < f2) f2 = d
        }
      }
      const edge = smoothstep(0.0, 0.16, f2 - f1)
      const tone = 0.55 + hash2(id, 3, 8) * 0.55
      const grain = pfbm(x / size, y / size, 40, 40, 3, 12)
      const lichen = smoothstep(0.62, 0.8, pfbm(x / size, y / size, 6, 6, 3, 4))
      let b = tone * (0.7 + 0.5 * grain) * (0.35 + 0.65 * edge)
      const i = (y * size + x) * 4
      ci.data[i] = clamp(88 * b + lichen * 10, 0, 255)
      ci.data[i + 1] = clamp(90 * b + lichen * 14, 0, 255)
      ci.data[i + 2] = clamp(94 * b, 0, 255)
      ci.data[i + 3] = 255
      const h = (0.25 + 0.75 * edge) * (0.6 + 0.4 * Math.min(1, f1 * 1.6)) * 0.5 + grain * 0.2
      bi.data[i] = bi.data[i + 1] = bi.data[i + 2] = clamp((1 - h) * 255 * 0.9, 0, 255)
      bi.data[i + 3] = 255
    }
  }
  col.g.putImageData(ci, 0, 0)
  bmp.g.putImageData(bi, 0, 0)
  const r = canvas(4, 4)
  r.g.fillStyle = '#e8e8e8'
  r.g.fillRect(0, 0, 4, 4)
  return { map: tex(col.c, true), bump: tex(bmp.c, false), rough: tex(r.c, false) }
}

export function asphaltSet(size = 512): PBRSet {
  const col = canvas(size, size)
  const bmp = canvas(size, size)
  const ci = col.g.createImageData(size, size)
  const bi = bmp.g.createImageData(size, size)
  const rnd = rng(55)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size
      const v = y / size
      const n = pfbm(u, v, 4, 4, 4, 2)
      const patch = pfbm(u, v, 2, 2, 2, 7)
      let g = 40 + 22 * n + 10 * patch
      const s = rnd()
      let stone = 0
      if (s > 0.93) stone = (s - 0.93) * 700
      g += stone * 0.5 + (rnd() - 0.5) * 12
      const i = (y * size + x) * 4
      ci.data[i] = clamp(g * 1.0, 0, 255)
      ci.data[i + 1] = clamp(g * 1.02, 0, 255)
      ci.data[i + 2] = clamp(g * 1.06, 0, 255)
      ci.data[i + 3] = 255
      const h = 120 + stone * 2 + (rnd() - 0.5) * 70
      bi.data[i] = bi.data[i + 1] = bi.data[i + 2] = clamp(h, 0, 255)
      bi.data[i + 3] = 255
    }
  }
  col.g.putImageData(ci, 0, 0)
  bmp.g.putImageData(bi, 0, 0)
  const r = canvas(4, 4)
  r.g.fillStyle = '#f0f0f0'
  r.g.fillRect(0, 0, 4, 4)
  return { map: tex(col.c, true), bump: tex(bmp.c, false), rough: tex(r.c, false) }
}

/** Tileable greyscale detail used to break up large terrain areas */
export function detailTexture(size = 256) {
  const { c, g } = canvas(size, size)
  const im = g.createImageData(size, size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size
      const v = y / size
      const n = 0.6 * pfbm(u, v, 8, 8, 4, 1) + 0.4 * pfbm(u, v, 48, 48, 2, 5)
      const i = (y * size + x) * 4
      const b = clamp(n * 255, 0, 255)
      im.data[i] = im.data[i + 1] = im.data[i + 2] = b
      im.data[i + 3] = 255
    }
  }
  g.putImageData(im, 0, 0)
  return tex(c, false)
}

/** Tileable ocean normal map (r,g = xy tangent, b = up) for three's Water shader */
export function waterNormals(size = 512) {
  const { c, g } = canvas(size, size)
  const H = new Float32Array(size * size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size
      const v = y / size
      // ridged noise gives sharper wave crests
      const a = 1 - Math.abs(pfbm(u, v, 4, 4, 5, 3) * 2 - 1)
      const b = pfbm(u, v, 16, 16, 4, 8)
      H[y * size + x] = a * 0.6 + b * 0.4
    }
  }
  const im = g.createImageData(size, size)
  const s = 15.0
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const l = H[y * size + ((x - 1 + size) % size)]
      const r = H[y * size + ((x + 1) % size)]
      const t = H[((y - 1 + size) % size) * size + x]
      const bt = H[((y + 1) % size) * size + x]
      let nx = (l - r) * s
      let ny = (t - bt) * s
      let nz = 1
      const len = Math.hypot(nx, ny, nz)
      nx /= len
      ny /= len
      nz /= len
      const i = (y * size + x) * 4
      im.data[i] = (nx * 0.5 + 0.5) * 255
      im.data[i + 1] = (ny * 0.5 + 0.5) * 255
      im.data[i + 2] = (nz * 0.5 + 0.5) * 255
      im.data[i + 3] = 255
    }
  }
  g.putImageData(im, 0, 0)
  return tex(c, false)
}

/** Marram / dune grass tuft card with alpha */
export function grassTexture() {
  const w = 128
  const h = 256
  const { c, g } = canvas(w, h)
  const rnd = rng(9)
  g.clearRect(0, 0, w, h)
  for (let i = 0; i < 26; i++) {
    const bx = w * 0.5 + (rnd() - 0.5) * w * 0.34
    const lean = (rnd() - 0.5) * w * 0.8
    const top = h * (0.04 + rnd() * 0.45)
    const wid = 2.2 + rnd() * 2.6
    const grad = g.createLinearGradient(0, h, 0, top)
    const hue = 62 + rnd() * 22
    grad.addColorStop(0, `hsl(${hue - 10},38%,22%)`)
    grad.addColorStop(0.6, `hsl(${hue},40%,38%)`)
    grad.addColorStop(1, `hsl(${hue + 8},45%,58%)`)
    g.fillStyle = grad
    g.beginPath()
    g.moveTo(bx - wid, h)
    g.quadraticCurveTo(bx - wid * 0.4 + lean * 0.2, h * 0.55, bx + lean, top)
    g.quadraticCurveTo(bx + wid * 0.4 + lean * 0.25, h * 0.55, bx + wid, h)
    g.closePath()
    g.fill()
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

export function glowTexture() {
  const { c, g } = canvas(64, 64)
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  gr.addColorStop(0, 'rgba(255,255,255,1)')
  gr.addColorStop(0.15, 'rgba(255,255,255,0.7)')
  gr.addColorStop(0.45, 'rgba(255,255,255,0.14)')
  gr.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = gr
  g.fillRect(0, 0, 64, 64)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/** Brass-on-stone memorial plaque (the famous Neeltje Jans quote) */
export function plaqueTexture() {
  const { c, g } = canvas(1024, 512)
  const gr = g.createLinearGradient(0, 0, 1024, 512)
  gr.addColorStop(0, '#6c6f72')
  gr.addColorStop(1, '#53575a')
  g.fillStyle = gr
  g.fillRect(0, 0, 1024, 512)
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = `rgba(${hash2(i, 1) > 0.5 ? 255 : 0},${hash2(i, 1) > 0.5 ? 255 : 0},${hash2(i, 1) > 0.5 ? 255 : 0},0.04)`
    g.fillRect(hash2(i, 2) * 1024, hash2(i, 3) * 512, 2, 2)
  }
  g.strokeStyle = '#c9b27a'
  g.lineWidth = 6
  g.strokeRect(24, 24, 976, 464)
  g.fillStyle = '#e1cd96'
  g.textAlign = 'center'
  g.font = '600 64px Georgia, serif'
  g.fillText('Hier gaan over het tij,', 512, 190)
  g.fillText('de maan, de wind en wij', 512, 275)
  g.font = 'italic 34px Georgia, serif'
  g.fillStyle = '#c9b27a'
  g.fillText('Here, the tide, the moon, the wind and we decide', 512, 365)
  g.font = '28px Georgia, serif'
  g.fillText('OOSTERSCHELDEKERING · 1986', 512, 440)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

export { pnoise, mix }

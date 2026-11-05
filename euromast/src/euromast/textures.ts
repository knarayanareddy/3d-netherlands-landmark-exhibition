import * as THREE from 'three'
import { canvasTex, clamp, fbm, makeCanvas, pbrTextures, rng, smooth } from './util'

const memo = new Map<string, any>()
const once = <T,>(k: string, f: () => T): T => {
  if (!memo.has(k)) memo.set(k, f())
  return memo.get(k)
}
const px = (d: Uint8ClampedArray, i: number, r: number, g: number, b: number) => {
  d[i * 4] = r
  d[i * 4 + 1] = g
  d[i * 4 + 2] = b
  d[i * 4 + 3] = 255
}

/** Whole-shaft concrete: maps once around (u) and once over the height (v) of the 88 m shaft. */
export function shaftConcrete(shaftH: number, circ: number) {
  return once('shaft', () => {
    const W = 1024
    const H = 2048
    const mott = fbm(W, H, 5, 9, 5, 3)
    const pores = fbm(W, H, 120, 240, 3, 5)
    const streakA = fbm(W, H, 260, 5, 3, 8)
    const streakB = fbm(W, H, 90, 3, 2, 9)
    const alb = new Uint8ClampedArray(W * H * 4)
    const hg = new Float32Array(W * H)
    const pxPerM_v = H / shaftH
    const pxPerM_u = W / circ
    const jointEvery = 3.3 * pxPerM_v
    const holeDx = 0.9 * pxPerM_u
    const holeDy = 0.9 * pxPerM_v
    for (let y = 0; y < H; y++) {
      const fromBottom = 1 - y / H // y=0 is top of texture; flipY handled by uv (v=1 top)
      const dirt = smooth(0.06, 0, fromBottom) // algae/dirt at base
      for (let x = 0; x < W; x++) {
        const i = y * W + x
        let t = 0.86 + 0.26 * mott[i] + 0.1 * (pores[i] - 0.5)
        const st = smooth(0.55, 0.88, streakA[i]) * (0.35 + 0.65 * streakB[i])
        t *= 1 - 0.26 * st * (0.45 + 0.55 * (1 - fromBottom))
        t *= 1 - 0.3 * dirt
        // construction joints (horizontal)
        const jy = ((H - y) % jointEvery) / jointEvery
        const joint = jy < 0.018 || jy > 0.995 ? 1 : 0
        t *= 1 - 0.14 * joint
        let hh = 0.5 + 0.18 * pores[i] + 0.08 * mott[i] - 0.25 * joint
        // formwork tie holes
        const ox = ((x + (Math.floor((H - y) / holeDy) % 2 ? holeDx / 2 : 0)) % holeDx) - holeDx / 2
        const oy = (((H - y) % holeDy) - holeDy / 2)
        const dh = Math.hypot(ox, oy)
        if (dh < 2.4) {
          t *= 0.62 + 0.38 * (dh / 2.4)
          hh -= 0.35 * (1 - dh / 2.4)
        }
        const g = clamp(t, 0.1, 1.2)
        px(alb, i, 168 * g, 165 * g * 0.998, 157 * g * (1 - 0.04 * dirt) - dirt * 6)
        hg[i] = hh
      }
    }
    const tx = pbrTextures(W, H, alb, hg, 2.2, { wrap: THREE.RepeatWrapping })
    tx.map.wrapT = tx.normalMap.wrapT = THREE.ClampToEdgeWrapping
    return tx
  })
}

export function concreteTile() {
  return once('concrete', () => {
    const S = 512
    const n1 = fbm(S, S, 4, 4, 5, 21)
    const n2 = fbm(S, S, 64, 64, 3, 22)
    const alb = new Uint8ClampedArray(S * S * 4)
    const hg = new Float32Array(S * S)
    for (let i = 0; i < S * S; i++) {
      let t = 0.82 + 0.3 * n1[i] + 0.12 * (n2[i] - 0.5)
      const pit = n2[i] > 0.78 ? 0.8 : 1
      t *= pit
      px(alb, i, 172 * t, 169 * t, 161 * t)
      hg[i] = 0.5 + 0.25 * n2[i] - (pit < 1 ? 0.25 : 0)
    }
    return pbrTextures(S, S, alb, hg, 1.6)
  })
}

export function pavingTile() {
  return once('paving', () => {
    const S = 512 // 2 m
    const alb = new Uint8ClampedArray(S * S * 4)
    const hg = new Float32Array(S * S)
    const n = fbm(S, S, 32, 32, 3, 31)
    const rows = 16
    const cols = 8
    const bh = S / rows
    const bw = S / cols
    const r = rng(77)
    const tint: number[] = []
    for (let i = 0; i < rows * cols * 2; i++) tint.push(0.8 + r() * 0.4)
    const base: [number, number, number][] = [
      [140, 126, 114],
      [150, 138, 126],
      [128, 120, 113],
    ]
    for (let y = 0; y < S; y++) {
      const row = Math.floor(y / bh)
      for (let x = 0; x < S; x++) {
        const xo = (x + (row % 2 ? bw / 2 : 0)) % S
        const col = Math.floor(xo / bw)
        const lx = xo % bw
        const ly = y % bh
        const edge = lx < 2 || ly < 2 || lx > bw - 1.5 || ly > bh - 1.5
        const k = tint[(row * cols + col) % tint.length]
        const b = base[(row * 3 + col) % 3]
        const nn = 0.88 + 0.24 * n[y * S + x]
        const i = y * S + x
        if (edge) {
          px(alb, i, 70 * nn, 66 * nn, 60 * nn)
          hg[i] = 0.15
        } else {
          px(alb, i, b[0] * k * nn, b[1] * k * nn, b[2] * k * nn)
          hg[i] = 0.7 + 0.1 * n[i]
        }
      }
    }
    return pbrTextures(S, S, alb, hg, 2.2)
  })
}

export function slabTile() {
  return once('slab', () => {
    const S = 512 // 2 slabs across = 1 m slabs on a 2 m tile
    const n = fbm(S, S, 6, 6, 5, 41)
    const sp = fbm(S, S, 140, 140, 2, 42)
    const alb = new Uint8ClampedArray(S * S * 4)
    const hg = new Float32Array(S * S)
    const r = rng(5)
    const k = [0.92 + r() * 0.12, 0.92 + r() * 0.12, 0.92 + r() * 0.12, 0.92 + r() * 0.12]
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const i = y * S + x
        const sx = Math.floor(x / (S / 2))
        const sy = Math.floor(y / (S / 2))
        const lx = x % (S / 2)
        const ly = y % (S / 2)
        const joint = lx < 2.5 || ly < 2.5
        let t = (0.8 + 0.3 * n[i] + 0.25 * (sp[i] - 0.5)) * k[sy * 2 + sx]
        if (joint) t *= 0.55
        px(alb, i, 150 * t, 150 * t, 146 * t)
        hg[i] = joint ? 0.1 : 0.6 + 0.15 * sp[i]
      }
    }
    return pbrTextures(S, S, alb, hg, 1.8)
  })
}

export function asphaltTile() {
  return once('asphalt', () => {
    const S = 512
    const n = fbm(S, S, 8, 8, 4, 51)
    const sp = fbm(S, S, 200, 200, 2, 52)
    const alb = new Uint8ClampedArray(S * S * 4)
    const hg = new Float32Array(S * S)
    for (let i = 0; i < S * S; i++) {
      const t = 0.7 + 0.35 * n[i] + (sp[i] > 0.72 ? 0.35 : 0)
      px(alb, i, 70 * t, 71 * t, 74 * t)
      hg[i] = sp[i]
    }
    return pbrTextures(S, S, alb, hg, 2)
  })
}

export function grassTile() {
  return once('grass', () => {
    const S = 512
    const n = fbm(S, S, 6, 6, 5, 61)
    const f = fbm(S, S, 180, 180, 2, 62)
    const alb = new Uint8ClampedArray(S * S * 4)
    const hg = new Float32Array(S * S)
    for (let i = 0; i < S * S; i++) {
      const t = 0.72 + 0.5 * n[i] + 0.35 * (f[i] - 0.5)
      px(alb, i, 255 * t * 0.5, 255 * t * 0.62, 255 * t * 0.32)
      hg[i] = f[i]
    }
    return pbrTextures(S, S, alb, hg, 3)
  })
}

export function woodFloorTile() {
  return once('wood', () => {
    const S = 512
    const grain = fbm(S, S, 3, 80, 4, 71)
    const grain2 = fbm(S, S, 6, 160, 2, 72)
    const alb = new Uint8ClampedArray(S * S * 4)
    const hg = new Float32Array(S * S)
    const r = rng(9)
    const planks = 8
    const ph = S / planks
    const tint: number[] = []
    const off: number[] = []
    for (let i = 0; i < planks; i++) {
      tint.push(0.82 + r() * 0.3)
      off.push(r() * S)
    }
    for (let y = 0; y < S; y++) {
      const p = Math.floor(y / ph)
      const ly = y % ph
      for (let x = 0; x < S; x++) {
        const i = y * S + x
        const xo = (x + off[p]) % S
        const butt = xo < 2.5 || xo > S / 2 - 0 && xo < S / 2 + 2
        const seam = ly < 1.8
        const g = 0.8 + 0.3 * grain[i] + 0.14 * (grain2[i] - 0.5)
        let t = g * tint[p]
        if (seam || butt) t *= 0.45
        px(alb, i, 176 * t, 128 * t, 82 * t)
        hg[i] = seam || butt ? 0 : 0.6 + 0.1 * grain2[i]
      }
    }
    return pbrTextures(S, S, alb, hg, 1.5)
  })
}

export function carpetTile() {
  return once('carpet', () => {
    const S = 256
    const n = fbm(S, S, 64, 64, 3, 81)
    const alb = new Uint8ClampedArray(S * S * 4)
    const hg = new Float32Array(S * S)
    for (let i = 0; i < S * S; i++) {
      const t = 0.7 + 0.5 * n[i]
      px(alb, i, 52 * t, 58 * t, 70 * t)
      hg[i] = n[i]
    }
    return pbrTextures(S, S, alb, hg, 2)
  })
}

export function waterNormal() {
  return once('waterN', () => {
    const S = 512
    const h = fbm(S, S, 6, 6, 5, 91, 0.55)
    const d = new Uint8ClampedArray(S * S * 4)
    // build normal directly
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const l = h[y * S + ((x + S - 1) % S)]
        const r = h[y * S + ((x + 1) % S)]
        const u = h[((y + S - 1) % S) * S + x]
        const b = h[((y + 1) % S) * S + x]
        let nx = (l - r) * 14
        let ny = (b - u) * 14
        const len = Math.hypot(nx, ny, 1)
        nx /= len
        ny /= len
        const i = y * S + x
        d[i * 4] = (nx * 0.5 + 0.5) * 255
        d[i * 4 + 1] = (ny * 0.5 + 0.5) * 255
        d[i * 4 + 2] = ((1 / len) * 0.5 + 0.5) * 255
        d[i * 4 + 3] = 255
      }
    const { c, g } = makeCanvas(S, S)
    g.putImageData(new ImageData(d, S, S), 0, 0)
    return canvasTex(c, { srgb: false })
  })
}

export function barkTile() {
  return once('bark', () => {
    const W = 128
    const H = 256
    const n = fbm(W, H, 14, 3, 4, 101)
    const alb = new Uint8ClampedArray(W * H * 4)
    const hg = new Float32Array(W * H)
    for (let i = 0; i < W * H; i++) {
      const t = 0.5 + 0.9 * n[i]
      px(alb, i, 78 * t, 64 * t, 50 * t)
      hg[i] = n[i]
    }
    return pbrTextures(W, H, alb, hg, 3)
  })
}

export function leafCard(seed = 1, hue = 0) {
  return once('leaf' + seed + hue, () => {
    const S = 256
    const { c, g } = makeCanvas(S, S)
    const r = rng(seed * 13 + 1)
    g.clearRect(0, 0, S, S)
    const cols = ['#3f6b2c', '#4d7a31', '#5a8a38', '#34592a', '#6b9640', '#2f4f26', '#7aa347']
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 0; i < 380; i++) {
        const ang = r() * Math.PI * 2
        const rad = Math.sqrt(r()) * S * 0.46
        const x = S / 2 + Math.cos(ang) * rad
        const y = S / 2 + Math.sin(ang) * rad
        g.save()
        g.translate(x, y)
        g.rotate(r() * Math.PI * 2)
        const col = new THREE.Color(cols[(r() * cols.length) | 0])
        col.offsetHSL(hue, 0, (r() - 0.5) * 0.06 + (pass - 1) * 0.04)
        g.fillStyle = '#' + col.getHexString()
        g.beginPath()
        g.ellipse(0, 0, 10 + r() * 7, 4.5 + r() * 3, 0, 0, Math.PI * 2)
        g.fill()
        g.restore()
      }
    }
    // soft alpha falloff to avoid hard disc edges
    g.globalCompositeOperation = 'destination-in'
    const grd = g.createRadialGradient(S / 2, S / 2, S * 0.2, S / 2, S / 2, S * 0.5)
    grd.addColorStop(0, 'rgba(0,0,0,1)')
    grd.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = grd
    g.fillRect(0, 0, S, S)
    g.globalCompositeOperation = 'source-over'
    return canvasTex(c, { wrap: THREE.ClampToEdgeWrapping, aniso: 4 })
  })
}

export function labelTex(text: string, o: { w?: number; h?: number; bg?: string; fg?: string; font?: string; sub?: string } = {}) {
  const W = o.w ?? 1024
  const H = o.h ?? 256
  const { c, g } = makeCanvas(W, H)
  g.fillStyle = o.bg ?? '#ffffff'
  g.fillRect(0, 0, W, H)
  g.fillStyle = o.fg ?? '#111'
  g.font = o.font ?? `700 ${H * 0.52}px "Helvetica Neue", Arial, sans-serif`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(text, W / 2, o.sub ? H * 0.42 : H / 2)
  if (o.sub) {
    g.font = `500 ${H * 0.16}px "Helvetica Neue", Arial, sans-serif`
    g.fillText(o.sub, W / 2, H * 0.82)
  }
  return canvasTex(c, { wrap: THREE.ClampToEdgeWrapping, aniso: 8 })
}

/** Ground colour-zone map (parks / streets / promenade) covering ±extent metres. */
export function zoneMap(extent: number, size: number, draw: (g: CanvasRenderingContext2D, wx: (x: number) => number, wz: (z: number) => number, s: number) => void) {
  const { c, g } = makeCanvas(size, size)
  const s = size / (extent * 2)
  draw(g, (x) => (x + extent) * s, (z) => (z + extent) * s, s)
  const t = canvasTex(c, { wrap: THREE.ClampToEdgeWrapping, aniso: 16 })
  return t
}

export type FacadeKind = 'brick' | 'glass' | 'concrete'
/** One tile = one floor (3.6 m) x one bay (3.6 m). */
export function facadeTile(kind: FacadeKind) {
  return once('facade' + kind, () => {
    const S = 256
    const { c, g } = makeCanvas(S, S)
    const r = rng(kind.length * 31)
    if (kind === 'brick') {
      g.fillStyle = '#8f6b58'
      g.fillRect(0, 0, S, S)
      for (let j = 0; j < 40; j++)
        for (let i = -1; i < 18; i++) {
          const x = i * 15 + (j % 2 ? 7 : 0)
          g.fillStyle = `hsl(${12 + r() * 10},${35 + r() * 14}%,${30 + r() * 14}%)`
          g.fillRect(x + 1, j * 6.4 + 1, 13, 4.6)
        }
      // window
      g.fillStyle = '#e8e6df'
      g.fillRect(62, 38, 132, 160)
      const gr = g.createLinearGradient(0, 44, 0, 192)
      gr.addColorStop(0, '#6f8798')
      gr.addColorStop(1, '#2b3945')
      g.fillStyle = gr
      g.fillRect(70, 46, 116, 144)
      g.fillStyle = '#e8e6df'
      g.fillRect(124, 46, 8, 144)
      g.fillRect(70, 100, 116, 7)
      g.fillStyle = '#b9b3a6'
      g.fillRect(56, 198, 144, 10)
    } else if (kind === 'glass') {
      const gr = g.createLinearGradient(0, 0, S, S)
      gr.addColorStop(0, '#7f9fb5')
      gr.addColorStop(0.5, '#35566e')
      gr.addColorStop(1, '#223c50')
      g.fillStyle = gr
      g.fillRect(0, 0, S, S)
      g.fillStyle = 'rgba(255,255,255,0.12)'
      g.fillRect(0, 0, S, 18)
      g.fillStyle = '#9aa3a9'
      g.fillRect(0, 0, 4, S)
      g.fillRect(0, S - 56, S, 56)
      g.fillStyle = '#6b7780'
      g.fillRect(0, S - 56, S, 6)
    } else {
      g.fillStyle = '#b9b6ad'
      g.fillRect(0, 0, S, S)
      for (let i = 0; i < 1800; i++) {
        g.fillStyle = `rgba(${r() > 0.5 ? 255 : 0},${r() > 0.5 ? 255 : 0},${r() > 0.5 ? 255 : 0},0.04)`
        g.fillRect(r() * S, r() * S, 2, 2)
      }
      g.fillStyle = '#2e3b46'
      g.fillRect(0, 70, S, 120)
      g.fillStyle = '#7b8a96'
      g.fillRect(0, 70, S, 30)
      g.fillStyle = '#8b8a84'
      g.fillRect(0, 190, S, 6)
      g.fillRect(0, 62, S, 8)
      g.fillStyle = '#9ca1a4'
      g.fillRect(0, 70, 5, 120)
    }
    return canvasTex(c, { aniso: 8 })
  })
}
export function facadeMask(kind: FacadeKind) {
  return once('facademask' + kind, () => {
    const S = 128
    const { c, g } = makeCanvas(S, S)
    g.fillStyle = '#000'
    g.fillRect(0, 0, S, S)
    g.fillStyle = '#fff'
    if (kind === 'brick') g.fillRect(35, 23, 58, 76)
    else if (kind === 'glass') g.fillRect(2, 0, S - 2, S * 0.78)
    else g.fillRect(0, 36, S, 56)
    return canvasTex(c, { aniso: 1, srgb: false })
  })
}

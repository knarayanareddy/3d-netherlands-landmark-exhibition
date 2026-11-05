import * as THREE from 'three'
import { TAU, clamp, hash2, rng, tfbm, tick, vnoise } from './util'

const ANISO = 8

function finish(t: THREE.Texture, srgb: boolean, repeat = true) {
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.anisotropy = ANISO
  t.generateMipmaps = true
  t.minFilter = THREE.LinearMipmapLinearFilter
  t.magFilter = THREE.LinearFilter
  t.needsUpdate = true
  return t
}

function canvas(w: number, h = w) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

/** Convert a tileable height field to a tangent-space normal map */
function normalFromHeight(h: Float32Array, N: number, strength: number) {
  const c = canvas(N)
  const g = c.getContext('2d')!
  const img = g.createImageData(N, N)
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const l = h[y * N + ((x - 1 + N) % N)]
      const r = h[y * N + ((x + 1) % N)]
      const u = h[((y - 1 + N) % N) * N + x]
      const d = h[((y + 1) % N) * N + x]
      let nx = (l - r) * strength
      let ny = (u - d) * strength
      const nz = 1
      const il = 1 / Math.hypot(nx, ny, nz)
      nx *= il
      ny *= il
      const i = (y * N + x) * 4
      img.data[i] = (nx * 0.5 + 0.5) * 255
      img.data[i + 1] = (ny * 0.5 + 0.5) * 255
      img.data[i + 2] = (nz * il * 0.5 + 0.5) * 255
      img.data[i + 3] = 255
    }
  }
  g.putImageData(img, 0, 0)
  return finish(new THREE.CanvasTexture(c), false)
}

type PixFn = (u: number, v: number, o: number[]) => void // o = [r,g,b,height] 0..255 / height 0..1

function procedural(N: number, fn: PixFn, nStrength: number) {
  const c = canvas(N)
  const g = c.getContext('2d')!
  const img = g.createImageData(N, N)
  const h = new Float32Array(N * N)
  const o = [0, 0, 0, 0]
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      fn(x / N, y / N, o)
      const i = (y * N + x) * 4
      img.data[i] = clamp(o[0], 0, 255)
      img.data[i + 1] = clamp(o[1], 0, 255)
      img.data[i + 2] = clamp(o[2], 0, 255)
      img.data[i + 3] = 255
      h[y * N + x] = o[3]
    }
  }
  g.putImageData(img, 0, 0)
  return { map: finish(new THREE.CanvasTexture(c), true), normal: normalFromHeight(h, N, nStrength), height: h }
}

function worleyId(u: number, v: number, f: number, seed: number): [number, number, number] {
  const x = u * f
  const y = v * f
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  let d1 = 9
  let d2 = 9
  let id = 0
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const cx = ix + i
      const cy = iy + j
      const wx = ((cx % f) + f) % f
      const wy = ((cy % f) + f) % f
      const px = cx + 0.15 + hash2(wx, wy, seed) * 0.7
      const py = cy + 0.15 + hash2(wx, wy, seed + 91) * 0.7
      const d = Math.hypot(px - x, py - y)
      if (d < d1) {
        d2 = d1
        d1 = d
        id = hash2(wx, wy, seed + 5)
      } else if (d < d2) d2 = d
    }
  }
  return [d1, d2, id]
}

export interface TexSet {
  grass: { map: THREE.Texture; normal: THREE.Texture }
  gravel: { map: THREE.Texture; normal: THREE.Texture }
  soil: { map: THREE.Texture; normal: THREE.Texture }
  paver: { map: THREE.Texture; normal: THREE.Texture }
  brick: { map: THREE.Texture; normal: THREE.Texture }
  darkBrick: { map: THREE.Texture; normal: THREE.Texture }
  bark: { map: THREE.Texture; normal: THREE.Texture }
  wood: { map: THREE.Texture; normal: THREE.Texture }
  tarWood: { map: THREE.Texture; normal: THREE.Texture }
  waterNormal: THREE.Texture
  leaf: THREE.Texture
  blossom: THREE.Texture
  willow: THREE.Texture
  tuft: THREE.Texture
  reed: THREE.Texture
  speckle: THREE.Texture
  sprite: THREE.Texture
}

function brickSet(N: number, base: [number, number, number], vary: number, mortar: [number, number, number], rows: number, cols: number, seed: number) {
  const r = rng(seed)
  const c = canvas(N)
  const g = c.getContext('2d')!
  const hc = canvas(N)
  const hg = hc.getContext('2d')!
  g.fillStyle = `rgb(${mortar.join(',')})`
  g.fillRect(0, 0, N, N)
  hg.fillStyle = '#202020'
  hg.fillRect(0, 0, N, N)
  const bh = N / rows
  const bw = N / cols
  const gap = Math.max(2, N / 170)
  for (let j = 0; j < rows; j++) {
    const off = (j % 2) * bw * 0.5
    for (let i = -1; i < cols; i++) {
      const k = 1 + (r() - 0.5) * vary
      const t = r()
      const rr = base[0] * k * (t > 0.85 ? 0.8 : 1) + (r() - 0.5) * 12
      const gg = base[1] * k * (t > 0.85 ? 0.85 : 1) + (r() - 0.5) * 8
      const bb = base[2] * k + (r() - 0.5) * 8
      const x = i * bw + off
      const y = j * bh
      g.fillStyle = `rgb(${rr | 0},${gg | 0},${bb | 0})`
      g.fillRect(x + gap / 2, y + gap / 2, bw - gap, bh - gap)
      // surface streaks
      for (let s = 0; s < 14; s++) {
        g.fillStyle = `rgba(${r() > 0.5 ? '0,0,0' : '255,230,200'},${0.03 + r() * 0.07})`
        g.fillRect(x + gap + r() * (bw - gap * 3), y + gap + r() * (bh - gap * 3), 1 + r() * 6, 1 + r() * 2)
      }
      const hv = 150 + r() * 70
      hg.fillStyle = `rgb(${hv | 0},${hv | 0},${hv | 0})`
      hg.fillRect(x + gap / 2, y + gap / 2, bw - gap, bh - gap)
    }
  }
  // grime / weathering
  const img = g.getImageData(0, 0, N, N)
  const hi = hg.getImageData(0, 0, N, N)
  const h = new Float32Array(N * N)
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = (y * N + x) * 4
      const n = tfbm(x / N, y / N, 6, 4, seed)
      const m = 0.8 + n * 0.4
      img.data[i] *= m
      img.data[i + 1] *= m
      img.data[i + 2] *= m
      h[y * N + x] = hi.data[i] / 255 + (vnoise(x * 0.5, y * 0.5, seed, N / 2) - 0.5) * 0.08
    }
  }
  g.putImageData(img, 0, 0)
  return { map: finish(new THREE.CanvasTexture(c), true), normal: normalFromHeight(h, N, 3.2) }
}

function woodSet(N: number, base: [number, number, number], planks: number, seed: number) {
  const r = rng(seed)
  const pw = N / planks
  const tones = Array.from({ length: planks }, () => 0.75 + r() * 0.5)
  return procedural(
    N,
    (u, v, o) => {
      const p = Math.floor(u * planks)
      const lu = u * planks - p
      const grain = vnoise(u * 20, v * 3, seed + p, 0) * 0.5 + tfbm(u, v, 8, 3, seed + p) * 0.5
      const stripe = Math.sin((u * 120 + grain * 6 + p * 3.1) * 1.4) * 0.5 + 0.5
      const gap = lu < 0.025 || lu > 0.975 ? 0.35 : 1
      const k = tones[p] * (0.82 + stripe * 0.2 + grain * 0.1) * gap
      o[0] = base[0] * k
      o[1] = base[1] * k
      o[2] = base[2] * k
      o[3] = (gap < 1 ? 0.1 : 0.6 + stripe * 0.12 + grain * 0.1)
      void pw
    },
    2.4,
  )
}

export async function buildTextures(progress: (f: number, label: string) => void): Promise<TexSet> {
  const N = 512
  const steps = 10
  let s = 0
  const step = async (label: string) => {
    progress(++s / steps, label)
    await tick()
  }

  await step('Sowing the lawns')
  const grass = procedural(
    N,
    (u, v, o) => {
      const n1 = tfbm(u, v, 5, 5, 3)
      const n2 = tfbm(u, v, 24, 3, 9)
      const streak = vnoise(u * 90, v * 90, 4, 90)
      const clover = tfbm(u, v, 14, 2, 21) > 0.62 ? 1 : 0
      const k = 0.66 + n1 * 0.5 + (n2 - 0.5) * 0.35 + (streak - 0.5) * 0.28
      o[0] = 108 * k + clover * 14
      o[1] = 150 * k + clover * 10
      o[2] = 54 * k
      o[3] = n2 * 0.5 + streak * 0.5
    },
    2.2,
  )

  await step('Raking the gravel')
  const gravel = procedural(
    N,
    (u, v, o) => {
      const [d1, d2, id] = worleyId(u, v, 34, 7)
      const peb = clamp(1 - d1 * 1.5, 0, 1)
      const edge = clamp((d2 - d1) * 3, 0, 1)
      const tone = 0.78 + id * 0.4
      const n = tfbm(u, v, 8, 4, 12)
      const k = tone * (0.7 + peb * 0.3) * (0.6 + edge * 0.4) * (0.82 + n * 0.3)
      o[0] = 196 * k
      o[1] = 182 * k
      o[2] = 156 * k * (0.95 + id * 0.1)
      o[3] = peb * edge
    },
    5,
  )

  await step('Turning the soil')
  const soil = procedural(
    N,
    (u, v, o) => {
      const n = tfbm(u, v, 12, 5, 33)
      const [d1] = worleyId(u, v, 60, 3)
      const clump = clamp(1 - d1, 0, 1)
      const k = 0.55 + n * 0.7 + clump * 0.2
      o[0] = 58 * k
      o[1] = 42 * k
      o[2] = 30 * k
      o[3] = n * 0.6 + clump * 0.4
    },
    3.5,
  )

  await step('Laying the pavers')
  const paver = brickSet(N, [190, 152, 120], 0.2, [128, 118, 104], 16, 8, 51)
  await step('Firing the bricks')
  const brick = brickSet(N, [150, 70, 48], 0.4, [168, 160, 146], 20, 8, 77)
  const darkBrick = brickSet(N, [104, 52, 40], 0.4, [128, 122, 112], 20, 8, 91)

  await step('Carving bark and timber')
  const bark = procedural(
    N,
    (u, v, o) => {
      const n = tfbm(u, v, 6, 5, 61)
      const ridge = 1 - Math.abs(vnoise(u * 18 + n * 3, v * 18, 2, 18) * 2 - 1)
      const k = 0.62 + ridge * 0.5 * (0.7 + n * 0.5)
      o[0] = 124 * k
      o[1] = 106 * k
      o[2] = 90 * k
      o[3] = ridge
    },
    5,
  )
  const wood = woodSet(N, [150, 112, 74], 6, 14)
  const tarWood = woodSet(N, [52, 42, 36], 10, 29)

  await step('Rippling the water')
  const wn = procedural(
    N,
    (u, v, o) => {
      const n = tfbm(u, v, 6, 5, 71) + tfbm(u, v, 12, 3, 72) * 0.5
      o[0] = o[1] = o[2] = 128
      o[3] = n
    },
    4.5,
  )
  const waterNormal = wn.normal

  await step('Growing leaves and petals')
  const leaf = makeLeafCard('leaf')
  const blossom = makeLeafCard('blossom')
  const willow = makeLeafCard('willow')
  const tuft = makeTuft(false)
  const reed = makeTuft(true)

  const spC = canvas(32)
  const sg = spC.getContext('2d')!
  const grd = sg.createRadialGradient(16, 16, 0, 16, 16, 16)
  grd.addColorStop(0, 'rgba(255,255,255,1)')
  grd.addColorStop(0.4, 'rgba(255,255,255,0.55)')
  grd.addColorStop(1, 'rgba(255,255,255,0)')
  sg.fillStyle = grd
  sg.fillRect(0, 0, 32, 32)
  const sprite = new THREE.CanvasTexture(spC)
  sprite.colorSpace = THREE.SRGBColorSpace

  const speckle = procedural(
    256,
    (u, v, o) => {
      const n = tfbm(u, v, 24, 3, 99)
      const k = 150 + n * 140
      o[0] = o[1] = o[2] = k
      o[3] = n
    },
    1,
  ).map

  await step('Opening the gates')
  return { grass, gravel, soil, paver, brick, darkBrick, bark, wood, tarWood, waterNormal, leaf, blossom, willow, tuft, reed, speckle, sprite }
}

function makeLeafCard(kind: 'leaf' | 'blossom' | 'willow') {
  const W = 256
  const c = canvas(W * 2)
  const g = c.getContext('2d')!
  g.scale(2, 2)
  const r = rng(kind === 'leaf' ? 5 : kind === 'blossom' ? 8 : 12)
  g.clearRect(0, 0, W, W)
  const greens = kind === 'blossom' ? ['#e9a1bf', '#f2bfd3', '#f8d9e5', '#df8fb0', '#fbe9f0'] : ['#86b640', '#6fa534', '#9ccb4d', '#5c9a2c', '#a9d45a', '#7cae38']
  if (kind === 'willow') {
    for (let s = 0; s < 7; s++) {
      const x0 = 24 + s * 34 + r() * 10
      g.strokeStyle = '#6f8a33'
      g.lineWidth = 2
      g.beginPath()
      g.moveTo(x0, 0)
      g.quadraticCurveTo(x0 + (r() - 0.5) * 20, W * 0.5, x0 + (r() - 0.5) * 24, W)
      g.stroke()
      for (let k = 0; k < 28; k++) {
        const y = 10 + (k / 28) * (W - 10)
        const x = x0 + Math.sin(y * 0.03 + s) * 6
        g.save()
        g.translate(x, y)
        g.rotate((k % 2 ? 1 : -1) * (0.9 + r() * 0.5))
        g.fillStyle = greens[(r() * greens.length) | 0]
        g.beginPath()
        g.ellipse(0, 0, 14, 3.2, 0, 0, TAU)
        g.fill()
        g.restore()
      }
    }
  } else {
    // twigs
    g.strokeStyle = kind === 'blossom' ? '#5a4535' : '#5d6b2c'
    g.lineWidth = 3
    for (let t = 0; t < 4; t++) {
      g.beginPath()
      g.moveTo(W / 2, W)
      g.quadraticCurveTo(W / 2 + (r() - 0.5) * 120, W * 0.55, W * (0.15 + r() * 0.7), W * (0.12 + r() * 0.4))
      g.stroke()
    }
    const n = kind === 'blossom' ? 46 : 38
    for (let i = 0; i < n; i++) {
      const x = W * (0.1 + r() * 0.8)
      const y = W * (0.08 + r() * 0.84)
      const a = r() * TAU
      const sz = kind === 'blossom' ? 15 + r() * 8 : 20 + r() * 12
      g.save()
      g.translate(x, y)
      g.rotate(a)
      const col = greens[(r() * greens.length) | 0]
      if (kind === 'blossom') {
        for (let p = 0; p < 5; p++) {
          g.rotate(TAU / 5)
          g.fillStyle = col
          g.beginPath()
          g.ellipse(sz * 0.5, 0, sz * 0.5, sz * 0.32, 0, 0, TAU)
          g.fill()
        }
        g.fillStyle = '#d96b8d'
        g.beginPath()
        g.arc(0, 0, 2.5, 0, TAU)
        g.fill()
      } else {
        g.fillStyle = col
        g.beginPath()
        g.moveTo(0, 0)
        g.bezierCurveTo(sz * 0.3, -sz * 0.45, sz * 0.9, -sz * 0.4, sz * 1.2, 0)
        g.bezierCurveTo(sz * 0.9, sz * 0.4, sz * 0.3, sz * 0.45, 0, 0)
        g.fill()
        g.strokeStyle = 'rgba(255,255,220,0.35)'
        g.lineWidth = 1
        g.beginPath()
        g.moveTo(0, 0)
        g.lineTo(sz * 1.1, 0)
        g.stroke()
      }
      g.restore()
    }
  }
  const t = new THREE.CanvasTexture(c)
  return finish(t, true, false)
}

function makeTuft(reed: boolean) {
  const W = 128
  const H = 256
  const c = canvas(W, H)
  const g = c.getContext('2d')!
  const r = rng(reed ? 4 : 2)
  g.clearRect(0, 0, W, H)
  const n = reed ? 9 : 16
  for (let i = 0; i < n; i++) {
    const x0 = W * (0.12 + r() * 0.76)
    const lean = (r() - 0.5) * W * (reed ? 0.3 : 0.7)
    const hh = H * ((reed ? 0.7 : 0.5) + r() * 0.5)
    const w = (reed ? 5 : 4) + r() * 3
    const grd = g.createLinearGradient(0, H, 0, H - hh)
    grd.addColorStop(0, reed ? '#4a5a22' : '#355d1c')
    grd.addColorStop(0.6, reed ? '#8a9a3a' : '#5f9a2e')
    grd.addColorStop(1, reed ? '#b8b25a' : '#9ccc4c')
    g.fillStyle = grd
    g.beginPath()
    g.moveTo(x0 - w, H)
    g.quadraticCurveTo(x0 - w * 0.4 + lean * 0.3, H - hh * 0.55, x0 + lean, H - hh)
    g.quadraticCurveTo(x0 + w * 0.4 + lean * 0.3, H - hh * 0.55, x0 + w, H)
    g.fill()
  }
  if (reed) {
    for (let i = 0; i < 2; i++) {
      const x = W * (0.3 + r() * 0.4)
      g.strokeStyle = '#5a6a2a'
      g.lineWidth = 2
      g.beginPath()
      g.moveTo(x, H)
      g.lineTo(x + (r() - 0.5) * 8, H * 0.2)
      g.stroke()
      g.fillStyle = '#5b3a22'
      g.beginPath()
      g.ellipse(x + (r() - 0.5) * 8, H * 0.27, 5, 20, 0, 0, TAU)
      g.fill()
    }
  }
  return finish(new THREE.CanvasTexture(c), true, false)
}

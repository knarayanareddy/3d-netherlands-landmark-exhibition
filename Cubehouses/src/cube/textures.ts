import * as THREE from 'three'
import { TAU, canvasTex, mkCanvas, registerGlow, rng } from './util'

type Ctx = CanvasRenderingContext2D

const cache = new Map<string, any>()
function memo<T>(k: string, f: () => T): T {
  if (!cache.has(k)) cache.set(k, f())
  return cache.get(k)
}

/* ------------------------------------------------------------------ painters */
function speckle(g: Ctx, W: number, H: number, n: number, cols: string[], min: number, max: number, alpha: number, r: () => number) {
  g.save()
  g.globalAlpha = alpha
  for (let i = 0; i < n; i++) {
    g.fillStyle = cols[(r() * cols.length) | 0]
    const s = min + r() * (max - min)
    g.fillRect(r() * W, r() * H, s, s)
  }
  g.restore()
}

function blotch(g: Ctx, W: number, H: number, n: number, color: string, rmin: number, rmax: number, alpha: number, r: () => number) {
  for (let i = 0; i < n; i++) {
    const x = r() * W
    const y = r() * H
    const rad = rmin + r() * (rmax - rmin)
    for (const ox of [-W, 0, W]) {
      for (const oy of [-H, 0, H]) {
        const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rad)
        gr.addColorStop(0, color)
        gr.addColorStop(1, 'rgba(0,0,0,0)')
        g.globalAlpha = alpha
        g.fillStyle = gr
        g.fillRect(x + ox - rad, y + oy - rad, rad * 2, rad * 2)
      }
    }
  }
  g.globalAlpha = 1
}

function streaks(g: Ctx, W: number, H: number, n: number, color: string, alpha: number, r: () => number, maxLen = 0.6) {
  for (let i = 0; i < n; i++) {
    const x = r() * W
    const y = r() * H
    const len = H * (0.1 + r() * maxLen)
    const w = 1 + r() * 4
    const gr = g.createLinearGradient(0, y, 0, y + len)
    gr.addColorStop(0, 'rgba(0,0,0,0)')
    gr.addColorStop(0.2, color)
    gr.addColorStop(1, 'rgba(0,0,0,0)')
    g.globalAlpha = alpha * (0.4 + r() * 0.6)
    g.fillStyle = gr
    g.fillRect(x, y, w, len)
  }
  g.globalAlpha = 1
}

const hsl = (h: number, s: number, l: number) => `hsl(${h},${s}%,${l}%)`

interface PBROpts {
  tile: [number, number] // metres covered by one texture repeat
  rough?: number
  metal?: number
  bump?: number
  env?: number
  color?: string
}

function pbr(key: string, size: number, o: PBROpts, draw: (g: Ctx, b: Ctx, S: number) => void) {
  return memo(key, () => {
    const A = mkCanvas(size, size)
    const B = mkCanvas(size, size)
    draw(A.g, B.g, size)
    const map = canvasTex(A.c, true, [1 / o.tile[0], 1 / o.tile[1]])
    const bump = canvasTex(B.c, false, [1 / o.tile[0], 1 / o.tile[1]])
    const m = new THREE.MeshStandardMaterial({
      map,
      bumpMap: bump,
      bumpScale: o.bump ?? 1.2,
      roughness: o.rough ?? 0.9,
      metalness: o.metal ?? 0,
      envMapIntensity: o.env ?? 1,
    })
    m.userData.tile = o.tile
    return m
  })
}

/* ------------------------------------------------------------------ cube cladding */
/** Warm yellow painted board cladding of the lower cube faces. */
export const sidingMat = () =>
  pbr('siding', 1024, { tile: [1.6, 1.6], rough: 0.62, bump: 1.6, env: 1 }, (g, b, S) => {
    const r = rng(7)
    const rows = 8
    const h = S / rows
    g.fillStyle = '#d3a935'
    g.fillRect(0, 0, S, S)
    b.fillStyle = '#9a9a9a'
    b.fillRect(0, 0, S, S)
    for (let j = 0; j < rows; j++) {
      const l = 54 + (r() - 0.5) * 5
      g.fillStyle = hsl(44 + (r() - 0.5) * 3, 66, l)
      g.fillRect(0, j * h, S, h)
      // grain
      for (let i = 0; i < 70; i++) {
        g.globalAlpha = 0.05 + r() * 0.06
        g.fillStyle = r() > 0.5 ? '#6b4d10' : '#fff0b0'
        g.fillRect(r() * S, j * h + r() * h, 30 + r() * 240, 1)
      }
      g.globalAlpha = 1
      // top highlight / bottom shadow lines (board edges)
      g.fillStyle = 'rgba(255,240,170,0.35)'
      g.fillRect(0, j * h + 2, S, 3)
      g.fillStyle = 'rgba(70,45,0,0.55)'
      g.fillRect(0, j * h + h - 6, S, 6)
      // butt joints
      const jx = r() * S
      g.fillStyle = 'rgba(70,45,0,0.35)'
      g.fillRect(jx, j * h, 2, h)
      b.fillStyle = '#d8d8d8'
      b.fillRect(0, j * h + 4, S, h - 14)
      b.fillStyle = '#222'
      b.fillRect(0, j * h + h - 7, S, 7)
      b.fillRect(jx, j * h, 3, h)
    }
    blotch(g, S, S, 14, '#6e5314', 80, 220, 0.14, r)
    blotch(g, S, S, 10, '#fff3b8', 80, 200, 0.1, r)
    streaks(g, S, S, 60, '#4a3508', 0.18, r, 0.5)
    speckle(g, S, S, 3000, ['#000', '#fff', '#7a5a14'], 1, 2.5, 0.08, r)
  })

/** Dark slate-grey upper faces. */
export const slateMat = () =>
  pbr('slate', 1024, { tile: [1.28, 1.28], rough: 0.5, metal: 0.05, bump: 2.2, env: 1.3 }, (g, b, S) => {
    const r = rng(21)
    const rows = 14
    const cols = 4
    const h = S / rows
    const w = S / cols
    g.fillStyle = '#0f1216'
    g.fillRect(0, 0, S, S)
    b.fillStyle = '#000'
    b.fillRect(0, 0, S, S)
    for (let j = 0; j < rows; j++) {
      const off = j % 2 ? w / 2 : 0
      for (let i = -1; i <= cols; i++) {
        const x = i * w + off + 2
        const y = j * h + 2
        const l = 25 + r() * 11
        const gr = g.createLinearGradient(x, y, x, y + h)
        gr.addColorStop(0, hsl(212 + (r() - 0.5) * 12, 9 + r() * 6, l + 5))
        gr.addColorStop(1, hsl(215, 10, l - 6))
        g.fillStyle = gr
        g.fillRect(x, y, w - 4, h - 4)
        g.fillStyle = 'rgba(255,255,255,0.10)'
        g.fillRect(x, y, w - 4, 2)
        const bg = b.createLinearGradient(x, y, x, y + h)
        bg.addColorStop(0, '#fff')
        bg.addColorStop(1, '#666')
        b.fillStyle = bg
        b.fillRect(x, y, w - 4, h - 4)
        if (x + w > S) {
          g.fillStyle = gr
          g.fillRect(x - S, y, w - 4, h - 4)
          b.fillStyle = bg
          b.fillRect(x - S, y, w - 4, h - 4)
        }
      }
    }
    blotch(g, S, S, 14, '#8a9aa8', 80, 200, 0.06, r)
    streaks(g, S, S, 30, '#cbd5dc', 0.05, r, 0.4)
    speckle(g, S, S, 2500, ['#000', '#9db0c0'], 1, 2, 0.1, r)
  })

export const trimMat = () =>
  memo('trim', () => new THREE.MeshStandardMaterial({ color: '#2f3439', roughness: 0.55, metalness: 0.4 }))

export const frameMat = () =>
  memo('frame', () => new THREE.MeshStandardMaterial({ color: '#23272b', roughness: 0.42, metalness: 0.7 }))

/* ------------------------------------------------------------------ concrete */
export const concreteMat = (color = '#8d8a83') =>
  pbr('concrete' + color, 1024, { tile: [2.4, 2.4], rough: 0.93, bump: 2.2 }, (g, b, S) => {
    const r = rng(5)
    g.fillStyle = color
    g.fillRect(0, 0, S, S)
    b.fillStyle = '#8c8c8c'
    b.fillRect(0, 0, S, S)
    blotch(g, S, S, 40, '#5e5a52', 40, 180, 0.12, r)
    blotch(g, S, S, 30, '#e5e2da', 40, 160, 0.1, r)
    streaks(g, S, S, 90, '#3a362f', 0.2, r, 0.7)
    speckle(g, S, S, 9000, ['#000', '#fff', '#6a665e'], 1, 3, 0.1, r)
    speckle(b, S, S, 6000, ['#000', '#fff'], 1, 3, 0.35, r)
    // formwork panel joints (1.2 m panels) + tie holes
    const p = S / 2
    for (let i = 0; i < 2; i++) {
      g.fillStyle = 'rgba(40,36,30,0.35)'
      g.fillRect(i * p - 1, 0, 3, S)
      g.fillRect(0, i * p - 1, S, 3)
      b.fillStyle = '#222'
      b.fillRect(i * p - 1, 0, 3, S)
      b.fillRect(0, i * p - 1, S, 3)
    }
    for (let i = 0; i < 4; i++)
      for (let j = 0; j < 4; j++) {
        const x = (i + 0.5) * (S / 4)
        const y = (j + 0.5) * (S / 4)
        g.fillStyle = 'rgba(30,28,24,0.55)'
        g.beginPath()
        g.arc(x, y, 5, 0, TAU)
        g.fill()
        b.fillStyle = '#111'
        b.beginPath()
        b.arc(x, y, 5, 0, TAU)
        b.fill()
      }
  })

/* ------------------------------------------------------------------ ground */
export const paverMat = () =>
  pbr('paver', 1024, { tile: [3.2, 3.2], rough: 0.82, bump: 2.4 }, (g, b, S) => {
    const r = rng(61)
    const cols = ['#8b8680', '#97918a', '#7d7872', '#a29a8e', '#86807a', '#928a80']
    g.fillStyle = '#4d4944'
    g.fillRect(0, 0, S, S)
    b.fillStyle = '#000'
    b.fillRect(0, 0, S, S)
    const w = S / 8
    const h = S / 16
    for (let j = 0; j < 16; j++) {
      const off = (j % 2) * (w / 2)
      for (let i = -1; i < 9; i++) {
        const x = i * w + off
        g.fillStyle = cols[(r() * cols.length) | 0]
        g.fillRect(x + 1.5, j * h + 1.5, w - 3, h - 3)
        g.fillStyle = `rgba(${r() > 0.5 ? '255,255,255' : '0,0,0'},${0.04 + r() * 0.07})`
        g.fillRect(x + 1.5, j * h + 1.5, w - 3, h - 3)
        b.fillStyle = `hsl(0,0%,${68 + r() * 30}%)`
        b.fillRect(x + 1.5, j * h + 1.5, w - 3, h - 3)
        if (x + w > S) {
          g.fillStyle = cols[(r() * cols.length) | 0]
          g.fillRect(x - S + 1.5, j * h + 1.5, w - 3, h - 3)
          b.fillStyle = '#bbb'
          b.fillRect(x - S + 1.5, j * h + 1.5, w - 3, h - 3)
        }
      }
    }
    blotch(g, S, S, 30, '#2d2a26', 60, 200, 0.14, r)
    blotch(g, S, S, 20, '#cfc7b8', 60, 180, 0.07, r)
    speckle(g, S, S, 6000, ['#000', '#fff'], 1, 2, 0.12, r)
  })

export const asphaltMat = () =>
  pbr('asphalt', 512, { tile: [3, 3], rough: 0.9, bump: 1.4 }, (g, b, S) => {
    const r = rng(91)
    g.fillStyle = '#383b3f'
    g.fillRect(0, 0, S, S)
    b.fillStyle = '#777'
    b.fillRect(0, 0, S, S)
    blotch(g, S, S, 25, '#1d1f22', 40, 160, 0.2, r)
    blotch(g, S, S, 15, '#62666b', 40, 160, 0.1, r)
    speckle(g, S, S, 9000, ['#000', '#fff', '#8a8d92', '#5a5d62'], 1, 2.5, 0.28, r)
    speckle(b, S, S, 7000, ['#000', '#fff'], 1, 2.5, 0.6, r)
  })

export const curbMat = () =>
  pbr('curb', 256, { tile: [1.2, 1.2], rough: 0.9, bump: 1.4 }, (g, b, S) => {
    const r = rng(3)
    g.fillStyle = '#9b988f'
    g.fillRect(0, 0, S, S)
    b.fillStyle = '#888'
    b.fillRect(0, 0, S, S)
    blotch(g, S, S, 10, '#4a4740', 30, 100, 0.2, r)
    speckle(g, S, S, 2500, ['#000', '#fff'], 1, 2, 0.12, r)
  })

/* ------------------------------------------------------------------ interior */
export const parquetMat = () =>
  pbr('parquet', 1024, { tile: [2.4, 2.4], rough: 0.5, bump: 1.0, env: 0.9 }, (g, b, S) => {
    const r = rng(17)
    const pw = S / 20
    g.fillStyle = '#3a2812'
    g.fillRect(0, 0, S, S)
    b.fillStyle = '#000'
    b.fillRect(0, 0, S, S)
    for (let i = 0; i < 20; i++) {
      let y = -r() * 200
      while (y < S) {
        const len = 150 + r() * 220
        const l = 52 + (r() - 0.5) * 12
        g.fillStyle = hsl(30 + (r() - 0.5) * 6, 42, l)
        g.fillRect(i * pw + 1, y + 1, pw - 2, len - 2)
        for (let k = 0; k < 14; k++) {
          g.globalAlpha = 0.1 + r() * 0.12
          g.fillStyle = r() > 0.5 ? '#4b2f10' : '#f0cf9a'
          g.fillRect(i * pw + 2 + r() * (pw - 6), y + r() * len, 1, 20 + r() * 90)
        }
        g.globalAlpha = 1
        b.fillStyle = '#bbb'
        b.fillRect(i * pw + 1, y + 1, pw - 2, len - 2)
        y += len
      }
    }
    blotch(g, S, S, 10, '#fff0d0', 100, 260, 0.06, r)
  })

export const plasterMat = (color = '#ece8df') =>
  pbr('plaster' + color, 512, { tile: [2, 2], rough: 0.96, bump: 0.5, env: 0.8 }, (g, b, S) => {
    const r = rng(33)
    g.fillStyle = color
    g.fillRect(0, 0, S, S)
    b.fillStyle = '#888'
    b.fillRect(0, 0, S, S)
    blotch(g, S, S, 14, '#b9b1a2', 60, 200, 0.07, r)
    speckle(g, S, S, 4000, ['#000', '#fff'], 1, 2, 0.04, r)
    speckle(b, S, S, 5000, ['#000', '#fff'], 1, 2, 0.4, r)
  })

export const tileMat = (color = '#d9d6cf', grout = '#9a968e', n = 6) =>
  pbr('tile' + color + n, 512, { tile: [2.4, 2.4], rough: 0.25, bump: 0.8, env: 1.2 }, (g, b, S) => {
    const r = rng(44)
    g.fillStyle = grout
    g.fillRect(0, 0, S, S)
    b.fillStyle = '#000'
    b.fillRect(0, 0, S, S)
    const s = S / n
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        g.fillStyle = color
        g.fillRect(i * s + 1.5, j * s + 1.5, s - 3, s - 3)
        g.fillStyle = `rgba(${r() > 0.5 ? '255,255,255' : '0,0,0'},${r() * 0.06})`
        g.fillRect(i * s + 1.5, j * s + 1.5, s - 3, s - 3)
        b.fillStyle = '#ccc'
        b.fillRect(i * s + 1.5, j * s + 1.5, s - 3, s - 3)
      }
  })

export const woodDarkMat = (color = '#6b4a2e') =>
  pbr('wooddark' + color, 512, { tile: [1.2, 1.2], rough: 0.5, bump: 0.8 }, (g, b, S) => {
    const r = rng(12)
    g.fillStyle = color
    g.fillRect(0, 0, S, S)
    b.fillStyle = '#888'
    b.fillRect(0, 0, S, S)
    for (let i = 0; i < 160; i++) {
      g.globalAlpha = 0.08 + r() * 0.12
      g.fillStyle = r() > 0.5 ? '#2a1708' : '#c79a62'
      g.fillRect(r() * S, r() * S, 1 + r() * 2, 40 + r() * 260)
    }
    g.globalAlpha = 1
  })

export const woodLightMat = () => woodDarkMat('#c19a6b')

/** Plain PBR colour with optional fabric-like bump noise. */
export function fabricMat(color: string, rough = 0.95) {
  return memo('fabric' + color + rough, () => {
    const { c, g } = mkCanvas(128, 128)
    const r = rng(color.length * 13)
    g.fillStyle = '#888'
    g.fillRect(0, 0, 128, 128)
    for (let i = 0; i < 128; i += 2) {
      g.fillStyle = `rgba(${r() > 0.5 ? '255,255,255' : '0,0,0'},0.25)`
      g.fillRect(i, 0, 1, 128)
      g.fillRect(0, i, 128, 1)
    }
    const bump = canvasTex(c, false, [6, 6])
    return new THREE.MeshStandardMaterial({ color, roughness: rough, bumpMap: bump, bumpScale: 0.6 })
  })
}

export function solid(color: string, rough = 0.6, metal = 0, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  return memo('solid' + color + rough + metal + JSON.stringify(extra), () => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra }))
}

export function emissiveMat(color: string, k = 1.5, nightOnly = false) {
  return memo('emis' + color + k + nightOnly, () => {
    const m = new THREE.MeshStandardMaterial({ color: '#222', emissive: new THREE.Color(color), emissiveIntensity: k, roughness: 0.4 })
    if (nightOnly) registerGlow(m, k)
    return m
  })
}

/* ------------------------------------------------------------------ glass */
export const glassMat = (opacity = 0.25) =>
  memo('glass' + opacity, () => {
    const m = new THREE.MeshPhysicalMaterial({
      color: '#a9c1cf',
      roughness: 0.03,
      metalness: 0,
      transparent: true,
      opacity,
      envMapIntensity: 1.8,
      specularIntensity: 1,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
    m.userData.noAO = true
    return m
  })

/* ------------------------------------------------------------------ window "interiors" for non-visitable cubes */
export function blindMat(variant: number) {
  return memo('blind' + variant, () => {
    const S = 256
    const A = mkCanvas(S, S)
    const L = mkCanvas(S, S)
    const g = A.g
    const l = L.g
    const r = rng(variant * 31 + 5)
    l.fillStyle = '#000'
    l.fillRect(0, 0, S, S)
    if (variant === 0) {
      // venetian blinds, half lowered
      g.fillStyle = '#d6cfc2'
      g.fillRect(0, 0, S, S)
      const down = S * (0.45 + r() * 0.3)
      for (let y = 0; y < down; y += 9) {
        g.fillStyle = '#e8e2d6'
        g.fillRect(0, y, S, 6)
        g.fillStyle = '#9d9588'
        g.fillRect(0, y + 6, S, 3)
      }
      const gr = g.createLinearGradient(0, down, 0, S)
      gr.addColorStop(0, '#b8aa90')
      gr.addColorStop(1, '#e6d6b4')
      g.fillStyle = gr
      g.fillRect(0, down, S, S - down)
      l.fillStyle = '#ffcf8a'
      l.globalAlpha = 0.5
      l.fillRect(0, down, S, S - down)
      l.globalAlpha = 1
    } else if (variant === 1) {
      // curtains + plant
      const gr = g.createLinearGradient(0, 0, 0, S)
      gr.addColorStop(0, '#d9d2c4')
      gr.addColorStop(1, '#b8ab94')
      g.fillStyle = gr
      g.fillRect(0, 0, S, S)
      g.fillStyle = '#2f5a35'
      for (let i = 0; i < 9; i++) {
        g.beginPath()
        g.ellipse(S * 0.5 + (r() - 0.5) * 70, S - 40 - r() * 70, 14, 38, (r() - 0.5) * 1.4, 0, TAU)
        g.fill()
      }
      g.fillStyle = '#b5532f'
      g.fillRect(S * 0.5 - 22, S - 40, 44, 40)
      for (const side of [0, 1]) {
        for (let i = 0; i < 9; i++) {
          g.fillStyle = i % 2 ? '#a64f3a' : '#c0654a'
          g.fillRect(side ? S - 70 + i * 7.8 : i * 7.8, 0, 8, S)
        }
      }
      l.fillStyle = '#ffd7a0'
      l.globalAlpha = 0.28
      l.fillRect(70, 0, S - 140, S)
      l.globalAlpha = 1
    } else if (variant === 2) {
      // warm lit room: wall, shelf, picture, lamp
      const gr = g.createLinearGradient(0, 0, 0, S)
      gr.addColorStop(0, '#f0e3c8')
      gr.addColorStop(1, '#cdb48a')
      g.fillStyle = gr
      g.fillRect(0, 0, S, S)
      g.fillStyle = '#6b4a2e'
      g.fillRect(20, 150, 120, 6)
      for (let i = 0; i < 14; i++) {
        g.fillStyle = `hsl(${(r() * 360) | 0},40%,${40 + r() * 20}%)`
        g.fillRect(24 + i * 8, 120 + r() * 8, 6, 30 - r() * 8)
      }
      g.fillStyle = '#2b4f6b'
      g.fillRect(160, 50, 70, 55)
      g.fillStyle = '#e9c46a'
      g.fillRect(170, 60, 50, 35)
      g.fillStyle = '#fff2c4'
      g.beginPath()
      g.arc(70, 50, 26, 0, TAU)
      g.fill()
      l.fillStyle = '#ffb860'
      l.fillRect(0, 0, S, S)
      l.fillStyle = '#fff1c8'
      l.beginPath()
      l.arc(70, 50, 34, 0, TAU)
      l.fill()
    } else {
      // dark reflective
      const gr = g.createLinearGradient(0, 0, S, S)
      gr.addColorStop(0, '#3a4a58')
      gr.addColorStop(1, '#141c24')
      g.fillStyle = gr
      g.fillRect(0, 0, S, S)
      g.fillStyle = 'rgba(255,255,255,0.05)'
      g.fillRect(0, 0, S, 90)
      l.fillStyle = '#ffc880'
      l.globalAlpha = r() > 0.5 ? 0.35 : 0.0
      l.fillRect(30, 30, S - 60, S - 60)
      l.globalAlpha = 1
    }
    const m = new THREE.MeshStandardMaterial({
      map: canvasTex(A.c),
      emissive: new THREE.Color('#fff'),
      emissiveMap: canvasTex(L.c),
      roughness: 0.75,
      side: THREE.DoubleSide,
    })
    m.userData.noAO = true
    m.map!.wrapS = m.map!.wrapT = THREE.ClampToEdgeWrapping
    m.emissiveMap!.wrapS = m.emissiveMap!.wrapT = THREE.ClampToEdgeWrapping
    registerGlow(m, 1.15)
    return m
  })
}

/* ------------------------------------------------------------------ city facades */
export type FacadeKind = 'brick' | 'concrete' | 'glass' | 'dark' | 'white'

export function facadeMat(kind: FacadeKind, seed = 1) {
  return memo('facade' + kind + seed, () => {
    const S = 512
    const A = mkCanvas(S, S)
    const B = mkCanvas(S, S)
    const L = mkCanvas(S, S)
    const g = A.g
    const b = B.g
    const l = L.g
    const r = rng(seed * 101 + kind.length)
    l.fillStyle = '#000'
    l.fillRect(0, 0, S, S)
    const bays = 3
    const floors = 3
    const bw = S / bays
    const fh = S / floors
    const base: Record<FacadeKind, string> = { brick: '#8c4a38', concrete: '#a9a79f', glass: '#51697b', dark: '#4b3f3a', white: '#d9d6cf' }
    g.fillStyle = base[kind]
    g.fillRect(0, 0, S, S)
    b.fillStyle = '#888'
    b.fillRect(0, 0, S, S)
    if (kind === 'brick' || kind === 'dark') {
      const bh = 6
      for (let y = 0; y < S; y += bh) {
        const off = ((y / bh) % 2) * 8
        for (let x = -16; x < S; x += 16) {
          const k = kind === 'brick' ? hsl(10 + (r() - 0.5) * 10, 38 + r() * 8, 32 + (r() - 0.5) * 9) : hsl(18, 12 + r() * 6, 25 + (r() - 0.5) * 7)
          g.fillStyle = k
          g.fillRect(x + off + 0.5, y + 0.5, 15, bh - 1)
          b.fillStyle = `hsl(0,0%,${60 + r() * 30}%)`
          b.fillRect(x + off + 0.5, y + 0.5, 15, bh - 1)
        }
      }
    } else if (kind === 'concrete' || kind === 'white') {
      blotch(g, S, S, 20, '#6e6b63', 30, 140, 0.1, r)
      streaks(g, S, S, 50, '#3a372f', 0.14, r)
      for (let j = 0; j < floors; j++) {
        g.fillStyle = 'rgba(40,40,36,0.35)'
        g.fillRect(0, j * fh, S, 3)
      }
    }
    for (let j = 0; j < floors; j++) {
      for (let i = 0; i < bays; i++) {
        const x = i * bw + bw * 0.16
        const y = j * fh + fh * 0.2
        const w = bw * 0.68
        const h = fh * 0.58
        if (kind === 'glass') {
          const gr = g.createLinearGradient(x - bw * 0.16, y - fh * 0.2, x + bw, y + fh)
          gr.addColorStop(0, '#6f8ca1')
          gr.addColorStop(0.5, '#3d5568')
          gr.addColorStop(1, '#8aa8bb')
          g.fillStyle = gr
          g.fillRect(i * bw, j * fh, bw, fh)
          g.fillStyle = '#c8d0d6'
          g.fillRect(i * bw, j * fh + fh - 8, bw, 8)
          g.fillRect(i * bw, j * fh, 3, fh)
        } else {
          g.fillStyle = kind === 'dark' ? '#25282b' : '#e9e6df'
          g.fillRect(x - 4, y - 4, w + 8, h + 8)
          const gr = g.createLinearGradient(x, y, x + w, y + h)
          gr.addColorStop(0, '#516a7c')
          gr.addColorStop(0.5, '#2f4252')
          gr.addColorStop(1, '#6c8799')
          g.fillStyle = gr
          g.fillRect(x, y, w, h)
          g.fillStyle = kind === 'dark' ? '#25282b' : '#f1efe8'
          g.fillRect(x + w / 2 - 1.5, y, 3, h)
          g.fillRect(x, y + h * 0.35, w, 3)
          b.fillStyle = '#222'
          b.fillRect(x - 4, y - 4, w + 8, h + 8)
          b.fillStyle = '#bbb'
          b.fillRect(x, y, w, h)
        }
        if (r() > 0.55) {
          l.fillStyle = `hsl(${36 + r() * 12},100%,${62 + r() * 14}%)`
          const gx = kind === 'glass' ? i * bw + 4 : x
          const gy = kind === 'glass' ? j * fh + 4 : y
          l.fillRect(gx, gy, kind === 'glass' ? bw - 8 : w, kind === 'glass' ? fh - 14 : h)
        }
      }
    }
    const map = canvasTex(A.c, true, [1 / 9.6, 1 / 9.6])
    const m = new THREE.MeshStandardMaterial({
      map,
      bumpMap: canvasTex(B.c, false, [1 / 9.6, 1 / 9.6]),
      bumpScale: 1.2,
      roughness: kind === 'glass' ? 0.2 : 0.88,
      metalness: kind === 'glass' ? 0.5 : 0,
      emissive: new THREE.Color('#fff'),
      emissiveMap: canvasTex(L.c, true, [1 / 9.6, 1 / 9.6]),
    })
    registerGlow(m, 1.3)
    m.userData.tile = [9.6, 9.6]
    return m
  })
}

/* ------------------------------------------------------------------ foliage */
export function leafTex() {
  return memo('leaftex', () => {
    const S = 256
    const { c, g } = mkCanvas(S, S)
    const r = rng(9)
    g.clearRect(0, 0, S, S)
    for (let i = 0; i < 26; i++) {
      const x = 20 + r() * (S - 40)
      const y = 20 + r() * (S - 40)
      const a = r() * TAU
      const L = 34 + r() * 26
      g.save()
      g.translate(x, y)
      g.rotate(a)
      const hue = 88 + (r() - 0.5) * 24
      g.fillStyle = hsl(hue, 48 + r() * 12, 30 + r() * 18)
      g.beginPath()
      g.moveTo(-L / 2, 0)
      g.quadraticCurveTo(0, -L * 0.42, L / 2, 0)
      g.quadraticCurveTo(0, L * 0.42, -L / 2, 0)
      g.fill()
      g.strokeStyle = 'rgba(20,50,10,0.45)'
      g.lineWidth = 1
      g.beginPath()
      g.moveTo(-L / 2, 0)
      g.lineTo(L / 2, 0)
      g.stroke()
      g.restore()
    }
    const t = canvasTex(c)
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping
    return t
  })
}

export const barkMat = () =>
  pbr('bark', 256, { tile: [0.9, 0.9], rough: 1, bump: 3 }, (g, b, S) => {
    const r = rng(8)
    g.fillStyle = '#5b5247'
    g.fillRect(0, 0, S, S)
    b.fillStyle = '#777'
    b.fillRect(0, 0, S, S)
    for (let i = 0; i < 90; i++) {
      const x = r() * S
      const w = 2 + r() * 6
      g.fillStyle = r() > 0.5 ? '#3c352d' : '#7d7366'
      g.globalAlpha = 0.6
      g.fillRect(x, 0, w, S)
      b.fillStyle = r() > 0.5 ? '#222' : '#ddd'
      b.fillRect(x, 0, w, S)
    }
    g.globalAlpha = 1
  })

/* ------------------------------------------------------------------ signage */
export function signMat(lines: { text: string; size: number; color?: string }[], bg = '#14202b', w = 512, h = 256, border = '#d8b24a') {
  return memo('sign' + lines.map((l) => l.text).join('|') + bg, () => {
    const { c, g } = mkCanvas(w, h)
    g.fillStyle = bg
    g.fillRect(0, 0, w, h)
    g.strokeStyle = border
    g.lineWidth = 6
    g.strokeRect(10, 10, w - 20, h - 20)
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    let y = h / 2 - ((lines.length - 1) * (lines[0].size * 1.15)) / 2
    for (const ln of lines) {
      g.fillStyle = ln.color ?? '#f5f0e0'
      g.font = `700 ${ln.size}px "Helvetica Neue", Arial, sans-serif`
      g.fillText(ln.text, w / 2, y, w - 40)
      y += ln.size * 1.15
    }
    const t = canvasTex(c)
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping
    const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.4, metalness: 0.2, emissive: new THREE.Color('#fff'), emissiveMap: t })
    registerGlow(m, 0.5)
    m.emissiveIntensity = 0
    return m
  })
}

/** Colourful mural for the inside of the Markthal arch. */
export function muralMat() {
  return memo('mural', () => {
    const S = 1024
    const { c, g } = mkCanvas(S, S)
    const r = rng(77)
    g.fillStyle = '#243a5a'
    g.fillRect(0, 0, S, S)
    const pal = ['#e63946', '#f4a261', '#e9c46a', '#2a9d8f', '#8ab17d', '#c1121f', '#7b2cbf', '#ff7b9c', '#f77f00', '#4cc9f0']
    for (let i = 0; i < 520; i++) {
      const x = r() * S
      const y = r() * S
      const rad = 14 + r() * 60
      const gr = g.createRadialGradient(x - rad * 0.3, y - rad * 0.3, 1, x, y, rad)
      const col = pal[(r() * pal.length) | 0]
      gr.addColorStop(0, '#ffffffaa')
      gr.addColorStop(0.25, col)
      gr.addColorStop(1, '#00000066')
      g.fillStyle = gr
      g.beginPath()
      g.ellipse(x, y, rad, rad * (0.7 + r() * 0.5), r() * 3, 0, TAU)
      g.fill()
    }
    const t = canvasTex(c)
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping
    const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.6, emissive: new THREE.Color('#fff'), emissiveMap: t, side: THREE.DoubleSide })
    registerGlow(m, 0.35)
    m.emissiveIntensity = 0.12
    return m
  })
}

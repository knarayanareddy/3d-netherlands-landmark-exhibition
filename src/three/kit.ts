import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

export const TAU = Math.PI * 2
export type Mat = THREE.Material
export type Box4 = [number, number, number, number] // cx, cz, halfX, halfZ
export interface Landmark {
  group: THREE.Group
  radius: number
  update?: (t: number, dt: number) => void
  colliders?: Box4[]
  /** local floor height for walking mode */
  floor?: (x: number, z: number) => number
}

export const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

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

export function mkCanvas(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return { c, g: c.getContext('2d')! }
}

export function toTex(c: HTMLCanvasElement, srgb = true) {
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.anisotropy = 8
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
  return t
}

const cache = new Map<string, any>()
function memo<T>(k: string, f: () => T): T {
  if (!cache.has(k)) cache.set(k, f())
  return cache.get(k)
}

/* ---------------- night glow registry ---------------- */
const glowList: { m: THREE.MeshStandardMaterial; k: number }[] = []
export function registerGlow(m: THREE.MeshStandardMaterial, k = 1) {
  glowList.push({ m, k })
  m.emissiveIntensity = 0
  return m
}
export function setNight(n: number) {
  for (const g of glowList) g.m.emissiveIntensity = g.k * n
}

/* ---------------- texture painters ---------------- */
type Ctx = CanvasRenderingContext2D

export function speckle(g: Ctx, W: number, H: number, n: number, cols: string[], min: number, max: number, alpha: number, seed = 1) {
  const r = rng(seed)
  for (let i = 0; i < n; i++) {
    g.globalAlpha = alpha * (0.4 + r() * 0.6)
    g.fillStyle = cols[(r() * cols.length) | 0]
    const s = min + r() * (max - min)
    g.fillRect(r() * W, r() * H, s, s)
  }
  g.globalAlpha = 1
}

export function drawBricks(g: Ctx, b: Ctx | null, W: number, H: number, color: string, nx: number, ny: number, seed = 3, mortar = '#b9b1a3') {
  const bw = W / nx
  const bh = H / ny
  const r = rng(seed)
  g.fillStyle = mortar
  g.fillRect(0, 0, W, H)
  if (b) {
    b.fillStyle = '#000'
    b.fillRect(0, 0, W, H)
  }
  const hsl = { h: 0, s: 0, l: 0 }
  new THREE.Color(color).getHSL(hsl)
  for (let j = 0; j < ny; j++) {
    for (let i = -1; i <= nx; i++) {
      const x = i * bw + (j % 2 ? bw / 2 : 0)
      const y = j * bh
      const c = new THREE.Color().setHSL(hsl.h + (r() - 0.5) * 0.025, Math.min(1, hsl.s * (0.75 + r() * 0.5)), Math.min(0.9, hsl.l * (0.72 + r() * 0.56)))
      g.fillStyle = '#' + c.getHexString()
      g.fillRect(x + bw * 0.03, y + bh * 0.08, bw * 0.94, bh * 0.84)
      if (b) {
        const v = 140 + r() * 115
        b.fillStyle = `rgb(${v},${v},${v})`
        b.fillRect(x + bw * 0.03, y + bh * 0.08, bw * 0.94, bh * 0.84)
      }
    }
  }
}

function patMat(key: string, S: number, tile: [number, number], draw: (g: Ctx, b: Ctx, S: number) => void, o: { rough?: number; bump?: number; metal?: number } = {}) {
  return memo(key, () => {
    const A = mkCanvas(S, S)
    const B = mkCanvas(S, S)
    draw(A.g, B.g, S)
    const m = new THREE.MeshStandardMaterial({ map: toTex(A.c), bumpMap: toTex(B.c, false), bumpScale: o.bump ?? 1.5, roughness: o.rough ?? 0.9, metalness: o.metal ?? 0 })
    m.userData.tile = tile
    return m
  })
}

export const brickMat = (color = '#9b4a34') =>
  patMat('brick' + color, 512, [1.76, 1.76], (g, b, S) => {
    drawBricks(g, b, S, S, color, 8, 24)
    speckle(g, S, S, 1400, ['#000', '#fff', '#5a3a2a'], 1, 3, 0.12)
  })

export const stoneMat = (color = '#c9c1ac') =>
  patMat('stone' + color, 512, [3, 3], (g, b, S) => {
    const r = rng(11)
    g.fillStyle = '#7d7768'
    g.fillRect(0, 0, S, S)
    b.fillStyle = '#000'
    b.fillRect(0, 0, S, S)
    const hsl = { h: 0, s: 0, l: 0 }
    new THREE.Color(color).getHSL(hsl)
    const rows = 8
    for (let j = 0; j < rows; j++) {
      let x = -r() * 80
      while (x < S) {
        const w = 70 + r() * 110
        const c = new THREE.Color().setHSL(hsl.h, hsl.s, hsl.l * (0.88 + r() * 0.2))
        g.fillStyle = '#' + c.getHexString()
        g.fillRect(x + 2, (j * S) / rows + 2, w - 4, S / rows - 4)
        b.fillStyle = `rgb(${150 + r() * 100},${150 + r() * 100},${150 + r() * 100})`
        b.fillRect(x + 2, (j * S) / rows + 2, w - 4, S / rows - 4)
        x += w
      }
    }
    speckle(g, S, S, 2500, ['#000', '#fff', '#6b6048'], 1, 3, 0.1)
  })

export const concreteMat = (color = '#b4b2ab') =>
  patMat('concrete' + color, 512, [5, 5], (g, b, S) => {
    const r = rng(5)
    g.fillStyle = color
    g.fillRect(0, 0, S, S)
    b.fillStyle = '#888'
    b.fillRect(0, 0, S, S)
    speckle(g, S, S, 3500, ['#000', '#fff', '#777'], 1, 5, 0.08)
    speckle(b, S, S, 3000, ['#000', '#fff'], 1, 4, 0.35)
    for (let i = 0; i < 70; i++) {
      g.globalAlpha = 0.06 + r() * 0.08
      g.fillStyle = '#3a3a34'
      g.fillRect(r() * S, r() * S * 0.5, 1 + r() * 3, 60 + r() * 220)
    }
    g.globalAlpha = 1
    g.strokeStyle = 'rgba(0,0,0,0.28)'
    g.lineWidth = 2
    g.strokeRect(1, 1, S - 2, S - 2)
    g.beginPath()
    g.moveTo(S / 2, 0)
    g.lineTo(S / 2, S)
    g.stroke()
    b.strokeStyle = '#000'
    b.lineWidth = 3
    b.strokeRect(1, 1, S - 2, S - 2)
  }, { rough: 0.92, bump: 1 })

export const slateMat = (color = '#3a4250') =>
  patMat('slate' + color, 512, [2.4, 2.4], (g, b, S) => {
    const r = rng(21)
    const rows = 16
    const w = S / 10
    const h = S / rows
    g.fillStyle = '#12161c'
    g.fillRect(0, 0, S, S)
    b.fillStyle = '#000'
    b.fillRect(0, 0, S, S)
    const hsl = { h: 0, s: 0, l: 0 }
    new THREE.Color(color).getHSL(hsl)
    for (let j = 0; j < rows; j++) {
      for (let i = -1; i < 11; i++) {
        const x = i * w + (j % 2 ? w / 2 : 0)
        const c = new THREE.Color().setHSL(hsl.h, hsl.s, hsl.l * (0.7 + r() * 0.6))
        g.fillStyle = '#' + c.getHexString()
        g.beginPath()
        g.roundRect(x + 1, j * h, w - 2, h * 1.7, [0, 0, w * 0.3, w * 0.3])
        g.fill()
        b.fillStyle = `rgb(${120 + r() * 120},${120 + r() * 120},${120 + r() * 120})`
        b.beginPath()
        b.roundRect(x + 1, j * h, w - 2, h * 1.7, [0, 0, w * 0.3, w * 0.3])
        b.fill()
      }
    }
  }, { rough: 0.55, bump: 2 })

export const clayRoofMat = (color = '#b4502f') =>
  patMat('clay' + color, 512, [2, 2], (g, b, S) => {
    const r = rng(33)
    const hsl = { h: 0, s: 0, l: 0 }
    new THREE.Color(color).getHSL(hsl)
    const cols = 16
    const w = S / cols
    for (let i = 0; i < cols; i++) {
      const c = new THREE.Color().setHSL(hsl.h, hsl.s, hsl.l * (0.8 + r() * 0.4))
      const gr = g.createLinearGradient(i * w, 0, (i + 1) * w, 0)
      gr.addColorStop(0, '#' + c.clone().multiplyScalar(0.55).getHexString())
      gr.addColorStop(0.5, '#' + c.clone().multiplyScalar(1.15).getHexString())
      gr.addColorStop(1, '#' + c.clone().multiplyScalar(0.6).getHexString())
      g.fillStyle = gr
      g.fillRect(i * w, 0, w, S)
      const gb = b.createLinearGradient(i * w, 0, (i + 1) * w, 0)
      gb.addColorStop(0, '#222')
      gb.addColorStop(0.5, '#fff')
      gb.addColorStop(1, '#222')
      b.fillStyle = gb
      b.fillRect(i * w, 0, w, S)
    }
    for (let j = 0; j < 14; j++) {
      g.fillStyle = 'rgba(0,0,0,0.28)'
      g.fillRect(0, (j * S) / 14, S, 3)
      b.fillStyle = '#000'
      b.fillRect(0, (j * S) / 14, S, 5)
    }
    speckle(g, S, S, 1500, ['#000', '#8a8f6a', '#e0c9a8'], 1, 3, 0.15)
  }, { rough: 0.8, bump: 2 })

export const thatchMat = (color = '#a58d56') =>
  patMat('thatch' + color, 512, [2, 2], (g, b, S) => {
    const r = rng(41)
    g.fillStyle = '#6c5a36'
    g.fillRect(0, 0, S, S)
    b.fillStyle = '#555'
    b.fillRect(0, 0, S, S)
    const base = new THREE.Color(color)
    for (let i = 0; i < 5200; i++) {
      const x = r() * S
      const y = r() * S
      const l = 30 + r() * 70
      const c = base.clone().multiplyScalar(0.55 + r() * 0.7)
      g.strokeStyle = '#' + c.getHexString()
      g.lineWidth = 1 + r() * 1.5
      g.beginPath()
      g.moveTo(x, y)
      g.lineTo(x + (r() - 0.5) * 4, y + l)
      g.stroke()
      const v = 90 + r() * 160
      b.strokeStyle = `rgb(${v},${v},${v})`
      b.lineWidth = 1.5
      b.beginPath()
      b.moveTo(x, y)
      b.lineTo(x, y + l)
      b.stroke()
    }
  }, { rough: 1, bump: 3 })

export const grassMat = (color = '#587f3a') =>
  patMat('grass' + color, 512, [7, 7], (g, b, S) => {
    const r = rng(51)
    g.fillStyle = color
    g.fillRect(0, 0, S, S)
    b.fillStyle = '#777'
    b.fillRect(0, 0, S, S)
    const base = new THREE.Color(color)
    for (let i = 0; i < 9000; i++) {
      const c = base.clone().multiplyScalar(0.65 + r() * 0.7)
      g.strokeStyle = '#' + c.getHexString()
      g.lineWidth = 1
      const x = r() * S
      const y = r() * S
      g.beginPath()
      g.moveTo(x, y)
      g.lineTo(x + (r() - 0.5) * 5, y - 3 - r() * 6)
      g.stroke()
    }
    speckle(b, S, S, 3000, ['#000', '#fff'], 1, 3, 0.5)
    speckle(g, S, S, 120, ['#f3e46b', '#fff', '#e7a0c9'], 1, 2.5, 0.8)
  }, { rough: 1, bump: 1 })

export const asphaltMat = (color = '#34373b') =>
  patMat('asphalt' + color, 256, [4, 4], (g, b, S) => {
    g.fillStyle = color
    g.fillRect(0, 0, S, S)
    b.fillStyle = '#777'
    b.fillRect(0, 0, S, S)
    speckle(g, S, S, 3500, ['#000', '#fff', '#888'], 1, 2, 0.25)
    speckle(b, S, S, 3000, ['#000', '#fff'], 1, 2, 0.6)
  }, { rough: 0.85, bump: 1 })

export const paveMat = (color = '#8b7d70') =>
  patMat('pave' + color, 512, [3, 3], (g, b, S) => {
    const r = rng(61)
    g.fillStyle = '#4a443d'
    g.fillRect(0, 0, S, S)
    b.fillStyle = '#000'
    b.fillRect(0, 0, S, S)
    const base = new THREE.Color(color)
    const nx = 16
    const ny = 32
    const w = S / nx
    const h = S / ny
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const c = base.clone().multiplyScalar(0.7 + r() * 0.6)
        g.fillStyle = '#' + c.getHexString()
        const x = i * w + (j % 2 ? w / 2 : 0)
        g.fillRect(x + 1, j * h + 1, w - 2, h - 2)
        if (x + w > S) g.fillRect(x - S + 1, j * h + 1, w - 2, h - 2)
        b.fillStyle = '#fff'
        b.fillRect(x + 1, j * h + 1, w - 2, h - 2)
        if (x + w > S) b.fillRect(x - S + 1, j * h + 1, w - 2, h - 2)
      }
    }
  }, { rough: 0.9, bump: 2 })

export const woodMat = (color = '#8a6a45') =>
  patMat('wood' + color, 256, [1.5, 1.5], (g, b, S) => {
    const r = rng(71)
    const base = new THREE.Color(color)
    const n = 8
    for (let i = 0; i < n; i++) {
      const c = base.clone().multiplyScalar(0.75 + r() * 0.5)
      g.fillStyle = '#' + c.getHexString()
      g.fillRect((i * S) / n, 0, S / n, S)
      b.fillStyle = '#888'
      b.fillRect((i * S) / n, 0, S / n, S)
      for (let k = 0; k < 14; k++) {
        g.strokeStyle = 'rgba(0,0,0,0.18)'
        g.beginPath()
        const x = (i * S) / n + r() * (S / n)
        g.moveTo(x, 0)
        g.lineTo(x + (r() - 0.5) * 6, S)
        g.stroke()
      }
      g.fillStyle = 'rgba(0,0,0,0.45)'
      g.fillRect((i * S) / n, 0, 2, S)
      b.fillStyle = '#000'
      b.fillRect((i * S) / n, 0, 3, S)
    }
  }, { rough: 0.8, bump: 1.5 })

export const rockMat = () =>
  patMat('rock', 512, [3, 3], (g, b, S) => {
    const r = rng(81)
    g.fillStyle = '#23262a'
    g.fillRect(0, 0, S, S)
    b.fillStyle = '#000'
    b.fillRect(0, 0, S, S)
    for (let i = 0; i < 260; i++) {
      const x = r() * S
      const y = r() * S
      const rx = 18 + r() * 34
      const ry = 12 + r() * 24
      const v = 50 + r() * 60
      g.fillStyle = `rgb(${v},${v + 3},${v + 6})`
      for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
        g.beginPath()
        g.ellipse(x + ox, y + oy, rx, ry, r() * 3, 0, TAU)
        g.fill()
        b.fillStyle = `rgb(${120 + r() * 120},${120 + r() * 120},${120 + r() * 120})`
        b.beginPath()
        b.ellipse(x + ox, y + oy, rx, ry, 0, 0, TAU)
        b.fill()
      }
    }
  }, { rough: 0.95, bump: 3 })

export const colorMat = (color: string, rough = 0.7, metal = 0) =>
  memo(`c${color}${rough}${metal}`, () => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal }))
export const steelMat = (color = '#b8c0c7', rough = 0.38) => colorMat(color, rough, 0.85)
export const glassMat = (color = '#8fb7cc') =>
  memo('glass' + color, () => new THREE.MeshPhysicalMaterial({ color, roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.38, envMapIntensity: 2, clearcoat: 1 }))
export const goldMat = () => colorMat('#d9b24a', 0.3, 1)
export const leafMat = (color: string) => memo('leaf' + color, () => new THREE.MeshStandardMaterial({ color, roughness: 0.95, flatShading: true }))

/* ---------------- facades ---------------- */
function archPath(g: Ctx, x: number, y: number, w: number, h: number) {
  g.beginPath()
  g.moveTo(x, y + h)
  g.lineTo(x, y + w / 2)
  g.arc(x + w / 2, y + w / 2, w / 2, Math.PI, 0)
  g.lineTo(x + w, y + h)
  g.closePath()
}
function pointedPath(g: Ctx, x: number, y: number, w: number, h: number, springY: number) {
  g.beginPath()
  g.moveTo(x, y + h)
  g.lineTo(x, springY)
  g.quadraticCurveTo(x, y + (springY - y) * 0.3, x + w / 2, y)
  g.quadraticCurveTo(x + w, y + (springY - y) * 0.3, x + w, springY)
  g.lineTo(x + w, y + h)
  g.closePath()
}

function paintWindow(g: Ctx, lit: Ctx, x: number, y: number, w: number, h: number, style: string, trim: string, frame: string, on: boolean, panes: [number, number]) {
  const path = (ctx: Ctx, ix = 0) => {
    if (style === 'arch') archPath(ctx, x + ix, y + ix, w - ix * 2, h - ix)
    else {
      ctx.beginPath()
      ctx.rect(x + ix, y + ix, w - ix * 2, h - ix * 2)
    }
  }
  // surround
  g.fillStyle = trim
  if (style === 'arch') archPath(g, x - w * 0.14, y - w * 0.14, w * 1.28, h + w * 0.14)
  else {
    g.beginPath()
    g.rect(x - w * 0.12, y - w * 0.1, w * 1.24, h + w * 0.2)
  }
  g.fill()
  // frame + glass
  g.fillStyle = frame
  path(g)
  g.fill()
  const gl = g.createLinearGradient(x, y, x + w, y + h)
  gl.addColorStop(0, '#2b3d4d')
  gl.addColorStop(0.5, '#51697c')
  gl.addColorStop(1, '#1b2833')
  g.fillStyle = gl
  path(g, w * 0.06)
  g.fill()
  // muntins
  g.strokeStyle = frame
  g.lineWidth = Math.max(1.5, w * 0.04)
  for (let i = 1; i < panes[0]; i++) {
    g.beginPath()
    g.moveTo(x + (w * i) / panes[0], y + (style === 'arch' ? w * 0.5 : 0))
    g.lineTo(x + (w * i) / panes[0], y + h)
    g.stroke()
  }
  for (let j = 1; j < panes[1]; j++) {
    g.beginPath()
    g.moveTo(x, y + (h * j) / panes[1])
    g.lineTo(x + w, y + (h * j) / panes[1])
    g.stroke()
  }
  // sill
  g.fillStyle = trim
  g.fillRect(x - w * 0.18, y + h, w * 1.36, h * 0.05)
  // lit map
  if (on) {
    lit.fillStyle = '#ffcf8a'
    path(lit, w * 0.06)
    lit.fill()
    lit.strokeStyle = '#000'
    lit.lineWidth = Math.max(1.5, w * 0.05)
    for (let i = 1; i < panes[0]; i++) {
      lit.beginPath()
      lit.moveTo(x + (w * i) / panes[0], y)
      lit.lineTo(x + (w * i) / panes[0], y + h)
      lit.stroke()
    }
    for (let j = 1; j < panes[1]; j++) {
      lit.beginPath()
      lit.moveTo(x, y + (h * j) / panes[1])
      lit.lineTo(x + w, y + (h * j) / panes[1])
      lit.stroke()
    }
  }
}

function finishFacade(A: { c: HTMLCanvasElement }, B: { c: HTMLCanvasElement }, L: { c: HTMLCanvasElement }, tile: [number, number] | null) {
  const m = new THREE.MeshStandardMaterial({
    map: toTex(A.c),
    bumpMap: toTex(B.c, false),
    bumpScale: 1.4,
    roughness: 0.88,
    emissive: new THREE.Color('#ffffff'),
    emissiveMap: toTex(L.c),
  })
  registerGlow(m, 1.7)
  if (tile) m.userData.tile = tile
  return m
}

/** Repeating bay tile: brick wall with one window per floor, cornice & string courses. */
export function bayMat(o: { bayW?: number; floorH?: number; floors?: number; brick?: string; trim?: string; style?: 'arch' | 'sash' | 'plain'; frame?: string; panes?: [number, number] }) {
  const { bayW = 1.25, floorH = 2, floors = 2, brick = '#9a4a34', trim = '#dad0b8', style = 'arch', frame = '#ece6d6', panes = [2, 3] as [number, number] } = o
  return memo(`bay${bayW}${floorH}${floors}${brick}${trim}${style}${frame}`, () => {
    const ppu = 128
    const W = Math.round(bayW * ppu)
    const FH = Math.round(floorH * ppu)
    const H = FH * floors
    const A = mkCanvas(W, H)
    const B = mkCanvas(W, H)
    const L = mkCanvas(W, H)
    L.g.fillStyle = '#000'
    L.g.fillRect(0, 0, W, H)
    drawBricks(A.g, B.g, W, H, brick, 6, Math.round(H / 14), 4)
    speckle(A.g, W, H, 600, ['#000', '#fff'], 1, 2, 0.1)
    for (let f = 0; f < floors; f++) {
      const y0 = f * FH
      const last = f === floors - 1
      const ww = W * (last && style === 'arch' ? 0.42 : 0.46)
      const wh = FH * (last ? 0.56 : 0.62)
      paintWindow(A.g, L.g, (W - ww) / 2, y0 + FH * (last ? 0.3 : 0.22), ww, wh, style, trim, frame, true, panes)
      A.g.fillStyle = trim
      A.g.fillRect(0, y0, W, FH * 0.05)
      B.g.fillStyle = '#fff'
      B.g.fillRect(0, y0, W, FH * 0.05)
    }
    A.g.fillStyle = trim
    A.g.fillRect(0, H - FH * 0.08, W, FH * 0.08)
    return finishFacade(A, B, L, [bayW, floorH * floors])
  })
}

/** One-off facade for a canal house (full image, uv 0..1 over w x h). */
export function houseFacade(o: { w: number; h: number; floors: number; floorH: number; brick: string; trim: string; seed: number; door?: string }) {
  const ppu = 96
  const W = Math.round(o.w * ppu)
  const H = Math.round(o.h * ppu)
  const A = mkCanvas(W, H)
  const B = mkCanvas(W, H)
  const L = mkCanvas(W, H)
  L.g.fillStyle = '#000'
  L.g.fillRect(0, 0, W, H)
  drawBricks(A.g, B.g, W, H, o.brick, Math.round(o.w / 0.25), Math.round(o.h / 0.075), o.seed, '#c7bfb0')
  speckle(A.g, W, H, 700, ['#000', '#fff'], 1, 2, 0.1, o.seed)
  const r = rng(o.seed)
  const FH = o.floorH * ppu
  const cols = o.w > 2.5 ? 3 : 2
  const yBase = H // canvas y grows downward; floor 0 (ground) bottom at H
  for (let f = 0; f < o.floors; f++) {
    const yTop = yBase - (f + 1) * FH
    const ww = (W / cols) * 0.5
    const wh = FH * (f === o.floors - 1 ? 0.56 : 0.64) * (f === 0 ? 0.9 : 1)
    for (let c = 0; c < cols; c++) {
      const cx = (W / cols) * (c + 0.5)
      if (f === 0 && c === 0 && cols === 2) {
        // door
        const dw = ww * 0.85
        const dh = FH * 0.82
        A.g.fillStyle = o.trim
        A.g.fillRect(cx - dw * 0.62, yTop + FH - dh - dw * 0.15, dw * 1.24, dh + dw * 0.15)
        A.g.fillStyle = o.door ?? '#2f4a3a'
        A.g.fillRect(cx - dw / 2, yTop + FH - dh, dw, dh)
        A.g.fillStyle = '#1b2833'
        A.g.fillRect(cx - dw * 0.38, yTop + FH - dh + dh * 0.1, dw * 0.76, dh * 0.28)
        A.g.fillStyle = '#d8b04a'
        A.g.fillRect(cx + dw * 0.28, yTop + FH - dh * 0.45, 4, 4)
        continue
      }
      paintWindow(A.g, L.g, cx - ww / 2, yTop + FH * 0.2 + (f === 0 ? FH * 0.1 : 0), ww, wh, 'sash', o.trim, '#f1ede2', r() > 0.25, [2, 3])
    }
    A.g.fillStyle = o.trim
    A.g.fillRect(0, yTop - FH * 0.02, W, FH * 0.05)
  }
  // attic hatch + hoist
  const gy = yBase - o.floors * FH
  A.g.fillStyle = o.trim
  A.g.fillRect(W / 2 - ppu * 0.2, gy - ppu * 0.78, ppu * 0.4, ppu * 0.5)
  A.g.fillStyle = '#4a3b2c'
  A.g.fillRect(W / 2 - ppu * 0.15, gy - ppu * 0.72, ppu * 0.3, ppu * 0.4)
  A.g.strokeStyle = o.trim
  A.g.lineWidth = 3
  A.g.beginPath()
  A.g.arc(W / 2, gy - ppu * 0.3, W * 0.18, Math.PI, 0)
  A.g.stroke()
  return finishFacade(A, B, L, null)
}

/** Gothic stone face (uv 0..1): ashlar with pointed arch recesses. */
export function gothicMat(o: { W: number; H: number; bays: number; levels: number; stone?: string; open?: boolean; clock?: boolean; seed?: number }) {
  const { W: wu, H: hu, bays, levels, stone = '#bdb49c', open = false, seed = 2 } = o
  return memo(`goth${wu}${hu}${bays}${levels}${stone}${open}${seed}`, () => {
    const ppu = 90
    const W = Math.round(wu * ppu)
    const H = Math.round(hu * ppu)
    const A = mkCanvas(W, H)
    const B = mkCanvas(W, H)
    const L = mkCanvas(W, H)
    L.g.fillStyle = '#000'
    L.g.fillRect(0, 0, W, H)
    const r = rng(seed)
    A.g.fillStyle = '#867f6c'
    A.g.fillRect(0, 0, W, H)
    B.g.fillStyle = '#000'
    B.g.fillRect(0, 0, W, H)
    const hsl = { h: 0, s: 0, l: 0 }
    new THREE.Color(stone).getHSL(hsl)
    const rowH = ppu * 0.28
    for (let j = 0; j * rowH < H; j++) {
      let x = -r() * 40
      while (x < W) {
        const w = 28 + r() * 40
        const c = new THREE.Color().setHSL(hsl.h, hsl.s, hsl.l * (0.86 + r() * 0.22))
        A.g.fillStyle = '#' + c.getHexString()
        A.g.fillRect(x + 1, j * rowH + 1, w - 2, rowH - 2)
        B.g.fillStyle = `rgb(${160 + r() * 90},${160 + r() * 90},${160 + r() * 90})`
        B.g.fillRect(x + 1, j * rowH + 1, w - 2, rowH - 2)
        x += w
      }
    }
    speckle(A.g, W, H, 1800, ['#000', '#fff', '#4d5a3a'], 1, 3, 0.1)
    // soot streaks
    for (let i = 0; i < 40; i++) {
      A.g.globalAlpha = 0.07
      A.g.fillStyle = '#222'
      A.g.fillRect(r() * W, r() * H * 0.5, 2 + r() * 4, 40 + r() * H * 0.5)
    }
    A.g.globalAlpha = 1
    // buttress strips
    A.g.fillStyle = 'rgba(255,255,255,0.12)'
    A.g.fillRect(0, 0, W * 0.07, H)
    A.g.fillRect(W * 0.93, 0, W * 0.07, H)
    A.g.fillStyle = 'rgba(0,0,0,0.22)'
    A.g.fillRect(W * 0.07, 0, 3, H)
    A.g.fillRect(W * 0.93 - 3, 0, 3, H)
    const bw = (W * 0.86) / bays
    const lh = (H * 0.92) / levels
    for (let l = 0; l < levels; l++) {
      for (let b = 0; b < bays; b++) {
        const x = W * 0.07 + b * bw + bw * 0.2
        const w = bw * 0.6
        const y = H * 0.04 + l * lh + lh * 0.06
        const h = lh * 0.88
        pointedPath(A.g, x - 5, y - 5, w + 10, h + 8, y + h * 0.3)
        A.g.fillStyle = '#d3cbb4'
        A.g.fill()
        pointedPath(A.g, x, y, w, h, y + h * 0.3)
        A.g.fillStyle = open ? '#0d0f12' : '#6f6b5d'
        A.g.fill()
        B.g.fillStyle = '#000'
        pointedPath(B.g, x, y, w, h, y + h * 0.3)
        B.g.fill()
        if (open) {
          L.g.fillStyle = '#ffb867'
          pointedPath(L.g, x + 3, y + 3, w - 6, h - 6, y + h * 0.3)
          L.g.fill()
        }
        // tracery
        A.g.strokeStyle = open ? '#b9b19a' : '#948f7d'
        A.g.lineWidth = 3
        A.g.beginPath()
        A.g.moveTo(x + w / 2, y + h * 0.12)
        A.g.lineTo(x + w / 2, y + h)
        A.g.moveTo(x, y + h * 0.55)
        A.g.lineTo(x + w, y + h * 0.55)
        A.g.stroke()
        if (open) {
          L.g.strokeStyle = '#000'
          L.g.lineWidth = 4
          L.g.beginPath()
          L.g.moveTo(x + w / 2, y + h * 0.12)
          L.g.lineTo(x + w / 2, y + h)
          L.g.stroke()
        }
      }
    }
    const m = finishFacade(A, B, L, null)
    ;(m as THREE.MeshStandardMaterial).emissive.set('#ffffff')
    return m
  })
}

export function clockMat() {
  return memo('clock', () => {
    const S = 256
    const A = mkCanvas(S, S)
    const g = A.g
    g.fillStyle = '#d4af37'
    g.beginPath()
    g.arc(S / 2, S / 2, S / 2, 0, TAU)
    g.fill()
    g.fillStyle = '#1a2d6b'
    g.beginPath()
    g.arc(S / 2, S / 2, S * 0.44, 0, TAU)
    g.fill()
    g.strokeStyle = '#d4af37'
    g.lineWidth = 6
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU
      g.beginPath()
      g.moveTo(S / 2 + Math.cos(a) * S * 0.33, S / 2 + Math.sin(a) * S * 0.33)
      g.lineTo(S / 2 + Math.cos(a) * S * 0.41, S / 2 + Math.sin(a) * S * 0.41)
      g.stroke()
    }
    g.lineWidth = 9
    g.lineCap = 'round'
    g.beginPath()
    g.moveTo(S / 2, S / 2)
    g.lineTo(S / 2 + 55, S / 2 - 70)
    g.moveTo(S / 2, S / 2)
    g.lineTo(S / 2 - 20, S / 2 + 30)
    g.stroke()
    const m = new THREE.MeshStandardMaterial({ map: toTex(A.c), roughness: 0.4, metalness: 0.3 })
    return m
  })
}

/** Single window panel (cube houses) — uv 0..1 over one face. */
export function panelMat(o: { base: string; kind: 'wall' | 'roof' }) {
  return memo('panel' + o.base + o.kind, () => {
    const S = 256
    const A = mkCanvas(S, S)
    const B = mkCanvas(S, S)
    const L = mkCanvas(S, S)
    const g = A.g
    L.g.fillStyle = '#000'
    L.g.fillRect(0, 0, S, S)
    if (o.kind === 'wall') {
      g.fillStyle = o.base
      g.fillRect(0, 0, S, S)
      for (let i = 0; i < 16; i++) {
        g.fillStyle = i % 2 ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.06)'
        g.fillRect(0, (i * S) / 16, S, S / 16)
        g.fillStyle = 'rgba(0,0,0,0.25)'
        g.fillRect(0, (i * S) / 16, S, 1.5)
      }
    } else {
      g.fillStyle = '#3d444c'
      g.fillRect(0, 0, S, S)
      for (let i = 0; i < 12; i++) {
        g.fillStyle = 'rgba(0,0,0,0.3)'
        g.fillRect(0, (i * S) / 12, S, 2)
      }
    }
    B.g.fillStyle = '#888'
    B.g.fillRect(0, 0, S, S)
    const wx = S * 0.17
    const wy = S * 0.17
    const ww = S * 0.66
    g.fillStyle = '#1c1c1c'
    g.fillRect(wx - 8, wy - 8, ww + 16, ww + 16)
    const gl = g.createLinearGradient(wx, wy, wx + ww, wy + ww)
    gl.addColorStop(0, '#2d4457')
    gl.addColorStop(0.5, '#6b8798')
    gl.addColorStop(1, '#233644')
    g.fillStyle = gl
    g.fillRect(wx, wy, ww, ww)
    g.strokeStyle = '#1c1c1c'
    g.lineWidth = 6
    g.strokeRect(wx, wy, ww, ww)
    g.beginPath()
    g.moveTo(wx + ww / 2, wy)
    g.lineTo(wx + ww / 2, wy + ww)
    g.moveTo(wx, wy + ww * 0.62)
    g.lineTo(wx + ww, wy + ww * 0.62)
    g.stroke()
    L.g.fillStyle = '#ffc77d'
    L.g.fillRect(wx, wy, ww, ww)
    L.g.strokeStyle = '#000'
    L.g.lineWidth = 7
    L.g.beginPath()
    L.g.moveTo(wx + ww / 2, wy)
    L.g.lineTo(wx + ww / 2, wy + ww)
    L.g.moveTo(wx, wy + ww * 0.62)
    L.g.lineTo(wx + ww, wy + ww * 0.62)
    L.g.stroke()
    const m = new THREE.MeshStandardMaterial({ map: toTex(A.c), bumpMap: toTex(B.c, false), roughness: 0.75, emissive: new THREE.Color('#fff'), emissiveMap: toTex(L.c) })
    m.map!.wrapS = m.map!.wrapT = THREE.ClampToEdgeWrapping
    m.emissiveMap!.wrapS = m.emissiveMap!.wrapT = THREE.ClampToEdgeWrapping
    registerGlow(m, 1.5)
    return m
  })
}

/** Curtain-wall glass tile for skyscrapers (repeat bay). */
export function curtainMat(tint = '#4c6f86') {
  return memo('curtain' + tint, () => {
    const S = 128
    const A = mkCanvas(S, S)
    const L = mkCanvas(S, S)
    const g = A.g
    const gr = g.createLinearGradient(0, 0, S, S)
    gr.addColorStop(0, tint)
    gr.addColorStop(1, '#1c2c38')
    g.fillStyle = gr
    g.fillRect(0, 0, S, S)
    g.fillStyle = '#c4ccd2'
    g.fillRect(0, 0, S, 4)
    g.fillRect(0, 0, 4, S)
    L.g.fillStyle = '#000'
    L.g.fillRect(0, 0, S, S)
    L.g.fillStyle = '#ffd9a0'
    L.g.fillRect(6, 6, S - 8, S - 8)
    const m = new THREE.MeshStandardMaterial({ map: toTex(A.c), roughness: 0.18, metalness: 0.6, emissive: new THREE.Color('#fff'), emissiveMap: toTex(L.c), envMapIntensity: 1.4 })
    m.userData.tile = [0.7, 0.7]
    registerGlow(m, 0.8)
    return m
  })
}

/* ---------------- water ---------------- */
let waterNormal: THREE.Texture | null = null
export function getWaterNormal() {
  if (waterNormal) return waterNormal
  const S = 256
  const { c, g } = mkCanvas(S, S)
  const img = g.createImageData(S, S)
  const r = rng(99)
  const waves = Array.from({ length: 9 }, () => ({ fx: ((r() * 6) | 0) + 1, fy: ((r() * 6) | 0) + 1, a: 0.3 + r() * 0.7, p: r() * TAU }))
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let dx = 0
      let dy = 0
      for (const w of waves) {
        const ph = TAU * ((w.fx * x) / S + (w.fy * y) / S) + w.p
        const d = Math.cos(ph) * w.a
        dx += d * w.fx
        dy += d * w.fy
      }
      const k = 0.07
      const nx = -dx * k
      const ny = -dy * k
      const l = Math.hypot(nx, ny, 1)
      const i = (y * S + x) * 4
      img.data[i] = ((nx / l) * 0.5 + 0.5) * 255
      img.data[i + 1] = ((ny / l) * 0.5 + 0.5) * 255
      img.data[i + 2] = ((1 / l) * 0.5 + 0.5) * 255
      img.data[i + 3] = 255
    }
  }
  g.putImageData(img, 0, 0)
  waterNormal = toTex(c, false)
  return waterNormal
}
export const waterMat = (color = '#2c5a68', normalScale = 0.7) =>
  memo('water' + color + normalScale, () => {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.06, metalness: 0.15, normalMap: getWaterNormal(), normalScale: new THREE.Vector2(normalScale, normalScale), envMapIntensity: 1.6 })
    return m
  })
export function updateWater(t: number) {
  if (waterNormal) waterNormal.offset.set(t * 0.012, t * 0.007)
}
function scaleUVAll(geo: THREE.BufferGeometry, su: number, sv: number) {
  const uv = geo.attributes.uv
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv)
}
export function waterRect(g: THREE.Object3D, x0: number, z0: number, x1: number, z1: number, y: number, m: Mat = waterMat()) {
  const geo = new THREE.PlaneGeometry(x1 - x0, z1 - z0)
  scaleUVAll(geo, (x1 - x0) / 5, (z1 - z0) / 5)
  geo.rotateX(-Math.PI / 2)
  const mesh = new THREE.Mesh(geo, m)
  mesh.position.set((x0 + x1) / 2, y, (z0 + z1) / 2)
  mesh.receiveShadow = true
  g.add(mesh)
  return mesh
}
/** pts are (x, z) stored in Vector2(x, y=z) */
export function waterPoly(g: THREE.Object3D, pts: THREE.Vector2[], y: number, m: Mat = waterMat()) {
  const shape = new THREE.Shape(pts.map((p) => new THREE.Vector2(p.x, -p.y)))
  const geo = new THREE.ShapeGeometry(shape)
  scaleUVAll(geo, 1 / 5, 1 / 5)
  geo.rotateX(-Math.PI / 2)
  const mesh = new THREE.Mesh(geo, m)
  mesh.position.y = y
  mesh.receiveShadow = true
  g.add(mesh)
  return mesh
}

/* ---------------- geometry helpers ---------------- */
function fitUV(geo: THREE.BufferGeometry, dims: number[][], mats: Mat | Mat[]) {
  const uv = geo.attributes.uv
  for (let f = 0; f < 6; f++) {
    const m = Array.isArray(mats) ? mats[f] : mats
    const t = m.userData.tile as [number, number] | undefined
    if (!t) continue
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i
      uv.setXY(k, (uv.getX(k) * dims[f][0]) / t[0], (uv.getY(k) * dims[f][1]) / t[1])
    }
  }
}
function shadow<T extends THREE.Mesh>(m: T, cast = true) {
  m.castShadow = cast
  m.receiveShadow = true
  return m
}

/** y is the BOTTOM of the box. */
export function box(g: THREE.Object3D, w: number, h: number, d: number, m: Mat | Mat[], x = 0, y = 0, z = 0) {
  const geo = new THREE.BoxGeometry(w, h, d)
  fitUV(geo, [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]], m)
  const mesh = shadow(new THREE.Mesh(geo, m))
  mesh.position.set(x, y + h / 2, z)
  g.add(mesh)
  return mesh
}

export function cyl(g: THREE.Object3D, rt: number, rb: number, h: number, m: Mat, x = 0, y = 0, z = 0, seg = 24, open = false) {
  const geo = new THREE.CylinderGeometry(rt, rb, h, seg, 1, open)
  const t = m.userData.tile as [number, number] | undefined
  if (t) scaleUVAll(geo, (TAU * (rt + rb)) / 2 / t[0], Math.hypot(h, rb - rt) / t[1])
  const mesh = shadow(new THREE.Mesh(geo, m))
  mesh.position.set(x, y + h / 2, z)
  g.add(mesh)
  return mesh
}

const UP = new THREE.Vector3(0, 1, 0)
export function beam(g: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3, w: number, d: number, m: Mat) {
  const L = a.distanceTo(b)
  const geo = new THREE.BoxGeometry(w, L, d)
  const t = m.userData.tile as [number, number] | undefined
  if (t) scaleUVAll(geo, w / t[0], L / t[1])
  const mesh = shadow(new THREE.Mesh(geo, m))
  mesh.position.copy(a).add(b).multiplyScalar(0.5)
  mesh.quaternion.setFromUnitVectors(UP, b.clone().sub(a).normalize())
  g.add(mesh)
  return mesh
}
export function tube(g: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3, r: number, m: Mat, seg = 6) {
  const L = a.distanceTo(b)
  const geo = new THREE.CylinderGeometry(r, r, L, seg, 1)
  const mesh = shadow(new THREE.Mesh(geo, m))
  mesh.position.copy(a).add(b).multiplyScalar(0.5)
  mesh.quaternion.setFromUnitVectors(UP, b.clone().sub(a).normalize())
  g.add(mesh)
  return mesh
}
export function sphere(g: THREE.Object3D, r: number, m: Mat, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, seg = 16) {
  const mesh = shadow(new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.max(6, seg / 2)), m))
  mesh.position.set(x, y, z)
  mesh.scale.set(sx, sy, sz)
  g.add(mesh)
  return mesh
}

function polyGeo(faces: { p: THREE.Vector3[]; uv: number[][] }[], center: THREE.Vector3, tile: [number, number]) {
  const pos: number[] = []
  const uvs: number[] = []
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const c = new THREE.Vector3()
  for (const f of faces) {
    for (let i = 1; i < f.p.length - 1; i++) {
      let ia = 0
      let ib = i
      let ic = i + 1
      a.copy(f.p[ia])
      b.copy(f.p[ib])
      c.copy(f.p[ic])
      const n = b.clone().sub(a).cross(c.clone().sub(a))
      if (n.length() < 1e-7) continue
      const cen = a.clone().add(b).add(c).divideScalar(3)
      if (n.dot(cen.sub(center)) < 0) {
        const t = ib
        ib = ic
        ic = t
      }
      for (const k of [ia, ib, ic]) {
        pos.push(f.p[k].x, f.p[k].y, f.p[k].z)
        uvs.push(f.uv[k][0] / tile[0], f.uv[k][1] / tile[1])
      }
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geo.computeVertexNormals()
  return geo
}

/** Hip roof (pyramid when w==d). Eaves at y, ridge along z. */
export function roofHip(g: THREE.Object3D, w: number, d: number, h: number, m: Mat, x = 0, y = 0, z = 0) {
  const hw = w / 2
  const hd = d / 2
  const rh = Math.max(hd - hw, 0)
  const sl = Math.hypot(hw, h)
  const P = (a: number, b: number, c: number) => v3(a, b, c)
  const faces = [
    { p: [P(-hw, 0, hd), P(hw, 0, hd), P(0, h, rh)], uv: [[0, 0], [w, 0], [hw, sl]] },
    { p: [P(hw, 0, -hd), P(-hw, 0, -hd), P(0, h, -rh)], uv: [[0, 0], [w, 0], [hw, sl]] },
    { p: [P(hw, 0, hd), P(hw, 0, -hd), P(0, h, -rh), P(0, h, rh)], uv: [[0, 0], [d, 0], [d - hw, sl], [hw, sl]] },
    { p: [P(-hw, 0, -hd), P(-hw, 0, hd), P(0, h, rh), P(0, h, -rh)], uv: [[0, 0], [d, 0], [d - hw, sl], [hw, sl]] },
    { p: [P(-hw, 0, hd), P(-hw, 0, -hd), P(hw, 0, -hd), P(hw, 0, hd)], uv: [[0, 0], [0, d], [w, d], [w, 0]] },
  ]
  const geo = polyGeo(faces, v3(0, h * 0.3, 0), (m.userData.tile as [number, number]) ?? [1, 1])
  const mesh = shadow(new THREE.Mesh(geo, m))
  mesh.position.set(x, y, z)
  g.add(mesh)
  return mesh
}

/** Gable roof, ridge along z, eaves at y. */
export function roofGable(g: THREE.Object3D, w: number, d: number, h: number, m: Mat, x = 0, y = 0, z = 0, gableMat?: Mat) {
  const hw = w / 2
  const hd = d / 2
  const sl = Math.hypot(hw, h)
  const P = (a: number, b: number, c: number) => v3(a, b, c)
  const tile = (m.userData.tile as [number, number]) ?? [1, 1]
  const slopes = [
    { p: [P(-hw, 0, hd), P(0, h, hd), P(0, h, -hd), P(-hw, 0, -hd)], uv: [[0, 0], [0, sl], [d, sl], [d, 0]] },
    { p: [P(hw, 0, hd), P(hw, 0, -hd), P(0, h, -hd), P(0, h, hd)], uv: [[0, 0], [d, 0], [d, sl], [0, sl]] },
    { p: [P(-hw, 0, hd), P(-hw, 0, -hd), P(hw, 0, -hd), P(hw, 0, hd)], uv: [[0, 0], [0, d], [w, d], [w, 0]] },
  ]
  const mesh = shadow(new THREE.Mesh(polyGeo(slopes, v3(0, h * 0.3, 0), tile), m))
  mesh.position.set(x, y, z)
  g.add(mesh)
  if (gableMat) {
    const gt = (gableMat.userData.tile as [number, number]) ?? [1, 1]
    const ends = [
      { p: [P(-hw, 0, hd), P(hw, 0, hd), P(0, h, hd)], uv: [[0, 0], [w, 0], [hw, h]] },
      { p: [P(-hw, 0, -hd), P(hw, 0, -hd), P(0, h, -hd)], uv: [[0, 0], [w, 0], [hw, h]] },
    ]
    const em = shadow(new THREE.Mesh(polyGeo(ends, v3(0, h * 0.3, 0), gt), gableMat))
    em.position.set(x, y, z)
    g.add(em)
  }
  return mesh
}

export function extrudeUV(geo: THREE.BufferGeometry, capTile: [number, number], sideTile: [number, number], o: [number, number, number] = [0, 0, 0]) {
  const pos = geo.attributes.position
  const nor = geo.attributes.normal
  const uv = geo.attributes.uv
  const mi = new Uint8Array(pos.count)
  for (const gr of geo.groups) for (let i = gr.start; i < gr.start + gr.count; i++) mi[i] = gr.materialIndex ?? 0
  for (let i = 0; i < pos.count; i++) {
    const t = mi[i] === 0 ? capTile : sideTile
    const ax = Math.abs(nor.getX(i))
    const ay = Math.abs(nor.getY(i))
    const az = Math.abs(nor.getZ(i))
    const x = pos.getX(i) - o[0]
    const y = pos.getY(i) - o[1]
    const z = pos.getZ(i) - o[2]
    if (az >= ax && az >= ay) uv.setXY(i, x / t[0], y / t[1])
    else if (ax >= ay) uv.setXY(i, z / t[0], y / t[1])
    else uv.setXY(i, x / t[0], z / t[1])
  }
}

/** Extrude a 2D shape (shape-plane XY, extrusion along +Z). mats = [caps, sides]. */
export function extrude(g: THREE.Object3D, shape: THREE.Shape, depth: number, mats: [Mat, Mat], x = 0, y = 0, z = 0, origin: [number, number, number] = [0, 0, 0], capTile?: [number, number]) {
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 16 })
  const ct = capTile ?? ((mats[0].userData.tile as [number, number]) ?? [1, 1])
  const st = (mats[1].userData.tile as [number, number]) ?? [1, 1]
  extrudeUV(geo, ct, st, origin)
  const mesh = shadow(new THREE.Mesh(geo, mats))
  mesh.position.set(x, y, z)
  g.add(mesh)
  return mesh
}

/* ground slab: top at y=0, extends down `thick`. Holes are polygons in (x,z). */
export function discPoly(cx: number, cz: number, r: number, n = 64) {
  return Array.from({ length: n }, (_, i) => new THREE.Vector2(cx + Math.cos((i / n) * TAU) * r, cz + Math.sin((i / n) * TAU) * r))
}
export function rectPoly(x0: number, z0: number, x1: number, z1: number) {
  return [new THREE.Vector2(x0, z0), new THREE.Vector2(x1, z0), new THREE.Vector2(x1, z1), new THREE.Vector2(x0, z1)]
}
function clipHalf(pts: THREE.Vector2[], f: (p: THREE.Vector2) => number) {
  const out: THREE.Vector2[] = []
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    const da = f(a)
    const db = f(b)
    if (da >= 0) out.push(a)
    if (da >= 0 !== db >= 0) out.push(a.clone().lerp(b, da / (da - db)))
  }
  return out
}
/** disc of radius R clipped to z0 <= z <= z1 */
export function discBand(R: number, z0: number, z1: number) {
  let p = discPoly(0, 0, R, 120)
  p = clipHalf(p, (q) => q.y - z0)
  p = clipHalf(p, (q) => z1 - q.y)
  return p
}

export function groundSlab(g: THREE.Object3D, R: number, top: Mat, side: Mat, holes: THREE.Vector2[][] = [], thick = 0.5) {
  const shape = new THREE.Shape()
  shape.absarc(0, 0, R, 0, TAU, false)
  for (const h of holes) shape.holes.push(new THREE.Path(h.map((p) => new THREE.Vector2(p.x, -p.y))))
  const geo = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false, curveSegments: 96 })
  extrudeUV(geo, (top.userData.tile as [number, number]) ?? [1, 1], (side.userData.tile as [number, number]) ?? [1, 1])
  geo.rotateX(-Math.PI / 2)
  geo.translate(0, -thick, 0)
  const mesh = new THREE.Mesh(geo, [top, side])
  mesh.receiveShadow = true
  mesh.castShadow = true
  g.add(mesh)
  if (holes.length) {
    const fl = new THREE.Mesh(new THREE.CircleGeometry(R, 48), colorMat('#1d3a42', 1))
    fl.rotation.x = -Math.PI / 2
    fl.position.y = -thick + 0.02
    g.add(fl)
  }
  return mesh
}

/* ---------------- trees ---------------- */
export function tree(g: THREE.Object3D, x: number, z: number, h: number, kind: 'round' | 'poplar' | 'willow' | 'blossom' | 'pine' = 'round', seed = 1, y = 0) {
  const r = rng(seed * 977 + Math.floor(x * 13 + z * 7))
  const trunkM = colorMat('#5a4632', 1)
  const cols: Record<string, string[]> = {
    round: ['#4f7f3a', '#5f8f43', '#44722f'],
    poplar: ['#5c8a38', '#4b7a31'],
    willow: ['#7d9c4a', '#8aa95a', '#6f8e3e'],
    blossom: ['#f0a8c3', '#f6bfd2', '#e993b4'],
    pine: ['#2f5a3a', '#376a42'],
  }
  const tr = new THREE.Group()
  tr.position.set(x, y, z)
  const th = h * (kind === 'poplar' ? 0.25 : 0.42)
  cyl(tr, h * 0.025, h * 0.04, th, trunkM, 0, 0, 0, 6)
  const blob = (rad: number, bx: number, by: number, bz: number, sy = 1) => {
    const geo = new THREE.IcosahedronGeometry(rad, 1)
    const p = geo.attributes.position
    for (let i = 0; i < p.count; i++) {
      const X = p.getX(i)
      const Y = p.getY(i)
      const Z = p.getZ(i)
      const d = 1 + 0.16 * Math.sin(X * 7.1 + Y * 5.3 + Z * 9.7 + seed)
      p.setXYZ(i, X * d, Y * d * sy, Z * d)
    }
    geo.computeVertexNormals()
    const m = leafMat(cols[kind][(r() * cols[kind].length) | 0])
    const mesh = shadow(new THREE.Mesh(geo, m))
    mesh.position.set(bx, by, bz)
    tr.add(mesh)
  }
  if (kind === 'poplar') {
    blob(h * 0.16, 0, th + h * 0.34, 0, 2.5)
    blob(h * 0.12, 0, th + h * 0.15, 0, 2)
  } else if (kind === 'pine') {
    for (let i = 0; i < 4; i++) {
      const rad = h * (0.26 - i * 0.05)
      const cone = shadow(new THREE.Mesh(new THREE.ConeGeometry(rad, h * 0.3, 8), leafMat(cols.pine[i % 2])))
      cone.position.y = th * 0.6 + h * 0.22 + i * h * 0.17
      tr.add(cone)
    }
  } else {
    const n = kind === 'willow' ? 6 : 5
    const R = h * (kind === 'willow' ? 0.26 : 0.24)
    blob(R, 0, th + R * 0.9, 0, kind === 'willow' ? 0.85 : 1)
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + r()
      blob(R * (0.6 + r() * 0.2), Math.cos(a) * R * 0.75, th + R * (0.5 + r() * 0.8), Math.sin(a) * R * 0.75)
    }
  }
  g.add(tr)
  return tr
}

/* ---------------- baking ---------------- */
export function bake(root: THREE.Object3D) {
  root.updateMatrixWorld(true)
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert()
  const buckets = new Map<Mat, THREE.BufferGeometry[]>()
  const remove: THREE.Mesh[] = []
  root.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh || Array.isArray(m.material) || (m as any).isInstancedMesh || o.userData.noBake) return
    let geo = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()
    geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld))
    for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k)
    if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2))
    if (!geo.attributes.normal) geo.computeVertexNormals()
    geo.clearGroups()
    const list = buckets.get(m.material) ?? []
    list.push(geo)
    buckets.set(m.material, list)
    remove.push(m)
  })
  for (const m of remove) m.parent?.remove(m)
  for (const [mat, list] of buckets) {
    const merged = mergeGeometries(list, false)
    if (!merged) continue
    const mesh = new THREE.Mesh(merged, mat)
    mesh.castShadow = !(mat as any).transparent
    mesh.receiveShadow = true
    root.add(mesh)
    list.forEach((g) => g.dispose())
  }
  return root
}

export function newGroup(x = 0, y = 0, z = 0) {
  const g = new THREE.Group()
  g.position.set(x, y, z)
  return g
}

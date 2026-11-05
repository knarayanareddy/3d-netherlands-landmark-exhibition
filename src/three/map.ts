import * as THREE from 'three'
import { rng } from './kit'

/** Equirectangular-ish projection: 1 world unit ≈ 2 km. */
export const KX = 34
export const KZ = 55.5
export const project = (lon: number, lat: number): [number, number] => [(lon - 5.4) * KX, (52.2 - lat) * KZ]

export const MAP_BOUNDS = { minX: -78, maxX: 72, minZ: -78, maxZ: 90 }
const BW = MAP_BOUNDS.maxX - MAP_BOUNDS.minX
const BH = MAP_BOUNDS.maxZ - MAP_BOUNDS.minZ

type LL = [number, number]
export const NL_OUTLINE: LL[] = [
  [4.76, 52.97], [4.7, 52.82], [4.64, 52.62], [4.58, 52.46], [4.52, 52.32], [4.4, 52.14], [4.3, 52.08], [4.12, 51.98], [4.0, 51.93], [3.9, 51.86],
  [3.84, 51.79], [3.7, 51.72], [3.56, 51.74], [3.46, 51.64], [3.43, 51.53], [3.58, 51.44], [3.45, 51.38], [3.38, 51.36], [3.6, 51.29], [3.86, 51.22],
  [4.05, 51.26], [4.24, 51.37], [4.38, 51.42], [4.48, 51.45], [4.64, 51.42], [4.78, 51.49], [4.93, 51.44], [5.05, 51.4], [5.12, 51.31], [5.25, 51.3],
  [5.45, 51.29], [5.6, 51.24], [5.75, 51.18], [5.85, 51.06], [5.82, 50.97], [5.74, 50.91], [5.7, 50.78], [5.68, 50.76], [5.8, 50.73], [6.02, 50.75],
  [6.08, 50.88], [6.03, 51.0], [6.08, 51.17], [6.18, 51.33], [6.12, 51.46], [6.04, 51.58], [5.96, 51.72], [6.04, 51.86], [6.2, 51.87], [6.4, 51.84],
  [6.58, 51.86], [6.74, 51.93], [6.98, 51.97], [7.04, 52.2], [7.07, 52.37], [7.04, 52.5], [7.06, 52.64], [7.2, 52.82], [7.06, 53.0], [7.19, 53.2],
  [7.21, 53.24], [7.0, 53.3], [6.92, 53.34], [6.82, 53.45], [6.5, 53.4], [6.2, 53.41], [5.9, 53.36], [5.6, 53.28], [5.42, 53.18], [5.38, 53.07],
  [5.04, 52.93],
]
export const ISLANDS: LL[][] = [
  [[4.7, 53.2], [4.78, 53.18], [4.9, 53.05], [4.85, 53.0], [4.74, 53.03], [4.69, 53.1]], // Texel
  [[4.93, 53.28], [5.15, 53.26], [5.2, 53.3], [4.97, 53.31]], // Vlieland
  [[5.1, 53.38], [5.4, 53.33], [5.5, 53.37], [5.2, 53.43]], // Terschelling
  [[5.55, 53.43], [5.9, 53.41], [5.95, 53.46], [5.6, 53.48]], // Ameland
  [[6.05, 53.47], [6.25, 53.46], [6.28, 53.5], [6.08, 53.5]], // Schiermonnikoog
]
export const LAKES: LL[][] = [
  [[5.04, 52.94], [5.38, 53.07], [5.42, 52.97], [5.36, 52.88], [5.7, 52.84], [5.6, 52.66], [5.45, 52.53], [5.28, 52.71], [5.1, 52.76]], // IJsselmeer
  [[5.1, 52.62], [5.28, 52.69], [5.44, 52.52], [5.3, 52.4], [5.15, 52.35], [5.0, 52.37], [5.04, 52.5]], // Markermeer
]
const RIVERS: LL[][] = [
  [[6.1, 51.84], [5.85, 51.85], [5.55, 51.82], [5.2, 51.83], [4.9, 51.8], [4.6, 51.83], [4.42, 51.9], [4.2, 51.93], [4.07, 51.98]],
  [[5.69, 50.85], [5.85, 51.1], [6.02, 51.3], [6.12, 51.5], [5.85, 51.77], [5.55, 51.82]],
  [[6.0, 51.95], [6.1, 52.2], [6.0, 52.4], [5.92, 52.55]],
  [[5.9, 51.97], [5.3, 51.97], [4.9, 51.96], [4.5, 51.92]],
]
const CITIES: [string, number, number, boolean?][] = [
  ['Amsterdam', 4.9, 52.37, true], ['Rotterdam', 4.48, 51.92, true], ['Den Haag', 4.3, 52.08], ['Utrecht', 5.12, 52.09, true], ['Eindhoven', 5.47, 51.44, true],
  ['Groningen', 6.57, 53.22, true], ['Maastricht', 5.69, 50.85], ['Arnhem', 5.9, 51.98], ['Zwolle', 6.09, 52.51], ['Leeuwarden', 5.8, 53.2],
  ['Breda', 4.78, 51.59], ['Enschede', 6.89, 52.22], ['Haarlem', 4.65, 52.38], ['Middelburg', 3.61, 51.5], ['Nijmegen', 5.85, 51.84], ['Alkmaar', 4.75, 52.63],
]

export const toXZ = (pts: LL[]) => pts.map(([lo, la]) => project(lo, la))

export function pointInPoly(x: number, z: number, poly: [number, number][]) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i]
    const [xj, zj] = poly[j]
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside
  }
  return inside
}
const OUT_XZ = toXZ(NL_OUTLINE)
export const inLand = (x: number, z: number) => pointInPoly(x, z, OUT_XZ)

const px = (x: number, W: number) => ((x - MAP_BOUNDS.minX) / BW) * W
const pz = (z: number, H: number) => ((z - MAP_BOUNDS.minZ) / BH) * H

function trace(g: CanvasRenderingContext2D, pts: LL[], W: number, H: number, close = true) {
  g.beginPath()
  pts.forEach(([lo, la], i) => {
    const [x, z] = project(lo, la)
    if (i === 0) g.moveTo(px(x, W), pz(z, H))
    else g.lineTo(px(x, W), pz(z, H))
  })
  if (close) g.closePath()
}

export function mapSize(width: number) {
  return { W: width, H: Math.round((width * BH) / BW) }
}

/** mode 'floor': texture painted on the exhibition floor. mode 'mini': UI minimap (includes sea). */
export function drawMap(g: CanvasRenderingContext2D, W: number, H: number, mode: 'floor' | 'mini') {
  const mini = mode === 'mini'
  const s = W / 2048
  if (mini) {
    g.fillStyle = '#0d2330'
    g.fillRect(0, 0, W, H)
    // soft graticule on sea
    g.strokeStyle = 'rgba(120,180,210,0.07)'
    g.lineWidth = 1
    for (let i = 0; i < 12; i++) {
      g.beginPath()
      g.moveTo((i * W) / 12, 0)
      g.lineTo((i * W) / 12, H)
      g.stroke()
      g.beginPath()
      g.moveTo(0, (i * H) / 12)
      g.lineTo(W, (i * H) / 12)
      g.stroke()
    }
  }
  // land
  g.save()
  trace(g, NL_OUTLINE, W, H)
  if (mini) {
    const gr = g.createLinearGradient(0, 0, W, H)
    gr.addColorStop(0, '#6f8a62')
    gr.addColorStop(1, '#8fa070')
    g.fillStyle = gr
    g.fill()
  } else {
    g.clip()
    const base = g.createLinearGradient(0, 0, W, H)
    base.addColorStop(0, '#cdd6b4')
    base.addColorStop(0.5, '#d8d9bb')
    base.addColorStop(1, '#c6d0ac')
    g.fillStyle = base
    g.fillRect(0, 0, W, H)
    // paper fibres
    const r = rng(4)
    for (let i = 0; i < 26000; i++) {
      g.globalAlpha = 0.05 + r() * 0.07
      g.fillStyle = r() > 0.5 ? '#ffffff' : '#7a8460'
      g.fillRect(r() * W, r() * H, 1 + r() * 3 * s, 1 + r() * 3 * s)
    }
    g.globalAlpha = 1
    // graticule
    g.strokeStyle = 'rgba(70,95,80,0.18)'
    g.lineWidth = 2 * s
    for (let lon = 3; lon <= 7.5; lon += 0.5) {
      g.beginPath()
      const a = project(lon, 53.7)
      const b = project(lon, 50.6)
      g.moveTo(px(a[0], W), pz(a[1], H))
      g.lineTo(px(b[0], W), pz(b[1], H))
      g.stroke()
    }
    for (let lat = 50.5; lat <= 53.7; lat += 0.5) {
      g.beginPath()
      const a = project(3, lat)
      const b = project(7.5, lat)
      g.moveTo(px(a[0], W), pz(a[1], H))
      g.lineTo(px(b[0], W), pz(b[1], H))
      g.stroke()
    }
  }
  g.restore()
  // rivers
  g.strokeStyle = mini ? 'rgba(120,190,225,0.8)' : 'rgba(86,150,185,0.9)'
  g.lineWidth = (mini ? 1.2 : 5) * (mini ? 1 : s)
  g.lineJoin = 'round'
  for (const rv of RIVERS) {
    trace(g, rv, W, H, false)
    g.stroke()
  }
  // islands
  for (const isl of ISLANDS) {
    trace(g, isl, W, H)
    g.fillStyle = mini ? '#7b9570' : '#d4d8b8'
    g.fill()
  }
  // lakes
  for (const lk of LAKES) {
    trace(g, lk, W, H)
    g.fillStyle = mini ? '#2b5f7c' : '#3a7c98'
    g.fill()
  }
  // coastline
  g.strokeStyle = mini ? 'rgba(220,235,210,0.9)' : '#33463c'
  g.lineWidth = (mini ? 1.2 : 7) * (mini ? 1 : s)
  trace(g, NL_OUTLINE, W, H)
  g.stroke()
  for (const isl of ISLANDS) {
    trace(g, isl, W, H)
    g.stroke()
  }
  // cities
  for (const [name, lo, la, big] of CITIES) {
    const [x, z] = project(lo, la)
    const X = px(x, W)
    const Y = pz(z, H)
    g.fillStyle = mini ? '#f1e8c9' : '#2a3b34'
    g.beginPath()
    g.arc(X, Y, (mini ? (big ? 2 : 1.3) : big ? 11 : 7) * (mini ? 1 : s), 0, Math.PI * 2)
    g.fill()
    if (!mini) {
      g.font = `${big ? 700 : 600} ${big ? 40 : 30}px Georgia, serif`
      g.textBaseline = 'middle'
      g.fillStyle = 'rgba(247,246,236,0.9)'
      g.strokeStyle = 'rgba(247,246,236,0.9)'
      g.lineWidth = 8
      const left = ['Haarlem', 'Den Haag', 'Groningen', 'Enschede', 'Alkmaar', 'Middelburg'].includes(name)
      g.textAlign = left ? 'right' : 'left'
      const lx = left ? X - 22 : X + 22
      g.strokeText(name.toUpperCase(), lx, Y)
      g.fillStyle = '#2a3b34'
      g.fillText(name.toUpperCase(), lx, Y)
      g.textAlign = 'left'
    }
  }
  if (!mini) {
    g.font = 'italic 700 64px Georgia, serif'
    g.fillStyle = 'rgba(51,70,60,0.35)'
    g.save()
    const [tx, tz] = project(6.3, 52.9)
    g.translate(px(tx, W), pz(tz, H))
    g.rotate(-0.12)
    g.fillText('NEDERLAND', 0, 0)
    g.restore()
  }
}

export function makeMapTexture(width = 2048) {
  const { W, H } = mapSize(width)
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')!
  drawMap(g, W, H, 'floor')
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 16
  return t
}

export function worldToMini(x: number, z: number) {
  return [(x - MAP_BOUNDS.minX) / BW, (z - MAP_BOUNDS.minZ) / BH] as [number, number]
}
export function miniToWorld(u: number, v: number) {
  return [MAP_BOUNDS.minX + u * BW, MAP_BOUNDS.minZ + v * BH] as [number, number]
}

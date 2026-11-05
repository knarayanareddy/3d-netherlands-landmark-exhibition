import * as THREE from 'three'
import asphaltD from '../assets/tex/asphalt_02_diff.jpg'
import asphaltN from '../assets/tex/asphalt_02_nor_gl.jpg'
import asphaltR from '../assets/tex/asphalt_02_rough.jpg'
import floorD from '../assets/tex/concrete_floor_worn_001_diff.jpg'
import floorN from '../assets/tex/concrete_floor_worn_001_nor_gl.jpg'
import paversD from '../assets/tex/concrete_pavers_02_diff.jpg'
import paversN from '../assets/tex/concrete_pavers_02_nor_gl.jpg'
import slabD from '../assets/tex/concrete_slab_wall_diff.jpg'
import slabN from '../assets/tex/concrete_slab_wall_nor_gl.jpg'
import waterN from '../assets/tex/waternormals.jpg'
import { rng } from './geo'

export type Facade = 'glassTeal' | 'glassSteel' | 'grid' | 'brick' | 'white'

export interface Mats {
  asphalt: THREE.MeshStandardMaterial
  asphaltRed: THREE.MeshStandardMaterial
  tramSlab: THREE.MeshStandardMaterial
  pavers: THREE.MeshStandardMaterial
  paversBridge: THREE.MeshStandardMaterial
  concrete: THREE.MeshStandardMaterial
  concreteDark: THREE.MeshStandardMaterial
  steel: THREE.MeshPhysicalMaterial
  deckSteel: THREE.MeshPhysicalMaterial
  underside: THREE.MeshStandardMaterial
  cable: THREE.MeshStandardMaterial
  backstay: THREE.MeshStandardMaterial
  glassDark: THREE.MeshPhysicalMaterial
  rail: THREE.MeshStandardMaterial
  lampMetal: THREE.MeshStandardMaterial
  lampLens: THREE.MeshStandardMaterial
  kerb: THREE.MeshStandardMaterial
  white: THREE.MeshStandardMaterial
  lineWhite: THREE.MeshStandardMaterial
  lineDash: THREE.MeshStandardMaterial
  rails: THREE.MeshStandardMaterial
  groundFar: THREE.MeshStandardMaterial
  roof: THREE.MeshStandardMaterial
  facade: Record<Facade, THREE.MeshStandardMaterial>
  waterNormals: THREE.Texture
  beacon: THREE.MeshBasicMaterial
  /** every material that has a night-time emissive component */
  glow: { m: THREE.MeshStandardMaterial | THREE.MeshBasicMaterial; k: number; basic?: boolean }[]
  setNight(n: number): void
}

const loader = new THREE.TextureLoader()

function canvas(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return { c, g: c.getContext('2d')! }
}

export async function createMaterials(renderer: THREE.WebGLRenderer): Promise<Mats> {
  const aniso = Math.min(16, renderer.capabilities.getMaxAnisotropy())
  const load = async (url: string, srgb: boolean) => {
    const t = await loader.loadAsync(url)
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.anisotropy = aniso
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
    return t
  }
  const [aD, aN, aR, fD, fN, pD, pN, sD, sN, wN] = await Promise.all([
    load(asphaltD, true), load(asphaltN, false), load(asphaltR, false), load(floorD, true), load(floorN, false),
    load(paversD, true), load(paversN, false), load(slabD, true), load(slabN, false), load(waterN, false),
  ])

  const glow: Mats['glow'] = []

  // ----- surfaces ---------------------------------------------------------
  const asphalt = new THREE.MeshStandardMaterial({ map: aD, normalMap: aN, roughnessMap: aR, roughness: 1, color: new THREE.Color(0.95, 0.95, 0.97), normalScale: new THREE.Vector2(0.9, 0.9) })
  const asphaltRed = new THREE.MeshStandardMaterial({ map: aD, normalMap: aN, roughnessMap: aR, roughness: 1, color: new THREE.Color(2.55, 1.0, 0.82), normalScale: new THREE.Vector2(0.7, 0.7) })
  const tramSlab = new THREE.MeshStandardMaterial({ map: fD, normalMap: fN, roughness: 0.85, color: new THREE.Color(1.5, 1.5, 1.5) })
  const pavers = new THREE.MeshStandardMaterial({ map: pD, normalMap: pN, roughness: 0.9, color: new THREE.Color(1.1, 1.0, 0.96) })
  const paversBridge = new THREE.MeshStandardMaterial({ map: pD, normalMap: pN, roughness: 0.85, color: new THREE.Color(0.95, 1.0, 1.08) })
  const concrete = new THREE.MeshStandardMaterial({ map: sD, normalMap: sN, roughness: 0.88, color: new THREE.Color(1.05, 1.05, 1.03) })
  const concreteDark = new THREE.MeshStandardMaterial({ map: sD, normalMap: sN, roughness: 0.95, color: new THREE.Color(0.55, 0.57, 0.56) })

  // ----- painted steel with panel seams ------------------------------------
  const bump = (() => {
    const { c, g } = canvas(512, 512)
    g.fillStyle = '#808080'
    g.fillRect(0, 0, 512, 512)
    const r = rng(7)
    for (let i = 0; i < 9000; i++) {
      const v = 120 + r() * 16
      g.fillStyle = `rgb(${v},${v},${v})`
      g.fillRect(r() * 512, r() * 512, 2, 2)
    }
    g.fillStyle = '#4a4a4a'
    for (let i = 0; i < 4; i++) {
      g.fillRect(i * 128 - 1.5, 0, 3, 512)
      g.fillRect(0, i * 128 - 1.5, 512, 3)
    }
    g.fillStyle = '#9a9a9a'
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) for (const [dx, dy] of [[10, 10], [118, 10], [10, 118], [118, 118]]) {
      g.beginPath()
      g.arc(i * 128 + dx, j * 128 + dy, 2, 0, 7)
      g.fill()
    }
    const t = new THREE.CanvasTexture(c)
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.anisotropy = aniso
    return t
  })()
  const steel = new THREE.MeshPhysicalMaterial({ color: '#e6ecef', roughness: 0.42, metalness: 0.0, clearcoat: 0.55, clearcoatRoughness: 0.28, bumpMap: bump, bumpScale: 0.35, envMapIntensity: 1 })
  const deckSteel = new THREE.MeshPhysicalMaterial({ color: '#d4dde2', roughness: 0.45, metalness: 0.0, clearcoat: 0.45, clearcoatRoughness: 0.3, bumpMap: bump, bumpScale: 0.3 })
  const underside = new THREE.MeshStandardMaterial({ color: '#b9c3c9', roughness: 0.7, metalness: 0.05, bumpMap: bump, bumpScale: 0.3 })
  const cable = new THREE.MeshStandardMaterial({ color: '#f3f6f7', roughness: 0.28, metalness: 0.0 })
  const backstay = new THREE.MeshStandardMaterial({ color: '#cfd6da', roughness: 0.3, metalness: 0.35 })
  const glassDark = new THREE.MeshPhysicalMaterial({ color: '#07101a', roughness: 0.04, metalness: 0.0, clearcoat: 1, envMapIntensity: 2 })
  const rail = new THREE.MeshStandardMaterial({ color: '#c8d0d5', roughness: 0.35, metalness: 0.75 })
  const lampMetal = new THREE.MeshStandardMaterial({ color: '#aeb7bd', roughness: 0.4, metalness: 0.8 })
  const lampLens = new THREE.MeshStandardMaterial({ color: '#dfe6ea', roughness: 0.2, emissive: new THREE.Color('#ffd9a0'), emissiveIntensity: 0.0 })
  glow.push({ m: lampLens, k: 9 })
  const kerb = new THREE.MeshStandardMaterial({ color: '#b8b8b2', roughness: 0.85 })
  const white = new THREE.MeshStandardMaterial({ color: '#eef1f2', roughness: 0.5 })
  const lineWhite = new THREE.MeshStandardMaterial({ color: '#f1f1ea', roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })
  const dashTex = (() => {
    const { c, g } = canvas(256, 32)
    g.clearRect(0, 0, 256, 32)
    g.fillStyle = '#fff'
    g.fillRect(0, 0, 85, 32) // 3 m on / 6 m off  (tile = 9 m, running along x)
    const t = new THREE.CanvasTexture(c)
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    return t
  })()
  const lineDash = new THREE.MeshStandardMaterial({ color: '#f1f1ea', roughness: 0.6, alphaMap: dashTex, transparent: true, alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })
  const rails = new THREE.MeshStandardMaterial({ color: '#8d9399', roughness: 0.35, metalness: 0.9 })
  const groundFar = new THREE.MeshStandardMaterial({ color: '#5c6458', roughness: 1 })
  const roofTex = (() => {
    const { c, g } = canvas(256, 256)
    g.fillStyle = '#6f7073'
    g.fillRect(0, 0, 256, 256)
    const r = rng(11)
    for (let i = 0; i < 6000; i++) {
      const v = 80 + r() * 70
      g.fillStyle = `rgb(${v},${v},${v + 3})`
      g.fillRect(r() * 256, r() * 256, 2, 2)
    }
    const t = new THREE.CanvasTexture(c)
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.colorSpace = THREE.SRGBColorSpace
    return t
  })()
  const roof = new THREE.MeshStandardMaterial({ map: roofTex, roughness: 0.95 })
  const beacon = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 0.1, 0.05) })

  // ----- facades (28.8 m tiles: 8 bays x 8 floors) -------------------------
  const facade = (kind: Facade, seed: number) => {
    const S = 1024
    const N = 8
    const cell = S / N
    const col = canvas(S, S)
    const em = canvas(S, S)
    const g = col.g
    const e = em.g
    e.fillStyle = '#000'
    e.fillRect(0, 0, S, S)
    const r = rng(seed)
    const base: Record<Facade, string> = { glassTeal: '#24404a', glassSteel: '#5d7686', grid: '#c9c8c2', brick: '#8a4b3a', white: '#d9d7cf' }
    g.fillStyle = base[kind]
    g.fillRect(0, 0, S, S)
    if (kind === 'brick') {
      for (let y = 0; y < S; y += 8) for (let x = 0; x < S; x += 20) {
        const o = (y / 8) % 2 ? 10 : 0
        const v = r()
        g.fillStyle = `rgb(${130 + v * 40},${64 + v * 22},${48 + v * 16})`
        g.fillRect(x + o, y, 18, 6)
      }
    }
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const x = i * cell
        const y = j * cell
        const lit = r() < 0.26
        if (kind === 'glassTeal' || kind === 'glassSteel') {
          const mull = 5
          const grad = g.createLinearGradient(0, y, 0, y + cell)
          const t = r() * 0.12
          if (kind === 'glassTeal') {
            grad.addColorStop(0, `rgb(${58 + t * 120},${100 + t * 120},${118 + t * 120})`)
            grad.addColorStop(1, `rgb(${22 + t * 80},${48 + t * 80},${60 + t * 80})`)
          } else {
            grad.addColorStop(0, `rgb(${150 + t * 100},${178 + t * 100},${196 + t * 100})`)
            grad.addColorStop(1, `rgb(${70 + t * 80},${96 + t * 80},${114 + t * 80})`)
          }
          g.fillStyle = grad
          g.fillRect(x + mull, y + mull, cell - mull * 2, cell - mull * 2)
          g.fillStyle = kind === 'glassTeal' ? '#16272d' : '#8c9aa4'
          g.fillRect(x, y + cell - 7, cell, 7) // spandrel
          if (lit) {
            e.fillStyle = r() < 0.7 ? '#ffd9a6' : '#cfe3ff'
            e.fillRect(x + mull, y + mull, cell - mull * 2, cell - 14 - mull)
          }
        } else {
          const wx = x + cell * 0.18
          const wy = y + cell * 0.2
          const ww = cell * 0.64
          const wh = cell * 0.6
          if (kind === 'grid') {
            g.fillStyle = '#7c8c97'
            g.fillRect(x + 8, y + 8, cell - 16, cell - 16)
            g.fillStyle = '#d7d6d0'
            g.fillRect(x + cell / 2 - 3, y + 8, 6, cell - 16)
          } else {
            g.fillStyle = '#e9e8e2'
            g.fillRect(wx - 5, wy - 5, ww + 10, wh + 10)
            const gr = g.createLinearGradient(0, wy, 0, wy + wh)
            gr.addColorStop(0, '#6f8796')
            gr.addColorStop(1, '#2d3d49')
            g.fillStyle = gr
            g.fillRect(wx, wy, ww, wh)
            g.fillStyle = '#e9e8e2'
            g.fillRect(wx + ww / 2 - 2, wy, 4, wh)
          }
          if (lit) {
            e.fillStyle = '#ffcf8f'
            if (kind === 'grid') e.fillRect(x + 12, y + 12, cell - 24, cell - 24)
            else e.fillRect(wx, wy, ww, wh)
          }
        }
      }
    }
    const map = new THREE.CanvasTexture(col.c)
    map.wrapS = map.wrapT = THREE.RepeatWrapping
    map.colorSpace = THREE.SRGBColorSpace
    map.anisotropy = aniso
    const emap = new THREE.CanvasTexture(em.c)
    emap.wrapS = emap.wrapT = THREE.RepeatWrapping
    emap.colorSpace = THREE.SRGBColorSpace
    const glass = kind.startsWith('glass')
    const m = new THREE.MeshStandardMaterial({ map, emissiveMap: emap, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0, roughness: glass ? 0.18 : 0.85, metalness: glass ? 0.35 : 0 })
    glow.push({ m, k: 1.0 })
    return m
  }
  const fac: Record<Facade, THREE.MeshStandardMaterial> = {
    glassTeal: facade('glassTeal', 1),
    glassSteel: facade('glassSteel', 2),
    grid: facade('grid', 3),
    brick: facade('brick', 4),
    white: facade('white', 5),
  }

  glow.push({ m: beacon, k: 1, basic: true })

  return {
    asphalt, asphaltRed, tramSlab, pavers, paversBridge, concrete, concreteDark, steel, deckSteel, underside, cable, backstay, glassDark, rail,
    lampMetal, lampLens, kerb, white, lineWhite, lineDash, rails, groundFar, roof, facade: fac, waterNormals: wN, beacon, glow,
    setNight(n: number) {
      for (const { m, k, basic } of glow) {
        if (!basic) (m as THREE.MeshStandardMaterial).emissiveIntensity = n * k
      }
    },
  }
}

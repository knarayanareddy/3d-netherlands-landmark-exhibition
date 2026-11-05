import * as THREE from 'three'
import { asphaltTile, carpetTile, concreteTile, pavingTile, slabTile, woodFloorTile } from './textures'

/** Registry of materials whose emissive channel ramps up at night. */
const glow: { m: THREE.MeshStandardMaterial; k: number }[] = []
export function glowing<T extends THREE.MeshStandardMaterial>(m: T, k = 1): T {
  glow.push({ m, k })
  m.emissiveIntensity = 0
  return m
}
export function setNightGlow(n: number, interior = 0) {
  for (const g of glow) g.m.emissiveIntensity = g.k * Math.max(n, interior * (g.m.userData.interior ?? 0))
}

/** emissive materials that also glow in daytime when indoors (0..1 weight) */
const ig = <T extends THREE.Material>(m: T, v: number): T => {
  m.userData.interior = v
  return m
}

const cache = new Map<string, any>()
const memo = <T,>(k: string, f: () => T): T => {
  if (!cache.has(k)) cache.set(k, f())
  return cache.get(k)
}

/** shares the source image of a texture but with its own repeat */
export function tiled(t: THREE.Texture, rx: number, ry: number) {
  const c = t.clone()
  c.repeat.set(rx, ry)
  c.needsUpdate = true
  return c
}

export const M = {
  concrete: () =>
    memo('concrete', () => {
      const t = concreteTile()
      return new THREE.MeshStandardMaterial({ map: tiled(t.map, 1, 1), normalMap: tiled(t.normalMap, 1, 1), normalScale: new THREE.Vector2(0.8, 0.8), roughness: 0.92, metalness: 0 })
    }),
  concreteLathe: (repU: number, repV: number, key = '') =>
    memo('concreteL' + repU + '_' + repV + key, () => {
      const t = concreteTile()
      return new THREE.MeshStandardMaterial({ map: tiled(t.map, repU, repV), normalMap: tiled(t.normalMap, repU, repV), roughness: 0.9, side: THREE.DoubleSide })
    }),
  whitePaint: () => memo('white', () => new THREE.MeshStandardMaterial({ color: '#ecebe6', roughness: 0.42, metalness: 0.05 })),
  darkPaint: () => memo('dark', () => new THREE.MeshStandardMaterial({ color: '#1e2630', roughness: 0.5, metalness: 0.5 })),
  navy: () => memo('navy', () => new THREE.MeshStandardMaterial({ color: '#17212e', roughness: 0.32, metalness: 0.55 })),
  steel: () => memo('steel', () => new THREE.MeshStandardMaterial({ color: '#c9ced3', roughness: 0.28, metalness: 1 })),
  darkSteel: () => memo('dsteel', () => new THREE.MeshStandardMaterial({ color: '#575e65', roughness: 0.5, metalness: 0.45 })),
  frame: () => memo('frame', () => new THREE.MeshStandardMaterial({ color: '#454c52', roughness: 0.5, metalness: 0.35 })),
  mast: () => memo('mast', () => new THREE.MeshStandardMaterial({ color: '#f4f4f1', roughness: 0.34, metalness: 0.15 })),
  glass: () =>
    memo(
      'glass',
      () =>
        new THREE.MeshPhysicalMaterial({
          color: '#a9c3cf',
          roughness: 0.03,
          metalness: 0,
          transparent: true,
          opacity: 0.22,
          envMapIntensity: 1.6,
          clearcoat: 1,
          clearcoatRoughness: 0.02,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
    ),
  glassNest: () =>
    memo('glassNest', () => {
      const m = new THREE.MeshPhysicalMaterial({
        color: '#a6c0cd',
        roughness: 0.03,
        metalness: 0,
        transparent: true,
        opacity: 0.2,
        envMapIntensity: 1.8,
        clearcoat: 1,
        side: THREE.DoubleSide,
        depthWrite: false,
        emissive: new THREE.Color('#ffc98a'),
      })
      m.userData.interior = 0.35
      return glowing(m, 0.6)
    }),
  paving: (rx: number) =>
    memo('paving' + rx, () => {
      const t = pavingTile()
      return new THREE.MeshStandardMaterial({ map: tiled(t.map, rx, rx), normalMap: tiled(t.normalMap, rx, rx), roughness: 0.88 })
    }),
  slab: (rx = 1) =>
    memo('slab' + rx, () => {
      const t = slabTile()
      return new THREE.MeshStandardMaterial({ map: tiled(t.map, rx, rx), normalMap: tiled(t.normalMap, rx, rx), roughness: 0.62, metalness: 0 })
    }),
  asphalt: (rx = 1) =>
    memo('asphalt' + rx, () => {
      const t = asphaltTile()
      return new THREE.MeshStandardMaterial({ map: tiled(t.map, rx, rx), normalMap: tiled(t.normalMap, rx, rx), roughness: 0.93 })
    }),
  wood: (rx = 1) =>
    memo('wood' + rx, () => {
      const t = woodFloorTile()
      return new THREE.MeshStandardMaterial({ map: tiled(t.map, rx, rx), normalMap: tiled(t.normalMap, rx, rx), roughness: 0.5, metalness: 0 })
    }),
  carpet: (rx = 1) =>
    memo('carpet' + rx, () => {
      const t = carpetTile()
      return new THREE.MeshStandardMaterial({ map: tiled(t.map, rx, rx), normalMap: tiled(t.normalMap, rx, rx), roughness: 1 })
    }),
  plaster: (c = '#e9e6df') => memo('plaster' + c, () => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85 })),
  lightPanel: () => memo('lightPanel', () => ig(glowing(new THREE.MeshStandardMaterial({ color: '#fff7e8', emissive: new THREE.Color('#ffe2b0'), roughness: 0.6 }), 2.2), 1)),
  warmLamp: () => memo('warmLamp', () => ig(glowing(new THREE.MeshStandardMaterial({ color: '#ffe8c4', emissive: new THREE.Color('#ffc880'), roughness: 0.5 }), 3), 0.6)),
  coolLed: () => memo('coolLed', () => glowing(new THREE.MeshStandardMaterial({ color: '#cfe6ff', emissive: new THREE.Color('#8fc4ff'), roughness: 0.4 }), 3)),
  tablecloth: () => memo('cloth', () => new THREE.MeshStandardMaterial({ color: '#f1efe9', roughness: 0.95 })),
  chair: () => memo('chair', () => new THREE.MeshStandardMaterial({ color: '#2c3a46', roughness: 0.6, metalness: 0.1 })),
  leather: () => memo('leather', () => new THREE.MeshStandardMaterial({ color: '#6a3b2a', roughness: 0.55 })),
  rubber: () => memo('rubber', () => new THREE.MeshStandardMaterial({ color: '#202327', roughness: 0.9 })),
  bottle: () => memo('bottle', () => ig(glowing(new THREE.MeshStandardMaterial({ color: '#7a9a6a', emissive: new THREE.Color('#ffb066'), roughness: 0.2, metalness: 0.2 }), 1.2), 0.8)),
  redBeacon: () => memo('beacon', () => new THREE.MeshStandardMaterial({ color: '#ff2a1c', emissive: new THREE.Color('#ff1608'), emissiveIntensity: 2, roughness: 0.4 })),
}


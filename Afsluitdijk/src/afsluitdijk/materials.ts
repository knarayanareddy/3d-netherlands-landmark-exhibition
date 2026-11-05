import * as THREE from 'three'
import type { TextureSet, PBR } from './textures'

export interface Mats {
  asphalt: THREE.MeshStandardMaterial
  asphaltRed: THREE.MeshStandardMaterial
  median: THREE.MeshStandardMaterial
  levvel: THREE.MeshStandardMaterial
  levvelBlock: THREE.MeshStandardMaterial
  basalt: THREE.MeshStandardMaterial
  brick: THREE.MeshStandardMaterial
  klinker: THREE.MeshStandardMaterial
  stone: THREE.MeshStandardMaterial
  concrete: THREE.MeshStandardMaterial
  paving: THREE.MeshStandardMaterial
  grass: THREE.MeshStandardMaterial
  rubble: THREE.MeshStandardMaterial
  seabed: THREE.MeshStandardMaterial
  steel: THREE.MeshStandardMaterial
  steelPainted: THREE.MeshStandardMaterial
  white: THREE.MeshStandardMaterial
  paint: THREE.MeshStandardMaterial
  bronze: THREE.MeshStandardMaterial
  glass: THREE.MeshStandardMaterial
  plaster: THREE.MeshStandardMaterial
  lamp: THREE.MeshStandardMaterial
  dark: THREE.MeshStandardMaterial
  wood: THREE.MeshStandardMaterial
  /** materials that live inside the tower and should not receive full sky ambient */
  interior: THREE.MeshStandardMaterial[]
}

function std(p: PBR, opts: THREE.MeshStandardMaterialParameters = {}, ns = 1) {
  return new THREE.MeshStandardMaterial({
    map: p.map,
    normalMap: p.normalMap,
    roughnessMap: p.roughnessMap,
    normalScale: new THREE.Vector2(ns, ns),
    roughness: 1,
    metalness: 0,
    ...opts,
  })
}

export function makeMaterials(T: TextureSet): Mats {
  const redTint = new THREE.Color().setRGB(3.4, 0.85, 0.55)
  const asphaltRed = std(T.asphalt, { color: redTint }, 1.1)
  asphaltRed.roughness = 0.95
  const median = std(T.asphalt, { color: new THREE.Color().setRGB(1.5, 1.45, 1.35) }, 1)
  const klinker = std(T.brick, { color: new THREE.Color().setRGB(0.8, 0.72, 0.68) }, 0.8)
  const plaster = new THREE.MeshStandardMaterial({
    color: '#cfc6b4',
    roughness: 0.95,
    normalMap: T.concrete.normalMap,
    normalScale: new THREE.Vector2(0.4, 0.4),
  })
  const grass = std(T.grass, { vertexColors: true }, 0.8)

  const mats: Mats = {
    asphalt: std(T.asphalt, {}, 1.2),
    asphaltRed,
    median,
    levvel: std(T.levvelPattern, {}, 1.4),
    levvelBlock: std(T.concrete, { color: new THREE.Color().setRGB(1.05, 1.05, 1.02), vertexColors: false }, 1),
    basalt: std(T.basalt, {}, 1.2),
    brick: std(T.brick, {}, 1),
    klinker,
    stone: std(T.stone, {}, 0.9),
    concrete: std(T.concrete, { color: new THREE.Color().setRGB(1.1, 1.1, 1.08) }, 1),
    paving: std(T.paving, { color: new THREE.Color().setRGB(1.08, 1.0, 0.88) }, 1),
    grass,
    rubble: std(T.rubble, {}, 1.2),
    seabed: new THREE.MeshStandardMaterial({ color: '#2b2f2c', roughness: 1 }),
    steel: new THREE.MeshStandardMaterial({ color: '#b7bec3', metalness: 0.85, roughness: 0.42 }),
    steelPainted: new THREE.MeshStandardMaterial({ color: '#3b4249', metalness: 0.55, roughness: 0.5 }),
    white: new THREE.MeshStandardMaterial({ color: '#e9e9e2', roughness: 0.55 }),
    paint: new THREE.MeshStandardMaterial({ color: '#f1f1ea', roughness: 0.6 }),
    bronze: new THREE.MeshStandardMaterial({ color: '#5b5a3e', metalness: 0.5, roughness: 0.5, envMapIntensity: 0.6, normalMap: T.concrete.normalMap, normalScale: new THREE.Vector2(0.35, 0.35) }),
    glass: new THREE.MeshPhysicalMaterial({ color: '#9fb8c4', metalness: 0, roughness: 0.04, transparent: true, opacity: 0.28, side: THREE.DoubleSide }),
    plaster,
    lamp: new THREE.MeshStandardMaterial({ color: '#d9d9d2', emissive: new THREE.Color('#ffd9a0'), emissiveIntensity: 0, roughness: 0.4 }),
    dark: new THREE.MeshStandardMaterial({ color: '#15181b', roughness: 0.7 }),
    wood: new THREE.MeshStandardMaterial({ color: '#7a5a3a', roughness: 0.8 }),
    interior: [],
  }
  mats.interior.push(plaster)
  return mats
}

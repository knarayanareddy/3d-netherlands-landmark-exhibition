import * as THREE from 'three'
import * as T from './textures'

export type FacadeKey =
  | 'brickRed' | 'brickBrown' | 'brickYellow' | 'houseRed' | 'houseBrown'
  | 'ribbon' | 'ribbonDark' | 'curtainBlue' | 'curtainGreen'
  | 'panelWhite' | 'panelWarm' | 'industrial'

export interface Mats {
  facade: Record<FacadeKey, THREE.MeshStandardMaterial>
  facadeList: THREE.MeshStandardMaterial[]
  roofing: THREE.MeshStandardMaterial
  tiles: THREE.MeshStandardMaterial
  asphalt: THREE.MeshStandardMaterial
  redAsphalt: THREE.MeshStandardMaterial
  paving: THREE.MeshStandardMaterial
  clinker: THREE.MeshStandardMaterial
  grass: THREE.MeshStandardMaterial
  wood: THREE.MeshStandardMaterial
  gravel: THREE.MeshStandardMaterial
  sand: THREE.MeshStandardMaterial
  pitch: THREE.MeshStandardMaterial
  concrete: THREE.MeshStandardMaterial
  concreteBoard: THREE.MeshStandardMaterial
  concreteDark: THREE.MeshStandardMaterial
  water: THREE.MeshStandardMaterial
  marking: THREE.MeshStandardMaterial
  leaf: THREE.MeshStandardMaterial
  bark: THREE.MeshStandardMaterial
  glass: THREE.MeshPhysicalMaterial
  metal: THREE.MeshStandardMaterial
  steel: THREE.MeshStandardMaterial
  white: THREE.MeshStandardMaterial
  lamp: THREE.MeshStandardMaterial
  waterNormal: THREE.Texture
  night: THREE.MeshStandardMaterial[] // materials with emissive that follow the night factor
}

const tick = () => new Promise<void>((r) => setTimeout(r, 0))

function std(p: T.PBR, o: THREE.MeshStandardMaterialParameters = {}) {
  return new THREE.MeshStandardMaterial({
    map: p.map, normalMap: p.normalMap, roughnessMap: p.orm, metalnessMap: p.orm, roughness: 1, metalness: 1,
    normalScale: new THREE.Vector2(1, 1), ...o,
  })
}

function layer(m: THREE.Material, order: number) {
  m.depthWrite = false
  m.polygonOffset = true
  m.polygonOffsetFactor = -order
  m.polygonOffsetUnits = -order * 2
}

export async function makeMaterials(progress: (p: number, l: string) => void): Promise<Mats> {
  const step = async (p: number, l: string) => { progress(p, l); await tick() }
  await step(0.08, 'Firing Delft brick')
  const fac = (p: T.PBR) => {
    const m = std(p, { vertexColors: true, emissiveMap: p.emissiveMap, emissive: new THREE.Color(1, 1, 1), emissiveIntensity: 0 })
    m.normalScale.set(0.9, 0.9)
    return m
  }
  const facade = {} as Record<FacadeKey, THREE.MeshStandardMaterial>
  facade.brickRed = fac(T.brickFacade(1, [0.5, 0.25, 0.18]))
  await step(0.12, 'Laying yellow chemistry brick')
  facade.brickBrown = fac(T.brickFacade(2, [0.4, 0.28, 0.2]))
  facade.brickYellow = fac(T.brickFacade(3, [0.62, 0.5, 0.31], 0.4, 0.55))
  await step(0.18, 'Building suburban homes')
  facade.houseRed = fac(T.brickFacade(4, [0.55, 0.3, 0.22], 0.36, 0.44, 512))
  facade.houseBrown = fac(T.brickFacade(5, [0.38, 0.26, 0.2], 0.34, 0.42, 512))
  await step(0.26, 'Pouring brutalist concrete')
  facade.ribbon = fac(T.concreteRibbonFacade(6, 0.6))
  facade.ribbonDark = fac(T.concreteRibbonFacade(7, 0.46))
  await step(0.34, 'Glazing curtain walls')
  facade.curtainBlue = fac(T.curtainFacade(8, [0.12, 0.25, 0.34]))
  facade.curtainGreen = fac(T.curtainFacade(9, [0.13, 0.27, 0.25], 512))
  await step(0.42, 'Hanging cladding panels')
  facade.panelWhite = fac(T.panelFacade(10, [0.78, 0.78, 0.76]))
  facade.panelWarm = fac(T.panelFacade(11, [0.6, 0.53, 0.45], 512))
  facade.industrial = fac(T.industrialFacade(12, [0.62, 0.64, 0.63]))

  await step(0.5, 'Mixing asphalt')
  const asphalt = std(T.makeAsphalt(false)); layer(asphalt, 8)
  const redAsphalt = std(T.makeAsphalt(true)); layer(redAsphalt, 9)
  await step(0.56, 'Paving the campus')
  const paving = std(T.makePaving()); layer(paving, 10)
  const clinker = std(T.makeClinker()); layer(clinker, 7)
  await step(0.62, 'Sowing the lawns')
  const grass = std(T.makeGrass()); layer(grass, 2)
  const woodP = T.makeLeaf()
  const wood = std(woodP, { color: new THREE.Color(0.7, 0.75, 0.6) }); layer(wood, 3)
  const gravel = std(T.makeGravel()); layer(gravel, 4)
  const sand = std(T.makeSand()); layer(sand, 4)
  const pitch = std(T.makePitch()); layer(pitch, 6)
  await step(0.7, 'Casting concrete')
  const concrete = std(T.makeConcrete(false, 0.6))
  const concreteBoard = std(T.makeConcrete(true, 0.56), { vertexColors: true })
  const concreteDark = std(T.makeConcrete(true, 0.42), { vertexColors: true })
  const roofing = std(T.makeRoofing(), { vertexColors: true })
  const tiles = std(T.makeTiles(), { vertexColors: true })
  await step(0.76, 'Filling the canals')
  const waterNormal = T.makeWaterNormal()
  waterNormal.repeat.set(1 / 7, 1 / 7)
  const water = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0.08, 0.16, 0.17), roughness: 0.07, metalness: 0.92, normalMap: waterNormal,
    normalScale: new THREE.Vector2(0.45, 0.45), envMapIntensity: 1.1,
  })
  layer(water, 5)
  const marking = new THREE.MeshStandardMaterial({ color: 0xe9e9e4, roughness: 0.7, vertexColors: false }); layer(marking, 12)
  await step(0.82, 'Growing trees')
  const leafP = T.makeLeaf()
  const leaf = new THREE.MeshStandardMaterial({
    map: leafP.map, normalMap: leafP.normalMap, roughness: 0.85, metalness: 0, vertexColors: true, side: THREE.DoubleSide,
    normalScale: new THREE.Vector2(0.45, 0.45),
  })
  const barkP = T.makeBark()
  const bark = new THREE.MeshStandardMaterial({ map: barkP.map, normalMap: barkP.normalMap, roughness: 0.95, color: 0xffffff })

  const glass = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(0.1, 0.2, 0.26), roughness: 0.04, metalness: 0.6, envMapIntensity: 1.6, clearcoat: 0.4, clearcoatRoughness: 0.05,
    emissive: new THREE.Color(1, 0.8, 0.5), emissiveIntensity: 0,
  })
  const metal = new THREE.MeshStandardMaterial({ color: 0x8c9296, roughness: 0.38, metalness: 0.95, vertexColors: true })
  const steel = new THREE.MeshStandardMaterial({ color: 0x4d5256, roughness: 0.5, metalness: 0.9 })
  const white = new THREE.MeshStandardMaterial({ color: 0xdedbd3, roughness: 0.7, metalness: 0.0, vertexColors: true })
  const lamp = new THREE.MeshStandardMaterial({ color: 0xfff1d0, emissive: new THREE.Color(1, 0.85, 0.55), emissiveIntensity: 0, roughness: 0.5 })

  const facadeList = Object.values(facade)
  return {
    facade, facadeList, roofing, tiles, asphalt, redAsphalt, paving, clinker, grass, wood, gravel, sand, pitch,
    concrete, concreteBoard, concreteDark, water, marking, leaf, bark, glass, metal, steel, white, lamp, waterNormal,
    night: [...facadeList, lamp],
  }
}

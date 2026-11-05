import * as THREE from 'three'
import * as T from './textures'

type Std = THREE.MeshStandardMaterial

function std(p: T.PBR, extra: THREE.MeshStandardMaterialParameters = {}): Std {
  return new THREE.MeshStandardMaterial({
    map: p.map,
    normalMap: p.normalMap,
    roughnessMap: p.roughnessMap,
    normalScale: new THREE.Vector2(1, 1),
    roughness: 1,
    metalness: 0,
    ...extra,
  })
}

export interface Glow { mat: THREE.MeshStandardMaterial; day: number; night: number }

export async function createMaterials(progress: (p: number, label: string) => void) {
  const step = async (p: number, label: string) => {
    progress(p, label)
    await T.nextFrame()
  }
  const glows: Glow[] = []
  const glow = (m: Std, day: number, night: number) => { glows.push({ mat: m, day, night }); m.emissiveIntensity = day; return m }

  await step(0.04, 'Firing Cuypers’ bricks')
  const brick = std(T.masonry({
    w: 2048, h: 1600, cols: 8, rows: 20, wm: 1.92, hm: 1.5, jointX: 11, jointY: 10,
    palette: [[132, 54, 38], [158, 70, 46], [176, 88, 56], [150, 64, 44], [118, 50, 38]],
    mortar: [182, 174, 158], seed: 11, bevel: 8, grain: 1, variation: 0.1, rare: 0.06, normal: 3.2, roughBase: 0.9,
  }))
  await step(0.2, 'Carving sandstone')
  const stone = std(T.masonry({
    w: 1024, h: 1024, cols: 4, rows: 6, wm: 2.4, hm: 2.4, jointX: 3, jointY: 3,
    palette: [[214, 204, 180], [202, 192, 170], [222, 214, 192], [208, 196, 172]],
    mortar: [176, 168, 150], seed: 31, bevel: 4, grain: 1.1, variation: 0.05, rare: 0.05, normal: 1.6, bond: 'running', roughBase: 0.82,
  }))
  const stoneSmooth = std(T.noiseSurface({ base: [212, 203, 182], seed: 7, wm: 1.5, contrast: 0.22, speck: 0.12, normal: 1.2, rough: 0.8 }))
  await step(0.32, 'Laying slate')
  const slate = std(T.slate(), { metalness: 0.05 })
  const lead = std(T.noiseSurface({ base: [96, 100, 100], seed: 12, wm: 3, contrast: 0.2, normal: 0.8, rough: 0.55 }), { metalness: 0.35 })
  await step(0.42, 'Paving Museumplein')
  const pavers = std(T.masonry({
    w: 1024, h: 1024, cols: 10, rows: 20, wm: 2, hm: 2, jointX: 5, jointY: 5,
    palette: [[140, 132, 124], [150, 124, 108], [124, 120, 118], [158, 134, 116], [142, 108, 94]],
    mortar: [170, 160, 140], seed: 41, bevel: 4, grain: 1, variation: 0.06, rare: 0.08, normal: 2.4, roughBase: 0.92,
  }))
  const cycle = std(T.noiseSurface({ base: [158, 62, 50], seed: 13, wm: 2.5, contrast: 0.2, speck: 0.3, normal: 1.4, rough: 0.92 }))
  await step(0.52, 'Polishing limestone')
  const floor = std(T.limestone(5, 4, 2.4), { envMapIntensity: 0.9 })
  const floorDark = std(T.limestone(9, 2, 2.4, [150, 146, 138]), { envMapIntensity: 0.9 })
  const boards = std(T.boards(), { envMapIntensity: 0.7 })
  await step(0.64, 'Plastering galleries')
  const wallGallery = std(T.noiseSurface({ base: [98, 114, 122], seed: 3, wm: 2, contrast: 0.14, normal: 0.6, rough: 0.92 }))
  const wallNight = std(T.noiseSurface({ base: [60, 62, 66], seed: 4, wm: 2, contrast: 0.16, normal: 0.6, rough: 0.95 }))
  const wallCream = std(T.noiseSurface({ base: [226, 216, 194], seed: 5, wm: 2, contrast: 0.12, normal: 0.8, rough: 0.9 }))
  const ornament = std(T.ornament(), { roughness: 0.9 })
  await step(0.74, 'Sowing Museumplein')
  const grass = std(T.grass(), { vertexColors: true })
  const bark = std(T.bark(), { roughness: 1 })
  const leaf = T.leafCard()
  const leaves = new THREE.MeshStandardMaterial({ map: leaf, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.75, vertexColors: true })
  const delft = new THREE.MeshStandardMaterial({ map: T.delftTiles(), roughness: 0.25, metalness: 0 })
  await step(0.86, 'Glazing windows')

  const glass = glow(new THREE.MeshStandardMaterial({
    color: '#0e1a24', roughness: 0.05, metalness: 0.35, envMapIntensity: 1.5, emissive: '#ffcf86',
  }), 0, 0.9)
  const glassLit = glow(new THREE.MeshStandardMaterial({
    color: '#27323a', roughness: 0.2, metalness: 0.1, emissive: '#ffd9a0',
  }), 0.55, 1.4)
  const glassRoof = new THREE.MeshPhysicalMaterial({
    color: '#cfe4ec', roughness: 0.04, metalness: 0, transparent: true, opacity: 0.2, side: THREE.DoubleSide,
    depthWrite: false, envMapIntensity: 1.6, clearcoat: 0, ior: 1.45,
  })
  const frame = new THREE.MeshStandardMaterial({ color: '#e7e3d6', roughness: 0.55 })
  const steel = new THREE.MeshStandardMaterial({ color: '#2b3036', roughness: 0.45, metalness: 0.85 })
  const steelLight = new THREE.MeshStandardMaterial({ color: '#c9ced3', roughness: 0.4, metalness: 0.9 })
  const gold = new THREE.MeshStandardMaterial({ color: '#d6a838', roughness: 0.32, metalness: 1 })
  const frameGold = new THREE.MeshStandardMaterial({ color: '#c79a38', roughness: 0.42, metalness: 0.9 })
  const woodDark = new THREE.MeshStandardMaterial({ color: '#43301f', roughness: 0.5 })
  const woodMid = new THREE.MeshStandardMaterial({ color: '#7a5535', roughness: 0.55 })
  const leather = new THREE.MeshStandardMaterial({ color: '#2f2420', roughness: 0.5 })
  const lamp = glow(new THREE.MeshStandardMaterial({ color: '#fff6df', emissive: '#ffe2a8', roughness: 0.4 }), 1.4, 2.4)
  const skylight = glow(new THREE.MeshStandardMaterial({ color: '#f4f6f8', emissive: '#e9f1ff', roughness: 0.6 }), 1.1, 0.5)
  const black = new THREE.MeshStandardMaterial({ color: '#111315', roughness: 0.8 })
  const door = new THREE.MeshStandardMaterial({ color: '#2c1f17', roughness: 0.55, metalness: 0.05 })
  const hedge = new THREE.MeshStandardMaterial({ color: '#2f5a28', roughness: 1 })
  const white = new THREE.MeshStandardMaterial({ color: '#f1f0ea', roughness: 0.6 })
  const red = new THREE.MeshStandardMaterial({ color: '#b3262b', roughness: 0.5, metalness: 0.2 })
  const velvet = new THREE.MeshStandardMaterial({ color: '#6b1f2a', roughness: 0.95 })

  // pond water: animated procedural normal map
  const wh = 256
  const waveNoise = T.fbm(wh, wh, 6, 6, 4, 77)
  const wc = document.createElement('canvas')
  wc.width = wc.height = wh
  const wg = wc.getContext('2d')!
  const wimg = wg.createImageData(wh, wh)
  for (let y = 0; y < wh; y++) for (let x = 0; x < wh; x++) {
    const i = y * wh + x
    const dx = waveNoise[y * wh + ((x + 1) % wh)] - waveNoise[y * wh + ((x - 1 + wh) % wh)]
    const dy = waveNoise[((y + 1) % wh) * wh + x] - waveNoise[((y - 1 + wh) % wh) * wh + x]
    const n = new THREE.Vector3(-dx * 6, dy * 6, 1).normalize()
    wimg.data[i * 4] = (n.x * 0.5 + 0.5) * 255; wimg.data[i * 4 + 1] = (n.y * 0.5 + 0.5) * 255; wimg.data[i * 4 + 2] = (n.z * 0.5 + 0.5) * 255; wimg.data[i * 4 + 3] = 255
  }
  wg.putImageData(wimg, 0, 0)
  const waveTex = new THREE.CanvasTexture(wc)
  waveTex.wrapS = waveTex.wrapT = THREE.RepeatWrapping
  waveTex.repeat.set(6, 6)
  const water = new THREE.MeshStandardMaterial({ color: '#0f2630', roughness: 0.06, metalness: 0.1, normalMap: waveTex, normalScale: new THREE.Vector2(0.35, 0.35), envMapIntensity: 0.85 })

  await step(0.95, 'Hanging the Gallery of Honour')
  return {
    brick, stone, stoneSmooth, slate, lead, pavers, cycle, floor, floorDark, boards,
    wallGallery, wallNight, wallCream, ornament, grass, bark, leaves, delft,
    glass, glassLit, glassRoof, frame, steel, steelLight, gold, frameGold, woodDark, woodMid, leather,
    lamp, skylight, black, door, hedge, white, red, velvet, water, waveTex,
    glows,
  }
}
export type Mats = Awaited<ReturnType<typeof createMaterials>>

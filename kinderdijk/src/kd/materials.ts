import * as THREE from 'three'
import { addSway, flowerCardTex, grassCardTex, leafTex, reedCardTex } from './gfx'

import thatchD from '../assets/tex/thatch_d.jpg'
import thatchN from '../assets/tex/thatch_n.jpg'
import brickD from '../assets/tex/brick_d.jpg'
import brickN from '../assets/tex/brick_n.jpg'
import paveD from '../assets/tex/pave_d.jpg'
import paveN from '../assets/tex/pave_n.jpg'
import grassD from '../assets/tex/grass_d.jpg'
import grassN from '../assets/tex/grass_n.jpg'
import barkD from '../assets/tex/bark_d.jpg'
import barkN from '../assets/tex/bark_n.jpg'
import mudD from '../assets/tex/mud_d.jpg'
import mudN from '../assets/tex/mud_n.jpg'
import tilesD from '../assets/tex/tiles_d.jpg'
import tilesN from '../assets/tex/tiles_n.jpg'
import tarD from '../assets/tex/tar_d.jpg'
import tarN from '../assets/tex/tar_n.jpg'
import woodD from '../assets/tex/wood_d.jpg'
import woodN from '../assets/tex/wood_n.jpg'
import whiteD from '../assets/tex/white_d.jpg'
import whiteN from '../assets/tex/white_n.jpg'

export interface Mats {
  thatch: THREE.MeshStandardMaterial
  thatchB: THREE.MeshStandardMaterial
  thatchC: THREE.MeshStandardMaterial
  brick: THREE.MeshStandardMaterial
  brickB: THREE.MeshStandardMaterial
  pave: THREE.MeshStandardMaterial
  grass: THREE.MeshStandardMaterial
  bark: THREE.MeshStandardMaterial
  mud: THREE.MeshStandardMaterial
  tiles: THREE.MeshStandardMaterial
  tilesDark: THREE.MeshStandardMaterial
  tar: THREE.MeshStandardMaterial
  wood: THREE.MeshStandardMaterial
  woodDark: THREE.MeshStandardMaterial
  planksWhite: THREE.MeshStandardMaterial
  paint: THREE.MeshStandardMaterial
  paintGreen: THREE.MeshStandardMaterial
  paintRed: THREE.MeshStandardMaterial
  stock: THREE.MeshStandardMaterial
  iron: THREE.MeshStandardMaterial
  glass: THREE.MeshStandardMaterial
  slate: THREE.MeshStandardMaterial
  stone: THREE.MeshStandardMaterial
  grassCard: THREE.MeshStandardMaterial
  grassCardB: THREE.MeshStandardMaterial
  reedCard: THREE.MeshStandardMaterial
  flowerCard: THREE.MeshStandardMaterial
  leafRound: THREE.MeshStandardMaterial
  leafWillow: THREE.MeshStandardMaterial
  leafPoplar: THREE.MeshStandardMaterial
}
export const M = {} as Mats

const loader = new THREE.TextureLoader()
const load = (url: string, srgb: boolean, aniso: number) =>
  new Promise<THREE.Texture>((res, rej) =>
    loader.load(
      url,
      (t) => {
        t.wrapS = t.wrapT = THREE.RepeatWrapping
        t.anisotropy = aniso
        if (srgb) t.colorSpace = THREE.SRGBColorSpace
        res(t)
      },
      undefined,
      rej,
    ),
  )

export const TEX: Record<string, { d: THREE.Texture; n: THREE.Texture }> = {}

export async function initMaterials(aniso: number, progress?: (p: number) => void) {
  const defs: [string, string, string][] = [
    ['thatch', thatchD, thatchN],
    ['brick', brickD, brickN],
    ['pave', paveD, paveN],
    ['grass', grassD, grassN],
    ['bark', barkD, barkN],
    ['mud', mudD, mudN],
    ['tiles', tilesD, tilesN],
    ['tar', tarD, tarN],
    ['wood', woodD, woodN],
    ['white', whiteD, whiteN],
  ]
  let done = 0
  await Promise.all(
    defs.map(async ([k, d, n]) => {
      const [td, tn] = await Promise.all([load(d, true, aniso), load(n, false, aniso)])
      TEX[k] = { d: td, n: tn }
      progress?.(++done / defs.length)
    }),
  )
  const std = (k: string, o: THREE.MeshStandardMaterialParameters & { ns?: number } = {}) => {
    const { ns, ...rest } = o
    return new THREE.MeshStandardMaterial({
      map: TEX[k].d,
      normalMap: TEX[k].n,
      normalScale: new THREE.Vector2(ns ?? 1, ns ?? 1),
      roughness: 0.9,
      metalness: 0,
      ...rest,
    })
  }
  M.thatch = std('thatch', { color: '#c6b596', ns: 1.6 })
  M.thatchB = std('thatch', { color: '#a89c84', ns: 1.6 })
  M.thatchC = std('thatch', { color: '#b8a685', ns: 1.6 })
  M.brick = std('brick', { color: '#ddc7bb', ns: 1.2 })
  M.brickB = std('brick', { color: '#c9a99a', ns: 1.2 })
  M.pave = std('pave', { color: '#f2ebe3', roughness: 0.85, ns: 1.3 })
  M.grass = std('grass', { color: '#ffffff', roughness: 1, vertexColors: true })
  M.bark = std('bark', { color: '#b0a79d', ns: 1.6 })
  M.mud = std('mud', { color: '#8a7a68' })
  M.tiles = std('tiles', { color: '#e8c2a8', ns: 1.3 })
  M.tilesDark = std('tiles', { color: '#6a5750', ns: 1.3 })
  M.tar = std('tar', { color: '#b8b0a8', roughness: 0.65 })
  M.wood = std('wood', { color: '#f4ebdd', ns: 1 })
  M.woodDark = std('wood', { color: '#a09282', ns: 1 })
  M.planksWhite = std('white', { color: '#f3efe6', roughness: 0.7 })
  const flat = (c: string, r = 0.75, m = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m })
  M.paint = flat('#e9e4d6', 0.72)
  M.paintGreen = flat('#2c4a37', 0.55)
  M.paintRed = flat('#8e2f23', 0.6)
  M.stock = flat('#51463a', 0.9)
  M.iron = flat('#1c1d1f', 0.45, 0.85)
  M.glass = new THREE.MeshStandardMaterial({ color: '#16222a', roughness: 0.06, metalness: 0.75 })
  M.slate = flat('#3a3f46', 0.7)
  M.stone = flat('#a8a398', 0.9)

  // cutout cards
  const card = (tex: THREE.Texture, o: THREE.MeshStandardMaterialParameters = {}) =>
    new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.38, side: THREE.DoubleSide, roughness: 0.85, metalness: 0, alphaToCoverage: true, ...o })
  M.grassCard = card(grassCardTex(0), { color: '#ffffff' })
  M.grassCardB = card(grassCardTex(1), { color: '#ffffff' })
  M.reedCard = card(reedCardTex())
  M.flowerCard = card(flowerCardTex())
  addSway(M.grassCard, { amp: 0.09, h: 0.8, pow: 1.4 })
  addSway(M.grassCardB, { amp: 0.11, h: 0.9, pow: 1.4 })
  addSway(M.reedCard, { amp: 0.28, h: 2.2, pow: 1.5 })
  addSway(M.flowerCard, { amp: 0.06, h: 0.5, pow: 1.4 })
  M.leafRound = card(leafTex('round'), { vertexColors: true, color: '#ffffff' })
  M.leafWillow = card(leafTex('willow'), { vertexColors: true, color: '#ffffff' })
  M.leafPoplar = card(leafTex('poplar'), { vertexColors: true, color: '#ffffff' })
  addSway(M.leafRound, { amp: 0.16, h: 9, pow: 1.2 })
  addSway(M.leafWillow, { amp: 0.26, h: 9, pow: 0.9 })
  addSway(M.leafPoplar, { amp: 0.14, h: 16, pow: 1.4 })

  // terrain shader: macro-variation anti-tiling + mud blend near the waterline
  M.grass.onBeforeCompile = (s) => {
    s.uniforms.uMud = { value: TEX.mud.d }
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aMud;\nvarying float vMud;\nvarying vec3 vWPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMud = aMud;\nvWPos = (modelMatrix * vec4(position,1.0)).xyz;')
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uMud;\nvarying float vMud;\nvarying vec3 vWPos;')
      .replace(
        '#include <map_fragment>',
        `
        vec4 g1 = texture2D( map, vMapUv );
        vec4 g2 = texture2D( map, vMapUv * 0.213 + vec2(0.37, 0.11) );
        vec4 g3 = texture2D( map, vMapUv * 3.1 + vec2(0.71, 0.53) );
        vec3 gcol = g1.rgb * ( 0.55 + g2.rgb * 1.15 ) * ( 0.8 + g3.rgb * 0.5 );
        vec3 mcol = texture2D( uMud, vMapUv * 0.8 ).rgb * vec3(0.62, 0.52, 0.42);
        diffuseColor.rgb *= mix( gcol, mcol * 1.6, clamp( vMud, 0.0, 1.0 ) );
      `,
      )
  }
  M.grass.customProgramCacheKey = () => 'terrain-grass'
}

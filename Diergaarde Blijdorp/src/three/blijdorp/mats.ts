import * as THREE from 'three'
import { rng, TAU } from './util'

import cobbleD from '../../assets/tex/cobblestone_pavement.jpg'
import cobbleN from '../../assets/tex/cobblestone_pavement_n.jpg'
import herrD from '../../assets/tex/herringbone_pavement_03.jpg'
import herrN from '../../assets/tex/herringbone_pavement_03_n.jpg'
import stuccoD from '../../assets/tex/white_stucco.jpg'
import stuccoN from '../../assets/tex/white_stucco_n.jpg'
import concD from '../../assets/tex/brushed_concrete_03.jpg'
import concN from '../../assets/tex/brushed_concrete_03_n.jpg'
import grassD from '../../assets/tex/leafy_grass.jpg'
import grassN from '../../assets/tex/leafy_grass_n.jpg'
import gravelD from '../../assets/tex/gravel_floor_02.jpg'
import gravelN from '../../assets/tex/gravel_floor_02_n.jpg'
import rockD from '../../assets/tex/mossy_rock.jpg'
import rockN from '../../assets/tex/mossy_rock_n.jpg'
import woodD from '../../assets/tex/weathered_planks.jpg'
import woodN from '../../assets/tex/weathered_planks_n.jpg'
import brickD from '../../assets/tex/brick_wall_02.jpg'
import brickN from '../../assets/tex/brick_wall_02_n.jpg'
import slabD from '../../assets/tex/concrete_pavement_02.jpg'
import slabN from '../../assets/tex/concrete_pavement_02_n.jpg'

type Std = THREE.MeshStandardMaterial

function canvas(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return { c, g: c.getContext('2d')! }
}
function ctex(c: HTMLCanvasElement, srgb = true, repeat = true) {
  const t = new THREE.CanvasTexture(c)
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
  t.anisotropy = 8
  return t
}

const NOISE_GLSL = /* glsl */ `
float h21(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(h21(i),h21(i+vec2(1.,0.)),f.x),mix(h21(i+vec2(0.,1.)),h21(i+vec2(1.,1.)),f.x),f.y); }
`

/** adds large-scale colour variation (hides texture tiling) and weathering to a material */
export function patch(m: Std, o: { macro?: number; grime?: number; key?: string } = {}) {
  const macro = o.macro ?? 0
  const grime = o.grime ?? 0
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWP=(modelMatrix*vec4(transformed,1.0)).xyz;')
    let frag = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;\n' + NOISE_GLSL)
    let code = ''
    if (macro > 0) {
      code += `float mn=vn(vWP.xz*0.045)*0.55+vn(vWP.xz*0.21)*0.3+vn(vWP.xz*1.1)*0.15; diffuseColor.rgb*=1.0-${macro.toFixed(2)}*0.5+${macro.toFixed(2)}*mn;\n`
    }
    if (grime > 0) {
      code += `float gy=smoothstep(0.0,2.4,vWP.y); float st=vn(vec2((vWP.x+vWP.z)*2.7, vWP.y*0.11)); float st2=vn(vec2((vWP.x-vWP.z)*0.35, vWP.y*0.5));
      diffuseColor.rgb*=mix(1.0-${grime.toFixed(2)}*0.55,1.0,gy)*(1.0-${grime.toFixed(2)}*0.28*st)*(1.0-${grime.toFixed(2)}*0.16*st2);\n`
    }
    frag = frag.replace('#include <color_fragment>', '#include <color_fragment>\n' + code)
    sh.fragmentShader = frag
  }
  m.customProgramCacheKey = () => `patch-${o.key ?? ''}-${macro}-${grime}`
  return m
}

function waterNormalTexture() {
  const N = 256
  const { c, g } = canvas(N, N)
  const img = g.createImageData(N, N)
  const waves = [[1, 2, 1.0, 0.3], [3, 1, 0.8, 1.7], [2, -3, 0.7, 2.9], [5, 4, 0.45, 0.6], [7, -2, 0.35, 4.1], [4, 6, 0.3, 5.2], [9, 3, 0.18, 2.2], [6, -8, 0.15, 3.3]]
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      let dx = 0, dy = 0
      for (const [fx, fy, a, ph] of waves) {
        const arg = (TAU * (fx * x + fy * y)) / N + ph
        const cs = Math.cos(arg) * a * (TAU / N)
        dx += cs * fx
        dy += cs * fy
      }
      const k = 5.5
      const nx = -dx * k, ny = -dy * k, nz = 1
      const l = Math.hypot(nx, ny, nz)
      const o = (y * N + x) * 4
      img.data[o] = ((nx / l) * 0.5 + 0.5) * 255
      img.data[o + 1] = ((ny / l) * 0.5 + 0.5) * 255
      img.data[o + 2] = ((nz / l) * 0.5 + 0.5) * 255
      img.data[o + 3] = 255
    }
  }
  g.putImageData(img, 0, 0)
  const t = ctex(c, false)
  return t
}

function tilesTexture() {
  const S = 256
  const { c, g } = canvas(S, S)
  const r = rng(77)
  g.fillStyle = '#b9b08f'
  g.fillRect(0, 0, S, S)
  const n = 3
  const w = S / n
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const v = 0.93 + r() * 0.1
    const gr = g.createLinearGradient(i * w, j * w, (i + 1) * w, (j + 1) * w)
    gr.addColorStop(0, `rgb(${236 * v},${229 * v},${200 * v})`)
    gr.addColorStop(1, `rgb(${220 * v},${212 * v},${180 * v})`)
    g.fillStyle = gr
    g.beginPath()
    g.roundRect(i * w + 3, j * w + 3, w - 6, w - 6, 8)
    g.fill()
  }
  return ctex(c)
}

function mosaicTexture() {
  const S = 1024
  const { c, g } = canvas(S, S)
  const r = rng(5)
  g.fillStyle = '#10345a'
  g.fillRect(0, 0, S, S)
  const cx = S / 2, cy = S / 2, R = S / 2 - 6
  const rings = 46
  const palette = (rn: number, a: number): string => {
    const n = (r() - 0.5) * 24
    const mix = (rr: number, gg: number, bb: number) => `rgb(${Math.max(0, Math.min(255, rr + n))},${Math.max(0, Math.min(255, gg + n))},${Math.max(0, Math.min(255, bb + n))})`
    if (rn < 0.16) return mix(236, 178, 40)
    if (rn < 0.3) return Math.floor(a * 16 / TAU) % 2 ? mix(246, 214, 90) : mix(240, 240, 232)
    if (rn < 0.74) {
      const wave = Math.sin(a * 9 + rn * 26)
      if (wave > 0.6) return mix(190, 225, 232)
      return rn < 0.5 ? mix(30, 120, 160) : mix(18, 80, 140)
    }
    if (rn < 0.9) return Math.floor(a * 12 / TAU) % 2 ? mix(60, 130, 74) : mix(178, 96, 60)
    return mix(16, 48, 100)
  }
  for (let i = 0; i < rings; i++) {
    const r0 = (i / rings) * R
    const r1 = ((i + 1) / rings) * R
    const segs = Math.max(6, Math.floor((TAU * (r0 + r1) * 0.5) / 15))
    for (let s = 0; s < segs; s++) {
      const a0 = (s / segs) * TAU, a1 = ((s + 1) / segs) * TAU
      g.fillStyle = palette((r0 + r1) / 2 / R, (a0 + a1) / 2)
      g.beginPath()
      g.arc(cx, cy, r1 - 1, a0 + 0.01, a1 - 0.01)
      g.arc(cx, cy, r0 + 1, a1 - 0.01, a0 + 0.01, true)
      g.closePath()
      g.fill()
    }
  }
  return ctex(c, true, false)
}

function starTexture() {
  const S = 1024
  const { c, g } = canvas(S, S)
  const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
  gr.addColorStop(0, '#0a1238')
  gr.addColorStop(0.6, '#13226a')
  gr.addColorStop(1, '#24398a')
  g.fillStyle = gr
  g.fillRect(0, 0, S, S)
  const r = rng(9)
  for (let i = 0; i < 900; i++) {
    const a = r() * TAU, d = Math.sqrt(r()) * S * 0.5
    g.globalAlpha = 0.4 + r() * 0.6
    g.fillStyle = r() > 0.85 ? '#ffe9a8' : '#ffffff'
    const s = r() < 0.06 ? 3.2 : 0.8 + r() * 1.4
    g.beginPath()
    g.arc(S / 2 + Math.cos(a) * d, S / 2 + Math.sin(a) * d, s, 0, TAU)
    g.fill()
  }
  g.globalAlpha = 0.55
  g.strokeStyle = '#e8d38a'
  g.lineWidth = 1.5
  for (let k = 0; k < 6; k++) {
    g.beginPath()
    let x = S / 2 + (r() - 0.5) * S * 0.7, y = S / 2 + (r() - 0.5) * S * 0.7
    g.moveTo(x, y)
    for (let j = 0; j < 4; j++) { x += (r() - 0.5) * 140; y += (r() - 0.5) * 140; g.lineTo(x, y) }
    g.stroke()
  }
  g.globalAlpha = 1
  g.fillStyle = '#f3c75a'
  g.beginPath()
  g.arc(S / 2, S / 2, 46, 0, TAU)
  g.fill()
  g.strokeStyle = '#f3c75a'
  g.lineWidth = 5
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * TAU
    g.beginPath()
    g.moveTo(S / 2 + Math.cos(a) * 56, S / 2 + Math.sin(a) * 56)
    g.lineTo(S / 2 + Math.cos(a) * (i % 2 ? 86 : 108), S / 2 + Math.sin(a) * (i % 2 ? 86 : 108))
    g.stroke()
  }
  return ctex(c, true, false)
}

function leafClusterTexture() {
  const S = 512
  const { c, g } = canvas(S, S)
  const r = rng(31)
  const pal = ['#2f5d23', '#3b7129', '#477f2c', '#2a5220', '#5a8e34', '#356a27']
  for (let i = 0; i < 420; i++) {
    const a = r() * TAU
    const d = Math.sqrt(r()) * S * 0.44
    const x = S / 2 + Math.cos(a) * d
    const y = S / 2 + Math.sin(a) * d * 0.92
    const sz = 20 + r() * 20
    const shade = 0.55 + (1 - (y / S)) * 0.45 + (r() - 0.5) * 0.2
    g.save()
    g.translate(x, y)
    g.rotate(r() * TAU)
    const col = new THREE.Color(pal[(r() * pal.length) | 0]).multiplyScalar(shade)
    g.fillStyle = '#' + col.getHexString()
    g.beginPath()
    g.moveTo(0, -sz)
    g.bezierCurveTo(sz * 0.8, -sz * 0.5, sz * 0.7, sz * 0.5, 0, sz)
    g.bezierCurveTo(-sz * 0.7, sz * 0.5, -sz * 0.8, -sz * 0.5, 0, -sz)
    g.fill()
    g.strokeStyle = 'rgba(210,230,150,0.35)'
    g.lineWidth = 1
    g.beginPath()
    g.moveTo(0, -sz)
    g.lineTo(0, sz)
    g.stroke()
    g.restore()
  }
  return ctex(c, true, false)
}

function bigLeafTexture() {
  const S = 256
  const { c, g } = canvas(S, S)
  const gr = g.createLinearGradient(0, 0, S, S)
  gr.addColorStop(0, '#4fa35a')
  gr.addColorStop(1, '#2a7a3c')
  g.fillStyle = gr
  g.beginPath()
  g.moveTo(S / 2, S * 0.96)
  g.bezierCurveTo(S * 0.02, S * 0.7, S * 0.05, S * 0.12, S / 2, S * 0.04)
  g.bezierCurveTo(S * 0.95, S * 0.12, S * 0.98, S * 0.7, S / 2, S * 0.96)
  g.fill()
  g.strokeStyle = 'rgba(190,230,170,0.6)'
  g.lineWidth = 3
  g.beginPath()
  g.moveTo(S / 2, S * 0.96)
  g.lineTo(S / 2, S * 0.06)
  g.stroke()
  g.lineWidth = 1.5
  for (let i = 1; i < 9; i++) {
    const y = S * (0.9 - i * 0.095)
    for (const s of [-1, 1]) {
      g.beginPath()
      g.moveTo(S / 2, y)
      g.quadraticCurveTo(S / 2 + s * S * 0.2, y - S * 0.06, S / 2 + s * S * 0.38 * (1 - i * 0.05), y - S * 0.12)
      g.stroke()
    }
  }
  return ctex(c, true, false)
}

function palmTexture() {
  const W = 256, H = 512
  const { c, g } = canvas(W, H)
  g.strokeStyle = '#3d6a2a'
  g.lineWidth = 6
  g.beginPath()
  g.moveTo(W / 2, H)
  g.lineTo(W / 2, 4)
  g.stroke()
  const r = rng(13)
  for (let i = 0; i < 64; i++) {
    const y = H - 20 - i * ((H - 40) / 64)
    const len = (W / 2 - 4) * Math.sin(Math.PI * Math.min(1, (i + 6) / 70)) * (0.85 + r() * 0.15)
    for (const s of [-1, 1]) {
      g.strokeStyle = i % 2 ? '#4a7f33' : '#356128'
      g.lineWidth = 3.4
      g.beginPath()
      g.moveTo(W / 2, y)
      g.quadraticCurveTo(W / 2 + s * len * 0.6, y - 10, W / 2 + s * len, y + 14 + r() * 8)
      g.stroke()
    }
  }
  return ctex(c, true, false)
}

function barkTexture() {
  const S = 256
  const { c, g } = canvas(S, S)
  const r = rng(3)
  g.fillStyle = '#7b765f'
  g.fillRect(0, 0, S, S)
  for (let i = 0; i < 260; i++) {
    g.globalAlpha = 0.35
    const cols = ['#a79f86', '#5b5a47', '#8c8a6c', '#c0b9a0', '#4c4a3b']
    g.fillStyle = cols[(r() * cols.length) | 0]
    const w = 8 + r() * 36, h = 10 + r() * 50
    g.beginPath()
    g.ellipse(r() * S, r() * S, w, h, 0, 0, TAU)
    g.fill()
  }
  g.globalAlpha = 1
  return ctex(c)
}

function jungleTexture() {
  const W = 256, H = 256
  const { c, g } = canvas(W, H)
  const gr = g.createLinearGradient(0, 0, 0, H)
  gr.addColorStop(0, '#9fcf9a')
  gr.addColorStop(1, '#274f2c')
  g.fillStyle = gr
  g.fillRect(0, 0, W, H)
  const r = rng(21)
  for (let i = 0; i < 70; i++) {
    g.save()
    g.translate(r() * W, H * (0.3 + r() * 0.7))
    g.rotate((r() - 0.5) * 2.4)
    g.fillStyle = `rgba(${20 + r() * 40},${80 + r() * 90},${30 + r() * 40},0.75)`
    g.beginPath()
    g.ellipse(0, 0, 8 + r() * 22, 26 + r() * 34, 0, 0, TAU)
    g.fill()
    g.restore()
  }
  return ctex(c, true, false)
}

function cityTexture() {
  const S = 256
  const { c, g } = canvas(S, S)
  const r = rng(61)
  g.fillStyle = '#8a4b38'
  g.fillRect(0, 0, S, S)
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = r() > 0.5 ? 'rgba(60,25,15,0.15)' : 'rgba(210,150,110,0.12)'
    g.fillRect(r() * S, r() * S, 6 + r() * 6, 3)
  }
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
    const x = i * 64 + 14, y = j * 64 + 10
    g.fillStyle = '#e9e5d8'
    g.fillRect(x - 3, y - 3, 42, 46)
    g.fillStyle = r() > 0.7 ? '#e7d79a' : '#2b3947'
    g.fillRect(x, y, 36, 40)
    g.fillStyle = '#e9e5d8'
    g.fillRect(x + 17, y, 2, 40)
  }
  return ctex(c)
}

function shopBandTexture() {
  const W = 512, H = 64
  const { c, g } = canvas(W, H)
  const r = rng(8)
  for (let y = 0; y < H; y += 8) for (let x = 0; x < W; x += 8) {
    const v = 0.85 + r() * 0.3
    g.fillStyle = `rgb(${50 * v},${120 * v},${86 * v})`
    g.fillRect(x + 0.5, y + 0.5, 7, 7)
  }
  return ctex(c)
}

export async function loadMats(onProgress: (p: number) => void, maxAniso = 8) {
  const mgr = new THREE.LoadingManager()
  const loaded = new Promise<void>((res) => {
    mgr.onLoad = () => res()
  })
  mgr.onProgress = (_u, l, t) => onProgress(l / Math.max(1, t))
  const tl = new THREE.TextureLoader(mgr)

  const tx = (url: string, tile: number, srgb: boolean) => {
    const t = tl.load(url)
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.anisotropy = maxAniso
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
    t.repeat.set(1 / tile, 1 / tile)
    return t
  }
  const pbr = (d: string, n: string, tile: number, o: THREE.MeshStandardMaterialParameters & { ns?: number } = {}) => {
    const { ns, ...rest } = o
    return new THREE.MeshStandardMaterial({ map: tx(d, tile, true), normalMap: tx(n, tile, false), normalScale: new THREE.Vector2(ns ?? 1, ns ?? 1), roughness: 0.9, ...rest })
  }

  const stucco = patch(pbr(stuccoD, stuccoN, 2.2, { color: '#e3dcb0', roughness: 0.92, ns: 0.7 }), { grime: 0.9, macro: 0.25, key: 'stucco' })
  const stuccoSand = patch(pbr(stuccoD, stuccoN, 2.2, { color: '#c6b27f', roughness: 0.8, ns: 0.7 }), { grime: 0.8, macro: 0.2, key: 'sand' })
  const stuccoColumn = patch(pbr(stuccoD, stuccoN, 2.2, { color: '#b98d68', roughness: 0.8, ns: 0.6 }), { grime: 0.8, macro: 0.2, key: 'col' })
  const stuccoIn = pbr(stuccoD, stuccoN, 2.2, { color: '#e8e1bd', roughness: 0.95, ns: 0.6, envMapIntensity: 0.55 })
  const stuccoInSand = pbr(stuccoD, stuccoN, 2.2, { color: '#cdb98a', roughness: 0.85, envMapIntensity: 0.55 })
  const concrete = patch(pbr(concD, concN, 3, { color: '#c4c1b6', roughness: 0.95 }), { grime: 0.3, macro: 0.3, key: 'conc' })
  const cobble = patch(pbr(cobbleD, cobbleN, 3.2, { color: '#b2b9c8', roughness: 0.88, ns: 1.0 }), { macro: 0.5, key: 'cobble' })
  const herring = patch(pbr(herrD, herrN, 2.6, { color: '#c4c0ba', roughness: 0.85 }), { macro: 0.35, key: 'herr' })
  const grass = patch(pbr(grassD, grassN, 4.5, { color: '#86b46c', roughness: 1, ns: 1.4 }), { macro: 0.7, key: 'grass' })
  const gravel = patch(pbr(gravelD, gravelN, 3, { color: '#cfc7b4', roughness: 1 }), { macro: 0.4, key: 'gravel' })
  const rock = pbr(rockD, rockN, 2.2, { color: '#b7b7a8', roughness: 0.95, ns: 1.5 })
  const wood = pbr(woodD, woodN, 1.4, { color: '#a89a88', roughness: 0.9 })
  const brick = patch(pbr(brickD, brickN, 2.4, { color: '#c9a392', roughness: 0.9, ns: 1.3 }), { grime: 0.6, macro: 0.25, key: 'brick' })
  const floorSlab = pbr(slabD, slabN, 3, { color: '#d9cfb6', roughness: 0.55, envMapIntensity: 0.6 })
  const floorSlabDark = pbr(slabD, slabN, 3, { color: '#8e8a7c', roughness: 0.5, envMapIntensity: 0.6 })

  const tilesTex = tilesTexture()
  tilesTex.repeat.set(1 / 0.45, 1 / 0.45)
  const tiles = new THREE.MeshStandardMaterial({ map: tilesTex, roughness: 0.22, metalness: 0.0, envMapIntensity: 1 })
  const tilesIn = tiles.clone()
  tilesIn.envMapIntensity = 0.6
  const shopTex = shopBandTexture()
  shopTex.repeat.set(1 / 6, 1 / 0.7)
  const shopBand = new THREE.MeshStandardMaterial({ map: shopTex, roughness: 0.25 })

  const mullion = new THREE.MeshStandardMaterial({ color: '#d4d8d2', roughness: 0.38, metalness: 0.55 })
  const frameDark = new THREE.MeshStandardMaterial({ color: '#2d3236', roughness: 0.5, metalness: 0.6 })
  const steelDark = new THREE.MeshStandardMaterial({ color: '#3a3f44', roughness: 0.45, metalness: 0.7 })
  const bronze = new THREE.MeshStandardMaterial({ color: '#7a5a3a', roughness: 0.4, metalness: 0.8 })
  const stone = patch(pbr(concD, concN, 2, { color: '#cfcbc0', roughness: 0.85 }), { grime: 0.5, key: 'stone' })
  const whiteMetal = new THREE.MeshStandardMaterial({ color: '#e9e7de', roughness: 0.42, metalness: 0.45, side: THREE.DoubleSide })
  const roofDark = new THREE.MeshStandardMaterial({ color: '#4a4c49', roughness: 0.85 })
  const brownColumn = new THREE.MeshStandardMaterial({ color: '#5d4636', roughness: 0.6, metalness: 0.1 })
  const pipe = new THREE.MeshStandardMaterial({ color: '#d8ccaa', roughness: 0.55, envMapIntensity: 0.5 })
  const planter = new THREE.MeshStandardMaterial({ color: '#2c2b27', roughness: 0.9 })

  const glass = new THREE.MeshPhysicalMaterial({
    color: '#a4bfc9', metalness: 0.85, roughness: 0.04, transparent: true, opacity: 0.27,
    envMapIntensity: 1.1, side: THREE.DoubleSide, depthWrite: false,
  })
  const glassIn = glass.clone()
  glassIn.opacity = 0.22
  const slit = new THREE.MeshStandardMaterial({ color: '#cfe3f2', emissive: new THREE.Color('#bcd6ee'), emissiveIntensity: 0.9, roughness: 0.4 })

  const bark = new THREE.MeshStandardMaterial({ map: barkTexture(), roughness: 1, color: '#c8c2aa' })
  bark.map!.repeat.set(2, 3)
  const leafTex = leafClusterTexture()
  const leaf = new THREE.MeshStandardMaterial({ map: leafTex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.85, emissive: new THREE.Color('#0c1c06'), emissiveIntensity: 0.6 })
  const bigLeaf = new THREE.MeshStandardMaterial({ map: bigLeafTexture(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.5 })
  const palm = new THREE.MeshStandardMaterial({ map: palmTexture(), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.6 })
  const hedge = patch(pbr(grassD, grassN, 1.2, { color: '#3c6a2a', roughness: 1, ns: 2 }), { macro: 0.5, key: 'hedge' })

  const mosaic = new THREE.MeshStandardMaterial({ map: mosaicTexture(), roughness: 0.3, envMapIntensity: 0.5 })
  const stars = new THREE.MeshBasicMaterial({ map: starTexture(), side: THREE.DoubleSide })
  const jungle = new THREE.MeshStandardMaterial({ map: jungleTexture(), emissiveMap: null, emissive: new THREE.Color('#cfe8c0'), emissiveIntensity: 0.55, roughness: 1 })
  jungle.emissiveMap = jungle.map
  const cityTex = cityTexture()
  cityTex.repeat.set(1 / 11, 1 / 11)
  const city = new THREE.MeshStandardMaterial({ map: cityTex, roughness: 0.95, color: '#cdbfb6' })
  const pondBed = new THREE.MeshStandardMaterial({ color: '#16221d', roughness: 1 })
  const lilyPad = new THREE.MeshStandardMaterial({ color: '#3d7a35', roughness: 0.5, side: THREE.DoubleSide })
  const bulb = new THREE.MeshStandardMaterial({ color: '#fff3d2', emissive: new THREE.Color('#ffd9a0'), emissiveIntensity: 0, roughness: 0.4 })
  const windowGlow = new THREE.MeshStandardMaterial({ color: '#2b3a47', emissive: new THREE.Color('#ffc880'), emissiveIntensity: 0, roughness: 0.3, metalness: 0.2, side: THREE.DoubleSide })

  const waterNormal = waterNormalTexture()
  const lilyWater = new THREE.MeshStandardMaterial({
    color: '#1d3b36', roughness: 0.08, metalness: 0.1, normalMap: waterNormal, normalScale: new THREE.Vector2(0.35, 0.35), transparent: true, opacity: 0.88, envMapIntensity: 1.2,
  })
  lilyWater.normalMap!.repeat.set(0.35, 0.35)

  await loaded
  return {
    stucco, stuccoSand, stuccoColumn, stuccoIn, stuccoInSand, concrete, cobble, herring, grass, gravel, rock, wood, brick, floorSlab, floorSlabDark,
    tiles, tilesIn, shopBand, mullion, frameDark, steelDark, bronze, stone, whiteMetal, roofDark, brownColumn, pipe, planter,
    glass, glassIn, slit, bark, leaf, bigLeaf, palm, hedge, mosaic, stars, jungle, city, pondBed, lilyPad, bulb, windowGlow, waterNormal, lilyWater,
  }
}

export type Mats = Awaited<ReturnType<typeof loadMats>>

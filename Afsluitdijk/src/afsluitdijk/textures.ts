import * as THREE from 'three'
import { fbm, hash2, worley, clamp01, lerp, smoothstep } from './noise'

interface Px {
  r: number
  g: number
  b: number
  h: number
  rough: number
}

export interface PBR {
  map: THREE.CanvasTexture
  normalMap: THREE.CanvasTexture
  roughnessMap: THREE.CanvasTexture
}

let ANISO = 8
export function setAnisotropy(a: number) {
  ANISO = a
}

function tex(canvas: HTMLCanvasElement, srgb: boolean, tile: [number, number]) {
  const t = new THREE.CanvasTexture(canvas)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(1 / tile[0], 1 / tile[1])
  t.anisotropy = ANISO
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
  t.needsUpdate = true
  return t
}

function bake(
  w: number,
  h: number,
  tile: [number, number],
  normalStrength: number,
  fn: (x: number, y: number, u: number, v: number, o: Px) => void,
): PBR {
  const heights = new Float32Array(w * h)
  const col = document.createElement('canvas')
  col.width = w
  col.height = h
  const rc = document.createElement('canvas')
  rc.width = w
  rc.height = h
  const cg = col.getContext('2d')!
  const rg = rc.getContext('2d')!
  const cd = cg.createImageData(w, h)
  const rd = rg.createImageData(w, h)
  const o: Px = { r: 0.5, g: 0.5, b: 0.5, h: 0.5, rough: 0.8 }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      o.rough = 0.8
      o.h = 0.5
      fn(x, y, x / w, y / h, o)
      const i = (y * w + x) * 4
      cd.data[i] = clamp01(o.r) * 255
      cd.data[i + 1] = clamp01(o.g) * 255
      cd.data[i + 2] = clamp01(o.b) * 255
      cd.data[i + 3] = 255
      const rr = clamp01(o.rough) * 255
      rd.data[i] = rr
      rd.data[i + 1] = rr
      rd.data[i + 2] = rr
      rd.data[i + 3] = 255
      heights[y * w + x] = o.h
    }
  }
  cg.putImageData(cd, 0, 0)
  rg.putImageData(rd, 0, 0)
  const nc = document.createElement('canvas')
  nc.width = w
  nc.height = h
  const ng = nc.getContext('2d')!
  const nd = ng.createImageData(w, h)
  for (let y = 0; y < h; y++) {
    const ym = ((y - 1 + h) % h) * w
    const yp = ((y + 1) % h) * w
    const y0 = y * w
    for (let x = 0; x < w; x++) {
      const xm = (x - 1 + w) % w
      const xp = (x + 1) % w
      const dx = heights[y0 + xp] - heights[y0 + xm]
      const dy = heights[yp + x] - heights[ym + x]
      let nx = -dx * normalStrength
      let ny = dy * normalStrength
      let nz = 1
      const l = Math.sqrt(nx * nx + ny * ny + nz * nz)
      nx /= l
      ny /= l
      nz /= l
      const i = (y0 + x) * 4
      nd.data[i] = (nx * 0.5 + 0.5) * 255
      nd.data[i + 1] = (ny * 0.5 + 0.5) * 255
      nd.data[i + 2] = (nz * 0.5 + 0.5) * 255
      nd.data[i + 3] = 255
    }
  }
  ng.putImageData(nd, 0, 0)
  return { map: tex(col, true, tile), normalMap: tex(nc, false, tile), roughnessMap: tex(rc, false, tile) }
}

export interface TextureSet {
  asphalt: PBR
  levvelPattern: PBR
  concrete: PBR
  basalt: PBR
  brick: PBR
  stone: PBR
  paving: PBR
  grass: PBR
  rubble: PBR
  water: THREE.CanvasTexture
}

const BRICKS: [number, number, number][] = [
  [140, 84, 58],
  [124, 72, 52],
  [152, 98, 68],
  [112, 66, 50],
  [160, 112, 78],
  [132, 78, 56],
]

export async function buildTextures(progress: (p: number, label: string) => void): Promise<TextureSet> {
  const tick = () => new Promise<void>((r) => setTimeout(r, 0))
  const steps = 9
  let n = 0
  const step = async (label: string) => {
    n++
    progress(0.1 + (n / steps) * 0.55, label)
    await tick()
  }

  progress(0.1, 'Mixing asphalt')
  await tick()
  const asphalt = bake(512, 512, [4, 4], 3.2, (x, y, u, v, o) => {
    const low = fbm(u * 6, v * 6, 6, 3, 11)
    const agg = fbm(u * 64, v * 64, 64, 2, 12)
    const chip = hash2(x, y, 13)
    let L = 0.255 + 0.07 * (agg - 0.5) + 0.08 * (low - 0.5)
    if (chip > 0.962) L += 0.1 * hash2(x, y, 14) + 0.05
    else if (chip < 0.03) L -= 0.05
    const crack = Math.abs(fbm(u * 5 + 0.3, v * 5 + 0.7, 5, 4, 15) - 0.5)
    if (crack < 0.01) L *= 0.55
    o.r = L * 1.02
    o.g = L
    o.b = L * 1.04
    o.h = agg * 0.6 + (chip > 0.962 ? 0.4 : 0) + (crack < 0.01 ? -0.3 : 0)
    o.rough = 0.95 - 0.2 * (chip > 0.962 ? 1 : 0)
  })
  await step('Casting Levvel blocks')

  // 2 x 2 blocks in running bond: block 2.3 m + joint = 2.4 x 2.8 m
  const levvelPattern = bake(512, 512, [4.8, 5.6], 4.0, (x, y, u, v, o) => {
    const row = Math.floor(y / 256)
    const yin = y % 256
    const xo = (x + (row % 2 ? 128 : 0)) % 512
    const bx = Math.floor(xo / 256)
    const xin = xo % 256
    const joint = xin < 7 || yin < 7
    const edge = Math.min(xin - 7, 255 - xin, yin - 7, 255 - yin)
    const tint = (hash2(bx, row, 3) - 0.5) * 0.08
    const stain = fbm(u * 24, v * 3 + bx, 24, 3, 21)
    const pores = hash2(x, y, 4) > 0.996 ? 0.08 : 0
    let L = 0.53 + tint + (fbm(u * 48, v * 48, 48, 3, 22) - 0.5) * 0.1 - (stain - 0.5) * 0.12 - pores
    if (joint) {
      L = 0.12 + hash2(x, y, 9) * 0.04
      o.h = 0
      o.rough = 1
    } else {
      o.h = 0.55 + smoothstep(0, 9, edge) * 0.45 + (fbm(u * 64, v * 64, 64, 2, 23) - 0.5) * 0.08
      o.rough = 0.88
      if (edge < 3) L *= 0.82
    }
    o.r = L * 1.02
    o.g = L * 0.99
    o.b = L * 0.93
  })
  await step('Pouring concrete')

  const concrete = bake(256, 256, [2, 2], 2.0, (x, y, u, v, o) => {
    const n1 = fbm(u * 6, v * 6, 6, 4, 31)
    const n2 = fbm(u * 64, v * 64, 64, 2, 32)
    const pores = hash2(x, y, 33) > 0.992 ? 0.1 : 0
    const L = 0.54 + (n1 - 0.5) * 0.18 + (n2 - 0.5) * 0.08 - pores
    o.r = L * 1.02
    o.g = L * 0.99
    o.b = L * 0.93
    o.h = n2 * 0.6 + n1 * 0.4 - pores * 3
    o.rough = 0.9
  })
  await step('Laying basalt')

  const basalt = bake(512, 512, [2.8, 2.8], 7.0, (x, y, u, v, o) => {
    const [f1, f2, id] = worley(u, v, 12, 41, 0.95)
    const d = f2 - f1
    const L = 0.18 + id * 0.1 + (fbm(u * 40, v * 40, 40, 3, 42) - 0.5) * 0.07
    const edge = smoothstep(0.0, 0.12, d)
    const shade = lerp(0.35, 1, edge)
    o.r = L * shade * 0.97
    o.g = L * shade
    o.b = L * shade * 1.07
    o.h = edge * 0.8 + (1 - f1) * 0.2 + hash2(x, y, 43) * 0.03
    o.rough = 0.72 + id * 0.15
  })
  await step('Firing brick')

  const brick = bake(1024, 560, [1.76, 0.96], 4.5, (x, y, u, v, o) => {
    const course = Math.floor(y / 35)
    const yin = y % 35
    const xo = (x + (course % 2 ? 64 : 0)) % 1024
    const bi = Math.floor(xo / 128)
    const xin = xo % 128
    const noise = fbm(u * 80, v * 80, 80, 3, 51)
    const wash = fbm(u * 5, v * 5, 5, 3, 52)
    if (yin < 7 || xin < 4) {
      const m = 0.62 + (noise - 0.5) * 0.12
      o.r = m * 0.93
      o.g = m * 0.88
      o.b = m * 0.78
      o.h = 0.2 + noise * 0.12
      o.rough = 0.95
      return
    }
    const idx = Math.floor(hash2(bi, course, 7) * BRICKS.length) % BRICKS.length
    const c = BRICKS[idx]
    const burn = (hash2(bi, course, 8) - 0.5) * 0.12
    const k = 1 + burn + (noise - 0.5) * 0.28 + (wash - 0.5) * 0.12
    const ex = Math.min(xin - 4, 127 - xin)
    const ey = Math.min(yin - 7, 34 - yin)
    const rim = smoothstep(0, 4, Math.min(ex, ey))
    o.r = (c[0] / 255) * k * (0.9 + 0.1 * rim)
    o.g = (c[1] / 255) * k * (0.9 + 0.1 * rim)
    o.b = (c[2] / 255) * k * (0.9 + 0.1 * rim)
    o.h = 0.55 + rim * 0.4 + (noise - 0.5) * 0.12
    o.rough = 0.88
  })
  await step('Quarrying limestone')

  const stone = bake(512, 512, [2, 2], 2.5, (x, y, u, v, o) => {
    const bed = fbm(u * 3, v * 26, 3, 4, 61)
    const n = fbm(u * 50, v * 50, 50, 3, 62)
    const pore = hash2(x, y, 63) > 0.985 ? 0.07 : 0
    const L = 0.66 + (bed - 0.5) * 0.12 + (n - 0.5) * 0.07 - pore
    o.r = L
    o.g = L * 0.965
    o.b = L * 0.86
    o.h = n * 0.7 + bed * 0.3 - pore * 4
    o.rough = 0.86
  })
  await step('Paving the plaza')

  const paving = bake(512, 512, [2.4, 2.4], 3.5, (x, y, u, v, o) => {
    const tx = Math.floor(x / 128)
    const ty = Math.floor(y / 128)
    const xin = x % 128
    const yin = y % 128
    const n = fbm(u * 70, v * 70, 70, 3, 71)
    const tint = (hash2(tx, ty, 72) - 0.5) * 0.07
    if (xin < 3 || yin < 3) {
      const g = 0.2 + n * 0.08
      o.r = g
      o.g = g * 0.98
      o.b = g * 0.92
      o.h = 0
      o.rough = 1
      return
    }
    const edge = Math.min(xin - 3, 127 - xin, yin - 3, 127 - yin)
    const L = 0.5 + tint + (n - 0.5) * 0.12 + (fbm(u * 6, v * 6, 6, 2, 73) - 0.5) * 0.08
    o.r = L
    o.g = L * 0.985
    o.b = L * 0.955
    o.h = 0.6 + smoothstep(0, 4, edge) * 0.3 + (n - 0.5) * 0.1
    o.rough = 0.88
  })
  await step('Growing dike grass')

  const grass = bake(512, 512, [5, 5], 2.2, (x, y, u, v, o) => {
    const macro = fbm(u * 4, v * 4, 4, 4, 81)
    const mid = fbm(u * 24, v * 24, 24, 3, 82)
    const fine = hash2(x, y, 83)
    const dry = smoothstep(0.45, 0.75, macro)
    const r = lerp(0.2, 0.42, dry) + (mid - 0.5) * 0.1 + (fine - 0.5) * 0.08
    const g = lerp(0.33, 0.4, dry) + (mid - 0.5) * 0.12 + (fine - 0.5) * 0.08
    const b = lerp(0.12, 0.17, dry) + (mid - 0.5) * 0.05
    o.r = r
    o.g = g
    o.b = b
    o.h = mid * 0.6 + fine * 0.4
    o.rough = 0.95
  })
  await step('Stacking riprap')

  const rubble = bake(512, 512, [3, 3], 6, (_x, _y, u, v, o) => {
    const [f1, f2, id] = worley(u, v, 6, 91, 1)
    const d = f2 - f1
    const n = fbm(u * 60, v * 60, 60, 3, 92)
    const L = 0.27 + id * 0.22 + (n - 0.5) * 0.1
    const edge = smoothstep(0, 0.2, d)
    const k = lerp(0.3, 1, edge)
    o.r = L * k * (1 + id * 0.1)
    o.g = L * k * 0.97
    o.b = L * k * (0.92 - id * 0.05)
    o.h = edge * 0.85 + (1 - f1) * 0.15 + n * 0.08
    o.rough = 0.9
  })

  // water normal map (height only)
  const wn = bake(512, 512, [1, 1], 5.0, (_x: number, _y: number, u: number, v: number, o: Px) => {
    const wx = fbm(u * 4 + 0.7, v * 4 + 0.2, 4, 3, 101)
    const wy = fbm(u * 4 + 0.1, v * 4 + 0.9, 4, 3, 102)
    const h1 = fbm(u * 8 + (wx - 0.5) * 1.2, v * 8 + (wy - 0.5) * 1.2, 8, 5, 103)
    const h2 = fbm(u * 24 + (wy - 0.5) * 0.6, v * 24 + (wx - 0.5) * 0.6, 24, 3, 104)
    o.h = h1 * 0.8 + h2 * 0.2
  })
  wn.map.dispose()
  wn.roughnessMap.dispose()
  wn.normalMap.repeat.set(1, 1)
  progress(0.68, 'Raising the dike')
  await tick()

  return { asphalt, levvelPattern, concrete, basalt, brick, stone, paving, grass, rubble, water: wn.normalMap }
}

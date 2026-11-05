import * as THREE from 'three'
import { hash, nz, clamp, lerp, smooth } from './noise'

// ---------------------------------------------------------------------------
// Procedural PBR texture baking: albedo + tangent-space normal + ORM(G=rough,B=metal)
// + optional emissive, all generated on <canvas> at start-up (no external assets).
// ---------------------------------------------------------------------------

export interface Px {
  r: number; g: number; b: number // sRGB 0..1
  h: number // height
  rough: number
  metal: number
  er: number; eg: number; eb: number // emissive 0..1
}

export interface PBR {
  map: THREE.CanvasTexture
  normalMap: THREE.CanvasTexture
  orm: THREE.CanvasTexture
  emissiveMap?: THREE.CanvasTexture
}

let ANISO = 8
export const setAnisotropy = (a: number) => { ANISO = a }

function mkTex(c: HTMLCanvasElement, srgb: boolean, repeat: [number, number]) {
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(repeat[0], repeat[1])
  t.anisotropy = ANISO
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
  t.generateMipmaps = true
  t.minFilter = THREE.LinearMipmapLinearFilter
  t.needsUpdate = true
  return t
}

const canvas = (w: number, h: number) => {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

/**
 * @param tileM  world size (m) covered by one tile, used to compute repeat for world-UV materials
 */
export function bake(
  w: number, h: number, tileM: [number, number], nStrength: number, emissive: boolean,
  fn: (x: number, y: number, u: number, v: number, o: Px) => void,
): PBR {
  const H = new Float32Array(w * h)
  const cc = canvas(w, h), oc = canvas(w, h)
  const ec = emissive ? canvas(w, h) : null
  const cg = cc.getContext('2d')!, og = oc.getContext('2d')!
  const cd = cg.createImageData(w, h), od = og.createImageData(w, h)
  const ed = ec ? ec.getContext('2d')!.createImageData(w, h) : null
  const o: Px = { r: 0.5, g: 0.5, b: 0.5, h: 0, rough: 0.8, metal: 0, er: 0, eg: 0, eb: 0 }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      o.r = o.g = o.b = 0.5; o.h = 0; o.rough = 0.8; o.metal = 0; o.er = o.eg = o.eb = 0
      fn(x, y, x / w, y / h, o)
      const i = y * w + x
      H[i] = o.h
      const k = i * 4
      cd.data[k] = clamp(o.r) * 255; cd.data[k + 1] = clamp(o.g) * 255; cd.data[k + 2] = clamp(o.b) * 255; cd.data[k + 3] = 255
      od.data[k] = 255; od.data[k + 1] = clamp(o.rough) * 255; od.data[k + 2] = clamp(o.metal) * 255; od.data[k + 3] = 255
      if (ed) { ed.data[k] = clamp(o.er) * 255; ed.data[k + 1] = clamp(o.eg) * 255; ed.data[k + 2] = clamp(o.eb) * 255; ed.data[k + 3] = 255 }
    }
  }
  cg.putImageData(cd, 0, 0)
  og.putImageData(od, 0, 0)
  if (ec && ed) ec.getContext('2d')!.putImageData(ed, 0, 0)
  // normal from height (wrapping)
  const nc = canvas(w, h)
  const ng = nc.getContext('2d')!
  const nd = ng.createImageData(w, h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const xl = H[y * w + ((x - 1 + w) % w)], xr = H[y * w + ((x + 1) % w)]
      const yu = H[((y - 1 + h) % h) * w + x], yd = H[((y + 1) % h) * w + x]
      let nx = (xl - xr) * nStrength, ny = (yd - yu) * nStrength, nzz = 1
      const l = Math.hypot(nx, ny, nzz)
      nx /= l; ny /= l; nzz /= l
      const k = (y * w + x) * 4
      nd.data[k] = (nx * 0.5 + 0.5) * 255; nd.data[k + 1] = (ny * 0.5 + 0.5) * 255; nd.data[k + 2] = (nzz * 0.5 + 0.5) * 255; nd.data[k + 3] = 255
    }
  }
  ng.putImageData(nd, 0, 0)
  const rep: [number, number] = [1 / tileM[0], 1 / tileM[1]]
  return {
    map: mkTex(cc, true, rep),
    normalMap: mkTex(nc, false, rep),
    orm: mkTex(oc, false, rep),
    emissiveMap: ec ? mkTex(ec, true, rep) : undefined,
  }
}

// ----------------------------------------------------------------------------
// Facade bakers (4x4 cells per texture, each cell = one bay x one floor)
// ----------------------------------------------------------------------------
export const FACADE_CELLS = 4
type CellFn = (lx: number, ly: number, bw: number, fh: number, rnd: number, rnd2: number, o: Px, cx: number, cy: number) => void

function facade(bw: number, fh: number, size: number, nStrength: number, seed: number, fn: CellFn): PBR {
  const cp = size / FACADE_CELLS
  const t = bake(size, size, [1, 1], nStrength, true, (x, y, _u, _v, o) => {
    const cx = Math.floor(x / cp), cy = Math.floor(y / cp)
    const lx = (((x % cp) + 0.5) / cp) * bw
    const ly = (1 - ((y % cp) + 0.5) / cp) * fh
    fn(lx, ly, bw, fh, hash(cx, cy, seed), hash(cx, cy, seed + 99), o, cx, cy)
  })
  for (const k of [t.map, t.normalMap, t.orm, t.emissiveMap!]) k.repeat.set(1, 1)
  return t
}

const set = (o: Px, r: number, g: number, b: number, rough: number, metal = 0, h = 0) => {
  o.r = r; o.g = g; o.b = b; o.rough = rough; o.metal = metal; o.h = h
}

/** shared glass look inside a window: reflective sky tint + occasional curtains + lit rooms at night */
function windowGlass(o: Px, lx: number, ly: number, y0: number, y1: number, rnd: number, rnd2: number, tint: [number, number, number], calm = false) {
  const t = (ly - y0) / (y1 - y0)
  const g = 0.55 + 0.45 * t // lighter reflection toward top
  let r = tint[0] * g, gg = tint[1] * g, b = tint[2] * g
  let rough = 0.06, metal = 0.55
  // blinds / curtains
  if (rnd > (calm ? 0.94 : 0.72)) {
    const lower = 0.35 + rnd2 * 0.65
    if (t > 1 - lower) { r = 0.62 + rnd2 * 0.1; gg = 0.6 + rnd2 * 0.08; b = 0.52; rough = 0.85; metal = 0 }
  } else if (rnd < (calm ? 0.03 : 0.14)) {
    r = 0.55; gg = 0.5; b = 0.42; rough = 0.9; metal = 0 // closed curtain
  }
  o.r = r; o.g = gg; o.b = b; o.rough = rough; o.metal = metal
  void lx
  // lit window at night (emissive)
  if (rnd2 > 0.58 && (rnd > 0.1)) {
    const warm = 0.7 + 0.3 * hash(Math.floor(rnd * 1000), 5)
    o.er = 1.0 * warm; o.eg = 0.78 * warm; o.eb = 0.5 * warm
  }
}

export function brickFacade(seed: number, pal: [number, number, number], winW = 0.46, winH = 0.5, size = 1024): PBR {
  return facade(3.2, 3.2, size, 3.2, seed, (lx, ly, bw, fh, rnd, rnd2, o) => {
    const ww = bw * winW, wh = fh * winH, wx0 = (bw - ww) / 2, wy0 = fh * 0.3
    const inWin = lx > wx0 && lx < wx0 + ww && ly > wy0 && ly < wy0 + wh
    const fr = 0.07
    const inFrame = lx > wx0 - fr && lx < wx0 + ww + fr && ly > wy0 - fr && ly < wy0 + wh + fr
    if (inWin) {
      const mid = Math.abs(lx - (wx0 + ww / 2)) < 0.025 || Math.abs(ly - (wy0 + wh * 0.62)) < 0.025
      if (mid) { set(o, 0.88, 0.88, 0.86, 0.5, 0, -0.1) } else {
        windowGlass(o, lx, ly, wy0, wy0 + wh, rnd, rnd2, [0.16, 0.22, 0.27]); o.h = -0.25
      }
      return
    }
    if (inFrame) { set(o, 0.9, 0.9, 0.88, 0.45, 0, -0.1); return }
    // sill
    if (lx > wx0 - 0.1 && lx < wx0 + ww + 0.1 && ly > wy0 - 0.13 && ly <= wy0 - fr) { set(o, 0.7, 0.68, 0.64, 0.8, 0, 0.35); return }
    // brick
    const ch = 0.075
    const course = Math.floor(ly / ch)
    const sold = ly > wy0 + wh + fr && ly < wy0 + wh + fr + 0.14 && lx > wx0 - 0.12 && lx < wx0 + ww + 0.12
    const off = (course % 2) * 0.1075
    const bi = Math.floor((lx + off) / 0.215)
    const fx = (lx + off) / 0.215 - bi
    const fy = ly / ch - course
    const mortar = sold ? (fx < 0.06 || fx > 0.94) : fy < 0.12 || fx < 0.045
    const id = hash(bi + course * 17, Math.floor(rnd * 1000), seed)
    const n = nz(lx * 0.31, ly * 0.31)
    if (mortar) {
      const v = 0.52 + n * 0.12
      set(o, v, v * 0.97, v * 0.9, 0.95, 0, -0.35)
    } else {
      const t = (id - 0.5) * 0.22 + (n - 0.5) * 0.12
      const sheen = id > 0.93 ? 0.8 : 1
      set(o, (pal[0] + t) * sheen, (pal[1] + t * 0.7) * sheen, (pal[2] + t * 0.55) * sheen, 0.85, 0, 0.1 + id * 0.12 - 0.04 * fy)
    }
    // soot streaks under window sills
    const streak = nz(lx * 2.3 + 0.2, ly * 0.2) * smooth(wy0, wy0 - 0.9, ly) * (lx > wx0 && lx < wx0 + ww ? 1 : 0)
    if (streak > 0.5 && ly < wy0) { const k = 1 - (streak - 0.5) * 0.35; o.r *= k; o.g *= k; o.b *= k }
  })
}

export function concreteRibbonFacade(seed: number, tone = 0.55, size = 1024): PBR {
  return facade(3.6, 3.4, size, 4, seed, (lx, ly, bw, _fh, rnd, rnd2, o) => {
    const mull = lx < 0.07 || lx > bw - 0.07
    if (ly < 0.34) { // slab edge
      const n = nz(lx * 0.2, ly * 0.5)
      const v = tone * 1.08 + (n - 0.5) * 0.08
      set(o, v, v * 0.99, v * 0.95, 0.88, 0, 0.5)
      return
    }
    if (ly > 1.02 && ly < 2.38) {
      if (mull) { set(o, 0.2, 0.17, 0.14, 0.4, 0.85, 0.05); return }
      windowGlass(o, lx, ly, 1.02, 2.38, rnd, rnd2, [0.14, 0.2, 0.22]); o.h = -0.3
      if (ly > 2.3 || ly < 1.1) { set(o, 0.18, 0.15, 0.12, 0.4, 0.85, 0.0) }
      return
    }
    // board-formed spandrel
    const board = Math.floor(ly / 0.14)
    const bf = ly / 0.14 - board
    const bt = hash(board, 3, seed)
    const n = nz(lx * 0.25, ly * 4.0 + bt)
    const n2 = nz(lx * 1.7, ly * 0.4)
    const stain = nz(lx * 0.6, ly * 0.08) * smooth(1.0, 0.4, ly) // rain streaks under ledges
    let v = tone + (n - 0.5) * 0.12 + (bt - 0.5) * 0.06 - (stain - 0.4) * 0.12 - (n2 - 0.5) * 0.03
    if (bf < 0.08) v *= 0.82
    set(o, v, v * 0.99, v * 0.96, 0.9, 0, (n - 0.5) * 0.25 - (bf < 0.08 ? 0.3 : 0) + 0.2)
  })
}

export function curtainFacade(seed: number, tint: [number, number, number], size = 1024): PBR {
  return facade(1.5, 3.8, size, 3.0, seed, (lx, ly, bw, fh, rnd, rnd2, o) => {
    const mull = lx < 0.045 || lx > bw - 0.045
    const trans = ly > fh - 0.07 || ly < 0.07
    if (mull || trans) { set(o, 0.52, 0.54, 0.56, 0.32, 0.95, 0.4); return }
    if (ly > 2.72 && ly < fh - 0.07) { // spandrel
      const n = nz(lx * 0.5, ly * 0.5)
      set(o, 0.2 + n * 0.04, 0.24 + n * 0.04, 0.27 + n * 0.04, 0.35, 0.3, 0.05)
      return
    }
    windowGlass(o, lx, ly, 0.07, 2.72, rnd, rnd2, tint, true); o.h = -0.12
    // slight panel-to-panel tint differences
    const k = 0.92 + 0.16 * hash(0, 0, 0) * 0 + (rnd2 - 0.5) * 0.08
    if (o.metal > 0.3) { o.r *= k; o.g *= k; o.b *= k }
  })
}

export function panelFacade(seed: number, tone: [number, number, number], size = 1024): PBR {
  return facade(3.0, 3.6, size, 3.0, seed, (lx, ly, bw, _fh, rnd, rnd2, o) => {
    const ww = 1.9, wh = 2.25, wx0 = (bw - ww) / 2, wy0 = 0.7
    const inWin = lx > wx0 && lx < wx0 + ww && ly > wy0 && ly < wy0 + wh
    const fr = 0.09
    const inFrame = lx > wx0 - fr && lx < wx0 + ww + fr && ly > wy0 - fr && ly < wy0 + wh + fr
    if (inWin) {
      if (Math.abs(lx - bw / 2) < 0.03) { set(o, 0.22, 0.23, 0.25, 0.4, 0.9, 0.0); return }
      windowGlass(o, lx, ly, wy0, wy0 + wh, rnd, rnd2, [0.15, 0.21, 0.25]); o.h = -0.3
      return
    }
    if (inFrame) { set(o, 0.2, 0.21, 0.22, 0.4, 0.9, -0.05); return }
    const pw = 1.5, ph = 1.2
    const px = lx % pw, py = ly % ph
    const joint = px < 0.012 || py < 0.012
    const pid = hash(Math.floor(lx / pw), Math.floor(ly / ph) + Math.floor(rnd * 9), seed)
    const n = nz(lx * 0.4, ly * 0.4)
    const v = 1 + (pid - 0.5) * 0.06 + (n - 0.5) * 0.06
    if (joint) set(o, tone[0] * 0.5, tone[1] * 0.5, tone[2] * 0.5, 0.95, 0, -0.4)
    else set(o, tone[0] * v, tone[1] * v, tone[2] * v, 0.62, 0.05, 0.1 + (n - 0.5) * 0.1)
  })
}

export function industrialFacade(seed: number, tone: [number, number, number], size = 512): PBR {
  return facade(3.0, 4.0, size, 3.0, seed, (lx, ly, _bw, _fh, rnd, rnd2, o) => {
    if (ly < 0.9) { const n = nz(lx * 0.3, ly * 0.3); const v = 0.5 + n * 0.1; set(o, v, v, v * 0.97, 0.9, 0, 0.3); return }
    if (rnd > 0.75 && ly > 2.7 && ly < 3.2 && lx > 0.4 && lx < 2.6) {
      windowGlass(o, lx, ly, 2.7, 3.2, rnd, rnd2, [0.15, 0.2, 0.24]); o.h = -0.1; return
    }
    const rib = (lx / 0.12) % 1
    const shade = 0.88 + 0.12 * Math.sin(rib * Math.PI)
    const n = nz(lx * 0.3, ly * 0.07)
    set(o, tone[0] * shade * (0.94 + n * 0.1), tone[1] * shade * (0.94 + n * 0.1), tone[2] * shade * (0.94 + n * 0.1), 0.5, 0.55, Math.sin(rib * Math.PI) * 0.35)
  })
}

// ----------------------------------------------------------------------------
// Ground / world textures
// ----------------------------------------------------------------------------
export function makeAsphalt(red = false): PBR {
  return bake(512, 512, [5, 5], 3.2, false, (x, y, u, v, o) => {
    const low = nz(u * 3, v * 3), mid = nz(u * 16, v * 16), agg = hash(x, y, 13)
    let L = 0.25 + (low - 0.5) * 0.08 + (mid - 0.5) * 0.06 + (agg - 0.5) * 0.07
    if (agg > 0.97) L += 0.12
    const patch = smooth(0.62, 0.7, nz(u * 5 + 0.3, v * 5)) // patched sections
    L += patch * 0.03
    if (red) set(o, L * 2.5 + 0.12, L * 0.9 + 0.04, L * 0.8 + 0.04, 0.88, 0, mid * 0.5 + agg * 0.4)
    else set(o, L, L * 1.0, L * 1.04, 0.9 - patch * 0.1, 0, mid * 0.5 + agg * 0.4)
  })
}

export function makePaving(): PBR {
  return bake(512, 512, [3, 3], 3.5, false, (x, y, u, v, o) => {
    const T = 8 // tiles per texture -> 0.375 m
    const tx = Math.floor(u * T), ty = Math.floor(v * T)
    const fx = u * T - tx, fy = v * T - ty
    const joint = fx < 0.045 || fy < 0.045
    const id = hash(tx, ty, 71)
    const n = nz(u * 12, v * 12)
    const fine = hash(x, y, 72)
    if (joint) { const c = 0.28 + n * 0.1; set(o, c, c * 0.98, c * 0.92, 1, 0, -0.5); return }
    const L = 0.56 + (id - 0.5) * 0.1 + (n - 0.5) * 0.12 + (fine - 0.5) * 0.04
    set(o, L, L * 0.99, L * 0.95, 0.82, 0, 0.1 + (n - 0.5) * 0.1 + (fine - 0.5) * 0.05)
  })
}

export function makeClinker(): PBR {
  return bake(512, 512, [2.4, 2.4], 3.5, false, (_x, _y, u, v, o) => {
    const rows = 24
    const row = Math.floor(v * rows)
    const cols = 12
    const uu = u * cols + (row % 2) * 0.5
    const col = Math.floor(uu)
    const fx = uu - col, fy = v * rows - row
    const id = hash(col, row, 91)
    const mortar = fx < 0.07 || fy < 0.1
    const n = nz(u * 9, v * 9)
    if (mortar) { set(o, 0.42 + n * 0.1, 0.4 + n * 0.1, 0.36 + n * 0.08, 1, 0, -0.5); return }
    const t = (id - 0.5) * 0.3
    set(o, 0.5 + t * 0.6 + (n - 0.5) * 0.1, 0.27 + t * 0.35, 0.2 + t * 0.25, 0.85, 0, 0.1 + id * 0.1)
  })
}

export function makeGrass(): PBR {
  return bake(512, 512, [9, 9], 2.2, false, (x, y, u, v, o) => {
    const macro = nz(u * 3, v * 3)
    const mid = nz(u * 18, v * 18)
    const fine = hash(x, y, 83)
    const blade = nz(u * 120, v * 120)
    const dry = smooth(0.45, 0.9, nz(u * 5 + 0.4, v * 5 + 0.1)) * 0.45
    const r = lerp(0.17, 0.33, dry) + (mid - 0.5) * 0.07 + (fine - 0.5) * 0.06 + (blade - 0.5) * 0.04
    const g = lerp(0.3, 0.37, dry) + (mid - 0.5) * 0.1 + (fine - 0.5) * 0.08 + (blade - 0.5) * 0.06 + (macro - 0.5) * 0.04
    const b = lerp(0.08, 0.13, dry) + (mid - 0.5) * 0.03 + (fine - 0.5) * 0.04
    set(o, r, g, b, 0.95, 0, mid * 0.5 + blade * 0.4 + fine * 0.2)
  })
}

export function makeConcrete(boards = false, tone = 0.58): PBR {
  return bake(512, 512, [4, 4], 4.0, false, (x, y, u, v, o) => {
    const n1 = nz(u * 4, v * 4), n2 = nz(u * 32, v * 32), pore = hash(x, y, 33) > 0.992 ? 0.1 : 0
    const stain = nz(u * 3, v * 0.8 + 0.2)
    let L = tone + (n1 - 0.5) * 0.14 + (n2 - 0.5) * 0.08 - pore - (stain - 0.5) * 0.1
    let h = n2 * 0.5 + n1 * 0.2 - pore * 4
    if (boards) {
      const bi = Math.floor(v * 24), bf = v * 24 - bi
      const bt = hash(bi, 5, 7)
      L += (bt - 0.5) * 0.06
      if (bf < 0.07) { L *= 0.78; h -= 0.6 }
      h += nz(u * 6 + bt, v * 100) * 0.3
      // butt joints every 4.0 m
      if (Math.abs(((u * 4 + bt * 3) % 1) - 0.0) < 0.004) { L *= 0.8; h -= 0.4 }
    }
    set(o, L, L * 0.995, L * 0.96, 0.9, 0, h)
  })
}

export function makeRoofing(): PBR {
  return bake(512, 512, [6, 6], 3.0, false, (x, y, u, v, o) => {
    const n = nz(u * 8, v * 8), g = hash(x, y, 44)
    const stain = nz(u * 3 + 0.5, v * 3)
    const L = 0.2 + (n - 0.5) * 0.06 + (g - 0.5) * (g > 0.8 ? 0.25 : 0.05) + (stain - 0.5) * 0.05
    set(o, L, L * 1.0, L * 1.02, 0.95, 0, g * 0.5 + n * 0.4)
  })
}

export function makeTiles(): PBR {
  return bake(512, 512, [2, 2], 5, false, (_x, _y, u, v, o) => {
    const rows = 16, cols = 8
    const row = Math.floor(v * rows)
    const uu = u * cols + (row % 2) * 0.5
    const col = Math.floor(uu)
    const fx = uu - col, fy = v * rows - row
    const id = hash(col, row, 55)
    const n = nz(u * 10, v * 10)
    const lip = smooth(0.0, 0.25, fy) * (1 - smooth(0.85, 1, fy))
    const wave = Math.sin(fx * Math.PI)
    const moss = smooth(0.62, 0.8, nz(u * 6 + 0.1, v * 6)) * 0.4
    const t = (id - 0.5) * 0.12 + (n - 0.5) * 0.08
    const edgeShade = 0.6 + 0.4 * lip
    set(o, (0.43 + t + moss * -0.1) * edgeShade, (0.17 + t * 0.5 + moss * 0.18) * edgeShade, (0.11 + t * 0.3) * edgeShade, 0.78, 0, wave * 0.4 + fy * 0.6)
  })
}

export function makeWaterNormal(): THREE.CanvasTexture {
  const t = bake(512, 512, [1, 1], 6.0, false, (_x, _y, u, v, o) => {
    const wx = nz(u * 3 + 0.7, v * 3 + 0.2), wy = nz(u * 3 + 0.1, v * 3 + 0.9)
    const h1 = nz(u * 8 + (wx - 0.5) * 0.5, v * 8 + (wy - 0.5) * 0.5)
    const h2 = nz(u * 24 + (wy - 0.5) * 0.3, v * 24 + (wx - 0.5) * 0.3)
    o.h = h1 * 0.75 + h2 * 0.25
  })
  t.map.dispose(); t.orm.dispose()
  t.normalMap.repeat.set(1, 1)
  return t.normalMap
}

export function makeLeaf(): PBR {
  return bake(256, 256, [3, 3], 4, false, (x, y, u, v, o) => {
    const n = nz(u * 6, v * 6), m = nz(u * 28, v * 28), f = hash(x, y, 9)
    const k = 0.7 + (m - 0.5) * 0.9 + (n - 0.5) * 0.3
    set(o, 0.12 * k + (f - 0.5) * 0.03, 0.27 * k + (f - 0.5) * 0.05, 0.07 * k, 0.8, 0, m * 0.8 + f * 0.2)
  })
}

export function makeBark(): PBR {
  return bake(128, 256, [0.5, 1.5], 5, false, (x, y, u, v, o) => {
    const n = nz(u * 10, v * 3), s = nz(u * 30, v * 8)
    const L = 0.2 + n * 0.12 - (s > 0.6 ? 0.07 : 0)
    set(o, L * 1.05, L * 0.9, L * 0.78, 0.95, 0, n * 0.7 + s * 0.3 + hash(x, y, 2) * 0.05)
  })
}

export function makeGravel(): PBR {
  return bake(256, 256, [3, 3], 6, false, (x, y, u, v, o) => {
    const f = hash(x, y, 21), n = nz(u * 20, v * 20)
    const L = 0.45 + (f - 0.5) * 0.28 + (n - 0.5) * 0.12
    set(o, L * 1.02, L * 0.97, L * 0.86, 0.95, 0, f * 0.8 + n * 0.3)
  })
}

export function makeSand(): PBR {
  return bake(256, 256, [3, 3], 2, false, (x, y, u, v, o) => {
    const f = hash(x, y, 31), n = nz(u * 9, v * 9)
    const L = 0.62 + (f - 0.5) * 0.08 + (n - 0.5) * 0.1
    set(o, L, L * 0.9, L * 0.7, 0.95, 0, f * 0.3 + n * 0.3)
  })
}

export function makePitch(): PBR {
  return bake(512, 512, [8, 8], 2, false, (x, y, u, v, o) => {
    const stripe = Math.floor(v * 8) % 2
    const n = nz(u * 20, v * 20), f = hash(x, y, 61)
    const k = stripe ? 1.08 : 0.94
    set(o, (0.15 + (n - 0.5) * 0.04 + (f - 0.5) * 0.04) * k, (0.35 + (n - 0.5) * 0.06 + (f - 0.5) * 0.05) * k, (0.1 + (f - 0.5) * 0.03) * k, 0.92, 0, n * 0.5 + f * 0.3)
  })
}

// Sprite textures --------------------------------------------------------
export function makeCloudSprite(): THREE.CanvasTexture {
  const c = canvas(128, 128)
  const g = c.getContext('2d')!
  const grd = g.createRadialGradient(64, 64, 4, 64, 64, 62)
  grd.addColorStop(0, 'rgba(255,255,255,1)')
  grd.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grd
  g.fillRect(0, 0, 128, 128)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

import * as THREE from 'three'

/* ------------------------------------------------------------------ noise */
export function hash2(x: number, y: number, s: number) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041)) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}
function vnoise(x: number, y: number, px: number, py: number, s: number) {
  const xi = Math.floor(x), yi = Math.floor(y)
  const xf = x - xi, yf = y - yi
  const x0 = ((xi % px) + px) % px, y0 = ((yi % py) + py) % py
  const x1 = (x0 + 1) % px, y1 = (y0 + 1) % py
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf)
  const a = hash2(x0, y0, s), b = hash2(x1, y0, s), c = hash2(x0, y1, s), d = hash2(x1, y1, s)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}
/** Tileable fractal noise in [0,1]. */
export function fbm(u: number, v: number, bx: number, by: number, oct: number, seed: number) {
  let sum = 0, amp = 0.5, tot = 0
  for (let o = 0; o < oct; o++) {
    const fx = bx * (1 << o), fy = by * (1 << o)
    sum += amp * vnoise(u * fx, v * fy, fx, fy, seed + o * 17)
    tot += amp
    amp *= 0.5
  }
  return sum / tot
}
const sstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
const frac = (x: number) => x - Math.floor(x)

/* ------------------------------------------------------------ PBR baking */
export interface PBR {
  map: THREE.CanvasTexture
  normal: THREE.CanvasTexture
  rough: THREE.CanvasTexture
}
type Shade = (u: number, v: number, o: Float32Array) => void // o: h,r,g,b,rough

let ANISO = 8
export function setAniso(a: number) {
  ANISO = a
}

function tex(c: HTMLCanvasElement, srgb: boolean) {
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.anisotropy = ANISO
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
  t.needsUpdate = true
  return t
}

export function makePBR(size: number, shade: Shade, normalStrength = 2): PBR {
  const N = size * size
  const H = new Float32Array(N)
  const mk = () => {
    const c = document.createElement('canvas')
    c.width = c.height = size
    const g = c.getContext('2d')!
    return { c, g, img: g.createImageData(size, size) }
  }
  const col = mk(), rgh = mk(), nrm = mk()
  const o = new Float32Array(5)
  const cl = (x: number) => (x < 0 ? 0 : x > 255 ? 255 : x)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x
      shade((x + 0.5) / size, (y + 0.5) / size, o)
      H[i] = o[0]
      const k = i * 4
      col.img.data[k] = cl(o[1]); col.img.data[k + 1] = cl(o[2]); col.img.data[k + 2] = cl(o[3]); col.img.data[k + 3] = 255
      rgh.img.data[k] = 255; rgh.img.data[k + 1] = cl(o[4] * 255); rgh.img.data[k + 2] = 255; rgh.img.data[k + 3] = 255
    }
  }
  for (let y = 0; y < size; y++) {
    const ym = ((y - 1 + size) % size) * size, yp = ((y + 1) % size) * size, yc = y * size
    for (let x = 0; x < size; x++) {
      const xm = (x - 1 + size) % size, xp = (x + 1) % size
      const dx = H[yc + xp] - H[yc + xm]
      const dy = H[yp + x] - H[ym + x]
      let nx = -dx * normalStrength, ny = dy * normalStrength, nz = 1
      const l = Math.hypot(nx, ny, nz)
      nx /= l; ny /= l; nz /= l
      const k = (yc + x) * 4
      nrm.img.data[k] = (nx * 0.5 + 0.5) * 255
      nrm.img.data[k + 1] = (ny * 0.5 + 0.5) * 255
      nrm.img.data[k + 2] = (nz * 0.5 + 0.5) * 255
      nrm.img.data[k + 3] = 255
    }
  }
  col.g.putImageData(col.img, 0, 0)
  rgh.g.putImageData(rgh.img, 0, 0)
  nrm.g.putImageData(nrm.img, 0, 0)
  return { map: tex(col.c, true), normal: tex(nrm.c, false), rough: tex(rgh.c, false) }
}

/* -------------------------------------------------------------- patterns */
const facadeShade: Shade = (u, v, o) => {
  // 6 m x 6 m tile, panels 1.5 m x 3 m (Rietveld-style prefabricated cladding)
  const pu = u * 4, pv = v * 2
  const ix = Math.floor(pu), iy = Math.floor(pv)
  const fu = pu - ix, fv = pv - iy
  const dm = Math.min(Math.min(fu, 1 - fu) * 1.5, Math.min(fv, 1 - fv) * 3)
  const tint = (hash2(ix, iy, 7) - 0.5) * 0.09
  const mott = fbm(u, v, 6, 6, 5, 3)
  const streak = fbm(u, v, 14, 2, 4, 11)
  const pore = vnoise(u * 256, v * 256, 256, 256, 9) > 0.86 ? 1 : 0
  const fine = vnoise(u * 512, v * 512, 512, 512, 21)
  let k = 1 + tint + (mott - 0.5) * 0.2 - (streak - 0.5) * 0.14 + (fine - 0.5) * 0.06
  let h = mott * 0.25 + fine * 0.12
  if (dm < 0.007) { k *= 0.5; h = -1 }
  else if (dm < 0.022) { const t = (0.022 - dm) / 0.015; k *= 1 - t * 0.12; h -= t * 0.5 }
  if (pore) { k *= 0.78; h -= 0.4 }
  o[0] = h
  o[1] = 176 * k; o[2] = 154 * k; o[3] = 128 * k
  o[4] = 0.86 - mott * 0.1
}

const zincShade: Shade = (u, v, o) => {
  // 4.8 m tile, standing seams every 0.6 m, cross joints every 2.4 m
  const pu = u * 8
  const ix = Math.floor(pu)
  const fu = pu - ix
  const d = Math.min(fu, 1 - fu) * 0.6
  const fv = frac(v * 2)
  const dv = Math.min(fv, 1 - fv) * 2.4
  const streak = fbm(u, v, 64, 3, 3, 5)
  const tint = (hash2(ix, Math.floor(v * 2), 4) - 0.5) * 0.1
  const fine = vnoise(u * 400, v * 400, 400, 400, 33)
  let k = 1 + tint + (streak - 0.5) * 0.22 + (fine - 0.5) * 0.04
  let h = (streak - 0.5) * 0.1
  if (d < 0.011) { k *= 1.18; h = 1 }
  else if (d < 0.024) { k *= 0.82; h = 0.2 }
  if (dv < 0.004) { k *= 0.55; h = -0.8 }
  o[0] = h
  o[1] = 126 * k; o[2] = 136 * k; o[3] = 140 * k
  o[4] = 0.36 + streak * 0.22
}

const parquetShade: Shade = (u, v, o) => {
  // 4 m tile, boards 0.125 m x 1 m, staggered
  const row = Math.floor(v * 32)
  const s = hash2(row, 3, 1)
  const pb = u * 4 + s
  const b = ((Math.floor(pb) % 4) + 4) % 4
  const fu = frac(pb)
  const fv = frac(v * 32)
  const id = hash2(row, b, 8)
  const grain = fbm(u + id, v, 3, 120, 3, 12 + (id * 5) | 0)
  const grain2 = vnoise(u * 40 + id * 9, v * 700, 40, 700, 4)
  let k = 0.82 + id * 0.3 + (grain - 0.5) * 0.35 + (grain2 - 0.5) * 0.08
  let h = (grain - 0.5) * 0.15
  const gap = Math.min(fv, 1 - fv) * 0.125 < 0.0012 || Math.min(fu, 1 - fu) * 1 < 0.0016
  if (gap) { k *= 0.35; h = -1 }
  o[0] = h
  o[1] = 152 * k; o[2] = 120 * k; o[3] = 86 * k
  o[4] = 0.4 + grain * 0.22
}

const stoneShade: Shade = (u, v, o) => {
  // 3.6 m tile, 0.9 m honed limestone slabs
  const pu = u * 4, pv = v * 4
  const ix = Math.floor(pu), iy = Math.floor(pv)
  const dm = Math.min(Math.min(frac(pu), 1 - frac(pu)), Math.min(frac(pv), 1 - frac(pv))) * 0.9
  const vein = 1 - sstep(0, 0.035, Math.abs(fbm(u + hash2(ix, iy, 2), v, 3, 3, 4, 19 + ((hash2(ix, iy, 5) * 4) | 0)) - 0.5))
  const cloud = fbm(u, v, 8, 8, 5, 6)
  const sp = vnoise(u * 600, v * 600, 600, 600, 2)
  const tint = (hash2(ix, iy, 3) - 0.5) * 0.06
  let k = 1 + tint + (cloud - 0.5) * 0.12 - vein * 0.1 + (sp - 0.5) * 0.04
  let h = (cloud - 0.5) * 0.1
  if (dm < 0.0035) { k *= 0.62; h = -1 }
  o[0] = h
  o[1] = 212 * k; o[2] = 203 * k; o[3] = 186 * k
  o[4] = 0.28 + cloud * 0.3
}

const plasterShade: Shade = (u, v, o) => {
  const a = fbm(u, v, 8, 8, 5, 41)
  const f = vnoise(u * 420, v * 420, 420, 420, 3)
  const k = 0.96 + (a - 0.5) * 0.08 + (f - 0.5) * 0.05
  o[0] = a * 0.5 + f * 0.25
  o[1] = o[2] = o[3] = 245 * k
  o[4] = 0.88
}

const grassShade: Shade = (u, v, o) => {
  const lo = fbm(u, v, 5, 5, 5, 14)
  const patch = fbm(u, v, 3, 3, 3, 90)
  const b1 = vnoise(u * 300, v * 300, 300, 300, 1)
  const b2 = vnoise(u * 700, v * 700, 700, 700, 2)
  const bl = b1 * 0.55 + b2 * 0.45
  const k = 0.7 + lo * 0.5 + (bl - 0.5) * 0.5
  const yel = patch * 0.5
  o[0] = bl * 0.9
  o[1] = (74 + yel * 55) * k; o[2] = (108 + yel * 20) * k; o[3] = 40 * k
  o[4] = 0.95
}

const brickPaveShade: Shade = (u, v, o) => {
  // 2 m tile, clinker 0.2 x 0.05 running bond
  const row = Math.floor(v * 40)
  const fu0 = u * 10 + (row % 2) * 0.5
  const ix = ((Math.floor(fu0) % 10) + 10) % 10
  const fu = frac(fu0), fv = frac(v * 40)
  const dmu = Math.min(fu, 1 - fu) * 0.2, dmv = Math.min(fv, 1 - fv) * 0.05
  const id = hash2(ix, row, 5)
  const n = fbm(u, v, 24, 24, 3, 2)
  const sp = vnoise(u * 500, v * 500, 500, 500, 7)
  let k = 0.82 + id * 0.36 + (n - 0.5) * 0.12 + (sp - 0.5) * 0.1
  let h = n * 0.2 + sp * 0.1
  let r = 148, g = 96, b = 78
  if (id > 0.82) { r = 128; g = 88; b = 78 } else if (id < 0.18) { r = 160; g = 104; b = 76 }
  if (Math.min(dmu, dmv) < 0.0035) { r = 82; g = 77; b = 70; k = 0.9 + n * 0.2; h = -1 }
  o[0] = h
  o[1] = r * k; o[2] = g * k; o[3] = b * k
  o[4] = 0.84
}

const asphaltShade: Shade = (u, v, o) => {
  const n = fbm(u, v, 10, 10, 4, 31)
  const s = vnoise(u * 500, v * 500, 500, 500, 8)
  const s2 = vnoise(u * 200, v * 200, 200, 200, 9)
  const k = 0.85 + (n - 0.5) * 0.3 + (s > 0.8 ? 0.35 : 0) + (s2 - 0.5) * 0.1
  o[0] = s * 0.8 + n * 0.3
  o[1] = 64 * k; o[2] = 65 * k; o[3] = 68 * k
  o[4] = 0.9
}

const redAsphaltShade: Shade = (u, v, o) => {
  const n = fbm(u, v, 10, 10, 4, 51)
  const s = vnoise(u * 500, v * 500, 500, 500, 18)
  const k = 0.9 + (n - 0.5) * 0.3 + (s > 0.8 ? 0.25 : 0)
  o[0] = s * 0.7
  o[1] = 150 * k; o[2] = 70 * k; o[3] = 58 * k
  o[4] = 0.88
}

const woodShade: Shade = (u, v, o) => {
  const g = fbm(u, v, 3, 80, 4, 71)
  const g2 = vnoise(u * 10, v * 600, 10, 600, 5)
  const k = 0.8 + g * 0.4 + (g2 - 0.5) * 0.12
  o[0] = (g - 0.5) * 0.2
  o[1] = 150 * k; o[2] = 104 * k; o[3] = 64 * k
  o[4] = 0.42 + g2 * 0.12
}

const brickWallShade: Shade = (u, v, o) => {
  // 2 m tile, 0.21 x 0.065 bricks
  const rows = 30
  const row = Math.floor(v * rows)
  const cols = 10
  const fu0 = u * cols + (row % 2) * 0.5
  const ix = ((Math.floor(fu0) % cols) + cols) % cols
  const fu = frac(fu0), fv = frac(v * rows)
  const gapU = Math.min(fu, 1 - fu) * 0.2, gapV = Math.min(fv, 1 - fv) * 0.0667
  const id = hash2(ix, row, 15)
  const n = fbm(u, v, 20, 20, 3, 8)
  let k = 0.78 + id * 0.45 + (n - 0.5) * 0.2
  let r = 128, g = 62, b = 44
  if (id > 0.85) { r = 98; g = 58; b = 48 }
  let h = n * 0.2
  if (Math.min(gapU, gapV) < 0.0045) { r = 150; g = 142; b = 128; k = 0.9; h = -1 }
  o[0] = h
  o[1] = r * k; o[2] = g * k; o[3] = b * k
  o[4] = 0.9
}

/* ------------------------------------------------------- canvas utilities */
export function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, srgb = true) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')!
  draw(g, w, h)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
  t.anisotropy = ANISO
  t.needsUpdate = true
  return t
}

function leafTexture() {
  return canvasTex(512, 512, (g, w, h) => {
    g.clearRect(0, 0, w, h)
    let s = 7
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647)
    for (let i = 0; i < 420; i++) {
      const x = r() * w, y = r() * h
      const sz = 16 + r() * 22
      const t = r()
      g.save()
      g.translate(x, y)
      g.rotate(r() * Math.PI * 2)
      const L = 28 + t * 40, S = 70 + t * 40
      g.fillStyle = `hsl(${88 + r() * 28} ${L}% ${S * 0.4 + 8}%)`
      g.beginPath()
      g.moveTo(0, -sz)
      g.quadraticCurveTo(sz * 0.75, -sz * 0.1, 0, sz)
      g.quadraticCurveTo(-sz * 0.75, -sz * 0.1, 0, -sz)
      g.fill()
      g.strokeStyle = 'rgba(30,50,15,0.35)'
      g.lineWidth = 1
      g.beginPath()
      g.moveTo(0, -sz)
      g.lineTo(0, sz)
      g.stroke()
      g.restore()
    }
  })
}

/* ------------------------------------------------------------- materials */
const T = (m: THREE.Material, w: number, h = w) => {
  m.userData.tile = [w, h]
  return m
}
function pbrMat(p: PBR, tile: number, o: Partial<THREE.MeshStandardMaterialParameters> = {}, nScale = 1) {
  const m = new THREE.MeshStandardMaterial({
    map: p.map,
    normalMap: p.normal,
    normalScale: new THREE.Vector2(nScale, nScale),
    roughnessMap: p.rough,
    roughness: 1,
    metalness: 0,
    ...o,
  })
  return T(m, tile) as THREE.MeshStandardMaterial
}

export type Materials = Awaited<ReturnType<typeof createMaterials>>

export async function createMaterials(onStep?: (label: string, p: number) => void) {
  const step = async (l: string, p: number) => {
    onStep?.(l, p)
    await new Promise((r) => setTimeout(r, 30))
  }
  await step('Cladding the Rietveld building', 0.08)
  const facade = pbrMat(makePBR(1024, facadeShade, 2.2), 6, {}, 1)
  await step('Rolling titanium-zinc for the Kurokawa wing', 0.16)
  const zinc = pbrMat(makePBR(1024, zincShade, 2.5), 4.8, { metalness: 0.7 }, 1)
  await step('Laying oak parquet', 0.24)
  const parquet = pbrMat(makePBR(1024, parquetShade, 1.6), 4, {}, 0.7)
  await step('Polishing limestone floors', 0.32)
  const stone = pbrMat(makePBR(1024, stoneShade, 1.4), 3.6, {}, 0.6)
  const plasterP = makePBR(512, plasterShade, 1.2)
  await step('Plastering gallery walls', 0.4)
  const grassP = makePBR(1024, grassShade, 3)
  const grass = pbrMat(grassP, 6, {}, 1.2)
  await step('Paving Museumplein', 0.48)
  const brick = pbrMat(makePBR(1024, brickPaveShade, 2.6), 2, {}, 1)
  const asphalt = pbrMat(makePBR(512, asphaltShade, 2), 3, {}, 1)
  const redAsphalt = pbrMat(makePBR(512, redAsphaltShade, 2), 3, {}, 1)
  const wood = pbrMat(makePBR(512, woodShade, 1.2), 1.2, {}, 0.5)
  const brickWall = pbrMat(makePBR(1024, brickWallShade, 2.4), 2, {}, 1)

  const plain = (c: string, rough = 0.85, metal = 0, tile = 2) => T(new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: metal }), tile) as THREE.MeshStandardMaterial
  const wallCache = new Map<string, THREE.MeshStandardMaterial>()
  const wall = (c: string) => {
    let m = wallCache.get(c)
    if (!m) {
      m = pbrMat(plasterP, 2, { color: c }, 0.5)
      wallCache.set(c, m)
    }
    return m
  }
  const white = wall('#f2efe8')

  const leaf = new THREE.MeshStandardMaterial({
    map: leafTexture(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.85, color: '#ffffff',
  })
  const bark = plain('#5a4d40', 0.95)

  const glass = new THREE.MeshStandardMaterial({
    color: '#cfe6ee', roughness: 0.04, metalness: 0.0, transparent: true, opacity: 0.16, envMapIntensity: 2.2, depthWrite: false,
  })
  T(glass, 1)
  const ceilingLight = new THREE.MeshStandardMaterial({ color: '#fff7e8', emissive: '#fff0d4', emissiveIntensity: 1.2, roughness: 0.6 })
  T(ceilingLight, 1)

  return {
    facade, zinc, parquet, stone, grass, brick, asphalt, redAsphalt, wood, brickWall, wall, white, leaf, bark, glass, ceilingLight,
    steel: plain('#e8eaec', 0.4, 0.6, 1),
    darkMetal: plain('#2b2d30', 0.45, 0.7, 1),
    brass: plain('#b8934a', 0.3, 0.9, 1),
    gold: plain('#c79a3a', 0.28, 1, 1),
    blackFrame: plain('#1b1a19', 0.55, 0, 1),
    concrete: wall('#cfcdc7'),
    skirting: plain('#f4f1ea', 0.6, 0, 1),
    leather: plain('#3b2a22', 0.55, 0, 1),
    fabric: plain('#2f4a5c', 0.95, 0, 1),
    yellow: plain('#f2c230', 0.6, 0, 1),
    teal: plain('#16343c', 0.55, 0, 1),
    deskTop: plain('#e9e6df', 0.35, 0, 1),
    plant: plain('#3d6a2c', 0.9, 0, 1),
    pot: plain('#e7e2d6', 0.7, 0, 1),
    roofTop: plain('#8a8d8e', 0.85, 0, 3),
  }
}

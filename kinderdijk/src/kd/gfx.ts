import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

export const TAU = Math.PI * 2
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
export const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}

export function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const hash = (x: number, y: number, s: number) => {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 982451653)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295
}
export function noise2(x: number, y: number, s = 0) {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const xf = x - xi
  const yf = y - yi
  const u = xf * xf * (3 - 2 * xf)
  const v = yf * yf * (3 - 2 * yf)
  const a = hash(xi, yi, s)
  const b = hash(xi + 1, yi, s)
  const c = hash(xi, yi + 1, s)
  const d = hash(xi + 1, yi + 1, s)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}
export function fbm(x: number, y: number, s = 0, oct = 4) {
  let a = 0.5
  let f = 1
  let sum = 0
  let norm = 0
  for (let i = 0; i < oct; i++) {
    sum += a * noise2(x * f, y * f, s + i * 17)
    norm += a
    f *= 2
    a *= 0.5
  }
  return sum / norm
}

/* ------------------------------------------------------------------ wind */
export const windU = { uTime: { value: 0 }, uWind: { value: 0.5 } }

export function addSway(mat: THREE.Material, o: { amp: number; h: number; pow?: number }) {
  const pow = (o.pow ?? 1.6).toFixed(2)
  mat.onBeforeCompile = (s) => {
    s.uniforms.uTime = windU.uTime
    s.uniforms.uWind = windU.uWind
    s.vertexShader =
      'uniform float uTime;\nuniform float uWind;\n' +
      s.vertexShader.replace(
        '#include <begin_vertex>',
        `
      vec3 transformed = vec3( position );
      #ifdef USE_INSTANCING
        vec3 wp0 = ( modelMatrix * instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ) ).xyz;
      #else
        vec3 wp0 = ( modelMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ) ).xyz;
      #endif
      float swW = pow( clamp( position.y / ${o.h.toFixed(2)}, 0.0, 1.0 ), ${pow} );
      float swP = wp0.x * 0.31 + wp0.z * 0.23;
      float swG = sin( uTime * 1.7 + swP ) + 0.5 * sin( uTime * 3.1 + swP * 2.3 );
      transformed.x += swG * ${o.amp.toFixed(3)} * swW * ( 0.3 + uWind );
      transformed.z += cos( uTime * 1.3 + swP * 1.4 ) * ${o.amp.toFixed(3)} * 0.7 * swW * ( 0.3 + uWind );
    `,
      )
  }
  mat.customProgramCacheKey = () => `sway${o.amp}_${o.h}_${pow}`
}

/* -------------------------------------------------------------- geometry */
export function scaleUV(g: THREE.BufferGeometry, su: number, sv: number, start = 0, count?: number) {
  const uv = g.attributes.uv
  const n = count ?? uv.count - start
  for (let i = start; i < start + n; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv)
}

/** Box with UVs in metres (tile = size of one texture repeat in metres). */
export function boxGeo(w: number, h: number, d: number, tile = 1) {
  const g = new THREE.BoxGeometry(w, h, d)
  const dims: [number, number][] = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]]
  dims.forEach(([a, b], i) => scaleUV(g, a / tile, b / tile, i * 4, 4))
  return g
}

/** Octagon (or n-gon) frustum, flat shaded, origin at base centre. Faces centred on axes when seg = 8. */
export function frustumGeo(rBot: number, rTop: number, h: number, seg = 8, tile = 1.5, open = true) {
  let g: THREE.BufferGeometry = new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, open)
  g.rotateY(Math.PI / seg)
  g.translate(0, h / 2, 0)
  g = g.toNonIndexed()
  g.computeVertexNormals()
  const circ = TAU * ((rTop + rBot) / 2)
  const slant = Math.hypot(h, rBot - rTop)
  // side faces occupy first seg*6 verts
  scaleUV(g, circ / tile, slant / tile, 0, seg * 6)
  return g
}

export function orientBetween(a: THREE.Vector3, b: THREE.Vector3) {
  const dir = b.clone().sub(a)
  const len = dir.length()
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize())
  const m = new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1))
  return { m, len }
}

export function beamGeo(a: THREE.Vector3, b: THREE.Vector3, w: number, d: number, tile = 1) {
  const { m, len } = orientBetween(a, b)
  const g = boxGeo(w, len, d, tile)
  g.applyMatrix4(m)
  return g
}

export function tubeGeo(a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number, seg = 8, tile = 1) {
  const { m, len } = orientBetween(a, b)
  let g: THREE.BufferGeometry = new THREE.CylinderGeometry(r1, r0, len, seg, 1, true)
  scaleUV(g, (TAU * r0) / tile, len / tile)
  g.applyMatrix4(m)
  return g
}

/** Gable roof: ridge along X, base at y=0, overhang `ov`. Slopes UV in metres, gable triangles use the gable UVs. */
export function gableRoofGeo(w: number, d: number, h: number, ov = 0.35, tile = 1.2) {
  const hw = w / 2 + ov
  const hd = d / 2 + ov * 0.6
  const rd = h * (hd / (d / 2))
  const top = h
  const pos: number[] = []
  const uv: number[] = []
  const quad = (a: number[], b: number[], c: number[], e: number[], u: number, v: number) => {
    pos.push(...a, ...b, ...c, ...a, ...c, ...e)
    uv.push(0, 0, u / tile, 0, u / tile, v / tile, 0, 0, u / tile, v / tile, 0, v / tile)
  }
  const slope = Math.hypot(rd, hd)
  // front slope (+z) and back slope (-z)
  quad([-hw, -ov * 0.4 + 0, hd], [hw, -ov * 0.4, hd], [hw, top, 0], [-hw, top, 0], hw * 2, slope)
  quad([hw, -ov * 0.4, -hd], [-hw, -ov * 0.4, -hd], [-hw, top, 0], [hw, top, 0], hw * 2, slope)
  // under-sides closed by thin soffit (not needed for visuals)
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.computeVertexNormals()
  return g
}

/** Gable end triangles (wall material) */
export function gableEndsGeo(w: number, d: number, h: number, tile = 1.2) {
  const hw = w / 2
  const hd = d / 2
  const pos = [-hw, 0, hd, hw, 0, hd, hw, h, 0].slice(0, 0)
  void pos
  const p: number[] = []
  const uv: number[] = []
  // two triangles: at x=+hw and x=-hw
  const tri = (a: number[], b: number[], c: number[]) => {
    p.push(...a, ...b, ...c)
    uv.push(a[2] / tile, a[1] / tile, b[2] / tile, b[1] / tile, c[2] / tile, c[1] / tile)
  }
  tri([hw, 0, hd], [hw, 0, -hd], [hw, h, 0])
  tri([-hw, 0, -hd], [-hw, 0, hd], [-hw, h, 0])
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.computeVertexNormals()
  return g
}

/** Hip / pyramid roof (4 slopes). */
export function hipRoofGeo(w: number, d: number, h: number, ov = 0.4, tile = 1.2) {
  const hw = w / 2 + ov
  const hd = d / 2 + ov
  const rl = Math.max(0, w - d) / 2
  const pos: number[] = []
  const uv: number[] = []
  const tri = (a: number[], b: number[], c: number[]) => {
    pos.push(...a, ...b, ...c)
    const ab = Math.hypot(b[0] - a[0], b[2] - a[2])
    const hgt = Math.hypot(c[1] - a[1], Math.max(0.01, Math.abs(c[2] - a[2]) + Math.abs(c[0] - a[0]) * 0.0))
    uv.push(0, 0, ab / tile, 0, ab / (2 * tile), hgt / tile)
  }
  const A = [-hw, -0.15, hd]
  const B = [hw, -0.15, hd]
  const C = [hw, -0.15, -hd]
  const D = [-hw, -0.15, -hd]
  const R1 = [-rl, h, 0]
  const R2 = [rl, h, 0]
  tri(A, B, R2)
  tri(A, R2, R1)
  tri(C, D, R1)
  tri(C, R1, R2)
  tri(B, C, R2)
  tri(D, A, R1)
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.computeVertexNormals()
  return g
}

/** Tapered tube along a polyline with metre UVs. */
export function taperedTube(pts: THREE.Vector3[], r0: number, r1: number, radial = 7, tile = 1.2) {
  const curve = new THREE.CatmullRomCurve3(pts)
  const segs = Math.max(3, pts.length * 3)
  const pos: number[] = []
  const nor: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  const frames = curve.computeFrenetFrames(segs, false)
  let acc = 0
  let prev = curve.getPointAt(0)
  for (let i = 0; i <= segs; i++) {
    const t = i / segs
    const p = curve.getPointAt(t)
    acc += p.distanceTo(prev)
    prev = p
    const r = lerp(r0, r1, Math.pow(t, 0.8))
    const N = frames.normals[i]
    const B = frames.binormals[i]
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * TAU
      const cx = Math.cos(a)
      const sy = Math.sin(a)
      const nx = cx * N.x + sy * B.x
      const ny = cx * N.y + sy * B.y
      const nz = cx * N.z + sy * B.z
      pos.push(p.x + nx * r, p.y + ny * r, p.z + nz * r)
      nor.push(nx, ny, nz)
      uv.push((j / radial) * ((TAU * r0) / tile), acc / tile)
    }
  }
  for (let i = 0; i < segs; i++)
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j
      const b = a + radial + 1
      idx.push(a, b, a + 1, b, b + 1, a + 1)
    }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  return g
}

/** Merges geometries per material to cut draw calls. */
export class Batch {
  private map = new Map<THREE.Material, THREE.BufferGeometry[]>()

  add(geo: THREE.BufferGeometry, mat: THREE.Material, m?: THREE.Matrix4) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone()
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k)
    if (!g.attributes.normal) g.computeVertexNormals()
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2))
    if (m) g.applyMatrix4(m)
    const list = this.map.get(mat) ?? []
    list.push(g)
    this.map.set(mat, list)
    return this
  }

  box(mat: THREE.Material, w: number, h: number, d: number, x = 0, y = 0, z = 0, o: { tile?: number; rx?: number; ry?: number; rz?: number; pre?: THREE.Matrix4 } = {}) {
    const g = boxGeo(w, h, d, o.tile ?? 1)
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(o.rx ?? 0, o.ry ?? 0, o.rz ?? 0, 'YXZ')),
      new THREE.Vector3(1, 1, 1),
    )
    if (o.pre) m.premultiply(o.pre)
    return this.add(g, mat, m)
  }

  merged(): { mat: THREE.Material; geo: THREE.BufferGeometry }[] {
    const out: { mat: THREE.Material; geo: THREE.BufferGeometry }[] = []
    this.map.forEach((list, mat) => {
      const geo = mergeGeometries(list, false)
      list.forEach((g) => g.dispose())
      if (geo) out.push({ mat, geo })
    })
    this.map.clear()
    return out
  }

  build(o: { cast?: boolean; receive?: boolean } = {}) {
    const g = new THREE.Group()
    for (const { mat, geo } of this.merged()) {
      const mesh = new THREE.Mesh(geo, mat)
      mesh.castShadow = o.cast ?? true
      mesh.receiveShadow = o.receive ?? true
      g.add(mesh)
    }
    return g
  }
}

/* ------------------------------------------------------ procedural textures */
function canvas(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return { c, g: c.getContext('2d')! }
}
function toTex(c: HTMLCanvasElement, srgb = true, repeat = false) {
  const t = new THREE.CanvasTexture(c)
  if (srgb) t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  t.generateMipmaps = true
  t.minFilter = THREE.LinearMipmapLinearFilter
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping
  return t
}

export function grassCardTex(variant: 0 | 1 = 0) {
  const W = 256
  const { c, g } = canvas(W, W)
  const r = rng(11 + variant * 5)
  g.clearRect(0, 0, W, W)
  const N = variant === 0 ? 70 : 46
  for (let i = 0; i < N; i++) {
    const x0 = 14 + r() * (W - 28)
    const hgt = (variant === 0 ? 70 : 110) + r() * (variant === 0 ? 120 : 130)
    const tx = x0 + (r() - 0.5) * 80
    const ty = W - hgt
    const w = 2.2 + r() * 3.4
    const cx = x0 + (tx - x0) * 0.35 + (r() - 0.5) * 12
    const cy = W - hgt * 0.55
    const hue = 68 + r() * 36
    const sat = 34 + r() * 26
    const gr = g.createLinearGradient(0, W, 0, ty)
    gr.addColorStop(0, `hsl(${hue + 10},${sat}%,${12 + r() * 6}%)`)
    gr.addColorStop(0.5, `hsl(${hue},${sat}%,${26 + r() * 8}%)`)
    gr.addColorStop(1, `hsl(${hue - 6},${sat + 4}%,${42 + r() * 10}%)`)
    g.fillStyle = gr
    g.beginPath()
    g.moveTo(x0 - w, W)
    g.quadraticCurveTo(cx - w * 0.6, cy, tx, ty)
    g.quadraticCurveTo(cx + w * 0.6, cy, x0 + w, W)
    g.closePath()
    g.fill()
  }
  return toTex(c)
}

export function reedCardTex() {
  const W = 256
  const H = 512
  const { c, g } = canvas(W, H)
  const r = rng(77)
  g.clearRect(0, 0, W, H)
  // leaves
  for (let i = 0; i < 22; i++) {
    const x0 = 40 + r() * (W - 80)
    const hgt = 180 + r() * 250
    const bend = (r() - 0.5) * 170
    const tx = x0 + bend
    const ty = H - hgt
    const w = 3 + r() * 4
    const hue = 58 + r() * 30
    const gr = g.createLinearGradient(0, H, 0, ty)
    gr.addColorStop(0, `hsl(${hue + 20},35%,22%)`)
    gr.addColorStop(0.6, `hsl(${hue},40%,36%)`)
    gr.addColorStop(1, `hsl(${hue - 8},38%,52%)`)
    g.fillStyle = gr
    g.beginPath()
    g.moveTo(x0 - w, H)
    g.quadraticCurveTo(x0 + bend * 0.1 - w * 0.5, H - hgt * 0.6, tx, ty)
    g.quadraticCurveTo(x0 + bend * 0.1 + w * 0.5, H - hgt * 0.6, x0 + w, H)
    g.fill()
  }
  // stems with plumes
  for (let i = 0; i < 7; i++) {
    const x0 = 70 + r() * (W - 140)
    const hgt = 330 + r() * 160
    const lean = (r() - 0.5) * 50
    g.strokeStyle = `hsl(${48 + r() * 10},38%,${42 + r() * 10}%)`
    g.lineWidth = 3
    g.beginPath()
    g.moveTo(x0, H)
    g.quadraticCurveTo(x0 + lean * 0.3, H - hgt * 0.6, x0 + lean, H - hgt)
    g.stroke()
    const px = x0 + lean
    const py = H - hgt
    for (let k = 0; k < 22; k++) {
      g.fillStyle = `hsla(${28 + r() * 16},${28 + r() * 20}%,${28 + r() * 22}%,0.85)`
      g.beginPath()
      g.ellipse(px + (r() - 0.5) * 8, py + k * 1.9 + r() * 3, 2 + r() * 2, 4 + r() * 4, (r() - 0.5) * 0.9, 0, TAU)
      g.fill()
    }
  }
  return toTex(c)
}

export function flowerCardTex() {
  const W = 128
  const { c, g } = canvas(W, W)
  const r = rng(5)
  g.clearRect(0, 0, W, W)
  for (let i = 0; i < 9; i++) {
    const x = 14 + r() * (W - 28)
    const hgt = 40 + r() * 60
    g.strokeStyle = 'hsl(95,40%,28%)'
    g.lineWidth = 1.6
    g.beginPath()
    g.moveTo(x, W)
    g.quadraticCurveTo(x + (r() - 0.5) * 12, W - hgt * 0.5, x + (r() - 0.5) * 10, W - hgt)
    g.stroke()
    const fx = x + (r() - 0.5) * 8
    const fy = W - hgt
    const kind = r()
    if (kind < 0.5) {
      g.fillStyle = '#f4f2e8'
      for (let p = 0; p < 9; p++) {
        const a = (p / 9) * TAU
        g.beginPath()
        g.ellipse(fx + Math.cos(a) * 5, fy + Math.sin(a) * 5, 4, 1.8, a, 0, TAU)
        g.fill()
      }
      g.fillStyle = '#e8b724'
      g.beginPath()
      g.arc(fx, fy, 2.6, 0, TAU)
      g.fill()
    } else {
      g.fillStyle = '#f0c418'
      g.beginPath()
      g.arc(fx, fy, 5, 0, TAU)
      g.fill()
      g.fillStyle = '#ffe36b'
      g.beginPath()
      g.arc(fx - 1, fy - 1, 2.4, 0, TAU)
      g.fill()
    }
  }
  return toTex(c)
}

/** Leaf-cluster atlas for broad-leaf trees. */
export function leafTex(kind: 'round' | 'willow' | 'poplar') {
  const W = kind === 'willow' ? 128 : 256
  const H = kind === 'willow' ? 512 : 256
  const { c, g } = canvas(W, H)
  const r = rng(kind === 'round' ? 3 : kind === 'willow' ? 9 : 21)
  g.clearRect(0, 0, W, H)
  const hueBase = kind === 'willow' ? 78 : kind === 'poplar' ? 92 : 96
  if (kind === 'willow') {
    g.strokeStyle = 'hsl(60,25%,28%)'
    g.lineWidth = 2
    g.beginPath()
    g.moveTo(W / 2, 0)
    g.lineTo(W / 2 + 4, H * 0.95)
    g.stroke()
    for (let i = 0; i < 110; i++) {
      const y = r() * H * 0.95
      const side = r() < 0.5 ? -1 : 1
      const x = W / 2 + 2 + side * (3 + r() * 6)
      const L = 40 + r() * 34
      const a = side * (0.5 + r() * 0.7)
      g.save()
      g.translate(x, y)
      g.rotate(a + Math.PI / 2 * 0 + 0.0)
      g.fillStyle = `hsl(${hueBase + r() * 22},${22 + r() * 16}%,${24 + r() * 26 + (y / H) * 8}%)`
      g.beginPath()
      g.ellipse(side * L * 0.45, L * 0.2, L * 0.5, 3.2 + r() * 1.6, side * 0.9, 0, TAU)
      g.fill()
      g.restore()
    }
  } else {
    const n = kind === 'round' ? 260 : 220
    for (let i = 0; i < n; i++) {
      const a = r() * TAU
      const rad = Math.sqrt(r()) * (W * 0.46)
      const x = W / 2 + Math.cos(a) * rad
      const y = H / 2 + Math.sin(a) * rad * (H / W)
      const s = (kind === 'round' ? 15 : 12) + r() * 10
      g.save()
      g.translate(x, y)
      g.rotate(r() * TAU)
      const shade = 14 + (1 - rad / (W * 0.46)) * 4 + r() * 22
      g.fillStyle = `hsl(${hueBase + r() * 24 - 8},${24 + r() * 18}%,${shade + 3}%)`
      g.beginPath()
      g.ellipse(0, 0, s, s * 0.52, 0, 0, TAU)
      g.fill()
      g.strokeStyle = `hsla(${hueBase},30%,${shade + 14}%,0.35)`
      g.lineWidth = 0.9
      g.beginPath()
      g.moveTo(-s, 0)
      g.lineTo(s, 0)
      g.stroke()
      g.restore()
    }
  }
  const t = toTex(c)
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping
  return t
}

/** Tileable water normal map built from summed sine waves. */
export function waterNormalTex(size = 256) {
  const data = new Uint8Array(size * size * 4)
  const r = rng(404)
  const waves: { kx: number; ky: number; a: number; p: number }[] = []
  for (let i = 0; i < 14; i++) {
    const kx = Math.round((r() - 0.5) * 14) || 1
    const ky = Math.round((r() - 0.5) * 14) || 2
    waves.push({ kx, ky, a: (0.25 + r() * 0.75) / Math.hypot(kx, ky), p: r() * TAU })
  }
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      let dx = 0
      let dy = 0
      for (const w of waves) {
        const ph = ((x * w.kx + y * w.ky) / size) * TAU + w.p
        const c = Math.cos(ph) * w.a
        dx += c * w.kx
        dy += c * w.ky
      }
      const nx = -dx * 0.55
      const ny = -dy * 0.55
      const nz = 1
      const l = Math.hypot(nx, ny, nz)
      const i = (y * size + x) * 4
      data[i] = (nx / l * 0.5 + 0.5) * 255
      data[i + 1] = (ny / l * 0.5 + 0.5) * 255
      data[i + 2] = (nz / l * 0.5 + 0.5) * 255
      data[i + 3] = 255
    }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.magFilter = THREE.LinearFilter
  t.minFilter = THREE.LinearMipmapLinearFilter
  t.generateMipmaps = true
  t.needsUpdate = true
  return t
}

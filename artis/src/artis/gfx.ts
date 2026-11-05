import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

export const TAU = Math.PI * 2
export const V3 = THREE.Vector3
export type Mat = THREE.Material

export function rng(seed: number) {
  let s = seed >>> 0 || 1
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/* ------------------------------------------------------------------ */
/* Collision / world context shared by all builders                    */
/* ------------------------------------------------------------------ */
export interface Box2 { x0: number; z0: number; x1: number; z1: number }
export interface Floor extends Box2 { y: number; ramp?: { axis: 'x' | 'z'; from: number; to: number; y0: number; y1: number } }
export interface Ctx {
  batch: Batch
  root: THREE.Group
  solids: Box2[]
  posts: { x: number; z: number; r: number }[]
  floors: Floor[]
  blockers: ((x: number, z: number) => boolean)[]
  noPlant: ((x: number, z: number, margin: number) => boolean)[]
  updaters: ((t: number, dt: number) => void)[]
  fence: Box2[]
  lamps: THREE.Vector3[]
}

/* ------------------------------------------------------------------ */
/* Textures                                                            */
/* ------------------------------------------------------------------ */
const urls = import.meta.glob('../assets/tex/*.jpg', { eager: true, query: '?url', import: 'default' }) as Record<string, string>
const raw: Record<string, THREE.Texture> = {}
let aniso = 8
export const setAniso = (n: number) => (aniso = n)

export async function loadTextures(onP?: (p: number) => void) {
  const entries = Object.entries(urls)
  let done = 0
  const loader = new THREE.TextureLoader()
  await Promise.all(
    entries.map(
      ([path, url]) =>
        new Promise<void>((res) => {
          const key = path.split('/').pop()!.replace('.jpg', '')
          loader.load(
            url,
            (t) => {
              t.wrapS = t.wrapT = THREE.RepeatWrapping
              t.colorSpace = key.endsWith('_d') ? THREE.SRGBColorSpace : THREE.NoColorSpace
              raw[key] = t
              onP?.(++done / entries.length)
              res()
            },
            undefined,
            () => res(),
          )
        }),
    ),
  )
}

const cloneTex = (key: string, r: number) => {
  const b = raw[key]
  if (!b) return null
  const t = b.clone()
  t.repeat.set(r, r)
  t.anisotropy = aniso
  t.needsUpdate = true
  return t
}

const NOISE = /* glsl */ `
float h21(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
`

function patch(m: THREE.MeshStandardMaterial, macro: number, grime: number) {
  m.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;')
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP;\n' + NOISE)
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
      { float n1 = vn(vWP.xz*0.09+vWP.y*0.07); float n2 = vn(vWP.xz*0.45+vWP.y*0.33);
        diffuseColor.rgb *= 1.0 + ${macro.toFixed(3)}*((n1-0.5)*1.4+(n2-0.5)*0.8);
        ${
          grime > 0
            ? `float gg = smoothstep(0.0,1.8,vWP.y); diffuseColor.rgb *= mix(${(1 - grime).toFixed(3)},1.0,gg);
               diffuseColor.rgb *= mix(${(1 - grime * 0.4).toFixed(3)},1.0, vn(vec2((vWP.x+vWP.z)*2.5, vWP.y*0.3)));`
            : ''
        } }`,
      )
  }
  m.customProgramCacheKey = () => `p${macro}-${grime}`
}

export interface PbrO { flat?: boolean; tile?: number; color?: string; rough?: number; normal?: number; ao?: number; macro?: number; grime?: number; env?: number; metal?: number }
const cache = new Map<string, THREE.MeshStandardMaterial>()
export function pbr(name: string, o: PbrO = {}) {
  const key = name + JSON.stringify(o)
  const hit = cache.get(key)
  if (hit) return hit
  const r = 1 / (o.tile ?? 2)
  const m = new THREE.MeshStandardMaterial({ color: o.color ?? '#ffffff', roughness: o.rough ?? 1, metalness: o.metal ?? 0, envMapIntensity: o.env ?? 1 })
  const d = o.flat ? null : cloneTex(name + '_d', r)
  if (d) m.map = d
  const plain = o.flat && (o.normal ?? 1) < 0.1
  const n = plain ? null : cloneTex(name + '_n', r)
  if (n) {
    m.normalMap = n
    const s = o.normal ?? 1
    m.normalScale.set(s, s)
  }
  const a = plain ? null : cloneTex(name + '_a', r)
  if (a) {
    m.aoMap = a
    m.aoMapIntensity = o.ao ?? 1
    m.roughnessMap = a
  }
  m.shadowSide = THREE.DoubleSide
  patch(m, o.macro ?? 0.1, o.grime ?? 0)
  cache.set(key, m)
  return m
}

export function std(color: string, rough = 0.7, metal = 0, extra: THREE.MeshStandardMaterialParameters = {}) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra })
  m.shadowSide = THREE.DoubleSide
  return m
}

export interface Mats {
  brick: THREE.MeshStandardMaterial; brickWarm: THREE.MeshStandardMaterial; brickDark: THREE.MeshStandardMaterial
  stone: THREE.MeshStandardMaterial; stoneLight: THREE.MeshStandardMaterial; stoneRust: THREE.MeshStandardMaterial; stucco: THREE.MeshStandardMaterial; stuccoIn: THREE.MeshStandardMaterial
  slate: THREE.MeshStandardMaterial; slateWarm: THREE.MeshStandardMaterial
  paving: THREE.MeshStandardMaterial; pavingLight: THREE.MeshStandardMaterial; gravel: THREE.MeshStandardMaterial; asphalt: THREE.MeshStandardMaterial
  grass: THREE.MeshStandardMaterial; bark: THREE.MeshStandardMaterial; wood: THREE.MeshStandardMaterial; woodDark: THREE.MeshStandardMaterial; tiles: THREE.MeshStandardMaterial
  iron: THREE.MeshStandardMaterial; ironGreen: THREE.MeshStandardMaterial; gold: THREE.MeshStandardMaterial; copper: THREE.MeshStandardMaterial
  paint: THREE.MeshStandardMaterial; door: THREE.MeshStandardMaterial; doorWood: THREE.MeshStandardMaterial
  glass: THREE.MeshPhysicalMaterial; glassLit: THREE.MeshPhysicalMaterial; glassBlue: THREE.MeshPhysicalMaterial
  white: THREE.MeshStandardMaterial; soil: THREE.MeshStandardMaterial
}
export let M!: Mats
export function initMaterials() {
  const glass = (c: string, em: string) => {
    const g = new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.04, metalness: 0.0, envMapIntensity: 1.6, clearcoat: 0.6, emissive: em, emissiveIntensity: 0 })
    g.shadowSide = THREE.DoubleSide
    return g
  }
  M = {
    brick: pbr('brick', { tile: 1.9, color: '#ffdcc4', macro: 0.16, grime: 0.38, normal: 1.1 }),
    brickWarm: pbr('brick', { tile: 1.9, color: '#e0b79d', macro: 0.16, grime: 0.38, normal: 1.1 }),
    brickDark: pbr('brick', { tile: 1.9, color: '#b49687', macro: 0.14, grime: 0.4, normal: 1.1 }),
    stone: pbr('stone', { tile: 3.4, color: '#efe3c6', macro: 0.14, grime: 0.3, normal: 1.2 }),
    stoneLight: pbr('stone', { tile: 3.4, color: '#fbf3df', macro: 0.1, grime: 0.22, normal: 1 }),
    stoneRust: pbr('stone', { tile: 2.6, color: '#d8c8a4', macro: 0.16, grime: 0.42, normal: 1.4 }),
    stucco: pbr('stucco', { flat: true, tile: 3, color: '#e9dfc6', macro: 0.1, grime: 0.28, normal: 0.35 }),
    stuccoIn: pbr('stucco', { flat: true, tile: 3, color: '#c9bc98', rough: 0.9, macro: 0.07, normal: 0.0 }),
    slate: pbr('slate', { tile: 2.6, color: '#8e98a3', macro: 0.12, normal: 1.4 }),
    slateWarm: pbr('slate', { tile: 2.6, color: '#9d9387', macro: 0.12, normal: 1.4 }),
    paving: pbr('paving', { tile: 1.8, color: '#cfc3b4', macro: 0.2, normal: 1.3 }),
    pavingLight: pbr('paving', { tile: 1.8, color: '#ddd0bf', macro: 0.22, normal: 1.3 }),
    gravel: pbr('gravel', { tile: 1.4, color: '#ddd3be', macro: 0.16, normal: 1.4 }),
    asphalt: pbr('gravel', { tile: 1.1, color: '#58595c', macro: 0.1, normal: 1.6 }),
    grass: pbr('grass', { tile: 2.4, color: '#aad47c', macro: 0.28, normal: 1.0 }),
    bark: pbr('bark', { tile: 2.2, color: '#d6cdbd', macro: 0.1, normal: 1.4 }),
    wood: pbr('wood', { tile: 1.6, color: '#c9a77c', macro: 0.1, normal: 1 }),
    woodDark: pbr('wood', { tile: 1.6, color: '#7a5a3c', macro: 0.1, normal: 1 }),
    tiles: pbr('floor', { tile: 3.2, color: '#e6dfcf', rough: 0.85, macro: 0.08, normal: 0.7, env: 1.2 }),
    iron: std('#1a2420', 0.42, 0.75),
    ironGreen: std('#1e3a2f', 0.45, 0.7),
    gold: std('#e3b650', 0.26, 1),
    copper: std('#6fa592', 0.5, 0.55),
    paint: std('#ece9df', 0.55, 0),
    door: std('#1f4a36', 0.45, 0),
    doorWood: std('#3a2a1c', 0.55, 0),
    glass: glass('#10181f', '#000000'),
    glassLit: glass('#2a2418', '#ffb45e'),
    glassBlue: glass('#10202a', '#6fc6ff'),
    white: std('#f4f1ea', 0.7, 0),
    soil: std('#4b3a2b', 1, 0),
  }
  return M
}

/* ------------------------------------------------------------------ */
/* Geometry batching (merge by material → few draw calls)              */
/* ------------------------------------------------------------------ */
export function boxUV(g: THREE.BufferGeometry) {
  const p = g.attributes.position
  const n = g.attributes.normal
  const uv = new Float32Array(p.count * 2)
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i))
    const ay = Math.abs(n.getY(i))
    const az = Math.abs(n.getZ(i))
    if (ax >= ay && ax >= az) {
      uv[i * 2] = p.getZ(i)
      uv[i * 2 + 1] = p.getY(i)
    } else if (ay >= az) {
      uv[i * 2] = p.getX(i)
      uv[i * 2 + 1] = p.getZ(i)
    } else {
      uv[i * 2] = p.getX(i)
      uv[i * 2 + 1] = p.getY(i)
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
}

export class Batch {
  map = new Map<Mat, THREE.BufferGeometry[]>()
  add(geo: THREE.BufferGeometry, mat: Mat, uv: 'box' | 'keep' = 'box') {
    let g = geo.index ? geo.toNonIndexed() : geo
    if (g !== geo) geo.dispose()
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k)
    if (!g.attributes.normal) g.computeVertexNormals()
    if (uv === 'box' || !g.attributes.uv) boxUV(g)
    g.clearGroups()
    const l = this.map.get(mat) ?? []
    l.push(g)
    this.map.set(mat, l)
  }
  build() {
    const grp = new THREE.Group()
    for (const [mat, list] of this.map) {
      const merged = mergeGeometries(list, false)
      list.forEach((g) => g.dispose())
      if (!merged) continue
      const mesh = new THREE.Mesh(merged, mat)
      mesh.castShadow = !(mat as THREE.MeshStandardMaterial).transparent
      mesh.receiveShadow = true
      grp.add(mesh)
    }
    this.map.clear()
    return grp
  }
}

/* ------------------------------------------------------------------ */
/* Frame: oriented local coordinates (u = right, w = outward)          */
/* ------------------------------------------------------------------ */
export interface Place { x: number; z: number; ry: number }
export class Frame {
  f: THREE.Vector2
  r: THREE.Vector2
  rotY: number
  constructor(public ox: number, public oz: number, dir: 'S' | 'E' | 'N' | 'W' = 'S') {
    const fx = dir === 'E' ? 1 : dir === 'W' ? -1 : 0
    const fz = dir === 'S' ? 1 : dir === 'N' ? -1 : 0
    this.f = new THREE.Vector2(fx, fz)
    this.r = new THREE.Vector2(fz, -fx)
    this.rotY = Math.atan2(fx, fz)
  }
  x(u: number, w: number) { return this.ox + this.r.x * u + this.f.x * w }
  z(u: number, w: number) { return this.oz + this.r.y * u + this.f.y * w }
  p(u: number, y: number, w: number) { return new THREE.Vector3(this.x(u, w), y, this.z(u, w)) }
  place(u: number, w: number): Place { return { x: this.x(u, w), z: this.z(u, w), ry: this.rotY } }
  aabb(u0: number, u1: number, w0: number, w1: number): Box2 {
    const xs = [this.x(u0, w0), this.x(u1, w1)]
    const zs = [this.z(u0, w0), this.z(u1, w1)]
    return { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) }
  }
  box(b: Batch, mat: Mat, u: number, y0: number, w: number, du: number, dh: number, dw: number) {
    const sw = Math.abs(this.f.x) > 0.5
    const g = new THREE.BoxGeometry(sw ? dw : du, dh, sw ? du : dw)
    g.translate(this.x(u, w), y0 + dh / 2, this.z(u, w))
    b.add(g, mat)
  }
  /** box spanning u0..u1, y0..y1, w0..w1 */
  span(b: Batch, mat: Mat, u0: number, u1: number, y0: number, y1: number, w0: number, w1: number) {
    this.box(b, mat, (u0 + u1) / 2, y0, (w0 + w1) / 2, u1 - u0, y1 - y0, w1 - w0)
  }
  put(b: Batch, geo: THREE.BufferGeometry, mat: Mat, u: number, y: number, w: number, uv: 'box' | 'keep' = 'box', ry = 0) {
    const m = new THREE.Matrix4().makeRotationY(this.rotY + ry)
    m.setPosition(this.x(u, w), y, this.z(u, w))
    geo.applyMatrix4(m)
    b.add(geo, mat, uv)
  }
}

export function placeGeo(b: Batch, geo: THREE.BufferGeometry, mat: Mat, x: number, y: number, z: number, ry = 0, uv: 'box' | 'keep' = 'box') {
  const m = new THREE.Matrix4().makeRotationY(ry)
  m.setPosition(x, y, z)
  geo.applyMatrix4(m)
  b.add(geo, mat, uv)
}

/* ------------------------------------------------------------------ */
/* Primitives                                                          */
/* ------------------------------------------------------------------ */
export function scaleUV(g: THREE.BufferGeometry, su: number, sv: number) {
  const uv = g.attributes.uv
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv)
}

/** planar polygon (convex) with metre UVs, facing away from `hint` */
export function poly(pts: THREE.Vector3[], hint: THREE.Vector3) {
  const c = new THREE.Vector3()
  pts.forEach((p) => c.add(p))
  c.multiplyScalar(1 / pts.length)
  const n = new THREE.Vector3().subVectors(pts[1], pts[0]).cross(new THREE.Vector3().subVectors(pts[2], pts[0])).normalize()
  let P = pts
  if (n.dot(new THREE.Vector3().subVectors(c, hint)) < 0) {
    P = [...pts].reverse()
    n.negate()
  }
  const e1 = new THREE.Vector3().subVectors(P[1], P[0]).normalize()
  const e2 = new THREE.Vector3().crossVectors(n, e1).normalize()
  const pos: number[] = []
  const nor: number[] = []
  const uv: number[] = []
  const push = (p: THREE.Vector3) => {
    pos.push(p.x, p.y, p.z)
    nor.push(n.x, n.y, n.z)
    const d = new THREE.Vector3().subVectors(p, P[0])
    uv.push(d.dot(e1), d.dot(e2))
  }
  for (let i = 1; i < P.length - 1; i++) {
    push(P[0])
    push(P[i])
    push(P[i + 1])
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  return g
}

export function archShape(wd: number, h: number) {
  const s = new THREE.Shape()
  const r = wd / 2
  s.moveTo(-r, 0)
  s.lineTo(-r, h - r)
  s.absarc(0, h - r, r, Math.PI, 0, true)
  s.lineTo(r, 0)
  s.closePath()
  return s
}
export function rectShape(wd: number, h: number) {
  const s = new THREE.Shape()
  s.moveTo(-wd / 2, 0)
  s.lineTo(-wd / 2, h)
  s.lineTo(wd / 2, h)
  s.lineTo(wd / 2, 0)
  s.closePath()
  return s
}
export const extrude = (s: THREE.Shape, depth: number, curve = 16) => new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: curve })

/* roofs ------------------------------------------------------------ */
export function roofHip(F: Frame, b: Batch, mat: Mat, u0: number, u1: number, w0: number, w1: number, y: number, rise: number, o = 0.5) {
  const U0 = u0 - o, U1 = u1 + o, W0 = w0 - o, W1 = w1 + o
  const wm = (W0 + W1) / 2
  const ins = Math.min((W1 - W0) / 2, (U1 - U0) / 2)
  const A = F.p(U0, y, W0), B = F.p(U1, y, W0), C = F.p(U1, y, W1), D = F.p(U0, y, W1)
  const R0 = F.p(U0 + ins, y + rise, wm), R1 = F.p(U1 - ins, y + rise, wm)
  const hint = F.p((u0 + u1) / 2, y - 3, (w0 + w1) / 2)
  b.add(poly([D, C, R1, R0], hint), mat, 'keep')
  b.add(poly([A, B, R1, R0], hint), mat, 'keep')
  b.add(poly([A, D, R0], hint), mat, 'keep')
  b.add(poly([B, C, R1], hint), mat, 'keep')
}

/** gable roof; ridge runs along 'u' (parallel to facade) or 'w' */
export function roofGable(F: Frame, b: Batch, mat: Mat, wall: Mat | null, u0: number, u1: number, w0: number, w1: number, y: number, rise: number, along: 'u' | 'w', o = 0.4) {
  const hint = F.p((u0 + u1) / 2, y - 3, (w0 + w1) / 2)
  if (along === 'u') {
    const U0 = u0 - o, U1 = u1 + o, W0 = w0 - o, W1 = w1 + o, wm = (w0 + w1) / 2
    b.add(poly([F.p(U0, y, W1), F.p(U1, y, W1), F.p(U1, y + rise, wm), F.p(U0, y + rise, wm)], hint), mat, 'keep')
    b.add(poly([F.p(U0, y, W0), F.p(U1, y, W0), F.p(U1, y + rise, wm), F.p(U0, y + rise, wm)], hint), mat, 'keep')
    if (wall) {
      b.add(poly([F.p(u0, y, w0), F.p(u0, y, w1), F.p(u0, y + rise * 0.98, wm)], hint), wall)
      b.add(poly([F.p(u1, y, w0), F.p(u1, y, w1), F.p(u1, y + rise * 0.98, wm)], hint), wall)
    }
  } else {
    const U0 = u0 - o, U1 = u1 + o, W0 = w0 - o, W1 = w1 + o, um = (u0 + u1) / 2
    b.add(poly([F.p(U0, y, W0), F.p(U0, y, W1), F.p(um, y + rise, W1), F.p(um, y + rise, W0)], hint), mat, 'keep')
    b.add(poly([F.p(U1, y, W0), F.p(U1, y, W1), F.p(um, y + rise, W1), F.p(um, y + rise, W0)], hint), mat, 'keep')
    if (wall) {
      b.add(poly([F.p(u0, y, w0), F.p(u1, y, w0), F.p(um, y + rise * 0.98, w0)], hint), wall)
      b.add(poly([F.p(u0, y, w1), F.p(u1, y, w1), F.p(um, y + rise * 0.98, w1)], hint), wall)
    }
  }
}

/* columns ---------------------------------------------------------- */
export type Order = 'corinthian' | 'ionic' | 'iron' | 'doric'
export function columnGeo(order: Order, r: number, h: number) {
  const parts: THREE.BufferGeometry[] = []
  const circ = TAU * r
  const ni = (g: THREE.BufferGeometry) => (g.index ? g.toNonIndexed() : g)
  const lathe = (prof: [number, number][], seg = 36) => {
    const g = new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)), seg)
    scaleUV(g, (circ * 1.4) / 2, 0.5)
    return ni(g)
  }
  const plinthH = 0.32 * r
  const baseH = 0.62 * r
  const capH = order === 'corinthian' ? 2.0 * r : order === 'ionic' ? 1.0 * r : order === 'iron' ? 1.2 * r : 0.8 * r
  const shaftH = h - plinthH - baseH - capH
  // plinth
  const pl = new THREE.BoxGeometry(r * 3.0, plinthH, r * 3.0)
  pl.translate(0, plinthH / 2, 0)
  parts.push(ni(pl))
  // base (torus profile)
  parts.push(
    lathe([[r * 1.45, plinthH], [r * 1.5, plinthH + baseH * 0.25], [r * 1.3, plinthH + baseH * 0.45], [r * 1.38, plinthH + baseH * 0.7], [r * 1.1, plinthH + baseH * 0.9], [r * 1.0, plinthH + baseH], [0.01, plinthH + baseH]]),
  )
  // shaft with entasis + fluting
  const flutes = order === 'iron' ? 0 : 20
  const sh = new THREE.CylinderGeometry(r * 0.84, r * 1.0, shaftH, 60, 12, true)
  const p = sh.attributes.position
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), y = p.getY(i)
    const t = (y + shaftH / 2) / shaftH
    const ang = Math.atan2(z, x)
    const ent = 1 + 0.025 * Math.sin(t * Math.PI)
    const fl = flutes ? 1 - 0.045 * Math.pow(Math.abs(Math.sin((ang * flutes) / 2)), 0.6) : 1
    p.setXYZ(i, x * ent * fl, y + plinthH + baseH + shaftH / 2, z * ent * fl)
  }
  sh.computeVertexNormals()
  scaleUV(sh, circ / 2, shaftH / 2)
  parts.push(ni(sh))
  // capital
  const cy = plinthH + baseH + shaftH
  if (order === 'corinthian') {
    parts.push(lathe([[r * 0.84, cy], [r * 0.9, cy + capH * 0.06], [r * 1.0, cy + capH * 0.3], [r * 1.2, cy + capH * 0.65], [r * 1.38, cy + capH * 0.85], [r * 1.2, cy + capH * 0.84], [0.01, cy + capH * 0.84]]))
    for (let ring = 0; ring < 2; ring++) {
      const n = 9
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + ring * (Math.PI / n)
        const lf = new THREE.IcosahedronGeometry(r * 0.32, 1)
        lf.scale(0.95, 1.9 - ring * 0.4, 0.5)
        lf.translate(0, 0, 0)
        const m = new THREE.Matrix4().makeRotationY(-a + Math.PI / 2)
        m.setPosition(Math.cos(a) * r * (0.98 + ring * 0.12), cy + capH * (0.2 + ring * 0.28), Math.sin(a) * r * (0.98 + ring * 0.12))
        lf.applyMatrix4(m)
        parts.push(ni(lf))
      }
    }
    const ab = new THREE.BoxGeometry(r * 2.9, capH * 0.16, r * 2.9)
    ab.translate(0, cy + capH * 0.92, 0)
    parts.push(ni(ab))
  } else if (order === 'ionic') {
    parts.push(lathe([[r * 0.84, cy], [r * 0.95, cy + capH * 0.1], [r * 1.18, cy + capH * 0.35], [r * 1.22, cy + capH * 0.5], [0.01, cy + capH * 0.5]]))
    const bolster = new THREE.BoxGeometry(r * 2.7, capH * 0.28, r * 1.5)
    bolster.translate(0, cy + capH * 0.64, 0)
    parts.push(ni(bolster))
    for (const s of [-1, 1]) {
      const vol = new THREE.CylinderGeometry(r * 0.34, r * 0.34, r * 1.55, 20)
      vol.rotateX(Math.PI / 2)
      vol.translate(s * r * 1.32, cy + capH * 0.6, 0)
      parts.push(ni(vol))
    }
    const ab = new THREE.BoxGeometry(r * 3.0, capH * 0.16, r * 2.0)
    ab.translate(0, cy + capH * 0.92, 0)
    parts.push(ni(ab))
  } else if (order === 'iron') {
    parts.push(lathe([[r * 0.84, cy], [r * 1.2, cy + capH * 0.3], [r * 1.0, cy + capH * 0.45], [r * 1.5, cy + capH * 0.8], [r * 1.5, cy + capH], [0.01, cy + capH]]))
  } else {
    parts.push(lathe([[r * 0.84, cy], [r * 1.1, cy + capH * 0.5], [0.01, cy + capH * 0.5]]))
    const ab = new THREE.BoxGeometry(r * 2.8, capH * 0.5, r * 2.8)
    ab.translate(0, cy + capH * 0.75, 0)
    parts.push(ni(ab))
  }
  for (const g of parts) {
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2))
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k)
  }
  const merged = mergeGeometries(parts, false)!
  parts.forEach((g) => g.dispose())
  return merged
}

/* misc ------------------------------------------------------------- */
export function canvas(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}
export function canvasTex(c: HTMLCanvasElement, srgb = true) {
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
  t.anisotropy = aniso
  return t
}
export const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t

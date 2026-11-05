import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { TreeDef, TreeKind, groundHeight } from './layout'
import { TexSet } from './textures'
import { TAU, lerp, rng, smooth } from './util'

interface Spec {
  H: number
  base: number
  crownR: number
  crownH: number
  trunkR: number
  limbs: number
  cards: number
  size: number
  tex: 'leaf' | 'blossom' | 'willow'
  tintLo: THREE.Color
  tintHi: THREE.Color
  trunkTint: THREE.Color
  droop?: number
  lean?: number
}
const C = (h: string) => new THREE.Color(h)
const SPECS: Record<TreeKind, Spec> = {
  beech: { H: 15, base: 3.2, crownR: 6.2, crownH: 11, trunkR: 0.4, limbs: 6, cards: 1500, size: 1.55, tex: 'leaf', tintLo: C('#79a63a'), tintHi: C('#c0e060'), trunkTint: C('#b9b5ad') },
  oak: { H: 13, base: 2.6, crownR: 7.4, crownH: 9.5, trunkR: 0.5, limbs: 6, cards: 1600, size: 1.55, tex: 'leaf', tintLo: C('#6f9a30'), tintHi: C('#b4d44e'), trunkTint: C('#a09888') },
  plane: { H: 13, base: 3.8, crownR: 4.9, crownH: 8.4, trunkR: 0.34, limbs: 6, cards: 900, size: 1.2, tex: 'leaf', tintLo: C('#88b244'), tintHi: C('#c9e467'), trunkTint: C('#c8c0a8') },
  cherry: { H: 8.5, base: 1.7, crownR: 4.6, crownH: 6.2, trunkR: 0.27, limbs: 6, cards: 1050, size: 0.95, tex: 'blossom', tintLo: C('#f0b2cc'), tintHi: C('#ffe9f2'), trunkTint: C('#7a6a62'), lean: 0.15 },
  magnolia: { H: 6.5, base: 0.9, crownR: 3.4, crownH: 5, trunkR: 0.2, limbs: 5, cards: 620, size: 0.85, tex: 'blossom', tintLo: C('#f6d4e0'), tintHi: C('#ffffff'), trunkTint: C('#8a8078'), lean: 0.2 },
  birch: { H: 12, base: 2.2, crownR: 3.2, crownH: 9.6, trunkR: 0.17, limbs: 5, cards: 640, size: 0.95, tex: 'leaf', tintLo: C('#8bb840'), tintHi: C('#cfe96c'), trunkTint: C('#e8e4da'), lean: 0.12 },
  poplar: { H: 22, base: 2.2, crownR: 2.0, crownH: 20, trunkR: 0.3, limbs: 6, cards: 2100, size: 1.6, tex: 'leaf', tintLo: C('#7aa83a'), tintHi: C('#bedc58'), trunkTint: C('#9a9082') },
  willow: { H: 11, base: 1.9, crownR: 6.6, crownH: 8, trunkR: 0.55, limbs: 6, cards: 420, size: 2.8, tex: 'willow', tintLo: C('#7da23c'), tintHi: C('#c0d868'), trunkTint: C('#8c8478'), droop: 1 },
}

export const treeUniforms = {
  uTime: { value: 0 },
  uWind: { value: 0.6 },
  uSunDir: { value: new THREE.Vector3(0.3, 0.8, 0.2) },
  uSunI: { value: 1 },
}

type V = THREE.Vector3

function addTube(parts: THREE.BufferGeometry[], pts: V[], r0: number, r1: number, sides: number) {
  const pos: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  let len = 0
  const n = pts.length
  for (let i = 0; i < n; i++) {
    if (i) len += pts[i].distanceTo(pts[i - 1])
    const t = (pts[Math.min(n - 1, i + 1)].clone().sub(pts[Math.max(0, i - 1)])).normalize()
    const h = Math.abs(t.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)
    const u = new THREE.Vector3().crossVectors(t, h).normalize()
    const v = new THREE.Vector3().crossVectors(t, u)
    const r = lerp(r0, r1, i / (n - 1))
    for (let s = 0; s <= sides; s++) {
      const a = (s / sides) * TAU
      const c = Math.cos(a)
      const sn = Math.sin(a)
      pos.push(pts[i].x + (u.x * c + v.x * sn) * r, pts[i].y + (u.y * c + v.y * sn) * r, pts[i].z + (u.z * c + v.z * sn) * r)
      uv.push((s / sides) * Math.max(1, r0 * 6), len * 0.35)
    }
  }
  for (let i = 0; i < n - 1; i++)
    for (let s = 0; s < sides; s++) {
      const a = i * (sides + 1) + s
      const b = a + 1
      const c = a + sides + 1
      const d = c + 1
      idx.push(a, c, b, b, c, d)
    }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  parts.push(g)
}

function bendPath(a: V, dir: V, len: number, steps: number, r: () => number, up: number, droop = 0): V[] {
  const out: V[] = [a.clone()]
  const d = dir.clone().normalize()
  const p = a.clone()
  for (let i = 0; i < steps; i++) {
    d.x += (r() - 0.5) * 0.35
    d.z += (r() - 0.5) * 0.35
    d.y += up * 0.12 - droop * (i / steps) * 0.55
    d.normalize()
    p.addScaledVector(d, len / steps)
    out.push(p.clone())
  }
  return out
}

export function makeTreeGeometry(kind: TreeKind, variant: number, cardScale: number) {
  const S = SPECS[kind]
  const ki = Object.keys(SPECS).indexOf(kind)
  const r = rng(ki * 101 + variant * 977 + 13)
  const bark: THREE.BufferGeometry[] = []
  const anchors: { p: V; w: number }[] = []
  const crownC = new THREE.Vector3(0, S.base + S.crownH * 0.5, 0)

  // trunk (slightly leaning, wobbling)
  const lean = new THREE.Vector3((r() - 0.5) * (S.lean ?? 0.06), 1, (r() - 0.5) * (S.lean ?? 0.06))
  const trunk = bendPath(new THREE.Vector3(0, -0.4, 0), lean, S.base + 0.5, 5, r, 0.1)
  addTube(bark, trunk, S.trunkR * 1.25, S.trunkR * 0.82, 8)
  const top = trunk[trunk.length - 1]

  // flared root buttresses
  for (let i = 0; i < 4; i++) {
    const a = r() * TAU
    const d = new THREE.Vector3(Math.cos(a), -0.15, Math.sin(a))
    addTube(bark, bendPath(new THREE.Vector3(0, 0.45, 0), d, S.trunkR * 2.4, 2, r, 0), S.trunkR * 0.55, S.trunkR * 0.12, 5)
  }

  const nLimb = S.limbs
  for (let i = 0; i < nLimb; i++) {
    const a = (i / nLimb) * TAU + r() * 0.7
    const el = S.tex === 'willow' ? 0.9 + r() * 0.3 : 0.55 + r() * 0.7
    const dir = new THREE.Vector3(Math.cos(a) * Math.cos(el * 0.7), Math.sin(el * 0.9) * (kind === 'poplar' ? 3 : 1.2), Math.sin(a) * Math.cos(el * 0.7))
    if (kind === 'poplar') dir.multiply(new THREE.Vector3(0.28, 1, 0.28))
    const len = kind === 'poplar' ? S.crownH * (0.55 + r() * 0.4) : Math.max(S.crownR * (0.8 + r() * 0.35), S.crownH * 0.4)
    const start = top.clone().add(new THREE.Vector3(0, -0.2 + r() * 0.6, 0))
    const limb = bendPath(start, dir, len, 6, r, kind === 'poplar' ? 0.5 : 0.25, S.droop ? 1.3 : 0.25)
    addTube(bark, limb, S.trunkR * 0.62, S.trunkR * 0.08, 6)
    const ln = limb.length
    for (let k = 2; k < ln; k++) anchors.push({ p: limb[k], w: k / ln })
    // sub branches
    for (const t of [0.4, 0.6, 0.8]) {
      const base = limb[Math.floor(t * (ln - 1))]
      for (let b = 0; b < 2; b++) {
        const sa = a + (b ? 1 : -1) * (0.7 + r() * 0.7)
        const sd = new THREE.Vector3(Math.cos(sa), 0.35 + r() * 0.5, Math.sin(sa))
        if (kind === 'poplar') sd.multiply(new THREE.Vector3(0.3, 1.4, 0.3))
        const sl = len * (0.32 + r() * 0.18) * (1 - t * 0.45)
        const sub = bendPath(base, sd, sl, 4, r, 0.2, S.droop ? 1.6 : 0.3)
        addTube(bark, sub, S.trunkR * 0.2, S.trunkR * 0.03, 4)
        for (let k = 1; k < sub.length; k++) anchors.push({ p: sub[k], w: 1 })
      }
    }
  }

  // foliage cards
  const nCards = Math.floor(S.cards * (0.35 + 0.65 * cardScale))
  const pos: number[] = []
  const nrm: number[] = []
  const uv: number[] = []
  const col: number[] = []
  const idx: number[] = []
  const tmp = new THREE.Color()
  const rx = S.crownR * 1.05
  const ry = S.crownH * 0.58
  for (let i = 0; i < nCards; i++) {
    const an = anchors[Math.floor(r() * anchors.length)]
    const spread = S.size * (S.tex === 'willow' ? 0.5 : 0.95)
    const c = an.p.clone().add(new THREE.Vector3((r() - 0.5) * 2 * spread, (r() - 0.5) * 1.6 * spread, (r() - 0.5) * 2 * spread))
    if (S.tex === 'willow') c.y -= S.size * 0.45
    // radial normal from the crown centre
    const rad = new THREE.Vector3((c.x - crownC.x) / rx, (c.y - crownC.y) / ry, (c.z - crownC.z) / rx)
    const rl = rad.length()
    const radN = rad.clone().normalize()
    if (rl > 1.25 && kind !== 'willow') continue
    let n = new THREE.Vector3(r() - 0.5, r() - 0.35, r() - 0.5).normalize()
    let right: V
    let upv: V
    let w = S.size
    let h = S.size
    if (S.tex === 'willow') {
      const yaw = r() * TAU
      n = new THREE.Vector3(Math.cos(yaw), 0, Math.sin(yaw))
      right = new THREE.Vector3(-Math.sin(yaw), 0, Math.cos(yaw))
      upv = new THREE.Vector3(0, 1, 0)
      w = S.size * 0.7
      h = S.size * (0.9 + r() * 0.5)
    } else {
      right = new THREE.Vector3().crossVectors(n, new THREE.Vector3(0, 1, 0)).normalize()
      if (right.lengthSq() < 0.01) right.set(1, 0, 0)
      upv = new THREE.Vector3().crossVectors(right, n).normalize()
      const sz = S.size * (0.8 + r() * 0.5)
      w = sz
      h = sz
    }
    const sn = n.clone().lerp(radN, 0.78).normalize()
    // ambient-occlusion-ish darkening inside the crown
    const ao = lerp(0.42, 1, smooth(0.25, 1.05, rl)) * (0.88 + r() * 0.24)
    const hi = Math.min(1, Math.max(0, r() * 0.7 + (c.y / (S.H + 1)) * 0.45))
    tmp.copy(S.tintLo).lerp(S.tintHi, hi).multiplyScalar(ao)
    const b = pos.length / 3
    for (const [ux, uy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      pos.push(c.x + right.x * ux * w * 0.5 + upv.x * uy * h * 0.5, c.y + right.y * ux * w * 0.5 + upv.y * uy * h * 0.5, c.z + right.z * ux * w * 0.5 + upv.z * uy * h * 0.5)
      nrm.push(sn.x, sn.y, sn.z)
      uv.push((ux + 1) / 2, (uy + 1) / 2)
      col.push(tmp.r, tmp.g, tmp.b)
    }
    idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2)
  }
  const leaves = new THREE.BufferGeometry()
  leaves.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  leaves.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3))
  leaves.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  leaves.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  leaves.setIndex(idx)
  leaves.computeBoundingSphere()
  const trunkGeo = mergeGeometries(bark, false)!
  bark.forEach((g) => g.dispose())
  return { trunk: trunkGeo, leaves }
}

function leafMaterial(tex: THREE.Texture, kind: 'leaf' | 'blossom' | 'willow') {
  const m = new THREE.MeshStandardMaterial({ map: tex, vertexColors: true, side: THREE.DoubleSide, alphaTest: 0.42, roughness: 0.62, metalness: 0, transparent: false })
  m.alphaToCoverage = true
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = treeUniforms.uTime
    sh.uniforms.uWind = treeUniforms.uWind
    sh.uniforms.uSunDir = treeUniforms.uSunDir
    sh.uniforms.uSunI = treeUniforms.uSunI
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime, uWind;')
      .replace(
        '#include <project_vertex>',
        `vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
mvPosition = instanceMatrix * mvPosition;
vec3 ip = vec3(instanceMatrix[3]);
float wgt = clamp(position.y * 0.07, 0.0, 1.0); wgt *= wgt;
float ph = dot(ip.xz, vec2(0.05, 0.03)) - uTime * 0.9;
float flut = sin(uTime * 2.7 + dot(position, vec3(3.1, 5.3, 7.7)));
float sway = sin(ph) * 0.6 + sin(ph * 2.3 + 1.7) * 0.25;
mvPosition.x += uWind * wgt * (sway * 0.22 + flut * 0.035 * ${kind === 'willow' ? '2.5' : '1.0'});
mvPosition.z += uWind * wgt * (sin(ph * 0.9 + 0.7) * 0.15 + flut * 0.03);
#endif
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;`,
      )
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uSunDir; uniform float uSunI;')
      .replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', ''))
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
{
  vec3 sunV = normalize((viewMatrix * vec4(uSunDir, 0.0)).xyz);
  vec3 toCam = normalize(vViewPosition);
  float back = pow(clamp(dot(-toCam, sunV), 0.0, 1.0), 2.5);
  totalEmissiveRadiance += diffuseColor.rgb * vec3(0.95, 1.0, 0.35) * back * uSunI * ${kind === 'blossom' ? '0.16' : '0.3'};
  totalEmissiveRadiance += diffuseColor.rgb * 0.035;
}`,
      )
  }
  m.customProgramCacheKey = () => 'treeleaf' + kind
  return m
}

export class TreeSet {
  group = new THREE.Group()
  private disposables: { dispose(): void }[] = []
  constructor(defs: TreeDef[], tex: TexSet, cardScale: number, onProgress?: (f: number) => void) {
    const barkMats = new Map<TreeKind, THREE.MeshStandardMaterial>()
    const leafMats: Record<string, THREE.Material> = {
      leaf: leafMaterial(tex.leaf, 'leaf'),
      blossom: leafMaterial(tex.blossom, 'blossom'),
      willow: leafMaterial(tex.willow, 'willow'),
    }
    const depthMats: Record<string, THREE.Material> = {}
    for (const k of ['leaf', 'blossom', 'willow'] as const) {
      const map = k === 'leaf' ? tex.leaf : k === 'blossom' ? tex.blossom : tex.willow
      depthMats[k] = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map, alphaTest: 0.5, side: THREE.DoubleSide })
    }
    this.disposables.push(...Object.values(leafMats), ...Object.values(depthMats))
    const groups = new Map<string, TreeDef[]>()
    for (const d of defs) {
      const k = d.kind + d.v
      if (!groups.has(k)) groups.set(k, [])
      groups.get(k)!.push(d)
    }
    const m4 = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const up = new THREE.Vector3(0, 1, 0)
    let done = 0
    for (const [, list] of groups) {
      const { kind, v } = list[0]
      const { trunk, leaves } = makeTreeGeometry(kind, v, cardScale * (list.length === 1 || list[0].s > 1.2 ? 1 : 1))
      const S = SPECS[kind]
      if (!barkMats.has(kind)) {
        const bm = new THREE.MeshStandardMaterial({ map: tex.bark.map, normalMap: tex.bark.normal, normalScale: new THREE.Vector2(1.2, 1.2), color: S.trunkTint.clone().multiplyScalar(1.9), roughness: 0.95 })
        barkMats.set(kind, bm)
        this.disposables.push(bm)
      }
      const tm = new THREE.InstancedMesh(trunk, barkMats.get(kind)!, list.length)
      const lm = new THREE.InstancedMesh(leaves, leafMats[S.tex], list.length)
      lm.customDepthMaterial = depthMats[S.tex]
      list.forEach((d, i) => {
        q.setFromAxisAngle(up, d.rot)
        m4.compose(new THREE.Vector3(d.x, groundHeight(d.x, d.z), d.z), q, new THREE.Vector3(d.s, d.s, d.s))
        tm.setMatrixAt(i, m4)
        lm.setMatrixAt(i, m4)
      })
      for (const mesh of [tm, lm]) {
        mesh.castShadow = true
        mesh.receiveShadow = true
        mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage)
        mesh.computeBoundingSphere()
        if (mesh.boundingSphere) mesh.boundingSphere.radius += 1
        this.group.add(mesh)
      }
      this.disposables.push(trunk, leaves)
      onProgress?.(++done / groups.size)
    }
  }
  dispose() {
    this.disposables.forEach((d) => d.dispose())
  }
}

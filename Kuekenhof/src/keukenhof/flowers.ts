import * as THREE from 'three'
import { Bed, Shape, Species, VARIETIES, groundHeight, varietyAt } from './layout'
import { TAU, clamp, hash2, lerp, pointInPoly, rng, shuffle, smooth } from './util'

/* ======================================================================= geometry builder */
type V3 = [number, number, number]
class GB {
  pos: number[] = []
  col: number[] = []
  head: number[] = []
  idx: number[] = []
  grid(nu: number, nv: number, pf: (u: number, v: number) => V3, cf: (u: number, v: number) => V3, head: number) {
    const base = this.pos.length / 3
    for (let j = 0; j <= nv; j++) {
      for (let i = 0; i <= nu; i++) {
        const u = (i / nu) * 2 - 1
        const v = j / nv
        this.pos.push(...pf(u, v))
        this.col.push(...cf(u, v))
        this.head.push(head)
      }
    }
    for (let j = 0; j < nv; j++) {
      for (let i = 0; i < nu; i++) {
        const a = base + j * (nu + 1) + i
        const b = a + 1
        const c = a + nu + 1
        const d = c + 1
        this.idx.push(a, c, b, b, c, d)
      }
    }
  }
  tri(a: V3, b: V3, c: V3, col: V3, head: number) {
    const base = this.pos.length / 3
    this.pos.push(...a, ...b, ...c)
    for (let i = 0; i < 3; i++) {
      this.col.push(...col)
      this.head.push(head)
    }
    this.idx.push(base, base + 1, base + 2)
  }
  tube(pts: V3[], r0: number, r1: number, sides: number, col: (t: number) => V3, head = 0) {
    const base = this.pos.length / 3
    pts.forEach((p, k) => {
      const t = k / (pts.length - 1)
      const r = lerp(r0, r1, t)
      for (let s = 0; s < sides; s++) {
        const a = (s / sides) * TAU
        this.pos.push(p[0] + Math.cos(a) * r, p[1], p[2] + Math.sin(a) * r)
        this.col.push(...col(t))
        this.head.push(head)
      }
    })
    for (let k = 0; k < pts.length - 1; k++) {
      for (let s = 0; s < sides; s++) {
        const a = base + k * sides + s
        const b = base + k * sides + ((s + 1) % sides)
        const c = a + sides
        const d = b + sides
        this.idx.push(a, c, b, b, c, d)
      }
    }
  }
  /** curved lanceolate leaf blade rising from (0,y0,0) and arcing outwards along azimuth az */
  blade(az: number, y0: number, len: number, w: number, th0: number, th1: number, nu: number, nv: number, c0: V3, c1: V3, curlTip = 0) {
    const d = th1 - th0
    const ca = Math.cos(az)
    const sa = Math.sin(az)
    this.grid(
      nu,
      nv,
      (u, v) => {
        const th = th0 + d * v
        const r = (len * (Math.cos(th0) - Math.cos(th))) / d
        const y = (len * (Math.sin(th) - Math.sin(th0))) / d
        const wd = w * Math.sin(Math.PI * Math.pow(Math.max(v, 0.001), 0.62)) * 0.5 + 0.0007
        const fold = (1 - Math.abs(u)) * w * 0.12
        const side = u * wd
        return [r * ca - side * sa, y0 + y + fold + curlTip * v * v * 0.02, r * sa + side * ca]
      },
      (_u, v) => [lerp(c0[0], c1[0], v), lerp(c0[1], c1[1], v), lerp(c0[2], c1[2], v)],
      0,
    )
  }
  build() {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3))
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3))
    g.setAttribute('aHead', new THREE.Float32BufferAttribute(this.head, 1))
    g.setIndex(this.idx)
    g.computeVertexNormals()
    g.computeBoundingSphere()
    return g
  }
}

const prof = (pts: [number, number][], v: number) => {
  for (let i = 0; i < pts.length - 1; i++) {
    if (v <= pts[i + 1][0]) {
      const t = (v - pts[i][0]) / (pts[i + 1][0] - pts[i][0])
      const s = t * t * (3 - 2 * t)
      return lerp(pts[i][1], pts[i + 1][1], s)
    }
  }
  return pts[pts.length - 1][1]
}

/** vertex colours are linear: author greens in sRGB-ish terms and convert */
const lin = (r: number, g: number, b: number): V3 => [Math.pow(r, 2.2), Math.pow(g, 2.2), Math.pow(b, 2.2)]
const GREEN_STEM: V3 = lin(0.3, 0.45, 0.2)
const GREEN_STEM_TOP: V3 = lin(0.4, 0.58, 0.28)
const LEAF_BASE: V3 = lin(0.27, 0.41, 0.21)
const LEAF_TIP: V3 = lin(0.42, 0.59, 0.33)

/* ======================================================================= tulip */
const STEM_H = 0.36
function tulipHead(b: GB, shape: Shape, lod: number) {
  const cupProf: [number, number][] = [[0, 0.004], [0.12, 0.016], [0.35, 0.027], [0.62, 0.0295], [0.85, 0.023], [1, 0.008]]
  const lilyProf: [number, number][] = [[0, 0.004], [0.15, 0.013], [0.4, 0.021], [0.65, 0.0235], [0.85, 0.0265], [1, 0.031]]
  const H = shape === 'lily' ? 0.078 : 0.062
  const pr = shape === 'lily' ? lilyProf : cupProf
  const nu = lod === 0 ? 2 : 1
  const nv = lod === 0 ? 4 : lod === 1 ? 2 : 1
  const petals: { a: number; rs: number; hs: number; ws: number; shade: number }[] = []
  const jitter = (i: number) => (hash2(i, 5) - 0.5) * 0.14
  if (shape === 'double') {
    const n = lod === 0 ? 9 : lod === 1 ? 6 : 3
    for (let i = 0; i < n; i++) {
      const layer = Math.floor((i / n) * 3)
      petals.push({ a: (i / n) * TAU * (layer % 2 ? 1 : 1) + layer * 0.9 + jitter(i), rs: [1.06, 0.9, 0.72][layer], hs: [1, 0.92, 0.78][layer], ws: [0.95, 0.85, 0.7][layer] * 1.1, shade: [1, 0.92, 0.82][layer] })
    }
  } else {
    const n = lod === 2 ? 3 : 6
    for (let i = 0; i < n; i++) {
      const outer = i % 2 === 0 || lod === 2
      petals.push({ a: (i / n) * TAU + jitter(i), rs: outer ? 1.05 : 0.9, hs: outer ? 1 : 0.95, ws: outer ? 1.08 : 0.98, shade: outer ? 1 : 0.9 })
    }
  }
  const tipPow = shape === 'lily' ? 0.55 : 0.4
  const hwMax = shape === 'double' ? 0.78 : shape === 'lily' ? 0.62 : 0.7
  for (const p of petals) {
    b.grid(
      nu,
      nv,
      (u, v) => {
        const hw = hwMax * p.ws * (Math.pow(Math.max(Math.sin(Math.PI * Math.pow(v, 0.8)), 0), tipPow) + 0.06)
        const ang = p.a + u * hw
        let r = prof(pr, v) * p.rs * (1 - 0.07 * u * u)
        if (shape === 'double') r *= 1 + 0.35 * smooth(0.6, 1, v)
        return [Math.cos(ang) * r, STEM_H + H * p.hs * v - 0.004, Math.sin(ang) * r]
      },
      (u, v) => {
        const k = lerp(0.55, 1.0, smooth(0, 0.5, v)) * (0.9 + 0.1 * (1 - Math.abs(u))) * p.shade
        const g = 1 - smooth(0, 0.35, v)
        return [k * (1 - 0.15 * g), k * (1 + 0.25 * g), k * (1 - 0.45 * g)]
      },
      1,
    )
  }
}

function tulipBody(b: GB, lod: number) {
  const sides = lod === 0 ? 4 : 3
  const segs = lod === 0 ? 3 : 1
  if (lod < 2) {
    const pts: V3[] = []
    for (let k = 0; k <= segs; k++) {
      const t = k / segs
      pts.push([0.014 * Math.sin(t * Math.PI * 0.8), STEM_H * t, 0.006 * Math.sin(t * 5)])
    }
    b.tube(pts, 0.0048, 0.0036, sides, (t) => [lerp(GREEN_STEM[0], GREEN_STEM_TOP[0], t), lerp(GREEN_STEM[1], GREEN_STEM_TOP[1], t), lerp(GREEN_STEM[2], GREEN_STEM_TOP[2], t)])
  } else {
    b.blade(0, 0, STEM_H, 0.012, 0.05, 0.1, 1, 1, GREEN_STEM, GREEN_STEM_TOP)
  }
  const nl = lod === 0 ? 3 : lod === 1 ? 2 : 1
  for (let i = 0; i < nl; i++) {
    const az = i * 2.25 + 0.4
    b.blade(az, 0.004 + i * 0.012, 0.29 - i * 0.03, 0.072, 0.16 + i * 0.05, 1.05 + i * 0.1, lod === 0 ? 2 : 1, lod === 0 ? 4 : 2, LEAF_BASE, LEAF_TIP, 1)
  }
}

/* ======================================================================= daffodil */
function daffodil(b: GB, lod: number) {
  const H = 0.34
  const pts: V3[] = []
  const segs = lod === 0 ? 3 : 1
  for (let k = 0; k <= segs; k++) {
    const t = k / segs
    pts.push([0.03 * t * t, H * t, 0])
  }
  b.tube(pts, 0.0042, 0.0034, lod === 0 ? 4 : 3, () => lin(0.24, 0.42, 0.13))
  for (let i = 0; i < (lod === 2 ? 1 : 3); i++) b.blade(i * 2.3, 0.004, 0.3, 0.02, 0.08 + i * 0.05, 0.55 + i * 0.1, 1, lod === 0 ? 3 : 2, lin(0.2, 0.38, 0.14), lin(0.32, 0.5, 0.2), 0.5)
  // head frame: axis along +X, slightly drooping
  const hx = 0.03
  const hy = H
  const tilt = -0.25
  const rot = (x: number, y: number, z: number): V3 => [hx + x * Math.cos(tilt) - y * Math.sin(tilt), hy + x * Math.sin(tilt) + y * Math.cos(tilt), z]
  const np = lod === 2 ? 3 : 6
  for (let i = 0; i < np; i++) {
    const a = (i / np) * TAU + (np === 3 ? 0.3 : 0)
    b.grid(
      1,
      lod === 0 ? 2 : 1,
      (u, v) => {
        const len = 0.046 * Math.sin(Math.PI * (0.15 + 0.85 * v) * 0.95 + 0.2) * 0 + 0.046 * v
        const w = 0.028 * Math.sin(Math.PI * Math.pow(Math.max(v, 0.001), 0.7)) + 0.001
        const rr = 0.003 + len
        const cy = Math.cos(a) * rr
        const cz = Math.sin(a) * rr
        const ox = 0.0 + v * 0.004
        // perpendicular in plane
        const py = -Math.sin(a) * u * w * 0.5
        const pz = Math.cos(a) * u * w * 0.5
        return rot(ox, cy + py, cz + pz)
      },
      (_u, v) => [lerp(0.85, 1, v), lerp(0.85, 1, v), lerp(0.7, 0.95, v)],
      1,
    )
  }
  // trumpet
  const ring = lod === 0 ? 8 : 5
  const rows = lod === 0 ? 3 : 1
  const base = b.pos.length / 3
  for (let j = 0; j <= rows; j++) {
    const t = j / rows
    const rad = lerp(0.0075, 0.0165, Math.pow(t, 1.6))
    for (let s = 0; s < ring; s++) {
      const a = (s / ring) * TAU
      const p = rot(0.002 + t * 0.036, Math.cos(a) * rad, Math.sin(a) * rad)
      b.pos.push(...p)
      const k = lerp(0.85, 1.05, t)
      b.col.push(k, k * lerp(0.72, 0.62, t), k * lerp(0.35, 0.4, t))
      b.head.push(1)
    }
  }
  for (let j = 0; j < rows; j++)
    for (let s = 0; s < ring; s++) {
      const a = base + j * ring + s
      const c = base + j * ring + ((s + 1) % ring)
      b.idx.push(a, a + ring, c, c, a + ring, c + ring)
    }
}

/* ======================================================================= hyacinth / muscari */
function spike(b: GB, lod: number, o: { stalk: number; spikeH: number; spikeR: number; n: number; fs: number; leaves: number; leafLen: number; leafW: number }) {
  const pts: V3[] = []
  for (let k = 0; k <= 2; k++) pts.push([0, (o.stalk * k) / 2, 0])
  b.tube(pts, 0.0065, 0.0055, lod === 0 ? 5 : 3, () => lin(0.3, 0.46, 0.2))
  for (let i = 0; i < o.leaves; i++) b.blade((i / o.leaves) * TAU + 0.3, 0.004, o.leafLen, o.leafW, 0.12 + (i % 2) * 0.06, 1.0, 1, lod === 0 ? 3 : 2, lin(0.17, 0.33, 0.12), lin(0.3, 0.5, 0.2), 0.8)
  if (lod === 0) {
    const r = rng(11)
    for (let i = 0; i < o.n; i++) {
      const t = (i + 0.5) / o.n
      const y = o.stalk + t * o.spikeH
      const rad = o.spikeR * Math.sin(Math.PI * Math.min(1, t * 0.95 + 0.06)) * (1.0 - 0.25 * t)
      const phi = i * 2.399
      const d: V3 = [Math.cos(phi), 0, Math.sin(phi)]
      const c: V3 = [d[0] * rad * 0.7, y, d[2] * rad * 0.7]
      const s = o.fs * (1.15 - t * 0.55)
      const tip: V3 = [c[0] + d[0] * s * 1.5, y + s * 0.1, c[2] + d[2] * s * 1.5]
      const u2: V3 = [-d[2], 0, d[0]]
      const bp: V3[] = [0, 1, 2].map((k): V3 => {
        const a = (k / 3) * TAU + r()
        return [c[0] - d[0] * s * 0.3 + u2[0] * Math.cos(a) * s + 0, y + Math.sin(a) * s, c[2] - d[2] * s * 0.3 + u2[2] * Math.cos(a) * s]
      })
      const sh = 0.8 + r() * 0.35 - (t > 0.85 ? 0.2 : 0)
      const col: V3 = [sh * (t > 0.85 ? 0.85 : 1), sh * (t > 0.85 ? 1.1 : 1), sh * (t > 0.85 ? 0.8 : 1)]
      b.tri(bp[0], bp[1], tip, col, 1)
      b.tri(bp[1], bp[2], tip, col, 1)
      b.tri(bp[2], bp[0], tip, col, 1)
      b.tri(bp[0], bp[2], bp[1], col, 1)
    }
  } else {
    const sides = lod === 1 ? 6 : 4
    const base = b.pos.length / 3
    const rows = lod === 1 ? 3 : 2
    for (let j = 0; j <= rows; j++) {
      const t = j / rows
      const rad = o.spikeR * 0.95 * Math.sin(Math.PI * Math.min(1, t * 0.9 + 0.1)) * (1 - 0.2 * t) + (j === rows ? 0 : 0)
      for (let s = 0; s < sides; s++) {
        const a = (s / sides) * TAU
        b.pos.push(Math.cos(a) * rad, o.stalk + t * o.spikeH, Math.sin(a) * rad)
        const k = 0.85 + 0.2 * hash2(s, j) - t * 0.1
        b.col.push(k, k, k)
        b.head.push(1)
      }
    }
    for (let j = 0; j < rows; j++)
      for (let s = 0; s < sides; s++) {
        const a = base + j * sides + s
        const c = base + j * sides + ((s + 1) % sides)
        b.idx.push(a, a + sides, c, c, a + sides, c + sides)
      }
  }
}

/* ======================================================================= kits */
export interface FlowerKit {
  lods: THREE.BufferGeometry[]
  height: number
  scale: [number, number]
}
const kits = new Map<string, FlowerKit>()
export function getKit(species: Species, shape: Shape): FlowerKit {
  const key = species + shape
  const hit = kits.get(key)
  if (hit) return hit
  const lods: THREE.BufferGeometry[] = []
  for (let lod = 0; lod < 3; lod++) {
    const b = new GB()
    if (species === 'tulip') {
      tulipBody(b, lod)
      tulipHead(b, shape, lod)
    } else if (species === 'daffodil') daffodil(b, lod)
    else if (species === 'hyacinth') spike(b, lod, { stalk: 0.15, spikeH: 0.115, spikeR: 0.02, n: 34, fs: 0.0085, leaves: 5, leafLen: 0.22, leafW: 0.045 })
    else spike(b, lod, { stalk: 0.1, spikeH: 0.07, spikeR: 0.0105, n: 26, fs: 0.0048, leaves: 5, leafLen: 0.2, leafW: 0.012 })
    lods.push(b.build())
  }
  const height = species === 'tulip' ? 0.44 : species === 'daffodil' ? 0.38 : species === 'hyacinth' ? 0.27 : 0.18
  const kit: FlowerKit = { lods, height, scale: species === 'tulip' ? [0.95, 1.3] : [0.9, 1.2] }
  kits.set(key, kit)
  return kit
}

/* ======================================================================= materials */
export const flowerUniforms = { uTime: { value: 0 }, uWind: { value: 0.6 } }
const mats = new Map<string, THREE.MeshStandardMaterial>()
export function flowerMaterial(species: Species, lod: number): THREE.MeshStandardMaterial {
  const key = species + lod
  const hit = mats.get(key)
  if (hit) return hit
  const height = species === 'tulip' ? 0.44 : species === 'daffodil' ? 0.38 : species === 'hyacinth' ? 0.27 : 0.18
  const boost = [1, 1.38, 2.1][lod]
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: species === 'tulip' ? 0.5 : 0.62, metalness: 0 })
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = flowerUniforms.uTime
    sh.uniforms.uWind = flowerUniforms.uWind
    sh.uniforms.uBoost = { value: boost }
    sh.uniforms.uInvH = { value: 1 / height }
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aHead;\nuniform float uTime, uWind, uBoost, uInvH;')
      .replace(
        '#include <color_vertex>',
        `vColor = vec3(1.0);
vColor *= color;
#ifdef USE_INSTANCING_COLOR
vColor = mix(vColor, vColor * instanceColor.xyz, aHead);
#endif`,
      )
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.xz *= uBoost;')
      .replace(
        '#include <project_vertex>',
        `vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
mvPosition = instanceMatrix * mvPosition;
vec3 ip = vec3(instanceMatrix[3]);
float wgt = clamp(position.y * uInvH, 0.0, 1.0); wgt *= wgt;
float ph = dot(ip.xz, vec2(0.23, 0.14)) - uTime * 1.55;
float gust = sin(ph) * 0.65 + sin(ph * 2.7 + ip.x) * 0.25 + sin(uTime * 0.6 + ip.z * 0.05) * 0.2;
mvPosition.x += uWind * wgt * gust * 0.05;
mvPosition.z += uWind * wgt * (sin(ph * 0.8 + 1.3) * 0.6 + 0.3) * 0.03;
#endif
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;`,
      )
    sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * 0.05;')
  }
  m.customProgramCacheKey = () => 'flower' + lod + species
  mats.set(key, m)
  return m
}

/* ======================================================================= bed field */
export interface QualityCfg {
  spacing: number
  lod0: number
  lod1: number
  lod2: number
}

interface BedRT {
  bed: Bed
  lods: (THREE.InstancedMesh | null)[]
  carpet: THREE.Mesh
  cur: number
}

export class BedField {
  group = new THREE.Group()
  private rt: BedRT[] = []
  count = 0
  constructor(beds: Bed[], private cfg: QualityCfg, speckle: THREE.Texture, onProgress?: (f: number) => void) {
    const carpetMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, map: speckle })
    beds.forEach((bed, bi) => {
      this.rt.push(this.build(bed, carpetMat))
      onProgress?.((bi + 1) / beds.length)
    })
    this.rt.forEach((r) => {
      this.group.add(r.carpet)
      r.lods.forEach((m) => m && this.group.add(m))
    })
  }

  private build(bed: Bed, carpetMat: THREE.Material): BedRT {
    const r = rng(bed.seed * 7 + 3)
    const sp = this.cfg.spacing * (bed.species === 'muscari' ? 0.6 : bed.species === 'hyacinth' ? 1.15 : bed.species === 'daffodil' ? 1.25 : 1)
    const pts: [number, number][] = []
    for (let x = bed.b.x0; x < bed.b.x1; x += sp) {
      for (let z = bed.b.z0; z < bed.b.z1; z += sp) {
        const px = x + (r() - 0.5) * sp * 0.9
        const pz = z + (r() - 0.5) * sp * 0.9
        if (pointInPoly(px, pz, bed.poly)) pts.push([px, pz])
      }
    }
    shuffle(pts, r)
    const n = pts.length
    const kit = getKit(bed.species, bed.shape)
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const e = new THREE.Euler()
    const pos = new THREE.Vector3()
    const sc = new THREE.Vector3()
    const colors = VARIETIES.map((v) => new THREE.Color(v.color))
    const base = new THREE.InstancedMesh(kit.lods[0], flowerMaterial(bed.species, 0), Math.max(n, 1))
    const tmp = new THREE.Color()
    const baseY = bed.indoor ? bed.y + 0.06 : 0
    for (let i = 0; i < n; i++) {
      const [x, z] = pts[i]
      const vi = varietyAt(bed, x, z)
      const s = lerp(kit.scale[0], kit.scale[1], r())
      e.set((r() - 0.5) * 0.22, r() * TAU, (r() - 0.5) * 0.22)
      q.setFromEuler(e)
      pos.set(x, bed.indoor ? baseY : groundHeight(x, z) + 0.02, z)
      sc.setScalar(s * (bed.species === 'tulip' ? 1 : 1))
      m.compose(pos, q, sc)
      base.setMatrixAt(i, m)
      const k = 0.82 + r() * 0.3
      tmp.copy(colors[vi]).multiplyScalar(k)
      tmp.offsetHSL((r() - 0.5) * 0.012, (r() - 0.5) * 0.08, 0)
      base.setColorAt(i, tmp)
    }
    base.instanceMatrix.setUsage(THREE.StaticDrawUsage)
    base.count = n
    const lods: (THREE.InstancedMesh | null)[] = [base]
    for (let l = 1; l < 3; l++) {
      const mesh = new THREE.InstancedMesh(kit.lods[l], flowerMaterial(bed.species, l), 1)
      mesh.instanceMatrix = base.instanceMatrix
      mesh.instanceColor = base.instanceColor
      mesh.count = Math.max(1, Math.ceil(n * (l === 1 ? 0.5 : 0.2)))
      lods.push(mesh)
    }
    for (const [l, mesh] of lods.entries()) {
      if (!mesh) continue
      mesh.receiveShadow = true
      mesh.castShadow = false
      mesh.visible = false
      mesh.frustumCulled = true
      mesh.computeBoundingSphere()
      if (mesh.boundingSphere) mesh.boundingSphere.radius += 0.5
      mesh.userData.lod = l
    }
    this.count += n

    // carpet (distant colour + gap filler)
    const cell = 0.7
    const cp: number[] = []
    const cc: number[] = []
    const cu: number[] = []
    const ci: number[] = []
    const carpetY = bed.indoor ? baseY + 0.1 : 0.07
    const leafG = new THREE.Color(0.05, 0.14, 0.035)
    for (let x = bed.b.x0; x < bed.b.x1; x += cell) {
      for (let z = bed.b.z0; z < bed.b.z1; z += cell) {
        const cx = x + cell / 2
        const cz = z + cell / 2
        if (!pointInPoly(cx, cz, bed.poly)) continue
        const vi = varietyAt(bed, cx, cz)
        tmp.copy(colors[vi]).lerp(leafG, bed.species === 'tulip' ? 0.78 : 0.6).multiplyScalar(0.55 + hash2(cx * 10, cz * 10) * 0.3)
        const b0 = cp.length / 3
        const y = (bed.indoor ? 0 : groundHeight(cx, cz)) + carpetY
        for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
          cp.push(x + dx * cell, y, z + dz * cell)
          cc.push(tmp.r, tmp.g, tmp.b)
          cu.push(x + dx * cell, z + dz * cell)
        }
        ci.push(b0, b0 + 2, b0 + 1, b0 + 1, b0 + 2, b0 + 3)
      }
    }
    const cg = new THREE.BufferGeometry()
    cg.setAttribute('position', new THREE.Float32BufferAttribute(cp, 3))
    cg.setAttribute('color', new THREE.Float32BufferAttribute(cc, 3))
    cg.setAttribute('uv', new THREE.Float32BufferAttribute(cu, 2))
    cg.setIndex(ci)
    cg.computeVertexNormals()
    const carpet = new THREE.Mesh(cg, carpetMat)
    carpet.receiveShadow = true
    return { bed, lods, carpet, cur: -1 }
  }

  update(cam: THREE.Vector3) {
    const { lod0, lod1, lod2 } = this.cfg
    for (const r of this.rt) {
      const b = r.bed.b
      const dx = Math.max(b.x0 - cam.x, 0, cam.x - b.x1)
      const dz = Math.max(b.z0 - cam.z, 0, cam.z - b.z1)
      const d = Math.hypot(dx, dz, r.bed.indoor ? 0 : cam.y * 0.3)
      const want = d < lod0 ? 0 : d < lod1 ? 1 : d < lod2 ? 2 : -1
      if (want !== r.cur) {
        r.lods.forEach((m, i) => m && (m.visible = i === want))
        r.cur = want
      }
    }
  }
  dispose() {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.isMesh && m.geometry && m.userData.lod === undefined) m.geometry.dispose()
    })
  }
}

export { clamp }

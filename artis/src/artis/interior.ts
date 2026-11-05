import * as THREE from 'three'
import { AQ, AQ_F } from './buildings'
import { palm } from './nature'
import { Ctx, M, Mat, TAU, canvas, canvasTex, columnGeo, placeGeo, pbr, poly, rng, std } from './gfx'

export interface HallAPI {
  tankLights: THREE.PointLight[]
  warmLights: THREE.PointLight[]
  skylight: THREE.MeshStandardMaterial
  lamps: THREE.MeshStandardMaterial
}

const memo = new Map<string, THREE.MeshStandardMaterial>()
const cm = (color: string, em = 0.28, rough = 0.6) => {
  const k = color + em + rough
  let m = memo.get(k)
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: rough, emissive: color, emissiveIntensity: em })
    m.shadowSide = THREE.DoubleSide
    memo.set(k, m)
  }
  return m
}

/* ---------------- tank water shader ---------------- */
const timeU = { value: 0 }
function tankMaterial(deep: string, shallow: string, h: number) {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: { uTime: timeU, uDeep: { value: new THREE.Color(deep) }, uShallow: { value: new THREE.Color(shallow) }, uH: { value: h } },
    vertexShader: /* glsl */ `varying vec3 vW; varying vec3 vL;
      void main(){ vL = position; vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
    fragmentShader: /* glsl */ `uniform float uTime; uniform vec3 uDeep; uniform vec3 uShallow; uniform float uH; varying vec3 vW; varying vec3 vL;
      float caustic(vec2 p, float t){
        vec2 q = p; float v = 0.0;
        for(int i=0;i<3;i++){ q += vec2(sin(q.y*1.7+t*0.7+float(i)), cos(q.x*1.5-t*0.6+float(i)*2.0))*0.55; v += abs(sin(q.x*2.1)+sin(q.y*2.4)); }
        return pow(clamp(1.0 - v/6.0, 0.0, 1.0), 5.0);
      }
      void main(){
        float hy = clamp(vL.y/uH + 0.5, 0.0, 1.0);
        vec3 col = mix(uDeep, uShallow, pow(hy, 1.4));
        float d = distance(vW, cameraPosition);
        float c = caustic(vW.xz*0.8 + vW.y*0.35, uTime);
        col += uShallow * c * (0.25 + 0.75*hy) * 1.6;
        float ray = pow(max(0.0, sin(vW.x*2.2 + vW.z*0.6 + uTime*0.18)*0.5+0.5), 4.0) * hy * 0.22;
        col += uShallow * ray;
        col = mix(col, uDeep*0.55, 1.0 - exp(-d*0.05));
        gl_FragColor = vec4(col, 1.0);
      }`,
  })
}

function openBox(w: number, h: number, d: number) {
  const g = new THREE.BoxGeometry(w, h, d)
  const idx = g.index!.array as Uint16Array
  const out: number[] = []
  // groups: px,nx,py,ny,pz,nz each 6 indices → drop +z (front)
  for (const grp of g.groups) if (grp.materialIndex !== 4) for (let i = 0; i < grp.count; i++) out.push(idx[grp.start + i])
  g.setIndex(out)
  g.clearGroups()
  return g
}

/* ---------------- fish ---------------- */
type FishKind = 'slim' | 'deep' | 'long' | 'shark' | 'flat'
function fishGeo(kind: FishKind) {
  const dims: Record<FishKind, [number, number, number, number]> = {
    slim: [0.5, 0.17, 0.12, 0.3],
    deep: [0.5, 0.36, 0.1, 0.32],
    long: [0.5, 0.12, 0.12, 0.2],
    shark: [0.5, 0.13, 0.15, 0.34],
    flat: [0.5, 0.42, 0.06, 0.3],
  }
  const [r, hy, hz, tl] = dims[kind]
  const parts: THREE.BufferGeometry[] = []
  const body = new THREE.SphereGeometry(r, 16, 12)
  body.scale(1, hy / r, hz / r)
  parts.push(body.toNonIndexed())
  const tail = new THREE.Shape()
  tail.moveTo(0, 0)
  tail.lineTo(-tl, tl * 0.75)
  tail.lineTo(-tl * 0.7, 0)
  tail.lineTo(-tl, -tl * 0.75)
  tail.closePath()
  const tg = new THREE.ShapeGeometry(tail)
  tg.translate(-r * 0.92, 0, 0)
  parts.push(tg.toNonIndexed())
  const fin = new THREE.Shape()
  fin.moveTo(r * 0.35, 0)
  fin.lineTo(-r * 0.15, hy * (kind === 'shark' ? 2.2 : 1.05))
  fin.lineTo(-r * 0.4, 0)
  fin.closePath()
  const fg = new THREE.ShapeGeometry(fin)
  fg.translate(0, hy * 0.85, 0)
  parts.push(fg.toNonIndexed())
  for (const p of parts) {
    p.deleteAttribute('uv')
    for (const k of Object.keys(p.attributes)) if (!['position', 'normal'].includes(k)) p.deleteAttribute(k)
  }
  const merged = new THREE.BufferGeometry()
  const n = parts.reduce((a, p) => a + p.attributes.position.count, 0)
  const pos = new Float32Array(n * 3)
  const nor = new Float32Array(n * 3)
  let o = 0
  for (const p of parts) {
    pos.set(p.attributes.position.array as Float32Array, o * 3)
    nor.set(p.attributes.normal.array as Float32Array, o * 3)
    o += p.attributes.position.count
  }
  merged.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  merged.setAttribute('normal', new THREE.BufferAttribute(nor, 3))
  const col = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    const y = pos[i * 3 + 1] / (hy * 2)
    const v = 0.62 + 0.38 * THREE.MathUtils.smoothstep(y, -0.4, 0.4)
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = v
  }
  merged.setAttribute('color', new THREE.BufferAttribute(col, 3))
  return merged
}

const fishMatCache = new Map<number, THREE.MeshStandardMaterial>()
function fishMat() {
  const key = 0
  let m = fishMatCache.get(key)
  if (m) return m
  m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.25, side: THREE.DoubleSide, emissive: '#ffffff', emissiveIntensity: 0.0 })
  m.onBeforeCompile = (s) => {
    s.uniforms.uTime = timeU
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float ph = instanceMatrix[3].x*2.7 + instanceMatrix[3].z*1.9;
        float k = smoothstep(0.15, -0.8, position.x);
        transformed.z += sin(uTime*8.0 + ph + position.x*7.0) * 0.14 * k;`)
  }
  m.customProgramCacheKey = () => 'fish'
  fishMatCache.set(key, m)
  return m
}

interface SchoolO {
  kind: FishKind; n: number; size: [number, number]; colors: string[]
  c: [number, number, number]; ext: [number, number, number]; speed: [number, number]; seed: number
}
function school(ctx: Ctx, o: SchoolO) {
  const r = rng(o.seed)
  const mesh = new THREE.InstancedMesh(fishGeo(o.kind), fishMat(), o.n)
  mesh.castShadow = false
  mesh.frustumCulled = false
  const par = Array.from({ length: o.n }, () => ({
    ph: [r() * TAU, r() * TAU, r() * TAU],
    w: [o.speed[0] + r() * (o.speed[1] - o.speed[0]), 0.5 + r() * 0.6, 0.7 + r() * 0.7].map((v, i) => (i === 0 ? v : v * (o.speed[0] + o.speed[1]) * 0.5)),
    s: o.size[0] + r() * (o.size[1] - o.size[0]),
    a: [0.5 + r() * 0.5, 0.35 + r() * 0.4, 0.5 + r() * 0.5],
  }))
  const col = new THREE.Color()
  par.forEach((_, i) => {
    col.set(o.colors[(r() * o.colors.length) | 0])
    col.offsetHSL(0, 0, (r() - 0.5) * 0.08)
    mesh.setColorAt(i, col)
  })
  const q = new THREE.Quaternion()
  const e = new THREE.Euler()
  const m = new THREE.Matrix4()
  const pos = new THREE.Vector3()
  const sc = new THREE.Vector3()
  ctx.updaters.push((t) => {
    for (let i = 0; i < o.n; i++) {
      const p = par[i]
      const w0 = p.w[0], w1 = p.w[1], w2 = p.w[2]
      const x = Math.sin(t * w0 * 0.4 + p.ph[0]) * o.ext[0] * p.a[0]
      const y = Math.sin(t * w1 * 0.3 + p.ph[1]) * o.ext[1] * p.a[1]
      const z = Math.sin(t * w2 * 0.35 + p.ph[2]) * o.ext[2] * p.a[2]
      const vx = Math.cos(t * w0 * 0.4 + p.ph[0]) * o.ext[0] * p.a[0] * w0 * 0.4
      const vy = Math.cos(t * w1 * 0.3 + p.ph[1]) * o.ext[1] * p.a[1] * w1 * 0.3
      const vz = Math.cos(t * w2 * 0.35 + p.ph[2]) * o.ext[2] * p.a[2] * w2 * 0.35
      const yaw = Math.atan2(-vz, vx)
      const pitch = Math.atan2(vy, Math.hypot(vx, vz))
      e.set(0, yaw, pitch, 'YZX')
      q.setFromEuler(e)
      pos.set(o.c[0] + x, o.c[1] + y, o.c[2] + z)
      sc.setScalar(p.s)
      m.compose(pos, q, sc)
      mesh.setMatrixAt(i, m)
    }
    mesh.instanceMatrix.needsUpdate = true
  })
  ctx.root.add(mesh)
}

/* ---------------- tank content ---------------- */
function rock(r: number, seed: number, sx = 1, sy = 0.7, sz = 1) {
  const g = new THREE.IcosahedronGeometry(r, 2)
  const p = g.attributes.position
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i)
    const d = 1 + 0.22 * Math.sin(x * 4.1 + seed) * Math.cos(z * 3.7 + seed * 2) + 0.12 * Math.sin(y * 7 + seed)
    p.setXYZ(i, x * d * sx, y * d * sy, z * d * sz)
  }
  g.computeVertexNormals()
  return g
}

function coralBranch(r: () => number, h: number) {
  const parts: THREE.BufferGeometry[] = []
  const n = 5 + ((r() * 4) | 0)
  for (let i = 0; i < n; i++) {
    const c = new THREE.ConeGeometry(0.06 + r() * 0.04, h * (0.6 + r() * 0.5), 6)
    c.translate(0, c.parameters.height / 2, 0)
    c.rotateZ((r() - 0.5) * 1.1)
    c.rotateY(r() * TAU)
    parts.push(c.toNonIndexed())
    const s = new THREE.SphereGeometry(0.07, 6, 5)
    s.translate(0, c.parameters.height, 0)
    parts.push(s.toNonIndexed())
  }
  return parts
}

function fillTank(ctx: Ctx, idx: number, cx: number, y0: number, cz: number, W: number, H: number, Dp: number) {
  const b = ctx.batch
  const r = rng(idx * 91 + 7)
  const add = (g: THREE.BufferGeometry, m: Mat, x: number, y: number, z: number, ry = 0) => placeGeo(b, g, m, cx + x, y0 + y, cz + z, ry, 'box')
  const sand = pbr('gravel', { tile: 1, color: idx === 1 ? '#6a5a46' : idx === 2 ? '#5d5b46' : '#d9ceb0', normal: 1.5, macro: 0.1 })
  const floor = new THREE.PlaneGeometry(W, Dp)
  floor.rotateX(-Math.PI / 2)
  add(floor, sand, 0, 0.05, 0)
  const rockM = pbr('stone', { tile: 1.6, color: idx === 2 ? '#51574a' : '#8a8478', normal: 1.8, macro: 0.2 })
  const rk = (x: number, z: number, s: number, ms = rockM) => add(rock(s, x + z, 1, 0.65, 1), ms, x, s * 0.35, z, r() * TAU)
  if (idx === 0) {
    // tropical coral reef
    for (let i = 0; i < 8; i++) rk((r() - 0.5) * (W - 1.4), (r() - 0.5) * (Dp - 1) - 0.3, 0.4 + r() * 0.6)
    const cols = ['#ff6f91', '#ff9f43', '#c56cf0', '#ffd166', '#ff5d73', '#7bed9f']
    for (let i = 0; i < 26; i++) {
      const x = (r() - 0.5) * (W - 1.2)
      const z = (r() - 0.5) * (Dp - 0.8)
      const m = cm(cols[(r() * cols.length) | 0], 0.32)
      for (const part of coralBranch(r, 0.6 + r() * 0.8)) add(part, m, x, 0.1, z)
    }
    for (let i = 0; i < 9; i++) {
      const g = new THREE.IcosahedronGeometry(0.28 + r() * 0.2, 3)
      const p = g.attributes.position
      for (let k = 0; k < p.count; k++) {
        const d = 1 + 0.07 * Math.sin(p.getX(k) * 22) * Math.sin(p.getZ(k) * 22)
        p.setXYZ(k, p.getX(k) * d, p.getY(k) * d * 0.7, p.getZ(k) * d)
      }
      g.computeVertexNormals()
      add(g, cm(['#d98cae', '#9ccf7a', '#e2b86a'][i % 3], 0.2, 0.85), (r() - 0.5) * (W - 1.5), 0.2, (r() - 0.5) * (Dp - 1))
    }
    for (let i = 0; i < 14; i++) {
      const c = new THREE.CylinderGeometry(0.1, 0.13, 0.5 + r() * 0.4, 8, 1, true)
      c.translate(0, c.parameters.height / 2, 0)
      add(c, cm('#e6a15c', 0.2, 0.8), (r() - 0.5) * (W - 1), 0.1, (r() - 0.5) * (Dp - 1))
    }
    const reefCols = ['#ff7a18', '#ffd400', '#29b6f6', '#ff4d6d', '#8e44ad', '#2ecc71']
    school(ctx, { kind: 'slim', n: 26, size: [0.22, 0.36], colors: reefCols, c: [cx, y0 + H * 0.45, cz], ext: [W * 0.45, H * 0.3, Dp * 0.4], speed: [0.9, 1.7], seed: 11 })
    school(ctx, { kind: 'deep', n: 8, size: [0.4, 0.55], colors: ['#ffd400', '#2f80ed', '#f2994a'], c: [cx, y0 + H * 0.42, cz], ext: [W * 0.4, H * 0.25, Dp * 0.35], speed: [0.5, 0.9], seed: 12 })
    school(ctx, { kind: 'flat', n: 4, size: [0.55, 0.75], colors: ['#f4f1de', '#3d405b'], c: [cx, y0 + H * 0.55, cz], ext: [W * 0.4, H * 0.2, Dp * 0.3], speed: [0.35, 0.6], seed: 13 })
  } else if (idx === 1) {
    // Amazon flooded forest
    const trunkM = pbr('bark', { tile: 1.2, color: '#8b7a66', normal: 1.6 })
    for (let i = 0; i < 6; i++) {
      const x = (i / 5 - 0.5) * (W - 1.6) + (r() - 0.5) * 0.6
      const z = (r() - 0.5) * (Dp - 1.2)
      const h = H * (0.95 + r() * 0.1)
      const c = new THREE.CylinderGeometry(0.1 + r() * 0.08, 0.2 + r() * 0.1, h, 10)
      c.translate(0, h / 2, 0)
      add(c, trunkM, x, 0, z)
      for (let k = 0; k < 4; k++) {
        const root = new THREE.ConeGeometry(0.1, 0.8, 5)
        root.translate(0, 0.4, 0)
        root.rotateZ(0.7)
        root.rotateY((k / 4) * TAU)
        add(root, trunkM, x, 0, z)
      }
    }
    for (let i = 0; i < 6; i++) rk((r() - 0.5) * (W - 1), (r() - 0.5) * (Dp - 1), 0.25 + r() * 0.35)
    for (let i = 0; i < 18; i++) {
      const h = 0.6 + r() * 1.0
      const c = new THREE.CylinderGeometry(0.012, 0.025, h, 4)
      c.translate(0, h / 2, 0)
      c.rotateZ((r() - 0.5) * 0.5)
      add(c, cm('#4f7a34', 0.2), (r() - 0.5) * (W - 1), 0.05, (r() - 0.5) * (Dp - 1))
    }
    school(ctx, { kind: 'slim', n: 30, size: [0.12, 0.18], colors: ['#38e0ff', '#2b6cff', '#ff4d4d'], c: [cx, y0 + H * 0.5, cz], ext: [W * 0.42, H * 0.3, Dp * 0.4], speed: [1.1, 1.8], seed: 21 })
    school(ctx, { kind: 'long', n: 3, size: [1.4, 1.9], colors: ['#8d8f86', '#a6a08c'], c: [cx, y0 + H * 0.4, cz], ext: [W * 0.38, H * 0.18, Dp * 0.3], speed: [0.25, 0.4], seed: 22 })
    school(ctx, { kind: 'deep', n: 5, size: [0.35, 0.5], colors: ['#c9a227', '#7a8450'], c: [cx, y0 + H * 0.45, cz], ext: [W * 0.4, H * 0.25, Dp * 0.35], speed: [0.4, 0.7], seed: 23 })
  } else if (idx === 2) {
    // Amsterdam canal
    const brickM = M.brickDark
    for (let i = 0; i < 18; i++) add(new THREE.BoxGeometry(0.22, 0.07, 0.1), brickM, (r() - 0.5) * (W - 1), 0.1 + r() * 0.1, (r() - 0.5) * (Dp - 1), r() * TAU)
    for (let i = 0; i < 6; i++) rk((r() - 0.5) * (W - 1), (r() - 0.5) * (Dp - 1), 0.22 + r() * 0.28, brickM)
    // sunken bicycle: wheels + frame
    const wheel = new THREE.TorusGeometry(0.34, 0.025, 6, 28)
    const bx = -0.6
    const bz = 0.1
    add(wheel.clone(), M.iron, bx - 0.4, 0.45, bz, 0.3)
    add(wheel.clone(), M.iron, bx + 0.4, 0.45, bz, 0.3)
    const fr = new THREE.CylinderGeometry(0.02, 0.02, 0.9, 5)
    fr.rotateZ(Math.PI / 2 - 0.15)
    add(fr, M.iron, bx, 0.62, bz)
    for (let i = 0; i < 40; i++) {
      const h = 1.0 + r() * 1.6
      const c = new THREE.CylinderGeometry(0.01, 0.03, h, 4)
      c.translate(0, h / 2, 0)
      c.rotateZ((r() - 0.5) * 0.35)
      add(c, cm('#5c7a2e', 0.15), (r() - 0.5) * (W - 0.8), 0.05, (r() - 0.5) * (Dp - 0.8))
    }
    school(ctx, { kind: 'deep', n: 8, size: [0.5, 0.75], colors: ['#c9792c', '#a89968', '#d8d4c0'], c: [cx, y0 + H * 0.4, cz], ext: [W * 0.4, H * 0.22, Dp * 0.32], speed: [0.35, 0.6], seed: 31 })
    school(ctx, { kind: 'slim', n: 28, size: [0.18, 0.28], colors: ['#c9ccc6', '#b8bfb2', '#d9a066'], c: [cx, y0 + H * 0.5, cz], ext: [W * 0.42, H * 0.3, Dp * 0.4], speed: [0.9, 1.4], seed: 32 })
    school(ctx, { kind: 'long', n: 2, size: [0.9, 1.1], colors: ['#7d8a52'], c: [cx, y0 + H * 0.35, cz], ext: [W * 0.36, H * 0.15, Dp * 0.3], speed: [0.3, 0.45], seed: 33 })
  } else {
    // open ocean
    for (let i = 0; i < 5; i++) rk((r() - 0.5) * (W - 1.2), (r() - 0.5) * (Dp - 1), 0.4 + r() * 0.7)
    school(ctx, { kind: 'shark', n: 3, size: [1.6, 2.1], colors: ['#7f8c97', '#6f7b86'], c: [cx, y0 + H * 0.5, cz], ext: [W * 0.4, H * 0.2, Dp * 0.3], speed: [0.28, 0.45], seed: 41 })
    school(ctx, { kind: 'slim', n: 44, size: [0.2, 0.3], colors: ['#cfd8e3', '#b9c6d6', '#e6edf5'], c: [cx, y0 + H * 0.5, cz], ext: [W * 0.44, H * 0.34, Dp * 0.42], speed: [1.0, 1.6], seed: 42 })
    school(ctx, { kind: 'deep', n: 6, size: [0.5, 0.7], colors: ['#e0b43a', '#3b82c4'], c: [cx, y0 + H * 0.4, cz], ext: [W * 0.4, H * 0.25, Dp * 0.3], speed: [0.4, 0.7], seed: 43 })
    school(ctx, { kind: 'flat', n: 2, size: [1.0, 1.3], colors: ['#59616b'], c: [cx, y0 + H * 0.3, cz], ext: [W * 0.35, H * 0.12, Dp * 0.25], speed: [0.25, 0.35], seed: 44 })
  }
}

/* ---------------- placard ---------------- */
function placardTexture(title: string, lines: string[]) {
  const c = canvas(512, 320)
  const g = c.getContext('2d')!
  g.fillStyle = '#17231d'
  g.fillRect(0, 0, 512, 320)
  g.strokeStyle = '#d9b24a'
  g.lineWidth = 3
  g.strokeRect(10, 10, 492, 300)
  g.fillStyle = '#e7bf55'
  g.font = '700 34px Georgia, serif'
  g.textAlign = 'center'
  g.fillText(title, 256, 62)
  g.fillStyle = '#e9e5d6'
  g.font = '400 22px Georgia, serif'
  lines.forEach((l, i) => g.fillText(l, 256, 112 + i * 34))
  return canvasTex(c)
}

/* ================================================================== */
export function buildAquariumInterior(ctx: Ctx): HallAPI {
  const F = AQ_F
  const b = ctx.batch
  const { hallU: U, hallW0: W0, hallW1: W1, floorY: FY, ceilY: CY } = AQ
  const P = (u: number, y: number, w: number) => F.p(u, y, w)
  const away = (u: number, y: number, w: number) => F.p(u, y, w)

  // surfaces
  b.add(poly([P(-U, FY, W0), P(U, FY, W0), P(U, FY, W1), P(-U, FY, W1)], away(0, FY - 5, -10)), M.tiles, 'keep')
  b.add(poly([P(-U, CY, W0), P(U, CY, W0), P(U, CY, W1), P(-U, CY, W1)], away(0, CY + 5, -10)), M.stuccoIn, 'keep')
  b.add(poly([P(-U, FY, W0), P(U, FY, W0), P(U, CY, W0), P(-U, CY, W0)], away(0, 5, W0 - 5)), M.stuccoIn, 'keep')
  for (const s of [-1, 1]) {
    b.add(poly([P(s * U, FY, W0), P(s * U, FY, W1), P(s * U, CY, W1), P(s * U, CY, W0)], away(s * (U + 5), 5, -10)), M.stuccoIn, 'keep')
  }
  b.add(poly([P(-U, FY, W1), P(-2.2, FY, W1), P(-2.2, CY, W1), P(-U, CY, W1)], away(0, 5, W1 + 5)), M.stuccoIn, 'keep')
  b.add(poly([P(2.2, FY, W1), P(U, FY, W1), P(U, CY, W1), P(2.2, CY, W1)], away(0, 5, W1 + 5)), M.stuccoIn, 'keep')
  b.add(poly([P(-2.2, 6.6, W1), P(2.2, 6.6, W1), P(2.2, CY, W1), P(-2.2, CY, W1)], away(0, 5, W1 + 5)), M.stuccoIn, 'keep')
  // wainscot + skirting
  const wood = M.woodDark
  F.span(b, wood, -U, U, FY, FY + 1.5, W0, W0 + 0.12)
  F.span(b, M.stoneLight, -U, U, FY + 1.5, FY + 1.64, W0, W0 + 0.2)
  for (const s of [-1, 1]) {
    F.span(b, wood, s * U - 0.06 - s * 0.06, s * U + 0.06 - s * 0.06, FY, FY + 1.5, W0, W1)
    F.span(b, wood, s < 0 ? -U : 2.2, s < 0 ? -2.2 : U, FY, FY + 1.5, W1 - 0.12, W1)
  }
  // ceiling beams & pilasters
  for (let u = -U + 5.5; u < U; u += 5.5) F.span(b, M.stoneLight, u - 0.3, u + 0.3, CY - 0.55, CY, W0, W1)
  for (const w of [-5, -11.5, -18]) F.span(b, M.stoneLight, -U, U, CY - 0.4, CY, w - 0.25, w + 0.25)
  for (let u = -U + 5.5; u < U; u += 5.5) {
    F.span(b, M.stoneLight, u - 0.4, u + 0.4, FY + 1.6, CY - 0.5, W0, W0 + 0.28)
  }
  F.span(b, M.stoneLight, -U, U, CY - 0.7, CY - 0.5, W0, W0 + 0.5)
  for (const sd of [-1, 1]) {
    const ua = sd < 0 ? -U : U - 0.45
    const ub = sd < 0 ? -U + 0.45 : U
    F.span(b, M.stoneLight, ua, ub, CY - 0.7, CY - 0.5, W0, W1)
    for (let w = W0 + 3.5; w < W1 - 1; w += 4.7) {
      F.span(b, M.stoneLight, ua, ub, FY + 1.64, CY - 0.7, w - 0.4, w + 0.4)
      F.span(b, M.stoneLight, ua - (sd < 0 ? 0 : 0.1), ub + (sd < 0 ? 0.1 : 0), FY + 1.64, FY + 2.0, w - 0.55, w + 0.55)
      F.span(b, M.stoneLight, ua - (sd < 0 ? 0 : 0.1), ub + (sd < 0 ? 0.1 : 0), CY - 1.1, CY - 0.7, w - 0.55, w + 0.55)
    }
  }
  F.span(b, M.stoneLight, -U, -2.2, CY - 0.7, CY - 0.5, W1 - 0.5, W1)
  F.span(b, M.stoneLight, 2.2, U, CY - 0.7, CY - 0.5, W1 - 0.5, W1)
  // door-side lit transom inside
  // skylights
  const skylight = new THREE.MeshStandardMaterial({ color: '#cfe0ea', emissive: '#dff1ff', emissiveIntensity: 1.0, roughness: 0.9 })
  for (const u of [-13, 0, 13]) {
    const g = new THREE.PlaneGeometry(9, 4.8)
    g.rotateX(Math.PI / 2)
    placeGeo(b, g, skylight, F.x(u, -5.8), CY - 0.03, F.z(u, -5.8), 0, 'keep')
  }
  for (const u of [-13, 0, 13]) {
    for (const w of [-14.6, -8.4, -3.2]) void [u, w]
  }
  // cast-iron columns
  for (const [u, w] of [[-8, -8.5], [8, -8.5], [-15.5, -8.5], [15.5, -8.5]]) {
    F.put(b, columnGeo('iron', 0.3, CY - FY - 0.5), M.ironGreen, u, FY, w, 'keep')
    ctx.posts.push({ x: F.x(u, w), z: F.z(u, w), r: 0.55 })
  }
  for (const w of [-8.5]) {
    F.span(b, M.ironGreen, -16.2, 16.2, CY - 0.55, CY - 0.4, w - 0.12, w + 0.12)
  }

  // tanks
  const defs = [
    { u: -16.5, name: 'Tropical Coral Reef', deep: '#04323f', shallow: '#18b8c4', col: '#4fd4e6', facts: ['Warm, shallow Indo-Pacific biotope', 'Corals, anemones and reef fish'] },
    { u: -5.5, name: 'Amazon Flooded Forest', deep: '#2a1506', shallow: '#c98a38', col: '#ffc16b', facts: ['The seasonally flooded várzea', 'Giant arapaima among the roots'] },
    { u: 5.5, name: 'Amsterdam Canals', deep: '#0b2a1e', shallow: '#4fb084', col: '#8be0b0', facts: ['Life beneath the Plantage canals', 'Carp, roach and a lost bicycle'] },
    { u: 16.5, name: 'Open Ocean', deep: '#031a33', shallow: '#2d78b8', col: '#6bb4ff', facts: ['Blue-water schooling fish', 'Sharks patrol the deep'] },
  ]
  const TW = 9, TH = 4.9, TD = 4, TY = 2.3
  const tankLights: THREE.PointLight[] = []
  defs.forEach((d, i) => {
    const cx = F.x(d.u, 0)
    const wc = W0 + 0.15 + TD / 2
    const cz = F.z(d.u, wc)
    const cy = TY + TH / 2
    const mesh = new THREE.Mesh(openBox(TW, TH, TD), tankMaterial(d.deep, d.shallow, TH))
    mesh.position.set(cx, cy, cz)
    ctx.root.add(mesh)
    fillTank(ctx, i, cx, TY, cz, TW, TH, TD)
    // pedestal + frame + hood
    F.span(b, M.woodDark, d.u - TW / 2 - 0.35, d.u + TW / 2 + 0.35, FY, TY, W0, W0 + TD + 0.55)
    F.span(b, M.stoneLight, d.u - TW / 2 - 0.4, d.u + TW / 2 + 0.4, TY - 0.14, TY, W0, W0 + TD + 0.62)
    for (const s of [-1, 1]) F.span(b, M.ironGreen, d.u + s * (TW / 2 + 0.15) - 0.15, d.u + s * (TW / 2 + 0.15) + 0.15, TY, TY + TH + 0.1, W0, W0 + TD + 0.35)
    F.span(b, M.ironGreen, d.u - TW / 2 - 0.3, d.u + TW / 2 + 0.3, TY + TH, TY + TH + 1.2, W0, W0 + TD + 0.35)
    F.span(b, M.stoneLight, d.u - TW / 2 - 0.4, d.u + TW / 2 + 0.4, TY + TH + 1.2, TY + TH + 1.4, W0, W0 + TD + 0.5)
    // glass
    const glass = new THREE.Mesh(
      new THREE.PlaneGeometry(TW, TH),
      new THREE.MeshPhysicalMaterial({ color: '#ffffff', transparent: true, opacity: 0.1, roughness: 0.02, metalness: 0, envMapIntensity: 1.4, depthWrite: false }),
    )
    glass.position.set(cx, cy, F.z(0, W0 + 0.15 + TD))
    glass.renderOrder = 5
    ctx.root.add(glass)
    // light strip under hood
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(TW - 0.6, 0.2), new THREE.MeshBasicMaterial({ color: d.col }))
    strip.rotation.x = Math.PI / 2
    strip.position.set(cx, TY + TH - 0.01, F.z(0, W0 + TD * 0.8))
    ctx.root.add(strip)
    // light
    const pl = new THREE.PointLight(d.col, 0, 15, 2)
    pl.position.set(cx, TY + 2.2, F.z(0, W0 + TD + 2.4))
    ctx.root.add(pl)
    tankLights.push(pl)
    // placard
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.625), new THREE.MeshStandardMaterial({ map: placardTexture(d.name, d.facts), roughness: 0.5 }))
    plate.position.set(cx, FY + 1.15, F.z(0, W0 + TD + 0.95))
    plate.rotation.x = -0.35
    ctx.root.add(plate)
    F.span(b, M.ironGreen, d.u - 0.03, d.u + 0.03, FY, FY + 1.0, W0 + TD + 0.9, W0 + TD + 0.96)
    F.span(b, M.ironGreen, d.u - 0.4, d.u + 0.4, FY, FY + 0.05, W0 + TD + 0.7, W0 + TD + 1.15)
  })
  // collider for tank block
  ctx.solids.push(F.aabb(-U + 0.4, U - 0.4, W0 - 0.1, W0 + TD + 0.8))

  // benches
  for (const u of [-5.5, 5.5]) {
    const w = -10.5
    F.span(b, M.wood, u - 1.4, u + 1.4, FY + 0.45, FY + 0.5, w - 0.3, w + 0.3)
    F.span(b, M.wood, u - 1.4, u + 1.4, FY + 0.5, FY + 0.95, w + 0.28, w + 0.33)
    for (const s of [-1, 1]) {
      F.span(b, M.ironGreen, u + s * 1.3 - 0.05, u + s * 1.3 + 0.05, FY, FY + 0.95, w - 0.3, w + 0.33)
    }
    ctx.solids.push(F.aabb(u - 1.45, u + 1.45, w - 0.35, w + 0.4))
  }
  // palms
  for (const [u, w] of [[0, -18.8], [-20.4, -3.2], [20.4, -3.2]] as [number, number][]) palm(ctx, F.x(u, w), FY, F.z(u, w), 4.2, u * 7 + 3)
  ctx.posts.push({ x: F.x(0, -18.8), z: F.z(0, -18.8), r: 0.8 })
  ctx.posts.push({ x: F.x(-20.4, -3.2), z: F.z(-20.4, -3.2), r: 0.8 })
  ctx.posts.push({ x: F.x(20.4, -3.2), z: F.z(20.4, -3.2), r: 0.8 })

  // pendant lamps
  const lampMat = new THREE.MeshStandardMaterial({ color: '#fff4dc', emissive: '#ffcf8a', emissiveIntensity: 0.8, roughness: 0.4 })
  const warmLights: THREE.PointLight[] = []
  for (const [u, w] of [[-12, -4.5], [12, -4.5], [-12, -13], [12, -13], [0, -12]] as [number, number][]) {
    const g = new THREE.SphereGeometry(0.28, 16, 12)
    placeGeo(b, g, lampMat, F.x(u, w), CY - 1.9, F.z(u, w), 0, 'keep')
    F.span(b, M.iron, u - 0.015, u + 0.015, CY - 1.7, CY, w - 0.015, w + 0.015)
    if (warmLights.length < 2) {
      const pl = new THREE.PointLight('#ffd9a0', 0, 18, 2)
      pl.position.set(F.x(u, w), CY - 2.2, F.z(u, w))
      ctx.root.add(pl)
      warmLights.push(pl)
    }
  }

  // bubbles
  defs.forEach((d, i) => {
    const n = 90
    const g = new THREE.BufferGeometry()
    const pos = new Float32Array(n * 3)
    const r = rng(i + 500)
    for (let k = 0; k < n; k++) {
      pos[k * 3] = (r() - 0.5) * (TW - 1)
      pos[k * 3 + 1] = r() * TH
      pos[k * 3 + 2] = (r() - 0.5) * (TD - 0.6)
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: timeU, uH: { value: TH } },
      vertexShader: /* glsl */ `uniform float uTime; uniform float uH; void main(){ vec3 p = position; p.y = mod(p.y + uTime*(0.35+0.2*fract(p.x*7.3)), uH); p.x += sin(uTime*1.5+p.y*3.0+p.z*5.0)*0.04; vec4 mv = modelViewMatrix*vec4(p - vec3(0.0,uH*0.5,0.0),1.0); gl_PointSize = 44.0/(-mv.z); gl_Position = projectionMatrix*mv; }`,
      fragmentShader: /* glsl */ `void main(){ float d = length(gl_PointCoord-0.5); float a = smoothstep(0.5,0.35,d) - smoothstep(0.32,0.2,d)*0.7; gl_FragColor = vec4(vec3(0.7,0.9,1.0)*a*0.7, a); }`,
    })
    const pts = new THREE.Points(g, mat)
    pts.position.set(F.x(d.u, 0), TY, F.z(0, W0 + 0.15 + TD / 2))
    pts.frustumCulled = false
    ctx.root.add(pts)
  })
  ctx.updaters.push((t) => {
    timeU.value = t
  })
  void std
  return { tankLights, warmLights, skylight, lamps: lampMat }
}

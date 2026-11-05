import * as THREE from 'three'
import { Ctx, Frame, M, Mat, TAU, boxUV, canvas, canvasTex, clamp, placeGeo, pbr, poly, rng, std } from './gfx'

/* ------------------------------------------------------------------ */
/* shared layout                                                       */
/* ------------------------------------------------------------------ */
export const POND = { cx: 62, cz: 10 }
export const pondR = (a: number) => 14.5 + 2.4 * Math.sin(2 * a + 1.0) + 1.6 * Math.sin(3 * a + 0.5) + 1.0 * Math.sin(5 * a + 2.0)
export const ISLAND = { x: 66.5, z: 4.5, r: 3.6 }
export const PIER = { x0: 44.6, x1: 57.6, z0: 8.8, z1: 11.2 }
export const inPond = (x: number, z: number) => {
  const dx = x - POND.cx
  const dz = z - POND.cz
  return Math.hypot(dx, dz) < pondR(Math.atan2(dz, dx)) - 0.2
}

export const PATHS: { pts: [number, number][]; w: number; kind: 'paving' | 'gravel' }[] = [
  { pts: [[0, 72], [0, 18]], w: 7, kind: 'paving' },
  { pts: [[0, -20], [0, -30.4]], w: 10, kind: 'paving' },
  { pts: [[-34, -31.5], [36, -31.5]], w: 6, kind: 'gravel' },
  { pts: [[-19, 0], [-46.5, 6]], w: 7, kind: 'paving' },
  { pts: [[-47, -22], [-47, 34]], w: 4.5, kind: 'gravel' },
  { pts: [[19, 0], [44, 9.5]], w: 4.5, kind: 'gravel' },
  { pts: [[13, -13], [30, -24], [34, -31]], w: 3.2, kind: 'gravel' },
  { pts: [[-13, -13], [-30, -24], [-34, -31]], w: 3.2, kind: 'gravel' },
  { pts: [[-18, 40], [-6, 60]], w: 2.6, kind: 'gravel' },
  { pts: [[18, 40], [6, 60]], w: 2.6, kind: 'gravel' },
]
export const PLAZA_R = 20

const windU = { value: 0 }
const rnd = rng(2024)

/* ------------------------------------------------------------------ */
/* canvas textures for foliage                                         */
/* ------------------------------------------------------------------ */
function leafTexture(kind: 'beech' | 'willow' | 'dense') {
  const S = 256
  const c = canvas(S, S)
  const g = c.getContext('2d')!
  const r = rng(kind === 'beech' ? 5 : kind === 'willow' ? 6 : 7)
  const greens = kind === 'willow' ? ['#7d9b45', '#8fae52', '#6f8e3b', '#a1b95f'] : kind === 'dense' ? ['#3f6b2a', '#4d7a31', '#38602a', '#58853a'] : ['#4a7a2e', '#5b8c36', '#3d6a28', '#6a9a41', '#7aa84a']
  if (kind === 'dense') {
    g.fillStyle = '#3a6128'
    g.fillRect(0, 0, S, S)
  }
  const n = kind === 'willow' ? 90 : kind === 'dense' ? 700 : 130
  for (let i = 0; i < n; i++) {
    const x = r() * S
    const y = r() * S
    const a = kind === 'willow' ? Math.PI / 2 + (r() - 0.5) * 0.5 : r() * TAU
    const L = kind === 'willow' ? 34 + r() * 30 : kind === 'dense' ? 10 + r() * 8 : 20 + r() * 12
    const W = kind === 'willow' ? 3.2 : L * 0.5
    g.save()
    g.translate(x, y)
    g.rotate(a)
    g.fillStyle = greens[(r() * greens.length) | 0]
    g.beginPath()
    g.moveTo(0, 0)
    g.quadraticCurveTo(L * 0.5, -W, L, 0)
    g.quadraticCurveTo(L * 0.5, W, 0, 0)
    g.fill()
    if (kind !== 'dense') {
      g.strokeStyle = 'rgba(30,50,15,0.5)'
      g.lineWidth = 0.8
      g.beginPath()
      g.moveTo(0, 0)
      g.lineTo(L, 0)
      g.stroke()
    }
    g.restore()
    // wrap-around for seamless
    if (x < 30 || x > S - 30 || y < 30 || y > S - 30) {
      /* edges clipped intentionally; cards are alpha-tested so fine */
    }
  }
  return canvasTex(c)
}

function grassTexture() {
  const c = canvas(128, 128)
  const g = c.getContext('2d')!
  const r = rng(12)
  for (let i = 0; i < 46; i++) {
    const x = 6 + r() * 116
    const h = 50 + r() * 70
    const lean = (r() - 0.5) * 24
    const grd = g.createLinearGradient(0, 128, 0, 128 - h)
    grd.addColorStop(0, '#5a8a38')
    grd.addColorStop(1, ['#8db34a', '#9cc055', '#7aa23f'][(r() * 3) | 0])
    g.fillStyle = grd
    g.beginPath()
    g.moveTo(x - 3, 128)
    g.quadraticCurveTo(x + lean * 0.3, 128 - h * 0.5, x + lean, 128 - h)
    g.quadraticCurveTo(x + lean * 0.5 + 2, 128 - h * 0.5, x + 3, 128)
    g.fill()
  }
  return canvasTex(c)
}

function frondTexture() {
  const c = canvas(128, 512)
  const g = c.getContext('2d')!
  g.strokeStyle = '#5c7a2a'
  g.lineWidth = 4
  g.beginPath()
  g.moveTo(64, 512)
  g.lineTo(64, 6)
  g.stroke()
  for (let y = 20; y < 500; y += 11) {
    const L = 58 * Math.sin(Math.PI * (1 - y / 540)) + 6
    for (const s of [-1, 1]) {
      g.strokeStyle = y % 22 ? '#4a7a2c' : '#5b8c34'
      g.lineWidth = 5
      g.beginPath()
      g.moveTo(64, y)
      g.quadraticCurveTo(64 + s * L * 0.6, y - 12, 64 + s * L, y + 16)
      g.stroke()
    }
  }
  return canvasTex(c)
}

function waterNormalTex() {
  const N = 256
  const c = canvas(N, N)
  const g = c.getContext('2d')!
  const img = g.createImageData(N, N)
  const r = rng(31)
  const waves = Array.from({ length: 16 }, (_, i) => ({ fx: ((r() * 9) | 0) + 1 + (i > 8 ? 4 : 0), fy: ((r() * 9) | 0) + 1 + (i > 8 ? 3 : 0), a: (0.4 + r()) / (1 + i * 0.12), p: r() * TAU, sx: r() < 0.5 ? 1 : -1 }))
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      let dx = 0
      let dy = 0
      for (const w of waves) {
        const ph = (TAU * (w.fx * x + w.sx * w.fy * y)) / N + w.p
        const d = Math.cos(ph) * w.a
        dx += d * w.fx
        dy += d * w.sx * w.fy
      }
      const k = 0.03
      const n = new THREE.Vector3(-dx * k, -dy * k, 1).normalize()
      const i = (y * N + x) * 4
      img.data[i] = (n.x * 0.5 + 0.5) * 255
      img.data[i + 1] = (n.y * 0.5 + 0.5) * 255
      img.data[i + 2] = (n.z * 0.5 + 0.5) * 255
      img.data[i + 3] = 255
    }
  g.putImageData(img, 0, 0)
  const t = canvasTex(c, false)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  return t
}

/* ------------------------------------------------------------------ */
/* palm (also used inside the aquarium hall)                            */
/* ------------------------------------------------------------------ */
let frondMat: THREE.MeshStandardMaterial | null = null
export function palm(ctx: Ctx, x: number, y: number, z: number, h: number, seed: number) {
  const r = rng(seed)
  frondMat ??= new THREE.MeshStandardMaterial({ map: frondTexture(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.7, emissive: '#1d3a12', emissiveIntensity: 0.3 })
  const trunk = new THREE.CylinderGeometry(0.16, 0.26, h, 12, 6, true)
  trunk.translate(0, h / 2, 0)
  const tp = trunk.attributes.position
  for (let i = 0; i < tp.count; i++) {
    const t = tp.getY(i) / h
    tp.setX(i, tp.getX(i) + Math.sin(t * 2.4 + seed) * 0.12 * t)
  }
  trunk.computeVertexNormals()
  const uv = trunk.attributes.uv
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 1.4, uv.getY(i) * h * 0.5)
  placeGeo(ctx.batch, trunk, pbr('bark', { tile: 1.2, color: '#a89880', normal: 1.8 }), x, y, z, 0, 'keep')
  const topX = Math.sin(h * 0.0 + 2.4 + seed) * 0.12
  for (let i = 0; i < 11; i++) {
    const L = 2.3 + r() * 1.0
    const g = new THREE.PlaneGeometry(1.1, L, 1, 10)
    const p = g.attributes.position
    for (let k = 0; k < p.count; k++) {
      const t = (p.getY(k) + L / 2) / L
      p.setXYZ(k, p.getX(k), p.getY(k) + L / 2, -t * t * 1.3)
    }
    g.computeVertexNormals()
    g.rotateX(-0.55 - r() * 0.6)
    g.rotateY((i / 11) * TAU + r() * 0.4)
    placeGeo(ctx.batch, g, frondMat, x + topX, y + h - 0.1, z, 0, 'keep')
  }
}

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */
function distSeg(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
  const dx = bx - ax, dz = bz - az
  const t = clamp(((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz), 0, 1)
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz))
}

function ribbon(ctx: Ctx, pts: [number, number][], w: number, mat: Mat, y: number) {
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i]
    const [bx, bz] = pts[i + 1]
    const dx = bx - ax, dz = bz - az
    const L = Math.hypot(dx, dz)
    const nx = (-dz / L) * (w / 2)
    const nz = (dx / L) * (w / 2)
    const g = poly([new THREE.Vector3(ax + nx, y, az + nz), new THREE.Vector3(bx + nx, y, bz + nz), new THREE.Vector3(bx - nx, y, bz - nz), new THREE.Vector3(ax - nx, y, az - nz)], new THREE.Vector3(ax, y - 5, az))
    ctx.batch.add(g, mat)
  }
  for (let i = 1; i < pts.length - 1; i++) {
    const c = new THREE.CircleGeometry(w / 2, 20)
    c.rotateX(-Math.PI / 2)
    c.translate(pts[i][0], y, pts[i][1])
    ctx.batch.add(c, mat)
  }
}

function disc(ctx: Ctx, x: number, z: number, r: number, y: number, mat: Mat, inner = 0) {
  const g = inner > 0 ? new THREE.RingGeometry(inner, r, 72) : new THREE.CircleGeometry(r, 72)
  g.rotateX(-Math.PI / 2)
  g.translate(x, y, z)
  ctx.batch.add(g, mat)
}

/* ------------------------------------------------------------------ */
/* ground, street, paths                                               */
/* ------------------------------------------------------------------ */
function pondPoly(scale = 1, n = 80) {
  const pts: THREE.Vector2[] = []
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU
    const r = pondR(a) * scale
    pts.push(new THREE.Vector2(POND.cx + Math.cos(a) * r, POND.cz + Math.sin(a) * r))
  }
  return pts
}

function buildGround(ctx: Ctx) {
  const b = ctx.batch
  const s = new THREE.Shape()
  const E = 2600
  s.moveTo(-E, -E)
  s.lineTo(E, -E)
  s.lineTo(E, E)
  s.lineTo(-E, E)
  s.closePath()
  s.holes.push(new THREE.Path(pondPoly(1).map((p) => new THREE.Vector2(p.x, -p.y))))
  const g = new THREE.ShapeGeometry(s)
  g.rotateX(-Math.PI / 2)
  g.computeVertexNormals()
  b.add(g, M.grass)

  // street
  const road = (x0: number, x1: number, z0: number, z1: number, y: number, m: Mat) => {
    const p = new THREE.PlaneGeometry(x1 - x0, z1 - z0)
    p.rotateX(-Math.PI / 2)
    p.translate((x0 + x1) / 2, y, (z0 + z1) / 2)
    b.add(p, m)
  }
  road(-600, 600, 75, 89, 0.02, M.asphalt)
  road(-600, 600, 70, 75, 0.04, M.pavingLight)
  road(-600, 600, 89, 93, 0.04, M.pavingLight)
  road(-600, 600, 93, 140, 0.04, M.pavingLight)
  for (const z of [75, 89]) {
    const c = new THREE.BoxGeometry(1200, 0.14, 0.3)
    c.translate(0, 0.07, z + (z === 75 ? 0.15 : -0.15))
    b.add(c, M.stoneLight)
  }
  const line = std('#e8e8e2', 0.8)
  for (let x = -300; x < 300; x += 6) {
    const d = new THREE.BoxGeometry(2.6, 0.012, 0.16)
    d.translate(x, 0.03, 82.0)
    b.add(d, line)
  }
  for (const z of [76.4, 87.6]) {
    const d = new THREE.BoxGeometry(1200, 0.012, 0.14)
    d.translate(0, 0.03, z)
    b.add(d, line)
  }
  // zebra crossing in front of the gate
  for (let z = 75.6; z < 88.6; z += 1.0) {
    const d = new THREE.BoxGeometry(6.4, 0.014, 0.5)
    d.translate(0, 0.032, z)
    b.add(d, line)
  }
  // tram rails
  for (const z of [79.2, 80.64]) {
    const rl = new THREE.BoxGeometry(1200, 0.05, 0.07)
    rl.translate(0, 0.045, z)
    b.add(rl, M.iron)
  }
  const tramBed = new THREE.PlaneGeometry(1200, 2.6)
  tramBed.rotateX(-Math.PI / 2)
  tramBed.translate(0, 0.025, 79.92)
  b.add(tramBed, M.paving)

  // paths
  for (const p of PATHS) ribbon(ctx, p.pts, p.w, p.kind === 'paving' ? M.paving : M.gravel, p.kind === 'paving' ? 0.035 : 0.03)
  // plaza
  disc(ctx, 0, 0, PLAZA_R, 0.036, M.paving)
  disc(ctx, 0, 0, 12.4, 0.04, M.pavingLight, 11.9)
  disc(ctx, 0, 0, PLAZA_R + 0.35, 0.05, M.stoneLight, PLAZA_R)
  // pond ring path
  const ringPts: [number, number][] = []
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * TAU
    const r = pondR(a) + 3.2
    ringPts.push([POND.cx + Math.cos(a) * r, POND.cz + Math.sin(a) * r])
  }
  ribbon(ctx, ringPts, 2.6, M.gravel, 0.03)
}

/* ------------------------------------------------------------------ */
/* pond, island, pier, animals                                         */
/* ------------------------------------------------------------------ */
function flamingo(pose: 0 | 1 | 2, scale: number, oneLeg: boolean) {
  const grp = new THREE.Group()
  const pink = new THREE.MeshStandardMaterial({ color: '#f08f93', roughness: 0.75, emissive: '#7a2230', emissiveIntensity: 0.12 })
  const deep = new THREE.MeshStandardMaterial({ color: '#e9747f', roughness: 0.7 })
  const dark = new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.5 })
  const leg = new THREE.MeshStandardMaterial({ color: '#df6b78', roughness: 0.6 })
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.2, 20, 14), pink)
  body.scale.set(1.45, 0.82, 0.88)
  body.position.set(0, 0.8, 0)
  grp.add(body)
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.3, 10), deep)
  tail.rotation.z = Math.PI / 2 + 0.25
  tail.position.set(-0.36, 0.78, 0)
  grp.add(tail)
  const wing = new THREE.Mesh(new THREE.SphereGeometry(0.19, 14, 10), deep)
  wing.scale.set(1.3, 0.55, 0.3)
  wing.position.set(-0.04, 0.82, 0.14)
  const wing2 = wing.clone()
  wing2.position.z = -0.14
  grp.add(wing, wing2)
  const tips = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), dark)
  tips.scale.set(1.8, 0.3, 0.4)
  tips.position.set(-0.28, 0.78, 0.16)
  const tips2 = tips.clone()
  tips2.position.z = -0.16
  grp.add(tips, tips2)
  // neck
  const P = pose === 0 ? [[0.16, 0.9], [0.32, 1.12], [0.18, 1.34], [0.3, 1.52]] : pose === 1 ? [[0.16, 0.9], [0.4, 1.0], [0.55, 0.7], [0.6, 0.22]] : [[0.16, 0.9], [0.34, 1.1], [0.2, 1.28], [0.0, 1.2]]
  const curve = new THREE.CatmullRomCurve3(P.map(([x, y]) => new THREE.Vector3(x, y, 0)))
  const neck = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.032, 8), pink)
  grp.add(neck)
  const end = P[P.length - 1]
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.052, 12, 10), pink)
  head.position.set(end[0], end[1], 0)
  grp.add(head)
  const dir = new THREE.Vector3(end[0] - P[2][0], end[1] - P[2][1], 0).normalize()
  const beakA = new THREE.Mesh(new THREE.ConeGeometry(0.036, 0.13, 8), new THREE.MeshStandardMaterial({ color: '#f6d3cf', roughness: 0.6 }))
  const beakB = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.09, 8), dark)
  const ang = Math.atan2(dir.y, dir.x)
  for (const [m, d] of [[beakA, 0.1], [beakB, 0.19]] as [THREE.Mesh, number][]) {
    m.rotation.z = ang - Math.PI / 2 - 0.45
    m.position.set(end[0] + Math.cos(ang - 0.45) * d, end[1] + Math.sin(ang - 0.45) * d, 0)
    grp.add(m)
  }
  // legs
  const mkLeg = (z: number, folded: boolean) => {
    const pts = folded
      ? [new THREE.Vector3(0, 0.72, z), new THREE.Vector3(0.1, 0.5, z), new THREE.Vector3(-0.02, 0.45, z)]
      : [new THREE.Vector3(0, 0.72, z), new THREE.Vector3(0.01, 0.4, z), new THREE.Vector3(0.0, 0.0, z)]
    const t = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.014, 6), leg)
    grp.add(t)
    if (!folded) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.012, 0.06), leg)
      f.position.set(0.05, 0.006, z)
      grp.add(f)
    }
  }
  mkLeg(0.06, false)
  mkLeg(-0.06, oneLeg)
  grp.scale.setScalar(scale)
  grp.traverse((o) => ((o as THREE.Mesh).isMesh && ((o as THREE.Mesh).castShadow = true)))
  return grp
}

function duck() {
  const g = new THREE.Group()
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 10), new THREE.MeshStandardMaterial({ color: '#8f7a5e', roughness: 0.85 }))
  body.scale.set(1.5, 0.75, 0.9)
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 10), new THREE.MeshStandardMaterial({ color: '#1f6b45', roughness: 0.5, metalness: 0.2 }))
  head.position.set(0.22, 0.14, 0)
  const bill = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.025, 0.05), new THREE.MeshStandardMaterial({ color: '#d9c13a', roughness: 0.6 }))
  bill.position.set(0.31, 0.12, 0)
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.12, 6), new THREE.MeshStandardMaterial({ color: '#2a2a2a' }))
  tail.rotation.z = Math.PI / 2 + 0.4
  tail.position.set(-0.24, 0.07, 0)
  g.add(body, head, bill, tail)
  g.traverse((o) => ((o as THREE.Mesh).isMesh && ((o as THREE.Mesh).castShadow = true)))
  return g
}

function buildPond(ctx: Ctx) {
  const b = ctx.batch
  const soil = std('#43362a', 1, 0)
  soil.side = THREE.DoubleSide
  const pts = pondPoly(1, 90)
  // bank wall
  const out = new THREE.Vector3(POND.cx, 5, POND.cz)
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]
    const c = pts[(i + 1) % pts.length]
    b.add(poly([new THREE.Vector3(a.x, 0, a.y), new THREE.Vector3(c.x, 0, c.y), new THREE.Vector3(c.x, -1.1, c.y), new THREE.Vector3(a.x, -1.1, a.y)], out), soil, 'keep')
  }
  const bed = new THREE.ShapeGeometry(new THREE.Shape(pts.map((p) => new THREE.Vector2(p.x, -p.y))))
  bed.rotateX(-Math.PI / 2)
  bed.translate(0, -1.1, 0)
  bed.computeVertexNormals()
  b.add(bed, soil)
  // water
  const wn = waterNormalTex()
  wn.repeat.set(1 / 4, 1 / 4)
  const wm = new THREE.MeshStandardMaterial({ color: '#1f3a33', roughness: 0.05, metalness: 0.0, transparent: true, opacity: 0.9, normalMap: wn, normalScale: new THREE.Vector2(0.1, 0.1), envMapIntensity: 1.1 })
  const wg = new THREE.ShapeGeometry(new THREE.Shape(pts.map((p) => new THREE.Vector2(p.x, -p.y))))
  wg.rotateX(-Math.PI / 2)
  const uv = wg.attributes.uv
  const pos = wg.attributes.position
  for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i), pos.getZ(i))
  const water = new THREE.Mesh(wg, wm)
  water.position.y = -0.14
  water.receiveShadow = true
  water.renderOrder = 2
  ctx.root.add(water)
  ctx.updaters.push((t) => {
    wn.offset.set(t * 0.012, t * 0.008)
  })
  // edge rocks
  const rockM = pbr('stone', { tile: 1.2, color: '#9a9488', normal: 1.6, macro: 0.2 })
  const rg = new THREE.IcosahedronGeometry(0.5, 2)
  const rp = rg.attributes.position
  for (let i = 0; i < rp.count; i++) {
    const d = 1 + 0.18 * Math.sin(rp.getX(i) * 9) * Math.cos(rp.getZ(i) * 8)
    rp.setXYZ(i, rp.getX(i) * d, rp.getY(i) * d, rp.getZ(i) * d)
  }
  rg.computeVertexNormals()
  const N = 130
  const inst = new THREE.InstancedMesh(rg, rockM, N)
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  for (let i = 0; i < N; i++) {
    const a = (i / N) * TAU + rnd() * 0.05
    const r = pondR(a) + (rnd() - 0.6) * 0.5
    const s = 0.5 + rnd() * 0.8
    q.setFromEuler(new THREE.Euler(rnd() * 3, rnd() * 3, rnd() * 3))
    m.compose(new THREE.Vector3(POND.cx + Math.cos(a) * r, 0.0, POND.cz + Math.sin(a) * r), q, new THREE.Vector3(s * 1.2, s * 0.7, s))
    inst.setMatrixAt(i, m)
  }
  inst.castShadow = inst.receiveShadow = true
  ctx.root.add(inst)

  // island
  const I = ISLAND
  const isl = new THREE.CylinderGeometry(I.r, I.r + 0.5, 1.6, 40)
  isl.translate(I.x, -0.35, I.z)
  b.add(isl, soil)
  disc(ctx, I.x, I.z, I.r, 0.46, M.grass)
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU
    const rk = rg.clone()
    placeGeo(b, rk, rockM, I.x + Math.cos(a) * (I.r + 0.1), -0.05, I.z + Math.sin(a) * (I.r + 0.1), a, 'box')
  }

  // pier
  const P = PIER
  const cx = (P.x0 + P.x1) / 2
  const cz = (P.z0 + P.z1) / 2
  for (let x = P.x0; x < P.x1; x += 0.28) {
    const pl = new THREE.BoxGeometry(0.26, 0.07, P.z1 - P.z0)
    pl.translate(x + 0.13, 0.32, cz)
    b.add(pl, M.wood)
  }
  for (const z of [P.z0 + 0.1, P.z1 - 0.1]) {
    const bm = new THREE.BoxGeometry(P.x1 - P.x0, 0.14, 0.12)
    bm.translate(cx, 0.2, z)
    b.add(bm, M.woodDark)
  }
  for (let x = P.x0 + 0.4; x < P.x1; x += 2.6) {
    for (const z of [P.z0 + 0.1, P.z1 - 0.1]) {
      const pt = new THREE.CylinderGeometry(0.09, 0.1, 1.9, 8)
      pt.translate(x, -0.2, z)
      b.add(pt, M.woodDark)
      const post = new THREE.BoxGeometry(0.09, 1.0, 0.09)
      post.translate(x, 0.88, z)
      b.add(post, M.woodDark)
    }
  }
  for (const z of [P.z0 + 0.1, P.z1 - 0.1]) {
    for (const y of [0.95, 0.6]) {
      const rl = new THREE.BoxGeometry(P.x1 - P.x0, 0.06, 0.06)
      rl.translate(cx, y, z)
      b.add(rl, M.woodDark)
    }
  }
  ctx.floors.push({ x0: P.x0 + 0.05, x1: P.x1, z0: P.z0, z1: P.z1, y: 0.35 })
  ctx.floors.push({ x0: P.x0 - 2.2, x1: P.x0 + 0.05, z0: P.z0, z1: P.z1, y: 0, ramp: { axis: 'x', from: P.x0 - 2.2, to: P.x0 + 0.05, y0: 0, y1: 0.35 } })
  ctx.blockers.push((x, z) => inPond(x, z) && !(x > P.x0 - 0.2 && x < P.x1 + 0.2 && z > P.z0 - 0.15 && z < P.z1 + 0.15))
  ctx.noPlant.push((x, z, m2) => inPond(x, z) || Math.hypot(x - POND.cx, z - POND.cz) < pondR(Math.atan2(z - POND.cz, x - POND.cx)) + m2 + 2.5)

  // flamingos
  const spots: [number, number, number, 0 | 1 | 2, boolean][] = [
    [64.2, 2.8, 0.4, 0, true], [66.8, 7.4, 2.5, 1, false], [68.9, 5.1, 3.2, 0, false], [65.0, 5.8, 1.2, 2, true], [67.9, 2.2, 5.0, 1, false],
    [62.0, 14.5, 0.2, 0, false], [63.6, 15.4, 4.0, 1, true], [60.8, 16.2, 1.0, 0, true], [66.0, 16.6, 5.6, 2, false], [58.6, 4.8, 2.0, 1, false],
    [70.2, 12.0, 4.2, 0, true], [71.5, 15.0, 0.9, 1, false],
  ]
  const birds: { g: THREE.Group; b: number; neck: THREE.Object3D | null; ph: number }[] = []
  for (const [x, z, ry, pose, one] of spots) {
    const f = flamingo(pose, 0.95 + rnd() * 0.2, one)
    f.position.set(x, inPond(x, z) ? -0.12 : 0.46 * (Math.hypot(x - ISLAND.x, z - ISLAND.z) < ISLAND.r + 0.1 ? 1 : 0), z)
    f.rotation.y = ry
    ctx.root.add(f)
    birds.push({ g: f, b: ry, neck: null, ph: rnd() * TAU })
  }
  ctx.updaters.push((t) => {
    for (const bd of birds) {
      bd.g.rotation.y = bd.b + Math.sin(t * 0.15 + bd.ph) * 0.35
      bd.g.rotation.z = Math.sin(t * 0.7 + bd.ph) * 0.015
    }
  })
  // ducks
  const ducks: { g: THREE.Group; r: number; a: number; s: number; cx: number; cz: number }[] = []
  for (let i = 0; i < 9; i++) {
    const g = duck()
    ctx.root.add(g)
    ducks.push({ g, r: 4 + rnd() * 6, a: rnd() * TAU, s: (0.04 + rnd() * 0.05) * (rnd() < 0.5 ? 1 : -1), cx: POND.cx - 2 + rnd() * 4, cz: POND.cz + 2 + rnd() * 4 })
  }
  ctx.updaters.push((t) => {
    for (const d of ducks) {
      const a = d.a + t * d.s
      const x = d.cx + Math.cos(a) * d.r * 1.1
      const z = d.cz + Math.sin(a) * d.r * 0.85
      d.g.position.set(x, -0.12 + Math.sin(t * 1.6 + d.a * 5) * 0.012, z)
      d.g.rotation.y = -a - (d.s > 0 ? -Math.PI / 2 : Math.PI / 2) + 0
      const dirx = -Math.sin(a) * d.r * 1.1 * Math.sign(d.s)
      const dirz = Math.cos(a) * d.r * 0.85 * Math.sign(d.s)
      d.g.rotation.y = Math.atan2(-dirz, dirx)
    }
  })
}

/* ------------------------------------------------------------------ */
/* trees                                                               */
/* ------------------------------------------------------------------ */
interface Variant { kind: 'beech' | 'willow'; trunkH: number; rx: number; ry: number; cy: number; cards: number; size: number; seed: number; dark: number }

function makeTreeGeos(v: Variant) {
  const r = rng(v.seed)
  const pos: number[] = []
  const nor: number[] = []
  const uv: number[] = []
  const col: number[] = []
  const idx: number[] = []
  let vi = 0
  const willow = v.kind === 'willow'
  for (let i = 0; i < v.cards; i++) {
    const d = new THREE.Vector3(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1)
    if (d.length() < 0.001) d.set(0, 1, 0)
    d.normalize()
    const k = 0.5 + 0.5 * Math.pow(r(), 0.45)
    const c = new THREE.Vector3(d.x * v.rx * k, v.cy + d.y * v.ry * k, d.z * v.rx * k)
    if (willow) {
      c.y = v.cy + v.ry * (0.6 - r() * 1.1)
    }
    const sz = v.size * (0.75 + r() * 0.6)
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(willow ? (r() - 0.5) * 0.3 : r() * TAU, r() * TAU, willow ? (r() - 0.5) * 0.3 : r() * TAU))
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]]
    const bright = THREE.MathUtils.clamp(0.4 + 0.75 * k + (c.y - v.cy) / (v.ry * 3), 0.35, 1.15) * (0.82 + r() * 0.2) * v.dark
    const out = new THREE.Vector3(c.x, (c.y - v.cy) * 0.8 + 1.5, c.z).normalize()
    for (const [cx, cy] of corners) {
      const p = new THREE.Vector3(cx * sz * (willow ? 0.45 : 0.5), cy * sz * (willow ? 1.5 : 0.5), 0).applyQuaternion(q).add(c)
      pos.push(p.x, p.y, p.z)
      nor.push(out.x, out.y, out.z)
      uv.push(cx * 0.5 + 0.5, cy * 0.5 + 0.5)
      col.push(bright, bright, bright)
    }
    idx.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3)
    vi += 4
  }
  const crown = new THREE.BufferGeometry()
  crown.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  crown.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  crown.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  crown.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  crown.setIndex(idx)
  // trunk + limbs
  const parts: THREE.BufferGeometry[] = []
  const tr = new THREE.CylinderGeometry(0.28, 0.55, v.trunkH, 12, 5, false)
  tr.translate(0, v.trunkH / 2, 0)
  const tp = tr.attributes.position
  for (let i = 0; i < tp.count; i++) {
    const a = Math.atan2(tp.getZ(i), tp.getX(i))
    const t = tp.getY(i) / v.trunkH
    const f = 1 + 0.12 * Math.sin(a * 5) * (1 - t) + (t < 0.08 ? (0.08 - t) * 3 : 0)
    tp.setXYZ(i, tp.getX(i) * f, tp.getY(i), tp.getZ(i) * f)
  }
  tr.computeVertexNormals()
  scaleUVs(tr, 1.6, v.trunkH / 2)
  parts.push(tr.toNonIndexed())
  const nl = 6
  for (let i = 0; i < nl; i++) {
    const a = (i / nl) * TAU + r()
    const len = (v.cy - v.trunkH) * (0.55 + r() * 0.2)
    const limb = new THREE.CylinderGeometry(0.07, 0.2, len, 7)
    limb.translate(0, len / 2, 0)
    limb.rotateZ(-(0.4 + r() * 0.45))
    limb.rotateY(a)
    limb.translate(0, v.trunkH * 0.82, 0)
    scaleUVs(limb, 0.5, len / 2)
    parts.push(limb.toNonIndexed())
  }
  const merged = mergeParts(parts)
  return { crown, trunk: merged }
}

function scaleUVs(g: THREE.BufferGeometry, su: number, sv: number) {
  const uv = g.attributes.uv
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv)
}
function mergeParts(parts: THREE.BufferGeometry[]) {
  const n = parts.reduce((a, p) => a + p.attributes.position.count, 0)
  const pos = new Float32Array(n * 3)
  const nor = new Float32Array(n * 3)
  const uv = new Float32Array(n * 2)
  let o = 0
  for (const p of parts) {
    pos.set(p.attributes.position.array as Float32Array, o * 3)
    nor.set(p.attributes.normal.array as Float32Array, o * 3)
    uv.set(p.attributes.uv.array as Float32Array, o * 2)
    o += p.attributes.position.count
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3))
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  return g
}

function buildTrees(ctx: Ctx) {
  const variants: Variant[] = [
    { kind: 'beech', trunkH: 6.5, rx: 7.8, ry: 6.2, cy: 12.2, cards: 280, size: 3.3, seed: 3, dark: 1.0 },
    { kind: 'beech', trunkH: 5.5, rx: 6.4, ry: 5.8, cy: 10.4, cards: 240, size: 3.0, seed: 8, dark: 0.88 },
    { kind: 'beech', trunkH: 4.8, rx: 5.2, ry: 5.0, cy: 9.0, cards: 200, size: 2.7, seed: 13, dark: 1.05 },
    { kind: 'willow', trunkH: 3.6, rx: 4.8, ry: 3.4, cy: 5.8, cards: 130, size: 2.3, seed: 21, dark: 1.0 },
  ]
  const beechTex = leafTexture('beech')
  const willowTex = leafTexture('willow')
  const mats = variants.map((v) => {
    const m = new THREE.MeshStandardMaterial({ map: v.kind === 'willow' ? willowTex : beechTex, vertexColors: true, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.85, emissive: '#2a4a14', emissiveIntensity: 0.22 })
    m.onBeforeCompile = (s) => {
      s.fragmentShader = s.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal = normalize(vNormal);')
    }
    m.customProgramCacheKey = () => 'leafn'
    return m
  })
  const barkM = pbr('bark', { tile: 2.0, color: '#e6dccb', normal: 1.6, macro: 0.1, grime: 0 })
  const geos = variants.map(makeTreeGeos)

  const list: { v: number; x: number; z: number; s: number; ry: number }[] = []
  const r = rng(555)
  const taken: [number, number][] = []
  const okSpot = (x: number, z: number, m: number) => {
    if (ctx.noPlant.some((f) => f(x, z, m))) return false
    for (const [tx, tz] of taken) if (Math.hypot(tx - x, tz - z) < 8) return false
    return true
  }
  // path-lined + curated
  const push = (v: number, x: number, z: number, s: number, collide = true) => {
    list.push({ v, x, z, s, ry: r() * TAU })
    taken.push([x, z])
    if (collide) ctx.posts.push({ x, z, r: 0.6 * s })
  }
  // street plane trees (north pavement)
  for (let x = -112; x <= 112; x += 11.5) if (Math.abs(x) > 12) push(2, x + (r() - 0.5) * 1.5, 72.6, 0.85 + r() * 0.2)
  // pond willows
  for (const [x, z] of [[ISLAND.x - 0.5, ISLAND.z + 0.3], [POND.cx - 20, POND.cz - 14], [POND.cx - 18, POND.cz + 16], [POND.cx + 20, POND.cz + 12]] as [number, number][]) push(3, x, z, 1.15, x !== ISLAND.x - 0.5)
  // random park trees
  let tries = 0
  while (list.length < 120 && tries++ < 3000) {
    const x = (r() * 2 - 1) * 90
    const z = -64 + r() * 128
    if (z > 66) continue
    if (!okSpot(x, z, 3.5)) continue
    push((r() * 3) | 0, x, z, 0.8 + r() * 0.5)
  }
  const parkCount = list.length
  // dense belt outside and along the fence
  for (let i = 0; i < 150; i++) {
    const a = r() * TAU
    const rad = 110 + r() * 90
    const x = Math.cos(a) * rad * 1.1
    const z = Math.sin(a) * rad * 0.9 - 10
    if (z > 66 && z < 150) continue
    push((r() * 3) | 0, x, z, 1.0 + r() * 0.6, false)
  }
  for (let i = 0; i < 40; i++) {
    const side = r() < 0.5 ? -1 : 1
    push((r() * 3) | 0, side * (94 + r() * 4), -64 + r() * 125, 0.9 + r() * 0.5, false)
  }
  for (let i = 0; i < 24; i++) push((r() * 3) | 0, -88 + r() * 176, -68 - r() * 4, 0.9 + r() * 0.5, false)

  variants.forEach((_v, vi) => {
    const items = list.filter((t) => t.v === vi)
    if (!items.length) return
    const crown = new THREE.InstancedMesh(geos[vi].crown, mats[vi], items.length)
    const trunk = new THREE.InstancedMesh(geos[vi].trunk, barkM, items.length)
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const col = new THREE.Color()
    items.forEach((t, i) => {
      q.setFromEuler(new THREE.Euler(0, t.ry, 0))
      m.compose(new THREE.Vector3(t.x, 0, t.z), q, new THREE.Vector3(t.s, t.s * (0.92 + r() * 0.16), t.s))
      crown.setMatrixAt(i, m)
      trunk.setMatrixAt(i, m)
      col.setHSL(0.24 + (r() - 0.5) * 0.04, 0.4 + r() * 0.15, 0.4 + r() * 0.12)
      col.setRGB(0.85 + r() * 0.3, 0.9 + r() * 0.2, 0.75 + r() * 0.25)
      crown.setColorAt(i, col)
    })
    crown.castShadow = trunk.castShadow = true
    crown.receiveShadow = trunk.receiveShadow = true
    crown.frustumCulled = trunk.frustumCulled = false
    ctx.root.add(crown, trunk)
  })
  void parkCount
  ctx.noPlant.push((x, z, m) => taken.some(([tx, tz]) => Math.hypot(tx - x, tz - z) < 1.6 + m * 0.3))
}

/* ------------------------------------------------------------------ */
/* grass tufts with wind                                               */
/* ------------------------------------------------------------------ */
function buildGrassTufts(ctx: Ctx) {
  const N = 30000
  const g = new THREE.BufferGeometry()
  const pos: number[] = []
  const uv: number[] = []
  const nor: number[] = []
  const idx: number[] = []
  for (let k = 0; k < 2; k++) {
    const a = (k * Math.PI) / 2
    const c = Math.cos(a) * 0.3
    const s = Math.sin(a) * 0.3
    const base = pos.length / 3
    pos.push(-c, 0, -s, c, 0, s, c, 0.5, s, -c, 0.5, -s)
    uv.push(0, 0, 1, 0, 1, 1, 0, 1)
    for (let i = 0; i < 4; i++) nor.push(0, 1, 0)
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3)
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  g.setIndex(idx)
  const mat = new THREE.MeshStandardMaterial({ map: grassTexture(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 1, emissive: '#35561f', emissiveIntensity: 0.45 })
  mat.onBeforeCompile = (s) => {
    s.uniforms.uWind = windU
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uWind;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float sway = sin(uWind*1.6 + instanceMatrix[3].x*0.7 + instanceMatrix[3].z*0.9) * 0.07 * position.y * 2.0;
        transformed.x += sway; transformed.z += sway*0.6;`)
  }
  mat.customProgramCacheKey = () => 'grassw'
  const inst = new THREE.InstancedMesh(g, mat, N)
  const r = rng(808)
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const col = new THREE.Color()
  const pathTest = (x: number, z: number) => {
    for (const p of PATHS) for (let i = 0; i < p.pts.length - 1; i++) if (distSeg(x, z, p.pts[i][0], p.pts[i][1], p.pts[i + 1][0], p.pts[i + 1][1]) < p.w / 2 + 0.4) return true
    return false
  }
  let n = 0
  let tries = 0
  while (n < N && tries++ < N * 6) {
    const x = (r() * 2 - 1) * 90
    const z = -64 + r() * 130
    if (z > 69) continue
    if (Math.hypot(x, z) < PLAZA_R + 0.8) continue
    if (ctx.solids.some((s) => x > s.x0 - 0.6 && x < s.x1 + 0.6 && z > s.z0 - 0.6 && z < s.z1 + 0.6)) continue
    if (ctx.noPlant.some((f) => f(x, z, 0.6))) continue
    if (pathTest(x, z)) continue
    const s = 0.45 + r() * 0.55
    q.setFromEuler(new THREE.Euler(0, r() * TAU, 0))
    m.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(s, s * (0.55 + r() * 0.6), s))
    inst.setMatrixAt(n, m)
    col.setRGB(0.8 + r() * 0.35, 0.9 + r() * 0.2, 0.6 + r() * 0.3)
    inst.setColorAt(n, col)
    n++
  }
  inst.count = n
  inst.receiveShadow = true
  inst.frustumCulled = false
  ctx.root.add(inst)
  ctx.updaters.push((t) => (windU.value = t))
}

/* ------------------------------------------------------------------ */
/* props                                                               */
/* ------------------------------------------------------------------ */
export const LAMP_GLASS = new THREE.MeshStandardMaterial({ color: '#fff4dc', roughness: 0.3, emissive: '#ffcf8a', emissiveIntensity: 0.0 })

function lamp(ctx: Ctx, x: number, z: number, tall = 4.2) {
  const b = ctx.batch
  const at = (g: THREE.BufferGeometry, m: Mat, y: number) => {
    g.translate(x, y, z)
    b.add(g, m)
  }
  at(new THREE.CylinderGeometry(0.2, 0.28, 0.7, 10), M.ironGreen, 0.35)
  at(new THREE.CylinderGeometry(0.1, 0.13, 0.45, 10), M.ironGreen, 0.9)
  at(new THREE.CylinderGeometry(0.055, 0.075, tall - 1.1, 10), M.ironGreen, 1.15 + (tall - 1.1) / 2)
  at(new THREE.TorusGeometry(0.1, 0.03, 6, 14).rotateX(Math.PI / 2), M.ironGreen, 1.2)
  at(new THREE.CylinderGeometry(0.22, 0.12, 0.12, 12), M.ironGreen, tall)
  at(new THREE.SphereGeometry(0.26, 18, 14), LAMP_GLASS, tall + 0.32)
  at(new THREE.ConeGeometry(0.3, 0.26, 12), M.ironGreen, tall + 0.7)
  at(new THREE.SphereGeometry(0.05, 8, 6), M.gold, tall + 0.88)
  ctx.posts.push({ x, z, r: 0.28 })
  ctx.lamps.push(new THREE.Vector3(x, tall + 0.3, z))
}

function bench(ctx: Ctx, x: number, z: number, dir: 'S' | 'E' | 'N' | 'W') {
  const F = new Frame(x, z, dir)
  const b = ctx.batch
  for (let i = 0; i < 4; i++) F.span(b, M.wood, -0.9, 0.9, 0.46, 0.5, -0.24 + i * 0.12, -0.14 + i * 0.12)
  for (let i = 0; i < 3; i++) F.span(b, M.wood, -0.9, 0.9, 0.62 + i * 0.13, 0.7 + i * 0.13, -0.33 - i * 0.03, -0.29 - i * 0.03)
  for (const s of [-0.82, 0.82]) {
    F.span(b, M.ironGreen, s - 0.03, s + 0.03, 0, 0.9, -0.3, -0.26)
    F.span(b, M.ironGreen, s - 0.03, s + 0.03, 0.42, 0.46, -0.3, 0.3)
    F.span(b, M.ironGreen, s - 0.03, s + 0.03, 0, 0.46, 0.24, 0.28)
  }
  ctx.solids.push(F.aabb(-1.0, 1.0, -0.4, 0.35))
}

function bicycle(ctx: Ctx, x: number, z: number, ry: number) {
  const b = ctx.batch
  const tire = std('#161616', 0.8)
  const colr = std(['#2a3a52', '#6a1f24', '#2b4a3a', '#444a4f'][(rnd() * 4) | 0], 0.5, 0.4)
  const put = (g: THREE.BufferGeometry, m: Mat) => placeGeo(b, g, m, x, 0, z, ry, 'keep')
  for (const wx of [-0.5, 0.5]) {
    const w1 = new THREE.TorusGeometry(0.34, 0.022, 6, 24)
    w1.translate(wx, 0.36, 0)
    put(w1, tire)
    const w2 = new THREE.TorusGeometry(0.32, 0.006, 4, 20)
    w2.translate(wx, 0.36, 0)
    put(w2, M.iron)
  }
  const tube = (a: [number, number], c: [number, number], r = 0.016) => {
    const len = Math.hypot(c[0] - a[0], c[1] - a[1])
    const g = new THREE.CylinderGeometry(r, r, len, 6)
    g.rotateZ(-Math.atan2(c[0] - a[0], c[1] - a[1]))
    g.translate((a[0] + c[0]) / 2, (a[1] + c[1]) / 2, 0)
    put(g, colr)
  }
  tube([-0.5, 0.36], [-0.05, 0.38])
  tube([-0.05, 0.38], [0.38, 0.72])
  tube([-0.1, 0.72], [0.38, 0.72])
  tube([-0.1, 0.72], [-0.05, 0.38])
  tube([-0.5, 0.36], [-0.1, 0.72])
  tube([0.38, 0.72], [0.5, 0.36])
  tube([-0.05, 0.38], [0.5, 0.36])
  const bar = new THREE.CylinderGeometry(0.014, 0.014, 0.6, 6)
  bar.rotateX(Math.PI / 2)
  bar.translate(0.4, 0.84, 0)
  put(bar, M.iron)
  const seat = new THREE.BoxGeometry(0.22, 0.04, 0.12)
  seat.translate(-0.12, 0.78, 0)
  put(seat, M.iron)
  const bas = new THREE.BoxGeometry(0.18, 0.14, 0.34)
  bas.translate(0.62, 0.62, 0)
  put(bas, M.iron)
}

function hedge(ctx: Ctx, x0: number, z0: number, x1: number, z1: number, h = 1.2) {
  const t = 0.8
  const g = new THREE.BoxGeometry(x1 - x0 + (x1 - x0 < z1 - z0 ? t : 0), h, z1 - z0 + (x1 - x0 < z1 - z0 ? 0 : t))
  g.translate((x0 + x1) / 2, h / 2, (z0 + z1) / 2)
  const uv = g.attributes.uv
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 1.5, uv.getY(i) * 1.5)
  ctx.batch.add(g, hedgeMat(), 'box')
  ctx.solids.push({ x0: x0 - t / 2, x1: x1 + t / 2, z0: z0 - t / 2, z1: z1 + t / 2 })
}
let hm: THREE.MeshStandardMaterial | null = null
const hedgeMat = () => (hm ??= new THREE.MeshStandardMaterial({ map: (() => { const t = leafTexture('dense'); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(0.5, 0.5); return t })(), roughness: 0.95, color: '#a8c890' }))

function flowerBed(ctx: Ctx, cx: number, cz: number, shape: 'circle' | 'rect', a: number, b2: number, seed: number) {
  const r = rng(seed)
  const N = shape === 'circle' ? Math.floor(a * a * 28) : Math.floor(a * b2 * 22)
  const heads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.06, 8, 6).scale(1, 1.4, 1), std('#ffffff', 0.55), N)
  const stems = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.008, 0.01, 0.4, 4).translate(0, 0.2, 0), std('#3f6a2a', 0.8), N)
  const leaves = new THREE.InstancedMesh(new THREE.ConeGeometry(0.07, 0.34, 4).translate(0, 0.17, 0), std('#3d7a2c', 0.8), N)
  const pal = ['#e4202c', '#f6c400', '#ff7a1a', '#f35c9d', '#ffffff', '#8e44ad', '#ff3b3b', '#ffd84a']
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const col = new THREE.Color()
  let n = 0
  for (let i = 0; i < N; i++) {
    let x: number, z: number
    if (shape === 'circle') {
      const rr = Math.sqrt(r()) * (a - 0.2)
      const th = r() * TAU
      x = cx + Math.cos(th) * rr
      z = cz + Math.sin(th) * rr
    } else {
      x = cx + (r() - 0.5) * (a - 0.2)
      z = cz + (r() - 0.5) * (b2 - 0.2)
    }
    const h = 0.8 + r() * 0.5
    const zone = shape === 'circle' ? Math.floor((Math.hypot(x - cx, z - cz) / a) * 3) : Math.floor(((x - cx) / a + 0.5) * 4)
    col.set(pal[(zone * 2 + (r() < 0.2 ? 1 : 0)) % pal.length])
    q.setFromEuler(new THREE.Euler((r() - 0.5) * 0.2, r() * TAU, (r() - 0.5) * 0.2))
    m.compose(new THREE.Vector3(x, 0.02, z), q, new THREE.Vector3(1, h, 1))
    stems.setMatrixAt(n, m)
    leaves.setMatrixAt(n, m)
    m.compose(new THREE.Vector3(x, 0.02 + 0.4 * h, z), q, new THREE.Vector3(1, 1, 1))
    heads.setMatrixAt(n, m)
    heads.setColorAt(n, col)
    n++
  }
  heads.count = stems.count = leaves.count = n
  heads.castShadow = false
  heads.frustumCulled = stems.frustumCulled = leaves.frustumCulled = false
  ctx.root.add(heads, stems, leaves)
  // soil
  if (shape === 'circle') {
    disc(ctx, cx, cz, a, 0.07, M.soil)
    disc(ctx, cx, cz, a + 0.35, 0.28, M.stoneLight, a)
    const wall = new THREE.CylinderGeometry(a + 0.35, a + 0.35, 0.28, 64, 1, true)
    wall.translate(cx, 0.14, cz)
    ctx.batch.add(wall, M.stoneLight, 'box')
    const inner = new THREE.CylinderGeometry(a, a, 0.28, 64, 1, true)
    inner.translate(cx, 0.14, cz)
    ctx.batch.add(inner, M.stoneLight, 'box')
  } else {
    const p = new THREE.PlaneGeometry(a, b2)
    p.rotateX(-Math.PI / 2)
    p.translate(cx, 0.07, cz)
    ctx.batch.add(p, M.soil)
  }
  ctx.noPlant.push((x, z, m2) => (shape === 'circle' ? Math.hypot(x - cx, z - cz) < a + 1 + m2 : Math.abs(x - cx) < a / 2 + 1 + m2 && Math.abs(z - cz) < b2 / 2 + 1 + m2))
}

function fountain(ctx: Ctx) {
  const b = ctx.batch
  const prof = [[0.01, 0], [2.5, 0], [2.5, 0.9], [2.65, 0.95], [2.65, 1.05], [2.3, 1.05], [2.3, 0.96], [0.01, 0.96]]
  const L = new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)), 64)
  scaleUVs(L, 6, 1)
  b.add(L, M.stoneLight, 'keep')
  const water = new THREE.Mesh(new THREE.CircleGeometry(2.3, 48), new THREE.MeshStandardMaterial({ color: '#2f6a74', roughness: 0.04, transparent: true, opacity: 0.9, envMapIntensity: 1.8 }))
  water.rotation.x = -Math.PI / 2
  water.position.y = 0.88
  ctx.root.add(water)
  const col = new THREE.CylinderGeometry(0.22, 0.34, 1.5, 16)
  col.translate(0, 1.6, 0)
  b.add(col, M.stoneLight)
  const bowl = new THREE.LatheGeometry([[0.01, 0], [0.3, 0.05], [1.2, 0.35], [1.28, 0.5], [1.1, 0.5], [0.01, 0.2]].map(([x, y]) => new THREE.Vector2(x, y)), 40)
  bowl.translate(0, 2.2, 0)
  scaleUVs(bowl, 3, 1)
  b.add(bowl, M.stoneLight, 'keep')
  const top = new THREE.SphereGeometry(0.28, 16, 12)
  top.translate(0, 3.0, 0)
  b.add(top, M.stoneLight)
  const spike = new THREE.ConeGeometry(0.1, 0.8, 8)
  spike.translate(0, 3.5, 0)
  b.add(spike, M.gold)
  // spray particles
  const n = 220
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3))
  const seed = new Float32Array(n)
  for (let i = 0; i < n; i++) seed[i] = Math.random()
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1))
  const tu = { value: 0 }
  const pm = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uTime: tu },
    vertexShader: /* glsl */ `uniform float uTime; attribute float aSeed; varying float vA;
      void main(){ float t = fract(uTime*0.55 + aSeed); float ang = aSeed*62.83; float r = 0.15 + t*1.1*(0.4+fract(aSeed*7.1));
        vec3 p = vec3(cos(ang)*r, 3.15 + 1.3*t - 2.6*t*t*(0.6+0.8*fract(aSeed*3.3)) , sin(ang)*r);
        vA = (1.0 - t)*0.8; vec4 mv = modelViewMatrix*vec4(p,1.0); gl_PointSize = 70.0/(-mv.z); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: /* glsl */ `varying float vA; void main(){ float d = length(gl_PointCoord-0.5); float a = smoothstep(0.5,0.1,d)*vA; gl_FragColor = vec4(vec3(0.85,0.95,1.0), a*0.6); }`,
  })
  const pts = new THREE.Points(g, pm)
  pts.frustumCulled = false
  ctx.root.add(pts)
  ctx.updaters.push((t) => (tu.value = t))
  ctx.posts.push({ x: 0, z: 0, r: 2.9 })
}

/* ------------------------------------------------------------------ */
export function buildNature(ctx: Ctx) {
  buildGround(ctx)
  buildPond(ctx)
  ctx.noPlant.push((x, z, m) => Math.hypot(x, z) < PLAZA_R + 3 + m)
  ctx.noPlant.push((_x, z, m) => z > 62 - m)
  const rectBlock = (x0: number, x1: number, z0: number, z1: number) => ctx.noPlant.push((x, z, m) => x > x0 - m && x < x1 + m && z > z0 - m && z < z1 + m)
  rectBlock(-42, 52, -68, -26) // aquarium + apse + forecourt
  rectBlock(-80, -44, -26, 38) // groote museum
  rectBlock(8, 50, 52, 72) // ledenlokalen
  rectBlock(-10, 10, -36, 70) // main axis
  rectBlock(-54, -16, -4, 16) // approach to the museum portico
  rectBlock(14, 46, 2, 16) // approach to the pond
  // props
  fountain(ctx)
  flowerBed(ctx, 0, 0, 'circle', 6.2, 0, 12)
  for (const s of [-1, 1]) {
    flowerBed(ctx, s * 14, 63, 'rect', 11, 4.2, 40 + s)
    hedge(ctx, s * 8.6, 60.8, s * 19.4, 60.8, 1.1)
    hedge(ctx, s * 8.6, 65.2, s * 19.4, 65.2, 1.1)
  }
  for (const s of [-1, 1]) flowerBed(ctx, s * 26, -4, 'rect', 10, 6, 70 + s)
  // lamps
  for (let z = 66; z > 22; z -= 11) for (const s of [-1, 1]) lamp(ctx, s * 4.4, z)
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + Math.PI / 8
    lamp(ctx, Math.cos(a) * (PLAZA_R - 1.2), Math.sin(a) * (PLAZA_R - 1.2))
  }
  for (const s of [-1, 1]) {
    lamp(ctx, s * 7.5, -29.8)
    lamp(ctx, s * 22, -29.0)
    lamp(ctx, s * 33, -29.0)
  }
  for (let z = -14; z <= 28; z += 14) lamp(ctx, -44.2, z)
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU
    lamp(ctx, POND.cx + Math.cos(a) * (pondR(a) + 4.8), POND.cz + Math.sin(a) * (pondR(a) + 4.8))
  }
  for (let x = -60; x <= 60; x += 24) if (Math.abs(x) > 10) lamp(ctx, x, 74.4, 5.0)
  // benches
  for (const a of [0.4, 1.2, 2.0, 2.8, 3.6, 4.4, 5.2, 6.0]) {
    const x = Math.cos(a) * (PLAZA_R - 2.5)
    const z = Math.sin(a) * (PLAZA_R - 2.5)
    const d: 'S' | 'E' | 'N' | 'W' = Math.abs(Math.cos(a)) > Math.abs(Math.sin(a)) ? (Math.cos(a) > 0 ? 'W' : 'E') : Math.sin(a) > 0 ? 'N' : 'S'
    bench(ctx, x, z, d)
  }
  for (const z of [30, 46, 58]) for (const s of [-1, 1]) bench(ctx, s * 5.7, z, s > 0 ? 'W' : 'E')
  bench(ctx, 40, -28.2, 'N')
  bench(ctx, -40, -28.2, 'N')
  for (let i = 0; i < 4; i++) {
    const a = 2.7 + i * 0.5
    const r = pondR(a) + 1.7
    bench(ctx, POND.cx + Math.cos(a) * r, POND.cz + Math.sin(a) * r, Math.cos(a) > 0 ? 'W' : 'E')
  }
  // bicycles along the pavement
  for (let i = 0; i < 12; i++) bicycle(ctx, -40 + i * 1.1 + (i > 5 ? 8 : 0), 71.3, Math.PI / 2 + (rnd() - 0.5) * 0.15)
  for (let i = 0; i < 8; i++) bicycle(ctx, 52 + i * 1.1, 71.3, Math.PI / 2 + (rnd() - 0.5) * 0.15)

  buildTrees(ctx)
  buildGrassTufts(ctx)
  void boxUV
}

import * as THREE from 'three'
import { Water } from 'three/examples/jsm/objects/Water.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { BuildCtx, TAU, arcWall, boxGeo, cyl, flatShape, mergeMesh, mesh, pathXZ, rng, ribbon, shapeXZ, slab, v2, wall, wuv } from './util'
import { bench, lampPost, picnicTable } from './props'
import { HL } from './rivierahal'

export const POND = { x: 0, z: 76, rx: 23, rz: 12.5 }
const TEA_Z = 122
const GATE_Z = 152

export function sup(cx: number, cz: number, rx: number, rz: number, n = 72, e = 2.6) {
  const pts: [number, number][] = []
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU
    const c = Math.cos(a), s = Math.sin(a)
    pts.push([cx + rx * Math.sign(c) * Math.pow(Math.abs(c), 2 / e), cz + rz * Math.sign(s) * Math.pow(Math.abs(s), 2 / e)])
  }
  return pts
}
function polyWall(ctx: BuildCtx, pts: [number, number][]) {
  for (let i = 0; i < pts.length; i++) {
    const [ax, az] = pts[i]
    const [bx, bz] = pts[(i + 1) % pts.length]
    const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.5)
    for (let k = 0; k < n; k++) {
      const x = ax + ((bx - ax) * k) / n, z = az + ((bz - az) * k) / n
      ctx.colliders.push({ x0: x - 0.3, x1: x + 0.3, z0: z - 0.3, z1: z + 0.3 })
    }
  }
}
const rectShape = (x0: number, z0: number, x1: number, z1: number) => shapeXZ([[x0, z0], [x1, z0], [x1, z1], [x0, z1]])

/* ------------------------------------------------------------------------------ trees */
function treeVariants(ctx: BuildCtx) {
  const m = ctx.m
  const out: { trunk: THREE.BufferGeometry; crown: THREE.BufferGeometry }[] = []
  for (let v = 0; v < 3; v++) {
    const r = rng(500 + v * 17)
    const th = 6.2 + r() * 2
    const trunk: THREE.BufferGeometry[] = [new THREE.CylinderGeometry(0.3, 0.5, th, 10).translate(0, th / 2, 0)]
    const cc = new THREE.Vector3(0, th + 2.6, 0)
    const rx = 4.2 + r() * 1.6, ry = 3.6 + r() * 1.2
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU + r()
      const len = 2.8 + r() * 1.4
      const g = new THREE.CylinderGeometry(0.1, 0.2, len, 6)
      g.translate(0, len / 2, 0)
      g.rotateZ(-0.7 - r() * 0.3)
      g.rotateY(a)
      g.translate(0, th - 1.5 - r() * 1.2, 0)
      trunk.push(g)
    }
    const quads: THREE.BufferGeometry[] = []
    const n = 95
    for (let i = 0; i < n; i++) {
      let p: THREE.Vector3
      do {
        p = new THREE.Vector3((r() * 2 - 1) * rx, (r() * 2 - 1) * ry, (r() * 2 - 1) * rx)
      } while ((p.x / rx) ** 2 + (p.y / ry) ** 2 + (p.z / rx) ** 2 > 1)
      const size = 3.2 + r() * 1.8
      const g = new THREE.PlaneGeometry(size, size)
      g.rotateX((r() - 0.5) * 2.2)
      g.rotateY(r() * Math.PI)
      g.rotateZ((r() - 0.5) * 1.6)
      g.translate(p.x + cc.x, p.y + cc.y, p.z + cc.z)
      const pos = g.attributes.position
      const nr = new Float32Array(pos.count * 3)
      for (let k = 0; k < pos.count; k++) {
        const nv = new THREE.Vector3(pos.getX(k), pos.getY(k), pos.getZ(k)).sub(cc)
        nv.y *= 0.7
        nv.normalize()
        nr.set([nv.x, nv.y, nv.z], k * 3)
      }
      g.setAttribute('normal', new THREE.BufferAttribute(nr, 3))
      quads.push(g)
    }
    out.push({ trunk: mergeGeometries(trunk, false)!, crown: mergeGeometries(quads, false)! })
  }
  void m
  return out
}

function plantTrees(ctx: BuildCtx, pts: [number, number, number][]) {
  const variants = treeVariants(ctx)
  const r = rng(99)
  const per = variants.map(() => [] as [number, number, number][])
  pts.forEach((p, i) => per[i % variants.length].push(p))
  const dummy = new THREE.Object3D()
  const col = new THREE.Color()
  variants.forEach((v, vi) => {
    const list = per[vi]
    if (!list.length) return
    const tr = new THREE.InstancedMesh(v.trunk, ctx.m.bark, list.length)
    const cr = new THREE.InstancedMesh(v.crown, ctx.m.leaf, list.length)
    list.forEach(([x, z, s], i) => {
      dummy.position.set(x, 0, z)
      dummy.rotation.set(0, r() * TAU, 0)
      dummy.scale.setScalar(s)
      dummy.updateMatrix()
      tr.setMatrixAt(i, dummy.matrix)
      cr.setMatrixAt(i, dummy.matrix)
      col.setHSL(0.25 + (r() - 0.5) * 0.05, 0.55 + r() * 0.2, 0.68 + r() * 0.25)
      cr.setColorAt(i, col)
      ctx.colliders.push({ x0: x - 0.5 * s, x1: x + 0.5 * s, z0: z - 0.5 * s, z1: z + 0.5 * s })
    })
    for (const o of [tr, cr]) {
      o.castShadow = true
      o.receiveShadow = true
      o.frustumCulled = false
      ctx.root.add(o)
    }
  })
}

function bushes(ctx: BuildCtx, pts: [number, number, number, number][]) {
  const geos: THREE.BufferGeometry[] = []
  const r = rng(7)
  for (const [x, z, rad, h] of pts) {
    const g = new THREE.IcosahedronGeometry(1, 2)
    const p = g.attributes.position
    for (let i = 0; i < p.count; i++) {
      const k = 1 + (Math.sin(p.getX(i) * 5.1 + p.getZ(i) * 3.3) * 0.5 + Math.sin(p.getY(i) * 7.7) * 0.5) * 0.12
      p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k)
    }
    g.scale(rad, h, rad * (0.8 + r() * 0.4))
    g.translate(x, h * 0.55, z)
    geos.push(wuv(g, 0.8))
  }
  if (geos.length) mergeMesh(ctx.root, ctx.m.hedge, geos)
}

/* ------------------------------------------------------------------------------ pond */
function pond(ctx: BuildCtx) {
  const m = ctx.m
  const { x, z, rx, rz } = POND
  const inner = sup(x, z, rx, rz)
  const outer = sup(x, z, rx + 0.7, rz + 0.7)
  // concrete kerb with rounded top
  const ks = shapeXZ(outer)
  ks.holes.push(pathXZ(inner))
  const kg = new THREE.ExtrudeGeometry(ks, { depth: 0.42, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.08, bevelSegments: 2, curveSegments: 1 })
  kg.rotateX(-Math.PI / 2)
  const pos = kg.attributes.position
  const uv = new Float32Array(pos.count * 2)
  for (let i = 0; i < pos.count; i++) { uv[i * 2] = pos.getX(i) + pos.getZ(i) * 0.5; uv[i * 2 + 1] = pos.getY(i) + pos.getZ(i) * 0.5 }
  kg.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  mesh(ctx.root, kg, m.concrete, 0, 0.02, 0)
  // bed + water (planar reflection)
  flatShape(shapeXZ(inner), -0.5, m.pondBed, ctx.root)
  const wg = new THREE.ShapeGeometry(shapeXZ(inner), 24)
  const water = new Water(wg, {
    textureWidth: 1024, textureHeight: 1024, waterNormals: m.waterNormal, sunDirection: new THREE.Vector3(0.5, 0.7, 0.4), sunColor: 0xffffff,
    waterColor: 0x14383a, distortionScale: 0.55, fog: true, alpha: 0.96,
  })
  water.rotation.x = -Math.PI / 2
  water.position.y = 0.16
  water.material.uniforms.size.value = 7
  water.receiveShadow = false
  ctx.root.add(water)
  ctx.waters.push(water as unknown as THREE.Mesh)
  polyWall(ctx, sup(x, z, rx + 1.1, rz + 1.1))
  ctx.zones.push({ id: 'pond', name: 'The pond (vijver)', x0: x - rx - 6, x1: x + rx + 6, z0: z - rz - 6, z1: z + rz + 6 })
  // reeds & marginal planting at the far corners
  const bush: [number, number, number, number][] = []
  for (const [bx, bz] of [[-rx - 3.5, z + 4], [rx + 3.5, z + 4], [-rx - 3.5, z - 5], [rx + 3.5, z - 5]]) bush.push([bx, bz, 2.2, 1.0], [bx + 1.5, bz + 1.2, 1.5, 0.8])
  bushes(ctx, bush)
}

/* ------------------------------------------------------------------------------ paving */
function paving(ctx: BuildCtx) {
  const m = ctx.m
  const R = ctx.root
  // big lawn
  const lg = wuv(new THREE.PlaneGeometry(2600, 2600).rotateX(-Math.PI / 2))
  mesh(R, lg, m.grass, 0, 0, 0, { cast: false })
  // north plaza (cobbles), side paths, south court
  flatShape(rectShape(-52, 14, 52, 58), 0.03, m.cobble, R)
  flatShape(rectShape(-49, -14, -42, 16), 0.03, m.cobble, R)
  flatShape(rectShape(42, -14, 49, 16), 0.03, m.cobble, R)
  flatShape(rectShape(-46, -66, 46, -12), 0.03, m.cobble, R)
  // pond promenade + axis
  const ring = shapeXZ(sup(POND.x, POND.z, POND.rx + 10, POND.rz + 8.5))
  ring.holes.push(pathXZ(sup(POND.x, POND.z, POND.rx + 0.7, POND.rz + 0.7)))
  flatShape(ring, 0.02, m.herring, R)
  flatShape(rectShape(-5.6, POND.z + POND.rz + 8.2, 5.6, GATE_Z + 4), 0.024, m.herring, R)
  // tea house court + entrance court
  flatShape(rectShape(-20, TEA_Z - 8, 20, TEA_Z + 8), 0.034, m.cobble, R)
  flatShape(rectShape(-26, GATE_Z - 10, 26, GATE_Z + 24), 0.034, m.cobble, R)
  // curved gravel paths around the lawns
  const gp = (pts: [number, number][], w: number) => ribbon(pts.map(([x, z]) => v2(x, z)), w, 0.018, m.gravel, R)
  gp([[34, 56], [44, 74], [48, 100], [38, 124], [30, 148]], 3.6)
  gp([[-34, 56], [-44, 74], [-48, 100], [-38, 124], [-30, 148]], 3.6)
  gp([[52, 30], [66, 20], [70, -10], [60, -40], [40, -62]], 3.2)
  gp([[-52, 30], [-66, 20], [-70, -10], [-60, -40], [-40, -62]], 3.2)
  // rounded planting beds on the plaza (concrete kerb, shrubs, grasses)
  const bushL: [number, number, number, number][] = []
  const rnd = rng(3)
  for (const s of [-1, 1]) {
    const cx = s * 29, cz = 40
    const sh = shapeXZ(sup(cx, cz, 7, 4.2, 40, 2.2))
    const kerbOuter = shapeXZ(sup(cx, cz, 7.5, 4.7, 40, 2.2))
    kerbOuter.holes.push(pathXZ(sup(cx, cz, 7, 4.2, 40, 2.2)))
    const kg = new THREE.ExtrudeGeometry(kerbOuter, { depth: 0.38, bevelEnabled: false, curveSegments: 1 })
    kg.rotateX(-Math.PI / 2)
    const p = kg.attributes.position
    const uv = new Float32Array(p.count * 2)
    for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getX(i) + p.getZ(i) * 0.5; uv[i * 2 + 1] = p.getY(i) + p.getZ(i) * 0.5 }
    kg.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
    mesh(R, kg, m.concrete, 0, 0.03, 0)
    flatShape(sh, 0.3, m.grass, R)
    polyWall(ctx, sup(cx, cz, 7.9, 5.1, 40, 2.2))
    for (let i = 0; i < 14; i++) bushL.push([cx + (rnd() - 0.5) * 11, cz + (rnd() - 0.5) * 6, 0.9 + rnd() * 0.9, 0.7 + rnd() * 0.9])
  }
  bushes(ctx, bushL)
  ctx.zones.push({ id: 'plaza', name: 'North plaza', x0: -52, x1: 52, z0: 14, z1: 58 })
  ctx.zones.push({ id: 'court', name: 'South court', x0: -46, x1: 46, z0: -66, z1: -12 })
  ctx.zones.push({ id: 'axis', name: 'Central axis', x0: -8, x1: 8, z0: POND.z + POND.rz + 8, z1: GATE_Z })
}

/* ------------------------------------------------------------------------------ tea house */
function teaHouse(ctx: BuildCtx) {
  const m = ctx.m
  const R = ctx.root
  const z = TEA_Z
  const g = new THREE.Group()
  g.position.set(0, 0, z)
  R.add(g)
  // main block + wings
  slab(g, m.stucco, 0, 0, 13, 7.5, 0, 4.4)
  for (const s of [-1, 1]) {
    slab(g, m.stucco, s * 10.2, 1, 7.6, 5.6, 0, 3.6)
    slab(g, m.stuccoSand, s * 10.2, 1, 8.2, 6.2, 3.6, 0.3)
    glassMesh(g, new THREE.PlaneGeometry(6.4, 2.0), m.glass, s * 10.2, 1.9, -1.85)
    slab(g, m.concrete, s * 10.2, -1.9, 7.8, 0.3, 0, 0.7)
  }
  slab(g, m.stuccoSand, 0, 0, 13.8, 8.3, 4.4, 0.45)
  // gate-facing (north) side: window band and doorway
  glassMesh(g, new THREE.PlaneGeometry(9, 2.0), m.glass, 0, 2.2, 3.82)
  mesh(g, new THREE.PlaneGeometry(9, 2.0), m.windowGlow, 0, 2.2, 3.74, { cast: false })
  slab(g, m.frameDark, 0, 3.82, 9.2, 0.12, 3.2, 0.14)
  slab(g, m.concrete, 0, 3.9, 13.4, 0.3, 0, 0.6)
  // semicircular glazed bay facing the pond (south, -z) with canopy
  const T = 0.3
  const bayR = 5.2
  const arc = (r: number, h: number, a0: number, a1: number, open: boolean) => wuv(new THREE.CylinderGeometry(r, r, h, 40, 1, open, Math.PI / 2 - a1, a1 - a0))
  mesh(g, arc(bayR + 1.2, T, Math.PI, TAU, false), m.stuccoSand, 0, 3.7, -3.7)
  mesh(g, arc(bayR + 1.22, 0.7, Math.PI, TAU, true), m.stuccoSand, 0, 3.85, -3.7)
  mesh(g, arc(bayR, 1.0, Math.PI, TAU, true), m.stuccoColumn, 0, 0.5, -3.7)
  const gl = mesh(g, arc(bayR, 2.4, Math.PI, TAU, true), m.glass, 0, 2.2, -3.7, { cast: false, recv: false })
  gl.renderOrder = 2
  mesh(g, arc(bayR - 0.4, 2.5, Math.PI, TAU, true), m.windowGlow, 0, 2.2, -3.7, { cast: false })
  const posts: THREE.BufferGeometry[] = []
  for (let i = 0; i <= 10; i++) {
    const a = Math.PI + (i / 10) * Math.PI
    posts.push(wuv(new THREE.CylinderGeometry(0.09, 0.09, 3.4, 8).translate(Math.cos(a) * bayR, 1.7, -3.7 + Math.sin(a) * bayR)))
  }
  mergeMesh(g, m.brownColumn, posts)
  // roof cone
  mesh(g, new THREE.ConeGeometry(bayR + 0.8, 0.9, 20, 1, true, Math.PI / 2 - TAU, Math.PI), m.whiteMetal, 0, 4.4, -3.7)
  // inside glow
  const l = new THREE.PointLight('#ffd9a0', 0, 18, 1.8)
  l.position.set(0, 2.8, z - 2)
  R.add(l)
  ctx.lights.push({ light: l, day: 0, night: 140 })
  wall(ctx, -6.5, z - 3.8, 6.5, z + 3.8)
  wall(ctx, -14, z - 1.8, -6.5, z + 3.8)
  wall(ctx, 6.5, z - 1.8, 14, z + 3.8)
  arcWall(ctx, 0, z - 3.7, bayR + 0.5, Math.PI, TAU)
  // tables
  for (const [tx, tz, ry] of [[-9, -6.5, 0], [-4, -9.5, 0.4], [4, -9.5, -0.4], [9, -6.5, 0]] as [number, number, number][]) picnicTable(ctx, tx, z + tz - 1, ry)
  ctx.zones.push({ id: 'tea', name: 'Theeschenkerij (tea house)', x0: -22, x1: 22, z0: z - 12, z1: z + 8 })
}
function glassMesh(parent: THREE.Object3D, g: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) {
  const m = mesh(parent, g, mat, x, y, z, { cast: false, recv: false })
  m.renderOrder = 2
  return m
}

/* ------------------------------------------------------------------------------ entrance */
function entrance(ctx: BuildCtx) {
  const m = ctx.m
  const R = ctx.root
  const z = GATE_Z
  // gate pillars
  for (const s of [-1, 1]) {
    const x = s * 6.6
    slab(R, m.stucco, x, z, 1.5, 1.5, 0, 6.2)
    slab(R, m.stone, x, z, 1.9, 1.9, 6.2, 0.35)
    slab(R, m.stone, x, z, 1.3, 1.3, 6.55, 0.2)
    mesh(R, new THREE.SphereGeometry(0.42, 18, 14), m.stone, x, 7.0, z)
    slab(R, m.stone, x, z, 1.9, 1.9, 0, 0.5)
    ctx.colliders.push({ x0: x - 1, x1: x + 1, z0: z - 1, z1: z + 1 })
  }
  // iron fence bars either side of the gate
  const bars: THREE.BufferGeometry[] = []
  for (const s of [-1, 1]) for (let x = 7.8; x < 17.5; x += 0.2) {
    bars.push(boxGeo(0.035, 2.4, 0.035, s * x, 0, z))
    if (Math.round(x * 5) % 3 === 0) bars.push(new THREE.ConeGeometry(0.05, 0.12, 4).translate(s * x, 2.46, z))
  }
  bars.push(boxGeo(9.8, 0.06, 0.06, -12.6, 0.3, z), boxGeo(9.8, 0.06, 0.06, 12.6, 0.3, z), boxGeo(9.8, 0.06, 0.06, -12.6, 2.0, z), boxGeo(9.8, 0.06, 0.06, 12.6, 2.0, z))
  mergeMesh(R, m.steelDark, bars)
  wall(ctx, -17.6, z - 0.2, -7.6, z + 0.2)
  wall(ctx, 7.6, z - 0.2, 17.6, z + 0.2)
  // ticket booths (kassa's) — low curved kiosks
  for (const s of [-1, 1]) {
    const cx = s * 11.6, cz = z - 7
    slab(R, m.stucco, cx, cz, 9, 3.6, 0, 3.0)
    slab(R, m.stuccoSand, cx, cz - 0.3, 10.4, 4.6, 3.0, 0.3)
    glassMesh(R, new THREE.PlaneGeometry(7.4, 1.6), m.glass, cx, 1.8, cz - 1.85)
    slab(R, m.brownColumn, cx, cz - 1.9, 8, 0.25, 0.0, 1.05)
    ctx.colliders.push({ x0: cx - 4.6, x1: cx + 4.6, z0: cz - 2, z1: cz + 2 })
  }
  // restored brick buildings (shop + directorate)
  for (const s of [-1, 1]) {
    const cx = s * 24.5, cz = z + 7
    const h = s < 0 ? 7 : 9
    slab(R, m.brick, cx, cz, 17, 9, 0, h)
    slab(R, m.stuccoSand, cx, cz, 17.8, 9.8, h, 0.35)
    slab(R, m.stone, cx, cz, 17.4, 9.4, h + 0.35, 0.2)
    const wd: THREE.BufferGeometry[] = []
    const fr: THREE.BufferGeometry[] = []
    const floors = s < 0 ? 2 : 3
    for (let f = 0; f < floors; f++) for (let i = 0; i < 6; i++) {
      const wx = cx - 7 + i * 2.8
      const wy = f === 0 ? 0.9 : 0.9 + f * 2.7
      wd.push(boxGeo(1.5, 1.8, 0.1, wx, wy, cz - 4.52))
      fr.push(boxGeo(1.7, 0.1, 0.16, wx, wy - 0.05, cz - 4.55), boxGeo(1.7, 0.1, 0.16, wx, wy + 1.75, cz - 4.55))
    }
    mergeMesh(R, m.windowGlow, wd, { cast: false })
    mergeMesh(R, m.stone, fr)
    ctx.colliders.push({ x0: cx - 9, x1: cx + 9, z0: cz - 4.8, z1: cz + 4.8 })
  }
  // flagpoles
  for (const x of [-4.2, 4.2]) {
    cyl(R, m.steelDark, 0.04, 0.09, 9, x, 0, z - 4, 10)
    const f = new THREE.Mesh(new THREE.PlaneGeometry(2, 1.3, 8, 1), new THREE.MeshStandardMaterial({ color: x < 0 ? '#c8202a' : '#1c3d8f', side: THREE.DoubleSide, roughness: 0.8 }))
    f.position.set(x + 1.02, 8.2, z - 4)
    f.castShadow = true
    ctx.root.add(f)
    ctx.anim.push((t) => {
      const p = f.geometry.attributes.position
      for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(t * 2.4 + p.getX(i) * 2.6) * 0.12 * (p.getX(i) + 1))
      p.needsUpdate = true
    })
  }
  ctx.zones.push({ id: 'gate', name: 'Monumental entrance', x0: -30, x1: 30, z0: z - 12, z1: z + 24 })
}

/* ------------------------------------------------------------------------------ city + street */
function surroundings(ctx: BuildCtx) {
  const m = ctx.m
  const R = ctx.root
  // street beyond the gate
  const road = shapeXZ([[-500, 178], [500, 178], [500, 196], [-500, 196]])
  const asphalt = new THREE.MeshStandardMaterial({ color: '#4a4c50', roughness: 0.92 })
  flatShape(road, 0.01, asphalt, R)
  flatShape(shapeXZ([[-500, 172], [500, 172], [500, 178], [-500, 178]]), 0.05, m.herring, R)
  flatShape(shapeXZ([[-500, 196], [500, 196], [500, 202], [-500, 202]]), 0.05, m.herring, R)
  const dash = new THREE.MeshStandardMaterial({ color: '#e8e6dc', roughness: 0.9 })
  for (let x = -120; x < 120; x += 8) flatShape(shapeXZ([[x, 186.95], [x + 4, 186.95], [x + 4, 187.05], [x, 187.05]]), 0.02, dash, R)
  // tall brick blocks (Blijdorp neighbourhood) — backdrop
  const r = rng(12)
  const geos: THREE.BufferGeometry[] = []
  const block = (x: number, z: number, w: number, d: number, h: number) => {
    geos.push(wuv(new THREE.BoxGeometry(w, h, d).translate(x, h / 2, z), 1))
  }
  for (let x = -330; x < 330; x += 26 + r() * 14) block(x, 262 + r() * 14, 24 + r() * 10, 16, 15 + r() * 16)
  for (const s of [-1, 1]) for (let z = -170; z < 270; z += 30 + r() * 16) block(s * (200 + r() * 24), z, 16, 26 + r() * 10, 13 + r() * 14)
  for (let x = -260; x < 260; x += 32 + r() * 14) block(x, -180 - r() * 12, 26, 16, 12 + r() * 12)
  const city = mergeMesh(R, m.city, geos)
  if (city) city.frustumCulled = false
  ctx.colliders.push({ x0: -300, x1: 300, z0: 218, z1: 240 })
}

/* ------------------------------------------------------------------------------ main */
export function buildGrounds(ctx: BuildCtx, treeCount = 150) {
  const m = ctx.m
  paving(ctx)
  pond(ctx)
  teaHouse(ctx)
  entrance(ctx)
  surroundings(ctx)

  // perimeter hedge + invisible bounds
  const hedgeGeos: THREE.BufferGeometry[] = []
  const hedge = (x0: number, z0: number, x1: number, z1: number) => {
    const w = Math.max(1.4, x1 - x0), d = Math.max(1.4, z1 - z0)
    hedgeGeos.push(wuv(new THREE.BoxGeometry(w, 2.3, d, 1, 1, 1).translate((x0 + x1) / 2, 1.15, (z0 + z1) / 2), 1))
    wall(ctx, x0 - 0.2, z0 - 0.2, x1 + 0.2, z1 + 0.2)
  }
  hedge(-86, -80, -85, 172)
  hedge(85, -80, 86, 172)
  hedge(-86, -81, 86, -80)
  hedge(-86, 172, -18, 173)
  hedge(18, 172, 86, 173)
  mergeMesh(ctx.root, m.hedge, hedgeGeos)
  wall(ctx, -300, -90, -86, 260)
  wall(ctx, 86, -90, 300, 260)
  wall(ctx, -300, -90, 300, -81)
  wall(ctx, -300, 205, 300, 218)

  // lamps (ornamental dark posts like the originals)
  const lamps: [number, number][] = [[-16, 26], [16, 26], [-40, 20], [40, 20], [-20, 54], [20, 54], [-30, 74], [30, 74], [-9, 98], [9, 98], [-9, 126], [9, 138], [-16, -26], [16, -26], [-38, -40], [38, -40], [-17, GATE_Z - 4], [17, GATE_Z - 4]]
  lamps.forEach(([x, z]) => lampPost(ctx, x, z))
  // benches around the pond + plaza
  for (const a of [0.4, 0.9, 2.2, 2.75, 3.5, 4.0, 5.3, 5.85]) {
    const bx = POND.x + (POND.rx + 3.4) * Math.cos(a), bz = POND.z + (POND.rz + 3.2) * Math.sin(a)
    bench(ctx, bx, bz, -a + Math.PI / 2 + Math.PI)
  }
  for (const [x, z] of [[-44, 30], [44, 30], [-20, 46], [20, 46]] as [number, number][]) bench(ctx, x, z, Math.PI)

  // trees
  const r = rng(2024)
  const ok = (x: number, z: number) => {
    if (x > -54 && x < 54 && z > 10 && z < 60) return false // plaza
    if (Math.abs(x) < 48 && z > -68 && z < 14) return false // building + south court
    if (Math.abs(x) < 7.5 && z > 60 && z < GATE_Z + 6) return false
    const dx = (x - POND.x) / (POND.rx + 12), dz = (z - POND.z) / (POND.rz + 10)
    if (dx * dx + dz * dz < 1) return false
    if (Math.abs(x) < 22 && z > TEA_Z - 12 && z < TEA_Z + 10) return false
    if (Math.abs(x) < 36 && z > GATE_Z - 12 && z < GATE_Z + 28) return false
    if (Math.abs(x) > 82 || z < -76 || z > 168) return false
    return true
  }
  const pts: [number, number, number][] = []
  // formal rows of plane trees along the axis and the plaza
  for (let z = 100; z < 146; z += 12) pts.push([-10.5, z, 1.1], [10.5, z, 1.1])
  for (let x = -50; x <= 50; x += 12.5) if (Math.abs(x) > 14) pts.push([x, 56.5, 1.05])
  for (let z = -60; z < -20; z += 13) pts.push([-50, z, 1.0], [50, z, 1.0])
  let tries = 0
  while (pts.length < treeCount && tries++ < 8000) {
    const x = (r() * 2 - 1) * 82, z = -76 + r() * 244
    if (!ok(x, z)) continue
    if (pts.some(([px, pz]) => (px - x) ** 2 + (pz - z) ** 2 < 36)) continue
    pts.push([x, z, 0.8 + r() * 0.6])
  }
  plantTrees(ctx, pts)
  // shrubs on the lawns
  const sb: [number, number, number, number][] = []
  for (let i = 0; i < 70; i++) {
    const x = (r() * 2 - 1) * 82, z = -76 + r() * 244
    if (ok(x, z) && !pts.some(([px, pz]) => (px - x) ** 2 + (pz - z) ** 2 < 9)) sb.push([x, z, 1 + r() * 1.4, 0.8 + r() * 1.1])
  }
  bushes(ctx, sb)

  // floodlights for the façade at night (the real building is lit in warm colours)
  const spots: [number, number, string][] = [[-12, 36, '#ff8a4a'], [-4, 38, '#ffb06a'], [4, 38, '#ff7a3a'], [12, 36, '#ff9a5a']]
  const tgt = new THREE.Object3D()
  tgt.position.set(0, 9, HL)
  ctx.root.add(tgt)
  for (const [x, z, c] of spots) {
    const s = new THREE.SpotLight(c, 0, 70, 0.55, 0.7, 1.3)
    s.position.set(x, 0.3, z)
    s.target = tgt
    ctx.root.add(s)
    ctx.lights.push({ light: s, day: 0, night: 700 })
  }
  const st = new THREE.Object3D()
  st.position.set(0, 9, -HL)
  ctx.root.add(st)
  for (const x of [-10, 10]) {
    const s = new THREE.SpotLight('#9fb4ff', 0, 60, 0.6, 0.7, 1.3)
    s.position.set(x, 0.3, -HL - 24)
    s.target = st
    ctx.root.add(s)
    ctx.lights.push({ light: s, day: 0, night: 600 })
  }
  ctx.glow.push({ mat: m.bulb, k: 3 }, { mat: m.windowGlow, k: 1.3 })
}

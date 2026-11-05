import * as THREE from 'three'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { DATA, Grid, bbox, ptsOf } from './data'
import { Mesher, ccw, obb, pointInPoly, distToSeg, type Pt } from './geo'
import type { Mats } from './materials'
import { hash, rng } from './noise'

export interface Ground {
  group: THREE.Group
  waterGrid: Grid<{ P: Pt[] }>
  waterLines: Grid<{ a: Pt; b: Pt; hw: number }>
  bridges: { a: Pt; b: Pt; hw: number }[]
  update: (t: number, night: number) => void
  windU: { value: number }
  treeCount: number
  clearTrees: (x: number, z: number, r: number) => void
}

const ASPHALT = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'living_street', 'service'])
const PAVED = new Set(['footway', 'path', 'pedestrian', 'steps', 'bridleway'])

export function buildGround(mats: Mats, built: Grid<{ P: Pt[]; id: number }>): Ground {
  const group = new THREE.Group()
  const windU = { value: 0 }

  // ------------------------------------------------------------- base plane
  {
    const m = new Mesher()
    m.poly([[-3200, -3200], [3200, -3200], [3200, 3200], [-3200, 3200]], -0.04)
    const base = mats.grass.clone()
    base.depthWrite = true; base.polygonOffset = false
    base.color = new THREE.Color(0.8, 0.85, 0.7)
    const mesh = new THREE.Mesh(m.build(), base)
    mesh.receiveShadow = true
    mesh.renderOrder = -100
    group.add(mesh)
  }

  const layers: Record<string, Mesher> = {}
  const L = (k: string) => (layers[k] ??= new Mesher())
  const layerMat: Record<string, THREE.Material> = {
    grass: mats.grass, wood: mats.wood, paved: mats.paving, parking: mats.asphalt, pitch: mats.pitch, court: mats.redAsphalt,
    water: mats.water, asphalt: mats.asphalt, red: mats.redAsphalt, paving: mats.paving, clinker: mats.clinker, gravel: mats.gravel, sand: mats.sand,
  }
  const layerOrder: Record<string, number> = { grass: -90, wood: -89, paved: -88, gravel: -87, sand: -87, pitch: -86, water: -85, clinker: -82, parking: -81, asphalt: -80, red: -79, paving: -78, court: -77 }

  // ------------------------------------------------------------- land use
  const waterGrid = new Grid<{ P: Pt[] }>(30)
  const waterLines = new Grid<{ a: Pt; b: Pt; hw: number }>(30)
  const bridges: { a: Pt; b: Pt; hw: number }[] = []
  const parking: Pt[][] = []
  const woods: { P: Pt[]; a: number }[] = []
  const parks: { P: Pt[]; a: number }[] = []
  for (const ar of DATA.areas) {
    const P = ccw(ptsOf(ar.p))
    switch (ar.k) {
      case 'grass': L('grass').poly(P, 0); if (ar.a > 1500) parks.push({ P, a: ar.a }); break
      case 'meadow': case 'garden': L('grass').poly(P, 0); break
      case 'wood': L('wood').poly(P, 0); woods.push({ P, a: ar.a }); break
      case 'paved': L('paved').poly(P, 0); break
      case 'parking': L('parking').poly(P, 0); parking.push(P); break
      case 'pitch': L('pitch').poly(P, 0); break
      case 'court': L('court').poly(P, 0); break
      case 'water': {
        L('water').poly(P, 0)
        const bb = bbox(P)
        waterGrid.addBox(bb.x0, bb.z0, bb.x1, bb.z1, { P })
        break
      }
    }
  }
  for (const w of DATA.water) {
    const P = ptsOf(w.p)
    L('water').ribbon(P, w.w, 0)
    for (let i = 0; i < P.length - 1; i++) {
      const a = P[i], b = P[i + 1]
      waterLines.addBox(Math.min(a[0], b[0]) - w.w, Math.min(a[1], b[1]) - w.w, Math.max(a[0], b[0]) + w.w, Math.max(a[1], b[1]) + w.w, { a, b, hw: w.w / 2 })
    }
  }

  // ------------------------------------------------------------- roads
  const roadGrid = new Grid<{ a: Pt; b: Pt; hw: number }>(24)
  const lampSpots: { x: number; z: number; ang: number }[] = []
  const treeSpots: { x: number; z: number; s: number }[] = []
  const markings = new Mesher()
  for (const r of DATA.roads) {
    const P = ptsOf(r.p)
    let key = 'asphalt'
    if (r.k === 'cycleway') key = 'red'
    else if (PAVED.has(r.k)) key = 'paving'
    else if (r.k === 'track') key = 'gravel'
    if (PAVED.has(r.k) || r.k === 'cycleway') {
      if (/asphalt|concrete/.test(r.fw) && r.k !== 'cycleway') key = 'asphalt'
      else if (/gravel|compacted|ground|dirt|unpaved|grass/.test(r.fw)) key = 'gravel'
      else if (/paving|sett|cobble|clinker|brick/.test(r.fw)) key = 'clinker'
    }
    if (!ASPHALT.has(r.k) && !PAVED.has(r.k) && r.k !== 'cycleway' && r.k !== 'track') continue
    L(key).ribbon(P, r.w, 0)
    const hw = r.w / 2
    let len = 0
    for (let i = 0; i < P.length - 1; i++) {
      const a = P[i], b = P[i + 1]
      const sl = Math.hypot(b[0] - a[0], b[1] - a[1])
      roadGrid.addBox(Math.min(a[0], b[0]) - hw, Math.min(a[1], b[1]) - hw, Math.max(a[0], b[0]) + hw, Math.max(a[1], b[1]) + hw, { a, b, hw })
      if (r.br) bridges.push({ a, b, hw: hw + 0.3 })
      len += sl
    }
    // markings + furniture along drivable roads
    const drivable = ASPHALT.has(r.k) && r.k !== 'service'
    const dash = r.k === 'primary' || r.k === 'secondary' || r.k === 'tertiary' || ((r.k === 'residential' || r.k === 'unclassified') && r.w >= 6.2)
    let acc = 0, nextDash = 0, nextLamp = 14, nextTree = 9, side = 1
    for (let i = 0; i < P.length - 1; i++) {
      const a = P[i], b = P[i + 1]
      const sl = Math.hypot(b[0] - a[0], b[1] - a[1])
      if (sl < 0.01) continue
      const dx = (b[0] - a[0]) / sl, dz = (b[1] - a[1]) / sl
      const ang = Math.atan2(dz, dx)
      while (nextDash < acc + sl && dash && !r.br) {
        const t0 = nextDash - acc
        const t1 = Math.min(sl, t0 + 2.6)
        if (t0 >= 0 && t1 - t0 > 0.5) markings.ribbon([[a[0] + dx * t0, a[1] + dz * t0], [a[0] + dx * t1, a[1] + dz * t1]], 0.13, 0.02)
        nextDash += 8
      }
      while (nextLamp < acc + sl) {
        if (drivable && len > 40 && !r.br) {
          const t = nextLamp - acc
          const off = hw + 1.0
          lampSpots.push({ x: a[0] + dx * t - dz * off * side, z: a[1] + dz * t + dx * off * side, ang })
          side = -side
        }
        nextLamp += 34
      }
      while (nextTree < acc + sl) {
        if ((drivable || r.k === 'cycleway') && len > 30 && !r.br && r.k !== 'primary') {
          const t = nextTree - acc
          if (hash(Math.round(a[0] * 7), Math.round(a[1] * 7), 91) < 0.55) {
            const off = hw + 3.0
            const sd = hash(Math.round(a[0] * 3), Math.round(a[1] * 3), 92) < 0.5 ? 1 : -1
            treeSpots.push({ x: a[0] + dx * t - dz * off * sd, z: a[1] + dz * t + dx * off * sd, s: 0.8 + hash(Math.round(a[0]), Math.round(a[1]), 93) * 0.55 })
          }
        }
        nextTree += 16 + hash(Math.round(nextTree * 11), 3, 4) * 6
      }
      acc += sl
    }
  }

  for (const k of Object.keys(layers)) {
    const m = layers[k]
    if (m.count === 0) continue
    const mesh = new THREE.Mesh(m.build(), layerMat[k])
    mesh.receiveShadow = true
    mesh.renderOrder = layerOrder[k] ?? -80
    mesh.frustumCulled = false
    group.add(mesh)
  }
  if (markings.count) {
    const mk = new THREE.Mesh(markings.build(), mats.marking)
    mk.receiveShadow = true; mk.renderOrder = -76; mk.frustumCulled = false
    group.add(mk)
  }

  const nearWater = (x: number, z: number) => {
    for (const w of waterGrid.get(x, z)) if (pointInPoly(x, z, w.P)) return true
    for (const l of waterLines.get(x, z)) if (distToSeg(x, z, l.a, l.b) < l.hw + 1) return true
    return false
  }
  const onBuilt = (x: number, z: number, m = 1.5) => {
    for (const b of built.get(x, z)) {
      if (pointInPoly(x, z, b.P)) return true
      for (let i = 0; i < b.P.length; i++) if (distToSeg(x, z, b.P[i], b.P[(i + 1) % b.P.length]) < m) return true
    }
    return false
  }
  const onRoad = (x: number, z: number, m = 0.6) => {
    for (const r of roadGrid.get(x, z)) if (distToSeg(x, z, r.a, r.b) < r.hw + m) return true
    return false
  }

  // ------------------------------------------------------------- trees
  const R = rng(1234)
  for (let i = 0; i < DATA.trees.length; i += 2) treeSpots.unshift({ x: DATA.trees[i] / 10, z: DATA.trees[i + 1] / 10, s: 0.8 + R() * 0.6 })
  const scatter = (P: Pt[], count: number) => {
    const bb = bbox(P)
    let tries = 0, placed = 0
    while (placed < count && tries < count * 8) {
      tries++
      const x = bb.x0 + R() * (bb.x1 - bb.x0), z = bb.z0 + R() * (bb.z1 - bb.z0)
      if (!pointInPoly(x, z, P)) continue
      treeSpots.push({ x, z, s: 0.7 + R() * 0.7 })
      placed++
    }
  }
  for (const w of woods) scatter(w.P, Math.min(260, Math.round(w.a / 85)))
  for (const p of parks) scatter(p.P, Math.min(45, Math.round(p.a / 650)))
  const trees: { x: number; z: number; s: number }[] = []
  for (const t of treeSpots) {
    if (trees.length >= 5200) break
    if (onBuilt(t.x, t.z, 2.5) || nearWater(t.x, t.z) || onRoad(t.x, t.z, 1.2)) continue
    trees.push(t)
  }

  const crown = (() => {
    const parts: THREE.BufferGeometry[] = []
    const blobs: [number, number, number, number][] = [[0, 0, 0, 1], [0.6, -0.15, 0.3, 0.72], [-0.55, -0.05, -0.35, 0.78], [0.1, 0.5, -0.25, 0.66]]
    blobs.forEach(([ox, oy, oz, r], bi) => {
      let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(r, 1)
      g.deleteAttribute('normal'); g.deleteAttribute('uv')
      g = mergeVertices(g, 1e-4)
      const p = g.attributes.position as THREE.BufferAttribute
      const col = new Float32Array(p.count * 3)
      const uv = new Float32Array(p.count * 2)
      for (let i = 0; i < p.count; i++) {
        let x = p.getX(i), y = p.getY(i), z = p.getZ(i)
        const ll = Math.hypot(x, y, z) || 1
        const uAng = Math.atan2(z, x) / (Math.PI * 2) + 0.5
        const vAng = Math.acos(Math.max(-1, Math.min(1, y / ll))) / Math.PI
        const j = 1 + (hash(Math.round(x * 40) + bi * 7, Math.round(y * 40), Math.round(z * 40)) - 0.5) * 0.22
        x = ox + x * j; y = (oy + y * j) * 0.9; z = oz + z * j
        p.setXYZ(i, x, y, z)
        const ao = 0.5 + 0.5 * Math.min(1, Math.max(0, (y + 0.9) / 1.5))
        const v = ao * (0.85 + hash(i, bi, 3) * 0.3)
        col[i * 3] = v; col[i * 3 + 1] = v; col[i * 3 + 2] = v
        uv[i * 2] = Math.round(uAng * 6 * 1000) / 1000 + bi * 0.37; uv[i * 2 + 1] = vAng * 3.5
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3))
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
      g.computeVertexNormals()
      parts.push(g)
    })
    // merge manually (same attribute layout)
    const merged = new THREE.BufferGeometry()
    const attrs = ['position', 'normal', 'uv', 'color'] as const
    for (const a of attrs) {
      const size = (parts[0].attributes[a] as THREE.BufferAttribute).itemSize
      const total = parts.reduce((s, g) => s + g.attributes[a].count, 0)
      const arr = new Float32Array(total * size)
      let off = 0
      for (const g of parts) { arr.set((g.attributes[a] as THREE.BufferAttribute).array as Float32Array, off); off += g.attributes[a].count * size }
      merged.setAttribute(a, new THREE.BufferAttribute(arr, size))
    }
    const idx: number[] = []
    let vo = 0
    for (const g of parts) { for (const i of g.index!.array) idx.push(i + vo); vo += g.attributes.position.count }
    merged.setIndex(idx)
    return merged
  })()

  const crownMat = mats.leaf
  crownMat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = windU
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
      float sw = sin(uTime * 1.3 + instanceMatrix[3].x * 0.23 + instanceMatrix[3].z * 0.19);
      float sw2 = cos(uTime * 0.9 + instanceMatrix[3].z * 0.21 + instanceMatrix[3].x * 0.07);
      transformed.x += sw * 0.07 * (position.y + 1.0);
      transformed.z += sw2 * 0.06 * (position.y + 1.0);
      transformed.y += sin(uTime * 2.1 + position.x * 3.0 + position.z * 2.0 + instanceMatrix[3].x) * 0.015;
      #endif`)
  }
  const trunkGeo = new THREE.CylinderGeometry(0.14, 0.26, 1, 8, 1)
  trunkGeo.translate(0, 0.5, 0)
  const crownI = new THREE.InstancedMesh(crown, crownMat, trees.length)
  const trunkI = new THREE.InstancedMesh(trunkGeo, mats.bark, trees.length)
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3(), col = new THREE.Color()
  trees.forEach((t, i) => {
    const h = hash(i, 5, 5)
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), h * Math.PI * 2)
    const trunkH = 2.6 * t.s + 1.2
    const cr = 3.6 * t.s
    ps.set(t.x, 0, t.z); sc.set(t.s * 1.2, trunkH + cr * 0.6, t.s * 1.2)
    m4.compose(ps, q, sc); trunkI.setMatrixAt(i, m4)
    ps.set(t.x, trunkH + cr * 0.55, t.z); sc.set(cr * (0.9 + h * 0.3), cr * (0.85 + hash(i, 6, 6) * 0.3), cr * (0.9 + hash(i, 7, 7) * 0.3))
    m4.compose(ps, q, sc); crownI.setMatrixAt(i, m4)
    const k = hash(i, 8, 8)
    col.setHSL(0.22 + k * 0.07, 0.25 + hash(i, 9, 9) * 0.3, 0.55 + hash(i, 10, 10) * 0.3)
    crownI.setColorAt(i, col)
  })
  crownI.castShadow = true; trunkI.castShadow = true
  crownI.receiveShadow = true
  crownI.frustumCulled = false; trunkI.frustumCulled = false
  group.add(crownI, trunkI)

  // ------------------------------------------------------------- street lamps
  {
    const n = Math.min(lampSpots.length, 900)
    const pole = new THREE.CylinderGeometry(0.05, 0.08, 1, 6); pole.translate(0, 0.5, 0)
    const head = new THREE.BoxGeometry(0.9, 0.12, 0.3)
    const poles = new THREE.InstancedMesh(pole, mats.steel, n)
    const heads = new THREE.InstancedMesh(head, mats.lamp, n)
    const arm = new THREE.Matrix4()
    for (let i = 0; i < n; i++) {
      const s = lampSpots[i]
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -s.ang)
      arm.compose(ps.set(s.x, 0, s.z), q, sc.set(1, 6.2, 1)); poles.setMatrixAt(i, arm)
      arm.compose(ps.set(s.x, 6.2, s.z), q, sc.set(1, 1, 1)); heads.setMatrixAt(i, arm)
    }
    poles.castShadow = true
    group.add(poles, heads)
  }

  // ------------------------------------------------------------- parked cars
  {
    const body = new Mesher()
    body.box(0, 0, 1.78, 4.2, 0, 0.3, 0.92, [1, 1, 1])
    body.box(0, -0.15, 1.58, 2.0, 0, 0.92, 1.42, [0.12, 0.14, 0.17])
    for (const [x, z] of [[-0.85, 1.35], [0.85, 1.35], [-0.85, -1.35], [0.85, -1.35]]) body.box(x, z, 0.22, 0.62, 0, 0, 0.62, [0.03, 0.03, 0.03])
    const carGeo = body.build()
    const carMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.32, metalness: 0.55, vertexColors: true })
    const spots: { x: number; z: number; a: number }[] = []
    for (const P of parking) {
      const o = obb(P)
      if (o.hx * o.hz * 4 < 120) continue
      const c = Math.cos(o.ang), s = Math.sin(o.ang)
      const alongU = o.hz > 4
      for (let wu = -o.hx + 1.4; wu < o.hx - 1.2; wu += 2.55) {
        for (let wv = -o.hz + 2.8; wv < o.hz - 2.4; wv += 4.9) {
          const ok = hash(Math.round(wu * 10 + o.cx), Math.round(wv * 10 + o.cz), 5) < 0.62
          if (!ok) continue
          const x = o.cx + wu * c - wv * s, z = o.cz + wu * s + wv * c
          if (!pointInPoly(x, z, P)) continue
          const ang = o.ang + (alongU ? Math.PI / 2 : 0)
          spots.push({ x, z, a: -ang })
        }
      }
    }
    const nCars = Math.min(spots.length, 1800)
    const cars = new THREE.InstancedMesh(carGeo, carMat, nCars)
    const pal = [0xe8e8e8, 0x15171a, 0x9aa0a6, 0x474b50, 0x244a7a, 0x8b1e1e, 0xd9d9d3, 0x2f5d3a, 0xb8b8b0, 0x1d2b44]
    for (let i = 0; i < nCars; i++) {
      const sp = spots[i]
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), sp.a)
      m4.compose(ps.set(sp.x, 0, sp.z), q, sc.set(1, 1, 1))
      cars.setMatrixAt(i, m4)
      cars.setColorAt(i, col.setHex(pal[Math.floor(hash(i, 11, 12) * pal.length)]))
    }
    cars.castShadow = true; cars.receiveShadow = true
    group.add(cars)
  }

  const update = (t: number, night: number) => {
    windU.value = t
    mats.waterNormal.offset.set(t * 0.012, t * 0.007)
    void night
  }
  const zero = new THREE.Matrix4().makeScale(0, 0, 0)
  const clearTrees = (x: number, z: number, r: number) => {
    let dirty = false
    trees.forEach((t, i) => { if (Math.hypot(t.x - x, t.z - z) < r) { crownI.setMatrixAt(i, zero); trunkI.setMatrixAt(i, zero); dirty = true } })
    if (dirty) { crownI.instanceMatrix.needsUpdate = true; trunkI.instanceMatrix.needsUpdate = true }
  }
  return { group, waterGrid, waterLines, bridges, update, windU, treeCount: trees.length, clearTrees }
}

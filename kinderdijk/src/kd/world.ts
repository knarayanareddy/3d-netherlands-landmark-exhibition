import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { TAU, rng, fbm, smooth } from './gfx'
import { M } from './materials'
import {
  ROAD_D, WATER_Y, addPad, bridges, buildRibbon, buildTerrain, buildWaterGeo, canalZ, frameAt, groundY, heightAt, pads, pointAt, signedDist,
} from './canal'
import { MILL, buildMillParts } from './mill'
import { farmhouse, footbridge, hipBarn, pumpingStation, rowBoat, Built } from './buildings'
import { GrassField, TreeGeo, buildReeds, genTree, treeMesh } from './vegetation'

export interface Collider {
  x: number
  z: number
  r: number
}
export interface Hotspot {
  id: string
  kicker: string
  title: string
  text: string
  facts: [string, string][]
  x: number
  y: number
  z: number
  view?: { x: number; z: number; yaw: number }
  zone?: 'in' | 'out'
  action?: 'enter' | 'exit' | 'ladder'
  reach?: number
}
export interface World {
  group: THREE.Group
  colliders: Collider[]
  hotspots: Hotspot[]
  grass: GrassField
  millPoints: { x: number; z: number; far: boolean }[]
  bridgePoints: { x: number; z: number }[]
  spawn: { x: number; z: number; yaw: number }
  mill: { exit: { x: number; z: number; yaw: number } }
  reflectHide: THREE.Object3D[]
  waterGeo: THREE.BufferGeometry
  update: (t: number, dt: number, wind: number, sails: boolean, px: number, pz: number) => void
}

type Obb = { cx: number; cz: number; c: number; s: number; hx: number; hz: number }

const yieldFrame = () => new Promise<void>((r) => setTimeout(r, 0))

export async function buildWorld(progress: (p: number, label: string) => void): Promise<World> {
  const root = new THREE.Group()
  const rand = rng(7)
  const colliders: Collider[] = []
  const obbs: Obb[] = []
  const circles: Collider[] = []
  const hotspots: Hotspot[] = []

  /* ---------------------------------------------------------- 1. layout */
  progress(0.02, 'Surveying the polder')
  const SPACING = 56
  const MX = 336
  interface MillSite {
    x: number
    z: number
    yaw: number
    side: number
    variant: number
    scale: number
    speed: number
    phase: number
    far: boolean
    xp: number
  }
  const mills: MillSite[] = []
  for (const side of [-1, 1]) {
    for (let i = 0; ; i++) {
      const xp = -MX + i * SPACING + (side > 0 ? SPACING / 2 : 0) + (rand() - 0.5) * 3
      if (xp > MX + 60) break
      const [x, z] = pointAt(xp, side * 19.2)
      const f = frameAt(xp)
      const yaw = Math.atan2(-side * f.nx, -side * f.nz) + (rand() - 0.5) * 0.7
      mills.push({ x, z, yaw, side, variant: Math.floor(rand() * 3), scale: 0.94 + rand() * 0.12, speed: 0.8 + rand() * 0.4, phase: rand() * TAU, far: Math.abs(xp) > 262, xp })
    }
  }
  mills.sort((a, b) => a.xp - b.xp)
  for (const m of mills) addPad(m.x, m.z, 6.2, 12.5)

  // farmhouses in gaps between mills
  interface HouseSite {
    x: number
    z: number
    yaw: number
    kind: 'farm' | 'barn'
    w: number
    d: number
    roof: 'tiles' | 'dark' | 'thatch'
  }
  const houses: HouseSite[] = []
  const hsDefs: [number, number, number, number, number, 'tiles' | 'dark' | 'thatch'][] = [
    [-196, -1, 23, 11, 6.6, 'tiles'],
    [-112, 1, 23, 9.5, 6.2, 'dark'],
    [-14, -1, 24, 12, 6.8, 'tiles'],
    [86, 1, 23.5, 10, 6.4, 'thatch'],
    [162, -1, 24, 11.5, 6.6, 'tiles'],
    [-250, 1, 24, 10, 6.2, 'dark'],
    [236, 1, 24, 10, 6.4, 'tiles'],
  ]
  for (const [xp, side, ad, w, d, roof] of hsDefs) {
    const [x, z] = pointAt(xp, side * ad)
    const f = frameAt(xp)
    houses.push({ x, z, yaw: Math.atan2(-side * f.nx, -side * f.nz) + (rand() - 0.5) * 0.12, kind: 'farm', w, d, roof })
  }
  {
    const [x, z] = pointAt(30, -58)
    const f = frameAt(30)
    houses.push({ x, z, yaw: Math.atan2(f.nx, f.nz) + Math.PI + 0.1, kind: 'barn', w: 13, d: 13, roof: 'thatch' })
    const [x2, z2] = pointAt(-120, 60)
    houses.push({ x: x2, z: z2, yaw: Math.atan2(-f.nx, -f.nz) + 0.05, kind: 'barn', w: 12, d: 12, roof: 'thatch' })
  }
  for (const h of houses) addPad(h.x, h.z, Math.max(h.w, h.d) * 0.62, Math.max(h.w, h.d) * 0.62 + 7)

  // pumping station
  const pump = (() => {
    const xp = 192
    const [x, z] = pointAt(xp, -44)
    const f = frameAt(xp)
    return { x, z, yaw: Math.atan2(f.nx, f.nz) + Math.PI, xp }
  })()
  addPad(pump.x, pump.z, 12, 22)

  for (const x of [-154, -14, 126]) bridges.push({ x, halfLen: 10.2, halfW: 1.3, rise: 1.0 })

  /* --------------------------------------------------------- 2. terrain */
  progress(0.08, 'Raising the dikes')
  await yieldFrame()
  const terrain = buildTerrain()
  root.add(terrain)

  const waterGeo = buildWaterGeo(9)

  // roads (Molenkade) on both banks
  progress(0.2, 'Laying the Molenkade')
  await yieldFrame()
  for (const s of [-1, 1]) root.add(buildRibbon(s * ROAD_D, 3.3, -MX - 80, MX + 80, M.pave, 0.045, 3.2, 1.5))
  // gravel aprons around the mills
  const apronMat = new THREE.MeshStandardMaterial({ map: M.pave.map, normalMap: M.pave.normalMap, color: '#b8ada0', roughness: 0.95 })
  for (const m of mills) {
    if (m.far) continue
    const g = new THREE.CircleGeometry(5.8, 28)
    g.rotateX(-Math.PI / 2)
    const uv = g.attributes.uv
    const pos = g.attributes.position
    for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / 3 + m.x * 0.01, pos.getZ(i) / 3)
    const mesh = new THREE.Mesh(g, apronMat)
    mesh.position.set(m.x, heightAt(m.x, m.z) + 0.04, m.z)
    mesh.receiveShadow = true
    root.add(mesh)
  }

  /* ------------------------------------------------------------- mills */
  progress(0.28, 'Thatching the mills')
  await yieldFrame()
  const parts = [buildMillParts(0), buildMillParts(1), buildMillParts(2)]
  const wheels: { wheel: THREE.Group; speed: number; k: number }[] = []
  const reflectHide: THREE.Object3D[] = []
  for (const m of mills) {
    // exclusion strip under the sails + body circles
    const fx = Math.sin(m.yaw)
    const fz = Math.cos(m.yaw)
    const cx = m.x + fx * 3.6 * m.scale
    const cz = m.z + fz * 3.6 * m.scale
    obbs.push({ cx, cz, c: Math.cos(m.yaw), s: Math.sin(m.yaw), hx: 13.4, hz: 3.4 })
    const p = parts[m.variant]
    for (const c of p.colliders) {
      const wx = m.x + (c[0] * Math.cos(m.yaw) + c[1] * Math.sin(m.yaw)) * m.scale
      const wz = m.z + (-c[0] * Math.sin(m.yaw) + c[1] * Math.cos(m.yaw)) * m.scale
      circles.push({ x: wx, z: wz, r: c[2] * m.scale })
      if (!m.far) colliders.push({ x: wx, z: wz, r: c[2] * m.scale })
    }
    if (m.far) continue
    const g = new THREE.Group()
    const h = heightAt(m.x, m.z)
    g.position.set(m.x, h - 0.02, m.z)
    g.rotation.y = m.yaw
    g.scale.setScalar(m.scale)
    g.add(p.body.clone())
    const hub = p.hub.clone()
    g.add(hub)
    const wheel = hub.children[0] as THREE.Group
    wheel.rotation.z = m.phase
    wheels.push({ wheel, speed: m.speed, k: m.phase })
    root.add(g)
  }

  // far mills as two instanced meshes (body + sails)
  const farMills = mills.filter((m) => m.far)
  const farColor = (mat: THREE.Material) => {
    const table: [THREE.Material, string][] = [
      [M.thatch, '#85735a'], [M.thatchB, '#6f6450'], [M.thatchC, '#7b6a52'], [M.brick, '#8a5848'], [M.brickB, '#8f6552'], [M.tar, '#2a2825'], [M.woodDark, '#3d352e'], [M.wood, '#6a5e50'],
      [M.paint, '#d9d4c6'], [M.glass, '#1b262d'], [M.stone, '#8f8b82'], [M.tiles, '#9a5a3f'], [M.stock, '#4a3f35'], [M.iron, '#222222'], [M.paintGreen, '#2c4a37'], [M.tilesDark, '#4a4038'], [M.pave, '#6b645d'],
    ]
    const hit = table.find(([k]) => k === mat)
    return new THREE.Color(hit ? hit[1] : '#777777').convertSRGBToLinear()
  }
  const colorize = (grp: THREE.Group, pre: THREE.Matrix4) => {
    const list: THREE.BufferGeometry[] = []
    grp.updateMatrixWorld(true)
    grp.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      const g = mesh.geometry.clone()
      g.deleteAttribute('uv')
      const c = farColor(mesh.material as THREE.Material)
      const arr = new Float32Array(g.attributes.position.count * 3)
      for (let i = 0; i < g.attributes.position.count; i++) {
        arr[i * 3] = c.r
        arr[i * 3 + 1] = c.g
        arr[i * 3 + 2] = c.b
      }
      g.setAttribute('color', new THREE.BufferAttribute(arr, 3))
      g.applyMatrix4(pre.clone().multiply(mesh.matrixWorld))
      list.push(g)
    })
    return mergeGeometries(list, false)!
  }
  let farBody: THREE.InstancedMesh | null = null
  let farSails: THREE.InstancedMesh | null = null
  const hubM = new THREE.Matrix4()
  const farMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 })
  if (farMills.length) {
    const p = parts[0]
    const bodyGeo = colorize(p.body, new THREE.Matrix4())
    // sails: wheel geometry expressed in hub space
    p.hub.updateMatrix()
    hubM.copy(p.hub.matrix)
    const sailGeo = colorize(p.wheel, new THREE.Matrix4())
    farBody = new THREE.InstancedMesh(bodyGeo, farMat, farMills.length)
    farSails = new THREE.InstancedMesh(sailGeo, farMat, farMills.length)
    const mm = new THREE.Matrix4()
    farMills.forEach((m, i) => {
      mm.compose(new THREE.Vector3(m.x, heightAt(m.x, m.z) - 0.02, m.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), m.yaw), new THREE.Vector3(m.scale, m.scale, m.scale))
      farBody!.setMatrixAt(i, mm)
    })
    farBody.frustumCulled = false
    farSails.frustumCulled = false
    farBody.castShadow = false
    farSails.castShadow = false
    root.add(farBody, farSails)
    reflectHide.push() // far mills stay in reflections
  }
  const tmpA = new THREE.Matrix4()
  const tmpR = new THREE.Matrix4()
  const tmpQ = new THREE.Quaternion()
  const farAng = farMills.map((m) => m.phase)

  /* --------------------------------------------------------- buildings */
  progress(0.4, 'Building farmsteads')
  await yieldFrame()
  const placeBuilt = (b: Built, x: number, z: number, yaw: number) => {
    const g = b.group
    g.position.set(x, heightAt(x, z) - 0.05, z)
    g.rotation.y = yaw
    root.add(g)
    for (const c of b.colliders) {
      const wx = x + c[0] * Math.cos(yaw) + c[1] * Math.sin(yaw)
      const wz = z - c[0] * Math.sin(yaw) + c[1] * Math.cos(yaw)
      circles.push({ x: wx, z: wz, r: c[2] })
      colliders.push({ x: wx, z: wz, r: c[2] })
    }
    obbs.push({ cx: x, cz: z, c: Math.cos(yaw), s: Math.sin(yaw), hx: b.w / 2 + 2.5, hz: b.d / 2 + 4 })
  }
  houses.forEach((h, i) => {
    const b = h.kind === 'farm' ? farmhouse({ w: h.w, d: h.d, seed: 40 + i, roof: h.roof }) : hipBarn(h.w, h.d, i)
    placeBuilt(b, h.x, h.z, h.yaw)
  })
  const station = pumpingStation()
  placeBuilt(station, pump.x, pump.z, pump.yaw)

  /* ----------------------------------------------------------- bridges */
  for (const b of bridges) root.add(footbridge(b))

  /* ----------------------------------------------------- exclusion tests */
  const nearObb = (x: number, z: number, margin: number) => {
    for (const o of obbs) {
      const dx = x - o.cx
      const dz = z - o.cz
      const lx = dx * o.c - dz * o.s
      const lz = dx * o.s + dz * o.c
      if (Math.abs(lx) < o.hx + margin && Math.abs(lz) < o.hz + margin) return true
    }
    return false
  }
  const nearCircle = (x: number, z: number, margin: number) => {
    for (const c of circles) if (Math.hypot(x - c.x, z - c.z) < c.r + margin) return true
    return false
  }
  const nearBridge = (x: number, z: number) => {
    for (const b of bridges) {
      const f = frameAt(b.x)
      const dx = x - f.x
      const dz = z - f.z
      const u = dx * f.nx + dz * f.nz
      const w = dx * f.tx + dz * f.tz
      if (Math.abs(u) < b.halfLen + 3 && Math.abs(w) < b.halfW + 1.4) return true
    }
    return false
  }

  /* ------------------------------------------------------------- reeds */
  progress(0.5, 'Planting reed beds')
  await yieldFrame()
  const reeds = buildReeds((x, z) => !nearBridge(x, z))
  root.add(reeds)

  /* ------------------------------------------------------------- grass */
  progress(0.58, 'Sowing the meadows')
  await yieldFrame()
  const grass = new GrassField({
    density: 1,
    allowed: (x, z, ad) => {
      if (Math.abs(ad - ROAD_D) < 2.05) return false
      if (nearCircle(x, z, 0.3)) return false
      if (nearObb(x, z, -0.2) && (() => { for (const o of obbs) { if (o.hz < 6) continue; const dx = x - o.cx; const dz = z - o.cz; if (Math.abs(dx * o.c - dz * o.s) < o.hx - 1.2 && Math.abs(dx * o.s + dz * o.c) < o.hz - 1.2) return true } return false })()) return false
      if (nearBridge(x, z) && ad < 12) return false
      for (const m of mills) if (!m.far && Math.hypot(x - m.x, z - m.z) < 5.7) return false
      return true
    },
  })
  root.add(grass.group)

  /* ------------------------------------------------------------- trees */
  progress(0.66, 'Growing willows and poplars')
  await yieldFrame()
  const variants: Record<'willow' | 'round' | 'poplar', TreeGeo[]> = {
    willow: [1, 2, 3, 4].map((s) => genTree('willow', s)),
    round: [1, 2, 3, 4].map((s) => genTree('round', s)),
    poplar: [1, 2, 3].map((s) => genTree('poplar', s)),
  }
  const inst: Record<string, THREE.Matrix4[]> = {}
  const addTree = (kind: 'willow' | 'round' | 'poplar', x: number, z: number, scale: number, solid = true) => {
    const list = variants[kind]
    const vi = Math.floor(rand() * list.length)
    const key = kind + vi
    const y = heightAt(x, z)
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * TAU), new THREE.Vector3(scale, scale, scale))
    ;(inst[key] ??= []).push(m)
    if (solid) {
      circles.push({ x, z, r: 0.5 })
      colliders.push({ x, z, r: 0.5 * scale + 0.15 })
    }
  }
  const treeOk = (x: number, z: number, margin = 2.5) => {
    if (nearObb(x, z, margin)) return false
    if (nearCircle(x, z, margin + 2)) return false
    if (nearBridge(x, z)) return false
    const ad = Math.abs(signedDist(x, z))
    if (Math.abs(ad - ROAD_D) < 2.4) return false
    if (ad < 6.7) return false
    return true
  }
  // bank willows (sparse so the mills stay visible across the water)
  for (const side of [-1, 1]) {
    let xp = -MX
    while (xp < MX) {
      xp += 26 + rand() * 40
      const waterside = rand() < 0.4
      const [x, z] = pointAt(xp, side * (waterside ? 7.0 : 13.2 + rand() * 1.2))
      if (!treeOk(x, z, 1.5)) continue
      addTree('willow', x, z, 0.85 + rand() * 0.45, true)
    }
  }
  // lines of poplars behind the mills + hedgerows of round trees
  for (const side of [-1, 1]) {
    for (const [ad, kind, step] of [[46, 'poplar', 8.5], [88, 'poplar', 10], [34, 'round', 11]] as const) {
      let xp = -MX - 100
      while (xp < MX + 100) {
        xp += step * (0.7 + rand() * 0.8)
        const gate = fbm(xp * 0.012 + side * 7, ad * 0.1, 91, 2)
        if (gate < 0.5) continue
        const [x, z] = pointAt(xp, side * (ad + (rand() - 0.5) * 5))
        if (!treeOk(x, z, 3)) continue
        addTree(kind, x, z, kind === 'poplar' ? 0.85 + rand() * 0.4 : 0.8 + rand() * 0.5, Math.abs(xp) < 262)
      }
    }
  }
  // clumps around farmsteads
  for (const h of houses) {
    const n = 3 + Math.floor(rand() * 3)
    for (let i = 0; i < n; i++) {
      const a = rand() * TAU
      const rr = Math.max(h.w, h.d) * 0.7 + 4 + rand() * 6
      const x = h.x + Math.cos(a) * rr
      const z = h.z + Math.sin(a) * rr
      if (!treeOk(x, z, 2)) continue
      addTree(rand() < 0.6 ? 'round' : 'willow', x, z, 0.8 + rand() * 0.5)
    }
  }
  // distant tree belts
  for (let i = 0; i < 160; i++) {
    const xp = -800 + rand() * 1600
    const side = rand() < 0.5 ? -1 : 1
    const ad = 120 + rand() * 500
    const [x, z] = pointAt(xp, side * ad)
    if (Math.abs(x) > 1000) continue
    addTree(rand() < 0.5 ? 'poplar' : 'round', x, z, 1.0 + rand() * 0.6, false)
  }
  const treeMeshes: THREE.InstancedMesh[] = []
  for (const kind of ['willow', 'round', 'poplar'] as const)
    variants[kind].forEach((tv, vi) => {
      const list = inst[kind + vi]
      if (!list?.length) return
      const a = new THREE.InstancedMesh(tv.trunk, M.bark, list.length)
      const b = new THREE.InstancedMesh(tv.leaves, tv.mat, list.length)
      list.forEach((m, i) => {
        a.setMatrixAt(i, m)
        b.setMatrixAt(i, m)
      })
      for (const mesh of [a, b]) {
        mesh.castShadow = true
        mesh.receiveShadow = true
        mesh.frustumCulled = false
        root.add(mesh)
        treeMeshes.push(mesh)
      }
    })
  void treeMesh

  /* ------------------------------------------------------------- boats */
  progress(0.8, 'Mooring the boats')
  await yieldFrame()
  const boats: { g: THREE.Group; base: number; ph: number }[] = []
  const boatDefs: [number, number, string][] = [[-70, -1, '#2d4639'], [-64, -1, '#7a2b24'], [38, 1, '#c9c2ab'], [150, -1, '#2a4a62']]
  for (const [xp, side, color] of boatDefs) {
    const [x, z] = pointAt(xp, side * 4.9)
    const f = frameAt(xp)
    const b = rowBoat(Math.floor(Math.abs(xp)), color)
    b.position.set(x, WATER_Y - 0.16, z)
    b.rotation.y = Math.atan2(-f.tz, f.tx) + (rand() - 0.5) * 0.2
    root.add(b)
    boats.push({ g: b, base: WATER_Y - 0.16, ph: rand() * 6 })
  }

  /* ---------------------------------------------------- mooring posts */
  {
    const posts: THREE.Matrix4[] = []
    for (const side of [-1, 1])
      for (let xp = -MX; xp < MX; xp += 7.5) {
        const [x, z] = pointAt(xp, side * 6.9)
        if (nearBridge(x, z) || heightAt(x, z) < 0.3) continue
        if (rand() < 0.62) continue
        posts.push(new THREE.Matrix4().makeTranslation(x, heightAt(x, z) + 0.28, z))
      }
    const g = new THREE.CylinderGeometry(0.075, 0.09, 0.9, 7)
    const im = new THREE.InstancedMesh(g, M.woodDark, posts.length)
    posts.forEach((p, i) => im.setMatrixAt(i, p))
    im.castShadow = true
    im.receiveShadow = true
    root.add(im)
  }

  /* ---------------------------------------------------------- hotspots */
  progress(0.9, 'Placing the guide posts')
  await yieldFrame()
  const near = mills.filter((m) => !m.far)
  const pick = (xp: number, side: number) => near.reduce((a, b) => (Math.abs(b.xp - xp) + (b.side === side ? 0 : 999) < Math.abs(a.xp - xp) + (a.side === side ? 0 : 999) ? b : a))
  const viewFrom = (x: number, z: number, tx: number, tz: number, dist: number) => {
    // stand `dist` metres from target on the road side facing the target
    const dx = x - tx
    const dz = z - tz
    const l = Math.hypot(dx, dz) || 1
    return { x: tx + (dx / l) * dist, z: tz + (dz / l) * dist, yaw: Math.atan2(-(dx / l), -(dz / l)) }
  }
  const spawnXp = -58
  const [sx, sz] = pointAt(spawnXp, 9.6)
  const sf = frameAt(spawnXp)
  // stand on the +z bank road, look along the canal (+x) and slightly across the water
  const lookX = sf.tx * 0.9 - sf.nx * 0.45
  const lookZ = sf.tz * 0.9 - sf.nz * 0.45
  const spawn = { x: sx, z: sz, yaw: Math.atan2(lookX, lookZ) }
  let millExit = { x: 0, z: 0, yaw: 0 }
  const mA = pick(-12, -1)
  const mB = pick(60, 1)
  const mC = pick(-100, -1)
  const bm = bridges[1]
  const bf = frameAt(bm.x)
  const [bx, bz] = pointAt(bm.x, 0)
  const hs = (id: string, kicker: string, title: string, text: string, facts: [string, string][], x: number, y: number, z: number, view: { x: number; z: number; yaw: number }) => hotspots.push({ id, kicker, title, text, facts, x, y, z, view })
  hs(
    'welcome', 'Welcome', 'The Molenkade at Kinderdijk',
    'You are standing on the Molenkade, the narrow dike road that follows the Molenvliet canal. Nineteen windmills line these waterways in the Alblasserwaard polder, a landscape that lies below sea level and has been kept dry by wind and water management for nearly 800 years.',
    [['UNESCO', '1997'], ['Mills', '19'], ['Polder', 'Alblasserwaard']],
    sx, 2.6, sz, { x: sx, z: sz, yaw: spawn.yaw },
  )
  {
    const f = Math.sin(mA.yaw)
    const g = Math.cos(mA.yaw)
    hs(
      'mill', 'Landmark', 'An octagonal ground-sailer',
      'These reed-thatched, eight-sided mills are called grondzeilers: their sails sweep so low that the tips pass just above head height. Inside, the wind turned a huge wooden waterwheel that lifted water from the polder ditches up into the higher reservoir (boezem) that feeds the river Lek. Millers and their families lived inside the mills.',
      [['Built', 'c. 1738 – 1740'], ['Sail span', '≈ 28 m'], ['Body', 'Reed on brick plinth']],
      mA.x + f * 3, 8.5, mA.z + g * 3, viewFrom(mA.x, mA.z, mA.x, mA.z, 0) && (() => { const [vx, vz] = pointAt(mA.xp, mA.side * 8.8); return { x: vx, z: vz, yaw: Math.atan2(mA.x - vx, mA.z - vz) } })(),
    )
    // tail pole
    const tx = mC.x - Math.sin(mC.yaw) * 9
    const tz = mC.z - Math.cos(mC.yaw) * 9
    hs(
      'tail', 'Detail', 'Tail pole and kruiwerk',
      'To face the sails into the wind, the miller turned the whole cap using the long tail pole. A winch wheel (kruiwerk) at its foot is chained to posts set in a ring on the ground. Rolling the wheel swings the cap, with its sails, round to the new wind direction.',
      [['Mechanism', 'Cap-turning'], ['Anchors', 'Ring of posts']],
      tx, 2.4, tz, (() => { const [vx, vz] = pointAt(mC.xp, mC.side * 9.4); return { x: vx, z: vz, yaw: Math.atan2(mC.x - vx, mC.z - vz) } })(),
    )
  }
  {
    const c = Math.cos(mB.yaw)
    const s = Math.sin(mB.yaw)
    const L = (lx: number, lz: number) => [mB.x + (lx * c + lz * s) * mB.scale, mB.z + (-lx * s + lz * c) * mB.scale] as const
    const [dx, dz] = L(3.7, 0)
    const [ex, ez] = L(6.4, 0)
    millExit = { x: ex, z: ez, yaw: Math.atan2(c, -s) }
    hotspots.push({
      id: 'interior', zone: 'out', action: 'enter', reach: 11, kicker: 'Step inside', title: 'Enter the mill',
      text: '', facts: [], x: dx, y: heightAt(mB.x, mB.z) + 2.0, z: dz,
      view: { x: ex, z: ez, yaw: millExit.yaw + Math.PI },
    })
  }
  hs(
    'thatch', 'Material', 'Reed thatch (riet)',
    'The walls and cap are covered in bundled reed harvested in the Dutch wetlands. A well-laid thatch can last 30 to 40 years, shedding rain and insulating the living quarters. The vertical timber ribs on each corner and the horizontal bindings hold the reed in place.',
    [['Lifespan', '30 – 40 years'], ['Source', 'Dutch reed beds']],
    mB.x + Math.sin(mB.yaw + Math.PI / 2) * 3.8, 3.6, mB.z + Math.cos(mB.yaw + Math.PI / 2) * 3.8, (() => { const [vx, vz] = pointAt(mB.xp, mB.side * 10.8); return { x: vx, z: vz, yaw: Math.atan2(mB.x - vx, mB.z - vz) } })(),
  )
  hs(
    'bridge', 'Crossing', 'Footbridge over the Molenvliet',
    'Timber footbridges join the Molenkade roads on either side of the canal. Cross to see the mills from the opposite bank – this is the classic view photographers come for, with the reeds, the reflections and the sails all lined up.',
    [['Canal width', '≈ 12 m'], ['Water level', 'Managed by pumps']],
    bx, 3.4, bz, { x: bx + bf.nx * 8, z: bz + bf.nz * 8, yaw: Math.atan2(-bf.nx, -bf.nz) },
  )
  hs(
    'pump', 'Landmark', 'Wisboom pumping station',
    'Windmills could not always keep up. In 1868 a steam pumping station, the Wisboom, was built beside the canal, with a tall brick chimney to carry away the smoke. It could shift far more water than a mill, and the polder now relies on modern electric and diesel pumps.',
    [['Built', '1868'], ['Power', 'Steam (originally)'], ['Chimney', '≈ 24 m']],
    pump.x, 6.5, pump.z, (() => { const f = frameAt(pump.xp); const [vx, vz] = pointAt(pump.xp, -12); return { x: vx - f.tx * 6, z: vz - f.tz * 6, yaw: Math.atan2(pump.x - vx, pump.z - vz) } })(),
  )
  {
    const [rx, rz] = pointAt(-96, -6.4)
    const [vx, vz] = pointAt(-96, -9.6)
    hs(
      'reeds', 'Nature', 'Reed margins and willows',
      'The canal edges are fringed with common reed, which shelters ducks, coots and warblers and helps hold the banks together. Pollarded willows were traditionally cut for withies and to strengthen dikes. Look for the legend of the cradle: after the St. Elizabeth\'s flood of 1421, a cat in a floating cradle is said to have drifted here, giving Kinderdijk its name, "child\'s dike".',
      [['Legend', 'St. Elizabeth\'s flood, 1421'], ['Name', '"Child\'s dike"']],
      rx, 1.8, rz, { x: vx, z: vz, yaw: Math.atan2(rx - vx, rz - vz) },
    )
  }
  hs(
    'sails', 'Tradition', 'Reading the sails',
    'The position where the sails rest was once a message. Stopped at the "long" rest the mill was ready to work; a "festive" tilt signalled celebrations and a birth; a "mourning" tilt marked a death in the community. The mills here turn slowly in the wind, you can adjust the breeze in Settings.',
    [['Position', 'Rest = message'], ['Tip speed', 'Slow & stately']],
    mA.x - 14 * Math.cos(mA.yaw), 14.2, mA.z + 14 * Math.sin(mA.yaw) * 0 + 0, viewFrom(mA.x, mA.z, mA.x, mA.z, 0) && (() => { const [vx, vz] = pointAt(mA.xp, -mA.side * 8.8); return { x: vx, z: vz, yaw: Math.atan2(mA.x - vx, mA.z - vz) } })(),
  )
  // sails hotspot sits in front of the hub
  {
    const h = hotspots[hotspots.length - 1]
    const hubWorld = new THREE.Vector3(0, MILL.hubY, MILL.hubZ + 0.5).applyAxisAngle(new THREE.Vector3(0, 1, 0), mA.yaw)
    h.x = mA.x + hubWorld.x
    h.y = heightAt(mA.x, mA.z) + hubWorld.y
    h.z = mA.z + hubWorld.z
  }
  // height lift of hotspots to terrain
  for (const h of hotspots) if (h.id !== 'sails') h.y += groundY(h.x, h.z) * 0

  progress(0.97, 'Almost there')
  await yieldFrame()

  /* ----------------------------------------------------------- update */
  const update: World['update'] = (t, dt, wind, sails, px, pz) => {
    const sp = sails ? 0.04 + wind * 0.3 : 0
    for (const w of wheels) w.wheel.rotation.z -= dt * sp * w.speed
    if (farSails && farBody) {
      const hm = hubM
      farMills.forEach((m, i) => {
        farAng[i] -= dt * sp * m.speed
        tmpA.compose(new THREE.Vector3(m.x, heightAt(m.x, m.z) - 0.02, m.z), tmpQ.setFromAxisAngle(new THREE.Vector3(0, 1, 0), m.yaw), new THREE.Vector3(m.scale, m.scale, m.scale))
        tmpR.makeRotationZ(farAng[i])
        tmpA.multiply(hm).multiply(tmpR)
        farSails!.setMatrixAt(i, tmpA)
      })
      farSails.instanceMatrix.needsUpdate = true
    }
    for (const b of boats) {
      b.g.position.y = b.base + Math.sin(t * 0.9 + b.ph) * 0.012
      b.g.rotation.z = Math.sin(t * 0.7 + b.ph) * 0.012
    }
    grass.update(px, pz, 95)
  }

  void pads
  void canalZ
  void smooth
  return {
    group: root,
    colliders,
    hotspots,
    grass,
    millPoints: mills.map((m) => ({ x: m.x, z: m.z, far: m.far })),
    bridgePoints: bridges.map((b) => { const [x, z] = pointAt(b.x, 0); return { x, z } }),
    spawn,
    mill: { exit: millExit },
    reflectHide,
    waterGeo,
    update,
  }
}

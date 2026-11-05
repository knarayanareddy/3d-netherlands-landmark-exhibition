import * as THREE from 'three'
import { Batch, TAU, beamGeo, boxGeo, frustumGeo, tubeGeo, rng } from './gfx'
import { M } from './materials'
import type { Hotspot } from './world'

/** The interior is built far from the outdoor scene and swapped in when the player steps through the door. */
export const INT_ORIGIN = new THREE.Vector3(5000, 0, 5000)
export const FLOOR1_Y = 3.85

export interface Collider {
  x: number
  z: number
  r: number
}
export interface Interior {
  group: THREE.Group
  c0: Collider[]
  c1: Collider[]
  hotspots: Hotspot[]
  radius: number
  spawn: { x: number; z: number; yaw: number }
  ladderUp: { x: number; z: number }
  ladderDown: { x: number; z: number }
  lights: THREE.Light[]
}

const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)
const T = (x: number, y: number, z: number) => new THREE.Matrix4().makeTranslation(x, y, z)

export function buildInterior(): Interior {
  const O = INT_ORIGIN
  const g = new THREE.Group()
  g.position.copy(O)
  const r = rng(321)
  const lights: THREE.Light[] = []

  const dbl = (m: THREE.MeshStandardMaterial, color?: string) => {
    const c = m.clone()
    c.side = THREE.DoubleSide
    if (color) c.color.set(color)
    return c
  }
  const back = (m: THREE.MeshStandardMaterial, color?: string) => {
    const c = m.clone()
    c.side = THREE.BackSide
    if (color) c.color.set(color)
    return c
  }
  const plaster = back(M.planksWhite, '#e9e1d2')
  const woodWall = back(M.wood, '#d4c5b0')
  const planks = dbl(M.wood, '#e6d8c4')
  const beamMat = M.woodDark
  const b = new Batch()

  /* ---- shell */
  g.add(Object.assign(new THREE.Mesh(frustumGeo(3.15, 2.98, FLOOR1_Y - 0.1, 8, 1.5, true), plaster), { receiveShadow: false }))
  const upper = new THREE.Mesh(frustumGeo(2.98, 2.35, 4.6, 8, 1.5, true), woodWall)
  upper.position.y = FLOOR1_Y - 0.1
  g.add(upper)

  const octPoly = (rad: number) => {
    const pts: THREE.Vector2[] = []
    for (let i = 0; i < 8; i++) {
      const a = (i + 0.5) * (Math.PI / 4)
      pts.push(new THREE.Vector2(Math.sin(a) * rad, Math.cos(a) * rad))
    }
    return pts
  }
  const flatUV = (geo: THREE.BufferGeometry, tile: number) => {
    const p = geo.attributes.position
    const uv = geo.attributes.uv
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / tile, p.getZ(i) / tile)
  }
  // ground floor
  {
    const geo = new THREE.ShapeGeometry(new THREE.Shape(octPoly(3.1)))
    geo.rotateX(-Math.PI / 2)
    flatUV(geo, 1.4)
    const m = new THREE.Mesh(geo, planks)
    m.position.y = 0.0
    m.receiveShadow = true
    g.add(m)
  }
  // first floor with a ladder hatch
  const hole = { x: 1.85, z: -0.3, hx: 0.55, hz: 0.5 }
  {
    const sh = new THREE.Shape(octPoly(3.0))
    const hl = new THREE.Path()
    // shape coords are (x, y) → after rotateX(-90°) y maps to -z
    hl.moveTo(hole.x - hole.hx, -(hole.z - hole.hz))
    hl.lineTo(hole.x + hole.hx, -(hole.z - hole.hz))
    hl.lineTo(hole.x + hole.hx, -(hole.z + hole.hz))
    hl.lineTo(hole.x - hole.hx, -(hole.z + hole.hz))
    hl.closePath()
    sh.holes.push(hl)
    const geo = new THREE.ShapeGeometry(sh)
    geo.rotateX(-Math.PI / 2)
    // after rotateX, y→z flip; sit at floor level
    flatUV(geo, 1.3)
    const m = new THREE.Mesh(geo, planks)
    m.position.y = FLOOR1_Y
    m.receiveShadow = true
    g.add(m)
  }
  // ceiling
  {
    const geo = new THREE.ShapeGeometry(new THREE.Shape(octPoly(2.4)))
    geo.rotateX(Math.PI / 2)
    flatUV(geo, 1.2)
    const m = new THREE.Mesh(geo, dbl(M.woodDark))
    m.position.y = 8.35
    g.add(m)
  }
  // joists under floor 1 and rafters
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4
    b.add(beamGeo(v3(0, FLOOR1_Y - 0.2, 0), v3(Math.sin(a) * 3.0, FLOOR1_Y - 0.2, Math.cos(a) * 3.0), 0.22, 0.26, 0.8), beamMat)
    b.add(beamGeo(v3(0, 8.2, 0), v3(Math.sin(a) * 2.35, 7.7, Math.cos(a) * 2.35), 0.16, 0.2, 0.8), beamMat)
  }
  b.add(boxGeo(4.4, 0.28, 0.34, 0.8), beamMat, T(0, 7.9, 0.0))
  b.add(boxGeo(0.34, 0.28, 4.4, 0.8), beamMat, T(0, 7.62, 0.0))
  // wall plates
  for (let i = 0; i < 8; i++) {
    const a1 = (i + 0.5) * (Math.PI / 4)
    const a2 = (i + 1.5) * (Math.PI / 4)
    b.add(beamGeo(v3(Math.sin(a1) * 2.96, FLOOR1_Y + 0.02, Math.cos(a1) * 2.96), v3(Math.sin(a2) * 2.96, FLOOR1_Y + 0.02, Math.cos(a2) * 2.96), 0.12, 0.16, 0.6), beamMat)
  }

  /* ---- central upright shaft and gearing */
  b.add(frustumGeo(0.44, 0.36, 8.2, 8, 1.1, true), M.wood)
  const gear = (y: number, rad: number, n: number, down: boolean) => {
    const rim = new THREE.CylinderGeometry(rad, rad, 0.3, 56, 1, true)
    b.add(rim, dbl(M.wood, '#d8c9b4'), T(0, y, 0))
    const rim2 = new THREE.CylinderGeometry(rad - 0.22, rad - 0.22, 0.3, 40, 1, true)
    b.add(rim2, dbl(M.wood, '#b9a893'), T(0, y, 0))
    for (let k = 0; k < 6; k++) {
      const a = (k * TAU) / 6
      b.add(beamGeo(v3(0, y, 0), v3(Math.sin(a) * rad, y, Math.cos(a) * rad), 0.17, 0.22, 0.8), beamMat)
    }
    for (let k = 0; k < n; k++) {
      const a = (k * TAU) / n
      const m = new THREE.Matrix4().makeRotationY(a)
      if (down) m.multiply(T(0, -0.3, rad - 0.1))
      else m.multiply(T(0, 0, rad + 0.1))
      m.premultiply(T(0, y, 0))
      b.add(down ? boxGeo(0.13, 0.4, 0.15, 0.4) : boxGeo(0.14, 0.3, 0.2, 0.4), M.woodDark, m)
    }
  }
  gear(2.55, 1.72, 42, false)
  gear(6.1, 1.4, 34, true)
  // lantern pinion between the wheels
  for (let k = 0; k < 8; k++) {
    const a = (k * TAU) / 8
    b.add(tubeGeo(v3(Math.sin(a) * 0.62, 4.5, Math.cos(a) * 0.62), v3(Math.sin(a) * 0.62, 5.4, Math.cos(a) * 0.62), 0.05, 0.05, 6, 1), M.wood)
  }
  b.add(frustumGeo(0.66, 0.66, 0.1, 8, 1), beamMat, T(0, 4.45, 0))
  b.add(frustumGeo(0.66, 0.66, 0.1, 8, 1), beamMat, T(0, 5.4, 0))
  // windshaft and iron bearings visible at the top
  b.add(beamGeo(v3(0, 7.15, 2.35), v3(0, 7.45, -1.9), 0.42, 0.42, 1), M.wood)
  b.add(frustumGeo(0.3, 0.3, 0.25, 12, 1), M.iron, T(0, 7.9, 0).clone().multiply(new THREE.Matrix4().makeRotationX(0)))
  // iron collar bands on the shaft
  for (const y of [1.2, 3.2, 7.0]) b.add(frustumGeo(0.47, 0.47, 0.1, 8, 1), M.iron, T(0, y, 0))

  /* ---- windows (bright sky panes) and the door */
  const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(1.6, 1.75, 2.0), toneMapped: true })
  const win = (deg: number, y: number, w = 0.7, h = 0.95) => {
    const phi = (deg * Math.PI) / 180
    const ap = 2.86 - (y / 8) * 0.5
    const m = new THREE.Matrix4().makeRotationY(phi + Math.PI)
    m.setPosition(Math.sin(phi) * ap, y, Math.cos(phi) * ap)
    b.add(boxGeo(w + 0.3, h + 0.3, 0.16, 0.5), M.paint, m.clone().multiply(T(0, 0, -0.02)))
    const pane = new THREE.PlaneGeometry(w, h)
    pane.applyMatrix4(m.clone().multiply(T(0, 0, 0.07)))
    const mesh = new THREE.Mesh(pane, glow)
    g.add(mesh)
    b.add(boxGeo(0.045, h, 0.05, 0.5), M.paint, m.clone().multiply(T(0, 0, 0.1)))
    b.add(boxGeo(w, 0.045, 0.05, 0.5), M.paint, m.clone().multiply(T(0, 0.05, 0.1)))
    b.add(boxGeo(w + 0.5, 0.07, 0.34, 0.5), M.paint, m.clone().multiply(T(0, -(h / 2 + 0.16), 0.12)))
    const L = new THREE.PointLight('#d6e6ff', 5, 8, 2)
    L.position.set(Math.sin(phi) * (ap - 1.3), y, Math.cos(phi) * (ap - 1.3))
    g.add(L)
    lights.push(L)
  }
  win(45, 1.8)
  win(315, 1.8)
  win(180, 1.8, 0.6, 0.8)
  win(135, 5.9, 0.6, 0.8)
  win(225, 5.9, 0.6, 0.8)
  win(0, 5.9, 0.6, 0.8)
  // door on the +x face (90°)
  {
    const m = new THREE.Matrix4().makeRotationY((90 * Math.PI) / 180 + Math.PI)
    m.setPosition(2.88, 0, 0)
    b.add(boxGeo(1.5, 2.3, 0.2, 0.5), M.paint, m.clone().multiply(T(0, 1.15, -0.02)))
    b.add(boxGeo(1.1, 2.1, 0.14, 0.6), M.tar, m.clone().multiply(T(0, 1.05, 0.08)))
    b.add(boxGeo(0.07, 2.1, 0.05, 0.5), M.iron, m.clone().multiply(T(0, 1.05, 0.17)))
    b.add(boxGeo(0.34, 0.07, 0.07, 0.5), M.iron, m.clone().multiply(T(-0.3, 1.0, 0.2)))
    const L = new THREE.PointLight('#fff1d6', 3, 6, 2)
    L.position.set(1.5, 1.9, 0)
    g.add(L)
    lights.push(L)
  }

  /* ---- ladder to the upper floor */
  {
    const base = v3(1.85, 0, 1.95)
    const top = v3(1.85, FLOOR1_Y + 0.9, 0.35)
    for (const s of [-0.28, 0.28]) b.add(beamGeo(base.clone().add(v3(s, 0, 0)), top.clone().add(v3(s, 0, 0)), 0.07, 0.1, 0.6), M.wood)
    for (let i = 1; i < 13; i++) {
      const p = base.clone().lerp(top, i / 13)
      b.add(boxGeo(0.56, 0.045, 0.06, 0.6), M.wood, T(p.x, p.y, p.z))
    }
  }

  /* ---- living quarters (ground floor) */
  const polar = (deg: number, rad: number) => {
    const a = (deg * Math.PI) / 180
    return { x: Math.sin(a) * rad, z: Math.cos(a) * rad, yaw: a + Math.PI }
  }
  const at = (p: { x: number; z: number; yaw: number }) => new THREE.Matrix4().makeRotationY(p.yaw).setPosition(p.x, 0, p.z)
  // table with two chairs
  {
    const tm = new THREE.Matrix4().makeTranslation(-1.35, 0, 1.0).multiply(new THREE.Matrix4().makeRotationY(0.5))
    const put = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => b.add(geo, mat, tm.clone().multiply(T(x, y, z)))
    put(boxGeo(1.25, 0.06, 0.8, 0.5), M.wood, 0, 0.76, 0)
    for (const sx of [-0.55, 0.55]) for (const sz of [-0.32, 0.32]) put(boxGeo(0.07, 0.74, 0.07, 0.5), M.woodDark, sx, 0.37, sz)
    for (const sx of [-0.85, 0.85]) {
      put(boxGeo(0.44, 0.05, 0.44, 0.5), M.wood, sx, 0.46, 0)
      for (const lx of [-0.18, 0.18]) for (const lz of [-0.18, 0.18]) put(boxGeo(0.045, 0.45, 0.045, 0.5), M.woodDark, sx + lx, 0.22, lz)
      put(boxGeo(0.05, 0.5, 0.44, 0.5), M.wood, sx + (sx < 0 ? -0.2 : 0.2), 0.72, 0)
    }
    // tableware: plate, mug, loaf
    const plate = new THREE.CylinderGeometry(0.14, 0.12, 0.02, 20)
    b.add(plate, new THREE.MeshStandardMaterial({ color: '#e9eef4', roughness: 0.3 }), tm.clone().multiply(T(-0.3, 0.8, 0.1)))
    b.add(new THREE.CylinderGeometry(0.045, 0.04, 0.1, 12), new THREE.MeshStandardMaterial({ color: '#2f5f8f', roughness: 0.35 }), tm.clone().multiply(T(0.25, 0.84, -0.12)))
    b.add(new THREE.SphereGeometry(0.13, 12, 8).scale(1.4, 0.7, 0.8), new THREE.MeshStandardMaterial({ color: '#b98a52', roughness: 0.9 }), tm.clone().multiply(T(0.1, 0.83, 0.2)))
  }
  // iron stove with chimney pipe
  {
    const s = new THREE.Matrix4().makeTranslation(-1.95, 0, -1.25)
    b.add(boxGeo(0.7, 0.9, 0.55, 0.5), M.iron, s.clone().multiply(T(0, 0.55, 0)))
    b.add(boxGeo(0.8, 0.08, 0.65, 0.5), M.iron, s.clone().multiply(T(0, 1.04, 0)))
    for (const sx of [-0.28, 0.28]) b.add(boxGeo(0.07, 0.12, 0.07, 0.5), M.iron, s.clone().multiply(T(sx, 0.06, 0.2)))
    b.add(tubeGeo(v3(-1.95, 1.08, -1.25), v3(-1.95, 3.7, -1.25), 0.07, 0.07, 10, 1), M.iron)
    b.add(boxGeo(0.26, 0.22, 0.04, 0.5), new THREE.MeshStandardMaterial({ color: '#ff7a28', emissive: new THREE.Color('#ff5a10'), emissiveIntensity: 1.6 }), s.clone().multiply(T(0, 0.55, 0.285)))
  }
  // box bed (bedstee) in the wall
  {
    const p = polar(235, 2.3)
    const m = at(p)
    const put = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => b.add(geo, mat, m.clone().multiply(T(x, y, z)))
    put(boxGeo(1.9, 0.1, 0.95, 0.6), M.wood, 0, 0.4, 0)
    put(boxGeo(1.9, 1.7, 0.08, 0.6), M.woodDark, 0, 0.9, -0.5)
    put(boxGeo(0.08, 1.1, 0.95, 0.6), M.woodDark, -0.97, 0.7, 0)
    put(boxGeo(0.08, 0.6, 0.95, 0.6), M.woodDark, 0.97, 0.45, 0)
    put(boxGeo(1.75, 0.16, 0.85, 0.6), new THREE.MeshStandardMaterial({ color: '#7d2e2a', roughness: 0.95 }), 0, 0.53, 0)
    put(boxGeo(0.5, 0.14, 0.7, 0.6), new THREE.MeshStandardMaterial({ color: '#e8e1d2', roughness: 0.95 }), -0.65, 0.66, 0)
  }
  // dresser with Delft blue plates
  {
    const p = polar(160, 2.5)
    const m = at(p)
    const put = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => b.add(geo, mat, m.clone().multiply(T(x, y, z)))
    put(boxGeo(1.3, 0.95, 0.45, 0.6), M.wood, 0, 0.48, 0)
    put(boxGeo(1.3, 0.04, 0.5, 0.6), M.woodDark, 0, 0.97, 0)
    put(boxGeo(1.3, 1.0, 0.1, 0.6), M.woodDark, 0, 1.5, -0.2)
    for (const y of [1.2, 1.7]) put(boxGeo(1.3, 0.04, 0.3, 0.6), M.wood, 0, y, -0.05)
    const delft = new THREE.MeshStandardMaterial({ color: '#dfe8f2', roughness: 0.25 })
    const delftBlue = new THREE.MeshStandardMaterial({ color: '#27549a', roughness: 0.3 })
    for (let i = 0; i < 5; i++) {
      for (const y of [1.34, 1.84]) {
        const plate = new THREE.CylinderGeometry(0.15, 0.15, 0.025, 20)
        plate.rotateX(Math.PI / 2 - 0.25)
        put(plate, delft, -0.5 + i * 0.25, y, -0.13)
        const ring = new THREE.CylinderGeometry(0.1, 0.1, 0.03, 20)
        ring.rotateX(Math.PI / 2 - 0.25)
        put(ring, delftBlue, -0.5 + i * 0.25, y, -0.115)
      }
    }
  }
  // hanging lantern + pots
  {
    b.add(tubeGeo(v3(-0.8, 3.7, 0.5), v3(-0.8, 3.05, 0.5), 0.015, 0.015, 5, 1), M.iron)
    b.add(boxGeo(0.22, 0.3, 0.22, 0.5), M.iron, T(-0.8, 2.88, 0.5))
    b.add(boxGeo(0.14, 0.16, 0.14, 0.5), new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(4, 2.4, 1.0) }), T(-0.8, 2.88, 0.5))
    const warm = new THREE.PointLight('#ffb36b', 38, 11, 1.6)
    warm.position.set(-0.8, 2.85, 0.5)
    warm.castShadow = false
    g.add(warm)
    lights.push(warm)
    const lamp2 = new THREE.PointLight('#ffb36b', 22, 9, 1.8)
    lamp2.position.set(-0.7, FLOOR1_Y + 1.9, -0.6)
    g.add(lamp2)
    lights.push(lamp2)
    b.add(boxGeo(0.2, 0.26, 0.2, 0.5), M.iron, T(-0.7, FLOOR1_Y + 1.9, -0.6))
    b.add(boxGeo(0.12, 0.14, 0.12, 0.5), new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(4, 2.4, 1.0) }), T(-0.7, FLOOR1_Y + 1.9, -0.6))
    b.add(tubeGeo(v3(-0.7, 8.2, -0.6), v3(-0.7, FLOOR1_Y + 2.05, -0.6), 0.012, 0.012, 5, 1), M.iron)
  }

  /* ---- upper floor: grain sacks, barrels, coiled rope */
  const sackM = new THREE.MeshStandardMaterial({ color: '#b9a37a', roughness: 1 })
  const sacks: Collider[] = []
  const sackSpots: [number, number][] = [[-1.7, 1.2], [-1.3, 1.8], [-2.0, 0.4], [-0.6, -2.0], [0.1, -2.4]]
  for (const [x, z] of sackSpots) {
    const s = new THREE.SphereGeometry(0.34, 14, 10)
    s.scale(1, 1.25, 0.82)
    s.rotateY(r() * TAU)
    b.add(s, sackM, T(x, FLOOR1_Y + 0.42, z))
    b.add(new THREE.CylinderGeometry(0.11, 0.18, 0.18, 8), sackM, T(x, FLOOR1_Y + 0.88, z))
    sacks.push({ x: x + O.x, z: z + O.z, r: 0.45 })
  }
  const barrel = (x: number, z: number) => {
    const bg = new THREE.CylinderGeometry(0.34, 0.34, 0.85, 16)
    b.add(bg, M.wood, T(x, FLOOR1_Y + 0.43, z))
    for (const y of [0.15, 0.7]) b.add(new THREE.CylinderGeometry(0.355, 0.355, 0.04, 16), M.iron, T(x, FLOOR1_Y + y, z))
    sacks.push({ x: x + O.x, z: z + O.z, r: 0.5 })
  }
  barrel(1.6, -1.9)
  barrel(2.1, -1.35)
  // rope coil
  {
    const rope = new THREE.TorusGeometry(0.28, 0.05, 6, 20)
    rope.rotateX(Math.PI / 2)
    b.add(rope, new THREE.MeshStandardMaterial({ color: '#a38b5f', roughness: 1 }), T(0.6, FLOOR1_Y + 0.06, 2.2))
  }

  g.add(b.build({ cast: false, receive: true }))

  // ambient fill so shadowed corners are not pitch black
  const hemi = new THREE.HemisphereLight('#a89480', '#2a2018', 0.4)
  g.add(hemi)
  lights.push(hemi)

  g.visible = false
  g.traverse((o) => {
    const m = o as THREE.Mesh
    if (m.isMesh) m.frustumCulled = false
  })

  const ox = (x: number) => x + O.x
  const oz = (z: number) => z + O.z
  const base: Collider[] = [{ x: O.x, z: O.z, r: 0.62 }]
  const c0: Collider[] = [
    ...base,
    { x: ox(-1.35), z: oz(1.0), r: 0.95 },
    { x: ox(-1.95), z: oz(-1.25), r: 0.62 },
    { x: ox(polar(235, 2.3).x), z: oz(polar(235, 2.3).z), r: 1.0 },
    { x: ox(polar(160, 2.5).x), z: oz(polar(160, 2.5).z), r: 0.75 },
    { x: ox(1.85), z: oz(2.0), r: 0.5 },
  ]
  const c1: Collider[] = [...base, { x: ox(hole.x), z: oz(hole.z), r: 0.95 }, ...sacks]

  const spots: Hotspot[] = [
    {
      id: 'i-door', zone: 'in', action: 'exit', reach: 4.5, kicker: 'Exit', title: 'Step outside', text: '', facts: [],
      x: ox(2.6), y: 1.7, z: oz(0),
    },
    {
      id: 'i-gear', zone: 'in', reach: 5, kicker: 'Machinery', title: 'The great spur wheel',
      text: 'The sails turn a long timber windshaft in the cap. Its wooden cogs mesh with the great upright shaft, which runs down through the mill. Wooden cogs mesh with the large spur wheel on this floor, which turns a drive shaft out to the pump at the water. Cogs were cut from hard fruitwood or hornbeam and regularly replaced; a miller could tell a mill\'s health by its sound.',
      facts: [['Gearing', 'Wood on wood'], ['Cog wood', 'Hornbeam / fruitwood'], ['Output', 'Scoop wheel or screw']],
      x: ox(-0.9), y: 2.8, z: oz(-1.5),
    },
    {
      id: 'i-living', zone: 'in', reach: 4.5, kicker: 'Everyday life', title: 'A miller\'s home',
      text: 'Millers were on call day and night, so whole families lived inside the mill. The ground floor held the table, stove and a box bed set into the wall; children slept up in the loft among the grain sacks. When the wind blew, the machinery shook the whole house – and when the wind dropped, the family waited.',
      facts: [['Household', 'Often a large family'], ['Heat', 'Small iron stove'], ['Bed', 'Box bed (bedstee)']],
      x: ox(-1.35), y: 1.25, z: oz(1.0),
    },
    {
      id: 'i-ladder', zone: 'in', action: 'ladder', reach: 3.4, kicker: 'Climb', title: 'Ladder to the loft',
      text: '', facts: [], x: ox(1.85), y: 1.5, z: oz(1.7),
    },
    {
      id: 'i-ladder2', zone: 'in', action: 'ladder', reach: 3.6, kicker: 'Climb', title: 'Climb down',
      text: '', facts: [], x: ox(1.85), y: FLOOR1_Y + 1.5, z: oz(0.9),
    },
    {
      id: 'i-loft', zone: 'in', reach: 5.5, kicker: 'Upper floor', title: 'The grain loft',
      text: 'Up here, the upright shaft passes through the upper wheel. Sacks and barrels were stored beneath the cap, and tiny windows let the miller watch the sails and the weather. From this level a miller could also reach the cap on the outside to reef the sails or turn the mill into the wind.',
      facts: [['Wind watch', 'Small loft windows'], ['Storage', 'Grain, tools, rope']],
      x: ox(-1.5), y: FLOOR1_Y + 1.1, z: oz(1.3),
    },
  ]

  return {
    group: g,
    c0,
    c1,
    hotspots: spots,
    radius: 2.72,
    spawn: { x: ox(2.0), z: oz(0), yaw: -Math.PI / 2 },
    ladderUp: { x: ox(0.95), z: oz(2.0) },
    ladderDown: { x: ox(1.2), z: oz(1.3) },
    lights,
  }
}

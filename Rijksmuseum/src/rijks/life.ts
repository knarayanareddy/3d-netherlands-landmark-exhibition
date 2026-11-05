import * as THREE from 'three'
import { PI, rng } from './geo'
import type { World } from './world'

/* merged, vertex-coloured geometry helpers ------------------------------------------------ */
type Part = { g: THREE.BufferGeometry; c: THREE.Color }
function merged(parts: Part[]): THREE.BufferGeometry {
  const gs: THREE.BufferGeometry[] = []
  for (const p of parts) {
    const g = p.g.index ? p.g.toNonIndexed() : p.g.clone()
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k)
    const n = g.attributes.position.count
    const col = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) { col[i * 3] = p.c.r; col[i * 3 + 1] = p.c.g; col[i * 3 + 2] = p.c.b }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3))
    gs.push(g)
  }
  return mergeGeos(gs)
}
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
function mergeGeos(gs: THREE.BufferGeometry[]) { return mergeGeometries(gs, false)! }

function tube(a: THREE.Vector3, b: THREE.Vector3, r0: number, r1 = r0, seg = 8) {
  const len = a.distanceTo(b)
  const g = new THREE.CylinderGeometry(r1, r0, len, seg)
  const dir = b.clone().sub(a).normalize()
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)
  g.applyQuaternion(q)
  const mid = a.clone().add(b).multiplyScalar(0.5)
  g.translate(mid.x, mid.y, mid.z)
  return g
}
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

const SKIN = ['#e8bfa0', '#d9a07c', '#b9805c', '#8a5a3c', '#f0cdb2']
const HAIR = ['#2a1c14', '#4a3222', '#8a6a3a', '#b0b0b0', '#111111', '#a04a22']
const JACKET = ['#264653', '#9b2d30', '#e9c46a', '#3a5a40', '#6d597a', '#d9d9d9', '#1d3557', '#b56576', '#355070', '#e07a5f', '#4a4e69', '#f4a261']
const PANTS = ['#1e2630', '#3a3a3a', '#5b4a3a', '#2c3e5a', '#70685e']

function personGeo(r: () => number): THREE.BufferGeometry {
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)]
  const skin = new THREE.Color(pick(SKIN)), hair = new THREE.Color(pick(HAIR)), jac = new THREE.Color(pick(JACKET)), pan = new THREE.Color(pick(PANTS))
  const parts: Part[] = []
  for (const s of [-1, 1]) {
    parts.push({ g: tube(V(s * 0.09, 0.05, 0), V(s * 0.09, 0.86, 0), 0.07, 0.085), c: pan })
    parts.push({ g: new THREE.BoxGeometry(0.1, 0.07, 0.22).translate(s * 0.09, 0.035, 0.05), c: new THREE.Color('#161616') })
    parts.push({ g: tube(V(s * 0.23, 1.4, 0), V(s * 0.27, 0.9, 0.03), 0.05, 0.055), c: jac })
    parts.push({ g: new THREE.SphereGeometry(0.05, 8, 6).translate(s * 0.27, 0.86, 0.03), c: skin })
  }
  parts.push({ g: tube(V(0, 0.82, 0), V(0, 1.45, 0), 0.19, 0.2, 10), c: jac })
  parts.push({ g: new THREE.SphereGeometry(0.2, 10, 8).scale(1, 0.55, 0.8).translate(0, 1.45, 0), c: jac })
  parts.push({ g: tube(V(0, 1.45, 0), V(0, 1.55, 0), 0.05), c: skin })
  parts.push({ g: new THREE.SphereGeometry(0.115, 12, 10).scale(1, 1.15, 1).translate(0, 1.63, 0), c: skin })
  parts.push({ g: new THREE.SphereGeometry(0.12, 12, 8, 0, PI * 2, 0, PI * 0.55).scale(1.02, 1.1, 1.05).translate(0, 1.65, -0.01), c: hair })
  return merged(parts)
}

function riderGeo(r: () => number): THREE.BufferGeometry {
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)]
  const skin = new THREE.Color(pick(SKIN)), hair = new THREE.Color(pick(HAIR)), jac = new THREE.Color(pick(JACKET)), pan = new THREE.Color(pick(PANTS))
  const parts: Part[] = []
  const hip = V(0, 0.98, -0.18), sh = V(0, 1.5, 0.12)
  for (const s of [-1, 1]) {
    parts.push({ g: tube(V(s * 0.1, 0.98, -0.18), V(s * 0.12, 0.62, 0.12), 0.08, 0.065), c: pan })
    parts.push({ g: tube(V(s * 0.12, 0.62, 0.12), V(s * 0.12, 0.3, 0.02), 0.06, 0.05), c: pan })
    parts.push({ g: tube(V(s * 0.2, 1.45, 0.12), V(s * 0.27, 1.02, 0.42), 0.05, 0.045), c: jac })
  }
  parts.push({ g: tube(hip, sh, 0.18, 0.19, 10), c: jac })
  parts.push({ g: new THREE.SphereGeometry(0.115, 12, 10).translate(0, 1.7, 0.2), c: skin })
  parts.push({ g: new THREE.SphereGeometry(0.12, 12, 8, 0, PI * 2, 0, PI * 0.55).translate(0, 1.72, 0.19), c: hair })
  return merged(parts)
}

function bikeGeo(): THREE.BufferGeometry {
  const dark = new THREE.Color('#161616'), white = new THREE.Color('#ffffff'), metal = new THREE.Color('#9a9a9a')
  const parts: Part[] = []
  for (const z of [-0.55, 0.55]) {
    const t = new THREE.TorusGeometry(0.34, 0.028, 6, 24)
    t.rotateY(PI / 2)
    t.translate(0, 0.35, z)
    parts.push({ g: t, c: dark })
    parts.push({ g: new THREE.CylinderGeometry(0.03, 0.03, 0.1, 6).rotateZ(PI / 2).translate(0, 0.35, z), c: metal })
  }
  const bb = V(0, 0.3, -0.05)
  const seat = V(0, 0.98, -0.24), head = V(0, 0.95, 0.4)
  parts.push({ g: tube(V(0, 0.35, -0.55), bb, 0.02), c: white })
  parts.push({ g: tube(bb, head, 0.026), c: white })
  parts.push({ g: tube(bb, seat, 0.022), c: white })
  parts.push({ g: tube(seat, head, 0.022), c: white })
  parts.push({ g: tube(V(0, 0.35, -0.55), seat, 0.018), c: white })
  parts.push({ g: tube(head, V(0, 0.35, 0.55), 0.022), c: white })
  parts.push({ g: tube(V(0, 0.95, 0.4), V(0, 1.1, 0.36), 0.02), c: metal })
  parts.push({ g: tube(V(-0.3, 1.1, 0.36), V(0.3, 1.1, 0.36), 0.016), c: metal })
  parts.push({ g: new THREE.BoxGeometry(0.15, 0.05, 0.27).translate(0, 1.0, -0.26), c: dark })
  parts.push({ g: new THREE.BoxGeometry(0.34, 0.18, 0.3).translate(0, 1.0, 0.62), c: new THREE.Color('#3b2f24') })
  parts.push({ g: tube(V(-0.12, 0.3, -0.05), V(0.12, 0.3, -0.05), 0.014), c: metal })
  return merged(parts)
}

export interface LifeApi { update: (t: number, dt: number) => void }

export function buildLife(w: World) {
  const root = w.group
  const r = rng(2024)
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 })
  const bikeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.3 })

  /* ---- pedestrians */
  interface Walker { a: THREE.Vector3; b: THREE.Vector3; speed: number; phase: number; variant: number; scale: number; y: number; idleYaw?: number }
  const NV = 9
  const variants = Array.from({ length: NV }, () => personGeo(r))
  const walkers: Walker[][] = Array.from({ length: NV }, () => [])
  const add = (ax: number, y: number, az: number, bx: number, bz: number, speed: number, idleYaw?: number) => {
    const v = Math.floor(r() * NV)
    walkers[v].push({ a: V(ax, y, az), b: V(bx, y, bz), speed, phase: r() * 20, variant: v, scale: 0.92 + r() * 0.16, y, idleYaw })
  }
  // Museumplein: promenade strollers
  for (let i = 0; i < 26; i++) {
    const x = -8 + r() * 16, z0 = 70 + r() * 120
    const len = 20 + r() * 50
    add(x, 0, z0, x + (r() - 0.5) * 6, z0 + len, 0.8 + r() * 0.7)
  }
  // lawn groups
  for (let i = 0; i < 12; i++) {
    const x = (r() < 0.5 ? -1 : 1) * (22 + r() * 70), z = 70 + r() * 110
    if (x > -30 && x < 30 && z > 92 && z < 136) continue
    add(x, 0, z, x + (r() - 0.5) * 8, z + (r() - 0.5) * 8, 0.1, r() * PI * 2)
  }
  // by the pond
  for (let i = 0; i < 8; i++) add(-27 + i * 7.5, 0, 96.5, -27 + i * 7.5, 96.4, 0.1, PI)
  // front of the museum
  for (let i = 0; i < 18; i++) {
    const x = -55 + r() * 110
    if (Math.abs(x) < 6) continue
    add(x, 0, 62 + r() * 4, x + (r() < 0.5 ? -1 : 1) * (6 + r() * 25), 62 + r() * 4, 0.9 + r() * 0.5)
  }
  // passage pedestrians
  for (let i = 0; i < 8; i++) {
    const s = i % 2 ? 1 : -1
    add(s * 4.7, 0, -45, s * 4.7, 45, 0.9 + r() * 0.5)
  }
  // atria
  for (const s of [-1, 1]) {
    for (let i = 0; i < 10; i++) {
      const x = 14 + r() * 22, z = -14 + r() * 28
      if (Math.abs(x - 24) < 3 && Math.abs(z + 12) < 2) continue
      add(s * x, 0, z, s * (x + (r() - 0.5) * 8), z + (r() - 0.5) * 8, r() < 0.5 ? 0.1 : 0.7, r() * PI * 2)
    }
    for (let i = 0; i < 4; i++) add(s * (14 + i * 6), 0, -10.4, s * (14 + i * 6), -10.5, 0.05, 0) // queueing at the desk
    // mezzanine
    add(s * 10, 8, -10, s * 10, 10, 0.7)
    add(s * 24, 8, 15, s * 36, 15, 0.8)
  }
  // Gallery of Honour: visitors looking at the paintings, a few strolling
  for (const [x, z, yaw] of [[4.6, -26.5, -PI / 2], [4.4, -26, -PI / 2], [4.5, -16, -PI / 2], [-4.6, -16.4, PI / 2], [-4.4, -26.5, PI / 2], [4.4, 9.5, -PI / 2], [-4.5, 9.6, PI / 2]] as [number, number, number][]) {
    add(x, 8, z, x, z + 0.01, 0.01, yaw)
  }
  for (const [x, z] of [[-1, -33], [1.2, -32.5], [0.2, -32], [-2.2, -32.8]]) add(x, 8, z, x, z + 0.01, 0.01, 0)
  add(-2, 8, -10, -2, 10, 0.7)
  add(2, 8, 12, 2, -20, 0.6)

  const people: { mesh: THREE.InstancedMesh; list: Walker[] }[] = []
  const dummy = new THREE.Object3D()
  for (let v = 0; v < NV; v++) {
    if (!walkers[v].length) continue
    const mesh = new THREE.InstancedMesh(variants[v], mat, walkers[v].length)
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.frustumCulled = false
    root.add(mesh)
    people.push({ mesh, list: walkers[v] })
  }

  /* ---- bikes */
  const bg = bikeGeo()
  const parked: { x: number; z: number; ry: number; c: THREE.Color }[] = []
  const frameCols = ['#c9c9c9', '#1b1b1b', '#b32428', '#2a4a7a', '#4b6b3a', '#d6b441', '#8a8a8a', '#6a3a2a']
  for (let i = 0; i < 12; i++) for (let row = 0; row < 2; row++) {
    const x = 9 + i * 1.0 + (row ? 0.5 : 0)
    for (const s of [-1, 1]) parked.push({ x: s * x, z: 54.9 + row * 0.8 - 0.3 + (r() - 0.5) * 0.3, ry: PI / 2 + (r() - 0.5) * 0.2 + (row ? PI : 0), c: new THREE.Color(frameCols[Math.floor(r() * frameCols.length)]) })
  }
  const pm = new THREE.InstancedMesh(bg, bikeMat, parked.length)
  parked.forEach((p, i) => {
    dummy.position.set(p.x, 0, p.z)
    dummy.rotation.set(0, p.ry, 0)
    dummy.rotation.z = 0
    dummy.updateMatrix()
    pm.setMatrixAt(i, dummy.matrix)
    pm.setColorAt(i, p.c)
  })
  pm.castShadow = true
  pm.frustumCulled = false
  root.add(pm)

  // cyclists moving through the passage
  interface Cyc { lane: number; z: number; speed: number; dir: number; c: THREE.Color; v: number }
  const cyc: Cyc[] = []
  for (let i = 0; i < 9; i++) {
    const dir = i % 2 ? 1 : -1
    cyc.push({ lane: dir * 1.7 + (r() - 0.5) * 0.5, z: -60 + r() * 120, speed: 3.2 + r() * 2.2, dir, c: new THREE.Color(frameCols[Math.floor(r() * frameCols.length)]), v: i % 4 })
  }
  const riderVariants = Array.from({ length: 4 }, () => riderGeo(r))
  const cm = new THREE.InstancedMesh(bg, bikeMat, cyc.length)
  cm.castShadow = true
  cm.frustumCulled = false
  root.add(cm)
  cyc.forEach((c, i) => cm.setColorAt(i, c.c))
  const riders = riderVariants.map((g) => {
    const list = cyc.filter((c, _i) => c.v === riderVariants.indexOf(g))
    const mesh = new THREE.InstancedMesh(g, mat, Math.max(1, list.length))
    mesh.castShadow = true
    mesh.frustumCulled = false
    mesh.count = list.length
    root.add(mesh)
    return { mesh, list }
  })

  w.updaters.push((t, dt) => {
    for (const { mesh, list } of people) {
      list.forEach((p, i) => {
        const len = p.a.distanceTo(p.b)
        let yaw = p.idleYaw ?? 0
        const pos = p.a.clone()
        let bob = 0
        if (p.speed > 0.2 && len > 0.5) {
          const T = len / p.speed
          const ph = ((t + p.phase) % (2 * T)) / T
          const u = ph < 1 ? ph : 2 - ph
          pos.lerpVectors(p.a, p.b, u)
          const dir = p.b.clone().sub(p.a)
          yaw = Math.atan2(dir.x, dir.z) + (ph < 1 ? 0 : PI)
          bob = Math.abs(Math.sin(t * 7.5 + p.phase)) * 0.035
        } else {
          bob = Math.sin(t * 1.3 + p.phase) * 0.004
        }
        dummy.position.set(pos.x, p.y + bob, pos.z)
        dummy.rotation.set(0, yaw, Math.sin(t * 3.7 + p.phase) * (p.speed > 0.2 ? 0.02 : 0))
        dummy.scale.setScalar(p.scale)
        dummy.updateMatrix()
        mesh.setMatrixAt(i, dummy.matrix)
      })
      mesh.instanceMatrix.needsUpdate = true
    }
    cyc.forEach((c, i) => {
      c.z += c.dir * c.speed * dt
      if (c.z > 62) c.z = -62
      if (c.z < -62) c.z = 62
      dummy.position.set(c.lane, 0, c.z)
      dummy.rotation.set(0, c.dir > 0 ? 0 : PI, 0)
      dummy.scale.setScalar(1)
      dummy.updateMatrix()
      cm.setMatrixAt(i, dummy.matrix)
    })
    cm.instanceMatrix.needsUpdate = true
    for (const { mesh, list } of riders) {
      list.forEach((c, i) => {
        dummy.position.set(c.lane, 0.02 + Math.abs(Math.sin(t * 5 + i)) * 0.01, c.z)
        dummy.rotation.set(0, c.dir > 0 ? 0 : PI, 0)
        dummy.scale.setScalar(1)
        dummy.updateMatrix()
        mesh.setMatrixAt(i, dummy.matrix)
      })
      mesh.instanceMatrix.needsUpdate = true
    }
  })
}

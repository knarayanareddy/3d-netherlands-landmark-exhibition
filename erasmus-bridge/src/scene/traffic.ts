import * as THREE from 'three'
import { X_END, X_START, deckY } from './config'
import { boxGeo, merge, rng, rod, v3 } from './geo'

export interface Traffic {
  group: THREE.Group
  update(t: number): void
  setNight(n: number): void
}

const L = X_END - X_START
const wrapX = (p: number) => ((p % L) + L) % L
const edgeScale = (x: number) => {
  const d = Math.min(x - X_START, X_END - x)
  return Math.max(0.001, Math.min(1, d / 12))
}
const Y = v3(0, 1, 0)
const Z = v3(0, 0, 1)
const qa = new THREE.Quaternion()
const qb = new THREE.Quaternion()
const mat = new THREE.Matrix4()
const P = new THREE.Vector3()
const S = new THREE.Vector3()

function pose(x: number, z: number, dir: number, lift = 0, scale = 1, sx = 1, sy = 1) {
  const slope = (deckY(x + 0.5) - deckY(x - 0.5)) / 1.0
  qa.setFromAxisAngle(Y, dir > 0 ? 0 : Math.PI)
  qb.setFromAxisAngle(Z, Math.atan(slope * dir))
  qa.multiply(qb)
  const k = scale
  P.set(x, deckY(x) + lift, z)
  S.set(k * sx, k * sy, k)
  return mat.compose(P, qa, S)
}

function extrudeSide(pts: [number, number][], width: number, bevel = 0.1) {
  const sh = new THREE.Shape()
  pts.forEach(([x, y], i) => (i ? sh.lineTo(x, y) : sh.moveTo(x, y)))
  const g = new THREE.ExtrudeGeometry(sh, { depth: width - bevel * 2, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 2 })
  g.translate(0, 0, -(width - bevel * 2) / 2)
  return g
}

function buildCarGeos() {
  const body = extrudeSide([[-2.1, 0.32], [2.05, 0.32], [2.1, 0.55], [2.05, 0.78], [1.3, 0.88], [-1.85, 0.88], [-2.1, 0.8]], 1.78, 0.1)
  const roof = boxGeo(1.46, 0.05, 1.5, -0.15, 1.375, 0)
  roof.rotateZ(0)
  const bodyAll = merge([body, roof])
  const glass = extrudeSide([[1.25, 0.88], [0.62, 1.34], [-0.9, 1.36], [-1.78, 0.88]], 1.52, 0.03)
  const wheels: THREE.BufferGeometry[] = []
  for (const x of [-1.28, 1.3]) for (const z of [-0.78, 0.78]) {
    const w = new THREE.CylinderGeometry(0.33, 0.33, 0.22, 16)
    w.rotateX(Math.PI / 2)
    w.translate(x, 0.33, z)
    wheels.push(w)
  }
  const lights = new THREE.BufferGeometry()
  const parts: THREE.BufferGeometry[] = []
  const cols: number[] = []
  const addL = (x: number, z: number, c: [number, number, number]) => {
    const b = boxGeo(0.06, 0.1, 0.34, x, 0.68, z)
    parts.push(b)
    for (let i = 0; i < b.attributes.position.count; i++) cols.push(...c)
  }
  for (const z of [-0.6, 0.6]) {
    addL(2.1, z, [1, 0.97, 0.85])
    addL(-2.12, z, [1, 0.04, 0.02])
  }
  const lm = merge(parts)
  lights.copy(lm)
  lights.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3))
  return { body: bodyAll, glass, wheels: merge(wheels), lights }
}

function buildTram() {
  const g = new THREE.Group()
  const white = new THREE.MeshStandardMaterial({ color: '#eceff0', roughness: 0.35, metalness: 0.1 })
  const dark = new THREE.MeshPhysicalMaterial({ color: '#0b1118', roughness: 0.06, clearcoat: 1 })
  const blue = new THREE.MeshStandardMaterial({ color: '#1d4a7a', roughness: 0.45 })
  const grey = new THREE.MeshStandardMaterial({ color: '#4b4f55', roughness: 0.8 })
  const lamp = new THREE.MeshBasicMaterial({ color: '#ffffff' })
  const secs = [-10.4, 0, 10.4]
  for (const x of secs) {
    const b = new THREE.Mesh(boxGeo(10.0, 2.6, 2.4, x, 1.65, 0), white)
    b.castShadow = true
    g.add(b)
    const band = new THREE.Mesh(boxGeo(9.4, 1.0, 2.42, x, 2.05, 0), dark)
    g.add(band)
    const st = new THREE.Mesh(boxGeo(10.02, 0.22, 2.42, x, 0.95, 0), blue)
    g.add(st)
    const roof = new THREE.Mesh(boxGeo(8.6, 0.3, 1.9, x, 3.1, 0), grey)
    g.add(roof)
  }
  for (const x of [-5.2, 5.2]) g.add(new THREE.Mesh(boxGeo(0.5, 2.3, 2.0, x, 1.7, 0), new THREE.MeshStandardMaterial({ color: '#15181b', roughness: 0.9 })))
  for (const s of [-1, 1]) {
    const nose = new THREE.Mesh(boxGeo(1.2, 2.5, 2.2, s * 16.1, 1.6, 0), white)
    g.add(nose)
    const ws = new THREE.Mesh(boxGeo(0.12, 1.1, 2.0, s * 16.72, 2.15, 0), dark)
    g.add(ws)
    for (const z of [-0.8, 0.8]) g.add(new THREE.Mesh(boxGeo(0.06, 0.16, 0.3, s * 16.72, 0.95, z), lamp))
  }
  const bogie = new THREE.Mesh(boxGeo(30, 0.3, 1.9, 0, 0.35, 0), grey)
  g.add(bogie)
  return g
}

function buildPerson() {
  const cloth = merge([boxGeo(0.44, 0.62, 0.26, 0, 1.2, 0), boxGeo(0.1, 0.55, 0.12, 0, 1.2, 0.3), boxGeo(0.1, 0.55, 0.12, 0, 1.2, -0.3)])
  const pants = merge([boxGeo(0.17, 0.85, 0.19, 0, 0.45, 0.1), boxGeo(0.17, 0.85, 0.19, 0, 0.45, -0.1)])
  const head = new THREE.SphereGeometry(0.115, 10, 8)
  head.translate(0, 1.64, 0)
  return { cloth, pants, head }
}

function buildCyclist() {
  const tyres: THREE.BufferGeometry[] = []
  for (const x of [-0.55, 0.55]) {
    const t = new THREE.TorusGeometry(0.34, 0.025, 6, 20)
    t.translate(x, 0.36, 0)
    tyres.push(t)
  }
  const frame = [
    rod(v3(-0.55, 0.36, 0), v3(0.0, 0.42, 0), 0.02, 5), rod(v3(0.0, 0.42, 0), v3(0.35, 0.95, 0), 0.02, 5),
    rod(v3(0.35, 0.95, 0), v3(0.55, 0.36, 0), 0.02, 5), rod(v3(0.0, 0.42, 0), v3(0.18, 0.95, 0), 0.02, 5),
    rod(v3(0.3, 1.02, -0.28), v3(0.3, 1.02, 0.28), 0.015, 5),
  ]
  const bike = merge([...tyres, ...frame, boxGeo(0.3, 0.05, 0.14, 0.14, 1.0, 0)])
  const cloth = merge([boxGeo(0.28, 0.55, 0.3, 0.12, 1.45, 0), rod(v3(0.15, 1.6, 0.14), v3(0.35, 1.1, 0.14), 0.045, 6), rod(v3(0.15, 1.6, -0.14), v3(0.35, 1.1, -0.14), 0.045, 6),
    rod(v3(0.05, 1.2, 0.1), v3(0.12, 0.75, 0.12), 0.07, 6), rod(v3(0.05, 1.2, -0.1), v3(0.12, 0.75, -0.12), 0.07, 6)])
  const head = new THREE.SphereGeometry(0.11, 10, 8)
  head.translate(0.22, 1.9, 0)
  return { bike, cloth, head }
}

function buildBarge(length: number, hullColor: string, stripe: string) {
  const g = new THREE.Group()
  const w = 11.4
  const sh = new THREE.Shape()
  const hl = length / 2
  sh.moveTo(-w / 2, -hl)
  sh.lineTo(w / 2, -hl)
  sh.lineTo(w / 2, hl - 9)
  sh.lineTo(w / 2 - 2.2, hl - 1.5)
  sh.lineTo(0, hl + 2)
  sh.lineTo(-w / 2 + 2.2, hl - 1.5)
  sh.lineTo(-w / 2, hl - 9)
  sh.closePath()
  const hullG = new THREE.ExtrudeGeometry(sh, { depth: 4.2, bevelEnabled: false })
  hullG.rotateX(-Math.PI / 2)
  hullG.translate(0, -2.6, 0)
  const hull = new THREE.Mesh(hullG, new THREE.MeshStandardMaterial({ color: hullColor, roughness: 0.55, metalness: 0.2 }))
  hull.castShadow = hull.receiveShadow = true
  g.add(hull)
  const st = new THREE.Mesh(boxGeo(w + 0.05, 0.5, length - 6, 0, 0.5, -3), new THREE.MeshStandardMaterial({ color: stripe, roughness: 0.5 }))
  g.add(st)
  const hold = new THREE.Mesh(boxGeo(w - 1.6, 0.6, length - 30, 0, 1.65, -4), new THREE.MeshStandardMaterial({ color: '#2b2f33', roughness: 0.8 }))
  g.add(hold)
  // container stacks
  const cGeo = new THREE.BoxGeometry(2.4, 2.6, 6.1)
  const cMesh = new THREE.InstancedMesh(cGeo, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.55, metalness: 0.2 }), 120)
  const pal = ['#c0392b', '#2457a6', '#d6a21e', '#2f8a5a', '#8e9aa3', '#e8e6df', '#6b3f8c', '#d4651e']
  const rr = rng(Math.floor(length))
  const rows = Math.min(9, Math.floor((length - 34) / 6.4))
  let n = 0
  for (let row = 0; row < rows; row++) for (let col = 0; col < 3; col++) {
    const stack = 1 + ((rr() * 3) | 0)
    for (let s = 0; s < stack && n < 120; s++) {
      mat.makeTranslation(-2.5 + col * 2.5, 3.2 + s * 2.6, -4 + (row - (rows - 1) / 2) * 6.4)
      cMesh.setMatrixAt(n, mat)
      cMesh.setColorAt(n, new THREE.Color(pal[(rr() * pal.length) | 0]))
      n++
    }
  }
  cMesh.count = n
  cMesh.castShadow = true
  g.add(cMesh)
  // wheelhouse at the stern (+z)
  const gl = () => new THREE.MeshPhysicalMaterial({ color: '#0b1118', roughness: 0.06, clearcoat: 1 })
  const wh = new THREE.Mesh(boxGeo(8, 3.2, 8, 0, 2.7, hl - 6), new THREE.MeshStandardMaterial({ color: '#eceeef', roughness: 0.5 }))
  wh.castShadow = true
  g.add(wh)
  g.add(new THREE.Mesh(boxGeo(8.05, 1.0, 5.2, 0, 3.2, hl - 6), gl()))
  g.add(new THREE.Mesh(boxGeo(4.6, 2.6, 4.6, 0, 5.2, hl - 6), wh.material as THREE.Material))
  g.add(new THREE.Mesh(boxGeo(4.65, 1.0, 3.6, 0, 5.4, hl - 6), gl()))
  return g
}

function buildTourBoat() {
  const g = new THREE.Group()
  const white = new THREE.MeshStandardMaterial({ color: '#f1f3f4', roughness: 0.4 })
  const dark = new THREE.MeshPhysicalMaterial({ color: '#0b1118', roughness: 0.05, clearcoat: 1 })
  const sh = new THREE.Shape()
  sh.moveTo(-3.6, -16)
  sh.lineTo(3.6, -16)
  sh.lineTo(3.6, 10)
  sh.lineTo(0, 17)
  sh.lineTo(-3.6, 10)
  sh.closePath()
  const hg = new THREE.ExtrudeGeometry(sh, { depth: 2.6, bevelEnabled: false })
  hg.rotateX(-Math.PI / 2)
  hg.translate(0, -1.2, 0)
  const hull = new THREE.Mesh(hg, new THREE.MeshStandardMaterial({ color: '#1b3a5c', roughness: 0.5 }))
  hull.castShadow = true
  g.add(hull)
  g.add(new THREE.Mesh(boxGeo(6.4, 2.3, 24, 0, 2.55, -2), white))
  g.add(new THREE.Mesh(boxGeo(6.5, 1.1, 23, 0, 2.7, -2), dark))
  const top = new THREE.Mesh(boxGeo(6.0, 0.25, 22, 0, 3.8, -2), white)
  top.castShadow = true
  g.add(top)
  return g
}

export function buildTraffic(): Traffic {
  const group = new THREE.Group()
  group.name = 'Traffic'
  const r = rng(99)

  // ---------------------------------------------------------------- cars
  const cg = buildCarGeos()
  const N = 56
  const bodyM = new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.28, metalness: 0.5, clearcoat: 1, clearcoatRoughness: 0.08 })
  const glassM = new THREE.MeshPhysicalMaterial({ color: '#10181f', roughness: 0.05, metalness: 0.0, clearcoat: 1 })
  const tyreM = new THREE.MeshStandardMaterial({ color: '#141516', roughness: 0.9 })
  const lightM = new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(1, 1, 1) })
  const body = new THREE.InstancedMesh(cg.body, bodyM, N)
  const glass = new THREE.InstancedMesh(cg.glass, glassM, N)
  const wheels = new THREE.InstancedMesh(cg.wheels, tyreM, N)
  const lights = new THREE.InstancedMesh(cg.lights, lightM, N)
  const paints = ['#d9dcdf', '#1f2328', '#9a1b1b', '#25446b', '#6d7378', '#f0f0ec', '#2d5a3d', '#c8a24a', '#b9bec2', '#101214']
  const cars: { lane: number; dir: number; off: number; speed: number; sx: number; sy: number }[] = []
  const lanes = [4.25, 7.35, -4.25, -7.35]
  for (let i = 0; i < N; i++) {
    const li = i % 4
    const lane = lanes[li]
    cars.push({ lane, dir: Math.sign(lane), off: ((Math.floor(i / 4) + r() * 0.5) / (N / 4)) * L, speed: 10 + (li % 2) * 2.5, sx: 0.92 + r() * 0.2, sy: 0.95 + r() * 0.12 })
    body.setColorAt(i, new THREE.Color(paints[(r() * paints.length) | 0]))
  }
  for (const m of [body, glass, wheels, lights]) {
    m.castShadow = m !== lights
    m.receiveShadow = true
    m.frustumCulled = false
    group.add(m)
  }

  // ---------------------------------------------------------------- trams
  const trams: { g: THREE.Group; dir: number; off: number }[] = []
  const baseTram = buildTram()
  for (let i = 0; i < 4; i++) {
    const t = i === 0 ? baseTram : baseTram.clone(true)
    t.traverse((o) => ((o as THREE.Mesh).isMesh && ((o as THREE.Mesh).castShadow = true)))
    trams.push({ g: t, dir: i % 2 ? -1 : 1, off: (i < 2 ? 0.15 : 0.62) * L + (i % 2) * 120 })
    group.add(t)
  }

  // ---------------------------------------------------------------- cyclists + pedestrians
  const cy = buildCyclist()
  const NC = 18
  const cBike = new THREE.InstancedMesh(cy.bike, new THREE.MeshStandardMaterial({ color: '#25282b', roughness: 0.4, metalness: 0.6 }), NC)
  const cCloth = new THREE.InstancedMesh(cy.cloth, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.85 }), NC)
  const cHead = new THREE.InstancedMesh(cy.head, new THREE.MeshStandardMaterial({ color: '#d9a98a', roughness: 0.7 }), NC)
  const cyc: { z: number; dir: number; off: number; speed: number }[] = []
  const jackets = ['#c0392b', '#2457a6', '#e1a31b', '#2f8a5a', '#222', '#ececec', '#7b3f98', '#d4651e']
  for (let i = 0; i < NC; i++) {
    const dir = i % 2 ? -1 : 1
    cyc.push({ z: dir * (11.5 + (i % 3 === 0 ? 0.7 : i % 3 === 1 ? -0.5 : 0.1)), dir, off: r() * L, speed: 3.6 + r() * 2.6 })
    cCloth.setColorAt(i, new THREE.Color(jackets[(r() * jackets.length) | 0]))
  }
  const pp = buildPerson()
  const NP = 34
  const pCloth = new THREE.InstancedMesh(pp.cloth, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.85 }), NP)
  const pPants = new THREE.InstancedMesh(pp.pants, new THREE.MeshStandardMaterial({ color: '#2b3340', roughness: 0.9 }), NP)
  const pHead = new THREE.InstancedMesh(pp.head, new THREE.MeshStandardMaterial({ color: '#d2a07f', roughness: 0.7 }), NP)
  const peds: { z: number; dir: number; off: number; speed: number; ph: number }[] = []
  for (let i = 0; i < NP; i++) {
    const dir = i % 2 ? -1 : 1
    peds.push({ z: dir * (14.3 + r() * 1.6), dir, off: r() * L, speed: 1.1 + r() * 0.5, ph: r() * 6 })
    pCloth.setColorAt(i, new THREE.Color(jackets[(r() * jackets.length) | 0]).multiplyScalar(0.9))
  }
  for (const m of [cBike, cCloth, cHead, pCloth, pPants, pHead]) {
    m.castShadow = true
    m.frustumCulled = false
    group.add(m)
  }

  // ---------------------------------------------------------------- vessels
  const boats: { g: THREE.Group; x: number; z: number; dir: number; speed: number; ph: number }[] = []
  const addBoat = (g: THREE.Group, x: number, z: number, dir: number, speed: number) => {
    group.add(g)
    boats.push({ g, x, z, dir, speed, ph: r() * 6 })
  }
  addBoat(buildBarge(110, '#1d2227', '#b3321f'), 62, 520, -1, 4.2)
  addBoat(buildBarge(86, '#26302f', '#2457a6'), 215, -380, 1, 3.4)
  addBoat(buildBarge(135, '#202428', '#d6a21e'), 172, 1200, -1, 5.0)
  addBoat(buildTourBoat(), 120, -140, 1, 3.0)
  addBoat(buildTourBoat(), 238, 380, -1, 2.4)

  const update = (t: number) => {
    // cars
    for (let i = 0; i < N; i++) {
      const c = cars[i]
      const p = wrapX(c.off + c.dir * c.speed * t)
      const x = X_START + p
      const m = pose(x, c.lane, c.dir, 0.0, edgeScale(x), c.sx, c.sy)
      body.setMatrixAt(i, m)
      glass.setMatrixAt(i, m)
      wheels.setMatrixAt(i, m)
      lights.setMatrixAt(i, m)
    }
    for (const m of [body, glass, wheels, lights]) m.instanceMatrix.needsUpdate = true
    if (body.instanceColor) body.instanceColor.needsUpdate = true
    // trams
    for (const tr of trams) {
      const x = X_START + wrapX(tr.off + tr.dir * 9.5 * t)
      const m = pose(x, tr.dir * 1.35, tr.dir, 0.02, 1)
      tr.g.position.setFromMatrixPosition(m)
      tr.g.quaternion.setFromRotationMatrix(m)
      tr.g.visible = x > X_START + 20 && x < X_END - 20
    }
    // cyclists
    for (let i = 0; i < NC; i++) {
      const c = cyc[i]
      const x = X_START + wrapX(c.off + c.dir * c.speed * t)
      const m = pose(x, c.z, c.dir, 0.0, edgeScale(x))
      cBike.setMatrixAt(i, m)
      cCloth.setMatrixAt(i, m)
      cHead.setMatrixAt(i, m)
    }
    // pedestrians
    for (let i = 0; i < NP; i++) {
      const c = peds[i]
      const x = X_START + wrapX(c.off + c.dir * c.speed * t)
      const bob = Math.abs(Math.sin(t * 5.2 * (c.speed / 1.3) + c.ph)) * 0.035
      const m = pose(x, c.z + Math.sin(t * 0.9 + c.ph) * 0.15, c.dir, bob, edgeScale(x))
      pCloth.setMatrixAt(i, m)
      pPants.setMatrixAt(i, m)
      pHead.setMatrixAt(i, m)
    }
    for (const m of [cBike, cCloth, cHead, pCloth, pPants, pHead]) m.instanceMatrix.needsUpdate = true
    if (cCloth.instanceColor) cCloth.instanceColor.needsUpdate = true
    if (pCloth.instanceColor) pCloth.instanceColor.needsUpdate = true
    // boats
    for (const b of boats) {
      let z = b.z + b.dir * b.speed * t
      z = ((((z + 1800) % 3600) + 3600) % 3600) - 1800
      b.g.position.set(b.x, 0.25 + Math.sin(t * 0.8 + b.ph) * 0.05, z)
      b.g.rotation.y = b.dir > 0 ? Math.PI : 0
      b.g.rotation.z = Math.sin(t * 0.6 + b.ph) * 0.006
    }
  }

  return {
    group,
    update,
    setNight(n: number) {
      lightM.color.setScalar(0.6 + n * 5)
    },
  }
}

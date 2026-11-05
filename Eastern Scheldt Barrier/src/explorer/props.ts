import * as THREE from 'three'
import { Parts, beamG, boxG, cylG, makeMaterials, weather, type Mats } from './kit'
import { fbm, rng } from './noise'
import { plaqueTexture } from './textures'
import { PLATEAU, ROAD_X0, ROAD_X1, ROAD_Z, roadY, terrainH } from './world'

type MatSet = Mats

function addParts(group: THREE.Group, p: Parts, mats: MatSet, shadow = true) {
  for (const k of p.keys()) {
    const m = new THREE.Mesh(p.merged(k)!, mats[k])
    m.castShadow = shadow && k !== 'lampGlow' && k !== 'redLight' && k !== 'glass'
    m.receiveShadow = true
    group.add(m)
  }
}

/* ------------------------------------------------------------------ cars */
function carGeometries() {
  const body = new Parts(6)
  body.add('b', [boxG(4.3, 0.72, 1.82, 0, 0.62, 0), boxG(2.5, 0.5, 1.78, -0.1, 1.12, 0).translate(0, 0, 0)])
  const glass = new Parts(6)
  glass.add('g', boxG(2.3, 0.46, 1.62, -0.15, 1.17, 0))
  const wheels = new Parts(6)
  for (const x of [-1.35, 1.35]) for (const z of [-0.86, 0.86]) wheels.add('w', new THREE.CylinderGeometry(0.33, 0.33, 0.24, 12).rotateX(Math.PI / 2).translate(x, 0.33, z))
  const head = new Parts(6)
  for (const z of [-0.65, 0.65]) head.add('h', boxG(0.06, 0.14, 0.4, 2.16, 0.72, z))
  const tail = new Parts(6)
  for (const z of [-0.68, 0.68]) tail.add('t', boxG(0.06, 0.14, 0.42, -2.16, 0.74, z))
  return { body: body.merged('b')!, glass: glass.merged('g')!, wheels: wheels.merged('w')!, head: head.merged('h')!, tail: tail.merged('t')! }
}

export class Cars {
  group = new THREE.Group()
  private body: THREE.InstancedMesh
  private glass: THREE.InstancedMesh
  private wheels: THREE.InstancedMesh
  private head: THREE.InstancedMesh
  private tail: THREE.InstancedMesh
  private headMat = new THREE.MeshBasicMaterial({ color: '#ffffff' })
  private tailMat = new THREE.MeshBasicMaterial({ color: '#ff2a1a' })
  private cars: { lane: number; dir: number; off: number; speed: number }[] = []
  private parked: THREE.Object3D[] = []
  private o = new THREE.Object3D()
  private g = carGeometries()
  private qz = new THREE.Quaternion()
  private qy = new THREE.Quaternion()
  private zAxis = new THREE.Vector3(0, 0, 1)
  private yAxis = new THREE.Vector3(0, 1, 0)
  nMoving = 34
  nParked = 26

  constructor() {
    const N = this.nMoving + this.nParked
    const paint = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.32, metalness: 0.55, envMapIntensity: 1.2 })
    const glass = new THREE.MeshStandardMaterial({ color: '#10181e', roughness: 0.08, metalness: 0.9, envMapIntensity: 1.5 })
    const dark = new THREE.MeshStandardMaterial({ color: '#0d0d0f', roughness: 0.9 })
    this.body = new THREE.InstancedMesh(this.g.body, paint, N)
    this.glass = new THREE.InstancedMesh(this.g.glass, glass, N)
    this.wheels = new THREE.InstancedMesh(this.g.wheels, dark, N)
    this.head = new THREE.InstancedMesh(this.g.head, this.headMat, this.nMoving)
    this.tail = new THREE.InstancedMesh(this.g.tail, this.tailMat, this.nMoving)
    const r = rng(12)
    const cols = ['#e8e8e6', '#1b1d20', '#8d9296', '#b5171c', '#24407c', '#d9d9d4', '#3c4045', '#2c5a3a', '#c9c9c4', '#e4a21c']
    const c = new THREE.Color()
    for (let i = 0; i < N; i++) {
      c.set(cols[Math.floor(r() * cols.length)])
      this.body.setColorAt(i, c)
    }
    const L = ROAD_X1 - ROAD_X0 - 30
    for (let i = 0; i < this.nMoving; i++) {
      const dir = i % 2 === 0 ? 1 : -1
      this.cars.push({ lane: ROAD_Z + dir * 1.85, dir, off: (i / this.nMoving) * L + r() * 30, speed: 19 + r() * 9 })
    }
    // parked cars on the visitor-centre car park
    let k = 0
    for (let row = 0; row < 2; row++) {
      for (let i = 0; i < 13; i++) {
        if (r() < 0.2) continue
        const o = new THREE.Object3D()
        o.position.set(-556 + i * 5.1 + r() * 0.3, PLATEAU + 0.15, -62 + row * 9.5 + (r() - 0.5) * 0.3)
        o.rotation.y = Math.PI / 2 + (r() - 0.5) * 0.06
        o.updateMatrix()
        this.parked.push(o)
        k++
      }
    }
    for (const m of [this.body, this.glass, this.wheels, this.head, this.tail]) {
      m.frustumCulled = false
      m.castShadow = m !== this.head && m !== this.tail
      m.receiveShadow = false
      this.group.add(m)
    }
    this.nParked = this.parked.length
    this.parked.forEach((o, i) => {
      for (const m of [this.body, this.glass, this.wheels]) m.setMatrixAt(this.nMoving + i, o.matrix)
    })
    this.body.count = this.glass.count = this.wheels.count = this.nMoving + this.nParked
    this.update(0, 0)
  }

  setNight(n: number) {
    const k = 0.05 + n * 3.0
    this.headMat.color.setRGB(1.0 * k, 0.95 * k, 0.8 * k)
    this.tailMat.color.setRGB(1.0 * (0.25 + n * 1.2), 0.1, 0.06)
  }

  update(t: number, _dt: number) {
    const L = ROAD_X1 - ROAD_X0 - 30
    for (let i = 0; i < this.nMoving; i++) {
      const c = this.cars[i]
      let u = (c.off + c.dir * c.speed * t) % L
      if (u < 0) u += L
      const x = ROAD_X0 + 15 + u
      const y = roadY(x) + 0.03
      const slope = Math.atan2(roadY(x + 1) - roadY(x - 1), 2)
      this.qy.setFromAxisAngle(this.yAxis, c.dir > 0 ? 0 : Math.PI)
      this.qz.setFromAxisAngle(this.zAxis, slope)
      this.o.position.set(x, y, c.lane)
      this.o.quaternion.copy(this.qz).multiply(this.qy)
      this.o.updateMatrix()
      for (const m of [this.body, this.glass, this.wheels, this.head, this.tail]) m.setMatrixAt(i, this.o.matrix)
    }
    for (const m of [this.body, this.glass, this.wheels, this.head, this.tail]) m.instanceMatrix.needsUpdate = true
    if (this.body.instanceColor) this.body.instanceColor.needsUpdate = true
  }
}

/* ------------------------------------------------------------------ wind turbines */
export class Turbine {
  group = new THREE.Group()
  rotor = new THREE.Group()
  light: THREE.Mesh
  constructor(mats: MatSet, x: number, z: number, public phase: number) {
    const ground = terrainH(x, z)
    this.group.position.set(x, ground, z)
    const white = mats.paintWhite
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 2.6, 82, 24), white)
    tower.position.y = 41
    tower.castShadow = true
    const nacelle = new THREE.Mesh(new THREE.BoxGeometry(5, 4.4, 12), white)
    nacelle.position.set(0, 83.5, -1.5)
    nacelle.castShadow = true
    this.group.add(tower, nacelle)
    this.rotor.position.set(0, 83.5, 5.5)
    const hub = new THREE.Mesh(new THREE.SphereGeometry(1.9, 16, 12), white)
    hub.scale.z = 1.4
    this.rotor.add(hub)
    const bladeGeo = new THREE.BoxGeometry(1, 1, 1, 1, 12, 1)
    const p = bladeGeo.attributes.position
    const Lb = 44
    for (let i = 0; i < p.count; i++) {
      const t = (p.getY(i) + 0.5) // 0..1 along blade
      const chord = 3.2 * (1 - t * 0.85) + 0.3
      p.setXYZ(i, p.getX(i) * chord, t * Lb + 1.5, p.getZ(i) * 0.35 * (1 - t * 0.6) + p.getX(i) * t * 0.0 + (1 - t) * 0.0)
    }
    bladeGeo.computeVertexNormals()
    for (let k = 0; k < 3; k++) {
      const b = new THREE.Mesh(bladeGeo, white)
      b.rotation.z = (k * Math.PI * 2) / 3
      b.castShadow = true
      this.rotor.add(b)
    }
    this.group.add(this.rotor)
    this.light = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 6), mats.redLight)
    this.light.position.set(0, 86, -4)
    this.group.add(this.light)
  }
}

/* ------------------------------------------------------------------ gulls */
export class Gulls {
  group = new THREE.Group()
  private birds: { g: THREE.Group; l: THREE.Object3D; r: THREE.Object3D; c: [number, number, number]; rad: number; sp: number; ph: number; fl: number; ry: number }[] = []
  constructor(n: number) {
    const white = new THREE.MeshStandardMaterial({ color: '#f2f2ee', roughness: 0.8 })
    const grey = new THREE.MeshStandardMaterial({ color: '#8a9096', roughness: 0.8 })
    const tipM = new THREE.MeshStandardMaterial({ color: '#16181b', roughness: 0.8 })
    const bodyG = new THREE.SphereGeometry(0.5, 10, 8)
    bodyG.scale(1.0, 0.36, 0.34)
    const headG = new THREE.SphereGeometry(0.17, 8, 6)
    const beakG = new THREE.ConeGeometry(0.05, 0.22, 6).rotateZ(-Math.PI / 2)
    const wingG = new THREE.BoxGeometry(0.34, 0.025, 1.1).translate(0, 0, 0.55)
    const wingTipG = new THREE.BoxGeometry(0.2, 0.027, 0.3).translate(0, 0, 1.2)
    const tailG = new THREE.BoxGeometry(0.3, 0.02, 0.25).translate(-0.55, 0, 0)
    const r = rng(31)
    for (let i = 0; i < n; i++) {
      const g = new THREE.Group()
      const s = 1.7
      g.scale.setScalar(s)
      g.add(new THREE.Mesh(bodyG, white))
      const h = new THREE.Mesh(headG, white)
      h.position.set(0.5, 0.06, 0)
      const b = new THREE.Mesh(beakG, new THREE.MeshStandardMaterial({ color: '#e6b422' }))
      b.position.set(0.7, 0.04, 0)
      g.add(h, b, new THREE.Mesh(tailG, white))
      const mkWing = (side: number) => {
        const piv = new THREE.Object3D()
        const w = new THREE.Mesh(wingG, grey)
        const t = new THREE.Mesh(wingTipG, tipM)
        w.castShadow = true
        piv.add(w, t)
        piv.scale.z = side
        g.add(piv)
        return piv
      }
      const l = mkWing(1)
      const rr = mkWing(-1)
      this.birds.push({
        g, l, r: rr,
        c: [150 + r() * 800, 14 + r() * 38, 30 + r() * 110],
        rad: 25 + r() * 90, sp: (0.12 + r() * 0.18) * (r() < 0.5 ? 1 : -1), ph: r() * 6.28, fl: 4 + r() * 3, ry: r(),
      })
      this.group.add(g)
    }
    // some gulls over the island
    for (let i = 0; i < 4; i++) {
      this.birds[i].c = [-430 + r() * 160, 18 + r() * 14, 40 + r() * 60]
    }
  }
  update(t: number) {
    for (const b of this.birds) {
      const a = b.ph + t * b.sp
      const x = b.c[0] + Math.cos(a) * b.rad
      const z = b.c[2] + Math.sin(a) * b.rad * 0.6
      const y = b.c[1] + Math.sin(t * 0.3 + b.ph * 3) * 3
      b.g.position.set(x, y, z)
      const dx = -Math.sin(a) * b.sp
      const dz = Math.cos(a) * b.sp * 0.6
      b.g.rotation.y = Math.atan2(-dz, dx)
      b.g.rotation.x = -Math.sign(b.sp) * 0.25
      const glide = Math.sin(t * 0.25 + b.ph * 5) > 0.2
      const amp = glide ? 0.12 : 0.55
      const f = Math.sin(t * b.fl + b.ph) * amp
      b.l.rotation.x = f
      b.r.rotation.x = -f
    }
  }
}

/* ------------------------------------------------------------------ ships on the horizon */
export class Ships {
  group = new THREE.Group()
  private ships: { g: THREE.Group; speed: number; x0: number }[] = []
  constructor() {
    const mk = (len: number, z: number, hull: string, deck: string, boxes: boolean, speed: number, x0: number) => {
      const g = new THREE.Group()
      const hm = new THREE.MeshStandardMaterial({ color: hull, roughness: 0.6, metalness: 0.2 })
      const hullG = new THREE.Mesh(new THREE.BoxGeometry(len, 16, 30), hm)
      hullG.position.y = 4
      const bow = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 15, 16, 3).rotateZ(Math.PI / 2).rotateY(Math.PI / 2), hm)
      bow.scale.set(1, 1, 1)
      bow.rotation.set(0, 0, 0)
      const wm = new THREE.MeshStandardMaterial({ color: deck, roughness: 0.7 })
      const house = new THREE.Mesh(new THREE.BoxGeometry(20, 26, 26), wm)
      house.position.set(-len / 2 + 28, 24, 0)
      const funnel = new THREE.Mesh(new THREE.BoxGeometry(7, 9, 9), new THREE.MeshStandardMaterial({ color: '#b33', roughness: 0.6 }))
      funnel.position.set(-len / 2 + 22, 41, 0)
      g.add(hullG, house, funnel)
      if (boxes) {
        const r = rng(Math.floor(len))
        const colors = ['#a8321f', '#2d5f9a', '#d19a1e', '#3b7d4a', '#cfcfcf', '#7a2f6e', '#c5581c']
        for (let i = 0; i < 26; i++) {
          for (let j = 0; j < 5; j++) {
            const h = 1 + Math.floor(r() * 4)
            const m = new THREE.Mesh(new THREE.BoxGeometry(6.2, 2.6 * h, 5.2), new THREE.MeshStandardMaterial({ color: colors[Math.floor(r() * colors.length)], roughness: 0.7 }))
            m.position.set(-len / 2 + 50 + i * 6.4, 12 + 1.3 * h, (j - 2) * 5.4)
            g.add(m)
          }
        }
      }
      g.position.set(x0, 5, z)
      this.group.add(g)
      this.ships.push({ g, speed, x0 })
      void bow
    }
    mk(210, 1500, '#1e2428', '#e9e9e4', true, 4.2, -400)
    mk(150, 2400, '#7c2a22', '#d8d8d2', false, -3.0, 900)
    mk(60, 700, '#2b3f54', '#eee', false, 2.0, 1500)
  }
  update(t: number) {
    for (const s of this.ships) {
      const span = 5200
      let x = s.x0 + s.speed * t
      x = ((((x + 2600) % span) + span) % span) - 2600
      s.g.position.x = x
      s.g.rotation.y = s.speed < 0 ? Math.PI : 0
    }
  }
}

/* ------------------------------------------------------------------ the island set-dressing */
export interface IslandRig {
  group: THREE.Group
  turbines: Turbine[]
  flags: { mesh: THREE.Mesh; base: Float32Array }[]
  lamps: THREE.Vector3[]
}

export function buildIsland(mats: MatSet): IslandRig {
  const group = new THREE.Group()
  const lamps: THREE.Vector3[] = []
  const p = new Parts(6)
  const gy = PLATEAU + 0.1

  /* Visitor centre (Neeltje Jans / Delta Expo inspired): long white hall, glass band, blue accents, observation tower */
  const cx = -520
  const cz = -85
  p.add('paintWhite', [boxG(92, 8, 30, cx, gy + 4, cz), boxG(30, 5, 22, cx - 22, gy + 10.5, cz - 2), boxG(24, 3, 20, cx + 28, gy + 9.5, cz)])
  p.add('darkSteel', [boxG(96, 0.6, 33, cx, gy + 8.3, cz), boxG(34, 0.5, 25, cx - 22, gy + 13.2, cz - 2)])
  p.add('glass', [boxG(80, 3.4, 0.2, cx, gy + 2.6, cz + 15.05), boxG(20, 2.2, 0.2, cx - 22, gy + 10.5, cz + 9.05)])
  p.add('blue', [boxG(92.2, 0.9, 30.2, cx, gy + 6.9, cz), boxG(10, 6, 0.3, cx + 42, gy + 4.5, cz + 15.1)])
  p.add('concrete', [boxG(9, 30, 9, cx + 58, gy + 15, cz - 2), boxG(11, 1, 11, cx + 58, gy + 30.4, cz - 2)])
  p.add('glass', boxG(9.2, 3.4, 9.2, cx + 58, gy + 32.2, cz - 2))
  p.add('darkSteel', boxG(11.5, 0.6, 11.5, cx + 58, gy + 34.2, cz - 2))
  // entrance canopy
  p.add('darkSteel', boxG(18, 0.4, 9, cx - 2, gy + 4.6, cz + 19.5))
  for (const dx of [-8.5, 8.5]) for (const dz of [-3.5, 3.5]) p.add('galv', cylG(0.18, 0.18, 4.4, cx - 2 + dx, gy + 2.2, cz + 19.5 + dz, 10))
  // full-scale gate-section exhibit in front of the hall
  p.add('gateSteel', beamG([cx - 52, gy + 0.7, cz + 26], [cx - 52, gy + 0.7 + 7, cz + 26], 1.0, true))
  // car park
  p.add('asphalt', boxG(92, 0.1, 26, cx - 1, gy + 0.03, cz + 38))
  for (let i = 0; i <= 18; i++) for (const zz of [-62, -52.5]) p.add('line', boxG(0.12, 0.012, 4.6, -556 + i * 5.1 - 2.5, gy + 0.09, zz - 0.5))
  // plaza + memorial plaque
  p.add('concrete', boxG(46, 0.25, 34, -440, gy + 0.1, -33))
  p.add('concrete', [boxG(12, 0.7, 6, -440, gy + 0.55, -33), boxG(11, 0.5, 1.2, -440, gy + 0.6, -22)])
  for (const [bx, bz] of [[-452, -26], [-428, -26], [-452, -40], [-428, -40]]) p.add('darkSteel', [boxG(2.6, 0.12, 0.6, bx, gy + 0.55, bz), boxG(0.1, 0.4, 0.5, bx - 1, gy + 0.3, bz), boxG(0.1, 0.4, 0.5, bx + 1, gy + 0.3, bz)])
  // flag poles
  for (let i = 0; i < 3; i++) p.add('galv', cylG(0.09, 0.14, 13, -452 + i * 5, gy + 6.5, -44, 10))
  // island lamp posts
  const addLamp = (x: number, side: number) => {
    const y0 = roadY(x)
    const z = ROAD_Z + side * 8.2
    p.add('galv', [cylG(0.1, 0.16, 9.4, x, y0 + 4.7, z, 10), beamG([x, y0 + 9.3, z], [x, y0 + 9.65, z - side * 3.2], 0.1, true)])
    p.add('darkSteel', boxG(1.0, 0.2, 0.5, x, y0 + 9.75, z - side * 3.3))
    p.add('lampGlow', boxG(0.85, 0.04, 0.4, x, y0 + 9.62, z - side * 3.3))
    lamps.push(new THREE.Vector3(x, y0 + 9.55, z - side * 3.3))
  }
  let ii = 0
  for (let x = ROAD_X0 + 20; x < -388; x += 48) addLamp(x, ii++ % 2 ? 1 : -1)
  for (let x = 1380; x < ROAD_X1 - 20; x += 48) addLamp(x, ii++ % 2 ? 1 : -1)
  // car park light masts
  for (let i = 0; i < 6; i++) {
    const x = -552 + i * 18
    p.add('galv', cylG(0.12, 0.2, 11, x, gy + 5.5, -47, 10))
    p.add('lampGlow', boxG(1.2, 0.05, 0.5, x, gy + 11, -47))
    p.add('darkSteel', boxG(1.4, 0.2, 0.7, x, gy + 11.15, -47))
    lamps.push(new THREE.Vector3(x, gy + 10.9, -47))
  }
  // tunnel portals that close off the ends of the model
  for (const [x, face] of [[ROAD_X0 - 3, 1], [ROAD_X1 + 3, -1]] as [number, number][]) {
    p.add('concrete', boxG(6, 20, 40, x, 10, ROAD_Z))
    p.add('darkSteel', [boxG(0.6, 0.8, 16, x + face * -3.1, 3.4 + 7.2, ROAD_Z), boxG(0.6, 7.2, 0.8, x - face * 3.1, 3.4 + 3.6, ROAD_Z - 7.6), boxG(0.6, 7.2, 0.8, x - face * 3.1, 3.4 + 3.6, ROAD_Z + 7.6)].map((g) => g.translate(face * 0.001, 0, 0)))
  }
  addParts(group, p, mats)
  const dark = new THREE.MeshBasicMaterial({ color: '#030405' })
  for (const [x, face] of [[ROAD_X0, 1], [ROAD_X1, -1]] as [number, number][]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(15, 7.2), dark)
    m.rotation.y = face * Math.PI / 2
    m.position.set(x + face * 0.02, 3.4 + 3.6, ROAD_Z)
    group.add(m)
  }

  // memorial plaque
  const plaqueMat = new THREE.MeshStandardMaterial({ map: plaqueTexture(), roughness: 0.55, metalness: 0.2 })
  const stone = new THREE.MeshStandardMaterial({ color: '#5a5e61', roughness: 0.9 })
  const slab = new THREE.Mesh(new THREE.BoxGeometry(5.6, 2.8, 0.45), [stone, stone, stone, stone, plaqueMat, stone])
  slab.position.set(-440, gy + 0.9 + 1.55, -33.4)
  slab.rotation.x = -0.18
  slab.castShadow = true
  slab.receiveShadow = true
  group.add(slab)

  // flags
  const flags: IslandRig['flags'] = []
  const flagTex = (draw: (g: CanvasRenderingContext2D) => void) => {
    const c = document.createElement('canvas')
    c.width = 192
    c.height = 128
    draw(c.getContext('2d')!)
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    return t
  }
  const tex = [
    flagTex((g) => {
      g.fillStyle = '#ae1c28'; g.fillRect(0, 0, 192, 43)
      g.fillStyle = '#ffffff'; g.fillRect(0, 43, 192, 42)
      g.fillStyle = '#21468b'; g.fillRect(0, 85, 192, 43)
    }),
    flagTex((g) => {
      g.fillStyle = '#003399'; g.fillRect(0, 0, 192, 128)
      g.fillStyle = '#ffcc00'
      for (let i = 0; i < 12; i++) { g.beginPath(); g.arc(96 + Math.cos((i / 12) * 6.283) * 38, 64 + Math.sin((i / 12) * 6.283) * 38, 5, 0, 6.283); g.fill() }
    }),
    flagTex((g) => {
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, 192, 128)
      g.fillStyle = '#21468b'
      for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(0, 20 + i * 22); for (let x = 0; x <= 192; x += 8) g.lineTo(x, 20 + i * 22 + Math.sin(x / 14 + i) * 6); g.lineTo(192, 30 + i * 22); g.lineTo(0, 30 + i * 22); g.fill() }
      g.fillStyle = '#c8102e'; g.fillRect(0, 0, 192, 28)
    }),
  ]
  tex.forEach((t, i) => {
    const geo = new THREE.PlaneGeometry(3.4, 2.27, 14, 8)
    geo.translate(1.7, 0, 0)
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: t, side: THREE.DoubleSide, roughness: 0.85 }))
    m.position.set(-452 + i * 5, gy + 11.6, -44)
    m.castShadow = true
    group.add(m)
    flags.push({ mesh: m, base: new Float32Array(geo.attributes.position.array) })
  })

  // turbines
  const turbines: Turbine[] = [
    new Turbine(mats, -560, 90, 0),
    new Turbine(mats, -580, -30, 1.2),
    new Turbine(mats, -520, -150, 2.1),
    new Turbine(mats, -470, 130, 3.4),
  ]
  turbines.forEach((t) => group.add(t.group))

  // sea-buckthorn shrubs
  const geo = new THREE.IcosahedronGeometry(1, 1)
  const pp = geo.attributes.position
  for (let i = 0; i < pp.count; i++) {
    const n = 0.8 + 0.4 * fbm(pp.getX(i) * 2, pp.getY(i) * 2 + pp.getZ(i), 2, 6)
    pp.setXYZ(i, pp.getX(i) * n, pp.getY(i) * n * 0.7, pp.getZ(i) * n)
  }
  geo.computeVertexNormals()
  const shrubMat = weather(new THREE.MeshStandardMaterial({ color: '#4f5d2c', roughness: 1 }), { grime: 0.6, fine: 0.5 })
  const N = 900
  const shrubs = new THREE.InstancedMesh(geo, shrubMat, N)
  const r = rng(61)
  const o = new THREE.Object3D()
  const col = new THREE.Color()
  let n = 0
  let guard = 0
  while (n < N && guard++ < 40000) {
    const x = -700 + r() * 560
    const z = -190 + r() * 380
    const h = terrainH(x, z)
    if (h < 2.2) continue
    if (Math.abs(z - ROAD_Z) < 14) continue
    if (x > -580 && x < -460 && z > -112 && z < -50) continue
    if (x > -475 && x < -405 && z > -60 && z < -8) continue
    if (fbm(x * 0.02, z * 0.02, 3, 44) < 0.5) continue
    const s = 0.8 + r() * 1.9
    o.position.set(x, h + s * 0.2, z)
    o.rotation.set(0, r() * 6, 0)
    o.scale.set(s * 1.3, s, s * 1.3)
    o.updateMatrix()
    shrubs.setMatrixAt(n, o.matrix)
    col.setRGB(0.8 + r() * 0.4, 0.85 + r() * 0.3, 0.7 + r() * 0.3)
    shrubs.setColorAt(n, col)
    n++
  }
  shrubs.count = n
  shrubs.castShadow = true
  shrubs.receiveShadow = true
  group.add(shrubs)

  return { group, turbines, flags, lamps }
}

export function updateFlags(flags: IslandRig['flags'], t: number, wind: number) {
  for (const f of flags) {
    const pos = f.mesh.geometry.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < pos.count; i++) {
      const x = f.base[i * 3]
      const k = x / 3.4
      pos.setZ(i, Math.sin(x * 2.2 - t * (3 + wind * 3) + f.base[i * 3 + 1]) * 0.28 * k * (1 + wind))
      pos.setY(i, f.base[i * 3 + 1] - k * k * 0.15)
    }
    pos.needsUpdate = true
    f.mesh.geometry.computeVertexNormals()
  }
}

export { makeMaterials }

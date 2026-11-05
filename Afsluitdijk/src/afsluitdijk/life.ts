import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import type { Mats } from './materials'
import { ROAD_Y, IJ_LEVEL, Z } from './profile'
import { mulberry32 } from './noise'

export const carLightMats = {
  front: new THREE.MeshStandardMaterial({ color: '#f4f4ee', emissive: new THREE.Color('#fff2d0'), emissiveIntensity: 0.0, roughness: 0.2 }),
  rear: new THREE.MeshStandardMaterial({ color: '#7a1010', emissive: new THREE.Color('#ff2010'), emissiveIntensity: 0.15, roughness: 0.3 }),
}

const tireMat = new THREE.MeshStandardMaterial({ color: '#0e0f10', roughness: 0.9 })
const hubMat = new THREE.MeshStandardMaterial({ color: '#b8bcc0', metalness: 0.9, roughness: 0.35 })
const glassMat = new THREE.MeshStandardMaterial({ color: '#0f161d', metalness: 0.4, roughness: 0.08 })

const wheelGeo = new THREE.CylinderGeometry(0.33, 0.33, 0.24, 18).rotateZ(Math.PI / 2)
const hubGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.26, 12).rotateZ(Math.PI / 2)

interface CarSpec {
  L: number
  W: number
  bodyH: number
  cabH: number
  cabL: number
  cabZ: number
}
const SPECS: Record<string, CarSpec> = {
  hatch: { L: 4.0, W: 1.78, bodyH: 0.62, cabH: 0.56, cabL: 2.1, cabZ: -0.2 },
  sedan: { L: 4.7, W: 1.82, bodyH: 0.62, cabH: 0.52, cabL: 2.3, cabZ: -0.2 },
  suv: { L: 4.55, W: 1.9, bodyH: 0.82, cabH: 0.6, cabL: 2.6, cabZ: -0.25 },
  van: { L: 5.0, W: 1.95, bodyH: 0.95, cabH: 0.85, cabL: 3.9, cabZ: -0.3 },
}

/** Car with its long axis along local z (nose at +z). Origin on the ground. */
export function makeCar(kind: 'hatch' | 'sedan' | 'suv' | 'van', color: string, _mats?: Mats): THREE.Group {
  void _mats
  const s = SPECS[kind]
  const g = new THREE.Group()
  const paint = new THREE.MeshPhysicalMaterial({ color, roughness: 0.38, metalness: 0.35, clearcoat: 0.9, clearcoatRoughness: 0.12 })
  const clear = 0.2
  const body = new THREE.Mesh(new RoundedBoxGeometry(s.W, s.bodyH, s.L, 3, 0.16), paint)
  body.position.y = clear + s.bodyH / 2
  body.castShadow = true
  body.receiveShadow = true
  g.add(body)
  const cabY = clear + s.bodyH + s.cabH / 2 - 0.04
  const cab = new THREE.Mesh(new RoundedBoxGeometry(s.W * 0.9, s.cabH, s.cabL, 3, 0.14), glassMat)
  cab.position.set(0, cabY, s.cabZ)
  cab.castShadow = true
  g.add(cab)
  const roof = new THREE.Mesh(new RoundedBoxGeometry(s.W * 0.88, 0.07, s.cabL * 0.82, 2, 0.03), paint)
  roof.position.set(0, cabY + s.cabH / 2, s.cabZ)
  roof.castShadow = true
  g.add(roof)
  const wz = s.L / 2 - 0.85
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const w = new THREE.Mesh(wheelGeo, tireMat)
      w.position.set(sx * (s.W / 2 - 0.1), 0.33, sz * wz)
      w.castShadow = true
      g.add(w)
      const h = new THREE.Mesh(hubGeo, hubMat)
      h.position.copy(w.position)
      g.add(h)
    }
  }
  for (const sx of [-1, 1]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.05), carLightMats.front)
    hl.position.set(sx * (s.W / 2 - 0.3), clear + s.bodyH * 0.65, s.L / 2 + 0.02)
    g.add(hl)
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.14, 0.05), carLightMats.rear)
    tl.position.set(sx * (s.W / 2 - 0.3), clear + s.bodyH * 0.7, -s.L / 2 - 0.02)
    g.add(tl)
  }
  return g
}

export function makeTruck(cabColor: string, trailerColor: string): THREE.Group {
  const g = new THREE.Group()
  const cabM = new THREE.MeshPhysicalMaterial({ color: cabColor, roughness: 0.4, metalness: 0.3, clearcoat: 0.6 })
  const trM = new THREE.MeshStandardMaterial({ color: trailerColor, roughness: 0.6 })
  const cab = new THREE.Mesh(new RoundedBoxGeometry(2.5, 2.9, 2.4, 2, 0.12), cabM)
  cab.position.set(0, 1.85, 5.9)
  cab.castShadow = true
  g.add(cab)
  const ws = new THREE.Mesh(new THREE.BoxGeometry(2.3, 1.0, 0.05), glassMat)
  ws.position.set(0, 2.5, 7.12)
  g.add(ws)
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.4, 12.5), new THREE.MeshStandardMaterial({ color: '#222', roughness: 0.8 }))
  chassis.position.set(0, 0.85, 0.4)
  g.add(chassis)
  const tr = new THREE.Mesh(new RoundedBoxGeometry(2.55, 2.9, 12.8, 2, 0.05), trM)
  tr.position.set(0, 2.5, -0.3)
  tr.castShadow = true
  tr.receiveShadow = true
  g.add(tr)
  const axle = (z: number) => {
    for (const sx of [-1, 1]) {
      const w = new THREE.Mesh(wheelGeo, tireMat)
      w.scale.set(1.35, 1.45, 1.45)
      w.position.set(sx * 1.05, 0.47, z)
      w.castShadow = true
      g.add(w)
    }
  }
  axle(6.4)
  axle(-4.2)
  axle(-5.5)
  axle(-6.8)
  for (const sx of [-1, 1]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.05), carLightMats.front)
    hl.position.set(sx * 0.9, 1.0, 7.12)
    g.add(hl)
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.25, 0.05), carLightMats.rear)
    tl.position.set(sx * 1.0, 0.9, -6.72)
    g.add(tl)
  }
  return g
}

interface Vehicle {
  obj: THREE.Object3D
  dir: 1 | -1
  z: number
  speed: number
  off: number
}

export class Traffic {
  readonly group = new THREE.Group()
  private v: Vehicle[] = []
  private L = 2400

  constructor(mats: Mats) {
    const rnd = mulberry32(5)
    const cols = ['#d9d9d6', '#20272e', '#7e1f23', '#2b4a7a', '#8a8f94', '#e0dfd2', '#3a5d46', '#b9bcc0', '#c27a1a', '#4a4f55']
    const kinds: ('hatch' | 'sedan' | 'suv' | 'van')[] = ['hatch', 'sedan', 'suv', 'van', 'hatch', 'sedan']
    const add = (obj: THREE.Object3D, dir: 1 | -1, z: number, speed: number, off: number) => {
      obj.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2
      obj.position.y = ROAD_Y
      this.group.add(obj)
      this.v.push({ obj, dir, z, speed, off })
    }
    for (const dir of [1, -1] as const) {
      const lanes = dir > 0 ? [Z.laneEastInner, Z.laneEastOuter] : [Z.laneWestInner, Z.laneWestOuter]
      for (let i = 0; i < 9; i++) {
        const inner = i % 3 !== 2
        const lane = inner ? lanes[0] : lanes[1]
        const speed = inner ? 28 + rnd() * 4 : 22 + rnd() * 3
        const off = (i / 9) * this.L + rnd() * 80 + (dir > 0 ? 0 : 130)
        const car = makeCar(kinds[Math.floor(rnd() * kinds.length)], cols[Math.floor(rnd() * cols.length)], mats)
        add(car, dir, lane, speed, off)
      }
      const t = makeTruck(dir > 0 ? '#2f4f8f' : '#b4202a', dir > 0 ? '#e8e8e4' : '#dfe6ea')
      add(t, dir, lanes[1], 21.5, 700 + (dir > 0 ? 0 : 300))
      const t2 = makeTruck('#e8e8e4', '#2c6e49')
      add(t2, dir, lanes[1], 21.5, 1700 + (dir > 0 ? 100 : 0))
    }
  }

  update(t: number) {
    for (const v of this.v) {
      const x = ((((v.off + v.dir * v.speed * t) % this.L) + this.L) % this.L) - this.L / 2
      v.obj.position.x = x
      v.obj.position.z = v.z
    }
  }
}

// ---------------------------------------------------------------- gulls
function makeGull() {
  const g = new THREE.Group()
  const white = new THREE.MeshStandardMaterial({ color: '#f1f1ee', roughness: 0.8 })
  const grey = new THREE.MeshStandardMaterial({ color: '#8d969c', roughness: 0.8 })
  const tip = new THREE.MeshStandardMaterial({ color: '#1d2023', roughness: 0.8 })
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), white)
  body.scale.set(0.9, 0.8, 2.6)
  g.add(body)
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), white)
  head.position.set(0, 0.06, 0.42)
  g.add(head)
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.14, 6), new THREE.MeshStandardMaterial({ color: '#d9a61f' }))
  beak.rotation.x = Math.PI / 2
  beak.position.set(0, 0.04, 0.55)
  g.add(beak)
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.02, 0.22), white)
  tail.position.set(0, 0, -0.45)
  g.add(tail)
  const wings: THREE.Group[] = []
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group()
    pivot.position.set(s * 0.08, 0.05, 0.05)
    const w1 = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.015, 0.3), grey)
    w1.position.x = s * 0.28
    const w2 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.012, 0.22), tip)
    w2.position.x = s * 0.78
    pivot.add(w1, w2)
    g.add(pivot)
    wings.push(pivot)
  }
  return { g, wings }
}

export class Gulls {
  readonly group = new THREE.Group()
  private b: { g: THREE.Group; wings: THREE.Group[]; cx: number; cz: number; r: number; h: number; sp: number; ph: number; dir: number }[] = []
  constructor() {
    const rnd = mulberry32(17)
    for (let i = 0; i < 14; i++) {
      const { g, wings } = makeGull()
      g.scale.setScalar(1.3)
      this.group.add(g)
      const nearTower = i < 6
      this.b.push({
        g,
        wings,
        cx: nearTower ? -20 + rnd() * 50 : -300 + rnd() * 600,
        cz: nearTower ? 0 + rnd() * 40 : -150 + rnd() * 100,
        r: 25 + rnd() * 70,
        h: 14 + rnd() * 40,
        sp: 0.12 + rnd() * 0.1,
        ph: rnd() * 6.28,
        dir: rnd() < 0.5 ? 1 : -1,
      })
    }
  }
  update(t: number) {
    for (const b of this.b) {
      const a = b.ph + t * b.sp * b.dir
      const x = b.cx + Math.cos(a) * b.r
      const z = b.cz + Math.sin(a) * b.r * 0.7
      const y = b.h + Math.sin(t * 0.3 + b.ph) * 2.5
      const vx = -Math.sin(a) * b.dir
      const vz = Math.cos(a) * 0.7 * b.dir
      b.g.position.set(x, y, z)
      b.g.rotation.set(0, Math.atan2(vx, vz), -0.3 * b.dir)
      const flap = Math.sin(t * 5.5 + b.ph * 3) * (Math.sin(t * 0.4 + b.ph) > 0.3 ? 0.55 : 0.08)
      b.wings[0].rotation.z = flap
      b.wings[1].rotation.z = -flap
    }
  }
}

// ---------------------------------------------------------------- wind turbines & boats
export class Offshore {
  readonly group = new THREE.Group()
  private rotors: { r: THREE.Object3D; sp: number }[] = []
  private boat: THREE.Group
  private light: THREE.MeshStandardMaterial

  constructor() {
    const white = new THREE.MeshStandardMaterial({ color: '#eef0f0', roughness: 0.45 })
    this.light = new THREE.MeshStandardMaterial({ color: '#550000', emissive: new THREE.Color('#ff1a1a'), emissiveIntensity: 0.0 })
    const spots: [number, number, number][] = [
      [-260, 160, 0],
      [-150, 230, 1],
      [190, 140, 2],
      [340, 210, 3],
      [-520, 330, 4],
      [620, 300, 5],
      [-780, 260, 6],
      [880, 380, 7],
    ]
    for (const [x, z, i] of spots) {
      const t = new THREE.Group()
      t.position.set(x, IJ_LEVEL, z)
      t.rotation.y = 0.2
      const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.6, 88, 14), white)
      tower.position.y = 44
      tower.castShadow = true
      t.add(tower)
      const base = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.4, 12, 12), new THREE.MeshStandardMaterial({ color: '#d5a82e', roughness: 0.6 }))
      base.position.y = 4
      t.add(base)
      const nac = new THREE.Mesh(new THREE.BoxGeometry(3.6, 3.6, 10), white)
      nac.position.set(0, 89.5, -1)
      nac.castShadow = true
      t.add(nac)
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), this.light)
      lamp.position.set(0, 91.8, -3)
      t.add(lamp)
      const rotor = new THREE.Group()
      rotor.position.set(0, 89.5, 4.4)
      const hub = new THREE.Mesh(new THREE.SphereGeometry(1.8, 12, 10), white)
      hub.scale.z = 1.4
      rotor.add(hub)
      for (let k = 0; k < 3; k++) {
        const arm = new THREE.Group()
        arm.rotation.z = (k * Math.PI * 2) / 3
        const bg = new THREE.BoxGeometry(2.4, 48, 0.4)
        bg.translate(0, 26, 0)
        const pos = bg.attributes.position
        for (let q = 0; q < pos.count; q++) {
          const y = pos.getY(q)
          const f = Math.max(0.12, 1.0 - (y - 2) / 50)
          pos.setX(q, pos.getX(q) * f * 1.5)
        }
        bg.computeVertexNormals()
        const blade = new THREE.Mesh(bg, white)
        blade.castShadow = true
        arm.add(blade)
        rotor.add(arm)
      }
      t.add(rotor)
      this.group.add(t)
      this.rotors.push({ r: rotor, sp: 0.9 + (i % 3) * 0.06 })
    }
    // sailing boat
    const boat = new THREE.Group()
    const hull = new THREE.Mesh(new RoundedBoxGeometry(2.6, 1.0, 9.5, 2, 0.3), new THREE.MeshStandardMaterial({ color: '#f1f1ec', roughness: 0.4 }))
    hull.position.y = 0.3
    hull.castShadow = true
    boat.add(hull)
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 13, 6), new THREE.MeshStandardMaterial({ color: '#c8ccd0', metalness: 0.8, roughness: 0.4 }))
    mast.position.set(0, 7, 0.5)
    boat.add(mast)
    const sailShape = new THREE.Shape()
    sailShape.moveTo(0, 0)
    sailShape.lineTo(0, 11)
    sailShape.lineTo(-4.2, 0.4)
    sailShape.closePath()
    const sail = new THREE.Mesh(new THREE.ShapeGeometry(sailShape), new THREE.MeshStandardMaterial({ color: '#fbfbf6', roughness: 0.9, side: THREE.DoubleSide }))
    sail.rotation.y = Math.PI / 2
    sail.position.set(0, 1.4, 0.3)
    sail.castShadow = true
    boat.add(sail)
    boat.scale.setScalar(1.2)
    this.boat = boat
    this.group.add(boat)
  }

  setNight(n: number) {
    this.light.emissiveIntensity = n * 3
  }

  update(t: number) {
    for (const r of this.rotors) r.r.rotation.z = -t * r.sp * 0.7
    this.boat.position.set(-60 + Math.sin(t * 0.01) * 80 + t * 0.4 - Math.floor((t * 0.4 + 400) / 800) * 800, IJ_LEVEL + 0.3 + Math.sin(t * 0.8) * 0.06, 130)
    this.boat.rotation.set(Math.sin(t * 0.6) * 0.02, Math.PI / 2, 0.14 + Math.sin(t * 0.5) * 0.02)
  }
}

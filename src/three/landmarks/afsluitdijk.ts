import * as THREE from 'three'
import {
  Landmark, asphaltMat, bake, beam, box, brickMat, colorMat, concreteMat, cyl, discBand, extrude, grassMat, groundSlab, newGroup, rockMat, sphere, steelMat, stoneMat, waterMat, waterPoly, v3,
} from '../kit'
import { car, lampPost } from '../props'

const HALF = 9.4
function dikeY(z: number) {
  if (z < -4.4) return -0.4
  if (z < -2.2) return -0.4 + ((z + 4.4) / 2.2) * 1.2
  if (z <= 2.4) return 0.8
  if (z < 4.2) return 0.8 - ((z - 2.4) / 1.8) * 1.2
  return -0.4
}

function turbine(): { group: THREE.Group; rotor: THREE.Group } {
  const g = newGroup()
  const white = colorMat('#eef0f1', 0.45)
  cyl(g, 0.07, 0.14, 5.6, white, 0, -0.4, 0, 12)
  cyl(g, 0.3, 0.3, 0.9, colorMat('#e0a82e', 0.6), 0, -0.55, 0, 10)
  box(g, 0.18, 0.2, 0.5, white, 0, 5.2, 0)
  const rotor = newGroup(0, 5.3, 0.3)
  sphere(rotor, 0.1, white, 0, 0, 0.05, 1, 1, 1.4, 10)
  for (let i = 0; i < 3; i++) {
    const arm = newGroup()
    arm.rotation.z = (i * Math.PI * 2) / 3
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.6, 0.02), white)
    blade.geometry.translate(0, 1.4, 0)
    const pos = blade.geometry.attributes.position
    for (let k = 0; k < pos.count; k++) {
      const y = pos.getY(k)
      pos.setX(k, pos.getX(k) * (1.4 - (y / 2.7) * 1.2))
    }
    blade.castShadow = true
    arm.add(blade)
    rotor.add(arm)
  }
  g.add(rotor)
  return { group: g, rotor }
}

export function buildAfsluitdijk(): Landmark {
  const g = newGroup()
  const R = 11
  const conc = concreteMat('#b1b0aa')
  const north = discBand(10.4, -10.4, -3.7)
  const south = discBand(10.4, 3.5, 10.4)
  groundSlab(g, R, grassMat('#5f8a40'), conc, [north, south])
  waterPoly(g, north, -0.26, waterMat('#3d5a58', 1.5))
  waterPoly(g, south, -0.26, waterMat('#3a6c86', 0.45))

  const s = newGroup()
  const rock = rockMat()
  // dike body (YZ profile extruded along x)
  const prof = new THREE.Shape()
  prof.moveTo(-4.6, -0.5)
  prof.lineTo(-2.2, 0.8)
  prof.lineTo(2.4, 0.8)
  prof.lineTo(4.4, -0.5)
  prof.closePath()
  const dike = extrude(s, prof, HALF * 2, [conc, rock], HALF, 0, 0, [0, 0, 0], [5, 5])
  dike.rotation.y = -Math.PI / 2
  // grassed inner slope
  const a = v3(0, 0.82, 2.4)
  const b = v3(0, -0.3, 4.25)
  const gm = grassMat('#5f8a40')
  beam(s, a, b, HALF * 2 - 0.1, 0.07, gm).translateY(0.02)
  // verge + cycle path + road
  box(s, HALF * 2, 0.05, 1.2, gm, 0, 0.8, 1.8)
  box(s, HALF * 2, 0.05, 0.6, colorMat('#a23f33', 0.9), 0, 0.8, 0.9)
  box(s, HALF * 2, 0.06, 1.9, asphaltMat('#2e3135'), 0, 0.8, -0.65)
  box(s, HALF * 2, 0.05, 0.4, colorMat('#9a9a94', 0.9), 0, 0.8, -2.0)
  for (let i = 0; i < 16; i++) box(s, 0.6, 0.012, 0.05, colorMat('#ebebe4', 0.7), -HALF + 0.7 + i * 1.18, 0.86, -0.65)
  box(s, HALF * 2, 0.012, 0.04, colorMat('#ebebe4', 0.7), 0, 0.86, -1.5)
  box(s, HALF * 2, 0.012, 0.04, colorMat('#ebebe4', 0.7), 0, 0.86, 0.25)
  // guard rail
  box(s, HALF * 2, 0.08, 0.04, steelMat('#c9cfd3'), 0, 1.15, -2.2)
  for (let i = 0; i <= 24; i++) box(s, 0.04, 0.3, 0.04, steelMat('#9aa1a6'), -HALF + (i * HALF * 2) / 24, 0.86, -2.2)
  for (let i = 0; i < 6; i++) lampPost(s, -8 + i * 3.2, -2.05, 1.5, 0.8)

  // monument terrace on the IJsselmeer side
  box(s, 5.2, 1.4, 2.6, brickMat('#8a4a36'), -1.2, -0.5, 3.1)
  box(s, 5.4, 0.12, 2.8, stoneMat('#cfc6b0'), -1.2, 0.9, 3.1)
  // Dudok's stepped brick monument
  const mx = -2.6
  const mz = 3.0
  const brick = brickMat('#8a3f2c')
  const stone = stoneMat('#d6ccb4')
  box(s, 1.9, 0.5, 1.9, stone, mx, 1.02, mz)
  box(s, 1.5, 1.2, 1.5, brick, mx, 1.52, mz)
  box(s, 1.7, 0.1, 1.7, stone, mx, 2.72, mz)
  box(s, 1.1, 2.4, 1.1, brick, mx, 2.82, mz)
  box(s, 1.3, 0.1, 1.3, stone, mx, 5.22, mz)
  box(s, 0.8, 1.2, 0.8, brick, mx, 5.32, mz)
  box(s, 1.1, 0.14, 1.1, stone, mx, 6.52, mz)
  box(s, 0.55, 0.5, 0.55, stone, mx, 6.66, mz)
  // narrow vertical slits
  for (const sx of [-1, 1]) box(s, 0.06, 1.8, 0.04, colorMat('#20262b'), mx + sx * 0.25, 3.1, mz + 0.56)
  // Lely statue
  const px = 0.6
  box(s, 0.9, 1.0, 0.9, stone, px, 1.02, mz)
  box(s, 1.1, 0.1, 1.1, stone, px, 2.02, mz)
  const bronze = colorMat('#4f6b57', 0.5, 0.7)
  cyl(s, 0.2, 0.3, 1.0, bronze, px, 2.12, mz, 10)
  cyl(s, 0.13, 0.2, 0.5, bronze, px, 3.1, mz, 10)
  sphere(s, 0.13, bronze, px, 3.7, mz, 1, 1, 1, 10)
  beam(s, v3(px + 0.15, 3.5, mz), v3(px + 0.5, 3.2, mz + 0.1), 0.09, 0.09, bronze)
  // flags
  for (let i = 0; i < 3; i++) {
    cyl(s, 0.015, 0.02, 2.6, steelMat('#cfd3d6'), 1.9 + i * 0.5, 0.92, 3.9, 6)
    box(s, 0.45, 0.28, 0.01, colorMat(['#ae1c28', '#f4f4f4', '#21468b'][i], 0.8), 2.12 + i * 0.5, 3.0, 3.9)
  }
  bake(s)
  g.add(s)

  // wind turbines in the IJsselmeer
  const turbines = [turbine(), turbine(), turbine()]
  const spots: [number, number][] = [[-6.2, 7.2], [1.6, 8.4], [6.8, 6.9]]
  turbines.forEach((t, i) => {
    t.group.position.set(spots[i][0], 0, spots[i][1])
    t.group.rotation.y = 0.15 * i
    g.add(t.group)
  })

  // traffic
  const cars = ['#c33b2b', '#2e5aa8', '#e9e9e4', '#3c3f45', '#2f8a5a'].map((c, i) => {
    const m = car(c)
    g.add(m)
    return { m, dir: i % 2 ? -1 : 1, off: i * 4.1 }
  })

  return {
    group: g,
    radius: R,
    colliders: [[0, -7.2, 10.4, 3.4], [0, 7.4, 10.4, 3.1], [-2.6, 3.0, 1.0, 1.0], [0.6, 3.0, 0.6, 0.6]],
    floor: (x, z) => (Math.abs(x) < HALF + 0.5 ? Math.max(0, dikeY(z)) : 0),
    update: (t, dt) => {
      turbines.forEach((tb, i) => (tb.rotor.rotation.z -= dt * (0.9 + i * 0.12)))
      for (const c of cars) {
        const L = HALF * 2 + 1
        const x = ((((t * 1.8 * c.dir + c.off) % L) + L) % L) - L / 2
        c.m.position.set(x, 0.86, c.dir > 0 ? -1.1 : -0.25)
        c.m.rotation.y = c.dir > 0 ? 0 : Math.PI
      }
    },
  }
}

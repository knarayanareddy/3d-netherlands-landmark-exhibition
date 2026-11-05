import * as THREE from 'three'
import {
  Landmark, bake, box, brickMat, clayRoofMat, colorMat, grassMat, groundSlab, newGroup, rectPoly, roofGable, rng, sphere, tree, waterMat, waterRect, woodMat, TAU,
} from '../kit'
import { windmill } from './windmill'

export function buildKinderdijk(): Landmark {
  const g = newGroup()
  const R = 10.2
  groundSlab(g, R, grassMat('#5d8a3c'), colorMat('#5a4a36', 1), [rectPoly(-9.3, -1.7, 9.3, 1.5)])
  waterRect(g, -9.3, -1.7, 9.3, 1.5, -0.2, waterMat('#3c5c52', 0.5))

  const stat = newGroup()
  // dike path
  box(stat, 19, 0.04, 0.8, colorMat('#a79a82', 1), 0, 0, -2.4)
  box(stat, 19, 0.03, 0.8, colorMat('#a79a82', 1), 0, 0, 2.3)

  // reeds along both banks
  const reedGeo = new THREE.CylinderGeometry(0.008, 0.02, 0.9, 3)
  reedGeo.translate(0, 0.45, 0)
  const N = 260
  const reeds = new THREE.InstancedMesh(reedGeo, colorMat('#8a8d4a', 1), N)
  const r = rng(5)
  const m4 = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  for (let i = 0; i < N; i++) {
    const north = i % 2 === 0
    const x = -9 + r() * 18
    const z = north ? -1.75 + r() * 0.25 : 1.55 - r() * 0.25
    const s = 0.6 + r() * 0.9
    q.setFromEuler(new THREE.Euler((r() - 0.5) * 0.3, 0, (r() - 0.5) * 0.3))
    m4.compose(new THREE.Vector3(x, -0.3, z), q, new THREE.Vector3(1, s, 1))
    reeds.setMatrixAt(i, m4)
  }
  reeds.castShadow = true
  g.add(reeds)

  // mills
  const mills = [
    { x: -6.6, z: -4.3, h: 6.6, rb: 0.95, kind: 'thatch' as const, sp: 0.55, ph: 0.2, ry: 0.12 },
    { x: 0.3, z: -4.6, h: 7.0, rb: 1.0, kind: 'brick' as const, sp: 0.42, ph: 1.0, ry: -0.05 },
    { x: 6.8, z: -4.2, h: 6.4, rb: 0.9, kind: 'thatch' as const, sp: 0.5, ph: 2.1, ry: -0.14 },
  ]
  const wm = mills.map((m) => {
    const w = windmill({ h: m.h, rBase: m.rb, kind: m.kind, speed: m.sp, phase: m.ph })
    w.group.position.set(m.x, 0, m.z)
    w.group.rotation.y = m.ry
    g.add(w.group)
    return w
  })

  // wooden footbridge
  box(stat, 1.0, 0.1, 4.4, woodMat('#7a5d3e'), 3.4, 0.05, 0.1)
  for (const sx of [-0.5, 0.5]) {
    box(stat, 0.05, 0.4, 4.4, woodMat('#6a4f35'), 3.4 + sx, 0.15, 0.1)
    for (let i = 0; i < 6; i++) box(stat, 0.07, 0.5, 0.07, woodMat('#6a4f35'), 3.4 + sx, 0.1, -1.9 + i * 0.8)
  }

  // farm house
  const fh = newGroup(-4.8, 0, 6.2)
  fh.rotation.y = 0.2
  box(fh, 2.6, 1.5, 1.8, brickMat('#8d4531'), 0, 0, 0)
  roofGable(fh, 3.0, 2.2, 1.4, clayRoofMat('#a9482a'), 0, 1.5, 0, brickMat('#8d4531'))
  box(fh, 0.3, 0.9, 0.05, colorMat('#2f4a3a'), 0, 0, 0.92)
  for (const x of [-0.8, 0.8]) box(fh, 0.35, 0.4, 0.05, colorMat('#e9e4d6'), x, 0.6, 0.92)
  box(fh, 0.28, 0.8, 0.28, brickMat('#7a3a28'), 0.9, 1.6, -0.3)
  stat.add(fh)

  // trees & sheep
  tree(stat, -8.0, 2.8, 4.4, 'willow', 1)
  tree(stat, -2.0, 3.8, 4.0, 'willow', 2)
  tree(stat, 7.6, 3.4, 4.2, 'willow', 3)
  tree(stat, -8.4, -3.6, 3.6, 'round', 4)
  tree(stat, 3.8, -7.3, 4.0, 'round', 5)
  tree(stat, -3.0, -7.4, 3.8, 'round', 6)
  tree(stat, 8.2, -2.0, 3.4, 'round', 7)
  const sheepM = colorMat('#efece3', 1)
  const headM = colorMat('#2a2623', 1)
  for (let i = 0; i < 7; i++) {
    const a = r() * TAU
    const rr = 4.2 + r() * 4
    const x = Math.cos(a) * rr * 0.9
    const z = Math.abs(Math.sin(a)) * rr * 0.75 + 3
    if (Math.hypot(x, z) > 9.3 || (Math.abs(x + 4.8) < 2 && Math.abs(z - 6.2) < 1.8)) continue
    const s = newGroup(x, 0, z)
    s.rotation.y = r() * TAU
    sphere(s, 0.3, sheepM, 0, 0.36, 0, 1.2, 0.9, 0.9, 8)
    sphere(s, 0.12, headM, 0.35, 0.4, 0, 1, 1, 1, 6)
    for (const lx of [-0.15, 0.15]) for (const lz of [-0.12, 0.12]) box(s, 0.05, 0.2, 0.05, headM, lx, 0, lz)
    stat.add(s)
  }
  // rowing boat
  const boat = newGroup(-2.8, -0.16, 0.2)
  const hull = box(boat, 1.5, 0.16, 0.5, woodMat('#6b4a33'), 0, 0, 0)
  hull.scale.set(1, 1, 1)
  box(boat, 0.5, 0.04, 0.4, woodMat('#8a6a45'), 0, 0.14, 0)
  g.add(boat)

  bake(stat)
  g.add(stat)

  return {
    group: g,
    radius: R,
    colliders: mills.map((m) => [m.x, m.z, m.rb * 1.3, m.rb * 1.3] as [number, number, number, number]).concat([[-4.8, 6.2, 1.5, 1.1]]),
    update: (t, dt) => {
      wm.forEach((w) => w.update(dt))
      boat.rotation.z = Math.sin(t * 1.2) * 0.04
      boat.position.y = -0.16 + Math.sin(t * 1.6) * 0.012
    },
  }
}

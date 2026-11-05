import * as THREE from 'three'
import {
  Landmark, TAU, bake, box, clockMat, colorMat, cyl, goldMat, gothicMat, groundSlab, newGroup, paveMat, roofGable, roofHip, slateMat, sphere, stoneMat, tree, beam, v3,
} from '../kit'
import { lampPost } from '../props'

export function buildDom(): Landmark {
  const g = newGroup()
  const R = 8.8
  groundSlab(g, R, paveMat('#948979'), colorMat('#6d6559', 1))
  const s = newGroup()
  const stone = stoneMat('#c4bba1')
  const slate = slateMat('#4a525e')
  const lead = colorMat('#707780', 0.4, 0.55)
  const gold = goldMat()
  const TZ = 2.7
  const T = newGroup(0, 0, TZ)

  // ---- Stage 1: massive square base
  box(T, 3.3, 0.35, 3.3, stone, 0, 0, 0)
  const m1 = gothicMat({ W: 2.9, H: 8.2, bays: 2, levels: 3, seed: 4 })
  const top = stone
  box(T, 2.9, 8.2, 2.9, [m1, m1, top, top, m1, m1], 0, 0.35, 0)
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      box(T, 0.46, 8.75, 0.46, stone, sx * 1.4, 0.2, sz * 1.4)
      roofHip(T, 0.5, 0.5, 0.9, stone, sx * 1.4, 8.95, sz * 1.4)
    }
  }
  box(T, 3.4, 0.2, 3.4, stone, 0, 8.55, 0)

  // ---- Stage 2: clock band + open belfry
  const y2 = 8.75
  const band = gothicMat({ W: 2.3, H: 2.0, bays: 1, levels: 0, seed: 9 })
  box(T, 2.3, 2.0, 2.3, [band, band, top, top, band, band], 0, y2, 0)
  const clk = clockMat()
  for (let i = 0; i < 4; i++) {
    const c = new THREE.Mesh(new THREE.CircleGeometry(0.72, 40), clk)
    const a = (i * Math.PI) / 2
    c.position.set(Math.sin(a) * 1.16, y2 + 1.0, Math.cos(a) * 1.16)
    c.rotation.y = a
    T.add(c)
  }
  const m2 = gothicMat({ W: 2.3, H: 3.5, bays: 2, levels: 1, open: true, seed: 6 })
  box(T, 2.3, 3.5, 2.3, [m2, m2, top, top, m2, m2], 0, y2 + 2.0, 0)
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      box(T, 0.3, 6.6, 0.3, stone, sx * 1.1, y2 - 0.1, sz * 1.1)
      roofHip(T, 0.36, 0.36, 1.0, lead, sx * 1.1, y2 + 6.5, sz * 1.1)
    }
  }
  box(T, 2.7, 0.18, 2.7, stone, 0, y2 + 5.5, 0)

  // ---- Stage 3: octagonal lantern
  const y3 = y2 + 5.68
  const oct = (r: number, h: number, y: number, mat: THREE.Material) => {
    const m = cyl(T, r, r, h, mat, 0, y, 0, 8)
    m.rotation.y = Math.PI / 8
    const uv = m.geometry.attributes.uv
    for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * 8)
    return m
  }
  const f1 = 1.05
  const r1 = f1 / (2 * Math.sin(Math.PI / 8))
  oct(r1, 4.2, y3, gothicMat({ W: f1, H: 4.2, bays: 1, levels: 1, open: true, seed: 12 }))
  for (let i = 0; i < 8; i++) {
    const a = ((i + 0.5) / 8) * TAU
    const x = Math.cos(a) * r1 * 1.01
    const z = Math.sin(a) * r1 * 1.01
    box(T, 0.16, 4.5, 0.16, stone, x, y3 - 0.1, z)
    roofHip(T, 0.2, 0.2, 0.55, stone, x, y3 + 4.4, z)
  }
  // flying buttresses from stage 2 turrets into the lantern
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) beam(T, v3(sx * 1.1, y2 + 5.3, sz * 1.1), v3(sx * 0.62, y3 + 1.8, sz * 0.62), 0.12, 0.12, stone)
  cyl(T, r1 * 1.12, r1 * 1.12, 0.14, stone, 0, y3 + 4.2, 0, 8).rotation.y = Math.PI / 8

  // ---- Stage 4: upper lantern
  const y4 = y3 + 4.34
  const f2 = 0.78
  const r2 = f2 / (2 * Math.sin(Math.PI / 8))
  oct(r2, 2.4, y4, gothicMat({ W: f2, H: 2.4, bays: 1, levels: 1, open: true, seed: 3 }))
  for (let i = 0; i < 8; i++) {
    const a = ((i + 0.5) / 8) * TAU
    box(T, 0.11, 2.6, 0.11, stone, Math.cos(a) * r2 * 1.01, y4 - 0.1, Math.sin(a) * r2 * 1.01)
  }
  cyl(T, r2 * 1.1, r2 * 1.1, 0.12, stone, 0, y4 + 2.4, 0, 8).rotation.y = Math.PI / 8
  // spire
  const sp = cyl(T, 0.02, r2 * 1.05, 3.6, lead, 0, y4 + 2.5, 0, 8)
  sp.rotation.y = Math.PI / 8
  sphere(T, 0.13, gold, 0, y4 + 6.2, 0, 1, 1, 1, 12)
  box(T, 0.04, 0.5, 0.04, gold, 0, y4 + 6.28, 0)
  box(T, 0.3, 0.04, 0.04, gold, 0, y4 + 6.55, 0)
  s.add(T)

  // ---- Domkerk nave
  const NZ = -4.5
  const long = gothicMat({ W: 10.4, H: 4.2, bays: 9, levels: 1, seed: 21 })
  const end = gothicMat({ W: 3.4, H: 4.2, bays: 2, levels: 1, seed: 22 })
  box(s, 10.4, 4.2, 3.4, [end, end, stone, stone, long, long], 0, 0.2, NZ)
  box(s, 10.8, 0.2, 3.8, stone, 0, 0, NZ)
  const roof = new THREE.Group()
  roofGable(roof, 4.1, 11.0, 2.0, slate, 0, 0, 0, stone)
  roof.rotation.y = Math.PI / 2
  roof.position.set(0, 4.4, NZ)
  s.add(roof)
  for (let i = 0; i < 9; i++) {
    for (const sz of [-1, 1]) {
      box(s, 0.34, 3.6, 0.42, stone, -4.8 + i * 1.2, 0.2, NZ + sz * 1.83)
    }
  }
  box(s, 1.4, 5.2, 1.4, stone, -4.9, 0.2, NZ - 1.9)
  roofHip(s, 1.5, 1.5, 1.4, slate, -4.9, 5.4, NZ - 1.9)

  // plaza decor
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU + 0.31
    const x = Math.cos(a) * 7.8
    const z = Math.sin(a) * 7.8
    if (z < -1 && Math.abs(x) < 6) continue
    tree(s, x, z, 3.4 + (i % 3) * 0.4, 'round', i + 7)
  }
  for (const x of [-3.6, 3.6, -5.8, 5.8]) lampPost(s, x, 6.2, 1.4)
  box(s, 0.5, 0.45, 0.5, stone, 0, 0, 6.5)
  bake(s)
  g.add(s)

  return {
    group: g,
    radius: R,
    colliders: [[0, TZ, 1.75, 1.75], [0, NZ, 5.4, 1.9]],
  }
}

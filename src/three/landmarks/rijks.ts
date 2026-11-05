import * as THREE from 'three'
import {
  Landmark, TAU, bake, bayMat, box, colorMat, concreteMat, extrude, glassMat, goldMat, grassMat, groundSlab, newGroup, paveMat, rng, roofGable, roofHip, slateMat, sphere, steelMat,
  stoneMat, brickMat, tree, cyl,
} from '../kit'
import { lampPost } from '../props'

export function buildRijks(): Landmark {
  const g = newGroup()
  const R = 12.2
  groundSlab(g, R, grassMat('#5f8d3f'), colorMat('#5a4a36', 1))
  const s = newGroup()
  const brick = '#8f3f2c'
  const trim = '#dcd2ba'
  const wall = bayMat({ bayW: 1.25, floorH: 2.1, floors: 2, brick, trim, style: 'arch' })
  const wallC = bayMat({ bayW: 1.25, floorH: 2.5, floors: 2, brick, trim, style: 'arch' })
  const wallT = bayMat({ bayW: 0.75, floorH: 2.5, floors: 3, brick, trim, style: 'arch' })
  const stone = stoneMat('#d8cfb7')
  const roofTop = colorMat('#6e6a60', 0.9)
  const slate = slateMat('#3f4753')
  const sideOf = (m: THREE.Material) => [m, m, roofTop, roofTop, m, m]

  const H = 4.2
  const HC = 5.0
  // ring of wings: x[-10,10], z[-7,5.5]
  const block = (x0: number, x1: number, z0: number, z1: number, h: number, m: THREE.Material) => box(s, x1 - x0, h, z1 - z0, sideOf(m), (x0 + x1) / 2, 0, (z0 + z1) / 2)
  // front wings
  block(-6.25, -2.5, 1.75, 5.5, H, wall)
  block(2.5, 6.25, 1.75, 5.5, H, wall)
  // back + sides
  block(-6.25, 6.25, -7, -3.25, H, wall)
  block(-10, -6.25, -3.25, 1.75, H, wall)
  block(6.25, 10, -3.25, 1.75, H, wall)
  // corner blocks
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const x0 = sx > 0 ? 6.25 : -10
      const z0 = sz > 0 ? 1.75 : -7
      block(x0, x0 + 3.75, z0, z0 + (sz > 0 ? 3.75 : 3.75), HC, wallC)
      roofHip(s, 4.1, 4.1, 2.3, slate, x0 + 1.875, HC, z0 + 1.875)
      sphere(s, 0.1, goldMat(), x0 + 1.875, HC + 2.45, z0 + 1.875, 1, 1, 1, 8)
    }
  }
  // gable roofs on wings (ridge along x for front/back, along z for sides)
  const ridgeX = (x0: number, x1: number, zc: number, span: number) => {
    const r = new THREE.Group()
    roofGable(r, span, x1 - x0 + 0.1, 1.6, slate, 0, 0, 0)
    r.rotation.y = Math.PI / 2
    r.position.set((x0 + x1) / 2, H, zc)
    s.add(r)
  }
  ridgeX(-6.25, -2.5, 3.625, 4.1)
  ridgeX(2.5, 6.25, 3.625, 4.1)
  ridgeX(-6.25, 6.25, -5.125, 4.1)
  roofGable(s, 4.1, 5.1, 1.6, slate, -8.125, H, -0.75)
  roofGable(s, 4.1, 5.1, 1.6, slate, 8.125, H, -0.75)
  // glass atrium over courtyard
  const atr = new THREE.Group()
  roofGable(atr, 5.2, 12.6, 1.5, glassMat('#a8d2e2'), 0, 0, 0)
  box(atr, 0.08, 0.08, 12.7, steelMat('#d7dce0'), 0, 1.46, 0)
  box(atr, 5.3, 0.06, 0.06, steelMat('#d7dce0'), 0, 0, -6.3)
  box(atr, 5.3, 0.06, 0.06, steelMat('#d7dce0'), 0, 0, 6.3)
  atr.rotation.y = Math.PI / 2
  atr.position.set(0, H, -0.75)
  s.add(atr)
  box(s, 12.5, 0.1, 5, paveMat('#9b9183'), 0, 0, -0.75)

  // ---- central pavilion with passage (extruded with arch hole)
  const shape = new THREE.Shape()
  shape.moveTo(-2.5, 0)
  shape.lineTo(2.5, 0)
  shape.lineTo(2.5, HC)
  shape.lineTo(-2.5, HC)
  shape.closePath()
  const hole = new THREE.Path()
  hole.moveTo(-1.1, 0)
  hole.lineTo(1.1, 0)
  hole.lineTo(1.1, 1.9)
  hole.absarc(0, 1.9, 1.1, 0, Math.PI, false)
  hole.lineTo(-1.1, 0)
  shape.holes.push(hole)
  extrude(s, shape, 3.75, [wallC, brickMat(brick)], 0, 0, 1.75, [0, 0, 0], [1.25, 5.0])
  // stepped gable wall
  const gs = new THREE.Shape()
  const st = [[2.5, 0], [2.5, 0.4], [2.0, 0.4], [2.0, 1.1], [1.5, 1.1], [1.5, 1.8], [1.0, 1.8], [1.0, 2.5], [0.5, 2.5], [0.5, 3.0], [0, 3.5]]
  gs.moveTo(-2.5, 0)
  gs.lineTo(2.5, 0)
  for (const [x, y] of st) gs.lineTo(x, y)
  for (let i = st.length - 1; i >= 0; i--) gs.lineTo(-st[i][0], st[i][1])
  gs.closePath()
  extrude(s, gs, 0.5, [brickMat(brick), brickMat(brick)], 0, HC, 5.0)
  // rose window
  const rose = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.06, 24), stone)
  rose.rotation.x = Math.PI / 2
  rose.position.set(0, HC + 1.1, 5.52)
  s.add(rose)
  const roseG = new THREE.Mesh(new THREE.CircleGeometry(0.4, 24), colorMat('#26384a', 0.1, 0.5))
  roseG.position.set(0, HC + 1.1, 5.56)
  s.add(roseG)
  roofGable(s, 5.2, 3.9, 2.4, slate, 0, HC, 3.65)
  // stone cornice bands on pavilion + wings
  box(s, 5.3, 0.14, 3.95, stone, 0, HC - 0.07, 3.65)

  // ---- towers flanking the passage
  for (const sx of [-1, 1]) {
    box(s, 1.5, 7.5, 1.5, sideOf(wallT), sx * 3.3, 0, 5.0)
    box(s, 1.75, 0.22, 1.75, stone, sx * 3.3, 7.5, 5.0)
    roofHip(s, 1.9, 1.9, 3.4, slate, sx * 3.3, 7.72, 5.0)
    sphere(s, 0.1, goldMat(), sx * 3.3, 11.2, 5.0, 1, 1, 1, 8)
    cyl(s, 0.015, 0.02, 0.5, goldMat(), sx * 3.3, 11.25, 5.0, 4)
    for (const cx of [-1, 1]) for (const cz of [-1, 1]) {
      box(s, 0.18, 0.7, 0.18, stone, sx * 3.3 + cx * 0.82, 7.5, 5.0 + cz * 0.82)
      roofHip(s, 0.24, 0.24, 0.4, slate, sx * 3.3 + cx * 0.82, 8.2, 5.0 + cz * 0.82)
    }
  }
  // dormers on front wings
  for (const sx of [-1, 1]) for (let i = 0; i < 2; i++) {
    const x = sx * (3.4 + i * 1.8)
    box(s, 0.6, 0.6, 0.5, stone, x, H + 0.25, 4.8)
    roofGable(s, 0.8, 0.6, 0.5, slate, x, H + 0.85, 4.8)
  }
  // chimneys
  for (const [x, z] of [[-4.5, 2.5], [4.5, 2.5], [-3, -5.5], [3, -5.5], [-8.1, -2], [8.1, -2]]) box(s, 0.35, 1.3, 0.35, brickMat('#7a3a28'), x, H + 1.0, z)

  // ---- front gardens
  const hedge = colorMat('#2f5a2a', 1)
  const path = paveMat('#b0a597')
  box(s, 2.2, 0.04, 6.4, path, 0, 0, 8.7)
  box(s, 14, 0.04, 1.4, path, 0, 0, 9.4)
  for (const sx of [-1, 1]) {
    for (let j = 0; j < 3; j++) {
      box(s, 4.2, 0.4, 0.4, hedge, sx * 4.6, 0, 6.6 + j * 1.0).scale.x = 0.9 + j * 0.05
    }
    box(s, 0.4, 0.4, 2.4, hedge, sx * 2.7, 0, 7.6)
    box(s, 0.4, 0.4, 2.4, hedge, sx * 6.9, 0, 7.6)
  }
  // flower beds
  const fr = rng(4)
  for (const sx of [-1, 1]) for (let i = 0; i < 30; i++) {
    const c = ['#e8c13a', '#d93a52', '#c24ecf', '#f4f1e8'][i % 4]
    const x = sx * (4.6 + (fr() - 0.5) * 3.4)
    const z = 8.4 + (fr() - 0.5) * 0.6
    sphere(s, 0.1, colorMat(c, 0.8), x, 0.12, z, 1, 0.7, 1, 6)
  }
  // fountain basin
  cyl(s, 0.9, 1.0, 0.25, stone, 0, 0, 10.8, 24)
  cyl(s, 0.72, 0.72, 0.02, colorMat('#3f7a92', 0.1, 0.2), 0, 0.25, 10.8, 24)
  // sculptures
  box(s, 0.6, 0.6, 0.6, stone, -5.6, 0, 10.6)
  box(s, 0.6, 0.6, 0.6, stone, 5.6, 0, 10.6)
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI + Math.PI * 0.0
    const x = Math.cos(a) * 11.0
    const z = Math.sin(a) * 10.4 + 1.5
    if (Math.hypot(x, z) > 11.4) continue
    tree(s, x, z, 3.6 + (i % 3) * 0.4, 'round', i + 11)
  }
  for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) lampPost(s, sx * (1.5 + i * 3.2), 9.9, 1.3)
  // Back trees
  for (let i = 0; i < 6; i++) tree(s, -9 + i * 3.6, -9.6, 3.6, 'round', 40 + i)
  void concreteMat
  void TAU
  bake(s)
  g.add(s)

  return {
    group: g,
    radius: R,
    colliders: [
      [-5.55, 3.625, 4.45, 1.9], [5.55, 3.625, 4.45, 1.9], [-1.85, 3.625, 0.85, 1.9], [1.85, 3.625, 0.85, 1.9],
      [0, -5.125, 10, 1.9], [-8.1, -0.75, 1.9, 2.6], [8.1, -0.75, 1.9, 2.6],
    ],
  }
}

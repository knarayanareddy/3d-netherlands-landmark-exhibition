import * as THREE from 'three'
import {
  Landmark, TAU, bake, beam, box, brickMat, clayRoofMat, colorMat, extrude, glassMat, groundSlab, houseFacade, newGroup, paveMat, rectPoly, roofGable, stoneMat, tree, waterMat, waterRect, woodMat, v3,
} from '../kit'
import { lampPost } from '../props'

type Kind = 'step' | 'bell' | 'neck' | 'spout' | 'cornice'

function profile(kind: Kind, w: number, H: number, g: number): [number, number][] {
  const pts: [number, number][] = [[0, H]]
  if (kind === 'step') {
    const n = 4
    for (let i = 1; i <= n; i++) {
      pts.push([((i - 1) * (w / 2)) / n, H + (g * i) / n])
      pts.push([(i * (w / 2)) / n, H + (g * i) / n])
    }
    pts.pop()
    pts.push([w / 2, H + g])
  } else if (kind === 'bell') {
    for (let i = 1; i <= 16; i++) {
      const t = i / 16
      const x = (w / 2) * t
      const y = t < 0.3 ? 0.18 * (t / 0.3) : 0.18 + 0.82 * Math.pow((t - 0.3) / 0.7, 1.7) * 0 + 0.82 * Math.sin(((t - 0.3) / 0.7) * Math.PI * 0.5)
      pts.push([x, H + g * Math.min(1, y)])
    }
  } else if (kind === 'neck') {
    pts.push([w * 0.08, H + g * 0.1], [w * 0.2, H + g * 0.22], [w * 0.2, H + g * 0.7], [w * 0.3, H + g * 0.72], [w * 0.3, H + g * 0.85], [w / 2, H + g])
  } else if (kind === 'spout') {
    pts.push([w * 0.1, H + g * 0.1], [w * 0.1, H + g * 0.4], [w / 2, H + g])
  } else {
    pts.push([0, H + g * 0.18], [w * 0.2, H + g * 0.18], [w * 0.2, H + g * 0.3], [w / 2, H + g * 0.55])
  }
  return pts
}

export function buildCanal(): Landmark {
  const g = newGroup()
  const R = 9.6
  const stone = stoneMat('#8d8578')
  groundSlab(g, R, paveMat('#8c7a6a'), stone, [rectPoly(-8.5, -1.0, 8.5, 2.8)])
  waterRect(g, -8.5, -1.0, 8.5, 2.8, -0.28, waterMat('#2f4f4a', 0.55))
  const s = newGroup()
  const side = brickMat('#7a3d2c')
  const clay = clayRoofMat('#a44a2b')
  const wood = woodMat('#4a3828')

  const specs: { w: number; floors: number; g: number; kind: Kind; brick: string; trim: string; door: string }[] = [
    { w: 2.3, floors: 4, g: 1.5, kind: 'step', brick: '#8e4331', trim: '#e2d9c3', door: '#2f4a3a' },
    { w: 2.8, floors: 3, g: 1.7, kind: 'bell', brick: '#a8573a', trim: '#e8e0cc', door: '#6a2a24' },
    { w: 2.1, floors: 4, g: 1.4, kind: 'neck', brick: '#6e3a2e', trim: '#d9cfb7', door: '#1f3b57' },
    { w: 2.6, floors: 4, g: 1.3, kind: 'spout', brick: '#9a4e36', trim: '#e6dcc4', door: '#2f4a3a' },
    { w: 2.2, floors: 3, g: 1.2, kind: 'cornice', brick: '#b4694a', trim: '#e9e2d0', door: '#44372a' },
    { w: 2.4, floors: 4, g: 1.7, kind: 'bell', brick: '#85402f', trim: '#dfd6be', door: '#6a2a24' },
  ]
  const floorH = 1.45
  const frontZ = -2.6
  let x = -7.2
  specs.forEach((sp, idx) => {
    const Hb = sp.floors * floorH
    const Ht = Hb + sp.g
    const fac = houseFacade({ w: sp.w, h: Ht, floors: sp.floors, floorH, brick: sp.brick, trim: sp.trim, seed: idx * 5 + 2, door: sp.door })
    const pts = profile(sp.kind, sp.w, Hb, sp.g)
    const shape = new THREE.Shape()
    shape.moveTo(0, 0)
    pts.forEach(([px, py]) => shape.lineTo(px, py))
    for (let i = pts.length - 2; i >= 0; i--) shape.lineTo(sp.w - pts[i][0], pts[i][1])
    shape.lineTo(sp.w, 0)
    shape.closePath()
    extrude(s, shape, 0.35, [fac, side], x, 0, frontZ - 0.35, [0, 0, 0], [sp.w, Ht])
    const cx = x + sp.w / 2
    box(s, sp.w, Hb, 2.3, side, cx, 0, frontZ - 0.35 - 1.15)
    const rh = Math.min(sp.g * 0.8, sp.w * 0.42)
    roofGable(s, sp.w + 0.05, 2.5, rh, clay, cx, Hb, frontZ - 1.5)
    // cornice shadow line
    box(s, sp.w + 0.08, 0.07, 0.12, stoneMat('#cfc5ad'), cx, Hb - 0.02, frontZ + 0.03)
    // hoist beam
    box(s, 0.07, 0.07, 0.6, wood, cx, Ht - 0.12, frontZ + 0.22)
    box(s, 0.025, 0.7, 0.025, colorMat('#222'), cx, Ht - 0.82, frontZ + 0.5)
    // stoop
    const doorX = x + (sp.w > 2.5 ? sp.w / 2 : sp.w / 4)
    box(s, 0.8, 0.12, 0.5, stoneMat('#b3aa97'), doorX, 0, frontZ + 0.22)
    box(s, 0.7, 0.12, 0.3, stoneMat('#b3aa97'), doorX, 0.12, frontZ + 0.12)
    // chimney
    box(s, 0.3, 0.8, 0.3, side, cx + sp.w * 0.25, Hb + rh * 0.5, frontZ - 2.2)
    x += sp.w
  })

  // arched bridge
  const bs = new THREE.Shape()
  bs.moveTo(-1.6, -0.5)
  bs.lineTo(3.4, -0.5)
  bs.lineTo(3.4, 0.5)
  bs.lineTo(-1.6, 0.5)
  bs.closePath()
  const hole = new THREE.Path()
  const hp: [number, number][] = [[-0.7, -0.45], [-0.7, -0.05]]
  for (let i = 1; i <= 24; i++) {
    const a = Math.PI - (i / 24) * Math.PI
    hp.push([0.9 + Math.cos(a) * 1.6, -0.05 + Math.sin(a) * 0.5])
  }
  hp.push([2.5, -0.45])
  hole.moveTo(hp[0][0], hp[0][1])
  hp.slice(1).forEach(([a, b]) => hole.lineTo(a, b))
  hole.closePath()
  bs.holes.push(hole)
  const bridge = extrude(s, bs, 1.7, [brickMat('#8a4c38'), brickMat('#8a4c38')], 0.85, 0.3, 0, [0, 0, 0], [1.76, 1.76])
  bridge.rotation.y = -Math.PI / 2
  box(s, 1.9, 0.08, 5.0, stoneMat('#cfc6b0'), 0, 0.8, 0.9)
  for (const sg of [-1, 1]) {
    box(s, 0.12, 0.35, 5.0, stoneMat('#bdb4a0'), sg * 0.9, 0.85, 0.9)
    beam(s, v3(0, 0.0, -2.2), v3(0, 0.78, -1.5), 1.7, 0.16, paveMat('#8c7a6a'))
    beam(s, v3(0, 0.0, 4.0), v3(0, 0.78, 3.3), 1.7, 0.16, paveMat('#8c7a6a'))
  }
  // bicycles on the bridge
  for (let i = 0; i < 3; i++) {
    const b = newGroup(-0.78, 0.88, -0.4 + i * 0.7)
    for (const zz of [-0.22, 0.22]) {
      const w = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.018, 5, 14), colorMat('#111'))
      w.rotation.y = Math.PI / 2
      w.position.set(0, 0.14, zz)
      b.add(w)
    }
    box(b, 0.03, 0.03, 0.46, colorMat(['#2a3f8a', '#8a2a2a', '#222'][i], 0.4, 0.5), 0, 0.2, 0)
    box(b, 0.03, 0.2, 0.03, colorMat('#222'), 0, 0.2, -0.08)
    s.add(b)
  }

  // trees and lamps
  for (const tx of [-5.2, -1.9, 2.3, 5.6]) tree(s, tx, -1.2, 3.8, 'round', Math.abs(tx) + 1)
  for (const tx of [-7, -3.4, 3.5, 7]) tree(s, tx, 3.4, 3.8, 'round', Math.abs(tx) + 9)
  for (let i = 0; i < 6; i++) lampPost(s, -7 + i * 2.8, -1.1, 1.4)
  for (let i = 0; i < 4; i++) lampPost(s, -6 + i * 4, 3.0, 1.4)
  // benches & parasols on the south quay
  for (const bx of [-5.5, 5.2]) {
    box(s, 0.9, 0.06, 0.28, colorMat('#6a4a2f'), bx, 0.3, 4.2)
    box(s, 0.9, 0.2, 0.05, colorMat('#6a4a2f'), bx, 0.4, 4.35)
  }
  for (let i = 0; i < 5; i++) {
    const px = -3 + i * 1.5
    box(s, 0.55, 0.04, 0.55, colorMat('#2a2a2a', 0.6, 0.4), px, 0.38, 5.2)
    box(s, 0.03, 0.4, 0.03, colorMat('#2a2a2a', 0.6, 0.4), px, 0, 5.2)
    const um = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.22, 8), colorMat(['#c8372d', '#e9e4d6', '#2e5aa8', '#e0a52e', '#2f8a5a'][i], 0.8))
    um.position.set(px, 1.45, 5.2)
    box(s, 0.03, 1.2, 0.03, colorMat('#555'), px, 0.3, 5.2)
    s.add(um)
  }
  bake(s)
  g.add(s)

  // canal boat
  const boat = newGroup(0, -0.2, 0.9)
  box(boat, 2.4, 0.28, 0.72, colorMat('#f0eee6', 0.5), 0, 0, 0)
  box(boat, 2.4, 0.04, 0.74, colorMat('#2a3f6a', 0.5), 0, 0.2, 0)
  box(boat, 1.8, 0.42, 0.62, glassMat('#a9d3e4'), -0.05, 0.28, 0)
  box(boat, 1.85, 0.04, 0.66, colorMat('#f0eee6', 0.5), -0.05, 0.7, 0)
  for (let i = 0; i < 6; i++) box(boat, 0.03, 0.42, 0.03, colorMat('#f0eee6'), -0.9 + i * 0.36, 0.28, 0.3)
  g.add(boat)
  void TAU

  return {
    group: g,
    radius: R,
    colliders: [[0, -4.0, 7.2, 1.4], [-4.75, 0.9, 3.85, 1.85], [4.75, 0.9, 3.85, 1.85]],
    floor: (px, pz) => {
      if (Math.abs(px) > 0.8) return 0
      if (pz >= -1.5 && pz <= 3.3) return 0.85
      if (pz > -2.2 && pz < -1.5) return (0.85 * (pz + 2.2)) / 0.7
      if (pz > 3.3 && pz < 4.0) return (0.85 * (4.0 - pz)) / 0.7
      return 0
    },
    update: (t) => {
      const ph = t * 0.16
      boat.position.x = Math.sin(ph) * 6.2
      boat.rotation.y = Math.cos(ph) > 0 ? 0 : Math.PI
      boat.rotation.z = Math.sin(t * 1.3) * 0.015
      boat.position.y = -0.2 + Math.sin(t * 1.9) * 0.01
    },
  }
}

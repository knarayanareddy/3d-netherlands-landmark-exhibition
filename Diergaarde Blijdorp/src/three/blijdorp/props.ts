import * as THREE from 'three'
import { BuildCtx, TAU, boxGeo, mergeMesh, mesh, rng, wuv } from './util'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/** stylised stone statue of a person (raised arm, or winged angel) */
export function figure(parent: THREE.Object3D, mat: THREE.Material, x: number, y: number, z: number, s = 1, ry = 0, wings = false) {
  const g = new THREE.Group()
  const add = (geo: THREE.BufferGeometry, px: number, py: number, pz: number, rx = 0, rz = 0, sx = 1, sy = 1, sz = 1) => {
    const m = new THREE.Mesh(geo, mat)
    m.position.set(px, py, pz)
    m.rotation.set(rx, 0, rz)
    m.scale.set(sx, sy, sz)
    m.castShadow = true
    m.receiveShadow = true
    g.add(m)
  }
  const leg = new THREE.CylinderGeometry(0.085, 0.06, 0.9, 10)
  add(leg, -0.09, 0.45, 0, 0, 0.04)
  add(leg, 0.09, 0.45, 0.04, 0.12, -0.04)
  add(new THREE.SphereGeometry(0.17, 14, 10), 0, 0.95, 0, 0, 0, 1.1, 0.8, 0.8)
  add(new THREE.CylinderGeometry(0.15, 0.17, 0.55, 14), 0, 1.25, 0)
  add(new THREE.SphereGeometry(0.19, 14, 10), 0, 1.52, 0, 0, 0, 1.1, 0.5, 0.7)
  add(new THREE.CylinderGeometry(0.05, 0.06, 0.12, 8), 0, 1.58, 0)
  add(new THREE.SphereGeometry(0.1, 14, 12), 0, 1.72, 0)
  const arm = new THREE.CylinderGeometry(0.04, 0.035, 0.7, 8)
  add(arm, -0.29, 1.62, 0, 0, 2.7)
  add(arm, 0.24, 1.0, 0.0, 0, 0.18)
  if (wings) {
    const w = new THREE.ConeGeometry(0.3, 1.4, 6)
    add(w, -0.3, 1.5, -0.16, 0.25, 0.7, 0.35, 1, 0.12)
    add(w, 0.3, 1.5, -0.16, 0.25, -0.7, 0.35, 1, 0.12)
  }
  g.position.set(x, y, z)
  g.rotation.y = ry
  g.scale.setScalar(s)
  parent.add(g)
  return g
}

/** stylised stone deer / unicorn */
export function quadruped(parent: THREE.Object3D, mat: THREE.Material, x: number, y: number, z: number, s = 1, ry = 0, horn = false) {
  const g = new THREE.Group()
  const add = (geo: THREE.BufferGeometry, px: number, py: number, pz: number, rx = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat)
    m.position.set(px, py, pz)
    m.rotation.set(rx, 0, rz)
    m.castShadow = true
    m.receiveShadow = true
    g.add(m)
  }
  add(new THREE.CapsuleGeometry(0.26, 0.85, 6, 12), 0, 0.95, 0, Math.PI / 2, 0)
  const leg = new THREE.CylinderGeometry(0.06, 0.04, 0.8, 8)
  for (const [lx, lz] of [[-0.14, 0.45], [0.14, 0.45], [-0.14, -0.45], [0.14, -0.45]]) add(leg, lx, 0.4, lz)
  add(new THREE.CylinderGeometry(0.08, 0.13, 0.65, 10), 0, 1.35, 0.6, 0.55, 0)
  add(new THREE.BoxGeometry(0.15, 0.17, 0.34), 0, 1.65, 0.85, 0.4, 0)
  add(new THREE.CylinderGeometry(0.015, 0.03, 0.4, 5), 0, 0.95, -0.62, -0.5, 0)
  if (horn) add(new THREE.ConeGeometry(0.03, 0.5, 6), 0, 1.98, 0.97, 0.7, 0)
  g.position.set(x, y, z)
  g.rotation.y = ry
  g.scale.setScalar(s)
  parent.add(g)
  return g
}

export function rotBox(ctx: BuildCtx, cx: number, cz: number, w: number, d: number, ry: number, when?: 'tower' | 'today') {
  const c = Math.abs(Math.cos(ry)), s = Math.abs(Math.sin(ry))
  const hx = (w * c + d * s) / 2, hz = (w * s + d * c) / 2
  ctx.colliders.push({ x0: cx - hx, x1: cx + hx, z0: cz - hz, z1: cz + hz, when })
}

export function lampPost(ctx: BuildCtx, x: number, z: number, h = 4.6) {
  const m = ctx.m
  const g = new THREE.Group()
  mesh(g, wuv(new THREE.CylinderGeometry(0.075, 0.11, h, 12)), m.steelDark, 0, h / 2, 0)
  mesh(g, wuv(new THREE.CylinderGeometry(0.16, 0.2, 0.5, 12)), m.steelDark, 0, 0.25, 0)
  mesh(g, wuv(new THREE.CylinderGeometry(0.18, 0.1, 0.16, 12)), m.steelDark, 0, h + 0.05, 0)
  mesh(g, new THREE.SphereGeometry(0.24, 18, 14), m.bulb, 0, h + 0.3, 0, { cast: false })
  mesh(g, new THREE.ConeGeometry(0.3, 0.22, 14), m.steelDark, 0, h + 0.6, 0)
  g.position.set(x, 0, z)
  ctx.root.add(g)
  ctx.colliders.push({ x0: x - 0.2, x1: x + 0.2, z0: z - 0.2, z1: z + 0.2 })
  return g
}

export function bench(ctx: BuildCtx, x: number, z: number, ry = 0, y0 = 0, collide = true) {
  const m = ctx.m
  const g = new THREE.Group()
  const wood = [
    boxGeo(1.9, 0.05, 0.16, 0, 0.45, -0.14),
    boxGeo(1.9, 0.05, 0.16, 0, 0.45, 0.02),
    boxGeo(1.9, 0.05, 0.16, 0, 0.45, 0.18),
    boxGeo(1.9, 0.14, 0.04, 0, 0.7, -0.24),
    boxGeo(1.9, 0.14, 0.04, 0, 0.88, -0.27),
  ]
  mergeMesh(g, m.wood, wood)
  const steel = [boxGeo(0.06, 0.45, 0.5, -0.85, 0, 0), boxGeo(0.06, 0.45, 0.5, 0.85, 0, 0), boxGeo(0.05, 0.55, 0.05, -0.85, 0.45, -0.26), boxGeo(0.05, 0.55, 0.05, 0.85, 0.45, -0.26)]
  mergeMesh(g, m.steelDark, steel)
  g.position.set(x, y0, z)
  g.rotation.y = ry
  ctx.root.add(g)
  if (collide) rotBox(ctx, x, z, 1.9, 0.6, ry)
  return g
}

export function picnicTable(ctx: BuildCtx, x: number, z: number, ry = 0, parent?: THREE.Object3D, when?: 'tower' | 'today') {
  const m = ctx.m
  const g = new THREE.Group()
  const wood = [
    boxGeo(2.2, 0.05, 0.3, 0, 0.76, -0.2), boxGeo(2.2, 0.05, 0.3, 0, 0.76, 0.2), boxGeo(2.2, 0.05, 0.3, 0, 0.76, 0),
    boxGeo(2.2, 0.05, 0.28, 0, 0.45, -0.68), boxGeo(2.2, 0.05, 0.28, 0, 0.45, 0.68),
    boxGeo(0.07, 0.8, 0.07, -0.85, 0, -0.35), boxGeo(0.07, 0.8, 0.07, 0.85, 0, -0.35), boxGeo(0.07, 0.8, 0.07, -0.85, 0, 0.35), boxGeo(0.07, 0.8, 0.07, 0.85, 0, 0.35),
  ]
  mergeMesh(g, m.wood, wood)
  g.position.set(x, 0, z)
  g.rotation.y = ry
  ;(parent ?? ctx.root).add(g)
  rotBox(ctx, x, z, 2.3, 1.8, ry, when)
  return g
}

export function frondGeo(L: number, w: number, rise: number, yaw: number, y0: number) {
  const g = new THREE.PlaneGeometry(w, L, 2, 9)
  const p = g.attributes.position
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), yy = p.getY(i)
    const t = (yy + L / 2) / L
    const r = L * t
    const y = r * rise - (0.95 * r * r) / L
    p.setXYZ(i, x, y, r)
  }
  g.computeVertexNormals()
  g.rotateY(yaw)
  g.translate(0, y0, 0)
  return g
}

export function palm(m: BuildCtx['m'], h: number, seed: number) {
  const r = rng(seed)
  const g = new THREE.Group()
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.1 * (h / 4), 0.19 * (h / 4), h, 12), m.bark)
  trunk.position.y = h / 2
  trunk.castShadow = true
  g.add(trunk)
  const fr: THREE.BufferGeometry[] = []
  const n = 13
  for (let i = 0; i < n; i++) {
    const L = (1.8 + r() * 0.9) * (0.55 + h / 6)
    fr.push(frondGeo(L, L * 0.55, 0.55 + r() * 0.35, (i / n) * TAU + r() * 0.3, h - 0.05))
  }
  const crown = new THREE.Mesh(mergeGeometries(fr, false)!, m.palm)
  crown.castShadow = true
  g.add(crown)
  return g
}

/** loose plant clump made of big tropical leaves */
export function leafClump(m: BuildCtx['m'], r: () => number, n: number, spread: number, size: number) {
  const geos: THREE.BufferGeometry[] = []
  for (let i = 0; i < n; i++) {
    const g = new THREE.PlaneGeometry(size * (0.7 + r() * 0.7), size * (0.9 + r() * 0.8), 1, 1)
    g.translate(0, (size * 0.9) / 2, 0)
    g.rotateX(-0.35 - r() * 0.7)
    g.rotateY(r() * TAU)
    g.translate((r() - 0.5) * spread, 0, (r() - 0.5) * spread)
    geos.push(g)
  }
  const mm = new THREE.Mesh(mergeGeometries(geos, false)!, m.bigLeaf)
  mm.castShadow = true
  return mm
}

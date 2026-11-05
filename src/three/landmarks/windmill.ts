import * as THREE from 'three'
import { bake, box, brickMat, colorMat, cyl, newGroup, sphere, thatchMat, woodMat, beam, v3 } from '../kit'

export interface Windmill {
  group: THREE.Group
  update: (dt: number) => void
}

/** Traditional Dutch smock/tower mill with lattice sails. Faces +z. */
export function windmill(o: { h: number; rBase: number; kind: 'thatch' | 'brick'; speed: number; phase?: number }): Windmill {
  const { h, rBase } = o
  const g = newGroup()
  const rTop = rBase * 0.58
  const brick = brickMat(o.kind === 'brick' ? '#8a3c2a' : '#7e4030')
  const thatch = thatchMat(o.kind === 'thatch' ? '#9b8550' : '#8a7448')
  const tar = colorMat('#1d1b19', 0.9)
  const wood = woodMat('#5d4a37')
  const white = colorMat('#eee8d8', 0.7)
  const body = o.kind === 'thatch' ? thatch : brick
  const seg = o.kind === 'thatch' ? 8 : 20
  const rAt = (y: number) => rBase + (rTop - rBase) * Math.max(0, Math.min(1, (y - h * 0.14) / (h * 0.78)))

  cyl(g, rBase * 1.04, rBase * 1.14, h * 0.14, brick, 0, 0, 0, 20)
  cyl(g, rTop, rBase, h * 0.78, body, 0, h * 0.14, 0, seg)
  if (o.kind === 'thatch') {
    for (const f of [0.3, 0.55, 0.78]) {
      const y = h * (0.14 + 0.78 * f)
      cyl(g, rAt(y) + 0.04, rAt(y) + 0.04, 0.06, wood, 0, y, 0, 8)
    }
  } else {
    for (const f of [0.35, 0.7]) {
      const y = h * (0.14 + 0.78 * f)
      cyl(g, rAt(y) + 0.02, rAt(y) + 0.02, 0.05, white, 0, y, 0, 20)
    }
  }
  // gallery
  const gy = h * 0.4
  const rg = rAt(gy) + 0.55
  cyl(g, rg, rg, 0.07, wood, 0, gy, 0, 16)
  cyl(g, rg, rg, 0.24, wood, 0, gy + 0.07, 0, 16, true).material = wood
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    beam(g, v3(Math.cos(a) * rAt(gy - 0.5), gy - 0.55, Math.sin(a) * rAt(gy - 0.5)), v3(Math.cos(a) * rg * 0.96, gy, Math.sin(a) * rg * 0.96), 0.05, 0.05, wood)
  }
  // door, windows
  box(g, rBase * 0.55, h * 0.12, 0.12, tar, 0, 0, rBase * 1.12)
  for (const y of [0.55, 0.74]) box(g, 0.2, 0.28, 0.08, white, 0, h * y, rAt(h * y) * 0.97 + 0.02)
  // cap
  const capY = h * 0.92
  sphere(g, rTop * 1.3, o.kind === 'thatch' ? thatch : tar, 0, capY, 0, 1, 0.8, 1.35, 20)
  cyl(g, 0.03, 0.03, rTop * 0.5, white, 0, capY + rTop * 0.95, 0, 5)
  // tail pole
  const top = v3(0, capY - 0.05, -rTop * 1.2)
  const foot = v3(0, 0.3, -h * 0.82)
  beam(g, top, foot, 0.1, 0.1, wood)
  box(g, 0.08, 0.5, 0.08, wood, foot.x + 0.35, 0, foot.z)
  box(g, 0.08, 0.5, 0.08, wood, foot.x - 0.35, 0, foot.z)
  box(g, 0.8, 0.07, 0.07, wood, 0, 0.42, foot.z)
  bake(g)

  // sails
  const hub = newGroup(0, capY + 0.02, rTop * 1.72)
  hub.rotation.x = -0.17
  const wheel = newGroup()
  const L = h * 0.7
  for (let k = 0; k < 4; k++) {
    const arm = newGroup()
    arm.rotation.z = (k * Math.PI) / 2
    box(arm, 0.13, L, 0.1, wood, 0, 0.2, 0)
    box(arm, 0.05, L * 0.8, 0.045, white, 0.8, L * 0.18, 0.06)
    box(arm, 0.05, L * 0.8, 0.045, white, 0.1, L * 0.18, 0.06)
    const bars = Math.floor((L * 0.8) / 0.2)
    for (let b = 0; b <= bars; b++) box(arm, 0.78, 0.035, 0.04, white, 0.45, L * 0.18 + b * 0.2, 0.065)
    box(arm, 0.06, 0.04, 0.03, wood, 0.45, L * 0.18, 0.06)
    wheel.add(arm)
  }
  sphere(wheel, 0.2, wood, 0, 0, 0.05, 1, 1, 1.4, 10)
  bake(wheel)
  hub.add(wheel)
  g.add(hub)
  wheel.rotation.z = o.phase ?? 0
  return {
    group: g,
    update: (dt) => {
      wheel.rotation.z -= dt * o.speed
    },
  }
}

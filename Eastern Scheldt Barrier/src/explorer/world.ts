import { fbm, mix, smoothstep } from './noise'

/* All units are metres. +x runs along the barrier (west -> east), +z is the North Sea side,
   -z is the sheltered Eastern Scheldt side. Mean sea level is y = 0. */

export const PITCH = 45 // centre-to-centre distance of the piers (real: 45 m)
export const N_PIERS = 23 // modelled stretch (real barrier has 65 piers / 62 gates over 9 km)
export const BARRIER_X1 = (N_PIERS - 1) * PITCH // 990

export const ROAD_Z = -4
export const DECK_Y = 14
export const DECK_HALF = 6.5
export const WALK_HALF = 5.7

export const PIER_HALF_X = 2.5
export const PIER_Z0 = -11
export const PIER_Z1 = 13

export const GATE_LEN = 39.4
export const GATE_H = 11
export const GATE_Z = 5.0
export const GATE_OPEN_Y = 0.9
export const GATE_CLOSED_Y = -6.8

export const PLATEAU = 3.3
export const ROAD_GROUND = 3.4

export const ISLANDS = [
  { cx: -420, cz: 0, rx: 280, rz: 170, seed: 3 },
  { cx: 1410, cz: 0, rx: 280, rz: 170, seed: 8 },
]

export const WEST_RAMP: [number, number] = [-380, -150]
export const EAST_RAMP: [number, number] = [1140, 1370]
export const ROAD_X0 = -598
export const ROAD_X1 = 1588

function landField(x: number, z: number) {
  let e = -9
  for (const il of ISLANDS) {
    const dx = (x - il.cx) / il.rx
    const dz = (z - il.cz) / il.rz
    const wob = (fbm(x * 0.006 + il.seed, z * 0.006, 3, il.seed) - 0.5) * 0.34
    e = Math.max(e, 1 - Math.sqrt(dx * dx + dz * dz) + wob)
  }
  return e
}

export function terrainH(x: number, z: number) {
  const e = landField(x, z)
  let h: number
  if (e < 0.04) h = Math.max((e - 0.04) * 22, -9)
  else h = PLATEAU * smoothstep(0.04, 0.17, e)
  const dz = Math.abs(z - ROAD_Z)
  const corr = smoothstep(18, 60, dz)
  const inland = smoothstep(0.2, 0.5, e)
  const dunes = (fbm(x * 0.011, z * 0.011, 4, 5) - 0.42) * 7.5 + (fbm(x * 0.05, z * 0.05, 3, 9) - 0.5) * 1.3
  h += Math.max(dunes, -1.2) * inland * corr
  // low shelf where the visitor centre sits stays flat
  const vx = (x + 520) / 70
  const vz = (z + 85) / 40
  const flat = 1 - smoothstep(0.8, 1.6, Math.sqrt(vx * vx + vz * vz))
  h = mix(h, PLATEAU + 0.1, flat)
  // wooded dune ridges that close off the far ends of the model, with a cutting for the road
  const cut = smoothstep(9, 22, dz)
  h += 15 * (smoothstep(-575, -612, x) + smoothstep(1560, 1597, x)) * cut * smoothstep(0.02, 0.12, e)
  return h
}

export function roadY(x: number) {
  if (x <= WEST_RAMP[0]) return ROAD_GROUND
  if (x < WEST_RAMP[1]) return mix(ROAD_GROUND, DECK_Y, smoothstep(WEST_RAMP[0], WEST_RAMP[1], x))
  if (x <= EAST_RAMP[0]) return DECK_Y
  if (x < EAST_RAMP[1]) return mix(DECK_Y, ROAD_GROUND, smoothstep(EAST_RAMP[0], EAST_RAMP[1], x))
  return ROAD_GROUND
}

/** the walkable surface at (x,z) or null if blocked (water / railings / outside the model) */
export function groundAt(x: number, z: number): number | null {
  if (x < ROAD_X0 + 10 || x > ROAD_X1 - 10) return null
  const dz = Math.abs(z - ROAD_Z)
  if (x > WEST_RAMP[0] && x < EAST_RAMP[1]) return dz <= WALK_HALF ? roadY(x) : null
  const h = terrainH(x, z)
  return h < -0.35 ? null : Math.max(h, dz < DECK_HALF + 1 ? roadY(x) : -9)
}

/* simple 2D colliders on the island (x0,z0,x1,z1) and circles (x,z,r) */
export const BOXES: [number, number, number, number][] = [
  [-566, -102, -474, -68], // visitor centre
  [-446, -37, -434, -29], // plaque
]
export const CIRCLES: [number, number, number][] = [
  [-560, 90, 5],
  [-620 + 40, -30, 5],
  [-520, -150, 5],
  [-470, 130, 5],
]
export function blockedWalk(x: number, z: number) {
  for (const b of BOXES) if (x > b[0] - 0.8 && x < b[2] + 0.8 && z > b[1] - 0.8 && z < b[3] + 0.8) return true
  for (const c of CIRCLES) if ((x - c[0]) ** 2 + (z - c[1]) ** 2 < (c[2] + 0.6) ** 2) return true
  return false
}

export const pierX = (i: number) => i * PITCH

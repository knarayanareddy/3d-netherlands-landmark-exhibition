import * as THREE from 'three'

/** Layout constants, metres. +z = Museumplein (front), x = east/west. */
export const C = {
  HW: 68, // half width of the building
  HD: 50, // half depth
  PW: 5.5, // half width of the passage
  L1: 8, // first floor level
  AX0: 8, AX1: 40, AZ: 17, // atrium bounds (east; west is mirrored)
  GZ0: -36, GZ1: 16, // Gallery of Honour z range
  DOOR: 3.5, // half width of tunnels / doorways between passage and atria
  RISER: 8 / 45,
  STAIR_Z0: -1, STAIR_Z1: 13,
}

export interface Collider { x0: number; x1: number; z0: number; z1: number; y0: number; y1: number }
export interface Surface { x0: number; x1: number; z0: number; z1: number; h: (x: number, z: number) => number }
export interface POI {
  id: string
  title: string
  kicker: string
  text: string
  pos: [number, number, number] // where the marker sits (world)
  radius: number // trigger radius
  view: { x: number; y: number; z: number; yaw: number; pitch: number } // teleport target (eye position)
}
export interface Lamp { light: THREE.Light; base: number; night?: number }

export interface World {
  group: THREE.Group
  colliders: Collider[]
  surfaces: Surface[]
  pois: POI[]
  lamps: Lamp[]
  updaters: ((t: number, dt: number) => void)[]
  waterMats: THREE.Material[]
}

export function newWorld(): World {
  return { group: new THREE.Group(), colliders: [], surfaces: [], pois: [], lamps: [], updaters: [], waterMats: [] }
}

export type Zone = 'outside' | 'passage' | 'atrium' | 'gallery'

export function zoneAt(x: number, y: number, z: number): Zone {
  const ax = Math.abs(x)
  if (y > C.L1 - 0.5 && ax < C.PW + 0.5 && z > C.GZ0 && z < C.GZ1 + 0.5) return 'gallery'
  if (y > C.L1 - 0.5 && ax < C.AX1 && ax > C.AX0 - 3 && Math.abs(z) < C.AZ) return 'atrium'
  if (ax > C.AX0 && ax < C.AX1 && Math.abs(z) < C.AZ) return 'atrium'
  if (ax < C.PW + 0.2 && Math.abs(z) < C.HD + 1.5) return 'passage'
  if (ax > C.PW && ax < C.AX0 && Math.abs(z) < C.DOOR + 0.2) return 'passage'
  return 'outside'
}

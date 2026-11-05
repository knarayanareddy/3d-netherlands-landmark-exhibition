import type * as THREE from 'three'

export interface Box {
  x0: number
  x1: number
  z0: number
  z1: number
  y0: number
  y1: number
}

/** Anything that contributes geometry + physics to the world. */
export interface Part {
  group: THREE.Object3D
  colliders: Box[]
  /** extra walkable surfaces: return a floor height candidate or null */
  floors: ((x: number, z: number, feetY: number) => number | null)[]
  /** extra blocking tests */
  blockers: ((x: number, z: number, feetY: number) => boolean)[]
  update?: (t: number, dt: number, camera: THREE.Camera) => void
}

export interface WindUniform {
  value: number
}

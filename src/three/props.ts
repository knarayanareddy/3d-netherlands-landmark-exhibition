import * as THREE from 'three'
import { bake, box, colorMat, cyl, newGroup, registerGlow } from './kit'

let lampM: THREE.MeshStandardMaterial | null = null
function lampMat() {
  if (!lampM) {
    lampM = new THREE.MeshStandardMaterial({ color: '#e9e4d8', emissive: new THREE.Color('#ffd7a0'), roughness: 0.4 })
    registerGlow(lampM, 3)
  }
  return lampM
}

export function lampPost(g: THREE.Object3D, x: number, z: number, h = 1.5, y = 0) {
  const dark = colorMat('#2b2f33', 0.5, 0.6)
  cyl(g, 0.022, 0.035, h, dark, x, y, z, 6)
  box(g, 0.26, 0.035, 0.1, dark, x, y + h, z)
  box(g, 0.2, 0.03, 0.07, lampMat(), x, y + h - 0.03, z)
}

export function car(color: string) {
  const g = newGroup()
  const body = colorMat(color, 0.35, 0.5)
  const glass = colorMat('#16212b', 0.1, 0.6)
  const tyre = colorMat('#111', 0.9)
  box(g, 0.92, 0.2, 0.42, body, 0, 0.08, 0)
  box(g, 0.5, 0.17, 0.38, glass, -0.06, 0.27, 0)
  box(g, 0.46, 0.03, 0.36, body, -0.06, 0.43, 0)
  for (const x of [-0.28, 0.28]) {
    for (const z of [-0.2, 0.2]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.07, 10), tyre)
      w.rotation.x = Math.PI / 2
      w.position.set(x, 0.08, z)
      g.add(w)
    }
  }
  const head = colorMat('#fff6d0', 0.3)
  box(g, 0.03, 0.05, 0.08, head, 0.46, 0.15, 0.13)
  box(g, 0.03, 0.05, 0.08, head, 0.46, 0.15, -0.13)
  bake(g)
  return g
}

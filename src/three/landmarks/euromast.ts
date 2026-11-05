import * as THREE from 'three'
import {
  Landmark, TAU, bake, box, colorMat, concreteMat, cyl, glassMat, grassMat, groundSlab, newGroup, paveMat, registerGlow, steelMat, tree, tube, v3,
} from '../kit'
import { lampPost } from '../props'

export function buildEuromast(): Landmark {
  const g = newGroup()
  const R = 9
  groundSlab(g, R, grassMat('#5b8a3d'), colorMat('#5a4a36', 1))
  const s = newGroup()
  const conc = concreteMat('#c6c4bc')
  const concDS = conc.clone()
  concDS.side = THREE.DoubleSide
  const steel = steelMat('#dfe3e6')
  const red = colorMat('#c8281e', 0.5, 0.2)
  const white = colorMat('#f0f0ee', 0.5, 0.2)
  const nestGlass = glassMat('#9cc3d6').clone() as THREE.MeshPhysicalMaterial
  nestGlass.emissive = new THREE.Color('#ffcf8a')
  registerGlow(nestGlass, 0.9)

  // plaza + paths
  cyl(s, 4.6, 4.6, 0.05, paveMat('#a79d8f'), 0, 0, 0, 48)
  box(s, 1.3, 0.05, 5, paveMat('#a79d8f'), 0, 0, 6)

  // base & shaft
  cyl(s, 1.0, 1.7, 1.0, conc, 0, 0, 0, 24)
  cyl(s, 0.6, 1.0, 10.3, conc, 0, 1.0, 0, 24)
  // vertical shadow slits on shaft
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU
    box(s, 0.03, 8.4, 0.03, colorMat('#8d8b84', 0.9), Math.cos(a) * 0.82, 1.8, Math.sin(a) * 0.82).rotation.y = 0
  }
  // entrance pavilion
  box(s, 3.2, 1.0, 1.4, glassMat('#8fb7cc'), 0, 0, 2.0)
  box(s, 3.5, 0.14, 1.7, conc, 0, 1.0, 2.0)
  for (let i = 0; i < 5; i++) box(s, 0.06, 1.0, 0.06, steel, -1.5 + i * 0.75, 0, 2.72)

  // crow's nest bowl
  const bowl = [[0.6, 11.2], [0.85, 11.35], [1.3, 11.7], [1.75, 12.2], [1.96, 12.7]].map(([x, y]) => new THREE.Vector2(x, y))
  const bowlM = new THREE.Mesh(new THREE.LatheGeometry(bowl, 36), concDS)
  bowlM.castShadow = bowlM.receiveShadow = true
  s.add(bowlM)
  cyl(s, 1.96, 1.96, 0.8, nestGlass, 0, 12.7, 0, 36, true)
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * TAU
    box(s, 0.05, 0.8, 0.05, steel, Math.cos(a) * 1.97, 12.7, Math.sin(a) * 1.97)
  }
  cyl(s, 2.2, 2.0, 0.2, conc, 0, 13.5, 0, 36)
  cyl(s, 2.15, 2.15, 0.1, steel, 0, 13.68, 0, 36)
  // upper drum
  cyl(s, 1.1, 1.1, 0.7, nestGlass, 0, 13.78, 0, 28, true)
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU
    box(s, 0.04, 0.7, 0.04, steel, Math.cos(a) * 1.11, 13.78, Math.sin(a) * 1.11)
  }
  cyl(s, 1.3, 1.15, 0.16, conc, 0, 14.48, 0, 28)

  // space tower lattice
  const y0 = 14.64
  const y1 = 20.6
  const rAt = (y: number) => 0.62 + (0.17 - 0.62) * ((y - y0) / (y1 - y0))
  const leg = (i: number, y: number) => v3(Math.cos((i / 3) * TAU) * rAt(y), y, Math.sin((i / 3) * TAU) * rAt(y))
  for (let i = 0; i < 3; i++) tube(s, leg(i, y0), leg(i, y1), 0.045, steel, 6)
  const lv = [y0, 15.5, 16.5, 17.5, 18.5, 19.6, y1]
  for (let k = 0; k < lv.length; k++) {
    for (let i = 0; i < 3; i++) {
      tube(s, leg(i, lv[k]), leg((i + 1) % 3, lv[k]), 0.022, steel, 4)
      if (k < lv.length - 1) tube(s, leg(i, lv[k]), leg((i + 1) % 3, lv[k + 1]), 0.018, steel, 4)
    }
  }
  cyl(s, 0.34, 0.3, 0.14, steelMat('#44494d'), 0, y1, 0, 12)
  for (let i = 0; i < 7; i++) cyl(s, 0.05 - i * 0.003, 0.055 - i * 0.003, 0.5, i % 2 ? white : red, 0, y1 + 0.14 + i * 0.5, 0, 8)
  bake(s)
  g.add(s)

  // euroscope capsule
  const cap = newGroup()
  const capGlass = glassMat('#b6d8e6')
  cyl(cap, 0.72, 0.72, 0.62, capGlass, 0, 0, 0, 24, true)
  cyl(cap, 0.78, 0.78, 0.07, steelMat('#dfe3e6'), 0, 0.62, 0, 24)
  cyl(cap, 0.78, 0.78, 0.07, steelMat('#dfe3e6'), 0, -0.05, 0, 24)
  for (let i = 0; i < 10; i++) box(cap, 0.04, 0.62, 0.04, steelMat('#dfe3e6'), Math.cos((i / 10) * TAU) * 0.73, 0, Math.sin((i / 10) * TAU) * 0.73)
  g.add(cap)

  // beacon
  const beaconM = new THREE.MeshStandardMaterial({ color: '#ff3b2b', emissive: new THREE.Color('#ff1a0a'), emissiveIntensity: 2 })
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), beaconM)
  beacon.position.y = y1 + 0.14 + 3.5 + 0.1
  g.add(beacon)

  // landscaping
  const st = newGroup()
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * TAU + 0.3
    const rr = 6.4 + (i % 3) * 0.9
    const x = Math.cos(a) * rr
    const z = Math.sin(a) * rr
    if (Math.abs(x) < 1 && z > 3) continue
    tree(st, x, z, 3.4 + (i % 4) * 0.4, i % 5 === 0 ? 'pine' : 'round', i + 1)
  }
  for (const [x, z] of [[-1.5, 5.2], [1.5, 5.2], [-1.5, 8], [1.5, 8], [-3.4, 3.6], [3.4, 3.6]]) lampPost(st, x, z, 1.3)
  bake(st)
  g.add(st)

  return {
    group: g,
    radius: R,
    colliders: [[0, 0, 1.3, 1.3], [0, 2, 1.7, 0.8]],
    update: (t) => {
      const k = 0.5 - 0.5 * Math.cos(t * 0.22)
      cap.position.y = 14.78 + k * 4.5
      cap.rotation.y = t * 0.4
      beaconM.emissiveIntensity = Math.sin(t * 3) > 0 ? 3 : 0.3
    },
  }
}

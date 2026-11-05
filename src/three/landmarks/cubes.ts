import * as THREE from 'three'
import { Landmark, TAU, asphaltMat, bake, box, colorMat, concreteMat, cyl, groundSlab, newGroup, paveMat, panelMat, tree } from '../kit'
import { car, lampPost } from '../props'

export function buildCubes(): Landmark {
  const g = newGroup()
  const R = 9.2
  groundSlab(g, R, paveMat('#9a8f82'), colorMat('#6e6659', 1))
  const s = newGroup()
  const conc = concreteMat('#b9b6ad')
  const wall = panelMat({ base: '#e2b73c', kind: 'wall' })
  const roof = panelMat({ base: '#3d444c', kind: 'roof' })
  const mats = [roof, wall, roof, wall, roof, wall]

  // road
  box(s, 18, 0.04, 2.2, asphaltMat('#2f3236'), 0, 0, 0)
  for (let i = 0; i < 9; i++) box(s, 0.7, 0.012, 0.06, colorMat('#e9e9e2', 0.7), -8 + i * 2, 0.04, 0)
  box(s, 18, 0.05, 0.4, paveMat('#a79d8f'), 0, 0, 1.3)
  box(s, 18, 0.05, 0.4, paveMat('#a79d8f'), 0, 0, -1.3)

  const S = 2.7
  const diag = S * Math.sqrt(3)
  const tilt = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 1, 1).normalize(), new THREE.Vector3(0, 1, 0))
  const PH = 3.1
  const spots: [number, number][] = []
  for (let i = 0; i < 5; i++) spots.push([-6.6 + i * 3.3, -3.0])
  for (let i = 0; i < 4; i++) spots.push([-4.95 + i * 3.3, 3.0])
  const cubes: THREE.Mesh[] = []
  for (const [x, z] of spots) {
    // hexagonal pylon
    cyl(s, 0.75, 0.95, PH, conc, x, 0, z, 6)
    cyl(s, 0.5, 0.75, 0.0001, conc, x, PH, z, 6)
    box(s, 0.5, PH * 0.7, 0.04, colorMat('#23282d', 0.5), x, 0.2, z + 0.78).rotation.y = 0
    const cube = new THREE.Mesh(new THREE.BoxGeometry(S, S, S), mats)
    cube.quaternion.copy(tilt)
    cube.position.set(x, PH - 0.2 + diag / 2, z)
    cube.castShadow = cube.receiveShadow = true
    g.add(cube)
    cubes.push(cube)
    // roof edge trim: small cap at the top vertex
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.25, 6), colorMat('#2c3238', 0.6))
    cap.position.set(x, PH - 0.2 + diag + 0.05, z)
    g.add(cap)
  }
  // plaza trees, benches, lamps
  const rr = 8.4
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU + 0.15
    const x = Math.cos(a) * rr
    const z = Math.sin(a) * rr * 0.95
    tree(s, x, z, 3.3 + (i % 3) * 0.4, 'round', i + 1)
  }
  for (let i = 0; i < 6; i++) lampPost(s, -7.5 + i * 3, 1.6, 1.3)
  for (let i = 0; i < 3; i++) {
    const b = newGroup(-4 + i * 4, 0, -1.55)
    box(b, 0.9, 0.06, 0.28, colorMat('#6a4a2f'), 0, 0.3, 0)
    box(b, 0.9, 0.2, 0.05, colorMat('#6a4a2f'), 0, 0.4, -0.13)
    box(b, 0.05, 0.3, 0.22, colorMat('#222'), -0.4, 0, 0)
    box(b, 0.05, 0.3, 0.22, colorMat('#222'), 0.4, 0, 0)
    s.add(b)
  }
  bake(s)
  g.add(s)

  const cars = ['#c33b2b', '#2e5aa8', '#e9e9e4', '#3c3f45'].map((c, i) => {
    const m = car(c)
    g.add(m)
    return { m, dir: i % 2 ? 1 : -1, off: i * 4.6 }
  })

  return {
    group: g,
    radius: R,
    colliders: spots.map(([x, z]) => [x, z, 1.0, 1.0] as [number, number, number, number]),
    update: (t) => {
      for (const c of cars) {
        const L = 19
        const x = ((((t * 1.4 * c.dir + c.off) % L) + L) % L) - L / 2
        c.m.position.set(x, 0.04, c.dir * 0.5)
        c.m.rotation.y = c.dir > 0 ? 0 : Math.PI
      }
    },
  }
}

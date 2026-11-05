import * as THREE from 'three'
import {
  Landmark, TAU, asphaltMat, bake, box, colorMat, concreteMat, discPoly, extrude, groundSlab, newGroup, rng, rockMat, steelMat, waterMat, waterPoly, cyl, registerGlow,
} from '../kit'
import { lampPost } from '../props'

const DECK_TOP = 3.45

export function buildOosterschelde(): Landmark {
  const g = newGroup()
  const R = 11
  const conc = concreteMat('#aeb0ad')
  const rock = rockMat()
  groundSlab(g, R, rock, conc, [discPoly(0, 0, 9.7, 96)])
  waterPoly(g, discPoly(0, 0, 9.7, 96), -0.26, waterMat('#2a5262', 1.3))

  const s = newGroup()
  const n = 7
  const pitch = 3.2
  const gateM = steelMat('#6f8392', 0.5)
  const ribM = steelMat('#3d4a55', 0.55)

  // piers: trapezoid profile (z,y), extruded along x
  const prof = new THREE.Shape()
  prof.moveTo(-1.9, -0.5)
  prof.lineTo(1.9, -0.5)
  prof.lineTo(1.35, 3.15)
  prof.lineTo(-1.35, 3.15)
  prof.closePath()
  const gates: THREE.Group[] = []
  for (let i = 0; i < n; i++) {
    const cx = (i - (n - 1) / 2) * pitch
    const pier = extrude(s, prof, 1.3, [conc, conc], cx + 0.65, 0, 0, [0, 0, 0], [5, 5])
    pier.rotation.y = -Math.PI / 2
    box(s, 1.5, 0.22, 3.0, conc, cx, 3.1, 0)
    // gate slot recesses
    box(s, 0.08, 2.7, 1.5, colorMat('#2c3238', 0.7), cx - 0.66, 0.4, 0)
    box(s, 0.08, 2.7, 1.5, colorMat('#2c3238', 0.7), cx + 0.66, 0.4, 0)
    if (i < n - 1) {
      const gx = cx + pitch / 2
      const gate = newGroup(gx, 0, 0)
      box(gate, 1.72, 2.25, 0.24, gateM, 0, 0, 0)
      for (let k = 0; k < 6; k++) box(gate, 1.74, 0.09, 0.34, ribM, 0, 0.1 + k * 0.4, 0)
      for (let k = 0; k < 5; k++) box(gate, 0.08, 2.2, 0.32, ribM, -0.7 + k * 0.35, 0, 0)
      bake(gate)
      gate.position.y = 0.9
      gates.push(gate)
      s.add(gate)
    }
  }
  // road deck on top
  const len = (n - 1) * pitch + 1.3 + 1.2
  const asph = asphaltMat('#2f3236')
  box(s, len, 0.3, 1.9, [conc, conc, asph, conc, conc, conc], 0, 3.15, 0)
  box(s, len, 0.012, 0.05, colorMat('#e8e8e0', 0.7), 0, DECK_TOP, 0)
  for (const z of [-0.88, 0.88]) {
    box(s, len, 0.07, 0.05, steelMat('#d4d9dd'), 0, DECK_TOP + 0.3, z)
    box(s, len, 0.05, 0.05, steelMat('#d4d9dd'), 0, DECK_TOP + 0.12, z)
    for (let i = 0; i <= 30; i++) box(s, 0.03, 0.34, 0.03, steelMat('#d4d9dd'), -len / 2 + 0.2 + (i * (len - 0.4)) / 30, DECK_TOP - 0.04, z)
  }
  for (let i = 0; i < n; i++) lampPost(s, (i - (n - 1) / 2) * pitch, 0.85, 1.4, DECK_TOP)
  // end lighthouses
  for (const sx of [-1, 1]) {
    const x = sx * 9.9
    cyl(s, 0.28, 0.4, 3.0, colorMat('#f1f0ec', 0.6), x, 0, 1.4, 12)
    cyl(s, 0.36, 0.36, 0.5, colorMat('#c8281e', 0.6), x, 3.0, 1.4, 12)
    cyl(s, 0.45, 0.4, 0.1, colorMat('#2a2d30', 0.6), x, 2.95, 1.4, 12)
  }
  // control building
  box(s, 1.8, 1.0, 1.4, colorMat('#eceae4', 0.7), -9.0, 0, -1.9)
  box(s, 1.9, 0.12, 1.5, colorMat('#4a4f55', 0.6), -9.0, 1.0, -1.9)
  box(s, 1.5, 0.35, 0.05, colorMat('#2a3c4a', 0.1, 0.5), -9.0, 0.45, -1.18)

  // rocks along the rim
  const rr = rng(8)
  const N = 170
  const rg = new THREE.IcosahedronGeometry(1, 0)
  const rocks = new THREE.InstancedMesh(rg, colorMat('#4a4d52', 0.95), N)
  const m4 = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  for (let i = 0; i < N; i++) {
    const a = (i / N) * TAU
    const r = 9.7 + rr() * 0.4
    const sc = 0.22 + rr() * 0.32
    q.setFromEuler(new THREE.Euler(rr() * 3, rr() * 3, rr() * 3))
    m4.compose(new THREE.Vector3(Math.cos(a) * r, 0.05 + sc * 0.3, Math.sin(a) * r), q, new THREE.Vector3(sc * 1.3, sc, sc * 1.1))
    rocks.setMatrixAt(i, m4)
  }
  rocks.castShadow = true
  rocks.receiveShadow = true
  g.add(rocks)

  // warning beacons on piers
  const beacon = new THREE.MeshStandardMaterial({ color: '#ff6a3a', emissive: new THREE.Color('#ff3b1a') })
  registerGlow(beacon, 3)
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), beacon)
    m.position.set((i - (n - 1) / 2) * pitch, DECK_TOP + 1.0, 0)
    s.add(m)
    const pole = box(s, 0.03, 0.9, 0.03, steelMat('#d4d9dd'), (i - (n - 1) / 2) * pitch, DECK_TOP, 0)
    pole.castShadow = false
  }
  bake(s)
  g.add(s)

  return {
    group: g,
    radius: R,
    colliders: [[0, -5.4, 10, 4.35], [0, 5.4, 10, 4.35]],
    floor: (x, z) => (Math.abs(z) < 1.0 && Math.abs(x) < len / 2 ? DECK_TOP : 0),
    update: (t) => {
      // slow storm-surge cycle: gates lower, then rise again
      const k = Math.max(0, Math.min(1, Math.sin(t * 0.18) * 1.6 + 0.5))
      const sm = k * k * (3 - 2 * k)
      gates.forEach((gt) => (gt.position.y = 0.95 - sm * 1.25))
    },
  }
}

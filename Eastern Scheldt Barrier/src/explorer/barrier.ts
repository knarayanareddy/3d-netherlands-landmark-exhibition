import * as THREE from 'three'
import { Parts, beamG, boxG, cylG, profileX, type Mats } from './kit'
import { smoothstep } from './noise'
import { GATE_CLOSED_Y, GATE_LEN, GATE_OPEN_Y, GATE_Z, N_PIERS, PITCH } from './world'

/* ---------------------------------------------------------------- PIER
   Modelled after the real Oosterscheldekering piers: massive weathered concrete shafts rising from the
   seabed, a twin-legged concrete tower on the sea side housing the gate machinery, a white machine house
   with railing galleries and two tall white stacks (the hydraulic gate cylinders' vent / service stacks). */
function pierParts() {
  const p = new Parts(6)
  // main shaft: 5 m thick (along the barrier), 24 m deep, seabed-to-deck
  p.add('concrete', boxG(5, 30, 24, 0, -1, 1))
  // gate slots on both flanks + guide rails
  for (const sx of [-1, 1]) {
    p.add('darkSteel', boxG(0.12, 22.5, 3.9, sx * 2.53, 0.75, GATE_Z))
    p.add('galv', [boxG(0.32, 22.5, 0.3, sx * 2.62, 0.75, GATE_Z - 2.15), boxG(0.32, 22.5, 0.3, sx * 2.62, 0.75, GATE_Z + 2.15)])
    // rubber fenders on the seaward face
    p.add('darkSteel', boxG(2.1, 0.7, 0.5, sx * 1.2, 0.3, 13.25))
  }
  // ladder on the sea face
  p.add('galv', [boxG(0.05, 16, 0.05, -0.28, 6, 13.14), boxG(0.05, 16, 0.05, 0.28, 6, 13.14)])
  for (let i = 0; i < 52; i++) p.add('galv', boxG(0.56, 0.03, 0.03, 0, -1.6 + i * 0.3, 13.14))
  // twin tower legs (concrete) + floor between them
  for (const sx of [-1, 1]) p.add('concrete', boxG(1.5, 13, 9.5, sx * 1.75, 20.5, 7.75))
  p.add('concrete', boxG(2.0, 1.0, 9.5, 0, 14.5, 7.75))
  // service galleries between the legs
  for (const y of [19.2, 23.2]) {
    p.add('whiteSteel', boxG(2.0, 0.14, 9.0, 0, y, 7.75))
    p.add('galv', [boxG(2.0, 0.05, 0.05, 0, y + 1.05, 12.2), boxG(2.0, 0.04, 0.04, 0, y + 0.55, 12.2)])
    for (const sx of [-0.95, 0, 0.95]) p.add('galv', boxG(0.05, 1.05, 0.05, sx, y + 0.5, 12.2))
  }
  // stair stringers
  for (const sx of [-0.7, 0.7]) {
    p.add('galv', beamG([sx, 15, 3.6], [sx, 19.2, 10.5], 0.1))
    p.add('galv', beamG([sx, 19.2, 10.8], [sx, 23.2, 4.2], 0.1))
  }
  // hydraulic rams visible between the legs
  for (const sx of [-0.45, 0.45]) {
    p.add('whiteSteel', cylG(0.26, 0.26, 18, sx, 18, 5.2, 14))
    p.add('galv', cylG(0.15, 0.15, 8, sx, 8.5, 5.2, 10))
  }
  // open service deck on top of the legs
  p.add('darkSteel', boxG(10.8, 0.22, 10.6, 0, 27.1, 7.7))
  const rail = (x0: number, z0: number, x1: number, z1: number) => {
    const L = Math.hypot(x1 - x0, z1 - z0)
    const n = Math.max(1, Math.round(L / 1.3))
    for (let i = 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n
      const z = z0 + ((z1 - z0) * i) / n
      p.add('galv', boxG(0.05, 1.1, 0.05, x, 27.75, z))
    }
    const a: [number, number, number] = [x0, 28.3, z0]
    const b: [number, number, number] = [x1, 28.3, z1]
    p.add('galv', beamG(a, b, 0.06))
    p.add('galv', beamG([x0, 27.8, z0], [x1, 27.8, z1], 0.04))
  }
  const X = 5.35
  const Z0 = 2.5
  const Z1 = 12.9
  rail(-X, Z0, X, Z0)
  rail(-X, Z1, X, Z1)
  rail(-X, Z0, -X, Z1)
  rail(X, Z0, X, Z1)
  // machine house
  p.add('paintWhite', boxG(5.2, 4.2, 6.0, 0, 29.3, 8.0))
  p.add('whiteSteel', boxG(5.7, 0.25, 6.5, 0, 31.5, 8.0))
  p.add('darkSteel', boxG(1.1, 2.1, 0.07, 1.5, 28.35, 11.03))
  p.add('glass', boxG(2.4, 0.8, 0.06, -1.0, 30.3, 11.03))
  for (let i = 0; i < 6; i++) p.add('darkSteel', boxG(1.3, 0.07, 0.06, -1.5, 28.1 + i * 0.16, 11.04))
  // cage-like side structures with cross bracing (as on the real machine decks)
  for (const sx of [-1, 1]) {
    const xc = sx * 3.95
    for (const z of [5.4, 10.7]) for (const dx of [-1.15, 1.15]) p.add('whiteSteel', boxG(0.14, 3.0, 0.14, xc + dx, 28.8, z))
    for (const y of [27.4, 30.1]) p.add('whiteSteel', [boxG(2.4, 0.12, 0.12, xc, y, 5.4), boxG(2.4, 0.12, 0.12, xc, y, 10.7)])
    p.add('whiteSteel', [beamG([xc - 1.15, 27.4, 10.7], [xc + 1.15, 30.1, 10.7], 0.07), beamG([xc + 1.15, 27.4, 10.7], [xc - 1.15, 30.1, 10.7], 0.07)])
    p.add('whiteSteel', boxG(2.1, 0.1, 5.4, xc, 30.8, 8.0))
  }
  // two tall stacks with service bands, caps and aviation lights
  for (const sx of [-1.5, 1.5]) {
    p.add('paintWhite', cylG(0.5, 0.5, 13.6, sx, 38.3, 7.5, 24))
    for (const y of [33.2, 37.2, 41.2]) p.add('galv', cylG(0.57, 0.57, 0.22, sx, y, 7.5, 24))
    p.add('galv', cylG(0.62, 0.62, 0.3, sx, 45.2, 7.5, 24))
    p.add('redLight', new THREE.SphereGeometry(0.2, 10, 8).translate(sx, 45.55, 7.5))
  }
  return p
}

/* ---------------------------------------------------------------- GATE (origin at gate centre, y = bottom of gate) */
function gateParts() {
  const p = new Parts(6)
  const zf = GATE_Z + 1.5
  const zb = GATE_Z - 1.4
  const ys = [0.7, 5.5, 10.3]
  const half = GATE_LEN / 2
  for (const y of ys) {
    p.add('gateSteel', cylG(0.55, 0.55, GATE_LEN - 0.2, 0, y, zf, 18, 'x'))
    p.add('gateSteel', cylG(0.3, 0.3, GATE_LEN - 0.2, 0, y, zb, 10, 'x'))
  }
  const panels = 8
  const dx = (GATE_LEN - 0.8) / panels
  for (let k = 0; k <= panels; k++) {
    const x = -half + 0.4 + k * dx
    p.add('gateSteel', beamG([x, ys[0], zf], [x, ys[2], zf], 0.3))
    for (const y of ys) p.add('gateSteel', beamG([x, y, zb], [x, y, zf], 0.2))
  }
  for (let k = 0; k < panels; k++) {
    const x0 = -half + 0.4 + k * dx
    const x1 = x0 + dx
    const up = k % 2 === 0
    p.add('gateSteel', beamG([up ? x0 : x1, ys[0], zf], [up ? x1 : x0, ys[1], zf], 0.22, true))
    p.add('gateSteel', beamG([up ? x1 : x0, ys[1], zf], [up ? x0 : x1, ys[2], zf], 0.22, true))
  }
  // skin plate + stiffeners
  p.add('gateSkin', boxG(GATE_LEN - 0.3, 10.8, 0.22, 0, 5.4, zb - 0.1))
  for (const y of [1.6, 4.2, 6.8, 9.4]) p.add('gateSkin', boxG(GATE_LEN - 0.3, 0.22, 0.45, 0, y, zb + 0.1))
  // end bearings that ride in the pier slots
  for (const sx of [-1, 1]) p.add('darkSteel', boxG(0.6, 11, 3.6, sx * (half - 0.1), 5.5, GATE_Z))
  // the white gate head in the centre
  p.add('paintWhite', profileX([[GATE_Z - 2.7, 1.0], [GATE_Z + 1.0, 1.0], [GATE_Z + 1.0, 5.4], [GATE_Z + 0.2, 7.6], [GATE_Z - 1.1, 8.8], [GATE_Z - 2.7, 8.8]], 5.6, 0.12))
  p.add('darkSteel', boxG(3.4, 0.5, 0.06, 0, 8.6, GATE_Z + 1.15))
  return p
}

/* ---------------------------------------------------------------- ROAD SPAN (origin at span centre) */
export const LAMP_LOCAL: [number, number, number][] = [
  [-11.25, 24.15, -6.75],
  [11.25, 24.15, -6.75],
]

function spanParts() {
  const p = new Parts(6)
  p.add('concrete', boxG(45, 3.25, 13, 0, 12.225, -4))
  p.add('concrete', [boxG(45, 0.7, 1.0, 0, 14.2, -10), boxG(45, 0.7, 1.0, 0, 14.2, 2)])
  p.add('asphalt', boxG(45, 0.15, 11, 0, 13.925, -4))
  for (const z of [-10.25, 2.25]) {
    for (let i = 0; i <= 18; i++) p.add('galv', boxG(0.06, 0.7, 0.06, -22.5 + i * 2.5, 14.9, z))
    p.add('galv', [boxG(45, 0.07, 0.07, 0, 15.22, z), boxG(45, 0.04, 0.04, 0, 14.88, z)])
  }
  p.add('line', [boxG(45, 0.012, 0.15, 0, 14.008, -9.1), boxG(45, 0.012, 0.15, 0, 14.008, 1.1)])
  for (let k = -2; k <= 2; k++) p.add('line', boxG(3, 0.012, 0.15, k * 9, 14.008, -4))
  p.add('darkSteel', boxG(0.14, 0.012, 11, -22.5, 14.006, -4))
  for (const [x, y, z] of LAMP_LOCAL) {
    p.add('galv', cylG(0.1, 0.16, 9.7, x, 14.55 + 4.85, -10.25, 10))
    p.add('galv', beamG([x, 24.1, -10.25], [x, 24.45, z + 0.2], 0.1, true))
    p.add('darkSteel', boxG(0.5, 0.2, 1.0, x, y + 0.12, z))
    p.add('lampGlow', boxG(0.4, 0.04, 0.85, x, y, z))
  }
  // underside stiffening beams
  p.add('concrete', [boxG(45, 0.5, 0.7, 0, 10.35, -9.2), boxG(45, 0.5, 0.7, 0, 10.35, 1.2), boxG(45, 0.5, 0.7, 0, 10.35, -4)])
  return p
}

export interface BarrierRig {
  group: THREE.Group
  /** returns gate bottom Y per gate for a given closing progress */
  setClosing: (k: number) => void
  gateBottom: (i: number) => number
  lamps: THREE.Vector3[]
  beacons: THREE.Vector3[]
  gateCount: number
  closing: number
}

export function buildBarrier(mats: Mats): BarrierRig {
  const group = new THREE.Group()
  const nGate = N_PIERS - 1
  const tmp = new THREE.Object3D()

  const mk = (parts: Parts, count: number, place: (i: number, o: THREE.Object3D) => void, shadow = true) => {
    const meshes: THREE.InstancedMesh[] = []
    for (const key of parts.keys()) {
      const geo = parts.merged(key)!
      const m = new THREE.InstancedMesh(geo, mats[key], count)
      m.castShadow = shadow && key !== 'lampGlow' && key !== 'redLight'
      m.receiveShadow = key !== 'lampGlow' && key !== 'redLight'
      m.frustumCulled = false
      for (let i = 0; i < count; i++) {
        tmp.position.set(0, 0, 0)
        tmp.rotation.set(0, 0, 0)
        place(i, tmp)
        tmp.updateMatrix()
        m.setMatrixAt(i, tmp.matrix)
      }
      m.instanceMatrix.needsUpdate = true
      group.add(m)
      meshes.push(m)
    }
    return meshes
  }

  mk(pierParts(), N_PIERS, (i, o) => o.position.set(i * PITCH, 0, 0))
  mk(spanParts(), nGate, (i, o) => o.position.set(i * PITCH + PITCH / 2, 0, 0))

  const gateY = new Float32Array(nGate).fill(GATE_OPEN_Y)
  const gateMeshes = mk(gateParts(), nGate, (i, o) => o.position.set(i * PITCH + PITCH / 2, GATE_OPEN_Y, 0))

  const rig: BarrierRig = {
    group,
    closing: 0,
    gateCount: nGate,
    lamps: [],
    beacons: [],
    gateBottom: (i) => gateY[i],
    setClosing(k: number) {
      rig.closing = k
      for (let i = 0; i < nGate; i++) {
        // gates close one after another from the west end
        const pk = smoothstep(0, 1, Math.min(1, Math.max(0, k * 1.7 - (i / (nGate - 1)) * 0.7)))
        gateY[i] = GATE_OPEN_Y + (GATE_CLOSED_Y - GATE_OPEN_Y) * pk
      }
      for (const m of gateMeshes) {
        for (let i = 0; i < nGate; i++) {
          tmp.position.set(i * PITCH + PITCH / 2, gateY[i], 0)
          tmp.rotation.set(0, 0, 0)
          tmp.updateMatrix()
          m.setMatrixAt(i, tmp.matrix)
        }
        m.instanceMatrix.needsUpdate = true
      }
    },
  }
  for (let i = 0; i < nGate; i++) for (const [x, y, z] of LAMP_LOCAL) rig.lamps.push(new THREE.Vector3(i * PITCH + PITCH / 2 + x, y - 0.1, z))
  for (let i = 0; i < N_PIERS; i++) for (const sx of [-1.5, 1.5]) rig.beacons.push(new THREE.Vector3(i * PITCH + sx, 45.6, 7.5))
  return rig
}

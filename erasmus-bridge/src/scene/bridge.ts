import * as THREE from 'three'
import {
  CYCLE_OUT, DECK_HALF, PYLON, RAIL_Z, SPINE_IN, SPINE_OUT, STAY_SPACING, TRAM_HALF, X_BASCULE0, X_BASCULE1, X_END, X_MAIN_END, X_START,
  deckDepth, deckY, LAND_Y,
} from './config'
import { boxGeo, merge, rod, strip, sweep, taper, v3 } from './geo'
import type { Mats } from './materials'

type Pt = [number, number]

export interface BridgeParts {
  group: THREE.Group
  lampHeads: THREE.Vector3[]
  beacon: THREE.Mesh
}

function range(a: number, b: number, step: number) {
  const n = Math.max(1, Math.round((b - a) / step))
  return Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n)
}

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, cast = true, receive = true) {
  const m = new THREE.Mesh(geo, mat)
  m.castShadow = cast
  m.receiveShadow = receive
  return m
}

function instanced(geo: THREE.BufferGeometry, mat: THREE.Material, mats: THREE.Matrix4[], cast = true) {
  const im = new THREE.InstancedMesh(geo, mat, mats.length)
  mats.forEach((m, i) => im.setMatrixAt(i, m))
  im.instanceMatrix.needsUpdate = true
  im.castShadow = cast
  im.receiveShadow = true
  im.frustumCulled = false
  return im
}

const rectProfile = (z0: number, z1: number, y0: number, y1: number): Pt[] => [[z0, y0], [z1, y0], [z1, y1], [z0, y1]]

export function buildBridge(M: Mats): BridgeParts {
  const g = new THREE.Group()
  g.name = 'Erasmusbrug'

  const xsAll = range(X_START, X_END, 3)
  const xsSteel = range(X_BASCULE0, X_MAIN_END, STAY_SPACING / 2)
  const xsSouth = range(X_START, X_BASCULE0, 5)
  const xsNorth = range(X_MAIN_END, X_END, 5)

  // ---------------------------------------------------------------- deck girder
  const girder = (x: number): Pt[] => {
    const D = deckDepth(x)
    return [
      [-DECK_HALF, -0.05], [-DECK_HALF, -0.45], [-11.0, -1.3], [-SPINE_OUT, -D], [-SPINE_IN, -D], [-SPINE_IN, -1.15],
      [SPINE_IN, -1.15], [SPINE_IN, -D], [SPINE_OUT, -D], [11.0, -1.3], [DECK_HALF, -0.45], [DECK_HALF, -0.05],
    ]
  }
  g.add(mesh(sweep(girder, xsSteel, deckY, true, 5), M.deckSteel))
  g.add(mesh(sweep(girder, xsSouth, deckY, true, 6), M.concrete))
  g.add(mesh(sweep(girder, xsNorth, deckY, true, 6), M.concrete))

  // spine up-stands (the box-girder "spines" that carry the stays – act as barriers between road and cycle path)
  const spine = (): Pt[] => [[SPINE_IN, -0.02], [SPINE_OUT, -0.02], [SPINE_OUT, 0.78], [SPINE_OUT - 0.3, 0.95], [SPINE_IN + 0.3, 0.95], [SPINE_IN, 0.78]]
  const spineN = (): Pt[] => spine().map(([z, y]) => [-z, y] as Pt).reverse()
  g.add(mesh(sweep(spine, xsSteel, deckY, true, 5), M.steel))
  g.add(mesh(sweep(spineN, xsSteel, deckY, true, 5), M.steel))
  for (const xs of [xsSouth, xsNorth]) {
    g.add(mesh(sweep(spine, xs, deckY, true, 6), M.concrete))
    g.add(mesh(sweep(spineN, xs, deckY, true, 6), M.concrete))
  }

  // ---------------------------------------------------------------- surfaces
  const top = (z0: number, z1: number, mat: THREE.Material, tile: number, dy = 0, rep = 1) => g.add(mesh(strip(z0, z1, xsAll, deckY, dy, tile, rep), mat, false, true))
  top(-TRAM_HALF, TRAM_HALF, M.tramSlab, 5)
  top(TRAM_HALF, SPINE_IN, M.asphalt, 6)
  top(-SPINE_IN, -TRAM_HALF, M.asphalt, 6)
  top(SPINE_OUT, CYCLE_OUT, M.asphaltRed, 6)
  top(-CYCLE_OUT, -SPINE_OUT, M.asphaltRed, 6)
  top(CYCLE_OUT + 0.2, DECK_HALF, M.paversBridge, 3.2)
  top(-DECK_HALF, -CYCLE_OUT - 0.2, M.paversBridge, 3.2)
  // kerb between cycle path and footpath
  for (const s of [-1, 1]) {
    const z0 = s > 0 ? CYCLE_OUT : -CYCLE_OUT - 0.2
    g.add(mesh(sweep(() => rectProfile(z0, z0 + 0.2, -0.02, 0.07), xsAll, deckY, true, 4), M.kerb))
  }
  // road markings
  const line = (z: number, w: number, dash: boolean) => {
    const geo = strip(z - w / 2, z + w / 2, xsAll, deckY, 0.012, 9)
    g.add(mesh(geo, dash ? M.lineDash : M.lineWhite, false, true))
  }
  for (const s of [-1, 1]) {
    line(s * (TRAM_HALF + 0.12), 0.12, false)
    line(s * 5.82, 0.13, true)
    line(s * (SPINE_IN - 0.22), 0.14, false)
    line(s * (SPINE_OUT + 0.35), 0.1, false)
    line(s * (CYCLE_OUT - 0.35), 0.1, false)
  }
  // tram rails (4 steel rails)
  for (const c of [-1.35, 1.35]) for (const o of [-0.7175, 0.7175]) {
    g.add(mesh(sweep(() => rectProfile(c + o - 0.035, c + o + 0.035, 0.0, 0.07), xsAll, deckY, true, 4), M.rails, false, true))
  }
  // expansion joints
  const joints: THREE.BufferGeometry[] = []
  for (const x of [X_BASCULE0, X_BASCULE1, 0, X_MAIN_END]) joints.push(boxGeo(0.28, 0.02, DECK_HALF * 2 - 0.2, x, deckY(x) + 0.012, 0))
  g.add(mesh(merge(joints), M.rails, false, true))

  // ---------------------------------------------------------------- railings & lamps
  const railXs = range(X_START, X_END, 6)
  for (const s of [-1, 1]) {
    const z = s * RAIL_Z
    g.add(mesh(sweep(() => rectProfile(z - 0.06, z + 0.06, 1.2, 1.3), railXs, deckY, true, 4), M.rail, true, true))
    for (const yy of [0.38, 0.68, 0.98]) g.add(mesh(sweep(() => rectProfile(z - 0.012, z + 0.012, yy, yy + 0.025), railXs, deckY, true, 4), M.rail, false, true))
    g.add(mesh(sweep(() => rectProfile(z - 0.08, z + 0.08, -0.02, 0.12), railXs, deckY, true, 4), M.rail, false, true))
  }
  const postGeo = boxGeo(0.06, 1.2, 0.06, 0, 0.6, 0)
  const pm: THREE.Matrix4[] = []
  for (let x = X_START; x <= X_END; x += 1.6) for (const s of [-1, 1]) pm.push(new THREE.Matrix4().makeTranslation(x, deckY(x), s * RAIL_Z))
  g.add(instanced(postGeo, M.rail, pm, false))

  // streetlights (curved arm over the cycle path) every 3 cable bays
  const pole = rod(v3(0, 0, 0), v3(0, 9.0, 0), 0.075, 10, 0.11)
  const arm = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([v3(0, 8.9, 0), v3(0, 9.55, 0), v3(0, 9.9, -0.55), v3(0, 9.95, -1.4), v3(0, 9.72, -2.3)]), 14, 0.055, 6)
  const head = new THREE.BoxGeometry(0.42, 0.13, 1.05)
  head.translate(0, 9.7, -2.55)
  const lens = new THREE.PlaneGeometry(0.34, 0.9)
  lens.rotateX(Math.PI / 2)
  lens.translate(0, 9.62, -2.55)
  const lampMetal = merge([pole, arm, head])
  const lampLens = merge([lens])
  const lm: THREE.Matrix4[] = []
  const lampHeads: THREE.Vector3[] = []
  for (let x = X_START + 8; x <= X_END - 6; x += STAY_SPACING * 3) {
    for (const s of [-1, 1]) {
      const m = new THREE.Matrix4().makeRotationY(s > 0 ? 0 : Math.PI)
      m.setPosition(x, deckY(x), s * (DECK_HALF - 0.28))
      lm.push(m)
      lampHeads.push(v3(x, deckY(x) + 9.6, s * (DECK_HALF - 0.28 - 2.55)))
    }
  }
  g.add(instanced(lampMetal, M.lampMetal, lm))
  g.add(instanced(lampLens, M.lampLens, lm, false))

  // underside cantilever ribs (one every 4.9 m) – the structure visible from the water and below
  for (const s of [-1, 1]) {
    const geo = taper(v3(0, -1.5, s * SPINE_OUT), v3(0, -0.45, s * (DECK_HALF - 0.1)), 0.22, 1.0, 0.22, 0.36, 3)
    const ms: THREE.Matrix4[] = []
    for (let x = X_BASCULE0 + 2.45; x < X_MAIN_END; x += STAY_SPACING) ms.push(new THREE.Matrix4().makeTranslation(x, deckY(x) - 0.0, 0))
    // ribs hang under the deck, deck depth already included in the girder profile
    g.add(instanced(geo, M.underside, ms, false))
  }

  // ---------------------------------------------------------------- piers
  const pier = (() => {
    const sh = new THREE.Shape()
    const pts: Pt[] = [[-8, -20], [-2, -27], [6, -27], [12, -20], [12, 20], [6, 27], [-2, 27], [-8, 20]]
    pts.forEach(([x, z], i) => (i ? sh.lineTo(x, z) : sh.moveTo(x, z)))
    const geo = new THREE.ExtrudeGeometry(sh, { depth: 16.5, bevelEnabled: false })
    geo.rotateX(-Math.PI / 2)
    geo.translate(0, -8, 0)
    const ng = geo.toNonIndexed()
    ng.computeVertexNormals()
    // metric UV
    const p = ng.attributes.position
    const n = ng.attributes.normal
    const uv = new Float32Array(p.count * 2)
    for (let i = 0; i < p.count; i++) {
      const horiz = Math.abs(n.getY(i)) > 0.5
      uv[i * 2] = (horiz ? p.getX(i) : Math.abs(n.getX(i)) > 0.5 ? p.getZ(i) : p.getX(i)) / 6
      uv[i * 2 + 1] = (horiz ? p.getZ(i) : p.getY(i)) / 6
    }
    ng.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
    return ng
  })()
  g.add(mesh(pier, M.concrete))
  // fender belt at the water line
  const fender = new THREE.Mesh(boxGeo(20.4, 1.2, 54.6, 2, 0.2, 0), new THREE.MeshStandardMaterial({ color: '#15171a', roughness: 0.9 }))
  fender.scale.set(1, 1, 1)
  fender.castShadow = false
  g.add(fender)

  // pylon cross-head ("bracket") that carries the deck between the two legs
  const yDeck0 = deckY(3)
  g.add(mesh(boxGeo(9.0, 4.2, 44.5, 3.5, yDeck0 - deckDepth(3) - 1.0, 0, 5), M.steel))

  // bascule pier + north river pier
  g.add(mesh(boxGeo(7, 8 + deckY(X_BASCULE1) - 3.4, 30, X_BASCULE1, (-8 + deckY(X_BASCULE1) - 3.4) / 2, 0, 6), M.concrete))
  g.add(mesh(boxGeo(9, 8 + deckY(X_MAIN_END) - 3.2, 30, X_MAIN_END - 1, (-8 + deckY(X_MAIN_END) - 3.2) / 2, 0, 6), M.concrete))
  // hammer-head piers of the approach viaducts
  const hammer = (x: number) => {
    const yTop = deckY(x) - deckDepth(x)
    const h = yTop - 1.5 - LAND_Y
    if (h < 0.4) return
    g.add(mesh(boxGeo(3.2, h, 5.4, x, LAND_Y + h / 2, 0, 5), M.concrete))
    const cross = taper(v3(x, yTop - 0.8, -13.5), v3(x, yTop - 0.8, 13.5), 3.4, 1.5, 3.4, 1.5, 5)
    g.add(mesh(cross, M.concrete))
    const wing = merge([taper(v3(x, yTop - 1.35, -13.5), v3(x, yTop - 0.7, -2), 3.4, 0.5, 4.2, 1.7, 5), taper(v3(x, yTop - 1.35, 13.5), v3(x, yTop - 0.7, 2), 3.4, 0.5, 4.2, 1.7, 5)])
    void wing
  }
  for (let x = -168; x > X_START + 10; x -= 38) hammer(x)
  for (let x = 322; x < X_END - 20; x += 38) hammer(x)

  // ---------------------------------------------------------------- pylon
  const [kx, ky] = PYLON.kink
  const [tx, ty] = PYLON.top
  const K = v3(kx, ky - 2, 0)
  const T = v3(tx, ty, 0)
  const axisL = Math.hypot(tx - kx, ty - (ky - 2))
  const mastDir = new THREE.Vector2((tx - kx) / axisL, (ty - ky + 2) / axisL)
  const nFront = v3(mastDir.y, -mastDir.x, 0) // faces the main span (+x)
  const depthAt = (t: number) => 4.9 - 2.1 * t
  const widthAt = (t: number) => 3.8 - 1.4 * t
  const axisPoint = (t: number) => K.clone().lerp(T, t)
  // legs
  for (const s of [-1, 1]) {
    const a = v3(PYLON.legFoot[0], PYLON.legFoot[1] - 1, s * PYLON.legFootZ)
    const b = v3(kx - 1, ky + 1, s * 1.55)
    g.add(mesh(taper(a, b, 3.0, 4.6, 2.6, 4.6, 5), M.steel))
  }
  // mast
  g.add(mesh(taper(K, T, widthAt(0), depthAt(0), widthAt(1), depthAt(1), 5), M.steel))
  // dark tinted cap (the black "crown" visible at the top of the real pylon)
  const t0 = 0.9
  g.add(mesh(taper(axisPoint(t0), T.clone().add(v3(0, 0.01, 0)), widthAt(t0) + 0.06, depthAt(t0) + 0.06, widthAt(1) + 0.06, depthAt(1) + 0.06, 5), M.glassDark, false, false))
  g.add(mesh(taper(T.clone().add(v3(0, 0.005, 0)), T.clone().add(v3(0.3, 1.1, 0)), widthAt(1) + 0.1, depthAt(1) + 0.1, widthAt(1) - 0.3, depthAt(1) - 0.4, 5), M.steel))
  // aviation beacon
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 8), M.beacon)
  beacon.position.set(tx + 0.3, ty + 1.7, 0)
  g.add(beacon)

  // ---------------------------------------------------------------- cables
  const fore: THREE.Matrix4[] = []
  const back: THREE.Matrix4[] = []
  const sock: THREE.Matrix4[] = []
  const brackets: THREE.BufferGeometry[] = []
  const up = v3(0, 1, 0)
  const place = (list: THREE.Matrix4[], a: THREE.Vector3, b: THREE.Vector3, r: number) => {
    const d = b.clone().sub(a)
    const len = d.length()
    const q = new THREE.Quaternion().setFromUnitVectors(up, d.clone().normalize())
    list.push(new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, v3(r, len, r)))
  }
  const socket = (a: THREE.Vector3, b: THREE.Vector3, r: number, len: number) => {
    const d = b.clone().sub(a).normalize()
    const q = new THREE.Quaternion().setFromUnitVectors(up, d)
    sock.push(new THREE.Matrix4().compose(a.clone().add(d.clone().multiplyScalar(len / 2)), q, v3(r, len, r)))
    sock.push(new THREE.Matrix4().compose(b.clone().sub(d.clone().multiplyScalar(len / 2)), q, v3(r, len, r)))
  }
  for (let k = 0; k < 16; k++) {
    const y = 133.4 - 3.2 * k
    const t = (y - K.y) / (T.y - K.y)
    const c = axisPoint(t)
    const fp = c.clone().addScaledVector(nFront, depthAt(t) / 2)
    const xk = 22 + (15 - k) * 16.5
    for (const s of [-1, 1]) {
      const a = v3(fp.x, fp.y, s * 1.35)
      const b = v3(xk, deckY(xk) + 0.95, s * 9.6)
      place(fore, a, b, 0.115)
      socket(a, b, 0.2, 1.6)
    }
    // anchor bracket on the pylon face
    brackets.push(taper(c.clone().addScaledVector(nFront, depthAt(t) / 2 - 0.2), c.clone().addScaledVector(nFront, depthAt(t) / 2 + 0.55), 3.0, 0.7, 3.0, 0.7, 3))
  }
  const backs: [number, number][] = [[132.2, -52], [130.4, -57], [127.6, -64], [125.8, -69]]
  for (const [y, xk] of backs) {
    const t = (y - K.y) / (T.y - K.y)
    const c = axisPoint(t)
    const bp = c.clone().addScaledVector(nFront, -depthAt(t) / 2)
    for (const s of [-1, 1]) {
      const a = v3(bp.x, bp.y, s * 1.45)
      const b = v3(xk, deckY(xk) + 0.95, s * 9.6)
      place(back, a, b, 0.22)
      socket(a, b, 0.36, 2.0)
    }
  }
  const unitCyl = new THREE.CylinderGeometry(1, 1, 1, 10, 1)
  g.add(instanced(unitCyl, M.cable, fore, false))
  g.add(instanced(unitCyl, M.backstay, back, true))
  g.add(instanced(unitCyl, M.steel, sock, false))
  g.add(mesh(merge(brackets), M.steel, false, false))

  return { group: g, lampHeads, beacon }
}

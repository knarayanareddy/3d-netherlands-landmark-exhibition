import * as THREE from 'three'
import { DATA, ptsOf } from './data'
import { Mesher, ccw, obb, pointInPoly, signedArea, centroid, type Pt } from './geo'
import type { Mats } from './materials'
import { rng } from './noise'

export interface Landmarks {
  group: THREE.Group
  floors: ((x: number, z: number, feetY: number) => number)[]
  blockers: ((x: number, z: number, feetY: number) => boolean)[]
  update: (t: number, night: number) => void
  libraryTopY: (x: number, z: number) => number
  roofSpot: Pt
  coneC: Pt
  beacon: THREE.Mesh
}

function cylUV(g: THREE.CylinderGeometry, radius: number, height: number, bay: number, fh: number) {
  const uv = g.attributes.uv as THREE.BufferAttribute
  const circ = Math.PI * 2 * radius
  const cnt = Math.max(1, Math.round(circ / bay))
  const floors = Math.max(1, Math.round(height / fh))
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * cnt) / 4, (uv.getY(i) * floors) / 4)
  const col = new Float32Array(uv.count * 3).fill(1)
  g.setAttribute('color', new THREE.BufferAttribute(col, 3))
}

export function buildLandmarks(mats: Mats): Landmarks {
  const group = new THREE.Group()
  const floors: Landmarks['floors'] = []
  const blockers: Landmarks['blockers'] = []

  // =========================================================== LIBRARY
  const lib = DATA.buildings.find((b) => b.id === 60302729)!
  const LP = ccw(ptsOf(lib.p))
  const lo = obb(LP)
  const cone = lib.parts.find((p) => p.roof === 'pyramidal')
  const conePts = cone ? ptsOf(cone.p) : null
  const coneC: Pt = conePts ? centroid(conePts) : [lo.cx, lo.cz]
  const coneR = conePts ? Math.sqrt(Math.abs(signedArea(conePts)) / Math.PI) : 11
  const cA = Math.cos(lo.ang), sA = Math.sin(lo.ang)
  // local coordinates of the cone relative to the footprint box
  const cu = (coneC[0] - lo.cx) * cA + (coneC[1] - lo.cz) * sA
  const cw = -(coneC[0] - lo.cx) * sA + (coneC[1] - lo.cz) * cA
  const alongU = Math.abs(cu) / lo.hx > Math.abs(cw) / lo.hz
  const half = alongU ? lo.hx : lo.hz
  const sgn = (alongU ? cu : cw) >= 0 ? 1 : -1
  const dirX = alongU ? cA * sgn : -sA * sgn
  const dirZ = alongU ? sA * sgn : cA * sgn
  const LOW = 0.3, HIGH = 19
  const slopeT = (x: number, z: number) => {
    const t = ((x - lo.cx) * dirX + (z - lo.cz) * dirZ + half) / (2 * half)
    return Math.max(0, Math.min(1, t))
  }
  const roofY = (x: number, z: number) => LOW + (HIGH - LOW) * slopeT(x, z)
  const grad = (HIGH - LOW) / (2 * half)

  // lawn roof
  const lawn = mats.grass.clone()
  lawn.depthWrite = true; lawn.polygonOffset = false
  lawn.color = new THREE.Color(0.95, 1, 0.9)
  {
    const contour = LP.map((p) => new THREE.Vector2(p[0], p[1]))
    const tris = THREE.ShapeUtils.triangulateShape(contour, [])
    const pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = []
    const nl = Math.hypot(grad * dirX, 1, grad * dirZ)
    for (const p of LP) { pos.push(p[0], roofY(p[0], p[1]), p[1]); nor.push((-grad * dirX) / nl, 1 / nl, (-grad * dirZ) / nl); uv.push(p[0], p[1]) }
    for (const t of tris) {
      const a = LP[t[0]], b = LP[t[1]], c = LP[t[2]]
      const cr = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
      if (cr < 0) idx.push(t[0], t[1], t[2]); else idx.push(t[0], t[2], t[1])
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
    g.setIndex(idx)
    const m = new THREE.Mesh(g, lawn)
    m.receiveShadow = true; m.castShadow = true
    group.add(m)
  }
  // glazed perimeter that follows the sloping roof
  {
    const m = new Mesher()
    const n = LP.length
    let uAcc = 0
    for (let i = 0; i < n; i++) {
      const a = LP[i], b = LP[(i + 1) % n]
      const dx = b[0] - a[0], dz = b[1] - a[1]
      const len = Math.hypot(dx, dz)
      if (len < 0.05) continue
      const nx = dz / len, nzz = -dx / len
      const cnt = len < 1.1 ? len / 1.5 : Math.max(1, Math.round(len / 1.5))
      const u0 = uAcc, u1 = uAcc + cnt / 4
      uAcc = u1
      const ya = roofY(a[0], a[1]), yb = roofY(b[0], b[1])
      const v = (h: number) => (h / 3.8) / 4
      const i0 = m.v(a[0], 0, a[1], nx, 0, nzz, u0, 0, 0.8, 0.8, 0.8)
      const i1 = m.v(b[0], 0, b[1], nx, 0, nzz, u1, 0, 0.8, 0.8, 0.8)
      const i2 = m.v(b[0], yb, b[1], nx, 0, nzz, u1, v(yb), 1, 1, 1)
      const i3 = m.v(a[0], ya, a[1], nx, 0, nzz, u0, v(ya), 1, 1, 1)
      m.triFacing(i0, i1, i2, nx, 0, nzz); m.triFacing(i0, i2, i3, nx, 0, nzz)
    }
    const mesh = new THREE.Mesh(m.build(), mats.facade.curtainGreen)
    mesh.castShadow = true; mesh.receiveShadow = true
    group.add(mesh)
  }
  // the cone
  const yBase = roofY(coneC[0], coneC[1]) - 1.5
  const coneTop = 42
  const coneH = coneTop - yBase
  const cg = new THREE.CylinderGeometry(coneR * 0.5, coneR, coneH, 72, 1, true)
  cylUV(cg, coneR * 0.75, coneH, 3.6, 3.4)
  const coneMesh = new THREE.Mesh(cg, mats.facade.ribbon)
  coneMesh.position.set(coneC[0], yBase + coneH / 2, coneC[1])
  coneMesh.castShadow = true; coneMesh.receiveShadow = true
  group.add(coneMesh)
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(coneR * 0.52, coneR * 0.5, 0.8, 48), new THREE.MeshStandardMaterial({ color: 0xa8a49a, roughness: 0.85 }))
  cap.position.set(coneC[0], coneTop + 0.4, coneC[1]); cap.castShadow = true
  group.add(cap)
  const sky = new THREE.Mesh(new THREE.CylinderGeometry(coneR * 0.36, coneR * 0.4, 0.5, 40), mats.glass)
  sky.position.set(coneC[0], coneTop + 1.0, coneC[1])
  group.add(sky)
  // low glazed collar where the cone meets the lawn
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(coneR * 1.02, coneR * 1.02, 1.1, 48, 1, true), mats.glass)
  collar.position.set(coneC[0], roofY(coneC[0], coneC[1]) + 0.5, coneC[1])
  group.add(collar)

  floors.push((x, z) => (pointInPoly(x, z, LP) ? Math.hypot(x - coneC[0], z - coneC[1]) < coneR * 1.1 ? -Infinity : roofY(x, z) : -Infinity))
  blockers.push((x, z, fy) => {
    if (Math.hypot(x - coneC[0], z - coneC[1]) < coneR * 1.12 && fy < coneTop - 1) return true
    return pointInPoly(x, z, LP) && fy < roofY(x, z) - 0.75
  })

  // =========================================================== AULA
  const aula = DATA.buildings.find((b) => b.id === 44383989)!
  const AP = ccw(ptsOf(aula.p))
  const ao = obb(AP)
  const H = 7.8
  {
    const m = new Mesher()
    m.walls(AP, 0, H, { bay: 3.6, floorH: 3.9, tint: [0.95, 0.95, 0.95] })
    const mesh = new THREE.Mesh(m.build(), mats.facade.ribbonDark)
    mesh.castShadow = true; mesh.receiveShadow = true
    group.add(mesh)

    // heavy cantilevered roof slab
    const sl = new Mesher()
    const oh = 3.2
    const c = Math.cos(ao.ang), s = Math.sin(ao.ang)
    const corner = (lx: number, lz: number): Pt => [ao.cx + lx * c - lz * s, ao.cz + lx * s + lz * c]
    const R = ccw([corner(-ao.hx - oh, -ao.hz - oh), corner(ao.hx + oh, -ao.hz - oh), corner(ao.hx + oh, ao.hz + oh), corner(-ao.hx - oh, ao.hz + oh)])
    const ys = H, yt = H + 1.25
    for (let i = 0; i < 4; i++) {
      const a = R[i], b = R[(i + 1) % 4]
      const dx = b[0] - a[0], dz = b[1] - a[1]
      const l = Math.hypot(dx, dz)
      const nx = dz / l, nzz = -dx / l
      const q0 = sl.v(a[0], ys, a[1], nx, 0, nzz, a[0] * 0.25 + a[1] * 0.25, ys, 0.9, 0.9, 0.9)
      const q1 = sl.v(b[0], ys, b[1], nx, 0, nzz, b[0] * 0.25 + b[1] * 0.25, ys, 0.9, 0.9, 0.9)
      const q2 = sl.v(b[0], yt, b[1], nx, 0, nzz, b[0] * 0.25 + b[1] * 0.25, yt, 1, 1, 1)
      const q3 = sl.v(a[0], yt, a[1], nx, 0, nzz, a[0] * 0.25 + a[1] * 0.25, yt, 1, 1, 1)
      sl.triFacing(q0, q1, q2, nx, 0, nzz); sl.triFacing(q0, q2, q3, nx, 0, nzz)
    }
    sl.poly(R, yt, [0.8, 0.8, 0.8])
    sl.poly(R, ys, [0.7, 0.7, 0.7], true)
    const slab = new THREE.Mesh(sl.build(), mats.concreteBoard)
    slab.castShadow = true; slab.receiveShadow = true
    group.add(slab)

    // pilotis along the long sides under the overhang
    const colG = new THREE.CylinderGeometry(0.34, 0.38, H, 16)
    const nC = Math.max(2, Math.round((ao.hx * 2 + oh * 2) / 7))
    const cols = new THREE.InstancedMesh(colG, mats.concrete, nC * 2)
    const mm = new THREE.Matrix4()
    let ci = 0
    for (const sd of [-1, 1]) {
      for (let k = 0; k < nC; k++) {
        const lx = -ao.hx - oh + 1 + ((ao.hx * 2 + oh * 2 - 2) * k) / (nC - 1)
        const p = corner(lx, sd * (ao.hz + oh - 1))
        mm.makeTranslation(p[0], H / 2, p[1])
        cols.setMatrixAt(ci++, mm)
      }
    }
    cols.castShadow = true; cols.receiveShadow = true
    group.add(cols)
    // roof plant
    const eq = new Mesher()
    const R2 = rng(7)
    for (let k = 0; k < 5; k++) {
      const p = corner((R2() - 0.5) * ao.hx * 1.4, (R2() - 0.5) * ao.hz * 1.2)
      eq.box(p[0], p[1], 3 + R2() * 6, 3 + R2() * 4, ao.ang, yt, yt + 1.2 + R2() * 2.4, [0.7, 0.7, 0.72])
    }
    const eqm = new THREE.Mesh(eq.build(), mats.metal)
    eqm.castShadow = true
    group.add(eqm)
  }

  // =========================================================== EEMCS tower crown
  const ee = DATA.buildings.find((b) => b.id === 551121051)!
  const tower = ee.parts.find((p) => p.h >= 80)
  let beacon: THREE.Mesh = new THREE.Mesh()
  if (tower) {
    const tp = ccw(ptsOf(tower.p))
    const to = obb(tp)
    const crown = new Mesher()
    const th = tower.h
    crown.box(to.cx, to.cz, to.hx * 1.9, to.hz * 1.9, to.ang, th, th + 4.2, [0.6, 0.62, 0.64])
    crown.box(to.cx, to.cz, to.hx * 1.0, to.hz * 1.0, to.ang, th + 4.2, th + 5.6, [0.7, 0.7, 0.7])
    const cm = new THREE.Mesh(crown.build(), mats.concreteDark)
    cm.castShadow = true
    group.add(cm)
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.3, 16, 8), mats.steel)
    mast.position.set(to.cx, th + 5.6 + 8, to.cz)
    mast.castShadow = true
    group.add(mast)
    beacon = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 8), new THREE.MeshStandardMaterial({ color: 0xff2200, emissive: new THREE.Color(1, 0.1, 0.05), emissiveIntensity: 2 }))
    beacon.position.set(to.cx, th + 5.6 + 16.2, to.cz)
    group.add(beacon)
  }

  const update = (t: number, night: number) => {
    const b = beacon.material as THREE.MeshStandardMaterial
    b.emissiveIntensity = (0.4 + 3.2 * Math.max(0, Math.sin(t * 2.2))) * (0.5 + night)
  }
  let roofSpot: Pt = [(lo.cx + coneC[0]) / 2, (lo.cz + coneC[1]) / 2]
  if (!pointInPoly(roofSpot[0], roofSpot[1], LP) || Math.hypot(roofSpot[0] - coneC[0], roofSpot[1] - coneC[1]) < coneR * 1.8) roofSpot = [lo.cx, lo.cz]
  return { group, floors, blockers, update, libraryTopY: roofY, roofSpot, coneC, beacon }
}

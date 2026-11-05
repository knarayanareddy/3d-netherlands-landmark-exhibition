import * as THREE from 'three'
import { Batch, TAU, beamGeo, boxGeo, frustumGeo, gableEndsGeo, gableRoofGeo, rng, scaleUV, tubeGeo } from './gfx'
import { M } from './materials'

export const MILL = {
  bodyH: 12.6,
  plinth: 1.25,
  rBot: 3.62,
  rTop: 2.2,
  hubY: 13.95,
  hubZ: 3.55,
  sailR: 12.4,
  tilt: 0.17,
  collide: 4.45,
}

export interface MillParts {
  body: THREE.Group
  wheel: THREE.Group
  hub: THREE.Group
  colliders: [number, number, number][] // local x,z,r
}

const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)
const radiusAt = (y: number) => {
  const t = (y - MILL.plinth) / (MILL.bodyH - MILL.plinth)
  return MILL.rBot + (MILL.rTop - MILL.rBot) * t
}

/** Matrix placing a local frame on an octagon face (face 0 faces +z) at height y, following the wall batter. */
function faceMatrix(face: number, y: number) {
  const phi = (face * Math.PI) / 4
  const apothem = radiusAt(Math.max(y, MILL.plinth)) * Math.cos(Math.PI / 8) + (y < MILL.plinth ? 0.3 : 0)
  const slope = (MILL.rBot - MILL.rTop) / (MILL.bodyH - MILL.plinth)
  const a = y < MILL.plinth ? 0 : Math.atan(slope)
  const qy = new THREE.Quaternion().setFromAxisAngle(v3(0, 1, 0), phi)
  const qx = new THREE.Quaternion().setFromAxisAngle(v3(1, 0, 0), -a)
  const q = qy.multiply(qx)
  const p = v3(Math.sin(phi) * apothem, y, Math.cos(phi) * apothem)
  return new THREE.Matrix4().compose(p, q, v3(1, 1, 1))
}

function onFace(b: Batch, geo: THREE.BufferGeometry, mat: THREE.Material, face: number, y: number, dx = 0, dy = 0, dz = 0) {
  const m = faceMatrix(face, y).multiply(new THREE.Matrix4().makeTranslation(dx, dy, dz))
  b.add(geo, mat, m)
}

function windowOnFace(b: Batch, face: number, y: number, w = 0.62, h = 0.84) {
  onFace(b, boxGeo(w + 0.22, h + 0.22, 0.14, 0.5), M.paint, face, y, 0, 0, 0.0)
  onFace(b, boxGeo(w, h, 0.1, 0.5), M.glass, face, y, 0, 0, 0.08)
  onFace(b, boxGeo(0.05, h, 0.04, 0.5), M.paint, face, y, 0, 0, 0.14)
  onFace(b, boxGeo(w, 0.05, 0.04, 0.5), M.paint, face, y, 0, 0.05, 0.14)
  onFace(b, boxGeo(w + 0.4, 0.07, 0.3, 0.5), M.paint, face, y, 0, -(h / 2 + 0.16), 0.1)
}

export function buildMillParts(variant: number): MillParts {
  const r = rng(100 + variant * 13)
  const b = new Batch()
  const { bodyH, plinth, rBot, rTop } = MILL
  const thatchMat = variant % 3 === 0 ? M.thatch : variant % 3 === 1 ? M.thatchB : M.thatchC

  // ---- brick plinth
  b.add(frustumGeo(3.98, 3.74, plinth, 8, 1.4, false), M.brick)
  // drip ledge between plinth and thatch
  b.add(frustumGeo(3.76, rBot + 0.1, 0.16, 8, 1), M.tar, new THREE.Matrix4().makeTranslation(0, plinth - 0.02, 0))

  // ---- thatched octagonal body
  b.add(frustumGeo(rBot, rTop, bodyH - plinth, 8, 1.7, true), thatchMat, new THREE.Matrix4().makeTranslation(0, plinth, 0))
  // vertical edge ribs (hoekkanten) + horizontal bindings
  for (let i = 0; i < 8; i++) {
    const th = (i + 0.5) * (Math.PI / 4)
    const o = 0.06
    const a = v3(Math.sin(th) * (rBot + o), plinth, Math.cos(th) * (rBot + o))
    const c = v3(Math.sin(th) * (rTop + o), bodyH, Math.cos(th) * (rTop + o))
    b.add(beamGeo(a, c, 0.16, 0.16, 0.8), M.woodDark)
  }
  for (const f of [0.24, 0.48, 0.72]) {
    const y = plinth + (bodyH - plinth) * f
    const rr = radiusAt(y) + 0.07
    b.add(frustumGeo(rr + 0.02, rr, 0.12, 8, 0.8), M.woodDark, new THREE.Matrix4().makeTranslation(0, y, 0))
  }

  // ---- door (face 2, +x) with steps, windows
  const doorFace = 2
  const dm = faceMatrix(doorFace, 0.0)
  void dm
  const door = (geo: THREE.BufferGeometry, mat: THREE.Material, dx: number, dy: number, dz: number) => {
    const m = new THREE.Matrix4().makeRotationY((doorFace * Math.PI) / 4)
    const apothem = 3.74 * Math.cos(Math.PI / 8)
    m.setPosition(Math.sin((doorFace * Math.PI) / 4) * apothem, 0, Math.cos((doorFace * Math.PI) / 4) * apothem)
    m.multiply(new THREE.Matrix4().makeTranslation(dx, dy, dz))
    b.add(geo, mat, m)
  }
  door(boxGeo(1.5, 2.3, 0.22, 0.5), M.paint, 0, 1.15, 0.0)
  door(boxGeo(1.12, 2.1, 0.14, 0.6), M.tar, 0, 1.05, 0.1)
  door(boxGeo(0.06, 2.1, 0.05, 0.5), M.iron, 0, 1.05, 0.19)
  door(boxGeo(0.09, 0.09, 0.08, 0.5), M.iron, 0.34, 1.05, 0.22)
  door(boxGeo(1.9, 0.18, 0.9, 0.7), M.stone, 0, 0.09, 0.5)
  door(boxGeo(1.5, 0.18, 0.55, 0.7), M.stone, 0, 0.26, 0.35)

  windowOnFace(b, 1, 5.4)
  windowOnFace(b, 7, 5.4)
  windowOnFace(b, 3, 8.4, 0.5, 0.7)
  windowOnFace(b, 5, 8.4, 0.5, 0.7)
  windowOnFace(b, 6, 3.4)

  // ---- cap (kap): thatched, boat-shaped, on a dark ring
  b.add(frustumGeo(2.5, 2.34, 0.42, 8, 1), M.tar, new THREE.Matrix4().makeTranslation(0, bodyH - 0.04, 0))
  const dome = new THREE.SphereGeometry(1, 30, 14, 0, TAU, 0, Math.PI / 2)
  dome.scale(2.42, 1.95, 3.05)
  dome.translate(0, bodyH + 0.34, 0)
  scaleUV(dome, 4.4, 2.2)
  b.add(dome, M.thatchB)
  // ridge board and windvane
  b.add(beamGeo(v3(0, bodyH + 2.25, -2.2), v3(0, bodyH + 2.25, 1.6), 0.12, 0.1, 1), M.woodDark)
  b.add(tubeGeo(v3(0, bodyH + 2.25, -0.3), v3(0, bodyH + 3.15, -0.3), 0.04, 0.03, 6), M.iron)
  b.add(boxGeo(0.9, 0.08, 0.02, 1), M.iron, new THREE.Matrix4().makeTranslation(-0.2, bodyH + 3.1, -0.3))
  // front bearing housing & windshaft
  b.add(boxGeo(1.2, 1.15, 1.0, 0.8), M.woodDark, new THREE.Matrix4().makeTranslation(0, MILL.hubY - 0.55, 2.55))
  b.add(tubeGeo(v3(0, MILL.hubY - 0.05, 2.2), v3(0, MILL.hubY + 0.1, MILL.hubZ - 0.2), 0.3, 0.3, 12), M.iron)

  // ---- tail pole (staart) with kruiwerk wheel and anchor posts
  const top = v3(0, bodyH + 0.9, -2.6)
  const foot = v3(0, 1.0, -10.9)
  b.add(tubeGeo(foot, top, 0.14, 0.23, 8, 1), M.woodDark)
  b.add(boxGeo(0.34, 0.34, 1.1, 1), M.woodDark, new THREE.Matrix4().makeTranslation(0, 0.95, -11.1))
  const wc = foot.clone().lerp(top, 0.17)
  const ring = new THREE.TorusGeometry(1.05, 0.06, 6, 24)
  ring.rotateY(Math.PI / 2)
  b.add(ring, M.wood, new THREE.Matrix4().makeTranslation(wc.x + 0.16, wc.y, wc.z))
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4
    const sp = new THREE.Vector3(0, Math.cos(a) * 1.0, Math.sin(a) * 1.0)
    b.add(beamGeo(wc.clone().add(v3(0.16, 0, 0)).add(sp.clone().multiplyScalar(-1)), wc.clone().add(v3(0.16, 0, 0)).add(sp), 0.07, 0.07, 1), M.wood)
  }
  for (let k = 0; k < 13; k++) {
    const a = ((k - 6) / 6) * 0.95
    const px = Math.sin(a) * 10.9
    const pz = -Math.cos(a) * 10.9
    b.add(tubeGeo(v3(px, -0.35, pz), v3(px, 0.8 + r() * 0.1, pz), 0.085, 0.075, 6, 1), M.wood)
    b.add(tubeGeo(v3(px, 0.8, pz), v3(px, 0.86, pz), 0.1, 0.1, 6, 1), M.iron)
  }
  // chain from pole foot to one post
  b.add(beamGeo(v3(0.1, 0.95, -11.2), v3(Math.sin(0.35) * 10.9, 0.75, -Math.cos(0.35) * 10.9), 0.03, 0.03, 1), M.iron)

  // ---- miller's annex (variants 0 and 2) with a tiled roof
  const colliders: [number, number, number][] = [[0, 0, MILL.collide]]
  if (variant % 3 !== 1) {
    const ax = -6.7
    const az = -1.2
    const aw = 5.4
    const ad = 4.2
    const ah = 2.7
    const rotY = 0.18
    const A = new THREE.Matrix4().compose(v3(ax, 0, az), new THREE.Quaternion().setFromAxisAngle(v3(0, 1, 0), rotY), v3(1, 1, 1))
    const place = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) =>
      b.add(geo, mat, A.clone().multiply(new THREE.Matrix4().makeTranslation(x, y, z)))
    place(boxGeo(aw, ah, ad, 1.4), M.brickB, 0, ah / 2, 0)
    place(boxGeo(aw + 0.25, 0.3, ad + 0.25, 1.4), M.stone, 0, 0.15, 0)
    place(gableEndsGeo(aw, ad, 1.9, 1.4), M.brickB, 0, ah, 0)
    place(gableRoofGeo(aw, ad, 1.9, 0.38, 1.2), M.tiles, 0, ah, 0)
    place(boxGeo(aw + 0.9, 0.1, 0.1, 1), M.paint, 0, ah + 1.92, 0)
    // chimney
    place(boxGeo(0.62, 2.2, 0.62, 0.8), M.brickB, 1.4, ah + 0.6, -0.4)
    place(boxGeo(0.78, 0.12, 0.78, 0.8), M.stone, 1.4, ah + 1.75, -0.4)
    // front (+z) door and windows
    const fz = ad / 2
    place(boxGeo(1.1, 2.1, 0.16, 0.6), M.paintGreen, -1.4, 1.05, fz + 0.04)
    place(boxGeo(1.4, 0.1, 0.22, 0.6), M.paint, -1.4, 2.16, fz + 0.04)
    for (const wx of [0.5, 1.8]) {
      place(boxGeo(0.98, 1.2, 0.12, 0.6), M.paint, wx, 1.4, fz + 0.02)
      place(boxGeo(0.8, 1.02, 0.1, 0.6), M.glass, wx, 1.4, fz + 0.06)
      place(boxGeo(0.06, 1.02, 0.04, 0.6), M.paint, wx, 1.4, fz + 0.12)
      place(boxGeo(0.8, 0.06, 0.04, 0.6), M.paint, wx, 1.4, fz + 0.12)
      for (const s of [-1, 1]) place(boxGeo(0.46, 1.2, 0.05, 0.6), M.paintGreen, wx + s * 0.72, 1.4, fz + 0.1)
    }
    // low brick garden wall hugging the annex
    place(boxGeo(aw + 1.5, 0.7, 0.25, 1.2), M.brickB, 0.3, 0.35, fz + 2.6)
    colliders.push([ax + Math.cos(rotY) * 1.6, az - Math.sin(rotY) * 1.6, 2.4], [ax - Math.cos(rotY) * 1.4, az + Math.sin(rotY) * 1.4, 2.4])
  }

  const body = b.build({ cast: true, receive: true })
  body.name = 'millBody'

  // ---- hub + sails (rotating)
  const hub = new THREE.Group()
  hub.position.set(0, MILL.hubY, MILL.hubZ)
  hub.rotation.x = -MILL.tilt
  const wheel = new THREE.Group()
  const sb = new Batch()
  const R = MILL.sailR
  for (let k = 0; k < 4; k++) {
    const rz = (k * Math.PI) / 2
    const pre = new THREE.Matrix4().makeRotationZ(rz)
    // stock
    sb.box(M.stock, 0.3, R, 0.26, 0, R / 2, 0, { pre })
    // lattice frame (hekwerk)
    const y0 = 2.9
    const y1 = R - 0.35
    const len = y1 - y0
    sb.box(M.paint, 0.07, len, 0.07, -0.58, (y0 + y1) / 2, -0.07, { pre })
    sb.box(M.paint, 0.07, len, 0.07, 1.5, (y0 + y1) / 2, -0.07, { pre })
    sb.box(M.paint, 0.045, len, 0.045, 0.58, (y0 + y1) / 2, -0.08, { pre })
    sb.box(M.paint, 0.045, len, 0.045, 1.04, (y0 + y1) / 2, -0.08, { pre })
    const nBars = Math.floor(len / 0.34)
    for (let i = 0; i <= nBars; i++) {
      const y = y0 + (i / nBars) * len
      sb.box(M.paint, 2.12, 0.05, 0.05, 0.46, y, -0.1, { pre })
    }
    // boarded leading edge and root (windbord)
    sb.box(M.paint, 0.3, len * 0.78, 0.035, -0.4, y0 + len * 0.39, 0.0, { pre })
    sb.box(M.stock, 0.13, 0.11, 0.2, 0.46, y1 + 0.05, -0.08, { pre })
    sb.box(M.stock, 2.22, 0.08, 0.1, 0.46, y0 - 0.04, -0.08, { pre })
    // tip weight
    sb.box(M.stock, 0.34, 0.5, 0.3, 0, R - 0.1, 0, { pre })
  }
  // axle head (kop)
  const kop = new THREE.CylinderGeometry(0.46, 0.5, 0.9, 16)
  kop.rotateX(Math.PI / 2)
  kop.translate(0, 0, 0.05)
  sb.add(kop, M.iron)
  const nose = new THREE.CylinderGeometry(0.16, 0.42, 0.4, 14)
  nose.rotateX(Math.PI / 2)
  nose.translate(0, 0, 0.55)
  sb.add(nose, M.iron)
  sb.box(M.stock, 1.0, 1.0, 0.3, 0, 0, -0.08)
  const sails = sb.build({ cast: true, receive: false })
  wheel.add(sails)
  hub.add(wheel)
  return { body, wheel, hub, colliders }
}

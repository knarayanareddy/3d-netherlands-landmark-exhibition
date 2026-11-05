import * as THREE from 'three'
import {
  Batch, Ctx, Frame, M, Mat, Place, TAU, archShape, canvas, canvasTex, columnGeo, extrude, placeGeo, poly, rectShape, rng, roofGable, roofHip, scaleUV, std,
} from './gfx'

/* ================================================================== */
/* Shared architectural details                                        */
/* ================================================================== */
const rnd = rng(77)

export function win(ctx: Ctx, p: Place, y0: number, wd: number, h: number, kind: 'arch' | 'rect', o: { lit?: boolean; blue?: boolean; frame?: Mat; bars?: boolean } = {}) {
  const b = ctx.batch
  const bw = 0.22
  const d = 0.18
  const frame = o.frame ?? M.stoneLight
  const outer = kind === 'arch' ? archShape(wd + 2 * bw, h + bw) : rectShape(wd + 2 * bw, h + bw)
  const hole = kind === 'arch' ? archShape(wd, h) : rectShape(wd, h)
  outer.holes.push(new THREE.Path(hole.getPoints(20)))
  placeGeo(b, extrude(outer, d), frame, p.x, y0, p.z, p.ry)
  const glass = new THREE.ShapeGeometry(hole, 20)
  glass.translate(0, 0, 0.03)
  const lit = o.lit ?? rnd() < 0.55
  placeGeo(b, glass, o.blue ? M.glassBlue : lit ? M.glassLit : M.glass, p.x, y0, p.z, p.ry, 'keep')
  // sill
  const sill = new THREE.BoxGeometry(wd + 2 * bw + 0.3, 0.14, 0.34)
  sill.translate(0, -0.07, 0.17)
  placeGeo(b, sill, frame, p.x, y0, p.z, p.ry)
  if (kind === 'rect') {
    const lin = new THREE.BoxGeometry(wd + 2 * bw + 0.3, 0.16, 0.3)
    lin.translate(0, h + bw + 0.02, 0.15)
    placeGeo(b, lin, frame, p.x, y0, p.z, p.ry)
  }
  if (o.bars !== false) {
    const bar = (w: number, hh: number, x: number, y: number) => {
      const g = new THREE.BoxGeometry(w, hh, 0.06)
      g.translate(x, y + hh / 2, 0.08)
      placeGeo(b, g, M.paint, p.x, y0, p.z, p.ry)
    }
    bar(0.06, h - (kind === 'arch' ? 0.02 : 0), 0, 0)
    if (kind === 'arch') {
      bar(wd, 0.06, 0, h - wd / 2)
      bar(wd, 0.06, 0, h * 0.38)
    } else {
      bar(wd, 0.06, 0, h * 0.5)
      bar(wd, 0.06, 0, h * 0.82)
    }
  }
}

export function doorway(ctx: Ctx, p: Place, y0: number, wd: number, h: number, arch = true, frame: Mat = M.stoneLight) {
  const b = ctx.batch
  const bw = 0.3
  const outer = arch ? archShape(wd + 2 * bw, h + bw) : rectShape(wd + 2 * bw, h + bw)
  const hole = arch ? archShape(wd, h) : rectShape(wd, h)
  outer.holes.push(new THREE.Path(hole.getPoints(20)))
  placeGeo(b, extrude(outer, 0.24), frame, p.x, y0, p.z, p.ry)
  const leaf = new THREE.ShapeGeometry(hole, 20)
  leaf.translate(0, 0, 0.05)
  placeGeo(b, leaf, M.door, p.x, y0, p.z, p.ry, 'keep')
  const panel = (x: number, y: number, w: number, hh: number) => {
    const g = new THREE.BoxGeometry(w, hh, 0.05)
    g.translate(x, y + hh / 2, 0.08)
    placeGeo(b, g, M.door, p.x, y0, p.z, p.ry)
  }
  const pw = wd / 2 - 0.2
  for (const s of [-1, 1]) {
    panel(s * (wd / 4), 0.3, pw, h * 0.34)
    panel(s * (wd / 4), h * 0.42, pw, h * 0.3)
  }
  const hnd = new THREE.SphereGeometry(0.07, 10, 8)
  for (const s of [-1, 1]) {
    const g = hnd.clone()
    g.translate(s * 0.22, 1.1, 0.14)
    placeGeo(b, g, M.gold, p.x, y0, p.z, p.ry)
  }
  const sillG = new THREE.BoxGeometry(wd + 0.4, 0.1, 0.5)
  sillG.translate(0, 0.05, 0.25)
  placeGeo(b, sillG, frame, p.x, y0, p.z, p.ry)
}

export function cornice(F: Frame, b: Batch, mat: Mat, u0: number, u1: number, y: number, proj = 0.7, dentils = true) {
  F.span(b, mat, u0, u1, y, y + 0.34, -0.1, proj * 0.62)
  F.span(b, mat, u0 - 0.08, u1 + 0.08, y + 0.34, y + 0.5, -0.1, proj)
  F.span(b, mat, u0, u1, y - 0.3, y, -0.1, proj * 0.4)
  if (dentils) {
    for (let u = u0 + 0.15; u < u1 - 0.1; u += 0.34) F.span(b, mat, u, u + 0.17, y - 0.56, y - 0.3, 0, proj * 0.3)
  }
  F.span(b, mat, u0, u1, y - 0.62, y - 0.56, 0, proj * 0.24)
}

export function stringCourse(F: Frame, b: Batch, mat: Mat, u0: number, u1: number, y: number, h = 0.28, proj = 0.12) {
  F.span(b, mat, u0, u1, y, y + h, 0, proj)
}

export function pilaster(F: Frame, b: Batch, mat: Mat, u: number, y0: number, y1: number, wd = 0.7, proj = 0.16) {
  F.span(b, mat, u - wd / 2, u + wd / 2, y0, y1, 0, proj)
  F.span(b, mat, u - wd / 2 - 0.08, u + wd / 2 + 0.08, y1 - 0.4, y1, 0, proj + 0.05)
  F.span(b, mat, u - wd / 2 - 0.08, u + wd / 2 + 0.08, y0, y0 + 0.3, 0, proj + 0.05)
}

function addSolid(ctx: Ctx, bx: { x0: number; x1: number; z0: number; z1: number }) {
  ctx.solids.push(bx)
}

export function eagle(ctx: Ctx, x: number, y: number, z: number, ry: number, s = 1) {
  const b = ctx.batch
  const put = (geo: THREE.BufferGeometry) => {
    geo.scale(s, s, s)
    placeGeo(b, geo, M.gold, x, y, z, ry, 'keep')
  }
  // body: upright, leaning slightly forward
  const body = new THREE.SphereGeometry(0.3, 24, 16)
  body.scale(0.85, 1.5, 0.75)
  body.rotateX(0.18)
  body.translate(0, 0.62, 0)
  put(body)
  const breast = new THREE.SphereGeometry(0.22, 16, 12)
  breast.scale(1, 1.2, 0.8)
  breast.translate(0, 0.78, 0.1)
  put(breast)
  // neck + head
  const neck = new THREE.CylinderGeometry(0.1, 0.17, 0.3, 12)
  neck.rotateX(0.2)
  neck.translate(0, 1.08, 0.07)
  put(neck)
  const head = new THREE.SphereGeometry(0.125, 18, 14)
  head.scale(1, 1, 1.15)
  head.translate(0, 1.27, 0.1)
  put(head)
  const beak = new THREE.ConeGeometry(0.065, 0.22, 12)
  beak.rotateX(Math.PI / 2 + 0.55)
  beak.translate(0, 1.22, 0.31)
  put(beak)
  for (const sx of [-1, 1]) {
    const eye = new THREE.SphereGeometry(0.03, 8, 6)
    eye.translate(sx * 0.085, 1.31, 0.19)
    put(eye)
  }
  // wings: spread and raised, attached at the shoulders
  const feather = (sx: number) => {
    const pts: [number, number][] = [[0, 0.1], [0.3, 0.3], [0.7, 0.42], [1.05, 0.38], [1.12, 0.2], [1.02, 0.12], [1.08, -0.02], [0.92, -0.04], [0.95, -0.2], [0.76, -0.16], [0.72, -0.34], [0.54, -0.22], [0.42, -0.36], [0.26, -0.2], [0.08, -0.2]]
    const sh = new THREE.Shape()
    pts.forEach(([px, py], i) => (i ? sh.lineTo(px * sx, py) : sh.moveTo(px * sx, py)))
    sh.closePath()
    return sh
  }
  for (const sx of [-1, 1]) {
    const w = extrude(feather(sx), 0.06, 6)
    w.translate(0, 0, -0.03)
    w.rotateZ(sx * 0.55)
    w.rotateY(sx * -0.25)
    w.translate(sx * 0.2, 0.8, -0.12)
    put(w)
  }
  // tail fan
  const tail = new THREE.Shape()
  tail.moveTo(-0.14, 0)
  tail.lineTo(0.14, 0)
  tail.lineTo(0.22, -0.55)
  tail.lineTo(-0.22, -0.55)
  tail.closePath()
  const tg = extrude(tail, 0.05, 4)
  tg.rotateX(-0.35)
  tg.translate(0, 0.38, -0.3)
  put(tg)
  // talons on a perch
  for (const sx of [-1, 1]) {
    const t = new THREE.CylinderGeometry(0.035, 0.03, 0.34, 6)
    t.translate(sx * 0.11, 0.17, 0.05)
    put(t)
  }
}

/* ================================================================== */
/* Fence                                                               */
/* ================================================================== */
export function fenceRun(ctx: Ctx, x0: number, z0: number, x1: number, z1: number) {
  const b = ctx.batch
  const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0)
  const len = alongX ? Math.abs(x1 - x0) : Math.abs(z1 - z0)
  const cx = (x0 + x1) / 2
  const cz = (z0 + z1) / 2
  for (const y of [0.22, 1.05, 1.62]) {
    const g = new THREE.BoxGeometry(alongX ? len : 0.05, 0.06, alongX ? 0.05 : len)
    g.translate(cx, y, cz)
    b.add(g, M.iron)
  }
  // brick piers
  const n = Math.max(1, Math.round(len / 8))
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const px = x0 + (x1 - x0) * t
    const pz = z0 + (z1 - z0) * t
    const pier = new THREE.BoxGeometry(0.55, 2.0, 0.55)
    pier.translate(px, 1.0, pz)
    b.add(pier, M.brick)
    const cap = new THREE.BoxGeometry(0.75, 0.16, 0.75)
    cap.translate(px, 2.08, pz)
    b.add(cap, M.stone)
    const ball = new THREE.SphereGeometry(0.16, 10, 8)
    ball.translate(px, 2.34, pz)
    b.add(ball, M.stone)
  }
  ctx.fence.push({ x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1) })
  ctx.solids.push({ x0: Math.min(x0, x1) - (alongX ? 0 : 0.15), x1: Math.max(x0, x1) + (alongX ? 0 : 0.15), z0: Math.min(z0, z1) - (alongX ? 0.15 : 0), z1: Math.max(z0, z1) + (alongX ? 0.15 : 0) })
}

export function finalizeFence(ctx: Ctx) {
  const pos: THREE.Matrix4[] = []
  const tips: THREE.Matrix4[] = []
  for (const f of ctx.fence) {
    const alongX = f.x1 - f.x0 > f.z1 - f.z0
    const len = alongX ? f.x1 - f.x0 : f.z1 - f.z0
    const n = Math.floor(len / 0.14)
    for (let i = 1; i < n; i++) {
      const t = (i / n) * len
      const x = alongX ? f.x0 + t : f.x0
      const z = alongX ? f.z0 : f.z0 + t
      pos.push(new THREE.Matrix4().makeTranslation(x, 0.9, z))
      tips.push(new THREE.Matrix4().makeTranslation(x, 1.84, z))
    }
  }
  const bars = new THREE.InstancedMesh(new THREE.BoxGeometry(0.022, 1.75, 0.022), M.iron, pos.length)
  const tp = new THREE.InstancedMesh(new THREE.ConeGeometry(0.03, 0.16, 5), M.iron, tips.length)
  pos.forEach((m, i) => bars.setMatrixAt(i, m))
  tips.forEach((m, i) => tp.setMatrixAt(i, m))
  bars.castShadow = tp.castShadow = true
  bars.frustumCulled = tp.frustumCulled = false
  ctx.root.add(bars, tp)
}

/* ================================================================== */
/* Main gate on Plantage Kerklaan                                      */
/* ================================================================== */
export const GATE_Z = 70

function signTexture() {
  const c = canvas(1024, 150)
  const g = c.getContext('2d')!
  g.fillStyle = '#17231d'
  g.fillRect(0, 0, 1024, 150)
  g.strokeStyle = '#d9b24a'
  g.lineWidth = 5
  g.strokeRect(10, 10, 1004, 130)
  g.fillStyle = '#e7bf55'
  g.font = '600 66px "Georgia", serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText('NATURA ARTIS MAGISTRA', 512, 80)
  return canvasTex(c)
}

export function buildGate(ctx: Ctx) {
  const b = ctx.batch
  const z = GATE_Z
  // piers
  for (const s of [-1, 1]) {
    const x = s * 5.9
    const box = (w: number, y0: number, h: number, d: number, m: Mat) => {
      const g = new THREE.BoxGeometry(w, h, d)
      g.translate(x, y0 + h / 2, z)
      b.add(g, m)
    }
    box(2.4, 0, 0.9, 2.4, M.stoneRust)
    box(2.1, 0.9, 0.18, 2.1, M.stoneLight)
    box(1.8, 1.08, 3.7, 1.8, M.stone)
    box(2.0, 2.2, 0.2, 2.0, M.stoneLight)
    box(2.3, 4.78, 0.36, 2.3, M.stoneLight)
    box(2.05, 5.14, 0.16, 2.05, M.stone)
    box(1.45, 5.3, 0.55, 1.45, M.stoneLight)
    eagle(ctx, x, 5.85, z, s * 0.35 + Math.PI * 0.0, 1.25)
    ctx.solids.push({ x0: x - 1.2, x1: x + 1.2, z0: z - 1.2, z1: z + 1.2 })
    // open gate leaves
    const hx = s * 4.72
    for (const y of [0.35, 1.0, 1.75]) {
      const g = new THREE.BoxGeometry(0.05, 0.07, 4.4)
      g.translate(hx, y, z - 2.3)
      b.add(g, M.ironGreen)
    }
    for (let i = 0; i < 26; i++) {
      const g = new THREE.BoxGeometry(0.03, 1.55, 0.03)
      g.translate(hx, 1.05, z - 0.3 - i * 0.165)
      b.add(g, M.ironGreen)
      const t = new THREE.ConeGeometry(0.04, 0.18, 5)
      t.translate(hx, 1.9, z - 0.3 - i * 0.165)
      b.add(t, M.gold)
    }
    ctx.solids.push({ x0: hx - 0.1, x1: hx + 0.1, z0: z - 4.6, z1: z })
  }
  // hanging sign
  const beam = new THREE.BoxGeometry(11.0, 0.22, 0.22)
  beam.translate(0, 5.0, z)
  b.add(beam, M.ironGreen)
  const sg = new THREE.PlaneGeometry(7.4, 1.08)
  const signMat = new THREE.MeshStandardMaterial({ map: signTexture(), roughness: 0.55, metalness: 0.2, side: THREE.DoubleSide })
  const sign = new THREE.Mesh(sg, signMat)
  sign.position.set(0, 4.2, z)
  sign.castShadow = true
  ctx.root.add(sign)
  for (const sx of [-3.6, 3.6]) {
    const r = new THREE.BoxGeometry(0.04, 0.5, 0.04)
    r.translate(sx, 4.76, z)
    b.add(r, M.ironGreen)
  }
  // scroll ornaments (iron arcs)
  for (const s of [-1, 1]) {
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(s * 4.9, 4.9, z), new THREE.Vector3(s * 4.0, 4.2, z), new THREE.Vector3(s * 3.4, 4.5, z)])
    b.add(new THREE.TubeGeometry(curve, 16, 0.035, 6), M.ironGreen)
  }
  // fence runs
  fenceRun(ctx, -92, z, -7.0, z)
  fenceRun(ctx, 7.0, z, 14, z)
  fenceRun(ctx, 46, z, 92, z)
  fenceRun(ctx, -92, z, -92, -66)
  fenceRun(ctx, 92, z, 92, -66)
  fenceRun(ctx, -92, -66, 92, -66)
}

/* ================================================================== */
/* Ledenlokalen (1868, G.B. Salm)                                       */
/* ================================================================== */
export function buildLedenlokalen(ctx: Ctx) {
  const b = ctx.batch
  const F = new Frame(30, GATE_Z, 'S')
  const D = 12
  F.span(b, M.stoneRust, -16, 16, 0, 1.0, -D, 0.14)
  F.span(b, M.brick, -16, 16, 1.0, 9.2, -D, 0)
  F.span(b, M.stone, -16.4, -15.3, 0, 9.6, -D, 0.16)
  F.span(b, M.stone, 15.3, 16.4, 0, 9.6, -D, 0.16)
  stringCourse(F, b, M.stone, -16, 16, 4.55, 0.32, 0.16)
  stringCourse(F, b, M.stone, -16, 16, 1.0, 0.2, 0.2)
  cornice(F, b, M.stone, -16.4, 16.4, 9.2, 0.9)
  // risalit
  F.span(b, M.brick, -4.6, 4.6, 1.0, 9.2, -0.2, 1.2)
  F.span(b, M.stoneRust, -4.7, 4.7, 0, 1.0, -0.2, 1.3)
  F.span(b, M.stone, -4.9, -4.2, 0, 9.4, 0, 1.4)
  F.span(b, M.stone, 4.2, 4.9, 0, 9.4, 0, 1.4)
  stringCourse(F, b, M.stone, -4.6, 4.6, 4.55, 0.32, 1.4)
  cornice(F, b, M.stone, -5.0, 5.0, 9.2, 1.7)
  const ped = new THREE.Shape()
  ped.moveTo(-5.2, 0)
  ped.lineTo(5.2, 0)
  ped.lineTo(0, 2.6)
  ped.closePath()
  F.put(b, extrude(ped, 1.2), M.stone, 0, 9.85, 0.1)
  // roof
  roofHip(F, b, M.slateWarm, -16, 16, -D, 0, 9.8, 4.8, 0.7)
  // dormers
  for (const u of [-10, 0, 10]) {
    if (u === 0) continue
    F.span(b, M.paint, u - 1.0, u + 1.0, 10.9, 13.1, -3.4, -1.1)
    win(ctx, F.place(u, -1.1), 11.3, 1.1, 1.6, 'rect', { frame: M.paint })
    roofGable(F, b, M.slate, M.paint, u - 1.0, u + 1.0, -3.4, -1.1, 13.1, 0.9, 'w', 0.2)
  }
  for (const u of [-11.5, 11.5]) {
    F.span(b, M.brick, u - 0.55, u + 0.55, 11.5, 16, -6.4, -5.2)
    F.span(b, M.stone, u - 0.7, u + 0.7, 16, 16.25, -6.55, -5.05)
    F.span(b, M.brickDark, u - 0.4, u + 0.4, 16.25, 16.6, -6.35, -5.25)
  }
  // windows
  const us = [-13.5, -10, -6.7, 6.7, 10, 13.5]
  for (const u of us) {
    win(ctx, F.place(u, 0), 1.5, 1.7, 2.7, 'arch')
    win(ctx, F.place(u, 0), 5.5, 1.5, 2.6, 'rect')
  }
  for (const u of [-2.2, 2.2]) {
    win(ctx, F.place(u, 1.2), 5.5, 1.3, 2.6, 'rect')
  }
  win(ctx, F.place(0, 1.2), 5.3, 2.0, 3.2, 'arch')
  doorway(ctx, F.place(0, 1.2), 0.7, 2.2, 3.6, true)
  for (const s of [-1, 1]) win(ctx, F.place(s * 2.9, 1.2), 1.7, 0.9, 1.9, 'rect', { lit: true })
  // balcony rail
  F.span(b, M.iron, -1.6, 1.6, 5.3, 5.4, 1.2, 1.5)
  for (let u = -1.55; u < 1.6; u += 0.2) F.span(b, M.iron, u, u + 0.03, 5.3, 6.3, 1.45, 1.48)
  F.span(b, M.iron, -1.6, 1.6, 6.28, 6.34, 1.42, 1.5)
  // steps
  for (let i = 0; i < 3; i++) F.span(b, M.stone, -2.0 - i * 0.3, 2.0 + i * 0.3, 0, 0.2 * (3 - i) - 0.04, 1.2, 1.5 + (i + 1) * 0.0 + (2 - i) * 0.0 + 0.5 * (i + 1))
  addSolid(ctx, F.aabb(-16.4, 16.4, -D, 0.2))
  addSolid(ctx, F.aabb(-5, 5, 0, 1.4))
}

/* ================================================================== */
/* Groote Museum (1855, Johannes van Maurik) — faces east              */
/* ================================================================== */
function frieze(text: string, w: number, h: number) {
  const c = canvas(1024, Math.round((1024 * h) / w))
  const g = c.getContext('2d')!
  g.fillStyle = '#cfc4a8'
  g.fillRect(0, 0, c.width, c.height)
  g.fillStyle = '#4a4233'
  g.font = `600 ${c.height * 0.52}px "Georgia", serif`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(text, c.width / 2, c.height / 2 + 4)
  return canvasTex(c)
}

export const MUSEUM_F = new Frame(-56, 6, 'E')
export function buildGrooteMuseum(ctx: Ctx) {
  const b = ctx.batch
  const F = MUSEUM_F
  const D = 18
  const U = 27
  F.span(b, M.stoneRust, -U, U, 0, 5.4, -D, 0)
  F.span(b, M.stucco, -U, U, 5.4, 11.2, -D, 0)
  F.span(b, M.stoneLight, -U, U, 5.4, 5.8, -D, 0.14)
  cornice(F, b, M.stoneLight, -U - 0.4, U + 0.4, 11.2, 1.0)
  F.span(b, M.stoneLight, -U - 0.3, U + 0.3, 12.1, 12.6, -D, 0.6)
  roofHip(F, b, M.slate, -U, U, -D, 0, 12.6, 3.6, 0.8)
  // pilasters
  for (const s of [-1, 1]) {
    pilaster(F, b, M.stoneLight, s * (U - 0.5), 5.8, 11.2, 0.9, 0.2)
    pilaster(F, b, M.stoneLight, s * 10.6, 5.8, 11.2, 0.8, 0.2)
  }
  // wings windows
  for (const s of [-1, 1]) {
    for (const u of [13.0, 17.0, 21.0, 25.0]) {
      const uu = s * u
      win(ctx, F.place(uu, 0), 1.3, 1.5, 2.8, 'rect', { frame: M.stone })
      win(ctx, F.place(uu, 0), 6.5, 1.9, 4.2, 'arch')
    }
  }
  // portico
  const PW = 6.6
  F.span(b, M.stone, -10.2, 10.2, 0, 1.4, 0, PW)
  F.span(b, M.stoneLight, -10.4, 10.4, 1.3, 1.45, -0.05, PW + 0.2)
  for (const u of [-9, -5.4, -1.8, 1.8, 5.4, 9]) {
    F.put(b, columnGeo('ionic', 0.55, 8.9), M.stoneLight, u, 1.4, 5.5, 'keep')
    ctx.posts.push({ x: F.x(u, 5.5), z: F.z(u, 5.5), r: 0.75 })
  }
  F.span(b, M.stoneLight, -10.2, 10.2, 10.3, 11.2, 0.0, PW)
  F.span(b, M.stoneLight, -10.4, 10.4, 11.2, 11.5, -0.1, PW + 0.2)
  const ped = new THREE.Shape()
  ped.moveTo(-10.6, 0)
  ped.lineTo(10.6, 0)
  ped.lineTo(0, 3.1)
  ped.closePath()
  F.put(b, extrude(ped, PW + 0.2), M.stoneLight, 0, 11.5, -0.1)
  const ped2 = new THREE.Shape()
  ped2.moveTo(-8.8, 0)
  ped2.lineTo(8.8, 0)
  ped2.lineTo(0, 2.2)
  ped2.closePath()
  F.put(b, extrude(ped2, 0.1), M.stuccoIn, 0, 11.75, PW + 0.1)
  const fr = new THREE.Mesh(new THREE.PlaneGeometry(14, 0.72), new THREE.MeshStandardMaterial({ map: frieze('NATURA ARTIS MAGISTRA', 14, 0.72), roughness: 0.8 }))
  fr.position.set(F.x(0, PW + 0.012), 10.75, F.z(0, PW + 0.012))
  fr.rotation.y = F.rotY
  ctx.root.add(fr)
  // medallion
  const med = new THREE.CylinderGeometry(0.9, 0.9, 0.12, 32)
  med.rotateX(Math.PI / 2)
  F.put(b, med, M.gold, 0, 12.9, PW + 0.2, 'keep')
  // main door & windows between columns
  doorway(ctx, F.place(0, 0), 1.4, 3.0, 5.6, true, M.stoneLight)
  for (const u of [-3.6, 3.6]) win(ctx, F.place(u, 0), 3.0, 1.7, 4.4, 'arch')
  for (const u of [-7.2, 7.2]) win(ctx, F.place(u, 0), 3.0, 1.4, 4.4, 'arch')
  // steps
  for (let i = 0; i < 7; i++) F.span(b, M.stone, -9.8, 9.8, 0, 1.4 - (i + 1) * 0.2 + 0.2, PW, PW + 0.5 * (7 - i))
  // acroteria / finials
  for (const u of [-10.6, 10.6]) {
    const g = new THREE.SphereGeometry(0.4, 16, 12)
    F.put(b, g, M.stoneLight, u, 11.9, 0.3, 'keep')
  }
  // chimneys
  for (const u of [-18, 18]) {
    F.span(b, M.brick, u - 0.6, u + 0.6, 13, 17, -8, -6.8)
    F.span(b, M.stone, u - 0.75, u + 0.75, 17, 17.25, -8.15, -6.65)
  }
  addSolid(ctx, F.aabb(-U, U, -D, 0.1))
  ctx.floors.push({ ...F.aabb(-10.2, 10.2, 0, PW), y: 1.4 })
  const rb = F.aabb(-9.8, 9.8, PW, PW + 3.5)
  ctx.floors.push({ ...rb, y: 0, ramp: { axis: 'x', from: F.x(0, PW + 3.5), to: F.x(0, PW), y0: 0, y1: 1.4 } })
}

/* ================================================================== */
/* Aquarium (1882, G.B. & A. Salm) — exterior                           */
/* ================================================================== */
export const AQ_F = new Frame(0, -40, 'S')
export const AQ = { floorY: 1.2, hallU: 22, hallW0: -20.8, hallW1: -1.2, ceilY: 9.8 }

export function buildAquariumExterior(ctx: Ctx) {
  const b = ctx.batch
  const F = AQ_F
  const BASE = 4.6
  const wall = (u0: number, u1: number, w0: number, w1: number, yTop: number, y0 = 0) => {
    if (y0 < BASE) F.span(b, M.stoneRust, u0, u1, y0, Math.min(BASE, yTop), w0, w1)
    if (yTop > BASE) F.span(b, M.stone, u0, u1, Math.max(BASE, y0), yTop, w0, w1)
  }
  // --- front wall (hollow hall behind) ---
  const FW = -1.2
  for (const s of [-1, 1]) {
    const a = s < 0 ? -24 : 2.2
    const c = s < 0 ? -2.2 : 24
    // recess + centre
    if (s < 0) {
      wall(-24, -12.2, FW, 0, 10.4)
      wall(-12.2, -2.2, FW, 0, 11.8)
    } else {
      wall(12.2, 24, FW, 0, 10.4)
      wall(2.2, 12.2, FW, 0, 11.8)
    }
    void a
    void c
    // side walls of hall
    F.span(b, M.stone, s * 22, s * 24, 0, 10.4, -22, 0)
    // back wall
    wall(s < 0 ? -24 : 12.2, s < 0 ? -12.2 : 24, -22, -20.8, 10.4)
    // flanking pavilions
    wall(s < 0 ? -36 : 24, s < 0 ? -24 : 36, -22, 1.8, 12.2)
  }
  wall(-12.2, 12.2, -22, -20.8, 11.8)
  F.span(b, M.stone, -2.2, 2.2, 6.6, 11.8, FW, 0)
  F.span(b, M.stone, -2.2, 2.2, 0, 1.2, FW, 0)
  // roof of hall (flat slab beneath pitched roofs, hides ceiling void)
  F.span(b, M.stone, -24, 24, 9.86, 10.4, -22, 0)
  F.span(b, M.stone, -12.2, 12.2, 9.86, 11.8, -22, 0)

  // --- string courses, cornices, pilasters ---
  for (const [u0, u1] of [[-24, -12.2], [12.2, 24]] as [number, number][]) {
    stringCourse(F, b, M.stoneLight, u0, u1, BASE, 0.3, 0.14)
    cornice(F, b, M.stoneLight, u0, u1, 10.4, 0.85)
  }
  for (const s of [-1, 1]) {
    const u0 = s < 0 ? -36.3 : 23.7
    const u1 = s < 0 ? -23.7 : 36.3
    stringCourse(F, b, M.stoneLight, u0, u1, BASE, 0.3, 0.14)
    F.span(b, M.stoneLight, u0, u1, 12.2, 12.55, -22, 2.3)
    cornice(F, b, M.stoneLight, u0, u1, 12.4, 1.0)
    pilaster(F, b, M.stoneLight, s * 24.3, BASE + 0.3, 12.2, 0.8, 0.26)
    pilaster(F, b, M.stoneLight, s * 35.6, BASE + 0.3, 12.2, 0.8, 0.26)
    // rusticated quoins on pavilion corners
    for (let y = 0.4; y < BASE; y += 0.9) {
      F.span(b, M.stoneRust, s * 24.0 - 0.45, s * 24.0 + 0.45, y, y + 0.46, 0, 1.9)
    }
  }
  stringCourse(F, b, M.stoneLight, -12.2, 12.2, BASE + 1.0, 0.3, 0.14)

  // --- windows ---
  for (const s of [-1, 1]) {
    for (const u of [15.2, 18.1, 21.0]) {
      win(ctx, F.place(s * u, 0), 1.7, 1.3, 1.9, 'rect', { frame: M.stone })
      win(ctx, F.place(s * u, 0), 5.7, 1.7, 4.2, 'arch', { blue: true })
    }
    for (const u of [27.6, 32.4]) {
      win(ctx, F.place(s * u, 1.8), 1.7, 1.4, 2.0, 'rect', { frame: M.stone })
      win(ctx, F.place(s * u, 1.8), 6.0, 1.8, 4.9, 'arch', { blue: true })
    }
    for (const u of [5.2, 8.6]) win(ctx, F.place(s * u, 0), 2.4, 1.8, 5.2, 'arch', { blue: true })
    // side faces of pavilions
    for (const w of [-6, -14]) {
      const p: Place = { x: F.x(s * 36.0, w), z: F.z(s * 36.0, w), ry: Math.atan2(s, 0) }
      if (s < 0) win(ctx, p, 1.7, 1.3, 1.9, 'rect', { frame: M.stone })
      if (s < 0) win(ctx, p, 6.0, 1.6, 4.9, 'arch')
    }
    for (const w of [-6, -14]) {
      const p: Place = { x: F.x(s * 24.0, w), z: F.z(s * 24.0, w), ry: 0 }
      void p
    }
  }
  // --- door ---
  const door = F.place(0, 0)
  const bw = 0.5
  F.span(b, M.stoneLight, -2.2 - bw, -2.2, 1.2, 6.8, -0.1, 0.35)
  F.span(b, M.stoneLight, 2.2, 2.2 + bw, 1.2, 6.8, -0.1, 0.35)
  F.span(b, M.stoneLight, -2.9, 2.9, 6.6, 7.1, -0.1, 0.45)
  cornice(F, b, M.stoneLight, -3.4, 3.4, 7.3, 0.6, false)
  void door
  // transom glow above door
  for (const s of [-1, 1]) F.span(b, M.doorWood, s * 2.1 - 0.06, s * 2.1 + 0.06, 1.2, 6.5, -3.5, -1.2)
  // lit transom
  const tr = new THREE.PlaneGeometry(4.0, 1.6)
  F.put(b, tr, M.glassLit, 0, 8.6, 0.04, 'keep')

  // --- temple front ---
  const PW = 6.4
  F.span(b, M.stone, -12.0, 12.0, 0, 1.2, 0, PW)
  F.span(b, M.stoneLight, -12.2, 12.2, 1.1, 1.26, -0.05, PW + 0.2)
  for (const u of [-9.7, -6.1, -2.5, 2.5, 6.1, 9.7]) {
    F.put(b, columnGeo('corinthian', 0.62, 8.8), M.stoneLight, u, 1.2, PW - 1.0, 'keep')
    ctx.posts.push({ x: F.x(u, PW - 1.0), z: F.z(u, PW - 1.0), r: 0.85 })
  }
  F.span(b, M.stoneLight, -12.0, 12.0, 10.0, 10.55, 0.0, PW)
  F.span(b, M.stone, -12.0, 12.0, 10.55, 11.35, 0.0, PW)
  F.span(b, M.stoneLight, -12.25, 12.25, 11.35, 11.8, -0.1, PW + 0.25)
  roofGable(F, b, M.slate, M.stoneLight, -12.2, 12.2, -22, PW + 0.1, 11.8, 3.7, 'w', 0.55)
  const tym = new THREE.Shape()
  tym.moveTo(-10.4, 0)
  tym.lineTo(10.4, 0)
  tym.lineTo(0, 2.7)
  tym.closePath()
  F.put(b, extrude(tym, 0.12), M.stuccoIn, 0, 12.0, PW + 0.1)
  const med = new THREE.CylinderGeometry(1.2, 1.2, 0.15, 36)
  med.rotateX(Math.PI / 2)
  F.put(b, med, M.copper, 0, 13.3, PW + 0.24, 'keep')
  const ring = new THREE.TorusGeometry(1.25, 0.1, 10, 40)
  F.put(b, ring, M.gold, 0, 13.3, PW + 0.3, 'keep')
  // frieze
  const fr = new THREE.Mesh(new THREE.PlaneGeometry(16, 0.62), new THREE.MeshStandardMaterial({ map: frieze('NATURA ARTIS MAGISTRA', 16, 0.62), roughness: 0.8 }))
  fr.position.set(F.x(0, PW + 0.012), 10.95, F.z(0, PW + 0.012))
  fr.rotation.y = F.rotY
  ctx.root.add(fr)
  // acroteria
  for (const u of [-12.2, 12.2]) F.put(b, new THREE.SphereGeometry(0.5, 16, 12), M.stoneLight, u, 12.1, PW * 0.5, 'keep')
  // steps (visual)
  for (let i = 0; i < 4; i++) F.span(b, M.stone, -8.5, 8.5, 0, 1.2 - (i + 1) * 0.3 + 0.3, PW, PW + 0.75 * (4 - i))
  ctx.floors.push({ ...F.aabb(-12, 12, 0, PW), y: 1.2 })
  ctx.floors.push({ ...F.aabb(-8.5, 8.5, PW, PW + 3.0), y: 0, ramp: { axis: 'z', from: F.z(0, PW + 3.0), to: F.z(0, PW), y0: 0, y1: 1.2 } })
  ctx.floors.push({ ...F.aabb(-22, 22, -20.8, -1.2), y: AQ.floorY })

  // --- roofs ---
  for (const s of [-1, 1]) {
    const a = s < 0 ? -24 : 12.2
    const c = s < 0 ? -12.2 : 24
    roofHip(F, b, M.slate, a, c, -22, 0, 10.4, 2.4, 0.5)
  }
  roofHip(F, b, M.slate, -36, -24, -22, 1.8, 12.4, 4.6, 0.6)
  // finial on west pavilion
  F.put(b, new THREE.CylinderGeometry(0.06, 0.1, 1.2, 8), M.gold, -30, 17.0, -10.1, 'keep')
  F.put(b, new THREE.SphereGeometry(0.2, 12, 10), M.gold, -30, 17.7, -10.1, 'keep')
  // ridge cresting of central roof
  F.span(b, M.iron, -0.08, 0.08, 15.5, 15.8, -22, PW)

  // --- east pavilion + apse with copper dome ---
  const CX = 36
  const CZ = -51
  const R = 11
  wall(24, 36, -22, 1.8, 12.2)
  const apse = new THREE.CylinderGeometry(R, R, 11, 56, 1, true, 0, Math.PI)
  apse.translate(CX, 5.5, CZ)
  scaleUV(apse, (Math.PI * R) / 3.0, 11 / 3.0)
  b.add(apse, M.stone, 'keep')
  const apseBase = new THREE.CylinderGeometry(R + 0.12, R + 0.12, BASE, 56, 1, true, 0, Math.PI)
  apseBase.translate(CX, BASE / 2, CZ)
  scaleUV(apseBase, (Math.PI * R) / 2.4, BASE / 2.4)
  b.add(apseBase, M.stoneRust, 'keep')
  const apseCor = new THREE.CylinderGeometry(R + 0.8, R + 0.5, 0.8, 56, 1, false, 0, Math.PI)
  apseCor.translate(CX, 10.9, CZ)
  scaleUV(apseCor, (Math.PI * R) / 3.0, 0.3)
  b.add(apseCor, M.stoneLight, 'keep')
  const apseCap = new THREE.CircleGeometry(R + 0.5, 56, 0, Math.PI)
  apseCap.rotateX(-Math.PI / 2)
  apseCap.rotateY(Math.PI / 2)
  apseCap.translate(CX, 11.3, CZ)
  b.add(apseCap, M.stone)
  const n = 5
  for (let i = 0; i < n; i++) {
    const th = ((i + 1) / (n + 1)) * Math.PI
    const p: Place = { x: CX + R * Math.sin(th), z: CZ + R * Math.cos(th), ry: th }
    win(ctx, p, 1.7, 1.3, 1.9, 'rect', { frame: M.stone })
    win(ctx, p, 5.9, 1.7, 4.2, 'arch', { blue: true })
  }
  // dome
  const dome = new THREE.SphereGeometry(R + 0.5, 56, 28, 0, TAU, 0, Math.PI / 2)
  dome.scale(1, 0.58, 1)
  dome.translate(CX, 11.6, CZ)
  scaleUV(dome, 6, 3)
  b.add(dome, M.copper, 'keep')
  for (let i = 0; i < 12; i++) {
    const rib = new THREE.TorusGeometry(R + 0.55, 0.07, 6, 40, Math.PI)
    rib.scale(1, 0.58, 1)
    rib.rotateY((i / 12) * Math.PI)
    rib.translate(CX, 11.6, CZ)
    b.add(rib, M.gold)
  }
  const lant = new THREE.CylinderGeometry(1.1, 1.3, 2.2, 16)
  lant.translate(CX, 11.6 + (R + 0.5) * 0.58 + 0.9, CZ)
  b.add(lant, M.stoneLight)
  const lantTop = new THREE.ConeGeometry(1.35, 1.6, 16)
  lantTop.translate(CX, 11.6 + (R + 0.5) * 0.58 + 2.8, CZ)
  b.add(lantTop, M.copper)
  const ball = new THREE.SphereGeometry(0.22, 12, 10)
  ball.translate(CX, 11.6 + (R + 0.5) * 0.58 + 3.8, CZ)
  b.add(ball, M.gold)

  // --- colliders ---
  const full = (u0: number, u1: number, w0: number, w1: number) => addSolid(ctx, F.aabb(u0, u1, w0, w1))
  full(-24, -2.2, -1.3, 0.1)
  full(2.2, 24, -1.3, 0.1)
  full(-24, 24, -22, -20.5)
  full(-24, -21.8, -22, 0.1)
  full(21.8, 24, -22, 0.1)
  full(-36.5, -24, -22, 2.0)
  full(24, 37, -22, 2.0)
  addSolid(ctx, { x0: 36, x1: 47.2, z0: -62, z1: -40 })
  full(-24, 24, -22, -20.5)
}

/* ================================================================== */
/* Houses across Plantage Kerklaan + skyline                            */
/* ================================================================== */
function facadeTexture(seed: number, tint: string, floors: number) {
  const r = rng(seed)
  const W = 320
  const H = 80 + floors * 140
  const c = canvas(W, H)
  const g = c.getContext('2d')!
  const img = (document.createElement('canvas') as HTMLCanvasElement)
  void img
  g.fillStyle = tint
  g.fillRect(0, 0, W, H)
  // brick courses
  for (let y = 0; y < H; y += 6) {
    g.fillStyle = 'rgba(40,25,20,0.35)'
    g.fillRect(0, y, W, 1)
    for (let x = (y / 6) % 2 ? 0 : 7; x < W; x += 14) {
      g.fillStyle = 'rgba(30,20,15,0.25)'
      g.fillRect(x, y, 1, 6)
      g.fillStyle = `rgba(${(r() * 255) | 0},${(r() * 120) | 0},${(r() * 60) | 0},0.07)`
      g.fillRect(x + 1, y + 1, 12, 4)
    }
  }
  const winW = 66
  const winH = 104
  for (let f = 0; f < floors; f++) {
    const y = H - 150 - f * 140 - (f === 0 ? 0 : 0)
    for (const x of [58, W - 58 - winW]) {
      const top = f === 0 ? H - 196 : y - 20
      const hh = f === floors - 1 ? winH * 0.9 : winH + (floors - f) * 4
      g.fillStyle = '#e8e2d2'
      g.fillRect(x - 6, top - 8, winW + 12, hh + 16)
      const grd = g.createLinearGradient(0, top, 0, top + hh)
      grd.addColorStop(0, '#41566a')
      grd.addColorStop(1, '#1b2733')
      g.fillStyle = grd
      g.fillRect(x, top, winW, hh)
      g.fillStyle = r() < 0.4 ? 'rgba(255,200,120,0.5)' : 'rgba(255,255,255,0.08)'
      g.fillRect(x, top, winW, hh)
      g.fillStyle = '#f0ece0'
      for (let k = 1; k < 3; k++) g.fillRect(x + (winW / 3) * k - 1.5, top, 3, hh)
      for (let k = 1; k < 4; k++) g.fillRect(x, top + (hh / 4) * k - 1.5, winW, 3)
      g.fillStyle = '#d9d2c0'
      g.fillRect(x - 10, top + hh + 8, winW + 20, 7)
      g.fillRect(x - 8, top - 16, winW + 16, 8)
    }
  }
  // door on ground floor centre
  g.fillStyle = '#e8e2d2'
  g.fillRect(W / 2 - 30, H - 156, 60, 156)
  g.fillStyle = r() < 0.5 ? '#1f4a36' : '#5b1f1f'
  g.fillRect(W / 2 - 24, H - 148, 48, 148)
  g.fillStyle = '#d9b24a'
  g.fillRect(W / 2 + 12, H - 80, 5, 5)
  const t = canvasTex(c)
  return { tex: t, ratio: W / H }
}

function gableShape(w: number, kind: number) {
  const s = new THREE.Shape()
  const h = w * 0.8
  s.moveTo(-w / 2, 0)
  s.lineTo(w / 2, 0)
  if (kind === 0) {
    const steps = 4
    for (let i = 0; i < steps; i++) {
      const x = w / 2 - (i * (w / 2 - 0.5)) / steps
      const y = (i + 1) * (h / (steps + 1))
      s.lineTo(x, y)
      s.lineTo(w / 2 - ((i + 1) * (w / 2 - 0.5)) / steps, y)
    }
    s.lineTo(0.5, h)
    s.lineTo(-0.5, h)
    for (let i = steps - 1; i >= 0; i--) {
      const y = (i + 1) * (h / (steps + 1))
      s.lineTo(-w / 2 + ((i + 1) * (w / 2 - 0.5)) / steps, y)
      s.lineTo(-w / 2 + (i * (w / 2 - 0.5)) / steps, y)
    }
  } else if (kind === 1) {
    s.lineTo(w / 2, h * 0.3)
    s.quadraticCurveTo(w * 0.28, h * 0.45, w * 0.3, h * 0.62)
    s.quadraticCurveTo(w * 0.3, h * 0.92, 0, h)
    s.quadraticCurveTo(-w * 0.3, h * 0.92, -w * 0.3, h * 0.62)
    s.quadraticCurveTo(-w * 0.28, h * 0.45, -w / 2, h * 0.3)
  } else {
    s.lineTo(w / 2, h * 0.2)
    s.lineTo(0, h * 0.95)
    s.lineTo(-w / 2, h * 0.2)
  }
  s.closePath()
  return s
}

export function buildStreetHouses(ctx: Ctx) {
  const b = ctx.batch
  const r = rng(404)
  const tints = ['#8c3e2b', '#7a3524', '#9a5336', '#6e3a2c', '#a35d3d']
  const variants = tints.map((t, i) => {
    const floors = 3 + (i % 2)
    const { tex } = facadeTexture(i * 31 + 5, t, floors)
    return { floors, mat: new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92 }) }
  })
  let x = -118
  let k = 0
  while (x < 118) {
    const w = 5.2 + r() * 1.6
    const v = variants[k % variants.length]
    const fl = v.floors
    const H = 4.2 + fl * 3.0
    const F = new Frame(x + w / 2, 93, 'N')
    F.span(b, M.brickWarm, -w / 2, w / 2, 0, H, -12, 0)
    const pl = new THREE.PlaneGeometry(w, H)
    pl.translate(0, H / 2, 0.02)
    F.put(b, pl, v.mat, 0, 0, 0, 'keep')
    cornice(F, b, M.stoneLight, -w / 2 - 0.1, w / 2 + 0.1, H, 0.5, false)
    // gable
    const gk = (k * 7 + 1) % 3
    const gs = gableShape(w + 0.2, gk)
    const g = extrude(gs, 0.5)
    g.translate(0, 0, -0.3)
    F.put(b, g, M.brickWarm, 0, H + 0.34, 0.1)
    roofGable(F, b, M.slateWarm, M.brickWarm, -w / 2, w / 2, -12, 0, H + 0.34, w * 0.5, 'w', 0.2)
    // hoist beam
    F.span(b, M.woodDark, -0.05, 0.05, H + 0.2 + w * 0.3, H + 0.2 + w * 0.3 + 0.12, 0, 1.0)
    ctx.solids.push(F.aabb(-w / 2, w / 2, -12, 0))
    x += w + 0.1
    k++
  }
}

export function buildSkyline(ctx: Ctx) {
  const b = ctx.batch
  const r = rng(909)
  const mats = [M.brickWarm, M.brickDark, M.stucco, M.brick]
  for (let i = 0; i < 90; i++) {
    const a = r() * TAU
    const rad = 175 + r() * 80
    const x = Math.cos(a) * rad * 1.15
    const z = Math.sin(a) * rad
    if (z > 70 && z < 130) continue
    const w = 14 + r() * 18
    const d = 12 + r() * 14
    const h = 12 + r() * 20
    const F = new Frame(x, z, 'S')
    const m = mats[(r() * mats.length) | 0]
    F.span(b, m, -w / 2, w / 2, 0, h, -d / 2, d / 2)
    if (r() < 0.7) roofHip(F, b, M.slate, -w / 2, w / 2, -d / 2, d / 2, h, 3 + r() * 4, 0.5)
    else F.span(b, M.stuccoIn, -w / 2, w / 2, h, h + 0.5, -d / 2, d / 2)
  }
  // a church spire for the Amsterdam silhouette
  const F = new Frame(-150, -140, 'S')
  F.span(b, M.brickDark, -5, 5, 0, 40, -5, 5)
  b.add(new THREE.ConeGeometry(6, 26, 4).translate(-150, 53, -140).rotateY(0) as THREE.BufferGeometry, M.slate)
}

export function mkStd(color: string, rough = 0.6, metal = 0) {
  return std(color, rough, metal)
}
export { poly, roofGable }

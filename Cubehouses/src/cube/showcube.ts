import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import {
  D,
  LAYOUTS,
  S,
  WALL,
  buildCubeShell,
  crossSection,
  facePlanes,
  faceAngle0,
  hexPoints,
  planeDist,
} from './cube'
import { emissiveMat, concreteMat, fabricMat, frameMat, glassMat, parquetMat, plasterMat, signMat, solid, tileMat, woodDarkMat, woodLightMat } from './textures'
import { makePlant } from './foliage'
import { V2, mergeByMaterial, shade } from './util'

/* ------------------------------------------------------------------ constants */
export const YB = 2.6 // height of the cube's lowest corner above the pavement
export const YC = YB + D / 2 // cube centre height
export const RISE = 0.19
export const FLOORS = [0, 28 * RISE, 42 * RISE, 55 * RISE] // top of each floor above pavement
export const EYE = [1.68, 1.68, 1.68, 1.5]
export const TRUNC = 1.45
export const PYLON_APO = 1.85
export const PYLON_T = 0.2
export const HALL_H = 2.75
export const SHAFT_R = 1.0
export const DA = (22 * Math.PI) / 180
export const DOOR_W = 0.95
export const DOOR_H = 2.15
const WALK_INSET = WALL * 1.2247

export interface OBB {
  x: number
  z: number
  hx: number
  hz: number
  rot: number
}
export interface Plane {
  nx: number
  nz: number
  c: number
}
export interface ShowCube {
  group: THREE.Group
  a0: number
  doorAng: number
  floors: number[]
  planes: Plane[][] // by level (1..3)
  obbs: OBB[][] // by level
  lights: { level: number; light: THREE.PointLight; base: number }[]
  stair: { theta0: number; da: number; rise: number }
  anchors: Record<string, THREE.Vector3>
  roomNames: string[]
}

/* ------------------------------------------------------------------ helpers */
function offsetPoly(poly: V2[], d: number): V2[] {
  const n = poly.length
  const lines = poly.map((v, i) => {
    const w = poly[(i + 1) % n]
    const ex = w[0] - v[0]
    const ez = w[1] - v[1]
    const L = Math.hypot(ex, ez)
    let nx = -ez / L
    let nz = ex / L
    // inward = towards origin
    if (nx * (0 - v[0]) + nz * (0 - v[1]) < 0) {
      nx = -nx
      nz = -nz
    }
    return { nx, nz, c: v[0] * nx + v[1] * nz + d }
  })
  return poly.map((_, i) => {
    const a = lines[(i - 1 + n) % n]
    const b = lines[i]
    const det = a.nx * b.nz - a.nz * b.nx
    return [(a.c * b.nz - a.nz * b.c) / det, (a.nx * b.c - a.c * b.nx) / det] as V2
  })
}

function rb(
  p: THREE.Object3D,
  w: number,
  h: number,
  d: number,
  mat: THREE.Material,
  x: number,
  y: number,
  z: number,
  ry = 0,
  r = 0.02,
) {
  const rad = Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001)
  const m = shade(new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, rad), mat))
  m.position.set(x, y + h / 2, z)
  m.rotation.y = ry
  p.add(m)
  return m
}
function cy(p: THREE.Object3D, rt: number, rb_: number, h: number, mat: THREE.Material, x: number, y: number, z: number, seg = 20) {
  const m = shade(new THREE.Mesh(new THREE.CylinderGeometry(rt, rb_, h, seg), mat))
  m.position.set(x, y + h / 2, z)
  p.add(m)
  return m
}

const polar = (a: number, r: number, t = 0): [number, number] => [Math.cos(a) * r - Math.sin(a) * t, Math.sin(a) * r + Math.cos(a) * t]
const faceCenter = (a: number) => Math.atan2(-Math.cos(a), -Math.sin(a))

function sectorGeo(r0: number, r1: number, da: number, depth: number) {
  const sh = new THREE.Shape()
  const n = 8
  for (let i = 0; i <= n; i++) {
    const a = -da / 2 + (da * i) / n
    const x = Math.cos(a) * r1
    const y = Math.sin(a) * r1
    if (i === 0) sh.moveTo(x, y)
    else sh.lineTo(x, y)
  }
  for (let i = n; i >= 0; i--) {
    const a = -da / 2 + (da * i) / n
    sh.lineTo(Math.cos(a) * r0, Math.sin(a) * r0)
  }
  const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false })
  g.rotateX(-Math.PI / 2)
  g.translate(0, -depth, 0)
  return g
}

/* ------------------------------------------------------------------ main builder */
export function buildShowCube(cx: number, cz: number, doorWorldAngle: number): ShowCube {
  const a0 = faceAngle0()
  const yaw = a0 // after this yaw, face normals sit at multiples of 60° in world space
  const G = new THREE.Group()
  G.position.set(cx, 0, cz)
  G.rotation.y = yaw

  // local angle of the door: world angle w ↔ local angle w + yaw
  let doorK = Math.round((doorWorldAngle + yaw - a0) / (Math.PI / 3))
  doorK = ((doorK % 6) + 6) % 6
  const doorAng = a0 + (doorK * Math.PI) / 3

  const concrete = concreteMat()
  const plaster = plasterMat()
  const parquet = parquetMat()

  /* ---- cube shell (truncated at the bottom so the stair shaft can pass) ---- */
  const shell = buildCubeShell({ layout: LAYOUTS[0], show: true, truncate: TRUNC })
  shell.position.y = YC
  G.add(shell)

  /* ---- hexagonal pylon (hollow hall) ---- */
  const H1 = FLOORS[1]
  const L = PYLON_APO * 2 * Math.tan(Math.PI / 6)
  const gap = DOOR_W / 2
  for (let k = 0; k < 6; k++) {
    const al = a0 + (k * Math.PI) / 3
    const c = Math.cos(al)
    const s = Math.sin(al)
    const shape = new THREE.Shape()
    if (k === doorK) {
      shape.moveTo(-L / 2, 0)
      shape.lineTo(-gap, 0)
      shape.lineTo(-gap, DOOR_H)
      shape.lineTo(gap, DOOR_H)
      shape.lineTo(gap, 0)
      shape.lineTo(L / 2, 0)
      shape.lineTo(L / 2, H1)
      shape.lineTo(-L / 2, H1)
      shape.closePath()
    } else {
      shape.moveTo(-L / 2, 0)
      shape.lineTo(L / 2, 0)
      shape.lineTo(L / 2, H1)
      shape.lineTo(-L / 2, H1)
      shape.closePath()
    }
    const geo = new THREE.ExtrudeGeometry(shape, { depth: PYLON_T, bevelEnabled: false })
    geo.translate(0, 0, -PYLON_T)
    const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(s, 0, -c), new THREE.Vector3(0, 1, 0), new THREE.Vector3(c, 0, s))
    m.setPosition(c * PYLON_APO, 0, s * PYLON_APO)
    geo.applyMatrix4(m)
    const mesh = shade(new THREE.Mesh(geo, concrete))
    G.add(mesh)
  }
  // hall floor, ceiling
  const hallPts = hexPoints(PYLON_APO - PYLON_T, a0)
  {
    const sh = new THREE.Shape(hallPts.map(([x, z]) => new THREE.Vector2(x, -z)))
    const fg = new THREE.ShapeGeometry(sh)
    fg.rotateX(-Math.PI / 2)
    const fl = new THREE.Mesh(fg, tileMat('#cfcbc2', '#8f8b83', 6))
    fl.position.y = 0.02
    fl.receiveShadow = true
    G.add(fl)
    const cs = new THREE.Shape(hexPoints(PYLON_APO - PYLON_T + 0.05, a0).map(([x, z]) => new THREE.Vector2(x, -z)))
    const hole = new THREE.Path()
    hole.absarc(0, 0, SHAFT_R, 0, Math.PI * 2, true)
    cs.holes.push(hole)
    const cg = new THREE.ExtrudeGeometry(cs, { depth: 0.2, bevelEnabled: false, curveSegments: 32 })
    cg.rotateX(-Math.PI / 2)
    cg.translate(0, HALL_H, 0)
    G.add(shade(new THREE.Mesh(cg, [plaster, plaster])))
  }
  // stair shaft
  {
    const sg = new THREE.CylinderGeometry(SHAFT_R + 0.02, SHAFT_R + 0.02, FLOORS[1] - HALL_H, 40, 1, true)
    const sm = new THREE.Mesh(sg, new THREE.MeshStandardMaterial({ color: '#e8e3d9', roughness: 0.9, side: THREE.DoubleSide }))
    sm.position.y = (FLOORS[1] + HALL_H) / 2
    sm.receiveShadow = true
    G.add(sm)
  }
  // door frame + open leaf + plaque
  {
    const [dx, dz] = polar(doorAng, PYLON_APO)
    const dg = new THREE.Group()
    dg.position.set(dx, 0, dz)
    dg.rotation.y = -doorAng + Math.PI / 2 // local +z of group points outwards along door normal
    // after rotation: group +z = (sin(rot), cos(rot)) = (cos a, sin a)
    const fm = frameMat()
    rb(dg, 0.07, DOOR_H + 0.07, PYLON_T + 0.06, fm, -gap - 0.035, 0, -PYLON_T / 2, 0, 0.01)
    rb(dg, 0.07, DOOR_H + 0.07, PYLON_T + 0.06, fm, gap + 0.035, 0, -PYLON_T / 2, 0, 0.01)
    rb(dg, DOOR_W + 0.14, 0.07, PYLON_T + 0.06, fm, 0, DOOR_H, -PYLON_T / 2, 0, 0.01)
    // leaf swung open outwards (hinged at +gap)
    const leaf = new THREE.Group()
    leaf.position.set(gap, 0, 0.02)
    leaf.rotation.y = -Math.PI * 0.5 + 0.12
    rb(leaf, DOOR_W - 0.04, DOOR_H - 0.05, 0.05, woodLightMat(), -(DOOR_W - 0.04) / 2, 0.01, 0, 0, 0.01)
    const gl = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 1.3), glassMat(0.35))
    gl.position.set(-(DOOR_W - 0.04) / 2, 1.25, 0.03)
    leaf.add(gl)
    cy(leaf, 0.014, 0.014, 0.18, solid('#b8bec4', 0.3, 1), -DOOR_W + 0.14, 1.0, 0.07)
    dg.add(leaf)
    // name plaque
    const plaque = new THREE.Mesh(
      new THREE.PlaneGeometry(0.62, 0.31),
      signMat([{ text: 'KIJK-KUBUS', size: 74 }, { text: 'Show Cube House', size: 40, color: '#d8b24a' }], '#16222d', 512, 256),
    )
    plaque.position.set(-gap - 0.55, 1.5, 0.006)
    dg.add(plaque)
    G.add(dg)
  }

  /* ---- stair ---- */
  const theta0 = doorAng + Math.PI * 0.65
  const NSTEPS = 54
  {
    const sector = sectorGeo(0.13, 0.86, DA * 1.04, 0.055)
    const inst = new THREE.InstancedMesh(sector, woodLightMat(), NSTEPS)
    inst.castShadow = inst.receiveShadow = true
    const m4 = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const up = new THREE.Vector3(0, 1, 0)
    for (let i = 1; i <= NSTEPS; i++) {
      q.setFromAxisAngle(up, -(theta0 + i * DA))
      m4.compose(new THREE.Vector3(0, i * RISE, 0), q, new THREE.Vector3(1, 1, 1))
      inst.setMatrixAt(i - 1, m4)
    }
    G.add(inst)
    // riser-less core: slim steel column
    cy(G, 0.1, 0.1, FLOORS[3] - 0.06, solid('#2a2e33', 0.4, 0.8), 0, 0, 0, 16)
    // hand rail (helix) + balusters
    const pts: THREE.Vector3[] = []
    for (let t = 0; t <= NSTEPS * 6; t++) {
      const k = t / 6
      const a = theta0 + k * DA
      pts.push(new THREE.Vector3(Math.cos(a) * 0.83, k * RISE + 0.92, Math.sin(a) * 0.83))
    }
    const rail = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), NSTEPS * 6, 0.024, 8), solid('#1f2327', 0.35, 0.8))
    rail.castShadow = true
    G.add(rail)
    const bal = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.01, 0.01, 0.9, 6), solid('#1f2327', 0.35, 0.8), NSTEPS * 2)
    const p = new THREE.Vector3()
    const idq = new THREE.Quaternion()
    const one = new THREE.Vector3(1, 1, 1)
    for (let i = 1; i <= NSTEPS; i++) {
      for (let j = 0; j < 2; j++) {
        const a = theta0 + (i + (j ? 0.5 : 0)) * DA
        p.set(Math.cos(a) * 0.83, (i + (j ? 0.5 : 0)) * RISE + 0.47, Math.sin(a) * 0.83)
        m4.compose(p, idq, one)
        bal.setMatrixAt((i - 1) * 2 + j, m4)
      }
    }
    G.add(bal)
  }

  /* ---- floors ---- */
  const planesAll = facePlanes()
  const planes: Plane[][] = [[], [], [], []]
  const obbs: OBB[][] = [[], [], [], []]
  const furn = new THREE.Group()
  const lights: ShowCube['lights'] = []

  for (let lvl = 1; lvl <= 3; lvl++) {
    const F = FLOORS[lvl]
    const h = F - YC
    const cs = crossSection(h)
    const plate = offsetPoly(cs, WALK_INSET - 0.06)
    const shp = new THREE.Shape(plate.map(([x, z]) => new THREE.Vector2(x, -z)))
    const hole = new THREE.Path()
    hole.absarc(0, 0, SHAFT_R, 0, Math.PI * 2, true)
    shp.holes.push(hole)
    const slab = new THREE.ExtrudeGeometry(shp, { depth: 0.16, bevelEnabled: false, curveSegments: 40 })
    slab.rotateX(-Math.PI / 2)
    slab.translate(0, F - 0.18, 0)
    G.add(shade(new THREE.Mesh(slab, [plaster, plaster])))
    const top = new THREE.ExtrudeGeometry(shp, { depth: 0.02, bevelEnabled: false, curveSegments: 40 })
    top.rotateX(-Math.PI / 2)
    top.translate(0, F - 0.02, 0)
    G.add(shade(new THREE.Mesh(top, [parquet, plaster])))

    // walkable half-planes (floor level vs standing head height, whichever is tighter)
    const head = h + (lvl === 3 ? 1.6 : 1.85)
    for (const pl of planesAll) {
      const dF = planeDist(pl, h)
      const dH = lvl === 1 ? dF : planeDist(pl, head)
      planes[lvl].push({ nx: pl.nx, nz: pl.nz, c: Math.min(dF, dH) - WALK_INSET })
    }
  }

  // landing disc on top floor (viewpoint)
  {
    const ld = cy(G, 0.985, 0.985, 0.06, parquet, 0, FLOORS[3] - 0.06, 0, 40)
    ld.material = parquet
  }

  // railings around the stair opening on floors 1 and 2 (with a gap at the arrival side)
  for (const lvl of [1, 2]) {
    const F = FLOORS[lvl]
    const arr = theta0 + (F / RISE) * DA
    const gapHalf = 0.62
    const R = 1.07
    const pts: THREE.Vector3[] = []
    const steps = 48
    for (let i = 0; i <= steps; i++) {
      const a = arr + gapHalf + ((Math.PI * 2 - gapHalf * 2) * i) / steps
      pts.push(new THREE.Vector3(Math.cos(a) * R, F + 0.98, Math.sin(a) * R))
    }
    const mat = solid('#1f2327', 0.35, 0.8)
    const tr = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, 0.022, 8), mat)
    tr.castShadow = true
    G.add(tr)
    const post = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.012, 0.012, 0.96, 6), mat, 30)
    const m4 = new THREE.Matrix4()
    for (let i = 0; i < 30; i++) {
      const a = arr + gapHalf + ((Math.PI * 2 - gapHalf * 2) * i) / 29
      m4.makeTranslation(Math.cos(a) * R, F + 0.49, Math.sin(a) * R)
      post.setMatrixAt(i, m4)
    }
    G.add(post)
  }

  /* ---------------------------------------------------------------- furniture */
  const fabricGrey = fabricMat('#6f7b86')
  const fabricSand = fabricMat('#c9b79a')
  const fabricTeal = fabricMat('#2f6f73')
  const linen = fabricMat('#f1ede4', 0.98)
  const duvet = fabricMat('#a8523b')
  const wood = woodLightMat()
  const woodDk = woodDarkMat()
  const steel = solid('#b9bec4', 0.32, 0.9)
  const black = solid('#17191c', 0.5, 0.2)
  const stone = solid('#2b2d30', 0.35, 0.1)
  const white = solid('#f2f0ea', 0.5)
  const warm = emissiveMat('#ffd9a3', 2.2)

  const put = (g: THREE.Object3D, lvl: number, x: number, z: number, ry: number, hx = 0, hz = 0) => {
    g.position.set(x, FLOORS[lvl], z)
    g.rotation.y = ry
    furn.add(g)
    if (hx > 0) obbs[lvl].push({ x, z, hx, hz, rot: ry })
    return g
  }

  const sofa = (w: number) => {
    const g = new THREE.Group()
    rb(g, w, 0.32, 0.82, fabricGrey, 0, 0.12, 0, 0, 0.05)
    rb(g, w / 2 - 0.12, 0.16, 0.6, fabricGrey, -w / 4 + 0.02, 0.44, 0.07, 0, 0.06)
    rb(g, w / 2 - 0.12, 0.16, 0.6, fabricGrey, w / 4 - 0.02, 0.44, 0.07, 0, 0.06)
    rb(g, w, 0.46, 0.2, fabricGrey, 0, 0.44, -0.31, 0, 0.07)
    rb(g, 0.15, 0.3, 0.82, fabricGrey, -w / 2 + 0.075, 0.44, 0, 0, 0.06)
    rb(g, 0.15, 0.3, 0.82, fabricGrey, w / 2 - 0.075, 0.44, 0, 0, 0.06)
    rb(g, 0.4, 0.38, 0.12, fabricTeal, -w / 4, 0.62, -0.1, 0.25, 0.05)
    rb(g, 0.4, 0.38, 0.12, fabricSand, w / 4, 0.62, -0.1, -0.2, 0.05)
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) cy(g, 0.025, 0.02, 0.12, woodDk, sx * (w / 2 - 0.08), 0, sz * 0.34, 8)
    return g
  }
  const roundTable = (r: number, h: number) => {
    const g = new THREE.Group()
    cy(g, r, r, 0.04, wood, 0, h - 0.04, 0, 36)
    cy(g, 0.045, 0.05, h - 0.06, steel, 0, 0.03, 0, 12)
    cy(g, r * 0.5, r * 0.55, 0.03, steel, 0, 0, 0, 24)
    return g
  }
  const chair = () => {
    const g = new THREE.Group()
    rb(g, 0.4, 0.05, 0.4, wood, 0, 0.44, 0, 0, 0.02)
    rb(g, 0.4, 0.42, 0.035, wood, 0, 0.5, -0.185, 0, 0.015)
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) cy(g, 0.016, 0.012, 0.44, black, sx * 0.17, 0, sz * 0.17, 6)
    return g
  }
  const fridge = () => {
    const g = new THREE.Group()
    rb(g, 0.6, 1.78, 0.62, steel, 0, 0, 0, 0, 0.02)
    rb(g, 0.012, 0.55, 0.03, black, 0.22, 1.05, 0.32, 0, 0.004)
    rb(g, 0.012, 0.9, 0.03, black, 0.22, 0.05, 0.32, 0, 0.004)
    rb(g, 0.58, 0.012, 0.01, black, 0, 1.0, 0.315, 0, 0.003)
    return g
  }
  const counter = (w: number) => {
    const g = new THREE.Group()
    rb(g, w, 0.84, 0.58, wood, 0, 0.04, 0, 0, 0.012)
    rb(g, w + 0.02, 0.04, 0.62, stone, 0, 0.88, 0.0, 0, 0.008)
    rb(g, 0.4, 0.012, 0.36, steel, -w * 0.2, 0.92, 0.02, 0, 0.004)
    cy(g, 0.012, 0.012, 0.22, steel, -w * 0.2, 0.92, -0.2, 8)
    for (const sx of [0.2, 0.34]) cy(g, 0.07, 0.07, 0.012, black, w * (sx - 0.1), 0.92, 0.02, 20)
    rb(g, w - 0.04, 0.012, 0.012, steel, 0, 0.75, 0.3, 0, 0.003)
    cy(g, 0.05, 0.05, 0.02, white, w * 0.35, 0.92, 0.1, 16)
    return g
  }
  const bed = (w: number, len = 2.0) => {
    const g = new THREE.Group()
    rb(g, w + 0.1, 0.24, len, wood, 0, 0.04, 0, 0, 0.02)
    rb(g, w, 0.2, len - 0.1, linen, 0, 0.28, 0.02, 0, 0.06)
    rb(g, w + 0.02, 0.09, len * 0.62, duvet, 0, 0.44, len * 0.17, 0, 0.05)
    rb(g, w + 0.12, 0.62, 0.07, wood, 0, 0.04, -len / 2, 0, 0.02)
    const n = w > 1.2 ? 2 : 1
    for (let i = 0; i < n; i++) rb(g, w / n - 0.12, 0.13, 0.36, linen, (i - (n - 1) / 2) * (w / n), 0.46, -len / 2 + 0.3, 0, 0.06)
    return g
  }
  const lampShade = (h: number) => {
    const g = new THREE.Group()
    cy(g, 0.012, 0.012, h, black, 0, 0, 0, 6)
    cy(g, 0.1, 0.17, 0.2, warm, 0, h - 0.04, 0, 20)
    cy(g, 0.12, 0.12, 0.01, black, 0, 0, 0, 16)
    return g
  }
  const pendant = (drop: number) => {
    const g = new THREE.Group()
    cy(g, 0.004, 0.004, drop, black, 0, 0, 0, 4)
    cy(g, 0.03, 0.2, 0.2, warm, 0, -0.02, 0, 24)
    return g
  }
  const wardrobe = (w: number, h: number) => {
    const g = new THREE.Group()
    rb(g, w, h, 0.6, wood, 0, 0, 0, 0, 0.012)
    const n = Math.round(w / 0.55)
    for (let i = 1; i < n; i++) rb(g, 0.008, h - 0.1, 0.01, woodDk, -w / 2 + (w * i) / n, 0.05, 0.3, 0, 0.002)
    for (let i = 0; i < n; i++) rb(g, 0.012, 0.22, 0.02, steel, -w / 2 + (w * (i + 0.5)) / n + 0.04, h * 0.5, 0.31, 0, 0.004)
    return g
  }
  const books = (g: THREE.Object3D, w: number, y: number, z: number, seed: number) => {
    let x = -w / 2 + 0.03
    let k = seed
    while (x < w / 2 - 0.05) {
      k = (k * 9301 + 49297) % 233280
      const bw = 0.025 + (k / 233280) * 0.03
      const bh = 0.2 + (((k * 7) % 233280) / 233280) * 0.1
      const col = new THREE.Color().setHSL(((k * 3) % 360) / 360, 0.35, 0.4)
      rb(g, bw, bh, 0.2, solid('#' + col.getHexString(), 0.8), x + bw / 2, y, z, 0, 0.004)
      x += bw + 0.003
    }
  }
  const bookcase = (w: number, h: number) => {
    const g = new THREE.Group()
    rb(g, w, h, 0.32, woodDk, 0, 0, 0, 0, 0.01)
    const rows = Math.floor(h / 0.36)
    for (let r = 0; r < rows; r++) {
      rb(g, w - 0.06, 0.02, 0.3, wood, 0, 0.1 + r * 0.34, 0.02, 0, 0.004)
      books(g, w - 0.08, 0.12 + r * 0.34, 0.04, r * 31 + Math.round(w * 17))
    }
    return g
  }
  const rug = (r: number, mat: THREE.Material) => {
    const g = new THREE.Group()
    cy(g, r, r, 0.012, mat, 0, 0, 0, 48)
    cy(g, r * 0.7, r * 0.7, 0.014, fabricMat('#e5dccb'), 0, 0, 0, 48)
    return g
  }
  const plant = (h: number, seed: number) => makePlant(h, seed)

  /* ---- Hall (ground) ---- */
  {
    // mailboxes on the wall opposite the door
    const opp = doorAng + Math.PI
    const [mx, mz] = polar(opp, PYLON_APO - PYLON_T - 0.012, 0.0)
    const mg = new THREE.Group()
    mg.position.set(mx, 1.25, mz)
    mg.rotation.y = faceCenter(opp)
    rb(mg, 0.7, 0.4, 0.05, steel, 0, -0.2, 0, 0, 0.005)
    for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) rb(mg, 0.15, 0.17, 0.01, black, -0.26 + i * 0.173, -0.18 + j * 0.2 - 0.12, 0.03, 0, 0.002)
    furn.add(mg)
    // bench + plant + wall lamp
    const [bx, bz] = polar(opp + 1.05, PYLON_APO - PYLON_T - 0.3)
    const bench = new THREE.Group()
    rb(bench, 0.9, 0.05, 0.3, wood, 0, 0.42, 0, 0, 0.01)
    rb(bench, 0.05, 0.42, 0.26, black, -0.38, 0, 0, 0, 0.004)
    rb(bench, 0.05, 0.42, 0.26, black, 0.38, 0, 0, 0, 0.004)
    put(bench, 0, bx, bz, faceCenter(opp + 1.05))
    const [px, pz] = polar(opp - 1.0, PYLON_APO - PYLON_T - 0.32)
    put(plant(1.3, 5), 0, px, pz, 0)
    const [lx, lz] = polar(opp - 0.55, PYLON_APO - PYLON_T - 0.03)
    const wl = cy(furn, 0.12, 0.12, 0.03, warm, lx, 1.9, lz, 20)
    wl.rotation.x = Math.PI / 2
    wl.rotation.z = 0
    wl.rotation.y = 0
    wl.lookAt(0, 1.9, 0)
    wl.rotateX(Math.PI / 2)
    const hl = new THREE.PointLight('#ffe2b8', 7, 8, 2)
    hl.position.set(0, 2.45, 0.0)
    G.add(hl)
    lights.push({ level: 0, light: hl, base: 7 })
  }

  /* ---- Level 1: compact kitchen + living + dining in the three lobes ---- */
  {
    const F = FLOORS[1]
    const poly = offsetPoly(crossSection(F - YC), WALK_INSET)
    const verts = poly
    const lobe = (j: number, x: number, y: number): [number, number, number] => {
      const v = verts[j]
      const len = Math.hypot(v[0], v[1])
      const ux = v[0] / len
      const uz = v[1] / len
      return [v[0] - ux * x - uz * y, v[1] - uz * x + ux * y, faceCenter(Math.atan2(uz, ux))]
    }
    // kitchen
    let [x, z, r] = lobe(0, 1.0, 0)
    put(fridge(), 1, x, z, r, 0.3, 0.31)
    ;[x, z, r] = lobe(0, 1.68, 0)
    put(counter(1.1), 1, x, z, r, 0.55, 0.3)
    // living nook
    ;[x, z, r] = lobe(1, 1.55, 0)
    put(sofa(1.35), 1, x, z, r, 0.68, 0.41)
    ;[x, z, r] = lobe(1, 0.55, 0)
    put(lampShade(1.5), 1, x, z, r)
    ;[x, z, r] = lobe(1, 2.4, 0.0)
    put(rug(0.62, fabricMat('#6d8f86')), 1, x, z, r)
    // dining
    ;[x, z, r] = lobe(2, 1.5, 0)
    const dt = roundTable(0.43, 0.74)
    put(dt, 1, x, z, r, 0.43, 0.43)
    const [a, b] = lobe(2, 1.5, 0)
    const pd = pendant(0.75)
    pd.position.set(a, FLOORS[2] - 0.2 - 0.75, b)
    furn.add(pd)
    ;[x, z, r] = lobe(2, 0.78, 0)
    put(chair(), 1, x, z, r + Math.PI, 0.22, 0.22)
    ;[x, z, r] = lobe(2, 2.22, 0)
    put(chair(), 1, x, z, r, 0.22, 0.22)
    ;[x, z, r] = lobe(2, 2.15, 0.0)
    void r
    const l1 = new THREE.PointLight('#ffe0b0', 12, 9, 2)
    l1.position.set(0.0, F + 1.9, 0.0)
    G.add(l1)
    lights.push({ level: 1, light: l1, base: 12 })
  }

  /* ---- Level 2: sleeping floor + bathroom ---- */
  {
    const F = FLOORS[2]
    const h = F - YC
    // distance of flat k (face normal angle a0 + k*60°) from axis at floor level
    const flats = planesAll.map((pl) => ({ ang: Math.atan2(pl.nz, pl.nx), d: planeDist(pl, h) - WALK_INSET, upper: pl.upper }))
    flats.sort((p, q) => p.ang - q.ang)
    // upper faces lean inward: keep low items against them; tall items on lower faces
    const up = flats.filter((f) => f.upper)
    const lo = flats.filter((f) => !f.upper)
    // double bed
    {
      const f = up[0]
      const [x, z] = polar(f.ang, f.d - 1.15 - 0.55)
      put(bed(1.6), 2, x, z, faceCenter(f.ang), 0.85, 1.0)
      const [r1x, r1z] = polar(f.ang, f.d - 1.9)
      put(rug(1.2, fabricMat('#9fb0a8')), 2, r1x, r1z, 0)
      for (const t of [-1.15, 1.15]) {
        const [nx, nz] = polar(f.ang, f.d - 0.95, t)
        const ns = new THREE.Group()
        rb(ns, 0.42, 0.45, 0.36, wood, 0, 0, 0, 0, 0.015)
        const lp = lampShade(0.28)
        lp.position.set(0, 0.45, 0)
        ns.add(lp)
        put(ns, 2, nx, nz, faceCenter(f.ang), 0.22, 0.2)
      }
    }
    // single bed
    {
      const f = up[1]
      const [x, z] = polar(f.ang, f.d - 1.15 - 0.55)
      put(bed(0.9), 2, x, z, faceCenter(f.ang), 0.5, 1.0)
      const [nx, nz] = polar(f.ang, f.d - 0.95, 0.85)
      const ns = new THREE.Group()
      rb(ns, 0.42, 0.45, 0.36, wood, 0, 0, 0, 0, 0.015)
      put(ns, 2, nx, nz, faceCenter(f.ang), 0.22, 0.2)
    }
    // reading chair + plant on 3rd upper flat
    {
      const f = up[2]
      const [x, z] = polar(f.ang, f.d - 1.2)
      const ch = new THREE.Group()
      rb(ch, 0.8, 0.28, 0.8, fabricTeal, 0, 0.14, 0, 0, 0.08)
      rb(ch, 0.8, 0.4, 0.18, fabricTeal, 0, 0.3, -0.31, 0, 0.07)
      rb(ch, 0.14, 0.22, 0.7, fabricTeal, -0.33, 0.3, 0.02, 0, 0.05)
      rb(ch, 0.14, 0.22, 0.7, fabricTeal, 0.33, 0.3, 0.02, 0, 0.05)
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) cy(ch, 0.02, 0.016, 0.14, woodDk, sx * 0.33, 0, sz * 0.33, 8)
      put(ch, 2, x, z, faceCenter(f.ang) + 0.25, 0.42, 0.42)
      const [px, pz] = polar(f.ang, f.d - 0.7, 1.35)
      put(plant(1.0, 11), 2, px, pz, 0)
    }
    // wardrobe on lower flat 0
    {
      const f = lo[0]
      const [x, z] = polar(f.ang, f.d - 0.34)
      put(wardrobe(2.0, 2.0), 2, x, z, faceCenter(f.ang), 1.02, 0.31)
    }
    // dresser + bookcase on lower flat 1
    {
      const f = lo[1]
      const [x, z] = polar(f.ang, f.d - 0.28, 0.9)
      const dr = new THREE.Group()
      rb(dr, 1.1, 0.8, 0.46, wood, 0, 0.1, 0, 0, 0.012)
      for (let i = 0; i < 3; i++) rb(dr, 1.0, 0.002, 0.01, woodDk, 0, 0.3 + i * 0.22, 0.235, 0, 0.001)
      for (let i = 0; i < 3; i++) rb(dr, 0.16, 0.014, 0.02, steel, 0, 0.4 + i * 0.22 - 0.11, 0.245, 0, 0.004)
      for (const sx of [-1, 1]) cy(dr, 0.02, 0.016, 0.1, black, sx * 0.5, 0, 0, 6)
      put(dr, 2, x, z, faceCenter(f.ang), 0.56, 0.24)
      const [bx, bz] = polar(f.ang, f.d - 0.22, -0.95)
      put(bookcase(0.9, 1.9), 2, bx, bz, faceCenter(f.ang), 0.46, 0.17)
    }
    // bathroom on lower flat 2
    {
      const f = lo[2]
      const [tx, tz] = polar(f.ang, f.d - 1.0)
      const tiles = new THREE.Mesh(new THREE.PlaneGeometry(2.9, 2.0), tileMat('#e3e0d8', '#aaa69c', 8))
      tiles.rotation.x = -Math.PI / 2
      tiles.rotation.z = -faceCenter(f.ang)
      tiles.position.set(tx, F + 0.004, tz)
      tiles.receiveShadow = true
      G.add(tiles)
      const [sx, sz] = polar(f.ang, f.d - 0.3, -0.7)
      const sink = new THREE.Group()
      rb(sink, 0.9, 0.78, 0.46, white, 0, 0.1, 0, 0, 0.015)
      rb(sink, 0.9, 0.04, 0.5, stone, 0, 0.88, 0.0, 0, 0.01)
      cy(sink, 0.17, 0.12, 0.08, white, 0, 0.9, 0.0, 24)
      cy(sink, 0.012, 0.012, 0.2, steel, 0, 0.92, -0.16, 8)
      const mir = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.9), new THREE.MeshStandardMaterial({ color: '#dfe7ec', roughness: 0.03, metalness: 1, envMapIntensity: 1.6 }))
      mir.position.set(0, 1.55, -0.2)
      sink.add(mir)
      put(sink, 2, sx, sz, faceCenter(f.ang), 0.46, 0.24)
      const [qx, qz] = polar(f.ang, f.d - 0.38, 0.35)
      const wc = new THREE.Group()
      rb(wc, 0.38, 0.4, 0.55, white, 0, 0, 0.0, 0, 0.12)
      rb(wc, 0.38, 0.45, 0.16, white, 0, 0.4, -0.2, 0, 0.04)
      rb(wc, 0.4, 0.04, 0.5, white, 0, 0.4, 0.02, 0, 0.02)
      put(wc, 2, qx, qz, faceCenter(f.ang), 0.2, 0.3)
      // glass shower
      const [gx, gz] = polar(f.ang, f.d - 0.6, 1.2)
      const sh = new THREE.Group()
      rb(sh, 0.95, 0.04, 0.95, tileMat('#cfd3d4', '#999', 8), 0, 0, 0, 0, 0.01)
      const gp = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 1.95), glassMat(0.3))
      gp.position.set(0, 1.0, 0.47)
      sh.add(gp)
      const gp2 = gp.clone()
      gp2.rotation.y = Math.PI / 2
      gp2.position.set(-0.47, 1.0, 0)
      sh.add(gp2)
      cy(sh, 0.012, 0.012, 1.0, steel, 0.0, 1.0, -0.45, 8)
      cy(sh, 0.08, 0.08, 0.015, steel, 0.0, 1.98, -0.4, 16)
      put(sh, 2, gx, gz, faceCenter(f.ang), 0.48, 0.48)
    }
    const l2 = new THREE.PointLight('#ffe0b0', 18, 11, 2)
    l2.position.set(0, F + 1.9, 0)
    G.add(l2)
    lights.push({ level: 2, light: l2, base: 18 })
  }

  /* ---- Level 3: loft viewpoint ---- */
  {
    const F = FLOORS[3]
    const poly = offsetPoly(crossSection(F - YC), WALK_INSET)
    for (let j = 0; j < 3; j++) {
      const v = poly[j]
      const len = Math.hypot(v[0], v[1])
      const ang = Math.atan2(v[1], v[0])
      const [x, z] = polar(ang, len - 1.55)
      put(plant(0.95, 21 + j), 3, x, z, 0)
    }
    // floor cushions between lobes
    for (let j = 0; j < 3; j++) {
      const v = poly[j]
      const w = poly[(j + 1) % 3]
      const mx = (v[0] + w[0]) / 2
      const mz = (v[1] + w[1]) / 2
      const ang = Math.atan2(mz, mx)
      const [x, z] = polar(ang, Math.hypot(mx, mz) - 0.62)
      const c = new THREE.Group()
      rb(c, 0.9, 0.2, 0.9, j === 0 ? fabricTeal : j === 1 ? duvet : fabricSand, 0, 0, 0, 0, 0.09)
      put(c, 3, x, z, ang + 0.4, 0.45, 0.45)
    }
    const l3 = new THREE.PointLight('#ffe6c0', 6, 8, 2)
    l3.position.set(0, F + 1.2, 0)
    G.add(l3)
    lights.push({ level: 3, light: l3, base: 6 })
  }

  mergeByMaterial(furn)
  G.add(furn)

  // collision obbs for circle-shaped things: stair ring + railings (handled by the engine as a circle)

  const anchors: Record<string, THREE.Vector3> = {
    door: new THREE.Vector3(...polar(doorAng, PYLON_APO + 0.6), 0).setY(1.6),
  }
  // convert local → vector (x, y, z)
  const dpt = polar(doorAng, PYLON_APO + 0.6)
  anchors.door.set(dpt[0], 1.6, dpt[1])

  return {
    group: G,
    a0,
    doorAng,
    floors: FLOORS,
    planes,
    obbs,
    lights,
    stair: { theta0, da: DA, rise: RISE },
    anchors,
    roomNames: ['Entrance hall', 'Level 1 · Kitchen & living', 'Level 2 · Bedrooms & bath', 'Level 3 · Loft'],
  }
}

export { S as CUBE_EDGE }

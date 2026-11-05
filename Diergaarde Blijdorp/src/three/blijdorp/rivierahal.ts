import * as THREE from 'three'
import { BuildCtx, TAU, arcWall, boxGeo, cyl, mergeMesh, mesh, rng, shapeXZ, slab, v2, wall, wuv } from './util'
import { bench, figure, leafClump, palm, picnicTable, quadruped, rotBox } from './props'

/* ------------------------------------------------------------------------------------------
   Rivièrahal — Sybold van Ravesteyn, 1939–40.  Origin = centre of the central hall.
   +z = north (pond / terrace side), -z = south (statue / "jungle shop" side). 1 unit = 1 metre.
------------------------------------------------------------------------------------------ */
export const HW = 13.4 // half width of the vault
export const HL = 21 // half length of the hall
export const FH = 0.25 // interior floor level
const SPRING = 5.2
const RISE = 8.0
const COLS = [-8.2, -2.7, 2.7, 8.2]
const DOOR_X = 10.4
const PAV = { x: 27, z: -18, r: 8.5 }

export const archY = (x: number) => {
  const u = Math.min(1, Math.abs(x) / HW)
  return SPRING + RISE * Math.pow(Math.max(0, 1 - Math.pow(u, 2.3)), 0.55)
}
const fasciaThick = (x: number) => 1.9 - 0.9 * Math.min(1, (x / HW) ** 2)
const festoon = (x: number) => {
  let d = 1e9
  for (const c of COLS) d = Math.min(d, Math.abs(x - c))
  return 0.6 * Math.exp(-((d / 1.5) ** 2))
}
const fasciaIn = (x: number) => archY(x) - fasciaThick(x) - festoon(x)
const glassTop = (x: number) => archY(x) - fasciaThick(x) + 0.05
const CANOPY_Y = 4.3

function arcCyl(r: number, h: number, a0: number, a1: number, seg = 48, open = true, rt = r) {
  return wuv(new THREE.CylinderGeometry(rt, r, h, seg, 1, open, Math.PI / 2 - a1, a1 - a0))
}

/** open surface swept along z (normals up/out unless flipped) */
function sweep(pts: THREE.Vector2[], z0: number, z1: number, flip: boolean) {
  const pos: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  let len = 0
  for (let i = 0; i < pts.length; i++) {
    if (i) len += pts[i].distanceTo(pts[i - 1])
    pos.push(pts[i].x, pts[i].y, z0, pts[i].x, pts[i].y, z1)
    uv.push(len, z0, len, z1)
    if (i < pts.length - 1) {
      const a = i * 2, b = a + 2, c = a + 1, d = a + 3
      if (flip) idx.push(a, b, c, b, d, c)
      else idx.push(a, c, b, b, c, d)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

const glassMesh = (parent: THREE.Object3D, g: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) => {
  const m = mesh(parent, g, mat, x, y, z, { cast: false, recv: false })
  m.renderOrder = 2
  return m
}

/* -------------------------------------------------------------------------------- facade */
function archFacade(ctx: BuildCtx, parent: THREE.Object3D) {
  const m = ctx.m
  const N = 90
  // fascia: ochre band with festooned underside
  const sh = new THREE.Shape()
  for (let i = 0; i <= N; i++) {
    const x = -HW + (2 * HW * i) / N
    i ? sh.lineTo(x, archY(x)) : sh.moveTo(x, archY(x))
  }
  for (let i = N; i >= 0; i--) {
    const x = -HW + (2 * HW * i) / N
    sh.lineTo(x, Math.max(CANOPY_Y - 0.2, fasciaIn(x)))
  }
  const fg = new THREE.ExtrudeGeometry(sh, { depth: 1.8, bevelEnabled: false, curveSegments: 1 })
  fg.translate(0, 0, HL)
  mesh(parent, fg, m.stuccoSand)
  // rounded lip on the top edge
  const lip = new THREE.CatmullRomCurve3(
    Array.from({ length: 61 }, (_, i) => {
      const x = -HW + (2 * HW * i) / 60
      return new THREE.Vector3(x, archY(x) + 0.02, HL + 1.8)
    }),
  )
  mesh(parent, new THREE.TubeGeometry(lip, 120, 0.2, 8), m.stuccoColumn)
  // columns
  for (const cx of COLS) {
    const top = fasciaIn(cx)
    const h = top - CANOPY_Y
    cyl(parent, m.stuccoColumn, 0.42, 0.46, h + 0.3, cx, CANOPY_Y, HL + 1.0, 24)
    cyl(parent, m.stuccoColumn, 0.58, 0.58, 0.28, cx, top - 0.5, HL + 1.0, 24)
    cyl(parent, m.stuccoColumn, 0.52, 0.52, 0.2, cx, top - 0.82, HL + 1.0, 24)
    cyl(parent, m.stuccoColumn, 0.6, 0.6, 0.3, cx, CANOPY_Y, HL + 1.0, 24)
    ctx.colliders.push({ x0: cx - 0.5, x1: cx + 0.5, z0: HL + 0.5, z1: HL + 1.5 })
  }
  // glass curtain wall
  const gs = new THREE.Shape()
  const gx = HW - 0.5
  gs.moveTo(-gx, CANOPY_Y)
  gs.lineTo(gx, CANOPY_Y)
  for (let i = 0; i <= 60; i++) {
    const x = gx - (2 * gx * i) / 60
    gs.lineTo(x, glassTop(x))
  }
  glassMesh(parent, new THREE.ShapeGeometry(gs, 1), m.glass, 0, 0, HL + 0.08)
  // dark void behind the glass so it reads as an interior from outside (keeps the hall glowing at night)
  // mullions + transoms
  const geos: THREE.BufferGeometry[] = []
  const stepX = 1.3
  for (let x = -gx; x <= gx + 0.01; x += stepX) {
    const top = glassTop(x)
    geos.push(boxGeo(0.07, top - CANOPY_Y, 0.16, x, CANOPY_Y, HL + 0.1))
  }
  geos.push(boxGeo(2 * gx, 0.12, 0.2, 0, CANOPY_Y, HL + 0.1))
  for (let y = CANOPY_Y + 1.55; y < 12.4; y += 1.55) {
    let lo = 0, hi = gx
    for (let k = 0; k < 24; k++) {
      const mid = (lo + hi) / 2
      glassTop(mid) > y ? (lo = mid) : (hi = mid)
    }
    const xm = glassTop(0) > y ? Math.min(gx, lo) : 0
    if (xm > 0.3) geos.push(boxGeo(2 * xm, 0.06, 0.12, 0, y, HL + 0.1))
  }
  mergeMesh(parent, m.mullion, geos)
}

/* ------------------------------------------------------------------ lower front + canopy */
function lowerFront(ctx: BuildCtx, parent: THREE.Group, kind: 'terrace' | 'shop') {
  const m = ctx.m
  const today = kind === 'terrace' ? ctx.today : null
  const keep = (o: THREE.Object3D) => {
    today?.push(o)
    return o
  }
  // wall with two door openings
  const segs: [number, number][] = [[-HW, -DOOR_X - 1.4], [-DOOR_X + 1.4, DOOR_X - 1.4], [DOOR_X + 1.4, HW]]
  for (const [a, b] of segs) {
    slab(parent, m.stucco, (a + b) / 2, HL - 0.25, b - a, 0.5, 0, CANOPY_Y)
    slab(parent, m.stuccoIn, (a + b) / 2, HL - 0.52, b - a, 0.05, 0, CANOPY_Y - 0.1, 0, { cast: false })
  }
  for (const s of [-1, 1]) {
    const cx = s * DOOR_X
    slab(parent, m.stucco, cx, HL - 0.25, 2.8, 0.5, 3.3, CANOPY_Y - 3.3)
    // door frames + open glazed leaves
    for (const jx of [-1.4, 1.4]) slab(parent, m.frameDark, cx + jx, HL + 0.02, 0.1, 0.18, 0, 3.3)
    slab(parent, m.frameDark, cx, HL + 0.02, 2.8, 0.18, 3.2, 0.12)
    glassMesh(parent, new THREE.PlaneGeometry(1.2, 3.0), m.glass, cx - 1.9, 1.5, HL + 0.9).rotation.y = 0.9
    glassMesh(parent, new THREE.PlaneGeometry(1.2, 3.0), m.glass, cx + 1.9, 1.5, HL + 0.9).rotation.y = -0.9
    slab(parent, m.concrete, cx, HL + 0.5, 3.4, 1.0, 0, 0.12) // threshold step
  }
  // dark plinth
  for (const [a, b] of segs) slab(parent, m.concrete, (a + b) / 2, HL + 0.05, b - a + 0.2, 0.2, 0, 0.6)
  wall(ctx, -HW, HL - 0.5, -DOOR_X - 1.4, HL)
  wall(ctx, -DOOR_X + 1.4, HL - 0.5, DOOR_X - 1.4, HL)
  wall(ctx, DOOR_X + 1.4, HL - 0.5, HW, HL)

  // canopy: strip + semicircular bay
  const T = 0.32
  const canopyY = CANOPY_Y - 0.28
  const strip = slab(parent, m.stuccoSand, 0, HL + 1.2, 2 * HW + 2.2, 2.4, canopyY, T)
  const R = 7.4
  const disc = mesh(parent, arcCyl(R, T, 0, Math.PI, 64, false), m.stuccoSand, 0, canopyY + T / 2, HL)
  const band = mesh(parent, arcCyl(R + 0.02, 0.8, 0, Math.PI, 64, true), kind === 'shop' ? m.shopBand : m.stuccoSand, 0, canopyY + T / 2, HL)
  const bandIn = mesh(parent, arcCyl(R - 0.02, 0.8, 0, Math.PI, 64, true), m.stuccoSand, 0, canopyY + T / 2, HL)
  bandIn.material = m.stuccoSand
  // bay: low brown counter + glazing + posts
  const bayR = R - 1.15
  const counter = mesh(parent, arcCyl(bayR, 1.1, 0, Math.PI, 48, true), m.stuccoColumn, 0, 0.55, HL)
  mesh(parent, arcCyl(bayR - 0.05, 1.1, 0, Math.PI, 48, true), m.stuccoColumn, 0, 0.55, HL)
  glassMesh(parent, arcCyl(bayR, 2.3, 0, Math.PI, 48, true), m.glass, 0, 1.1 + 1.15, HL)
  const back = mesh(parent, arcCyl(bayR - 0.4, 2.7, 0, Math.PI, 48, true), m.windowGlow, 0, 1.1 + 1.3, HL, { cast: false })
  const posts: THREE.BufferGeometry[] = []
  for (let i = 0; i <= 12; i++) {
    const a = (i / 12) * Math.PI
    const g = new THREE.CylinderGeometry(0.1, 0.1, 3.6, 8)
    g.translate(Math.cos(a) * bayR, 1.8 + 0.1, HL + Math.sin(a) * bayR)
    posts.push(wuv(g))
  }
  const postMesh = mergeMesh(parent, m.brownColumn, posts)
  // flat top of counter
  mesh(parent, new THREE.RingGeometry(bayR - 0.1, bayR + 0.12, 48, 1, 0, Math.PI).rotateX(-Math.PI / 2), m.concrete, 0, 1.12, HL, { cast: false })
  // segmented umbrella roof
  const roof = mesh(parent, new THREE.ConeGeometry(R - 0.4, 1.1, 24, 1, true, Math.PI / 2 - Math.PI, Math.PI), m.whiteMetal, 0, canopyY + T + 0.55, HL)
  const rim = mesh(parent, arcCyl(R - 0.38, 0.18, 0, Math.PI, 48, true), m.whiteMetal, 0, canopyY + T + 0.05, HL)
  ;[strip, disc, band, bandIn, counter, postMesh, roof, rim, back].forEach((o) => o && keep(o))
  if (kind === 'terrace') {
    arcWall(ctx, 0, HL, bayR + 0.35, 0, Math.PI, 'today')
  } else {
    arcWall(ctx, 0, HL, bayR + 0.35, 0, Math.PI)
  }
  return { R, canopyY }
}

/* ---------------------------------------------------------------------------- vault + hall */
function hall(ctx: BuildCtx, R: THREE.Group) {
  const m = ctx.m
  const N = 80
  const outer = Array.from({ length: N + 1 }, (_, i) => {
    const x = -HW + (2 * HW * i) / N
    return v2(x, archY(x))
  })
  mesh(R, sweep(outer, -HL, HL + 0.01, false), m.roofDark)
  const inner = outer.map((p) => v2(p.x, p.y - 0.7))
  mesh(R, sweep(inner, -HL, HL, true), m.stuccoIn, 0, 0, 0, { cast: false })
  // roof rim
  mesh(R, sweep(outer.map((p) => v2(p.x, p.y + 0.001)), -HL, HL + 0.01, false), m.roofDark)
  // ribs under the vault
  const rs = new THREE.Shape()
  inner.forEach((p, i) => (i ? rs.lineTo(p.x, p.y) : rs.moveTo(p.x, p.y)))
  for (let i = N; i >= 0; i--) rs.lineTo(inner[i].x, inner[i].y - 0.55)
  const rg = new THREE.ExtrudeGeometry(rs, { depth: 0.4, bevelEnabled: false, curveSegments: 1 })
  for (let z = -17; z <= 17.1; z += 4.25) mesh(R, rg, m.stuccoInSand, 0, 0, z - 0.2, { cast: false })

  // side walls (cross-section follows the vault) — with a 4.4 m doorway at z=0
  const prof = (xin: number, xout: number, y0: number) => {
    const s = new THREE.Shape()
    s.moveTo(xin, y0)
    s.lineTo(xout, y0)
    const n = 12
    for (let i = 0; i <= n; i++) {
      const x = xout + ((xin - xout) * i) / n
      s.lineTo(x, archY(Math.max(x, xin)) + 0.02)
    }
    s.closePath()
    return s
  }
  for (const side of [1, -1]) {
    const mk = (s: THREE.Shape, z0: number, z1: number, mat: THREE.Material) => {
      const g = new THREE.ExtrudeGeometry(s, { depth: z1 - z0, bevelEnabled: false, curveSegments: 1 })
      g.translate(0, 0, z0)
      const me = mesh(R, g, mat)
      me.scale.x = side
      return me
    }
    mk(prof(12.6, HW, 0), -HL, -2.2, m.stucco)
    mk(prof(12.6, HW, 0), 2.2, HL, m.stucco)
    mk(prof(12.6, HW, 3.4), -2.2, 2.2, m.stucco)
    wall(ctx, side * 12.6, -HL, side * HW, -2.2)
    wall(ctx, side * 12.6, 2.2, side * HW, HL)
    // interior skin (cream) — thin boxes in front of the exterior-grimed wall
    for (const [z0, z1] of [[-HL + 0.5, -2.2], [2.2, HL - 0.5]]) {
      const sk = slab(R, m.stuccoIn, side * 12.57, (z0 + z1) / 2, 0.04, z1 - z0, FH, 6.9, 0, { cast: false })
      sk.visible = true
    }
    // scalloped pilasters
    const zs = [5.6, 9.8, 14.0, 18.2]
    const pil: THREE.BufferGeometry[] = []
    for (const z of zs) for (const zz of [z, -z]) {
      const g = new THREE.CylinderGeometry(0.5, 0.58, 6.5, 14)
      g.translate(side * 12.6, FH + 3.25, zz)
      pil.push(wuv(g))
    }
    mergeMesh(R, m.stuccoInSand, pil)
    // harp-shaped light slits between pilasters
    const slits: THREE.BufferGeometry[] = []
    for (const zc of [3.9, 7.7, 11.9, 16.1, -3.9, -7.7, -11.9, -16.1]) {
      for (let i = 0; i < 6; i++) {
        const hgt = 0.9 + i * 0.42
        slits.push(boxGeo(0.03, hgt, 0.13, side * 12.55, 6.55 - hgt + 0.0, zc - 0.9 + i * 0.36))
      }
    }
    mergeMesh(R, m.slit, slits, { cast: false })
    // benches
    bench(ctx, side * 11.5, -12, -side * Math.PI / 2, FH)
    bench(ctx, side * 11.5, 12, -side * Math.PI / 2, FH)
    // palms in large pots
    for (const z of [-16, -8, 8, 16]) {
      const x = side * 11.8
      cyl(R, m.concrete, 0.7, 0.55, 0.85, x, FH, z, 20)
      const p = palm(m, 4.2 + ((z * 7) % 1.3 + 1.3) % 1.3, Math.round(z * 10 + side))
      p.position.set(x, FH + 0.8, z)
      R.add(p)
      ctx.colliders.push({ x0: x - 0.7, x1: x + 0.7, z0: z - 0.7, z1: z + 0.7 })
    }
  }

  // front/back inner skins
  for (const s of [-1, 1]) {
    for (const [a, b] of [[-12.6, -DOOR_X - 1.4], [-DOOR_X + 1.4, DOOR_X - 1.4], [DOOR_X + 1.4, 12.6]]) slab(R, m.stuccoIn, (a + b) / 2, s * (HL - 0.53), b - a, 0.04, FH, CANOPY_Y - FH, 0, { cast: false })
  }

  // floor
  slab(R, m.floorSlab, 0, 0, 2 * 12.8, 2 * HL, 0, FH)
  const ring = mesh(R, wuv(new THREE.CylinderGeometry(6.3, 6.3, 0.01, 64)), m.floorSlabDark, 0, FH + 0.004, 0, { cast: false })
  ring.receiveShadow = true
  for (const s of [-1, 1]) slab(R, m.floorSlabDark, s * 9.5, 0, 0.35, 2 * HL - 1, FH, 0.01, 0, { cast: false })

  // fountain with creation mosaic
  mesh(R, arcCyl(3.35, 0.62, 0, TAU, 64, true), m.concrete, 0, FH + 0.31, 0)
  mesh(R, new THREE.RingGeometry(3.0, 3.55, 64).rotateX(-Math.PI / 2), m.tilesIn, 0, FH + 0.63, 0, { cast: false })
  mesh(R, new THREE.CircleGeometry(3.0, 64).rotateX(-Math.PI / 2), m.mosaic, 0, FH + 0.12, 0, { cast: false })
  const fw = mesh(R, new THREE.CircleGeometry(3.0, 64).rotateX(-Math.PI / 2), m.lilyWater, 0, FH + 0.46, 0, { cast: false })
  fw.renderOrder = 1
  cyl(R, m.stone, 0.3, 0.45, 1.5, 0, FH + 0.1, 0, 20)
  mesh(R, new THREE.SphereGeometry(0.55, 24, 16), m.stone, 0, FH + 1.85, 0)
  cyl(R, m.stone, 0.9, 0.5, 0.2, 0, FH + 1.35, 0, 24)
  arcWall(ctx, 0, 0, 3.7, 0, TAU)
  ctx.zones.push({ id: 'fountain', name: 'Fountain with creation mosaic', x0: -5, z0: -5, x1: 5, z1: 5 })

  // orchestra podium on the north wall
  slab(R, m.floorSlabDark, 0, HL - 3.2, 15, 5.4, FH, 0.8)
  slab(R, m.stone, 0, HL - 0.55, 15.4, 0.2, FH + 0.8, 0.12)
  for (let i = 0; i < 2; i++) slab(R, m.floorSlabDark, 0, HL - 6.4 + i * 0.35, 6 - i * 1.2, 0.5, FH, 0.4 - i * 0.2)
  ctx.floors.push({ x0: -7.5, x1: 7.5, z0: HL - 5.9, z1: HL - 0.5, h: FH + 0.8 })
  ctx.floors.push({ x0: -3, x1: 3, z0: HL - 6.5, z1: HL - 5.9, h: FH + 0.4 })
  // balconies either side of the podium
  for (const s of [-1, 1]) {
    slab(R, m.concrete, s * 8.2, HL - 1.3, 2.2, 2.4, 2.9, 0.22)
    const rail: THREE.BufferGeometry[] = []
    for (let i = 0; i <= 8; i++) rail.push(boxGeo(0.04, 0.95, 0.04, s * 8.2 - 1.1 + i * 0.275, 3.12, HL - 2.45))
    rail.push(boxGeo(2.2, 0.06, 0.08, s * 8.2, 4.02, HL - 2.45))
    mergeMesh(R, m.steelDark, rail)
  }

  // pendant globes
  const cable: THREE.BufferGeometry[] = []
  const pend = (x: number, z: number, y: number) => {
    const top = archY(x) - 0.7 + 0.1
    cable.push(new THREE.CylinderGeometry(0.012, 0.012, top - y, 4).translate(x, (top + y) / 2, z))
    mesh(R, new THREE.SphereGeometry(0.42, 20, 14), m.bulb, x, y, z, { cast: false })
  }
  for (let z = -15; z <= 15.1; z += 7.5) { pend(0, z, 8.6); pend(-7.2, z + 3.7, 7.4); pend(7.2, z + 3.7, 7.4) }
  mergeMesh(R, m.steelDark, cable, { cast: false })
  for (const z of [-11, 0, 11]) {
    const l = new THREE.PointLight('#ffe2b8', 0, 34, 1.6)
    l.position.set(0, 8.3, z)
    R.add(l)
    ctx.lights.push({ light: l, day: 120, night: 520 })
  }
  ctx.floors.push({ x0: -12.6, x1: 12.6, z0: -HL, z1: HL - 0.5, h: FH })
  ctx.zones.push({ id: 'hall', name: 'Central Hall', x0: -12.8, z0: -HL, x1: 12.8, z1: HL })
}

/* --------------------------------------------------------------------- wings + pavilions */
function wing(ctx: BuildCtx, side: 1 | -1) {
  const m = ctx.m
  const W = new THREE.Group()
  W.scale.x = side
  ctx.root.add(W)
  const X0 = HW, X1 = 22.2
  const zTop = 14.4, zS = -21
  const A0 = -2.78, A1 = 2.17, SPAN = A1 - A0
  const sx = (x: number) => side * x
  const rr = side > 0 ? (a0: number, a1: number) => [a0, a1] : (a0: number, a1: number) => [Math.PI - a1, Math.PI - a0]

  slab(W, m.floorSlab, (X0 + X1) / 2, (zTop + zS) / 2, X1 - X0 + 0.4, zTop - zS, 0, FH)
  // outer wall (x=22) — lower part, ribbon glazing above
  const zo = -11
  slab(W, m.stucco, X1, (zTop + zo) / 2, 0.4, zTop - zo, 0, 4.8)
  slab(W, m.stuccoIn, X1 - 0.22, (zTop + zo) / 2, 0.04, zTop - zo, FH, 4.55, 0, { cast: false })
  glassMesh(W, wuv(new THREE.BoxGeometry(0.06, 1.3, zTop - zo)), m.glass, X1, 4.8 + 0.65, (zTop + zo) / 2)
  const mul: THREE.BufferGeometry[] = []
  for (let z = zo; z <= zTop + 0.01; z += 1.5) mul.push(boxGeo(0.14, 1.3, 0.08, X1, 4.8, z))
  mul.push(boxGeo(0.14, 0.08, zTop - zo, X1, 4.8, (zTop + zo) / 2), boxGeo(0.14, 0.08, zTop - zo, X1, 6.05, (zTop + zo) / 2))
  mergeMesh(W, m.mullion, mul)
  wall(ctx, sx(X1 - 0.3), zo, sx(X1 + 0.2), zTop + 0.2)
  // north end + south end
  slab(W, m.stucco, (X0 + X1) / 2 + 0.1, zTop + 0.1, X1 - X0 + 0.4, 0.4, 0, 6.1)
  slab(W, m.stuccoIn, (X0 + X1) / 2 + 0.1, zTop - 0.12, X1 - X0 - 0.2, 0.04, FH, 5.8, 0, { cast: false })
  wall(ctx, sx(X0), zTop - 0.1, sx(X1 + 0.2), zTop + 0.3)
  const zsEnd = PAV.x - Math.sqrt(PAV.r ** 2 - (PAV.z - zS) ** 2)
  slab(W, m.stucco, (X0 + zsEnd) / 2, zS + 0.25, zsEnd - X0, 0.5, 0, 6.1)
  slab(W, m.stuccoIn, (X0 + zsEnd) / 2, zS + 0.55, zsEnd - X0, 0.04, FH, 5.8, 0, { cast: false })
  wall(ctx, sx(X0), zS, sx(zsEnd), zS + 0.5)
  // roof with tile fascia
  const rp: [number, number][] = [[X0, zTop + 0.4], [X1 + 0.5, zTop + 0.4], [X1 + 0.5, zo]]
  for (let i = 0; i <= 10; i++) {
    const z = zo - (i * (zo - zS)) / 10
    rp.push([PAV.x - Math.sqrt(Math.max(0, PAV.r ** 2 - (z - PAV.z) ** 2)) + 0.05, z])
  }
  rp.push([X0, zS])
  const rg = new THREE.ExtrudeGeometry(shapeXZ(rp), { depth: 0.4, bevelEnabled: false, curveSegments: 1 })
  rg.rotateX(-Math.PI / 2)
  mesh(W, rg, m.roofDark, 0, 6.1, 0)
  const tl: THREE.BufferGeometry[] = []
  tl.push(boxGeo(0.42, 0.75, zTop + 0.4 - zo, X1 + 0.5, 5.95, (zTop + 0.4 + zo) / 2))
  tl.push(boxGeo(X1 + 0.5 - X0, 0.75, 0.42, (X0 + X1 + 0.5) / 2, 5.95, zTop + 0.4))
  mergeMesh(W, m.tiles, tl)
  // terraria windows along the outer wall
  for (let z = -7.5; z <= 11; z += 4.6) {
    slab(W, m.frameDark, X1 - 0.25, z, 0.14, 3.7, 0.85, 2.5)
    mesh(W, wuv(new THREE.PlaneGeometry(3.4, 2.2)), m.jungle, X1 - 0.17, 2.1, z, { cast: false }).rotation.y = -Math.PI / 2
    glassMesh(W, new THREE.PlaneGeometry(3.4, 2.2), m.glassIn, X1 - 0.3, 2.1, z).rotation.y = -Math.PI / 2
    slab(W, m.concrete, X1 - 0.7, z, 0.9, 3.9, FH, 0.75)
  }
  // skylight strips
  for (const [zc, len] of [[-3, 8], [7, 8]] as [number, number][]) {
    mesh(W, new THREE.PlaneGeometry(2.0, len).rotateX(Math.PI / 2), m.slit, (X0 + X1) / 2, 6.08, zc, { cast: false })
  }
  const l = new THREE.PointLight('#ffe6c0', 0, 20, 1.6)
  l.position.set(sx((X0 + X1) / 2), 4.8, 4)
  ctx.root.add(l)
  ctx.lights.push({ light: l, day: 25, night: 160 })
  const l2 = l.clone()
  l2.position.z = -12
  ctx.root.add(l2)
  ctx.lights.push({ light: l2, day: 25, night: 160 })
  // hall <-> wing doorway frame
  slab(W, m.stuccoInSand, X0 - 0.05, 0, 0.5, 0.35, FH, 3.4, 0, { cast: false })
  ctx.floors.push({ x0: Math.min(sx(X0), sx(X1)), x1: Math.max(sx(X0), sx(X1)), z0: zS, z1: zTop, h: FH })
  ctx.zones.push({ id: `wing${side}`, name: side > 0 ? 'East wing — terraria corridor' : 'West wing — terraria corridor', x0: Math.min(sx(X0), sx(X1)), x1: Math.max(sx(X0), sx(X1)), z0: zS, z1: zTop })

  /* ---------------------------------------------------------------------- round pavilion */
  const { x: px, z: pz, r: Rp } = PAV
  const star = side < 0
  const [a0, a1] = rr(A0, A1)
  const open = (r: number, h: number, y: number, mat: THREE.Material, seg = 48) => mesh(W, arcCyl(r, h, A0, A1, seg, true), mat, px, y + h / 2, pz)
  mesh(W, wuv(new THREE.CylinderGeometry(Rp, Rp, FH - 0.001, 56)), m.floorSlab, px, (FH - 0.001) / 2, pz)
  // low brown plinth + glazing between columns
  open(Rp, 0.7, 0, m.concrete)
  glassMesh(W, arcCyl(Rp - 0.05, 3.6, A0, A1, 48, true), m.glass, px, 0.7 + 1.8, pz)
  const cols: THREE.BufferGeometry[] = []
  const mulP: THREE.BufferGeometry[] = []
  const nC = 18
  for (let i = 0; i <= nC; i++) {
    const a = A0 + (SPAN * i) / nC
    const g = new THREE.BoxGeometry(0.5, 4.4, 0.5)
    g.rotateY(-a + Math.PI / 2)
    g.translate(px + Math.cos(a) * Rp, 2.2, pz + Math.sin(a) * Rp)
    cols.push(wuv(g))
    if (i < nC) for (let k = 1; k < 3; k++) {
      const aa = a + (SPAN / nC) * (k / 3)
      const g2 = new THREE.BoxGeometry(0.05, 3.6, 0.1)
      g2.rotateY(-aa + Math.PI / 2)
      g2.translate(px + Math.cos(aa) * (Rp - 0.05), 2.5, pz + Math.sin(aa) * (Rp - 0.05))
      mulP.push(wuv(g2))
    }
  }
  mergeMesh(W, m.brownColumn, cols)
  mergeMesh(W, m.mullion, mulP)
  // two stepped cream tile bands + clerestory ring
  mesh(W, arcCyl(Rp + 0.55, 0.5, A0, A1, 64, true, Rp + 0.45), m.tiles, px, 4.7, pz)
  mesh(W, arcCyl(Rp + 0.35, 0.5, A0, A1, 64, true, Rp + 0.25), m.tiles, px, 5.3, pz)
  mesh(W, arcCyl(Rp, 0.2, A0, A1, 64, true), m.stuccoSand, px, 4.45, pz)
  // roof — glass cone (Victoria house) or opaque with painted ceiling (star pavilion)
  const clr = glassMesh(W, wuv(new THREE.CylinderGeometry(Rp - 0.1, Rp - 0.1, 0.8, 56, 1, true)), m.glass, px, 5.9 + 0.1, pz)
  clr.visible = true
  const coneH = 2.8
  const cone = new THREE.ConeGeometry(Rp - 0.2, coneH, 56, 1, true)
  if (!star) glassMesh(W, cone, m.glass, px, 6.3 + coneH / 2, pz)
  else mesh(W, cone, m.roofDark, px, 6.3 + coneH / 2, pz)
  const raf2: THREE.BufferGeometry[] = []
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * TAU
    const len = Math.hypot(Rp - 0.2, coneH)
    const g = new THREE.BoxGeometry(0.08, 0.1, len)
    g.translate(0, 0, -len / 2)
    g.rotateX(Math.atan2(coneH, Rp - 0.2))
    g.rotateY(Math.PI / 2 - a)
    g.translate(px + Math.cos(a) * (Rp - 0.2), 6.3, pz + Math.sin(a) * (Rp - 0.2))
    raf2.push(g)
  }
  if (!star) mergeMesh(W, m.mullion, raf2, { cast: false })
  const lan = glassMesh(W, wuv(new THREE.CylinderGeometry(1.0, 1.0, 0.9, 20, 1, true)), m.glass, px, 6.3 + coneH + 0.35, pz)
  lan.visible = true
  cyl(W, m.stuccoSand, 1.15, 1.15, 0.15, px, 6.3 + coneH + 0.8, pz, 20)
  if (!star) {
    // interior: round Victoria pond with tiled balustrade
    mesh(W, arcCyl(3.7, 0.75, 0, TAU, 48, true), m.tilesIn, px, FH + 0.375, pz)
    mesh(W, new THREE.RingGeometry(3.35, 3.95, 48).rotateX(-Math.PI / 2), m.tilesIn, px, FH + 0.76, pz, { cast: false })
    mesh(W, new THREE.CircleGeometry(3.6, 48).rotateX(-Math.PI / 2), m.pondBed, px, FH + 0.05, pz, { cast: false })
    const pw = mesh(W, new THREE.CircleGeometry(3.6, 48).rotateX(-Math.PI / 2), m.lilyWater, px, FH + 0.5, pz, { cast: false })
    pw.renderOrder = 1
    const r = rng(17)
    const pads: THREE.Mesh[] = []
    for (let i = 0; i < 12; i++) {
      const a = r() * TAU, d = Math.sqrt(r()) * 2.7
      const rad = 0.45 + r() * 0.55
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad * 0.96, 0.09, 24), m.lilyPad)
      pad.position.set(px + Math.cos(a) * d, FH + 0.52, pz + Math.sin(a) * d)
      pad.castShadow = true
      W.add(pad)
      pads.push(pad)
    }
    ctx.anim.push((t) => pads.forEach((p, i) => (p.position.y = FH + 0.52 + Math.sin(t * 0.9 + i) * 0.012)))
    // pipes ring (as in the real greenhouse), tropical trunks, plants
    for (const [rad, y] of [[6.4, 4.25], [7.3, 3.95]]) mesh(W, new THREE.TorusGeometry(rad, 0.13, 8, 64), m.pipe, px, y, pz, { cast: false }).rotation.x = Math.PI / 2
    const tr = rng(41)
    for (let i = 0; i < 5; i++) {
      const a = Math.PI + (tr() - 0.5) * 0 + (i / 5) * TAU * 0.0 + 0.5 + i * 1.15
      const d = 5.6 + tr() * 1.4
      const trunk = mesh(W, new THREE.CylinderGeometry(0.28, 0.38, 6, 12), m.bark, px + Math.cos(a) * d, 3, pz + Math.sin(a) * d)
      trunk.castShadow = true
      ctx.colliders.push({ x0: sx(px + Math.cos(a) * d) - 0.45, x1: sx(px + Math.cos(a) * d) + 0.45, z0: pz + Math.sin(a) * d - 0.45, z1: pz + Math.sin(a) * d + 0.45 })
    }
    for (let i = 0; i < 9; i++) {
      const a = Math.PI + 0.9 + (i / 9) * (TAU - 1.8)
      const d = 6.4 + tr() * 1.2
      const p = palm(m, 3 + tr() * 2.6, 100 + i)
      p.position.set(px + Math.cos(a) * d, FH, pz + Math.sin(a) * d)
      W.add(p)
    }
    for (let i = 0; i < 26; i++) {
      const a = Math.PI + 0.55 + tr() * (TAU - 1.1)
      const d = tr() < 0.55 ? 4.45 + tr() * 0.5 : 7.1 + tr() * 1.0
      const lc = leafClump(m, tr, 6, 1.2, 1.0 + tr() * 0.8)
      lc.position.set(px + Math.cos(a) * d, FH, pz + Math.sin(a) * d)
      W.add(lc)
    }
    arcWall(ctx, side * px, pz, 4.2, 0, TAU)
    ctx.zones.push({ id: 'victoria', name: 'Victoria-Regina house', x0: Math.min(side * (px - Rp), side * (px + Rp)), x1: Math.max(side * (px - Rp), side * (px + Rp)), z0: pz - Rp, z1: pz + Rp })
    const pl = new THREE.PointLight('#d8f0d0', 0, 22, 1.6)
    pl.position.set(px, 5.2, pz)
    W.add(pl)
    ctx.lights.push({ light: pl, day: 0, night: 160 })
  } else {
    const ceil = mesh(W, new THREE.CircleGeometry(Rp - 0.35, 56).rotateX(Math.PI / 2), m.stars, px, 5.4, pz, { cast: false })
    ceil.rotation.y = 0.4
    mesh(W, new THREE.TorusGeometry(Rp - 0.4, 0.2, 8, 56), m.stuccoInSand, px, 5.4, pz, { cast: false }).rotation.x = Math.PI / 2
    // circular bench + central lectern
    cyl(W, m.stone, 1.2, 1.4, 0.5, px, FH, pz, 28)
    cyl(W, m.bronze, 0.45, 0.6, 1.1, px, FH + 0.5, pz, 20)
    mesh(W, new THREE.SphereGeometry(0.4, 18, 14), m.bronze, px, FH + 1.8, pz)
    arcWall(ctx, side * px, pz, 1.7, 0, TAU)
    for (const a of [0.6, 1.8, 3.0, 4.2, 5.4]) {
      const g = new THREE.Group()
      const b = bench(ctx, 0, 0, 0, FH, false)
      ctx.root.remove(b)
      g.add(b)
      g.position.set(px + Math.cos(a) * 5.4, 0, pz + Math.sin(a) * 5.4)
      g.rotation.y = -a + Math.PI / 2
      W.add(g)
    }
    const pl = new THREE.PointLight('#aab8ff', 0, 22, 1.5)
    pl.position.set(px, 4.6, pz)
    W.add(pl)
    ctx.lights.push({ light: pl, day: 40, night: 120 })
    ctx.zones.push({ id: 'star', name: 'Star-sky pavilion', x0: Math.min(side * (px - Rp), side * (px + Rp)), x1: Math.max(side * (px - Rp), side * (px + Rp)), z0: pz - Rp, z1: pz + Rp })
  }
  arcWall(ctx, side * px, pz, Rp - 0.1, a0, a1)
  ctx.floors.push({ x0: Math.min(side * (px - Rp), side * (px + Rp)), x1: Math.max(side * (px - Rp), side * (px + Rp)), z0: pz - Rp, z1: pz + Rp, h: FH, round: true })
}

/* --------------------------------------------------------------------- statues & tower */
function statues(ctx: BuildCtx) {
  const m = ctx.m
  const R = ctx.root
  // south canopy: woman with deer (Charles Eyck)
  const cy = CANOPY_Y + 0.05
  const zs = -(HL + 2.6)
  figure(R, m.stone, -1.4, cy + 0.0, zs, 1.95, 0.1)
  quadruped(R, m.stone, -3.0, cy, zs - 0.1, 0.75, -0.9)
  quadruped(R, m.stone, -4.2, cy, zs + 0.1, 0.55, -1.4)
  figure(R, m.stone, 12.6, cy, -(HL + 0.9), 1.4, -0.3)
  // roof crest: angel and two unicorns (W. van Kuilenburg)
  const top = archY(0) + 0.15
  figure(R, m.stone, 0, top, HL - 0.6, 2.1, Math.PI, true)
  quadruped(R, m.stone, -2.0, top - 0.02, HL - 0.9, 1.0, Math.PI / 2 + 0.2, true)
  quadruped(R, m.stone, 2.0, top - 0.02, HL - 0.9, 1.0, -Math.PI / 2 - 0.2, true)
}

function tower(ctx: BuildCtx) {
  const m = ctx.m
  const g = new THREE.Group()
  const z0 = HL + 13.5
  // tapered concrete shaft with vertical slits
  const shaft = mesh(g, wuv(new THREE.CylinderGeometry(1.7, 2.6, 33, 4, 1)), m.stucco, 0, 16.5, z0)
  shaft.rotation.y = Math.PI / 4
  const slits: THREE.BufferGeometry[] = []
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU
    for (const y of [5, 11, 17, 23, 29]) {
      const rr = 2.6 - (y / 33) * 0.9 - 0.02
      const gg = new THREE.BoxGeometry(0.12, 2.6, 0.12)
      gg.translate(Math.cos(a) * rr * 0.72, y, Math.sin(a) * rr * 0.72)
      slits.push(gg)
    }
  }
  slits.forEach((s) => s.translate(0, 0, z0))
  mergeMesh(g, m.frameDark, slits)
  // observation cabin
  cyl(g, m.stuccoSand, 4.4, 2.2, 1.4, 0, 33, z0, 24)
  cyl(g, m.concrete, 4.7, 4.7, 0.3, 0, 34.4, z0, 24)
  glassMesh(g, wuv(new THREE.CylinderGeometry(4.1, 4.1, 2.6, 24, 1, true)), m.glass, 0, 36, z0)
  const mm: THREE.BufferGeometry[] = []
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * TAU
    mm.push(boxGeo(0.1, 2.6, 0.1, Math.cos(a) * 4.1, 34.7, z0 + Math.sin(a) * 4.1))
  }
  mergeMesh(g, m.mullion, mm)
  cyl(g, m.stuccoSand, 4.6, 4.6, 0.4, 0, 37.3, z0, 24)
  cyl(g, m.stuccoSand, 3.2, 4.2, 1.1, 0, 37.7, z0, 24)
  cyl(g, m.steelDark, 0.07, 0.14, 8.2, 0, 38.8, z0, 8)
  g.traverse((o) => ((o as THREE.Mesh).isMesh && (o as THREE.Mesh).material !== m.glass ? ((o as THREE.Mesh).castShadow = true) : 0))
  ctx.root.add(g)
  ctx.tower.push(g)
  ctx.colliders.push({ x0: -2.7, x1: 2.7, z0: z0 - 2.7, z1: z0 + 2.7, when: 'tower' })
  // two angled pavilions flanking the tower (cafeteria + restaurant)
  for (const s of [-1, 1]) {
    const p = new THREE.Group()
    slab(p, m.stucco, 0, 0, 7, 7, 0, 4.1)
    slab(p, m.stuccoSand, 0, 0, 7.6, 7.6, 4.1, 0.35)
    glassMesh(p, new THREE.PlaneGeometry(6.2, 2.6), m.glass, 0, 1.7, 3.55)
    p.position.set(s * 10, 0, HL + 6)
    p.rotation.y = s * Math.PI / 4
    ctx.root.add(p)
    ctx.tower.push(p)
    rotBox(ctx, s * 10, HL + 6, 7.4, 7.4, s * Math.PI / 4, 'tower')
  }
}

function terraceFurniture(ctx: BuildCtx) {
  const z0 = HL + 10.6
  const pts: [number, number, number][] = [[-12, z0, 0.3], [-9, z0 + 3.5, 0.0], [9, z0 + 3.5, 0.0], [12, z0, 0.2], [-14.5, z0 + 6.5, 0.5], [14.5, z0 + 6.5, -0.4], [-11, z0 + 7, 0], [11, z0 + 8, 0]]
  for (const [x, z, ry] of pts) {
    const t = new THREE.Group()
    ctx.root.add(t)
    picnicTable(ctx, x, z, ry, t, 'today')
    ctx.today.push(t)
  }
}

export function buildRivierahal(ctx: BuildCtx) {
  const R = new THREE.Group()
  ctx.root.add(R)
  hall(ctx, R)
  // facades (north + south copy)
  const north = new THREE.Group()
  R.add(north)
  archFacade(ctx, north)
  const south = new THREE.Group()
  south.rotation.y = Math.PI
  R.add(south)
  const keepCols = ctx.colliders.length
  archFacade(ctx, south)
  // collider boxes made for the south copy are in the wrong place: mirror them
  for (let i = keepCols; i < ctx.colliders.length; i++) {
    const c = ctx.colliders[i]
    ctx.colliders[i] = { x0: -c.x1, x1: -c.x0, z0: -c.z1, z1: -c.z0 }
  }
  const lowN = new THREE.Group()
  R.add(lowN)
  lowerFront(ctx, lowN, 'terrace')
  const lowS = new THREE.Group()
  lowS.rotation.y = Math.PI
  R.add(lowS)
  const n0 = ctx.colliders.length
  lowerFront(ctx, lowS, 'shop')
  for (let i = n0; i < ctx.colliders.length; i++) {
    const c = ctx.colliders[i]
    ctx.colliders[i] = { x0: -c.x1, x1: -c.x0, z0: -c.z1, z1: -c.z0, when: c.when }
  }
  wing(ctx, 1)
  wing(ctx, -1)
  statues(ctx)
  tower(ctx)
  terraceFurniture(ctx)
  ctx.zones.push({ id: 'terrace', name: 'Terrace (terraszaal)', x0: -16, x1: 16, z0: HL, z1: HL + 12 })
  ctx.zones.push({ id: 'south', name: 'South façade', x0: -22, x1: 22, z0: -HL - 14, z1: -HL })
}

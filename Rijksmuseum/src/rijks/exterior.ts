import * as THREE from 'three'
import { Batch, Facade, Opening, WinMats, PI, box, boxMM, cylinder, frustum, gablePrism, openingPath, sphere } from './geo'
import type { Mats } from './materials'
import { C, World } from './world'

const ROOF_BASE_WING = 14.9
const H_WING = 14.6

export function buildExterior(w: World, m: Mats) {
  const b = new Batch()
  const win: WinMats = { glass: m.glass, frame: m.frame, stone: m.stone }
  const arch = (u: number, y0: number, y1: number, width: number): Opening => ({ u, w: width, y0, y1, kind: 'arch' })
  const pointed = (u: number, y0: number, y1: number, width: number): Opening => ({ u, w: width, y0, y1, kind: 'pointed' })

  /* --------------------------------------------------------------- helpers */
  /** solid block in a facade's local frame; z values relative to the face plane (+ = in front) */
  const solid = (F: Facade, mat: THREE.Material, u0: number, u1: number, y0: number, y1: number, zA: number, zB: number) => {
    const g = new THREE.BoxGeometry(u1 - u0, y1 - y0, zB - zA)
    g.translate((u0 + u1) / 2, (y0 + y1) / 2, F.t + (zA + zB) / 2)
    F.add(mat, g)
  }

  /** plinth, string course, corbelled cornice */
  const dress = (F: Facade, u0: number, u1: number, H: number, gap = 0) => {
    const L = u1 - u0, uc = (u0 + u1) / 2
    if (gap > 0) {
      for (const [a, c] of [[u0, -gap], [gap, u1]]) {
        F.box(m.stone, c - a, 1.0, 0.5, (a + c) / 2, 0, 0.15)
        F.box(m.stone, c - a, 0.4, 0.5, (a + c) / 2, 6.75, 0.12)
      }
    } else {
      F.box(m.stone, L, 1.0, 0.5, uc, 0, 0.15)
      F.box(m.stone, L, 0.4, 0.5, uc, 6.75, 0.12)
    }
    for (let u = u0 + 0.45; u < u1 - 0.1; u += 0.9) F.box(m.stone, 0.4, 0.5, 0.65, u, H - 0.95, 0.22)
    F.box(m.stone, L, 0.4, 1.3, uc, H - 0.45, 0.45)
    F.box(m.stone, L + 0.2, 0.32, 1.6, uc, H - 0.05, 0.6)
  }

  /** slate gable roof with lead ridge. ridge runs along local u unless alongZ. */
  const gable = (F: Facade, uc: number, zc: number, y: number, len: number, span: number, rise: number, alongZ = false) => {
    const { slopes, ends } = gablePrism(len, span, rise)
    for (const g of [slopes, ends]) {
      if (alongZ) g.rotateY(PI / 2)
      g.translate(uc, y, F.t + zc)
    }
    F.add(m.slate, slopes)
    F.add(m.slate, ends)
    const r = new THREE.BoxGeometry(alongZ ? 0.45 : len + 0.2, 0.3, alongZ ? len + 0.2 : 0.45)
    r.translate(uc, y + rise + 0.05, F.t + zc)
    F.add(m.lead, r)
  }

  const gilt = (x: number, y: number, z: number, s = 1) => {
    sphere(b, m.gold, 0.28 * s, x, y, z, 1, 1, 1, 14)
    cylinder(b, m.gold, 0.02 * s, 0.07 * s, 1.6 * s, x, y + 0.2 * s, z, 8)
    sphere(b, m.gold, 0.1 * s, x, y + 1.85 * s, z, 1, 1, 1, 8)
  }

  const statue = (x: number, y: number, z: number, s = 1, ry = 0) => {
    box(b, m.stone, 0.95 * s, 1.1 * s, 0.95 * s, x, y, z, ry)
    cylinder(b, m.stoneSmooth, 0.3 * s, 0.46 * s, 1.55 * s, x, y + 1.1 * s, z, 12)
    sphere(b, m.stoneSmooth, 0.36 * s, x, y + 2.62 * s, z, 1, 0.85, 0.8, 12)
    sphere(b, m.stoneSmooth, 0.2 * s, x, y + 2.98 * s, z, 1, 1.05, 1, 12)
    // raised arm
    const arm = new THREE.CylinderGeometry(0.07 * s, 0.09 * s, 0.9 * s, 8)
    arm.rotateZ(0.7)
    arm.translate(x + 0.33 * s, y + 2.7 * s, z)
    b.add(m.stoneSmooth, arm)
  }

  /* --------------------------------------------------------------- hidden core + lead roofs */
  const core = (x0: number, x1: number, z0: number, z1: number, y0 = 0, y1 = 14.5) => boxMM(b, m.lead, x0, x1, y0, y1, z0, z1)
  for (const sx of [-1, 1]) {
    const a = sx > 0 ? 6.0 : -67.1, c = sx > 0 ? 67.1 : -6.0
    core(a, c, 17.7, 49.1)
    core(a, c, -49.1, -17.7)
    core(sx > 0 ? 40.7 : -67.1, sx > 0 ? 67.1 : -40.7, -17.7, 17.7)
    // corner pavilion masses (taller)
    core(sx > 0 ? 54 : -67.4, sx > 0 ? 67.4 : -54, 36.6, 49.4, 0, 17.3)
    core(sx > 0 ? 54 : -67.4, sx > 0 ? 67.4 : -54, -49.4, -36.6, 0, 17.3)
    // fillers by the passage walls
    boxMM(b, m.lead, sx > 0 ? 6 : -8, sx > 0 ? 8 : -6, 0, 14.5, 17, 17.8)
    boxMM(b, m.lead, sx > 0 ? 6 : -8, sx > 0 ? 8 : -6, 0, 14.5, -17.8, -17)
    // towers (front + back)
    for (const sz of [-1, 1]) {
      boxMM(b, m.lead, sx > 0 ? 9.5 : -17, sx > 0 ? 17 : -9.5, 0, 25, sz > 0 ? 43.5 : -49.4, sz > 0 ? 49.4 : -43.5)
    }
  }
  // lids over the passage where there is no Gallery above
  boxMM(b, m.lead, -6.2, 6.2, 6.9, 14.5, 16.6, 49.1)
  boxMM(b, m.lead, -6.2, 6.2, 6.9, 14.5, -49.1, -36.6)
  // gabled pavilion masses above the passage (front/back)
  boxMM(b, m.lead, -9.5, 9.5, 14.5, 18.8, 40, 49.4)
  boxMM(b, m.lead, -9.5, 9.5, 14.5, 18.8, -49.4, -40)

  /* --------------------------------------------------------------- main (front/back) facades */
  const mainFacade = (ry: number) => {
    const F = new Facade(b, ry, 50, 1)
    // ---- wings
    for (const s of [-1, 1]) {
      const u0 = s > 0 ? 17 : -54, u1 = s > 0 ? 54 : -17
      const n = 9, pitch = (u1 - u0) / n
      const holes: Opening[] = []
      const bays: Opening[] = []
      for (let k = 0; k < n; k++) {
        const u = u0 + pitch * (k + 0.5)
        holes.push(arch(u, 1.4, 6.2, 2.0), arch(u, 8.6, 13.0, 2.2))
        bays.push(arch(u, 1.4, 6.2, 2.0), arch(u, 8.6, 13.0, 2.2))
      }
      F.wall(m.brick, u0, u1, 0, H_WING, holes)
      for (const o of bays) F.window(win, o, { surround: 0.28, mullions: o.w > 2.1 ? 2 : 1 })
      dress(F, u0, u1, H_WING)
      // dormers
      for (let k = 1; k < n; k += 2) dormer(F, u0 + pitch * (k + 0.5), ROOF_BASE_WING)
      // slate roof
      gable(F, (u0 + u1) / 2, -7, ROOF_BASE_WING, u1 - u0 + 0.2, 15.2, 7.5)
    }

    // ---- corner pavilions
    const Fp = new Facade(b, ry, 50.8, 1.8)
    for (const s of [-1, 1]) {
      const u0 = s > 0 ? 54 : -68, u1 = s > 0 ? 68 : -54
      const c = (u0 + u1) / 2
      const holes: Opening[] = []
      for (const du of [-3.7, 0, 3.7]) holes.push(arch(c + du, 1.4, 6.4, 2.4), arch(c + du, 8.6, 13.6, 2.4))
      Fp.wall(m.brick, u0, u1, 0, 17.2, holes)
      for (const o of holes) Fp.window(win, o, { surround: 0.3, mullions: 1 })
      dress(Fp, u0, u1, 17.2)
      for (const e of [u0 + 0.45, u1 - 0.45]) Fp.box(m.stone, 0.9, 17.2, 0.3, e, 0, 0.12)
    }

    // ---- central block
    centre(ry)
  }

  const dormer = (F: Facade, u: number, y: number) => {
    const s = new THREE.Shape()
    s.moveTo(u - 1.0, y); s.lineTo(u + 1.0, y); s.lineTo(u + 1.0, y + 2.6); s.lineTo(u, y + 3.9); s.lineTo(u - 1.0, y + 2.6); s.lineTo(u - 1.0, y)
    const o = arch(u, y + 0.5, y + 2.3, 0.9)
    const h = new THREE.Path()
    h.moveTo(u - 0.45, y + 0.5); h.lineTo(u + 0.45, y + 0.5); h.lineTo(u + 0.45, y + 1.85); h.absarc(u, y + 1.85, 0.45, 0, PI, false); h.lineTo(u - 0.45, y + 0.5)
    s.holes.push(h)
    F.shape(m.stone, s, 0.6, F.t - 0.6)
    F.window(win, o, { surround: 0.1, sill: false, mullions: 0, setback: 0.25 })
    for (const sx of [-1, 1]) solid(F, m.stone, u + sx * 0.95 - 0.06, u + sx * 0.95 + 0.06, y, y + 2.6, -2.4, 0)
    gable(F, u, -1.2, y + 2.6, 2.8, 2.4, 1.1, true)
  }

  const centre = (ry: number) => {
    const Fc = new Facade(b, ry, 51.5, 2.5)
    const pass: Opening = { u: 0, w: 2 * C.PW, y0: 0, y1: 6.8, kind: 'ellipse', rise: 2.4 }
    const small: Opening[] = [
      arch(-7.5, 1.4, 6.2, 1.8), arch(7.5, 1.4, 6.2, 1.8),
      pointed(-7.5, 9.2, 14.2, 1.8), pointed(7.5, 9.2, 14.2, 1.8),
      pointed(-3.7, 9.2, 14.8, 2.2), pointed(3.7, 9.2, 14.8, 2.2),
      pointed(0, 9.2, 15.6, 2.8),
    ]
    Fc.wall(m.brick, -9.5, 9.5, 0, 18.0, [pass, ...small])
    for (const o of small) Fc.window(win, o, { surround: 0.3, mullions: o.w > 2 ? 1 : 0, transom: 0.55 })
    Fc.surround(m.stone, pass, 0.9, 0.4)
    Fc.surround(m.stoneSmooth, pass, 0.25, 0.55, Fc.t - 0.02 + 0.0)
    dress(Fc, -9.5, 9.5, 18.0, 6.6)
    // frieze with gilded rondels above the portal
    for (let i = -3; i <= 3; i++) {
      const p = Fc.world(i * 1.2, 7.9, 0.45)
      sphere(b, m.gold, 0.3, p.x, p.y, p.z, 1, 1, 0.35, 14)
    }
    // statues flanking the portal
    for (const s of [-1, 1]) {
      const p = Fc.world(s * 8.4, 18.9, 0.5)
      statue(p.x, p.y, p.z, 1)
    }

    // stepped brick gable
    const Fg = new Facade(b, ry, 51.2, 1.0)
    const half: [number, number][] = [[9.5, 18.8], [9.5, 20.2], [8.5, 20.2], [8.5, 21.8], [7.3, 21.8], [7.3, 23.4], [5.9, 23.4], [5.9, 25.0], [4.4, 25.0], [4.4, 26.6], [2.6, 26.6], [2.6, 28.2], [1.0, 28.2], [1.0, 29.6]]
    const gs = new THREE.Shape()
    gs.moveTo(-9.5, 18.8)
    for (const [x, y] of half) gs.lineTo(x, y)
    gs.lineTo(0, 31.0)
    for (let i = half.length - 1; i >= 0; i--) gs.lineTo(-half[i][0], half[i][1])
    const gw = pointed(0, 21.4, 27.4, 3.2)
    gs.holes.push(openingPath(gw))
    Fg.shape(m.brick, gs, 1.0, 0)
    Fg.window({ glass: m.glassLit, frame: m.frame, stone: m.stone }, gw, { surround: 0.35, mullions: 1, transom: 0.6, sill: false })
    for (const s of [-1, 1]) {
      const o: Opening = { u: s * 5.7, w: 2.0, y0: 19.8, y1: 22.6, kind: 'rect' }
      Fg.pane(m.delft, o, -0.04)
      Fg.surround(m.stone, o, 0.14, 0.12, Fg.t - 0.02)
    }
    for (let i = 0; i < half.length - 1; i++) {
      const [x0, y0] = half[i], [x1, y1] = half[i + 1]
      if (y0 === y1) for (const s of [-1, 1]) Fg.box(m.stone, Math.abs(x1 - x0) + 0.25, 0.2, 1.2, s * (x0 + x1) / 2, y0, 0.12)
    }
    const fp = Fg.world(0, 31.0, 0)
    gilt(fp.x, fp.y, fp.z, 1.2)
    for (const s of [-1, 1]) { const p = Fg.world(s * 9.5, 20.2, 0.3); statue(p.x, p.y, p.z, 0.9) }
    // pavilion roof behind the gable
    gable(Fc, 0, -6.2, 18.0, 11.6, 19.6, 6.5, true)

    // towers
    const Ft = new Facade(b, ry, 51.0, 2.0)
    for (const s of [-1, 1]) {
      const u0 = s > 0 ? 9.5 : -17, u1 = s > 0 ? 17 : -9.5
      const c = (u0 + u1) / 2
      const holes: Opening[] = [
        arch(c, 1.6, 6.0, 1.6), pointed(c, 9.0, 13.2, 1.6), pointed(c, 15.4, 20.0, 1.2), pointed(c, 21.6, 24.4, 2.6),
      ]
      Ft.wall(m.brick, u0, u1, 0, 25, holes)
      for (const o of holes.slice(0, 3)) Ft.window(win, o, { surround: 0.26, mullions: 0 })
      // belfry louvres
      Ft.window({ glass: m.black, frame: m.stone, stone: m.stone }, holes[3], { surround: 0.35, mullions: 2, transom: 0.4, setback: 0.7 })
      for (const y of [7.1, 14.3, 20.6]) Ft.box(m.stone, u1 - u0 + 0.5, 0.4, 0.6, c, y, 0.2)
      // cornice + parapet
      solid(Ft, m.stone, u0 - 0.4, u1 + 0.4, 25, 25.9, -7.9, 0.5)
      for (let i = 0; i < 9; i++) Ft.box(m.stone, 0.45, 0.5, 0.7, u0 - 0.1 + ((u1 - u0 + 0.2) * i) / 8, 24.4, 0.15)
      // corner pinnacles
      for (const cu of [u0 - 0.1, u1 + 0.1]) for (const cz of [0.1, -7.7]) {
        const p = Ft.world(cu, 25.9, cz)
        box(b, m.stone, 0.8, 2.6, 0.8, p.x, p.y, p.z)
        const g = frustum(1.0, 1.0, 0.0, 0.0, 1.6)
        g.translate(p.x, p.y + 2.6, p.z)
        b.add(m.slate, g)
        sphere(b, m.gold, 0.1, p.x, p.y + 4.3, p.z, 1, 1, 1, 8)
      }
      // spire
      const sp = frustum(8.2, 8.2, 0.35, 0.35, 13)
      sp.translate(c, 25.9, Ft.t - 3.75)
      Ft.add(m.slate, sp)
      // spire dormers
      const ring = frustum(7.4, 7.4, 7.0, 7.0, 0.5)
      ring.translate(c, 25.9, Ft.t - 3.75)
      Ft.add(m.stone, ring)
      const top = Ft.world(c, 38.9, -3.75)
      gilt(top.x, top.y - 0.1, top.z, 1.1)
    }
  }

  /* --------------------------------------------------------------- side facades */
  const sideFacade = (ry: number) => {
    const F = new Facade(b, ry, C.HW, 1)
    const holes: Opening[] = []
    const bays: Opening[] = []
    for (let k = 0; k < 18; k++) {
      const u = -36 + 2 + k * 4
      if (Math.abs(u) < 8.5) continue
      holes.push(arch(u, 1.4, 6.2, 2.0), arch(u, 8.6, 13.0, 2.2))
      bays.push(arch(u, 1.4, 6.2, 2.0), arch(u, 8.6, 13.0, 2.2))
    }
    F.wall(m.brick, -36, 36, 0, H_WING, holes)
    for (const o of bays) F.window(win, o, { surround: 0.28, mullions: o.w > 2.1 ? 2 : 1 })
    dress(F, -36, -8.4, H_WING)
    dress(F, 8.4, 36, H_WING)
    for (let k = 1; k < 18; k += 2) {
      const u = -36 + 2 + k * 4
      if (Math.abs(u) > 9.5) dormer(F, u, ROOF_BASE_WING)
    }
    gable(F, 0, -7, ROOF_BASE_WING, 72.2, 15.2, 7.5)

    // corner pavilion faces
    const Fp = new Facade(b, ry, C.HW + 0.8, 1.8)
    for (const s of [-1, 1]) {
      const u0 = s > 0 ? 36 : -50.8, u1 = s > 0 ? 50.8 : -36
      const c = (u0 + u1) / 2
      const hs: Opening[] = []
      for (const du of [-3.7, 0, 3.7]) hs.push(arch(c + du, 1.4, 6.4, 2.4), arch(c + du, 8.6, 13.6, 2.4))
      Fp.wall(m.brick, u0, u1, 0, 17.2, hs)
      for (const o of hs) Fp.window(win, o, { surround: 0.3, mullions: 1 })
      dress(Fp, u0, u1, 17.2)
      for (const e of [u0 + 0.45, u1 - 0.45]) Fp.box(m.stone, 0.9, 17.2, 0.3, e, 0, 0.12)
    }

    // central side pavilion with entrance
    const Fs = new Facade(b, ry, C.HW + 1.2, 2.2)
    const door: Opening = arch(0, 0, 5.4, 3.4)
    const sh: Opening[] = [arch(-5.2, 1.4, 6.2, 2.0), arch(5.2, 1.4, 6.2, 2.0), arch(-5.2, 8.6, 13.0, 2.2), arch(5.2, 8.6, 13.0, 2.2), arch(0, 8.6, 13.4, 3.2)]
    Fs.wall(m.brick, -8, 8, 0, 15.0, [door, ...sh])
    for (const o of sh) Fs.window(win, o, { surround: 0.28, mullions: o.w > 3 ? 2 : o.w > 2.1 ? 1 : 1 })
    Fs.pane(m.door, door, 0.5)
    Fs.surround(m.stone, door, 0.45, 0.3)
    dress(Fs, -8, 8, 15.0)
    // pediment
    const ps = new THREE.Shape()
    ps.moveTo(-8, 15.3); ps.lineTo(8, 15.3); ps.lineTo(0, 22.2); ps.lineTo(-8, 15.3)
    const rose = new THREE.Path()
    rose.absarc(0, 18.0, 1.1, 0, PI * 2, false)
    ps.holes.push(rose)
    Fs.shape(m.brick, ps, 1.0, Fs.t - 1.0)
    const rg = new THREE.CircleGeometry(1.1, 24)
    rg.translate(0, 18.0, Fs.t - 0.45)
    Fs.add(m.glassLit, rg)
    const ring = new THREE.RingGeometry(1.1, 1.45, 24)
    ring.translate(0, 18.0, Fs.t + 0.05)
    Fs.add(m.stone, ring)
    gable(Fs, 0, -6.5, 15.0, 13.4, 16.4, 7.0, true)
    const fp = Fs.world(0, 22.2, 0)
    gilt(fp.x, fp.y, fp.z, 0.9)
  }

  mainFacade(0)
  mainFacade(PI)
  sideFacade(PI / 2)
  sideFacade(-PI / 2)

  /* --------------------------------------------------------------- corner pavilion roofs */
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = sx * 61, z = sz * 43.2
    const y0 = 17.3
    const g = frustum(15.8, 15.8, 4.2, 4.2, 9.2)
    g.translate(x, y0, z)
    b.add(m.slate, g)
    // lantern
    box(b, m.stone, 3.2, 2.4, 3.2, x, y0 + 9.2, z)
    for (const [dx, dz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const o = new THREE.PlaneGeometry(1.2, 1.5)
      o.rotateY(Math.atan2(dx, dz))
      o.translate(x + dx * 1.62, y0 + 10.4, z + dz * 1.62)
      b.add(m.glass, o)
    }
    box(b, m.stone, 3.7, 0.3, 3.7, x, y0 + 11.6, z)
    const cap = frustum(3.6, 3.6, 0.3, 0.3, 4.4)
    cap.translate(x, y0 + 11.9, z)
    b.add(m.slate, cap)
    gilt(x, y0 + 16.2, z, 1.0)
    // hip ridge accents + corner finials
    for (const [dx, dz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      sphere(b, m.gold, 0.14, x + dx * 7.7, y0 + 0.2, z + dz * 7.7, 1, 1, 1, 8)
    }
  }

  /* --------------------------------------------------------------- colliders */
  const col = (x0: number, x1: number, z0: number, z1: number, y0 = 0, y1 = 60) => w.colliders.push({ x0, x1, z0, z1, y0, y1 })
  for (const sx of [-1, 1]) {
    const a = (v: number, v2: number): [number, number] => (sx > 0 ? [v, v2] : [-v2, -v])
    let [x0, x1] = a(5.5, 69.5)
    col(x0, x1, 17, 52.2)
    col(x0, x1, -52.2, -17)
    ;[x0, x1] = a(40, 69.5)
    col(x0, x1, -17, 17)
    ;[x0, x1] = a(5.5, 8)
    col(x0, x1, -17, -C.DOOR)
    col(x0, x1, C.DOOR, 17)
  }

  b.build(w.group)
}

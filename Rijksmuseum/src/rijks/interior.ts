import * as THREE from 'three'
import { Batch, Facade, Opening, PI, WinMats, box, boxMM, cylinder, extrudeShape, gablePrism, sphere } from './geo'
import type { Mats } from './materials'
import type { ArtPiece } from './art'
import { C, World } from './world'

/** lofted elliptical barrel vault surface; uv in metres (u = arc length, v = z) */
function vaultGeo(a: number, bb: number, y0: number, z0: number, z1: number, th0 = 0, th1 = PI, segs = 36, zs = 8) {
  const pos: number[] = [], uv: number[] = [], idx: number[] = []
  const s: number[] = [0]
  const pt = (th: number): [number, number] => [a * Math.cos(th), y0 + bb * Math.sin(th)]
  for (let i = 1; i <= segs; i++) {
    const p0 = pt(th0 + ((th1 - th0) * (i - 1)) / segs), p1 = pt(th0 + ((th1 - th0) * i) / segs)
    s.push(s[i - 1] + Math.hypot(p1[0] - p0[0], p1[1] - p0[1]))
  }
  for (let j = 0; j <= zs; j++) {
    const z = z0 + ((z1 - z0) * j) / zs
    for (let i = 0; i <= segs; i++) {
      const [x, y] = pt(th0 + ((th1 - th0) * i) / segs)
      pos.push(x, y, z)
      uv.push(s[i], z)
    }
  }
  for (let j = 0; j < zs; j++) for (let i = 0; i < segs; i++) {
    const A = j * (segs + 1) + i, B = A + 1, Cc = A + segs + 1, D = Cc + 1
    idx.push(A, Cc, B, B, Cc, D)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

function ribGeo(a: number, bb: number, y0: number, thick: number, depth: number) {
  const s = new THREE.Shape()
  s.moveTo(a, y0)
  s.absellipse(0, y0, a, bb, 0, PI, false, 0)
  s.lineTo(-a + thick, y0)
  s.absellipse(0, y0, a - thick, bb - thick * 0.7, PI, 0, true, 0)
  s.lineTo(a, y0)
  return extrudeShape(s, depth, 24)
}

export interface InteriorOpts { art: Record<string, ArtPiece> }

export function buildInterior(w: World, m: Mats, opts: InteriorOpts) {
  const b = new Batch()
  const root = w.group
  m.ornament.side = THREE.DoubleSide
  const winLit: WinMats = { glass: m.glassLit, frame: m.frame, stone: m.stone }
  const arch = (u: number, y0: number, y1: number, width: number): Opening => ({ u, w: width, y0, y1, kind: 'arch' })

  const addLamp = (x: number, y: number, z: number, intensity: number, dist: number, color = '#ffe3b8') => {
    const l = new THREE.PointLight(color, intensity, dist, 2)
    l.position.set(x, y, z)
    root.add(l)
    w.lamps.push({ light: l, base: intensity })
  }
  const col = (x0: number, x1: number, z0: number, z1: number, y0: number, y1: number, s = 1) => {
    w.colliders.push(s > 0 ? { x0, x1, z0, z1, y0, y1 } : { x0: -x1, x1: -x0, z0, z1, y0, y1 })
  }
  const surf = (x0: number, x1: number, z0: number, z1: number, h: number | ((x: number, z: number) => number), s = 1) => {
    const f = typeof h === 'number' ? () => h : h
    w.surfaces.push(s > 0 ? { x0, x1, z0, z1, h: f } : { x0: -x1, x1: -x0, z0, z1, h: f })
  }

  /* ================================================================ PASSAGE (central, symmetric) */
  {
    const a = C.PW, bb = 2.4, y0 = 4.4
    // floor: sett paving + two red cycle lanes
    boxMM(b, m.pavers, -a, a, -0.25, 0.012, -52, 52)
    for (const s of [-1, 1]) boxMM(b, m.cycle, s * 3.2 - 1.45, s * 3.2 + 1.45, 0.012, 0.02, -62, 62)
    boxMM(b, m.white, -0.05, 0.05, 0.02, 0.024, -62, 62)
    // vault + ribs
    b.add(m.ornament, vaultGeo(a, bb, y0, -52, 52, 0, PI, 40, 26), 'keep')
    for (let z = -42; z <= 42; z += 6) {
      const g = ribGeo(a, bb, y0, 0.55, 0.5)
      g.translate(0, 0, z - 0.25)
      b.add(m.stone, g)
    }
    // hanging lanterns
    for (let z = -45; z <= 45; z += 9) for (const x of [-2.4, 2.4]) {
      cylinder(b, m.black, 0.01, 0.01, 0.9, x, 5.0, z, 4)
      cylinder(b, m.lamp, 0.22, 0.2, 0.5, x, 4.5, z, 10)
      cylinder(b, m.black, 0.25, 0.04, 0.18, x, 5.0, z, 10)
    }
    for (const z of [-24, 0, 24]) addLamp(0, 4.6, z, 20, 26)
    // bicycle stands along the walls are handled by the "life" module
  }

  /* ================================================================ GALLERY OF HONOUR (central) */
  {
    const a = C.PW, bb = 3.2, y0 = 14
    const z0 = C.GZ0, z1 = C.GZ1
    // floor
    boxMM(b, m.boards, -a, a, 7.0, 8.0, z0, z1)
    // vault with skylight strip
    b.add(m.ornament, vaultGeo(a, bb, y0, z0, z1, 0, PI / 2 - 0.34, 14, 10), 'keep')
    b.add(m.ornament, vaultGeo(a, bb, y0, z0, z1, PI / 2 + 0.34, PI, 14, 10), 'keep')
    b.add(m.skylight, vaultGeo(a, bb, y0, z0, z1, PI / 2 - 0.34, PI / 2 + 0.34, 6, 10), 'keep')
    for (let z = z0 + 4; z < z1; z += 6.5) {
      const g = ribGeo(a, bb, y0, 0.5, 0.45)
      g.translate(0, 0, z - 0.2)
      b.add(m.stone, g)
    }
    // end walls with lunettes
    const lun = (ry: number, D: number, mat: THREE.Material, holes: Opening[]) => {
      const F = new Facade(b, ry, D, 1)
      F.wall(mat, -a - 1, a + 1, 8, 14, holes)
      const s = new THREE.Shape()
      s.moveTo(-a, 14)
      s.absellipse(0, 14, a, bb, PI, 0, true, 0)
      s.lineTo(-a, 14)
      F.shape(mat, s, 1, 0)
      return F
    }
    const Fn = lun(0, z0, m.wallNight, [])
    void Fn
    const Fs = lun(PI, -z1, m.wallGallery, [arch(0, 9.4, 14.6, 4.4)])
    Fs.window({ glass: m.glassLit, frame: m.frame, stone: m.stone }, arch(0, 9.4, 14.6, 4.4), { surround: 0.4, mullions: 3, transom: 0.5 })
    // Night Watch niche surround
    {
      const F = new Facade(b, 0, z0, 1)
      const o: Opening = { u: 0, w: 5.7, y0: 8.0, y1: 14.0, kind: 'rect' }
      const s = new THREE.Shape()
      s.moveTo(-3.3, 8); s.lineTo(3.3, 8); s.lineTo(3.3, 13.6); s.lineTo(-3.3, 13.6); s.lineTo(-3.3, 8)
      const h = new THREE.Path()
      h.moveTo(-2.85, 8); h.lineTo(2.85, 8); h.lineTo(2.85, 13.15); h.lineTo(-2.85, 13.15); h.lineTo(-2.85, 8)
      s.holes.push(h)
      F.shape(m.stone, s, 0.18)
      void o
      // darker inner field so the painting glows
      F.box(m.wallNight, 5.7, 5.15, 0.04, 0, 8.0, 0.03)
    }
    // gallery roof (slate gable) – ridge along z
    {
      const { slopes, ends } = gablePrism(z1 - z0 + 1.8, 13.4, 7.0)
      for (const g of [slopes, ends]) { g.rotateY(PI / 2); g.translate(0, 14, (z0 + z1) / 2) }
      b.add(m.slate, slopes)
      b.add(m.slate, ends)
      const r = new THREE.BoxGeometry(0.45, 0.3, z1 - z0 + 2)
      r.translate(0, 21.05, (z0 + z1) / 2)
      b.add(m.lead, r)
    }
    // ceiling light bars
    for (let z = z0 + 6; z < z1 - 2; z += 8) box(b, m.lamp, 0.22, 0.12, 2.4, 0, 16.95, z)
    for (const z of [-30, -17, -4, 9]) addLamp(0, 15.5, z, 110, 24, '#ffeccb')
    // Night Watch spot
    const sp = new THREE.SpotLight('#fff0d8', 520, 24, 0.5, 0.65, 2)
    sp.position.set(0, 17, z0 + 10)
    sp.target.position.set(0, 10.6, z0)
    root.add(sp, sp.target)
    w.lamps.push({ light: sp, base: 520 })
    // low barrier + bench before the Night Watch
    const bz = z0 + 3.6
    for (const x of [-3, -1, 1, 3]) {
      cylinder(b, m.gold, 0.03, 0.05, 0.9, x, 8.0, bz, 8)
      sphere(b, m.gold, 0.06, x, 8.93, bz, 1, 1, 1, 8)
    }
    box(b, m.velvet, 6, 0.04, 0.04, 0, 8.78, bz)
    box(b, m.velvet, 6, 0.04, 0.04, 0, 8.55, bz)
    col(-3.2, 3.2, bz - 0.15, bz + 0.15, 7, 40)
    // benches
    for (const z of [-26, -14, -2, 8]) {
      box(b, m.velvet, 2.6, 0.2, 0.9, 0, 8.35, z)
      box(b, m.woodDark, 2.6, 0.35, 0.9, 0, 8.0, z)
      col(-1.3, 1.3, z - 0.45, z + 0.45, 7, 9)
    }
    // gallery colliders (end walls)
    col(-a, a, z0 - 1, z0, 7, 40)
    col(-a, a, z1, z1 + 1, 7, 40)
    surf(-a, a, z0, z1, C.L1)
  }

  /* ================================================================ paintings */
  const art = opts.art
  const paintings: { id: string; x: number; z: number; face: 'E' | 'W' | 'N'; width: number; cy: number }[] = [
    { id: 'nightwatch', x: 0, z: C.GZ0, face: 'N', width: 4.37, cy: 10.55 },
    { id: 'milkmaid', x: C.PW, z: -26.5, face: 'E', width: 1.0, cy: 9.75 },
    { id: 'bride', x: C.PW, z: -16, face: 'E', width: 2.5, cy: 9.9 },
    { id: 'street', x: C.PW, z: 9.5, face: 'E', width: 1.1, cy: 9.75 },
    { id: 'avercamp', x: -C.PW, z: -26.5, face: 'W', width: 2.4, cy: 9.8 },
    { id: 'merry', x: -C.PW, z: -16, face: 'W', width: 1.0, cy: 9.8 },
    { id: 'paul', x: -C.PW, z: 9.5, face: 'W', width: 1.1, cy: 9.8 },
  ]
  const frameGroup = new THREE.Group()
  root.add(frameGroup)
  for (const p of paintings) {
    const piece = art[p.id]
    if (!piece) continue
    const W = p.width, H = W / piece.aspect
    const bd = p.id === 'nightwatch' ? 0.2 : 0.13
    const ry = p.face === 'N' ? 0 : p.face === 'E' ? -PI / 2 : PI / 2
    const g = new THREE.Group()
    g.position.set(p.face === 'E' ? p.x - 0.05 : p.face === 'W' ? p.x + 0.05 : p.x, p.cy, p.face === 'N' ? p.z + 0.2 : p.z)
    g.rotation.y = ry
    // canvas
    const cm = new THREE.MeshStandardMaterial({ map: piece.tex, roughness: 0.65, emissive: '#ffffff', emissiveMap: piece.tex, emissiveIntensity: 0.22 })
    const cv = new THREE.Mesh(new THREE.PlaneGeometry(W, H), cm)
    cv.receiveShadow = true
    g.add(cv)
    // gilt frame (4 bars + inner liner)
    const bar = (bw: number, bh: number, x: number, y: number, mat: THREE.Material, dz = 0.03) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 0.1), mat)
      mesh.position.set(x, y, dz)
      mesh.castShadow = true
      g.add(mesh)
    }
    bar(W + bd * 2, bd, 0, H / 2 + bd / 2, m.frameGold)
    bar(W + bd * 2, bd, 0, -H / 2 - bd / 2, m.frameGold)
    bar(bd, H, -W / 2 - bd / 2, 0, m.frameGold)
    bar(bd, H, W / 2 + bd / 2, 0, m.frameGold)
    bar(W + 0.04, 0.03, 0, H / 2 - 0.015, m.black, 0.045)
    bar(W + 0.04, 0.03, 0, -H / 2 + 0.015, m.black, 0.045)
    bar(0.03, H, -W / 2 + 0.015, 0, m.black, 0.045)
    bar(0.03, H, W / 2 - 0.015, 0, m.black, 0.045)
    // picture light
    const lb = new THREE.Mesh(new THREE.BoxGeometry(Math.min(W * 0.6, 1.6), 0.04, 0.08), m.lamp)
    lb.position.set(0, H / 2 + bd + 0.12, 0.12)
    g.add(lb)
    // plaque
    const pc = document.createElement('canvas')
    pc.width = 512; pc.height = 160
    const px = pc.getContext('2d')!
    px.fillStyle = '#e9e5da'; px.fillRect(0, 0, 512, 160)
    px.fillStyle = '#1b1b1b'
    px.font = 'bold 40px Georgia, serif'
    px.fillText(piece.title.length > 28 ? piece.title.slice(0, 27) + '…' : piece.title, 20, 62)
    px.font = '32px Georgia, serif'
    px.fillText(piece.artist, 20, 108)
    px.fillStyle = '#555'
    px.fillText(piece.year, 20, 146)
    const pt = new THREE.CanvasTexture(pc)
    pt.colorSpace = THREE.SRGBColorSpace
    pt.anisotropy = 8
    const plaque = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.13), new THREE.MeshStandardMaterial({ map: pt, roughness: 0.6 }))
    plaque.position.set(W / 2 + bd + 0.42, -H / 2 + 0.1, 0.03)
    if (p.id === 'nightwatch') plaque.position.set(W / 2 + bd + 0.55, -H / 2 + 0.2, 0.03)
    g.add(plaque)
    frameGroup.add(g)
  }

  /* ================================================================ one side (E; mirrored for W) */
  const side = (s: number) => {
    /* ---- passage wall */
    {
      const F = new Facade(b, -PI / 2, -C.PW, 1)
      const tunnel: Opening = { u: 0, w: 2 * C.DOOR, y0: 0, y1: 4.5, kind: 'rect' }
      F.wall(m.brick, -52, 52, 0, 4.7, [tunnel])
      for (const [u0, u1] of [[-52, -C.DOOR - 0.2], [C.DOOR + 0.2, 52]]) {
        F.box(m.stone, u1 - u0, 1.1, 0.3, (u0 + u1) / 2, 0, 0.1)
        F.box(m.stone, u1 - u0, 0.35, 0.34, (u0 + u1) / 2, 4.2, 0.1)
      }
      F.box(m.stone, 2 * C.DOOR + 0.9, 0.45, 0.5, 0, 4.5, 0.14)
      F.surround(m.stone, tunnel, 0.35, 0.18)
      for (let z = -42; z <= 42; z += 6) if (Math.abs(z) > C.DOOR + 0.8) F.box(m.stone, 0.62, 4.3, 0.34, z, 0, 0.1)
    }
    /* ---- gallery side wall */
    {
      const F = new Facade(b, -PI / 2, -C.PW, 1)
      const door = arch(0, 8.0, 12.8, 2 * C.DOOR)
      F.wall(m.wallGallery, C.GZ0, C.GZ1, 8, 14, [door])
      F.surround(m.stone, door, 0.35, 0.2)
      F.box(m.stone, C.GZ1 - C.GZ0, 0.4, 0.4, (C.GZ0 + C.GZ1) / 2, 13.55, 0.12)
      for (const [u0, u1] of [[C.GZ0, -C.DOOR - 0.4], [C.DOOR + 0.4, C.GZ1]]) {
        F.box(m.woodDark, u1 - u0, 1.1, 0.14, (u0 + u1) / 2, 8.0, 0.05)
        F.box(m.stone, u1 - u0, 0.1, 0.22, (u0 + u1) / 2, 9.1, 0.07)
      }
      for (const z of [-32, -21, -11, 6.5, 12.5]) F.box(m.stone, 0.5, 5.4, 0.16, z, 8.1, 0.06)
    }

    /* ---- atrium: x 8..40, z -17..17 */
    boxMM(b, m.floor, C.AX0, C.AX1, -0.25, 0.012, -C.AZ, C.AZ)
    boxMM(b, m.floor, C.PW, C.AX0, -0.25, 0.012, -C.DOOR, C.DOOR)
    boxMM(b, m.floor, C.PW, C.AX0, 7.0, 8.0, -C.DOOR, C.DOOR)
    // floor inlay
    boxMM(b, m.floorDark, 16, 32, 0.012, 0.02, -8, 8)
    boxMM(b, m.floor, 17.2, 30.8, 0.02, 0.026, -6.8, 6.8)

    const bayU = (n: number, pitch: number, offset = 0) => Array.from({ length: n }, (_, k) => offset + (k - (n - 1) / 2) * pitch)
    const doors = (F: Facade, us: number[]) => {
      for (const u of us) {
        const o = arch(u, 0, 5.4, 2.6)
        F.pane(m.door, o, 0.45)
        F.surround(m.stone, o, 0.3, 0.16)
      }
    }
    const upper = (F: Facade, us: number[]) => {
      for (const u of us) F.window(winLit, arch(u, 9.4, 15.2, 2.4), { surround: 0.3, mullions: 1, transom: 0.55 })
    }
    const trim = (F: Facade, u0: number, u1: number) => {
      const L = u1 - u0, uc = (u0 + u1) / 2
      F.box(m.stone, L, 0.4, 0.3, uc, 7.4, 0.1)
      F.box(m.stone, L, 0.45, 0.45, uc, 16.55, 0.16)
      F.box(m.ornament, L, 0.9, 0.05, uc, 15.6, 0.03)
      F.box(m.stone, L, 0.9, 0.12, uc, 0, 0.05)
    }
    // east wall (x=40)
    {
      const F = new Facade(b, -PI / 2, -C.AX1, 1)
      const us = bayU(7, 4.4)
      F.wall(m.brick, -C.AZ, C.AZ, 0, 7.6, us.map((u) => arch(u, 0, 5.4, 2.6)))
      F.wall(m.wallCream, -C.AZ, C.AZ, 7.6, 17, us.map((u) => arch(u, 9.4, 15.2, 2.4)))
      doors(F, us); upper(F, us); trim(F, -C.AZ, C.AZ)
    }
    // north wall (z=-17, faces +z)
    {
      const F = new Facade(b, 0, -C.AZ, 1)
      const us = bayU(7, 4.4, 24)
      F.wall(m.brick, C.AX0, C.AX1 + 1, 0, 7.6, us.map((u) => arch(u, 0, 5.4, 2.6)))
      F.wall(m.wallCream, C.AX0, C.AX1 + 1, 7.6, 17, us.map((u) => arch(u, 9.4, 15.2, 2.4)))
      doors(F, us); upper(F, us); trim(F, C.AX0, C.AX1)
    }
    // south wall (z=17, faces -z); local u = -x
    {
      const F = new Facade(b, PI, -C.AZ, 1)
      const us = bayU(7, 4.4, -24)
      F.wall(m.brick, -C.AX1 - 1, -C.AX0, 0, 7.6, us.map((u) => arch(u, 0, 5.4, 2.6)))
      F.wall(m.wallCream, -C.AX1 - 1, -C.AX0, 7.6, 17, us.map((u) => arch(u, 9.4, 15.2, 2.4)))
      doors(F, us); upper(F, us); trim(F, -C.AX1, -C.AX0)
    }
    // passage-side wall (x=8, faces +x); local u = -z
    {
      const F = new Facade(b, PI / 2, C.AX0, 1.5)
      const tun: Opening = { u: 0, w: 2 * C.DOOR, y0: 0, y1: 5.6, kind: 'ellipse', rise: 1.2 }
      const door = arch(0, 8.0, 12.8, 2 * C.DOOR)
      const us = [-15, -11.3, -7.6, 7.6, 11.3, 15]
      F.wall(m.brick, -C.AZ, C.AZ, 0, 7.6, [tun, ...us.map((u) => arch(u, 0, 5.4, 2.6))])
      F.wall(m.wallCream, -C.AZ, C.AZ, 7.6, 17, [door, ...us.map((u) => arch(u, 9.4, 15.2, 2.4))])
      doors(F, us); upper(F, us); trim(F, -C.AZ, C.AZ)
      F.surround(m.stone, tun, 0.35, 0.2)
      F.surround(m.stone, door, 0.35, 0.2)
    }

    /* ---- mezzanine ring */
    const slab = (x0: number, x1: number, z0: number, z1: number) => {
      boxMM(b, m.floor, x0, x1, 7.55, 8.0, z0, z1)
      surf(x0, x1, z0, z1, 8, s)
    }
    slab(C.AX0, 12, -C.AZ, C.AZ)
    slab(12, C.AX1, -C.AZ, -13)
    slab(12, C.AX1, 13, C.AZ)
    slab(36, C.AX1, -13, -1)
    // edge fascia
    boxMM(b, m.steelLight, 11.9, 12, 7.45, 8.0, -13, 13)
    boxMM(b, m.steelLight, 12, 36, 7.45, 8.0, 12.9, 13)
    boxMM(b, m.steelLight, 12, 36, 7.45, 8.0, -13, -12.9)
    boxMM(b, m.steelLight, 35.9, 36, 7.45, 8.0, -13, -1)
    // columns under the ring edge
    const colPos: [number, number][] = []
    for (let z = -13; z <= 13.01; z += 4.333) colPos.push([12, z])
    for (const z of [-13, 13]) for (let x = 16.8; x <= 36.01; x += 4.8) colPos.push([x, z])
    for (const z of [-9, -5, -1]) colPos.push([36, z])
    for (const [x, z] of colPos) {
      cylinder(b, m.stone, 0.3, 0.3, 7.0, x, 0.0, z, 16)
      box(b, m.stone, 0.8, 0.25, 0.8, x, 0.0, z)
      box(b, m.stone, 0.8, 0.3, 0.8, x, 7.25, z)
      col(x - 0.34, x + 0.34, z - 0.34, z + 0.34, 0, 7.55, s)
    }
    // balustrades (steel + glass)
    const rail = (x0: number, z0: number, x1: number, z1: number, y: number) => {
      const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0)
      const L = alongX ? Math.abs(x1 - x0) : Math.abs(z1 - z0)
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2
      if (alongX) {
        box(b, m.steelLight, L, 0.06, 0.09, cx, y + 1.0, cz)
        b.add(m.glassRoof, new THREE.BoxGeometry(L, 0.9, 0.025).translate(cx, y + 0.5, cz))
      } else {
        box(b, m.steelLight, 0.09, 0.06, L, cx, y + 1.0, cz)
        b.add(m.glassRoof, new THREE.BoxGeometry(0.025, 0.9, L).translate(cx, y + 0.5, cz))
      }
      const n = Math.max(1, Math.round(L / 1.6))
      for (let i = 0; i <= n; i++) {
        const t = i / n
        box(b, m.steelLight, 0.07, 1.0, 0.07, x0 + (x1 - x0) * t, y, z0 + (z1 - z0) * t)
      }
    }
    rail(12, -13, 12, 13, 8.0)
    rail(12, 13, 36, 13, 8.0)
    rail(12, -13, 36, -13, 8.0)
    rail(36, -13, 36, -1, 8.0)
    rail(36, -1, 40, -1, 8.0)
    col(11.9, 12.1, -13, 13, 8, 9.5, s)
    col(12, 36, 12.9, 13.1, 8, 9.5, s)
    col(12, 36, -13.1, -12.9, 8, 9.5, s)
    col(35.9, 36.1, -13, -1, 8, 9.5, s)
    col(36, 40, -1.1, -0.9, 8, 9.5, s)

    /* ---- stair (x 36..40, z -1..13) rising to the first floor */
    {
      const n = 45, tread = (C.STAIR_Z1 - C.STAIR_Z0) / n
      for (let k = 0; k < n; k++) {
        const z0 = C.STAIR_Z0 + k * tread
        const top = (k + 1) * C.RISER
        boxMM(b, m.floor, 36, 40, top - 0.2 < 0 ? -0.2 : top - 0.22, top, z0, z0 + tread + 0.002)
        // riser shadow / body
        boxMM(b, m.stone, 36, 40, 0, top - 0.2, z0, z0 + tread)
      }
      // stringer + rails
      const ang = Math.atan2(8, 14)
      const len = Math.hypot(14, 8)
      for (const [xr, mat] of [[36, m.steelLight], [39.95, m.steelLight]] as [number, THREE.Material][]) {
        const r = new THREE.BoxGeometry(0.09, 0.06, len)
        r.rotateX(-ang)
        r.translate(xr, 1.0 + 4, 6)
        b.add(mat, r)
        const gl = new THREE.BoxGeometry(0.025, 0.9, len)
        gl.rotateX(-ang)
        gl.translate(xr, 0.5 + 4, 6)
        b.add(m.glassRoof, gl)
        for (let i = 0; i <= 9; i++) {
          const t = i / 9
          box(b, m.steelLight, 0.07, 1.0, 0.07, xr, C.RISER + 8 * t - 0.1 * 0, -1 + 14 * t)
        }
      }
      col(35.9, 36.1, -1, 13, 0, 9.5, s)
      col(36, 40, 12.9, 13.1, 0, 7.9, s)
      surf(36, 40, -1, 13, (_x, z) => Math.min(8, (Math.floor((z - C.STAIR_Z0) / tread) + 1) * C.RISER), s)
    }
    // bridge to the Gallery
    surf(C.PW, C.AX0, -C.DOOR, C.DOOR, 8, s)

    /* ---- steel & glass roof */
    {
      const span = 32.6, rise = 6.5, len = 34.6
      const { slopes, ends } = gablePrism(len, span, rise)
      for (const g of [slopes, ends]) { g.rotateY(PI / 2); g.translate(24, 17, 0) }
      b.add(m.glassRoof, slopes)
      b.add(m.glassRoof, ends)
      const ang = Math.atan2(rise, span / 2)
      const rl = Math.hypot(span / 2, rise)
      for (let k = 0; k < 9; k++) {
        const z = -C.AZ + 0.2 + k * (2 * C.AZ - 0.4) / 8
        for (const sg of [-1, 1]) {
          const r = new THREE.BoxGeometry(rl, 0.42, 0.16)
          r.rotateZ(sg * ang)
          r.translate(24 - sg * (span / 4), 17 + rise / 2 + 0.02, z)
          b.add(m.steel, r)
        }
        box(b, m.steel, span, 0.1, 0.1, 24, 17.2, z)
        box(b, m.steel, 0.07, rise, 0.07, 24, 17.2, z)
        for (const sg of [-1, 1]) for (const t of [0.35, 0.7]) {
          const x = 24 - sg * (span / 2) * (1 - t)
          box(b, m.steel, 0.05, rise * t, 0.05, x, 17.2, z)
        }
      }
      for (const sg of [-1, 1]) for (const t of [0.33, 0.66]) box(b, m.steel, 0.14, 0.14, len, 24 - sg * (span / 2) * (1 - t), 17 + rise * t, 0)
      box(b, m.steel, 0.2, 0.2, len, 24, 17 + rise - 0.02, 0)
    }

    /* ---- atrium furniture */
    // pendant rings
    addLamp(s * 24, 12.2, 0, 90, 40)
    for (const z of [-8, 8]) {
      const tor = new THREE.TorusGeometry(1.5, 0.06, 8, 40)
      tor.rotateX(PI / 2)
      tor.translate(24, 13.4, z)
      b.add(m.lamp, tor)
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2
        cylinder(b, m.steel, 0.01, 0.01, 3.9, 24 + Math.cos(a) * 1.5, 13.4, z + Math.sin(a) * 1.5, 4)
      }
    }
    // benches
    for (const [x, z] of [[17, -8], [17, 8], [31, -8], [31, 8]]) {
      box(b, m.woodMid, 3.0, 0.1, 0.55, x, 0.42, z)
      box(b, m.steel, 0.08, 0.42, 0.45, x - 1.3, 0.0, z)
      box(b, m.steel, 0.08, 0.42, 0.45, x + 1.3, 0.0, z)
      col(x - 1.5, x + 1.5, z - 0.28, z + 0.28, 0, 1.2, s)
    }
    // info desk
    box(b, m.woodDark, 5.0, 1.1, 1.0, 24, 0.0, -12)
    box(b, m.stone, 5.2, 0.08, 1.2, 24, 1.1, -12)
    boxMM(b, m.lamp, 21.8, 26.2, 1.8, 1.86, -12.2, -11.8)
    col(21.4, 26.6, -12.7, -11.3, 0, 1.3, s)
    // planters with small trees
    for (const [x, z] of [[14, -14], [14, 14], [34, -11], [34, 11]]) {
      cylinder(b, m.stone, 0.62, 0.5, 0.8, x, 0, z, 16)
      cylinder(b, m.bark, 0.08, 0.12, 1.8, x, 0.8, z, 8)
      sphere(b, m.hedge, 0.9, x, 3.0, z, 1, 1.05, 1, 10)
      sphere(b, m.hedge, 0.65, x + 0.5, 2.4, z + 0.3, 1, 1, 1, 10)
      sphere(b, m.hedge, 0.6, x - 0.45, 2.5, z - 0.3, 1, 1, 1, 10)
      col(x - 0.6, x + 0.6, z - 0.6, z + 0.6, 0, 3, s)
    }
  }

  for (const s of [1, -1]) {
    b.setMirror(s < 0)
    side(s)
  }
  b.setMirror(false)
  b.build(root)
}

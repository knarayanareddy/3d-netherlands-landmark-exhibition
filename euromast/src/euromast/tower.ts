import * as THREE from 'three'
import { Bucket, V, beam, box, cyl, lathe, ring, sphere, torus, tube } from './kit'
import { M, glowing, tiled } from './materials'
import { barkTile, labelTex, shaftConcrete } from './textures'
import { TAU } from './util'

/** All dimensions in metres, 1 unit = 1 m. The tower stands at the origin. */
export const T = {
  shaftTop: 85,
  shaftR0: 5.7,
  shaftR1: 4.9,
  nestR: 14.3,
  floorY: 92.5,
  ceilY: 95.5,
  terraceY: 96.1,
  coreR: 5.2,
  platY: 100.3,
  platR: 6.3,
  mastTop: 185,
  lobbyR: 13.0,
  lobbyH: 4.4,
  railR: 15.05,
  euroMin: 101.0,
  euroMax: 178.5,
  euroR: 3.6,
  euroInner: 2.15,
  stairX0: 6.3,
  stairX1: 12.8,
}
export const shaftR = (y: number) => T.shaftR0 - (T.shaftR0 - T.shaftR1) * Math.pow(Math.min(1, y / T.shaftTop), 1.1)

export interface TowerBuild {
  group: THREE.Group
  capsule: THREE.Group
  beacons: THREE.Mesh[]
  update(t: number, dt: number): void
  lights: THREE.Object3D[]
}

export function buildTower(): TowerBuild {
  const g = new THREE.Group()
  const B = new Bucket()
  const beacons: THREE.Mesh[] = []

  /* ---------------- shaft ---------------- */
  {
    const circ = Math.PI * 2 * 5.3
    const tex = shaftConcrete(T.shaftTop, circ)
    // night uplighting gradient (strong at the base, fading with height)
    const c = document.createElement('canvas')
    c.width = 4
    c.height = 256
    const cg = c.getContext('2d')!
    const gr = cg.createLinearGradient(0, 256, 0, 0)
    gr.addColorStop(0, '#fff')
    gr.addColorStop(0.18, '#9a8f80')
    gr.addColorStop(0.6, '#2c2824')
    gr.addColorStop(1, '#000')
    cg.fillStyle = gr
    cg.fillRect(0, 0, 4, 256)
    const em = new THREE.CanvasTexture(c)
    em.colorSpace = THREE.SRGBColorSpace
    const mat = new THREE.MeshStandardMaterial({ map: tex.map, normalMap: tex.normalMap, normalScale: new THREE.Vector2(0.9, 0.9), roughness: 0.93, emissive: new THREE.Color('#ffd9a0'), emissiveMap: em })
    glowing(mat, 0.55)
    const pts: [number, number][] = []
    for (let y = 0; y <= T.shaftTop; y += 1) pts.push([shaftR(y), y])
    const geo = lathe(pts, 96, 1, 1)
    const m = new THREE.Mesh(geo, mat)
    m.castShadow = m.receiveShadow = true
    g.add(m)
  }

  /* ---------------- crow's nest ---------------- */
  {
    // concrete bowl: convex underside sweeping up from the shaft to the rim
    const pts: [number, number][] = []
    const N = 28
    for (let i = 0; i <= N; i++) {
      const s = i / N
      const r = T.shaftR1 - 0.02 + (T.nestR - T.shaftR1 + 0.02) * s
      const y = T.shaftTop + (T.floorY - T.shaftTop) * Math.pow(s, 1.75)
      pts.push([r, y])
    }
    // rim fascia
    pts.push([T.nestR + 0.02, T.floorY + 0.08])
    const bowl = new THREE.Mesh(lathe(pts, 96, 14, 3), M.concreteLathe(14, 3, 'bowl'))
    bowl.castShadow = bowl.receiveShadow = true
    g.add(bowl)

    // glazed band, leaning outward
    const glassH = T.ceilY - T.floorY - 0.1
    const rB = T.nestR + 0.02
    const rT = T.nestR + 0.62
    const gy = T.floorY + 0.1
    const glassGeo = new THREE.CylinderGeometry(rT, rB, glassH, 96, 1, true)
    const glassM = new THREE.Mesh(glassGeo, M.glassNest())
    glassM.position.y = gy + glassH / 2
    glassM.renderOrder = 4
    g.add(glassM)
    // white spandrel band at the foot of the glazing
    const spand = new THREE.Mesh(new THREE.CylinderGeometry(rB + 0.06, rB, 0.55, 96, 1, true), M.whitePaint())
    spand.material = M.whitePaint().clone()
    ;(spand.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide
    spand.position.y = gy + 0.275
    g.add(spand)
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * TAU
      const c0 = V(Math.sin(a) * rB, gy, Math.cos(a) * rB)
      const c1 = V(Math.sin(a) * rT, gy + glassH, Math.cos(a) * rT)
      tube(B, M.darkSteel(), c0, c1, 0.03, 6)
    }
    torus(B, M.frame(), rB + 0.02, 0.05, gy + 0.6, 96)
    torus(B, M.frame(), (rB + rT) / 2 + 0.02, 0.04, gy + glassH * 0.5 + 0.2, 96)
    torus(B, M.frame(), rT + 0.01, 0.06, gy + glassH, 96)

    // white roof fascia & soffit
    const fascia = new THREE.Mesh(new THREE.CylinderGeometry(T.nestR + 1.25, rT, T.terraceY - T.ceilY, 96, 1, true), M.whitePaint().clone())
    ;(fascia.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide
    fascia.position.y = (T.terraceY + T.ceilY) / 2
    fascia.castShadow = fascia.receiveShadow = true
    g.add(fascia)
    ring(B, M.darkPaint(), rT, T.nestR + 1.25, T.ceilY, 96, 2, true)

    // terrace deck
    ring(B, M.slab(), T.coreR, T.nestR + 1.25, T.terraceY, 96, 2)

    // balustrade: posts + glass + handrails
    const RR = T.railR
    for (let i = 0; i < 120; i++) {
      const a = (i / 120) * TAU
      tube(B, M.steel(), V(Math.sin(a) * RR, T.terraceY, Math.cos(a) * RR), V(Math.sin(a) * RR, T.terraceY + 1.18, Math.cos(a) * RR), 0.022, 6)
    }
    torus(B, M.steel(), RR, 0.035, T.terraceY + 1.2, 128)
    torus(B, M.steel(), RR, 0.016, T.terraceY + 0.35, 128)
    const bal = new THREE.Mesh(new THREE.CylinderGeometry(RR, RR, 1.12, 120, 1, true), M.glass())
    bal.position.y = T.terraceY + 0.62
    bal.renderOrder = 4
    g.add(bal)
    // outward-leaning anti-climb lip
    ring(B, M.steel(), RR, RR + 0.35, T.terraceY + 1.18, 128, 2)

    // LED halo under the rim at night
    const led = M.coolLed()
    torus(B, led, T.nestR + 1.2, 0.05, T.ceilY - 0.06, 128)
  }

  /* ---------------- terrace core, stairs, platform, vestibule ---------------- */
  {
    // concrete drum
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(T.coreR, T.coreR, T.platY - T.terraceY, 64, 1, true), M.concreteLathe(10, 2, 'drum'))
    drum.position.y = (T.terraceY + T.platY) / 2
    drum.castShadow = drum.receiveShadow = true
    g.add(drum)
    // upper platform (steel deck)
    cyl(B, M.darkSteel(), T.platR, T.platR, 0.3, 0, T.platY - 0.3, 0, 64)
    ring(B, M.slab(), 0.1, T.platR, T.platY + 0.005, 64, 2)
    ring(B, M.darkPaint(), 0.1, T.platR, T.platY - 0.31, 64, 2, true)
    // platform rail with an opening for the stairs
    const gap = 0.2
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * TAU
      const ang = a > Math.PI ? a - TAU : a
      const aa = Math.PI / 2 - a // angle measured from +x
      const aw = Math.atan2(Math.sin(aa), Math.cos(aa))
      if (Math.abs(aw) < gap) continue
      void ang
      const rr = T.platR - 0.12
      tube(B, M.steel(), V(Math.cos(aw) * rr, T.platY, Math.sin(aw) * rr * -1), V(Math.cos(aw) * rr, T.platY + 1.1, Math.sin(aw) * rr * -1), 0.02, 6)
    }
    // helper: arc rails
    const arcRail = (r: number, y: number, rad: number) => {
      const seg = 48
      let prev: THREE.Vector3 | null = null
      for (let i = 0; i <= seg; i++) {
        const aw = -Math.PI + gap + ((i / seg) * (TAU - 2 * gap))
        const p = V(Math.cos(aw) * r, y, -Math.sin(aw) * r)
        if (prev) tube(B, M.steel(), prev, p, rad, 6)
        prev = p
      }
    }
    arcRail(T.platR - 0.12, T.platY + 1.1, 0.03)
    arcRail(T.platR - 0.12, T.platY + 0.55, 0.015)

    // straight steel stair from terrace to platform (along +x, z = 0)
    const steps = 18
    const run = (T.stairX1 - T.stairX0) / steps
    const rise = (T.platY - T.terraceY) / steps
    for (let i = 0; i < steps; i++) {
      const x = T.stairX1 - (i + 0.5) * run
      const y = T.terraceY + (i + 1) * rise
      box(B, M.darkSteel(), run + 0.02, 0.06, 1.45, x, y - 0.06, 0)
      box(B, M.darkPaint(), 0.03, rise, 1.4, x + run / 2 - 0.02, y - rise, 0)
    }
    for (const s of [-1, 1]) {
      tube(B, M.darkSteel(), V(T.stairX1, T.terraceY, s * 0.76), V(T.stairX0, T.platY - 0.05, s * 0.76), 0.05, 6)
      tube(B, M.steel(), V(T.stairX1 + 0.1, T.terraceY + 1.0, s * 0.76), V(T.stairX0 - 0.1, T.platY + 1.0, s * 0.76), 0.03, 6)
      for (let i = 0; i <= 6; i++) {
        const t = i / 6
        const x = T.stairX1 + (T.stairX0 - T.stairX1) * t
        const y = T.terraceY + (T.platY - T.terraceY) * t
        tube(B, M.steel(), V(x, y, s * 0.76), V(x, y + 1.0, s * 0.76), 0.018, 5)
      }
    }
    // Euroscope station housing (dark steel) around the mast foot
    cyl(B, M.darkSteel(), 1.75, 1.85, 5.6, 0, T.platY, 0, 32)
    cyl(B, M.navy(), 1.95, 1.95, 0.25, 0, T.platY + 5.6, 0, 32)
    // pipes (ventilation) beside the housing
    cyl(B, M.steel(), 0.28, 0.28, 8.5, -3.2, T.terraceY, 1.5, 12)
    cyl(B, M.steel(), 0.28, 0.28, 8.5, -3.2 - 0.7, T.terraceY, 1.0, 12)
    // stairwell vestibule (to the restaurant) on the -x side
    box(B, M.whitePaint(), 3.6, 0.2, 3.4, -7.2, T.terraceY + 2.7, 0)
    for (const [x, z] of [[-9, -1.6], [-9, 1.6], [-5.4, -1.6], [-5.4, 1.6]]) tube(B, M.frame(), V(x, T.terraceY, z), V(x, T.terraceY + 2.7, z), 0.05, 6)
    const vg = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.6, 3.2), M.glass())
    vg.position.set(-7.2, T.terraceY + 1.35, 0)
    vg.renderOrder = 4
    g.add(vg)
    // door opening: remove front glass by lowering — represent with dark frame
    box(B, M.frame(), 0.08, 2.5, 1.5, -9.02, T.terraceY, 0)
    box(B, M.lightPanel(), 0.5, 0.05, 0.5, -7.2, T.terraceY + 2.64, 0)
  }

  /* ---------------- mast (Space Tower) ---------------- */
  const capsule = new THREE.Group()
  {
    const pts: [number, number][] = []
    const y0 = T.platY
    for (let y = y0; y <= T.mastTop - 6; y += 2) {
      const t = (y - y0) / (T.mastTop - 6 - y0)
      pts.push([1.5 - 0.52 * t, y])
    }
    const mast = new THREE.Mesh(lathe(pts, 40, 8, 1), M.mast())
    mast.castShadow = mast.receiveShadow = true
    g.add(mast)
    // flanges every 9.5 m
    for (let y = y0 + 6; y < T.mastTop - 8; y += 9.5) {
      const t = (y - y0) / (T.mastTop - 6 - y0)
      cyl(B, M.mast(), 1.5 - 0.52 * t + 0.1, 1.5 - 0.52 * t + 0.1, 0.22, 0, y, 0, 40)
    }
    // dark guide rails for the capsule
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU + 0.5
      for (let y = y0; y < T.mastTop - 9; y += 4) {
        const t = (y - y0 + 2) / (T.mastTop - 6 - y0)
        const r = 1.5 - 0.52 * t + 0.06
        box(B, M.darkSteel(), 0.11, 4.02, 0.11, Math.sin(a) * r, y, Math.cos(a) * r, a)
      }
    }
    // head: wider lamp room with glazed band, cap, antenna
    const hy = T.mastTop - 9
    cyl(B, M.mast(), 1.05, 0.98, 0.9, 0, hy - 0.1, 0, 32)
    cyl(B, M.navy(), 1.2, 1.2, 0.35, 0, hy + 0.8, 0, 32)
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 1.5, 32, 1, true), M.glass())
    lamp.position.y = hy + 1.9
    g.add(lamp)
    cyl(B, M.warmLamp(), 0.9, 0.9, 1.3, 0, hy + 1.25, 0, 24)
    cyl(B, M.mast(), 0.95, 1.2, 0.3, 0, hy + 2.65, 0, 32)
    cyl(B, M.mast(), 0.18, 0.9, 1.4, 0, hy + 2.9, 0, 24)
    cyl(B, M.mast(), 0.06, 0.1, 4.2, 0, hy + 4.2, 0, 8)
    // aviation lights
    const bm = M.redBeacon().clone()
    for (const y of [hy + 8.4, hy + 3.2]) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 8), bm)
      s.position.set(0, y, 0)
      g.add(s)
      beacons.push(s)
    }
    for (const y of [T.mastTop - 55, T.mastTop - 110 + 40]) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), bm)
      const a = 0.9
      s.position.set(Math.sin(a) * 1.3, y, Math.cos(a) * 1.3)
      g.add(s)
      beacons.push(s)
    }
  }

  /* ---------------- Euroscope capsule ---------------- */
  {
    const CB = new Bucket()
    const R = T.euroR
    const Ri = T.euroInner
    const H = 2.95
    // floor ring + fascia
    const prof: [number, number][] = [[Ri, -0.55], [R + 0.1, -0.55], [R + 0.16, -0.2], [R + 0.1, 0.0], [Ri, 0.0]]
    const floorGeo = lathe(prof, 64, 1, 1)
    const floor = new THREE.Mesh(floorGeo, M.navy().clone())
    ;(floor.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide
    floor.castShadow = floor.receiveShadow = true
    capsule.add(floor)
    ring(CB, M.rubber(), Ri, R, 0.01, 64, 1)
    // roof ring
    const roofProf: [number, number][] = [[Ri, H], [R + 0.1, H], [R + 0.16, H + 0.25], [R + 0.1, H + 0.55], [Ri + 0.1, H + 0.6], [Ri, H + 0.3]]
    const roof = new THREE.Mesh(lathe(roofProf, 64, 1, 1), M.whitePaint().clone())
    ;(roof.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide
    roof.castShadow = true
    capsule.add(roof)
    // glass wall
    const gw = new THREE.Mesh(new THREE.CylinderGeometry(R, R, H, 64, 1, true), M.glass())
    gw.position.y = H / 2
    gw.renderOrder = 5
    capsule.add(gw)
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * TAU
      tube(CB, M.frame(), V(Math.sin(a) * R, 0, Math.cos(a) * R), V(Math.sin(a) * R, H, Math.cos(a) * R), 0.04, 6)
    }
    torus(CB, M.steel(), R - 0.05, 0.028, 1.05, 64)
    // inner housing sleeve (hugs the mast station)
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(Ri, Ri, H + 0.3, 48, 1, true), M.whitePaint().clone())
    ;(sleeve.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide
    sleeve.position.y = (H + 0.3) / 2
    capsule.add(sleeve)
    // bench ring
    for (let i = 0; i < 6; i++) {
      const a0 = (i / 6) * TAU + 0.12
      const a1 = a0 + TAU / 6 - 0.4
      for (let k = 0; k < 6; k++) {
        const a = a0 + ((a1 - a0) * k) / 5
        box(CB, M.leather(), 0.5, 0.08, 0.55, Math.sin(a) * (Ri + 0.4), 0.42, Math.cos(a) * (Ri + 0.4), a)
        box(CB, M.darkSteel(), 0.12, 0.42, 0.12, Math.sin(a) * (Ri + 0.4), 0, Math.cos(a) * (Ri + 0.4), a)
      }
    }
    // downlights
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU
      cyl(CB, M.lightPanel(), 0.07, 0.07, 0.03, Math.sin(a) * (R - 0.6), H - 0.03, Math.cos(a) * (R - 0.6), 10)
    }
    CB.build(capsule)
    capsule.position.y = T.euroMin
  }

  /* ---------------- white cantilevered platform (~28 m) ---------------- */
  {
    const py = 27.2
    const sh = new THREE.Shape()
    const w = 4.3
    const x0 = 4.4
    const x1 = 14.2
    sh.moveTo(x0, -w)
    sh.lineTo(x1 - 2, -w)
    sh.absarc(x1 - 2, 0, w, -Math.PI / 2, Math.PI / 2, false)
    sh.lineTo(x0, w)
    sh.lineTo(x0, -w)
    const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.95, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.08, bevelSegments: 2, curveSegments: 24 })
    geo.rotateX(Math.PI / 2)
    geo.translate(0, py + 0.95, 0)
    const wm = new THREE.Mesh(geo, M.whitePaint())
    wm.castShadow = wm.receiveShadow = true
    const pivot = new THREE.Group()
    pivot.rotation.y = -0.62
    pivot.add(wm)
    // deck surface
    const deck = new THREE.ShapeGeometry(sh, 24)
    deck.rotateX(-Math.PI / 2)
    deck.translate(0, py + 1.07, 0)
    const dp = deck.attributes.position
    const duv = deck.attributes.uv
    for (let i = 0; i < duv.count; i++) duv.setXY(i, dp.getX(i) / 2, dp.getZ(i) / 2)
    const dm = new THREE.Mesh(deck, M.slab())
    dm.receiveShadow = true
    pivot.add(dm)
    // railing
    const PB = new Bucket()
    const rp: THREE.Vector3[] = []
    const rrad = w - 0.15
    rp.push(V(x0, py + 1.07, -rrad), V(x1 - 2, py + 1.07, -rrad))
    for (let i = 0; i <= 14; i++) {
      const a = -Math.PI / 2 + (i / 14) * Math.PI
      rp.push(V(x1 - 2 + Math.cos(a) * rrad, py + 1.07, Math.sin(a) * rrad))
    }
    rp.push(V(x0, py + 1.07, rrad))
    for (let i = 0; i < rp.length - 1; i++) {
      const a = rp[i]
      const c = rp[i + 1]
      tube(PB, M.steel(), a.clone().setY(py + 2.15), c.clone().setY(py + 2.15), 0.035, 6)
      tube(PB, M.steel(), a.clone().setY(py + 1.5), c.clone().setY(py + 1.5), 0.015, 5)
      tube(PB, M.steel(), a, a.clone().setY(py + 2.15), 0.022, 6)
    }
    PB.build(pivot)
    const gl = new THREE.Mesh(
      new THREE.ExtrudeGeometry(
        (() => {
          const s = new THREE.Shape()
          s.moveTo(x0, -rrad)
          s.lineTo(x1 - 2, -rrad)
          s.absarc(x1 - 2, 0, rrad, -Math.PI / 2, Math.PI / 2, false)
          s.lineTo(x0, rrad)
          return s
        })(),
        { depth: 0.01, bevelEnabled: false, curveSegments: 24 },
      ),
      M.glass(),
    )
    void gl
    const gpts: THREE.Vector2[] = []
    void gpts
    // glass fence as thin tube band
    const fencePts = rp.map((p) => new THREE.Vector3(p.x, 0, p.z))
    const fenceGeo = new THREE.BufferGeometry()
    const verts: number[] = []
    for (let i = 0; i < fencePts.length - 1; i++) {
      const a = fencePts[i]
      const c = fencePts[i + 1]
      verts.push(a.x, py + 1.2, a.z, c.x, py + 1.2, c.z, c.x, py + 2.1, c.z, a.x, py + 1.2, a.z, c.x, py + 2.1, c.z, a.x, py + 2.1, a.z)
    }
    fenceGeo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
    fenceGeo.computeVertexNormals()
    const fence = new THREE.Mesh(fenceGeo, M.glass())
    fence.renderOrder = 4
    pivot.add(fence)
    // struts back to the shaft
    for (const s of [-1, 1]) {
      const a = V(shaftR(py - 6) - 0.2, py - 7, s * 2.4)
      const c = V(x1 - 3.5, py + 0.1, s * 2.8)
      tube(PB, M.whitePaint(), a, c, 0.2, 8)
    }
    PB.build(pivot)
    g.add(pivot)
  }

  /* ---------------- low entrance pavilion (lobby) ---------------- */
  const lobbyLights: THREE.Object3D[] = []
  {
    const LR = T.lobbyR
    const LH = T.lobbyH
    const gapHalf = 0.17
    // floor
    ring(B, M.slab(), 0.1, LR + 1.2, 0.03, 64, 2)
    // glazing with entrance gap at +z
    const gl = new THREE.Mesh(new THREE.CylinderGeometry(LR, LR, LH - 0.5, 96, 1, true, gapHalf, TAU - 2 * gapHalf), M.glass())
    gl.position.y = 0.5 + (LH - 0.5) / 2
    gl.renderOrder = 4
    g.add(gl)
    cyl(B, M.concrete(), LR + 0.05, LR + 0.05, 0.5, 0, 0, 0, 96, true, [14, 0.3], gapHalf, TAU - 2 * gapHalf)
    for (let i = 0; i < 90; i++) {
      const a = (i / 90) * TAU
      const ad = Math.atan2(Math.sin(a), Math.cos(a))
      void ad
      const th = a
      const dist = Math.min(th, TAU - th)
      if (dist < gapHalf - 0.02) continue
      tube(B, M.frame(), V(Math.sin(a) * LR, 0.5, Math.cos(a) * LR), V(Math.sin(a) * LR, LH, Math.cos(a) * LR), 0.04, 6)
    }
    // door frame uprights
    for (const s of [-1, 1]) {
      const a = s * gapHalf
      tube(B, M.steel(), V(Math.sin(a) * LR, 0, Math.cos(a) * LR), V(Math.sin(a) * LR, LH, Math.cos(a) * LR), 0.07, 8)
    }
    // roof slab (cantilevers beyond the glass) with fascia
    cyl(B, M.concrete(), LR + 1.3, LR + 1.3, 0.5, 0, LH, 0, 96, false, [16, 0.4])
    ring(B, M.slab(), 5.4, LR + 1.3, LH + 0.5, 96, 2)
    // canopy over the entrance
    box(B, M.whitePaint(), 7.6, 0.4, 7.0, 0, LH, LR + 4.0)
    box(B, M.concrete(), 7.6, 0.06, 7.0, 0, LH + 0.4, LR + 4.0)
    for (const x of [-3.2, 3.2]) cyl(B, M.whitePaint(), 0.16, 0.16, LH, x, 0, LR + 7.0, 16)
    // approach slab under the canopy
    box(B, M.slab(), 7.6, 0.06, 7.0, 0, 0, LR + 4.0)
    // interior columns
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU + 0.26
      cyl(B, M.concrete(), 0.22, 0.22, LH, Math.sin(a) * 9.6, 0, Math.cos(a) * 9.6, 16)
    }
    // interior ceiling light rings
    for (const r of [7.2, 10.8]) torus(B, M.lightPanel(), r, 0.07, LH - 0.06, 96)
    // lift doors on the shaft face (+z)
    const lz = shaftR(1.2) + 0.03
    box(B, M.steel(), 2.7, 2.65, 0.1, 0, 0.0, lz - 0.01)
    box(B, M.steel(), 1.08, 2.25, 0.04, -0.57, 0.05, lz + 0.07)
    box(B, M.steel(), 1.08, 2.25, 0.04, 0.57, 0.05, lz + 0.07)
    box(B, M.frame(), 0.03, 2.25, 0.05, 0, 0.05, lz + 0.075)
    box(B, M.lightPanel(), 0.8, 0.12, 0.05, 0, 2.5, lz + 0.09)
    // timber cladding either side of the lifts
    for (const s of [-1, 1]) box(B, M.wood(2), 1.6, 3.4, 0.08, s * 2.2, 0.1, lz - 0.02)
    // signage on the canopy
    const signTexture = labelTex('EUROMAST', { w: 1536, h: 230, bg: '#f4f3ee', fg: '#c1272d', font: '700 150px "Helvetica Neue", Arial, sans-serif' })
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(6.0, 0.9), glowing(new THREE.MeshStandardMaterial({ map: signTexture, roughness: 0.5, emissive: new THREE.Color('#ffffff'), emissiveMap: signTexture }), 0.7))
    sign.position.set(0, LH - 0.55, LR + 7.55)
    g.add(sign)
    const sub = new THREE.Mesh(new THREE.PlaneGeometry(4.8, 0.55), new THREE.MeshStandardMaterial({ map: labelTex('Euroscope  ·  185 m', { w: 1536, h: 176, bg: '#17212e', fg: '#e8e6df', font: '500 96px "Helvetica Neue", Arial, sans-serif' }), roughness: 0.5 }))
    sub.position.set(0, LH - 1.33, LR + 7.55)
    g.add(sub)
    // reception counters
    for (const s of [-1, 1]) {
      box(B, M.wood(1.5), 3.4, 1.05, 0.9, s * 7.4, 0.03, 7.4, -s * 0.7)
      box(B, M.slab(), 3.5, 0.05, 1.0, s * 7.4, 1.08, 7.4, -s * 0.7)
    }
    // benches and planters
    for (const s of [-1, 1]) {
      box(B, M.wood(1.5), 2.2, 0.08, 0.6, s * 9.0, 0.45, -3.0, s * 1.2)
      cyl(B, M.concrete(), 0.5, 0.45, 0.7, s * 4.1, 0.03, 10.8, 20)
    }
    // plants in planters (clustered spheres)
    const leaf = new THREE.MeshStandardMaterial({ color: '#3f6b2c', roughness: 0.8 })
    for (const s of [-1, 1]) for (let k = 0; k < 7; k++) sphere(B, leaf, 0.38, s * 4.1 + Math.sin(k * 2.1) * 0.25, 1.1 + (k % 3) * 0.18, 10.8 + Math.cos(k * 2.1) * 0.25, 1, 1.2, 1, 8)
    lobbyLights.push(new THREE.Object3D())
    // entrance wayfinding totems
    for (const s of [-1, 1]) box(B, M.darkPaint(), 0.14, 1.6, 0.5, s * 5.0, 0.03, LR + 6.9)
  }

  /* ---------------- base landscaping: plinth ring and lamps ---------------- */
  {
    // lamp posts around the plaza
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU + 0.15
      const x = Math.sin(a) * 26
      const z = Math.cos(a) * 26
      tube(B, M.darkSteel(), V(x, 0, z), V(x, 5.2, z), 0.06, 8)
      box(B, M.darkSteel(), 0.9, 0.08, 0.3, x, 5.2, z, a)
      box(B, M.warmLamp(), 0.75, 0.04, 0.22, x, 5.16, z, a)
    }
  }

  B.build(g)

  // soft interior/ambient glow lights around the lobby are driven by Experience
  void barkTile
  void tiled

  return {
    group: g,
    capsule,
    beacons,
    lights: lobbyLights,
    update(t: number) {
      const on = Math.sin(t * 2.4) > 0.2
      for (const b of beacons) (b.material as THREE.MeshStandardMaterial).emissiveIntensity = on ? 4 : 0.4
    },
  }
}

// keep beam export referenced (used by other modules)
export { beam }

import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { Bed, Box, CAFE, GATE, MILL, PAVILION, Prop, groundHeight } from './layout'
import { TexSet } from './textures'
import { TAU, rng } from './util'

/* ---------------------------------------------------------------- colliders & walk surfaces */
/** Straight stair running west along the east side of the mill, from ground (x0) up to the gallery deck (x1). */
export const STAIR = { z: MILL.z, w: 1.5, x0: MILL.x + 14.2, x1: MILL.x + 5.7 }
export const DECK_Y = MILL.galleryY + 0.12 // relative to the mill's base height
export const colBoxes: Box[] = []
export const colCircles: [number, number, number][] = []

/* ---------------------------------------------------------------- merge helper */
export class Batch {
  private m = new Map<THREE.Material, THREE.BufferGeometry[]>()
  add(mat: THREE.Material, g: THREE.BufferGeometry, tile = 0): THREE.BufferGeometry {
    if (!this.m.has(mat)) this.m.set(mat, [])
    if (g.index) g = g.toNonIndexed()
    this.m.get(mat)!.push(g)
    void tile
    return g
  }
  box(mat: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number, ry = 0, rx = 0, rz = 0, tile = 1.6) {
    const g = new THREE.BoxGeometry(w, h, d)
    // world-space-ish UV scaling per face
    const uv = g.attributes.uv
    const dims: [number, number][] = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]]
    for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) uv.setXY(f * 4 + i, uv.getX(f * 4 + i) * (dims[f][0] / tile), uv.getY(f * 4 + i) * (dims[f][1] / tile))
    const mtx = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(1, 1, 1))
    g.applyMatrix4(mtx)
    return this.add(mat, g)
  }
  geo(mat: THREE.Material, g: THREE.BufferGeometry, m?: THREE.Matrix4) {
    if (m) g.applyMatrix4(m)
    return this.add(mat, g)
  }
  /** beam between two points */
  beam(mat: THREE.Material, a: THREE.Vector3, b: THREE.Vector3, w: number, d: number) {
    const len = a.distanceTo(b)
    const g = new THREE.BoxGeometry(w, len, d)
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize())
    g.applyMatrix4(new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)))
    return this.add(mat, g)
  }
  build(parent: THREE.Object3D, cast = true, receive = true) {
    for (const [mat, list] of this.m) {
      const merged = mergeGeometries(list, false)
      if (!merged) continue
      const mesh = new THREE.Mesh(merged, mat)
      mesh.castShadow = cast && !(mat as THREE.MeshStandardMaterial).transparent
      mesh.receiveShadow = receive
      parent.add(mesh)
      list.forEach((g) => g.dispose())
    }
  }
}

function scaleUV(g: THREE.BufferGeometry, su: number, sv: number) {
  const uv = g.attributes.uv
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv)
  return g
}

export interface Mats {
  brick: THREE.MeshStandardMaterial
  darkBrick: THREE.MeshStandardMaterial
  wood: THREE.MeshStandardMaterial
  tarWood: THREE.MeshStandardMaterial
  white: THREE.MeshStandardMaterial
  paint: THREE.MeshStandardMaterial
  steel: THREE.MeshStandardMaterial
  dark: THREE.MeshStandardMaterial
  glass: THREE.MeshPhysicalMaterial
  stone: THREE.MeshStandardMaterial
  paver: THREE.MeshStandardMaterial
  soil: THREE.MeshStandardMaterial
}
export function makeMats(tex: TexSet): Mats {
  const tm = (t: { map: THREE.Texture; normal: THREE.Texture }, rough: number, color = 0xffffff) => new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normal, normalScale: new THREE.Vector2(1, 1), roughness: rough, color })
  return {
    brick: tm(tex.brick, 0.92),
    darkBrick: tm(tex.darkBrick, 0.9),
    wood: tm(tex.wood, 0.8),
    tarWood: tm(tex.tarWood, 0.6),
    white: new THREE.MeshStandardMaterial({ color: 0xf0eee8, roughness: 0.55 }),
    paint: new THREE.MeshStandardMaterial({ color: 0xe9e4d8, roughness: 0.7 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x2a2d30, roughness: 0.45, metalness: 0.85 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x1c1f22, roughness: 0.7, metalness: 0.2 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0xcfe4ea, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 1.5 }),
    stone: new THREE.MeshStandardMaterial({ color: 0xbcb6a8, roughness: 0.85 }),
    paver: tm(tex.paver, 0.85),
    soil: new THREE.MeshStandardMaterial({ map: tex.soil.map, normalMap: tex.soil.normal, roughness: 1 }),
  }
}

/* ======================================================================= WINDMILL */
export interface Windmill {
  group: THREE.Group
  update: (dt: number, wind: number) => void
}
export function buildWindmill(M: Mats, tex: TexSet): Windmill {
  const g = new THREE.Group()
  g.position.set(MILL.x, groundHeight(MILL.x, MILL.z), MILL.z)
  const B = new Batch()
  const R0 = MILL.rBase
  const R1 = MILL.rTop
  const H = MILL.h
  const ap = Math.cos(Math.PI / 8)
  // plinth
  const plinth = new THREE.CylinderGeometry((R0 + 0.3) / ap, (R0 + 0.45) / ap, 0.7, 8, 1)
  plinth.rotateY(Math.PI / 8)
  scaleUV(plinth, 6, 0.4)
  B.geo(M.stone, plinth, new THREE.Matrix4().makeTranslation(0, 0.15, 0))
  // tapered octagonal brick tower
  const tower = new THREE.CylinderGeometry(R1 / ap, R0 / ap, H, 8, 1, true)
  tower.rotateY(Math.PI / 8)
  scaleUV(tower, ((R0 + R1) * Math.PI) / 1.9 / 1, H / 1.9)
  B.geo(M.brick, tower.index ? tower.toNonIndexed() : tower, new THREE.Matrix4().makeTranslation(0, H / 2 + 0.4, 0))
  // cornice band
  const band = new THREE.CylinderGeometry((R1 + 0.28) / ap, (R1 + 0.28) / ap, 0.35, 8)
  band.rotateY(Math.PI / 8)
  B.geo(M.stone, band, new THREE.Matrix4().makeTranslation(0, H + 0.55, 0))
  // gallery deck + brackets + railing
  const GY = MILL.galleryY
  const gr = MILL.galleryR
  const deck = new THREE.CylinderGeometry(gr / ap, gr / ap, 0.24, 8)
  deck.rotateY(Math.PI / 8)
  scaleUV(deck, 3, 3)
  B.geo(M.tarWood, deck, new THREE.Matrix4().makeTranslation(0, GY, 0))
  const rail: [number, number][] = []
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * TAU + Math.PI / 8 + 0 // vertex angle
    rail.push([Math.sin(a), Math.cos(a)])
  }
  const rc = (gr - 0.18) / ap
  for (let k = 0; k < 8; k++) {
    const a = rail[k]
    const b = rail[(k + 1) % 8]
    const A = new THREE.Vector3(a[0] * rc, GY + 0.12, a[1] * rc)
    const Bv = new THREE.Vector3(b[0] * rc, GY + 0.12, b[1] * rc)
    const mid = A.clone().add(Bv).multiplyScalar(0.5)
    const isEast = mid.x > rc * 0.8 * ap && Math.abs(mid.z) < 1 // opening for the stair
    for (const hh of [0.5, 0.95]) {
      if (isEast && hh === 0.5) continue
      B.beam(M.tarWood, A.clone().setY(GY + 0.12 + hh), Bv.clone().setY(GY + 0.12 + hh), 0.09, 0.05)
    }
    for (let p = 0; p <= 5; p++) {
      const pp = A.clone().lerp(Bv, p / 5)
      if (isEast && p > 0 && p < 5 && Math.abs(pp.z) < 1.4) continue
      B.box(M.tarWood, 0.07, 1.0, 0.07, pp.x, GY + 0.12 + 0.5, pp.z)
    }
    // brackets
    const bp = A.clone().add(Bv).multiplyScalar(0.5)
    B.beam(M.tarWood, new THREE.Vector3(bp.x * 0.95, GY - 0.1, bp.z * 0.95), new THREE.Vector3(bp.x * 0.72, GY - 1.7, bp.z * 0.72), 0.2, 0.2)
  }
  // windows with white frames
  const glassDark = M.dark
  const winLevels = [2.2, 6.2, 9.4]
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * TAU
    for (const [li, wy] of winLevels.entries()) {
      if (k === 2 && li === 0) continue
      if (k % 2 === 0 && li === 1) continue
      const t = (wy - 0.4) / H
      const rr = (R0 + (R1 - R0) * t) - 0.02
      const x = Math.sin(a) * rr
      const z = Math.cos(a) * rr
      const rot = a
      B.box(M.paint, 0.9, 1.25, 0.12, x, wy + 0.4, z, rot)
      B.box(glassDark, 0.62, 0.95, 0.14, x + Math.sin(a) * 0.03, wy + 0.4, z + Math.cos(a) * 0.03, rot)
      B.box(M.paint, 0.04, 0.95, 0.16, x + Math.sin(a) * 0.05, wy + 0.4, z + Math.cos(a) * 0.05, rot)
    }
  }
  // door at ground level (south side)
  const dr = R0 + 0.0
  B.box(M.paint, 1.4, 2.3, 0.16, 0, 1.55, dr - 0.02)
  B.box(M.tarWood, 1.1, 2.0, 0.2, 0, 1.45, dr + 0.0)
  // cap: tarred dome
  const pts: THREE.Vector2[] = []
  for (let i = 0; i <= 12; i++) {
    const t = (i / 12) * (Math.PI / 2)
    pts.push(new THREE.Vector2(Math.cos(t) * (R1 + 0.5), Math.sin(t) * 2.7))
  }
  pts.push(new THREE.Vector2(0.05, 2.9))
  const cap = new THREE.LatheGeometry(pts, 20)
  scaleUV(cap, 5, 2)
  B.geo(M.tarWood, cap, new THREE.Matrix4().makeTranslation(0, H + 0.75, 0))
  B.box(M.dark, 0.08, 1.0, 0.08, 0, H + 3.9, 0)
  // tail pole + winch (north side)
  const tp0 = new THREE.Vector3(0, H + 0.9, -R1 - 0.4)
  const tp1 = new THREE.Vector3(0, 1.2, -R1 - 10.5)
  B.beam(M.tarWood, tp0, tp1, 0.28, 0.28)
  B.box(M.tarWood, 1.4, 0.15, 0.15, 0, 3.6, -R1 - 6.6)
  B.box(M.tarWood, 0.15, 3.2, 0.15, 0, 2.0, -R1 - 6.6)
  // stair up to the gallery (east side)
  {
    const n = 24
    const run = STAIR.x0 - STAIR.x1
    const gy0 = groundHeight(MILL.x + STAIR.x0 - MILL.x, MILL.z) - g.position.y
    const rise = DECK_Y - gy0
    const lx0 = STAIR.x0 - MILL.x
    const lx1 = STAIR.x1 - MILL.x
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n
      const x = lx0 - t * run
      const y = gy0 + t * rise
      B.box(M.wood, run / n + 0.04, 0.07, STAIR.w, x, y, 0, 0, 0, 0, 0.9)
    }
    const a = new THREE.Vector3(lx0, gy0 - 0.12, 0)
    const b = new THREE.Vector3(lx1, DECK_Y - 0.14, 0)
    for (const s of [-1, 1]) {
      B.beam(M.tarWood, a.clone().setZ(s * (STAIR.w / 2 + 0.03)), b.clone().setZ(s * (STAIR.w / 2 + 0.03)), 0.1, 0.22)
      // handrail
      B.beam(M.tarWood, a.clone().add(new THREE.Vector3(0, 0.95, 0)).setZ(s * (STAIR.w / 2 + 0.05)), b.clone().add(new THREE.Vector3(0, 0.95, 0)).setZ(s * (STAIR.w / 2 + 0.05)), 0.07, 0.07)
      for (let p = 0; p <= 8; p++) {
        const t = p / 8
        const x = lx0 - t * run
        const y = gy0 + t * rise
        B.box(M.tarWood, 0.07, 0.95, 0.07, x, y + 0.47, s * (STAIR.w / 2 + 0.05))
      }
    }
    for (let p = 1; p < 6; p++) {
      const t = p / 6
      const x = lx0 - t * run
      const y = gy0 + t * rise
      const hh = y - (groundHeight(MILL.x + x, MILL.z) - g.position.y) + 0.2
      for (const s of [-1, 1]) B.box(M.tarWood, 0.16, hh, 0.16, x, y - hh / 2, s * (STAIR.w / 2 + 0.03))
    }
  }
  // windshaft + hub
  const hubY = H + 2.35
  const hubZ = R1 + 2.8
  const shaft = new THREE.CylinderGeometry(0.28, 0.34, 4.6, 10)
  shaft.rotateX(Math.PI / 2)
  B.geo(M.dark, shaft, new THREE.Matrix4().makeTranslation(0, hubY - 0.4, hubZ - 1.6))
  B.build(g)

  // sails
  const SB = new Batch()
  const L = 9.4
  const arm = new THREE.Group()
  for (let s = 0; s < 4; s++) {
    const sail = new THREE.Group()
    const SBs = new Batch()
    SBs.box(M.paint, 0.26, L * 2 * 0.52, 0.2, 0, L * 0.52 + 0.1, 0)
    SBs.box(M.paint, 0.06, L - 1.5, 0.12, 2.05, 1.5 + (L - 1.5) / 2, 0.0)
    SBs.box(M.paint, 0.06, L - 1.5, 0.12, 1.05, 1.5 + (L - 1.5) / 2, 0.0)
    SBs.box(M.paint, 0.06, L - 1.5, 0.12, 0.0, 1.5 + (L - 1.5) / 2, 0.06)
    SBs.box(M.paint, 0.5, L - 1.4, 0.07, -0.38, 1.5 + (L - 1.4) / 2, 0.0)
    for (let i = 0; i <= 22; i++) {
      const y = 1.5 + (i / 22) * (L - 1.5)
      SBs.box(M.paint, 2.1, 0.055, 0.07, 1.05, y, 0.0)
    }
    SBs.build(sail, true, true)
    sail.rotation.y = -0.22
    const holder = new THREE.Group()
    holder.add(sail)
    holder.rotation.z = (s * Math.PI) / 2
    arm.add(holder)
  }
  void SB
  const hubM = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.74, 0.8, 14), M.dark)
  hubM.rotation.x = Math.PI / 2
  hubM.position.z = 0.2
  hubM.castShadow = true
  arm.add(hubM)
  arm.position.set(0, hubY, hubZ + 0.55)
  arm.rotation.x = 0.0
  g.add(arm)
  return {
    group: g,
    update: (dt, wind) => {
      arm.rotation.z -= dt * (0.05 + 0.34 * wind)
    },
  }
  void tex
}

/* ======================================================================= GATE */
function signTexture() {
  const c = document.createElement('canvas')
  c.width = 2048
  c.height = 256
  const g = c.getContext('2d')!
  g.fillStyle = '#f7f2e8'
  g.fillRect(0, 0, 2048, 256)
  g.fillStyle = '#b3225f'
  g.font = '700 150px Georgia, "Times New Roman", serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText('KEUKENHOF', 1024, 108)
  g.font = 'italic 44px Georgia, serif'
  g.fillStyle = '#6b6258'
  g.fillText('Garden of Europe  ·  Lisse  ·  Holland', 1024, 214)
  const tulip = (x: number, col: string) => {
    g.fillStyle = '#4f8a3a'
    g.fillRect(x - 3, 140, 6, 90)
    g.fillStyle = col
    g.beginPath()
    g.moveTo(x - 30, 70)
    g.quadraticCurveTo(x - 36, 150, x, 168)
    g.quadraticCurveTo(x + 36, 150, x + 30, 70)
    g.lineTo(x + 14, 100)
    g.lineTo(x, 60)
    g.lineTo(x - 14, 100)
    g.closePath()
    g.fill()
  }
  const cols = ['#d8281c', '#f2c312', '#e86a98', '#7c2d9c']
  for (let i = 0; i < 4; i++) {
    tulip(90 + i * 70, cols[i])
    tulip(1958 - i * 70, cols[(i + 2) % 4])
  }
  g.strokeStyle = '#b3225f'
  g.lineWidth = 6
  g.strokeRect(8, 8, 2032, 240)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

export function buildGate(M: Mats): THREE.Group {
  const g = new THREE.Group()
  const B = new Batch()
  const z = GATE.z
  const hw = GATE.hw
  const y0 = groundHeight(0, z)
  for (const s of [-1, 1]) {
    const x = s * hw
    B.box(M.brick, 2.0, 6.4, 2.0, x, y0 + 3.2, z, 0, 0, 0, 1.9)
    B.box(M.stone, 2.5, 0.35, 2.5, x, y0 + 6.55, z)
    B.box(M.stone, 2.2, 0.25, 2.2, x, y0 + 0.12, z)
    // low curved brick walls
    for (let k = 1; k <= 7; k++) {
      const wx = x + s * (1.4 + k * 1.7)
      const wy = 1.3 - Math.max(0, k - 4) * 0.12
      B.box(M.brick, 1.8, wy, 0.6, wx, y0 + wy / 2, z + k * 0.28, 0, 0, 0, 1.9)
      B.box(M.stone, 1.9, 0.12, 0.74, wx, y0 + wy + 0.06, z + k * 0.28)
    }
    // lantern
    B.box(M.dark, 0.5, 0.7, 0.5, x, y0 + 7.1, z)
    colCircles.push([x, z, 1.35])
    colBoxes.push({ cx: x + s * 8, cz: z + 1, hx: 7, hz: 0.8 })
  }
  B.build(g)
  const tex = signTexture()
  const sign = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 1, 2.0, 0.35), [M.white, M.white, M.white, M.white, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 })])
  sign.position.set(0, y0 + 6.6, z)
  sign.castShadow = true
  sign.receiveShadow = true
  g.add(sign)
  // slim steel beam
  const bm = new THREE.Mesh(new THREE.BoxGeometry(hw * 2, 0.3, 0.5), M.dark)
  bm.position.set(0, y0 + 5.2, z)
  bm.castShadow = true
  g.add(bm)
  return g
}

/* ======================================================================= PAVILION */
export function buildPavilion(M: Mats, beds: Bed[]): THREE.Group {
  const g = new THREE.Group()
  const B = new Batch()
  const { cx, cz, hx, hz, h } = PAVILION
  const door = 2.9
  // floor
  const floorGeo = new THREE.BoxGeometry(hx * 2 + 0.6, 0.14, hz * 2 + 0.6)
  scaleUV(floorGeo, (hx * 2) / 2.4, (hz * 2) / 2.4)
  B.geo(M.paver, floorGeo.toNonIndexed(), new THREE.Matrix4().makeTranslation(cx, 0.0, cz))
  // columns & mullions
  const nCol = 9
  for (let i = 0; i <= nCol; i++) {
    const x = cx - hx + (i / nCol) * hx * 2
    for (const s of [-1, 1]) {
      if (s === 1 && Math.abs(x - cx) < door + 0.2) continue
      B.box(M.white, 0.28, h, 0.28, x, h / 2, cz + s * hz)
    }
  }
  for (const s of [-1, 1]) for (let k = 0; k <= 3; k++) B.box(M.white, 0.28, h, 0.28, cx + s * hx, h / 2, cz - hz + (k / 3) * hz * 2)
  // transom beams
  B.box(M.white, hx * 2, 0.3, 0.3, cx, h - 0.15, cz - hz)
  B.box(M.white, hx * 2, 0.3, 0.3, cx, h - 0.15, cz + hz)
  B.box(M.white, hx * 2, 0.16, 0.2, cx, 3.2, cz - hz)
  B.box(M.white, (hx * 2 - door * 2) / 2, 0.16, 0.2, cx - hx + (hx - door) / 2, 3.2, cz + hz)
  B.box(M.white, (hx * 2 - door * 2) / 2, 0.16, 0.2, cx + hx - (hx - door) / 2, 3.2, cz + hz)
  B.box(M.white, door * 2, 0.3, 0.3, cx, 3.8, cz + hz)
  for (const s of [-1, 1]) B.box(M.white, 0.16, 2, 0.16, cx + s * (door - 0.1), 1.0, cz + hz)
  // trusses
  for (let i = 1; i < nCol; i++) {
    const x = cx - hx + (i / nCol) * hx * 2
    B.box(M.white, 0.14, 0.14, hz * 2, x, h - 0.3, cz)
  }
  B.build(g)
  // glass walls
  const glass: THREE.BufferGeometry[] = []
  const gw = (w: number, hh: number, x: number, z: number, ry: number) => {
    const p = new THREE.PlaneGeometry(w, hh)
    p.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, hh / 2, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(1, 1, 1)))
    glass.push(p)
  }
  gw(hx * 2, h, cx, cz - hz, 0)
  gw(hz * 2, h, cx - hx, cz, Math.PI / 2)
  gw(hz * 2, h, cx + hx, cz, Math.PI / 2)
  gw(hx - door, h, cx - hx + (hx - door) / 2, cz + hz, 0)
  gw(hx - door, h, cx + hx - (hx - door) / 2, cz + hz, 0)
  gw(door * 2, h - 3.8, cx, cz + hz + 0, 0)
  const gm = new THREE.Mesh(mergeGeometries(glass.map((p) => p.toNonIndexed()), false)!, M.glass)
  gm.position.y = 0
  gm.renderOrder = 5
  g.add(gm)
  // arched roof
  const shape = new THREE.Shape()
  const hw2 = hz + 2.2
  const N = 14
  const top: [number, number][] = []
  for (let i = 0; i <= N; i++) {
    const t = (i / N) * 2 - 1
    top.push([t * hw2, h + 1.3 * (1 - t * t)])
  }
  shape.moveTo(top[0][0], top[0][1] - 0.35)
  top.forEach(([x, y]) => shape.lineTo(x, y))
  for (let i = N; i >= 0; i--) shape.lineTo(top[i][0], top[i][1] - 0.35 - 0.1 * (1 - Math.abs(i / N * 2 - 1)))
  const roofGeo = new THREE.ExtrudeGeometry(shape, { depth: hx * 2 + 4, bevelEnabled: false })
  roofGeo.translate(0, 0, -(hx * 2 + 4) / 2)
  roofGeo.rotateY(Math.PI / 2)
  const roof = new THREE.Mesh(roofGeo, M.white)
  roof.position.set(cx, 0, cz)
  roof.castShadow = true
  roof.receiveShadow = true
  g.add(roof)
  // ceiling fascia: soft linear lights
  const lightMat = new THREE.MeshStandardMaterial({ color: 0xfff6e4, emissive: 0xfff0d0, emissiveIntensity: 1.2 })
  for (let i = 0; i < 5; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(hx * 2 - 4, 0.08, 0.35), lightMat)
    m.position.set(cx, h - 0.45 + 0.5 * (1 - Math.pow((i - 2) / 2.2, 2)) * 0.5, cz - hz + 2 + i * ((hz * 2 - 4) / 4))
    g.add(m)
  }
  // raised display beds
  const BB = new Batch()
  for (const b of beds) {
    if (!b.indoor) continue
    const w = b.b.x1 - b.b.x0
    const d = b.b.z1 - b.b.z0
    const mats = [M.white, M.white, M.soil, M.white, M.white, M.white]
    const geo = new THREE.BoxGeometry(w + 0.5, b.y, d + 0.5)
    const bm = new THREE.Mesh(geo, mats)
    bm.position.set(b.cx, b.y / 2 + 0.07, b.cz)
    bm.castShadow = true
    bm.receiveShadow = true
    g.add(bm)
    BB.box(M.wood, w + 0.7, 0.07, d + 0.7, b.cx, b.y + 0.1, b.cz)
  }
  BB.build(g)
  // colliders
  const t = 0.35
  colBoxes.push({ cx, cz: cz - hz, hx, hz: t })
  colBoxes.push({ cx: cx - hx, cz, hx: t, hz })
  colBoxes.push({ cx: cx + hx, cz, hx: t, hz })
  colBoxes.push({ cx: cx - hx + (hx - door) / 2, cz: cz + hz, hx: (hx - door) / 2, hz: t })
  colBoxes.push({ cx: cx + hx - (hx - door) / 2, cz: cz + hz, hx: (hx - door) / 2, hz: t })
  return g
}

/* ======================================================================= CAFE */
export function buildCafe(M: Mats): { group: THREE.Group; parasols: THREE.InstancedMesh } {
  const g = new THREE.Group()
  const B = new Batch()
  const { cx, cz, hx, hz, h } = CAFE
  // brick base & glass front
  B.box(M.darkBrick, hx * 2, 1.15, hz * 2, cx, 0.575, cz, 0, 0, 0, 1.9)
  const wallH = h - 1.15
  B.box(M.darkBrick, hx * 2, wallH, 0.5, cx, 1.15 + wallH / 2, cz - hz + 0.25, 0, 0, 0, 1.9)
  B.box(M.darkBrick, 0.5, wallH, hz * 2, cx - hx + 0.25, 1.15 + wallH / 2, cz, 0, 0, 0, 1.9)
  B.box(M.darkBrick, 0.5, wallH, hz * 2, cx + hx - 0.25, 1.15 + wallH / 2, cz, 0, 0, 0, 1.9)
  for (let i = 0; i <= 8; i++) B.box(M.dark, 0.14, wallH, 0.14, cx - hx + 0.5 + (i / 8) * (hx * 2 - 1), 1.15 + wallH / 2, cz + hz - 0.1)
  B.box(M.dark, hx * 2, 0.14, 0.14, cx, 1.15 + wallH * 0.62, cz + hz - 0.1)
  B.box(M.dark, hx * 2, 0.14, 0.14, cx, h - 0.1, cz + hz - 0.1)
  // flat roof with overhang
  B.box(M.white, hx * 2 + 4, 0.35, hz * 2 + 5, cx, h + 0.15, cz + 1.2)
  B.box(M.stone, hx * 2 + 4.2, 0.1, hz * 2 + 5.2, cx, h + 0.37, cz + 1.2)
  // interior dark volume (so the glass reads as a room)
  const glassBack = new THREE.MeshStandardMaterial({ color: 0x3b2f27, roughness: 0.9 })
  B.box(glassBack, hx * 2 - 1, wallH, 0.1, cx, 1.15 + wallH / 2, cz + hz - 1.2)
  B.build(g)
  const gl = new THREE.Mesh(new THREE.PlaneGeometry(hx * 2 - 0.9, wallH), M.glass)
  gl.position.set(cx, 1.15 + wallH / 2, cz + hz - 0.05)
  g.add(gl)
  // terrace: tables, chairs and parasols
  const r = rng(5)
  const tableG = new THREE.CylinderGeometry(0.45, 0.45, 0.04, 16)
  tableG.translate(0, 0.74, 0)
  const legG = new THREE.CylinderGeometry(0.03, 0.03, 0.74, 6)
  legG.translate(0, 0.37, 0)
  const tg = mergeGeometries([tableG, legG])!
  const tbl = new THREE.InstancedMesh(tg, M.white, 14)
  const chairSeat = new THREE.BoxGeometry(0.42, 0.04, 0.42)
  chairSeat.translate(0, 0.45, 0)
  const chairBack = new THREE.BoxGeometry(0.42, 0.4, 0.04)
  chairBack.translate(0, 0.68, -0.2)
  const legs: THREE.BufferGeometry[] = []
  for (const [lx, lz] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) {
    const l = new THREE.BoxGeometry(0.03, 0.45, 0.03)
    l.translate(lx, 0.225, lz)
    legs.push(l)
  }
  const cg = mergeGeometries([chairSeat, chairBack, ...legs].map((x) => x.toNonIndexed()))!
  const chairs = new THREE.InstancedMesh(cg, M.wood, 56)
  const par = new THREE.InstancedMesh(new THREE.ConeGeometry(1.5, 0.55, 12, 1, true), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, side: THREE.DoubleSide }), 7)
  const pole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.03, 0.03, 2.5, 6), M.dark, 7)
  const m = new THREE.Matrix4()
  let ci = 0
  const colors = ['#f6efe0', '#d9433a', '#f6efe0', '#2d6a8a', '#f6efe0', '#e8a525', '#f6efe0']
  for (let i = 0; i < 14; i++) {
    const col = i % 7
    const row = Math.floor(i / 7)
    const tx = cx - hx + 2.4 + col * ((hx * 2 - 4) / 6)
    const tz = cz + hz + 3.2 + row * 3.8
    m.makeTranslation(tx, 0, tz)
    tbl.setMatrixAt(i, m)
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * TAU + r() * 0.4
      m.compose(new THREE.Vector3(tx + Math.cos(a) * 0.72, 0, tz + Math.sin(a) * 0.72), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a - Math.PI / 2), new THREE.Vector3(1, 1, 1))
      chairs.setMatrixAt(ci++, m)
    }
    if (row === 0) {
      m.makeTranslation(tx, 2.7, tz)
      par.setMatrixAt(col, m)
      par.setColorAt(col, new THREE.Color(colors[col]))
      m.makeTranslation(tx, 1.25, tz)
      pole.setMatrixAt(col, m)
    }
  }
  for (const o of [tbl, chairs, par, pole]) {
    o.castShadow = true
    o.receiveShadow = true
    g.add(o)
  }
  colBoxes.push({ cx, cz, hx: hx + 0.2, hz: hz + 0.2 })
  return { group: g, parasols: par }
}

/* ======================================================================= PROPS */
export function buildProps(M: Mats, benches: Prop[], lamps: Prop[], beds: Bed[]): THREE.Group {
  const g = new THREE.Group()
  // benches
  const parts: THREE.BufferGeometry[] = []
  for (let i = 0; i < 4; i++) {
    const s = new THREE.BoxGeometry(1.8, 0.04, 0.09)
    s.translate(0, 0.45, -0.15 + i * 0.1)
    parts.push(s)
  }
  for (let i = 0; i < 3; i++) {
    const s = new THREE.BoxGeometry(1.8, 0.09, 0.03)
    s.translate(0, 0.62 + i * 0.12, -0.22)
    s.rotateX(0)
    parts.push(s)
  }
  for (const sx of [-0.8, 0.8]) {
    const l = new THREE.BoxGeometry(0.05, 0.45, 0.45)
    l.translate(sx, 0.225, 0)
    parts.push(l)
    const b = new THREE.BoxGeometry(0.05, 0.4, 0.04)
    b.translate(sx, 0.65, -0.22)
    parts.push(b)
  }
  const bg = mergeGeometries(parts.map((p) => p.toNonIndexed()))!
  const bench = new THREE.InstancedMesh(bg, M.wood, Math.max(benches.length, 1))
  const m = new THREE.Matrix4()
  benches.forEach((b, i) => {
    m.compose(new THREE.Vector3(b.x, groundHeight(b.x, b.z), b.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), b.rot), new THREE.Vector3(1, 1, 1))
    bench.setMatrixAt(i, m)
    colCircles.push([b.x, b.z, 0.9])
  })
  bench.count = benches.length
  bench.castShadow = bench.receiveShadow = true
  g.add(bench)
  // lamps
  const pole = new THREE.CylinderGeometry(0.05, 0.08, 4.2, 8)
  pole.translate(0, 2.1, 0)
  const head = new THREE.BoxGeometry(0.34, 0.5, 0.34)
  head.translate(0, 4.35, 0)
  const cap = new THREE.ConeGeometry(0.3, 0.2, 4)
  cap.rotateY(Math.PI / 4)
  cap.translate(0, 4.7, 0)
  const lg = mergeGeometries([pole, head, cap].map((p) => p.toNonIndexed()))!
  const lampMat = new THREE.MeshStandardMaterial({ color: 0x23332c, roughness: 0.5, metalness: 0.6 })
  const lm = new THREE.InstancedMesh(lg, lampMat, Math.max(lamps.length, 1))
  lamps.forEach((l, i) => {
    m.makeTranslation(l.x, groundHeight(l.x, l.z), l.z)
    lm.setMatrixAt(i, m)
    colCircles.push([l.x, l.z, 0.2])
  })
  lm.count = lamps.length
  lm.castShadow = true
  g.add(lm)
  // white picket fences around beds near the windmill
  const pk = new THREE.BoxGeometry(0.05, 0.55, 0.02)
  pk.translate(0, 0.28, 0)
  const rails: THREE.Matrix4[] = []
  const pickets: THREE.Matrix4[] = []
  const rBeds = beds.filter((b) => !b.indoor && b.cz < -66 && Math.abs(b.cx) < 40)
  for (const b of rBeds) {
    const pl = b.poly
    for (let i = 0; i < pl.length; i++) {
      const [ax, az] = pl[i]
      const [bx, bz] = pl[(i + 1) % pl.length]
      const len = Math.hypot(bx - ax, bz - az)
      const ang = Math.atan2(bx - ax, bz - az)
      const n = Math.floor(len / 0.14)
      // push fence outwards from centre slightly
      const ox = (ax - b.cx) * 0.03
      const oz = (az - b.cz) * 0.03
      for (let k = 0; k < n; k++) {
        const t = k / n
        const x = ax + (bx - ax) * t + ox
        const z = az + (bz - az) * t + oz
        pickets.push(new THREE.Matrix4().compose(new THREE.Vector3(x, groundHeight(x, z), z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ang + Math.PI / 2), new THREE.Vector3(1, 1, 1)))
      }
      for (const yy of [0.18, 0.4]) {
        const rg = new THREE.Matrix4().compose(new THREE.Vector3((ax + bx) / 2 + ox, groundHeight(ax, az) + yy, (az + bz) / 2 + oz), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ang), new THREE.Vector3(0.03, 0.04, len))
        rails.push(rg)
      }
    }
  }
  if (pickets.length) {
    const pm = new THREE.InstancedMesh(pk, M.white, pickets.length)
    pickets.forEach((mm, i) => pm.setMatrixAt(i, mm))
    pm.castShadow = true
    pm.receiveShadow = true
    g.add(pm)
    const rm = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), M.white, rails.length)
    rails.forEach((mm, i) => rm.setMatrixAt(i, mm))
    rm.castShadow = true
    g.add(rm)
  }
  return g
}

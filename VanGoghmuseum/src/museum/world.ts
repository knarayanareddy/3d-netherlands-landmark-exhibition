import * as THREE from 'three'
import { Builder, Seg, Surf, Opening } from './builder'
import { Materials, canvasTex, hash2 } from './textures'
import { PAINTINGS, PaintingDef, QUOTES } from './paintings'
import { buildOutdoors } from './outdoors'

export interface Anchor { x: number; y: number; z: number }
export interface PaintingInst { def: PaintingDef; mesh: THREE.Mesh; center: THREE.Vector3; normal: THREE.Vector3; w: number; h: number }
export interface Teleport { id: string; label: string; x: number; y: number; z: number; yaw: number }
export interface Glow { mat: THREE.MeshStandardMaterial; base: number; night: number }
export interface World {
  group: THREE.Group
  segs: Seg[]
  surfs: Surf[]
  anchors: Anchor[]
  paintings: PaintingInst[]
  glow: Glow[]
  teleports: Teleport[]
  zoneAt(x: number, y: number, z: number): { name: string; inside: number }
}

export const LV = [0.02, 5, 10, 15]
const STH = 0.35
const CH = 4.2
const IX0 = -39.4, IX1 = 9.4, IZ0 = -23.4, IZ1 = -0.6
const PS = 1.5 // paintings are shown 1.5x life size so details read better

export const WING = { cx: 43, cz: 6, a: 19, b: 14 }
export const HALL = { x0: -8, x1: 24, z0: 0, z1: 14, h: 7 }

const PAL: string[][] = [
  ['#7f9387', '#b4a67e', '#7c90a1', '#a28f86'],
  ['#c6b387', '#8ea19f', '#a48b80', '#7e94a7'],
  ['#8d9b85', '#9ba3ae', '#bba98c', '#87827b'],
]
const roomCol = (l: number, r: number) => (l === 0 ? ['#ece8de', '#e3ded2', '#efece5', '#ebe4d6'][r] : PAL[l - 1][r])

const LEVEL_TITLES = ['Ground floor', 'Early years & Paris', 'Arles & the Yellow House', 'Saint-Rémy & Auvers']

/* ----------------------------------------------------------- canvas decals */
function wrap(g: CanvasRenderingContext2D, text: string, maxW: number) {
  const words = text.split(' ')
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w
    if (g.measureText(t).width > maxW && cur) { lines.push(cur); cur = w } else cur = t
  }
  if (cur) lines.push(cur)
  return lines
}
function labelTex(d: PaintingDef) {
  return canvasTex(512, 256, (g, w, h) => {
    g.fillStyle = '#f5f2ea'; g.fillRect(0, 0, w, h)
    g.fillStyle = '#1d1b19'
    g.font = '700 34px Georgia, serif'
    const lines = wrap(g, d.title, w - 50)
    lines.forEach((l, i) => g.fillText(l, 26, 56 + i * 38))
    const y = 56 + lines.length * 38 + 6
    g.font = 'italic 26px Georgia, serif'
    g.fillText(`${d.year}, ${d.place}`, 26, y + 16)
    g.font = '22px Georgia, serif'
    g.fillStyle = '#555'
    g.fillText(`Oil on canvas · ${d.dims}`, 26, y + 50)
    g.fillStyle = '#c99a1a'
    g.fillRect(26, h - 34, 60, 5)
  })
}
function textTex(w: number, h: number, text: string, o: { font: string; color: string; size: number; align?: CanvasTextAlign; lh?: number; shadow?: boolean }) {
  return canvasTex(w, h, (g) => {
    g.clearRect(0, 0, w, h)
    g.font = `${o.font.replace('SIZE', String(o.size))}`
    g.fillStyle = o.color
    g.textBaseline = 'middle'
    g.textAlign = o.align ?? 'left'
    if (o.shadow) { g.shadowColor = 'rgba(0,0,0,0.25)'; g.shadowBlur = 6 }
    const lines = wrap(g, text, w - 80)
    const lh = o.lh ?? o.size * 1.25
    const y0 = h / 2 - ((lines.length - 1) * lh) / 2
    const x = o.align === 'center' ? w / 2 : 40
    lines.forEach((l, i) => g.fillText(l, x, y0 + i * lh))
  })
}
function letterTex() {
  return canvasTex(512, 640, (g, w, h) => {
    g.fillStyle = '#efe4c8'; g.fillRect(0, 0, w, h)
    for (let i = 0; i < 2000; i++) { g.fillStyle = `rgba(120,90,40,${Math.random() * 0.05})`; g.fillRect(Math.random() * w, Math.random() * h, 3, 3) }
    g.strokeStyle = '#3a2a1c'; g.lineWidth = 1.6
    for (let r = 0; r < 20; r++) {
      let x = 44
      const y = 70 + r * 26
      g.beginPath(); g.moveTo(x, y)
      while (x < w - 50) { x += 5 + hash2(r, x | 0, 3) * 6; g.lineTo(x, y + (hash2(x | 0, r, 4) - 0.5) * 9) }
      g.stroke()
      if (hash2(r, 1, 9) > 0.8) x = 0
    }
  })
}

/* ================================================================== WORLD */
export function buildWorld(M: Materials, texs: Record<string, THREE.Texture>): World {
  const b = new Builder()
  const root = new THREE.Group()
  const anchors: Anchor[] = []
  const paintings: PaintingInst[] = []
  const decals = new THREE.Group()
  root.add(decals)

  const colBox = (x0: number, z0: number, x1: number, z1: number, y0: number, y1: number) => {
    b.seg(x0, z0, x1, z0, y0, y1); b.seg(x1, z0, x1, z1, y0, y1); b.seg(x1, z1, x0, z1, y0, y1); b.seg(x0, z1, x0, z0, y0, y1)
  }
  const mk = (c: string, r = 0.7, m = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m })
  const prod = ['#f2c230', '#2e5f8c', '#e9e5d9', '#b9452f', '#5b8a5a', '#d98a2b', '#6b4a8a'].map((c) => mk(c, 0.6))
  const pick = <T,>(a: T[], i: number, j: number) => a[Math.floor(hash2(i, j, 77) * a.length) % a.length]

  /* ---------- helpers: rails, benches, plants, tables ---------- */
  const rail = (x0: number, z0: number, x1: number, z1: number, y: number, collide = true) => {
    const h = 1.05
    if (Math.abs(x1 - x0) >= Math.abs(z1 - z0)) {
      b.box(M.glass, x0, y, z0 - 0.015, x1, y + h, z0 + 0.015)
      b.box(M.brass, x0, y + h, z0 - 0.035, x1, y + h + 0.05, z0 + 0.035)
    } else {
      b.box(M.glass, x0 - 0.015, y, z0, x0 + 0.015, y + h, z1)
      b.box(M.brass, x0 - 0.035, y + h, z0, x0 + 0.035, y + h + 0.05, z1)
    }
    if (collide) b.seg(x0, z0, x1, z1, y, y + h)
  }
  const slopeRail = (x: number, za: number, ya: number, zb: number, yb: number) => {
    const h = 1.0
    const len = Math.abs(zb - za)
    const k = (yb - ya) / (zb - za)
    const cz = (za + zb) / 2, cy = (ya + yb) / 2
    b.sheared(M.glass, x, cy + h / 2, cz, 0.03, h, len, k)
    b.sheared(M.brass, x, cy + h + 0.025, cz, 0.07, 0.05, len, k)
    b.seg(x, za, x, zb, Math.min(ya, yb) - 0.1, Math.max(ya, yb) + h + 0.2)
  }
  const bench = (x: number, y: number, z: number, len: number, alongX = true) => {
    const w = alongX ? len : 0.65, d = alongX ? 0.65 : len
    b.box(M.leather, x - w / 2, y + 0.38, z - d / 2, x + w / 2, y + 0.5, z + d / 2)
    b.box(M.darkMetal, x - w / 2 + 0.05, y, z - d / 2 + 0.05, x - w / 2 + 0.12, y + 0.38, z + d / 2 - 0.05)
    b.box(M.darkMetal, x + w / 2 - 0.12, y, z - d / 2 + 0.05, x + w / 2 - 0.05, y + 0.38, z + d / 2 - 0.05)
    colBox(x - w / 2, z - d / 2, x + w / 2, z + d / 2, y, y + 0.6)
  }
  const plant = (x: number, y: number, z: number, s = 1) => {
    b.cyl(M.pot, x, y, z, 0.32 * s, 0.6 * s, 16, 0.26 * s)
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2, r = 0.18 * s
      const g = new THREE.SphereGeometry(0.34 * s, 8, 6)
      g.scale(1, 1.3, 1)
      g.translate(x + Math.cos(a) * r, y + (0.95 + hash2(i, 3, 5) * 0.7) * s, z + Math.sin(a) * r)
      b.geo(M.plant, g)
    }
    b.cyl(M.bark, x, y + 0.6 * s, z, 0.03 * s, 0.6 * s, 6)
    b.seg(x - 0.3, z, x + 0.3, z, y, y + 1)
    b.seg(x, z - 0.3, x, z + 0.3, y, y + 1)
  }
  const table = (x: number, z: number, y = 0.02) => {
    b.cyl(M.deskTop, x, y + 0.74, z, 0.45, 0.04, 20)
    b.cyl(M.darkMetal, x, y, z, 0.04, 0.74, 8)
    b.cyl(M.darkMetal, x, y, z, 0.25, 0.03, 16)
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4
      const cx = x + Math.cos(a) * 0.75, cz = z + Math.sin(a) * 0.75
      b.boxC(M.wood, cx, y + 0.45, cz, 0.42, 0.04, 0.42, -a)
      b.boxC(M.wood, x + Math.cos(a) * 0.96, y + 0.72, z + Math.sin(a) * 0.96, 0.04, 0.5, 0.42, -a)
      for (const [ox, oz] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) b.box(M.darkMetal, cx + ox - 0.012, y, cz + oz - 0.012, cx + ox + 0.012, y + 0.45, cz + oz + 0.012)
    }
    colBox(x - 1.1, z - 1.1, x + 1.1, z + 1.1, y, y + 1)
  }
  const shelf = (x0: number, z0: number, x1: number, z1: number, y: number) => {
    const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0)
    const h = 2.3
    b.box(M.wood, x0, y, z0, x1, y + h, z1)
    const sx = alongX ? 0 : 0
    void sx
    const len = alongX ? x1 - x0 : z1 - z0
    for (let r = 0; r < 5; r++) {
      const sy = y + 0.25 + r * 0.42
      for (let i = 0; i < len / 0.34 - 1; i++) {
        const t = 0.2 + i * 0.34
        const hh = 0.18 + hash2(i, r, 3) * 0.14
        const m = pick(prod, i, r + (x0 | 0))
        if (alongX) b.box(m, x0 + t, sy, z0 + (z1 - z0) * 0.15 + 0.05, x0 + t + 0.26, sy + hh, z1 - 0.06)
        else b.box(m, x0 + 0.06, sy, z0 + t, x1 - 0.06, sy + hh, z0 + t + 0.26)
      }
      if (alongX) b.box(M.white, x0 + 0.02, sy - 0.03, z0 + 0.02, x1 - 0.02, sy, z1 - 0.02)
      else b.box(M.white, x0 + 0.02, sy - 0.03, z0 + 0.02, x1 - 0.02, sy, z1 - 0.02)
    }
    colBox(x0, z0, x1, z1, y, y + h)
  }
  const decal = (tex: THREE.Texture, w: number, h: number, x: number, y: number, z: number, nx: number, nz: number, emissive = 0) => {
    const m = new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, emissive: emissive ? '#ffffff' : '#000000', emissiveMap: emissive ? tex : null, emissiveIntensity: emissive })
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m)
    p.position.set(x, y, z)
    p.rotation.y = Math.atan2(nx, nz)
    p.receiveShadow = true
    decals.add(p)
    return p
  }
  const quote = (i: number, x: number, y: number, z: number, nx: number, nz: number, w = 3.4) => {
    const t = textTex(1024, 420, `“${QUOTES[i % QUOTES.length]}”`, { font: 'italic 500 SIZEpx Georgia, serif', color: '#fbf8ef', size: 78, align: 'center', shadow: true })
    decal(t, w, w * (420 / 1024), x, y, z, nx, nz)
    const s = textTex(512, 80, 'VINCENT VAN GOGH, FROM HIS LETTERS', { font: '600 SIZEpx Helvetica, Arial, sans-serif', color: '#f3eede', size: 26, align: 'center' })
    decal(s, w * 0.55, w * 0.55 * (80 / 512), x, y - w * 0.2, z, nx, nz)
  }

  /* ---------- paintings ---------- */
  const PLACE: Record<string, { x: number; z: number; nx: number; nz: number }> = {
    potato: { x: IX0 + 0.04, z: -6.3, nx: 1, nz: 0 },
    selfportrait: { x: -25.5, z: -12 + 0.15 + 0.04, nx: 0, nz: 1 },
    yellowhouse: { x: -30.2, z: IZ0 + 0.04, nx: 0, nz: 1 },
    bedroom: { x: IX0 + 0.04, z: -17.7, nx: 1, nz: 0 },
    sunflowers: { x: IX1 - 0.04, z: -6.3, nx: -1, nz: 0 },
    almond: { x: 0.2, z: IZ0 + 0.04, nx: 0, nz: 1 },
    crows: { x: IX1 - 0.04, z: -17.7, nx: -1, nz: 0 },
    thunder: { x: 5.6, z: -12 + 0.15 + 0.04, nx: 0, nz: 1 },
  }
  for (const d of PAINTINGS) {
    const tex = texs[d.id]
    const img = tex.image as HTMLImageElement
    const h = (d.hCm / 100) * PS
    const w = (h * img.width) / img.height
    const p = PLACE[d.id]
    const yc = LV[d.level] + 1.62
    const g = new THREE.Group()
    const fw = d.frame === 'gold' ? 0.1 : 0.07
    const fm = d.frame === 'gold' ? M.gold : d.frame === 'white' ? M.skirting : M.blackFrame
    const frame = new THREE.Mesh(new THREE.BoxGeometry(w + fw * 2, h + fw * 2, 0.07), fm)
    frame.position.z = 0.035
    frame.castShadow = true; frame.receiveShadow = true
    g.add(frame)
    const pm = new THREE.MeshStandardMaterial({ map: tex, bumpMap: tex, bumpScale: 1.4, roughness: 0.5, metalness: 0 })
    const pic = new THREE.Mesh(new THREE.PlaneGeometry(w, h), pm)
    pic.position.z = 0.0712
    pic.receiveShadow = true
    g.add(pic)
    const lbl = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.15), new THREE.MeshStandardMaterial({ map: labelTex(d), roughness: 0.7 }))
    lbl.position.set(w / 2 + fw + 0.26, -h / 2 + 0.2, 0.012)
    g.add(lbl)
    const lampBar = new THREE.Mesh(new THREE.BoxGeometry(Math.min(w * 0.6, 1.0), 0.03, 0.06), M.brass)
    lampBar.position.set(0, h / 2 + fw + 0.16, 0.14)
    g.add(lampBar)
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.12), M.brass)
    arm.position.set(0, h / 2 + fw + 0.14, 0.07)
    g.add(arm)
    g.position.set(p.x, yc, p.z)
    g.rotation.y = Math.atan2(p.nx, p.nz)
    root.add(g)
    paintings.push({ def: d, mesh: pic, center: new THREE.Vector3(p.x + p.nx * 0.08, yc, p.z + p.nz * 0.08), normal: new THREE.Vector3(p.nx, 0, p.nz), w, h })
  }

  /* ============================== RIETVELD BUILDING (levels 0-3) ============================== */
  for (let l = 0; l < 4; l++) {
    const y = LV[l]
    const y0 = l === 0 ? -0.5 : y - STH
    const yw = l === 3 ? 20.0 : l === 0 ? 4.67 : LV[l + 1] - STH + 0.02
    const top = l === 3 ? 20.8 : yw
    const C = (r: number) => M.wall(roomCol(l, r))
    const HL = M.wall('#ece8df')
    const sFloor = l === 0 ? 0.52 : 0.35
    const D = (a: number, bb: number, h = 2.8): Opening => ({ a, b: bb, s: sFloor, h, walk: true })
    const shell = (along: 'x' | 'z', c: number, t0: number, t1: number, lo?: THREE.Material, hi?: THREE.Material, open?: Opening[]) =>
      b.wall({ along, c, t0, t1, y0, y1: top, th: 0.6, core: M.facade, lo, hi, open, glass: M.glass })
    const slot = (a: number, bb: number): Opening => ({ a, b: bb, s: sFloor, h: top - y0 - sFloor - (l === 3 ? 0.9 : 0), glass: true })

    // exterior shell (front = z0 side faces Museumplein)
    shell('x', -0.3, -40, -21, C(0), undefined, l === 0 ? [{ a: -37.5, b: -23.5, s: 1.0, h: 2.8, glass: true }] : undefined)
    shell('x', -0.3, -21, -9, HL, undefined, [slot(-16.6, -14.4)])
    shell('x', -0.3, -9, 10, C(2), undefined, l === 0 ? [{ a: -5, b: 4, s: 0.52, h: 3.9, walk: true }] : undefined)
    shell('x', -23.7, -40, -21, undefined, C(1))
    shell('x', -23.7, -21, -9, undefined, HL)
    shell('x', -23.7, -9, 10, undefined, C(3))
    shell('z', -39.7, -24, -12, undefined, C(1))
    shell('z', -39.7, -12, 0, undefined, C(0))
    shell('z', 9.7, -24, -12, C(3), undefined)
    shell('z', 9.7, -12, 0, C(2), undefined)

    // interior partitions
    const P = (along: 'x' | 'z', c: number, t0: number, t1: number, lo: THREE.Material, hi: THREE.Material, open: Opening[]) =>
      b.wall({ along, c, t0, t1, y0, y1: yw, th: 0.3, core: M.white, lo, hi, open })
    P('z', -21, IZ0, -12, C(1), HL, [l === 0 ? D(-22.8, -19.5, 3) : D(-22.6, -20)])
    P('z', -21, -12, IZ1, C(0), HL, [l === 0 ? D(-8, -1.2, 3.2) : D(-4.2, -1.4)])
    P('z', -9, IZ0, -12, HL, C(3), [l === 0 ? D(-22.8, -19.5, 3) : D(-22.6, -20)])
    P('z', -9, -12, IZ1, HL, C(2), [l === 0 ? D(-10, -1.2, 3.4) : D(-4.2, -1.4)])
    P('x', -12, IX0, -21, C(1), C(0), [l === 0 ? D(-35, -27, 3) : D(-33.5, -30)])
    P('x', -12, -9, IX1, C(3), C(2), [l === 0 ? D(-4, 4, 3) : D(-2.5, 1)])

    // floors
    const floorRect = (x0: number, z0: number, x1: number, z1: number, mat: THREE.Material) => {
      b.box(M.concrete, x0, y - STH, z0, x1, y - 0.03, z1)
      b.box(mat, x0, y - 0.03, z0, x1, y, z1)
      b.flat(x0, z0, x1, z1, y)
    }
    const ceil = (x0: number, z0: number, x1: number, z1: number) => {
      b.box(M.white, x0, y + CH, z0, x1, y + CH + 0.04, z1)
      for (let cx = x0 + 1.8; cx < x1 - 0.9; cx += 3.6) {
        for (let cz = z0 + 1.8; cz < z1 - 0.9; cz += 3.6) b.box(M.ceilingLight, cx - 0.6, y + CH - 0.03, cz - 0.6, cx + 0.6, y + CH, cz + 0.6)
      }
    }
    if (l === 0) {
      floorRect(IX0, IZ0, -21, IZ1, M.parquet)
      floorRect(-21, IZ0, IX1, IZ1, M.stone)
    } else {
      floorRect(IX0, IZ0, -21, IZ1, M.parquet)
      floorRect(-9, IZ0, IX1, IZ1, M.parquet)
      floorRect(-21, -5, -9, IZ1, M.stone)
      floorRect(-21, IZ0, -9, -19, M.stone)
    }
    ceil(IX0, IZ0, -21, IZ1); ceil(-9, IZ0, IX1, IZ1); ceil(-21, -5, -9, IZ1); ceil(-21, IZ0, -9, -19)

    // light anchors
    const ay = y + 3.5
    if (l === 0) { /* special-cased below */ }
    for (const cx of [-34.8, -25.6, -4.6, 5]) for (const cz of [-17.7, -6.3]) anchors.push({ x: cx, y: ay, z: cz })
    anchors.push({ x: -15, y: ay, z: -2.8 }, { x: -15, y: ay, z: -21.2 })
    anchors.push({ x: -15, y: y + 3.2, z: -12 })

    // rails around the stair void at upper levels
    if (l >= 1) {
      rail(-21, -19, -9, -19, y)
      if (l < 3) { rail(-18.3, -5, -17.5, -5, y); rail(-14.9, -5, -9, -5, y) } else { rail(-21, -5, -17.5, -5, y); rail(-14.9, -5, -9, -5, y) }
    }

    // gallery furniture / quotes
    if (l >= 1) {
      bench(-30.2, y, -6.3, 2.2, true)
      bench(0.2, y, -6.3, 2.2, true)
      bench(-30.2, y, -17.7, 2.2, true)
      bench(0.2, y, -17.7, 2.2, true)
      plant(-22.2, y, -22.2); plant(7.8, y, -1.9)
      // letter vitrine
      b.box(M.white, -36.1, y, -18.15, -34.9, y + 0.95, -17.25)
      b.box(M.glass, -36.1, y + 0.95, -18.15, -34.9, y + 1.2, -17.25)
      colBox(-36.1, -18.15, -34.9, -17.25, y, y + 1.2)
      const lt = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.85), new THREE.MeshStandardMaterial({ map: letterTex(), roughness: 0.9 }))
      lt.rotation.x = -Math.PI / 2 + 0.12
      lt.position.set(-35.5, y + 0.97, -17.7)
      root.add(lt)
    }
  }
  // quotes on walls that carry no painting
  for (let l = 1; l <= 3; l++) {
    const y = LV[l] + 2.4
    if (l !== 1) quote(l, IX0 + 0.04, y, -6.3, 1, 0)
    if (l !== 2) quote(l + 1, IX0 + 0.04, y, -17.7, 1, 0)
    if (l !== 2) quote(l + 2, IX1 - 0.04, y, -6.3, -1, 0)
    if (l !== 3) quote(l + 3, IX1 - 0.04, y, -17.7, -1, 0)
    quote(l + 1, -26.5, y, -12 - 0.15 - 0.04, 0, -1)
  }

  /* ---------- Stairs (levels 0→1→2→3) ---------- */
  for (let l = 0; l < 3; l++) {
    const y0 = LV[l], y1 = LV[l + 1], mid = (y0 + y1) / 2
    const AX0 = -20.9, AX1 = -18.3, BX0 = -17.5, BX1 = -14.9
    const ZS = -5, ZM = -9.2
    const n = 15
    const rise = (mid - y0) / n, run = (ZS - ZM) / n
    for (let i = 0; i < n; i++) {
      // flight A heads -z from ZS, flight B heads +z from ZM
      const za0 = ZS - i * run, za1 = ZS - (i + 1) * run
      const topA = y0 + (i + 1) * rise
      b.box(M.stone, AX0, topA - 0.04, za1, AX1, topA, za0)
      b.box(M.white, AX0, topA - 0.2, za1, AX1, topA - 0.04, za0 + 0.01)
      const zb0 = ZM + i * run, zb1 = ZM + (i + 1) * run
      const topB = mid + (i + 1) * rise
      b.box(M.stone, BX0, topB - 0.04, zb0, BX1, topB, zb1)
      b.box(M.white, BX0, topB - 0.2, zb0 - 0.01, BX1, topB - 0.04, zb1)
    }
    const ang = Math.atan2(mid - y0, ZS - ZM)
    const len = Math.hypot(mid - y0, ZS - ZM)
    b.boxC(M.white, (AX0 + AX1) / 2, (y0 + mid) / 2 - 0.3, (ZS + ZM) / 2, AX1 - AX0, 0.2, len, 0, ang)
    b.boxC(M.white, (BX0 + BX1) / 2, (mid + y1) / 2 - 0.3, (ZS + ZM) / 2, BX1 - BX0, 0.2, len, 0, -ang)
    // landing
    b.box(M.concrete, AX0, mid - 0.4, -12.4, BX1, mid - 0.04, ZM)
    b.box(M.stone, AX0, mid - 0.04, -12.4, BX1, mid, ZM)
    b.flat(AX0, -12.4, BX1, ZM, mid)
    b.ramp(AX0, ZM, AX1, ZS, 'z', ZS, ZM, y0, mid)
    b.ramp(BX0, ZM, BX1, ZS, 'z', ZM, ZS, mid, y1)
    // rails: inner (between flights), B outer edge, landing back/side
    slopeRail((AX1 + BX0) / 2, ZS, y0, ZM, mid)
    slopeRail((AX1 + BX0) / 2 + 0.0001, ZM, mid, ZS, y1 > mid ? y1 : mid)
    slopeRail(BX1, ZM, mid, ZS, y1)
    if (l === 0) b.seg(AX0, ZM, AX1 + 0.4, ZM, 0, 1.9) // no walking under the low part of flight A
    rail(AX0, -12.4, BX1, -12.4, mid)
    rail(BX1, -12.4, BX1, ZM, mid)
  }

  /* roof + stair-hall skylight */
  const RY = 19.65
  b.box(M.concrete, -40, RY, IZ0 - 0.6, -21, 20.25, 0)
  b.box(M.concrete, -9, RY, IZ0 - 0.6, 10, 20.25, 0)
  b.box(M.concrete, -21, RY, IZ0 - 0.6, -9, 20.25, -19)
  b.box(M.concrete, -21, RY, -5, -9, 20.25, 0)
  b.box(M.roofTop, -40, 20.25, -24, -21, 20.29, 0)
  b.box(M.roofTop, -9, 20.25, -24, 10, 20.29, 0)
  b.box(M.roofTop, -21, 20.25, -24, -9, 20.29, -19)
  b.box(M.roofTop, -21, 20.25, -5, -9, 20.29, 0)
  b.box(M.glass, -21, 20.06, -19, -9, 20.08, -5)
  for (let x = -21; x <= -9.01; x += 1.5) b.box(M.steel, x - 0.05, 19.7, -19, x + 0.05, 20.1, -5)
  for (let z = -19; z <= -4.99; z += 2.0) b.box(M.steel, -21, 19.95, z - 0.04, -9, 20.1, z + 0.04)
  // skylight kerbs hide roof thickness
  b.box(M.facade, -21.3, 20.25, -19.3, -8.7, 20.5, -19)
  b.box(M.facade, -21.3, 20.25, -5, -8.7, 20.5, -4.7)
  b.box(M.facade, -21.3, 20.25, -19, -21, 20.5, -5)
  b.box(M.facade, -9, 20.25, -19, -8.7, 20.5, -5)

  // level wayfinding signs in the stair hall
  for (let l = 0; l < 4; l++) {
    const t = canvasTex(512, 256, (g, w, h) => {
      g.clearRect(0, 0, w, h)
      g.fillStyle = '#f2c230'; g.fillRect(0, 0, 160, h)
      g.fillStyle = '#1b1a19'; g.font = '700 150px Helvetica, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'
      g.fillText(String(l), 80, h / 2 + 8)
      g.fillStyle = '#fbf8ef'; g.textAlign = 'left'
      g.font = '700 40px Helvetica, Arial, sans-serif'
      g.fillText('LEVEL ' + l, 186, 96)
      g.font = '500 30px Helvetica, Arial, sans-serif'
      const lines = wrap(g, LEVEL_TITLES[l], 310)
      lines.forEach((s, i) => g.fillText(s, 186, 146 + i * 36))
    })
    decal(t, 2.4, 1.2, -21 + 0.16, LV[l] + 2.6, -14.2, 1, 0)
  }

  /* ============================== LEVEL 0 FURNISHING ============================== */
  {
    const y = LV[0]
    // shop
    shelf(IX0 + 0.1, -11.4, IX0 + 0.75, -1.2, y)
    shelf(-38, -11.5, -30, -10.9, y)
    for (const [x, z] of [[-32, -7.5], [-27, -8.5], [-30, -4], [-25, -5.5]]) {
      b.box(M.wood, x - 1.0, y, z - 0.6, x + 1.0, y + 0.85, z + 0.6)
      for (let i = 0; i < 7; i++) b.box(pick(prod, i, (x | 0) + 3), x - 0.9 + i * 0.27, y + 0.85, z - 0.45, x - 0.9 + i * 0.27 + 0.22, y + 1.0 + hash2(i, z | 0, 6) * 0.18, z + 0.45)
      colBox(x - 1.0, z - 0.6, x + 1.0, z + 0.6, y, y + 0.9)
    }
    b.box(M.white, -26.5, y, -3.8, -23.5, y + 1.05, -2.4)
    b.box(M.deskTop, -26.6, y + 1.05, -3.9, -23.4, y + 1.09, -2.3)
    colBox(-26.6, -3.9, -23.4, -2.3, y, y + 1.1)
    decal(textTex(1024, 256, 'MUSEUM SHOP', { font: '700 SIZEpx Helvetica, Arial, sans-serif', color: '#f2c230', size: 130, align: 'center' }), 4.2, 1.05, -26, 3.1, -12 + 0.15 + 0.045, 0, 1)
    // cloakroom lockers
    for (let i = 0; i < 12; i++) {
      const z = IZ0 + 0.6 + i * 0.85
      b.box(M.darkMetal, IX0 + 0.05, y, z, IX0 + 0.65, y + 1.9, z + 0.8)
      b.box(M.yellow, IX0 + 0.65, y + 0.1, z + 0.05, IX0 + 0.67, y + 1.8, z + 0.75)
    }
    colBox(IX0, IZ0 + 0.5, IX0 + 0.7, -13.0, y, y + 2)
    b.box(M.white, -30, y, -22.2, -24, y + 1.05, -21.2); colBox(-30, -22.2, -24, -21.2, y, y + 1.1)
    b.box(M.deskTop, -30.1, y + 1.05, -22.3, -23.9, y + 1.09, -21.1)
    decal(textTex(1024, 256, 'CLOAKROOM & LOCKERS', { font: '700 SIZEpx Helvetica, Arial, sans-serif', color: '#2a2724', size: 100, align: 'center' }), 4.4, 1.1, -27, 3.0, -12 - 0.15 - 0.045, 0, -1)
    // lobby: ticket gates + desks + plants
    for (const x of [-3.6, -1.2, 1.2, 3.6]) {
      b.box(M.white, x - 0.08, y, -6.6, x + 0.08, y + 1.0, -5.4)
      b.box(M.steel, x - 0.1, y + 1.0, -6.6, x + 0.1, y + 1.04, -5.4)
      b.box(M.yellow, x - 0.02, y + 1.04, -6.3, x + 0.02, y + 1.12, -5.7)
      colBox(x - 0.1, -6.6, x + 0.1, -5.4, y, y + 1.1)
    }
    b.box(M.white, 5, y, -10, 8.2, y + 1.05, -8.8); colBox(5, -10, 8.2, -8.8, y, y + 1.1)
    b.box(M.deskTop, 4.9, y + 1.05, -10.1, 8.3, y + 1.09, -8.7)
    decal(textTex(1024, 256, 'INFORMATION', { font: '700 SIZEpx Helvetica, Arial, sans-serif', color: '#f2c230', size: 120, align: 'center' }), 3.6, 0.9, 6.6, 2.7, -12 + 0.15 + 0.045 + 0.0, 0, 1).visible = false
    plant(-7.9, y, -2.6); plant(8.2, y, -2.6); plant(8.2, y, -10.8); plant(-7.9, y, -10.8, 1.2)
    bench(5, y, -2.6, 2.4, true)
    // café
    b.box(M.white, -7, y, -22.9, 5, y + 1.05, -21.7); colBox(-7, -22.9, 5, -21.7, y, y + 1.1)
    b.box(M.deskTop, -7.1, y + 1.05, -23.0, 5.1, y + 1.09, -21.6)
    for (let i = 0; i < 5; i++) b.cyl(M.steel, -5.5 + i * 2.5, y + 1.09, -22.3, 0.12, 0.3, 12)
    decal(textTex(1024, 256, 'CAFÉ', { font: '700 SIZEpx Helvetica, Arial, sans-serif', color: '#f2c230', size: 150, align: 'center' }), 2.6, 0.7, -1, 3.2, IZ0 + 0.045, 0, 1)
    for (const [x, z] of [[-5, -16.5], [-1.5, -16.5], [2, -16.5], [-5, -13.4], [-1.5, -13.4], [2, -13.4], [6.5, -15], [6.5, -18.5]]) table(x, z, y)
    anchors.push({ x: -34.8, y: 3.5, z: -6.3 }, { x: -4.6, y: 3.5, z: -6.3 })
  }

  /* ============================== GLASS ENTRANCE HALL ============================== */
  {
    const { x0, x1, z0, z1, h } = HALL
    b.box(M.concrete, x0 - 0.2, -0.35, z0, x1 + 0.2, 0.0, z1 + 0.2)
    b.box(M.stone, x0 - 0.2, 0.0, z0, x1 + 0.2, 0.02, z1 + 0.2)
    b.flat(x0 - 0.2, z0, x1 + 0.2, z1 + 0.2, 0.02)
    // roof, soffit, fascia
    b.box(M.white, x0 - 1.5, h, z0, x1 + 1.5, h + 0.35, z1 + 1.6)
    b.box(M.roofTop, x0 - 1.5, h + 0.35, z0, x1 + 1.5, h + 0.39, z1 + 1.6)
    b.box(M.teal, x0 - 1.5, h - 0.5, z1 + 1.5, x1 + 1.5, h + 0.9, z1 + 1.6)
    b.box(M.teal, x0 - 1.6, h - 0.5, z0, x0 - 1.5, h + 0.9, z1 + 1.6)
    b.box(M.teal, x1 + 1.5, h - 0.5, z0, x1 + 1.6, h + 0.9, z1 + 1.6)
    for (let x = x0 + 2; x < x1; x += 4) b.box(M.ceilingLight, x - 0.18, h - 0.03, z0 + 0.5, x + 0.18, h, z1 + 1.3)
    // glass walls
    const gw = (along: 'x' | 'z', c: number, t0: number, t1: number, open?: Opening[]) => b.wall({ along, c, t0, t1, y0: 0, y1: h, th: 0.04, core: M.glass, open: open?.map((o) => ({ ...o, walk: true })) })
    gw('x', z1, x0, x1, [{ a: 3, b: 9, h: 3.5 }])
    gw('z', x0, z0, z1)
    gw('z', x1, z0, z1, [{ a: 3.5, b: 8.5, h: 3.6 }])
    gw('x', z0 + 0.02, 10, x1)
    // mullions + transoms
    const mull = (x: number, z: number) => b.box(M.steel, x - 0.045, 0, z - 0.075, x + 0.045, h, z + 0.075)
    for (let x = x0; x <= x1 + 0.01; x += 2) { if (x > 2.5 && x < 9.5 && x !== 3 && x !== 9) continue; mull(x, z1) }
    mull(3, z1); mull(9, z1)
    for (let z = z0; z <= z1 + 0.01; z += 2) { mull(x0, z); if (z < 3.2 || z > 8.8) mull(x1, z) }
    mull(x1, 3.5); mull(x1, 8.5)
    for (let x = 10; x <= x1; x += 2) mull(x, z0 + 0.02)
    b.box(M.steel, x0, 3.5, z1 - 0.04, x1, 3.56, z1 + 0.04)
    b.box(M.steel, x0, h - 0.06, z1 - 0.04, x1, h, z1 + 0.04)
    b.box(M.steel, x0 - 0.04, 3.5, z0, x0 + 0.04, 3.56, z1)
    b.box(M.steel, x1 - 0.04, 3.5, z0, x1 + 0.04, 3.56, z1)
    b.box(M.steel, 3, 3.45, z1 - 0.04, 9, 3.5, z1 + 0.04)
    // columns
    for (const [cx, cz] of [[-3, 8], [11, 8], [19, 3], [19, 11]]) {
      b.cyl(M.white, cx, 0.02, cz, 0.16, h - 0.02, 20)
      b.seg(cx - 0.2, cz, cx + 0.2, cz, 0, 3); b.seg(cx, cz - 0.2, cx, cz + 0.2, 0, 3)
    }
    // desks, signs, plants, benches
    for (const dx of [12.5, 17.5]) {
      b.box(M.teal, dx - 1.8, 0.02, 2.3, dx + 1.8, 1.05, 3.5)
      b.box(M.deskTop, dx - 1.9, 1.05, 2.2, dx + 1.9, 1.09, 3.6)
      colBox(dx - 1.9, 2.2, dx + 1.9, 3.6, 0, 1.2)
    }
    decal(textTex(1024, 256, 'TICKETS · INFORMATION', { font: '700 SIZEpx Helvetica, Arial, sans-serif', color: '#f2c230', size: 90, align: 'center' }), 5.2, 1.3, 15, 4.3, 3.55, 0, 1).position.z = 1.2
    // hanging sign board
    b.box(M.teal, 12.2, 3.9, 1.1, 17.8, 4.9, 1.2)
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(5.4, 0.9), new THREE.MeshBasicMaterial({ map: textTex(1024, 170, 'TICKETS · INFORMATION', { font: '700 SIZEpx Helvetica, Arial, sans-serif', color: '#f2c230', size: 96, align: 'center' }), transparent: true }))
    sign.position.set(15, 4.4, 1.22)
    root.add(sign)
    const sign2 = sign.clone(); sign2.rotation.y = Math.PI; sign2.position.z = 1.08
    root.add(sign2)
    decals.children.pop()?.removeFromParent()
    plant(-6.2, 0.02, 12.2, 1.4); plant(22.2, 0.02, 12.2, 1.4); plant(-6.2, 0.02, 2.2, 1.2)
    bench(-2, 0.02, 12.6, 3, true); bench(20, 0.02, 13, 3, true)
    // facade lettering
    const fas = new THREE.Mesh(new THREE.PlaneGeometry(22, 1.2), new THREE.MeshBasicMaterial({ map: textTex(2048, 130, 'VAN GOGH MUSEUM', { font: '700 SIZEpx Helvetica, Arial, sans-serif', color: '#f2c230', size: 120, align: 'center' }), transparent: true, toneMapped: false }))
    fas.position.set(8, h + 0.2, z1 + 1.615)
    root.add(fas)
    anchors.push({ x: 0, y: 6, z: 6 }, { x: 8, y: 6, z: 9 }, { x: 16, y: 6, z: 6 }, { x: 20, y: 6, z: 11 }, { x: 0, y: 6, z: 11 })
  }

  /* ============================== KUROKAWA EXHIBITION WING ============================== */
  buildWing(b, M, root, anchors, colBox, bench, decal)

  /* ============================== OUTDOORS ============================== */
  const glow: Glow[] = [
    { mat: M.ceilingLight, base: 1.25, night: 2.2 },
  ]
  buildOutdoors(b, M, root, glow, colBox)

  b.flat(-400, -400, 400, 400, 0)

  root.add(b.build(true, true))

  const teleports: Teleport[] = [
    { id: 'plaza', label: 'Museumplein', x: 10, y: 0, z: 44, yaw: 0 },
    { id: 'hall', label: 'Entrance Hall', x: 6, y: 0.02, z: 11, yaw: 0 },
    { id: 'stair', label: 'Stair Hall', x: -15, y: 0.02, z: -2.4, yaw: 0 },
    { id: 'l1', label: 'Level 1 · Early years', x: -15, y: 5, z: -2.8, yaw: Math.PI / 2 },
    { id: 'l2', label: 'Level 2 · Arles', x: -15, y: 10, z: -2.8, yaw: Math.PI / 2 },
    { id: 'l3', label: 'Level 3 · Last years', x: -15, y: 15, z: -2.8, yaw: -Math.PI / 2 },
    { id: 'wing', label: 'Exhibition Wing', x: 30, y: 0.02, z: 6, yaw: -Math.PI / 2 },
  ]

  const zoneAt = (x: number, y: number, z: number) => {
    if (x > IX0 - 0.3 && x < IX1 + 0.3 && z > IZ0 - 0.3 && z < IZ1 + 0.3) {
      const l = y < 2.5 ? 0 : y < 7.5 ? 1 : y < 12.5 ? 2 : 3
      const hall = x > -21 && x < -9
      if (l === 0) return { name: hall ? 'Stair Hall' : x < -21 ? (z > -12 ? 'Museum Shop' : 'Cloakroom') : z > -12 ? 'Lobby' : 'Café', inside: 1 }
      return { name: hall ? `Stair Hall · Level ${l}` : `Level ${l} · ${LEVEL_TITLES[l]}`, inside: 1 }
    }
    if (x > HALL.x0 && x < HALL.x1 && z > HALL.z0 && z < HALL.z1 + 0.5) return { name: 'Glass Entrance Hall', inside: 0.55 }
    const ex = (x - WING.cx) / (WING.a - 0.5), ez = (z - WING.cz) / (WING.b - 0.5)
    if (ex * ex + ez * ez < 1) return { name: 'Exhibition Wing (Kurokawa)', inside: 1 }
    return { name: 'Museumplein', inside: 0 }
  }

  return { group: root, segs: b.segs, surfs: b.surfs, anchors, paintings, glow, teleports, zoneAt }
}

/* --------------------------------------------------------------- the wing */
function buildWing(
  b: Builder, M: Materials, root: THREE.Group, anchors: Anchor[],
  colBox: (x0: number, z0: number, x1: number, z1: number, y0: number, y1: number) => void,
  bench: (x: number, y: number, z: number, len: number, alongX?: boolean) => void,
  decal: (tex: THREE.Texture, w: number, h: number, x: number, y: number, z: number, nx: number, nz: number, emissive?: number) => THREE.Mesh,
) {
  const { cx, cz, a, b: bb } = WING
  const N = 120
  const T = 0.5
  const IH = 9
  const topAt = (x: number) => 17 + (5 * (x - (cx - a))) / (2 * a)
  const pt = (i: number, ra: number, rb: number) => {
    const t = ((i % N) / N) * Math.PI * 2
    return { x: cx + ra * Math.cos(t), z: cz + rb * Math.sin(t), nx: Math.cos(t) / ra, nz: Math.sin(t) / rb }
  }
  const inGap = (p: { x: number; z: number }) => p.x < cx - a + 7 && p.z > 3.5 && p.z < 8.5
  const DOORH = 3.8
  const pos: number[] = [], nor: number[] = [], uv: number[] = []
  const posI: number[] = [], norI: number[] = [], uvI: number[] = []
  const quad = (P: number[], N_: number[], U: number[], v: THREE.Vector3[], n: THREE.Vector3[], u: number[][], want: THREE.Vector3 | null) => {
    // v: 4 verts (00,10,11,01)
    const fn = new THREE.Vector3().subVectors(v[1], v[0]).cross(new THREE.Vector3().subVectors(v[2], v[0]))
    const flip = want ? fn.dot(want) < 0 : false
    const order = flip ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3]
    for (const k of order) {
      P.push(v[k].x, v[k].y, v[k].z)
      N_.push(n[k].x, n[k].y, n[k].z)
      U.push(u[k][0], u[k][1])
    }
  }
  let arcO = 0
  const segsPts: { x: number; z: number }[] = []
  for (let i = 0; i < N; i++) {
    const p0o = pt(i, a, bb), p1o = pt(i + 1, a, bb)
    const p0i = pt(i, a - T, bb - T), p1i = pt(i + 1, a - T, bb - T)
    const L = Math.hypot(p1o.x - p0o.x, p1o.z - p0o.z)
    const gap = inGap(p0o) && inGap(p1o)
    const yb0 = gap ? DOORH : -0.3
    const V = (p: { x: number; z: number }, y: number) => new THREE.Vector3(p.x, y, p.z)
    const Nn = (p: { nx: number; nz: number }, s: number) => new THREE.Vector3(p.nx * s, 0, p.nz * s).normalize()
    // outer
    quad(pos, nor, uv,
      [V(p0o, yb0), V(p1o, yb0), V(p1o, topAt(p1o.x)), V(p0o, topAt(p0o.x))],
      [Nn(p0o, 1), Nn(p1o, 1), Nn(p1o, 1), Nn(p0o, 1)],
      [[arcO, yb0], [arcO + L, yb0], [arcO + L, topAt(p1o.x)], [arcO, topAt(p0o.x)]],
      Nn(p0o, 1))
    arcO += L
    // inner
    quad(posI, norI, uvI,
      [V(p0i, yb0), V(p1i, yb0), V(p1i, IH), V(p0i, IH)],
      [Nn(p0i, -1), Nn(p1i, -1), Nn(p1i, -1), Nn(p0i, -1)],
      [[p0i.x, yb0], [p1i.x, yb0], [p1i.x, IH], [p0i.x, IH]],
      Nn(p0i, -1))
    if (gap) {
      // lintel underside
      const pp: number[] = [], nn: number[] = [], uu: number[] = []
      quad(pp, nn, uu, [V(p0i, DOORH), V(p1i, DOORH), V(p1o, DOORH), V(p0o, DOORH)], [new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, -1, 0)], [[0, 0], [1, 0], [1, 1], [0, 1]], new THREE.Vector3(0, -1, 0))
      pos.push(...pp); nor.push(...nn); uv.push(...uu)
    } else {
      segsPts.push({ x: p0o.x, z: p0o.z }, { x: p1o.x, z: p1o.z })
    }
    // jambs (at transitions)
    const prevGap = inGap(pt(i, a, bb)) && inGap(pt(i - 1 + N, a, bb))
    const nextGap = inGap(pt(i + 1, a, bb)) && inGap(pt(i + 2, a, bb))
    const addJamb = (po: { x: number; z: number }, pi: { x: number; z: number }, dir: THREE.Vector3) => {
      const pp: number[] = [], nn: number[] = [], uu: number[] = []
      quad(pp, nn, uu, [V(po, -0.3), V(pi, -0.3), V(pi, DOORH), V(po, DOORH)], [dir, dir, dir, dir], [[0, 0], [1, 0], [1, 1], [0, 1]], dir)
      posI.push(...pp); norI.push(...nn); uvI.push(...uu)
    }
    if (!gap && nextGap) addJamb(p1o, p1i, new THREE.Vector3(0, 0, p1o.z < cz ? 1 : -1))
    if (!gap && prevGap) addJamb(p0o, p0i, new THREE.Vector3(0, 0, p0o.z < cz ? 1 : -1))
  }
  const mkGeo = (P: number[], N_: number[], U: number[]) => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3))
    g.setAttribute('normal', new THREE.Float32BufferAttribute(N_, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2))
    return g
  }
  b.geo(M.zinc, mkGeo(pos, nor, uv), true)
  // inner wall: use world-scale uv (u = x, v = y) in plaster
  b.geo(M.wall('#e9e6df'), mkGeo(posI, norI, uvI), true)

  // roof (sloped plane), ceiling, floor
  const fan = (y: (x: number) => number, up: boolean, ra: number, rb: number, mat: THREE.Material) => {
    const P: number[] = [], N_: number[] = [], U: number[] = []
    for (let i = 0; i < N; i++) {
      const p0 = pt(i, ra, rb), p1 = pt(i + 1, ra, rb)
      const v = [new THREE.Vector3(cx, y(cx), cz), new THREE.Vector3(p0.x, y(p0.x), p0.z), new THREE.Vector3(p1.x, y(p1.x), p1.z)]
      const n = new THREE.Vector3(0, up ? 1 : -1, 0)
      const fnv = new THREE.Vector3().subVectors(v[1], v[0]).cross(new THREE.Vector3().subVectors(v[2], v[0]))
      const o = fnv.dot(n) < 0 ? [0, 2, 1] : [0, 1, 2]
      for (const k of o) { P.push(v[k].x, v[k].y, v[k].z); N_.push(n.x, n.y, n.z); U.push(v[k].x, v[k].z) }
    }
    b.geo(mat, mkGeo(P, N_, U))
  }
  M.zinc.shadowSide = THREE.DoubleSide // single-sided roof plane must still block the sun
  M.white.shadowSide = THREE.DoubleSide
  fan(topAt, true, a, bb, M.zinc)
  fan(() => IH, false, a - T + 0.25, bb - T + 0.25, M.white)
  fan(() => 0.02, true, a - T + 0.25, bb - T + 0.25, M.stone)
  b.flat(cx - a, cz - bb, cx + a, cz + bb, 0.02)
  // ceiling light rings
  for (const [ex, ez] of [[-8, 0], [0, 0], [8, 0], [-4, -6], [4, -6], [-4, 6], [4, 6]]) {
    const g = new THREE.TorusGeometry(1.2, 0.07, 6, 28)
    g.rotateX(Math.PI / 2)
    g.translate(cx + ex, IH - 0.08, cz + ez)
    b.geo(M.ceilingLight, g)
  }
  // colliders for the elliptical wall
  for (let i = 0; i < segsPts.length; i += 2) b.seg(segsPts[i].x, segsPts[i].z, segsPts[i + 1].x, segsPts[i + 1].z, 0, IH)
  // lintel above door
  // exhibition furniture: free-standing screens, plinths, vitrines
  const screens: [number, number, number, number][] = [[-8, -4, 5, 0], [6, -3, 5, 0.25], [-3, 5, 6, Math.PI / 2 - 0.1], [10, 5, 4, -0.4]]
  screens.forEach(([ox, oz, len, ry], i) => {
    const x = cx + ox, z = cz + oz
    b.boxC(M.wall(['#2f4a5c', '#b9a15a', '#7d5a50', '#4f6b5a'][i]), x, 2.2, z, len, 4.4, 0.18, ry)
    const c = Math.cos(ry), s = Math.sin(ry)
    b.seg(x - c * len / 2, z + s * len / 2, x + c * len / 2, z - s * len / 2, 0, 4.4)
    const nx = Math.sin(ry), nz = Math.cos(ry)
    decal(textTex(1024, 400, ['I am seeking, I am striving, I am in it with all my heart.', 'The sight of the stars always makes me dream.', 'What would life be if we had no courage to attempt anything?', 'It is good to love many things, for therein lies the true strength.'][i], { font: 'italic 500 SIZEpx Georgia, serif', color: '#fbf8ef', size: 76, align: 'center', shadow: true }), len * 0.7, len * 0.7 * 0.39, x + nx * 0.1, 2.4, z + nz * 0.1, nx, nz)
  })
  for (const [ox, oz] of [[-12, 8], [0, -10], [12, -8], [-13, -6], [12, 9]]) {
    const x = cx + ox, z = cz + oz
    b.box(M.white, x - 0.6, 0.02, z - 0.6, x + 0.6, 1.0, z + 0.6)
    b.box(M.glass, x - 0.6, 1.0, z - 0.6, x + 0.6, 1.5, z + 0.6)
    b.boxC(M.wall('#8b7a58'), x, 1.05, z, 0.8, 0.02, 0.6, 0.4)
    colBox(x - 0.6, z - 0.6, x + 0.6, z + 0.6, 0, 1.6)
  }
  bench(cx - 10, 0.02, cz + 1.5, 2.4, false); bench(cx + 13, 0.02, cz - 1, 2.4, false)
  for (const [ox, oz] of [[-9, 0], [0, 0], [9, 0], [0, 9], [0, -9], [-9, 8], [9, -8]]) anchors.push({ x: cx + ox, y: 7.8, z: cz + oz })
  void root
}

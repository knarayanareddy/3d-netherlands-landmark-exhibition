import * as THREE from 'three'
import type { Mats } from './materials'
import type { Part, Box } from './types'
import { ROAD_Y, terrainY } from './profile'
import { makeCar } from './life'
import { mulberry32 } from './noise'

// ------------------------------------------------------------------ layout constants
export const P0 = 7.4 // plaza / terrace level (m NAP)
export const TX = -34
export const TZ = 30.5
export const BX = 8 // footbridge axis
export const BD = ROAD_Y + 5.5 // footbridge deck level
export const SX = 24 // Lely statue
export const SZ = -30
const RISE = 0.19
const STEPS = 96
const SPT = 16 // steps per turn
export const TOWER_H = RISE * STEPS // 18.24 : balcony level above plaza
const PHI0 = -Math.PI / 2 // stair ends facing north (the Wadden Sea)
const PR = 0.32 // player radius

type MatLike = THREE.Material | THREE.Material[]

function boxGeo(w: number, h: number, d: number, yMin = 0) {
  const g = new THREE.BoxGeometry(w, h, d)
  const uv = g.attributes.uv
  const dims: [number, number][] = [
    [d, h],
    [d, h],
    [w, d],
    [w, d],
    [w, h],
    [w, h],
  ]
  for (let f = 0; f < 6; f++) {
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i
      let v = uv.getY(k) * dims[f][1]
      if (f !== 2 && f !== 3) v += yMin
      uv.setXY(k, uv.getX(k) * dims[f][0], v)
    }
  }
  return g
}

function addBox(parent: THREE.Object3D, w: number, h: number, d: number, mat: MatLike, x: number, y: number, z: number, shadow = true) {
  const m = new THREE.Mesh(boxGeo(w, h, d, y - h / 2), mat)
  m.position.set(x, y, z)
  m.castShadow = shadow
  m.receiveShadow = true
  parent.add(m)
  return m
}

interface Opening {
  u0: number
  u1: number
  v0: number
  v1: number
}

function wall(
  parent: THREE.Object3D,
  axis: 'x' | 'z',
  cx: number,
  cz: number,
  y0: number,
  len: number,
  height: number,
  thick: number,
  outward: 1 | -1,
  openings: Opening[],
  out: THREE.Material,
  inn: THREE.Material,
  top: THREE.Material,
) {
  const clampU = (u: number) => Math.max(-len / 2, Math.min(len / 2, u))
  const us = [-len / 2, len / 2]
  for (const o of openings) us.push(clampU(o.u0), clampU(o.u1))
  us.sort((a, b) => a - b)
  const outIdx = axis === 'x' ? (outward > 0 ? 4 : 5) : outward > 0 ? 0 : 1
  const inIdx = axis === 'x' ? (outward > 0 ? 5 : 4) : outward > 0 ? 1 : 0
  const mats: THREE.Material[] = [out, out, top, out, out, out]
  mats[inIdx] = inn
  mats[outIdx] = out
  for (let i = 0; i < us.length - 1; i++) {
    const ua = us[i]
    const ub = us[i + 1]
    if (ub - ua < 1e-4) continue
    const cov = openings.filter((o) => o.u0 <= ua + 1e-6 && o.u1 >= ub - 1e-6).sort((a, b) => a.v0 - b.v0)
    let cur = 0
    const piece = (va: number, vb: number) => {
      if (vb - va < 1e-4) return
      const ul = ub - ua
      const vl = vb - va
      const uc = (ua + ub) / 2
      const yc = y0 + (va + vb) / 2
      if (axis === 'x') addBox(parent, ul, vl, thick, mats, cx + uc, yc, cz)
      else addBox(parent, thick, vl, ul, mats, cx, yc, cz + uc)
    }
    for (const o of cov) {
      if (o.v0 > cur) piece(cur, o.v0)
      cur = Math.max(cur, o.v1)
    }
    piece(cur, height)
  }
}

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, srgb = true) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  draw(c.getContext('2d')!)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
  t.anisotropy = 8
  return t
}

function makeRelief() {
  const W = 768
  const Hh = 384
  const hc = document.createElement('canvas')
  hc.width = W
  hc.height = Hh
  const g = hc.getContext('2d')!
  g.fillStyle = '#3a3a3a'
  g.fillRect(0, 0, W, Hh)
  g.strokeStyle = '#8a8a8a'
  g.lineWidth = 14
  g.strokeRect(14, 14, W - 28, Hh - 28)
  g.lineCap = 'round'
  g.lineJoin = 'round'
  g.strokeStyle = '#e0e0e0'
  g.fillStyle = '#e0e0e0'
  // ground row of basalt blocks
  for (let i = 0; i < 12; i++) {
    g.fillStyle = i % 2 ? '#bcbcbc' : '#cfcfcf'
    g.fillRect(40 + i * 60, 335, 54, 34)
  }
  const figure = (x: number, dir: number, lean: number) => {
    g.strokeStyle = '#e8e8e8'
    g.fillStyle = '#e8e8e8'
    const hipX = x
    const hipY = 280
    const shX = x + dir * lean
    const shY = 170 + (lean - 60) * 0.6
    g.lineWidth = 34
    g.beginPath()
    g.moveTo(hipX, hipY)
    g.lineTo(x - dir * 55, 345)
    g.stroke()
    g.beginPath()
    g.moveTo(hipX, hipY)
    g.lineTo(x + dir * 40, 305)
    g.lineTo(x + dir * 22, 345)
    g.stroke()
    g.lineWidth = 62
    g.beginPath()
    g.moveTo(hipX, hipY)
    g.lineTo(shX, shY)
    g.stroke()
    g.lineWidth = 24
    g.beginPath()
    g.moveTo(shX, shY)
    g.lineTo(shX + dir * 70, 250)
    g.stroke()
    g.beginPath()
    g.arc(shX + dir * 32, shY - 36, 27, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = '#f2f2f2'
    g.fillRect(shX + dir * 70 - 34, 246, 68, 48)
  }
  figure(150, 1, 70)
  figure(380, 1, 55)
  figure(620, -1, 65)
  const img = g.getImageData(0, 0, W, Hh)
  const hgt = new Float32Array(W * Hh)
  for (let i = 0; i < W * Hh; i++) hgt[i] = img.data[i * 4] / 255
  // box blur
  const blur = new Float32Array(W * Hh)
  const R = 3
  for (let y = 0; y < Hh; y++) {
    for (let x = 0; x < W; x++) {
      let s = 0
      let n = 0
      for (let j = -R; j <= R; j += 1) {
        for (let i = -R; i <= R; i += 1) {
          const xx = x + i
          const yy = y + j
          if (xx < 0 || yy < 0 || xx >= W || yy >= Hh) continue
          s += hgt[yy * W + xx]
          n++
        }
      }
      blur[y * W + x] = s / n
    }
  }
  const col = document.createElement('canvas')
  col.width = W
  col.height = Hh
  const cg = col.getContext('2d')!
  const cd = cg.createImageData(W, Hh)
  const nor = document.createElement('canvas')
  nor.width = W
  nor.height = Hh
  const ng = nor.getContext('2d')!
  const nd = ng.createImageData(W, Hh)
  for (let y = 0; y < Hh; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x
      const h = blur[i]
      const xm = blur[y * W + Math.max(0, x - 1)]
      const xp = blur[y * W + Math.min(W - 1, x + 1)]
      const ym = blur[Math.max(0, y - 1) * W + x]
      const yp = blur[Math.min(Hh - 1, y + 1) * W + x]
      let nx = -(xp - xm) * 9
      let ny = (yp - ym) * 9
      let nz = 1
      const l = Math.hypot(nx, ny, nz)
      nx /= l
      ny /= l
      nz /= l
      nd.data[i * 4] = (nx * 0.5 + 0.5) * 255
      nd.data[i * 4 + 1] = (ny * 0.5 + 0.5) * 255
      nd.data[i * 4 + 2] = (nz * 0.5 + 0.5) * 255
      nd.data[i * 4 + 3] = 255
      const k = 0.55 + h * 0.75
      cd.data[i * 4] = 70 * k
      cd.data[i * 4 + 1] = 82 * k
      cd.data[i * 4 + 2] = 58 * k
      cd.data[i * 4 + 3] = 255
    }
  }
  cg.putImageData(cd, 0, 0)
  ng.putImageData(nd, 0, 0)
  const map = new THREE.CanvasTexture(col)
  map.colorSpace = THREE.SRGBColorSpace
  map.anisotropy = 8
  const normalMap = new THREE.CanvasTexture(nor)
  normalMap.anisotropy = 8
  return { map, normalMap }
}

export interface Monument extends Part {
  setNight: (n: number) => void
  towerTop: THREE.Vector3
}

export function buildMonument(mats: Mats): Monument {
  const group = new THREE.Group()
  const colliders: Box[] = []
  const col = (cx: number, cz: number, hx: number, hz: number, y0: number, y1: number) =>
    colliders.push({ x0: cx - hx, x1: cx + hx, z0: cz - hz, z1: cz + hz, y0, y1 })
  const rnd = mulberry32(99)

  const brick = mats.brick
  const stone = mats.stone
  const plaster = mats.plaster
  const inConcrete = mats.concrete.clone()
  inConcrete.color.multiplyScalar(0.8)
  const inStone = mats.stone.clone()
  inStone.color.multiplyScalar(0.8)
  const inSteel = mats.steelPainted.clone()
  mats.interior.push(inConcrete, inStone, inSteel)

  // ================================================================ DUDOK TOWER
  const tower = new THREE.Group()
  tower.position.set(TX, 0, TZ)
  group.add(tower)
  const T = (x: number, y: number, z: number): [number, number, number] => [x, y, z]
  void T

  // klinker apron
  addBox(group, 19, 0.03, 19, mats.klinker, TX, P0 + 0.015, TZ, false)

  // ground floor inside
  addBox(tower, 5.9, 0.05, 5.9, inStone, 0, P0 + 0.03, 0, false)
  addBox(tower, 2.6, 0.05, 2.2, inStone, 4.3, P0 + 0.03, 0, false)

  const wallSet = (half: number, thick: number, y0: number, height: number, openingsE: Opening[] = [], openingsAll: Opening[] = []) => {
    const full = half * 2
    const mid = half - thick / 2
    wall(tower, 'x', 0, -mid, y0, full, height, thick, -1, openingsAll, brick, plaster, stone)
    wall(tower, 'x', 0, mid, y0, full, height, thick, 1, openingsAll, brick, plaster, stone)
    wall(tower, 'z', mid, 0, y0, full - thick * 2, height, thick, 1, openingsE, brick, plaster, stone)
    wall(tower, 'z', -mid, 0, y0, full - thick * 2, height, thick, -1, openingsAll, brick, plaster, stone)
  }
  const Y = P0
  // base block with entrance passage on the east side
  wallSet(5.5, 2.5, Y, 4.2, [{ u0: -1.1, u1: 1.1, v0: 0, v1: 3.0 }])
  // tier 2
  wallSet(4.6, 1.6, Y + 4.2, 1.8)
  // shaft with slit windows
  const slits: Opening[] = []
  for (const u of [-1.9, 0, 1.9]) {
    for (const [a, b] of [
      [1.4, 4.6],
      [6.4, 9.6],
      [10.8, 12.0],
    ]) {
      slits.push({ u0: u - 0.17, u1: u + 0.17, v0: a, v1: b })
    }
  }
  const slitsE = slits.filter((s) => Math.abs((s.u0 + s.u1) / 2) < 2.4)
  wallSet(3.7, 0.7, Y + 6.0, TOWER_H - 6.0, slitsE, slits)

  // upper lookout floor with big windows and doors N/E/S
  const lookoutOpen = (door: boolean): Opening[] =>
    door
      ? [
          { u0: -0.8, u1: 0.8, v0: 0, v1: 2.3 },
          { u0: -2.7, u1: -1.3, v0: 0.9, v1: 2.4 },
          { u0: 1.3, u1: 2.7, v0: 0.9, v1: 2.4 },
        ]
      : [
          { u0: -2.7, u1: -1.3, v0: 0.9, v1: 2.4 },
          { u0: -0.8, u1: 0.8, v0: 0.9, v1: 2.4 },
          { u0: 1.3, u1: 2.7, v0: 0.9, v1: 2.4 },
        ]
  {
    const y0 = Y + TOWER_H
    const h = 3.3
    wall(tower, 'x', 0, -3.35, y0, 7.4, h, 0.7, -1, lookoutOpen(true), brick, plaster, stone)
    wall(tower, 'x', 0, 3.35, y0, 7.4, h, 0.7, 1, lookoutOpen(true), brick, plaster, stone)
    wall(tower, 'z', 3.35, 0, y0, 6.0, h, 0.7, 1, lookoutOpen(true), brick, plaster, stone)
    wall(tower, 'z', -3.35, 0, y0, 6.0, h, 0.7, -1, lookoutOpen(false), brick, plaster, stone)
  }

  // stone belts & cornices (Dudok's horizontal banding)
  const band = (half: number, y: number, h: number, ex = 0.12) => addBox(tower, half * 2 + ex * 2, h, half * 2 + ex * 2, stone, 0, y, 0)
  band(5.5, Y + 4.1, 0.24)
  band(4.6, Y + 5.9, 0.22)
  band(3.7, Y + 9.0, 0.2, 0.1)
  band(3.7, Y + 14.0, 0.2, 0.1)
  band(3.7, Y + 6.1, 0.2, 0.08)

  // roof, crown
  const yb = Y + TOWER_H
  addBox(tower, 9.6, 0.4, 9.6, stone, 0, yb + 3.5, 0) // roof slab / cornice
  addBox(tower, 7.8, 1.5, 7.8, brick, 0, yb + 4.45, 0)
  addBox(tower, 8.2, 0.25, 8.2, stone, 0, yb + 5.3, 0)
  addBox(tower, 4.8, 1.4, 4.8, brick, 0, yb + 6.1, 0)
  addBox(tower, 5.4, 0.22, 5.4, stone, 0, yb + 6.9, 0)
  const topY = yb + 7.0
  // flagpole
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 7, 8), mats.steel)
  pole.position.set(0, topY + 3.5, 0)
  pole.castShadow = true
  tower.add(pole)
  const flagTex = canvasTex(64, 48, (g) => {
    g.fillStyle = '#ae1c28'
    g.fillRect(0, 0, 64, 16)
    g.fillStyle = '#f4f4f4'
    g.fillRect(0, 16, 64, 16)
    g.fillStyle = '#21468b'
    g.fillRect(0, 32, 64, 16)
  })
  const flagGeo = new THREE.PlaneGeometry(2.4, 1.6, 14, 6)
  const flag = new THREE.Mesh(flagGeo, new THREE.MeshStandardMaterial({ map: flagTex, side: THREE.DoubleSide, roughness: 0.85 }))
  flag.position.set(1.2, topY + 6.0, 0)
  flag.castShadow = true
  tower.add(flag)
  const flagBase = flagGeo.attributes.position.array.slice() as Float32Array

  // balcony ring (stone slab) + railings
  {
    const t = 0.35
    const yy = yb - t / 2
    addBox(tower, 10.8, t, 1.7, stone, 0, yy, -4.55)
    addBox(tower, 10.8, t, 1.7, stone, 0, yy, 4.55)
    addBox(tower, 1.7, t, 7.4, stone, 4.55, yy, 0)
    addBox(tower, 1.7, t, 7.4, stone, -4.55, yy, 0)
    // railing: top rail + posts
    const rail = (cx: number, cz: number, len: number, alongX: boolean) => {
      const r = new THREE.Mesh(new THREE.BoxGeometry(alongX ? len : 0.06, 0.06, alongX ? 0.06 : len), mats.steelPainted)
      r.position.set(cx, yb + 1.1, cz)
      r.castShadow = true
      tower.add(r)
      const r2 = r.clone()
      r2.position.y = yb + 0.55
      tower.add(r2)
      const n = Math.floor(len / 0.18)
      const bars = new THREE.InstancedMesh(new THREE.BoxGeometry(0.025, 1.1, 0.025), mats.steelPainted, n)
      const m4 = new THREE.Matrix4()
      for (let i = 0; i < n; i++) {
        const o = -len / 2 + (i + 0.5) * (len / n)
        m4.makeTranslation(alongX ? cx + o : cx, yb + 0.55, alongX ? cz : cz + o)
        bars.setMatrixAt(i, m4)
      }
      bars.castShadow = true
      tower.add(bars)
    }
    rail(0, -5.4, 10.8, true)
    rail(0, 5.4, 10.8, true)
    rail(5.4, 0, 10.8, false)
    rail(-5.4, 0, 10.8, false)
    const h = 5.4
    const w = 0.15
    col(TX, TZ - h, h, w, Y + TOWER_H, Y + TOWER_H + 1.1)
    col(TX, TZ + h, h, w, Y + TOWER_H, Y + TOWER_H + 1.1)
    col(TX + h, TZ, w, h, Y + TOWER_H, Y + TOWER_H + 1.1)
    col(TX - h, TZ, w, h, Y + TOWER_H, Y + TOWER_H + 1.1)
  }

  // ---- interior: spiral stair (cantilevered steps around an open well)
  {
    const stepGeo = new THREE.BoxGeometry(1.8, 0.46, 0.98)
    const steps = new THREE.InstancedMesh(stepGeo, inConcrete, STEPS)
    const m4 = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const eul = new THREE.Euler()
    const c = new THREE.Color()
    for (let i = 0; i < STEPS; i++) {
      const phi = PHI0 + ((i + 0.5) / SPT) * Math.PI * 2
      const r = 2.18
      eul.set(0, -phi, 0)
      q.setFromEuler(eul)
      const top = Y + (i + 1) * RISE
      m4.compose(new THREE.Vector3(Math.cos(phi) * r, top - 0.23, Math.sin(phi) * r), q, new THREE.Vector3(1, 1, 1))
      steps.setMatrixAt(i, m4)
      const k = 0.92 + rnd() * 0.12
      c.setRGB(k, k, k)
      steps.setColorAt(i, c)
    }
    steps.castShadow = true
    steps.receiveShadow = true
    tower.add(steps)
    // handrail
    const pts: THREE.Vector3[] = []
    for (let i = 0; i <= STEPS * 2; i++) {
      const t = i / (STEPS * 2)
      const phi = PHI0 + t * (STEPS / SPT) * Math.PI * 2
      pts.push(new THREE.Vector3(Math.cos(phi) * 1.34, Y + t * STEPS * RISE + 1.0, Math.sin(phi) * 1.34))
    }
    const curve = new THREE.CatmullRomCurve3(pts)
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 700, 0.03, 6), inSteel)
    tube.castShadow = true
    tower.add(tube)
    const bal = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.012, 0.012, 1.0, 5), inSteel, STEPS)
    for (let i = 0; i < STEPS; i++) {
      const phi = PHI0 + ((i + 0.5) / SPT) * Math.PI * 2
      m4.makeTranslation(Math.cos(phi) * 1.34, Y + (i + 1) * RISE + 0.5, Math.sin(phi) * 1.34)
      bal.setMatrixAt(i, m4)
    }
    tower.add(bal)
    // landing slab at the top (sector of the annulus) + corner fillers
    const a0 = (-170 * Math.PI) / 180
    const a1 = (90 * Math.PI) / 180
    const shp = new THREE.Shape()
    shp.absarc(0, 0, 3.02, a0, a1, false)
    shp.absarc(0, 0, 1.28, a1, a0, true)
    const sg = new THREE.ExtrudeGeometry(shp, { depth: 0.3, bevelEnabled: false, curveSegments: 48 })
    sg.rotateX(-Math.PI / 2)
    const sUv = sg.attributes.uv
    for (let i = 0; i < sUv.count; i++) sUv.setXY(i, sUv.getX(i) * 0.5, sUv.getY(i) * 0.5)
    const slab = new THREE.Mesh(sg, inConcrete)
    slab.position.set(0, yb - 0.3, 0)
    slab.castShadow = true
    slab.receiveShadow = true
    tower.add(slab)
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) addBox(tower, 1.3, 0.3, 1.3, inConcrete, sx * 2.4, yb - 0.17, sz * 2.4)
    // ceiling inside lookout
    addBox(tower, 6.1, 0.1, 6.1, plaster, 0, yb + 3.28, 0, false)
  }

  // interior lights
  const lights: THREE.PointLight[] = []
  for (const hy of [2.4, 7.6, 12.8, 18.2 + 1.8]) {
    const l = new THREE.PointLight('#ffd7a0', 4, 15, 1.8)
    l.position.set(0, Y + hy, 0)
    tower.add(l)
    lights.push(l)
  }

  // ---- entrance: Hildo Krop relief + inscription (east face of the base)
  {
    const { map, normalMap } = makeRelief()
    const rm = new THREE.MeshStandardMaterial({ map, normalMap, normalScale: new THREE.Vector2(1.6, 1.6), metalness: 0.3, roughness: 0.6, envMapIntensity: 0.5 })
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.6), rm)
    panel.rotation.y = Math.PI / 2
    panel.position.set(5.52, Y + 2.1, -3.15)
    panel.receiveShadow = true
    tower.add(panel)
    addBox(tower, 0.08, 1.8, 3.4, stone, 5.52, Y + 2.1, -3.15)
    const txt = canvasTex(768, 256, (g) => {
      g.fillStyle = '#d9d1bb'
      g.fillRect(0, 0, 768, 256)
      g.fillStyle = '#3a342a'
      g.font = '600 74px Georgia, serif'
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.fillText('EEN VOLK DAT LEEFT', 384, 92)
      g.fillText('BOUWT AAN ZIJN TOEKOMST', 384, 178, 720)
    })
    const plaque = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.07), new THREE.MeshStandardMaterial({ map: txt, roughness: 0.8 }))
    plaque.rotation.y = Math.PI / 2
    plaque.position.set(5.52, Y + 2.1, 3.15)
    tower.add(plaque)
    // lintel over the entrance
    addBox(tower, 2.5, 1.2, 2.6, stone, 4.3, Y + 3.6, 0)
  }

  // ================================================================ blockers & floors for the tower
  const blockers: Part['blockers'] = []
  const floors: Part['floors'] = []
  blockers.push((x, z, fy) => {
    const dx = x - TX
    const dz = z - TZ
    const rel = fy - P0
    if (rel > TOWER_H + 6) return false
    const half = rel < 3.9 ? 5.5 : rel < 5.7 ? 4.6 : 3.7
    const ax = Math.abs(dx)
    const az = Math.abs(dz)
    if (ax > half + PR || az > half + PR) return false
    const r = Math.hypot(dx, dz)
    if (rel < 1.0) {
      if (ax < 3.0 - PR && az < 3.0 - PR) return false
      if (dx > 2.0 && dx < 5.5 + PR && az < 1.1 - PR) return false
      return true
    }
    if (r < 3.0 - PR && r > 1.25 + PR) return false
    if (rel > TOWER_H - 0.7) {
      const d = 0.8 - PR
      if (dx > 2 && dx < 3.7 + PR && az < d) return false
      if (dz > 2 && dz < 3.7 + PR && ax < d) return false
      if (dz < -2 && dz > -3.7 - PR && ax < d) return false
    }
    return true
  })
  floors.push((x, z, fy) => {
    const dx = x - TX
    const dz = z - TZ
    const ax = Math.abs(dx)
    const az = Math.abs(dz)
    const r = Math.hypot(dx, dz)
    const cand: number[] = []
    const H = P0 + TOWER_H
    if (r >= 1.28 && r <= 3.05 && ax < 3.2 && az < 3.2) {
      const phi = Math.atan2(dz, dx)
      let f = (phi - PHI0) / (Math.PI * 2)
      f -= Math.floor(f)
      for (let k = 0; k < STEPS / SPT; k++) {
        const i = Math.floor((f + k) * SPT)
        cand.push(P0 + (i + 1) * RISE)
      }
      // landing slab: world angles from -90deg to 170deg
      const deg = (Math.atan2(dz, dx) * 180) / Math.PI
      if (deg >= -90 && deg <= 170) cand.push(H)
    }
    // top-level corners, door strips and the outside balcony
    if (ax < 3.2 && az < 3.2 && r > 3.0) cand.push(H)
    if (dx > 2 && dx < 3.8 && az < 0.85) cand.push(H)
    if (dz > 2 && dz < 3.8 && ax < 0.85) cand.push(H)
    if (dz < -2 && dz > -3.8 && ax < 0.85) cand.push(H)
    const m = Math.max(ax, az)
    if (m >= 3.6 && m < 5.45) cand.push(H)
    let best: number | null = null
    for (const c of cand) if (c <= fy + 0.5 && (best === null || c > best)) best = c
    return best
  })

  // ================================================================ FOOTBRIDGE over the A7
  {
    const bridge = new THREE.Group()
    group.add(bridge)
    const len = 54
    const deckT = 0.5
    addBox(bridge, 3.2, deckT, len, mats.steelPainted, BX, BD - deckT / 2, 0)
    addBox(bridge, 2.8, 0.04, len, mats.concrete, BX, BD + 0.02, 0, false)
    // railings along deck
    const bars = new THREE.InstancedMesh(new THREE.BoxGeometry(0.02, 1.15, 0.02), mats.steelPainted, Math.floor(len / 0.14) * 2)
    const m4 = new THREE.Matrix4()
    let bi = 0
    for (const s of [-1, 1]) {
      for (let i = 0; i < Math.floor(len / 0.14); i++) {
        m4.makeTranslation(BX + s * 1.5, BD + 0.58, -len / 2 + i * 0.14 + 0.07)
        bars.setMatrixAt(bi++, m4)
      }
      const r = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, len), mats.steel)
      r.position.set(BX + s * 1.5, BD + 1.18, 0)
      r.castShadow = true
      bridge.add(r)
      col(BX + s * 1.56, 0, 0.08, len / 2, BD, BD + 1.2)
    }
    bars.castShadow = true
    bridge.add(bars)
    // piers
    for (const pz of [-13.6, 0, 13.6]) {
      const y0 = terrainY(BX, pz)
      addBox(bridge, 0.9, BD - deckT - y0, 1.4, mats.concrete, BX, y0 + (BD - deckT - y0) / 2, pz)
      col(BX, pz, 0.5, 0.75, y0, BD)
    }
    // stairs: solid steps on both ends
    const nSt = 33
    const run = 10
    const tread = run / nSt
    const rise = (BD - P0) / nSt
    for (const dir of [1, -1]) {
      for (let i = 0; i < nSt; i++) {
        const top = BD - (i + 1) * rise
        const z0 = dir * (len / 2 + (i + 0.5) * tread)
        const h = top - P0
        addBox(bridge, 3.2, h, tread + 0.005, mats.concrete, BX, P0 + h / 2, z0)
      }
      // stair side rails
      for (const s of [-1, 1]) {
        const a = new THREE.Vector3(BX + s * 1.5, BD + 1.15, dir * (len / 2))
        const b = new THREE.Vector3(BX + s * 1.5, P0 + 1.15, dir * (len / 2 + run))
        const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, a.distanceTo(b), 6), mats.steel)
        rod.position.copy(a).lerp(b, 0.5)
        rod.lookAt(b)
        rod.rotateX(Math.PI / 2)
        rod.castShadow = true
        bridge.add(rod)
        col(BX + s * 1.6, dir * (len / 2 + run / 2), 0.12, run / 2, P0, BD + 1.2)
      }
    }
    floors.push((x, z, fy) => {
      if (Math.abs(x - BX) > 1.45) return null
      const az = Math.abs(z)
      let h: number | null = null
      if (az <= len / 2) h = BD
      else if (az <= len / 2 + run) {
        const i = Math.min(nSt - 1, Math.floor((az - len / 2) / tread))
        h = BD - (i + 1) * rise
      }
      return h !== null && h <= fy + 0.5 ? h : null
    })
  }

  // ================================================================ LELY STATUE (north terrace)
  {
    const g = new THREE.Group()
    g.position.set(SX, P0, SZ)
    group.add(g)
    addBox(g, 7.0, 0.3, 7.0, stone, 0, 0.15, 0)
    addBox(g, 5.6, 0.3, 5.6, stone, 0, 0.45, 0)
    addBox(g, 4.2, 0.3, 4.2, stone, 0, 0.75, 0)
    addBox(g, 2.1, 3.2, 2.1, stone, 0, 2.5, 0)
    addBox(g, 2.5, 0.28, 2.5, stone, 0, 4.24, 0)
    addBox(g, 2.3, 0.2, 2.3, stone, 0, 0.9, 0.0, false)
    col(SX, SZ, 3.5, 3.5, P0, P0 + 1.0)
    col(SX, SZ, 1.2, 1.2, P0, P0 + 5)
    // inscription
    const ptx = canvasTex(512, 256, (c) => {
      c.fillStyle = '#d6cdb6'
      c.fillRect(0, 0, 512, 256)
      c.fillStyle = '#3a342a'
      c.textAlign = 'center'
      c.textBaseline = 'middle'
      c.font = '600 46px Georgia, serif'
      c.fillText('CORNELIS LELY', 256, 80)
      c.font = '600 38px Georgia, serif'
      c.fillText('1854 – 1929', 256, 150)
      c.font = 'italic 28px Georgia, serif'
      c.fillText('Afsluitdijk 1927 – 1932', 256, 205)
    })
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.75), new THREE.MeshStandardMaterial({ map: ptx, roughness: 0.7 }))
    pl.position.set(0, 2.2, 1.06)
    g.add(pl)
    // the bronze figure
    const f = new THREE.Group()
    f.position.set(0, 4.38, 0)
    f.scale.setScalar(1.55)
    g.add(f)
    const b = mats.bronze
    const mesh = (geo: THREE.BufferGeometry, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(geo, b)
      m.position.set(x, y, z)
      m.castShadow = true
      f.add(m)
      return m
    }
    mesh(new THREE.CylinderGeometry(0.1, 0.085, 0.75, 10), -0.14, 0.38, 0)
    mesh(new THREE.CylinderGeometry(0.1, 0.085, 0.75, 10), 0.14, 0.38, 0.02)
    mesh(new THREE.BoxGeometry(0.2, 0.08, 0.34), -0.14, 0.04, 0.06)
    mesh(new THREE.BoxGeometry(0.2, 0.08, 0.34), 0.14, 0.04, 0.08)
    const coat = new THREE.LatheGeometry(
      [
        [0.0, 0.0],
        [0.3, 0.0],
        [0.33, 0.3],
        [0.3, 0.7],
        [0.26, 1.0],
        [0.27, 1.25],
        [0.2, 1.38],
        [0.0, 1.4],
      ].map(([r, y]) => new THREE.Vector2(r, y)),
      16,
    )
    mesh(coat, 0, 0.5, 0)
    const sh = mesh(new THREE.SphereGeometry(0.27, 14, 10), 0, 1.78, 0)
    sh.scale.set(1.05, 0.5, 0.7)
    mesh(new THREE.CylinderGeometry(0.075, 0.09, 0.14, 10), 0, 1.94, 0)
    mesh(new THREE.SphereGeometry(0.115, 14, 12), 0, 2.1, 0.01)
    mesh(new THREE.CapsuleGeometry(0.06, 0.62, 4, 8), -0.31, 1.45, 0.05)
    const arm = mesh(new THREE.CapsuleGeometry(0.06, 0.5, 4, 8), 0.3, 1.5, 0.18)
    arm.rotation.x = -0.9
    arm.rotation.z = -0.15
    mesh(new THREE.SphereGeometry(0.07, 8, 8), 0.32, 1.72, 0.46)
    // roll of plans under the arm
    const roll = mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.45, 8), -0.31, 1.18, 0.12)
    roll.rotation.z = 0.5
    g.rotation.y = 0 // faces +z (south: IJsselmeer)
  }

  // ================================================================ PLAZA FURNITURE
  // parking bays
  const bays = 11
  const lineGeo = new THREE.BoxGeometry(0.1, 0.012, 5.2)
  const lines = new THREE.InstancedMesh(lineGeo, mats.white, bays + 1)
  const m4 = new THREE.Matrix4()
  for (let i = 0; i <= bays; i++) {
    m4.makeTranslation(-22 + i * 2.6, P0 + 0.02, 21.6)
    lines.setMatrixAt(i, m4)
  }
  lines.receiveShadow = true
  group.add(lines)
  const endLine = new THREE.Mesh(new THREE.BoxGeometry(bays * 2.6, 0.012, 0.1), mats.white)
  endLine.position.set(-22 + (bays * 2.6) / 2, P0 + 0.02, 24.2)
  group.add(endLine)
  const carKinds: ('hatch' | 'sedan' | 'suv' | 'van')[] = ['hatch', 'sedan', 'suv', 'van', 'hatch']
  const carCols = ['#d9d9d6', '#20272e', '#7e1f23', '#2b4a7a', '#8a8f94', '#e0dfd2', '#3a5d46', '#b9bcc0']
  for (const i of [0, 1, 3, 4, 7, 9]) {
    const car = makeCar(carKinds[Math.floor(rnd() * carKinds.length)], carCols[Math.floor(rnd() * carCols.length)], mats)
    car.position.set(-22 + (i + 0.5) * 2.6, P0, 21.6)
    car.rotation.y = rnd() < 0.5 ? 0 : Math.PI
    group.add(car)
    col(car.position.x, 21.6, 1.0, 2.3, P0, P0 + 1.6)
  }

  // lamp masts on the plaza
  const masts: [number, number][] = [
    [-12, 38],
    [-48, 38],
    [12, 36],
    [-48, 22.5],
  ]
  for (const [mx, mz] of masts) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 9, 8), mats.steel)
    p.position.set(mx, P0 + 4.5, mz)
    p.castShadow = true
    group.add(p)
    const head = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.12, 0.45), mats.lamp)
    head.position.set(mx, P0 + 9.05, mz)
    group.add(head)
    col(mx, mz, 0.2, 0.2, P0, P0 + 9)
  }

  // benches
  const bench = (x: number, z: number, ry: number) => {
    const b = new THREE.Group()
    b.position.set(x, P0, z)
    b.rotation.y = ry
    addBox(b, 1.8, 0.06, 0.5, mats.wood, 0, 0.45, 0)
    addBox(b, 1.8, 0.4, 0.05, mats.wood, 0, 0.75, -0.22)
    addBox(b, 0.06, 0.45, 0.45, mats.steelPainted, -0.8, 0.22, 0)
    addBox(b, 0.06, 0.45, 0.45, mats.steelPainted, 0.8, 0.22, 0)
    group.add(b)
    col(x, z, 0.95, 0.35, P0, P0 + 0.9)
  }
  for (const x of [-42, -34, -26]) bench(x, 41.5, 0) // looking south over the IJsselmeer
  for (const x of [12, 18, 32]) bench(x, -39.5, Math.PI) // looking north over the Wadden Sea

  // brown tourist sign
  {
    const tx = canvasTex(512, 320, (g) => {
      g.fillStyle = '#6b3d1f'
      g.fillRect(0, 0, 512, 320)
      g.strokeStyle = '#f2ece0'
      g.lineWidth = 8
      g.strokeRect(14, 14, 484, 292)
      g.fillStyle = '#f2ece0'
      g.textAlign = 'center'
      g.font = '700 54px Arial, sans-serif'
      g.fillText('Monument', 256, 118)
      g.fillText('Afsluitdijk', 256, 186)
      g.font = '400 34px Arial, sans-serif'
      g.fillText('Dudok · 1933', 256, 250)
    })
    const sg = new THREE.Group()
    sg.position.set(-56, P0, 20)
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 8), mats.steel)
    post.position.y = 1.3
    post.castShadow = true
    sg.add(post)
    const board = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.0, 0.05), [mats.dark, mats.dark, mats.dark, mats.dark, new THREE.MeshStandardMaterial({ map: tx, roughness: 0.5 }), mats.dark])
    board.position.set(0, 2.3, 0.05)
    board.castShadow = true
    sg.add(board)
    sg.rotation.y = -0.3
    group.add(sg)
    col(-56, 20, 0.15, 0.15, P0, P0 + 3)
  }

  // information board on the north terrace
  {
    const tx = canvasTex(512, 320, (g) => {
      g.fillStyle = '#18222c'
      g.fillRect(0, 0, 512, 320)
      g.fillStyle = '#e8e2d2'
      g.font = '700 36px Georgia, serif'
      g.textAlign = 'left'
      g.fillText('Afsluitdijk', 28, 58)
      g.font = '400 22px Georgia, serif'
      const lines2 = ['Closed on 28 May 1932', 'Length: 32 km', 'Crest: ~ +7.8 m NAP', 'West: salt Wadden Sea', 'East: fresh IJsselmeer', '', 'Lely statue: Mari Andriessen, 1954']
      lines2.forEach((l, i) => g.fillText(l, 28, 108 + i * 32))
    })
    const g = new THREE.Group()
    g.position.set(14, P0, -24.5)
    g.rotation.y = Math.PI
    const board = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.0, 0.06), [mats.dark, mats.dark, mats.dark, mats.dark, new THREE.MeshStandardMaterial({ map: tx, roughness: 0.4 }), mats.dark])
    board.position.set(0, 1.1, 0)
    board.rotation.x = -0.3
    board.castShadow = true
    g.add(board)
    for (const s of [-0.7, 0.7]) addBox(g, 0.05, 0.9, 0.05, mats.steelPainted, s, 0.45, 0.1)
    group.add(g)
    col(14, -24.5, 0.9, 0.2, P0, P0 + 1.5)
  }

  // ================================================================ per-frame
  const nightMats = [mats.lamp]
  void nightMats
  return {
    group,
    colliders,
    floors,
    blockers,
    towerTop: new THREE.Vector3(TX, P0 + TOWER_H + 1.0, TZ - 4.6),
    setNight: (n: number) => {
      lights.forEach((l) => (l.intensity = 3 + n * 7))
    },
    update: (t) => {
      const p = flagGeo.attributes.position
      for (let i = 0; i < p.count; i++) {
        const x = flagBase[i * 3]
        const y = flagBase[i * 3 + 1]
        const k = (x + 1.2) / 2.4
        p.setZ(i, Math.sin(x * 3.2 - t * 4.2 + y) * 0.1 * k + Math.sin(x * 6 - t * 6) * 0.025 * k)
        p.setY(i, y - Math.sin(x * 3.2 - t * 4.2) * 0.02 * k)
      }
      p.needsUpdate = true
      flagGeo.computeVertexNormals()
    },
  }
}

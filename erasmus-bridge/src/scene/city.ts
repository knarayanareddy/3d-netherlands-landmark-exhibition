import * as THREE from 'three'
import { LAND_Y, WATER_X0, WATER_X1, X_END, X_START } from './config'
import { boxGeo, merge, rng, roofCap, v3, wallBox } from './geo'
import type { Facade, Mats } from './materials'

export interface Collider {
  x: number
  z: number
  hw: number
  hd: number
}
export interface CityParts {
  group: THREE.Group
  colliders: Collider[]
  update(t: number): void
}

const plane = (w: number, d: number, x: number, y: number, z: number, tile: number) => {
  const g = new THREE.PlaneGeometry(w, d)
  g.rotateX(-Math.PI / 2)
  g.translate(x, y, z)
  const uv = g.attributes.uv
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / tile, (uv.getY(i) * d) / tile)
  return g
}

export function buildCity(M: Mats): CityParts {
  const g = new THREE.Group()
  g.name = 'City'
  const colliders: Collider[] = []

  // ------------------------------------------------------------ ground
  const addMesh = (geo: THREE.BufferGeometry, mat: THREE.Material, cast = false, rec = true) => {
    const m = new THREE.Mesh(geo, mat)
    m.castShadow = cast
    m.receiveShadow = rec
    g.add(m)
    return m
  }
  // far ground
  addMesh(plane(7000, 7000, WATER_X0 - 3500, LAND_Y - 0.05, 0, 100), M.groundFar, false, true)
  addMesh(plane(7000, 7000, WATER_X1 + 3500, LAND_Y - 0.05, 0, 100), M.groundFar, false, true)
  // paved city areas near the bridge
  addMesh(plane(520, 900, WATER_X0 - 260, LAND_Y, 0, 3.2), M.pavers)
  addMesh(plane(520, 900, WATER_X1 + 260, LAND_Y, 0, 3.2), M.pavers)
  // streets
  const roads = [
    plane(18, 3000, WATER_X0 - 22, LAND_Y + 0.03, 0, 6), // Wilhelminakade
    plane(18, 3000, WATER_X1 + 26, LAND_Y + 0.03, 0, 6), // Boompjes
    plane(520, 16, WATER_X0 - 260, LAND_Y + 0.03, -140, 6),
    plane(520, 16, WATER_X0 - 260, LAND_Y + 0.03, 150, 6),
    plane(520, 16, WATER_X1 + 260, LAND_Y + 0.03, -150, 6),
    plane(520, 16, WATER_X1 + 260, LAND_Y + 0.03, 150, 6),
    plane(16, 900, WATER_X0 - 150, LAND_Y + 0.03, 0, 6),
    plane(16, 900, WATER_X1 + 150, LAND_Y + 0.03, 0, 6),
    plane(16, 900, WATER_X1 + 330, LAND_Y + 0.03, 0, 6),
  ]
  addMesh(merge(roads), M.asphalt)
  // quay walls + coping
  for (const x of [WATER_X0, WATER_X1]) {
    const s = x === WATER_X0 ? 1 : -1
    addMesh(boxGeo(1.2, 5.2, 6000, x - s * 0.6, LAND_Y - 2.6 + 0.0, 0, 8), M.concreteDark, false, true)
    addMesh(boxGeo(0.7, 0.25, 6000, x - s * 0.35, LAND_Y + 0.12, 0, 8), M.kerb, false, true)
  }
  // bollards
  const bGeo = new THREE.CylinderGeometry(0.22, 0.3, 0.7, 10)
  bGeo.translate(0, 0.35, 0)
  const bm: THREE.Matrix4[] = []
  for (let z = -900; z <= 900; z += 18) {
    bm.push(new THREE.Matrix4().makeTranslation(WATER_X0 - 1.6, LAND_Y, z))
    bm.push(new THREE.Matrix4().makeTranslation(WATER_X1 + 1.6, LAND_Y, z + 9))
  }
  const bol = new THREE.InstancedMesh(bGeo, new THREE.MeshStandardMaterial({ color: '#2b2e31', roughness: 0.6, metalness: 0.6 }), bm.length)
  bm.forEach((m, i) => bol.setMatrixAt(i, m))
  bol.castShadow = true
  g.add(bol)

  // ------------------------------------------------------------ buildings
  const walls: Record<Facade, THREE.BufferGeometry[]> = { glassTeal: [], glassSteel: [], grid: [], brick: [], white: [] }
  const roofs: THREE.BufferGeometry[] = []
  const boxes: THREE.BufferGeometry[] = []
  const add = (style: Facade, x: number, z: number, w: number, d: number, h: number, y0 = LAND_Y, collide = true, roofDetail = true) => {
    walls[style].push(wallBox(w, h, d, x, y0, z, 0, 28.8))
    roofs.push(roofCap(w, d, x, y0 + h + 0.02, z))
    if (collide) colliders.push({ x, z, hw: w / 2 + 0.5, hd: d / 2 + 0.5 })
    if (roofDetail && w > 14) {
      boxes.push(boxGeo(Math.min(8, w * 0.3), 3, Math.min(8, d * 0.3), x + w * 0.15, y0 + h + 1.5, z - d * 0.12, 3))
    }
  }
  // --- landmarks of Kop van Zuid (south bank)
  add('glassTeal', -238, -64, 38, 38, 165) // Maastoren
  add('glassSteel', -238, -64, 24, 24, 12, LAND_Y + 165, false, false) // crown
  // De Rotterdam – three stacked-slab towers, joined by a plinth
  add('grid', -212, 140, 46, 156, 22)
  const dr: [number, number, number][] = [[96, 149, 0], [140, 138, -6], [184, 126, 5]]
  for (const [z, h, off] of dr) {
    for (let k = 0; k < 4; k++) {
      const hh = (h - 22) / 4
      const shift = off + (k % 2 ? 7 : -3)
      add('grid', -212 + shift, z, 28, 36, hh + 0.4, LAND_Y + 22 + k * hh, k === 0)
    }
  }
  add('grid', -302, -214, 24, 24, 158) // New Orleans
  add('white', -302, -214, 16, 16, 14, LAND_Y + 158, false, false)
  add('brick', -352, -124, 20, 20, 140) // Montevideo
  add('brick', -352, -124, 28, 16, 56)
  add('brick', -176, 332, 62, 20, 26) // Hotel New York
  add('brick', -176, 360, 14, 14, 52)
  // --- Boompjes (north bank): slab towers lining the quay
  const nb: [number, number, number, number, number, Facade][] = [
    [346, -150, 30, 18, 96, 'white'], [346, -105, 30, 18, 112, 'grid'], [346, -62, 30, 18, 88, 'white'],
    [346, 70, 30, 18, 100, 'glassSteel'], [346, 118, 30, 18, 84, 'white'], [346, 170, 30, 18, 120, 'grid'],
  ]
  for (const [x, z, w, d, h, s] of nb) add(s, x, z, w, d, h)
  add('glassSteel', 560, -330, 30, 30, 151) // Delftse Poort-like
  add('glassTeal', 560, -290, 26, 26, 93)

  // --- procedural fabric of the city
  const r = rng(42)
  const styles: Facade[] = ['brick', 'white', 'brick', 'grid', 'glassSteel']
  const blocks = (x0: number, x1: number, z0: number, z1: number, maxH: number, step: number) => {
    for (let x = x0; x < x1; x += step) for (let z = z0; z < z1; z += step) {
      const w = 22 + r() * 26
      const d = 22 + r() * 26
      const cx = x + r() * 10
      const cz = z + r() * 10
      // keep the approach viaducts, streets and landmark footprints free
      if (Math.abs(cz) < 34 && cx > X_START - 40 && cx < X_END + 40) continue
      if (cx > WATER_X0 - 40 && cx < WATER_X0 + 2) continue
      if (cx < WATER_X1 + 44 && cx > WATER_X1 - 2) continue
      if (Math.abs(cz - 140) < 12 || Math.abs(cz + 140) < 12 || Math.abs(cz - 150) < 12 || Math.abs(cz + 150) < 12) continue
      if (Math.abs(cx - (WATER_X0 - 150)) < 12 || Math.abs(cx - (WATER_X1 + 150)) < 12 || Math.abs(cx - (WATER_X1 + 330)) < 12) continue
      let blocked = false
      for (const c of colliders) if (Math.abs(c.x - cx) < c.hw + w / 2 + 6 && Math.abs(c.z - cz) < c.hd + d / 2 + 6) { blocked = true; break }
      if (blocked) continue
      const h = 14 + r() * r() * maxH
      add(styles[(r() * styles.length) | 0], cx, cz, w, d, h, LAND_Y, true, r() < 0.6)
    }
  }
  blocks(WATER_X0 - 520, WATER_X0 - 40, -460, 460, 70, 56)
  blocks(WATER_X1 + 44, WATER_X1 + 560, -460, 460, 80, 56)
  // distant skyline (not walkable)
  for (const sgn of [-1, 1]) {
    for (let i = 0; i < 160; i++) {
      const z = -2400 + r() * 4800
      const x = sgn < 0 ? WATER_X0 - 560 - r() * 1700 : WATER_X1 + 600 + r() * 1700
      const h = 16 + r() * r() * 90
      add(styles[(r() * styles.length) | 0], x, z, 24 + r() * 30, 24 + r() * 30, h, LAND_Y, false, false)
    }
  }
  // river-side long terraces along the quays (give the water edge a continuous street wall)
  for (let z = -900; z < 900; z += 62) {
    if (Math.abs(z) < 60 || (z > 90 && z < 400 && 0)) continue
    const hS = 16 + r() * 10
    add(r() < 0.5 ? 'brick' : 'white', WATER_X0 - 40, z + r() * 6, 20, 52, hS, LAND_Y, true, false)
    add(r() < 0.5 ? 'brick' : 'white', WATER_X1 + 44, z + r() * 6, 20, 52, 16 + r() * 18, LAND_Y, true, false)
  }

  for (const k of Object.keys(walls) as Facade[]) {
    if (!walls[k].length) continue
    addMesh(merge(walls[k]), M.facade[k], true, true)
  }
  addMesh(merge(roofs), M.roof, false, true)
  addMesh(merge(boxes), M.concrete, true, true)

  // ------------------------------------------------------------ trees along the quays
  const trunk = new THREE.CylinderGeometry(0.18, 0.28, 3.2, 6)
  trunk.translate(0, 1.6, 0)
  const crown = new THREE.IcosahedronGeometry(3.4, 1)
  {
    const p = crown.attributes.position
    for (let i = 0; i < p.count; i++) {
      const d = 1 + 0.22 * Math.sin(p.getX(i) * 2.1 + p.getY(i) * 1.7 + p.getZ(i) * 2.9)
      p.setXYZ(i, p.getX(i) * d, p.getY(i) * d * 0.85, p.getZ(i) * d)
    }
    crown.computeVertexNormals()
    crown.translate(0, 5.6, 0)
  }
  const treeSpots: [number, number][] = []
  for (let z = -700; z < 700; z += 13) {
    if (Math.abs(z) < 24) continue
    treeSpots.push([WATER_X0 - 6, z + r() * 3], [WATER_X1 + 8, z + r() * 3])
  }
  const tm = new THREE.InstancedMesh(trunk, new THREE.MeshStandardMaterial({ color: '#4a3a2c', roughness: 1 }), treeSpots.length)
  const cm = new THREE.InstancedMesh(crown, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.95 }), treeSpots.length)
  const col = new THREE.Color()
  const mat = new THREE.Matrix4()
  treeSpots.forEach(([x, z], i) => {
    const s = 0.8 + r() * 0.55
    mat.compose(v3(x, LAND_Y, z), new THREE.Quaternion().setFromAxisAngle(v3(0, 1, 0), r() * 6.28), v3(s, s, s))
    tm.setMatrixAt(i, mat)
    cm.setMatrixAt(i, mat)
    col.setHSL(0.2 + r() * 0.07, 0.28 + r() * 0.12, 0.13 + r() * 0.07)
    cm.setColorAt(i, col)
  })
  tm.castShadow = cm.castShadow = true
  tm.receiveShadow = cm.receiveShadow = true
  g.add(tm, cm)
  for (const [x, z] of treeSpots) if (Math.abs(x - (WATER_X0 - 6)) < 1 || true) colliders.push({ x, z, hw: 0.7, hd: 0.7 })

  // ------------------------------------------------------------ Willemsbrug (distant red arch, 1 km east)
  const rust = new THREE.MeshStandardMaterial({ color: '#a8402b', roughness: 0.5, metalness: 0.3 })
  const wb = new THREE.Group()
  const span = WATER_X1 - WATER_X0
  const cx = (WATER_X0 + WATER_X1) / 2
  const archPts: THREE.Vector3[] = []
  for (let i = 0; i <= 24; i++) {
    const u = i / 24
    archPts.push(v3(cx - span * 0.46 + u * span * 0.92, 11 + 52 * (1 - Math.pow(2 * u - 1, 2)), 0))
  }
  for (const zz of [-7, 7]) {
    const curve = new THREE.CatmullRomCurve3(archPts.map((p) => v3(p.x, p.y, zz)))
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 1.1, 8), rust)
    tube.castShadow = true
    wb.add(tube)
  }
  const deckW = new THREE.Mesh(boxGeo(span, 2.2, 22, cx, 9.4, 0, 6), M.deckSteel)
  wb.add(deckW)
  const hang: THREE.BufferGeometry[] = []
  for (let i = 1; i < 24; i++) {
    const p = archPts[i]
    for (const zz of [-7, 7]) hang.push(boxGeo(0.25, p.y - 10, 0.25, p.x, 10 + (p.y - 10) / 2, zz, 3))
  }
  wb.add(new THREE.Mesh(merge(hang), rust))
  wb.position.set(0, 0, 1150)
  g.add(wb)

  return { group: g, colliders, update: () => {} }
}

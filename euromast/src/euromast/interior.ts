import * as THREE from 'three'
import { Bucket, V, box, cyl, ring, sphere, torus, tube } from './kit'
import { M } from './materials'
import { canvasTex, makeCanvas, TAU } from './util'
import { T } from './tower'

export interface Interior {
  group: THREE.Group
  /** circle colliders [x, z, r] in tower-local coords for the restaurant level */
  colliders: [number, number, number][]
}

/** Crow's-nest restaurant: parquet floor, bar, tables & chairs, ceiling lights. */
export function buildRestaurant(): Interior {
  const g = new THREE.Group()
  const B = new Bucket()
  const colliders: [number, number, number][] = []
  const fy = T.floorY
  const cy = T.ceilY

  // floors
  ring(B, M.wood(4), 7.9, T.nestR - 0.05, fy + 0.01, 96, 2)
  ring(B, M.carpet(10), T.coreR, 7.9, fy + 0.012, 96, 1.6)
  torus(B, M.steel(), 7.9, 0.03, fy + 0.03, 96)
  // ceiling: dark acoustic panels with glowing rings
  ring(B, M.plaster('#d9d6cf'), T.coreR, T.nestR + 0.6, cy - 0.01, 96, 2, true)
  for (const r of [6.6, 9.2, 11.8, 13.6]) torus(B, M.lightPanel(), r, 0.09, cy - 0.06, 128)
  for (const r of [7.9, 10.5, 12.8]) {
    const n = Math.round(r * 3.2)
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU
      cyl(B, M.lightPanel(), 0.07, 0.07, 0.03, Math.sin(a) * r, cy - 0.04, Math.cos(a) * r, 10)
    }
  }
  // core wall with doors
  const core = new THREE.Mesh(new THREE.CylinderGeometry(T.coreR, T.coreR, cy - fy, 64, 1, true), M.plaster('#e6e3dc'))
  core.position.y = (fy + cy) / 2
  core.receiveShadow = true
  g.add(core)
  cyl(B, M.wood(2), T.coreR + 0.04, T.coreR + 0.04, 1.1, 0, fy, 0, 64, true)
  torus(B, M.steel(), T.coreR + 0.06, 0.02, fy + 1.1, 64)
  // lift doors (+z)
  const lz = T.coreR + 0.04
  box(B, M.steel(), 2.7, 2.65, 0.08, 0, fy, lz - 0.02)
  box(B, M.steel(), 1.08, 2.25, 0.04, -0.57, fy + 0.05, lz + 0.06)
  box(B, M.steel(), 1.08, 2.25, 0.04, 0.57, fy + 0.05, lz + 0.06)
  box(B, M.frame(), 0.03, 2.25, 0.05, 0, fy + 0.05, lz + 0.065)
  box(B, M.lightPanel(), 0.8, 0.12, 0.05, 0, fy + 2.5, lz + 0.08)
  // stair door (-x): frame + glow
  box(B, M.frame(), 0.06, 2.3, 1.5, -(T.coreR + 0.03), fy, 0)
  box(B, M.lightPanel(), 0.05, 0.12, 0.8, -(T.coreR + 0.05), fy + 2.45, 0)
  const exit = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.28), new THREE.MeshBasicMaterial({ map: signTex('↑ TERRACE · STAIRS'), toneMapped: false }))
  exit.rotation.y = -Math.PI / 2
  exit.position.set(-(T.coreR + 0.07), fy + 2.2, 0)
  g.add(exit)

  // window sill + perimeter bench
  ring(B, M.wood(2), T.nestR - 0.7, T.nestR - 0.05, fy + 0.45, 96, 1, false)
  cyl(B, M.darkPaint(), T.nestR - 0.1, T.nestR - 0.1, 0.45, 0, fy, 0, 96, true)

  // bar at the north side of the core
  const barAngles: [number, number] = [Math.PI - 0.62, Math.PI + 0.62]
  const barR = 7.1
  const nb = 14
  for (let i = 0; i < nb; i++) {
    const a = barAngles[0] + ((barAngles[1] - barAngles[0]) * (i + 0.5)) / nb
    const seg = (barR * (barAngles[1] - barAngles[0])) / nb + 0.04
    const x = Math.sin(a) * barR
    const z = Math.cos(a) * barR
    box(B, M.wood(1.5), seg, 1.05, 0.62, x, fy, z, a)
    box(B, M.slab(), seg + 0.01, 0.06, 0.82, x, fy + 1.05, z, a)
    // stools
    const sx = Math.sin(a) * (barR + 0.85)
    const sz = Math.cos(a) * (barR + 0.85)
    if (i % 2 === 0) {
      cyl(B, M.steel(), 0.03, 0.03, 0.65, sx, fy, sz, 8)
      cyl(B, M.leather(), 0.19, 0.19, 0.07, sx, fy + 0.65, sz, 16)
      cyl(B, M.steel(), 0.17, 0.17, 0.02, sx, fy, sz, 16)
    }
  }
  // back-bar shelves with bottles
  for (let k = 0; k < 3; k++) {
    for (let i = 0; i < 30; i++) {
      const a = barAngles[0] + 0.1 + ((barAngles[1] - barAngles[0] - 0.2) * i) / 29
      const r = T.coreR + 0.12
      const x = Math.sin(a) * r
      const z = Math.cos(a) * r
      box(B, M.steel(), 0.28, 0.025, 0.2, x, fy + 1.35 + k * 0.4, z, a)
      if (i % 2 === 0 || k === 1) box(B, M.bottle(), 0.07, 0.24, 0.07, x, fy + 1.375 + k * 0.4, z, a)
    }
  }
  colliders.push([0, -7.1, 1.4])
  for (let i = 0; i < 6; i++) {
    const a = barAngles[0] + ((barAngles[1] - barAngles[0]) * i) / 5
    colliders.push([Math.sin(a) * barR, Math.cos(a) * barR, 1.0])
  }

  /* ---- tables & chairs (instanced) ---- */
  const tableTop = new THREE.CylinderGeometry(0.46, 0.46, 0.04, 20)
  tableTop.translate(0, 0.74, 0)
  const pedestal = new THREE.CylinderGeometry(0.04, 0.05, 0.72, 8)
  pedestal.translate(0, 0.36, 0)
  const tbase = new THREE.CylinderGeometry(0.26, 0.28, 0.03, 16)
  tbase.translate(0, 0.015, 0)
  const plate = new THREE.CylinderGeometry(0.11, 0.09, 0.012, 14)
  const glassG = new THREE.CylinderGeometry(0.03, 0.025, 0.1, 10)
  const chairParts: THREE.BufferGeometry[] = []
  {
    const seat = new THREE.BoxGeometry(0.44, 0.05, 0.44)
    seat.translate(0, 0.45, 0)
    const back = new THREE.BoxGeometry(0.44, 0.46, 0.04)
    back.translate(0, 0.72, -0.2)
    chairParts.push(seat, back)
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        const l = new THREE.CylinderGeometry(0.015, 0.015, 0.45, 6)
        l.translate(sx * 0.19, 0.225, sz * 0.19)
        chairParts.push(l)
      }
  }
  const chairGeo = mergeSimple(chairParts)

  const tables: { x: number; z: number }[] = []
  const rings: [number, number][] = [
    [12.35, 30],
    [10.0, 22],
  ]
  const blocked = (a: number) => {
    // keep clear: lift (0), stairs (3π/2 → -x), bar (π)
    const d = (c: number) => Math.abs(Math.atan2(Math.sin(a - c), Math.cos(a - c)))
    return d(0) < 0.3 || d(-Math.PI / 2) < 0.3 || d(Math.PI) < 0.82
  }
  for (const [r, n] of rings) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + (r < 11 ? 0.1 : 0)
      if (blocked(a)) continue
      tables.push({ x: Math.sin(a) * r, z: Math.cos(a) * r })
    }
  }
  const nT = tables.length
  const iTop = new THREE.InstancedMesh(tableTop, M.tablecloth(), nT)
  const iPed = new THREE.InstancedMesh(pedestal, M.steel(), nT)
  const iBase = new THREE.InstancedMesh(tbase, M.steel(), nT)
  const iPlate = new THREE.InstancedMesh(plate, M.whitePaint(), nT * 4)
  const iGlass = new THREE.InstancedMesh(glassG, M.glass(), nT * 2)
  const iChair = new THREE.InstancedMesh(chairGeo, M.chair(), nT * 4)
  const mtx = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const one = V(1, 1, 1)
  let ci = 0
  let pi = 0
  let gi = 0
  tables.forEach((t, i) => {
    mtx.compose(V(t.x, fy + 0.02, t.z), q.identity(), one)
    iTop.setMatrixAt(i, mtx)
    iPed.setMatrixAt(i, mtx)
    iBase.setMatrixAt(i, mtx)
    const faceA = Math.atan2(t.x, t.z) // radial angle
    for (let k = 0; k < 4; k++) {
      const a = faceA + (k * TAU) / 4 + Math.PI / 4 * 0
      const dx = Math.sin(a) * 0.66
      const dz = Math.cos(a) * 0.66
      // chair faces the table: its local -z (back) points away
      q.setFromAxisAngle(V(0, 1, 0), a + Math.PI)
      mtx.compose(V(t.x + dx, fy + 0.02, t.z + dz), q, one)
      iChair.setMatrixAt(ci++, mtx)
      mtx.compose(V(t.x + Math.sin(a) * 0.28, fy + 0.78, t.z + Math.cos(a) * 0.28), q.identity(), one)
      iPlate.setMatrixAt(pi++, mtx)
      if (k % 2 === 0) {
        mtx.compose(V(t.x + Math.sin(a + 0.5) * 0.3, fy + 0.83, t.z + Math.cos(a + 0.5) * 0.3), q.identity(), one)
        iGlass.setMatrixAt(gi++, mtx)
      }
    }
    colliders.push([t.x, t.z, 1.15])
  })
  for (const m of [iTop, iPed, iBase, iPlate, iChair]) {
    m.castShadow = true
    m.receiveShadow = true
    m.instanceMatrix.needsUpdate = true
    g.add(m)
  }
  iGlass.instanceMatrix.needsUpdate = true
  g.add(iGlass)

  // candles (glow)
  tables.forEach((t) => {
    cyl(B, M.warmLamp(), 0.015, 0.015, 0.06, t.x, fy + 0.8, t.z, 6)
  })
  // pendant lamps over the inner ring
  tables.forEach((t, i) => {
    if (i % 2) return
    tube(B, M.darkPaint(), V(t.x, cy - 0.05, t.z), V(t.x, cy - 0.75, t.z), 0.008, 4)
    sphere(B, M.warmLamp(), 0.13, t.x, cy - 0.85, t.z, 1, 0.8, 1, 10)
  })
  // structural columns near windows
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU + 0.26
    cyl(B, M.concrete(), 0.2, 0.2, cy - fy, Math.sin(a) * 8.2, fy, Math.cos(a) * 8.2, 12)
    colliders.push([Math.sin(a) * 8.2, Math.cos(a) * 8.2, 0.45])
  }
  // potted plants by the windows
  const leaf = new THREE.MeshStandardMaterial({ color: '#35602b', roughness: 0.8 })
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + 0.5
    if (blocked(a)) continue
    const x = Math.sin(a) * 13.3
    const z = Math.cos(a) * 13.3
    cyl(B, M.darkPaint(), 0.28, 0.22, 0.5, x, fy, z, 14)
    for (let k = 0; k < 6; k++) sphere(B, leaf, 0.3, x + Math.sin(k * 1.9) * 0.18, fy + 0.85 + (k % 3) * 0.2, z + Math.cos(k * 1.9) * 0.18, 1, 1.3, 1, 8)
  }
  B.build(g)
  return { group: g, colliders }
}

function mergeSimple(parts: THREE.BufferGeometry[]) {
  const b = new Bucket()
  const mat = new THREE.MeshBasicMaterial()
  for (const p of parts) b.add(p, mat)
  const tmp = new THREE.Group()
  b.build(tmp)
  return (tmp.children[0] as THREE.Mesh).geometry
}

function signTex(text: string) {
  const { c, g } = makeCanvas(512, 128)
  g.fillStyle = '#0c5b3a'
  g.fillRect(0, 0, 512, 128)
  g.fillStyle = '#fff'
  g.font = '700 46px Arial'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(text, 256, 66)
  return canvasTex(c, { wrap: THREE.ClampToEdgeWrapping, aniso: 4 })
}

/** Elevator cabin (visited during lift rides). Camera sits inside. */
export function buildLift() {
  const g = new THREE.Group()
  const B = new Bucket()
  const W = 2.6
  const D = 2.4
  const H = 2.6
  const steel = new THREE.MeshStandardMaterial({ color: '#b9bec3', roughness: 0.55, metalness: 0.45 })
  box(B, steel, 0.05, H, D, -W / 2, 0, 0)
  box(B, steel, 0.05, H, D, W / 2, 0, 0)
  box(B, steel, W, H, 0.05, 0, 0, -D / 2)
  box(B, M.wood(1.2), W, 0.05, D, 0, -0.05, 0)
  box(B, M.plaster('#f1efe9'), W, 0.05, D, 0, H, 0)
  box(B, M.lightPanel(), 1.6, 0.03, 1.2, 0, H - 0.03, 0)
  for (const s of [-1, 1]) tube(B, M.steel(), V(s * (W / 2 - 0.1), 0.95, -0.9), V(s * (W / 2 - 0.1), 0.95, 0.9), 0.025, 8)
  tube(B, M.steel(), V(-0.9, 0.95, -D / 2 + 0.1), V(0.9, 0.95, -D / 2 + 0.1), 0.025, 8)
  // mirror panel on the back wall
  const mirror = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.1), new THREE.MeshStandardMaterial({ color: '#dfe6ea', roughness: 0.04, metalness: 1 }))
  mirror.position.set(0, 1.4, -D / 2 + 0.03)
  g.add(mirror)
  // front wall with sliding doors
  box(B, steel, 0.55, H, 0.05, -W / 2 + 0.275, 0, D / 2)
  box(B, steel, 0.55, H, 0.05, W / 2 - 0.275, 0, D / 2)
  box(B, steel, W, 0.4, 0.05, 0, H - 0.4, D / 2)
  B.build(g)
  // doors
  const dL = new THREE.Mesh(new THREE.BoxGeometry(0.75, 2.15, 0.04), steel)
  const dR = dL.clone()
  dL.position.set(-0.375, 1.075, D / 2)
  dR.position.set(0.375, 1.075, D / 2)
  g.add(dL, dR)
  // floor display
  const { c, g: cg } = makeCanvas(256, 128)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  const disp = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.25), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }))
  disp.position.set(-W / 2 + 0.5, 2.15, D / 2 - 0.05)
  disp.rotation.y = Math.PI
  g.add(disp)
  const setDisplay = (m: number, dir: string) => {
    cg.fillStyle = '#05080a'
    cg.fillRect(0, 0, 256, 128)
    cg.fillStyle = '#ff7a2a'
    cg.font = '700 70px "Courier New", monospace'
    cg.textAlign = 'center'
    cg.textBaseline = 'middle'
    cg.fillText(`${Math.round(m)}`, 120, 62)
    cg.font = '700 30px Arial'
    cg.fillText('m', 220, 84)
    cg.font = '700 40px Arial'
    cg.fillText(dir, 220, 36)
    tex.needsUpdate = true
  }
  setDisplay(0, '')
  const light = new THREE.PointLight('#fff1d8', 2.2, 8, 1.6)
  light.position.set(0, H - 0.3, 0)
  g.add(light)
  return { group: g, doorL: dL, doorR: dR, setDisplay, size: { W, D, H }, light }
}

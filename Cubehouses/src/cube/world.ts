import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { LAYOUTS, buildCubeShell, buildSolidPylon, faceAngle0 } from './cube'
import { FLOORS, PYLON_APO, ShowCube, YC, buildShowCube } from './showcube'
import { asphaltMat, concreteMat, curbMat, emissiveMat, facadeMat, muralMat, paverMat, signMat, slateMat, solid, woodDarkMat, FacadeKind } from './textures'
import { makeBush, makeTree } from './foliage'
import { TAU, boxUV, mergeByMaterial, mkCanvas, rng, shade } from './util'

export interface Circle {
  x: number
  z: number
  r: number
}
export interface World {
  group: THREE.Group
  circles: Circle[]
  show: ShowCube
  showPos: THREE.Vector2
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number }
  update(t: number, dt: number): void
  setNight(n: number): void
  cubePositions: { x: number; z: number }[]
  landmarks: Record<string, THREE.Vector3>
}

const metricPlane = (w: number, h: number) => {
  const g = new THREE.PlaneGeometry(w, h)
  const uv = g.attributes.uv
  const pos = g.attributes.position
  for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i), pos.getY(i))
  g.rotateX(-Math.PI / 2)
  return g
}

function metricBox(w: number, h: number, d: number, mat: THREE.Material) {
  const g = new THREE.BoxGeometry(w, h, d)
  boxUV(g, w, h, d, (mat.userData.tile as [number, number]) ?? [1, 1])
  return g
}

function tubeBetween(a: THREE.Vector3, b: THREE.Vector3, r: number, mat: THREE.Material, seg = 8) {
  const L = a.distanceTo(b)
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, L, seg), mat)
  m.position.copy(a).add(b).multiplyScalar(0.5)
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize())
  shade(m)
  return m
}

/* ------------------------------------------------------------------ props */
function makeLamp(): THREE.Group {
  const g = new THREE.Group()
  const steel = solid('#3b4147', 0.45, 0.8)
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.075, 5.4, 10), steel)
  pole.position.y = 2.7
  g.add(pole)
  const arm = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.06, 0.06), steel)
  arm.position.set(0.5, 5.35, 0)
  g.add(arm)
  const head = new THREE.Mesh(new RoundedBoxGeometry(0.62, 0.1, 0.24, 2, 0.04), steel)
  head.position.set(1.0, 5.33, 0)
  g.add(head)
  const lens = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.012, 0.18), emissiveMat('#fff1d0', 3, true))
  lens.position.set(1.0, 5.275, 0)
  g.add(lens)
  return mergeByMaterial(g)
}

function makeBench(): THREE.Group {
  const g = new THREE.Group()
  const wood = woodDarkMat('#8a6240')
  const steel = solid('#2c3035', 0.5, 0.8)
  for (let i = 0; i < 4; i++) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.035, 0.09), wood)
    s.position.set(0, 0.45, -0.18 + i * 0.12)
    g.add(s)
  }
  for (let i = 0; i < 3; i++) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.09, 0.03), wood)
    s.position.set(0, 0.62 + i * 0.12, -0.24)
    s.rotation.x = -0.15
    g.add(s)
  }
  for (const x of [-0.8, 0.8]) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.45, 0.5), steel)
    l.position.set(x, 0.225, -0.05)
    g.add(l)
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.5, 0.05), steel)
    b.position.set(x, 0.65, -0.26)
    b.rotation.x = -0.15
    g.add(b)
  }
  return mergeByMaterial(g)
}

function makeBike(color: string): THREE.Group {
  const g = new THREE.Group()
  const frame = solid(color, 0.4, 0.5)
  const black = solid('#141517', 0.6, 0.2)
  const steel = solid('#9aa0a6', 0.35, 0.9)
  const V = (x: number, y: number) => new THREE.Vector3(x, y, 0)
  for (const x of [-0.55, 0.55]) {
    const w = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.017, 6, 28), black)
    w.position.set(x, 0.36, 0)
    g.add(w)
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.325, 0.006, 4, 28), steel)
    rim.position.set(x, 0.36, 0)
    g.add(rim)
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.1, 8), steel)
    hub.rotation.x = Math.PI / 2
    hub.position.set(x, 0.36, 0)
    g.add(hub)
  }
  const bb = V(-0.05, 0.3)
  const seat = V(-0.27, 0.92)
  const head = V(0.43, 0.95)
  const rearHub = V(-0.55, 0.36)
  const frontHub = V(0.55, 0.36)
  g.add(tubeBetween(bb, seat, 0.017, frame))
  g.add(tubeBetween(seat, head, 0.017, frame))
  g.add(tubeBetween(bb, head, 0.019, frame))
  g.add(tubeBetween(seat, rearHub, 0.012, frame))
  g.add(tubeBetween(bb, rearHub, 0.012, frame))
  g.add(tubeBetween(head, frontHub, 0.014, frame))
  const hb = tubeBetween(new THREE.Vector3(0.38, 1.1, -0.28), new THREE.Vector3(0.38, 1.1, 0.28), 0.012, steel)
  g.add(hb)
  g.add(tubeBetween(head, V(0.38, 1.1), 0.012, steel))
  const sd = new THREE.Mesh(new RoundedBoxGeometry(0.26, 0.05, 0.14, 2, 0.02), black)
  sd.position.set(-0.28, 0.97, 0)
  g.add(sd)
  const rack = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.015, 0.14), steel)
  rack.position.set(-0.6, 0.76, 0)
  g.add(rack)
  const basket = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.2, 0.36), solid('#2c2f33', 0.7, 0.4))
  basket.position.set(0.5, 1.0, 0)
  g.add(basket)
  const gc = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.2, 0.02), solid('#191a1c', 0.7))
  gc.position.set(-0.1, 0.5, 0.2)
  g.add(gc)
  for (const m of g.children) shade(m as THREE.Mesh)
  return mergeByMaterial(g)
}

const carPaint = (c: string) => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.32, metalness: 0.55, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 1.3 })

function makeCar(color: string): THREE.Group {
  const g = new THREE.Group()
  const body = new THREE.Mesh(new RoundedBoxGeometry(4.2, 0.68, 1.78, 4, 0.14), carPaint(color))
  body.position.y = 0.62
  g.add(body)
  const cab = new THREE.Mesh(
    new RoundedBoxGeometry(2.2, 0.56, 1.6, 4, 0.2),
    new THREE.MeshPhysicalMaterial({ color: '#10161c', roughness: 0.05, metalness: 0.9, clearcoat: 1, envMapIntensity: 1.5 }),
  )
  cab.position.set(-0.25, 1.1, 0)
  g.add(cab)
  const roof = new THREE.Mesh(new RoundedBoxGeometry(1.6, 0.06, 1.5, 3, 0.03), carPaint(color))
  roof.position.set(-0.25, 1.4, 0)
  g.add(roof)
  const tire = solid('#111214', 0.8)
  for (const x of [-1.3, 1.25])
    for (const z of [-0.8, 0.8]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.22, 20), tire)
      w.rotation.x = Math.PI / 2
      w.position.set(x, 0.32, z)
      g.add(w)
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.24, 12), solid('#b8bdc2', 0.3, 1))
      rim.rotation.x = Math.PI / 2
      rim.position.set(x, 0.32, z)
      g.add(rim)
    }
  for (const z of [-0.65, 0.65]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.3), emissiveMat('#fff6e0', 2.5, true))
    h.position.set(2.1, 0.7, z)
    g.add(h)
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.1, 0.34), emissiveMat('#ff2a1a', 1.8, true))
    t.position.set(-2.1, 0.72, z)
    g.add(t)
  }
  for (const m of g.children) shade(m as THREE.Mesh)
  return mergeByMaterial(g)
}

function makeTram(): THREE.Group {
  const g = new THREE.Group()
  const L = 28
  const paint = new THREE.MeshPhysicalMaterial({ color: '#e9ecef', roughness: 0.35, metalness: 0.3, clearcoat: 0.8, envMapIntensity: 1.2 })
  const blue = new THREE.MeshPhysicalMaterial({ color: '#1b4a7a', roughness: 0.35, metalness: 0.3, clearcoat: 0.8 })
  const glass = new THREE.MeshPhysicalMaterial({ color: '#0e151b', roughness: 0.06, metalness: 0.9, clearcoat: 1, envMapIntensity: 1.5 })
  const body = new THREE.Mesh(new RoundedBoxGeometry(L, 3.1, 2.4, 4, 0.3), paint)
  body.position.y = 2.1
  g.add(body)
  const skirt = new THREE.Mesh(new RoundedBoxGeometry(L + 0.02, 0.55, 2.42, 3, 0.1), blue)
  skirt.position.y = 0.95
  g.add(skirt)
  const win = new THREE.Mesh(new RoundedBoxGeometry(L - 1.2, 1.15, 2.43, 3, 0.1), glass)
  win.position.y = 2.35
  g.add(win)
  for (let i = 1; i < 8; i++) {
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.3, 2.0, 2.44), blue)
    door.position.set(-L / 2 + (i * L) / 8, 1.95, 0)
    g.add(door)
  }
  const roof = new THREE.Mesh(new RoundedBoxGeometry(L - 4, 0.35, 1.6, 3, 0.1), solid('#52585e', 0.6, 0.3))
  roof.position.y = 3.8
  g.add(roof)
  for (const x of [-1, 1]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.5), emissiveMat('#fff6e0', 2.5, true))
    hl.position.set(x * (L / 2 + 0.01), 1.3, 0.8)
    g.add(hl)
    const hl2 = hl.clone()
    hl2.position.z = -0.8
    g.add(hl2)
  }
  const wheel = solid('#202326', 0.6, 0.5)
  for (let i = 0; i < 4; i++) {
    const bogie = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.5, 1.9), wheel)
    bogie.position.set(-L / 2 + 3 + i * ((L - 6) / 3), 0.4, 0)
    g.add(bogie)
  }
  for (const m of g.children) shade(m as THREE.Mesh)
  return mergeByMaterial(g)
}

function glowPoolTex() {
  const { c, g } = mkCanvas(128, 128)
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  gr.addColorStop(0, 'rgba(255,214,150,0.85)')
  gr.addColorStop(0.35, 'rgba(255,200,130,0.3)')
  gr.addColorStop(1, 'rgba(255,190,110,0)')
  g.fillStyle = gr
  g.fillRect(0, 0, 128, 128)
  return new THREE.CanvasTexture(c)
}

/* ------------------------------------------------------------------ buildings */
function building(w: number, h: number, d: number, kind: FacadeKind, seed: number, roof = '#4c4f54') {
  const g = new THREE.Group()
  const fm = facadeMat(kind, seed)
  const geo = metricBox(w, h, d, fm)
  const m = shade(new THREE.Mesh(geo, [fm, fm, new THREE.MeshStandardMaterial({ color: roof, roughness: 0.9 }), fm, fm, fm]))
  m.position.y = h / 2
  g.add(m)
  // roof parapet + plant room
  const par = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 0.6, d + 0.3), concreteMat('#8d8b85'))
  par.position.y = h + 0.1
  shade(par)
  g.add(par)
  const pr = new THREE.Mesh(new THREE.BoxGeometry(w * 0.35, 2.4, d * 0.3), solid('#7d8186', 0.7, 0.3))
  pr.position.set(w * 0.15, h + 1.5, 0)
  shade(pr)
  g.add(pr)
  return g
}

function buildPotlood(): THREE.Group {
  const g = new THREE.Group()
  const fm = facadeMat('white', 5)
  const w = 9.6
  const h = 48
  const body = shade(new THREE.Mesh(metricBox(w, h, w, fm), fm))
  body.position.y = h / 2
  g.add(body)
  const tip = new THREE.Mesh(new THREE.ConeGeometry(w * 0.74, 17, 4, 1), slateMat())
  tip.rotation.y = Math.PI / 4
  tip.position.y = h + 8.5
  const uv = tip.geometry.attributes.uv
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 8, uv.getY(i) * 8)
  shade(tip)
  g.add(tip)
  return g
}

function archShape(w: number, h: number, wi: number, hi: number) {
  const s = new THREE.Shape()
  s.moveTo(-w / 2, 0)
  s.lineTo(w / 2, 0)
  s.lineTo(w / 2, h)
  s.lineTo(-w / 2, h)
  s.closePath()
  const hole = new THREE.Path()
  const r = wi / 2
  hole.moveTo(-wi / 2, 0)
  hole.lineTo(-wi / 2, hi - r)
  hole.absarc(0, hi - r, r, Math.PI, 0, true)
  hole.lineTo(wi / 2, 0)
  hole.closePath()
  s.holes.push(hole)
  return { shape: s, r }
}

function buildMarkthal(): THREE.Group {
  const g = new THREE.Group()
  const W = 46
  const H = 38
  const Wi = 28
  const Hi = 30
  const len = 92
  const { shape } = archShape(W, H, Wi, Hi)
  const fm = facadeMat('dark', 9)
  const geo = new THREE.ExtrudeGeometry(shape, { depth: len, bevelEnabled: false, curveSegments: 24 })
  // caps get metre-based uvs already; side uvs are fine for plain dark cladding
  const outer = shade(new THREE.Mesh(geo, [fm, solid('#3a302d', 0.8)]))
  outer.position.z = -len / 2
  g.add(outer)
  // inner mural (arch tube)
  const r = Wi / 2
  const prof: [number, number][] = []
  prof.push([-r, 0], [-r, Hi - r])
  for (let i = 1; i < 24; i++) {
    const a = Math.PI - (Math.PI * i) / 24
    prof.push([Math.cos(a) * r, Hi - r + Math.sin(a) * r])
  }
  prof.push([r, Hi - r], [r, 0])
  const pos: number[] = []
  const uvs: number[] = []
  const idx: number[] = []
  let acc = 0
  const lens = [0]
  for (let i = 1; i < prof.length; i++) {
    acc += Math.hypot(prof[i][0] - prof[i - 1][0], prof[i][1] - prof[i - 1][1])
    lens.push(acc)
  }
  for (let i = 0; i < prof.length; i++)
    for (let j = 0; j < 2; j++) {
      pos.push(prof[i][0], prof[i][1], j * len - len / 2)
      uvs.push((lens[i] / acc) * 1.0, j * 1.6)
    }
  for (let i = 0; i < prof.length - 1; i++) {
    const a = i * 2
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
  }
  const tg = new THREE.BufferGeometry()
  tg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  tg.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  tg.setIndex(idx)
  tg.computeVertexNormals()
  const mural = new THREE.Mesh(tg, muralMat())
  mural.userData.noAO = true
  g.add(mural)
  // floor
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(Wi, len), solid('#8a8378', 0.5))
  floor.rotation.x = -Math.PI / 2
  floor.position.y = 0.05
  floor.receiveShadow = true
  g.add(floor)
  // glass end facades
  const gs = new THREE.Shape()
  gs.moveTo(-r, 0)
  gs.lineTo(-r, Hi - r)
  gs.absarc(0, Hi - r, r, Math.PI, 0, true)
  gs.lineTo(r, 0)
  gs.closePath()
  const gm = new THREE.MeshPhysicalMaterial({ color: '#9fb8c8', roughness: 0.05, transparent: true, opacity: 0.2, envMapIntensity: 2, side: THREE.DoubleSide, depthWrite: false })
  gm.userData.noAO = true
  for (const s of [-1, 1]) {
    const gl = new THREE.Mesh(new THREE.ShapeGeometry(gs, 24), gm)
    gl.position.z = s * (len / 2 - 0.2)
    g.add(gl)
  }
  // slender mullions
  const mull = solid('#2a2f34', 0.4, 0.8)
  for (const s of [-1, 1])
    for (let i = -6; i <= 6; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.12, Hi - Math.abs(i) * 0.25 - 4, 0.14), mull)
      m.position.set(i * 2.1, (Hi - Math.abs(i) * 0.25 - 4) / 2 + 0.2, s * (len / 2 - 0.2))
      g.add(m)
    }
  return g
}

/* ------------------------------------------------------------------ world */
export function buildWorld(onProgress?: (p: number, label: string) => void): World {
  const root = new THREE.Group()
  const circles: Circle[] = []
  const r = rng(2024)
  const bounds = { minX: -60, maxX: 60, minZ: -32, maxZ: 36 }
  const tick = (p: number, l: string) => onProgress?.(p, l)

  /* ---- ground ---- */
  tick(0.1, 'Paving the Overblaak promenade')
  const pave = paverMat()
  const ground = new THREE.Mesh(metricPlane(180, 80), pave)
  ground.position.set(0, 0, -6)
  ground.receiveShadow = true
  root.add(ground)
  // surrounding earth (far)
  const far = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.MeshStandardMaterial({ color: '#6c6b66', roughness: 1 }))
  far.rotation.x = -Math.PI / 2
  far.position.y = -0.3
  far.receiveShadow = true
  root.add(far)

  // road (Blaak) with tram lane
  const asph = asphaltMat()
  const road = new THREE.Mesh(metricPlane(260, 14), asph)
  road.position.set(0, -0.1, 28.5)
  road.receiveShadow = true
  root.add(road)
  const railBed = new THREE.Mesh(metricPlane(260, 3.4), concreteMat('#9d9a93'))
  railBed.position.set(0, -0.085, 25.4)
  railBed.receiveShadow = true
  root.add(railBed)
  const steel = solid('#7d848a', 0.35, 0.9)
  for (const z of [24.7, 26.135]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(260, 0.07, 0.07), steel)
    rail.position.set(0, -0.04, z)
    root.add(rail)
  }
  // lane markings
  const paint = solid('#e8e8e2', 0.7)
  const dashes: THREE.BufferGeometry[] = []
  for (let i = -60; i < 60; i++) {
    const g = new THREE.BoxGeometry(2.4, 0.012, 0.14)
    g.translate(i * 4.4, -0.085, 30.4)
    dashes.push(g)
  }
  for (const z of [22.0, 35.2]) {
    const g = new THREE.BoxGeometry(260, 0.012, 0.12)
    g.translate(0, -0.085, z)
    dashes.push(g)
  }
  {
    const merged = mergeByMaterial(
      (() => {
        const grp = new THREE.Group()
        for (const d of dashes) grp.add(new THREE.Mesh(d, paint))
        return grp
      })(),
      false,
    )
    root.add(merged)
  }
  // curbs
  const cm = curbMat()
  for (const z of [21.0, 36.0]) {
    const c = new THREE.Mesh(metricBox(260, 0.16, 0.3, cm), cm)
    c.position.set(0, -0.02, z)
    shade(c)
    root.add(c)
  }
  // far-side pavement
  const pav2 = new THREE.Mesh(metricPlane(260, 12), pave)
  pav2.position.set(0, 0, 42.2)
  pav2.receiveShadow = true
  root.add(pav2)

  /* ---- cubes ---- */
  tick(0.25, 'Raising the cube houses')
  const a0 = faceAngle0()
  const protoPylon = buildSolidPylon(PYLON_APO, FLOORS[1], a0)
  const shells = LAYOUTS.map((l, i) => buildCubeShell({ layout: l, seed: i * 3 + 1 }))
  const cubePositions: { x: number; z: number }[] = []
  const showIdx = 3
  const rowS = { z: 9.5, n: 7, x0: -24.6 }
  const rowN = { z: -9.5, n: 6, x0: -20.5 }
  let show!: ShowCube
  let k = 0
  const placeRow = (row: { z: number; n: number; x0: number }, isSouth: boolean) => {
    for (let i = 0; i < row.n; i++) {
      const x = row.x0 + i * 8.2
      cubePositions.push({ x, z: row.z })
      if (isSouth && i === showIdx) {
        show = buildShowCube(x, row.z, (300 * Math.PI) / 180)
        root.add(show.group)
        continue
      }
      const grp = new THREE.Group()
      grp.position.set(x, 0, row.z)
      grp.rotation.y = a0
      const pyl = protoPylon.clone()
      grp.add(pyl)
      const shell = shells[(k++ + (isSouth ? 0 : 1)) % shells.length].clone()
      shell.position.y = YC
      grp.add(shell)
      root.add(grp)
      circles.push({ x, z: row.z, r: PYLON_APO + 0.28 })
    }
  }
  placeRow(rowS, true)
  placeRow(rowN, false)
  // the show cube: collide as outer hex via circle segments is handled by the engine

  // cube-field entrance sign
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(2.4, 1.2),
    signMat([{ text: 'KUBUSWONINGEN', size: 62 }, { text: 'Overblaak · Rotterdam', size: 36, color: '#d8b24a' }, { text: 'Piet Blom · 1984', size: 32, color: '#9fb3c2' }], '#16222d', 512, 256),
  )
  const signPost = new THREE.Group()
  const postMat = solid('#2c3035', 0.5, 0.8)
  for (const x of [-1.0, 1.0]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.6, 0.08), postMat)
    p.position.set(x, 1.3, 0)
    shade(p)
    signPost.add(p)
  }
  sign.position.set(0, 1.9, 0.06)
  signPost.add(sign)
  const back = sign.clone()
  back.rotation.y = Math.PI
  back.position.z = -0.06
  signPost.add(back)
  signPost.position.set(-37, 0, 2.6)
  signPost.rotation.y = 0.55
  root.add(signPost)
  circles.push({ x: -37, z: 2.6, r: 1.2 })

  /* ---- props ---- */
  tick(0.45, 'Planting trees, parking bicycles')
  const lamp = makeLamp()
  const lampPos: [number, number, number][] = []
  for (let x = -40; x <= 40; x += 16) {
    lampPos.push([x, 3.8, Math.PI])
    lampPos.push([x + 8, -3.8, 0])
  }
  for (let x = -48; x <= 48; x += 16) lampPos.push([x, 19.6, Math.PI])
  const pools: THREE.Mesh[] = []
  const poolMat = new THREE.MeshBasicMaterial({ map: glowPoolTex(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 })
  for (const [x, z, rot] of lampPos) {
    const l = lamp.clone()
    l.position.set(x, 0, z)
    l.rotation.y = rot
    root.add(l)
    circles.push({ x, z, r: 0.2 })
    const p = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), poolMat)
    p.rotation.x = -Math.PI / 2
    p.position.set(x + Math.cos(rot) * 1.0, 0.03, z - Math.sin(rot) * 1.0)
    root.add(p)
    pools.push(p)
  }

  const bench = makeBench()
  const benches: [number, number, number][] = [
    [-16, 5.8, Math.PI],
    [16, -5.8, 0],
    [-30, -5.8, 0],
    [30, 5.8, Math.PI],
    [-4, 18, Math.PI],
    [20, 18, Math.PI],
  ]
  for (const [x, z, rot] of benches) {
    const b = bench.clone()
    b.position.set(x, 0, z)
    b.rotation.y = rot
    root.add(b)
    circles.push({ x, z, r: 0.6 })
  }

  // bollards along the road edge
  {
    const bol = new THREE.Group()
    const bm = solid('#303338', 0.5, 0.7)
    for (let x = -56; x <= 56; x += 3.2) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.9, 10), bm)
      m.position.set(x, 0.45, 20.4)
      bol.add(m)
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.081, 0.081, 0.06, 10), emissiveMat('#e8d27a', 0.6))
      band.position.set(x, 0.78, 20.4)
      bol.add(band)
    }
    mergeByMaterial(bol)
    root.add(bol)
    for (let x = -56; x <= 56; x += 3.2) circles.push({ x, z: 20.4, r: 0.13 })
  }

  // trees
  const treeProtos = [makeTree(7.4, 3, '#86a85c'), makeTree(8.4, 7, '#78a050'), makeTree(6.8, 11, '#93b565')]
  const treeSpots: [number, number][] = []
  for (let x = -54; x <= 54; x += 9.5) {
    treeSpots.push([x + r() * 2, -18.5 - r() * 3])
    if (Math.abs(x) > 28 || x % 2 > 1) treeSpots.push([x + r() * 2, 16.2 + r()])
  }
  for (const x of [-30, -12, 12, 30]) treeSpots.push([x, -20.5])
  treeSpots.forEach(([x, z], i) => {
    const t = treeProtos[i % 3].clone()
    t.position.set(x, 0, z)
    t.rotation.y = r() * TAU
    t.scale.setScalar(0.85 + r() * 0.35)
    root.add(t)
    circles.push({ x, z, r: 0.45 })
  })
  // planters with shrubs
  {
    const pm = concreteMat('#9a978f')
    for (const [x, z] of [
      [-12, 3.9],
      [12, -3.9],
      [-27, -3.9],
      [27, 3.9],
      [-33, 13],
      [33, -13],
    ] as [number, number][]) {
      const p = shade(new THREE.Mesh(metricBox(1.8, 0.7, 1.0, pm), pm))
      p.position.set(x, 0.35, z)
      root.add(p)
      const b = makeBush(0.75, Math.floor(x * 3 + z), '#6f9448')
      b.position.set(x, 0.95, z)
      root.add(b)
      circles.push({ x, z, r: 1.1 })
    }
  }

  // parked bicycles
  const bikeCols = ['#1c1d20', '#23504a', '#8d2b25', '#2a3f66', '#c9c3b6']
  const bikes = bikeCols.map((c) => makeBike(c))
  let bi = 0
  for (let i = 0; i < 12; i++) {
    const x = -22 + i * 1.0
    const b = bikes[bi++ % bikes.length].clone()
    b.position.set(x, 0, -17.2)
    b.rotation.y = Math.PI / 2 + (r() - 0.5) * 0.2
    root.add(b)
  }
  for (let i = 0; i < 7; i++) {
    const b = bikes[bi++ % bikes.length].clone()
    b.position.set(14 + i * 1.0, 0, 17.2)
    b.rotation.y = Math.PI / 2 + (r() - 0.5) * 0.2
    root.add(b)
  }
  // bike rack rails
  {
    const rk = new THREE.Group()
    const m = solid('#4a5057', 0.4, 0.9)
    for (const [z, x0, n] of [[-16.6, -22, 12], [16.6, 14, 7]] as [number, number, number][]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(n + 0.2, 0.04, 0.04), m)
      rail.position.set(x0 + n / 2 - 0.5, 0.3, z)
      rk.add(rail)
    }
    mergeByMaterial(rk)
    root.add(rk)
  }

  /* ---- background architecture ---- */
  tick(0.65, 'Building Rotterdam around the cubes')
  const kinds: FacadeKind[] = ['brick', 'concrete', 'glass', 'white', 'brick', 'dark']
  const addRow = (z: number, dirSign: number, seed: number) => {
    const rr = rng(seed)
    let x = -150
    while (x < 150) {
      const w = 14 + rr() * 14
      const h = 16 + rr() * 26
      const d = 16 + rr() * 6
      const b = building(w, Math.round(h / 3.2) * 3.2, d, kinds[(rr() * kinds.length) | 0], Math.floor(rr() * 5) + 1)
      b.position.set(x + w / 2, 0, z + dirSign * (d / 2))
      root.add(b)
      x += w + 1.5 + rr() * 2
    }
  }
  addRow(-38, -1, 11)
  addRow(47, 1, 31)
  // potlood tower (Blaaktoren) west end
  const potlood = buildPotlood()
  potlood.position.set(-72, 0, -16)
  root.add(potlood)
  // markthal east end, arch axis along x
  const mt = buildMarkthal()
  mt.rotation.y = Math.PI / 2
  mt.position.set(112, 0, -8)
  root.add(mt)
  // distant skyline
  {
    const rr = rng(404)
    for (let i = 0; i < 46; i++) {
      const a = (i / 46) * TAU + rr() * 0.1
      const rad = 260 + rr() * 220
      const w = 18 + rr() * 22
      const h = 40 + rr() * 110
      const b = shade(new THREE.Mesh(metricBox(w, h, w, facadeMat(kinds[(rr() * kinds.length) | 0], 1 + ((rr() * 5) | 0))), facadeMat('glass', 2)), false)
      const f = facadeMat(kinds[(rr() * kinds.length) | 0], 3)
      b.material = f
      b.position.set(Math.cos(a) * rad, h / 2, Math.sin(a) * rad)
      b.rotation.y = rr() * 3
      root.add(b)
    }
  }

  /* ---- traffic ---- */
  tick(0.85, 'Starting the tram')
  const tram = makeTram()
  root.add(tram)
  const carCols = ['#b32d24', '#22487f', '#e6e6e1', '#2b2e33', '#3b6a4f', '#c9a227']
  const cars = carCols.map((c, i) => {
    const m = makeCar(c)
    root.add(m)
    return { m, dir: i % 2 === 0 ? 1 : -1, off: i * 31, speed: 5 + (i % 3) * 1.2 }
  })

  const landmarks: Record<string, THREE.Vector3> = {
    potlood: new THREE.Vector3(-72, 30, -16),
    markthal: new THREE.Vector3(66, 14, -8),
    showCube: new THREE.Vector3(show.group.position.x, YC, show.group.position.z),
  }

  // show-cube hall: outer wall segments are provided by the engine from `show`
  const world: World = {
    group: root,
    circles,
    show,
    showPos: new THREE.Vector2(show.group.position.x, show.group.position.z),
    bounds,
    cubePositions,
    landmarks,
    setNight(n: number) {
      poolMat.opacity = Math.max(0, (n - 0.35) * 1.4)
    },
    update(t: number) {
      const L = 300
      // tram: slow eastbound, wraps
      const tx = ((((t * 7.5 + 40) % L) + L) % L) - L / 2
      tram.position.set(tx, 0, 25.4)
      tram.rotation.y = 0
      for (const c of cars) {
        const x = ((((t * c.speed * c.dir + c.off) % L) + L) % L) - L / 2
        const z = c.dir > 0 ? 29.4 : 32.2
        c.m.position.set(x, 0, z)
        c.m.rotation.y = c.dir > 0 ? 0 : Math.PI
      }
    },
  }
  void pools
  return world
}

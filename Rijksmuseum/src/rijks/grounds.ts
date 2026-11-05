import * as THREE from 'three'
import { Batch, PI, box, boxMM, cylinder, rng, sphere } from './geo'
import type { Mats } from './materials'
import * as T from './textures'
import { World } from './world'

function canopyGeo(seed: number) {
  const r = rng(seed)
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], colr: number[] = [], idx: number[] = []
  const n = 240
  const R = 3.0, RY = 2.5
  let v = 0
  const q = new THREE.Quaternion(), e = new THREE.Euler()
  for (let i = 0; i < n; i++) {
    let x: number, y: number, z: number
    do { x = r() * 2 - 1; y = r() * 2 - 1; z = r() * 2 - 1 } while (x * x + y * y + z * z > 1)
    const px = x * R, py = y * RY, pz = z * R
    const s = 1.1 + r() * 1.0
    e.set(r() * PI * 2, r() * PI * 2, r() * PI * 2)
    q.setFromEuler(e)
    const outward = new THREE.Vector3(px, py * 1.2 + 0.4, pz).normalize()
    const shade = 0.5 + 0.55 * Math.min(1, Math.max(0, (y + 1) / 2)) + (r() - 0.5) * 0.14 + 0.18 * Math.hypot(x, z)
    for (const [cx, cy, u0, v0] of [[-0.5, -0.5, 0, 0], [0.5, -0.5, 1, 0], [0.5, 0.5, 1, 1], [-0.5, 0.5, 0, 1]]) {
      const p = new THREE.Vector3(cx * s, cy * s, 0).applyQuaternion(q)
      pos.push(px + p.x, py + p.y, pz + p.z)
      nor.push(outward.x, outward.y, outward.z)
      uv.push(u0, v0)
      colr.push(shade * 0.95, shade, shade * 0.9)
    }
    idx.push(v, v + 1, v + 2, v, v + 2, v + 3)
    v += 4
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3))
  g.setIndex(idx)
  return g
}

export function buildGrounds(w: World, m: Mats) {
  const root = w.group
  const b = new Batch()
  const rand = rng(99)

  /* ---------------- lawn with macro colour variation */
  {
    const S = 6000, seg = 200
    const g = new THREE.PlaneGeometry(S, S, seg, seg)
    g.rotateX(-PI / 2)
    const pos = g.attributes.position
    const uv = new Float32Array(pos.count * 2)
    const col = new Float32Array(pos.count * 3)
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i)
      uv[i * 2] = x; uv[i * 2 + 1] = z
      const n = 0.5 + 0.25 * Math.sin(x * 0.021 + 1.3) * Math.sin(z * 0.017 + 0.4) + 0.18 * Math.sin(x * 0.067 + z * 0.052) + 0.1 * Math.sin(x * 0.19 - z * 0.13)
      const t = 0.5 + n * 0.45
      col[i * 3] = t * 1.08; col[i * 3 + 1] = t * 0.96; col[i * 3 + 2] = t * 0.8
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
    g.setAttribute('color', new THREE.BufferAttribute(col, 3))
    const mesh = new THREE.Mesh(g, m.grass)
    mesh.position.y = -0.02
    mesh.receiveShadow = true
    root.add(mesh)
  }

  /* ---------------- paving */
  boxMM(b, m.pavers, -92, 92, -0.4, 0, -68, 68) // apron around the museum
  boxMM(b, m.pavers, -10, 10, -0.4, 0, 66, 215) // Museumplein promenade
  boxMM(b, m.pavers, -10, 10, -0.4, 0, -215, -66)
  boxMM(b, m.pavers, -130, 130, -0.4, 0, 150, 156) // cross path
  for (const s of [-1, 1]) {
    boxMM(b, m.cycle, s > 0 ? 10 : -12.6, s > 0 ? 12.6 : -10, -0.4, 0.004, 66, 215)
    boxMM(b, m.cycle, s > 0 ? 10 : -12.6, s > 0 ? 12.6 : -10, -0.4, 0.004, -215, -66)
  }
  // low stone kerb marking the museum garden
  boxMM(b, m.stone, -92, 92, -0.4, 0.12, 67.7, 68)
  boxMM(b, m.stone, -92, 92, -0.4, 0.12, -68, -67.7)

  /* ---------------- reflecting pond (raised basin) */
  {
    const x0 = -26, x1 = 26, z0 = 98, z1 = 130
    boxMM(b, m.stone, x0 - 0.8, x1 + 0.8, -0.2, 0.42, z0 - 0.8, z0)
    boxMM(b, m.stone, x0 - 0.8, x1 + 0.8, -0.2, 0.42, z1, z1 + 0.8)
    boxMM(b, m.stone, x0 - 0.8, x0, -0.2, 0.42, z0, z1)
    boxMM(b, m.stone, x1, x1 + 0.8, -0.2, 0.42, z0, z1)
    boxMM(b, m.floorDark, x0, x1, -0.2, 0.05, z0, z1)
    const wg = new THREE.PlaneGeometry(x1 - x0, z1 - z0)
    wg.rotateX(-PI / 2)
    const wm = new THREE.Mesh(wg, m.water)
    wm.position.set(0, 0.28, (z0 + z1) / 2)
    wm.receiveShadow = true
    root.add(wm)
    w.colliders.push({ x0: x0 - 0.9, x1: x1 + 0.9, z0: z0 - 0.9, z1: z1 + 0.9, y0: 0, y1: 5 })
    w.updaters.push((t) => { m.waveTex.offset.set(t * 0.004, t * 0.0027) })
  }

  /* ---------------- front garden parterres + hedges */
  const flowerCols = ['#e8c13a', '#d93a52', '#c24ecf', '#f4f1e8', '#ff8a2a', '#7a5af8']
  const flowers: { p: THREE.Vector3; c: THREE.Color; s: number }[] = []
  const parterre = (x0: number, x1: number, z0: number, z1: number) => {
    const t = 0.55, h = 0.75
    boxMM(b, m.hedge, x0, x1, 0, h, z0, z0 + t)
    boxMM(b, m.hedge, x0, x1, 0, h, z1 - t, z1)
    boxMM(b, m.hedge, x0, x0 + t, 0, h, z0, z1)
    boxMM(b, m.hedge, x1 - t, x1, 0, h, z0, z1)
    boxMM(b, m.stoneSmooth, x0 + t, x1 - t, 0, 0.08, z0 + t, z1 - t) // soil base (reads as gravel)
    w.colliders.push({ x0, x1, z0, z1, y0: 0, y1: 1 })
    const stripes = Math.floor((x1 - x0) / 1.6)
    for (let i = 0; i < stripes * 10; i++) {
      const c = new THREE.Color(flowerCols[Math.floor(i / 10 + (z0 > 0 ? 0 : 3)) % flowerCols.length])
      const row = Math.floor(i / 10)
      flowers.push({ p: new THREE.Vector3(x0 + t + 0.4 + row * 1.6 + rand() * 1.0, 0.2, z0 + t + 0.4 + rand() * (z1 - z0 - 2 * t - 0.8)), c, s: 0.8 + rand() * 0.5 })
    }
  }
  parterre(14, 32, 72, 82)
  parterre(-32, -14, 72, 82)
  parterre(14, 32, -82, -72)
  parterre(-32, -14, -82, -72)
  // clipped hedges on the building front
  for (const s of [-1, 1]) {
    boxMM(b, m.hedge, s > 0 ? 6.5 : -40, s > 0 ? 40 : -6.5, 0, 0.9, 59.6, 60.4)
    w.colliders.push({ x0: s > 0 ? 6.5 : -40, x1: s > 0 ? 40 : -6.5, z0: 59.6, z1: 60.4, y0: 0, y1: 1 })
  }
  if (flowers.length) {
    const fg = new THREE.SphereGeometry(0.17, 8, 6)
    const fm = new THREE.InstancedMesh(fg, new THREE.MeshStandardMaterial({ roughness: 0.7 }), flowers.length)
    const mt = new THREE.Matrix4()
    flowers.forEach((f, i) => {
      mt.compose(f.p, new THREE.Quaternion(), new THREE.Vector3(f.s, f.s * 0.8, f.s))
      fm.setMatrixAt(i, mt)
      fm.setColorAt(i, f.c)
    })
    fm.castShadow = false
    fm.receiveShadow = true
    root.add(fm)
  }

  /* ---------------- street lamps + benches */
  const lamp = (x: number, z: number) => {
    cylinder(b, m.steel, 0.06, 0.1, 5.2, x, 0, z, 8)
    box(b, m.steel, 0.9, 0.05, 0.05, x, 5.15, z)
    cylinder(b, m.lamp, 0.16, 0.2, 0.34, x - 0.45, 4.8, z, 10)
    cylinder(b, m.lamp, 0.16, 0.2, 0.34, x + 0.45, 4.8, z, 10)
  }
  for (let z = 78; z < 215; z += 22) for (const x of [-13.8, 13.8]) lamp(x, z)
  for (let x = -60; x <= 60; x += 20) if (Math.abs(x) > 8) lamp(x, 63)
  for (let z = -80; z > -215; z -= 22) for (const x of [-13.8, 13.8]) lamp(x, z)
  for (let z = 90; z < 205; z += 26) for (const x of [-15.6, 15.6]) {
    box(b, m.woodMid, 0.55, 0.08, 2.0, x, 0.46, z)
    box(b, m.woodMid, 0.1, 0.45, 2.0, x + (x > 0 ? 0.25 : -0.25), 0.5, z)
    box(b, m.steel, 0.5, 0.44, 0.08, x, 0, z - 0.8)
    box(b, m.steel, 0.5, 0.44, 0.08, x, 0, z + 0.8)
  }
  // bicycle racks beside the south portal
  for (const s of [-1, 1]) for (let i = 0; i < 12; i++) {
    const x = s * (9 + i * 1.0)
    box(b, m.steel, 0.04, 0.5, 2.6, x + 0.0, 0, 55.5)
  }

  /* ---------------- trees (instanced) */
  const trees: { x: number; z: number; s: number; ry: number }[] = []
  const tree = (x: number, z: number, s = 1) => {
    trees.push({ x, z, s, ry: rand() * PI * 2 })
    w.colliders.push({ x0: x - 0.45 * s, x1: x + 0.45 * s, z0: z - 0.45 * s, z1: z + 0.45 * s, y0: 0, y1: 8 })
  }
  for (let z = 76; z < 215; z += 13) { tree(-17.5, z, 0.9 + rand() * 0.25); tree(17.5, z, 0.9 + rand() * 0.25) }
  for (let z = -80; z > -215; z -= 14) { tree(-17.5, z, 0.9 + rand() * 0.25); tree(17.5, z, 0.9 + rand() * 0.25) }
  for (let i = 0; i < 70; i++) {
    const a = rand() * PI * 2
    const d = 105 + rand() * 90
    const x = Math.cos(a) * d * 1.15, z = Math.sin(a) * d * 0.95 + 20
    const inside = Math.abs(x) < 94 && Math.abs(z) < 70
    const onProm = Math.abs(x) < 22 && Math.abs(z) > 60
    const onPond = x > -32 && x < 32 && z > 92 && z < 136
    if (inside || onProm || onPond) continue
    tree(x, z, 0.8 + rand() * 0.6)
  }
  for (let i = 0; i < 26; i++) {
    const x = (rand() < 0.5 ? -1 : 1) * (74 + rand() * 40)
    const z = -60 + rand() * 120
    if (Math.abs(x) < 72) continue
    tree(x, z, 0.8 + rand() * 0.5)
  }
  for (let i = 0; i < 18; i++) {
    const x = -50 + rand() * 100
    const z = -88 - rand() * 40
    if (Math.abs(x) < 16 && Math.abs(z) < 90) continue
    tree(x, z, 0.8 + rand() * 0.5)
  }
  for (let x = -85; x <= 85; x += 17) if (Math.abs(x) > 12) { tree(x, 76, 0.85); tree(x, -76, 0.85) }
  {
    const trunkGeo = new THREE.CylinderGeometry(0.2, 0.34, 4.6, 8)
    trunkGeo.translate(0, 2.3, 0)
    const trunk = new THREE.InstancedMesh(trunkGeo, m.bark, trees.length)
    const can = new THREE.InstancedMesh(canopyGeo(4), m.leaves, trees.length)
    const mt = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0)
    const tint = new THREE.Color()
    trees.forEach((t, i) => {
      q.setFromAxisAngle(up, t.ry)
      mt.compose(new THREE.Vector3(t.x, 0, t.z), q, new THREE.Vector3(t.s, t.s, t.s))
      trunk.setMatrixAt(i, mt)
      mt.compose(new THREE.Vector3(t.x, 5.3 * t.s, t.z), q, new THREE.Vector3(t.s * 1.05, t.s, t.s * 1.05))
      can.setMatrixAt(i, mt)
      tint.setHSL(0.26 + rand() * 0.05, 0.4 + rand() * 0.2, 0.62 + rand() * 0.2)
      can.setColorAt(i, tint)
    })
    for (const mesh of [trunk, can]) {
      mesh.castShadow = true
      mesh.receiveShadow = true
      mesh.frustumCulled = false
      root.add(mesh)
    }
  }

  /* ---------------- surrounding Amsterdam blocks (skyline) */
  {
    const tf = T.townFacade()
    const mk = (tint: string) => {
      const mat = new THREE.MeshStandardMaterial({ map: tf.map, emissiveMap: tf.emissive, emissive: '#ffcf90', emissiveIntensity: 0.0, color: tint, roughness: 0.9 })
      m.glows.push({ mat, day: 0.0, night: 1.0 })
      return mat
    }
    const mats = [mk('#ffffff'), mk('#e5c6b4'), mk('#c9b6ad'), mk('#f1dccb')]
    const roof = m.lead
    const blocks = new Batch()
    const row = (x0: number, z0: number, dx: number, dz: number, n: number, depth: number, face: number) => {
      let x = x0, z = z0
      for (let i = 0; i < n; i++) {
        const wd = 12 + rand() * 12
        const h = 16 + Math.floor(rand() * 4) * 3.2
        const mat = mats[Math.floor(rand() * mats.length)]
        const cx = x + (dx * wd) / 2, cz = z + (dz * wd) / 2
        const bw = dx !== 0 ? wd : depth, bd = dz !== 0 ? wd : depth
        boxMM(blocks, mat, cx - bw / 2, cx + bw / 2, 0, h, cz - bd / 2, cz + bd / 2)
        boxMM(blocks, roof, cx - bw / 2 - 0.3, cx + bw / 2 + 0.3, h, h + 0.5, cz - bd / 2 - 0.3, cz + bd / 2 + 0.3)
        // pitched roof via a thin lead slab
        boxMM(blocks, roof, cx - bw / 2 + 1, cx + bw / 2 - 1, h + 0.5, h + 2.2 + rand() * 1.5, cz - bd / 2 + 1, cz + bd / 2 - 1)
        x += dx * wd; z += dz * wd
      }
      void face
    }
    row(-300, 250, 1, 0, 28, 16, 0)
    row(-300, -190, 1, 0, 28, 16, 0)
    row(-250, -170, 0, 1, 34, 16, 0)
    row(250, -170, 0, 1, 34, 16, 0)
    blocks.build(root)
  }

  b.build(root)
  void sphere
}

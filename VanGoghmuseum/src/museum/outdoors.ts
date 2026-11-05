import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { Builder } from './builder'
import { Materials, canvasTex, hash2 } from './textures'
import type { Glow } from './world'

type ColBox = (x0: number, z0: number, x1: number, z1: number, y0: number, y1: number) => void

function crownGeometry(seed: number) {
  const parts: THREE.BufferGeometry[] = []
  const center = new THREE.Vector3(0, 0, 0)
  for (let i = 0; i < 90; i++) {
    const r1 = hash2(i, seed, 1), r2 = hash2(i, seed, 2), r3 = hash2(i, seed, 3)
    const th = r1 * Math.PI * 2, ph = Math.acos(2 * r2 - 1)
    const rad = Math.cbrt(r3) * 3.6
    const p = new THREE.Vector3(Math.sin(ph) * Math.cos(th) * rad, Math.cos(ph) * rad * 0.8, Math.sin(ph) * Math.sin(th) * rad)
    const s = 1.7 + hash2(i, seed, 4) * 1.4
    const g = new THREE.PlaneGeometry(s, s)
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(hash2(i, seed, 5) * 6.28, hash2(i, seed, 6) * 6.28, hash2(i, seed, 7) * 6.28))
    g.applyMatrix4(new THREE.Matrix4().compose(p, q, new THREE.Vector3(1, 1, 1)))
    // radial normals give the crown a soft, volumetric shading
    const n = new THREE.Vector3().subVectors(p, center).add(new THREE.Vector3(0, 0.6, 0)).normalize()
    const na = g.attributes.normal as THREE.BufferAttribute
    for (let k = 0; k < na.count; k++) na.setXYZ(k, n.x, n.y, n.z)
    parts.push(g)
  }
  return mergeGeometries(parts, false)!
}

export function buildOutdoors(b: Builder, M: Materials, root: THREE.Group, glow: Glow[], colBox: ColBox) {
  /* ground */
  b.box(M.grass, -500, -0.6, -500, 500, -0.04, 500)
  b.box(M.brick, -60, -0.3, -34, 100, 0, 50)
  b.box(M.brick, -220, -0.3, -58, 220, 0, -34)
  b.box(M.asphalt, -220, -0.3, -47, 220, -0.02, -36)
  b.box(M.redAsphalt, -220, -0.3, -36, 220, -0.015, -34.2)
  b.box(M.redAsphalt, -220, -0.3, -48.8, 220, -0.015, -47)
  for (let x = -210; x < 210; x += 8) b.box(M.white, x, -0.02, -41.6, x + 3.5, -0.012, -41.4)
  // raised lawn beds with stone curbs
  const bed = (x0: number, z0: number, x1: number, z1: number) => {
    b.box(M.stone, x0 - 0.2, 0, z0 - 0.2, x1 + 0.2, 0.14, z1 + 0.2)
    b.box(M.grass, x0, 0.05, z0, x1, 0.12, z1)
  }
  bed(-38, 3, -10, 12.5); bed(30, 24, 58, 34); bed(-56, 20, -44, 42); bed(70, 4, 90, 40)

  /* lamps, benches, banners, bikes */
  const lampMat = new THREE.MeshStandardMaterial({ color: '#f6f1e6', emissive: '#ffd7a0', emissiveIntensity: 0, roughness: 0.5 })
  glow.push({ mat: lampMat, base: 0, night: 4 })
  const lamp = (x: number, z: number) => {
    b.cyl(M.darkMetal, x, 0, z, 0.09, 6, 10, 0.06)
    b.box(M.darkMetal, x - 0.04, 5.9, z - 0.04, x + 0.04, 6.0, z + 1.0)
    b.box(lampMat, x - 0.2, 5.8, z + 0.7, x + 0.2, 5.9, z + 1.1)
    b.seg(x - 0.1, z, x + 0.1, z, 0, 3)
  }
  for (let x = -50; x <= 95; x += 18) { lamp(x, 22); lamp(x + 9, 46) }
  for (let x = -48; x <= 90; x += 18) lamp(x, -33)
  const outBench = (x: number, z: number) => {
    for (let i = 0; i < 5; i++) b.box(M.wood, x - 1, 0.42 + i * 0.001, z - 0.25 + i * 0.1, x + 1, 0.46, z - 0.17 + i * 0.1)
    b.box(M.wood, x - 1, 0.6, z + 0.2, x + 1, 0.9, z + 0.25)
    b.box(M.darkMetal, x - 0.9, 0, z - 0.2, x - 0.85, 0.5, z + 0.25)
    b.box(M.darkMetal, x + 0.85, 0, z - 0.2, x + 0.9, 0.5, z + 0.25)
    colBox(x - 1, z - 0.3, x + 1, z + 0.3, 0, 0.9)
  }
  for (const [x, z] of [[-30, 28], [-8, 30], [20, 30], [60, 40], [-6, 26.5], [80, 30], [-45, 8]]) outBench(x, z)

  const bike = (x: number, z: number, ry: number) => {
    const W = (px: number, py: number): [number, number, number] => [x + px * Math.cos(ry), py, z - px * Math.sin(ry)]
    for (const px of [-0.5, 0.5]) {
      const g = new THREE.TorusGeometry(0.34, 0.018, 6, 24)
      g.rotateY(ry)
      const w = W(px, 0.34)
      g.translate(w[0], w[1], w[2])
      b.geo(M.darkMetal, g)
    }
    const bar = (p0: [number, number], p1: [number, number], t = 0.025) => {
      const dx = p1[0] - p0[0], dy = p1[1] - p0[1]
      const c = W((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2)
      b.boxC(M.darkMetal, c[0], c[1], c[2], Math.hypot(dx, dy), t, t, ry, 0, Math.atan2(dy, dx))
    }
    bar([-0.5, 0.34], [-0.1, 0.3]); bar([-0.1, 0.3], [-0.2, 0.95]); bar([-0.2, 0.95], [0.38, 0.88]); bar([-0.1, 0.3], [0.38, 0.88])
    bar([-0.5, 0.34], [-0.2, 0.95]); bar([0.38, 0.88], [0.5, 0.34]); bar([0.38, 0.88], [0.42, 1.02])
    const hb = W(0.42, 1.03)
    b.boxC(M.darkMetal, hb[0], hb[1], hb[2], 0.03, 0.03, 0.55, ry)
    const st = W(-0.22, 1.0)
    b.boxC(M.leather, st[0], st[1], st[2], 0.22, 0.05, 0.14, ry)
  }
  for (let i = 0; i < 9; i++) bike(-33 + i * 0.75, 18.5, Math.PI / 2 + (i % 2 ? 0.05 : -0.03))
  for (let i = 0; i < 7; i++) bike(32 + i * 0.75, 22.2, Math.PI / 2 + (i % 3) * 0.04)
  b.box(M.darkMetal, -33.4, 0, 18.3, -27.2, 0.04, 18.7)
  colBox(-33.6, 17.5, -27, 19.4, 0, 1)

  const bannerTex = canvasTex(256, 1024, (g, w, h) => {
    g.fillStyle = '#f2c230'; g.fillRect(0, 0, w, h)
    g.fillStyle = '#16343c'; g.fillRect(0, h - 60, w, 60)
    g.save(); g.translate(w / 2 + 14, h / 2 - 20); g.rotate(-Math.PI / 2)
    g.fillStyle = '#1b1a19'; g.font = '800 98px Helvetica, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'
    g.fillText('VAN GOGH', 0, -34); g.fillText('MUSEUM', 0, 62)
    g.restore()
  })
  const bannerMat = new THREE.MeshStandardMaterial({ map: bannerTex, roughness: 0.8, side: THREE.DoubleSide })
  for (const x of [-16, -4, 14, 38]) {
    b.cyl(M.steel, x, 0, 20.6, 0.07, 11, 10, 0.05)
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 6), bannerMat)
    m.position.set(x + 0.8, 7.2, 20.6)
    m.castShadow = true
    root.add(m)
    b.box(M.steel, x, 10.2, 20.57, x + 1.6, 10.26, 20.63)
  }

  /* trees: plane trees on the plaza, scattered on the lawns */
  const spots: [number, number, number][] = []
  for (let x = -54; x <= 96; x += 10) if (x < -8 || x > 24) spots.push([x + (hash2(x, 1, 1) - 0.5) * 3, 26.5 + (hash2(x, 2, 2) - 0.5) * 1.2, 0.9 + hash2(x, 3, 3) * 0.35])
  for (let x = -54; x <= 96; x += 11) spots.push([x + (hash2(x, 4, 1) - 0.5) * 3, -32 + (hash2(x, 5, 2) - 0.5) * 1.5, 0.95 + hash2(x, 6, 3) * 0.3])
  for (let i = 0; i < 38; i++) {
    const x = -100 + hash2(i, 7, 7) * 240, z = 56 + hash2(i, 8, 8) * 110
    spots.push([x, z, 0.9 + hash2(i, 9, 9) * 0.6])
  }
  for (let i = 0; i < 12; i++) {
    spots.push([-66 - hash2(i, 11, 1) * 30, -30 + hash2(i, 12, 1) * 90, 1 + hash2(i, 13, 1) * 0.4])
    spots.push([110 + hash2(i, 14, 1) * 25, -30 + hash2(i, 15, 1) * 90, 1 + hash2(i, 16, 1) * 0.4])
  }
  const crown = crownGeometry(5)
  const crownMesh = new THREE.InstancedMesh(crown, M.leaf, spots.length)
  const trunkGeo = new THREE.CylinderGeometry(0.3, 0.46, 8, 10)
  trunkGeo.translate(0, 4, 0)
  const trunkMesh = new THREE.InstancedMesh(trunkGeo, M.bark, spots.length)
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color()
  spots.forEach(([x, z, s], i) => {
    q.setFromEuler(new THREE.Euler(0, hash2(i, 1, 21) * 6.28, 0))
    m4.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(s, s, s))
    trunkMesh.setMatrixAt(i, m4)
    m4.compose(new THREE.Vector3(x, 8.2 * s + 0.6, z), q, new THREE.Vector3(s * 1.15, s, s * 1.15))
    crownMesh.setMatrixAt(i, m4)
    col.setHSL(0.24 + hash2(i, 2, 22) * 0.05, 0.38 + hash2(i, 3, 22) * 0.2, 0.34 + hash2(i, 4, 22) * 0.16)
    crownMesh.setColorAt(i, col)
    if (z > 5 || z < -26 || x < -42 || x > 12) colBox(x - 0.4, z - 0.4, x + 0.4, z + 0.4, 0, 3)
  })
  for (const mesh of [crownMesh, trunkMesh]) { mesh.castShadow = true; mesh.receiveShadow = true; root.add(mesh) }

  /* Amsterdam row houses as a backdrop */
  const houseCols = ['#7e3f2c', '#6d3626', '#8a4a33', '#5f3a30']
  const hmats = houseCols.map((c) => {
    const m = M.brickWall.clone()
    m.color = new THREE.Color(c).lerp(new THREE.Color('#ffffff'), 0.4)
    m.userData.tile = [2, 2]
    return m
  })
  const house = (face: 'z+' | 'x+' | 'x-', cx: number, cz: number, w: number, h: number, d: number, seed: number) => {
    const map = (u: number, v: number): [number, number] => (face === 'z+' ? [cx + u, cz + v] : face === 'x+' ? [cx + v, cz - u] : [cx - v, cz + u])
    const Bx = (mat: THREE.Material, u0: number, y0: number, v0: number, u1: number, y1: number, v1: number) => {
      const p = map(u0, v0), r = map(u1, v1)
      b.box(mat, Math.min(p[0], r[0]), y0, Math.min(p[1], r[1]), Math.max(p[0], r[0]), y1, Math.max(p[1], r[1]))
    }
    Bx(hmats[seed % 4], -w / 2, -0.2, -d, w / 2, h, 0)
    Bx(M.darkMetal, -w / 2 - 0.2, h, -d - 0.2, w / 2 + 0.2, h + 1.4, 0.2)
    Bx(M.white, -w / 2 - 0.1, h - 0.3, -0.05, w / 2 + 0.1, h, 0.25)
    if (seed % 2 === 0) { Bx(hmats[seed % 4], -w / 4, h, -0.6, w / 4, h + 3, -0.1); Bx(M.white, -w / 4 - 0.05, h + 3, -0.7, w / 4 + 0.05, h + 3.15, 0.05) }
    const floors = Math.floor((h - 1) / 3.4)
    for (let f = 0; f < floors; f++) {
      for (const u of [-w / 3, 0, w / 3]) {
        const y = 1.3 + f * 3.4
        const hh = f === 0 ? 2.0 : 2.3
        Bx(M.white, u - 0.7, y, 0, u + 0.7, y + hh, 0.14)
        Bx(M.teal, u - 0.55, y + 0.12, 0.14, u + 0.55, y + hh - 0.12, 0.17)
        Bx(M.white, u - 0.03, y + 0.12, 0.17, u + 0.03, y + hh - 0.12, 0.2)
      }
    }
  }
  for (let i = 0, x = -200; x < 200; i++) {
    const w = 6.5 + hash2(i, 1, 31) * 3
    house('z+', x + w / 2, -74, w, 15 + hash2(i, 2, 31) * 5, 14, i)
    x += w + 0.05
  }
  for (let i = 0, z = -40; z < 130; i++) {
    const w = 7 + hash2(i, 3, 32) * 3
    house('x+', -125, z + w / 2, w, 14 + hash2(i, 4, 32) * 5, 14, i + 1)
    house('x-', 165, z + w / 2, w, 14 + hash2(i, 5, 32) * 5, 14, i + 2)
    z += w + 0.05
  }
}

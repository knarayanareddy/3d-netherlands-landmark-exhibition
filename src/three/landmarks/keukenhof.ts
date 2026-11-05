import * as THREE from 'three'
import { Landmark, TAU, bake, box, colorMat, glassMat, grassMat, groundSlab, newGroup, rng, tree, waterMat, waterPoly, discPoly, paveMat } from '../kit'
import { windmill } from './windmill'

export function buildKeukenhof(): Landmark {
  const g = newGroup()
  const R = 10.2
  groundSlab(g, R, grassMat('#5f9140'), colorMat('#5a4a36', 1), [discPoly(0, 0.2, 1.8, 40)])
  const stat = newGroup()

  // gravel
  const gravel = new THREE.Mesh(new THREE.RingGeometry(1.8, 8.9, 64), colorMat('#bba98a', 1))
  gravel.rotation.x = -Math.PI / 2
  gravel.position.set(0, 0.03, 0.2)
  gravel.receiveShadow = true
  g.add(gravel)
  // pond
  waterPoly(g, discPoly(0, 0.2, 1.8, 40), -0.22, waterMat('#3d7080', 0.4))
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1.85, 0.1, 8, 40), paveMat('#9a8f80'))
  rim.rotation.x = Math.PI / 2
  rim.position.set(0, 0.04, 0.2)
  rim.receiveShadow = true
  rim.castShadow = true
  g.add(rim)

  // tulip beds
  const palette = ['#d9262c', '#f5d21f', '#f08a24', '#f4f1e8', '#e8579a', '#7b3f9e', '#c71f57', '#ff6b3d', '#f7e04a', '#b81d3b']
  const r = rng(12)
  type Seg = { x0: number; x1: number; z0: number; z1: number; c: string }
  const segs: Seg[] = []
  let ci = 0
  for (let row = 0; row < 7; row++) {
    const zc = -5.4 + row * 1.8
    for (const block of [-1, 1]) {
      const xs = [2.6, 4.7, 6.8, 8.9]
      for (let k = 0; k < 3; k++) {
        const a = xs[k] * block
        const b = xs[k + 1] * block - 0.1 * block
        const x0 = Math.min(a, b)
        const x1 = Math.max(a, b)
        const z0 = zc - 0.62
        const z1 = zc + 0.62
        const far = Math.max(Math.hypot(x0, z0), Math.hypot(x0, z1), Math.hypot(x1, z0), Math.hypot(x1, z1))
        if (far > 8.7) continue
        segs.push({ x0, x1, z0, z1, c: palette[ci++ % palette.length] })
      }
    }
  }
  const soil = colorMat('#34261b', 1)
  const spacing = 0.15
  const items: { x: number; z: number; c: THREE.Color }[] = []
  for (const s of segs) {
    box(stat, s.x1 - s.x0, 0.1, s.z1 - s.z0, soil, (s.x0 + s.x1) / 2, 0.02, (s.z0 + s.z1) / 2)
    const base = new THREE.Color(s.c)
    for (let x = s.x0 + 0.1; x < s.x1 - 0.05; x += spacing) {
      for (let z = s.z0 + 0.1; z < s.z1 - 0.05; z += spacing) {
        const c = base.clone().multiplyScalar(0.85 + r() * 0.3)
        items.push({ x: x + (r() - 0.5) * 0.06, z: z + (r() - 0.5) * 0.06, c })
      }
    }
  }
  const stemGeo = new THREE.CylinderGeometry(0.008, 0.011, 0.5, 3)
  stemGeo.translate(0, 0.25, 0)
  const headPts = [[0.0, 0], [0.045, 0.03], [0.062, 0.09], [0.05, 0.15], [0.022, 0.19], [0.0, 0.17]].map(([x, y]) => new THREE.Vector2(x, y))
  const headGeo = new THREE.LatheGeometry(headPts, 6)
  const leafGeo = new THREE.PlaneGeometry(0.07, 0.28)
  leafGeo.translate(0, 0.14, 0)
  const stems = new THREE.InstancedMesh(stemGeo, colorMat('#3f7a2e', 0.9), items.length)
  const heads = new THREE.InstancedMesh(headGeo, new THREE.MeshStandardMaterial({ roughness: 0.45, color: '#ffffff', side: THREE.DoubleSide }), items.length)
  const leaves = new THREE.InstancedMesh(leafGeo, new THREE.MeshStandardMaterial({ color: '#4c8a36', roughness: 0.8, side: THREE.DoubleSide }), items.length)
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  items.forEach((it, i) => {
    const sy = 0.75 + r() * 0.5
    const yaw = r() * TAU
    q.setFromEuler(new THREE.Euler((r() - 0.5) * 0.12, yaw, (r() - 0.5) * 0.12))
    m.compose(new THREE.Vector3(it.x, 0.1, it.z), q, new THREE.Vector3(1, sy, 1))
    stems.setMatrixAt(i, m)
    m.compose(new THREE.Vector3(it.x, 0.1 + 0.5 * sy, it.z), q, new THREE.Vector3(1.1, 1.1, 1.1))
    heads.setMatrixAt(i, m)
    heads.setColorAt(i, it.c)
    m.compose(new THREE.Vector3(it.x, 0.1, it.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.35, yaw, 0)), new THREE.Vector3(1, sy * 1.2, 1))
    leaves.setMatrixAt(i, m)
  })
  heads.castShadow = true
  stems.castShadow = false
  g.add(stems, heads, leaves)

  // pavilion
  const pv = newGroup(0, 0, 7.0)
  box(pv, 4.4, 0.18, 1.9, colorMat('#e9e6df', 0.6), 0, 1.5, 0)
  box(pv, 4.0, 1.5, 0.12, glassMat('#a9d0e0'), 0, 0, 0.75)
  box(pv, 4.0, 1.5, 0.3, colorMat('#d8d2c6', 0.7), 0, 0, -0.65)
  for (let i = 0; i < 6; i++) box(pv, 0.08, 1.5, 0.1, colorMat('#e9e6df', 0.5), -2 + i * 0.8, 0, 0.82)
  stat.add(pv)

  // benches & trees
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + 0.4
    const b = new THREE.Group()
    b.position.set(Math.cos(a) * 2.45, 0, 0.2 + Math.sin(a) * 2.45)
    b.rotation.y = -a + Math.PI / 2
    box(b, 0.9, 0.06, 0.25, colorMat('#6a4a2f'), 0, 0.3, 0)
    box(b, 0.9, 0.2, 0.05, colorMat('#6a4a2f'), 0, 0.4, -0.12)
    box(b, 0.06, 0.3, 0.2, colorMat('#222'), -0.38, 0, 0)
    box(b, 0.06, 0.3, 0.2, colorMat('#222'), 0.38, 0, 0)
    stat.add(b)
  }
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU + 0.2
    const x = Math.cos(a) * 9.35
    const z = Math.sin(a) * 9.35
    if (Math.hypot(x, z - 7) < 3 || Math.hypot(x, z + 7) < 2.5) continue
    tree(stat, x, z, 3.6 + r(), i % 3 === 0 ? 'round' : 'blossom', i + 3)
  }
  bake(stat)
  g.add(stat)

  const wm = windmill({ h: 6.2, rBase: 0.95, kind: 'brick', speed: 0.5, phase: 0.6 })
  wm.group.position.set(0, 0, -7.0)
  g.add(wm.group)

  return {
    group: g,
    radius: R,
    colliders: [[0, -7.0, 1.2, 1.2], [0, 7.0, 2.2, 0.9]],
    update: (_t, dt) => wm.update(dt),
  }
}

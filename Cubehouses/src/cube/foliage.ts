import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { barkMat, leafTex } from './textures'
import { rng, shade } from './util'

const leafMats = new Map<string, THREE.MeshStandardMaterial>()
export function leafMat(tint: string) {
  let m = leafMats.get(tint)
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      map: leafTex(),
      color: tint,
      alphaTest: 0.5,
      side: THREE.DoubleSide,
      roughness: 0.78,
      metalness: 0,
    })
    m.userData.noAO = true
    leafMats.set(tint, m)
  }
  return m
}

/** Cloud of leaf cards inside an ellipsoid; normals point away from the centre for soft volumetric shading. */
export function leafCloud(count: number, rx: number, ry: number, rz: number, size: number, seed: number) {
  const r = rng(seed)
  const geos: THREE.BufferGeometry[] = []
  for (let i = 0; i < count; i++) {
    // random point in unit ball, biased to the shell
    let x: number, y: number, z: number
    do {
      x = r() * 2 - 1
      y = r() * 2 - 1
      z = r() * 2 - 1
    } while (x * x + y * y + z * z > 1)
    const k = 0.55 + 0.45 * Math.cbrt(r())
    const len = Math.hypot(x, y, z) || 1
    x = (x / len) * k
    y = (y / len) * k
    z = (z / len) * k
    const g = new THREE.PlaneGeometry(size * (0.8 + r() * 0.6), size * (0.8 + r() * 0.6))
    g.rotateX((r() - 0.5) * 2.4)
    g.rotateY(r() * Math.PI * 2)
    g.rotateZ(r() * Math.PI * 2)
    const px = x * rx
    const py = y * ry
    const pz = z * rz
    g.translate(px, py, pz)
    const n = new THREE.Vector3(x, y * 0.8 + 0.25, z).normalize()
    const nor = g.attributes.normal
    for (let j = 0; j < nor.count; j++) nor.setXYZ(j, n.x, n.y, n.z)
    geos.push(g)
  }
  return mergeGeometries(geos, false)!
}

/** A street tree: bark trunk, a few limbs, leaf-card canopy. */
export function makeTree(height: number, seed: number, tint = '#7fa05a'): THREE.Group {
  const r = rng(seed)
  const g = new THREE.Group()
  const bark = barkMat()
  const th = height * 0.42
  const trunk = new THREE.CylinderGeometry(0.1 + height * 0.012, 0.16 + height * 0.016, th, 10)
  trunk.translate(0, th / 2, 0)
  const tm = shade(new THREE.Mesh(trunk, bark))
  tm.userData.noAO = true
  g.add(tm)
  const limbs: THREE.BufferGeometry[] = []
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + r()
    const L = height * (0.28 + r() * 0.12)
    const geo = new THREE.CylinderGeometry(0.035, 0.07, L, 6)
    geo.translate(0, L / 2, 0)
    geo.rotateZ(0.6 + r() * 0.3)
    geo.rotateY(a)
    geo.translate(0, th * 0.8, 0)
    limbs.push(geo)
  }
  const lm = shade(new THREE.Mesh(mergeGeometries(limbs, false)!, bark))
  lm.userData.noAO = true
  g.add(lm)
  const cr = height * 0.36
  const canopy = new THREE.Mesh(leafCloud(260, cr, cr * 0.82, cr, height * 0.2, seed * 7 + 3), leafMat(tint))
  canopy.position.y = th + cr * 0.62
  shade(canopy, true, true)
  canopy.userData.noAO = true
  g.add(canopy)
  return g
}

export function makeBush(radius: number, seed: number, tint = '#6f9448'): THREE.Mesh {
  const m = new THREE.Mesh(leafCloud(70, radius, radius * 0.75, radius, radius * 0.55, seed), leafMat(tint))
  shade(m)
  m.userData.noAO = true
  return m
}

/** Potted indoor plant. */
export function makePlant(height: number, seed: number): THREE.Group {
  const g = new THREE.Group()
  const pot = new THREE.Mesh(
    new THREE.CylinderGeometry(height * 0.13, height * 0.1, height * 0.26, 18),
    new THREE.MeshStandardMaterial({ color: '#c9bfae', roughness: 0.7 }),
  )
  pot.position.y = height * 0.13
  shade(pot)
  g.add(pot)
  const soil = new THREE.Mesh(new THREE.CircleGeometry(height * 0.125, 16), new THREE.MeshStandardMaterial({ color: '#2b2118', roughness: 1 }))
  soil.rotation.x = -Math.PI / 2
  soil.position.y = height * 0.255
  g.add(soil)
  const foliage = new THREE.Mesh(leafCloud(46, height * 0.2, height * 0.34, height * 0.2, height * 0.3, seed), leafMat('#5f9a52'))
  foliage.position.y = height * 0.58
  foliage.castShadow = true
  foliage.userData.noAO = true
  g.add(foliage)
  return g
}

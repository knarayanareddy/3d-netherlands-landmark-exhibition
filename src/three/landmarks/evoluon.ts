import * as THREE from 'three'
import {
  Landmark, TAU, bake, beam, box, colorMat, concreteMat, cyl, glassMat, grassMat, groundSlab, mkCanvas, newGroup, paveMat, registerGlow, rng, sphere, steelMat, toTex, tree, tube, v3,
} from '../kit'
import { lampPost } from '../props'

export function buildEvoluon(): Landmark {
  const g = newGroup()
  const R = 9.6
  groundSlab(g, R, grassMat('#5b8c3b'), colorMat('#5a4a36', 1))
  const s = newGroup()
  const conc = concreteMat('#cfcdc6')
  const concDS = conc.clone()
  concDS.side = THREE.DoubleSide
  const steel = steelMat('#d6dbdf')

  // plaza
  cyl(s, 7.2, 7.2, 0.1, paveMat('#a7a095'), 0, 0, 0, 64)
  cyl(s, 2.6, 2.6, 0.16, conc, 0, 0, 0, 40)

  // central core & entrance
  cyl(s, 1.5, 2.1, 3.05, conc, 0, 0.1, 0, 32)
  box(s, 1.6, 1.2, 0.1, glassMat('#8fb7cc'), 0, 0.2, 2.1)
  beam(s, v3(0, 0.12, 7.2), v3(0, 2.95, 2.7), 1.5, 0.14, conc)
  for (const sx of [-0.78, 0.78]) beam(s, v3(sx, 0.4, 7.2), v3(sx, 3.3, 2.7), 0.05, 0.05, steel)

  // 12 leaning columns
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU
    const foot = v3(Math.cos(a) * 6.3, 0.1, Math.sin(a) * 6.3)
    const top = v3(Math.cos(a) * 4.5, 3.6, Math.sin(a) * 4.5)
    const mid = foot.clone().lerp(top, 0.5)
    const len = foot.distanceTo(top)
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.17, len, 8), conc)
    col.position.copy(mid)
    col.quaternion.setFromUnitVectors(v3(0, 1, 0), top.clone().sub(foot).normalize())
    col.castShadow = col.receiveShadow = true
    s.add(col)
    box(s, 0.5, 0.25, 0.5, conc, foot.x, 0.1, foot.z).rotation.y = -a
  }
  // ring beam under saucer
  const ring = new THREE.Mesh(new THREE.TorusGeometry(4.5, 0.12, 8, 64), conc)
  ring.rotation.x = Math.PI / 2
  ring.position.y = 3.55
  ring.castShadow = true
  s.add(ring)

  // saucer body (lathe)
  const pts = [[0.0, 3.05], [1.5, 3.05], [3.0, 3.2], [4.2, 3.5], [5.0, 3.95], [5.33, 4.28], [5.4, 4.3]].map(([x, y]) => new THREE.Vector2(x, y))
  const upper = [[5.4, 4.72], [5.3, 4.9], [4.6, 5.25], [3.4, 5.58], [2.1, 5.78], [0.0, 5.86]].map(([x, y]) => new THREE.Vector2(x, y))
  const saucer = new THREE.Mesh(new THREE.LatheGeometry([...pts, ...upper], 72), concDS)
  saucer.castShadow = saucer.receiveShadow = true
  s.add(saucer)

  // glowing window band with chasing lights (animated texture)
  const { c, g: cg } = mkCanvas(1024, 32)
  cg.fillStyle = '#000'
  cg.fillRect(0, 0, 1024, 32)
  const r = rng(3)
  for (let i = 0; i < 96; i++) {
    cg.fillStyle = `hsl(${40 + r() * 20},100%,${60 + r() * 25}%)`
    cg.fillRect(i * (1024 / 96) + 2, 4, 1024 / 96 - 5, 24)
  }
  const emi = toTex(c)
  const ringMat = new THREE.MeshStandardMaterial({ color: '#17222c', roughness: 0.15, metalness: 0.6, emissive: new THREE.Color('#fff'), emissiveMap: emi, envMapIntensity: 1.5 })
  registerGlow(ringMat, 2.2)
  const band = new THREE.Mesh(new THREE.CylinderGeometry(5.42, 5.42, 0.42, 96, 1, true), ringMat)
  band.position.y = 4.51
  s.add(band)
  // facets / ribs on the rim
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * TAU
    box(s, 0.06, 0.44, 0.08, concreteMat('#cfcdc6'), Math.cos(a) * 5.44, 4.29, Math.sin(a) * 5.44).rotation.y = -a
  }
  // top dome + mast
  const dome = sphere(s, 1.3, glassMat('#9fc6d8'), 0, 5.8, 0, 1, 0.45, 1, 28)
  dome.castShadow = false
  tube(s, v3(0, 6.1, 0), v3(0, 8.0, 0), 0.04, steel, 6)
  const light = new THREE.MeshStandardMaterial({ color: '#ff3b2b', emissive: new THREE.Color('#ff1a0a'), emissiveIntensity: 2 })
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), light)
  lamp.position.y = 8.05

  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU + 0.15
    lampPost(s, Math.cos(a) * 7.0, Math.sin(a) * 7.0, 1.2)
  }
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * TAU + 0.1
    tree(s, Math.cos(a) * 8.7, Math.sin(a) * 8.7, 5.4, 'poplar', i + 2)
  }
  bake(s)
  g.add(s)
  g.add(lamp)

  return {
    group: g,
    radius: R,
    colliders: [[0, 0, 2.1, 2.1]],
    update: (t) => {
      emi.offset.x = (t * 0.03) % 1
      light.emissiveIntensity = Math.sin(t * 2.5) > 0 ? 3 : 0.3
    },
  }
}

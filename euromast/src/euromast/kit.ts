import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { TAU } from './util'

export const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z)

/** Collects geometry per material and merges into as few draw calls as possible. */
export class Bucket {
  private m = new Map<THREE.Material, THREE.BufferGeometry[]>()
  add(geo: THREE.BufferGeometry, mat: THREE.Material, matrix?: THREE.Matrix4) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone()
    if (matrix) g.applyMatrix4(matrix)
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k)
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2))
    if (!g.attributes.normal) g.computeVertexNormals()
    const l = this.m.get(mat) ?? []
    l.push(g)
    this.m.set(mat, l)
  }
  build(parent: THREE.Object3D, o: { cast?: boolean; receive?: boolean } = {}) {
    for (const [mat, list] of this.m) {
      const merged = mergeGeometries(list, false)
      if (!merged) continue
      merged.computeBoundingSphere()
      const mesh = new THREE.Mesh(merged, mat)
      const transparent = (mat as THREE.Material).transparent
      mesh.castShadow = o.cast ?? !transparent
      mesh.receiveShadow = o.receive ?? true
      parent.add(mesh)
      list.forEach((g) => g.dispose())
    }
    this.m.clear()
    return parent
  }
}

const tmpM = new THREE.Matrix4()
const tmpQ = new THREE.Quaternion()
const tmpS = new THREE.Vector3(1, 1, 1)

export function box(b: Bucket, mat: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number, ry = 0, rx = 0, rz = 0) {
  const e = new THREE.Euler(rx, ry, rz, 'YXZ')
  tmpM.compose(V(x, y + h / 2, z), tmpQ.setFromEuler(e), tmpS)
  b.add(boxUV(w, h, d), mat, tmpM)
}
/** BoxGeometry with world-scale UVs (1 unit = 1 metre scaled by tile). */
export function boxUV(w: number, h: number, d: number, tile = 1) {
  const g = new THREE.BoxGeometry(w, h, d)
  const uv = g.attributes.uv
  const pos = g.attributes.position
  const nor = g.attributes.normal
  for (let i = 0; i < uv.count; i++) {
    const nx = Math.abs(nor.getX(i))
    const ny = Math.abs(nor.getY(i))
    let u: number
    let v: number
    if (nx > 0.5) {
      u = pos.getZ(i)
      v = pos.getY(i)
    } else if (ny > 0.5) {
      u = pos.getX(i)
      v = pos.getZ(i)
    } else {
      u = pos.getX(i)
      v = pos.getY(i)
    }
    uv.setXY(i, u / tile, v / tile)
  }
  return g
}

export function cyl(b: Bucket, mat: THREE.Material, rTop: number, rBot: number, h: number, x: number, y: number, z: number, seg = 32, open = false, uvRep: [number, number] = [1, 1], thetaStart = 0, thetaLen = TAU) {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, open, thetaStart, thetaLen)
  const uv = g.attributes.uv
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * uvRep[0], uv.getY(i) * uvRep[1])
  tmpM.compose(V(x, y + h / 2, z), tmpQ.identity(), tmpS)
  b.add(g, mat, tmpM)
}

/** Flat annulus facing up (or down) with planar world UVs. */
export function ring(b: Bucket, mat: THREE.Material, rIn: number, rOut: number, y: number, seg = 64, uvScale = 2, down = false, cx = 0, cz = 0, thetaStart = 0, thetaLen = TAU) {
  const g = new THREE.RingGeometry(rIn, rOut, seg, 1, thetaStart, thetaLen)
  const pos = g.attributes.position
  const uv = g.attributes.uv
  for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / uvScale, pos.getY(i) / uvScale)
  g.rotateX(down ? Math.PI / 2 : -Math.PI / 2)
  g.translate(cx, y, cz)
  b.add(g, mat)
}

export function tube(b: Bucket, mat: THREE.Material, a: THREE.Vector3, c: THREE.Vector3, r: number, seg = 6) {
  const dir = c.clone().sub(a)
  const len = dir.length()
  const g = new THREE.CylinderGeometry(r, r, len, seg, 1)
  tmpQ.setFromUnitVectors(V(0, 1, 0), dir.normalize())
  tmpM.compose(a.clone().add(c).multiplyScalar(0.5), tmpQ, tmpS)
  b.add(g, mat, tmpM)
}

/** Rectangular beam between two points; `up` keeps the width axis horizontal. */
export function beam(b: Bucket, mat: THREE.Material, a: THREE.Vector3, c: THREE.Vector3, w: number, d: number) {
  const dir = c.clone().sub(a)
  const len = dir.length()
  const g = boxUV(w, len, d)
  const y = dir.clone().normalize()
  const x = V(0, 1, 0).cross(y)
  if (x.lengthSq() < 1e-6) x.set(1, 0, 0)
  x.normalize()
  const z = x.clone().cross(y).normalize()
  tmpM.makeBasis(x, y, z)
  tmpM.setPosition(a.clone().add(c).multiplyScalar(0.5))
  b.add(g, mat, tmpM)
}

export function torus(b: Bucket, mat: THREE.Material, R: number, r: number, y: number, seg = 96) {
  const g = new THREE.TorusGeometry(R, r, 6, seg)
  g.rotateX(Math.PI / 2)
  g.translate(0, y, 0)
  b.add(g, mat)
}

/** Lathe from [r,y] pairs; uv.x around (×repU), uv.y along profile (×repV). */
export function lathe(pts: [number, number][], seg: number, repU = 1, repV = 1) {
  const g = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg)
  const uv = g.attributes.uv
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * repU, uv.getY(i) * repV)
  return g
}

export function sphere(b: Bucket, mat: THREE.Material, r: number, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, seg = 12) {
  tmpM.compose(V(x, y, z), tmpQ.identity(), V(sx, sy, sz))
  b.add(new THREE.SphereGeometry(r, seg, Math.max(6, seg / 2)), mat, tmpM)
}

export function ringMarks(n: number, f: (a: number, i: number) => void, start = 0) {
  for (let i = 0; i < n; i++) f(start + (i / n) * TAU, i)
}

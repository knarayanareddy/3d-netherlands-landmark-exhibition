import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

export interface Seg { x0: number; z0: number; x1: number; z1: number; y0: number; y1: number }
export interface Surf {
  x0: number; z0: number; x1: number; z1: number
  ya: number; yb: number
  axis: 'x' | 'z'; ca: number; cb: number
}
export interface Opening { a: number; b: number; s?: number; h: number; glass?: boolean; walk?: boolean }

const _m = new THREE.Matrix4()
const _q = new THREE.Quaternion()
const _e = new THREE.Euler()

/** Collects geometry per material (UVs in metres / material tile) and merges into few draw calls. */
export class Builder {
  groups = new Map<THREE.Material, THREE.BufferGeometry[]>()
  segs: Seg[] = []
  surfs: Surf[] = []

  geo(mat: THREE.Material, g: THREE.BufferGeometry, keepUV = false) {
    let geo = g.index ? g.toNonIndexed() : g
    for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') geo.deleteAttribute(k)
    if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2))
    if (!keepUV) this.worldUV(geo, mat)
    else {
      const t = (mat.userData.tile as number[]) ?? [1, 1]
      const uv = geo.attributes.uv as THREE.BufferAttribute
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / t[0], uv.getY(i) / t[1])
    }
    const arr = this.groups.get(mat) ?? []
    arr.push(geo)
    this.groups.set(mat, arr)
  }

  private worldUV(geo: THREE.BufferGeometry, mat: THREE.Material) {
    const t = (mat.userData.tile as number[]) ?? [1, 1]
    const p = geo.attributes.position as THREE.BufferAttribute
    const n = geo.attributes.normal as THREE.BufferAttribute
    const uv = geo.attributes.uv as THREE.BufferAttribute
    for (let i = 0; i < p.count; i++) {
      const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i))
      let u: number, v: number
      if (ay >= ax && ay >= az) { u = p.getX(i); v = p.getZ(i) }
      else if (ax >= az) { u = p.getZ(i); v = p.getY(i) }
      else { u = p.getX(i); v = p.getY(i) }
      uv.setXY(i, u / t[0], v / t[1])
    }
  }

  /** axis-aligned box by min/max corner */
  box(mat: THREE.Material, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) {
    if (x1 - x0 <= 0 || y1 - y0 <= 0 || z1 - z0 <= 0) return
    const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0)
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)
    this.geo(mat, g)
  }

  /** centred, optionally rotated box */
  boxC(mat: THREE.Material, cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, ry = 0, rx = 0, rz = 0) {
    const g = new THREE.BoxGeometry(sx, sy, sz)
    _q.setFromEuler(_e.set(rx, ry, rz))
    _m.compose(new THREE.Vector3(cx, cy, cz), _q, new THREE.Vector3(1, 1, 1))
    g.applyMatrix4(_m)
    this.geo(mat, g)
  }

  /** box whose vertical faces stay vertical while its top/bottom slope along z (stair rails) */
  sheared(mat: THREE.Material, cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, slopeZ: number) {
    const g = new THREE.BoxGeometry(sx, sy, sz)
    const p = g.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) + slopeZ * p.getZ(i))
    g.computeVertexNormals()
    g.translate(cx, cy, cz)
    this.geo(mat, g)
  }

  cyl(mat: THREE.Material, cx: number, y0: number, cz: number, r: number, h: number, seg = 24, rTop = r) {
    const g = new THREE.CylinderGeometry(rTop, r, h, seg)
    g.translate(cx, y0 + h / 2, cz)
    this.geo(mat, g)
  }

  seg(x0: number, z0: number, x1: number, z1: number, y0: number, y1: number) {
    this.segs.push({ x0, z0, x1, z1, y0, y1 })
  }

  flat(x0: number, z0: number, x1: number, z1: number, y: number) {
    this.surfs.push({ x0, z0, x1, z1, ya: y, yb: y, axis: 'z', ca: 0, cb: 1 })
  }
  ramp(x0: number, z0: number, x1: number, z1: number, axis: 'x' | 'z', ca: number, cb: number, ya: number, yb: number) {
    this.surfs.push({ x0, z0, x1, z1, ya, yb, axis, ca, cb })
  }

  /**
   * Wall run along an axis. along='x' => wall runs along x at constant z=c; along='z' => runs along z at constant x=c.
   * lo/hi are the materials of the low-coordinate and high-coordinate sides (skins). core is the body material.
   */
  wall(o: {
    along: 'x' | 'z'; c: number; t0: number; t1: number; y0: number; y1: number; th: number
    core: THREE.Material; lo?: THREE.Material; hi?: THREE.Material
    open?: Opening[]; glass?: THREE.Material; collide?: boolean; skin?: number
  }) {
    const { along, c, t0, t1, y0, y1, th, core, lo, hi, glass } = o
    const open = [...(o.open ?? [])].sort((p, q) => p.a - q.a)
    const sk = o.skin ?? 0.04
    const put = (m: THREE.Material, a: number, b: number, ya: number, yb: number, p0: number, p1: number) => {
      if (b - a <= 1e-4 || yb - ya <= 1e-4) return
      if (along === 'x') this.box(m, a, ya, c + p0, b, yb, c + p1)
      else this.box(m, c + p0, ya, a, c + p1, yb, b)
    }
    const emit = (a: number, b: number, ya: number, yb: number) => {
      put(core, a, b, ya, yb, -th / 2, th / 2)
      if (lo) put(lo, a, b, ya, yb, -th / 2 - sk, -th / 2)
      if (hi) put(hi, a, b, ya, yb, th / 2, th / 2 + sk)
    }
    let cur = t0
    for (const op of open) {
      emit(cur, op.a, y0, y1)
      const s = op.s ?? 0
      if (s > 0) emit(op.a, op.b, y0, y0 + s)
      emit(op.a, op.b, y0 + s + op.h, y1)
      if (!op.walk && (op.glass || s > 0) && glass) put(glass, op.a, op.b, y0 + s, y0 + s + op.h, -0.015, 0.015)
      cur = op.b
    }
    emit(cur, t1, y0, y1)
    if (o.collide !== false) {
      const col = (a: number, b: number) => {
        if (b - a < 0.01) return
        if (along === 'x') this.seg(a, c, b, c, y0, y1)
        else this.seg(c, a, c, b, y0, y1)
      }
      let cc = t0
      for (const op of open) {
        col(cc, op.a)
        if (!op.walk && ((op.s ?? 0) > 0 || op.glass)) col(op.a, op.b)
        cc = op.b
      }
      col(cc, t1)
    }
  }

  build(cast = true, receive = true) {
    const grp = new THREE.Group()
    for (const [mat, list] of this.groups) {
      const merged = mergeGeometries(list, false)
      if (!merged) continue
      const mesh = new THREE.Mesh(merged, mat)
      const transparent = (mat as THREE.MeshStandardMaterial).transparent
      mesh.castShadow = cast && !transparent
      mesh.receiveShadow = receive
      if (transparent) mesh.renderOrder = 2
      grp.add(mesh)
      list.forEach((g) => g.dispose())
    }
    this.groups.clear()
    return grp
  }
}

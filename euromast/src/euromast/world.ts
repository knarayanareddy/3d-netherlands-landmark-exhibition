import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { Bucket, V, beam, box, cyl, tube } from './kit'
import { M, glowing, tiled } from './materials'
import { barkTile, facadeMask, facadeTile, FacadeKind, leafCard, waterNormal, zoneMap } from './textures'
import { canvasTex, fbm, inPoly, makeCanvas, rng, TAU } from './util'

export const facadeUniforms = { uNight: { value: 0 } }
export const waterUniforms = { uWT: { value: 0 }, uNS: { value: 1.0 } }

export const CITY_ROT = 0.43
const EXTENT = 3000

/* ------------------------------------------------------------------ river */
const CENTER: [number, number][] = [
  [3600, -2200],
  [2600, -1700],
  [1900, -1330],
  [1400, -930],
  [1000, -520],
  [750, -200],
  [450, 100],
  [150, 290],
  [-300, 370],
  [-1000, 430],
  [-2000, 500],
  [-3400, 600],
]
const halfW = (u: number) => 158 + 22 * Math.sin(u * 9)

export interface World {
  group: THREE.Group
  update(t: number, dt: number): void
  inWater(x: number, z: number, margin?: number): boolean
  trees: { x: number; z: number; r: number }[]
  riverPoly: [number, number][]
  pathPts: { x: number; z: number }[]
}

function noiseTex() {
  const S = 256
  const f = fbm(S, S, 8, 8, 5, 301)
  const { c, g } = makeCanvas(S, S)
  const id = g.createImageData(S, S)
  for (let i = 0; i < S * S; i++) {
    const v = Math.min(255, f[i] * 255)
    id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = v
    id.data[i * 4 + 3] = 255
  }
  g.putImageData(id, 0, 0)
  return canvasTex(c, { srgb: false })
}

/* ------------------------------------------------------------------ facades */
function facadeMat(kind: FacadeKind) {
  const tile = facadeTile(kind)
  const mask = facadeMask(kind)
  const mat = new THREE.MeshStandardMaterial({
    map: tile,
    roughness: kind === 'glass' ? 0.22 : 0.8,
    metalness: kind === 'glass' ? 0.35 : 0.0,
    envMapIntensity: kind === 'glass' ? 1.3 : 0.7,
  })
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uNight = facadeUniforms.uNight
    sh.uniforms.uMask = { value: mask }
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vOP; varying vec3 vON; varying vec3 vSc; varying float vId;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vOP = position; vON = normal;
        #ifdef USE_INSTANCING
          vSc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
          vId = fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898,78.233))) * 43758.5453);
        #else
          vSc = vec3(1.0); vId = 0.0;
        #endif`,
      )
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vOP; varying vec3 vON; varying vec3 vSc; varying float vId; uniform sampler2D uMask; uniform float uNight;\nfloat h21(vec2 p){ return fract(sin(dot(p, vec2(41.3,289.1))) * 43758.5453); }')
      .replace(
        '#include <map_fragment>',
        `vec3 an = abs(vON);
        vec2 fuv; float isRoof = 0.0;
        if (an.y > 0.5) { isRoof = 1.0; fuv = vec2(0.0); }
        else {
          float along = an.x > an.z ? vOP.z * vSc.z : vOP.x * vSc.x;
          float bays = max(1.0, floor((an.x > an.z ? vSc.z : vSc.x) / 3.6 + 0.5));
          float floors = max(1.0, floor(vSc.y / 3.6 + 0.5));
          fuv = vec2(along / (an.x > an.z ? vSc.z : vSc.x) * bays + 0.5, vOP.y * floors);
        }
        if (isRoof > 0.5) {
          float rn = h21(floor(vOP.xz * vSc.xz / 4.0) + vId * 50.0);
          diffuseColor.rgb *= vec3(0.30 + 0.12 * rn);
        } else {
          diffuseColor.rgb *= texture2D(map, fuv).rgb;
        }`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        if (isRoof < 0.5 && uNight > 0.01) {
          float m = texture2D(uMask, fuv).r;
          vec2 cell = floor(fuv);
          float lit = step(0.62, h21(cell + vId * 97.0));
          float flick = 0.7 + 0.5 * h21(cell + 3.7);
          totalEmissiveRadiance += m * lit * flick * uNight * vec3(1.0, 0.78, 0.5) * 1.1;
        }`,
      )
  }
  return mat
}

/* ------------------------------------------------------------------ foliage */
function crownGeometry(seed: number, rx: number, ry: number, rz: number, cards: number, size: number) {
  const r = rng(seed)
  const pos: number[] = []
  const nor: number[] = []
  const uv: number[] = []
  const col: number[] = []
  const idx: number[] = []
  const q = new THREE.Quaternion()
  for (let i = 0; i < cards; i++) {
    // random point in ellipsoid, biased toward the shell
    let x: number, y: number, z: number
    do {
      x = r() * 2 - 1
      y = r() * 2 - 1
      z = r() * 2 - 1
    } while (x * x + y * y + z * z > 1)
    const m = Math.sqrt(x * x + y * y + z * z) || 1
    const sh = 0.55 + 0.45 * Math.pow(r(), 0.6)
    x = (x / m) * Math.min(1, m * 1.2) * sh
    y = (y / m) * Math.min(1, m * 1.2) * sh
    z = (z / m) * Math.min(1, m * 1.2) * sh
    const c = V(x * rx, y * ry, z * rz)
    q.setFromEuler(new THREE.Euler(r() * TAU, r() * TAU, r() * TAU))
    const s = size * (0.75 + r() * 0.6)
    const base = pos.length / 3
    const shade = 0.72 + 0.4 * ((y + 1) / 2)
    for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const p = V((u * s) / 2, (v * s) / 2, 0).applyQuaternion(q).add(c)
      pos.push(p.x, p.y + ry, p.z)
      const n = V(p.x / rx, (p.y) / ry, p.z / rz).normalize()
      nor.push(n.x, n.y, n.z)
      uv.push((u + 1) / 2, (v + 1) / 2)
      const sj = shade * (0.9 + r() * 0.2)
      col.push(sj, sj, sj)
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  g.setIndex(idx)
  return g
}

/* ------------------------------------------------------------------ build */
export function buildWorld(progress?: (p: number, label: string) => void): World {
  const root = new THREE.Group()
  const rand = rng(2024)

  /* ---- river geometry ---- */
  const curve = new THREE.CatmullRomCurve3(CENTER.map(([x, z]) => V(x, 0, z)), false, 'centripetal')
  const SAMPLES = 420
  const cpts = curve.getSpacedPoints(SAMPLES)
  const left: [number, number][] = []
  const right: [number, number][] = []
  const tang: THREE.Vector3[] = []
  for (let i = 0; i <= SAMPLES; i++) {
    const u = i / SAMPLES
    const p = cpts[i]
    const t = curve.getTangentAt(u)
    tang.push(t)
    const nx = t.z
    const nz = -t.x
    const w = halfW(u)
    left.push([p.x + nx * w, p.z + nz * w])
    right.push([p.x - nx * w, p.z - nz * w])
  }
  const riverPoly: [number, number][] = [...left, ...right.slice().reverse()]
  const widePoly = (extra: number): [number, number][] => {
    const L: [number, number][] = []
    const R: [number, number][] = []
    for (let i = 0; i <= SAMPLES; i++) {
      const p = cpts[i]
      const t = tang[i]
      const w = halfW(i / SAMPLES) + extra
      L.push([p.x + t.z * w, p.z - t.x * w])
      R.push([p.x - t.z * w, p.z + t.x * w])
    }
    return [...L, ...R.reverse()]
  }
  const poly2 = widePoly(2)
  const poly8 = widePoly(8)
  const inWater = (x: number, z: number, margin = 0) => inPoly(x, z, margin > 5 ? poly8 : margin > 0 ? poly2 : riverPoly)
  // which bank is the park bank?
  const dist = (pts: [number, number][]) => pts.reduce((m, [x, z]) => Math.min(m, Math.hypot(x, z)), 1e9)
  const parkLeft = dist(left) < dist(right)
  const parkBank = parkLeft ? left : right
  const parkNormalSign = parkLeft ? 1 : -1 // direction from centerline to park bank
  void parkNormalSign

  const toShapePts = (p: [number, number][]) => p.map(([x, z]) => new THREE.Vector2(x, -z))

  /* ---- ground ---- */
  progress?.(0.1, 'Laying out Het Park and the Nieuwe Maas')
  const zoneTex = zoneMap(EXTENT, 2048, (g, wx, wz, s) => {
    g.fillStyle = '#6e6c66'
    g.fillRect(0, 0, 2048, 2048)
    // city rotated blocks (light paving) and dark streets
    g.save()
    g.translate(wx(0), wz(0))
    g.rotate(CITY_ROT)
    const P = 82
    g.fillStyle = '#8a857b'
    for (let i = -45; i <= 45; i++)
      for (let j = -45; j <= 45; j++) g.fillRect((i * P - 33) * s, (j * P - 33) * s, 66 * s, 66 * s)
    g.restore()
    // park
    const parkC: [number, number] = [-130, -230]
    g.save()
    g.translate(wx(parkC[0]), wz(parkC[1]))
    g.rotate(-0.35)
    const grad = g.createRadialGradient(0, 0, 40 * s, 0, 0, 400 * s)
    grad.addColorStop(0, '#5e8a3c')
    grad.addColorStop(0.9, '#628f40')
    grad.addColorStop(1, 'rgba(98,143,64,0)')
    g.fillStyle = grad
    g.beginPath()
    g.ellipse(0, 0, 400 * s, 345 * s, 0, 0, TAU)
    g.fill()
    g.restore()
    // soft lawn variation
    const r2 = rng(7)
    for (let i = 0; i < 260; i++) {
      const a = r2() * TAU
      const rr = Math.sqrt(r2()) * 380
      const x = parkC[0] + Math.cos(a) * rr
      const z = parkC[1] + Math.sin(a) * rr * 0.85
      g.fillStyle = r2() > 0.5 ? 'rgba(120,160,70,0.25)' : 'rgba(40,80,35,0.22)'
      g.beginPath()
      g.ellipse(wx(x), wz(z), (20 + r2() * 60) * s, (14 + r2() * 40) * s, r2() * 3, 0, TAU)
      g.fill()
    }
    // other green pockets in the city
    for (let i = 0; i < 90; i++) {
      const x = (r2() - 0.5) * 2 * 2700
      const z = (r2() - 0.5) * 2 * 2700
      g.fillStyle = 'rgba(100,140,70,0.9)'
      g.beginPath()
      g.ellipse(wx(x), wz(z), (30 + r2() * 90) * s, (26 + r2() * 70) * s, r2() * 3, 0, TAU)
      g.fill()
    }
    // promenade along the park bank
    g.strokeStyle = '#9a9288'
    g.lineWidth = 16 * s
    g.lineJoin = 'round'
    g.beginPath()
    parkBank.forEach(([x, z], i) => {
      const k = i / Math.max(1, parkBank.length - 1)
      void k
      if (i === 0) g.moveTo(wx(x), wz(z))
      else g.lineTo(wx(x), wz(z))
    })
    g.stroke()
    // all quays
    g.strokeStyle = '#8f897e'
    g.lineWidth = 12 * s
    for (const side of [left, right]) {
      g.beginPath()
      side.forEach(([x, z], i) => (i === 0 ? g.moveTo(wx(x), wz(z)) : g.lineTo(wx(x), wz(z))))
      g.stroke()
    }
    // harbour industrial zone far downstream (west)
    g.fillStyle = '#74726b'
    g.fillRect(wx(-3000), wz(150), 1200 * s, 900 * s)
  })
  const detail = noiseTex()
  const groundMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.96, metalness: 0 })
  groundMat.onBeforeCompile = (sh) => {
    sh.uniforms.uZone = { value: zoneTex }
    sh.uniforms.uDetail = { value: detail }
    sh.uniforms.uExt = { value: EXTENT }
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvWP = (modelMatrix * vec4(transformed,1.0)).xyz;')
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP; uniform sampler2D uZone; uniform sampler2D uDetail; uniform float uExt;')
      .replace(
        '#include <map_fragment>',
        `vec2 zuv = clamp((vWP.xz + uExt) / (2.0 * uExt), 0.0, 1.0);
        vec3 zc = texture2D(uZone, vec2(zuv.x, 1.0 - zuv.y)).rgb;
        float d1 = texture2D(uDetail, vWP.xz * 0.21).r;
        float d2 = texture2D(uDetail, vWP.xz * 0.037 + 0.3).r;
        float d3 = texture2D(uDetail, vWP.xz * 1.3).r;
        float dl = d1 * 0.4 + d2 * 0.4 + d3 * 0.2;
        float far = smoothstep(260.0, 1400.0, length(vWP.xz - cameraPosition.xz));
        dl = mix(dl, 0.5, far * 0.85);
        diffuseColor.rgb *= zc * (0.55 + 1.0 * dl);`,
      )
  }
  {
    const shape = new THREE.Shape(
      [new THREE.Vector2(-16000, -16000), new THREE.Vector2(16000, -16000), new THREE.Vector2(16000, 16000), new THREE.Vector2(-16000, 16000)],
    )
    shape.holes.push(new THREE.Path(toShapePts(riverPoly)))
    const geo = new THREE.ShapeGeometry(shape)
    geo.rotateX(-Math.PI / 2)
    const m = new THREE.Mesh(geo, groundMat)
    m.receiveShadow = true
    root.add(m)
  }

  /* ---- water ---- */
  {
    const shape = new THREE.Shape(toShapePts(riverPoly))
    const geo = new THREE.ShapeGeometry(shape)
    geo.rotateX(-Math.PI / 2)
    const wm = new THREE.MeshStandardMaterial({ color: '#41594f', roughness: 0.07, metalness: 0, envMapIntensity: 1.25 })
    wm.onBeforeCompile = (sh) => {
      sh.uniforms.uWN = { value: waterNormal() }
      sh.uniforms.uWT = waterUniforms.uWT
      sh.uniforms.uNS = waterUniforms.uNS
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvWP = (modelMatrix * vec4(transformed,1.0)).xyz;')
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWP; uniform sampler2D uWN; uniform float uWT; uniform float uNS;')
        .replace(
          '#include <normal_fragment_maps>',
          `#include <normal_fragment_maps>
          {
            float dd = length(vWP.xz - cameraPosition.xz);
            float fadeN = 1.0 / (1.0 + dd * 0.0009);
            vec3 n1 = texture2D(uWN, vWP.xz * 0.045 + uWT * vec2(0.012, 0.004)).xyz * 2.0 - 1.0;
            vec3 n2 = texture2D(uWN, vWP.xz * 0.13 - uWT * vec2(0.02, -0.03)).xyz * 2.0 - 1.0;
            vec3 n3 = texture2D(uWN, vWP.xz * 0.011 + uWT * vec2(0.003, 0.002)).xyz * 2.0 - 1.0;
            vec2 s = (n1.xy * 0.7 + n2.xy * 0.45 + n3.xy * 1.4) * uNS * (0.35 * fadeN + 0.12);
            vec3 wn = normalize(vec3(s.x, 1.0, s.y));
            normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);
          }`,
        )
    }
    const mesh = new THREE.Mesh(geo, wm)
    mesh.position.y = -2.0
    mesh.receiveShadow = true
    root.add(mesh)
    // quay walls
    const wallMat = new THREE.MeshStandardMaterial({ map: tiled(M.slab().map!, 1, 1), color: '#8b877d', roughness: 0.9, side: THREE.DoubleSide })
    wallMat.map!.repeat.set(1, 1)
    const wp: number[] = []
    const wu: number[] = []
    for (const side of [left, right]) {
      let acc = 0
      for (let i = 0; i < side.length - 1; i++) {
        const [x0, z0] = side[i]
        const [x1, z1] = side[i + 1]
        const len = Math.hypot(x1 - x0, z1 - z0)
        wp.push(x0, 0, z0, x1, 0, z1, x1, -2.4, z1, x0, 0, z0, x1, -2.4, z1, x0, -2.4, z0)
        wu.push(acc / 2, 1.2, (acc + len) / 2, 1.2, (acc + len) / 2, 0, acc / 2, 1.2, (acc + len) / 2, 0, acc / 2, 0)
        acc += len
      }
    }
    const wg = new THREE.BufferGeometry()
    wg.setAttribute('position', new THREE.Float32BufferAttribute(wp, 3))
    wg.setAttribute('uv', new THREE.Float32BufferAttribute(wu, 2))
    wg.computeVertexNormals()
    const wall = new THREE.Mesh(wg, wallMat)
    wall.receiveShadow = true
    root.add(wall)
    // quay coping stones along the park bank
    const cb = new Bucket()
    const cop = new THREE.MeshStandardMaterial({ color: '#a6a298', roughness: 0.8 })
    for (let i = 0; i < parkBank.length - 1; i += 2) {
      const a = V(parkBank[i][0], 0.09, parkBank[i][1])
      const c = V(parkBank[Math.min(parkBank.length - 1, i + 2)][0], 0.09, parkBank[Math.min(parkBank.length - 1, i + 2)][1])
      if (a.length() > 900) continue
      beam(cb, cop, a, c, 0.45, 0.2)
    }
    cb.build(root)
  }

  /* ---- plaza & paths ---- */
  progress?.(0.22, 'Paving the plaza and park paths')
  const pathPts: { x: number; z: number }[] = []
  const ribbon = (pts: THREE.Vector3[], width: number, mat: THREE.Material, y = 0.04, uvScale = 2) => {
    const c = new THREE.CatmullRomCurve3(pts, false, 'centripetal')
    const n = Math.max(8, Math.floor(c.getLength() / 3))
    const p = c.getSpacedPoints(n)
    const pos: number[] = []
    const uv: number[] = []
    const idx: number[] = []
    let acc = 0
    for (let i = 0; i <= n; i++) {
      const t = c.getTangentAt(i / n)
      const nx = -t.z
      const nz = t.x
      if (i > 0) acc += p[i].distanceTo(p[i - 1])
      pos.push(p[i].x + nx * width * 0.5, y, p[i].z + nz * width * 0.5, p[i].x - nx * width * 0.5, y, p[i].z - nz * width * 0.5)
      uv.push(0, acc / uvScale, width / uvScale, acc / uvScale)
      if (i < n) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2)
      pathPts.push({ x: p[i].x, z: p[i].z })
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
    g.setIndex(idx)
    g.computeVertexNormals()
    // ensure up-facing
    if (g.attributes.normal.getY(0) < 0) {
      const ii = g.index!.array as Uint32Array | Uint16Array
      for (let i = 0; i < ii.length; i += 3) {
        const t = ii[i + 1]
        ;(ii as any)[i + 1] = ii[i + 2]
        ;(ii as any)[i + 2] = t
      }
      g.computeVertexNormals()
    }
    const m = new THREE.Mesh(g, mat)
    m.receiveShadow = true
    root.add(m)
  }
  const pathMat = M.paving(1).clone()
  pathMat.polygonOffset = true
  pathMat.polygonOffsetFactor = -2
  pathMat.polygonOffsetUnits = -2
  const plazaMat = M.paving(1).clone()
  {
    plazaMat.map = tiled(plazaMat.map!, 1, 1)
    const pm = new THREE.CircleGeometry(36, 96)
    const pp = pm.attributes.position
    const puv = pm.attributes.uv
    for (let i = 0; i < puv.count; i++) puv.setXY(i, pp.getX(i) / 2, pp.getY(i) / 2)
    pm.rotateX(-Math.PI / 2)
    const plaza = new THREE.Mesh(pm, plazaMat)
    plaza.position.y = 0.02
    plaza.receiveShadow = true
    plazaMat.polygonOffset = true
    plazaMat.polygonOffsetFactor = -1
    plazaMat.polygonOffsetUnits = -1
    root.add(plaza)
    const pb = new Bucket()
    const inlay = new THREE.MeshStandardMaterial({ color: '#4b4f53', roughness: 0.5, metalness: 0.7 })
    for (const r of [18, 26, 35.6]) {
      const geo = new THREE.RingGeometry(r - 0.12, r + 0.12, 128)
      geo.rotateX(-Math.PI / 2)
      geo.translate(0, 0.045, 0)
      pb.add(geo, inlay)
    }
    pb.build(root)
  }
  // nearest park-bank point to the origin
  let nb = parkBank[0]
  for (const p of parkBank) if (Math.hypot(p[0], p[1]) < Math.hypot(nb[0], nb[1])) nb = p
  const bdir = V(nb[0], 0, nb[1]).normalize()
  const perp = V(-bdir.z, 0, bdir.x)
  ribbon([V(0, 0, 35), V(bdir.x * 70 + perp.x * 18, 0, 35 + bdir.z * 20 + 40), V(bdir.x * (nb[0] * 0.5) + perp.x * 6, 0, nb[1] * 0.5 + 10), V(nb[0] - bdir.x * 10, 0, nb[1] - bdir.z * 10)], 6, pathMat)
  ribbon([V(-34, 0, 4), V(-90, 0, -50), V(-150, 0, -140), V(-170, 0, -250), V(-130, 0, -330)], 5, pathMat)
  ribbon([V(10, 0, -35), V(60, 0, -110), V(140, 0, -170), V(230, 0, -230)], 4.5, pathMat)
  ribbon([V(-30, 0, 20), V(-80, 0, 100), V(-150, 0, 160), V(-250, 0, 150)], 4.5, pathMat)
  ribbon([V(-250, 0, -120), V(-170, 0, -170), V(-80, 0, -220), V(20, 0, -230), V(120, 0, -190)], 4, pathMat)
  // promenade along the park bank (paved strip)
  {
    const pts: THREE.Vector3[] = []
    for (let i = 0; i < parkBank.length; i += 6) {
      const [x, z] = parkBank[i]
      if (Math.hypot(x, z) < 560) pts.push(V(x - (x * 0 + 0) , 0, z))
    }
    // inset toward the park (away from the water) by 7 m
    const inset = pts.map((p) => {
      let best = 0
      let bd = 1e9
      for (let i = 0; i < cpts.length; i++) {
        const d = Math.hypot(cpts[i].x - p.x, cpts[i].z - p.z)
        if (d < bd) {
          bd = d
          best = i
        }
      }
      const dir = V(p.x - cpts[best].x, 0, p.z - cpts[best].z).normalize()
      return V(p.x + dir.x * 7, 0, p.z + dir.z * 7)
    })
    if (inset.length > 3) ribbon(inset, 7, offsetMat(M.slab(1).clone()), 0.045, 2)
  }

  /* ---- park furniture: lamps & benches ---- */
  {
    const fb = new Bucket()
    const dark = M.darkSteel()
    const bench = M.wood(1)
    for (let i = 0; i < pathPts.length; i += 7) {
      const p = pathPts[i]
      if (Math.hypot(p.x, p.z) < 38) continue
      const next = pathPts[Math.min(pathPts.length - 1, i + 1)]
      const a = Math.atan2(next.x - p.x, next.z - p.z)
      const sx = p.x + Math.cos(a) * 3.4
      const sz = p.z - Math.sin(a) * 3.4
      if (i % 14 === 0) {
        tube(fb, dark, V(sx, 0, sz), V(sx, 4.6, sz), 0.05, 6)
        box(fb, M.warmLamp(), 0.4, 0.06, 0.4, sx, 4.6, sz)
      } else {
        const bx = p.x - Math.cos(a) * 3.0
        const bz = p.z + Math.sin(a) * 3.0
        box(fb, bench, 1.8, 0.07, 0.5, bx, 0.45, bz, a + Math.PI / 2)
        box(fb, bench, 1.8, 0.4, 0.06, bx - Math.cos(a) * 0.25, 0.5, bz + Math.sin(a) * 0.25, a + Math.PI / 2)
        box(fb, dark, 0.06, 0.45, 0.5, bx + Math.sin(a + Math.PI / 2) * 0.8, 0, bz + Math.cos(a + Math.PI / 2) * 0.8, a + Math.PI / 2)
        box(fb, dark, 0.06, 0.45, 0.5, bx - Math.sin(a + Math.PI / 2) * 0.8, 0, bz - Math.cos(a + Math.PI / 2) * 0.8, a + Math.PI / 2)
      }
    }
    fb.build(root)
  }

  /* ---- trees ---- */
  progress?.(0.34, 'Planting trees')
  const trees: { x: number; z: number; r: number }[] = []
  {
    const leaf = leafCard(1)
    const leafMat = new THREE.MeshStandardMaterial({ map: leaf, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.85, vertexColors: true })
    leafMat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uWindT;').replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
        float ph = instanceMatrix[3].x * 0.13 + instanceMatrix[3].z * 0.21;
        transformed.x += sin(uWindT * 1.3 + ph + position.y * 0.5) * 0.12 * (position.y / 12.0);
        transformed.z += cos(uWindT * 1.1 + ph * 1.3 + position.x * 0.4) * 0.12 * (position.y / 12.0);
        #endif`,
      )
      sh.uniforms.uWindT = windU
    }
    const windU = { value: 0 }
    const crowns = [crownGeometry(1, 6.2, 7.2, 6.2, 90, 4.6), crownGeometry(2, 5.6, 8.0, 5.6, 90, 4.6), crownGeometry(3, 7.0, 6.2, 7.0, 90, 4.8)]
    const poplar = crownGeometry(4, 2.4, 10.5, 2.4, 70, 3.6)
    const trunkGeo = new THREE.CylinderGeometry(0.28, 0.42, 9, 8)
    trunkGeo.translate(0, 4.5, 0)
    const bk = barkTile()
    const trunkMat = new THREE.MeshStandardMaterial({ map: tiled(bk.map, 1, 3), normalMap: tiled(bk.normalMap, 1, 3), roughness: 0.95 })

    const spots: { x: number; z: number; s: number; v: number; ry: number }[] = []
    const noise = fbm(128, 128, 5, 5, 3, 55)
    const nAt = (x: number, z: number) => {
      const u = (((x + 1500) / 3000) * 128) | 0
      const v = (((z + 1500) / 3000) * 128) | 0
      return noise[((v % 128) + 128) % 128 * 128 + (((u % 128) + 128) % 128)]
    }
    const parkC: [number, number] = [-130, -230]
    const nearPath = (x: number, z: number) => {
      for (let i = 0; i < pathPts.length; i += 2) if (Math.abs(pathPts[i].x - x) < 6 && Math.abs(pathPts[i].z - z) < 6) return true
      return false
    }
    let tries = 0
    while (spots.length < 560 && tries++ < 12000) {
      const a = rand() * TAU
      const rr = Math.sqrt(rand())
      const x = parkC[0] + Math.cos(a) * rr * 410
      const z = parkC[1] + Math.sin(a) * rr * 350
      if (Math.hypot(x, z) < 38) continue
      if (inWater(x, z, 9)) continue
      const n = nAt(x, z)
      if (n < 0.46 && rand() > 0.12) continue
      if (nearPath(x, z)) continue
      spots.push({ x, z, s: 0.7 + rand() * 0.6, v: Math.floor(rand() * 3), ry: rand() * TAU })
    }
    // tree line along the river promenade and around the plaza
    for (let i = 0; i < parkBank.length; i += 5) {
      const [bx, bz] = parkBank[i]
      if (Math.hypot(bx, bz) > 700) continue
      let best = 0
      let bd = 1e9
      for (let k = 0; k < cpts.length; k++) {
        const d = Math.hypot(cpts[k].x - bx, cpts[k].z - bz)
        if (d < bd) {
          bd = d
          best = k
        }
      }
      const dir = V(bx - cpts[best].x, 0, bz - cpts[best].z).normalize()
      const x = bx + dir.x * 13
      const z = bz + dir.z * 13
      if (Math.hypot(x, z) < 40) continue
      spots.push({ x, z, s: 0.8 + rand() * 0.3, v: Math.floor(rand() * 3), ry: rand() * TAU })
    }
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * TAU + 0.1
      if (Math.abs(a - 0) < 0.3 || Math.abs(a - TAU) < 0.3) continue
      spots.push({ x: Math.sin(a) * 41, z: Math.cos(a) * 41, s: 0.7 + rand() * 0.2, v: i % 3, ry: rand() * TAU })
    }
    // urban street trees on rotated grid
    const cs = Math.cos(CITY_ROT)
    const sn = Math.sin(CITY_ROT)
    const urban: typeof spots = []
    for (let i = -22; i <= 22; i++)
      for (let j = -22; j <= 22; j++) {
        if (rand() > 0.32) continue
        const lx = i * 82 + (rand() < 0.5 ? 35 : -35)
        const lz = j * 82 + (rand() - 0.5) * 60
        const x = lx * cs - lz * sn
        const z = lx * sn + lz * cs
        if (inWater(x, z, 9) || Math.hypot(x, z) < 430) continue
        if (inPoly(x, z, [[-600, -600], [600, -600], [600, 0], [-600, 0]] as any) && Math.hypot(x + 130, z + 230) < 420) continue
        urban.push({ x, z, s: 0.5 + rand() * 0.5, v: Math.floor(rand() * 3), ry: rand() * TAU })
      }
    spots.push(...urban)

    const poplarSpots = spots.filter((_, i) => i % 23 === 0)
    const mainSpots = spots.filter((_, i) => i % 23 !== 0)
    const tmp = new THREE.Object3D()
    const col = new THREE.Color()
    const tm = new THREE.InstancedMesh(trunkGeo, trunkMat, spots.length)
    tm.castShadow = true
    tm.receiveShadow = true
    let ti = 0
    for (let v = 0; v < 3; v++) {
      const list = mainSpots.filter((s) => s.v === v)
      const im = new THREE.InstancedMesh(crowns[v], leafMat, list.length)
      im.castShadow = true
      im.receiveShadow = true
      list.forEach((s, k) => {
        tmp.position.set(s.x, 0, s.z)
        tmp.rotation.set(0, s.ry, 0)
        tmp.scale.setScalar(s.s)
        tmp.updateMatrix()
        im.setMatrixAt(k, tmp.matrix)
        col.setHSL(0.23 + rand() * 0.06, 0.38 + rand() * 0.2, 0.5 + rand() * 0.18)
        im.setColorAt(k, col)
        tm.setMatrixAt(ti++, tmp.matrix)
        trees.push({ x: s.x, z: s.z, r: 0.55 * s.s })
      })
      im.instanceMatrix.needsUpdate = true
      im.frustumCulled = false
      root.add(im)
    }
    {
      const im = new THREE.InstancedMesh(poplar, leafMat, poplarSpots.length)
      im.castShadow = true
      poplarSpots.forEach((s, k) => {
        tmp.position.set(s.x, 0, s.z)
        tmp.rotation.set(0, s.ry, 0)
        tmp.scale.setScalar(s.s * 1.1)
        tmp.updateMatrix()
        im.setMatrixAt(k, tmp.matrix)
        col.setHSL(0.22 + rand() * 0.04, 0.42, 0.48 + rand() * 0.1)
        im.setColorAt(k, col)
        tm.setMatrixAt(ti++, tmp.matrix)
        trees.push({ x: s.x, z: s.z, r: 0.5 })
      })
      im.frustumCulled = false
      root.add(im)
    }
    tm.count = ti
    tm.frustumCulled = false
    root.add(tm)
    root.userData.windU = windU
  }

  /* ---- city ---- */
  progress?.(0.5, 'Raising the Rotterdam skyline')
  const kinds: FacadeKind[] = ['brick', 'glass', 'concrete']
  const fMats = kinds.map(facadeMat)
  type Inst = { x: number; z: number; w: number; d: number; h: number; rot: number; tint: THREE.Color }
  const lists: Record<FacadeKind, Inst[]> = { brick: [], glass: [], concrete: [] }
  const roofs: { x: number; z: number; w: number; d: number; y: number; hr: number; rot: number; c: THREE.Color }[] = []
  const add = (k: FacadeKind, x: number, z: number, w: number, d: number, h: number, rot: number, tint: string | THREE.Color) =>
    lists[k].push({ x, z, w, d, h, rot, tint: new THREE.Color(tint) })

  const parkCenter = V(-130, 0, -230)
  const cs = Math.cos(CITY_ROT)
  const sn = Math.sin(CITY_ROT)
  const hub = V(780, 0, -1550)
  const hubKop = V(1250, 0, -150)
  const heightAt = (x: number, z: number, r: () => number) => {
    const d1 = Math.hypot(x - hub.x, z - hub.z)
    const d2 = Math.hypot(x - hubKop.x, z - hubKop.z)
    const hi = 95 * Math.exp(-((d1 / 650) ** 2)) + 55 * Math.exp(-((d2 / 380) ** 2))
    return 13 + r() * 12 + hi * Math.pow(r(), 1.7)
  }
  const P = 82
  const rr = rng(909)
  const warm = ['#ffffff', '#e8d9cf', '#d9c9bf', '#f2e6dc']
  const kindFor = (h: number, r: () => number): FacadeKind => {
    if (h > 50) return r() < 0.55 ? 'glass' : r() < 0.6 ? 'concrete' : 'brick'
    const q = r()
    return q < 0.62 ? 'brick' : q < 0.84 ? 'concrete' : 'glass'
  }
  for (let i = -36; i <= 36; i++) {
    for (let j = -36; j <= 36; j++) {
      const cx = i * P
      const cz = j * P
      const x = cx * cs - cz * sn
      const z = cx * sn + cz * cs
      if (Math.abs(x) > 3100 || Math.abs(z) > 3100) continue
      if (Math.hypot(x, z) < 440) continue
      if (Math.hypot((x - parkCenter.x) / 430, (z - parkCenter.z) / 380) < 1) continue
      if (inWater(x, z, 9)) continue
      if (inWater(x + 28, z, 9) || inWater(x - 28, z, 9) || inWater(x, z + 28, 9) || inWater(x, z - 28, 9)) {
        if (rr() < 0.5) continue
      }
      if (rr() < 0.07) continue
      const bh = heightAt(x, z, rr)
      for (let a = 0; a < 2; a++)
        for (let b = 0; b < 2; b++) {
          if (rr() < 0.08) continue
          const lx = cx + (a - 0.5) * 32 + (rr() - 0.5) * 3
          const lz = cz + (b - 0.5) * 32 + (rr() - 0.5) * 3
          const wx = lx * cs - lz * sn
          const wz = lx * sn + lz * cs
          if (inWater(wx, wz, 6)) continue
          const h = Math.max(9, bh * (0.7 + rr() * 0.6))
          const w = 25 + rr() * 6
          const d = 25 + rr() * 6
          const k = kindFor(h, rr)
          const tint = warm[(rr() * warm.length) | 0]
          add(k, wx, wz, w, d, h, CITY_ROT, tint)
          if (h < 24 && k !== 'glass' && rr() < 0.55) roofs.push({ x: wx, z: wz, w: w * 1.05, d: d * 1.05, y: h, hr: 4 + rr() * 3, rot: CITY_ROT + (rr() < 0.5 ? 0 : Math.PI / 2), c: new THREE.Color().setHSL(0.03 + rr() * 0.03, 0.25 + rr() * 0.2, 0.2 + rr() * 0.12) })
        }
    }
  }
  // distant sprawl: coarser blocks out to ~6 km
  for (let i = -42; i <= 42; i++) {
    for (let j = -42; j <= 42; j++) {
      const x = i * 150 + (rr() - 0.5) * 40
      const z = j * 150 + (rr() - 0.5) * 40
      if (Math.abs(x) < 3150 && Math.abs(z) < 3150) continue
      if (Math.abs(x) > 6500 || Math.abs(z) > 6500) continue
      if (inWater(x, z, 12)) continue
      if (rr() < 0.18) continue
      const h = 12 + rr() * 26 + (rr() < 0.04 ? 60 : 0)
      add(rr() < 0.5 ? 'brick' : 'concrete', x, z, 60 + rr() * 60, 40 + rr() * 50, h, rr() * 0.3, warm[(rr() * 4) | 0])
    }
  }

  // landmark towers on the Kop van Zuid (south bank) & Delftse Poort
  const at = (x: number, z: number) => ({ x, z })
  void at
  {
    // Locate a south-bank anchor close to the Erasmus Bridge
    const bu = (() => {
      let bestU = 0
      let bd = 1e9
      for (let i = 0; i < cpts.length; i++) {
        const d = Math.hypot(cpts[i].x - 915, cpts[i].z + 467)
        if (d < bd) {
          bd = d
          bestU = i
        }
      }
      return bestU
    })()
    const bc = cpts[bu]
    const bt = tang[bu]
    const bn = V(bt.z, 0, -bt.x) // normal (left)
    const far = parkLeft ? -1 : 1 // direction to the far (non-park) bank
    const toFar = bn.clone().multiplyScalar(far)
    const along = bt.clone()
    const rotAlong = Math.atan2(along.x, along.z) // rotation so local z follows river tangent
    const w0 = halfW(bu / SAMPLES)
    const farBank = bc.clone().addScaledVector(toFar, w0 + 14)
    const P3 = (a: number, s: number) => farBank.clone().addScaledVector(along, a).addScaledVector(toFar, s)
    // De Rotterdam: three stacked towers
    {
      const p = P3(380, 70)
      const rot = rotAlong + Math.PI / 2
      for (let k = 0; k < 3; k++) {
        const q = p.clone().addScaledVector(along, k * 17).addScaledVector(toFar, (k % 2) * 8)
        const hh = [149, 138, 120][k]
        add('glass', q.x, q.z, 17, 34, hh * 0.52, rotAlong, '#cfd6dc')
        const q2 = q.clone().addScaledVector(toFar, 4)
        add('glass', q2.x, q2.z, 17, 30, hh, rotAlong, '#dfe5ea')
      }
      void rot
    }
    // Maastoren (blue glass, 165 m)
    {
      const p = P3(130, 60)
      add('glass', p.x, p.z, 48, 30, 165, rotAlong, '#9fb7d9')
    }
    // New Orleans (158 m) & Montevideo (140 m, stepped)
    {
      const p = P3(-120, 150)
      add('glass', p.x, p.z, 26, 26, 158, rotAlong, '#c0c9d2')
      const m = P3(250, 150)
      add('brick', m.x, m.z, 38, 38, 90, rotAlong, '#e6c08a')
      add('brick', m.x, m.z, 28, 28, 140, rotAlong, '#e6c08a')
      const kpn = P3(60, 200)
      add('glass', kpn.x, kpn.z, 22, 22, 96, rotAlong, '#aeb8c4')
    }
    // Delftse Poort (north bank)
    {
      const p = P3(-250, -w0 * 2 - 180)
      add('glass', p.x, p.z, 34, 24, 151, rotAlong, '#9fc0d8')
      const q = P3(-210, -w0 * 2 - 180)
      add('glass', q.x, q.z, 24, 24, 93, rotAlong, '#9fc0d8')
    }

    /* ---- Erasmus Bridge (pylon on the south bank) ---- */
    const bb = new Bucket()
    const white = M.whitePaint()
    const blue = new THREE.MeshStandardMaterial({ color: '#e9edf1', roughness: 0.38, metalness: 0.3 })
    const deckMat = new THREE.MeshStandardMaterial({ color: '#8b9097', roughness: 0.6, metalness: 0.2 })
    const asphalt = M.asphalt(8)
    const width = 32
    const sP = (s: number, lateral = 0, y = 0) => bc.clone().addScaledVector(toFar, s).addScaledVector(along, lateral).setY(y)
    const Lnorth = -(w0 + 130)
    const Lsouth = w0 + 150
    // deck
    const segs = 40
    for (let i = 0; i < segs; i++) {
      const s0 = Lnorth + ((Lsouth - Lnorth) * i) / segs
      const s1 = Lnorth + ((Lsouth - Lnorth) * (i + 1)) / segs
      const over = (s: number) => (Math.abs(s) < w0 + 10 ? 0 : 1) * 0 + Math.min(1, Math.max(0, (Math.abs(s) - (w0 + 10)) / 100))
      const y0 = 11 * (1 - over(s0))
      const y1 = 11 * (1 - over(s1))
      const a = sP(s0, 0, y0 - 1.2)
      const c = sP(s1, 0, y1 - 1.2)
      beam(bb, deckMat, a, c, width, 2.4)
      const a2 = sP(s0, 0, y0 + 0.05)
      const c2 = sP(s1, 0, y1 + 0.05)
      beam(bb, asphalt, a2, c2, width - 6, 0.12)
      beam(bb, white, sP(s0, width / 2 - 1, y0 + 0.6), sP(s1, width / 2 - 1, y1 + 0.6), 0.1, 1.2)
      beam(bb, white, sP(s0, -width / 2 + 1, y0 + 0.6), sP(s1, -width / 2 + 1, y1 + 0.6), 0.1, 1.2)
    }
    // piers
    for (const s of [-w0 * 0.5, w0 * 0.55, w0 + 45, -w0 - 50]) {
      const p0 = sP(s, 0, -2.4)
      const p1 = sP(s, 0, 9)
      beam(bb, deckMat, p0, p1, 6, 10)
    }
    // pylon: leaning swan neck, on the far (south) bank
    const baseS = w0 + 6
    const pylonPts: THREE.Vector3[] = [
      sP(baseS + 3, 0, 8),
      sP(baseS - 6, 0, 45),
      sP(baseS - 14, 0, 80),
      sP(baseS - 10, 0, 112),
      sP(baseS + 6, 0, 139),
    ]
    const pc = new THREE.CatmullRomCurve3(pylonPts)
    const pp = pc.getSpacedPoints(40)
    for (let i = 0; i < pp.length - 1; i++) {
      const t = i / pp.length
      const wd = 6 - 3.2 * t
      beam(bb, blue, pp[i], pp[i + 1], wd, wd * 1.15)
    }
    // pylon foot block
    beam(bb, deckMat, sP(baseS + 3, 0, 0), sP(baseS + 3, 0, 9), 9, 12)
    // cables
    const cab = new THREE.MeshStandardMaterial({ color: '#f1f1ee', roughness: 0.5 })
    const top = pc.getPointAt(0.99)
    void top
    const nCab = 16
    for (let i = 0; i < nCab; i++) {
      const sDeck = baseS - 22 - i * 14.5
      const pylonU = 0.58 + (i / (nCab - 1)) * 0.4
      const pa = pc.getPointAt(Math.min(0.99, pylonU))
      for (const lat of [-12, 12]) {
        const d = sP(sDeck, lat, 10.6)
        const pt = V(pa.x, pa.y, pa.z).addScaledVector(along, lat * 0.2)
        tube(bb, cab, pt, d, 0.13, 4)
      }
    }
    // back stays
    for (let i = 0; i < 6; i++) {
      const pa = pc.getPointAt(0.64 + i * 0.065)
      const d = sP(baseS + 14 + i * 12, 0, 10.6)
      for (const lat of [-12, 12]) tube(bb, cab, V(pa.x, pa.y, pa.z).addScaledVector(along, lat * 0.2), d.clone().addScaledVector(along, lat), 0.16, 4)
    }
    bb.build(root)
  }

  /* ---- instanced buildings ---- */
  const unit = new THREE.BoxGeometry(1, 1, 1)
  unit.translate(0, 0.5, 0)
  const tmpO = new THREE.Object3D()
  kinds.forEach((k, ki) => {
    const list = lists[k]
    if (!list.length) return
    const im = new THREE.InstancedMesh(unit, fMats[ki], list.length)
    list.forEach((b, n) => {
      tmpO.position.set(b.x, 0, b.z)
      tmpO.rotation.set(0, b.rot, 0)
      tmpO.scale.set(b.w, b.h, b.d)
      tmpO.updateMatrix()
      im.setMatrixAt(n, tmpO.matrix)
      im.setColorAt(n, b.tint)
    })
    im.instanceMatrix.needsUpdate = true
    im.castShadow = true
    im.receiveShadow = true
    im.frustumCulled = false
    root.add(im)
  })
  if (roofs.length) {
    const tri = new THREE.Shape()
    tri.moveTo(-0.5, 0)
    tri.lineTo(0.5, 0)
    tri.lineTo(0, 1)
    const rg = new THREE.ExtrudeGeometry(tri, { depth: 1, bevelEnabled: false })
    rg.translate(0, 0, -0.5)
    const rm = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.82 })
    const im = new THREE.InstancedMesh(rg, rm, roofs.length)
    roofs.forEach((b, n) => {
      tmpO.position.set(b.x, b.y, b.z)
      tmpO.rotation.set(0, b.rot, 0)
      tmpO.scale.set(b.w, b.hr, b.d)
      tmpO.updateMatrix()
      im.setMatrixAt(n, tmpO.matrix)
      im.setColorAt(n, b.c)
    })
    im.castShadow = true
    im.receiveShadow = true
    im.frustumCulled = false
    root.add(im)
  }

  /* ---- ships ---- */
  progress?.(0.78, 'Launching ships on the Nieuwe Maas')
  const ships: { g: THREE.Group; u: number; speed: number; lane: number; dir: number; len: number }[] = []
  {
    const hullM = (c: string) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, metalness: 0.25 })
    const mk = (len: number, beamW: number, depth: number, hullC: string, decks: (b: Bucket, len: number, w: number) => void) => {
      const g = new THREE.Group()
      const sh = new THREE.Shape()
      sh.moveTo(-len / 2, -beamW / 2)
      sh.lineTo(len / 2 - beamW * 1.2, -beamW / 2)
      sh.quadraticCurveTo(len / 2 + 2, 0, len / 2 - beamW * 1.2, beamW / 2)
      sh.lineTo(-len / 2, beamW / 2)
      sh.lineTo(-len / 2, -beamW / 2)
      const geo = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false, curveSegments: 8 })
      geo.rotateX(Math.PI / 2)
      geo.translate(0, depth - 3.2, 0)
      // the shape x is length → rotate so +x becomes +z (forward)
      geo.rotateY(-Math.PI / 2)
      const hull = new THREE.Mesh(geo, hullM(hullC))
      hull.castShadow = hull.receiveShadow = true
      g.add(hull)
      const b = new Bucket()
      decks(b, len, beamW)
      b.build(g)
      return g
    }
    const mkContainerShip = (seed: number) => {
      const r = rng(seed)
      const g = mk(185, 28, 11, '#7a1f1c', (b, len, w) => {
        void b
        void len
        void w
      })
      const cols = ['#b8332a', '#2f5d9e', '#e0a21b', '#3b7a4a', '#d9d9d4', '#7b3f8c', '#c4552b', '#1f4b6e']
      const geo = new THREE.BoxGeometry(2.4, 2.6, 12)
      const n = 14 * 9
      const im = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.2 }), n * 5)
      let c = 0
      const o = new THREE.Object3D()
      for (let bay = 0; bay < 12; bay++)
        for (let row = 0; row < 9; row++) {
          const hgt = 1 + Math.floor(r() * 5)
          for (let h = 0; h < hgt; h++) {
            o.position.set((row - 4) * 2.5, 2 + 1.3 + h * 2.62, -75 + bay * 12.6 + 6)
            o.updateMatrix()
            im.setMatrixAt(c, o.matrix)
            im.setColorAt(c, new THREE.Color(cols[(r() * cols.length) | 0]))
            c++
          }
        }
      im.count = c
      im.castShadow = im.receiveShadow = true
      g.add(im)
      const bh = new Bucket()
      box(bh, M.whitePaint(), 24, 24, 11, 0, 2, -86)
      box(bh, M.darkPaint(), 24.4, 3, 11.2, 0, 17, -86)
      box(bh, M.whitePaint(), 3, 6, 3, 0, 26, -86)
      bh.build(g)
      g.position.y = 0
      return g
    }
    const mkBarge = () => {
      const g = mk(110, 11.4, 6, '#1c2a3a', () => {})
      const b = new Bucket()
      box(b, M.whitePaint(), 7, 6, 7, 0, 2.8, -44)
      box(b, M.darkPaint(), 7.1, 1.3, 7.1, 0, 5, -44)
      box(b, M.darkPaint(), 9.5, 0.5, 70, 0, 2.8, 8)
      for (let i = 0; i < 7; i++) box(b, hullM('#6b5a42'), 9, 0.8, 9, 0, 3.2, -30 + i * 10)
      b.build(g)
      return g
    }
    const mkTour = () => {
      const g = mk(36, 8, 3.2, '#f2f2ee', () => {})
      const b = new Bucket()
      box(b, M.glass(), 6.4, 2.2, 28, 0, 2.7, -2)
      box(b, M.whitePaint(), 7, 0.3, 29, 0, 4.9, -2)
      box(b, M.darkPaint(), 6.6, 0.3, 28.2, 0, 2.5, -2)
      for (let i = 0; i < 6; i++) box(b, M.frame(), 0.1, 2.2, 0.1, 3.2, 2.7, -14 + i * 5.2)
      b.build(g)
      return g
    }
    const defs: [THREE.Group, number, number, number][] = [
      [mkContainerShip(1), 7.5, -0.35, 1],
      [mkContainerShip(2), 6.0, 0.38, -1],
      [mkBarge(), 4.8, 0.2, 1],
      [mkBarge(), 5.4, -0.15, -1],
      [mkTour(), 3.8, 0.55, 1],
      [mkTour(), 4.4, -0.55, -1],
    ]
    const total = curve.getLength()
    defs.forEach(([g, sp, lane, dir], i) => {
      g.traverse((o) => ((o as THREE.Mesh).isMesh ? ((o as THREE.Mesh).castShadow = true) : 0))
      root.add(g)
      ships.push({ g, u: (i * 0.137 + 0.12) % 1, speed: sp / total, lane: lane * 120, dir, len: total })
    })
  }

  /* ---- gantry cranes in the harbour (downstream) ---- */
  {
    const cb = new Bucket()
    const cm = new THREE.MeshStandardMaterial({ color: '#7f9db3', roughness: 0.6, metalness: 0.35 })
    const cm2 = new THREE.MeshStandardMaterial({ color: '#d6d9db', roughness: 0.6, metalness: 0.2 })
    for (let k = 0; k < 7; k++) {
      const idx = Math.floor(SAMPLES * (0.9 + k * 0.012))
      const p = cpts[Math.min(SAMPLES, idx)]
      const t = tang[Math.min(SAMPLES, idx)]
      const nrm = V(t.z, 0, -t.x)
      const s = parkLeft ? -1 : 1
      const w = halfW(idx / SAMPLES)
      const base = p.clone().addScaledVector(nrm, s * (w + 18))
      const ang = Math.atan2(nrm.x * s, nrm.z * s) // faces river
      const lx = V(Math.cos(ang), 0, -Math.sin(ang))
      const lz = V(Math.sin(ang), 0, Math.cos(ang))
      const P = (a: number, y: number, b: number) => base.clone().addScaledVector(lx, a).addScaledVector(lz, b).setY(y)
      for (const sx of [-9, 9]) for (const sz of [-10, 10]) beam(cb, cm, P(sx, 0, sz), P(sx, 36, sz), 1.6, 1.6)
      for (const sz of [-10, 10]) beam(cb, cm, P(-9, 36, sz), P(9, 36, sz), 1.8, 2)
      beam(cb, cm, P(0, 38, -10), P(0, 38, 62), 3, 3)
      beam(cb, cm2, P(0, 40, -34), P(0, 40, -10), 2.4, 2.4)
      beam(cb, cm, P(0, 36, 14), P(0, 62, 6), 1.2, 1.2)
      beam(cb, cm, P(0, 62, 6), P(0, 40, 62), 1.2, 1.2)
      beam(cb, cm2, P(0, 33, 22), P(0, 38, 22), 4, 6)
    }
    cb.build(root)
  }

  /* ---- finishing: distant haze ring is handled by scene fog ---- */
  void mergeGeometries
  void cyl
  void glowing

  return {
    group: root,
    inWater,
    trees,
    riverPoly,
    pathPts,
    update(t, dt) {
      waterUniforms.uWT.value = t
      const wu = root.userData.windU as { value: number } | undefined
      if (wu) wu.value = t
      for (const s of ships) {
        s.u += s.dir * s.speed * dt
        if (s.u > 0.98) s.u = 0.02
        if (s.u < 0.02) s.u = 0.98
        const p = curve.getPointAt(s.u)
        const tg = curve.getTangentAt(s.u)
        const nx = tg.z
        const nz = -tg.x
        s.g.position.set(p.x + nx * s.lane, -2.0 + 0.2 * Math.sin(t * 0.9 + s.lane), p.z + nz * s.lane)
        s.g.rotation.y = Math.atan2(tg.x * s.dir, tg.z * s.dir)
        s.g.rotation.z = 0.01 * Math.sin(t * 0.7 + s.lane)
      }
    },
  }
}

function offsetMat<T extends THREE.Material>(m: T): T {
  m.polygonOffset = true
  m.polygonOffsetFactor = -3
  m.polygonOffsetUnits = -3
  return m
}

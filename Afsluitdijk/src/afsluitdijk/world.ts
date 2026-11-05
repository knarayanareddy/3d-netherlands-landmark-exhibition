import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { segmentsAt, terrainY, Z, ROAD_Y, IJ_LEVEL, tideLevel, type SegId } from './profile'
import { mulberry32, fbm } from './noise'
import type { Mats } from './materials'
import type { Part, Box, WindUniform } from './types'

function columns(): number[] {
  const xs: number[] = []
  const push = (a: number, b: number, step: number) => {
    for (let x = a; x < b - 1e-6; x += step) xs.push(x)
  }
  push(-14000, -7000, 1000)
  push(-7000, -1000, 250)
  push(-1000, -120, 20)
  push(-120, 120, 2.5)
  push(120, 1000, 20)
  push(1000, 7000, 250)
  push(7000, 14000, 1000)
  xs.push(14000)
  return xs
}

function ribbon(id: SegId, xs: number[], mat: THREE.Material, macro = false): THREE.Mesh {
  const pos: number[] = []
  const uv: number[] = []
  const col: number[] = []
  const idx: number[] = []
  xs.forEach((x, i) => {
    const s = segmentsAt(x).find((q) => q.id === id)!
    const len = Math.hypot(s.zb - s.za, s.yb - s.ya)
    pos.push(x, s.ya, s.za, x, s.yb, s.zb)
    uv.push(x, 0, x, len)
    if (macro) {
      for (const z of [s.za, s.zb]) {
        const n = fbm(x * 0.012 + 40, z * 0.05 + 40, 512, 3, 7)
        const m = fbm(x * 0.06 + 10, z * 0.1 + 10, 512, 2, 9)
        const k = 0.78 + n * 0.5
        col.push(k * (0.92 + m * 0.2), k * (0.98 + (1 - m) * 0.05), k * 0.85)
      }
    }
    if (i < xs.length - 1) {
      const a = i * 2
      idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3)
    }
  })
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  if (macro) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  const m = new THREE.Mesh(g, mat)
  m.receiveShadow = true
  m.castShadow = true
  m.frustumCulled = false
  return m
}

/** A flat world-aligned strip (markings etc.) */
function flatStrip(z0: number, z1: number, y: number, mat: THREE.Material, half = 7000): THREE.Mesh {
  const g = new THREE.PlaneGeometry(half * 2, Math.abs(z1 - z0))
  g.rotateX(-Math.PI / 2)
  const m = new THREE.Mesh(g, mat)
  m.position.set(0, y, (z0 + z1) / 2)
  m.receiveShadow = true
  m.frustumCulled = false
  return m
}

function bladeGeometry(): THREE.BufferGeometry {
  const w = 0.03
  const p = [-w, 0, 0, w, 0, 0, -w * 0.75, 0.5, 0.03, w * 0.75, 0.5, 0.03, 0, 1, 0.14]
  const c = [0.38, 0.38, 0.32, 0.38, 0.38, 0.32, 0.8, 0.8, 0.7, 0.8, 0.8, 0.7, 1.25, 1.25, 1.1]
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3))
  g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0.1, 0, 1, 0.1, 0, 1, 0.1, 0, 1, 0.1, 0, 1, 0.1], 3))
  g.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4])
  return g
}

function bladeMaterial(wind: WindUniform) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide })
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = wind
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float hh = position.y;
        float ph = instanceMatrix[3][0] * 0.31 + instanceMatrix[3][2] * 0.23;
        transformed.x += (sin(uTime * 1.7 + ph) + 0.5 * sin(uTime * 3.1 + ph * 1.7)) * 0.11 * hh * hh;
        transformed.z += sin(uTime * 1.3 + ph * 0.8) * 0.05 * hh * hh;`,
      )
    sh.fragmentShader = sh.fragmentShader.replace('float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;', 'float faceDirection = 1.0;')
  }
  return m
}

export function makeWaterMaterial(normalTex: THREE.Texture, color: string, amp: number, timeU: WindUniform) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.07, metalness: 0 })
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = timeU
    sh.uniforms.uNorm = { value: normalTex }
    sh.uniforms.uAmp = { value: amp }
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;')
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nuniform float uTime;\nuniform float uAmp;\nuniform sampler2D uNorm;')
      .replace(
        '#include <normal_fragment_maps>',
        `{
          float dist = length(vViewPosition);
          float fade = exp(-dist * 0.0016);
          vec2 p1 = vWPos.xz * 0.045 + uTime * vec2(0.020, 0.012);
          vec2 p2 = vWPos.xz * 0.15 - uTime * vec2(0.016, 0.026);
          vec2 p3 = vWPos.xz * 0.52 + uTime * vec2(-0.03, 0.04);
          vec3 n1 = texture2D(uNorm, p1).xyz * 2.0 - 1.0;
          vec3 n2 = texture2D(uNorm, p2).xyz * 2.0 - 1.0;
          vec3 n3 = texture2D(uNorm, p3).xyz * 2.0 - 1.0;
          vec2 g = (n1.xy * 0.9 + n2.xy * 0.6 + n3.xy * 0.3) * uAmp * fade;
          vec3 wn = normalize(vec3(g.x, 1.0, g.y));
          normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);
        }`,
      )
  }
  return m
}

export interface World extends Part {
  wadden: THREE.Mesh
  ij: THREE.Mesh
  lamps: THREE.MeshStandardMaterial
}

export function buildWorld(mats: Mats, waterNormal: THREE.Texture, wind: WindUniform): World {
  const group = new THREE.Group()
  const xs = columns()
  const colliders: Box[] = []

  // ---------------------------------------------------------------- terrain strips
  const strips: [SegId, THREE.Material, boolean?][] = [
    ['bedN', mats.seabed],
    ['levvel', mats.levvel],
    ['berm', mats.concrete],
    ['basalt', mats.basalt],
    ['kerbFace', mats.concrete],
    ['kerbTop', mats.concrete],
    ['terraceN', mats.paving],
    ['cycleN', mats.asphaltRed],
    ['vergeN', mats.grass, true],
    ['road', mats.asphalt],
    ['vergeS', mats.grass, true],
    ['cycleS', mats.asphaltRed],
    ['plazaS', mats.paving],
    ['slopeS', mats.grass, true],
    ['shoreS', mats.rubble],
    ['bedS', mats.seabed],
  ]
  for (const [id, mat, macro] of strips) group.add(ribbon(id, xs, mat, !!macro))

  // median strip + markings
  const medianStrip = flatStrip(-1.6, 1.6, ROAD_Y + 0.012, mats.median)
  group.add(medianStrip)
  const edge = (z: number) => group.add(flatStrip(z - 0.09, z + 0.09, ROAD_Y + 0.02, mats.white))
  for (const s of [-1, 1]) {
    edge(s * 11.55)
    edge(s * 8.6)
    edge(s * 1.85)
  }
  const dashGeo = new THREE.BoxGeometry(3, 0.012, 0.15)
  const dashes: number[] = []
  for (let x = -4000; x < 4000; x += 12) dashes.push(x)
  const dashMesh = new THREE.InstancedMesh(dashGeo, mats.white, dashes.length * 2)
  const m4 = new THREE.Matrix4()
  dashes.forEach((x, i) => {
    m4.makeTranslation(x, ROAD_Y + 0.022, -5.1)
    dashMesh.setMatrixAt(i * 2, m4)
    m4.makeTranslation(x, ROAD_Y + 0.022, 5.1)
    dashMesh.setMatrixAt(i * 2 + 1, m4)
  })
  dashMesh.receiveShadow = true
  dashMesh.frustumCulled = false
  group.add(dashMesh)

  // ---------------------------------------------------------------- guard rails
  const railY = (z: number) => (Math.abs(z) < 3 ? ROAD_Y : 7.5)
  const postGeo = new THREE.BoxGeometry(0.1, 0.8, 0.12)
  const postXs: number[] = []
  for (let x = -1800; x <= 1800; x += 4) postXs.push(x)
  for (const z of [Z.railN, 0, Z.railS]) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(8000, 0.3, z === 0 ? 0.2 : 0.06), mats.steel)
    beam.position.set(0, railY(z) + 0.62, z)
    beam.castShadow = true
    beam.receiveShadow = true
    beam.frustumCulled = false
    group.add(beam)
    const posts = new THREE.InstancedMesh(postGeo, mats.steel, postXs.length)
    postXs.forEach((x, i) => {
      m4.makeTranslation(x, railY(z) + 0.4, z + (z === 0 ? 0 : z < 0 ? 0.08 : -0.08))
      posts.setMatrixAt(i, m4)
    })
    posts.castShadow = true
    posts.frustumCulled = false
    group.add(posts)
    colliders.push({ x0: -4000, x1: 4000, z0: z - 0.3, z1: z + 0.3, y0: railY(z), y1: railY(z) + 1.0 })
  }

  // ---------------------------------------------------------------- lamp posts in the median
  const lampXs: number[] = []
  for (let x = -1800; x <= 1800; x += 48) lampXs.push(x)
  const pole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.09, 0.14, 11, 8), mats.steel, lampXs.length)
  const arms = new THREE.InstancedMesh(new THREE.BoxGeometry(0.08, 0.08, 2.6), mats.steel, lampXs.length * 2)
  const heads = new THREE.InstancedMesh(new THREE.BoxGeometry(0.4, 0.1, 1.0), mats.lamp, lampXs.length * 2)
  const q = new THREE.Quaternion()
  const e = new THREE.Euler()
  lampXs.forEach((x, i) => {
    m4.makeTranslation(x, ROAD_Y + 5.5, 0)
    pole.setMatrixAt(i, m4)
    for (const s of [-1, 1]) {
      e.set(-s * 0.08, 0, 0)
      q.setFromEuler(e)
      m4.compose(new THREE.Vector3(x, ROAD_Y + 11.0, s * 1.2), q, new THREE.Vector3(1, 1, 1))
      arms.setMatrixAt(i * 2 + (s > 0 ? 1 : 0), m4)
      m4.compose(new THREE.Vector3(x, ROAD_Y + 10.95, s * 2.4), q, new THREE.Vector3(1, 1, 1))
      heads.setMatrixAt(i * 2 + (s > 0 ? 1 : 0), m4)
    }
  })
  for (const mm of [pole, arms, heads]) {
    mm.castShadow = true
    mm.frustumCulled = false
    group.add(mm)
  }

  // ---------------------------------------------------------------- Levvel blocks (near field relief)
  {
    const geo = new RoundedBoxGeometry(2.3, 0.6, 2.74, 2, 0.07)
    const range = 320
    const cols = Math.ceil((range * 2) / 2.4)
    const rows = 9
    const inst = new THREE.InstancedMesh(geo, mats.levvelBlock, cols * rows)
    const rnd = mulberry32(7)
    const c = new THREE.Color()
    let n = 0
    const mm = new THREE.Matrix4()
    const quat = new THREE.Quaternion()
    const pv = new THREE.Vector3()
    const sc = new THREE.Vector3(1, 1, 1)
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const xc = -range + i * 2.4 + (j % 2 ? 1.2 : 0)
        const s = segmentsAt(xc).find((qq) => qq.id === 'levvel')!
        const dz = s.zb - s.za
        const dy = s.yb - s.ya
        const L = Math.hypot(dz, dy)
        const alpha = Math.atan2(dy, dz)
        const t = (j + 0.5) * 2.84
        if (t > L - 1) continue
        const px = xc
        const pz = s.za + t * Math.cos(alpha)
        const py = s.ya + t * Math.sin(alpha)
        const nrm = new THREE.Vector3(0, Math.cos(alpha), -Math.sin(alpha))
        pv.set(px, py, pz).addScaledVector(nrm, -0.225 + (rnd() - 0.5) * 0.03)
        e.set(-alpha + (rnd() - 0.5) * 0.012, (rnd() - 0.5) * 0.02, (rnd() - 0.5) * 0.012)
        quat.setFromEuler(e)
        mm.compose(pv, quat, sc)
        inst.setMatrixAt(n, mm)
        // weathering: algae below the tide line, barnacle band, clean concrete above
        const wet = THREE.MathUtils.smoothstep(py, -1.2, 1.6)
        const k = 0.9 + rnd() * 0.14
        c.setRGB(0.3 + 0.7 * wet, 0.38 + 0.62 * wet, 0.28 + 0.66 * wet).multiplyScalar(k * (0.55 + 0.45 * wet + 0.0))
        const stain = fbm(xc * 0.05, py * 0.4, 512, 2, 4)
        c.multiplyScalar(0.85 + stain * 0.3)
        inst.setColorAt(n, c)
        n++
      }
    }
    inst.count = n
    inst.castShadow = true
    inst.receiveShadow = true
    inst.frustumCulled = false
    group.add(inst)
  }

  // ---------------------------------------------------------------- grass + reeds
  {
    const rnd = mulberry32(21)
    const geo = bladeGeometry()
    const mat = bladeMaterial(wind)
    const N = 56000
    const inst = new THREE.InstancedMesh(geo, mat, N)
    const mm = new THREE.Matrix4()
    const quat = new THREE.Quaternion()
    const pv = new THREE.Vector3()
    const sc = new THREE.Vector3()
    const c = new THREE.Color()
    const e2 = new THREE.Euler()
    let n = 0
    const range = 150
    const place = (id: SegId, count: number, hMin: number, hMax: number) => {
      for (let k = 0; k < count && n < N; k++) {
        const x = (rnd() * 2 - 1) * range
        const s = segmentsAt(x).find((qq) => qq.id === id)!
        const w = s.zb - s.za
        if (w < 0.3) continue
        const f = rnd()
        const z = s.za + f * w
        const y = s.ya + f * (s.yb - s.ya)
        pv.set(x, y - 0.02, z)
        e2.set((rnd() - 0.5) * 0.3, rnd() * Math.PI * 2, (rnd() - 0.5) * 0.3)
        quat.setFromEuler(e2)
        const h = hMin + rnd() * (hMax - hMin)
        sc.set(0.8 + rnd() * 0.8, h, 1)
        mm.compose(pv, quat, sc)
        inst.setMatrixAt(n, mm)
        const t = rnd()
        const straw = rnd() < 0.12
        const macro = fbm(x * 0.03, z * 0.1, 512, 2, 5)
        if (straw) c.setRGB(0.5, 0.42, 0.2)
        else c.setRGB(0.14 + t * 0.14 + macro * 0.12, 0.23 + t * 0.14 + macro * 0.05, 0.05 + t * 0.04)
        inst.setColorAt(n, c)
        n++
      }
    }
    place('slopeS', 46000, 0.3, 0.8)
    place('vergeS', 6000, 0.2, 0.55)
    place('vergeN', 6000, 0.2, 0.55)
    inst.count = n
    inst.castShadow = false
    inst.receiveShadow = true
    inst.frustumCulled = false
    group.add(inst)

    // reeds along the IJsselmeer edge
    const reeds = new THREE.InstancedMesh(geo, mat, 5000)
    let rn = 0
    for (let k = 0; k < 5000; k++) {
      const x = (rnd() * 2 - 1) * 260
      const s = segmentsAt(x).find((qq) => qq.id === 'shoreS')!
      const f = 0.05 + rnd() * 0.5
      const z = s.za + f * (s.zb - s.za)
      const y = s.ya + f * (s.yb - s.ya)
      if (y > 0.3 || y < -0.8) continue
      const patch = fbm(x * 0.05, 3, 512, 2, 12)
      if (patch < 0.5) continue
      pv.set(x, y, z)
      e2.set((rnd() - 0.5) * 0.25, rnd() * Math.PI * 2, (rnd() - 0.5) * 0.25)
      quat.setFromEuler(e2)
      sc.set(1.8, 1.0 + rnd() * 1.1, 1)
      mm.compose(pv, quat, sc)
      reeds.setMatrixAt(rn, mm)
      c.setRGB(0.35 + rnd() * 0.15, 0.36 + rnd() * 0.1, 0.12 + rnd() * 0.05)
      reeds.setColorAt(rn, c)
      rn++
    }
    reeds.count = rn
    reeds.frustumCulled = false
    group.add(reeds)
  }

  // ---------------------------------------------------------------- water
  const timeU: WindUniform = { value: 0 }
  const waddenMat = makeWaterMaterial(waterNormal, '#3f4d44', 0.9, timeU)
  const ijMat = makeWaterMaterial(waterNormal, '#3c5964', 0.5, timeU)
  const wg = new THREE.PlaneGeometry(60000, 20000)
  wg.rotateX(-Math.PI / 2)
  const wadden = new THREE.Mesh(wg, waddenMat)
  wadden.position.set(0, 0.2, -10000)
  const ij = new THREE.Mesh(wg, ijMat)
  ij.position.set(0, IJ_LEVEL, 10000)
  wadden.receiveShadow = true
  ij.receiveShadow = true
  group.add(wadden, ij)

  return {
    group,
    colliders,
    floors: [],
    blockers: [],
    wadden,
    ij,
    lamps: mats.lamp,
    update: (t) => {
      wind.value = t
      timeU.value = t
      wadden.position.y = tideLevel(t)
      ij.position.y = IJ_LEVEL + Math.sin(t * 0.21) * 0.04
    },
  }
}

export { terrainY }

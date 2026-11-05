import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { CANAL_Z, LAKE_C, WATER_Y } from './layout'
import { Batch, Mats } from './buildings'
import { TAU, rng } from './util'

/* ---------------------------------------------------------------- swan */
function swanModel(): THREE.Group {
  const g = new THREE.Group()
  const white = new THREE.MeshStandardMaterial({ color: 0xf4f2ec, roughness: 0.55 })
  const parts: THREE.BufferGeometry[] = []
  const body = new THREE.SphereGeometry(0.5, 18, 12)
  body.scale(1.15, 0.52, 0.62)
  body.translate(0, 0.2, 0)
  parts.push(body)
  const tail = new THREE.ConeGeometry(0.22, 0.55, 8)
  tail.rotateZ(Math.PI / 2 + 0.25)
  tail.scale(1, 1, 1.5)
  tail.translate(-0.62, 0.34, 0)
  parts.push(tail)
  for (const s of [-1, 1]) {
    const wing = new THREE.SphereGeometry(0.4, 12, 8)
    wing.scale(1.1, 0.5, 0.35)
    wing.rotateZ(0.2)
    wing.rotateX(s * 0.28)
    wing.translate(-0.05, 0.42, s * 0.33)
    parts.push(wing)
  }
  const neck = new THREE.CatmullRomCurve3([new THREE.Vector3(0.45, 0.28, 0), new THREE.Vector3(0.7, 0.5, 0), new THREE.Vector3(0.68, 0.85, 0), new THREE.Vector3(0.52, 1.05, 0), new THREE.Vector3(0.6, 1.2, 0)])
  parts.push(new THREE.TubeGeometry(neck, 14, 0.055, 8))
  const head = new THREE.SphereGeometry(0.075, 10, 8)
  head.scale(1.3, 1, 0.9)
  head.translate(0.65, 1.22, 0)
  parts.push(head)
  const mesh = new THREE.Mesh(mergeGeometries(parts.map((p) => p.toNonIndexed()))!, white)
  mesh.castShadow = true
  g.add(mesh)
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.16, 6), new THREE.MeshStandardMaterial({ color: 0xe0762a, roughness: 0.5 }))
  beak.rotation.z = -Math.PI / 2 - 0.15
  beak.position.set(0.8, 1.2, 0)
  g.add(beak)
  return g
}

/* ---------------------------------------------------------------- boat */
function boatModel(M: Mats, hullColor: number): THREE.Group {
  const g = new THREE.Group()
  const s = new THREE.Shape()
  const L = 3.4
  const Wd = 0.95
  s.moveTo(-L, -Wd * 0.8)
  s.lineTo(L * 0.55, -Wd)
  s.quadraticCurveTo(L * 0.95, -Wd * 0.6, L * 1.12, 0)
  s.quadraticCurveTo(L * 0.95, Wd * 0.6, L * 0.55, Wd)
  s.lineTo(-L, Wd * 0.8)
  s.lineTo(-L, -Wd * 0.8)
  const hullGeo = new THREE.ExtrudeGeometry(s, { depth: 0.75, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 2 })
  hullGeo.rotateX(Math.PI / 2)
  hullGeo.translate(0, 0.45, 0)
  const hull = new THREE.Mesh(hullGeo, new THREE.MeshStandardMaterial({ color: hullColor, roughness: 0.28, metalness: 0.1 }))
  hull.castShadow = true
  hull.receiveShadow = true
  g.add(hull)
  const B = new Batch()
  B.box(M.wood, L * 1.9, 0.05, Wd * 1.55, -0.2, 0.28, 0)
  for (let i = 0; i < 5; i++) B.box(M.wood, 0.34, 0.06, Wd * 1.55, -2.5 + i * 1.15, 0.62, 0)
  for (const sx of [-1, 1]) for (const px of [-2.7, -0.4, 1.9]) B.box(M.white, 0.06, 1.85, 0.06, px, 1.45, sx * Wd * 0.72)
  B.box(M.white, L * 1.4, 0.07, Wd * 1.9, -0.4, 2.4, 0)
  B.build(g)
  return g
}

/* ---------------------------------------------------------------- fountain */
const FOUNTAIN_VS = /* glsl */ `
uniform float uTime; uniform float uScale;
attribute vec4 aSeed; attribute vec3 aDir;
varying float vA;
void main(){
  float life = 1.7 + aSeed.w * 0.9;
  float t = fract(uTime * 0.5 / life * 1.4 + aSeed.x);
  float age = t * life;
  float vy = aSeed.y;
  vec3 p = position;
  p.xz += aDir.xz * aSeed.z * age;
  p.y += vy * age - 4.9 * age * age;
  float below = step(p.y, 0.0);
  vA = (1.0 - t) * (1.0 - below) * smoothstep(0.0, 0.05, t);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = uScale * (0.075 + aSeed.w * 0.05) / max(0.5, -mv.z);
  gl_Position = projectionMatrix * mv;
}`
const FOUNTAIN_FS = /* glsl */ `
uniform sampler2D uMap; uniform vec3 uColor;
varying float vA;
void main(){
  vec4 t = texture2D(uMap, gl_PointCoord);
  gl_FragColor = vec4(uColor, t.a * vA * 0.75);
}`

export interface Life {
  group: THREE.Group
  update: (t: number, dt: number, sunColor: THREE.Color, wind: number) => void
  fountainPos: THREE.Vector3
}

export function buildLife(M: Mats, sprite: THREE.Texture): Life {
  const group = new THREE.Group()
  const r = rng(99)

  // swans
  const swans: { m: THREE.Group; cx: number; cz: number; rx: number; rz: number; sp: number; ph: number; neck: THREE.Object3D }[] = []
  for (let i = 0; i < 5; i++) {
    const m = swanModel()
    m.scale.setScalar(1.1 + r() * 0.2)
    group.add(m)
    swans.push({ m, cx: LAKE_C[0] + (r() - 0.5) * 30, cz: LAKE_C[1] + (r() - 0.5) * 6, rx: 12 + r() * 20, rz: 5 + r() * 5, sp: (0.018 + r() * 0.02) * (r() > 0.5 ? 1 : -1), ph: r() * TAU, neck: m })
  }

  // boats
  const canalBoat = boatModel(M, 0x1f4a72)
  const lakeBoat = boatModel(M, 0x7a2430)
  const canalBoat2 = boatModel(M, 0x2e6b4a)
  group.add(canalBoat, lakeBoat, canalBoat2)

  // fountain
  const fountainPos = new THREE.Vector3(24, WATER_Y, -40)
  const N = 2200
  const pos = new Float32Array(N * 3)
  const seed = new Float32Array(N * 4)
  const dir = new Float32Array(N * 3)
  for (let i = 0; i < N; i++) {
    const jet = i % 8
    pos[i * 3] = fountainPos.x
    pos[i * 3 + 1] = fountainPos.y
    pos[i * 3 + 2] = fountainPos.z
    const a = r() * TAU
    let vy: number
    let hv: number
    if (jet === 0 || jet === 1) {
      vy = 11.5 + r() * 1.6
      hv = r() * 0.6
    } else {
      vy = 5.4 + r() * 1.0
      hv = 2.0 + r() * 0.7
    }
    seed[i * 4] = r()
    seed[i * 4 + 1] = vy
    seed[i * 4 + 2] = hv
    seed[i * 4 + 3] = r()
    const ringA = jet >= 2 ? ((jet - 2) / 6) * TAU : a
    dir[i * 3] = Math.cos(ringA)
    dir[i * 3 + 2] = Math.sin(ringA)
  }
  const fg = new THREE.BufferGeometry()
  fg.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  fg.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4))
  fg.setAttribute('aDir', new THREE.BufferAttribute(dir, 3))
  fg.boundingSphere = new THREE.Sphere(fountainPos.clone().add(new THREE.Vector3(0, 6, 0)), 14)
  const fu = { uTime: { value: 0 }, uScale: { value: 900 }, uMap: { value: sprite }, uColor: { value: new THREE.Color(1, 1, 1) } }
  const fm = new THREE.ShaderMaterial({ uniforms: fu, vertexShader: FOUNTAIN_VS, fragmentShader: FOUNTAIN_FS, transparent: true, depthWrite: false })
  const fountain = new THREE.Points(fg, fm)
  fountain.frustumCulled = false
  group.add(fountain)
  const rings: THREE.Mesh[] = []
  for (let i = 0; i < 3; i++) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1.0, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide }))
    ring.rotation.x = -Math.PI / 2
    ring.position.copy(fountainPos).add(new THREE.Vector3(0, 0.02, 0))
    group.add(ring)
    rings.push(ring)
  }

  const q = new THREE.Vector3()
  return {
    group,
    fountainPos,
    update: (t, dt, sunColor, wind) => {
      void dt
      fu.uTime.value = t
      fu.uColor.value.copy(sunColor).lerp(new THREE.Color(1, 1, 1), 0.6)
      rings.forEach((ring, i) => {
        const k = (t * 0.45 + i / 3) % 1
        ring.scale.setScalar(1 + k * 5.5)
        ;(ring.material as THREE.MeshBasicMaterial).opacity = (1 - k) * 0.35
      })
      for (const s of swans) {
        const a = s.ph + t * s.sp
        const x = s.cx + Math.cos(a) * s.rx
        const z = s.cz + Math.sin(a) * s.rz
        s.m.position.set(x, WATER_Y - 0.06 + Math.sin(t * 1.3 + s.ph) * 0.012, z)
        const dx = -Math.sin(a) * s.rx * Math.sign(s.sp)
        const dz = Math.cos(a) * s.rz * Math.sign(s.sp)
        s.m.rotation.y = -Math.atan2(dz, dx) + Math.sin(t * 0.5 + s.ph) * 0.1
        s.m.rotation.z = Math.sin(t * 1.1 + s.ph) * 0.02 * (1 + wind)
      }
      // canal boats ping-pong
      const span = 150
      const cb = ((t * 0.75) % (span * 2))
      const cx = cb < span ? -75 + cb : -75 + (span * 2 - cb)
      canalBoat.position.set(cx, WATER_Y - 0.12 + Math.sin(t * 0.9) * 0.01, CANAL_Z + (cb < span ? 1.6 : -1.6))
      canalBoat.rotation.y = cb < span ? 0 : Math.PI
      const cb2 = ((t * 0.6 + 140) % (span * 2))
      const cx2 = cb2 < span ? 75 - cb2 : 75 - (span * 2 - cb2)
      canalBoat2.position.set(cx2, WATER_Y - 0.12 + Math.sin(t * 0.8 + 1) * 0.01, CANAL_Z + (cb2 < span ? -1.6 : 1.6))
      canalBoat2.rotation.y = cb2 < span ? Math.PI : 0
      const la = t * 0.014 + 1.3
      q.set(LAKE_C[0] + Math.cos(la) * 36, 0, LAKE_C[1] + Math.sin(la) * 10)
      lakeBoat.position.set(q.x, WATER_Y - 0.12 + Math.sin(t * 0.7) * 0.012, q.z)
      lakeBoat.rotation.y = -Math.atan2(Math.cos(la) * 10, -Math.sin(la) * 36)
    },
  }
}

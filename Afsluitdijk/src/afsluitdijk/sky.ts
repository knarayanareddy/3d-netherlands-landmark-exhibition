import * as THREE from 'three'
import { Sky } from 'three/examples/jsm/objects/Sky.js'
import { smoothstep, lerp, mulberry32 } from './noise'

export interface EnvParams {
  sunDir: THREE.Vector3
  lightDir: THREE.Vector3
  turbidity: number
  rayleigh: number
  mie: number
  mieG: number
  cover: number
  sunColor: THREE.Color
  sunInt: number
  hemiInt: number
  hemiSky: THREE.Color
  hemiGround: THREE.Color
  fog: THREE.Color
  fogDensity: number
  exposure: number
  envInt: number
  night: number
  day: number
  cloudLit: THREE.Color
  cloudDark: THREE.Color
  moonDir: THREE.Vector3
}

export const dirFrom = (elevDeg: number, azDeg: number, out = new THREE.Vector3()) => {
  const e = (elevDeg * Math.PI) / 180
  const a = (azDeg * Math.PI) / 180
  // azimuth measured clockwise from north (-z); +x is east
  return out.set(Math.cos(e) * Math.sin(a), Math.sin(e), -Math.cos(e) * Math.cos(a))
}

const C = (h: string) => new THREE.Color(h)
const cFogDay = C('#d0dfea')
const cFogOver = C('#b3bbc1')
const cFogGold = C('#f0c3a0')
const cFogTwi = C('#4a5878')
const cFogNight = C('#0a1020')

export function computeEnv(elev: number, az: number, cover: number): EnvParams {
  const day = smoothstep(-4, 10, elev)
  const warm = (1 - smoothstep(3, 26, elev)) * day
  const night = 1 - smoothstep(-9, 1, elev)
  const sunDir = dirFrom(elev, az)
  const moonDir = dirFrom(38, 205)
  const useSun = elev > -1.5
  const lightDir = useSun ? sunDir.clone() : moonDir.clone()

  const sunColor = new THREE.Color(1, 0.96, 0.9).lerp(new THREE.Color(1, 0.6, 0.32), warm)
  const sunInt = 3.4 * smoothstep(-1.5, 20, elev) * (1 - 0.88 * cover)
  const moonInt = 1.0 * (1 - day) * (1 - 0.7 * cover)
  if (!useSun) sunColor.set('#9bb2ff')

  const fog = cFogDay.clone().lerp(cFogOver, cover)
  fog.lerp(cFogGold, warm * (1 - 0.55 * cover))
  fog.lerp(cFogTwi, (1 - day) * smoothstep(-12, -2, elev) * 0.9)
  fog.lerp(cFogNight, night)

  const hemiSky = C('#a8c8ea').lerp(C('#aab4bd'), cover).lerp(C('#e7b9a0'), warm * 0.6).lerp(C('#1c2a50'), 1 - day)
  const hemiGround = C('#7d7a62').lerp(C('#5a5748'), warm * 0.4).lerp(C('#0d1119'), 1 - day)

  const cloudLit = sunColor.clone().multiplyScalar(0.55 + 1.5 * day * (1 - 0.55 * cover) + 0.05)
  cloudLit.lerp(new THREE.Color(0.05, 0.06, 0.1), night * 0.9)
  const cloudDark = new THREE.Color(0.5, 0.58, 0.7)
    .lerp(new THREE.Color(0.55, 0.45, 0.45), warm * 0.7)
    .multiplyScalar(0.25 + 0.7 * day * (1 - 0.35 * cover))
  cloudDark.lerp(new THREE.Color(0.01, 0.015, 0.03), night * 0.9)

  return {
    sunDir,
    lightDir,
    turbidity: lerp(2.6, 9, warm) + cover * 4,
    rayleigh: lerp(0.5, 1.3, day) * (1 - 0.35 * cover) + warm * 0.9,
    mie: 0.004 + warm * 0.006,
    mieG: 0.8,
    cover,
    sunColor,
    sunInt: useSun ? sunInt : moonInt,
    hemiInt: 0.08 + 0.2 * cover + 0.1 * (1 - day),
    hemiSky,
    hemiGround,
    fog,
    fogDensity: 0.00021 + 0.00026 * cover + 0.00018 * warm + 0.0001 * night,
    exposure: lerp(1.35, 0.6, day) + cover * 0.16 * day,
    envInt: lerp(0.4, 0.62, day),
    night,
    day,
    cloudLit,
    cloudDark,
    moonDir,
  }
}

const CLOUD_VS = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    p.z = p.w;
    gl_Position = p;
  }
`
const CLOUD_FS = /* glsl */ `
  varying vec3 vDir;
  uniform float uTime;
  uniform float uCover;
  uniform vec3 uSun;
  uniform vec3 uLit;
  uniform vec3 uDark;
  uniform vec3 uFog;
  float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float noise(vec2 p){
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1,0)), f.x), mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y);
  }
  float fbm(vec2 p){
    float s = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { s += a * noise(p); p = p * 2.03 + vec2(17.1, 9.2); a *= 0.5; }
    return s;
  }
  float dens(vec2 p){
    float b = fbm(p * 0.55);
    float d = fbm(p * 2.1 + 3.7);
    return b * 0.78 + d * 0.22;
  }
  void main(){
    vec3 d = normalize(vDir);
    if (d.y < 0.005) discard;
    vec2 uv = d.xz / (d.y + 0.14);
    vec2 p = uv * 0.9 + uTime * vec2(0.010, 0.004);
    float h = dens(p);
    float thr = mix(0.70, 0.34, uCover);
    float c = smoothstep(thr, thr + 0.2, h);
    float h2 = dens(p + uSun.xz * 0.12 / max(0.25, uSun.y + 0.2));
    float shade = clamp((h - h2) * 3.2 + 0.55, 0.0, 1.0);
    shade = mix(shade, 0.35, uCover * 0.65);
    vec3 col = mix(uDark, uLit, shade);
    col = mix(col, uDark * 0.8, smoothstep(thr + 0.1, thr + 0.5, h) * 0.5);
    float fadeH = smoothstep(0.0, 0.16, d.y);
    col = mix(uFog, col, fadeH);
    float a = c * smoothstep(0.0, 0.1, d.y) * mix(0.92, 0.98, uCover);
    gl_FragColor = vec4(col, a);
  }
`

export class SkyRig {
  readonly visible = new THREE.Group()
  readonly envScene = new THREE.Scene()
  private skies: Sky[] = []
  private cloudU = {
    uTime: { value: 0 },
    uCover: { value: 0.3 },
    uSun: { value: new THREE.Vector3(0, 1, 0) },
    uLit: { value: new THREE.Color(1, 1, 1) },
    uDark: { value: new THREE.Color(0.5, 0.5, 0.6) },
    uFog: { value: new THREE.Color(0.7, 0.8, 0.9) },
  }
  private stars: THREE.Points
  private moon: THREE.Mesh

  constructor() {
    const cloudMat = new THREE.ShaderMaterial({
      uniforms: this.cloudU,
      vertexShader: CLOUD_VS,
      fragmentShader: CLOUD_FS,
      transparent: true,
      depthWrite: false,
      side: THREE.BackSide,
      fog: false,
    })
    const mk = (target: THREE.Object3D, disc: boolean) => {
      const sky = new Sky()
      sky.material.uniforms.showSunDisc.value = disc ? 1 : 0
      sky.scale.setScalar(9000)
      sky.frustumCulled = false
      sky.renderOrder = -3
      target.add(sky)
      this.skies.push(sky)
      const cl = new THREE.Mesh(new THREE.SphereGeometry(5000, 48, 24), cloudMat)
      cl.frustumCulled = false
      cl.renderOrder = -2
      target.add(cl)
    }
    mk(this.visible, true)
    mk(this.envScene, false)

    const rnd = mulberry32(3)
    const pts: number[] = []
    for (let i = 0; i < 1800; i++) {
      const u = rnd() * 2 - 1
      const t = rnd() * Math.PI * 2
      const r = Math.sqrt(1 - u * u)
      const y = Math.abs(u)
      pts.push(Math.cos(t) * r * 4000, y * 4000, Math.sin(t) * r * 4000)
    }
    const sg = new THREE.BufferGeometry()
    sg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
    this.stars = new THREE.Points(
      sg,
      new THREE.PointsMaterial({ color: '#ffffff', size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false }),
    )
    this.stars.frustumCulled = false
    this.stars.renderOrder = -1
    this.visible.add(this.stars)

    this.moon = new THREE.Mesh(
      new THREE.SphereGeometry(120, 24, 16),
      new THREE.MeshBasicMaterial({ color: '#e8ecf6', fog: false, transparent: true, opacity: 0, depthWrite: false }),
    )
    this.moon.frustumCulled = false
    this.moon.renderOrder = -1
    this.visible.add(this.moon)
  }

  apply(p: EnvParams) {
    for (const s of this.skies) {
      const u = s.material.uniforms
      u.sunPosition.value.copy(p.sunDir)
      u.turbidity.value = p.turbidity
      u.rayleigh.value = p.rayleigh
      u.mieCoefficient.value = p.mie
      u.mieDirectionalG.value = p.mieG
    }
    const c = this.cloudU
    c.uCover.value = p.cover
    c.uSun.value.copy(p.sunDir)
    c.uLit.value.copy(p.cloudLit)
    c.uDark.value.copy(p.cloudDark)
    c.uFog.value.copy(p.fog)
    ;(this.stars.material as THREE.PointsMaterial).opacity = Math.max(0, (p.night - 0.35) * 1.5) * (1 - p.cover * 0.9)
    const mm = this.moon.material as THREE.MeshBasicMaterial
    mm.opacity = Math.max(0, p.night - 0.2) * (1 - p.cover * 0.85)
    this.moon.position.copy(p.moonDir).multiplyScalar(4500)
  }

  update(t: number, cam: THREE.Vector3) {
    this.cloudU.uTime.value = t
    this.visible.position.copy(cam)
  }
}

import * as THREE from 'three'
import { Sky } from 'three/examples/jsm/objects/Sky.js'

export type TimeOfDay = 'day' | 'golden' | 'dusk' | 'night'

export interface Env {
  elev: number; az: number; lElev: number; lAz: number
  turb: number; ray: number; mie: number; mieG: number
  sunInt: number; hemi: number; exposure: number; fogD: number
  night: number; env: number; cover: number; cloudOp: number
  bloom: number; bloomThr: number; envGround: number; water: number
  sunColor: string; hemiSky: string; hemiGround: string; fog: string
  waterColor: string; cLight: string; cDark: string; envGroundColor: string
}

export const PRESETS: Record<TimeOfDay, Env> = {
  day: {
    elev: 46, az: 205, lElev: 46, lAz: 205, turb: 1.2, ray: 2.5, mie: 0.002, mieG: 0.8,
    sunInt: 3.6, hemi: 0.55, exposure: 0.58, fogD: 0.00038, night: 0, env: 1.0, cover: 0.57, cloudOp: 0.95,
    bloom: 0.12, bloomThr: 0.92, envGround: 1, water: 1,
    sunColor: '#fff2dc', hemiSky: '#b4d2ee', hemiGround: '#8d8f80', fog: '#c9dcec',
    waterColor: '#3a5553', cLight: '#ffffff', cDark: '#a3b4cc', envGroundColor: '#8a8e84',
  },
  golden: {
    elev: 6.5, az: 196, lElev: 6.5, lAz: 196, turb: 6.5, ray: 2.0, mie: 0.009, mieG: 0.86,
    sunInt: 3.9, hemi: 0.5, exposure: 0.66, fogD: 0.0006, night: 0.12, env: 0.8, cover: 0.54, cloudOp: 0.95,
    bloom: 0.2, bloomThr: 0.85, envGround: 0.8, water: 1,
    sunColor: '#ffb472', hemiSky: '#d6b6a8', hemiGround: '#74624d', fog: '#e2b79a',
    waterColor: '#32403f', cLight: '#ffd2a0', cDark: '#9c8a9c', envGroundColor: '#8a7660',
  },
  dusk: {
    elev: -3.2, az: 196, lElev: 10, lAz: 196, turb: 3, ray: 1.5, mie: 0.004, mieG: 0.9,
    sunInt: 0.55, hemi: 0.5, exposure: 0.85, fogD: 0.0007, night: 0.78, env: 0.5, cover: 0.46, cloudOp: 0.9,
    bloom: 0.45, bloomThr: 0.6, envGround: 0.45, water: 0.7,
    sunColor: '#9eb0ff', hemiSky: '#52639a', hemiGround: '#272a34', fog: '#5d6b94',
    waterColor: '#243441', cLight: '#c9a0b0', cDark: '#3d4768', envGroundColor: '#3a3f55',
  },
  night: {
    elev: -24, az: 196, lElev: 38, lAz: 118, turb: 2, ray: 0.7, mie: 0.002, mieG: 0.9,
    sunInt: 0.7, hemi: 0.25, exposure: 1.0, fogD: 0.0009, night: 1, env: 0.28, cover: 0.45, cloudOp: 0.5,
    bloom: 0.75, bloomThr: 0.4, envGround: 0.18, water: 0.35,
    sunColor: '#9db2ff', hemiSky: '#1d2b52', hemiGround: '#0c1019', fog: '#0a1226',
    waterColor: '#0c1a26', cLight: '#5f6f96', cDark: '#141b2e', envGroundColor: '#161c2a',
  },
}

const NUM = ['elev', 'az', 'lElev', 'lAz', 'turb', 'ray', 'mie', 'mieG', 'sunInt', 'hemi', 'exposure', 'fogD', 'night', 'env', 'cover', 'cloudOp', 'bloom', 'bloomThr', 'envGround', 'water'] as const
const COL = ['sunColor', 'hemiSky', 'hemiGround', 'fog', 'waterColor', 'cLight', 'cDark', 'envGroundColor'] as const

export const dirFrom = (elev: number, az: number, out = new THREE.Vector3()) => {
  const e = (elev * Math.PI) / 180
  const a = (az * Math.PI) / 180
  return out.set(Math.cos(e) * Math.sin(a), Math.sin(e), Math.cos(e) * Math.cos(a))
}

const CLOUD_VERT = /* glsl */ `
varying vec3 vDir;
void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`

const CLOUD_FRAG = /* glsl */ `
uniform vec3 sunDir; uniform float time; uniform float cover; uniform float opacity;
uniform vec3 cLight; uniform vec3 cDark;
varying vec3 vDir;
float hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y);
}
float fbm(vec2 p){
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 6; i++){ s += a*noise(p); p = p*2.03 + vec2(17.1, 9.2); a *= 0.5; }
  return s;
}
void main(){
  vec3 d = normalize(vDir);
  if (d.y < 0.004) discard;
  vec2 p = d.xz / (d.y + 0.14) * 0.62 + vec2(time*0.004, time*0.0016);
  float n = fbm(p * 1.15);
  float dens = smoothstep(cover, cover + 0.26, n);
  vec2 sp = normalize(sunDir.xz + 1e-4) * 0.055 * (1.0 - 0.6*clamp(sunDir.y,0.0,1.0));
  float n2 = fbm(p * 1.15 + sp);
  float lit = clamp((n - n2) * 4.2 + 0.58, 0.0, 1.0);
  float thick = smoothstep(cover, cover + 0.5, n);
  vec3 col = mix(cDark, cLight, lit);
  col = mix(col, cDark * 0.78, thick * (1.0 - lit) * 0.55);
  float sd = max(dot(d, normalize(sunDir)), 0.0);
  col += cLight * pow(sd, 10.0) * (1.0 - thick * 0.8) * 0.5;
  // high thin cirrus
  vec2 cp = d.xz / (d.y + 0.28) * vec2(0.9, 2.4) + vec2(time*0.006, 0.0);
  float ci = smoothstep(0.5, 0.95, fbm(cp * 2.2)) * 0.45;
  float a = max(dens, ci);
  col = mix(cLight * 0.97, col, dens / (dens + ci + 1e-3));
  a *= smoothstep(0.0, 0.16, d.y) * opacity;
  gl_FragColor = vec4(col, a);
}`

export class Atmosphere {
  root = new THREE.Group()
  private sky = new Sky()
  private envSky = new Sky()
  private cloudMat: THREE.ShaderMaterial
  private cloud: THREE.Mesh
  private envCloud: THREE.Mesh
  private envGround: THREE.Mesh
  private stars: THREE.Points
  private moon: THREE.Mesh
  private envScene = new THREE.Scene()
  private pmrem: THREE.PMREMGenerator
  private rt: THREE.WebGLRenderTarget | null = null
  private tgt: Env = PRESETS.day
  cur: Record<(typeof NUM)[number], number> = {} as any
  curC: Record<(typeof COL)[number], THREE.Color> = {} as any
  sunDir = new THREE.Vector3()
  lightDir = new THREE.Vector3()
  private acc = 0
  private dirty = true
  private moving = true

  constructor(private scene: THREE.Scene, private renderer: THREE.WebGLRenderer, private hemi: THREE.HemisphereLight, private sun: THREE.DirectionalLight, private fog: THREE.FogExp2) {
    for (const k of NUM) this.cur[k] = PRESETS.day[k]
    for (const k of COL) this.curC[k] = new THREE.Color(PRESETS.day[k])

    this.sky.scale.setScalar(3000)
    this.envSky.scale.setScalar(3000)
    this.envScene.add(this.envSky)
    this.cloudMat = new THREE.ShaderMaterial({
      vertexShader: CLOUD_VERT,
      fragmentShader: CLOUD_FRAG,
      uniforms: {
        sunDir: { value: new THREE.Vector3(0, 1, 0) }, time: { value: 0 }, cover: { value: 0.5 }, opacity: { value: 1 },
        cLight: { value: new THREE.Color('#fff') }, cDark: { value: new THREE.Color('#889') },
      },
      transparent: true, depthWrite: false, side: THREE.BackSide, fog: false,
    })
    const dome = new THREE.SphereGeometry(1420, 48, 24)
    this.cloud = new THREE.Mesh(dome, this.cloudMat)
    this.cloud.renderOrder = -1
    this.envCloud = new THREE.Mesh(dome, this.cloudMat)
    this.envScene.add(this.envCloud)
    this.envGround = new THREE.Mesh(new THREE.CircleGeometry(2400, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#888' }))
    this.envGround.position.y = -2
    this.envScene.add(this.envGround)

    // stars + moon
    const sp: number[] = []
    for (let i = 0; i < 1300; i++) {
      const th = Math.random() * Math.PI * 2
      const y = Math.random() * 0.96 + 0.03
      const r = 1380
      const rr = Math.sqrt(1 - y * y)
      sp.push(Math.cos(th) * rr * r, y * r, Math.sin(th) * rr * r)
    }
    const sg = new THREE.BufferGeometry()
    sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3))
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: '#ffffff', size: 1.3, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false }))
    this.moon = new THREE.Mesh(new THREE.SphereGeometry(24, 24, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.15, 1.9), fog: false, transparent: true, opacity: 0, depthWrite: false }))
    this.root.add(this.sky, this.cloud, this.stars, this.moon)
    scene.add(this.root)

    this.pmrem = new THREE.PMREMGenerator(renderer)
    this.apply()
    this.regen()
  }

  setTarget(t: TimeOfDay) {
    this.tgt = PRESETS[t]
    this.moving = true
  }

  /** Is the atmosphere still blending between presets? */
  get busy() {
    return this.moving
  }

  private apply() {
    const e = this.cur
    dirFrom(e.elev, e.az, this.sunDir)
    dirFrom(e.lElev, e.lAz, this.lightDir)
    for (const s of [this.sky, this.envSky]) {
      const u = s.material.uniforms
      u.sunPosition.value.copy(this.sunDir)
      u.turbidity.value = e.turb
      u.rayleigh.value = e.ray
      u.mieCoefficient.value = e.mie
      u.mieDirectionalG.value = e.mieG
    }
    const cu = this.cloudMat.uniforms
    cu.sunDir.value.copy(e.night > 0.9 ? this.lightDir : this.sunDir)
    cu.cover.value = e.cover
    cu.opacity.value = e.cloudOp
    cu.cLight.value.copy(this.curC.cLight)
    cu.cDark.value.copy(this.curC.cDark)
    this.sun.color.copy(this.curC.sunColor)
    this.sun.intensity = e.sunInt
    this.hemi.intensity = e.hemi
    this.hemi.color.copy(this.curC.hemiSky)
    this.hemi.groundColor.copy(this.curC.hemiGround)
    this.renderer.toneMappingExposure = e.exposure
    this.fog.color.copy(this.curC.fog)
    this.fog.density = e.fogD
    ;(this.scene.background as THREE.Color | null)?.copy?.(this.curC.fog)
    this.scene.environmentIntensity = e.env
    const nn = THREE.MathUtils.smoothstep(e.night, 0.35, 0.95)
    ;(this.stars.material as THREE.PointsMaterial).opacity = nn * 0.7
    ;(this.moon.material as THREE.MeshBasicMaterial).opacity = nn
    this.moon.position.copy(this.lightDir).multiplyScalar(1300)
    ;(this.envGround.material as THREE.MeshBasicMaterial).color.copy(this.curC.envGroundColor).multiplyScalar(e.envGround * 0.5)
  }

  private regen() {
    this.rt?.dispose()
    this.rt = this.pmrem.fromScene(this.envScene, 0, 1, 4000)
    this.scene.environment = this.rt.texture
  }

  /** Jump straight to the target preset (no blending). */
  snap() {
    for (const n of NUM) this.cur[n] = this.tgt[n]
    for (const n of COL) this.curC[n].set(this.tgt[n])
    this.apply()
    this.regen()
    this.moving = false
    this.dirty = false
  }

  update(dt: number, time: number, cam: THREE.Vector3) {
    this.root.position.copy(cam)
    this.cloudMat.uniforms.time.value = time
    if (this.moving) {
      const k = 1 - Math.exp(-dt * 2.2)
      let maxd = 0
      for (const n of NUM) {
        const d = this.tgt[n] - this.cur[n]
        maxd = Math.max(maxd, Math.abs(d) / (Math.abs(this.tgt[n]) + 1))
        this.cur[n] += d * k
      }
      const tc = new THREE.Color()
      for (const n of COL) {
        tc.set(this.tgt[n])
        this.curC[n].lerp(tc, k)
      }
      this.apply()
      this.acc += dt
      if (this.acc > 0.35) {
        this.acc = 0
        this.regen()
      }
      this.dirty = true
      if (maxd < 0.002) this.moving = false
    } else if (this.dirty) {
      for (const n of NUM) this.cur[n] = this.tgt[n]
      for (const n of COL) this.curC[n].set(this.tgt[n])
      this.apply()
      this.regen()
      this.dirty = false
    }
  }
}

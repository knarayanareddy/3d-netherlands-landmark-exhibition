import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { Sky } from 'three/examples/jsm/objects/Sky.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { Batch, Ctx, M, TAU, clamp, initMaterials, lerp, loadTextures, setAniso, smooth } from './gfx'
import {
  AQ_F, buildAquariumExterior, buildGate, buildGrooteMuseum, buildLedenlokalen, buildSkyline, buildStreetHouses, finalizeFence,
} from './buildings'
import { buildAquariumInterior, HallAPI } from './interior'
import { LAMP_GLASS, PATHS, PLAZA_R, POND, buildNature } from './nature'
import { POIS, POI, areaAt } from './data'
import { Ambience } from './audio'

export type TimeOfDay = 'day' | 'golden' | 'night'
export type Mode = 'walk' | 'aerial'
export type Quality = 'high' | 'medium' | 'low'

export interface WorldState { x: number; z: number; yaw: number; inside: number; area: string; poi: string | null }
export interface WorldEvents {
  onProgress?: (p: number, label: string) => void
  onState?: (s: WorldState) => void
  onFade?: (on: boolean) => void
  onLock?: (l: boolean) => void
  onJoy?: (j: { active: boolean; ox: number; oy: number; x: number; y: number }) => void
  onPoi?: (id: string) => void
}

interface Env {
  elev: number; az: number; lElev: number; lAz: number; turb: number; ray: number; mie: number; sunInt: number
  hemi: number; exposure: number; fogD: number; night: number; env: number; cloud: number; light: number
  sunColor: string; hemiSky: string; hemiGround: string; fog: string; bounce: string
}
const PRESETS: Record<TimeOfDay, Env> = {
  day: { elev: 50, az: 28, lElev: 50, lAz: 28, turb: 3.0, ray: 1.1, mie: 0.004, sunInt: 3.9, hemi: 0.5, exposure: 0.58, fogD: 0.00085, night: 0, env: 1, cloud: 0.5, light: 1, sunColor: '#fff2dd', hemiSky: '#bcd8f0', hemiGround: '#8a8c6e', fog: '#c6d9e8', bounce: '#6f7d4e' },
  golden: { elev: 9, az: 78, lElev: 9, lAz: 78, turb: 7, ray: 2.2, mie: 0.01, sunInt: 3.6, hemi: 0.42, exposure: 0.62, fogD: 0.0014, night: 0.25, env: 0.85, cloud: 0.55, light: 0.8, sunColor: '#ffb170', hemiSky: '#e6b79b', hemiGround: '#6f6048', fog: '#e4bf9e', bounce: '#5a4f35' },
  night: { elev: -7, az: 78, lElev: 38, lAz: -30, turb: 2, ray: 0.5, mie: 0.003, sunInt: 1.2, hemi: 0.34, exposure: 0.92, fogD: 0.0016, night: 1, env: 0.28, cloud: 0.35, light: 0.08, sunColor: '#8fa8ff', hemiSky: '#27396b', hemiGround: '#10151f', fog: '#0c1630', bounce: '#0d1220' },
}
const NUM = ['elev', 'az', 'lElev', 'lAz', 'turb', 'ray', 'mie', 'sunInt', 'hemi', 'exposure', 'fogD', 'night', 'env', 'cloud', 'light'] as const
const COL = ['sunColor', 'hemiSky', 'hemiGround', 'fog', 'bounce'] as const

const dirFrom = (elev: number, az: number) => {
  const e = (elev * Math.PI) / 180
  const a = (az * Math.PI) / 180
  return new THREE.Vector3(Math.cos(e) * Math.sin(a), Math.sin(e), Math.cos(e) * Math.cos(a))
}
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const angDiff = (a: number, b: number) => ((((b - a) % TAU) + TAU + Math.PI) % TAU) - Math.PI
const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()))

const EYE = 1.68

export class ArtisWorld {
  private container: HTMLElement
  private ev: WorldEvents
  renderer!: THREE.WebGLRenderer
  scene = new THREE.Scene()
  camera!: THREE.PerspectiveCamera
  private composer!: EffectComposer
  private bloom!: UnrealBloomPass
  private grade!: ShaderPass
  private controls!: OrbitControls
  private sky!: Sky
  private envSky!: Sky
  private envScene = new THREE.Scene()
  private envGround!: THREE.Mesh
  private pmrem!: THREE.PMREMGenerator
  private envRT: THREE.WebGLRenderTarget | null = null
  private sun!: THREE.DirectionalLight
  private hemi!: THREE.HemisphereLight
  private fog = new THREE.FogExp2('#c6d9e8', 0.00085)
  private stars!: THREE.Points
  private clouds!: THREE.Mesh
  private cloudU = { uTime: { value: 0 }, uCover: { value: 0.5 }, uLight: { value: 1 }, uTint: { value: new THREE.Color('#ffffff') } }
  private starU = { uNight: { value: 0 }, uTime: { value: 0 } }
  private cur: Record<string, number> = {}
  private curC: Record<string, THREE.Color> = {}
  private tgt: Env = PRESETS.day
  private envAcc = 0
  private envDirty = true
  private ctx!: Ctx
  private hall!: HallAPI
  private lampLights: THREE.PointLight[] = []
  private labels: { poi: POI; el: HTMLButtonElement }[] = []
  private labelRoot!: HTMLDivElement
  private amb = new Ambience()
  private ro!: ResizeObserver
  private raf = 0
  private disposed = false
  private time = 0
  private ready = false

  mode: Mode = 'walk'
  tod: TimeOfDay = 'day'
  quality: Quality = 'high'
  private px = 0
  private pz = 79
  private py = EYE
  private yaw = 0
  private pitch = 0.02
  private vx = 0
  private vz = 0
  private bobPh = 0
  private stride = 0
  private keys: Record<string, boolean> = {}
  private joy = { x: 0, y: 0 }
  private pointers = new Map<number, { kind: 'look' | 'joy'; x: number; y: number; ox: number; oy: number; t: number; moved: number }>()
  private flight: { t: number; dur: number; from: THREE.Vector3; to: THREE.Vector3; yaw0: number; yaw1: number; p0: number; p1: number } | null = null
  private inside = 0
  private lastWalk = { x: 0, z: 79, yaw: 0, pitch: 0.02 }
  private stateT = 0
  private shadowS = 80
  private lastPoi: string | null = null
  private locked = false
  private lastLightSort = 0

  constructor(container: HTMLElement, ev: WorldEvents = {}) {
    this.container = container
    this.ev = ev
  }

  /* ----------------------------------------------------------------- */
  async init() {
    const c = this.container
    const w = c.clientWidth || 1
    const h = c.clientHeight || 1
    const r = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false })
    this.renderer = r
    r.setPixelRatio(Math.min(window.devicePixelRatio, 1.6))
    r.setSize(w, h)
    r.shadowMap.enabled = true
    r.shadowMap.type = THREE.PCFShadowMap
    r.toneMapping = THREE.ACESFilmicToneMapping
    r.toneMappingExposure = 0.58
    r.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;touch-action:none;outline:none'
    c.appendChild(r.domElement)
    setAniso(Math.min(8, r.capabilities.getMaxAnisotropy()))

    this.camera = new THREE.PerspectiveCamera(66, w / h, 0.15, 4200)
    this.camera.rotation.order = 'YXZ'
    this.scene.fog = this.fog
    this.scene.background = null

    this.labelRoot = document.createElement('div')
    this.labelRoot.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden'
    c.appendChild(this.labelRoot)

    this.ev.onProgress?.(0.02, 'Fetching photographic textures')
    await loadTextures((p) => this.ev.onProgress?.(0.02 + p * 0.3, 'Fetching photographic textures'))
    initMaterials()

    this.setupSky()
    this.setupLights()

    this.ctx = {
      batch: new Batch(), root: new THREE.Group(), solids: [], posts: [], floors: [], blockers: [], noPlant: [], updaters: [], fence: [], lamps: [],
    }
    this.scene.add(this.ctx.root)
    const steps: [string, number, () => void][] = [
      ['Raising the main gate and eagles', 0.4, () => buildGate(this.ctx)],
      ['Laying brick on the Ledenlokalen', 0.46, () => buildLedenlokalen(this.ctx)],
      ['Setting the Groote Museum\u2019s columns', 0.52, () => buildGrooteMuseum(this.ctx)],
      ['Raising the Aquarium and its dome', 0.58, () => buildAquariumExterior(this.ctx)],
      ['Terracing the street and houses', 0.64, () => { buildStreetHouses(this.ctx); buildSkyline(this.ctx) }],
      ['Filling the Aquarium tanks', 0.72, () => { this.hall = buildAquariumInterior(this.ctx) }],
      ['Planting trees, tulips and grass', 0.82, () => buildNature(this.ctx)],
      ['Merging geometry', 0.92, () => { finalizeFence(this.ctx); this.ctx.root.add(this.ctx.batch.build()) }],
    ]
    for (const [label, p, fn] of steps) {
      this.ev.onProgress?.(p, label)
      await nextFrame()
      if (this.disposed) return
      fn()
    }
    // lamp point lights
    for (let i = 0; i < 4; i++) {
      const l = new THREE.PointLight('#ffcf8a', 0, 20, 2)
      this.scene.add(l)
      this.lampLights.push(l)
    }
    this.setupPost()
    this.setupInput()
    this.setupLabels()
    this.applyQuality()
    this.snapTod(this.tod)
    this.onResize()
    this.ro = new ResizeObserver(() => this.onResize())
    this.ro.observe(c)
    this.camPlace()
    this.ev.onProgress?.(0.97, 'Warming up the renderer')
    await nextFrame()
    this.regenEnv()
    this.composer.render()
    this.ready = true
    this.ev.onProgress?.(1, 'Ready')
    this.lastT = performance.now()
    this.loop()
  }

  /* ----------------------------------------------------------------- */
  private setupSky() {
    const mk = () => {
      const s = new Sky()
      s.scale.setScalar(450000)
      return s
    }
    this.sky = mk()
    this.scene.add(this.sky)
    this.envSky = mk()
    this.envScene.add(this.envSky)
    this.envGround = new THREE.Mesh(new THREE.CircleGeometry(95, 32), new THREE.MeshBasicMaterial({ color: '#6f7d4e' }))
    this.envGround.rotation.x = -Math.PI / 2
    this.envGround.position.y = -0.5
    this.envScene.add(this.envGround)
    this.pmrem = new THREE.PMREMGenerator(this.renderer)

    // clouds
    const cm = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.BackSide, fog: false,
      uniforms: this.cloudU,
      vertexShader: /* glsl */ `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: /* glsl */ `uniform float uTime; uniform float uCover; uniform float uLight; uniform vec3 uTint; varying vec3 vDir;
        float h(vec2 p){ p = fract(p*vec2(127.1,311.7)); p += dot(p,p+34.23); return fract(p.x*p.y); }
        float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
        float fbm(vec2 p){ float a=.5, s=0.; for(int i=0;i<5;i++){ s+=a*n(p); p=p*2.03+17.0; a*=.5; } return s; }
        void main(){
          vec3 d = normalize(vDir); if (d.y < 0.03) discard;
          vec2 uv = d.xz/(d.y+0.14)*0.85 + vec2(uTime*0.004, uTime*0.0016);
          float f = fbm(uv);
          float c = smoothstep(1.0-uCover, 1.0-uCover+0.26, f);
          float s2 = fbm(uv + vec2(0.06,0.04)*3.0);
          float lit = clamp(0.55 + (f - s2)*4.0, 0.0, 1.0);
          vec3 col = mix(vec3(0.52,0.57,0.66), vec3(1.0), lit) * uTint * uLight * 0.95;
          float a = c * smoothstep(0.03, 0.24, d.y);
          gl_FragColor = vec4(col, a*0.92);
        }`,
    })
    this.clouds = new THREE.Mesh(new THREE.SphereGeometry(3600, 32, 16), cm)
    this.clouds.frustumCulled = false
    this.scene.add(this.clouds)

    // stars
    const n = 1800
    const pos = new Float32Array(n * 3)
    const sz = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 0.95 + 0.05, Math.random() * 2 - 1).normalize().multiplyScalar(3400)
      pos.set([v.x, v.y, v.z], i * 3)
      sz[i] = 0.6 + Math.random() * 1.6
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('aS', new THREE.BufferAttribute(sz, 1))
    this.stars = new THREE.Points(
      g,
      new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
        uniforms: this.starU,
        vertexShader: /* glsl */ `attribute float aS; uniform float uTime; varying float vA; void main(){ vA = 0.6+0.4*sin(uTime*2.0+position.x*0.05); gl_PointSize = aS*1.7; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
        fragmentShader: /* glsl */ `uniform float uNight; varying float vA; void main(){ float d = length(gl_PointCoord-0.5); float a = smoothstep(0.5,0.1,d)*uNight*vA; gl_FragColor = vec4(vec3(0.85,0.9,1.0)*a, a); }`,
      }),
    )
    this.stars.frustumCulled = false
    this.scene.add(this.stars)
  }

  private setupLights() {
    this.sun = new THREE.DirectionalLight('#fff2dd', 3.9)
    this.sun.castShadow = true
    this.sun.shadow.bias = -0.0004
    this.sun.shadow.normalBias = 0.05
    this.sun.shadow.camera.near = 1
    this.sun.shadow.camera.far = 700
    this.scene.add(this.sun, this.sun.target)
    this.hemi = new THREE.HemisphereLight('#bcd8f0', '#8a8c6e', 0.5)
    this.scene.add(this.hemi)
  }

  private setupPost() {
    const w = this.container.clientWidth || 1
    const h = this.container.clientHeight || 1
    const pr = this.renderer.getPixelRatio()
    const rt = new THREE.WebGLRenderTarget(w * pr, h * pr, { type: THREE.HalfFloatType, samples: 4 })
    this.composer = new EffectComposer(this.renderer, rt)
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.2, 0.65, 0.92)
    this.composer.addPass(this.bloom)
    this.grade = new ShaderPass({
      uniforms: { tDiffuse: { value: null }, uVig: { value: 0.32 } },
      vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: /* glsl */ `uniform sampler2D tDiffuse; uniform float uVig; varying vec2 vUv;
        void main(){ vec4 c = texture2D(tDiffuse, vUv); vec2 q = vUv-0.5; float v = smoothstep(0.9, 0.22, length(q*vec2(1.0,0.88)));
          c.rgb *= mix(1.0-uVig, 1.0, v); gl_FragColor = c; }`,
    })
    this.composer.addPass(this.grade)
    this.composer.addPass(new OutputPass())
    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enabled = false
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.07
    this.controls.minDistance = 12
    this.controls.maxDistance = 330
    this.controls.maxPolarAngle = Math.PI / 2 - 0.03
    this.controls.target.set(0, 4, -8)
  }

  private applyQuality() {
    const q = this.quality
    const dpr = window.devicePixelRatio
    const pr = q === 'high' ? Math.min(dpr, 1.75) : q === 'medium' ? Math.min(dpr, 1.25) : 1
    this.renderer.setPixelRatio(pr)
    const ms = q === 'high' ? 4096 : q === 'medium' ? 2048 : 1024
    this.sun.shadow.mapSize.set(ms, ms)
    this.sun.shadow.map?.dispose()
    this.sun.shadow.map = null
    this.bloom.enabled = q !== 'low'
    this.composer.setPixelRatio(pr)
    this.onResize()
  }

  setQuality(q: Quality) {
    this.quality = q
    this.applyQuality()
  }

  private onResize = () => {
    if (!this.renderer) return
    const w = this.container.clientWidth || 1
    const h = this.container.clientHeight || 1
    this.renderer.setSize(w, h)
    this.composer?.setSize(w, h)
    this.camera.aspect = w / h
    this.camera.fov = w / h < 0.9 ? 78 : 66
    this.camera.updateProjectionMatrix()
  }

  /* ----------------------------------------------------------------- */
  /* time of day                                                       */
  /* ----------------------------------------------------------------- */
  setTime(t: TimeOfDay) {
    this.tod = t
    this.tgt = PRESETS[t]
    this.envDirty = true
  }
  /** jump straight to a time of day (no transition) */
  snapTime(t: TimeOfDay) {
    this.tod = t
    this.snapTod(t)
    this.regenEnv()
  }
  private snapTod(t: TimeOfDay) {
    const p = PRESETS[t]
    for (const k of NUM) this.cur[k] = p[k]
    for (const k of COL) this.curC[k] = new THREE.Color(p[k])
    this.tgt = p
    this.applyEnv(0)
  }

  private applyEnv(dt: number) {
    const k = dt === 0 ? 1 : 1 - Math.exp(-dt * 1.5)
    let moving = false
    for (const n of NUM) {
      const d = this.tgt[n] - this.cur[n]
      if (Math.abs(d) > 1e-4) moving = true
      this.cur[n] += d * k
    }
    const tc = new THREE.Color()
    for (const c of COL) this.curC[c].lerp(tc.set(this.tgt[c]), k)
    const c = this.cur
    const sd = dirFrom(c.elev, c.az)
    const su = (this.sky.material as THREE.ShaderMaterial).uniforms
    for (const u of [su, (this.envSky.material as THREE.ShaderMaterial).uniforms]) {
      u.turbidity.value = c.turb
      u.rayleigh.value = c.ray
      u.mieCoefficient.value = c.mie
      u.mieDirectionalG.value = 0.82
      u.sunPosition.value.copy(sd)
    }
    this.sun.color.copy(this.curC.sunColor)
    this.sun.intensity = c.sunInt
    this.hemi.color.copy(this.curC.hemiSky)
    this.hemi.groundColor.copy(this.curC.hemiGround)
    this.fog.color.copy(this.curC.fog)
    this.fog.density = c.fogD
    ;(this.envGround.material as THREE.MeshBasicMaterial).color.copy(this.curC.bounce).multiplyScalar(0.5 + 0.7 * c.light)
    this.cloudU.uCover.value = c.cloud
    this.cloudU.uLight.value = c.light
    this.cloudU.uTint.value.copy(this.curC.sunColor).lerp(new THREE.Color('#ffffff'), 0.5)
    this.starU.uNight.value = smooth(0.4, 1, c.night)
    // emissive world features
    const n = c.night
    LAMP_GLASS.emissiveIntensity = n * 2.4
    M.glassLit.emissiveIntensity = n * 1.3 + 0.05
    M.glassBlue.emissiveIntensity = n * 0.9 + 0.12
    this.hall.skylight.emissiveIntensity = 0.15 + 1.4 * (1 - n)
    this.hall.lamps.emissiveIntensity = 0.7 + n * 0.6
    if (moving || dt === 0) this.envDirty = true
  }

  private regenEnv() {
    this.envRT?.dispose()
    this.envRT = this.pmrem.fromScene(this.envScene, 0.02)
    this.scene.environment = this.envRT.texture
    this.envDirty = false
  }

  private updateLighting(dt: number) {
    this.applyEnv(dt)
    this.envAcc += dt
    if (this.envDirty && this.envAcc > 0.22) {
      this.envAcc = 0
      this.regenEnv()
    }
    const c = this.cur
    // inside factor: smooth approach to the door, full inside the hall
    const F = AQ_F
    const hx = Math.abs(this.px) < 22 && this.pz < F.z(0, -1.2) && this.pz > F.z(0, -20.8)
    let tIn = 0
    if (hx) tIn = 1
    else if (Math.abs(this.px) < 7 && this.pz > F.z(0, -1.2) && this.pz < F.z(0, 9.4) && this.mode === 'walk') tIn = smooth(F.z(0, 9.4), F.z(0, 0.5), this.pz) * 0.55
    this.inside += (tIn - this.inside) * Math.min(1, dt * 3.5)
    if (this.mode === 'aerial') this.inside = 0
    const ins = this.inside
    const ld = dirFrom(c.lElev, c.lAz)
    // shadow rig follows the visitor
    const S = this.mode === 'aerial' ? 190 : this.shadowS
    const cx = this.mode === 'aerial' ? 0 : this.px
    const cz = this.mode === 'aerial' ? 0 : this.pz
    const texel = (S * 2) / this.sun.shadow.mapSize.x
    const sx = Math.round(cx / texel) * texel
    const sz = Math.round(cz / texel) * texel
    this.sun.target.position.set(sx, 0, sz)
    this.sun.position.set(sx + ld.x * 320, ld.y * 320, sz + ld.z * 320)
    const sc = this.sun.shadow.camera
    if (sc.right !== S) {
      sc.left = -S
      sc.right = S
      sc.top = S
      sc.bottom = -S
      sc.updateProjectionMatrix()
    }
    this.scene.environmentIntensity = c.env * (1 - 0.78 * ins)
    this.hemi.intensity = c.hemi * (1 - 0.6 * ins)
    this.renderer.toneMappingExposure = c.exposure * (1 + 0.45 * ins)
    this.sun.intensity *= 1 - 0.0 * ins
    // interior lights
    this.hall.tankLights.forEach((l) => (l.intensity = 120 * ins))
    this.hall.warmLights.forEach((l) => (l.intensity = 150 * ins))
    // nearest lamps light up at night
    this.lastLightSort -= dt
    if (this.lastLightSort <= 0) {
      this.lastLightSort = 0.4
      const ref = this.mode === 'aerial' ? new THREE.Vector3(0, 0, 40) : new THREE.Vector3(this.px, 0, this.pz)
      const sorted = [...this.ctx.lamps].sort((a, b) => Math.hypot(a.x - ref.x, a.z - ref.z) - Math.hypot(b.x - ref.x, b.z - ref.z))
      this.lampLights.forEach((l, i) => l.position.copy(sorted[i] ?? ref))
    }
    const night = smooth(0.15, 0.9, c.night)
    this.lampLights.forEach((l) => (l.intensity = 60 * night * (1 - ins)))
    this.grade.uniforms.uVig.value = 0.3 + 0.1 * night
    this.bloom.strength = 0.18 + 0.32 * night + 0.08 * ins
    this.bloom.threshold = 0.92 - 0.2 * night
    this.cloudU.uTime.value = this.time
    this.starU.uTime.value = this.time
    this.stars.position.copy(this.camera.position)
    this.clouds.position.copy(this.camera.position)
    this.sky.position.copy(this.camera.position)
    this.envGround.position.y = -0.5
  }

  /* ----------------------------------------------------------------- */
  /* input                                                             */
  /* ----------------------------------------------------------------- */
  private onKey = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement)?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA') return
    this.keys[e.code] = e.type === 'keydown'
    this.keys.Shift = e.shiftKey
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault()
  }
  private onBlur = () => {
    this.keys = {}
  }
  private onLockChange = () => {
    this.locked = document.pointerLockElement === this.renderer.domElement
    this.ev.onLock?.(this.locked)
  }

  private setupInput() {
    const el = this.renderer.domElement
    window.addEventListener('keydown', this.onKey)
    window.addEventListener('keyup', this.onKey)
    window.addEventListener('blur', this.onBlur)
    document.addEventListener('pointerlockchange', this.onLockChange)
    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture(e.pointerId)
      const rect = el.getBoundingClientRect()
      const touch = e.pointerType === 'touch'
      const hasJoy = [...this.pointers.values()].some((p) => p.kind === 'joy')
      const kind = touch && !hasJoy && e.clientX - rect.left < rect.width * 0.42 && e.clientY - rect.top > rect.height * 0.3 ? 'joy' : 'look'
      this.pointers.set(e.pointerId, { kind, x: e.clientX, y: e.clientY, ox: e.clientX, oy: e.clientY, t: performance.now(), moved: 0 })
      if (kind === 'joy') this.ev.onJoy?.({ active: true, ox: e.clientX - rect.left, oy: e.clientY - rect.top, x: 0, y: 0 })
    })
    el.addEventListener('pointermove', (e) => {
      const p = this.pointers.get(e.pointerId)
      const lockedMove = this.locked && e.pointerType === 'mouse'
      if (!p && !lockedMove) return
      if (this.mode !== 'walk' || this.flight) return
      if (p?.kind === 'joy') {
        const rect = el.getBoundingClientRect()
        const R = 56
        let dx = e.clientX - p.ox
        let dy = e.clientY - p.oy
        const L = Math.hypot(dx, dy)
        if (L > R) {
          dx = (dx / L) * R
          dy = (dy / L) * R
        }
        this.joy.x = dx / R
        this.joy.y = dy / R
        this.ev.onJoy?.({ active: true, ox: p.ox - rect.left, oy: p.oy - rect.top, x: dx, y: dy })
        return
      }
      const mx = lockedMove ? e.movementX : p ? e.clientX - p.x : 0
      const my = lockedMove ? e.movementY : p ? e.clientY - p.y : 0
      if (p) {
        p.moved += Math.abs(mx) + Math.abs(my)
        p.x = e.clientX
        p.y = e.clientY
      }
      const sens = e.pointerType === 'touch' ? 0.0042 : 0.0024
      this.yaw -= mx * sens
      this.pitch = clamp(this.pitch - my * sens, -1.3, 1.3)
    })
    const up = (e: PointerEvent) => {
      const p = this.pointers.get(e.pointerId)
      if (!p) return
      this.pointers.delete(e.pointerId)
      if (p.kind === 'joy') {
        this.joy.x = this.joy.y = 0
        this.ev.onJoy?.({ active: false, ox: 0, oy: 0, x: 0, y: 0 })
      } else if (e.pointerType === 'mouse' && p.moved < 5 && performance.now() - p.t < 400 && this.mode === 'walk' && !this.locked) {
        try {
          void (el.requestPointerLock as (() => Promise<void> | void) | undefined)?.call(el)
        } catch {
          /* pointer lock unavailable (e.g. sandboxed iframe) – drag-to-look still works */
        }
      }
    }
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
    el.addEventListener('contextmenu', (e) => e.preventDefault())
  }

  releaseLock() {
    if (document.pointerLockElement) document.exitPointerLock()
  }

  /* ----------------------------------------------------------------- */
  /* labels                                                            */
  /* ----------------------------------------------------------------- */
  private setupLabels() {
    for (const poi of POIS) {
      const el = document.createElement('button')
      el.className = 'artis-label'
      el.innerHTML = `<span class="artis-dot"></span><span class="artis-txt">${poi.name}</span>`
      el.style.pointerEvents = 'auto'
      el.addEventListener('click', (e) => {
        e.stopPropagation()
        this.goTo(poi.id)
        this.ev.onPoi?.(poi.id)
      })
      this.labelRoot.appendChild(el)
      this.labels.push({ poi, el })
    }
  }

  private updateLabels() {
    const w = this.container.clientWidth
    const h = this.container.clientHeight
    const v = new THREE.Vector3()
    for (const { poi, el } of this.labels) {
      v.set(poi.anchor[0], poi.anchor[1], poi.anchor[2])
      const d = this.camera.position.distanceTo(v)
      v.project(this.camera)
      const aerial = this.mode === 'aerial'
      const hideInside = this.inside > 0.5 && poi.id !== 'hall'
      let a = 1
      if (!aerial) a = smooth(7, 16, d) * (1 - smooth(110, 170, d))
      if (hideInside || (this.inside < 0.5 && poi.id === 'hall' && d > 32)) a = 0
      if (this.flight) a = 0
      const vis = v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05 && a > 0.02
      el.style.opacity = vis ? String(a) : '0'
      el.style.visibility = vis ? 'visible' : 'hidden'
      if (vis) el.style.transform = `translate(-50%,-50%) translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px)`
    }
  }

  /* ----------------------------------------------------------------- */
  /* movement                                                          */
  /* ----------------------------------------------------------------- */
  heightAt(x: number, z: number) {
    let y = 0
    for (const f of this.ctx.floors) {
      if (x < f.x0 || x > f.x1 || z < f.z0 || z > f.z1) continue
      let yy = f.y
      if (f.ramp) {
        const v = f.ramp.axis === 'x' ? x : z
        const t = clamp((v - f.ramp.from) / (f.ramp.to - f.ramp.from), 0, 1)
        yy = lerp(f.ramp.y0, f.ramp.y1, t)
      }
      if (yy > y) y = yy
    }
    return y
  }

  private blocked(x: number, z: number) {
    const R = 0.38
    if (x < -96.5 || x > 96.5 || z < -69.5 || z > 91.5) return true
    for (const s of this.ctx.solids) if (x > s.x0 - R && x < s.x1 + R && z > s.z0 - R && z < s.z1 + R) return true
    for (const p of this.ctx.posts) {
      const dx = x - p.x
      const dz = z - p.z
      if (dx * dx + dz * dz < (p.r + R) * (p.r + R)) return true
    }
    for (const b of this.ctx.blockers) if (b(x, z)) return true
    return false
  }

  private surface(): 'gravel' | 'paving' | 'grass' | 'indoor' | 'wood' {
    if (this.inside > 0.8) return 'indoor'
    const x = this.px, z = this.pz
    if (x > 44 && x < 58 && z > 8.6 && z < 11.4) return 'wood'
    if (z > 70) return 'paving'
    if (Math.hypot(x, z) < PLAZA_R) return 'paving'
    for (const p of PATHS) {
      for (let i = 0; i < p.pts.length - 1; i++) {
        const [ax, az] = p.pts[i]
        const [bx, bz] = p.pts[i + 1]
        const dx = bx - ax, dz = bz - az
        const t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz), 0, 1)
        if (Math.hypot(x - (ax + t * dx), z - (az + t * dz)) < p.w / 2) return p.kind
      }
    }
    if (z > -33 && z < -29 && Math.abs(x) < 36) return 'gravel'
    return 'grass'
  }

  private updateWalk(dt: number) {
    const k = this.keys
    let f = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0) - this.joy.y
    let s = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0) + this.joy.x
    const turn = (k.KeyQ ? 1 : 0) - (k.KeyE ? 1 : 0)
    this.yaw += turn * 1.8 * dt
    const L = Math.hypot(f, s)
    if (L > 1) {
      f /= L
      s /= L
    }
    const run = !!k.Shift || Math.hypot(this.joy.x, this.joy.y) > 0.95
    const speed = (run ? 6.4 : 3.2) * (this.inside > 0.8 ? 0.85 : 1)
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw)
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw)
    const tvx = (fx * f + rx * s) * speed
    const tvz = (fz * f + rz * s) * speed
    const a = 1 - Math.exp(-dt * 11)
    this.vx += (tvx - this.vx) * a
    this.vz += (tvz - this.vz) * a
    const dx = this.vx * dt
    const dz = this.vz * dt
    const ox = this.px, oz = this.pz
    if (!this.blocked(this.px + dx, this.pz)) this.px += dx
    if (!this.blocked(this.px, this.pz + dz)) this.pz += dz
    const moved = Math.hypot(this.px - ox, this.pz - oz)
    const sp = moved / Math.max(dt, 1e-4)
    this.stride += moved
    if (this.stride > (run ? 2.0 : 1.4)) {
      this.stride = 0
      this.amb.step(this.surface(), run)
    }
    this.bobPh += moved * 2.4
    const bob = Math.sin(this.bobPh) * 0.032 * Math.min(1, sp / 3)
    const ty = this.heightAt(this.px, this.pz) + EYE + bob
    this.py += (ty - this.py) * Math.min(1, dt * 14)
    this.camPlace()
  }

  private camPlace() {
    this.camera.position.set(this.px, this.py, this.pz)
    this.camera.rotation.set(this.pitch, this.yaw, 0)
  }

  /* ----------------------------------------------------------------- */
  /* navigation                                                        */
  /* ----------------------------------------------------------------- */
  goTo(id: string) {
    const poi = POIS.find((p) => p.id === id)
    if (!poi) return
    if (this.mode === 'aerial') {
      this.setMode('walk', true)
    }
    const [fx, fz] = poi.from
    const ey = this.heightAt(fx, fz) + EYE
    const yaw1 = Math.atan2(-(poi.look[0] - fx), -(poi.look[2] - fz))
    const dist = Math.hypot(poi.look[0] - fx, poi.look[2] - fz)
    const p1 = clamp(Math.atan2(poi.look[1] - ey, dist), -0.5, 0.6)
    this.flight = {
      t: 0, dur: clamp(Math.hypot(fx - this.px, fz - this.pz) / 28, 1.3, 3.2),
      from: new THREE.Vector3(this.px, this.py, this.pz), to: new THREE.Vector3(fx, ey, fz),
      yaw0: this.yaw, yaw1: this.yaw + angDiff(this.yaw, yaw1), p0: this.pitch, p1,
    }
    this.vx = this.vz = 0
  }

  private updateFlight(dt: number) {
    const f = this.flight!
    f.t += dt / f.dur
    const t = ease(clamp(f.t, 0, 1))
    this.px = lerp(f.from.x, f.to.x, t)
    this.pz = lerp(f.from.z, f.to.z, t)
    this.py = lerp(f.from.y, f.to.y, t) + Math.sin(Math.PI * t) * Math.min(6, Math.hypot(f.to.x - f.from.x, f.to.z - f.from.z) * 0.08)
    this.yaw = lerp(f.yaw0, f.yaw1, t)
    this.pitch = lerp(f.p0, f.p1, t)
    this.camPlace()
    if (f.t >= 1) this.flight = null
  }

  setMode(m: Mode, immediate = false) {
    if (m === this.mode) return
    const apply = () => {
      this.mode = m
      this.releaseLock()
      this.flight = null
      if (m === 'aerial') {
        this.lastWalk = { x: this.px, z: this.pz, yaw: this.yaw, pitch: this.pitch }
        this.controls.enabled = true
        this.camera.position.set(70, 120, 150)
        this.controls.target.set(0, 4, -8)
        this.camera.rotation.order = 'XYZ'
        this.controls.update()
      } else {
        this.controls.enabled = false
        this.camera.rotation.order = 'YXZ'
        if (!immediate) {
          this.px = this.lastWalk.x
          this.pz = this.lastWalk.z
          this.yaw = this.lastWalk.yaw
          this.pitch = this.lastWalk.pitch
        }
        this.py = this.heightAt(this.px, this.pz) + EYE
        this.camPlace()
      }
    }
    if (immediate) return apply()
    this.ev.onFade?.(true)
    setTimeout(() => {
      apply()
      setTimeout(() => this.ev.onFade?.(false), 60)
    }, 320)
  }

  startAudio() {
    this.amb.start()
  }
  setMuted(m: boolean) {
    this.amb.setMuted(m)
  }

  /* ----------------------------------------------------------------- */
  private loop = () => {
    if (this.disposed) return
    this.raf = requestAnimationFrame(this.loop)
    if (this.paused) return
    const now = performance.now()
    const dt = Math.min(0.05, (now - this.lastT) / 1000)
    this.lastT = now
    this.tick(dt)
  }

  paused = false
  private lastT = performance.now()

  /** debug / screenshot helper: advance the simulation and return the frame as a data URL */
  debugStep(n = 1, dt = 0.05) {
    this.paused = true
    for (let i = 0; i < n; i++) this.tick(dt)
    return this.renderer.domElement.toDataURL('image/png')
  }

  private tick(dt: number) {
    this.time += dt
    if (this.mode === 'walk') {
      if (this.flight) this.updateFlight(dt)
      else this.updateWalk(dt)
    } else {
      this.controls.update()
      this.px = this.camera.position.x
      this.pz = this.camera.position.z
    }
    for (const u of this.ctx.updaters) u(this.time, dt)
    this.updateLighting(dt)
    this.updateLabels()
    const street = smooth(62, 78, this.pz) * (this.mode === 'walk' ? 1 : 0.2)
    const pd = Math.hypot(this.px - POND.cx, this.pz - POND.cz)
    this.amb.update(dt, { inside: this.inside, street, pond: 1 - smooth(14, 55, pd), night: smooth(0.2, 0.9, this.cur.night) })
    this.composer.render()
    this.stateT -= dt
    if (this.stateT <= 0) {
      this.stateT = 0.08
      let poi: string | null = null
      let best = 26
      if (this.mode === 'walk') {
        for (const p of POIS) {
          if (p.id === 'hall' && this.inside < 0.7) continue
          if (p.id !== 'hall' && this.inside > 0.7) continue
          const d = Math.hypot(p.anchor[0] - this.px, p.anchor[2] - this.pz)
          if (d < best) {
            best = d
            poi = p.id
          }
        }
      }
      this.lastPoi = poi
      const yaw = this.mode === 'aerial' ? Math.atan2(-(this.controls.target.x - this.camera.position.x), -(this.controls.target.z - this.camera.position.z)) : this.yaw
      this.ev.onState?.({ x: this.px, z: this.pz, yaw, inside: this.inside, area: areaAt(this.px, this.pz), poi: this.lastPoi })
    }
  }

  isReady() {
    return this.ready
  }

  dispose() {
    this.disposed = true
    cancelAnimationFrame(this.raf)
    window.removeEventListener('keydown', this.onKey)
    window.removeEventListener('keyup', this.onKey)
    window.removeEventListener('blur', this.onBlur)
    document.removeEventListener('pointerlockchange', this.onLockChange)
    this.ro?.disconnect()
    this.releaseLock()
    this.amb.dispose()
    this.controls?.dispose()
    this.envRT?.dispose()
    this.pmrem?.dispose()
    this.composer?.dispose()
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.geometry) m.geometry.dispose()
    })
    this.renderer?.dispose()
    this.renderer?.domElement.remove()
    this.labelRoot?.remove()
  }

  /** for debugging / screenshots */
  debugSet(x: number, z: number, yaw: number, pitch: number) {
    this.px = x
    this.pz = z
    this.yaw = yaw
    this.pitch = pitch
    this.py = this.heightAt(x, z) + EYE
    this.camPlace()
  }
}

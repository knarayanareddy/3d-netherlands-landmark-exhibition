import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { Sky } from 'three/examples/jsm/objects/Sky.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { World, buildWorld } from './world'
import { EYE, FLOORS, PYLON_APO, PYLON_T, RISE, SHAFT_R, YC } from './showcube'
import { POI, POIS, LEVEL_NAMES } from './data'
import { clamp, setNightGlow } from './util'
import { TAU } from './util'

export type Mode = 'walk' | 'orbit'
export type TimeOfDay = 'day' | 'golden' | 'night'
export type Quality = 'high' | 'medium' | 'low'
export interface Prompt {
  up?: string
  down?: string
  hint?: string
}
export interface Events {
  onProgress?: (p: number, label: string) => void
  onPrompt?: (p: Prompt | null) => void
  onLevel?: (level: number, name: string) => void
  onMode?: (m: Mode) => void
  onPOI?: (id: string | null) => void
  onLock?: (locked: boolean) => void
  onQuality?: (q: Quality) => void
}

interface Env {
  elev: number
  az: number
  lElev: number
  lAz: number
  turb: number
  ray: number
  mie: number
  sunInt: number
  hemi: number
  exposure: number
  fogD: number
  night: number
  env: number
  cloud: number
  sunColor: string
  hemiSky: string
  hemiGround: string
  fog: string
}

const PRESETS: Record<TimeOfDay, Env> = {
  day: { elev: 46, az: -50, lElev: 46, lAz: -50, turb: 3.2, ray: 1.1, mie: 0.004, sunInt: 3.2, hemi: 0.5, exposure: 0.68, fogD: 0.00075, night: 0, env: 1, cloud: 0.5, sunColor: '#fff2df', hemiSky: '#bcd8f0', hemiGround: '#8a8c70', fog: '#c5d8e8' },
  golden: { elev: 7, az: -62, lElev: 7, lAz: -62, turb: 8, ray: 2.2, mie: 0.01, sunInt: 3.6, hemi: 0.5, exposure: 0.8, fogD: 0.00105, night: 0.35, env: 0.8, cloud: 0.55, sunColor: '#ffb06a', hemiSky: '#e0b49a', hemiGround: '#6f6048', fog: '#e7b999' },
  night: { elev: -4, az: -62, lElev: 40, lAz: 30, turb: 2, ray: 0.5, mie: 0.003, sunInt: 0.55, hemi: 0.22, exposure: 0.95, fogD: 0.0011, night: 1, env: 0.28, cloud: 0.15, sunColor: '#8fa8ff', hemiSky: '#2a3d70', hemiGround: '#10151f', fog: '#0d1731' },
}
const NUM = ['elev', 'az', 'lElev', 'lAz', 'turb', 'ray', 'mie', 'sunInt', 'hemi', 'exposure', 'fogD', 'night', 'env', 'cloud'] as const
const COL = ['sunColor', 'hemiSky', 'hemiGround', 'fog'] as const

const dirFrom = (elev: number, az: number) => {
  const e = (elev * Math.PI) / 180
  const a = (az * Math.PI) / 180
  return new THREE.Vector3(Math.cos(e) * Math.sin(a), Math.sin(e), Math.cos(e) * Math.cos(a))
}
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const angDiff = (a: number, b: number) => {
  let d = (b - a) % TAU
  if (d > Math.PI) d -= TAU
  if (d < -Math.PI) d += TAU
  return d
}

interface Flight {
  t: number
  dur: number
  fp: THREE.Vector3
  tp: THREE.Vector3
  fl: THREE.Vector3
  tl: THREE.Vector3
  arc: number
  done?: () => void
}
interface Climb {
  t: number
  dur: number
  from: number
  to: number
  sx: number
  sy: number
  sz: number
  syaw: number
  spitch: number
}
interface Seg {
  ax: number
  az: number
  bx: number
  bz: number
}

export class CubeExperience {
  private container: HTMLElement
  private ev: Events
  renderer: THREE.WebGLRenderer
  scene = new THREE.Scene()
  camera: THREE.PerspectiveCamera
  controls: OrbitControls
  private composer!: EffectComposer
  private gtao!: GTAOPass
  private bloom!: UnrealBloomPass
  private clock = new THREE.Clock()
  private sky = new Sky()
  private envSky = new Sky()
  private envScene = new THREE.Scene()
  private pmrem: THREE.PMREMGenerator
  private envRT: THREE.WebGLRenderTarget | null = null
  private sun: THREE.DirectionalLight
  private hemi: THREE.HemisphereLight
  private fog = new THREE.FogExp2('#c5d8e8', 0.00075)
  private stars!: THREE.Points
  private clouds!: THREE.Mesh
  private cloudU!: Record<string, THREE.IUniform>
  private lightDir = new THREE.Vector3(0, 1, 0)
  private cur: Record<string, number> = {}
  private curC: Record<string, THREE.Color> = {}
  private tgt: Env = PRESETS.day
  private envAcc = 0
  private envDirty = true
  world!: World
  private labelRoot: HTMLDivElement
  private labels: { poi: POI; el: HTMLButtonElement; world: THREE.Vector3 }[] = []

  mode: Mode = 'walk'
  level = 0
  private pos = new THREE.Vector2(-36, 0)
  private yaw = -Math.PI / 2
  private pitch = 0
  private vel = new THREE.Vector2()
  private bob = 0
  private keys: Record<string, boolean> = {}
  private flight: Flight | null = null
  private climb: Climb | null = null
  private locked = false
  private disposed = false
  private started = false
  private lastPrompt = ''
  private quality: Quality = 'high'
  private frames = 0
  private accDt = 0
  private wallSegs: Seg[] = []
  private joy = { id: -1, ox: 0, oy: 0, x: 0, y: 0 }
  private lookTouch = { id: -1, x: 0, y: 0 }
  private drag = { on: false, x: 0, y: 0 }
  private activePOI: string | null = null
  private ro: ResizeObserver
  private showCx = 0
  private showCz = 0
  private cosG = 1
  private sinG = 0
  private shadowSize = 0
  private ready = false
  private indoor = 0

  constructor(container: HTMLElement, ev: Events = {}) {
    this.container = container
    this.ev = ev
    const w = container.clientWidth || 1
    const h = container.clientHeight || 1
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75))
    this.renderer.setSize(w, h)
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    const cv = this.renderer.domElement
    cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;outline:none;touch-action:none'
    container.appendChild(cv)

    this.camera = new THREE.PerspectiveCamera(66, w / h, 0.05, 6000)
    this.camera.rotation.order = 'YXZ'
    this.scene.fog = this.fog
    this.scene.background = new THREE.Color('#c5d8e8')

    this.controls = new OrbitControls(this.camera, cv)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.07
    this.controls.minDistance = 8
    this.controls.maxDistance = 140
    this.controls.maxPolarAngle = Math.PI * 0.495
    this.controls.target.set(0, 6, 0)
    this.controls.enabled = false
    this.controls.autoRotateSpeed = 0.5

    // sky
    for (const s of [this.sky, this.envSky]) {
      s.scale.setScalar(4500)
      s.userData.noAO = true
    }
    this.scene.add(this.sky)
    this.envScene.add(this.envSky)
    this.pmrem = new THREE.PMREMGenerator(this.renderer)

    // lights
    this.hemi = new THREE.HemisphereLight('#bcd8f0', '#8a8c70', 0.55)
    this.scene.add(this.hemi)
    this.sun = new THREE.DirectionalLight('#fff2df', 3.4)
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(4096, 4096)
    this.sun.shadow.bias = -0.00025
    this.sun.shadow.normalBias = 0.035
    this.sun.shadow.radius = 2.5
    this.sun.shadow.camera.near = 1
    this.sun.shadow.camera.far = 600
    this.scene.add(this.sun, this.sun.target)

    // stars
    {
      const n = 1600
      const p = new Float32Array(n * 3)
      for (let i = 0; i < n; i++) {
        const u = Math.random() * 2 - 1
        const a = Math.random() * TAU
        const s = Math.sqrt(1 - u * u)
        const y = Math.abs(u)
        p[i * 3] = Math.cos(a) * s * 3800
        p[i * 3 + 1] = y * 3800 + 100
        p[i * 3 + 2] = Math.sin(a) * s * 3800
      }
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.BufferAttribute(p, 3))
      this.stars = new THREE.Points(g, new THREE.PointsMaterial({ color: '#ffffff', size: 3.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }))
      this.stars.frustumCulled = false
      this.stars.userData.noAO = true
      this.scene.add(this.stars)
    }
    this.buildClouds()

    for (const k of NUM) this.cur[k] = PRESETS.day[k]
    for (const k of COL) this.curC[k] = new THREE.Color(PRESETS.day[k])

    this.labelRoot = document.createElement('div')
    this.labelRoot.style.cssText = 'position:absolute;inset:0;overflow:hidden;pointer-events:none'
    container.appendChild(this.labelRoot)

    this.setupComposer(w, h)
    this.ro = new ResizeObserver(() => this.onResize())
    this.ro.observe(container)
    this.bindInput()
  }

  /* ------------------------------------------------------------------ setup */
  private setupComposer(w: number, h: number) {
    const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: this.quality === 'high' ? 4 : this.quality === 'medium' ? 2 : 0 })
    this.composer = new EffectComposer(this.renderer, rt)
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    this.gtao = new GTAOPass(this.scene, this.camera, w, h)
    this.gtao.updateGtaoMaterial({ radius: 0.9, distanceExponent: 1.4, thickness: 1.6, scale: 1.25, samples: 12, distanceFallOff: 1, screenSpaceRadius: false })
    this.gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, radiusExponent: 1, rings: 2, samples: 12 })
    this.gtao.blendIntensity = 0.9
    const ao: any = this.gtao
    ao.overrideVisibility = function () {
      const cache: Map<THREE.Object3D, boolean> = this._visibilityCache
      this.scene.traverse((o: any) => {
        cache.set(o, o.visible)
        if (o.isPoints || o.isLine) o.visible = false
        if (o.isMesh) {
          const m = Array.isArray(o.material) ? o.material[0] : o.material
          if (o.userData.noAO || m?.userData?.noAO || m?.transparent || m?.alphaTest > 0) o.visible = false
        }
      })
    }
    this.composer.addPass(this.gtao)
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.18, 0.7, 1.0)
    this.composer.addPass(this.bloom)
    this.composer.addPass(new OutputPass())
    this.applyQuality()
  }

  private applyQuality() {
    const q = this.quality
    this.gtao.enabled = q === 'high'
    this.bloom.enabled = q !== 'low'
    const rtSamples = q === 'high' ? 4 : q === 'medium' ? 2 : 0
    for (const rt of [this.composer.renderTarget1, this.composer.renderTarget2]) {
      if (rt.samples !== rtSamples) {
        rt.samples = rtSamples
        rt.dispose()
      }
    }
    const sz = q === 'high' ? 4096 : q === 'medium' ? 2048 : 1024
    if (this.sun.shadow.mapSize.x !== sz) {
      this.sun.shadow.mapSize.set(sz, sz)
      this.sun.shadow.map?.dispose()
      this.sun.shadow.map = null
    }
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, q === 'high' ? 1.75 : q === 'medium' ? 1.25 : 1))
    this.onResize()
  }

  private buildClouds() {
    this.cloudU = {
      time: { value: 0 },
      sunDir: { value: new THREE.Vector3(0, 1, 0) },
      sunColor: { value: new THREE.Color('#fff') },
      ambient: { value: new THREE.Color('#9db4cc') },
      cover: { value: 0.5 },
      night: { value: 0 },
    }
    const mat = new THREE.ShaderMaterial({
      uniforms: this.cloudU,
      transparent: true,
      depthWrite: false,
      fog: false,
      side: THREE.DoubleSide,
      vertexShader: /* glsl */ `
        varying vec3 vW;
        void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vW;
        uniform float time; uniform vec3 sunDir; uniform vec3 sunColor; uniform vec3 ambient; uniform float cover; uniform float night;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
        float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
          return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
        float fbm(vec2 p){ float a=0.5, s=0.0; for(int i=0;i<6;i++){ s+=a*noise(p); p=p*2.03+vec2(11.3,7.1); a*=0.5; } return s; }
        void main(){
          vec3 d = normalize(vW - cameraPosition);
          if (d.y < 0.015) discard;
          vec2 uv = vW.xz / 1800.0 + vec2(time*0.004, time*0.0016);
          float n = fbm(uv*1.6);
          float c = smoothstep(1.0-cover, 1.0-cover+0.32, n);
          float horizon = smoothstep(0.015, 0.22, d.y);
          float a = c * horizon;
          // self-shadowing: sample towards the sun
          float n2 = fbm(uv*1.6 + sunDir.xz*0.05);
          float shade = clamp(0.5 + (n - n2) * 4.0, 0.0, 1.0);
          float lit = clamp(sunDir.y*1.2+0.25, 0.0, 1.0);
          vec3 col = mix(ambient*0.75, sunColor*1.15 + ambient*0.2, shade*lit);
          col = mix(col, ambient*0.12, night*0.85);
          gl_FragColor = vec4(col, a*0.92);
        }
      `,
    })
    this.clouds = new THREE.Mesh(new THREE.PlaneGeometry(14000, 14000), mat)
    this.clouds.rotation.x = -Math.PI / 2
    this.clouds.position.y = 1400
    this.clouds.renderOrder = -1
    this.clouds.frustumCulled = false
    this.clouds.userData.noAO = true
    this.scene.add(this.clouds)
  }

  /** Build the world (async, reports progress). */
  async init() {
    const tick = () => new Promise((r) => setTimeout(r, 16))
    this.ev.onProgress?.(0.02, 'Preparing renderer')
    await tick()
    if (this.disposed) return
    const world = buildWorld((p, l) => this.ev.onProgress?.(p, l))
    this.world = world
    this.scene.add(world.group)
    await tick()
    if (this.disposed) return
    const g = world.show.group
    this.showCx = g.position.x
    this.showCz = g.position.z
    this.cosG = Math.cos(g.rotation.y)
    this.sinG = Math.sin(g.rotation.y)
    this.buildWallSegments()
    this.buildLabels()
    this.ev.onProgress?.(0.92, 'Baking sky reflections')
    await tick()
    this.applyEnv(true)
    // warm up shader compilation
    this.renderer.compile(this.scene, this.camera)
    this.ready = true
    this.ev.onProgress?.(1, 'Ready')
    this.renderer.setAnimationLoop(() => this.frame())
  }

  /* ------------------------------------------------------------------ show-cube coordinate helpers */
  private toLocal(wx: number, wz: number): [number, number] {
    const dx = wx - this.showCx
    const dz = wz - this.showCz
    return [dx * this.cosG - dz * this.sinG, dx * this.sinG + dz * this.cosG]
  }
  private toWorld(lx: number, lz: number): [number, number] {
    return [this.showCx + lx * this.cosG + lz * this.sinG, this.showCz - lx * this.sinG + lz * this.cosG]
  }

  private buildWallSegments() {
    const sc = this.world.show
    const a0 = sc.a0
    const Rc = (PYLON_APO - PYLON_T / 2) / Math.cos(Math.PI / 6)
    const corners: [number, number][] = []
    for (let i = 0; i < 6; i++) {
      const a = a0 + Math.PI / 6 + (i * Math.PI) / 3
      corners.push(this.toWorld(Math.cos(a) * Rc, Math.sin(a) * Rc))
    }
    const doorK = Math.round((sc.doorAng - a0) / (Math.PI / 3))
    const apoC = PYLON_APO - PYLON_T / 2
    for (let k = 0; k < 6; k++) {
      const A = corners[(k + 5) % 6]
      const B = corners[k]
      if (k === ((doorK % 6) + 6) % 6) {
        const M = this.toWorld(Math.cos(sc.doorAng) * apoC, Math.sin(sc.doorAng) * apoC)
        const L = Math.hypot(B[0] - A[0], B[1] - A[1])
        const tx = (B[0] - A[0]) / L
        const tz = (B[1] - A[1]) / L
        const gap = 0.52
        this.wallSegs.push({ ax: A[0], az: A[1], bx: M[0] - tx * gap, bz: M[1] - tz * gap })
        this.wallSegs.push({ ax: M[0] + tx * gap, az: M[1] + tz * gap, bx: B[0], bz: B[1] })
      } else this.wallSegs.push({ ax: A[0], az: A[1], bx: B[0], bz: B[1] })
    }
  }

  private buildLabels() {
    const sc = this.world.show
    for (const poi of POIS) {
      const el = document.createElement('button')
      el.className = 'poi-label'
      el.innerHTML = `<span class="poi-dot"></span><span class="poi-text">${poi.title}</span>`
      el.style.cssText = 'position:absolute;left:0;top:0;pointer-events:auto;display:none'
      el.addEventListener('click', (e) => {
        e.stopPropagation()
        this.focusPOI(poi.id)
      })
      this.labelRoot.appendChild(el)
      const w = new THREE.Vector3()
      if (poi.local) {
        let [lx, ly, lz] = poi.pos
        if (poi.level !== undefined && poi.level > 0) {
          // interior level markers hover over the stair opening
          ly = FLOORS[poi.level] + (poi.level === 3 ? 1.5 : 1.9)
          ;[lx, lz] = [0.0, 0.0]
          const off = 1.55
          lx = off * Math.cos(sc.stair.theta0 + Math.PI)
          lz = off * Math.sin(sc.stair.theta0 + Math.PI)
        } else if (poi.id === 'kijk') {
          const d = sc.anchors.door
          lx = d.x
          lz = d.z
          ly = 2.6
        } else if (poi.id === 'hall') {
          lx = Math.cos(sc.doorAng + Math.PI) * 1.1
          lz = Math.sin(sc.doorAng + Math.PI) * 1.1
          ly = 2.0
        }
        const [wx, wz] = this.toWorld(lx, lz)
        w.set(wx, ly, wz)
      } else w.set(...poi.pos)
      this.labels.push({ poi, el, world: w })
    }
  }

  /* ------------------------------------------------------------------ environment */
  setTime(t: TimeOfDay) {
    this.tgt = PRESETS[t]
  }

  private stepEnv(dt: number) {
    const k = 1 - Math.exp(-dt * 2.4)
    let moving = false
    for (const n of NUM) {
      const d = this.tgt[n] - this.cur[n]
      if (Math.abs(d) > 1e-4 * (n === 'fogD' || n === 'mie' ? 0.01 : 1)) moving = true
      this.cur[n] += d * k
    }
    const tc = new THREE.Color()
    for (const n of COL) {
      tc.set(this.tgt[n])
      this.curC[n].lerp(tc, k)
    }
    if (moving) {
      this.applyEnv(false)
      this.envAcc += dt
      if (this.envAcc > 0.4) {
        this.envAcc = 0
        this.regenEnv()
      }
      this.envDirty = true
    } else if (this.envDirty) {
      this.applyEnv(true)
      this.envDirty = false
    }
  }

  private applyEnv(regen: boolean) {
    const e = this.cur
    const d = dirFrom(e.elev, e.az)
    for (const s of [this.sky, this.envSky]) {
      const u = s.material.uniforms
      u.sunPosition.value.copy(d)
      u.turbidity.value = e.turb
      u.rayleigh.value = e.ray
      u.mieCoefficient.value = e.mie
      u.mieDirectionalG.value = 0.8
    }
    this.lightDir.copy(dirFrom(e.lElev, e.lAz))
    this.sun.color.copy(this.curC.sunColor)
    this.sun.intensity = e.sunInt
    this.hemi.intensity = e.hemi
    this.hemi.color.copy(this.curC.hemiSky)
    this.hemi.groundColor.copy(this.curC.hemiGround)
    this.renderer.toneMappingExposure = e.exposure
    this.fog.color.copy(this.curC.fog)
    this.fog.density = e.fogD
    ;(this.scene.background as THREE.Color).copy(this.curC.fog)
    this.scene.environmentIntensity = e.env
    setNightGlow(e.night)
    this.world?.setNight(e.night)
    ;(this.stars.material as THREE.PointsMaterial).opacity = clamp((e.night - 0.5) * 2, 0, 1)
    const cu = this.cloudU
    cu.sunDir.value.copy(this.lightDir)
    cu.sunColor.value.copy(this.curC.sunColor)
    cu.ambient.value.copy(this.curC.hemiSky)
    cu.cover.value = e.cloud
    cu.night.value = e.night
    this.bloom.strength = 0.14 + e.night * 0.5
    this.bloom.threshold = 1.0 - e.night * 0.25
    this.bloom.radius = 0.6
    // interior lights: always some on, brighter at night
    if (this.world) for (const l of this.world.show.lights) l.light.intensity = l.base * (0.45 + 0.75 * e.night)
    if (regen) this.regenEnv()
  }

  private regenEnv() {
    const rt = this.pmrem.fromScene(this.envScene, 0, 0.1, 5000)
    this.scene.environment = rt.texture
    this.envRT?.dispose()
    this.envRT = rt
  }

  setQuality(q: Quality) {
    if (q === this.quality) return
    this.quality = q
    this.applyQuality()
    this.ev.onQuality?.(q)
  }

  /* ------------------------------------------------------------------ input */
  private onResize = () => {
    const w = this.container.clientWidth || 1
    const h = this.container.clientHeight || 1
    this.renderer.setSize(w, h)
    this.composer.setSize(w, h)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  private bindInput() {
    const el = this.renderer.domElement
    window.addEventListener('keydown', this.keyDown)
    window.addEventListener('keyup', this.keyUp)
    window.addEventListener('blur', () => (this.keys = {}))
    document.addEventListener('pointerlockchange', this.lockChange)
    document.addEventListener('mousemove', this.mouseMove)
    el.addEventListener('pointerdown', (e) => {
      if (this.mode !== 'walk') return
      if (e.pointerType === 'touch') {
        const r = el.getBoundingClientRect()
        if (e.clientX - r.left < r.width * 0.45 && this.joy.id < 0) {
          this.joy = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: 0, y: 0 }
        } else if (this.lookTouch.id < 0) {
          this.lookTouch = { id: e.pointerId, x: e.clientX, y: e.clientY }
        }
        el.setPointerCapture(e.pointerId)
        return
      }
      this.drag = { on: true, x: e.clientX, y: e.clientY }
      if (!this.locked && this.started && !this.flight && !this.climb) {
        try {
          const p: any = el.requestPointerLock?.()
          p?.catch?.(() => {})
        } catch {
          /* fall back to drag-look */
        }
      }
    })
    el.addEventListener('pointermove', (e) => {
      if (this.mode !== 'walk' || this.flight || this.climb) return
      if (e.pointerType === 'touch') {
        if (e.pointerId === this.joy.id) {
          this.joy.x = clamp((e.clientX - this.joy.ox) / 50, -1, 1)
          this.joy.y = clamp((e.clientY - this.joy.oy) / 50, -1, 1)
        } else if (e.pointerId === this.lookTouch.id) {
          this.yaw -= (e.clientX - this.lookTouch.x) * 0.005
          this.pitch = clamp(this.pitch - (e.clientY - this.lookTouch.y) * 0.005, -1.35, 1.35)
          this.lookTouch.x = e.clientX
          this.lookTouch.y = e.clientY
        }
        return
      }
      if (this.drag.on && !this.locked && e.buttons & 1) {
        this.yaw -= (e.clientX - this.drag.x) * 0.0032
        this.pitch = clamp(this.pitch - (e.clientY - this.drag.y) * 0.0032, -1.35, 1.35)
        this.drag.x = e.clientX
        this.drag.y = e.clientY
      }
    })
    const up = (e: PointerEvent) => {
      this.drag.on = false
      if (e.pointerId === this.joy.id) this.joy = { id: -1, ox: 0, oy: 0, x: 0, y: 0 }
      if (e.pointerId === this.lookTouch.id) this.lookTouch.id = -1
    }
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
    this.controls.addEventListener('start', () => (this.controls.autoRotate = false))
  }

  private lockChange = () => {
    this.locked = document.pointerLockElement === this.renderer.domElement
    this.ev.onLock?.(this.locked)
  }
  private mouseMove = (e: MouseEvent) => {
    if (!this.locked || this.mode !== 'walk' || this.flight || this.climb) return
    this.yaw -= e.movementX * 0.0022
    this.pitch = clamp(this.pitch - e.movementY * 0.0022, -1.35, 1.35)
  }
  private keyDown = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return
    if (this.keys[e.code]) return
    this.keys[e.code] = true
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code) && this.mode === 'walk') e.preventDefault()
    if (e.code === 'KeyE') this.stairs(1)
    if (e.code === 'KeyQ') this.stairs(-1)
  }
  private keyUp = (e: KeyboardEvent) => {
    this.keys[e.code] = false
  }

  releasePointer() {
    if (document.pointerLockElement) document.exitPointerLock()
  }

  /* ------------------------------------------------------------------ public controls */
  start(mode: Mode) {
    this.started = true
    this.setMode(mode, true)
  }

  setMode(m: Mode, instant = false) {
    if (m === this.mode && !instant) return
    this.mode = m
    this.releasePointer()
    this.climb = null
    if (m === 'orbit') {
      if (this.level > 0) this.exitCube()
      const from = this.camera.position.clone()
      const to = new THREE.Vector3(44, 17, 50)
      const look = new THREE.Vector3(0, 6, 0)
      this.controls.enabled = false
      if (instant) {
        this.camera.position.copy(to)
        this.camera.lookAt(look)
        this.controls.target.copy(look)
        this.controls.enabled = true
        this.controls.autoRotate = true
        this.controls.update()
      } else {
        this.startFlight(to, look, 2.4, () => {
          this.controls.target.copy(look)
          this.controls.enabled = true
          this.controls.autoRotate = true
        })
        void from
      }
    } else {
      this.controls.enabled = false
      this.controls.autoRotate = false
      if (instant) {
        this.pos.set(-36, 0)
        this.yaw = -Math.PI / 2
        this.pitch = 0.02
        this.level = 0
        this.placeCamera()
      } else {
        // fly down to the street in front of the door
        const door = this.world.show.anchors.door
        const [dx, dz] = this.toWorld(door.x * 1.8, door.z * 1.8)
        const eye = new THREE.Vector3(dx, EYE[0], dz)
        const look = new THREE.Vector3(this.showCx, 3.5, this.showCz)
        this.startFlight(eye, look, 2.6, () => {
          this.pos.set(eye.x, eye.z)
          const d = look.clone().sub(eye)
          this.yaw = Math.atan2(-d.x, -d.z)
          this.pitch = 0.1
        })
      }
    }
    this.ev.onMode?.(m)
    this.setLevel(0)
  }

  private exitCube() {
    const door = this.world.show.anchors.door
    const [dx, dz] = this.toWorld(door.x * 1.7, door.z * 1.7)
    this.pos.set(dx, dz)
    this.level = 0
  }

  private setLevel(l: number) {
    this.level = l
    this.ev.onLevel?.(l, LEVEL_NAMES[l])
  }

  private startFlight(tp: THREE.Vector3, tl: THREE.Vector3, dur: number, done?: () => void) {
    const fp = this.camera.position.clone()
    const dir = new THREE.Vector3()
    this.camera.getWorldDirection(dir)
    const fl = this.flight ? this.flight.tl.clone().lerp(this.flight.fl, 0) : fp.clone().addScaledVector(dir, 20)
    this.controls.enabled = false
    this.controls.autoRotate = false
    this.flight = { t: 0, dur, fp, tp, fl, tl, arc: clamp(fp.distanceTo(tp) * 0.1, 0, 20), done }
  }

  focusPOI(id: string) {
    const lab = this.labels.find((l) => l.poi.id === id)
    if (!lab) return
    this.activePOI = id
    this.ev.onPOI?.(id)
    const poi = lab.poi
    if (!poi.view || this.level > 0) return
    if (this.mode === 'orbit') {
      const t = lab.world.clone()
      this.startFlight(new THREE.Vector3(t.x + 22, Math.max(8, t.y + 4), t.z + 26), t, 2.2, () => {
        this.controls.target.copy(t)
        this.controls.enabled = true
        this.controls.autoRotate = false
      })
      return
    }
    const eye = new THREE.Vector3(poi.view.pos[0], EYE[0], poi.view.pos[1])
    const look = new THREE.Vector3(...poi.view.look)
    this.startFlight(eye, look, 2.4, () => {
      this.pos.set(eye.x, eye.z)
      const d = look.clone().sub(eye)
      this.yaw = Math.atan2(-d.x, -d.z)
      this.pitch = clamp(Math.atan2(d.y - EYE[0], Math.hypot(d.x, d.z)), -0.9, 0.9)
    })
  }

  closePOI() {
    this.activePOI = null
    this.ev.onPOI?.(null)
  }

  /** Teleport (debug / deep link). */
  teleport(level: number, x: number, z: number, yaw: number, pitch = 0) {
    this.climb = null
    this.flight = null
    this.mode = 'walk'
    this.controls.enabled = false
    this.started = true
    this.pos.set(x, z)
    this.yaw = yaw
    this.pitch = pitch
    this.setLevel(level)
    this.placeCamera()
  }

  /* ------------------------------------------------------------------ stairs */
  private nearAxis(): number {
    const [lx, lz] = this.toLocal(this.pos.x, this.pos.y)
    return Math.hypot(lx, lz)
  }

  private canClimb(dir: number) {
    if (this.mode !== 'walk' || this.flight || this.climb) return false
    const d = this.nearAxis()
    if (this.level === 0) return dir > 0 && d < 2.3
    if (this.level === 3) return dir < 0
    return d < 2.7
  }

  stairs(dir: number) {
    if (!this.canClimb(dir)) return
    this.goLevel(this.level + dir)
  }

  /** Jump to a level from anywhere: place the visitor beside the stair, then glide. */
  visitLevel(to: number) {
    if (this.mode !== 'walk' || this.flight || this.climb || to === this.level) return
    const thr = this.level === 0 ? 2.3 : 2.7
    if (this.nearAxis() > thr) {
      const h = FLOORS[this.level]
      const [cx, cz] = this.helix(h)
      const r = this.level === 0 ? 1.3 : this.level === 3 ? 0 : 1.6
      const [wx, wz] = this.toWorld(cx * r, cz * r)
      this.pos.set(wx, wz)
      this.vel.set(0, 0)
      const d = this.toWorldDir(-cx, -cz)
      this.yaw = Math.atan2(-d[0], -d[1])
      this.pitch = 0
    }
    this.goLevel(to)
  }

  /** Glide along the spiral to any level 0..3. */
  goLevel(to: number) {
    to = clamp(Math.round(to), 0, 3)
    if (to === this.level || this.climb || this.mode !== 'walk') return
    const from = this.level
    const eyeY = FLOORS[from] + EYE[from]
    this.releasePointer()
    this.climb = {
      t: 0,
      dur: 1.6 + Math.abs(to - from) * 1.3,
      from,
      to,
      sx: this.pos.x,
      sy: eyeY,
      sz: this.pos.y,
      syaw: this.yaw,
      spitch: this.pitch,
    }
  }

  private helix(h: number): [number, number] {
    const st = this.world.show.stair
    const a = st.theta0 + (h / st.rise) * st.da
    return [Math.cos(a), Math.sin(a)]
  }

  private stepClimb(dt: number) {
    const c = this.climb!
    c.t += dt / c.dur
    const u = Math.min(1, c.t)
    const hs = FLOORS[c.from]
    const he = FLOORS[c.to]
    const up = he > hs
    const sc = this.world.show
    const eyeS = c.sy
    const eyeE = he + EYE[c.to]
    const R = 0.6
    const a = 0.12
    const b = 0.88
    // helix endpoints (local → world)
    const hp = (h: number, r = R) => {
      const [cx, cz] = this.helix(h)
      const [wx, wz] = this.toWorld(cx * r, cz * r)
      return new THREE.Vector3(wx, 0, wz)
    }
    const p = new THREE.Vector3()
    let yaw = c.syaw
    let pitch = c.spitch
    // landing point
    const landR = c.to === 3 ? 0.0 : c.to === 0 ? 1.3 : 1.6
    const landLocal = this.helix(he)
    const [lwx, lwz] = this.toWorld(landLocal[0] * landR, landLocal[1] * landR)
    const outward = this.toWorldDir(landLocal[0], landLocal[1])
    const landYaw = c.to === 0 ? Math.atan2(-Math.cos(sc.doorAng) * 0, 0) : 0
    void landYaw
    let endYaw: number
    if (c.to === 0) {
      const dd = this.toWorldDir(Math.cos(sc.doorAng), Math.sin(sc.doorAng))
      endYaw = Math.atan2(-dd[0], -dd[1])
    } else if (c.to === 3) {
      const dd = this.toWorldDir(Math.cos(sc.a0 + 0.52), Math.sin(sc.a0 + 0.52))
      endYaw = Math.atan2(-dd[0], -dd[1])
    } else endYaw = Math.atan2(-outward[0], -outward[1])

    const tangentYaw = (h: number) => {
      const [cx, cz] = this.helix(h)
      let tx = -cz
      let tz = cx
      if (!up) {
        tx = -tx
        tz = -tz
      }
      const w = this.toWorldDir(tx, tz)
      return Math.atan2(-w[0], -w[1])
    }

    if (u < a) {
      const k = ease(u / a)
      const e = hp(hs)
      p.set(c.sx + (e.x - c.sx) * k, eyeS, c.sz + (e.z - c.sz) * k)
      const ty = tangentYaw(hs)
      yaw = c.syaw + angDiff(c.syaw, ty) * k
      pitch = c.spitch * (1 - k) + (up ? 0.12 : -0.15) * k
    } else if (u < b) {
      const k = (u - a) / (b - a)
      const ke = ease(k)
      const h = hs + (he - hs) * ke
      const e = hp(h)
      const eye = eyeS + (eyeE - eyeS) * ke
      p.set(e.x, eye, e.z)
      yaw = tangentYaw(h)
      pitch = up ? 0.12 : -0.15
    } else {
      const k = ease((u - b) / (1 - b))
      const e = hp(he)
      p.set(e.x + (lwx - e.x) * k, eyeE, e.z + (lwz - e.z) * k)
      const ty = tangentYaw(he)
      yaw = ty + angDiff(ty, endYaw) * k
      pitch = (up ? 0.12 : -0.15) * (1 - k)
    }
    this.camera.position.copy(p)
    this.camera.rotation.set(pitch, yaw, 0)
    if (c.t >= 1) {
      this.pos.set(lwx, lwz)
      this.yaw = endYaw
      this.pitch = 0
      this.climb = null
      this.vel.set(0, 0)
      this.setLevel(c.to)
    }
  }

  private toWorldDir(lx: number, lz: number): [number, number] {
    return [lx * this.cosG + lz * this.sinG, -lx * this.sinG + lz * this.cosG]
  }

  /* ------------------------------------------------------------------ walking */
  private pushCircle(p: THREE.Vector2, cx: number, cz: number, r: number) {
    const dx = p.x - cx
    const dz = p.y - cz
    const d2 = dx * dx + dz * dz
    if (d2 < r * r) {
      const d = Math.sqrt(d2) || 1e-4
      p.x = cx + (dx / d) * r
      p.y = cz + (dz / d) * r
    }
  }

  private pushSeg(p: THREE.Vector2, s: Seg, r: number) {
    const ex = s.bx - s.ax
    const ez = s.bz - s.az
    const L2 = ex * ex + ez * ez
    let t = ((p.x - s.ax) * ex + (p.y - s.az) * ez) / L2
    t = clamp(t, 0, 1)
    this.pushCircle(p, s.ax + ex * t, s.az + ez * t, r)
  }

  private collide(p: THREE.Vector2) {
    const PR = 0.24
    if (this.level === 0) {
      const b = this.world.bounds
      p.x = clamp(p.x, b.minX, b.maxX)
      p.y = clamp(p.y, b.minZ, b.maxZ)
      for (const c of this.world.circles) {
        if (Math.abs(p.x - c.x) < c.r + PR && Math.abs(p.y - c.z) < c.r + PR) this.pushCircle(p, c.x, c.z, c.r + PR)
      }
      if (Math.hypot(p.x - this.showCx, p.y - this.showCz) < 3.4) {
        for (const s of this.wallSegs) this.pushSeg(p, s, 0.1 + PR)
        // stair column footprint inside the hall
        this.pushCircle(p, this.showCx, this.showCz, 1.02)
      }
      return
    }
    const sc = this.world.show
    let [lx, lz] = this.toLocal(p.x, p.y)
    const v = new THREE.Vector2(lx, lz)
    if (this.level === 3) {
      const d = v.length()
      if (d > 0.5) v.multiplyScalar(0.5 / d)
    } else {
      for (let it = 0; it < 3; it++) {
        for (const pl of sc.planes[this.level]) {
          const d = v.x * pl.nx + v.y * pl.nz - (pl.c - 0.26)
          if (d > 0) {
            v.x -= pl.nx * d
            v.y -= pl.nz * d
          }
        }
        this.pushCircle(v, 0, 0, 1.28)
        for (const o of sc.obbs[this.level]) {
          const c = Math.cos(o.rot)
          const s = Math.sin(o.rot)
          const dx = v.x - o.x
          const dz = v.y - o.z
          // inverse rotate into box frame (rotation about Y)
          const bx = dx * c - dz * s
          const bz = dx * s + dz * c
          const hx = o.hx + PR * 0.8
          const hz = o.hz + PR * 0.8
          if (Math.abs(bx) < hx && Math.abs(bz) < hz) {
            const px = hx - Math.abs(bx)
            const pz = hz - Math.abs(bz)
            let nbx = bx
            let nbz = bz
            if (px < pz) nbx = Math.sign(bx || 1) * hx
            else nbz = Math.sign(bz || 1) * hz
            v.x = o.x + nbx * c + nbz * s
            v.y = o.z - nbx * s + nbz * c
          }
        }
      }
    }
    ;[lx, lz] = [v.x, v.y]
    const [wx, wz] = this.toWorld(lx, lz)
    p.set(wx, wz)
  }

  private walk(dt: number) {
    const k = this.keys
    let f = (k['KeyW'] || k['ArrowUp'] ? 1 : 0) - (k['KeyS'] || k['ArrowDown'] ? 1 : 0)
    let s = (k['KeyD'] ? 1 : 0) - (k['KeyA'] ? 1 : 0)
    if (k['ArrowLeft']) this.yaw += dt * 1.8
    if (k['ArrowRight']) this.yaw -= dt * 1.8
    if (this.joy.id >= 0) {
      f += -this.joy.y
      s += this.joy.x
    }
    const len = Math.hypot(f, s)
    if (len > 1) {
      f /= len
      s /= len
    }
    const run = k['ShiftLeft'] || k['ShiftRight']
    const inside = this.level > 0 || Math.hypot(this.pos.x - this.showCx, this.pos.y - this.showCz) < 2.1
    const speed = (inside ? 1.7 : 2.5) * (run ? 1.9 : 1)
    const fx = -Math.sin(this.yaw)
    const fz = -Math.cos(this.yaw)
    const tx = fx * f + -fz * s
    const tz = fz * f + fx * s
    const accel = 1 - Math.exp(-dt * 10)
    this.vel.x += (tx * speed - this.vel.x) * accel
    this.vel.y += (tz * speed - this.vel.y) * accel
    this.pos.x += this.vel.x * dt
    this.pos.y += this.vel.y * dt
    this.collide(this.pos)
    const sp = this.vel.length()
    this.bob += dt * sp * 2.6
    this.camY = (Math.sin(this.bob) * 0.018 * Math.min(1, sp / 2)) as number
  }
  private camY = 0

  private placeCamera() {
    this.camera.position.set(this.pos.x, FLOORS[this.level] + EYE[this.level] + this.camY, this.pos.y)
    this.camera.rotation.set(this.pitch, this.yaw, 0)
  }

  /* ------------------------------------------------------------------ prompts */
  private updatePrompt() {
    let pr: Prompt | null = null
    if (this.mode === 'walk' && !this.flight && !this.climb && this.started) {
      const d = this.nearAxis()
      if (this.level === 0) {
        if (d < 2.3) pr = { up: 'Climb the spiral stair' }
        else if (d < 7.5) pr = { hint: 'The door of the Kijk-Kubus is open — walk in' }
      } else if (this.level === 3) pr = { down: 'Go back down' }
      else if (d < 2.7) pr = { up: this.level < 3 ? `Up to ${LEVEL_NAMES[this.level + 1].split(' · ')[0]}` : undefined, down: `Down to ${this.level === 1 ? 'Entrance hall' : LEVEL_NAMES[this.level - 1].split(' · ')[0]}` }
      else pr = { hint: 'Walk to the stair opening to change level' }
    }
    const key = JSON.stringify(pr)
    if (key !== this.lastPrompt) {
      this.lastPrompt = key
      this.ev.onPrompt?.(pr)
    }
  }

  /* ------------------------------------------------------------------ frame */
  private frame() {
    if (this.disposed) return
    const dt = Math.min(this.clock.getDelta(), 0.05)
    const t = this.clock.elapsedTime
    this.stepEnv(dt)
    this.world.update(t, dt)
    this.cloudU.time.value = t
    this.clouds.position.set(this.camera.position.x, 1400, this.camera.position.z)
    this.sky.position.copy(this.camera.position)
    this.stars.position.copy(this.camera.position)

    if (this.flight) {
      const f = this.flight
      f.t += dt / f.dur
      const k = ease(Math.min(1, f.t))
      const pos = f.fp.clone().lerp(f.tp, k)
      pos.y += Math.sin(Math.PI * k) * f.arc
      this.camera.position.copy(pos)
      const look = f.fl.clone().lerp(f.tl, k)
      this.camera.lookAt(look)
      if (f.t >= 1) {
        this.flight = null
        f.done?.()
      }
    } else if (this.climb) {
      this.stepClimb(dt)
    } else if (this.mode === 'orbit') {
      this.controls.update()
    } else if (this.started) {
      this.walk(dt)
      this.placeCamera()
    } else {
      this.placeCamera()
    }
    // indoors, dim the sky-light fill so rooms keep contrast (sun still pours through the windows)
    const insideNow = this.mode === 'walk' && (this.level > 0 || Math.hypot(this.pos.x - this.showCx, this.pos.y - this.showCz) < 2.0)
    this.indoor += ((insideNow ? 1 : 0) - this.indoor) * (1 - Math.exp(-dt * 3))
    this.scene.environmentIntensity = this.cur.env * (1 - 0.6 * this.indoor)
    this.hemi.intensity = this.cur.hemi * (1 - 0.55 * this.indoor)
    this.camera.fov = this.mode === 'walk' && this.level > 0 ? 72 : 64
    this.camera.updateProjectionMatrix()

    this.updatePrompt()
    this.updateShadow()
    this.updateLabels()
    this.composer.render(dt)

    // adaptive quality
    this.frames++
    this.accDt += dt
    if (this.frames === 150) {
      const avg = this.accDt / 150
      if (avg > 0.045 && this.quality === 'high') this.setQuality('medium')
      else if (avg > 0.05 && this.quality === 'medium') this.setQuality('low')
    }
  }

  private updateShadow() {
    const focus = this.mode === 'orbit' ? this.controls.target : this.camera.position
    const S = this.mode === 'orbit' ? 55 : this.level > 0 ? 18 : 38
    const sc = this.sun.shadow.camera
    if (Math.abs(S - this.shadowSize) > 0.5) {
      this.shadowSize = S
      sc.left = -S
      sc.right = S
      sc.top = S
      sc.bottom = -S
      sc.updateProjectionMatrix()
    }
    const snap = (S * 2) / this.sun.shadow.mapSize.x
    const fx = Math.round(focus.x / snap) * snap
    const fz = Math.round(focus.z / snap) * snap
    const fy = this.level > 0 ? focus.y : 0
    this.sun.target.position.set(fx, fy, fz)
    this.sun.position.set(fx, fy, fz).addScaledVector(this.lightDir, 220)
    this.sun.target.updateMatrixWorld()
  }

  private updateLabels() {
    const w = this.container.clientWidth
    const h = this.container.clientHeight
    const v = new THREE.Vector3()
    const dir = new THREE.Vector3()
    this.camera.getWorldDirection(dir)
    for (const l of this.labels) {
      const poi = l.poi
      let visible = this.started && !this.flight && !this.climb
      if (poi.level === undefined) visible = visible && this.level === 0
      else visible = visible && this.level === poi.level && this.mode === 'walk'
      let a = 1
      if (visible) {
        v.copy(l.world).sub(this.camera.position)
        const d = v.length()
        const lim = poi.level === undefined ? (this.mode === 'orbit' ? 150 : 90) : 9
        const front = v.dot(dir) / d
        visible = d < lim && front > 0.15
        a = clamp(1.4 - d / lim, 0.35, 1)
        if (visible) {
          v.copy(l.world).project(this.camera)
          l.el.style.transform = `translate(${((v.x * 0.5 + 0.5) * w).toFixed(1)}px,${((-v.y * 0.5 + 0.5) * h).toFixed(1)}px) translate(-12px,-12px)`
          l.el.style.opacity = String(a)
        }
      }
      l.el.style.display = visible ? 'flex' : 'none'
      l.el.classList.toggle('active', this.activePOI === poi.id)
    }
  }

  dispose() {
    this.disposed = true
    this.renderer.setAnimationLoop(null)
    this.ro.disconnect()
    window.removeEventListener('keydown', this.keyDown)
    window.removeEventListener('keyup', this.keyUp)
    document.removeEventListener('pointerlockchange', this.lockChange)
    document.removeEventListener('mousemove', this.mouseMove)
    this.releasePointer()
    this.controls.dispose()
    this.envRT?.dispose()
    this.pmrem.dispose()
    this.composer.dispose()
    this.renderer.dispose()
    this.renderer.domElement.remove()
    this.labelRoot.remove()
  }

  get isReady() {
    return this.ready
  }
  get levelNow() {
    return this.level
  }
  get stairRise() {
    return RISE
  }
  get shaftR() {
    return SHAFT_R
  }
  get cubeY() {
    return YC
  }
}

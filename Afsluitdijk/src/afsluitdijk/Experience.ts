import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { buildTextures, setAnisotropy } from './textures'
import { makeMaterials, type Mats } from './materials'
import { buildWorld, type World } from './world'
import { buildMonument, type Monument, P0, TX, TZ, TOWER_H } from './monument'
import { Traffic, Gulls, Offshore, carLightMats } from './life'
import { SkyRig, computeEnv, type EnvParams } from './sky'
import { AmbientAudio } from './audio'
import { POIS, TOUR, poiFeetY, type Poi } from './pois'
import { terrainY, tideLevel, IJ_LEVEL, X_LIMIT, ROAD_Y } from './profile'
import type { Box } from './types'

export type Mode = 'walk' | 'fly'
export type Phase = 'loading' | 'attract' | 'play' | 'flight'
export type Quality = 'high' | 'medium' | 'low'
export type TimeName = 'sunrise' | 'morning' | 'noon' | 'golden' | 'night'
export type Weather = 'clear' | 'partly' | 'overcast'

export const TIME_PRESETS: Record<TimeName, { elev: number; az: number }> = {
  sunrise: { elev: 6, az: 78 },
  morning: { elev: 26, az: 115 },
  noon: { elev: 50, az: 178 },
  golden: { elev: 6.5, az: 262 },
  night: { elev: -14, az: 262 },
}
export const WEATHER_COVER: Record<Weather, number> = { clear: 0.16, partly: 0.5, overcast: 0.96 }

export interface ExpState {
  x: number
  y: number
  z: number
  yaw: number
  phase: Phase
  mode: Mode
  tour: boolean
  tourIdx: number
  fps: number
  locked: boolean
  quality: Quality
  audio: boolean
  joy: { x: number; y: number } | null
}

export interface ExpEvents {
  onProgress?: (p: number, label: string) => void
  onState?: (s: ExpState) => void
  onPoi?: (p: Poi | null) => void
}

const PR = 0.32
const EYE = 1.68

const GRADE = {
  uniforms: { tDiffuse: { value: null as THREE.Texture | null }, uTime: { value: 0 }, uVig: { value: 0.55 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uVig; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      vec2 d = vUv - 0.5;
      c.rgb *= 1.0 - dot(d, d) * uVig;
      // gentle S-curve
      c.rgb = mix(c.rgb, c.rgb * c.rgb * (3.0 - 2.0 * c.rgb), 0.18);
      float n = fract(sin(dot(vUv * vec2(1920.0, 1080.0) + fract(uTime) * 91.7, vec2(12.9898, 78.233))) * 43758.5453);
      c.rgb += (n - 0.5) * 0.022;
      gl_FragColor = c;
    }`,
}

const angDiff = (a: number, b: number) => {
  let d = (b - a) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return d
}
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

interface Flight {
  t: number
  dur: number
  fp: THREE.Vector3
  tp: THREE.Vector3
  fyaw: number
  tyaw: number
  fpitch: number
  tpitch: number
  arc: number
  feetY: number
}

export class Experience {
  private container: HTMLElement
  private ev: ExpEvents
  private disposed = false
  renderer!: THREE.WebGLRenderer
  private composer!: EffectComposer
  private bloom!: UnrealBloomPass
  private grade!: ShaderPass
  scene = new THREE.Scene()
  camera!: THREE.PerspectiveCamera
  private sky!: SkyRig
  private pmrem!: THREE.PMREMGenerator
  private envRT: THREE.WebGLRenderTarget | null = null
  private sun!: THREE.DirectionalLight
  private hemi!: THREE.HemisphereLight
  private fog = new THREE.FogExp2('#bcd2e3', 0.0002)
  private mats!: Mats
  private world!: World
  private monument!: Monument
  private traffic!: Traffic
  private gulls!: Gulls
  private offshore!: Offshore
  private audio = new AmbientAudio()
  private colliders: Box[] = []
  private floorFns: Monument['floors'] = []
  private blockerFns: Monument['blockers'] = []

  // environment
  private cur = { elev: TIME_PRESETS.noon.elev, az: TIME_PRESETS.noon.az, cover: WEATHER_COVER.partly }
  private tgt = { ...this.cur }
  private env!: EnvParams
  private envDirty = true
  private envAcc = 0

  // player
  phase: Phase = 'loading'
  mode: Mode = 'walk'
  private pos = new THREE.Vector3(-96, 7.5, 15.9)
  private visY = 7.5
  private vy = 0
  private onGround = true
  private yaw = -Math.PI / 2
  private pitch = 0
  private keys: Record<string, boolean> = {}
  private flight: Flight | null = null
  private bob = 0
  private fovTarget = 64
  private joy: { id: number; x0: number; y0: number; x: number; y: number } | null = null
  private lookTouch: { id: number; x: number; y: number } | null = null
  private drag = { id: -1, x: 0, y: 0, moved: 0 }

  // tour
  private tour = false
  private tourIdx = -1
  private tourTimer = 0

  // misc
  private last = 0
  private t = 0
  private ro?: ResizeObserver
  private quality: Quality = 'high'
  private frames = 0
  private accDt = 0
  private fps = 60
  private stateAcc = 0
  private poiAcc = 0
  private activePoi: string | null = null
  private auto = true
  private attractT = 0

  constructor(container: HTMLElement, ev: ExpEvents = {}) {
    this.container = container
    this.ev = ev
  }

  // ------------------------------------------------------------------ init
  async init() {
    const tick = () => new Promise<void>((r) => setTimeout(r, 0))
    const progress = (p: number, l: string) => this.ev.onProgress?.(p, l)
    progress(0.02, 'Starting the renderer')
    await tick()
    const w = this.container.clientWidth || window.innerWidth
    const h = this.container.clientHeight || window.innerHeight
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', logarithmicDepthBuffer: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setSize(w, h)
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFShadowMap
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    const cv = this.renderer.domElement
    cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;outline:none;touch-action:none'
    cv.tabIndex = 0
    this.container.appendChild(cv)
    setAnisotropy(Math.min(16, this.renderer.capabilities.getMaxAnisotropy()))

    this.camera = new THREE.PerspectiveCamera(this.fovTarget, w / h, 0.1, 30000)
    this.camera.rotation.order = 'YXZ'
    this.scene.fog = this.fog

    this.sky = new SkyRig()
    this.scene.add(this.sky.visible)
    this.pmrem = new THREE.PMREMGenerator(this.renderer)

    this.hemi = new THREE.HemisphereLight('#a8c8ea', '#7d7a62', 0.3)
    this.scene.add(this.hemi)
    this.sun = new THREE.DirectionalLight('#fff4e0', 3)
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(4096, 4096)
    const sc = this.sun.shadow.camera
    sc.near = 20
    sc.far = 1100
    sc.left = sc.bottom = -80
    sc.right = sc.top = 80
    this.sun.shadow.bias = -0.0003
    this.sun.shadow.normalBias = 0.07
    this.scene.add(this.sun, this.sun.target)

    const T = await buildTextures(progress)
    if (this.disposed) return
    progress(0.7, 'Pouring the dike')
    await tick()
    this.mats = makeMaterials(T)
    const windU = { value: 0 }
    this.world = buildWorld(this.mats, T.water, windU)
    this.scene.add(this.world.group)
    progress(0.8, 'Building the monument')
    await tick()
    if (this.disposed) return
    this.monument = buildMonument(this.mats)
    this.scene.add(this.monument.group)
    progress(0.88, 'Adding traffic, gulls and turbines')
    await tick()
    this.traffic = new Traffic(this.mats)
    this.gulls = new Gulls()
    this.offshore = new Offshore()
    this.scene.add(this.traffic.group, this.gulls.group, this.offshore.group)

    this.colliders = [...this.world.colliders, ...this.monument.colliders]
    this.floorFns = [...this.world.floors, ...this.monument.floors]
    this.blockerFns = [...this.world.blockers, ...this.monument.blockers]

    progress(0.93, 'Lighting the sky')
    await tick()
    this.buildComposer()
    this.setQuality('high')
    this.applyEnv(true)
    this.bindInput()
    this.ro = new ResizeObserver(() => this.onResize())
    this.ro.observe(this.container)

    // first render uploads textures & compiles shaders
    this.placeAttract(0)
    this.composer.render()
    progress(1, 'Ready')
    this.phase = 'attract'
    this.last = performance.now()
    this.renderer.setAnimationLoop(() => this.frame())
    this.emitState()
  }

  private buildComposer() {
    const size = this.renderer.getSize(new THREE.Vector2())
    const pr = this.renderer.getPixelRatio()
    this.composer?.dispose()
    const samples = this.quality === 'low' ? 0 : 4
    const rt = new THREE.WebGLRenderTarget(size.x * pr, size.y * pr, { type: THREE.HalfFloatType, samples })
    this.composer = new EffectComposer(this.renderer, rt)
    this.composer.setPixelRatio(pr)
    this.composer.setSize(size.x, size.y)
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.16, 0.75, 0.95)
    this.bloom.enabled = this.quality !== 'low'
    this.composer.addPass(this.bloom)
    this.composer.addPass(new OutputPass())
    this.grade = new ShaderPass(GRADE)
    this.composer.addPass(this.grade)
  }

  private onResize = () => {
    if (this.disposed || !this.renderer) return
    const w = this.container.clientWidth || 1
    const h = this.container.clientHeight || 1
    this.renderer.setSize(w, h)
    this.composer.setSize(w, h)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  setQuality(q: Quality) {
    this.quality = q
    const dpr = window.devicePixelRatio || 1
    const pr = q === 'high' ? Math.min(dpr, 2) : q === 'medium' ? Math.min(dpr, 1.4) : 1
    this.renderer.setPixelRatio(pr)
    const size = q === 'high' ? 4096 : q === 'medium' ? 2048 : 1024
    this.sun.shadow.mapSize.set(size, size)
    this.sun.shadow.map?.dispose()
    this.sun.shadow.map = null
    this.renderer.setSize(this.container.clientWidth || 1, this.container.clientHeight || 1)
    this.buildComposer()
    this.emitState()
  }

  // ------------------------------------------------------------------ environment
  setTime(n: TimeName) {
    this.tgt.elev = TIME_PRESETS[n].elev
    this.tgt.az = TIME_PRESETS[n].az
    this.envDirty = true
  }
  setWeather(w: Weather) {
    this.tgt.cover = WEATHER_COVER[w]
    this.envDirty = true
  }

  private stepEnv(dt: number) {
    const k = 1 - Math.exp(-dt * 1.8)
    const d = Math.abs(this.tgt.elev - this.cur.elev) + Math.abs(this.tgt.az - this.cur.az) * 0.05 + Math.abs(this.tgt.cover - this.cur.cover) * 20
    if (d > 0.01) {
      this.cur.elev += (this.tgt.elev - this.cur.elev) * k
      this.cur.az += (this.tgt.az - this.cur.az) * k
      this.cur.cover += (this.tgt.cover - this.cur.cover) * k
      this.applyEnv(false)
      this.envAcc += dt
      if (this.envAcc > 0.45) {
        this.envAcc = 0
        this.regenEnv()
      }
      this.envDirty = true
    } else if (this.envDirty) {
      this.cur = { ...this.tgt }
      this.applyEnv(true)
      this.envDirty = false
    }
  }

  private applyEnv(regen: boolean) {
    const e = computeEnv(this.cur.elev, this.cur.az, this.cur.cover)
    this.env = e
    this.sky.apply(e)
    this.sun.color.copy(e.sunColor)
    this.sun.intensity = e.sunInt
    this.hemi.color.copy(e.hemiSky)
    this.hemi.groundColor.copy(e.hemiGround)
    this.hemi.intensity = e.hemiInt
    this.fog.color.copy(e.fog)
    this.fog.density = e.fogDensity
    this.renderer.toneMappingExposure = e.exposure
    this.scene.environmentIntensity = e.envInt
    const n = e.night
    this.mats.lamp.emissiveIntensity = n * 5
    carLightMats.front.emissiveIntensity = n * 4
    carLightMats.rear.emissiveIntensity = 0.15 + n * 2.5
    this.monument.setNight(n)
    this.offshore.setNight(n)
    this.bloom.strength = 0.14 + n * 0.35
    this.grade.uniforms.uVig.value = 0.5 + n * 0.2
    for (const m of this.mats.interior) m.envMapIntensity = 0.3 * e.envInt
    if (regen) this.regenEnv()
  }

  private regenEnv() {
    const rt = this.pmrem.fromScene(this.sky.envScene, 0, 0.1, 12000)
    this.scene.environment = rt.texture
    for (const m of this.mats.interior) {
      if (m.envMap !== rt.texture) {
        const first = !m.envMap
        m.envMap = rt.texture
        if (first) m.needsUpdate = true
      }
    }
    this.envRT?.dispose()
    this.envRT = rt
  }

  // ------------------------------------------------------------------ input
  private lookDelta(dx: number, dy: number, k = 0.0024) {
    this.yaw -= dx * k
    this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch - dy * k))
  }

  private bindInput() {
    const el = this.renderer.domElement
    el.addEventListener('pointerdown', this.pDown)
    el.addEventListener('pointermove', this.pMove)
    el.addEventListener('pointerup', this.pUp)
    el.addEventListener('pointercancel', this.pUp)
    el.addEventListener('wheel', this.wheel, { passive: true })
    window.addEventListener('keydown', this.kDown)
    window.addEventListener('keyup', this.kUp)
    window.addEventListener('blur', this.blur)
    document.addEventListener('pointerlockchange', this.lockChange)
  }

  private pDown = (e: PointerEvent) => {
    this.renderer.domElement.focus()
    if (this.phase !== 'play') return
    if (this.tour) this.stopTour()
    if (e.pointerType === 'touch') {
      const w = this.container.clientWidth
      if (e.clientX < w * 0.42 && !this.joy) this.joy = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY }
      else if (!this.lookTouch) this.lookTouch = { id: e.pointerId, x: e.clientX, y: e.clientY }
      this.renderer.domElement.setPointerCapture(e.pointerId)
      return
    }
    this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0 }
    this.renderer.domElement.setPointerCapture(e.pointerId)
  }
  private pMove = (e: PointerEvent) => {
    if (this.phase !== 'play') return
    if (e.pointerType === 'touch') {
      if (this.joy && e.pointerId === this.joy.id) {
        this.joy.x = e.clientX
        this.joy.y = e.clientY
      } else if (this.lookTouch && e.pointerId === this.lookTouch.id) {
        this.lookDelta(e.clientX - this.lookTouch.x, e.clientY - this.lookTouch.y, 0.0042)
        this.lookTouch.x = e.clientX
        this.lookTouch.y = e.clientY
      }
      return
    }
    if (document.pointerLockElement === this.renderer.domElement) {
      this.lookDelta(e.movementX, e.movementY)
    } else if (this.drag.id === e.pointerId && e.buttons & 1) {
      this.lookDelta(e.clientX - this.drag.x, e.clientY - this.drag.y)
      this.drag.x = e.clientX
      this.drag.y = e.clientY
    }
  }
  private pUp = (e: PointerEvent) => {
    if (this.joy && e.pointerId === this.joy.id) this.joy = null
    if (this.lookTouch && e.pointerId === this.lookTouch.id) this.lookTouch = null
    if (this.drag.id === e.pointerId) this.drag.id = -1
  }
  private wheel = (e: WheelEvent) => {
    this.fovTarget = Math.max(34, Math.min(78, this.fovTarget + e.deltaY * 0.02))
  }
  private kDown = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return
    this.keys[e.code] = true
    if (this.phase === 'play' && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault()
    if (this.tour && ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) this.stopTour()
    if (e.code === 'KeyF' && this.phase === 'play') this.setMode(this.mode === 'walk' ? 'fly' : 'walk')
    if (e.code === 'KeyZ') this.fovTarget = 40
  }
  private kUp = (e: KeyboardEvent) => {
    this.keys[e.code] = false
    if (e.code === 'KeyZ') this.fovTarget = 64
  }
  private blur = () => {
    this.keys = {}
  }
  private lockChange = () => {
    this.emitState()
  }

  requestLock() {
    const el = this.renderer.domElement
    if (document.pointerLockElement === el) document.exitPointerLock()
    else {
      try {
        const r = el.requestPointerLock() as unknown as Promise<void> | undefined
        if (r && typeof r.catch === 'function') r.catch(() => undefined)
      } catch {
        /* pointer lock not available (e.g. sandboxed iframe) */
      }
    }
  }

  // ------------------------------------------------------------------ navigation
  private lookAtAngles(from: THREE.Vector3, to: THREE.Vector3) {
    const d = to.clone().sub(from)
    return { yaw: Math.atan2(-d.x, -d.z), pitch: Math.atan2(d.y, Math.hypot(d.x, d.z)) }
  }

  enter() {
    if (this.phase !== 'attract') return
    this.auto = false
    this.goTo('arrival', 9)
    this.audio.start()
    this.emitState()
  }

  goTo(id: string, dur = 3.2) {
    const p = POIS.find((q) => q.id === id)
    if (!p || this.phase === 'loading') return
    const fy = poiFeetY(p)
    const eye = new THREE.Vector3(p.at[0], fy + EYE, p.at[1])
    const a = this.lookAtAngles(eye, new THREE.Vector3(...p.look))
    const fp = this.camera.position.clone()
    const fyaw = this.camera.rotation.y
    const fpitch = this.camera.rotation.x
    const dist = fp.distanceTo(eye)
    this.flight = {
      t: 0,
      dur: Math.max(0.3, dur),
      fp,
      tp: eye,
      fyaw,
      tyaw: fyaw + angDiff(fyaw, a.yaw),
      fpitch,
      tpitch: a.pitch,
      arc: Math.min(55, dist * 0.14),
      feetY: fy,
    }
    this.vy = 0
    this.phase = 'flight'
    this.emitState()
  }

  /** Instantly place the walker (used for deep links and automated checks). */
  place(x: number, z: number, lookX: number, lookY: number, lookZ: number, feetY?: number) {
    if (this.phase === 'loading') return
    this.auto = false
    this.flight = null
    const fy = feetY ?? this.floorAt(x, z, 99)
    this.pos.set(x, fy, z)
    this.visY = fy
    this.vy = 0
    this.onGround = true
    const a = this.lookAtAngles(new THREE.Vector3(x, fy + EYE, z), new THREE.Vector3(lookX, lookY, lookZ))
    this.yaw = a.yaw
    this.pitch = a.pitch
    this.phase = 'play'
    this.camera.position.set(x, fy + EYE, z)
    this.camera.rotation.set(this.pitch, this.yaw, 0)
    this.emitState()
  }

  setMode(m: Mode) {
    if (m === this.mode) return
    this.mode = m
    if (m === 'walk') {
      // drop back onto the ground (or the nearest valid spot)
      let fy = this.floorAt(this.pos.x, this.pos.z, this.pos.y)
      if (this.blocked(this.pos.x, this.pos.z, fy)) {
        const p = POIS[0]
        this.pos.set(p.at[0], poiFeetY(p), p.at[1])
        fy = this.pos.y
      }
      this.pos.y = Math.max(fy, Math.min(this.pos.y, fy + 0.0))
      this.visY = this.pos.y
      this.onGround = true
      this.vy = 0
    } else {
      this.pos.y += 4
      this.visY = this.pos.y
    }
    this.emitState()
  }

  startTour() {
    if (this.phase === 'loading' || this.phase === 'attract') return
    this.tour = true
    this.tourIdx = 0
    this.tourTimer = 0
    this.goTo(TOUR[0], 6)
    this.emitState()
  }
  stopTour() {
    if (!this.tour) return
    this.tour = false
    this.tourIdx = -1
    this.emitState()
  }

  setAudio(on: boolean) {
    if (on) this.audio.start()
    else this.audio.stop()
    this.emitState()
  }

  // ------------------------------------------------------------------ physics
  private waterAt(z: number) {
    return z < 0 ? tideLevel(this.t) : IJ_LEVEL
  }

  private floorAt(x: number, z: number, fy: number) {
    let best = terrainY(x, z)
    for (const f of this.floorFns) {
      const c = f(x, z, fy)
      if (c !== null && c > best) best = c
    }
    return best
  }

  private blocked(x: number, z: number, fy: number) {
    if (Math.abs(x) > X_LIMIT) return true
    for (const b of this.colliders) {
      if (x + PR > b.x0 && x - PR < b.x1 && z + PR > b.z0 && z - PR < b.z1 && fy < b.y1 - 0.3 && fy + 1.7 > b.y0) return true
    }
    for (const f of this.blockerFns) if (f(x, z, fy)) return true
    if (terrainY(x, z) < this.waterAt(z) - 0.85 && this.floorAt(x, z, fy) < this.waterAt(z) - 0.85) return true
    return false
  }

  private walk(dt: number) {
    const k = this.keys
    let f = (k['KeyW'] || k['ArrowUp'] ? 1 : 0) - (k['KeyS'] || k['ArrowDown'] ? 1 : 0)
    let s = (k['KeyD'] ? 1 : 0) - (k['KeyA'] ? 1 : 0)
    if (k['ArrowRight']) this.yaw -= dt * 1.7
    if (k['ArrowLeft']) this.yaw += dt * 1.7
    if (this.joy) {
      const jx = Math.max(-1, Math.min(1, (this.joy.x - this.joy.x0) / 55))
      const jy = Math.max(-1, Math.min(1, (this.joy.y - this.joy.y0) / 55))
      s += jx
      f += -jy
    }
    const len = Math.hypot(f, s)
    if (len > 1) {
      f /= len
      s /= len
    }
    const run = k['ShiftLeft'] || k['ShiftRight']
    const speed = (run ? 6.8 : 2.9) * (k['ControlLeft'] ? 0.5 : 1)
    const sy = Math.sin(this.yaw)
    const cy = Math.cos(this.yaw)
    const mx = (-sy * f + cy * s) * speed * dt
    const mz = (-cy * f - sy * s) * speed * dt
    const moving = Math.abs(mx) + Math.abs(mz) > 1e-5
    if (this.mode === 'walk') {
      const fy = this.pos.y
      if (mx !== 0 && !this.blocked(this.pos.x + mx, this.pos.z, fy)) this.pos.x += mx
      if (mz !== 0 && !this.blocked(this.pos.x, this.pos.z + mz, fy)) this.pos.z += mz
      if (k['Space'] && this.onGround) {
        this.vy = 4.6
        this.onGround = false
      }
      const ground = this.floorAt(this.pos.x, this.pos.z, this.pos.y)
      if (this.onGround) {
        if (ground >= this.pos.y - 0.45) this.pos.y = ground
        else this.onGround = false
      }
      if (!this.onGround) {
        this.vy -= 22 * dt
        this.pos.y += this.vy * dt
        if (this.pos.y <= ground && this.vy <= 0) {
          this.pos.y = ground
          this.vy = 0
          this.onGround = true
        }
      }
      this.visY += (this.pos.y - this.visY) * Math.min(1, dt * 14)
      if (moving && this.onGround) this.bob += dt * (run ? 10 : 6.5)
    } else {
      // fly mode: move along the view direction
      const pf = Math.cos(this.pitch)
      const fwd = new THREE.Vector3(-sy * pf, Math.sin(this.pitch), -cy * pf)
      const right = new THREE.Vector3(cy, 0, -sy)
      const v = (k['ShiftLeft'] || k['ShiftRight'] ? 60 : 16) * dt
      let up = (k['Space'] || k['KeyE'] ? 1 : 0) - (k['KeyC'] || k['KeyQ'] ? 1 : 0)
      up *= v
      this.pos.addScaledVector(fwd, f * v)
      this.pos.addScaledVector(right, s * v)
      this.pos.y += up
      this.pos.x = Math.max(-X_LIMIT, Math.min(X_LIMIT, this.pos.x))
      const min = Math.max(terrainY(this.pos.x, this.pos.z), this.waterAt(this.pos.z)) + 1.2
      if (this.pos.y < min) this.pos.y = min
      this.visY = this.pos.y
    }
  }

  // ------------------------------------------------------------------ frame
  private placeAttract(t: number) {
    const a = -0.6 + t * 0.045
    const R = 105
    const cx = TX + 18
    const cz = TZ - 4
    this.camera.position.set(cx + Math.cos(a) * R, 38 + Math.sin(t * 0.2) * 4, cz + Math.sin(a) * R * 0.8)
    this.camera.lookAt(TX, P0 + 12, TZ)
    this.yaw = this.camera.rotation.y
    this.pitch = this.camera.rotation.x
  }

  private frame() {
    if (this.disposed) return
    const now = performance.now()
    const dt = Math.min((now - this.last) / 1000, 0.05)
    this.last = now
    this.t += dt
    const t = this.t
    this.stepEnv(dt)

    if (this.phase === 'attract') {
      this.attractT += dt
      this.placeAttract(this.attractT)
    } else if (this.phase === 'flight' && this.flight) {
      const f = this.flight
      f.t += dt / f.dur
      const k = ease(Math.min(1, f.t))
      const p = f.fp.clone().lerp(f.tp, k)
      p.y += Math.sin(Math.PI * k) * f.arc
      this.camera.position.copy(p)
      this.yaw = f.fyaw + (f.tyaw - f.fyaw) * k
      this.pitch = f.fpitch + (f.tpitch - f.fpitch) * k
      this.camera.rotation.set(this.pitch, this.yaw, 0)
      if (f.t >= 1) {
        this.flight = null
        this.pos.set(f.tp.x, f.feetY, f.tp.z)
        this.visY = f.feetY
        this.vy = 0
        this.onGround = this.mode === 'walk'
        if (this.mode === 'fly') this.pos.y = f.feetY + EYE
        this.phase = 'play'
        this.tourTimer = 0
        this.emitState()
      }
    } else if (this.phase === 'play') {
      this.walk(dt)
      const eye = this.mode === 'walk' ? EYE + Math.sin(this.bob) * 0.028 : 0
      this.camera.position.set(this.pos.x, this.visY + eye, this.pos.z)
      this.camera.rotation.set(this.pitch, this.yaw, 0)
      if (this.tour) {
        this.tourTimer += dt
        if (this.tourTimer > 11) {
          this.tourIdx++
          if (this.tourIdx >= TOUR.length) this.stopTour()
          else this.goTo(TOUR[this.tourIdx], 6)
        }
      }
    }

    // fov easing
    if (Math.abs(this.camera.fov - this.fovTarget) > 0.05) {
      this.camera.fov += (this.fovTarget - this.camera.fov) * Math.min(1, dt * 8)
      this.camera.updateProjectionMatrix()
    }

    // world animation
    this.world.update?.(t, dt, this.camera)
    this.monument.update?.(t, dt, this.camera)
    this.traffic.update(t)
    this.gulls.update(t)
    this.offshore.update(t)
    this.sky.update(t, this.camera.position)
    this.grade.uniforms.uTime.value = t
    this.updateShadowFocus()

    // poi + audio + ui
    this.poiAcc += dt
    if (this.poiAcc > 0.2) {
      this.poiAcc = 0
      this.checkPoi()
      this.audio.update(t, this.audioInfo())
    }
    this.stateAcc += dt
    if (this.stateAcc > 0.1) {
      this.stateAcc = 0
      this.emitState()
    }

    this.composer.render()

    // adaptive quality
    this.frames++
    this.accDt += dt
    if (this.frames === 150) {
      this.fps = 150 / this.accDt
      if (this.auto && this.phase !== 'attract' && this.fps < 24 && this.quality === 'high') this.setQuality('medium')
      else if (this.auto && this.fps < 18 && this.quality === 'medium') this.setQuality('low')
      this.frames = 0
      this.accDt = 0
    }
  }

  private audioInfo() {
    const p = this.pos
    const rel = p.y - P0
    const dx = p.x - TX
    const dz = p.z - TZ
    const indoor = Math.abs(dx) < 3.4 && Math.abs(dz) < 3.4 && rel < TOWER_H + 3 || (Math.abs(dx) < 6 && Math.abs(dz) < 1.2 && dx > 0 && rel < 1)
    const wl = this.waterAt(p.z)
    return {
      roadDist: Math.max(0, Math.abs(p.z) - 11.9),
      indoor,
      height: p.y - ROAD_Y,
      waterDist: Math.max(0, p.y - wl) * 4 + Math.max(0, 40 - Math.abs(p.z)) * 0.0,
    }
  }

  private checkPoi() {
    if (this.phase === 'attract' || this.phase === 'loading') return
    let best: Poi | null = null
    let bd = 1e9
    for (const p of POIS) {
      const fy = poiFeetY(p)
      const d = Math.hypot(this.camera.position.x - p.at[0], this.camera.position.z - p.at[1], (this.camera.position.y - fy - EYE) * 1.5)
      if (d < p.radius && d < bd) {
        bd = d
        best = p
      }
    }
    const id = best ? best.id : null
    if (id !== this.activePoi) {
      this.activePoi = id
      this.ev.onPoi?.(best)
    }
  }

  private updateShadowFocus() {
    const cam = this.camera.position
    const fwd = new THREE.Vector3()
    this.camera.getWorldDirection(fwd)
    const high = this.mode === 'fly' || this.phase === 'attract' || this.phase === 'flight'
    const S = high ? 150 : 75
    const sc = this.sun.shadow.camera
    if (Math.abs(sc.right - S) > 1) {
      sc.left = sc.bottom = -S
      sc.right = sc.top = S
      sc.updateProjectionMatrix()
    }
    const snap = (S * 2) / this.sun.shadow.mapSize.x
    const fx = Math.round((cam.x + fwd.x * S * 0.35) / snap) * snap
    const fz = Math.round((cam.z + fwd.z * S * 0.35) / snap) * snap
    const fy = Math.round((high ? 8 : cam.y - 1) / snap) * snap
    this.sun.target.position.set(fx, fy, fz)
    this.sun.position.set(fx, fy, fz).addScaledVector(this.env.lightDir, 450)
    this.sun.target.updateMatrixWorld()
  }

  private emitState() {
    if (!this.ev.onState) return
    this.ev.onState({
      x: this.camera ? this.camera.position.x : this.pos.x,
      y: this.camera ? this.camera.position.y : this.pos.y,
      z: this.camera ? this.camera.position.z : this.pos.z,
      yaw: this.yaw,
      phase: this.phase,
      mode: this.mode,
      tour: this.tour,
      tourIdx: this.tourIdx,
      fps: Math.round(this.fps),
      locked: !!this.renderer && document.pointerLockElement === this.renderer.domElement,
      quality: this.quality,
      audio: this.audio.enabled,
      joy: this.joy ? { x: this.joy.x - this.joy.x0, y: this.joy.y - this.joy.y0 } : null,
    })
  }

  dispose() {
    this.disposed = true
    if (!this.renderer) return
    this.renderer.setAnimationLoop(null)
    this.ro?.disconnect()
    const el = this.renderer.domElement
    el.removeEventListener('pointerdown', this.pDown)
    el.removeEventListener('pointermove', this.pMove)
    el.removeEventListener('pointerup', this.pUp)
    el.removeEventListener('pointercancel', this.pUp)
    el.removeEventListener('wheel', this.wheel)
    window.removeEventListener('keydown', this.kDown)
    window.removeEventListener('keyup', this.kUp)
    window.removeEventListener('blur', this.blur)
    document.removeEventListener('pointerlockchange', this.lockChange)
    if (document.pointerLockElement === el) document.exitPointerLock()
    this.audio.dispose()
    this.envRT?.dispose()
    this.pmrem?.dispose()
    this.composer?.dispose()
    this.renderer.dispose()
    this.renderer.forceContextLoss()
    el.remove()
  }
}

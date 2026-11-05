import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { setAnisotropy } from './textures'
import { makeMaterials, type Mats } from './materials'
import { buildBuildings, type BuildingsResult } from './buildings'
import { buildGround, type Ground } from './ground'
import { buildLandmarks, type Landmarks } from './landmarks'
import { SkyRig, computeEnv, type EnvParams } from './sky'
import { POIS, TOUR, type Poi } from './pois'
import { distToSeg, pointInPoly } from './geo'

export type Mode = 'walk' | 'fly'
export type Phase = 'loading' | 'attract' | 'play' | 'flight'
export type Quality = 'high' | 'medium' | 'low'
export type TimeName = 'sunrise' | 'morning' | 'noon' | 'golden' | 'dusk' | 'night'
export type Weather = 'clear' | 'partly' | 'overcast'

export const TIME_PRESETS: Record<TimeName, { elev: number; az: number }> = {
  sunrise: { elev: 5, az: 92 },
  morning: { elev: 30, az: 124 },
  noon: { elev: 52, az: 182 },
  golden: { elev: 7, az: 252 },
  dusk: { elev: -3.5, az: 272 },
  night: { elev: -18, az: 262 },
}
export const WEATHER_COVER: Record<Weather, number> = { clear: 0.12, partly: 0.5, overcast: 0.97 }

export interface ExpState {
  x: number; y: number; z: number; yaw: number
  phase: Phase; mode: Mode; tour: boolean; tourIdx: number
  fps: number; locked: boolean; quality: Quality
  time: TimeName; weather: Weather
  joy: { x: number; y: number } | null
}
export interface Label { id: string; x: number; y: number; d: number; name: string; color: string; ref: string }
export interface ExpEvents {
  onProgress?: (p: number, label: string) => void
  onState?: (s: ExpState) => void
  onPoi?: (p: Poi | null) => void
  onLabels?: (l: Label[]) => void
}

interface View { poi: Poi; cx: number; cz: number; h: number; eye: THREE.Vector3; look: THREE.Vector3; size: number }
interface Flight { t: number; dur: number; fp: THREE.Vector3; tp: THREE.Vector3; fyaw: number; tyaw: number; fpitch: number; tpitch: number; arc: number; feetY: number }

const PR = 0.4
const EYE = 1.7
const WORLD = { x0: -900, x1: 1050, z0: -1320, z1: 1320 }

const GRADE = {
  uniforms: { tDiffuse: { value: null as THREE.Texture | null }, uTime: { value: 0 }, uVig: { value: 0.5 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uVig; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      vec2 d = vUv - 0.5;
      c.rgb *= 1.0 - dot(d,d) * uVig;
      c.rgb = mix(c.rgb, c.rgb*c.rgb*(3.0-2.0*c.rgb), 0.14);
      float n = fract(sin(dot(vUv*vec2(1920.0,1080.0) + fract(uTime)*91.7, vec2(12.9898,78.233))) * 43758.5453);
      c.rgb += (n-0.5) * 0.018;
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

export class Experience {
  private container: HTMLElement
  private ev: ExpEvents
  private renderer!: THREE.WebGLRenderer
  private composer!: EffectComposer
  private bloom!: UnrealBloomPass
  private grade!: ShaderPass
  private scene = new THREE.Scene()
  private camera!: THREE.PerspectiveCamera
  private fog = new THREE.FogExp2(0xaabbcc, 0.0003)
  private sky!: SkyRig
  private pmrem!: THREE.PMREMGenerator
  private envRT?: THREE.WebGLRenderTarget
  private sun!: THREE.DirectionalLight
  private hemi!: THREE.HemisphereLight
  private mats!: Mats
  private built!: BuildingsResult
  private ground!: Ground
  private lm!: Landmarks
  private disposed = false

  private views = new Map<string, View>()
  private cur = { elev: TIME_PRESETS.morning.elev, az: TIME_PRESETS.morning.az, cover: WEATHER_COVER.partly }
  private tgt = { ...this.cur }
  private env!: EnvParams
  private envDirty = false
  private envAcc = 0
  private timeName: TimeName = 'morning'
  private weatherName: Weather = 'partly'

  phase: Phase = 'loading'
  mode: Mode = 'walk'
  private pos = new THREE.Vector3()
  private visY = 0
  private vy = 0
  private onGround = true
  private yaw = 0
  private pitch = 0
  private bob = 0
  private keys: Record<string, boolean> = {}
  private flight: Flight | null = null
  private fovTarget = 62
  private joy: { id: number; x0: number; y0: number; x: number; y: number } | null = null
  private lookTouch: { id: number; x: number; y: number } | null = null
  private drag = { id: -1, x: 0, y: 0 }

  private tour = false
  private tourIdx = -1
  private tourTimer = 0
  private last = 0
  private t = 0
  private ro?: ResizeObserver
  private quality: Quality = 'high'
  private frames = 0
  private accDt = 0
  private fps = 60
  private stateAcc = 0
  private poiAcc = 0
  private labelAcc = 0
  private activePoi: string | null = null
  private auto = true
  private attractT = 0
  private showLabels = true

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
    if (this.disposed) return
    const w = this.container.clientWidth || window.innerWidth
    const h = this.container.clientHeight || window.innerHeight
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' })
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

    this.camera = new THREE.PerspectiveCamera(this.fovTarget, w / h, 0.25, 6000)
    this.camera.rotation.order = 'YXZ'
    this.scene.fog = this.fog
    this.sky = new SkyRig()
    this.scene.add(this.sky.visible)
    this.pmrem = new THREE.PMREMGenerator(this.renderer)
    this.hemi = new THREE.HemisphereLight('#a8c8ea', '#7d7a62', 0.4)
    this.scene.add(this.hemi)
    this.sun = new THREE.DirectionalLight('#fff4e0', 4)
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(4096, 4096)
    const sc = this.sun.shadow.camera
    sc.near = 20; sc.far = 1400
    sc.left = sc.bottom = -90; sc.right = sc.top = 90
    this.sun.shadow.bias = -0.0003
    this.sun.shadow.normalBias = 0.08
    this.sun.shadow.radius = 2.5
    this.scene.add(this.sun, this.sun.target)

    this.mats = await makeMaterials((p, l) => progress(0.05 + p * 0.8, l))
    if (this.disposed) return
    progress(0.87, 'Raising 3,700 buildings')
    await tick()
    this.built = buildBuildings(this.mats)
    this.scene.add(this.built.group)
    if (this.disposed) return
    progress(0.91, 'Sculpting the Library, Aula and EEMCS tower')
    await tick()
    this.lm = buildLandmarks(this.mats)
    this.scene.add(this.lm.group)
    progress(0.94, 'Laying roads, canals and trees')
    await tick()
    this.ground = buildGround(this.mats, this.built.grid)
    this.scene.add(this.ground.group)
    if (this.disposed) return

    this.computeViews()
    progress(0.97, 'Lighting the sky')
    await tick()
    this.buildComposer()
    this.setQuality('high')
    this.applyEnv(true)
    this.bindInput()
    this.ro = new ResizeObserver(() => this.onResize())
    this.ro.observe(this.container)
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
    const samples = this.quality === 'low' ? 0 : this.quality === 'medium' ? 2 : 4
    const rt = new THREE.WebGLRenderTarget(size.x * pr, size.y * pr, { type: THREE.HalfFloatType, samples })
    this.composer = new EffectComposer(this.renderer, rt)
    this.composer.setPixelRatio(pr)
    this.composer.setSize(size.x, size.y)
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.18, 0.7, 0.92)
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
    const pr = q === 'high' ? Math.min(dpr, 2) : q === 'medium' ? Math.min(dpr, 1.25) : 1
    this.renderer.setPixelRatio(pr)
    const size = q === 'high' ? 4096 : q === 'medium' ? 2048 : 1024
    this.sun.shadow.mapSize.set(size, size)
    this.sun.shadow.map?.dispose()
    this.sun.shadow.map = null
    this.renderer.setSize(this.container.clientWidth || 1, this.container.clientHeight || 1)
    this.buildComposer()
    this.emitState()
  }

  setLabels(on: boolean) { this.showLabels = on; if (!on) this.ev.onLabels?.([]) }

  // ------------------------------------------------------------------ environment
  setTime(n: TimeName) {
    this.timeName = n
    this.tgt.elev = TIME_PRESETS[n].elev
    this.tgt.az = TIME_PRESETS[n].az
    this.envDirty = true
    this.emitState()
  }
  setWeather(w: Weather) {
    this.weatherName = w
    this.tgt.cover = WEATHER_COVER[w]
    this.envDirty = true
    this.emitState()
  }

  private stepEnv(dt: number) {
    const k = 1 - Math.exp(-dt * 1.6)
    const d = Math.abs(this.tgt.elev - this.cur.elev) + Math.abs(this.tgt.az - this.cur.az) * 0.05 + Math.abs(this.tgt.cover - this.cur.cover) * 20
    if (d > 0.01) {
      this.cur.elev += (this.tgt.elev - this.cur.elev) * k
      this.cur.az += (this.tgt.az - this.cur.az) * k
      this.cur.cover += (this.tgt.cover - this.cur.cover) * k
      this.applyEnv(false)
      this.envAcc += dt
      if (this.envAcc > 0.5) { this.envAcc = 0; this.regenEnv() }
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
    const n = e.night
    for (const m of this.mats.night) m.emissiveIntensity = m === this.mats.lamp ? n * 6 : n * 1.5
    this.mats.glass.emissiveIntensity = n * 0.35
    this.bloom.strength = 0.16 + n * 0.4
    this.grade.uniforms.uVig.value = 0.45 + n * 0.25
    this.sun.shadow.intensity = 1 - 0.65 * Math.min(1, (this.cur.cover - 0.5) * 2 > 0 ? (this.cur.cover - 0.5) * 2 : 0)
    if (regen) this.regenEnv()
  }

  private regenEnv() {
    const rt = this.pmrem.fromScene(this.sky.envScene, 0, 0.1, 6000)
    this.scene.environment = rt.texture
    this.scene.environmentIntensity = 1
    this.envRT?.dispose()
    this.envRT = rt
  }

  // ------------------------------------------------------------------ POI views
  private computeViews() {
    const spot = (cx: number, cz: number, size: number, h: number, id: string, selfId: number): { x: number; z: number } => {
      const want = Math.max(48, Math.min(190, size * 0.8 + 26 + h * 0.8))
      const pref = Math.atan2(-cz + 200, -cx) // prefer looking from campus centre outwards
      let best = { x: cx, z: cz + want }
      let bestScore = Infinity
      for (let ring = 0; ring < 3; ring++) {
        const d = want * (1 - ring * 0.22)
        for (let i = 0; i < 36; i++) {
          const a = pref + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * (Math.PI / 18)
          const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d
          if (this.blocked(x, z, 0)) continue
          // clear line of sight to the target at eye height?
          let hit = 0
          for (let s = 6; s < d - size * 0.5; s += 6) {
            const px = x + (cx - x) * (s / d), pz = z + (cz - z) * (s / d)
            for (const b of this.built.grid.get(px, pz)) {
              if (b.id === selfId) continue
              if (pointInPoly(px, pz, b.P)) { const inf = this.built.info.get(b.id); if (!inf || inf.h > 4) hit++ }
            }
          }
          const score = hit * 100 + Math.abs(a - pref) * 6 + ring * 10
          if (score < bestScore) { bestScore = score; best = { x, z } }
          if (hit === 0 && Math.abs(a - pref) < 0.9) { void id; return { x, z } }
        }
      }
      return best
    }
    for (const p of POIS) {
      const inf = this.built.info.get(p.bid)
      let cx = inf?.cx ?? 0, cz = inf?.cz ?? 0
      let h = inf?.h ?? 14
      let size = inf ? Math.max(inf.o.hx, inf.o.hz) : 30
      if (p.at) { cx = p.at[0]; cz = p.at[1]; size = Math.max(30, size * 0.5) }
      if (p.h) h = p.h
      if (p.id === 'library') { cx = this.lm.coneC[0] - 25; cz = this.lm.coneC[1] + 14; h = 42; size = 40 }
      const sp = spot(cx, cz, size, h, p.id, p.bid)
      const eye = new THREE.Vector3(sp.x, 0, sp.z)
      const look = new THREE.Vector3(cx, Math.min(h * 0.55, 55), cz)
      this.ground.clearTrees(sp.x, sp.z, 9)
      this.views.set(p.id, { poi: p, cx, cz, h, eye, look, size })
    }
    // library roof extra viewpoint
    const rs = this.lm.roofSpot
    const poi = POIS.find((q) => q.id === 'library')!
    const y = this.lm.libraryTopY(rs[0], rs[1])
    this.views.set('library-roof', {
      poi, cx: this.lm.coneC[0], cz: this.lm.coneC[1], h: 42, size: 20,
      eye: new THREE.Vector3(rs[0], y, rs[1]), look: new THREE.Vector3(this.lm.coneC[0], 28, this.lm.coneC[1]),
    })
  }

  getViews() { return this.views }

  // ------------------------------------------------------------------ input
  private lookDelta(dx: number, dy: number, k = 0.0024) {
    this.yaw -= dx * k
    this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch - dy * k))
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
      if (e.clientX < w * 0.45 && !this.joy) this.joy = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY }
      else if (!this.lookTouch) this.lookTouch = { id: e.pointerId, x: e.clientX, y: e.clientY }
      this.renderer.domElement.setPointerCapture(e.pointerId)
      return
    }
    this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY }
    this.renderer.domElement.setPointerCapture(e.pointerId)
  }
  private pMove = (e: PointerEvent) => {
    if (this.phase !== 'play') return
    if (e.pointerType === 'touch') {
      if (this.joy && e.pointerId === this.joy.id) { this.joy.x = e.clientX; this.joy.y = e.clientY }
      else if (this.lookTouch && e.pointerId === this.lookTouch.id) {
        this.lookDelta(e.clientX - this.lookTouch.x, e.clientY - this.lookTouch.y, 0.0042)
        this.lookTouch.x = e.clientX; this.lookTouch.y = e.clientY
      }
      return
    }
    if (document.pointerLockElement === this.renderer.domElement) this.lookDelta(e.movementX, e.movementY)
    else if (this.drag.id === e.pointerId && e.buttons & 1) {
      this.lookDelta(e.clientX - this.drag.x, e.clientY - this.drag.y)
      this.drag.x = e.clientX; this.drag.y = e.clientY
    }
  }
  private pUp = (e: PointerEvent) => {
    if (this.joy && e.pointerId === this.joy.id) this.joy = null
    if (this.lookTouch && e.pointerId === this.lookTouch.id) this.lookTouch = null
    if (this.drag.id === e.pointerId) this.drag.id = -1
  }
  private wheel = (e: WheelEvent) => { this.fovTarget = Math.max(28, Math.min(78, this.fovTarget + e.deltaY * 0.02)) }
  private kDown = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return
    this.keys[e.code] = true
    if (this.phase === 'play' && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault()
    if (this.tour && ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) this.stopTour()
    if (e.code === 'KeyF' && this.phase === 'play') this.setMode(this.mode === 'walk' ? 'fly' : 'walk')
    if (e.code === 'KeyZ') this.fovTarget = 36
  }
  private kUp = (e: KeyboardEvent) => {
    this.keys[e.code] = false
    if (e.code === 'KeyZ') this.fovTarget = 62
  }
  private blur = () => { this.keys = {} }
  private lockChange = () => { this.emitState() }

  requestLock() {
    const el = this.renderer.domElement
    if (document.pointerLockElement === el) document.exitPointerLock()
    else {
      try {
        const r = el.requestPointerLock() as unknown as Promise<void> | undefined
        if (r && typeof r.catch === 'function') r.catch(() => undefined)
      } catch { /* not available in sandboxed iframes */ }
    }
  }

  // ------------------------------------------------------------------ navigation
  private anglesTo(from: THREE.Vector3, to: THREE.Vector3) {
    const d = to.clone().sub(from)
    return { yaw: Math.atan2(-d.x, -d.z), pitch: Math.atan2(d.y, Math.hypot(d.x, d.z)) }
  }

  enter() {
    if (this.phase !== 'attract') return
    this.auto = false
    this.goTo('library', 8)
  }

  goTo(id: string, dur = 3.4) {
    const v = this.views.get(id)
    if (!v || this.phase === 'loading') return
    const fy = id === 'library-roof' ? v.eye.y : this.floorAt(v.eye.x, v.eye.z, 0)
    const eye = new THREE.Vector3(v.eye.x, fy + EYE, v.eye.z)
    const a = this.anglesTo(eye, v.look)
    const fp = this.camera.position.clone()
    const fyaw = this.camera.rotation.y
    const dist = fp.distanceTo(eye)
    this.flight = {
      t: 0, dur: Math.max(0.4, dur), fp, tp: eye, fyaw, tyaw: fyaw + angDiff(fyaw, a.yaw),
      fpitch: this.camera.rotation.x, tpitch: Math.max(-0.5, Math.min(0.6, a.pitch)), arc: Math.min(90, dist * 0.18), feetY: fy,
    }
    this.vy = 0
    this.phase = 'flight'
    this.emitState()
  }

  /** teleport (with a short flight) to a map location */
  goToXZ(x: number, z: number) {
    if (this.phase === 'loading' || this.phase === 'attract') return
    let px = x, pz = z
    if (this.blocked(px, pz, 0)) {
      outer: for (let r = 3; r < 60; r += 3) for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2
        if (!this.blocked(x + Math.cos(a) * r, z + Math.sin(a) * r, 0)) { px = x + Math.cos(a) * r; pz = z + Math.sin(a) * r; break outer }
      }
    }
    const fy = this.floorAt(px, pz, 0)
    const eye = new THREE.Vector3(px, fy + EYE, pz)
    const fp = this.camera.position.clone()
    this.flight = {
      t: 0, dur: Math.max(1.2, Math.min(4.5, fp.distanceTo(eye) / 250)), fp, tp: eye, fyaw: this.camera.rotation.y, tyaw: this.camera.rotation.y,
      fpitch: this.camera.rotation.x, tpitch: 0, arc: Math.min(80, fp.distanceTo(eye) * 0.15), feetY: fy,
    }
    this.phase = 'flight'
    this.emitState()
  }

  setMode(m: Mode) {
    if (m === this.mode) return
    this.mode = m
    if (m === 'walk') {
      let fy = this.floorAt(this.pos.x, this.pos.z, this.pos.y)
      if (this.blocked(this.pos.x, this.pos.z, fy)) {
        const v = this.views.get('library')!
        this.pos.set(v.eye.x, 0, v.eye.z)
        fy = 0
      }
      this.pos.y = fy
      this.visY = fy
      this.onGround = true
      this.vy = 0
    } else {
      this.pos.y += 6
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

  // ------------------------------------------------------------------ physics
  private inWater(x: number, z: number) {
    for (const w of this.ground.waterGrid.get(x, z)) if (pointInPoly(x, z, w.P)) return !this.onBridge(x, z)
    for (const l of this.ground.waterLines.get(x, z)) if (distToSeg(x, z, l.a, l.b) < l.hw) return !this.onBridge(x, z)
    return false
  }
  private onBridge(x: number, z: number) {
    for (const b of this.ground.bridges) if (distToSeg(x, z, b.a, b.b) < b.hw) return true
    return false
  }

  private blocked(x: number, z: number, fy: number) {
    if (x < WORLD.x0 || x > WORLD.x1 || z < WORLD.z0 || z > WORLD.z1) return true
    for (const b of this.built.grid.get(x, z)) {
      if (pointInPoly(x, z, b.P)) return true
      const P = b.P
      for (let i = 0; i < P.length; i++) if (distToSeg(x, z, P[i], P[(i + 1) % P.length]) < PR) return true
    }
    for (const f of this.lm.blockers) if (f(x, z, fy)) return true
    if (fy < 1.5 && this.inWater(x, z)) return true
    return false
  }

  private floorAt(x: number, z: number, fy: number) {
    let best = 0
    for (const f of this.lm.floors) {
      const v = f(x, z, fy)
      if (v <= fy + 0.8 && v > best) best = v
    }
    return best
  }

  private walk(dt: number) {
    const k = this.keys
    let f = (k['KeyW'] || k['ArrowUp'] ? 1 : 0) - (k['KeyS'] || k['ArrowDown'] ? 1 : 0)
    let s = (k['KeyD'] ? 1 : 0) - (k['KeyA'] ? 1 : 0)
    if (k['ArrowLeft']) this.yaw += 1.7 * dt
    if (k['ArrowRight']) this.yaw -= 1.7 * dt
    if (this.joy) {
      const jx = this.joy.x - this.joy.x0, jy = this.joy.y - this.joy.y0
      const m = Math.min(1, Math.hypot(jx, jy) / 60)
      if (m > 0.12) { const a = Math.atan2(jx, -jy); f += Math.cos(a) * m; s += Math.sin(a) * m }
    }
    const len = Math.hypot(f, s)
    if (len > 1) { f /= len; s /= len }
    const run = k['ShiftLeft'] || k['ShiftRight']
    const flying = this.mode === 'fly'
    const speed = flying ? (run ? 90 : 24) : (run ? 6.8 : 3.0) * (k['ControlLeft'] ? 0.5 : 1)
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw)
    let mx = (-sy * f + cy * s) * speed * dt
    let mz = (-cy * f - sy * s) * speed * dt
    const moving = Math.abs(mx) + Math.abs(mz) > 1e-5

    if (!flying) {
      const fy = this.pos.y
      if (mx !== 0 && !this.blocked(this.pos.x + mx, this.pos.z, fy)) this.pos.x += mx
      if (mz !== 0 && !this.blocked(this.pos.x, this.pos.z + mz, fy)) this.pos.z += mz
      if (k['Space'] && this.onGround) { this.vy = 4.8; this.onGround = false }
      const ground = this.floorAt(this.pos.x, this.pos.z, this.pos.y)
      if (this.onGround) {
        if (ground >= this.pos.y - 0.6) this.pos.y = ground
        else this.onGround = false
      }
      if (!this.onGround) {
        this.vy -= 22 * dt
        this.pos.y += this.vy * dt
        if (this.pos.y <= ground) { this.pos.y = ground; this.vy = 0; this.onGround = true }
      }
      const smoothK = 1 - Math.exp(-dt * 24)
      this.visY += (this.pos.y - this.visY) * smoothK
      if (moving && this.onGround) this.bob += dt * (run ? 11 : 7.5)
    } else {
      // fly: look-direction movement + vertical keys
      const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch)
      const fwd = f * speed * dt
      this.pos.x += (-sy * cp * fwd) + cy * s * speed * dt
      this.pos.z += (-cy * cp * fwd) - sy * s * speed * dt
      this.pos.y += sp * fwd
      if (k['Space'] || k['KeyE']) this.pos.y += speed * 0.6 * dt
      if (k['ControlLeft'] || k['KeyQ']) this.pos.y -= speed * 0.6 * dt
      this.pos.y = Math.max(2, Math.min(900, this.pos.y))
      this.pos.x = Math.max(WORLD.x0, Math.min(WORLD.x1, this.pos.x))
      this.pos.z = Math.max(WORLD.z0, Math.min(WORLD.z1, this.pos.z))
      this.visY = this.pos.y
    }
  }

  // ------------------------------------------------------------------ attract (cinematic orbit)
  private placeAttract(t: number) {
    const a = t * 0.045 + 2.2
    const R = 560, cx = 20, cz = -170
    this.camera.position.set(cx + Math.cos(a) * R, 190 + Math.sin(t * 0.13) * 22, cz + Math.sin(a) * R)
    const look = new THREE.Vector3(cx, 22, cz)
    const ang = this.anglesTo(this.camera.position, look)
    this.camera.rotation.set(ang.pitch, ang.yaw, 0)
    this.yaw = ang.yaw
    this.pitch = ang.pitch
  }

  // ------------------------------------------------------------------ frame
  private frame() {
    if (this.disposed) return
    const now = performance.now()
    const dt = Math.min(0.1, (now - this.last) / 1000)
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
      const e = ease(Math.min(1, f.t))
      this.camera.position.lerpVectors(f.fp, f.tp, e)
      this.camera.position.y += Math.sin(Math.PI * e) * f.arc
      const yaw = f.fyaw + (f.tyaw - f.fyaw) * e
      const pitch = f.fpitch + (f.tpitch - f.fpitch) * e
      this.camera.rotation.set(pitch, yaw, 0)
      this.yaw = yaw; this.pitch = pitch
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
      const eye = this.mode === 'walk' ? EYE + Math.sin(this.bob) * 0.025 : 0
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

    if (Math.abs(this.camera.fov - this.fovTarget) > 0.05) {
      this.camera.fov += (this.fovTarget - this.camera.fov) * Math.min(1, dt * 8)
      this.camera.updateProjectionMatrix()
    }

    this.ground.update(t, this.env.night)
    this.lm.update(t, this.env.night)
    this.mats.water.envMapIntensity = 1.1
    this.sky.update(t, this.camera.position)
    this.grade.uniforms.uTime.value = t
    this.updateShadowFocus()

    this.poiAcc += dt
    if (this.poiAcc > 0.25) { this.poiAcc = 0; this.checkPoi() }
    this.labelAcc += dt
    if (this.labelAcc > 0.1) { this.labelAcc = 0; this.updateLabels() }
    this.stateAcc += dt
    if (this.stateAcc > 0.1) { this.stateAcc = 0; this.emitState() }

    this.composer.render()

    this.frames++
    this.accDt += dt
    if (this.frames === 150) {
      this.fps = 150 / this.accDt
      if (this.auto && this.phase !== 'attract' && this.fps < 28 && this.quality !== 'low') this.setQuality(this.quality === 'high' ? 'medium' : 'low')
      this.frames = 0; this.accDt = 0
    }
  }

  private fwd = new THREE.Vector3()
  private updateShadowFocus() {
    const cam = this.camera.position
    this.camera.getWorldDirection(this.fwd)
    const high = Math.max(0, cam.y - 6)
    const S = Math.max(70, Math.min(260, 70 + high * 0.9))
    const sc = this.sun.shadow.camera
    if (Math.abs(sc.right - S) > 1) {
      sc.left = sc.bottom = -S; sc.right = sc.top = S
      sc.updateProjectionMatrix()
    }
    const snap = (S * 2) / this.sun.shadow.mapSize.x
    const fx = Math.round((cam.x + this.fwd.x * S * 0.35) / snap) * snap
    const fz = Math.round((cam.z + this.fwd.z * S * 0.35) / snap) * snap
    const fy = Math.round((cam.y > 40 ? 10 : 0) / snap) * snap
    this.sun.target.position.set(fx, fy, fz)
    this.sun.position.set(fx, fy, fz).addScaledVector(this.env.lightDir, 600)
    this.sun.target.updateMatrixWorld()
  }

  private checkPoi() {
    if (this.phase !== 'play') { if (this.activePoi) { this.activePoi = null; this.ev.onPoi?.(null) } return }
    const cam = this.camera.position
    this.camera.getWorldDirection(this.fwd)
    let best: View | null = null
    let bd = Infinity
    for (const [id, v] of this.views) {
      if (id === 'library-roof') continue
      const dx = v.cx - cam.x, dz = v.cz - cam.z
      const d = Math.hypot(dx, dz)
      const range = 70 + v.size * 1.1 + v.h * 0.8
      if (d > range) continue
      const dot = (dx * this.fwd.x + dz * this.fwd.z) / (d || 1) / Math.max(0.0001, Math.hypot(this.fwd.x, this.fwd.z))
      if (dot < 0.62 && d > v.size) continue
      const score = d - dot * 40
      if (score < bd) { bd = score; best = v }
    }
    const id = best ? best.poi.id : null
    if (id !== this.activePoi) { this.activePoi = id; this.ev.onPoi?.(best ? best.poi : null) }
  }

  private proj = new THREE.Vector3()
  private updateLabels() {
    if (!this.showLabels || !this.ev.onLabels) return
    if (this.phase === 'loading') return
    const w = this.container.clientWidth, h = this.container.clientHeight
    const cam = this.camera
    const out: Label[] = []
    for (const [id, v] of this.views) {
      if (id === 'library-roof') continue
      const dx = v.cx - cam.position.x, dz = v.cz - cam.position.z
      const d = Math.hypot(dx, dz)
      if (d > 900 || d < 10) continue
      this.proj.set(v.cx, v.h + 6, v.cz).project(cam)
      if (this.proj.z > 1 || this.proj.z < -1 || Math.abs(this.proj.x) > 1.05 || Math.abs(this.proj.y) > 1.05) continue
      out.push({ id: v.poi.id, x: (this.proj.x * 0.5 + 0.5) * w, y: (-this.proj.y * 0.5 + 0.5) * h, d, name: v.poi.abbr ?? v.poi.name, color: v.poi.color, ref: v.poi.ref })
    }
    this.ev.onLabels(out)
  }

  private emitState() {
    if (!this.ev.onState) return
    this.ev.onState({
      x: this.camera ? this.camera.position.x : this.pos.x,
      y: this.camera ? this.camera.position.y : this.pos.y,
      z: this.camera ? this.camera.position.z : this.pos.z,
      yaw: this.yaw, phase: this.phase, mode: this.mode, tour: this.tour, tourIdx: this.tourIdx,
      fps: Math.round(this.fps), locked: !!this.renderer && document.pointerLockElement === this.renderer.domElement,
      quality: this.quality, time: this.timeName, weather: this.weatherName,
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
    this.envRT?.dispose()
    this.pmrem?.dispose()
    this.composer?.dispose()
    this.renderer.dispose()
    this.renderer.forceContextLoss()
    el.remove()
  }
}

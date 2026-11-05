import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { createSky } from './sky'
import { buildTower, T, TowerBuild } from './tower'
import { buildLift, buildRestaurant, Interior } from './interior'
import { buildWorld, facadeUniforms, World } from './world'
import { setNightGlow } from './materials'
import { clamp, lerp, TAU } from './util'
import { Ambience } from './audio'

export type TimeKey = 'day' | 'overcast' | 'golden' | 'night'
export type Quality = 'high' | 'balanced' | 'low'
export type Mode = 'intro' | 'walk' | 'orbit' | 'lift' | 'euroscope'
export type Loc = 'ground' | 'restaurant' | 'terrace' | 'platform'

export interface Hud {
  mode: Mode
  place: string
  altitude: number
  prompt: string | null
  bearing: number
  fps: number
  euro: string
  locked: boolean
}
export interface Events {
  onProgress?: (p: number, label: string) => void
  onHud?: (h: Hud) => void
}

interface Env {
  sunEl: number
  sunAz: number
  sunCol: string
  sunInt: number
  zen: string
  hor: string
  gnd: string
  cover: number
  cl: string
  cd: string
  fogD: number
  expo: number
  env: number
  night: number
  bloom: number
  hemi: number
  hemiSky: string
  hemiGnd: string
}
const PRESETS: Record<TimeKey, Env> = {
  day: { sunEl: 43, sunAz: 205, sunCol: '#fff0dc', sunInt: 3.1, zen: '#2a64b0', hor: '#b4cfe6', gnd: '#8f9c8c', cover: 0.5, cl: '#ffffff', cd: '#8fa2ba', fogD: 0.00019, expo: 0.82, env: 1.0, night: 0, bloom: 0.16, hemi: 0.25, hemiSky: '#bcd6f0', hemiGnd: '#7b8468' },
  overcast: { sunEl: 36, sunAz: 205, sunCol: '#eef0f2', sunInt: 0.8, zen: '#6a7d92', hor: '#b5c0c9', gnd: '#8b948f', cover: 0.97, cl: '#dfe4e8', cd: '#8996a4', fogD: 0.00026, expo: 0.95, env: 1.15, night: 0, bloom: 0.1, hemi: 0.35, hemiSky: '#c9d3dc', hemiGnd: '#7b8468' },
  golden: { sunEl: 7, sunAz: 250, sunCol: '#ffb067', sunInt: 3.4, zen: '#3a5f9e', hor: '#efa979', gnd: '#6d6458', cover: 0.5, cl: '#ffd9b4', cd: '#7a6a88', fogD: 0.00023, expo: 0.85, env: 0.9, night: 0.12, bloom: 0.3, hemi: 0.22, hemiSky: '#f0b88f', hemiGnd: '#5d5442' },
  night: { sunEl: 36, sunAz: 140, sunCol: '#9bb4ff', sunInt: 0.34, zen: '#050a18', hor: '#16233f', gnd: '#080c14', cover: 0.3, cl: '#27324e', cd: '#0b1120', fogD: 0.00022, expo: 1.05, env: 0.3, night: 1, bloom: 0.55, hemi: 0.18, hemiSky: '#27396b', hemiGnd: '#0d111a' },
}
const NUM = ['sunEl', 'sunAz', 'sunInt', 'cover', 'fogD', 'expo', 'env', 'night', 'bloom', 'hemi'] as const
const COL = ['sunCol', 'zen', 'hor', 'gnd', 'cl', 'cd', 'hemiSky', 'hemiGnd'] as const

const GRADE = {
  uniforms: { tDiffuse: { value: null as THREE.Texture | null }, uTime: { value: 0 }, uVig: { value: 0.32 }, uGrain: { value: 0.022 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime, uVig, uGrain; varying vec2 vUv;
  void main(){
    vec4 c = texture2D(tDiffuse, vUv);
    vec2 q = vUv - 0.5;
    float v = 1.0 - smoothstep(0.32, 0.98, length(q * vec2(1.0, 0.8))) * uVig;
    c.rgb *= v;
    c.rgb = mix(c.rgb, c.rgb * c.rgb * (3.0 - 2.0 * c.rgb), 0.16);
    float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
    c.rgb = mix(vec3(l), c.rgb, 1.06);
    float n = fract(sin(dot(vUv * vec2(1920.0, 1080.0) + fract(uTime) * 100.0, vec2(12.9898, 78.233))) * 43758.5453);
    c.rgb += (n - 0.5) * uGrain;
    gl_FragColor = vec4(c.rgb, 1.0);
  }`,
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

export interface Spot {
  id: string
  label: string
  desc: string
}
export const SPOTS: Spot[] = [
  { id: 'approach', label: 'Park approach', desc: 'Het Park, 60 m from the base' },
  { id: 'plaza', label: 'Entrance plaza', desc: 'At the foot of the shaft' },
  { id: 'lobby', label: 'Lobby & lifts', desc: 'Ground-floor pavilion' },
  { id: 'restaurant', label: 'Crow’s nest restaurant', desc: '92 m · panoramic dining' },
  { id: 'terrace', label: 'Viewing terrace', desc: '96 m · open-air platform' },
  { id: 'platform', label: 'Euroscope station', desc: '100 m · boarding platform' },
  { id: 'euroscope', label: 'Ride the Euroscope', desc: 'Up to 185 m' },
  { id: 'aerial', label: 'Aerial view', desc: 'Orbit the whole tower' },
]

interface Hotspot {
  id: string
  title: string
  sub: string
  pos: () => THREE.Vector3
  view: [number, number, number, number, number, number] // cam xyz, target xyz
  el?: HTMLButtonElement
}

export class Experience {
  private container: HTMLElement
  private ev: Events
  renderer: THREE.WebGLRenderer
  scene = new THREE.Scene()
  camera: THREE.PerspectiveCamera
  private composer!: EffectComposer
  private bloom!: UnrealBloomPass
  private grade!: ShaderPass
  private quality: Quality = 'high'
  private basePR = 1
  private pr = 1
  private controls: OrbitControls
  private clock = new THREE.Clock()
  private sky = createSky()
  private skyEnvScene = new THREE.Scene()
  private pmrem: THREE.PMREMGenerator
  private envRT: THREE.WebGLRenderTarget | null = null
  private sun: THREE.DirectionalLight
  private hemi: THREE.HemisphereLight
  private amb = new THREE.AmbientLight('#fff1dc', 0)
  private fog = new THREE.FogExp2('#b4cfe6', 0.00019)
  private cur: Record<string, number> = {}
  private curC: Record<string, THREE.Color> = {}
  private tgt: Env = PRESETS.day
  private timeKey: TimeKey = 'day'
  private envAcc = 0
  private envDirty = true
  private transitioning = 0
  private world!: World
  private tower!: TowerBuild
  private resto!: Interior
  private lift!: ReturnType<typeof buildLift>
  private outdoor = new THREE.Group()
  private interiorLights: THREE.PointLight[] = []
  private indoor = 0
  private indoorT = 0
  private audio = new Ambience()
  private labelRoot: HTMLDivElement
  private fade: HTMLDivElement
  private hotspots: Hotspot[] = []

  mode: Mode = 'intro'
  private loc: Loc = 'ground'
  private pos = new THREE.Vector3(0, 0, 70)
  private floorY = 0
  private yaw = 0
  private pitch = 0.3
  private vel = new THREE.Vector3()
  private keys: Record<string, boolean> = {}
  private joy = { x: 0, y: 0, id: -1, ox: 0, oy: 0 }
  private look = { id: -1, x: 0, y: 0, moved: 0 }
  private locked = false
  private bob = 0
  private fov = 62
  private busy = false
  private flight: { t: number; dur: number; fp: THREE.Vector3; ft: THREE.Vector3; tp: THREE.Vector3; tt: THREE.Vector3; done?: () => void } | null = null
  private euro = { y: T.euroMin, phase: 'wait-bottom' as 'wait-bottom' | 'up' | 'wait-top' | 'down', timer: 4, rot: 0, off: 0, look: 0 }
  private riding = false
  private liftRide = { t: 0, dur: 9, from: 0, to: 0, up: true, done: () => {} }
  private prompt: string | null = null
  private action: (() => void) | null = null
  private treeHash = new Map<string, { x: number; z: number; r: number }[]>()
  private groundCircles: [number, number, number][] = []
  private disposed = false
  private hudAcc = 0
  private fpsAcc = 0
  private fpsN = 0
  private fps = 60
  private slowT = 0
  private shadowSize = 4096
  private ro: ResizeObserver
  private started = false

  constructor(container: HTMLElement, ev: Events = {}) {
    this.container = container
    this.ev = ev
    const w = container.clientWidth || 1
    const h = container.clientHeight || 1
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false })
    this.basePR = Math.min(window.devicePixelRatio || 1, 1.75)
    this.pr = this.basePR
    this.renderer.setPixelRatio(this.pr)
    this.renderer.setSize(w, h)
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 0.82
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    const cv = this.renderer.domElement
    cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;outline:none;touch-action:none'
    container.appendChild(cv)

    this.camera = new THREE.PerspectiveCamera(48, w / h, 0.1, 14000)
    this.camera.rotation.order = 'YXZ'
    this.camera.position.set(190, 95, 270)
    this.scene.fog = this.fog
    this.scene.add(this.camera)

    this.controls = new OrbitControls(this.camera, cv)
    this.controls.target.set(0, 70, 0)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.06
    this.controls.minDistance = 8
    this.controls.maxDistance = 1400
    this.controls.zoomToCursor = true
    this.controls.autoRotate = true
    this.controls.autoRotateSpeed = 0.35
    this.controls.maxPolarAngle = Math.PI * 0.497
    this.controls.update()

    // sky
    this.scene.add(this.sky.mesh)
    this.skyEnvScene.add(new THREE.Mesh(this.sky.mesh.geometry, this.sky.mat))
    this.pmrem = new THREE.PMREMGenerator(this.renderer)

    // lights
    this.hemi = new THREE.HemisphereLight('#bcd6f0', '#7b8468', 0.25)
    this.scene.add(this.hemi, this.amb)
    this.sun = new THREE.DirectionalLight('#fff0dc', 3)
    this.sun.castShadow = true
    this.shadowSize = Math.min(window.innerWidth, window.innerHeight) < 700 ? 2048 : 4096
    this.sun.shadow.mapSize.set(this.shadowSize, this.shadowSize)
    this.sun.shadow.bias = -0.0002
    this.sun.shadow.normalBias = 0.05
    this.sun.shadow.camera.near = 10
    this.sun.shadow.camera.far = 1600
    this.scene.add(this.sun, this.sun.target)
    for (let i = 0; i < 3; i++) {
      const l = new THREE.PointLight('#ffd9a8', 0, 26, 2)
      this.interiorLights.push(l)
      this.scene.add(l)
    }

    const p = PRESETS.day
    for (const k of NUM) this.cur[k] = p[k]
    for (const k of COL) this.curC[k] = new THREE.Color(p[k])

    this.labelRoot = document.createElement('div')
    this.labelRoot.style.cssText = 'position:absolute;inset:0;overflow:hidden;pointer-events:none'
    container.appendChild(this.labelRoot)
    this.fade = document.createElement('div')
    this.fade.style.cssText = 'position:absolute;inset:0;background:#05070a;opacity:0;pointer-events:none;transition:opacity .55s ease'
    container.appendChild(this.fade)

    this.setupPost(w, h)
    this.bindInput()
    this.ro = new ResizeObserver(() => this.onResize())
    this.ro.observe(container)
  }

  /* ------------------------------------------------------------ setup */
  async build() {
    const tick = () => new Promise((r) => setTimeout(r, 16))
    const prog = (p: number, l: string) => this.ev.onProgress?.(p, l)
    prog(0.02, 'Preparing the sky')
    await tick()
    this.applyEnv(true)
    prog(0.08, 'Building the Rotterdam landscape')
    await tick()
    this.world = buildWorld((p, l) => prog(0.08 + p * 0.55, l))
    this.outdoor.add(this.world.group)
    await tick()
    prog(0.7, 'Pouring the concrete shaft')
    await tick()
    this.tower = buildTower()
    this.outdoor.add(this.tower.group)
    this.tower.group.add(this.tower.capsule)
    await tick()
    prog(0.82, 'Furnishing the crow’s nest')
    await tick()
    this.resto = buildRestaurant()
    this.tower.group.add(this.resto.group)
    this.lift = buildLift()
    this.lift.group.position.set(0, -4000, 0)
    this.lift.group.visible = false
    this.scene.add(this.lift.group)
    this.scene.add(this.outdoor)
    prog(0.92, 'Preparing hotspots')
    await tick()
    this.buildColliders()
    this.buildHotspots()
    this.applyEnv(true)
    this.genEnv()
    prog(0.97, 'Compiling shaders')
    await tick()
    this.renderer.compile(this.scene, this.camera)
    prog(1, 'Ready')
    this.started = true
    this.renderer.setAnimationLoop(this.loop)
  }

  private setupPost(w: number, h: number) {
    const rt = new THREE.WebGLRenderTarget(w * this.pr, h * this.pr, { type: THREE.HalfFloatType, samples: 4 })
    this.composer = new EffectComposer(this.renderer, rt)
    this.composer.setPixelRatio(this.pr)
    this.composer.setSize(w, h)
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.18, 0.75, 0.95)
    this.composer.addPass(this.bloom)
    this.composer.addPass(new OutputPass())
    this.grade = new ShaderPass(GRADE as any)
    this.composer.addPass(this.grade)
  }

  private onResize() {
    const w = this.container.clientWidth || 1
    const h = this.container.clientHeight || 1
    this.renderer.setSize(w, h)
    this.composer.setSize(w, h)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  setQuality(q: Quality) {
    this.quality = q
    this.basePR = Math.min(window.devicePixelRatio || 1, q === 'high' ? 1.75 : q === 'balanced' ? 1.25 : 1)
    this.pr = this.basePR
    this.renderer.setPixelRatio(this.pr)
    this.composer.setPixelRatio(this.pr)
    this.onResize()
    const ss = q === 'high' ? this.shadowSize : q === 'balanced' ? 2048 : 1024
    this.sun.shadow.mapSize.set(ss, ss)
    this.sun.shadow.map?.dispose()
    this.sun.shadow.map = null
    this.renderer.shadowMap.enabled = true
    this.bloom.enabled = q === 'high'
  }

  /* ------------------------------------------------------------ colliders & hotspots */
  private buildColliders() {
    for (const t of this.world.trees) {
      const k = `${Math.floor(t.x / 16)},${Math.floor(t.z / 16)}`
      const l = this.treeHash.get(k) ?? []
      l.push(t)
      this.treeHash.set(k, l)
    }
    const LR = T.lobbyR
    this.groundCircles.push([-7.4, 7.4, 1.9], [7.4, 7.4, 1.9], [-3.2, LR + 7.0, 0.4], [3.2, LR + 7.0, 0.4], [-4.1, 10.8, 0.85], [4.1, 10.8, 0.85], [-9, -3, 1.1], [9, -3, 1.1])
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU + 0.26
      this.groundCircles.push([Math.sin(a) * 9.6, Math.cos(a) * 9.6, 0.42])
    }
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU + 0.15
      this.groundCircles.push([Math.sin(a) * 26, Math.cos(a) * 26, 0.3])
    }
  }

  private buildHotspots() {
    const defs: Hotspot[] = [
      { id: 'nest', title: 'Crow’s nest', sub: 'Restaurant & terrace · 96 m', pos: () => new THREE.Vector3(-14, 93, 4), view: [58, 82, 74, 0, 92, 0] },
      { id: 'euroscope', title: 'Euroscope', sub: 'Rotating glass capsule', pos: () => new THREE.Vector3(0, this.euro.y + 3.5, 0), view: [26, this.euro.y + 6, 30, 0, this.euro.y, 0] },
      { id: 'mast', title: 'Space Tower', sub: 'Steel mast added 1970 · 185 m', pos: () => new THREE.Vector3(1.4, 150, 0), view: [34, 138, 52, 0, 146, 0] },
      { id: 'platform', title: 'Cantilever platform', sub: 'White deck at ~28 m', pos: () => new THREE.Vector3(Math.cos(0.62) * 11, 29, Math.sin(0.62) * 11), view: [42, 34, 46, 5, 27, 5] },
      { id: 'shaft', title: 'Concrete shaft', sub: '9 m bore · 30 cm walls', pos: () => new THREE.Vector3(5.2, 56, 0), view: [44, 52, 30, 0, 52, 0] },
      { id: 'lobby', title: 'Entrance pavilion', sub: 'Lifts to the crow’s nest', pos: () => new THREE.Vector3(0, 6.3, 21), view: [30, 8, 56, 0, 4, 10] },
    ]
    for (const h of defs) {
      const b = document.createElement('button')
      b.className = 'em-hot'
      b.innerHTML = `<span class="em-dot"></span><span class="em-card"><b>${h.title}</b><i>${h.sub}</i></span>`
      b.style.cssText = 'position:absolute;left:0;top:0;pointer-events:auto;display:none'
      b.addEventListener('click', (e) => {
        e.stopPropagation()
        if (this.mode === 'orbit' || this.mode === 'intro') this.flyTo(new THREE.Vector3(h.view[0], h.view[1], h.view[2]), new THREE.Vector3(h.view[3], h.view[4], h.view[5]), 2.2)
      })
      this.labelRoot.appendChild(b)
      h.el = b
      this.hotspots.push(h)
    }
  }

  /* ------------------------------------------------------------ environment */
  setTime(k: TimeKey) {
    this.timeKey = k
    this.tgt = PRESETS[k]
    this.transitioning = 3
    this.envDirty = true
  }
  get time() {
    return this.timeKey
  }

  private applyEnv(snap = false, dt = 0) {
    const e = this.tgt
    const f = snap ? 1 : 1 - Math.exp(-dt * 1.8)
    let delta = 0
    for (const k of NUM) {
      const nv = lerp(this.cur[k], e[k], f)
      delta += Math.abs(nv - this.cur[k]) / (Math.abs(e[k]) + 1)
      this.cur[k] = nv
    }
    const tmp = new THREE.Color()
    for (const k of COL) {
      tmp.set(e[k])
      this.curC[k].lerp(tmp, f)
    }
    if (!snap && delta > 0.0004) this.envDirty = true
    const c = this.cur
    const el = (c.sunEl * Math.PI) / 180
    const az = (c.sunAz * Math.PI) / 180
    const dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el))
    this.lightDir = dir
    const u = this.sky.mat.uniforms
    u.uSun.value.copy(dir)
    u.uZenith.value.copy(this.curC.zen)
    u.uHorizon.value.copy(this.curC.hor)
    u.uGround.value.copy(this.curC.gnd)
    u.uSunColor.value.copy(this.curC.sunCol).multiplyScalar(1.0)
    u.uCloudLit.value.copy(this.curC.cl).multiplyScalar(1.12)
    u.uCloudDark.value.copy(this.curC.cd)
    u.uCover.value = c.cover
    u.uNight.value = c.night
    this.fog.color.copy(this.curC.hor)
    this.fog.density = c.fogD
    this.scene.background = this.curC.hor
    this.sun.color.copy(this.curC.sunCol)
    this.hemi.color.copy(this.curC.hemiSky)
    this.hemi.groundColor.copy(this.curC.hemiGnd)
    facadeUniforms.uNight.value = c.night
  }
  private lightDir = new THREE.Vector3(0, 1, 0)

  private genEnv() {
    const u = this.sky.mat.uniforms
    u.uDisk.value = 1.5
    this.envRT?.dispose()
    this.envRT = this.pmrem.fromScene(this.skyEnvScene, 0, 1, 6000)
    this.scene.environment = this.envRT.texture
    u.uDisk.value = 14
    this.envDirty = false
  }

  /* ------------------------------------------------------------ input */
  private onKey = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement)?.tagName === 'INPUT') return
    const k = e.key.toLowerCase()
    const down = e.type === 'keydown'
    this.keys[k] = down
    if (k === 'shift') this.keys.shift = down
    if (down && k === 'e') this.interact()
    if (down && k === ' ' && this.mode === 'walk') e.preventDefault()
    if (down && e.repeat) return
    if (down && k === 'o') this.setMode(this.mode === 'orbit' ? 'walk' : 'orbit')
  }
  private onWheel = (e: WheelEvent) => {
    if (this.mode === 'walk' || this.mode === 'euroscope') {
      this.fov = clamp(this.fov + e.deltaY * 0.03, 32, 82)
      e.preventDefault()
    }
  }
  private onDown = (e: PointerEvent) => {
    this.audio.resume()
    if (this.mode === 'orbit' || this.mode === 'intro' || this.mode === 'lift') return
    const cv = this.renderer.domElement
    const r = cv.getBoundingClientRect()
    if (e.pointerType === 'touch' && e.clientX - r.left < r.width * 0.42 && this.joy.id < 0) {
      this.joy = { x: 0, y: 0, id: e.pointerId, ox: e.clientX, oy: e.clientY }
    } else if (this.look.id < 0) {
      this.look = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0 }
    }
    cv.setPointerCapture(e.pointerId)
  }
  private onMove = (e: PointerEvent) => {
    if (this.mode === 'orbit' || this.mode === 'intro') return
    if (e.pointerId === this.joy.id) {
      this.joy.x = clamp((e.clientX - this.joy.ox) / 60, -1, 1)
      this.joy.y = clamp((e.clientY - this.joy.oy) / 60, -1, 1)
      return
    }
    if (this.locked) {
      this.rotateView(e.movementX, e.movementY)
      return
    }
    if (e.pointerId === this.look.id) {
      const dx = e.clientX - this.look.x
      const dy = e.clientY - this.look.y
      this.look.x = e.clientX
      this.look.y = e.clientY
      this.look.moved += Math.abs(dx) + Math.abs(dy)
      this.rotateView(dx * (e.pointerType === 'touch' ? 1.4 : 1), dy * (e.pointerType === 'touch' ? 1.4 : 1))
    }
  }
  private onUp = (e: PointerEvent) => {
    if (e.pointerId === this.joy.id) this.joy = { x: 0, y: 0, id: -1, ox: 0, oy: 0 }
    if (e.pointerId === this.look.id) {
      if (this.look.moved < 4 && e.pointerType === 'mouse' && (this.mode === 'walk' || this.mode === 'euroscope')) {
        try {
          const p = this.renderer.domElement.requestPointerLock() as unknown as Promise<void> | undefined
          p?.catch?.(() => {})
        } catch {
          /* pointer lock unavailable */
        }
      }
      this.look.id = -1
    }
  }
  private onLock = () => {
    this.locked = document.pointerLockElement === this.renderer.domElement
  }
  private rotateView(dx: number, dy: number) {
    const s = 0.0021 * (this.fov / 62)
    if (this.mode === 'euroscope') {
      this.euro.look -= dx * s
    } else this.yaw -= dx * s
    this.pitch = clamp(this.pitch - dy * s, -1.5, 1.5)
  }
  private bindInput() {
    window.addEventListener('keydown', this.onKey)
    window.addEventListener('keyup', this.onKey)
    const cv = this.renderer.domElement
    cv.addEventListener('pointerdown', this.onDown)
    cv.addEventListener('pointermove', this.onMove)
    cv.addEventListener('pointerup', this.onUp)
    cv.addEventListener('pointercancel', this.onUp)
    cv.addEventListener('wheel', this.onWheel, { passive: false })
    document.addEventListener('pointerlockchange', this.onLock)
    this.controls.addEventListener('start', () => {
      this.controls.autoRotate = false
      this.flight = null
    })
  }

  /* ------------------------------------------------------------ public control */
  async enter() {
    this.audio.start()
    await this.teleport('approach')
  }
  setMuted(m: boolean) {
    this.audio.setMuted(m)
  }
  interact() {
    if (this.busy) return
    if (this.mode === 'euroscope') return void this.leaveEuroscope()
    this.action?.()
  }

  private async fadeOut() {
    this.fade.style.opacity = '1'
    await new Promise((r) => setTimeout(r, 580))
  }
  private async fadeIn() {
    this.fade.style.opacity = '0'
    await new Promise((r) => setTimeout(r, 450))
  }

  setMode(m: 'walk' | 'orbit') {
    if (this.busy || this.mode === 'lift') return
    if (this.mode === 'euroscope') return
    if (m === 'orbit' && this.mode !== 'orbit') {
      if (document.pointerLockElement) document.exitPointerLock()
      const p = this.camera.position.clone()
      const dir = new THREE.Vector3()
      this.camera.getWorldDirection(dir)
      this.mode = 'orbit'
      this.camera.fov = 46
      this.camera.updateProjectionMatrix()
      const target = new THREE.Vector3(0, Math.max(40, Math.min(95, p.y + 8)), 0)
      const out = new THREE.Vector3(p.x, 0, p.z)
      if (out.length() < 5) out.set(1, 0, 1)
      out.normalize()
      const camTo = target.clone().addScaledVector(out, 120)
      camTo.y = target.y + 18
      this.camera.position.copy(p)
      this.controls.target.copy(p.clone().add(dir.multiplyScalar(30)))
      this.controls.enabled = true
      this.flyTo(camTo, target, 2.4)
      this.camera.near = 1
      this.camera.updateProjectionMatrix()
    } else if (m === 'walk' && this.mode === 'orbit') {
      void this.teleport('approach')
    }
  }

  flyTo(p: THREE.Vector3, t: THREE.Vector3, dur = 2.2, done?: () => void) {
    this.controls.autoRotate = false
    this.flight = { t: 0, dur, fp: this.camera.position.clone(), ft: this.controls.target.clone(), tp: p, tt: t, done }
  }

  async teleport(id: string) {
    if (this.busy) return
    this.busy = true
    if (document.pointerLockElement) document.exitPointerLock()
    const aerial = id === 'aerial'
    if (this.mode === 'orbit' && !aerial && this.flight === null) {
      // quick dissolve is fine
    }
    await this.fadeOut()
    this.controls.autoRotate = false
    this.flight = null
    this.riding = false
    this.showWorld(true)
    this.vel.set(0, 0, 0)
    this.camera.fov = 62
    this.fov = 62
    if (aerial) {
      this.mode = 'orbit'
      this.camera.near = 1
      this.camera.fov = 46
      this.camera.position.set(150, 120, 215)
      this.controls.target.set(0, 80, 0)
      this.controls.enabled = true
      this.controls.update()
    } else {
      this.controls.enabled = false
      this.camera.near = 0.1
      this.mode = 'walk'
      switch (id) {
        case 'approach':
          this.setWalk('ground', 0, 62, 0, 0.55)
          break
        case 'plaza':
          this.setWalk('ground', 9, 24, 0.5, 0.75)
          break
        case 'lobby':
          this.setWalk('ground', 0, 12.1, 0, 0.0)
          break
        case 'restaurant':
          this.setWalk('restaurant', 0.5, 7.4, Math.PI, 0)
          break
        case 'terrace':
          this.setWalk('terrace', 11.0, -4.5, -1.1, 0.02)
          break
        case 'platform':
          this.setWalk('platform', 4.3, 2.6, -1.2, 0.0)
          break
        case 'euroscope':
          this.boardEuroscope(true)
          break
      }
    }
    this.camera.updateProjectionMatrix()
    this.envDirty = true
    await this.fadeIn()
    this.busy = false
  }

  private setWalk(loc: Loc, x: number, z: number, yaw: number, pitch: number) {
    this.loc = loc
    this.floorY = loc === 'ground' ? 0 : loc === 'restaurant' ? T.floorY : loc === 'terrace' ? T.terraceY : T.platY
    this.pos.set(x, this.floorY, z)
    this.yaw = yaw
    this.pitch = pitch
    this.camera.position.set(x, this.floorY + 1.65, z)
  }

  private showWorld(on: boolean) {
    this.outdoor.visible = on
    this.sky.mesh.visible = on
    this.lift.group.visible = !on
  }

  /* ------------------------------------------------------------ rides */
  private async rideLift(up: boolean) {
    if (this.busy) return
    this.busy = true
    await this.fadeOut()
    this.mode = 'lift'
    this.showWorld(false)
    this.controls.enabled = false
    this.camera.near = 0.05
    this.camera.fov = 66
    this.camera.updateProjectionMatrix()
    this.lift.group.position.set(0, -4000, 0)
    this.camera.position.set(0, -4000 + 1.6, -0.2)
    this.yaw = Math.PI
    this.pitch = 0
    this.lift.doorL.position.x = -0.375
    this.lift.doorR.position.x = 0.375
    const from = up ? 0 : T.floorY
    const to = up ? T.floorY : 0
    this.liftRide = { t: 0, dur: 11, from, to, up, done: () => {} }
    this.audio.setLift(true)
    this.lift.setDisplay(from, up ? '▲' : '▼')
    await this.fadeIn()
    this.busy = false
    await new Promise<void>((res) => (this.liftRide.done = res))
    this.busy = true
    // arrive
    this.audio.setLift(false)
    // doors open
    await new Promise((r) => setTimeout(r, 500))
    this.lift.doorL.position.x = -0.9
    this.lift.doorR.position.x = 0.9
    await new Promise((r) => setTimeout(r, 1100))
    await this.fadeOut()
    this.showWorld(true)
    this.camera.fov = 62
    this.mode = 'walk'
    this.camera.near = 0.1
    this.camera.updateProjectionMatrix()
    if (up) this.setWalk('restaurant', 0, 7.3, Math.PI, 0)
    else this.setWalk('ground', 0, 8.8, 0, 0)
    await this.fadeIn()
    this.busy = false
  }

  private async climbStairs(up: boolean) {
    if (this.busy) return
    this.busy = true
    await this.fadeOut()
    if (up) this.setWalk('terrace', -11.6, 0, Math.PI / 2, 0.03)
    else this.setWalk('restaurant', -7.0, 0, Math.PI / 2, 0)
    await this.fadeIn()
    this.busy = false
  }

  private boardEuroscope(silent = false) {
    this.mode = 'euroscope'
    this.riding = true
    this.euro = { ...this.euro, y: T.euroMin, phase: 'wait-bottom', timer: 3.5, off: 0, look: 0 }
    this.camera.near = 0.1
    this.controls.enabled = false
    this.pitch = 0
    this.euro.look = 0
    if (!silent) this.camera.fov = 66
  }
  private async enterEuroscope() {
    if (this.busy) return
    this.busy = true
    await this.fadeOut()
    this.boardEuroscope()
    await this.fadeIn()
    this.busy = false
  }
  private async leaveEuroscope() {
    if (this.busy) return
    this.busy = true
    await this.fadeOut()
    this.riding = false
    this.mode = 'walk'
    this.camera.fov = 62
    this.fov = 62
    this.euro.phase = 'wait-bottom'
    this.euro.timer = 3
    this.euro.y = T.euroMin
    this.setWalk('platform', 4.3, 2.6, -1.2, 0.0)
    await this.fadeIn()
    this.busy = false
  }

  /* ------------------------------------------------------------ movement & collisions */
  private pushCircle(x: number, z: number, cx: number, cz: number, r: number): [number, number] {
    const dx = x - cx
    const dz = z - cz
    const d2 = dx * dx + dz * dz
    if (d2 < r * r) {
      const d = Math.sqrt(d2) || 0.0001
      return [cx + (dx / d) * r, cz + (dz / d) * r]
    }
    return [x, z]
  }

  private resolve(px: number, pz: number, x: number, z: number): [number, number] {
    const R = Math.hypot
    if (this.loc === 'ground') {
      const w = this.world
      if (w.inWater(x, z, 1)) {
        if (!w.inWater(x, pz, 1)) z = pz
        else if (!w.inWater(px, z, 1)) x = px
        else {
          x = px
          z = pz
        }
      }
      const rb = R(x, z)
      if (rb > 335) {
        x *= 335 / rb
        z *= 335 / rb
      }
      ;[x, z] = this.pushCircle(x, z, 0, 0, 6.05)
      const LR = T.lobbyR
      const r = R(x, z)
      const th = Math.atan2(x, z)
      if (r > LR - 0.4 && r < LR + 0.4 && Math.abs(th) > 0.19) {
        const rr = R(px, pz) < LR ? LR - 0.4 : LR + 0.4
        x = Math.sin(th) * rr
        z = Math.cos(th) * rr
      }
      // door posts
      for (const s of [-1, 1]) [x, z] = this.pushCircle(x, z, Math.sin(s * 0.18) * LR, Math.cos(s * 0.18) * LR, 0.18)
      if (R(x, z) < 45) for (const [cx, cz, cr] of this.groundCircles) [x, z] = this.pushCircle(x, z, cx, cz, cr + 0.25)
      const kx = Math.floor(x / 16)
      const kz = Math.floor(z / 16)
      for (let i = -1; i <= 1; i++)
        for (let j = -1; j <= 1; j++) {
          const l = this.treeHash.get(`${kx + i},${kz + j}`)
          if (l) for (const t of l) [x, z] = this.pushCircle(x, z, t.x, t.z, t.r + 0.3)
        }
    } else if (this.loc === 'restaurant') {
      let r = R(x, z)
      if (r > 13.75 || r < 5.85) {
        const rr = clamp(r, 5.85, 13.75)
        x = (x / r) * rr
        z = (z / r) * rr
      }
      for (const [cx, cz, cr] of this.resto.colliders) [x, z] = this.pushCircle(x, z, cx, cz, cr * 0.8)
      r = R(x, z)
    } else {
      const inCor = (a: number, b: number) => Math.abs(b) < 0.95 && a > T.stairX0 - 0.3 && a < T.stairX1 + 0.2
      const onPlat = this.floorY > T.platY - 1
      if (inCor(x, z) !== inCor(px, pz)) {
        // may only enter / leave the stair at its ends
        const ok = x > T.stairX1 - 0.1 || x < T.stairX0 + 0.1
        if (!ok) z = pz
      }
      const cor = inCor(x, z)
      if (!cor) {
        const r = R(x, z)
        const lo = onPlat ? 3.95 : 5.75
        const hi = onPlat ? 5.9 : 14.65
        if (r > hi || r < lo) {
          const rr = clamp(r, lo, hi)
          x = (x / r) * rr
          z = (z / r) * rr
        }
        if (!onPlat) {
          // vestibule box
          if (x > -9.5 && x < -4.9 && z > -2.2 && z < 2.2) {
            const dl = x + 9.5
            const dr = -4.9 - x
            const dd = z + 2.2
            const du = 2.2 - z
            const m = Math.min(dl, dr, dd, du)
            if (m === dl) x = -9.5
            else if (m === dr) x = -4.9
            else if (m === dd) z = -2.2
            else z = 2.2
          }
          for (const [cx, cz] of [[-3.2, 1.5], [-3.9, 1.0]]) [x, z] = this.pushCircle(x, z, cx, cz, 0.6)
        }
      }
    }
    return [x, z]
  }

  private floorAt(x: number, z: number) {
    if (this.loc === 'ground') {
      return R2(x, z) < T.lobbyR ? 0.03 : 0.0
    }
    if (this.loc === 'restaurant') return T.floorY + 0.01
    const inCor = Math.abs(z) < 0.95 && x > T.stairX0 - 0.3 && x < T.stairX1 + 0.2
    if (inCor) {
      const t = clamp((T.stairX1 - x) / (T.stairX1 - T.stairX0), 0, 1)
      const stairY = T.terraceY + t * (T.platY - T.terraceY)
      return x < T.stairX0 ? T.platY : stairY
    }
    return this.floorY > T.platY - 1 ? T.platY : T.terraceY
  }

  private updateWalk(dt: number) {
    const k = this.keys
    let f = (k.w || k.arrowup ? 1 : 0) - (k.s || k.arrowdown ? 1 : 0) - this.joy.y
    let s = (k.d || k.arrowright ? 1 : 0) - (k.a || k.arrowleft ? 1 : 0) + this.joy.x
    const len = Math.hypot(f, s)
    if (len > 1) {
      f /= len
      s /= len
    }
    if (k.q) this.yaw += dt * 1.6
    if (k.arrowleft && false) this.yaw += dt
    const spd = (k.shift ? 5.2 : 2.6) * (this.loc === 'platform' ? 0.8 : 1)
    const dx = -Math.sin(this.yaw) * f + Math.cos(this.yaw) * s
    const dz = -Math.cos(this.yaw) * f - Math.sin(this.yaw) * s
    this.vel.x = lerp(this.vel.x, dx * spd, 1 - Math.exp(-9 * dt))
    this.vel.z = lerp(this.vel.z, dz * spd, 1 - Math.exp(-9 * dt))
    const px = this.pos.x
    const pz = this.pos.z
    let nx = px + this.vel.x * dt
    let nz = pz + this.vel.z * dt
    ;[nx, nz] = this.resolve(px, pz, nx, nz)
    this.pos.x = nx
    this.pos.z = nz
    const fy = this.floorAt(nx, nz)
    this.floorY = lerp(this.floorY, fy, 1 - Math.exp(-14 * dt))
    if (Math.abs(this.floorY - fy) < 0.002) this.floorY = fy
    const moved = Math.hypot(nx - px, nz - pz)
    this.bob += moved * 2.3
    const bobY = Math.sin(this.bob) * 0.022 * clamp(moved / (spd * dt + 1e-5), 0, 1)
    this.camera.position.set(nx, this.floorY + 1.65 + bobY, nz)
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ')
    this.pos.y = this.floorY
  }

  /* ------------------------------------------------------------ euroscope */
  private updateEuro(dt: number) {
    const e = this.euro
    e.rot += dt * 0.09
    const lo = T.euroMin
    const hi = T.euroMax
    e.timer -= dt
    const speed = 3.4
    if (e.phase === 'wait-bottom' && e.timer <= 0) e.phase = 'up'
    else if (e.phase === 'up') {
      const near = Math.min(e.y - lo, hi - e.y)
      e.y += speed * clamp(0.25 + near / 8, 0.25, 1) * dt
      if (e.y >= hi) {
        e.y = hi
        e.phase = 'wait-top'
        e.timer = 14
      }
    } else if (e.phase === 'wait-top' && e.timer <= 0) e.phase = 'down'
    else if (e.phase === 'down') {
      const near = Math.min(e.y - lo, hi - e.y)
      e.y -= speed * clamp(0.25 + near / 8, 0.25, 1) * dt
      if (e.y <= lo) {
        e.y = lo
        e.phase = 'wait-bottom'
        e.timer = 6
      }
    }
    this.tower.capsule.position.y = e.y
    this.tower.capsule.rotation.y = e.rot
    if (this.mode === 'euroscope') {
      const k = this.keys
      if (k.a || k.arrowleft) e.off -= dt * 0.5
      if (k.d || k.arrowright) e.off += dt * 0.5
      const a = e.rot + e.off + Math.PI / 28
      const r = T.euroR - 0.65
      this.camera.position.set(Math.sin(a) * r, e.y + 1.6, Math.cos(a) * r)
      this.camera.rotation.set(this.pitch, a + Math.PI + e.look, 0, 'YXZ')
      this.pos.set(this.camera.position.x, e.y, this.camera.position.z)
    }
  }

  /* ------------------------------------------------------------ interactions */
  private updateInteractions() {
    this.prompt = null
    this.action = null
    if (this.mode === 'euroscope') {
      this.prompt = 'Leave the Euroscope · press E'
      return
    }
    if (this.mode !== 'walk' || this.busy) return
    const { x, z } = this.pos
    const near = (cx: number, cz: number, r: number) => Math.hypot(x - cx, z - cz) < r
    if (this.loc === 'ground' && near(0, 7.6, 3.2)) {
      this.prompt = 'Take the lift to the crow’s nest · E'
      this.action = () => void this.rideLift(true)
    } else if (this.loc === 'restaurant' && near(0, 6.6, 2.6)) {
      this.prompt = 'Take the lift down to the entrance · E'
      this.action = () => void this.rideLift(false)
    } else if (this.loc === 'restaurant' && near(-6.3, 0, 2.2)) {
      this.prompt = 'Climb the stairs to the roof terrace · E'
      this.action = () => void this.climbStairs(true)
    } else if (this.loc === 'terrace' && near(-10.4, 0, 2.6)) {
      this.prompt = 'Take the stairs down to the restaurant · E'
      this.action = () => void this.climbStairs(false)
    } else if (this.loc === 'terrace' && this.floorY > T.platY - 1 && Math.hypot(x, z) < 5.95) {
      this.prompt = 'Board the Euroscope (up to 185 m) · E'
      this.action = () => void this.enterEuroscope()
    } else if (this.loc === 'terrace' && near(T.stairX1 + 1.2, 0, 2.2) && this.floorY < T.platY - 1) {
      this.prompt = 'Stairs up to the Euroscope station →'
    }
  }

  private placeName() {
    if (this.mode === 'euroscope') return 'Euroscope capsule'
    if (this.mode === 'lift') return 'Elevator'
    if (this.mode === 'orbit' || this.mode === 'intro') return 'Aerial view'
    if (this.loc === 'restaurant') return 'Crow’s nest restaurant'
    if (this.loc === 'terrace') return this.floorY > T.platY - 1 ? 'Euroscope station' : 'Viewing terrace'
    const r = Math.hypot(this.pos.x, this.pos.z)
    if (r < T.lobbyR - 0.4) return 'Entrance lobby'
    if (r < 36) return 'Euromast plaza'
    return 'Het Park'
  }

  /* ------------------------------------------------------------ frame */
  private loop = () => {
    if (this.disposed) return
    const dt = Math.min(this.clock.getDelta(), 0.1)
    const t = this.clock.elapsedTime
    this.frame(dt, t)
  }

  private frame(dt: number, t: number) {
    // fps governor
    this.fpsAcc += dt
    this.fpsN++
    if (this.fpsAcc > 0.5) {
      this.fps = this.fpsN / this.fpsAcc
      this.fpsAcc = 0
      this.fpsN = 0
      if (this.fps < 26 && this.pr > 0.8) {
        this.slowT += 1
        if (this.slowT >= 3) {
          this.slowT = 0
          this.pr = Math.max(0.75, this.pr - 0.25)
          this.renderer.setPixelRatio(this.pr)
          this.composer.setPixelRatio(this.pr)
          this.onResize()
        }
      } else this.slowT = 0
    }

    // environment easing
    if (this.transitioning > 0) {
      this.transitioning -= dt
      this.applyEnv(false, dt)
    }
    this.envAcc += dt
    if (this.envDirty && this.envAcc > 0.45) {
      this.envAcc = 0
      this.genEnv()
    }
    this.sky.mat.uniforms.uTime.value = t

    // walking / modes
    this.world.update(t, dt)
    this.tower.update(t, dt)
    this.updateEuro(dt)
    if (this.mode === 'walk') this.updateWalk(dt)
    else if (this.mode === 'lift') this.updateLift(dt, t)
    else this.updateOrbit(dt)
    this.updateInteractions()

    // indoor factor
    const inRest = this.mode === 'walk' && this.loc === 'restaurant'
    const inLobby = this.mode === 'walk' && this.loc === 'ground' && Math.hypot(this.pos.x, this.pos.z) < T.lobbyR - 0.3
    this.indoorT = this.mode === 'lift' ? 1 : inRest ? 1 : inLobby ? 0.55 : 0
    this.indoor = lerp(this.indoor, this.indoorT, 1 - Math.exp(-dt * 3))
    this.updateLights()

    this.audio.update(this.mode === 'lift' ? this.liftAlt() : Math.max(0, this.camera.position.y), this.indoor, this.mode === 'lift')
    this.updateShadow()
    this.updateHotspots()

    // render
    const c = this.cur
    const exp = c.expo * (this.mode === 'lift' ? 1.0 : 1)
    this.renderer.toneMappingExposure = exp
    this.bloom.strength = c.bloom * (this.timeKey === 'night' ? 1 : 1)
    this.grade.uniforms.uTime.value = t
    // keep the sky centred on the camera
    this.sky.mesh.position.copy(this.camera.position)
    if (this.quality === 'low') this.renderer.render(this.scene, this.camera)
    else this.composer.render(dt)

    this.hudAcc += dt
    if (this.hudAcc > 0.12) {
      this.hudAcc = 0
      const fwd = new THREE.Vector3()
      this.camera.getWorldDirection(fwd)
      const bearing = (((Math.atan2(fwd.x, -fwd.z) * 180) / Math.PI) + 360) % 360
      const e = this.euro
      this.ev.onHud?.({
        mode: this.mode,
        place: this.placeName(),
        altitude: this.mode === 'lift' ? this.liftAlt() : Math.max(0, this.camera.position.y),
        prompt: this.prompt,
        bearing,
        fps: Math.round(this.fps),
        euro: e.phase === 'up' ? `Ascending · ${Math.round(e.y + 0)} m` : e.phase === 'down' ? `Descending · ${Math.round(e.y)} m` : e.phase === 'wait-top' ? 'At the top · 185 m' : 'Boarding',
        locked: this.locked,
      })
    }
  }

  private liftAlt() {
    const l = this.liftRide
    return lerp(l.from, l.to, ease(clamp(l.t / l.dur, 0, 1)))
  }

  private updateLift(dt: number, t: number) {
    const l = this.liftRide
    if (l.t < l.dur) {
      l.t += dt
      const p = ease(clamp(l.t / l.dur, 0, 1))
      const alt = lerp(l.from, l.to, p)
      // faster feel mid-ride
      this.lift.setDisplay(alt, l.up ? '▲' : '▼')
      if (l.t >= l.dur) l.done()
    }
    const vib = 0.0025 * (l.t < l.dur ? 1 : 0)
    this.camera.position.set(Math.sin(t * 31) * vib, -4000 + 1.62 + Math.sin(t * 47) * vib, -0.25)
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ')
  }

  private updateOrbit(dt: number) {
    if (this.mode === 'euroscope') return
    if (this.flight) {
      const f = this.flight
      f.t += dt
      const k = ease(clamp(f.t / f.dur, 0, 1))
      this.camera.position.lerpVectors(f.fp, f.tp, k)
      this.controls.target.lerpVectors(f.ft, f.tt, k)
      if (f.t >= f.dur) {
        const d = f.done
        this.flight = null
        d?.()
      }
    }
    if (this.mode === 'orbit' || this.mode === 'intro') {
      this.controls.update()
      // never go below ground
      if (this.camera.position.y < 1.5) this.camera.position.y = 1.5
      this.camera.near = clamp(this.camera.position.distanceTo(this.controls.target) * 0.02, 0.5, 4)
      this.camera.updateProjectionMatrix()
    }
  }

  private updateLights() {
    const day = 1 - this.cur.night
    const lift = this.mode === 'lift'
    // sun
    const sunVis = lift ? 0 : 1
    const elev = this.cur.sunEl
    const horizonFade = clamp((elev + 2) / 8, 0.0, 1)
    this.sun.intensity = this.cur.sunInt * sunVis * (this.timeKey === 'golden' ? 1 : horizonFade)
    this.scene.environmentIntensity = this.cur.env * (1 - 0.62 * this.indoor)
    this.hemi.intensity = this.cur.hemi * (lift ? 0 : 1) * (1 - 0.5 * this.indoor)
    this.amb.intensity = this.indoor * (0.55 + 0.25 * (1 - day)) + (lift ? 0.5 : 0)
    setNightGlow(this.cur.night, this.indoor)
    // interior lights
    const rest = this.mode === 'walk' && this.loc === 'restaurant'
    const lobby = this.mode === 'walk' && this.loc === 'ground' && this.indoor > 0.05
    const base = (14 + 40 * (1 - day)) * 1.0
    const centre = rest ? { r: 9.5, y: T.ceilY - 1.0, fy: T.floorY } : { r: 8.6, y: 3.3, fy: 0 }
    this.interiorLights.forEach((l, i) => {
      const a = (i / 3) * TAU + 0.5
      l.position.set(Math.sin(a) * centre.r, centre.y, Math.cos(a) * centre.r)
      l.intensity = lerp(l.intensity, rest || lobby ? base : 0, 0.1)
    })
    if (lift) {
      this.lift.light.intensity = 2.2
    }
  }

  private updateShadow() {
    const focus = this.mode === 'orbit' || this.mode === 'intro' ? this.controls.target : this.camera.position
    const dist = this.camera.position.distanceTo(this.controls.target)
    let E = 70
    if (this.mode === 'orbit' || this.mode === 'intro') E = clamp(dist * 0.62, 70, 520)
    else if (this.mode === 'walk') E = this.loc === 'ground' ? (this.indoor > 0.3 ? 40 : 80) : 48
    else if (this.mode === 'euroscope') E = 40
    if (this.timeKey === 'golden' && this.mode !== 'orbit') E = Math.max(E, 120)
    const cam = this.sun.shadow.camera
    cam.left = -E
    cam.right = E
    cam.top = E
    cam.bottom = -E
    cam.near = 5
    cam.far = 1400
    cam.updateProjectionMatrix()
    const d = this.lightDir
    const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), d).normalize()
    const up = new THREE.Vector3().crossVectors(d, right).normalize()
    const texel = (2 * E) / this.sun.shadow.mapSize.x
    const fx = focus.dot(right)
    const fy = focus.dot(up)
    const fz = focus.dot(d)
    const sx = Math.round(fx / texel) * texel
    const sy = Math.round(fy / texel) * texel
    const snapped = right.clone().multiplyScalar(sx).addScaledVector(up, sy).addScaledVector(d, fz)
    this.sun.target.position.copy(snapped)
    this.sun.position.copy(snapped).addScaledVector(d, 700)
    this.sun.target.updateMatrixWorld()
    this.sun.shadow.normalBias = clamp(E * 0.00045, 0.03, 0.22)
  }

  private updateHotspots() {
    const show = this.mode === 'orbit' && !this.flight
    const v = new THREE.Vector3()
    const w = this.container.clientWidth
    const h = this.container.clientHeight
    for (const hs of this.hotspots) {
      const el = hs.el!
      if (!show) {
        if (el.style.display !== 'none') el.style.display = 'none'
        continue
      }
      v.copy(hs.pos()).project(this.camera)
      const vis = v.z < 1 && v.z > -1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05
      if (!vis) {
        el.style.display = 'none'
        continue
      }
      el.style.display = 'block'
      el.style.transform = `translate(${(v.x * 0.5 + 0.5) * w}px, ${(-v.y * 0.5 + 0.5) * h}px) translate(-9px,-9px)`
    }
  }

  /* ------------------------------------------------------------ teardown */
  dispose() {
    this.disposed = true
    this.renderer.setAnimationLoop(null)
    window.removeEventListener('keydown', this.onKey)
    window.removeEventListener('keyup', this.onKey)
    document.removeEventListener('pointerlockchange', this.onLock)
    this.ro.disconnect()
    this.controls.dispose()
    this.audio.dispose()
    this.envRT?.dispose()
    this.pmrem.dispose()
    this.composer.dispose()
    this.renderer.dispose()
    this.renderer.domElement.remove()
    this.labelRoot.remove()
    this.fade.remove()
  }
  get ready() {
    return this.started
  }
  /** debug: stop the loop and render frames manually (used for automated screenshots) */
  debugStep(n = 1, dt = 0.05) {
    this.renderer.setAnimationLoop(null)
    for (let i = 0; i < n; i++) this.frame(dt, this.clock.elapsedTime + (i + 1) * dt)
  }
  get isRiding() {
    return this.riding
  }
}

const R2 = (x: number, z: number) => Math.hypot(x, z)

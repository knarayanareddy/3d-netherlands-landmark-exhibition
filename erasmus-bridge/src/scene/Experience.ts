import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { Water } from './Water'
import { Atmosphere, TimeOfDay } from './sky'
import { createMaterials, Mats } from './materials'
import { buildBridge, BridgeParts } from './bridge'
import { buildCity, CityParts } from './city'
import { buildTraffic, Traffic } from './traffic'
import { Ambience } from './audio'
import { HOTSPOTS, LAND_Y, RAIL_Z, VIEWPOINTS, WATER_X0, WATER_X1, X_END, X_START, DECK_HALF, PYLON, Viewpoint, deckY } from './config'

export type Mode = 'orbit' | 'walk' | 'fly'
export type { TimeOfDay }

export interface Status {
  mode: Mode
  along: number
  z: number
  y: number
}
export interface Events {
  onProgress?: (p: number, label: string) => void
  onReady?: () => void
  onMode?: (m: Mode) => void
  onStatus?: (s: Status) => void
  onHotspot?: (id: string) => void
  onViewpoint?: (id: string | null) => void
  onLock?: (locked: boolean) => void
  onFps?: (fps: number, pr: number) => void
}

const Y = new THREE.Vector3(0, 1, 0)
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const tick = () => new Promise<void>((r) => setTimeout(r, 16))

interface Flight {
  t: number
  dur: number
  fp: THREE.Vector3
  tp: THREE.Vector3
  fl: THREE.Vector3
  tl: THREE.Vector3
  arc: number
  done: () => void
}

export class Experience {
  renderer: THREE.WebGLRenderer
  scene = new THREE.Scene()
  camera: THREE.PerspectiveCamera
  controls: OrbitControls
  mode: Mode = 'orbit'
  private composer!: EffectComposer
  private bloom!: UnrealBloomPass
  private grade!: ShaderPass
  private sun: THREE.DirectionalLight
  private hemi: THREE.HemisphereLight
  private fog = new THREE.FogExp2('#c9dcec', 0.0004)
  private atmos!: Atmosphere
  private M!: Mats
  private bridge!: BridgeParts
  private city!: CityParts
  private traffic!: Traffic
  private water!: Water
  private audio = new Ambience()
  private clock = new THREE.Clock()
  private time = 0
  private disposed = false
  ready = false
  // lights
  private lampPool: THREE.SpotLight[] = []
  private flood: THREE.SpotLight[] = []
  private poolDecals!: THREE.InstancedMesh
  // input
  private keys: Record<string, boolean> = {}
  private yaw = -Math.PI / 2
  private pitch = 0
  private walk = { x: 30, z: 12.2, y: 17 }
  private moveIn = { x: 0, y: 0 }
  private locked = false
  private dragging = false
  private lastPtr = { x: 0, y: 0 }
  private stepAcc = 0
  private bob = 0
  private speed = 0
  private flySpeed = 14
  private flight: Flight | null = null
  private labelRoot: HTMLDivElement
  private labels: { id: string; el: HTMLButtonElement; pos: THREE.Vector3 }[] = []
  private hudAcc = 0
  private frames = 0
  private fpsAcc = 0
  private pr: number
  private maxPr: number
  private prCool = 0
  private shadowSize = 4096
  private ro: ResizeObserver
  private tmpV = new THREE.Vector3()
  private tmpV2 = new THREE.Vector3()
  currentViewpoint: string | null = null

  constructor(private container: HTMLElement, private ev: Events = {}) {
    const w = container.clientWidth || 1
    const h = container.clientHeight || 1
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: false })
    this.maxPr = Math.min(window.devicePixelRatio || 1, 2)
    this.pr = Math.min(this.maxPr, 1.5)
    this.renderer.setPixelRatio(this.pr)
    this.renderer.setSize(w, h)
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 0.62
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    const cv = this.renderer.domElement
    cv.style.touchAction = 'none'
    cv.style.display = 'block'
    cv.className = 'absolute inset-0 h-full w-full outline-none'
    container.appendChild(cv)

    this.camera = new THREE.PerspectiveCamera(52, w / h, 0.25, 6500)
    this.camera.rotation.order = 'YXZ'
    this.camera.position.set(30, 14, -245)
    this.scene.fog = this.fog
    this.scene.background = new THREE.Color('#c9dcec')

    this.controls = new OrbitControls(this.camera, cv)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.07
    this.controls.minDistance = 5
    this.controls.maxDistance = 1600
    this.controls.zoomToCursor = true
    this.controls.target.set(95, 52, 0)
    this.controls.zoomSpeed = 0.9
    this.controls.addEventListener('start', () => {
      if (this.flight) this.flight = null
      this.setViewpointId(null)
    })
    this.controls.update()

    this.hemi = new THREE.HemisphereLight('#b4d2ee', '#8d8f80', 0.55)
    this.sun = new THREE.DirectionalLight('#fff2dc', 3.6)
    this.sun.castShadow = true
    this.shadowSize = Math.min(window.innerWidth, window.innerHeight) < 700 ? 2048 : 4096
    this.sun.shadow.mapSize.set(this.shadowSize, this.shadowSize)
    this.sun.shadow.bias = -0.00015
    this.sun.shadow.normalBias = 0.06
    this.sun.shadow.camera.near = 1
    this.scene.add(this.hemi, this.sun, this.sun.target)

    this.labelRoot = document.createElement('div')
    this.labelRoot.className = 'pointer-events-none absolute inset-0 overflow-hidden'
    container.appendChild(this.labelRoot)

    this.bindInput()
    this.ro = new ResizeObserver(this.onResize)
    this.ro.observe(container)
  }

  /* ------------------------------------------------------------------ build */
  async init() {
    const p = (v: number, l: string) => this.ev.onProgress?.(v, l)
    p(0.03, 'Loading photographic textures')
    await tick()
    this.M = await createMaterials(this.renderer)
    if (this.disposed) return
    this.M.cable.emissive = new THREE.Color('#a9c8ff')
    this.M.glow.push({ m: this.M.cable, k: 0.5 })

    this.atmos = new Atmosphere(this.scene, this.renderer, this.hemi, this.sun, this.fog)
    p(0.14, 'Raising the pylon and deck')
    await tick()
    this.bridge = buildBridge(this.M)
    this.scene.add(this.bridge.group)
    p(0.42, 'Stringing 40 stay cables')
    await tick()
    this.setupLights()
    p(0.5, 'Building Rotterdam')
    await tick()
    this.city = buildCity(this.M)
    this.scene.add(this.city.group)
    p(0.72, 'Filling the Nieuwe Maas')
    await tick()
    const wg = new THREE.PlaneGeometry(WATER_X1 - WATER_X0, 7000)
    this.water = new Water(wg, { normals: this.M.waterNormals, size: 3.4, res: 1024, distortion: 3.5 })
    this.M.waterNormals.wrapS = this.M.waterNormals.wrapT = THREE.RepeatWrapping
    this.water.rotation.x = -Math.PI / 2
    this.water.position.set((WATER_X0 + WATER_X1) / 2, 0, 0)
    this.scene.add(this.water)
    p(0.82, 'Starting traffic, trams and ships')
    await tick()
    this.traffic = buildTraffic()
    this.scene.add(this.traffic.group)
    this.buildLabels()
    p(0.9, 'Setting up lighting and post-processing')
    await tick()
    this.buildComposer()
    this.onResize()
    this.setTime('golden', true)
    p(0.96, 'Compiling shaders')
    await tick()
    this.renderer.compile(this.scene, this.camera)
    this.clock.start()
    this.ready = true
    this.renderer.setAnimationLoop(this.loop)
    p(1, 'Ready')
    this.ev.onReady?.()
  }

  private buildComposer() {
    const w = this.container.clientWidth || 1
    const h = this.container.clientHeight || 1
    const rt = new THREE.WebGLRenderTarget(w * this.pr, h * this.pr, { type: THREE.HalfFloatType, samples: 4 })
    this.composer = new EffectComposer(this.renderer, rt)
    this.composer.setPixelRatio(this.pr)
    this.composer.setSize(w, h)
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.15, 0.7, 0.9)
    this.composer.addPass(this.bloom)
    this.composer.addPass(new OutputPass())
    this.grade = new ShaderPass({
      uniforms: { tDiffuse: { value: null }, time: { value: 0 }, vig: { value: 0.28 }, grain: { value: 0.022 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse; uniform float time; uniform float vig; uniform float grain; varying vec2 vUv;
        float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)) + time) * 43758.5453); }
        void main(){
          vec4 c = texture2D(tDiffuse, vUv);
          vec2 d = vUv - 0.5;
          float v = smoothstep(0.85, 0.2, length(d * vec2(1.0, 0.9)));
          c.rgb *= mix(1.0 - vig, 1.0, v);
          // gentle contrast + warm/cool split toning
          c.rgb = mix(c.rgb, c.rgb * c.rgb * (3.0 - 2.0 * c.rgb), 0.18);
          c.rgb += (h(vUv * 1000.0) - 0.5) * grain;
          gl_FragColor = vec4(c.rgb, 1.0);
        }`,
    })
    this.composer.addPass(this.grade)
  }

  private setupLights() {
    for (let i = 0; i < 4; i++) {
      const s = new THREE.SpotLight('#ffd6a0', 0, 46, 1.15, 0.75, 2)
      s.castShadow = false
      this.scene.add(s, s.target)
      this.lampPool.push(s)
    }
    for (const z of [-24, 24]) {
      const s = new THREE.SpotLight('#cfe0ff', 0, 0, 0.42, 0.7, 2)
      s.position.set(8, 10, z)
      s.target.position.set(-20, 78, z * 0.05)
      this.scene.add(s, s.target)
      this.flood.push(s)
    }
    // soft pools of light under the street lamps (cheap fake of 110 real lights)
    const { c, g } = (() => {
      const c = document.createElement('canvas')
      c.width = c.height = 128
      return { c, g: c.getContext('2d')! }
    })()
    const gr = g.createRadialGradient(64, 64, 2, 64, 64, 64)
    gr.addColorStop(0, 'rgba(255,255,255,1)')
    gr.addColorStop(0.35, 'rgba(255,255,255,0.4)')
    gr.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = gr
    g.fillRect(0, 0, 128, 128)
    const tex = new THREE.CanvasTexture(c)
    const geo = new THREE.PlaneGeometry(15, 15)
    geo.rotateX(-Math.PI / 2)
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: new THREE.Color(0, 0, 0), polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, fog: false })
    const heads = this.bridge.lampHeads
    this.poolDecals = new THREE.InstancedMesh(geo, mat, heads.length)
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    heads.forEach((h, i) => {
      const slope = (deckY(h.x + 1) - deckY(h.x - 1)) / 2
      q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.atan(slope))
      m.compose(new THREE.Vector3(h.x, deckY(h.x) + 0.05, h.z), q, new THREE.Vector3(1, 1, 1))
      this.poolDecals.setMatrixAt(i, m)
    })
    this.poolDecals.frustumCulled = false
    this.scene.add(this.poolDecals)
  }

  private buildLabels() {
    for (const h of HOTSPOTS) {
      const el = document.createElement('button')
      el.className = 'hs-label'
      el.innerHTML = `<span class="hs-dot"></span><span class="hs-text">${h.title}</span>`
      el.addEventListener('click', (e) => {
        e.stopPropagation()
        this.ev.onHotspot?.(h.id)
      })
      this.labelRoot.appendChild(el)
      this.labels.push({ id: h.id, el, pos: new THREE.Vector3(...h.pos) })
    }
  }

  /* ------------------------------------------------------------------ input */
  private bindInput() {
    const cv = this.renderer.domElement
    window.addEventListener('keydown', this.onKey)
    window.addEventListener('keyup', this.onKeyUp)
    cv.addEventListener('pointerdown', this.onPtrDown)
    window.addEventListener('pointermove', this.onPtrMove)
    window.addEventListener('pointerup', this.onPtrUp)
    cv.addEventListener('wheel', this.onWheel, { passive: true })
    document.addEventListener('pointerlockchange', this.onLockChange)
    window.addEventListener('blur', () => (this.keys = {}))
  }
  private onKey = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement)?.tagName === 'INPUT') return
    this.keys[e.code] = true
    if (e.code.startsWith('Digit')) {
      const i = parseInt(e.code.slice(5)) - 1
      if (VIEWPOINTS[i]) this.goTo(VIEWPOINTS[i].id)
    }
    if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code) && this.mode !== 'orbit') e.preventDefault()
  }
  private onKeyUp = (e: KeyboardEvent) => {
    this.keys[e.code] = false
  }
  private onPtrDown = (e: PointerEvent) => {
    this.dragging = true
    this.lastPtr = { x: e.clientX, y: e.clientY }
    if (this.mode !== 'orbit' && !this.flight && e.pointerType === 'mouse' && !this.locked) {
      try {
        this.renderer.domElement.requestPointerLock()
      } catch {
        /* drag fallback */
      }
    }
    if (this.audio.enabled === false) void 0
  }
  private onPtrMove = (e: PointerEvent) => {
    if (this.mode === 'orbit' || this.flight) return
    if (this.locked) {
      this.look(e.movementX, e.movementY, 0.0022)
    } else if (this.dragging) {
      this.look(e.clientX - this.lastPtr.x, e.clientY - this.lastPtr.y, e.pointerType === 'mouse' ? 0.0028 : 0.0042)
      this.lastPtr = { x: e.clientX, y: e.clientY }
    }
  }
  private onPtrUp = () => {
    this.dragging = false
  }
  private onWheel = (e: WheelEvent) => {
    if (this.mode === 'fly') this.flySpeed = clamp(this.flySpeed * (e.deltaY < 0 ? 1.15 : 0.87), 3, 160)
  }
  private onLockChange = () => {
    this.locked = document.pointerLockElement === this.renderer.domElement
    this.ev.onLock?.(this.locked)
  }
  look(dx: number, dy: number, k = 0.004) {
    this.yaw -= dx * k
    this.pitch = clamp(this.pitch - dy * k, -1.45, 1.45)
  }
  setMove(x: number, y: number) {
    this.moveIn.x = x
    this.moveIn.y = y
  }
  private onResize = () => {
    const w = this.container.clientWidth || 1
    const h = this.container.clientHeight || 1
    this.renderer.setSize(w, h)
    this.composer?.setSize(w, h)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  /* ------------------------------------------------------------------ public API */
  setTime(t: TimeOfDay, instant = false) {
    this.atmos.setTarget(t)
    if (instant) this.atmos.snap()
  }
  setLabelsVisible(v: boolean) {
    this.labelRoot.style.opacity = v ? '1' : '0'
    this.labelRoot.style.transition = 'opacity 0.6s'
  }
  setAudio(on: boolean) {
    this.audio.setEnabled(on)
  }
  setQuality(q: 'high' | 'balanced') {
    this.maxPr = q === 'high' ? Math.min(window.devicePixelRatio || 1, 2) : 1
    this.applyPr(Math.min(this.maxPr, q === 'high' ? 1.5 : 1))
    this.bloom.enabled = true
  }
  private applyPr(v: number) {
    this.pr = v
    this.renderer.setPixelRatio(v)
    this.composer.setPixelRatio(v)
    this.composer.setSize(this.container.clientWidth, this.container.clientHeight)
  }
  screenshot() {
    this.composer.render()
    return this.renderer.domElement.toDataURL('image/jpeg', 0.93)
  }
  private setViewpointId(id: string | null) {
    if (this.currentViewpoint !== id) {
      this.currentViewpoint = id
      this.ev.onViewpoint?.(id)
    }
  }

  setMode(m: Mode) {
    if (m === this.mode) return
    const cam = this.camera
    const fwd = cam.getWorldDirection(this.tmpV.set(0, 0, 0)).clone()
    if (m !== 'orbit') {
      this.yaw = Math.atan2(-fwd.x, -fwd.z)
      this.pitch = Math.asin(clamp(fwd.y, -1, 1))
    }
    if (m === 'walk') {
      let x = cam.position.x
      let z = cam.position.z
      if (this.groundAt(x, z) === null) {
        x = clamp(x, X_START + 20, X_END - 20)
        z = z < 0 ? -12.2 : 12.2
        if (Math.abs(x - 0) < 5) x = 20
      }
      this.walk = { x, z, y: this.groundAt(x, z) ?? deckY(x) }
      this.pitch = clamp(this.pitch, -0.6, 0.6)
    } else if (m === 'orbit') {
      if (document.pointerLockElement) document.exitPointerLock()
      const dist = Math.max(40, cam.position.y * 1.6)
      const t = cam.position.clone().addScaledVector(fwd, dist)
      t.y = Math.max(2, t.y)
      this.controls.target.copy(t)
    }
    this.mode = m
    this.controls.enabled = m === 'orbit'
    if (m === 'orbit') this.controls.update()
    this.ev.onMode?.(m)
  }

  /** Smooth cinematic move to a named viewpoint. */
  goTo(id: string) {
    const vp = VIEWPOINTS.find((v) => v.id === id)
    if (vp) this.flyTo(vp)
  }
  private flyTo(vp: Viewpoint) {
    const cam = this.camera
    const fwd = cam.getWorldDirection(new THREE.Vector3())
    const fl = this.mode === 'orbit' ? this.controls.target.clone() : cam.position.clone().addScaledVector(fwd, 60)
    const tp = new THREE.Vector3(...vp.pos)
    if (vp.mode === 'walk') tp.y = (this.groundAt(tp.x, tp.z) ?? deckY(tp.x)) + 1.7
    const dist = cam.position.distanceTo(tp)
    if (document.pointerLockElement) document.exitPointerLock()
    this.controls.enabled = false
    this.setViewpointId(vp.id)
    this.flight = {
      t: 0,
      dur: clamp(1.8 + dist / 260, 2, 4.5),
      fp: cam.position.clone(),
      tp,
      fl,
      tl: new THREE.Vector3(...vp.look),
      arc: clamp(dist * 0.12, 0, 60),
      done: () => {
        const look = new THREE.Vector3(...vp.look)
        const fw = look.clone().sub(tp)
        this.yaw = Math.atan2(-fw.x, -fw.z)
        this.pitch = Math.atan2(fw.y, Math.hypot(fw.x, fw.z))
        if (vp.mode === 'walk') {
          this.walk = { x: tp.x, z: tp.z, y: tp.y - 1.7 }
          this.pitch = clamp(this.pitch, -0.6, 0.6)
        }
        this.controls.target.copy(look)
        this.forceMode(vp.mode)
      },
    }
  }
  private forceMode(m: Mode) {
    this.mode = m
    this.controls.enabled = m === 'orbit'
    if (m === 'orbit') this.controls.update()
    this.ev.onMode?.(m)
  }

  /** Teleport onto the footway at a distance along the bridge (0 … 806 m). */
  walkAlong(along: number) {
    const x = clamp(X_START + along, X_START + 6, X_END - 6)
    const z = 12.2
    if (document.pointerLockElement) document.exitPointerLock()
    this.flight = null
    this.walk = { x, z, y: this.groundAt(x, z) ?? deckY(x) }
    this.yaw = -Math.PI / 2
    this.pitch = 0
    this.forceMode('walk')
    this.setViewpointId(null)
  }
  focusHotspot(id: string) {
    const h = HOTSPOTS.find((x) => x.id === id)
    if (!h) return
    const target = new THREE.Vector3(...h.pos)
    if (this.mode === 'orbit' && !this.flight) {
      const dir = this.camera.position.clone().sub(target).normalize()
      const dist = clamp(this.camera.position.distanceTo(target), 40, 320) * 0.6 + 30
      const tp = target.clone().addScaledVector(dir, dist)
      tp.y = Math.max(tp.y, 5)
      this.flight = {
        t: 0, dur: 2.2, fp: this.camera.position.clone(), tp, fl: this.controls.target.clone(), tl: target, arc: 0,
        done: () => {
          this.controls.target.copy(target)
          this.controls.enabled = true
          this.controls.update()
        },
      }
      this.controls.enabled = false
    }
  }

  /* ------------------------------------------------------------------ physics */
  groundAt(x: number, z: number): number | null {
    const onDeck = Math.abs(z) < DECK_HALF && x > X_START && x < X_END
    if (onDeck) {
      const y = deckY(x)
      if (Math.abs(z) > RAIL_Z - 0.4 && y > LAND_Y + 1.2) return null
      return y
    }
    if (x < WATER_X0 - 1.2 || x > WATER_X1 + 1.2) return LAND_Y
    return null
  }
  private blocked(x: number, z: number) {
    for (const c of this.city.colliders) if (Math.abs(x - c.x) < c.hw && Math.abs(z - c.z) < c.hd) return true
    return false
  }

  /* ------------------------------------------------------------------ loop */
  private loop = () => {
    if (this.disposed || !this.ready) return
    const dt = Math.min(this.clock.getDelta(), 0.1)
    this.time += dt
    this.stepFlight(dt)
    if (!this.flight) {
      if (this.mode === 'orbit') this.stepOrbit()
      else if (this.mode === 'walk') this.stepWalk(dt)
      else this.stepFly(dt)
    }
    this.updateWorld(dt)
    this.updateLabels()
    this.emitStatus(dt)
    this.composer.render()
    this.adaptQuality(dt)
  }

  private stepFlight(dt: number) {
    const f = this.flight
    if (!f) return
    f.t += dt / f.dur
    const k = ease(clamp(f.t, 0, 1))
    this.camera.position.lerpVectors(f.fp, f.tp, k)
    this.camera.position.y += Math.sin(k * Math.PI) * f.arc
    const look = this.tmpV2.lerpVectors(f.fl, f.tl, k)
    this.camera.lookAt(look)
    if (f.t >= 1) {
      this.flight = null
      f.done()
    }
  }

  private stepOrbit() {
    this.controls.update()
    const c = this.camera.position
    const minY = this.groundAt(c.x, c.z) === null && c.x > WATER_X0 && c.x < WATER_X1 ? 1.2 : LAND_Y + 1.2
    if (c.y < minY) c.y = minY
  }

  private stepFly(dt: number) {
    const cam = this.camera
    cam.rotation.set(this.pitch, this.yaw, 0)
    const k = this.keys
    const fwd = (k['KeyW'] || k['ArrowUp'] ? 1 : 0) - (k['KeyS'] || k['ArrowDown'] ? 1 : 0) + this.moveIn.y
    const str = (k['KeyD'] || k['ArrowRight'] ? 1 : 0) - (k['KeyA'] || k['ArrowLeft'] ? 1 : 0) + this.moveIn.x
    const vert = (k['KeyE'] || k['Space'] ? 1 : 0) - (k['KeyQ'] || k['ControlLeft'] ? 1 : 0)
    const sp = this.flySpeed * (k['ShiftLeft'] || k['ShiftRight'] ? 4 : 1)
    const d = this.tmpV.set(0, 0, 0)
    const f = cam.getWorldDirection(new THREE.Vector3())
    d.addScaledVector(f, fwd)
    const right = new THREE.Vector3().crossVectors(f, Y).normalize()
    d.addScaledVector(right, str).addScaledVector(Y, vert)
    if (d.lengthSq() > 0) d.normalize().multiplyScalar(sp * dt)
    cam.position.add(d)
    this.speed = d.length() / Math.max(dt, 1e-3)
    const c = cam.position
    const inWater = c.x > WATER_X0 && c.x < WATER_X1
    c.y = Math.max(c.y, inWater && this.groundAt(c.x, c.z) === null ? 1.0 : LAND_Y + 1.0)
    c.y = Math.min(c.y, 900)
  }

  private stepWalk(dt: number) {
    const k = this.keys
    const run = !!(k['ShiftLeft'] || k['ShiftRight'])
    const fwd = (k['KeyW'] || k['ArrowUp'] ? 1 : 0) - (k['KeyS'] || k['ArrowDown'] ? 1 : 0) + this.moveIn.y
    const str = (k['KeyD'] || k['ArrowRight'] ? 1 : 0) - (k['KeyA'] || k['ArrowLeft'] ? 1 : 0) + this.moveIn.x
    const sp = (run ? 5.2 : 1.9) * (Math.hypot(this.moveIn.x, this.moveIn.y) > 0.05 ? Math.min(1, Math.hypot(this.moveIn.x, this.moveIn.y) * 1.2) : 1)
    let dx = -Math.sin(this.yaw) * fwd + Math.cos(this.yaw) * str
    let dz = -Math.cos(this.yaw) * fwd - Math.sin(this.yaw) * str
    const len = Math.hypot(dx, dz)
    if (len > 1) (dx /= len), (dz /= len)
    const w = this.walk
    const nx = w.x + dx * sp * dt
    const nz = w.z + dz * sp * dt
    const ok = (x: number, z: number) => {
      const g = this.groundAt(x, z)
      return g !== null && Math.abs(g - w.y) < 1.1 && !this.blocked(x, z)
    }
    if (ok(nx, nz)) (w.x = nx), (w.z = nz)
    else if (ok(nx, w.z)) w.x = nx
    else if (ok(w.x, nz)) w.z = nz
    const g = this.groundAt(w.x, w.z) ?? w.y
    w.y += (g - w.y) * Math.min(1, dt * 16)
    const moving = Math.hypot(dx, dz) > 0.05
    this.speed = moving ? sp : 0
    if (moving) {
      this.bob += dt * sp * (run ? 2.0 : 3.3)
      this.stepAcc += dt * sp
      if (this.stepAcc > (run ? 2.0 : 1.2)) {
        this.stepAcc = 0
        this.audio.step(run)
      }
    }
    const cam = this.camera
    cam.position.set(w.x, w.y + 1.7 + (moving ? Math.sin(this.bob * 2) * 0.03 * (run ? 1.6 : 1) : 0), w.z)
    cam.rotation.set(this.pitch + (moving ? Math.sin(this.bob) * 0.003 : 0), this.yaw, 0)
  }

  private updateWorld(dt: number) {
    const t = this.time
    this.atmos.update(dt, t, this.camera.position)
    const e = this.atmos.cur
    const night = e.night
    this.M.setNight(night)
    this.traffic.setNight(night)
    this.traffic.update(t)
    this.M.beacon.color.setRGB(4, 0.1, 0.05).multiplyScalar(Math.sin(t * 3.2) > 0.55 ? 1 : 0.08)
    // bloom & grading follow the time of day
    this.bloom.strength += (e.bloom - this.bloom.strength) * Math.min(1, dt * 4)
    this.bloom.threshold = e.bloomThr
    this.bloom.radius = 0.6
    this.grade.uniforms.time.value = t % 10
    // water
    const wu = this.water.material.uniforms
    this.water.setTime(t * 0.6)
    const L = night > 0.9 ? this.atmos.lightDir : this.atmos.sunDir
    wu.sunDirection.value.copy(L)
    wu.sunColor.value.copy(this.atmos.curC.sunColor).multiplyScalar(Math.min(1.1, e.sunInt / 3.6) * (night > 0.9 ? 0.5 : 1))
    wu.waterColor.value.copy(this.atmos.curC.waterColor)
    wu.ambient.value.copy(this.atmos.curC.hemiSky).multiplyScalar((0.45 + e.hemi) * 4.0)
    wu.reflGain.value = 1
    // night lighting
    const on = THREE.MathUtils.smoothstep(night, 0.3, 0.8)
    ;(this.poolDecals.material as THREE.MeshBasicMaterial).color.setRGB(1.0, 0.72, 0.42).multiplyScalar(on * 0.55)
    this.poolDecals.visible = on > 0.01
    for (const f of this.flood) f.intensity = on * 15000
    this.updateLampPool(on)
    this.fitShadow()
    this.audio.update(this.camera.position.y, this.speed, clamp(1 - (Math.abs(this.camera.position.z) - 8) / 30, 0, 1) * (this.camera.position.x > X_START && this.camera.position.x < X_END ? 1 : 0.2))
  }

  private updateLampPool(on: number) {
    const ref = this.mode === 'orbit' ? this.controls.target : this.camera.position
    const heads = this.bridge.lampHeads
    const near: { i: number; d: number }[] = []
    for (let i = 0; i < heads.length; i++) {
      const d = (heads[i].x - ref.x) ** 2 + (heads[i].z - ref.z) ** 2 + (heads[i].y - ref.y) ** 2 * 0.1
      near.push({ i, d })
    }
    near.sort((a, b) => a.d - b.d)
    this.lampPool.forEach((s, k) => {
      const h = heads[near[k].i]
      s.position.copy(h)
      s.target.position.set(h.x, deckY(h.x) + 0.2, h.z)
      s.intensity = on * 220
    })
  }

  private fitShadow() {
    const walkLike = this.mode !== 'orbit' || this.flight
    const center = this.tmpV.copy(this.mode === 'orbit' && !this.flight ? this.controls.target : this.camera.position)
    let R: number
    if (this.mode === 'orbit' && !this.flight) R = clamp(this.camera.position.distanceTo(this.controls.target) * 0.8, 80, 560)
    else R = walkLike ? clamp(this.camera.position.y * 1.6 + 80, 100, 320) : 200
    const d = this.atmos.lightDir
    const up = Math.abs(d.y) > 0.99 ? new THREE.Vector3(1, 0, 0) : Y
    const right = new THREE.Vector3().crossVectors(up, d).normalize()
    const u2 = new THREE.Vector3().crossVectors(d, right).normalize()
    const texel = (2 * R) / this.shadowSize
    const cx = Math.round(center.dot(right) / texel) * texel
    const cy = Math.round(center.dot(u2) / texel) * texel
    const cz = center.dot(d)
    const snapped = right.clone().multiplyScalar(cx).addScaledVector(u2, cy).addScaledVector(d, cz)
    this.sun.position.copy(snapped).addScaledVector(d, R + 320)
    this.sun.target.position.copy(snapped)
    const sc = this.sun.shadow.camera
    sc.left = -R
    sc.right = R
    sc.top = R
    sc.bottom = -R
    sc.far = 2 * R + 760
    sc.updateProjectionMatrix()
    this.sun.target.updateMatrixWorld()
    // when the sun is below the horizon there is nothing to shadow
    this.sun.castShadow = d.y > 0.02
  }

  private updateLabels() {
    const cam = this.camera
    const w = this.container.clientWidth
    const h = this.container.clientHeight
    for (const l of this.labels) {
      const v = this.tmpV.copy(l.pos).project(cam)
      const dist = cam.position.distanceTo(l.pos)
      const maxD = this.mode === 'walk' ? 160 : 1500
      const visible = v.z < 1 && v.z > -1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05 && dist < maxD && dist > 12
      l.el.style.display = visible ? '' : 'none'
      if (visible) {
        l.el.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px) translate(-50%, -50%)`
        l.el.style.opacity = String(clamp(1.4 - dist / maxD, 0.45, 1))
      }
    }
  }

  private emitStatus(dt: number) {
    this.hudAcc += dt
    if (this.hudAcc < 0.2) return
    this.hudAcc = 0
    const c = this.camera.position
    this.ev.onStatus?.({ mode: this.mode, along: c.x - X_START, z: c.z, y: c.y })
  }

  private adaptQuality(dt: number) {
    this.frames++
    this.fpsAcc += dt
    this.prCool -= dt
    if (this.fpsAcc > 1.5) {
      const fps = this.frames / this.fpsAcc
      this.ev.onFps?.(fps, this.pr)
      if (this.prCool <= 0) {
        if (fps < 34 && this.pr > 0.65) {
          this.applyPr(Math.max(0.65, this.pr * 0.85))
          this.prCool = 3
        } else if (fps > 57 && this.pr < this.maxPr - 0.01) {
          this.applyPr(Math.min(this.maxPr, this.pr * 1.12))
          this.prCool = 4
        }
      }
      this.frames = 0
      this.fpsAcc = 0
    }
  }

  dispose() {
    this.disposed = true
    this.renderer.setAnimationLoop(null)
    window.removeEventListener('keydown', this.onKey)
    window.removeEventListener('keyup', this.onKeyUp)
    window.removeEventListener('pointermove', this.onPtrMove)
    window.removeEventListener('pointerup', this.onPtrUp)
    document.removeEventListener('pointerlockchange', this.onLockChange)
    this.ro.disconnect()
    this.audio.setEnabled(false)
    this.renderer.dispose()
    this.renderer.domElement.remove()
    this.labelRoot.remove()
  }
}

void PYLON

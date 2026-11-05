import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { Sky } from 'three/examples/jsm/objects/Sky.js'
import { createMaterials, Mats } from './materials'
import { loadArt } from './art'
import { buildExterior } from './exterior'
import { buildInterior } from './interior'
import { buildGrounds } from './grounds'
import { buildLife } from './life'
import { POIS } from './pois'
import { POI, World, Zone, newWorld, zoneAt } from './world'

export type TimeOfDay = 'day' | 'golden' | 'night'
export type Mode = 'walk' | 'orbit'

export interface FrameInfo { x: number; y: number; z: number; yaw: number; zone: Zone; level: number }
export interface Events {
  onProgress?: (p: number, label: string) => void
  onFrame?: (f: FrameInfo) => void
  onPOI?: (p: POI | null) => void
  onLock?: (locked: boolean) => void
  onMode?: (m: Mode) => void
}

interface Preset {
  elev: number; az: number; turb: number; ray: number; mie: number; mieG: number
  sun: number; sunColor: string; hemi: number; hemiSky: string; hemiGround: string
  exposure: number; fog: string; fogD: number; night: number; stars: number; cloud: number; cloudTint: string
}
const PRESETS: Record<TimeOfDay, Preset> = {
  day: { elev: 46, az: 28, turb: 3.2, ray: 1.1, mie: 0.004, mieG: 0.8, sun: 3.6, sunColor: '#fff3df', hemi: 0.55, hemiSky: '#bcd6f2', hemiGround: '#8a8c70', exposure: 0.55, fog: '#bcd2e6', fogD: 0.00075, night: 0, stars: 0, cloud: 0.55, cloudTint: '#ffffff' },
  golden: { elev: 6.5, az: 72, turb: 8, ray: 2.2, mie: 0.012, mieG: 0.82, sun: 3.2, sunColor: '#ffb067', hemi: 0.5, hemiSky: '#e6b79b', hemiGround: '#6f6048', exposure: 0.5, fog: '#e8b690', fogD: 0.0011, night: 0.25, stars: 0, cloud: 0.6, cloudTint: '#ffc9a0' },
  night: { elev: -6, az: 30, turb: 2, ray: 0.5, mie: 0.002, mieG: 0.8, sun: 0.55, sunColor: '#8fa8ff', hemi: 0.22, hemiSky: '#27396b', hemiGround: '#10151f', exposure: 0.8, fog: '#0b1426', fogD: 0.0013, night: 1, stars: 1, cloud: 0.25, cloudTint: '#4a5a8a' },
}
const NUM = ['elev', 'az', 'turb', 'ray', 'mie', 'mieG', 'sun', 'hemi', 'exposure', 'fogD', 'night', 'stars', 'cloud'] as const
const COLS = ['sunColor', 'hemiSky', 'hemiGround', 'fog', 'cloudTint'] as const

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

const ZONE_ENV: Record<Zone, { env: number; hemi: number; fog: number }> = {
  outside: { env: 1, hemi: 1, fog: 1 },
  passage: { env: 0.3, hemi: 0.3, fog: 0.3 },
  atrium: { env: 0.55, hemi: 0.45, fog: 0.4 },
  gallery: { env: 0.14, hemi: 0.2, fog: 0.2 },
}

const CLOUD_VS = /* glsl */ `
  varying vec3 vW;
  void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }
`
const CLOUD_FS = /* glsl */ `
  varying vec3 vW;
  uniform float uTime; uniform float uCover; uniform vec3 uTint; uniform vec3 uCam;
  float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
  float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
    return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
  float fbm(vec2 p){ float a=.5, s=0.; for(int i=0;i<6;i++){ s+=a*n(p); p=p*2.03+17.; a*=.5; } return s; }
  void main(){
    vec2 p = vW.xz * 0.00032 + vec2(uTime*0.002, uTime*0.0009);
    float c = fbm(p + fbm(p*1.7)*0.6);
    float a = smoothstep(1.0 - uCover*0.62, 1.0 - uCover*0.62 + 0.28, c);
    float d = length(vW.xz - uCam.xz);
    a *= (1.0 - smoothstep(5000., 9000., d)) * smoothstep(300., 2400., d);
    float shade = mix(0.72, 1.0, smoothstep(0.35, 0.8, c));
    gl_FragColor = vec4(uTint * shade, a * 0.92);
  }
`

export class Explorer {
  static PRESETS = PRESETS
  renderer: THREE.WebGLRenderer
  scene = new THREE.Scene()
  camera: THREE.PerspectiveCamera
  controls: OrbitControls
  world: World = newWorld()
  mats!: Mats

  mode: Mode = 'walk'
  private el: HTMLElement
  private ev: Events
  private clock = new THREE.Clock()
  private disposed = false
  private sky: Sky
  private envScene = new THREE.Scene()
  private envSky: Sky
  private pmrem: THREE.PMREMGenerator
  private envRT: THREE.WebGLRenderTarget | null = null
  private sun: THREE.DirectionalLight
  private hemi: THREE.HemisphereLight
  private floods: THREE.SpotLight[] = []
  private fog = new THREE.FogExp2('#bcd2e6', 0.00075)
  private stars!: THREE.Points
  private clouds!: THREE.Mesh
  private cloudU!: Record<string, THREE.IUniform>
  private cur: Record<string, number> = {}
  private curC: Record<string, THREE.Color> = {}
  private from: Preset = PRESETS.day
  private to: Preset = PRESETS.day
  private blend = 1
  private envDone = false
  private tod: TimeOfDay = 'day'

  // player
  private pos = new THREE.Vector3(0, 0, 165)
  private py = 0
  private yaw = 0
  private pitch = 0.04
  private keys = new Set<string>()
  private joy = { x: 0, y: 0 }
  private bob = 0
  private zone: Zone = 'outside'
  private zoneBlend = { env: 1, hemi: 1, fog: 1 }
  private flight: null | { t: number; dur: number; p0: THREE.Vector3; p1: THREE.Vector3; q0: THREE.Quaternion; q1: THREE.Quaternion; done: () => void } = null
  private locked = false
  private drag: { id: number; x: number; y: number } | null = null
  private touchMove: { id: number; x: number; y: number } | null = null
  private lastPOI: string | null = null
  private time = 0
  private frame = 0
  private fovBase = 62
  private shadowRange = 70
  private qualityHigh = true

  constructor(container: HTMLElement, ev: Events = {}) {
    this.el = container
    this.ev = ev
    const w = container.clientWidth || 1, h = container.clientHeight || 1
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setSize(w, h)
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 0.55
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    const cv = this.renderer.domElement
    cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;outline:none;touch-action:none'
    cv.tabIndex = 0
    container.appendChild(cv)

    this.camera = new THREE.PerspectiveCamera(this.fovBase, w / h, 0.1, 20000)
    this.camera.rotation.order = 'YXZ'
    this.scene.fog = this.fog
    this.scene.background = new THREE.Color('#bcd2e6')

    this.controls = new OrbitControls(this.camera, cv)
    this.controls.enabled = false
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.07
    this.controls.minDistance = 12
    this.controls.maxDistance = 520
    this.controls.maxPolarAngle = Math.PI * 0.495
    this.controls.zoomToCursor = true
    this.controls.target.set(0, 10, 10)

    this.sky = new Sky()
    this.sky.scale.setScalar(9000)
    this.scene.add(this.sky)
    this.envSky = new Sky()
    this.envSky.scale.setScalar(9000)
    this.envScene.add(this.envSky)
    this.pmrem = new THREE.PMREMGenerator(this.renderer)

    this.hemi = new THREE.HemisphereLight('#bcd6f2', '#8a8c70', 0.5)
    this.scene.add(this.hemi)
    this.sun = new THREE.DirectionalLight('#fff3df', 3.6)
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(4096, 4096)
    this.sun.shadow.bias = -0.0004
    this.sun.shadow.normalBias = 0.05
    this.sun.shadow.radius = 2.5
    this.sun.shadow.camera.near = 1
    this.sun.shadow.camera.far = 600
    this.scene.add(this.sun, this.sun.target)

    // facade floodlights (night)
    for (const x of [-48, -22, 22, 48]) {
      const s = new THREE.SpotLight('#ffd9a8', 0, 140, 0.55, 0.85, 2)
      s.position.set(x, 0.6, 74)
      s.target.position.set(x * 0.85, 11, 50)
      this.scene.add(s, s.target)
      this.floods.push(s)
    }

    // stars
    const sp: number[] = []
    for (let i = 0; i < 2500; i++) {
      const th = Math.random() * Math.PI * 2, y = Math.random() * 0.95 + 0.04, r = 8000
      const rr = Math.sqrt(1 - y * y)
      sp.push(Math.cos(th) * rr * r, y * r, Math.sin(th) * rr * r)
    }
    const sg = new THREE.BufferGeometry()
    sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3))
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: '#ffffff', size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false }))
    this.scene.add(this.stars)

    // clouds
    this.cloudU = { uTime: { value: 0 }, uCover: { value: 0.5 }, uTint: { value: new THREE.Color('#fff') }, uCam: { value: new THREE.Vector3() } }
    this.clouds = new THREE.Mesh(
      new THREE.PlaneGeometry(24000, 24000).rotateX(-Math.PI / 2),
      new THREE.ShaderMaterial({ uniforms: this.cloudU, vertexShader: CLOUD_VS, fragmentShader: CLOUD_FS, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide }),
    )
    this.clouds.position.y = 1600
    this.clouds.renderOrder = -1
    this.scene.add(this.clouds)

    const p = PRESETS.day
    for (const k of NUM) this.cur[k] = p[k]
    for (const k of COLS) this.curC[k] = new THREE.Color(p[k])

    this.bind()
    this.ro = new ResizeObserver(this.onResize)
    this.ro.observe(container)
  }
  private ro: ResizeObserver

  /* ------------------------------------------------------------------ build */
  async start() {
    const prog = (p: number, l: string) => this.ev.onProgress?.(p, l)
    prog(0.01, 'Warming up')
    this.mats = await createMaterials((p, l) => prog(0.02 + p * 0.5, l))
    if (this.disposed) return
    prog(0.55, 'Hanging the masterpieces')
    const art = await loadArt()
    if (this.disposed) return
    const tick = () => new Promise<void>((r) => setTimeout(r, 16))
    prog(0.62, 'Raising the façade')
    await tick()
    buildExterior(this.world, this.mats)
    prog(0.74, 'Building the passage, atria and galleries')
    await tick()
    buildInterior(this.world, this.mats, { art })
    prog(0.86, 'Planting Museumplein')
    await tick()
    buildGrounds(this.world, this.mats)
    prog(0.94, 'Inviting visitors')
    await tick()
    buildLife(this.world)
    this.scene.add(this.world.group)
    this.world.group.traverse((o) => {
      const mm = o as THREE.Mesh
      if (mm.isMesh && mm.castShadow === undefined) mm.castShadow = true
    })
    this.applyPreset(1, true)
    this.refreshEnv()
    this.placeCamera()
    prog(1, 'Opening the doors')
    await tick()
    if (this.disposed) return
    this.renderer.setAnimationLoop(this.loop)
  }

  /* ------------------------------------------------------------------ environment / time of day */
  setTime(t: TimeOfDay) {
    if (t === this.tod) return
    this.tod = t
    this.from = this.snapshot()
    this.to = PRESETS[t]
    this.blend = 0
    this.envDone = false
  }
  get timeOfDay() { return this.tod }

  private snapshot(): Preset {
    const o = {} as Record<string, number | string>
    for (const k of NUM) o[k] = this.cur[k]
    for (const k of COLS) o[k] = '#' + this.curC[k].getHexString()
    return o as unknown as Preset
  }

  private applyPreset(t: number, force = false) {
    const a = this.from, b = this.to
    for (const k of NUM) this.cur[k] = a[k] + (b[k] - a[k]) * t
    for (const k of COLS) this.curC[k].set(a[k]).lerp(new THREE.Color(b[k]), t)
    const c = this.cur
    const dir = new THREE.Vector3()
    const e = (c.elev * Math.PI) / 180, az = (c.az * Math.PI) / 180
    dir.set(Math.sin(az) * Math.cos(e), Math.sin(e), Math.cos(az) * Math.cos(e))
    for (const s of [this.sky, this.envSky]) {
      const u = s.material.uniforms
      u.turbidity.value = c.turb; u.rayleigh.value = c.ray; u.mieCoefficient.value = c.mie; u.mieDirectionalG.value = c.mieG
      u.sunPosition.value.copy(dir)
    }
    this.sunDir.copy(dir)
    if (c.elev < 0.5) {
      // moonlight
      this.lightDir.set(-0.35, 0.62, 0.7).normalize()
    } else this.lightDir.copy(dir)
    this.sun.color.copy(this.curC.sunColor)
    this.sunIntensity = c.sun * (c.elev < 0.5 ? 1 : clamp(c.elev / 10, 0.35, 1))
    this.fog.color.copy(this.curC.fog)
    this.fog.density = c.fogD
    ;(this.scene.background as THREE.Color).copy(this.curC.fog)
    this.renderer.toneMappingExposure = c.exposure
    ;(this.stars.material as THREE.PointsMaterial).opacity = c.stars
    this.cloudU.uCover.value = c.cloud
    ;(this.cloudU.uTint.value as THREE.Color).copy(this.curC.cloudTint)
    this.hemi.color.copy(this.curC.hemiSky)
    this.hemi.groundColor.copy(this.curC.hemiGround)
    this.mats.glows.forEach((g) => { g.mat.emissiveIntensity = g.day + (g.night - g.day) * c.night })
    for (const f of this.floods) f.intensity = 9000 * c.night
    void force
  }
  private sunDir = new THREE.Vector3(0, 1, 0)
  private lightDir = new THREE.Vector3(0, 1, 0)
  private sunIntensity = 3

  private refreshEnv() {
    this.envRT?.dispose()
    this.envRT = this.pmrem.fromScene(this.envScene, 0.02)
    this.scene.environment = this.envRT.texture
  }

  setQuality(high: boolean) {
    this.qualityHigh = high
    this.renderer.setPixelRatio(high ? Math.min(window.devicePixelRatio, 2) : 1)
    const s = high ? 4096 : 2048
    this.sun.shadow.mapSize.set(s, s)
    this.sun.shadow.map?.dispose()
    ;(this.sun.shadow as THREE.LightShadow).map = null
    this.onResize()
  }
  get quality() { return this.qualityHigh }

  /* ------------------------------------------------------------------ input */
  private bind() {
    const cv = this.renderer.domElement
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase()
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift', ' '].includes(k)) {
        this.keys.add(k)
        if (k.startsWith('arrow') || k === ' ') e.preventDefault()
      }
    }
    const up = (e: KeyboardEvent) => this.keys.delete(e.key.toLowerCase())
    const blur = () => this.keys.clear()
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)

    const lockChange = () => {
      this.locked = document.pointerLockElement === cv
      this.ev.onLock?.(this.locked)
    }
    document.addEventListener('pointerlockchange', lockChange)
    const mouseMove = (e: MouseEvent) => {
      if (this.locked && this.mode === 'walk') this.look(e.movementX, e.movementY, 0.0022)
    }
    document.addEventListener('mousemove', mouseMove)

    const pdown = (e: PointerEvent) => {
      if (this.mode !== 'walk') return
      if (e.pointerType === 'touch') {
        const r = cv.getBoundingClientRect()
        if (e.clientX - r.left < r.width * 0.42 && !this.touchMove) {
          this.touchMove = { id: e.pointerId, x: e.clientX, y: e.clientY }
        } else if (!this.drag) this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY }
        cv.setPointerCapture(e.pointerId)
        return
      }
      if (e.button === 0 && !this.locked) {
        this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY }
        cv.setPointerCapture(e.pointerId)
      }
    }
    const pmove = (e: PointerEvent) => {
      if (this.touchMove && e.pointerId === this.touchMove.id) {
        const dx = (e.clientX - this.touchMove.x) / 55, dy = (e.clientY - this.touchMove.y) / 55
        const l = Math.hypot(dx, dy)
        const k = l > 1 ? 1 / l : 1
        this.joy.x = dx * k; this.joy.y = dy * k
      } else if (this.drag && e.pointerId === this.drag.id) {
        this.look(e.clientX - this.drag.x, e.clientY - this.drag.y, e.pointerType === 'touch' ? 0.0042 : 0.0036)
        this.drag.x = e.clientX; this.drag.y = e.clientY
      }
    }
    const pup = (e: PointerEvent) => {
      if (this.touchMove && e.pointerId === this.touchMove.id) { this.touchMove = null; this.joy.x = this.joy.y = 0 }
      if (this.drag && e.pointerId === this.drag.id) this.drag = null
    }
    cv.addEventListener('pointerdown', pdown)
    cv.addEventListener('pointermove', pmove)
    cv.addEventListener('pointerup', pup)
    cv.addEventListener('pointercancel', pup)
    const wheel = (e: WheelEvent) => {
      if (this.mode !== 'walk') return
      this.camera.fov = clamp(this.camera.fov + e.deltaY * 0.02, 34, 78)
      this.camera.updateProjectionMatrix()
      e.preventDefault()
    }
    cv.addEventListener('wheel', wheel, { passive: false })
    this.unbind = () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
      document.removeEventListener('pointerlockchange', lockChange)
      document.removeEventListener('mousemove', mouseMove)
      cv.removeEventListener('pointerdown', pdown)
      cv.removeEventListener('pointermove', pmove)
      cv.removeEventListener('pointerup', pup)
      cv.removeEventListener('pointercancel', pup)
      cv.removeEventListener('wheel', wheel)
    }
  }
  private unbind = () => {}

  requestLock() {
    const cv = this.renderer.domElement
    try {
      const r = cv.requestPointerLock() as unknown as Promise<void> | undefined
      r?.catch?.(() => {})
    } catch { /* sandboxed iframes: drag-to-look still works */ }
  }
  releaseLock() { if (document.pointerLockElement) document.exitPointerLock() }

  private look(dx: number, dy: number, s: number) {
    if (this.flight) return
    this.yaw -= dx * s
    this.pitch = clamp(this.pitch - dy * s, -1.35, 1.35)
  }

  private onResize = () => {
    const w = this.el.clientWidth || 1, h = this.el.clientHeight || 1
    this.renderer.setSize(w, h)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  /* ------------------------------------------------------------------ player */
  private surfaceAt(x: number, z: number, curY: number) {
    let best = 0
    for (const s of this.world.surfaces) {
      if (x < s.x0 || x > s.x1 || z < s.z0 || z > s.z1) continue
      const h = s.h(x, z)
      if (h <= curY + 0.62 && h > best) best = h
    }
    return best
  }

  private collide(p: THREE.Vector3, y: number) {
    const r = 0.38
    for (let it = 0; it < 3; it++) {
      for (const c of this.world.colliders) {
        if (y + 1.7 <= c.y0 || y + 0.3 >= c.y1) continue
        const nx = clamp(p.x, c.x0, c.x1), nz = clamp(p.z, c.z0, c.z1)
        let dx = p.x - nx, dz = p.z - nz
        const d2 = dx * dx + dz * dz
        if (d2 >= r * r) continue
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2)
          p.x += (dx / d) * (r - d)
          p.z += (dz / d) * (r - d)
        } else {
          // centre inside the box: push out along the shallowest axis
          const l = p.x - c.x0 + r, rr = c.x1 - p.x + r, t = p.z - c.z0 + r, bt = c.z1 - p.z + r
          const m = Math.min(l, rr, t, bt)
          if (m === l) p.x = c.x0 - r
          else if (m === rr) p.x = c.x1 + r
          else if (m === t) p.z = c.z0 - r
          else p.z = c.z1 + r
          dx = 0; dz = 0
        }
      }
    }
    p.x = clamp(p.x, -420, 420)
    p.z = clamp(p.z, -420, 420)
  }

  private placeCamera() {
    this.camera.position.set(this.pos.x, this.py + 1.65, this.pos.z)
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ')
  }

  teleport(view: { x: number; y: number; z: number; yaw: number; pitch: number }) {
    const finish = () => {
      this.pos.set(view.x, 0, view.z)
      this.py = view.y - 1.65
      this.yaw = view.yaw
      this.pitch = view.pitch
      this.placeCamera()
    }
    if (this.mode === 'orbit') this.setMode('walk', true)
    const p0 = this.camera.position.clone()
    const q0 = this.camera.quaternion.clone()
    const e = new THREE.Euler(view.pitch, view.yaw, 0, 'YXZ')
    const q1 = new THREE.Quaternion().setFromEuler(e)
    const p1 = new THREE.Vector3(view.x, view.y, view.z)
    const dist = p0.distanceTo(p1)
    this.flight = { t: 0, dur: clamp(0.8 + dist / 90, 0.9, 2.6), p0, p1, q0, q1, done: finish }
  }

  setMode(m: Mode, silent = false) {
    if (m === this.mode) return
    this.mode = m
    if (m === 'orbit') {
      this.releaseLock()
      const p0 = this.camera.position.clone()
      const q0 = this.camera.quaternion.clone()
      const p1 = new THREE.Vector3(70, 80, 200)
      const tgt = new THREE.Vector3(0, 10, 0)
      const mtx = new THREE.Matrix4().lookAt(p1, tgt, new THREE.Vector3(0, 1, 0))
      const q1 = new THREE.Quaternion().setFromRotationMatrix(mtx)
      this.flight = {
        t: 0, dur: 2.2, p0, p1, q0, q1, done: () => {
          this.controls.target.copy(tgt)
          this.controls.enabled = true
          this.controls.update()
        },
      }
      this.camera.fov = 48
      this.camera.updateProjectionMatrix()
      this.shadowRange = 150
    } else {
      this.controls.enabled = false
      this.camera.fov = this.fovBase
      this.camera.updateProjectionMatrix()
      this.shadowRange = 70
      if (!silent) {
        const v = POIS[0].view
        this.teleport(v)
      }
    }
    this.ev.onMode?.(m)
  }

  /* ------------------------------------------------------------------ loop */
  private loop = () => {
    if (this.disposed) return
    const dt = Math.min(this.clock.getDelta(), 0.1)
    this.time += dt
    this.frame++

    // time-of-day blending
    if (this.blend < 1) {
      this.blend = Math.min(1, this.blend + dt / 2.2)
      this.applyPreset(ease(this.blend))
      if (this.blend >= 0.5 && !this.envDone) { this.refreshEnv(); this.envDone = true }
      if (this.blend >= 1) this.refreshEnv()
    }

    // flight (teleport / mode change)
    if (this.flight) {
      const f = this.flight
      f.t += dt / f.dur
      const t = ease(clamp(f.t, 0, 1))
      this.camera.position.lerpVectors(f.p0, f.p1, t)
      this.camera.position.y += Math.sin(t * Math.PI) * Math.min(18, f.p0.distanceTo(f.p1) * 0.08)
      this.camera.quaternion.slerpQuaternions(f.q0, f.q1, t)
      if (f.t >= 1) {
        const d = f.done
        this.flight = null
        d()
      }
    } else if (this.mode === 'walk') {
      this.walk(dt)
    } else {
      this.controls.update()
    }

    // zone-dependent lighting
    const ey = this.camera.position.y
    const feetY = this.mode === 'walk' ? this.py : Math.max(0, ey - 2)
    const cz = this.mode === 'walk' ? zoneAt(this.pos.x, feetY, this.pos.z) : 'outside'
    if (cz !== this.zone) this.zone = cz
    const zt = ZONE_ENV[this.zone]
    const k = 1 - Math.exp(-dt * 3.5)
    this.zoneBlend.env += (zt.env - this.zoneBlend.env) * k
    this.zoneBlend.hemi += (zt.hemi - this.zoneBlend.hemi) * k
    this.zoneBlend.fog += (zt.fog - this.zoneBlend.fog) * k
    this.scene.environmentIntensity = this.zoneBlend.env * (0.55 + 0.45 * (1 - this.cur.night * 0.6))
    this.hemi.intensity = this.cur.hemi * this.zoneBlend.hemi
    this.fog.density = this.cur.fogD * (0.25 + 0.75 * this.zoneBlend.fog)
    // interior fixtures are slightly stronger when it is dark outside
    for (const l of this.world.lamps) l.light.intensity = l.base * (1 + this.cur.night * 0.35)

    // sun / shadow frustum follows the viewer
    const focus = this.mode === 'walk' ? this.camera.position : this.controls.target
    const R = this.shadowRange
    const sc = this.sun.shadow.camera
    if (sc.right !== R) {
      sc.left = -R; sc.right = R; sc.top = R; sc.bottom = -R
      sc.updateProjectionMatrix()
    }
    const texel = (2 * R) / this.sun.shadow.mapSize.x
    const fx = Math.round(focus.x / texel) * texel, fy = Math.round(focus.y / texel) * texel, fz = Math.round(focus.z / texel) * texel
    this.sun.target.position.set(fx, fy, fz)
    this.sun.position.set(fx, fy, fz).addScaledVector(this.lightDir, 300)
    this.sun.intensity = this.sunIntensity
    this.sun.target.updateMatrixWorld()

    // sky + clouds follow the camera
    this.sky.position.copy(this.camera.position)
    this.stars.position.copy(this.camera.position)
    this.clouds.position.x = this.camera.position.x
    this.clouds.position.z = this.camera.position.z
    this.cloudU.uTime.value = this.time
    ;(this.cloudU.uCam.value as THREE.Vector3).copy(this.camera.position)

    for (const u of this.world.updaters) u(this.time, dt)

    this.renderer.render(this.scene, this.camera)

    if (this.frame % 3 === 0) this.report()
  }

  private walk(dt: number) {
    const k = this.keys
    let f = (k.has('w') || k.has('arrowup') ? 1 : 0) - (k.has('s') || k.has('arrowdown') ? 1 : 0)
    let s = (k.has('d') ? 1 : 0) - (k.has('a') ? 1 : 0)
    f += -this.joy.y
    s += this.joy.x
    if (k.has('arrowleft')) this.yaw += 1.8 * dt
    if (k.has('arrowright')) this.yaw -= 1.8 * dt
    const mag = Math.hypot(f, s)
    if (mag > 1) { f /= mag; s /= mag }
    const run = k.has('shift') || Math.hypot(this.joy.x, this.joy.y) > 0.95
    const speed = (run ? 6.2 : 2.7) * (this.zone === 'gallery' ? 0.9 : 1)
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw)
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw)
    const vx = (fx * f + rx * s) * speed * dt
    const vz = (fz * f + rz * s) * speed * dt
    const moving = Math.abs(vx) + Math.abs(vz) > 1e-5
    if (moving) {
      this.pos.x += vx
      this.pos.z += vz
      this.collide(this.pos, this.py)
      this.bob += dt * (run ? 11 : 7.5)
    }
    // vertical: stairs / floors
    const target = this.surfaceAt(this.pos.x, this.pos.z, this.py)
    const dy = target - this.py
    this.py += dy * (1 - Math.exp(-dt * (dy > 0 ? 16 : 10)))
    if (Math.abs(target - this.py) < 0.002) this.py = target
    const bobY = moving ? Math.sin(this.bob) * 0.035 * (run ? 1.4 : 1) : 0
    this.camera.position.set(this.pos.x, this.py + 1.65 + bobY, this.pos.z)
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ')
  }

  private report() {
    const walking = this.mode === 'walk'
    const level = this.py > 4 ? 1 : 0
    this.ev.onFrame?.({ x: walking ? this.pos.x : this.camera.position.x, y: this.py, z: walking ? this.pos.z : this.camera.position.z, yaw: walking ? this.yaw : Math.atan2(-(this.controls.target.x - this.camera.position.x), -(this.controls.target.z - this.camera.position.z)), zone: this.zone, level })
    if (!walking || this.flight) { if (this.lastPOI) { this.lastPOI = null; this.ev.onPOI?.(null) } return }
    let best: POI | null = null, bd = 1e9
    for (const p of POIS) {
      const d = Math.hypot(this.pos.x - p.pos[0], this.pos.z - p.pos[2])
      const lvl = Math.abs(this.py - (p.view.y - 1.65)) < 4
      if (lvl && d < p.radius && d < bd) { best = p; bd = d }
    }
    const id = best?.id ?? null
    if (id !== this.lastPOI) { this.lastPOI = id; this.ev.onPOI?.(best) }
  }

  dispose() {
    this.disposed = true
    this.renderer.setAnimationLoop(null)
    this.unbind()
    this.ro.disconnect()
    this.controls.dispose()
    this.envRT?.dispose()
    this.pmrem.dispose()
    this.world.group.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.isMesh) {
        m.geometry?.dispose()
        const mats = Array.isArray(m.material) ? m.material : [m.material]
        mats.forEach((mm) => mm.dispose())
      }
    })
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }
}


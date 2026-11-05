import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { Sky } from 'three/examples/jsm/objects/Sky.js'
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import hdrUrl from '../../assets/hdr/kloofendal_48d_partly_cloudy_puresky_1k.hdr?url'
import { loadMats } from './mats'
import { BuildCtx, Collider, Zone, clamp, lerp } from './util'
import { buildRivierahal } from './rivierahal'
import { buildGrounds } from './grounds'
import { POIS, Poi } from './poi'
;(window as unknown as { __pois: unknown }).__pois = { POIS }

export type TimeOfDay = 'day' | 'golden' | 'night'
export type Quality = 'low' | 'medium' | 'high'
export type Mode = 'walk' | 'orbit'

export interface Events {
  onProgress?: (p: number, label: string) => void
  onReady?: () => void
  onZone?: (name: string, id: string) => void
  onPose?: (x: number, z: number, yaw: number) => void
  onMode?: (m: Mode) => void
  onPoi?: (p: Poi | null) => void
  onTour?: (on: boolean) => void
}

interface Preset {
  hdr: boolean
  dir: THREE.Vector3
  sunInt: number
  sunColor: string
  env: number
  exposure: number
  fog: string
  fogD: number
  night: number
  sky: { turb: number; ray: number; mie: number; g: number; elev: number }
}

const DAY_DIR = new THREE.Vector3(0.553, 0.743, 0.377).normalize()
const az = Math.atan2(DAY_DIR.x, DAY_DIR.z)
const fromElev = (deg: number, a = az) => {
  const e = (deg * Math.PI) / 180
  return new THREE.Vector3(Math.cos(e) * Math.sin(a), Math.sin(e), Math.cos(e) * Math.cos(a))
}
const PRESETS: Record<TimeOfDay, Preset> = {
  day: { hdr: true, dir: DAY_DIR, sunInt: 3.1, sunColor: '#fff1dc', env: 0.85, exposure: 0.9, fog: '#c6d5e2', fogD: 0.0014, night: 0, sky: { turb: 3, ray: 1, mie: 0.004, g: 0.8, elev: 48 } },
  golden: { hdr: false, dir: fromElev(7, az - 0.5), sunInt: 3.6, sunColor: '#ffb676', env: 0.7, exposure: 0.85, fog: '#e2b99b', fogD: 0.0015, night: 0.3, sky: { turb: 8, ray: 2.2, mie: 0.012, g: 0.85, elev: 7 } },
  night: { hdr: false, dir: new THREE.Vector3(-0.35, 0.55, 0.6).normalize(), sunInt: 0.55, sunColor: '#8fa8ff', env: 0.22, exposure: 1.0, fog: '#0a1226', fogD: 0.0018, night: 1, sky: { turb: 1.5, ray: 0.3, mie: 0.002, g: 0.7, elev: -9 } },
}

const GradeShader = {
  uniforms: { tDiffuse: { value: null as THREE.Texture | null }, vig: { value: 0.32 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float vig; varying vec2 vUv;
  void main(){ vec4 c=texture2D(tDiffuse,vUv); vec2 d=vUv-0.5; float v=smoothstep(0.95,0.25,length(d)*1.2); c.rgb*=mix(1.0-vig,1.0,v); gl_FragColor=c; }`,
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

interface Flight {
  t: number
  dur: number
  fp: THREE.Vector3
  tp: THREE.Vector3
  fq: THREE.Quaternion
  tq: THREE.Quaternion
  arc: number
  done: () => void
}

export class World {
  renderer: THREE.WebGLRenderer
  scene = new THREE.Scene()
  camera: THREE.PerspectiveCamera
  controls: OrbitControls
  mode: Mode = 'orbit'
  quality: Quality
  time: TimeOfDay = 'day'
  towerOn = false
  zones: Zone[] = []
  private container: HTMLElement
  private ev: Events
  private ctx!: BuildCtx
  private composer: EffectComposer | null = null
  private bloom: UnrealBloomPass | null = null
  private clock = new THREE.Clock()
  private sun: THREE.DirectionalLight
  private sky: Sky
  private envSky: Sky
  private envScene = new THREE.Scene()
  private pmrem: THREE.PMREMGenerator
  private envDay: THREE.Texture | null = null
  private envSkyTex: THREE.Texture | null = null
  private hdr: THREE.Texture | null = null
  private stars: THREE.Points
  private stdMats: THREE.MeshStandardMaterial[] = []
  private fog = new THREE.FogExp2('#c6d5e2', 0.0014)
  private colliders: Collider[] = []
  private floors: BuildCtx['floors'] = []
  private flight: Flight | null = null
  private yaw = 0
  private pitch = 0
  private eyeY = 1.7
  private pos = new THREE.Vector3()
  private keys: Record<string, boolean> = {}
  private stick = { x: 0, y: 0 }
  private drag = { on: false, x: 0, y: 0 }
  private bob = 0
  private lastZone = ''
  private zoneT = 0
  private poseT = 0
  private disposed = false
  private ro: ResizeObserver
  private tourOn = false
  private tourI = 0
  private tourWait = 0
  private shadowC = new THREE.Vector3()
  private ready = false
  curPoi: Poi | null = null

  constructor(container: HTMLElement, ev: Events, quality: Quality = 'medium') {
    this.container = container
    this.ev = ev
    this.quality = quality
    const w = container.clientWidth || 1
    const h = container.clientHeight || 1
    this.renderer = new THREE.WebGLRenderer({ antialias: quality === 'low', powerPreference: 'high-performance' })
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    const el = this.renderer.domElement
    el.style.touchAction = 'none'
    el.style.display = 'block'
    el.className = 'absolute inset-0 h-full w-full outline-none'
    container.appendChild(el)

    this.camera = new THREE.PerspectiveCamera(62, w / h, 0.15, 3200)
    this.camera.rotation.order = 'YXZ'
    this.camera.position.set(74, 52, 98)
    this.scene.fog = this.fog

    this.controls = new OrbitControls(this.camera, el)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.07
    this.controls.target.set(0, 4, 6)
    this.controls.maxPolarAngle = Math.PI * 0.495
    this.controls.minDistance = 3
    this.controls.maxDistance = 420
    this.controls.autoRotate = true
    this.controls.autoRotateSpeed = 0.35
    this.controls.addEventListener('start', () => {
      this.controls.autoRotate = false
      if (this.tourOn) this.stopTour()
    })
    this.controls.update()

    this.pmrem = new THREE.PMREMGenerator(this.renderer)
    this.sky = new Sky()
    this.sky.scale.setScalar(2800)
    this.sky.visible = false
    this.scene.add(this.sky)
    this.envSky = new Sky()
    this.envSky.scale.setScalar(2000)
    this.envScene.add(this.envSky)

    this.sun = new THREE.DirectionalLight('#fff1dc', 3)
    this.sun.castShadow = true
    this.sun.shadow.camera.near = 10
    this.sun.shadow.camera.far = 420
    const S = 85
    Object.assign(this.sun.shadow.camera, { left: -S, right: S, top: S, bottom: -S })
    this.sun.shadow.bias = -0.00025
    this.sun.shadow.normalBias = 0.035
    this.scene.add(this.sun, this.sun.target)

    const sp: number[] = []
    for (let i = 0; i < 1600; i++) {
      const a = Math.random() * Math.PI * 2
      const y = Math.random() * 0.95 + 0.04
      const rr = Math.sqrt(1 - y * y) * 2500
      sp.push(Math.cos(a) * rr, y * 2500, Math.sin(a) * rr)
    }
    const sg = new THREE.BufferGeometry()
    sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3))
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: '#ffffff', size: 1.7, sizeAttenuation: false, transparent: true, opacity: 0.9, depthWrite: false, fog: false }))
    this.stars.visible = false
    this.scene.add(this.stars)

    this.applyQuality(quality)
    this.bindInput()
    this.ro = new ResizeObserver(() => this.resize())
    this.ro.observe(container)
    ;(window as unknown as { __world: World }).__world = this
  }

  /* ------------------------------------------------------------------ build */
  async start() {
    const tick = () => new Promise((r) => setTimeout(r, 16))
    this.ev.onProgress?.(0.02, 'Loading photographic textures')
    const m = await loadMats((p) => this.ev.onProgress?.(0.02 + p * 0.3, 'Loading photographic textures'), this.renderer.capabilities.getMaxAnisotropy())
    if (this.disposed) return
    this.ev.onProgress?.(0.35, 'Loading sky lighting (HDRI)')
    const hdr = await new RGBELoader().loadAsync(hdrUrl)
    if (this.disposed) return
    hdr.mapping = THREE.EquirectangularReflectionMapping
    this.hdr = hdr
    this.envDay = this.pmrem.fromEquirectangular(hdr).texture
    await tick()
    this.ctx = {
      root: new THREE.Group(), m, colliders: [], floors: [], zones: [], glow: [], dayGlow: [], lights: [], anim: [], waters: [], tower: [], today: [], interior: [],
    }
    this.scene.add(this.ctx.root)
    this.ev.onProgress?.(0.45, 'Constructing the Rivi\u00e8rahal')
    await tick()
    buildRivierahal(this.ctx)
    this.ev.onProgress?.(0.72, 'Planting the gardens')
    await tick()
    buildGrounds(this.ctx, this.quality === 'low' ? 70 : this.quality === 'medium' ? 130 : 190)
    this.colliders = this.ctx.colliders
    this.floors = this.ctx.floors
    this.zones = this.ctx.zones
    this.ev.onProgress?.(0.9, 'Lighting the scene')
    await tick()
    const seen = new Set<THREE.Material>()
    this.ctx.root.traverse((o) => {
      const mm = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined
      if (!mm) return
      for (const x of Array.isArray(mm) ? mm : [mm]) {
        if (seen.has(x)) continue
        seen.add(x)
        const s = x as THREE.MeshStandardMaterial
        if (s.isMeshStandardMaterial) {
          s.userData.envBase = s.envMapIntensity
          this.stdMats.push(s)
        }
      }
    })
    this.setTower(false)
    this.setTime('day')
    this.ev.onProgress?.(1, 'Opening the doors')
    await tick()
    this.renderer.compile(this.scene, this.camera)
    this.ready = true
    this.ev.onMode?.('orbit')
    this.ev.onReady?.()
    this.renderer.setAnimationLoop(this.loop)
  }

  /* ------------------------------------------------------------------ settings */
  applyQuality(q: Quality) {
    this.quality = q
    const dpr = window.devicePixelRatio || 1
    this.renderer.setPixelRatio(q === 'low' ? 1 : q === 'medium' ? Math.min(dpr, 1.5) : Math.min(dpr, 2))
    const ss = q === 'low' ? 2048 : q === 'medium' ? 3072 : 4096
    this.sun.shadow.mapSize.set(ss, ss)
    this.sun.shadow.map?.dispose()
    this.sun.shadow.map = null
    this.setupComposer()
    this.resize()
  }

  private setupComposer() {
    this.composer?.dispose()
    this.composer = null
    this.bloom = null
    if (this.quality === 'low') return
    const size = this.renderer.getSize(new THREE.Vector2())
    const pr = this.renderer.getPixelRatio()
    const rt = new THREE.WebGLRenderTarget(size.x * pr, size.y * pr, { type: THREE.HalfFloatType, samples: 4 })
    const c = new EffectComposer(this.renderer, rt)
    c.addPass(new RenderPass(this.scene, this.camera))
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.1, 0.65, 4.0)
    c.addPass(this.bloom)
    c.addPass(new ShaderPass(GradeShader))
    c.addPass(new OutputPass())
    this.composer = c
  }

  private resize() {
    const w = this.container.clientWidth || 1
    const h = this.container.clientHeight || 1
    this.renderer.setSize(w, h)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.composer?.setPixelRatio(this.renderer.getPixelRatio())
    this.composer?.setSize(w, h)
  }

  setTower(on: boolean) {
    this.towerOn = on
    if (!this.ctx) return
    this.ctx.tower.forEach((o) => (o.visible = on))
    this.ctx.today.forEach((o) => (o.visible = !on))
  }

  private applyEnv(tex: THREE.Texture, k: number) {
    for (const s of this.stdMats) {
      if (s.envMap !== tex) {
        s.envMap = tex
        s.needsUpdate = true
      }
      s.envMapIntensity = (s.userData.envBase as number) * k
    }
  }

  setTime(t: TimeOfDay) {
    this.time = t
    if (!this.ctx) return
    const P = PRESETS[t]
    this.sun.color.set(P.sunColor)
    this.sun.intensity = P.sunInt
    this.sun.userData.dir = P.dir
    this.renderer.toneMappingExposure = P.exposure
    this.fog.color.set(P.fog)
    this.fog.density = P.fogD
    if (P.hdr && this.hdr && this.envDay) {
      this.scene.background = this.hdr
      this.scene.backgroundIntensity = 1
      this.sky.visible = false
      this.applyEnv(this.envDay, P.env)
    } else {
      for (const s of [this.sky, this.envSky]) {
        const u = s.material.uniforms
        u.turbidity.value = P.sky.turb
        u.rayleigh.value = P.sky.ray
        u.mieCoefficient.value = P.sky.mie
        u.mieDirectionalG.value = P.sky.g
        const e = (P.sky.elev * Math.PI) / 180
        u.sunPosition.value.set(Math.cos(e) * Math.sin(az - (t === 'golden' ? 0.5 : 0)), Math.sin(e), Math.cos(e) * Math.cos(az - (t === 'golden' ? 0.5 : 0)))
      }
      this.envSkyTex?.dispose()
      this.envSkyTex = this.pmrem.fromScene(this.envScene, 0, 1, 5000).texture
      if (t === 'night') {
        this.scene.background = new THREE.Color('#060d22')
        this.sky.visible = false
      } else {
        this.scene.background = null
        this.sky.visible = true
      }
      this.applyEnv(this.envSkyTex, P.env)
    }
    this.stars.visible = t === 'night'
    // artificial lights
    const n = P.night
    for (const l of this.ctx.lights) {
      const v = lerp(l.day, l.night, n)
      l.light.intensity = v
      l.light.visible = v > 0.01
    }
    for (const g of this.ctx.glow) g.mat.emissiveIntensity = g.k * n
    const slit = this.ctx.m.slit
    slit.emissive.set(n > 0.6 ? '#ffc888' : '#bcd6ee')
    slit.emissiveIntensity = n > 0.6 ? 0.9 : lerp(0.9, 0.5, n)
    this.ctx.m.glass.envMapIntensity = t === 'night' ? 0.4 : 1.1
    this.ctx.m.stars.color.set(n > 0.6 ? '#ffffff' : '#c8d0ff')
    for (const w of this.ctx.waters) {
      const u = (w.material as THREE.ShaderMaterial).uniforms
      u.sunDirection.value.copy(P.dir)
      u.sunColor.value.set(P.sunColor)
      u.waterColor.value.set(t === 'night' ? '#050c14' : t === 'golden' ? '#2b3c3e' : '#14383a')
    }
    this.sun.shadow.needsUpdate = true
    this.shadowC.set(1e9, 0, 0)
  }

  /* ------------------------------------------------------------------ input */
  private bindInput() {
    const el = this.renderer.domElement
    const key = (e: KeyboardEvent, down: boolean) => {
      const t = e.target as HTMLElement
      if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return
      this.keys[e.code] = down
      if (down && this.tourOn && ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) this.stopTour()
      if (this.mode === 'walk' && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault()
    }
    window.addEventListener('keydown', (e) => key(e, true))
    window.addEventListener('keyup', (e) => key(e, false))
    el.addEventListener('pointerdown', (e) => {
      if (this.mode !== 'walk' || this.flight) return
      this.drag = { on: true, x: e.clientX, y: e.clientY }
      el.setPointerCapture(e.pointerId)
      if (this.tourOn) this.stopTour()
    })
    el.addEventListener('pointermove', (e) => {
      if (this.mode !== 'walk') return
      if (document.pointerLockElement === el) {
        this.look(e.movementX, e.movementY)
      } else if (this.drag.on) {
        this.look(e.clientX - this.drag.x, e.clientY - this.drag.y)
        this.drag.x = e.clientX
        this.drag.y = e.clientY
      }
    })
    const up = () => (this.drag.on = false)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
    el.addEventListener('wheel', (e) => {
      if (this.mode !== 'walk') return
      e.preventDefault()
      this.camera.fov = clamp(this.camera.fov + e.deltaY * 0.02, 28, 78)
      this.camera.updateProjectionMatrix()
    }, { passive: false })
  }

  look(dx: number, dy: number) {
    this.yaw -= dx * 0.0032
    this.pitch = clamp(this.pitch - dy * 0.0032, -1.45, 1.45)
  }
  setStick(x: number, y: number) {
    this.stick.x = x
    this.stick.y = y
    if ((x || y) && this.tourOn) this.stopTour()
  }
  togglePointerLock() {
    const el = this.renderer.domElement
    if (document.pointerLockElement === el) document.exitPointerLock()
    else el.requestPointerLock?.()
  }

  /* ------------------------------------------------------------------ walking */
  private floorAt(x: number, z: number) {
    let h = 0
    for (const f of this.floors) {
      if (x < f.x0 || x > f.x1 || z < f.z0 || z > f.z1) continue
      if (f.round) {
        const cx = (f.x0 + f.x1) / 2, cz = (f.z0 + f.z1) / 2
        const rx = (f.x1 - f.x0) / 2, rz = (f.z1 - f.z0) / 2
        if (((x - cx) / rx) ** 2 + ((z - cz) / rz) ** 2 > 1) continue
      }
      if (f.h > h) h = f.h
    }
    return h
  }

  private resolve(p: THREE.Vector3) {
    const r = 0.38
    for (let it = 0; it < 3; it++) {
      for (const c of this.colliders) {
        if (c.when === 'tower' && !this.towerOn) continue
        if (c.when === 'today' && this.towerOn) continue
        if (p.x < c.x0 - r || p.x > c.x1 + r || p.z < c.z0 - r || p.z > c.z1 + r) continue
        const cx = clamp(p.x, c.x0, c.x1), cz = clamp(p.z, c.z0, c.z1)
        let dx = p.x - cx, dz = p.z - cz
        const d2 = dx * dx + dz * dz
        if (d2 >= r * r) continue
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2)
          p.x += (dx / d) * (r - d)
          p.z += (dz / d) * (r - d)
        } else {
          dx = Math.min(p.x - c.x0, c.x1 - p.x)
          dz = Math.min(p.z - c.z0, c.z1 - p.z)
          if (dx < dz) p.x += p.x - c.x0 < c.x1 - p.x ? -(dx + r) : dx + r
          else p.z += p.z - c.z0 < c.z1 - p.z ? -(dz + r) : dz + r
        }
      }
    }
  }

  private walk(dt: number) {
    const k = this.keys
    let f = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0)
    let s = (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0)
    if (k.ArrowLeft) this.yaw += dt * 1.8
    if (k.ArrowRight) this.yaw -= dt * 1.8
    f += this.stick.y
    s += this.stick.x
    const len = Math.hypot(f, s)
    if (len > 1) { f /= len; s /= len }
    const speed = (k.ShiftLeft || k.ShiftRight ? 5.6 : 2.5) * (this.camera.fov < 45 ? 0.8 : 1)
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw)
    if (f || s) {
      this.pos.x += (-sy * f + cy * s) * speed * dt
      this.pos.z += (-cy * f - sy * s) * speed * dt
      this.bob += dt * speed * 2.1
      this.resolve(this.pos)
    }
    const target = this.floorAt(this.pos.x, this.pos.z) + 1.65 + (f || s ? Math.sin(this.bob) * 0.028 * (speed > 4 ? 1.4 : 1) : 0)
    this.eyeY += (target - this.eyeY) * Math.min(1, dt * 10)
    this.camera.position.set(this.pos.x, this.eyeY, this.pos.z)
    this.camera.rotation.set(this.pitch, this.yaw, 0)
  }

  /* ------------------------------------------------------------------ travel */
  private flyTo(tp: THREE.Vector3, look: THREE.Vector3, dur: number, done: () => void) {
    const fq = this.camera.quaternion.clone()
    const m = new THREE.Matrix4().lookAt(tp, look, new THREE.Vector3(0, 1, 0))
    const tq = new THREE.Quaternion().setFromRotationMatrix(m)
    const dist = this.camera.position.distanceTo(tp)
    this.flight = { t: 0, dur: dur ?? clamp(dist / 28, 1.6, 5.5), fp: this.camera.position.clone(), tp, fq, tq, arc: Math.min(14, dist * 0.08), done }
  }

  private lookAngles(from: THREE.Vector3, to: THREE.Vector3) {
    const d = to.clone().sub(from)
    return { yaw: Math.atan2(-d.x, -d.z), pitch: Math.atan2(d.y, Math.hypot(d.x, d.z)) }
  }

  goto(poi: Poi, instant = false) {
    if (!this.ready) return
    this.curPoi = poi
    this.ev.onPoi?.(poi)
    this.controls.autoRotate = false
    if (poi.tower !== undefined) this.setTower(poi.tower)
    const look = new THREE.Vector3(...poi.look)
    const p = new THREE.Vector3(...poi.pos)
    const walk = poi.mode === 'walk'
    if (walk) p.y = Math.max(p.y, this.floorAt(p.x, p.z) + 1.65)
    if (this.mode === 'orbit') this.controls.enabled = false
    this.drag.on = false
    const finish = () => {
      this.flight = null
      if (walk) {
        const a = this.lookAngles(p, look)
        this.yaw = a.yaw
        this.pitch = clamp(a.pitch, -1.2, 1.2)
        this.pos.set(p.x, 0, p.z)
        this.eyeY = p.y
        this.setMode('walk', true)
      } else {
        this.camera.position.copy(p)
        this.controls.target.copy(look)
        this.controls.update()
        this.setMode('orbit', true)
      }
    }
    if (instant) { finish(); return }
    this.flyTo(p, look, clamp(this.camera.position.distanceTo(p) / 26, 1.8, 5.5), finish)
  }

  setMode(m: Mode, quiet = false) {
    this.mode = m
    this.controls.enabled = m === 'orbit' && !this.flight
    if (m === 'walk') {
      this.camera.fov = 62
      this.camera.updateProjectionMatrix()
    }
    if (!quiet) this.ev.onMode?.(m)
    else this.ev.onMode?.(m)
  }

  toggleMode() {
    if (this.mode === 'walk') {
      this.goto(POIS.find((p) => p.id === 'aerial')!)
    } else if (this.mode === 'orbit') {
      // drop to the ground in front of the main fa\u00e7ade
      const p = this.camera.position
      const x = clamp(p.x, -60, 60), z = clamp(p.z, -60, 150)
      const dir = new THREE.Vector3()
      this.camera.getWorldDirection(dir)
      this.goto({ id: 'free', title: 'Walking', tag: '', text: '', pos: [x, 1.7, z], look: [x + dir.x * 10, 2, z + dir.z * 10], mode: 'walk' })
    }
  }

  startTour() {
    this.tourOn = true
    this.tourI = 0
    this.tourWait = 0
    this.ev.onTour?.(true)
    this.goto(POIS[0])
  }
  stopTour() {
    if (!this.tourOn) return
    this.tourOn = false
    this.ev.onTour?.(false)
  }
  get touring() { return this.tourOn }

  /* ------------------------------------------------------------------ loop */
  loop = () => {
    if (this.disposed) return
    const dt = Math.min(0.1, this.clock.getDelta())
    const t = this.clock.elapsedTime
    for (const a of this.ctx.anim) a(t, dt)
    for (const w of this.ctx.waters) {
      const u = (w.material as THREE.ShaderMaterial).uniforms
      u.time.value += dt * 0.55
    }
    this.ctx.m.lilyWater.normalMap!.offset.set(t * 0.012, t * 0.008)

    if (this.flight) {
      const f = this.flight
      f.t += dt
      const k = ease(clamp(f.t / f.dur, 0, 1))
      this.camera.position.lerpVectors(f.fp, f.tp, k)
      this.camera.position.y += Math.sin(k * Math.PI) * f.arc
      this.camera.quaternion.slerpQuaternions(f.fq, f.tq, k)
      if (f.t >= f.dur) {
        const d = f.done
        this.flight = null
        d()
        this.tourWait = 7.5
      }
    } else if (this.mode === 'walk') {
      this.walk(dt)
    } else if (this.mode === 'orbit') {
      this.controls.update()
    }

    if (this.tourOn && !this.flight) {
      this.tourWait -= dt
      if (this.tourWait <= 0) {
        this.tourI = (this.tourI + 1) % POIS.length
        this.goto(POIS[this.tourI])
        this.tourWait = 999
      }
    }

    // sun follows the viewer so shadows stay sharp where you are
    const c = this.mode === 'orbit' ? this.controls.target : this.camera.position
    if (this.shadowC.distanceToSquared(c) > 16) {
      this.shadowC.set(Math.round(c.x / 4) * 4, 0, Math.round(c.z / 4) * 4)
      const dir = (this.sun.userData.dir as THREE.Vector3) ?? DAY_DIR
      this.sun.target.position.copy(this.shadowC)
      this.sun.position.copy(this.shadowC).addScaledVector(dir, 200)
      this.sun.target.updateMatrixWorld()
    }

    this.zoneT += dt
    if (this.zoneT > 0.2) {
      this.zoneT = 0
      const p = this.camera.position
      let best: Zone | null = null
      let ba = 1e12
      for (const z of this.zones) {
        if (p.x >= z.x0 && p.x <= z.x1 && p.z >= z.z0 && p.z <= z.z1) {
          const a = (z.x1 - z.x0) * (z.z1 - z.z0)
          if (a < ba) { ba = a; best = z }
        }
      }
      const name = best?.name ?? 'Diergaarde Blijdorp'
      if (name !== this.lastZone) {
        this.lastZone = name
        this.ev.onZone?.(name, best?.id ?? '')
      }
    }
    this.poseT += dt
    if (this.poseT > 0.06) {
      this.poseT = 0
      const d = new THREE.Vector3()
      this.camera.getWorldDirection(d)
      this.ev.onPose?.(this.camera.position.x, this.camera.position.z, Math.atan2(d.x, -d.z))
    }

    if (this.composer) this.composer.render()
    else this.renderer.render(this.scene, this.camera)
  }

  dispose() {
    this.disposed = true
    this.renderer.setAnimationLoop(null)
    this.ro.disconnect()
    this.composer?.dispose()
    this.controls.dispose()
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }
}

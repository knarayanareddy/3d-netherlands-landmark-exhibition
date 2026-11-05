import * as THREE from 'three'
import { Sky } from 'three/examples/jsm/objects/Sky.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { createMaterials, setAniso } from './textures'
import { buildWorld, World, LV } from './world'
import { PAINTINGS, PaintingDef } from './paintings'

export type TimeOfDay = 'day' | 'golden' | 'night'
export type Mode = 'walk' | 'orbit'

export interface EngineEvents {
  onProgress: (p: number, label: string) => void
  onZone: (name: string) => void
  onFocus: (p: PaintingDef | null) => void
  onMode: (m: Mode) => void
  onPose: (x: number, y: number, z: number, yaw: number) => void
  onLock: (locked: boolean) => void
}

interface Preset {
  el: number; az: number; turb: number; ray: number; mie: number; mieG: number
  sunI: number; sunColor: string; hemi: number; hemiSky: string; hemiGround: string
  fog: string; fogD: number; exposure: number; env: number; night: number
  cloud: number; cloudLight: [number, number, number]; cloudDark: [number, number, number]
}
const PRESETS: Record<TimeOfDay, Preset> = {
  day: { el: 46, az: 28, turb: 3.2, ray: 1.3, mie: 0.004, mieG: 0.8, sunI: 3.4, sunColor: '#fff3e0', hemi: 0.5, hemiSky: '#bcd8f2', hemiGround: '#8e8b72', fog: '#c9d9e8', fogD: 0.0011, exposure: 0.62, env: 1, night: 0, cloud: 0.5, cloudLight: [1.0, 1.0, 1.0], cloudDark: [0.62, 0.68, 0.78] },
  golden: { el: 8, az: 62, turb: 7, ray: 2.2, mie: 0.01, mieG: 0.85, sunI: 4.0, sunColor: '#ffb06e', hemi: 0.38, hemiSky: '#e8b79b', hemiGround: '#6c5d48', fog: '#e8b693', fogD: 0.0015, exposure: 0.62, env: 0.9, night: 0.25, cloud: 0.46, cloudLight: [1.0, 0.62, 0.38], cloudDark: [0.4, 0.28, 0.32] },
  night: { el: -6, az: 28, turb: 2, ray: 0.5, mie: 0.003, mieG: 0.7, sunI: 0.7, sunColor: '#92abff', hemi: 0.22, hemiSky: '#2a3d70', hemiGround: '#10151f', fog: '#0a1224', fogD: 0.0016, exposure: 0.95, env: 0.28, night: 1, cloud: 0.55, cloudLight: [0.05, 0.065, 0.12], cloudDark: [0.012, 0.016, 0.03] },
}

const EYE = 1.65
const RADIUS = 0.42

export class MuseumEngine {
  private host: HTMLElement
  private ev: EngineEvents
  private renderer!: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera = new THREE.PerspectiveCamera(68, 1, 0.1, 3200)
  private orbit!: OrbitControls
  private sky!: Sky
  private envSky!: Sky
  private envScene = new THREE.Scene()
  private pmrem!: THREE.PMREMGenerator
  private envRT: THREE.WebGLRenderTarget | null = null
  private sun = new THREE.DirectionalLight('#fff', 3)
  private hemi = new THREE.HemisphereLight('#fff', '#888', 0.5)
  private ambient = new THREE.AmbientLight('#fff1dc', 0)
  private pool: { light: THREE.PointLight; anchor: number; cur: number; target: number }[] = []
  private clouds!: THREE.Mesh
  private stars!: THREE.Points
  private world!: World
  private raf = 0
  private disposed = false
  private ro?: ResizeObserver
  private clock = new THREE.Clock()

  mode: Mode = 'orbit'
  time: TimeOfDay = 'golden'
  private P: Preset = PRESETS.golden
  private userExp = 1
  private inside = 0
  private zoneName = ''

  // walker
  private px = 10; private pz = 44; private foot = 0; private vy = 0
  private yaw = 0; private pitch = 0
  private vel = new THREE.Vector2()
  private keys = new Set<string>()
  private touch = { x: 0, y: 0 }
  private bobT = 0
  private stepAcc = 0
  private fovT = 68
  private locked = false
  private insp: { t: number; fp: THREE.Vector3; fy: number; fyaw: number; fpitch: number; tp: THREE.Vector3; tfoot: number; tyaw: number; tpitch: number } | null = null
  private focus: PaintingDef | null = null
  private focusTick = 0
  private poseTick = 0
  private ray = new THREE.Raycaster()
  private audio: AudioEngine | null = null
  private muted = false

  constructor(host: HTMLElement, ev: EngineEvents) {
    this.host = host
    this.ev = ev
  }

  /* --------------------------------------------------------------- setup */
  async start() {
    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }))
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    r.shadowMap.enabled = true
    r.shadowMap.type = THREE.PCFSoftShadowMap
    r.shadowMap.autoUpdate = false
    r.toneMapping = THREE.ACESFilmicToneMapping
    r.toneMappingExposure = 0.62
    r.domElement.style.touchAction = 'none'
    r.domElement.style.outline = 'none'
    this.host.appendChild(r.domElement)
    setAniso(Math.min(8, r.capabilities.getMaxAnisotropy()))
    this.pmrem = new THREE.PMREMGenerator(r)

    this.scene.fog = new THREE.FogExp2('#c9d9e8', 0.001)
    this.sky = new Sky(); this.sky.scale.setScalar(450000)
    this.scene.add(this.sky)
    this.envSky = new Sky(); this.envSky.scale.setScalar(450000)
    this.envScene.add(this.envSky)

    this.sun.castShadow = true
    const mapSize = Math.min(4096, r.capabilities.maxTextureSize)
    this.sun.shadow.mapSize.set(mapSize, mapSize)
    const sc = this.sun.shadow.camera
    sc.left = -100; sc.right = 100; sc.top = 100; sc.bottom = -100; sc.near = 1; sc.far = 600
    this.sun.shadow.bias = -0.0003
    this.sun.shadow.normalBias = 0.05
    this.sun.shadow.radius = 2.5
    this.sun.target.position.set(20, 0, 5)
    this.scene.add(this.sun, this.sun.target, this.hemi, this.ambient)

    for (let i = 0; i < 6; i++) {
      const light = new THREE.PointLight('#fff0dc', 0, 24, 2)
      this.scene.add(light)
      this.pool.push({ light, anchor: -1, cur: 0, target: 0 })
    }

    this.buildClouds()
    this.buildStars()

    this.camera.position.set(95, 38, 120)
    this.orbit = new OrbitControls(this.camera, r.domElement)
    this.orbit.target.set(10, 7, 6)
    this.orbit.enableDamping = true
    this.orbit.maxPolarAngle = Math.PI / 2.04
    this.orbit.minDistance = 10
    this.orbit.maxDistance = 260
    this.orbit.autoRotate = true
    this.orbit.autoRotateSpeed = 0.35
    this.orbit.addEventListener('start', () => (this.orbit.autoRotate = false))

    this.bindInput()
    this.resize()
    this.ro = new ResizeObserver(() => this.resize())
    this.ro.observe(this.host)

    // --- assets
    this.ev.onProgress(0.02, 'Fetching paintings from the collection')
    const texs: Record<string, THREE.Texture> = {}
    await Promise.all(
      PAINTINGS.map(
        (p) =>
          new Promise<void>((res) => {
            const img = new Image()
            img.onload = () => {
              const t = new THREE.Texture(img)
              t.colorSpace = THREE.SRGBColorSpace
              t.anisotropy = r.capabilities.getMaxAnisotropy()
              t.needsUpdate = true
              texs[p.id] = t
              res()
            }
            img.onerror = () => res()
            img.src = p.img
          }),
      ),
    )
    if (this.disposed) return
    for (const p of PAINTINGS) if (!texs[p.id]) { const c = document.createElement('canvas'); c.width = c.height = 4; texs[p.id] = new THREE.CanvasTexture(c) }
    const M = await createMaterials((label, p) => this.ev.onProgress(p, label))
    if (this.disposed) return
    this.ev.onProgress(0.6, 'Raising the Rietveld building')
    await new Promise((r2) => setTimeout(r2, 30))
    if (this.disposed) return
    this.world = buildWorld(M, texs)
    this.scene.add(this.world.group)
    this.ev.onProgress(0.9, 'Setting the light')
    await new Promise((r2) => setTimeout(r2, 30))
    if (this.disposed) return
    this.setTime(this.time)
    r.compile(this.scene, this.camera)
    this.ev.onProgress(1, 'Ready')
    this.clock.start()
    this.loop()
  }

  getSegs() { return this.world?.segs ?? [] }
  getTeleports() { return this.world?.teleports ?? [] }

  private buildClouds() {
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.BackSide, fog: false,
      uniforms: { uTime: { value: 0 }, uLight: { value: new THREE.Vector3(1, 1, 1) }, uDark: { value: new THREE.Vector3(0.6, 0.65, 0.75) }, uCover: { value: 0.5 } },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: `
        varying vec3 vDir; uniform float uTime; uniform vec3 uLight; uniform vec3 uDark; uniform float uCover;
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
        float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1.,0.)),f.x), mix(h(i+vec2(0.,1.)),h(i+vec2(1.,1.)),f.x), f.y); }
        float fbm(vec2 p){ float s=0., a=.5; for(int i=0;i<6;i++){ s+=a*n(p); p=p*2.03+vec2(1.7,9.2); a*=.5; } return s; }
        void main(){
          vec3 d = normalize(vDir);
          if (d.y < 0.0) discard;
          vec2 uv = d.xz/(d.y+0.14)*0.85 + vec2(uTime*0.006, uTime*0.0025);
          float c = fbm(uv*1.4);
          float cov = smoothstep(uCover, uCover+0.26, c);
          float c2 = fbm(uv*1.4 + vec2(0.06,0.04)*3.0);
          float lit = clamp(0.62 - (c2 - c)*4.0, 0.0, 1.0);
          vec3 col = mix(uDark, uLight, lit);
          float a = cov * smoothstep(0.0, 0.22, d.y) * 0.92;
          gl_FragColor = vec4(col, a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    })
    this.clouds = new THREE.Mesh(new THREE.SphereGeometry(2900, 32, 16), mat)
    this.clouds.renderOrder = 1
    this.scene.add(this.clouds)
  }
  private buildStars() {
    const n = 1800
    const pos = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      const u = Math.random(), v = Math.random() * 0.97 + 0.03
      const th = u * Math.PI * 2, ph = Math.acos(v)
      pos[i * 3] = Math.sin(ph) * Math.cos(th) * 2800
      pos[i * 3 + 1] = Math.cos(ph) * 2800
      pos[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * 2800
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    this.stars = new THREE.Points(g, new THREE.PointsMaterial({ color: '#ffffff', size: 1.8, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }))
    this.scene.add(this.stars)
  }

  /* ------------------------------------------------------------ time of day */
  setTime(t: TimeOfDay) {
    this.time = t
    const P = (this.P = PRESETS[t])
    const dir = new THREE.Vector3()
    const setSky = (s: Sky) => {
      const u = s.material.uniforms
      u['turbidity'].value = P.turb; u['rayleigh'].value = P.ray; u['mieCoefficient'].value = P.mie; u['mieDirectionalG'].value = P.mieG
      const phi = THREE.MathUtils.degToRad(90 - P.el), th = THREE.MathUtils.degToRad(P.az)
      dir.setFromSphericalCoords(1, phi, th)
      u['sunPosition'].value.copy(dir)
    }
    setSky(this.sky); setSky(this.envSky)
    // light direction (moon at night)
    const lel = t === 'night' ? 38 : P.el
    const laz = t === 'night' ? -35 : P.az
    const ld = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - lel), THREE.MathUtils.degToRad(laz))
    this.sun.position.copy(this.sun.target.position).addScaledVector(ld, 300)
    this.sun.color.set(P.sunColor)
    this.sun.intensity = P.sunI
    this.hemi.color.set(P.hemiSky); this.hemi.groundColor.set(P.hemiGround)
    ;(this.scene.fog as THREE.FogExp2).color.set(P.fog)
    ;(this.scene.fog as THREE.FogExp2).density = P.fogD
    const cu = (this.clouds.material as THREE.ShaderMaterial).uniforms
    cu.uCover.value = P.cloud
    cu.uLight.value.set(...P.cloudLight); cu.uDark.value.set(...P.cloudDark)
    ;(this.stars.material as THREE.PointsMaterial).opacity = P.night
    this.envRT?.dispose()
    this.envRT = this.pmrem.fromScene(this.envScene, 0, 0.1, 5000)
    this.scene.environment = this.envRT.texture
    for (const g of this.world?.glow ?? []) g.mat.emissiveIntensity = g.base + (g.night - g.base) * P.night
    this.renderer.shadowMap.needsUpdate = true
  }
  adjustExposure(f: number) { this.userExp = Math.min(2.2, Math.max(0.5, this.userExp * f)) }
  setMuted(m: boolean) { this.muted = m; this.audio?.setMuted(m) }

  /* ------------------------------------------------------------------ input */
  private bindInput() {
    const el = this.renderer.domElement
    const kd = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return
      const k = e.key.toLowerCase()
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift', 'z'].includes(k)) {
        this.keys.add(k)
        if (k !== 'shift' && k !== 'z') this.insp = null
        if (k.startsWith('arrow')) e.preventDefault()
        this.audio?.resume()
      }
      if ((k === 'e' || k === 'f') && this.mode === 'walk') this.inspect()
    }
    const ku = (e: KeyboardEvent) => this.keys.delete(e.key.toLowerCase())
    window.addEventListener('keydown', kd)
    window.addEventListener('keyup', ku)
    window.addEventListener('blur', () => this.keys.clear())
    this.cleanup.push(() => { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku) })

    let down: { id: number; x: number; y: number; moved: number; kind: 'look' | 'move' } | null = null
    let touchOrigin = { x: 0, y: 0 }
    el.addEventListener('pointerdown', (e) => {
      if (this.mode !== 'walk') return
      this.audio?.resume()
      const rect = el.getBoundingClientRect()
      const isTouch = e.pointerType === 'touch'
      const kind = isTouch && e.clientX - rect.left < rect.width * 0.4 ? 'move' : 'look'
      down = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0, kind }
      if (kind === 'move') touchOrigin = { x: e.clientX, y: e.clientY }
      el.setPointerCapture(e.pointerId)
    })
    el.addEventListener('pointermove', (e) => {
      if (this.mode !== 'walk') return
      if (this.locked) {
        this.lookBy(e.movementX, e.movementY)
        if (down) down.moved += Math.abs(e.movementX) + Math.abs(e.movementY)
        return
      }
      if (!down || down.id !== e.pointerId) return
      if (down.kind === 'move') {
        this.touch.x = THREE.MathUtils.clamp((e.clientX - touchOrigin.x) / 55, -1, 1)
        this.touch.y = THREE.MathUtils.clamp((e.clientY - touchOrigin.y) / 55, -1, 1)
        return
      }
      const dx = e.clientX - down.x, dy = e.clientY - down.y
      down.x = e.clientX; down.y = e.clientY
      down.moved += Math.abs(dx) + Math.abs(dy)
      this.lookBy(dx * (e.pointerType === 'touch' ? 1.4 : 1), dy * (e.pointerType === 'touch' ? 1.4 : 1))
    })
    const up = (e: PointerEvent) => {
      if (!down || down.id !== e.pointerId) return
      const wasClick = down.moved < 6 && down.kind === 'look'
      if (down.kind === 'move') { this.touch.x = 0; this.touch.y = 0 }
      down = null
      if (wasClick) {
        if (this.focus) this.inspect()
        else if (e.pointerType === 'mouse' && !this.locked) {
          try { (el.requestPointerLock?.() as unknown as Promise<void> | undefined)?.catch?.(() => {}) } catch { /* not available in sandboxed frames */ }
        }
      }
    }
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
    const lockChange = () => {
      this.locked = document.pointerLockElement === el
      this.ev.onLock(this.locked)
    }
    document.addEventListener('pointerlockchange', lockChange)
    this.cleanup.push(() => document.removeEventListener('pointerlockchange', lockChange))
    el.addEventListener('wheel', (e) => {
      if (this.mode === 'walk') { this.fovT = THREE.MathUtils.clamp(this.fovT + e.deltaY * 0.03, 24, 80); e.preventDefault() }
    }, { passive: false })
  }
  private cleanup: (() => void)[] = []
  private lookBy(dx: number, dy: number) {
    this.insp = null
    this.yaw -= dx * 0.0024
    this.pitch = THREE.MathUtils.clamp(this.pitch - dy * 0.0024, -1.35, 1.35)
  }

  /* --------------------------------------------------------------- actions */
  setMode(m: Mode) {
    if (m === this.mode) return
    this.mode = m
    if (m === 'walk') {
      this.orbit.enabled = false
      this.orbit.autoRotate = false
      if (this.zoneName === '' && this.foot === 0) this.teleport('plaza')
      else this.teleport('plaza')
      this.camera.fov = 68
    } else {
      document.exitPointerLock?.()
      this.orbit.enabled = true
      this.camera.fov = 45
      this.camera.updateProjectionMatrix()
      this.camera.position.set(95, 38, 120)
      this.orbit.target.set(10, 7, 6)
      this.insp = null
      this.setFocus(null)
    }
    this.ev.onMode(m)
  }
  teleport(id: string) {
    const t = this.world.teleports.find((x) => x.id === id)
    if (!t) return
    if (this.mode !== 'walk') { this.mode = 'walk'; this.orbit.enabled = false; this.orbit.autoRotate = false; this.ev.onMode('walk') }
    this.px = t.x; this.pz = t.z; this.foot = t.y; this.vy = 0
    this.yaw = t.yaw; this.pitch = 0; this.vel.set(0, 0)
    this.fovT = 68
    this.insp = null
    this.audio?.resume()
  }
  inspect(p?: PaintingDef) {
    const def = p ?? this.focus
    if (!def || this.mode !== 'walk') return
    const inst = this.world.paintings.find((q) => q.def.id === def.id)
    if (!inst) return
    const d = Math.max(2.2, inst.h * 1.35 + 1.0)
    const tp = new THREE.Vector3(inst.center.x + inst.normal.x * d, 0, inst.center.z + inst.normal.z * d)
    this.insp = {
      t: 0, fp: new THREE.Vector3(this.px, 0, this.pz), fy: this.foot, fyaw: this.yaw, fpitch: this.pitch,
      tp, tfoot: LV[def.level], tyaw: Math.atan2(inst.normal.x, inst.normal.z), tpitch: 0,
    }
    this.fovT = 52
  }
  private setFocus(p: PaintingDef | null) {
    if (p?.id === this.focus?.id) return
    this.focus = p
    this.ev.onFocus(p)
  }

  /* ------------------------------------------------------------- simulation */
  private groundAt(x: number, z: number, foot: number) {
    let best = -Infinity
    for (const s of this.world.surfs) {
      if (x < s.x0 || x > s.x1 || z < s.z0 || z > s.z1) continue
      let y = s.ya
      if (s.ya !== s.yb) {
        const c = s.axis === 'z' ? z : x
        const t = THREE.MathUtils.clamp((c - s.ca) / (s.cb - s.ca), 0, 1)
        y = s.ya + (s.yb - s.ya) * t
      }
      if (y <= foot + 0.55 && y > best) best = y
    }
    return best === -Infinity ? -50 : best
  }
  private collide(foot: number) {
    for (let it = 0; it < 3; it++) {
      for (const s of this.world.segs) {
        if (s.y0 > foot + 1.5 || s.y1 < foot + 0.4) continue
        const dx = s.x1 - s.x0, dz = s.z1 - s.z0
        const l2 = dx * dx + dz * dz
        let t = l2 > 0 ? ((this.px - s.x0) * dx + (this.pz - s.z0) * dz) / l2 : 0
        t = t < 0 ? 0 : t > 1 ? 1 : t
        const cx = s.x0 + dx * t, cz = s.z0 + dz * t
        const ox = this.px - cx, oz = this.pz - cz
        const d2 = ox * ox + oz * oz
        if (d2 < RADIUS * RADIUS) {
          const d = Math.sqrt(d2) || 1e-4
          const push = RADIUS - d
          if (d2 < 1e-8) { this.px += push; continue }
          this.px += (ox / d) * push
          this.pz += (oz / d) * push
        }
      }
    }
  }

  private updateWalk(dt: number) {
    const k = this.keys
    // inspect tween
    if (this.insp) {
      const I = this.insp
      I.t = Math.min(1, I.t + dt / 1.1)
      const e = I.t * I.t * (3 - 2 * I.t)
      this.px = THREE.MathUtils.lerp(I.fp.x, I.tp.x, e)
      this.pz = THREE.MathUtils.lerp(I.fp.z, I.tp.z, e)
      this.foot = THREE.MathUtils.lerp(I.fy, I.tfoot, e)
      let dy = I.tyaw - I.fyaw
      dy = Math.atan2(Math.sin(dy), Math.cos(dy))
      this.yaw = I.fyaw + dy * e
      this.pitch = THREE.MathUtils.lerp(I.fpitch, I.tpitch, e)
      this.vel.set(0, 0)
      if (I.t >= 1) this.insp = null
    } else {
      let fx = 0, fz = 0
      if (k.has('w') || k.has('arrowup')) fz += 1
      if (k.has('s') || k.has('arrowdown')) fz -= 1
      if (k.has('d')) fx += 1
      if (k.has('a')) fx -= 1
      if (k.has('arrowleft')) this.yaw += dt * 1.8
      if (k.has('arrowright')) this.yaw -= dt * 1.8
      fz += -this.touch.y; fx += this.touch.x
      const len = Math.hypot(fx, fz)
      if (len > 1) { fx /= len; fz /= len }
      const run = k.has('shift')
      const speed = run ? 4.4 : 2.1
      const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw)
      const tx = (-sy * fz + cy * fx) * speed
      const tz = (-cy * fz - sy * fx) * speed
      const a = 1 - Math.exp(-dt * 9)
      this.vel.x += (tx - this.vel.x) * a
      this.vel.y += (tz - this.vel.y) * a
      const ox = this.px, oz = this.pz
      this.px += this.vel.x * dt
      this.pz += this.vel.y * dt
      this.collide(this.foot)
      this.px = THREE.MathUtils.clamp(this.px, -190, 230)
      this.pz = THREE.MathUtils.clamp(this.pz, -52, 260)
      const moved = Math.hypot(this.px - ox, this.pz - oz)
      this.bobT += moved * 2.6
      this.stepAcc += moved
      if (this.stepAcc > 0.78) {
        this.stepAcc = 0
        this.audio?.step(this.inside, run)
      }
    }
    // vertical
    const g = this.groundAt(this.px, this.pz, this.foot)
    if (this.foot - g < 0.5 && this.foot - g > -0.6) {
      this.foot += (g - this.foot) * (1 - Math.exp(-dt * 20))
      this.vy = 0
    } else if (g > this.foot) {
      this.foot = g
    } else {
      this.vy -= 16 * dt
      this.foot = Math.max(g, this.foot + this.vy * dt)
      if (this.foot === g) this.vy = 0
    }
    // camera
    const moving = Math.hypot(this.vel.x, this.vel.y)
    const bob = Math.sin(this.bobT * Math.PI) * 0.028 * Math.min(1, moving / 2)
    this.camera.position.set(this.px, this.foot + EYE + bob, this.pz)
    this.camera.rotation.order = 'YXZ'
    this.camera.rotation.set(this.pitch, this.yaw, Math.sin(this.bobT * Math.PI * 0.5) * 0.0015 * Math.min(1, moving / 2))
    // zoom
    const wantFov = k.has('z') ? 28 : this.fovT
    if (Math.abs(this.camera.fov - wantFov) > 0.05) {
      this.camera.fov += (wantFov - this.camera.fov) * (1 - Math.exp(-dt * 8))
      this.camera.updateProjectionMatrix()
    }
    if (!k.has('z') && !this.insp && this.fovT === 52) this.fovT = 52
    if (this.insp === null && this.fovT === 52 && moving > 0.6) this.fovT = 68

    // focus raycast
    if (++this.focusTick % 4 === 0) {
      this.ray.setFromCamera(new THREE.Vector2(0, 0), this.camera)
      this.ray.far = 7
      const hits = this.ray.intersectObjects(this.world.paintings.map((p) => p.mesh), false)
      if (hits.length) {
        const inst = this.world.paintings.find((p) => p.mesh === hits[0].object)
        this.setFocus(inst?.def ?? null)
      } else this.setFocus(null)
    }
  }

  private updateLights(dt: number) {
    const P = this.P
    const ins = this.inside
    this.scene.environmentIntensity = P.env * (1 - 0.86 * ins) + 0.02
    this.hemi.intensity = P.hemi * (1 - 0.82 * ins)
    this.ambient.intensity = ins * (P.night > 0.5 ? 1.5 : 1.25)
    this.renderer.toneMappingExposure = P.exposure * (1 + 0.5 * ins) * this.userExp
    const scale = Math.min(1, ins * 1.7)
    const ex = this.camera.position.x, ey = this.camera.position.y, ez = this.camera.position.z
    const A = this.world.anchors
    // choose nearest anchors
    const want: { i: number; d: number }[] = []
    for (let i = 0; i < A.length; i++) {
      const dx = A[i].x - ex, dy = (A[i].y - ey) * 2.2, dz = A[i].z - ez
      const d = dx * dx + dy * dy + dz * dz
      if (want.length < 6) { want.push({ i, d }); want.sort((a, b) => a.d - b.d) }
      else if (d < want[5].d) { want[5] = { i, d }; want.sort((a, b) => a.d - b.d) }
    }
    const wantSet = new Set(want.map((w) => w.i))
    const assigned = new Set<number>()
    for (const p of this.pool) if (p.anchor >= 0 && wantSet.has(p.anchor)) assigned.add(p.anchor)
    const free = want.filter((w) => !assigned.has(w.i)).map((w) => w.i)
    for (const p of this.pool) {
      if (p.anchor >= 0 && wantSet.has(p.anchor)) { p.target = 1; continue }
      p.target = 0
      if (p.cur < 0.03 && free.length) {
        p.anchor = free.shift()!
        const a = A[p.anchor]
        p.light.position.set(a.x, a.y, a.z)
        p.target = 1
      }
    }
    for (const p of this.pool) {
      p.cur += (p.target - p.cur) * (1 - Math.exp(-dt * 6))
      p.light.intensity = 46 * p.cur * scale
      p.light.color.set(P.night > 0.5 ? '#ffe2bd' : '#fff1de')
    }
  }

  private loop = () => {
    if (this.disposed) return
    this.raf = requestAnimationFrame(this.loop)
    const dt = Math.min(0.05, this.clock.getDelta())
    const t = this.clock.elapsedTime
    ;(this.clouds.material as THREE.ShaderMaterial).uniforms.uTime.value = t
    this.clouds.position.copy(this.camera.position)
    this.stars.position.copy(this.camera.position)
    this.sky.position.copy(this.camera.position)
    let zone = { name: 'Museumplein', inside: 0 }
    if (this.mode === 'walk') {
      this.updateWalk(dt)
      zone = this.world.zoneAt(this.px, this.foot, this.pz)
      this.poseTick += dt
      if (this.poseTick > 0.12) { this.poseTick = 0; this.ev.onPose(this.px, this.foot, this.pz, this.yaw) }
    } else {
      this.orbit.update()
    }
    this.inside += (zone.inside - this.inside) * (1 - Math.exp(-dt * 3.5))
    if (zone.name !== this.zoneName) { this.zoneName = zone.name; this.ev.onZone(zone.name) }
    this.audio?.update(this.inside, this.mode === 'walk')
    this.updateLights(dt)
    this.renderer.render(this.scene, this.camera)
  }

  startAudio() {
    if (!this.audio) { this.audio = new AudioEngine(); this.audio.setMuted(this.muted) }
    this.audio.resume()
  }

  private resize() {
    const w = this.host.clientWidth || window.innerWidth, h = this.host.clientHeight || window.innerHeight
    this.renderer.setSize(w, h)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  dispose() {
    this.disposed = true
    cancelAnimationFrame(this.raf)
    this.ro?.disconnect()
    this.cleanup.forEach((f) => f())
    this.audio?.dispose()
    this.orbit?.dispose()
    document.exitPointerLock?.()
    this.renderer?.dispose()
    this.renderer?.domElement.remove()
  }
}

/* ------------------------------------------------------------ audio (synth) */
class AudioEngine {
  private ctx: AudioContext
  private master: GainNode
  private amb: GainNode
  private noiseBuf: AudioBuffer
  private muted = false
  constructor() {
    this.ctx = new AudioContext()
    this.master = this.ctx.createGain()
    this.master.gain.value = 0.7
    this.master.connect(this.ctx.destination)
    const len = this.ctx.sampleRate * 3
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate)
    const d = this.noiseBuf.getChannelData(0)
    let last = 0
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5 }
    const src = this.ctx.createBufferSource()
    src.buffer = this.noiseBuf; src.loop = true
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600
    this.amb = this.ctx.createGain(); this.amb.gain.value = 0.0
    src.connect(lp).connect(this.amb).connect(this.master)
    src.start()
  }
  resume() { if (this.ctx.state === 'suspended') this.ctx.resume() }
  setMuted(m: boolean) { this.muted = m; this.master.gain.value = m ? 0 : 0.7 }
  update(inside: number, walking: boolean) {
    const target = walking ? 0.16 * (0.5 + 0.5 * inside) + 0.1 * (1 - inside) : 0.08
    this.amb.gain.value += (target - this.amb.gain.value) * 0.02
  }
  step(inside: number, run: boolean) {
    if (this.muted || this.ctx.state !== 'running') return
    const t = this.ctx.currentTime
    const src = this.ctx.createBufferSource()
    src.buffer = this.noiseBuf
    src.playbackRate.value = 2 + Math.random()
    const f = this.ctx.createBiquadFilter()
    f.type = 'bandpass'
    f.frequency.value = inside > 0.5 ? 900 + Math.random() * 300 : 1800 + Math.random() * 500
    f.Q.value = inside > 0.5 ? 2.2 : 0.8
    const g = this.ctx.createGain()
    const peak = (inside > 0.5 ? 0.5 : 0.28) * (run ? 1.3 : 1)
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(peak, t + 0.01)
    g.gain.exponentialRampToValueAtTime(0.001, t + (inside > 0.5 ? 0.16 : 0.12))
    src.connect(f).connect(g).connect(this.master)
    src.start(t, Math.random() * 2)
    src.stop(t + 0.25)
  }
  dispose() { this.ctx.close() }
}

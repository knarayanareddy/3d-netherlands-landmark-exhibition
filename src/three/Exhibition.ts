import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { Sky } from 'three/examples/jsm/objects/Sky.js'
import { Water } from 'three/examples/jsm/objects/Water.js'
import { LANDMARKS, LandmarkDef } from './landmarks'
import { ISLANDS, LAKES, MAP_BOUNDS, NL_OUTLINE, inLand, makeMapTexture, toXZ } from './map'
import { Landmark, TAU, colorMat, getWaterNormal, mkCanvas, setNight, toTex, updateWater, waterMat, waterPoly } from './kit'

export type Mode = 'orbit' | 'walk'
export type TimeOfDay = 'day' | 'golden' | 'night'

export interface Events {
  onProgress?: (p: number, label: string) => void
  onSelect?: (id: string | null) => void
  onCamera?: (x: number, z: number, yaw: number) => void
  onMode?: (m: Mode) => void
  onTour?: (on: boolean) => void
}

interface Env {
  elev: number; az: number; lElev: number; lAz: number; turb: number; ray: number; mie: number; sunInt: number
  hemi: number; exposure: number; fogD: number; night: number; env: number
  sunColor: string; hemiSky: string; hemiGround: string; fog: string; water: string
}
const PRESETS: Record<TimeOfDay, Env> = {
  day: { elev: 50, az: -35, lElev: 50, lAz: -35, turb: 3.5, ray: 1.2, mie: 0.004, sunInt: 3.6, hemi: 0.7, exposure: 0.62, fogD: 0.0016, night: 0, env: 1, sunColor: '#fff1dc', hemiSky: '#bcd8f0', hemiGround: '#8a8c70', fog: '#c3d7e6', water: '#0f4b5f' },
  golden: { elev: 10, az: -58, lElev: 10, lAz: -58, turb: 8, ray: 2.4, mie: 0.01, sunInt: 4.2, hemi: 0.7, exposure: 0.64, fogD: 0.0022, night: 0.3, env: 0.85, sunColor: '#ffb372', hemiSky: '#e6b79b', hemiGround: '#6f6048', fog: '#eab897', water: '#1b4552' },
  night: { elev: -3, az: -58, lElev: 42, lAz: 32, turb: 2, ray: 0.6, mie: 0.003, sunInt: 0.9, hemi: 0.3, exposure: 0.75, fogD: 0.0026, night: 1, env: 0.35, sunColor: '#8fa8ff', hemiSky: '#27396b', hemiGround: '#10151f', fog: '#0c1630', water: '#06141f' },
}
const NUM = ['elev', 'az', 'lElev', 'lAz', 'turb', 'ray', 'mie', 'sunInt', 'hemi', 'exposure', 'fogD', 'night', 'env'] as const
const COL = ['sunColor', 'hemiSky', 'hemiGround', 'fog', 'water'] as const

const dirFrom = (elev: number, az: number) => {
  const e = (elev * Math.PI) / 180
  const a = (az * Math.PI) / 180
  return new THREE.Vector3(Math.cos(e) * Math.sin(a), Math.sin(e), Math.cos(e) * Math.cos(a))
}
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))

interface Placed {
  def: LandmarkDef
  lm: Landmark
  wrap: THREE.Group
  label: HTMLButtonElement
}
interface Flight {
  t: number
  dur: number
  fp: THREE.Vector3
  tp: THREE.Vector3
  ft: THREE.Vector3
  tt: THREE.Vector3
  arc: number
  done?: () => void
}

export class Exhibition {
  private container: HTMLElement
  private ev: Events
  renderer: THREE.WebGLRenderer
  scene = new THREE.Scene()
  camera: THREE.PerspectiveCamera
  controls: OrbitControls
  private clock = new THREE.Clock()
  private sky: Sky
  private envSky: Sky
  private envScene = new THREE.Scene()
  private pmrem: THREE.PMREMGenerator
  private envRT: THREE.WebGLRenderTarget | null = null
  private sun: THREE.DirectionalLight
  private hemi: THREE.HemisphereLight
  private fog = new THREE.FogExp2('#c3d7e6', 0.0016)
  private stars!: THREE.Points
  private water!: Water
  private lightDir = new THREE.Vector3(0, 1, 0)
  private cur: Record<string, number> = {}
  private curC: Record<string, THREE.Color> = {}
  private tgt: Env = PRESETS.day
  private envAcc = 0
  private envDirty = true
  private placed: Placed[] = []
  private labelRoot: HTMLDivElement
  private flight: Flight | null = null
  private curLook = new THREE.Vector3()
  mode: Mode = 'orbit'
  private yaw = 0
  private pitch = 0
  private eyeY = 1.7
  private keys: Record<string, boolean> = {}
  private selected: string | null = null
  private proxSelected = false
  private tour = false
  private tourTimer = 0
  private tourIdx = -1
  private raycaster = new THREE.Raycaster()
  private down = { x: 0, y: 0, t: 0, id: -1 }
  private last = { x: 0, y: 0 }
  private pulse: THREE.Mesh[] = []
  private disposed = false
  private frames = 0
  private accDt = 0
  private shadowS = 60
  private bobT = 0
  private ro: ResizeObserver
  private onResize = () => {
    const w = this.container.clientWidth || 1
    const h = this.container.clientHeight || 1
    this.renderer.setSize(w, h)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  constructor(container: HTMLElement, ev: Events = {}) {
    this.container = container
    this.ev = ev
    const w = container.clientWidth || 1
    const h = container.clientHeight || 1
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75))
    this.renderer.setSize(w, h)
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.domElement.style.touchAction = 'none'
    this.renderer.domElement.style.display = 'block'
    this.renderer.domElement.className = 'absolute inset-0 h-full w-full outline-none'
    container.appendChild(this.renderer.domElement)

    this.camera = new THREE.PerspectiveCamera(48, w / h, 0.2, 5000)
    this.camera.position.set(8, 150, 215)
    this.camera.rotation.order = 'YXZ'
    this.scene.fog = this.fog
    this.scene.background = new THREE.Color('#c3d7e6')

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.target.set(-4, 0, 6)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.07
    this.controls.minDistance = 4
    this.controls.maxDistance = 330
    this.controls.maxPolarAngle = Math.PI * 0.485
    this.controls.zoomToCursor = true
    this.controls.autoRotateSpeed = 0.9
    this.controls.addEventListener('start', () => {
      if (this.tour) this.setTour(false)
    })
    this.controls.update()

    // sky
    this.sky = new Sky()
    this.sky.scale.setScalar(3000)
    this.scene.add(this.sky)
    this.envSky = new Sky()
    this.envSky.scale.setScalar(3000)
    this.envScene.add(this.envSky)
    this.pmrem = new THREE.PMREMGenerator(this.renderer)

    // lights
    this.hemi = new THREE.HemisphereLight('#bcd8f0', '#8a8c70', 0.6)
    this.scene.add(this.hemi)
    this.sun = new THREE.DirectionalLight('#fff1dc', 3.6)
    this.sun.castShadow = true
    const ss = Math.min(window.innerWidth, window.innerHeight) < 700 ? 2048 : 4096
    this.sun.shadow.mapSize.set(ss, ss)
    this.sun.shadow.bias = -0.0003
    this.sun.shadow.normalBias = 0.05
    this.sun.shadow.camera.near = 1
    this.sun.shadow.camera.far = 600
    this.scene.add(this.sun, this.sun.target)

    // stars
    const sp: number[] = []
    for (let i = 0; i < 1800; i++) {
      const u = Math.random()
      const v = Math.random() * 0.95 + 0.04
      const th = u * TAU
      const r = 2600
      const y = v * r
      const rr = Math.sqrt(r * r - y * y)
      sp.push(Math.cos(th) * rr, y, Math.sin(th) * rr)
    }
    const sg = new THREE.BufferGeometry()
    sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3))
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: '#ffffff', size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false }))
    this.scene.add(this.stars)

    // env state
    const p = PRESETS.day
    for (const k of NUM) this.cur[k] = p[k]
    for (const k of COL) this.curC[k] = new THREE.Color(p[k])

    this.labelRoot = document.createElement('div')
    this.labelRoot.className = 'pointer-events-none absolute inset-0 overflow-hidden'
    container.appendChild(this.labelRoot)

    this.bindInput()
    this.ro = new ResizeObserver(this.onResize)
    this.ro.observe(container)
  }

  /* ---------------------------------------------------------------- build */
  async start() {
    const tick = () => new Promise((r) => setTimeout(r, 12))
    this.ev.onProgress?.(0.02, 'Laying out the floor map')
    await tick()
    if (this.disposed) return
    this.buildWorld()
    this.applyEnv(true)
    const n = LANDMARKS.length
    for (let i = 0; i < n; i++) {
      const def = LANDMARKS[i]
      this.ev.onProgress?.(0.08 + (0.9 * i) / n, `Constructing ${def.name}`)
      await tick()
      if (this.disposed) return
      this.place(def, i)
    }
    this.ev.onProgress?.(1, 'Opening the doors')
    await tick()
    if (this.disposed) return
    this.renderer.compile(this.scene, this.camera)
    this.renderer.setAnimationLoop(this.loop)
  }

  private buildWorld() {
    const root = new THREE.Group()
    const toShape = (pts: [number, number][]) => new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)))
    const shapes = [toShape(toXZ(NL_OUTLINE)), ...ISLANDS.map((i) => toShape(toXZ(i)))]
    const depth = 1.1
    const geo = new THREE.ExtrudeGeometry(shapes, { depth, bevelEnabled: false, curveSegments: 1 })
    geo.rotateX(-Math.PI / 2)
    geo.translate(0, -depth, 0)
    const pos = geo.attributes.position
    const uv = geo.attributes.uv
    const BW = MAP_BOUNDS.maxX - MAP_BOUNDS.minX
    const BH = MAP_BOUNDS.maxZ - MAP_BOUNDS.minZ
    for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) - MAP_BOUNDS.minX) / BW, 1 - (pos.getZ(i) - MAP_BOUNDS.minZ) / BH)
    const mapTex = makeMapTexture(3072)
    mapTex.anisotropy = Math.min(16, this.renderer.capabilities.getMaxAnisotropy())
    const land = new THREE.Mesh(geo, [new THREE.MeshStandardMaterial({ map: mapTex, roughness: 0.85, metalness: 0 }), colorMat('#8c8a78', 0.9)])
    land.receiveShadow = true
    root.add(land)
    for (const lk of LAKES) waterPoly(root, toXZ(lk).map(([x, z]) => new THREE.Vector2(x, z)), 0.05, waterMat('#2f6f8a', 0.35))

    // sea
    const sea = new Water(new THREE.PlaneGeometry(6000, 6000), {
      textureWidth: 512,
      textureHeight: 512,
      waterNormals: getWaterNormal(),
      sunDirection: new THREE.Vector3(0.5, 0.8, 0.3),
      sunColor: 0xffffff,
      waterColor: 0x0f4b5f,
      distortionScale: 2.2,
      fog: true,
    })
    sea.rotation.x = -Math.PI / 2
    sea.position.y = -0.6
    ;(sea.material as THREE.ShaderMaterial).uniforms.size.value = 0.35
    this.water = sea
    root.add(sea)
    this.scene.add(root)
  }

  private plaque(def: LandmarkDef, idx: number) {
    const { c, g } = mkCanvas(1024, 400)
    g.fillStyle = '#121b24'
    g.fillRect(0, 0, 1024, 400)
    g.strokeStyle = '#c9a24b'
    g.lineWidth = 8
    g.strokeRect(14, 14, 996, 372)
    g.lineWidth = 2
    g.strokeRect(30, 30, 964, 340)
    g.fillStyle = '#c9a24b'
    g.beginPath()
    g.arc(130, 200, 66, 0, TAU)
    g.fill()
    g.fillStyle = '#121b24'
    g.font = '700 74px Georgia, serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(String(idx + 1).padStart(2, '0'), 130, 206)
    g.textAlign = 'left'
    g.fillStyle = '#f4efe2'
    g.font = '700 68px Georgia, serif'
    g.fillText(def.name, 230, 140, 740)
    g.fillStyle = '#c9a24b'
    g.font = 'italic 42px Georgia, serif'
    g.fillText(def.nl, 230, 210, 740)
    g.fillStyle = '#9fb3c2'
    g.font = '36px Georgia, serif'
    g.fillText(`${def.city}  \u00b7  ${def.year}`, 230, 280, 740)
    const tex = toTex(c)
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping
    const grp = new THREE.Group()
    const plate = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.33, 0.1), [colorMat('#c9a24b', 0.3, 1), colorMat('#c9a24b', 0.3, 1), colorMat('#c9a24b', 0.3, 1), colorMat('#c9a24b', 0.3, 1), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, emissive: new THREE.Color('#ffffff'), emissiveMap: tex, emissiveIntensity: 0.12 }), colorMat('#222', 0.8)])
    plate.position.y = 1.4
    plate.rotation.x = -0.45
    plate.castShadow = true
    grp.add(plate)
    for (const sx of [-1.4, 1.4]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.2, 0.1), colorMat('#2b2f33', 0.5, 0.7))
      leg.position.set(sx, 0.6, -0.05)
      leg.castShadow = true
      grp.add(leg)
    }
    return grp
  }

  private place(def: LandmarkDef, idx: number) {
    const lm = def.build()
    const wrap = new THREE.Group()
    wrap.position.set(def.x, 0.5, def.z)
    wrap.userData.lmId = def.id
    wrap.add(lm.group)
    const brass = new THREE.MeshStandardMaterial({ color: '#c9a24b', metalness: 1, roughness: 0.3, emissive: new THREE.Color('#a87a20'), emissiveIntensity: 0.2 })
    const ring = new THREE.Mesh(new THREE.TorusGeometry(def.radius + 0.04, 0.07, 8, 128), brass)
    ring.rotation.x = Math.PI / 2
    ring.position.y = 0.02
    ring.castShadow = true
    wrap.add(ring)
    const pl = this.plaque(def, idx)
    pl.position.set(0, -0.5, def.radius + 1.9)
    wrap.add(pl)
    this.scene.add(wrap)

    // pin on the true location + dashed line to the exhibit
    const [px, pz] = def.pin
    const pin = new THREE.Group()
    pin.position.set(px, 0, pz)
    const pinM = new THREE.MeshBasicMaterial({ color: '#ffb347' })
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.2, 6), pinM)
    stem.position.y = 1.1
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 10), pinM)
    head.position.y = 2.4
    const pr = new THREE.Mesh(new THREE.RingGeometry(0.7, 0.95, 32), new THREE.MeshBasicMaterial({ color: '#ffb347', transparent: true, opacity: 0.8, side: THREE.DoubleSide }))
    pr.rotation.x = -Math.PI / 2
    pr.position.y = 0.06
    this.pulse.push(pr)
    pin.add(stem, head, pr)
    this.scene.add(pin)
    const dx = def.x - px
    const dz = def.z - pz
    const dist = Math.hypot(dx, dz)
    if (dist > def.radius + 2.5) {
      const L = dist - def.radius - 0.8
      const n = Math.floor(L / 1.1)
      const dash = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 0.05, 0.6), new THREE.MeshBasicMaterial({ color: '#ffb347', transparent: true, opacity: 0.85 }), n)
      const m = new THREE.Matrix4()
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(dx, dz))
      for (let i = 0; i < n; i++) {
        const t = ((i + 0.5) * 1.1) / dist
        m.compose(new THREE.Vector3(px + dx * t, 0.07, pz + dz * t), q, new THREE.Vector3(1, 1, 1))
        dash.setMatrixAt(i, m)
      }
      this.scene.add(dash)
    }

    const label = document.createElement('button')
    label.className = 'lm-label'
    label.innerHTML = `<span class="lm-num">${idx + 1}</span><span class="lm-name">${def.name}</span>`
    label.addEventListener('click', (e) => {
      e.stopPropagation()
      this.select(def.id, this.mode === 'orbit')
    })
    this.labelRoot.appendChild(label)
    this.placed.push({ def, lm, wrap, label })
  }

  /* ---------------------------------------------------------------- env */
  setTime(p: TimeOfDay) {
    this.tgt = PRESETS[p]
  }

  private stepEnv(dt: number) {
    const k = 1 - Math.exp(-dt * 2.6)
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
      if (this.envAcc > 0.35) {
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
    setNight(e.night)
    ;(this.stars.material as THREE.PointsMaterial).opacity = clamp((e.night - 0.5) * 2, 0, 1)
    const wu = (this.water.material as THREE.ShaderMaterial).uniforms
    wu.sunDirection.value.copy(this.lightDir).normalize()
    wu.sunColor.value.copy(this.curC.sunColor)
    wu.waterColor.value.copy(this.curC.water)
    if (regen) this.regenEnv()
  }

  private regenEnv() {
    const rt = this.pmrem.fromScene(this.envScene, 0, 0.1, 2000)
    this.scene.environment = rt.texture
    this.envRT?.dispose()
    this.envRT = rt
  }

  /* ---------------------------------------------------------------- input */
  private bindInput() {
    const el = this.renderer.domElement
    el.addEventListener('pointerdown', (e) => {
      this.down = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId }
      this.last = { x: e.clientX, y: e.clientY }
    })
    el.addEventListener('pointermove', (e) => {
      if (this.mode === 'walk' && !this.flight && e.buttons & 1) {
        this.yaw -= (e.clientX - this.last.x) * 0.0032
        this.pitch = clamp(this.pitch - (e.clientY - this.last.y) * 0.0032, -1.35, 1.35)
      }
      this.last = { x: e.clientX, y: e.clientY }
    })
    el.addEventListener('pointerup', (e) => {
      if (e.pointerId !== this.down.id) return
      const moved = Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y)
      if (moved < 6 && performance.now() - this.down.t < 450 && e.button === 0) this.pick(e)
    })
    window.addEventListener('keydown', this.keyDown)
    window.addEventListener('keyup', this.keyUp)
    window.addEventListener('blur', this.blur)
  }
  private keyDown = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return
    this.keys[e.code] = true
    if (this.mode === 'walk' && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault()
  }
  private keyUp = (e: KeyboardEvent) => {
    this.keys[e.code] = false
  }
  private blur = () => {
    this.keys = {}
  }

  private pick(e: PointerEvent) {
    const r = this.renderer.domElement.getBoundingClientRect()
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    this.raycaster.setFromCamera(ndc, this.camera)
    const hits = this.raycaster.intersectObjects(
      this.placed.map((p) => p.wrap),
      true,
    )
    for (const h of hits) {
      let o: THREE.Object3D | null = h.object
      while (o && !o.userData.lmId) o = o.parent
      if (o) {
        this.select(o.userData.lmId, this.mode === 'orbit')
        return
      }
    }
  }

  /* ---------------------------------------------------------------- camera */
  private startFlight(tp: THREE.Vector3, tt: THREE.Vector3, dur: number, done?: () => void, from?: THREE.Vector3) {
    const fp = this.camera.position.clone()
    const dir = new THREE.Vector3()
    this.camera.getWorldDirection(dir)
    const ft = this.flight ? this.curLook.clone() : (from ?? fp.clone().addScaledVector(dir, 20))
    this.controls.enabled = false
    this.controls.autoRotate = false
    const arc = clamp(fp.distanceTo(tp) * 0.12, 2, 28)
    this.flight = { t: 0, dur, fp, tp, ft, tt, arc, done }
  }

  private viewFor(def: LandmarkDef) {
    const { dist, ty, az, el } = def.view
    if (this.mode === 'orbit') {
      const T = new THREE.Vector3(def.x, 0.5 + ty, def.z)
      const P = T.clone().add(new THREE.Vector3(Math.sin(az) * Math.cos(el) * dist, Math.sin(el) * dist, Math.cos(az) * Math.cos(el) * dist))
      return { P, T }
    }
    const rr = def.radius + 4
    return { P: new THREE.Vector3(def.x + Math.sin(az) * rr, 1.7, def.z + Math.cos(az) * rr), T: new THREE.Vector3(def.x, 0.5 + ty * 0.7, def.z) }
  }

  select(id: string | null, fly = true) {
    this.selected = id
    this.proxSelected = false
    this.ev.onSelect?.(id)
    this.refreshLabels()
    if (!id) return
    const p = this.placed.find((q) => q.def.id === id)
    if (!p || !fly) return
    const { P, T } = this.viewFor(p.def)
    this.startFlight(P, T, 2.6, () => this.afterFlight(T), this.mode === 'orbit' ? this.controls.target.clone() : undefined)
  }

  private afterFlight(T: THREE.Vector3) {
    if (this.mode === 'orbit') {
      this.controls.target.copy(T)
      this.controls.enabled = true
      this.controls.update()
      this.controls.autoRotate = this.tour
    } else {
      const d = T.clone().sub(this.camera.position).normalize()
      this.yaw = Math.atan2(-d.x, -d.z)
      this.pitch = clamp(Math.asin(d.y), -1.2, 1.2)
    }
  }

  overview() {
    this.select(null)
    if (this.mode === 'walk') {
      this.setMode('orbit')
      return
    }
    this.startFlight(new THREE.Vector3(8, 150, 215), new THREE.Vector3(-4, 0, 6), 2.6, () => this.afterFlight(new THREE.Vector3(-4, 0, 6)), this.controls.target.clone())
  }

  setMode(m: Mode) {
    if (m === this.mode) return
    const dir = new THREE.Vector3()
    this.camera.getWorldDirection(dir)
    if (m === 'walk') {
      let def = this.placed.find((p) => p.def.id === this.selected)?.def
      if (!def) def = this.placed.find((p) => p.def.id === 'domtoren')?.def ?? this.placed[0].def
      this.mode = 'walk'
      this.setTour(false)
      const { P, T } = this.viewFor(def)
      this.startFlight(P, T, 2.4, () => this.afterFlight(T))
    } else {
      const fp = this.camera.position.clone()
      const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw))
      const T = fp.clone().addScaledVector(fwd, 14)
      T.y = 1
      const P = fp.clone().addScaledVector(fwd, -16)
      P.y = 18
      this.mode = 'orbit'
      this.startFlight(P, T, 2.0, () => this.afterFlight(T))
    }
    this.ev.onMode?.(this.mode)
  }

  setTour(on: boolean) {
    if (this.tour === on) return
    this.tour = on
    this.tourTimer = 0
    this.ev.onTour?.(on)
    if (on) {
      if (this.mode === 'walk') this.setMode('orbit')
      this.tourIdx = Math.max(-1, this.placed.findIndex((p) => p.def.id === this.selected))
      this.tourTimer = 99
    } else this.controls.autoRotate = false
  }

  /* ---------------------------------------------------------------- walking */
  private blocked(x: number, z: number) {
    let onPlinth = false
    for (const p of this.placed) {
      const lx = x - p.def.x
      const lz = z - p.def.z
      const d2 = lx * lx + lz * lz
      const R = p.def.radius + 0.7
      if (d2 < R * R) onPlinth = true
      if (d2 > (R + 4) * (R + 4)) continue
      for (const [cx, cz, hx, hz] of p.lm.colliders ?? []) {
        if (Math.abs(lx - cx) < hx + 0.5 && Math.abs(lz - cz) < hz + 0.5) return true
      }
    }
    return !(onPlinth || inLand(x, z))
  }

  private floorAt(x: number, z: number) {
    for (const p of this.placed) {
      const lx = x - p.def.x
      const lz = z - p.def.z
      if (lx * lx + lz * lz < (p.def.radius + 0.1) ** 2) return 0.5 + (p.lm.floor ? p.lm.floor(lx, lz) : 0)
    }
    return 0
  }

  private walk(dt: number) {
    const k = this.keys
    const f = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0)
    const s = (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0)
    const turn = (k.ArrowLeft ? 1 : 0) - (k.ArrowRight ? 1 : 0)
    this.yaw += turn * dt * 1.8
    const p = this.camera.position
    if (f || s) {
      const speed = (k.ShiftLeft || k.ShiftRight ? 16 : 6.5) * dt
      const fx = -Math.sin(this.yaw)
      const fz = -Math.cos(this.yaw)
      let mx = fx * f + Math.cos(this.yaw) * s
      let mz = fz * f - Math.sin(this.yaw) * s
      const l = Math.hypot(mx, mz) || 1
      mx = (mx / l) * speed
      mz = (mz / l) * speed
      if (!this.blocked(p.x + mx, p.z + mz)) {
        p.x += mx
        p.z += mz
      } else if (!this.blocked(p.x + mx, p.z)) p.x += mx
      else if (!this.blocked(p.x, p.z + mz)) p.z += mz
      this.bobT += dt * (k.ShiftLeft ? 12 : 8)
    }
    const target = this.floorAt(p.x, p.z) + 1.7 + (f || s ? Math.sin(this.bobT) * 0.035 : 0)
    this.eyeY += (target - this.eyeY) * Math.min(1, dt * 9)
    p.y = this.eyeY
    this.camera.rotation.set(this.pitch, this.yaw, 0)
  }

  /* ---------------------------------------------------------------- loop */
  private loop = () => {
    if (this.disposed) return
    const dt = Math.min(this.clock.getDelta(), 0.05)
    const t = this.clock.elapsedTime
    this.stepEnv(dt)

    if (this.flight) {
      const f = this.flight
      f.t += dt / f.dur
      const k = ease(Math.min(1, f.t))
      const pos = f.fp.clone().lerp(f.tp, k)
      pos.y += Math.sin(Math.PI * k) * f.arc
      this.camera.position.copy(pos)
      this.curLook.copy(f.ft).lerp(f.tt, k)
      this.camera.lookAt(this.curLook)
      if (f.t >= 1) {
        this.flight = null
        f.done?.()
      }
    } else if (this.mode === 'orbit') {
      const tg = this.controls.target
      tg.x = clamp(tg.x, MAP_BOUNDS.minX, MAP_BOUNDS.maxX)
      tg.z = clamp(tg.z, MAP_BOUNDS.minZ, MAP_BOUNDS.maxZ)
      tg.y = clamp(tg.y, 0, 60)
      this.controls.update()
      if (this.camera.position.y < 1.2) this.camera.position.y = 1.2
      if (this.tour) {
        this.tourTimer += dt
        if (this.tourTimer > 11) {
          this.tourTimer = 0
          this.tourIdx = (this.tourIdx + 1) % this.placed.length
          this.select(this.placed[this.tourIdx].def.id, true)
        }
      }
    } else {
      this.walk(dt)
      // proximity-based selection
      let near: Placed | null = null
      let nd = 1e9
      for (const p of this.placed) {
        const d = Math.hypot(this.camera.position.x - p.def.x, this.camera.position.z - p.def.z) - p.def.radius
        if (d < nd) {
          nd = d
          near = p
        }
      }
      if (near && nd < 5 && this.selected !== near.def.id) {
        this.selected = near.def.id
        this.proxSelected = true
        this.ev.onSelect?.(near.def.id)
        this.refreshLabels()
      } else if (this.proxSelected && nd > 12) {
        this.selected = null
        this.proxSelected = false
        this.ev.onSelect?.(null)
        this.refreshLabels()
      }
    }

    // animations
    updateWater(t)
    ;(this.water.material as THREE.ShaderMaterial).uniforms.time.value = t * 0.5
    for (const p of this.placed) {
      const dx = this.camera.position.x - p.def.x
      const dz = this.camera.position.z - p.def.z
      if (dx * dx + dz * dz < 260 * 260) p.lm.update?.(t, dt)
    }
    this.pulse.forEach((m, i) => {
      const s = 1 + ((t * 0.8 + i * 0.3) % 1) * 1.6
      m.scale.set(s, s, 1)
      ;(m.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - ((t * 0.8 + i * 0.3) % 1))
    })

    this.updateShadowFocus()
    this.updateLabels()
    this.ev.onCamera?.(this.camera.position.x, this.camera.position.z, this.camPlanarYaw())
    this.renderer.render(this.scene, this.camera)

    // adaptive quality
    this.frames++
    this.accDt += dt
    if (this.frames === 90) {
      if (this.accDt / 90 > 0.034 && this.renderer.getPixelRatio() > 1) this.renderer.setPixelRatio(1)
      else if (this.accDt / 90 > 0.045) {
        this.sun.shadow.mapSize.set(2048, 2048)
        this.sun.shadow.map?.dispose()
        this.sun.shadow.map = null
      }
    }
  }

  private camPlanarYaw() {
    const d = new THREE.Vector3()
    this.camera.getWorldDirection(d)
    return Math.atan2(d.x, -d.z)
  }

  private updateShadowFocus() {
    const focus = this.mode === 'orbit' ? this.controls.target : this.camera.position
    const dist = this.mode === 'orbit' ? this.camera.position.distanceTo(this.controls.target) : 40
    const S = clamp(dist * 0.55, 30, 95)
    const sc = this.sun.shadow.camera
    if (Math.abs(S - this.shadowS) > 1) {
      this.shadowS = S
      sc.left = -S
      sc.right = S
      sc.top = S
      sc.bottom = -S
      sc.updateProjectionMatrix()
    }
    const snap = (this.shadowS * 2) / this.sun.shadow.mapSize.x
    const fx = Math.round(focus.x / snap) * snap
    const fz = Math.round(focus.z / snap) * snap
    this.sun.target.position.set(fx, 0, fz)
    this.sun.position.set(fx, 0, fz).addScaledVector(this.lightDir, 260)
    this.sun.target.updateMatrixWorld()
  }

  private refreshLabels() {
    for (const p of this.placed) p.label.classList.toggle('active', p.def.id === this.selected)
  }

  private updateLabels() {
    const w = this.container.clientWidth
    const h = this.container.clientHeight
    const v = new THREE.Vector3()
    for (const p of this.placed) {
      v.set(p.def.x, 0.5 + p.def.labelH + 2.2, p.def.z)
      const d = v.distanceTo(this.camera.position)
      v.project(this.camera)
      const near = this.mode === 'walk' ? 18 : 20
      const vis = v.z < 1 && v.z > -1 && Math.abs(v.x) < 1.15 && d > near && d < 420
      const el = p.label
      if (!vis) {
        if (el.style.display !== 'none') el.style.display = 'none'
        continue
      }
      if (el.style.display === 'none') el.style.display = ''
      const x = (v.x * 0.5 + 0.5) * w
      const y = (-v.y * 0.5 + 0.5) * h
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`
      el.style.opacity = String(clamp((d - near) / 14, 0, 1) * clamp((420 - d) / 120, 0, 1))
      el.style.zIndex = String(1000 - Math.floor(d))
    }
  }

  /* ---------------------------------------------------------------- misc */
  get selectedId() {
    return this.selected
  }
  next(delta: number) {
    const i = this.placed.findIndex((p) => p.def.id === this.selected)
    const n = this.placed.length
    const j = i < 0 ? (delta > 0 ? 0 : n - 1) : (i + delta + n) % n
    this.select(this.placed[j].def.id, true)
  }
  flyToPoint(x: number, z: number) {
    // used by the minimap: hop to a point on the map
    if (this.mode === 'walk') {
      const p = this.camera.position
      if (inLand(x, z)) {
        p.x = x
        p.z = z
      }
      return
    }
    const T = new THREE.Vector3(x, 0, z)
    const P = new THREE.Vector3(x + 10, 55, z + 70)
    this.select(null)
    this.startFlight(P, T, 2.2, () => this.afterFlight(T), this.controls.target.clone())
  }

  dispose() {
    this.disposed = true
    this.renderer.setAnimationLoop(null)
    this.ro.disconnect()
    window.removeEventListener('keydown', this.keyDown)
    window.removeEventListener('keyup', this.keyUp)
    window.removeEventListener('blur', this.blur)
    this.controls.dispose()
    this.envRT?.dispose()
    this.pmrem.dispose()
    this.renderer.dispose()
    this.renderer.forceContextLoss()
    this.renderer.domElement.remove()
    this.labelRoot.remove()
  }
}

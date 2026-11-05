import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { buildTextures } from './textures'
import { Bed, CAFE, GROUND_HALF, MILL, PAVILION, POIS, START, VARIETIES, bedAt, getLayout, groundHeight, insideBuilding, varietyAt, waterSD, LAKE_C, Layout } from './layout'
import { buildTerrain, Terrain } from './terrain'
import { Atmosphere } from './sky'
import { BedField, flowerUniforms } from './flowers'
import { TreeSet, treeUniforms } from './trees'
import { Lawn } from './grass'
import { DECK_Y, STAIR, buildCafe, buildGate, buildPavilion, buildProps, buildWindmill, colBoxes, colCircles, makeMats, Windmill } from './buildings'
import { buildLife, Life } from './life'
import { GardenAudio } from './audio'
import { clamp, pointInPoly, tick } from './util'

export type Quality = 'low' | 'medium' | 'high'

interface QCfg {
  dpr: number
  shadow: number
  shadowHalf: number
  composer: boolean
  bloom: boolean
  waterRes: number
  spacing: number
  lod: [number, number, number]
  cards: number
  grassDensity: number
  grassRadius: number
}
const QUALITY: Record<Quality, QCfg> = {
  low: { dpr: 1, shadow: 1024, shadowHalf: 55, composer: false, bloom: false, waterRes: 256, spacing: 0.235, lod: [8, 26, 80], cards: 0.45, grassDensity: 2.5, grassRadius: 24 },
  medium: { dpr: 1.25, shadow: 2048, shadowHalf: 70, composer: true, bloom: false, waterRes: 512, spacing: 0.17, lod: [12, 38, 125], cards: 0.75, grassDensity: 7, grassRadius: 38 },
  high: { dpr: 1.6, shadow: 4096, shadowHalf: 80, composer: true, bloom: true, waterRes: 1024, spacing: 0.128, lod: [17, 48, 170], cards: 1, grassDensity: 12, grassRadius: 52 },
}

export interface Pin {
  id: string
  x: number
  y: number
  vis: boolean
  dist: number
}
export interface Hud {
  x: number
  z: number
  yaw: number
  indoors: boolean
  onGallery: boolean
  mode: 'walk' | 'fly'
  nearPoi: string | null
  flower: { name: string; kind: string; note: string; species: string } | null
  fps: number
  dpr: number
  hour: number
}
export interface Events {
  onProgress?: (f: number, label: string) => void
  onHud?: (h: Hud) => void
  onPins?: (p: Pin[]) => void
  onLock?: (locked: boolean) => void
  onToast?: (msg: string) => void
}

export const TELEPORTS: { id: string; label: string; x: number; z: number; yaw: number; pitch?: number; deck?: boolean }[] = [
  { id: 'gate', label: 'Entrance', x: START.x, z: START.z, yaw: 0, pitch: -0.02 },
  { id: 'avenue', label: 'Flower beds', x: 3, z: 64, yaw: 0.35, pitch: -0.12 },
  { id: 'pavilion', label: 'Glasshouse', x: -60, z: 40.5, yaw: 0, pitch: 0.02 },
  { id: 'cafe', label: 'Café terrace', x: 62, z: 60, yaw: 0, pitch: 0.0 },
  { id: 'lake', label: 'Water garden', x: -3, z: -8.5, yaw: 0.1, pitch: -0.02 },
  { id: 'mill', label: 'Windmill', x: 0, z: -76, yaw: 0, pitch: 0.3 },
  { id: 'gallery', label: 'Windmill gallery', x: MILL.x + 5.2, z: MILL.z, yaw: Math.PI * 0.62, pitch: -0.12, deck: true },
]

export class KeukenhofExperience {
  private container: HTMLElement
  private ev: Events
  private q: QCfg
  quality: Quality
  renderer!: THREE.WebGLRenderer
  scene = new THREE.Scene()
  camera = new THREE.PerspectiveCamera(66, 1, 0.2, 20000)
  private composer: EffectComposer | null = null
  private gradePass: ShaderPass | null = null
  private bloom: UnrealBloomPass | null = null
  private atmo!: Atmosphere
  private terrain!: Terrain
  private beds!: BedField
  private trees!: TreeSet
  private lawn!: Lawn
  private mill!: Windmill
  private life!: Life
  private layout!: Layout
  private audio = new GardenAudio()
  private clock = new THREE.Clock()
  private raf = 0
  private disposed = false
  private ro: ResizeObserver

  // player
  private px = START.x
  private pz = START.z
  private feetY = 0
  private yaw = START.yaw
  private pitch = -0.02
  private vel = new THREE.Vector3()
  private vy = 0
  mode: 'walk' | 'fly' = 'walk'
  private flyY = 30
  private keys: Record<string, boolean> = {}
  private bobT = 0
  private stride = 0
  private lastSurface: 'gravel' | 'grass' | 'paver' | 'wood' = 'gravel'
  private fovCur = 66
  locked = false
  private drag = { on: false, id: -1 }
  private joy = { id: -1, ox: 0, oy: 0, x: 0, y: 0 }
  private look = { id: -1, x: 0, y: 0 }
  private joyEls: { base: HTMLDivElement; knob: HTMLDivElement } | null = null
  private fade: HTMLDivElement

  // state
  hour = 13
  cover = 0.28
  wind = 0.6
  private time = 0
  private frame = 0
  private fpsAcc = 0
  private fpsN = 0
  private fps = 60
  private dprCur = 1
  autoQuality = true
  private lastAdapt = 0
  private hudT = 0
  private pins: Pin[] = POIS.map((p) => ({ id: p.id, x: 0, y: 0, vis: false, dist: 0 }))
  private nearPoi: string | null = null
  private flower: Hud['flower'] = null
  private tmpV = new THREE.Vector3()
  private ray = new THREE.Vector3()
  ready = false
  photo = false

  constructor(container: HTMLElement, quality: Quality, ev: Events = {}) {
    this.container = container
    this.ev = ev
    this.quality = quality
    this.q = QUALITY[quality]
    this.fade = document.createElement('div')
    this.fade.style.cssText = 'position:absolute;inset:0;background:#000;opacity:0;pointer-events:none;transition:opacity .45s ease;z-index:5'
    container.appendChild(this.fade)
    this.ro = new ResizeObserver(() => this.resize())
    this.ro.observe(container)
  }

  /* ----------------------------------------------------------------- init */
  async init() {
    const P = (f: number, l: string) => this.ev.onProgress?.(f, l)
    const q = this.q
    const renderer = new THREE.WebGLRenderer({ antialias: !q.composer, powerPreference: 'high-performance', stencil: false })
    this.renderer = renderer
    this.dprCur = Math.min(window.devicePixelRatio || 1, q.dpr)
    renderer.setPixelRatio(this.dprCur)
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;outline:none'
    this.container.insertBefore(renderer.domElement, this.container.firstChild)
    this.camera.rotation.order = 'YXZ'

    const tex = await buildTextures((f, l) => P(f * 0.3, l))
    P(0.31, 'Surveying the grounds')
    await tick()
    this.layout = getLayout()
    const mats = makeMats(tex)
    P(0.36, 'Shaping the terrain')
    await tick()
    this.terrain = buildTerrain(tex, this.layout.beds)
    this.scene.add(this.terrain.ground, this.terrain.far, this.terrain.water)

    this.atmo = new Atmosphere(renderer, this.scene, q.shadow)
    this.atmo.shadowHalf = q.shadowHalf
    this.atmo.set(this.hour, this.cover)

    P(0.42, 'Planting millions of bulbs')
    await tick()
    this.beds = new BedField(this.layout.beds, { spacing: q.spacing, lod0: q.lod[0], lod1: q.lod[1], lod2: q.lod[2] }, tex.speckle, (f) => P(0.42 + f * 0.25, 'Planting millions of bulbs'))
    this.scene.add(this.beds.group)

    P(0.68, 'Growing the trees')
    await tick()
    this.trees = new TreeSet(this.layout.trees, tex, q.cards, (f) => P(0.68 + f * 0.14, 'Growing the trees'))
    this.scene.add(this.trees.group)
    for (const t of this.layout.trees) if (t.kind !== 'poplar' && Math.abs(t.x) < 140 && t.z > -100 && t.z < 150) colCircles.push([t.x, t.z, (t.kind === 'willow' ? 0.6 : 0.4) * t.s + 0.15])

    P(0.84, 'Raising the windmill')
    await tick()
    this.mill = buildWindmill(mats, tex)
    this.scene.add(this.mill.group)
    colCircles.push([MILL.x, MILL.z, MILL.rBase + 0.35])
    this.scene.add(buildGate(mats))
    this.scene.add(buildPavilion(mats, this.layout.beds))
    const cafe = buildCafe(mats)
    this.scene.add(cafe.group)
    this.scene.add(buildProps(mats, this.layout.benches, this.layout.lamps, this.layout.beds))
    P(0.92, 'Launching the swans and boats')
    await tick()
    this.life = buildLife(mats, tex.sprite)
    this.scene.add(this.life.group)

    this.lawn = new Lawn(this.layout.beds, tex, { density: q.grassDensity, radius: q.grassRadius })

    // water reflection resolution
    const wm = this.terrain.water.material as THREE.ShaderMaterial
    void wm

    this.setupPost()
    this.bindInput()
    this.resize()
    this.placePlayer(START.x, START.z, START.yaw, -0.02)
    P(0.97, 'Warming up the shaders')
    this.lawn.update(this.camera.position, 40)
    await tick()
    this.renderOnce()
    this.ready = true
    P(1, 'Ready')
    this.clock.start()
    const loop = () => {
      if (this.disposed) return
      this.raf = requestAnimationFrame(loop)
      this.step()
    }
    loop()
  }

  private setupPost() {
    const q = this.q
    if (!q.composer) return
    const size = new THREE.Vector2()
    this.renderer.getDrawingBufferSize(size)
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 })
    const c = new EffectComposer(this.renderer, rt)
    c.addPass(new RenderPass(this.scene, this.camera))
    if (q.bloom) {
      this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.16, 0.7, 0.93)
      c.addPass(this.bloom)
    }
    c.addPass(new OutputPass())
    this.gradePass = new ShaderPass({
      uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uAspect: { value: 1 }, uVig: { value: 0.32 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `
        uniform sampler2D tDiffuse; uniform float uTime, uAspect, uVig; varying vec2 vUv;
        float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
        void main(){
          vec2 c = vUv - 0.5;
          float r2 = dot(c * vec2(uAspect, 1.0), c * vec2(uAspect, 1.0));
          vec2 off = c * r2 * 0.0035;
          vec3 col = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
          float l = dot(col, vec3(0.299, 0.587, 0.114));
          col = mix(vec3(l), col, 1.1);
          col = (col - 0.5) * 1.04 + 0.5;
          col *= 1.0 - uVig * smoothstep(0.15, 0.9, r2 * 1.6);
          col += (h(vUv * 1000.0 + uTime) - 0.5) * 0.018;
          gl_FragColor = vec4(col, 1.0);
        }`,
    })
    c.addPass(this.gradePass)
    this.composer = c
  }

  /* ----------------------------------------------------------------- input */
  private onKeyDown = (e: KeyboardEvent) => {
    if (!this.ready) return
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault()
    this.keys[e.code] = true
    if (e.repeat) return
    if (e.code === 'KeyF') this.toggleFly()
  }
  private onKeyUp = (e: KeyboardEvent) => {
    this.keys[e.code] = false
  }
  private onMouseMove = (e: MouseEvent) => {
    if (this.locked || this.drag.on) this.rotate(e.movementX, e.movementY)
  }
  private rotate(dx: number, dy: number) {
    const k = 0.0021
    this.yaw -= dx * k
    this.pitch = clamp(this.pitch - dy * k, -1.45, 1.45)
  }
  private onLockChange = () => {
    this.locked = document.pointerLockElement === this.renderer.domElement
    this.ev.onLock?.(this.locked)
  }
  private onPointerDown = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') {
      if (!this.locked) {
        this.drag.on = true
        this.drag.id = e.pointerId
        this.renderer.domElement.setPointerCapture(e.pointerId)
      }
    } else {
      const w = this.container.clientWidth
      const x = e.clientX
      const y = e.clientY
      if (x < w * 0.45 && this.joy.id < 0) {
        this.joy = { id: e.pointerId, ox: x, oy: y, x: 0, y: 0 }
        this.showJoy(true, x, y)
      } else if (this.look.id < 0) this.look = { id: e.pointerId, x, y }
      this.renderer.domElement.setPointerCapture(e.pointerId)
    }
  }
  private onPointerMove = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') return
    if (e.pointerId === this.joy.id) {
      const dx = e.clientX - this.joy.ox
      const dy = e.clientY - this.joy.oy
      const l = Math.hypot(dx, dy)
      const m = Math.min(1, l / 55)
      this.joy.x = (dx / (l || 1)) * m
      this.joy.y = (dy / (l || 1)) * m
      this.showJoy(true, this.joy.ox, this.joy.oy, this.joy.x * 40, this.joy.y * 40)
    } else if (e.pointerId === this.look.id) {
      this.rotate((e.clientX - this.look.x) * 1.4, (e.clientY - this.look.y) * 1.4)
      this.look.x = e.clientX
      this.look.y = e.clientY
    }
  }
  private onPointerUp = (e: PointerEvent) => {
    if (e.pointerId === this.drag.id) this.drag.on = false
    if (e.pointerId === this.joy.id) {
      this.joy = { id: -1, ox: 0, oy: 0, x: 0, y: 0 }
      this.showJoy(false, 0, 0)
    }
    if (e.pointerId === this.look.id) this.look.id = -1
  }
  private showJoy(on: boolean, x: number, y: number, kx = 0, ky = 0) {
    if (!this.joyEls) {
      const base = document.createElement('div')
      const knob = document.createElement('div')
      base.style.cssText = 'position:absolute;width:110px;height:110px;margin:-55px 0 0 -55px;border-radius:50%;background:rgba(255,255,255,.14);border:1.5px solid rgba(255,255,255,.4);pointer-events:none;z-index:4;display:none'
      knob.style.cssText = 'position:absolute;left:50%;top:50%;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;background:rgba(255,255,255,.55)'
      base.appendChild(knob)
      this.container.appendChild(base)
      this.joyEls = { base, knob }
    }
    const r = this.container.getBoundingClientRect()
    this.joyEls.base.style.display = on ? 'block' : 'none'
    this.joyEls.base.style.left = x - r.left + 'px'
    this.joyEls.base.style.top = y - r.top + 'px'
    this.joyEls.knob.style.transform = `translate(${kx}px,${ky}px)`
  }
  private bindInput() {
    const el = this.renderer.domElement
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    window.addEventListener('mousemove', this.onMouseMove)
    document.addEventListener('pointerlockchange', this.onLockChange)
    el.addEventListener('pointerdown', this.onPointerDown)
    el.addEventListener('pointermove', this.onPointerMove)
    el.addEventListener('pointerup', this.onPointerUp)
    el.addEventListener('pointercancel', this.onPointerUp)
    window.addEventListener('blur', () => (this.keys = {}))
  }

  requestLock() {
    this.audio.start()
    try {
      const p = this.renderer.domElement.requestPointerLock() as unknown as Promise<void> | undefined
      p?.catch?.(() => {})
    } catch {
      /* drag-to-look fallback */
    }
  }
  exitLock() {
    if (document.pointerLockElement) document.exitPointerLock()
  }
  startAudio() {
    this.audio.start()
  }
  setMuted(m: boolean) {
    this.audio.setMuted(m)
  }
  isKey(code: string) {
    return !!this.keys[code]
  }

  /* ----------------------------------------------------------------- physics */
  private surface(x: number, z: number, curY: number, fly = false): number | null {
    if (Math.abs(x) > 138 || z < -97.5 || z > 146) return null
    if (fly) return groundHeight(x, z)
    if (waterSD(x, z) < 0.45) return null
    const gh = groundHeight(x, z)
    let best = gh
    let onTop = false
    const millY = groundHeight(MILL.x, MILL.z)
    // stair
    if (Math.abs(z - STAIR.z) < STAIR.w / 2 + 0.05 && x <= STAIR.x0 + 0.3 && x >= STAIR.x1) {
      const g0 = groundHeight(STAIR.x0, STAIR.z)
      const t = clamp((STAIR.x0 - x) / (STAIR.x0 - STAIR.x1), 0, 1)
      const h = g0 + t * (millY + DECK_Y - g0)
      if (h <= curY + 0.62 && h > best) {
        best = h
        onTop = true
      }
    }
    // gallery deck
    const r = Math.hypot(x - MILL.x, z - MILL.z)
    if (r > 4.5 && r < 5.75) {
      const h = millY + DECK_Y
      if (h <= curY + 0.62 && h > best) {
        best = h
        onTop = true
      }
    }
    if (best < curY - 0.75) return null // no stepping off a ledge
    if (!onTop) {
      for (const [cx, cz, cr] of colCircles) {
        const dx = x - cx
        const dz = z - cz
        if (dx * dx + dz * dz < (cr + 0.32) * (cr + 0.32)) return null
      }
      for (const b of colBoxes) if (Math.abs(x - b.cx) < b.hx + 0.35 && Math.abs(z - b.cz) < b.hz + 0.35) return null
      // beds (do not trample the flowers)
      for (const bd of this.layout.beds) {
        if (x < bd.b.x0 - 0.5 || x > bd.b.x1 + 0.5 || z < bd.b.z0 - 0.5 || z > bd.b.z1 + 0.5) continue
        if (pointInPoly(x, z, bd.poly) || pointInPoly(x + 0.4, z, bd.poly) || pointInPoly(x - 0.4, z, bd.poly) || pointInPoly(x, z + 0.4, bd.poly) || pointInPoly(x, z - 0.4, bd.poly)) return null
      }
    }
    return best
  }

  private placePlayer(x: number, z: number, yaw: number, pitch: number, deck = false) {
    let fx = x
    let fz = z
    if (!deck) {
      // find nearest free spot
      let found = this.surface(fx, fz, groundHeight(fx, fz)) !== null
      for (let rr = 0.5; !found && rr < 14; rr += 0.5) {
        for (let a = 0; a < 16 && !found; a++) {
          const tx = x + Math.cos((a / 16) * Math.PI * 2) * rr
          const tz = z + Math.sin((a / 16) * Math.PI * 2) * rr
          if (this.surface(tx, tz, groundHeight(tx, tz)) !== null) {
            fx = tx
            fz = tz
            found = true
          }
        }
      }
      this.feetY = groundHeight(fx, fz)
    } else this.feetY = groundHeight(MILL.x, MILL.z) + DECK_Y
    this.px = fx
    this.pz = fz
    this.yaw = yaw
    this.pitch = pitch
    this.vel.set(0, 0, 0)
    this.mode = 'walk'
    this.syncCamera(0)
  }

  teleport(id: string) {
    const t = TELEPORTS.find((p) => p.id === id)
    if (!t) return
    this.fade.style.opacity = '1'
    setTimeout(() => {
      if (this.disposed) return
      this.placePlayer(t.x, t.z, t.yaw, t.pitch ?? 0, t.deck)
      this.lawn.update(this.camera.position, 40)
      setTimeout(() => (this.fade.style.opacity = '0'), 60)
    }, 460)
  }
  teleportXZ(x: number, z: number) {
    this.fade.style.opacity = '1'
    setTimeout(() => {
      if (this.disposed) return
      this.placePlayer(x, z, this.yaw, this.pitch)
      this.lawn.update(this.camera.position, 40)
      setTimeout(() => (this.fade.style.opacity = '0'), 60)
    }, 420)
  }

  toggleFly() {
    if (this.mode === 'walk') {
      this.mode = 'fly'
      this.flyY = Math.max(this.feetY + 1.7, 14)
      this.ev.onToast?.('Drone view — Space / C to rise & descend, F to land')
    } else {
      this.mode = 'walk'
      const s = this.surface(this.px, this.pz, groundHeight(this.px, this.pz))
      if (s === null) this.placePlayer(this.px, this.pz, this.yaw, this.pitch)
      else this.feetY = groundHeight(this.px, this.pz)
      this.ev.onToast?.('Back on foot')
    }
  }

  /* ----------------------------------------------------------------- frame */
  private step() {
    const dt = Math.min(this.clock.getDelta(), 0.05)
    this.time += dt
    this.frame++
    this.update(dt)
    this.render()
    // fps & adaptive resolution
    this.fpsAcc += dt
    this.fpsN++
    if (this.fpsAcc > 1) {
      this.fps = this.fpsN / this.fpsAcc
      if (this.autoQuality && this.time - this.lastAdapt > 2.4) {
        const maxD = Math.min(window.devicePixelRatio || 1, this.q.dpr)
        if (this.fps < 28 && this.dprCur > 0.55) this.setDpr(Math.max(0.55, this.dprCur * 0.82))
        else if (this.fps > 56 && this.dprCur < maxD) this.setDpr(Math.min(maxD, this.dprCur * 1.12))
        this.lastAdapt = this.time
      }
      this.fpsAcc = 0
      this.fpsN = 0
    }
  }

  private setDpr(d: number) {
    this.dprCur = d
    this.renderer.setPixelRatio(d)
    this.composer?.setPixelRatio(d)
    this.resize()
  }

  private update(dt: number) {
    const sprint = this.keys.ShiftLeft || this.keys.ShiftRight
    const fly = this.mode === 'fly'
    // input vector
    let ix = (this.keys.KeyD || this.keys.ArrowRight ? 1 : 0) - (this.keys.KeyA || this.keys.ArrowLeft ? 1 : 0) + this.joy.x
    let iz = (this.keys.KeyW || this.keys.ArrowUp ? 1 : 0) - (this.keys.KeyS || this.keys.ArrowDown ? 1 : 0) - this.joy.y
    const il = Math.hypot(ix, iz)
    if (il > 1) {
      ix /= il
      iz /= il
    }
    const sp = fly ? (sprint ? 42 : 15) : sprint ? 5.4 : 2.7
    const fx = -Math.sin(this.yaw)
    const fz = -Math.cos(this.yaw)
    const rx = Math.cos(this.yaw)
    const rz = -Math.sin(this.yaw)
    const tvx = (fx * iz + rx * ix) * sp
    const tvz = (fz * iz + rz * ix) * sp
    const k = 1 - Math.exp(-dt * (fly ? 3.5 : 9))
    this.vel.x += (tvx - this.vel.x) * k
    this.vel.z += (tvz - this.vel.z) * k

    if (fly) {
      const up = (this.keys.Space ? 1 : 0) - (this.keys.KeyC || this.keys.ControlLeft ? 1 : 0)
      this.vy += (up * (sprint ? 30 : 12) - this.vy) * k
      this.flyY = clamp(this.flyY + this.vy * dt, groundHeight(this.px, this.pz) + 1.2, 140)
      const nx = clamp(this.px + this.vel.x * dt, -170, 170)
      const nz = clamp(this.pz + this.vel.z * dt, -170, 170)
      this.px = nx
      this.pz = nz
    } else {
      let nx = this.px + this.vel.x * dt
      let sy = this.surface(nx, this.pz, this.feetY)
      if (sy === null) {
        this.vel.x = 0
        nx = this.px
      }
      let nz = this.pz + this.vel.z * dt
      sy = this.surface(nx, nz, this.feetY)
      if (sy === null) {
        this.vel.z = 0
        nz = this.pz
      }
      const moved = Math.hypot(nx - this.px, nz - this.pz)
      this.px = nx
      this.pz = nz
      const target = this.surface(this.px, this.pz, this.feetY) ?? this.feetY
      this.feetY += (target - this.feetY) * (1 - Math.exp(-dt * 14))
      this.stride += moved
      this.bobT += moved * 2.9
      const stepLen = sprint ? 2.3 : 1.45
      if (this.stride > stepLen) {
        this.stride = 0
        this.audio.step(this.surfaceType(), !!sprint)
      }
    }
    this.syncCamera(dt)

    // environment
    flowerUniforms.uTime.value = this.time
    flowerUniforms.uWind.value = this.wind
    treeUniforms.uTime.value = this.time
    treeUniforms.uWind.value = this.wind
    const st = this.atmo.state
    treeUniforms.uSunDir.value.copy(st.sunDir)
    treeUniforms.uSunI.value = Math.min(1, st.sunI / 3)
    this.terrain.setSun(st.sunDir, st.sunColor)
    const wu = (this.terrain.water.material as THREE.ShaderMaterial).uniforms
    wu.time.value += dt * (0.35 + this.wind * 0.5)
    wu.distortionScale.value = 0.8 + this.wind * 1.8
    this.atmo.update(this.time, this.camera.position, this.tmpV.set(this.px, 0, this.pz))
    if (this.gradePass) {
      this.gradePass.uniforms.uTime.value = this.time % 10
      this.gradePass.uniforms.uAspect.value = this.camera.aspect
    }
    this.beds.update(this.camera.position)
    this.lawn.update(this.camera.position, this.frame < 4 ? 20 : 2)
    this.mill.update(dt, this.wind)
    this.life.update(this.time, dt, st.sunColor, this.wind)

    // audio
    const waterD = waterSD(this.px, this.pz)
    const fd = Math.hypot(this.px - this.life.fountainPos.x, this.pz - this.life.fountainPos.z)
    const indoors = insideBuilding(this.px, this.pz, -0.3)
    this.audio.update(dt, {
      wind: this.wind * (1 + (this.feetY > 3 ? 0.8 : 0)),
      water: clamp(1 - waterD / 25, 0, 1) * 0.5 + clamp(1 - fd / 30, 0, 1),
      daylight: clamp((st.elev + 2) / 12, 0.1, 1),
      crowd: clamp(1 - Math.abs(this.pz - 60) / 80, 0.1, 1),
      indoors,
    })

    // pins + hud
    this.hudT += dt
    this.updatePins()
    if (this.frame % 4 === 0) this.probeFlower()
    if (this.hudT > 0.12) {
      this.hudT = 0
      this.ev.onHud?.({
        x: this.px,
        z: this.pz,
        yaw: this.yaw,
        indoors,
        onGallery: this.feetY > groundHeight(MILL.x, MILL.z) + 3,
        mode: this.mode,
        nearPoi: this.nearPoi,
        flower: this.flower,
        fps: Math.round(this.fps),
        dpr: +this.dprCur.toFixed(2),
        hour: this.hour,
      })
    }
  }

  private surfaceType(): 'gravel' | 'grass' | 'paver' | 'wood' {
    if (this.feetY > groundHeight(MILL.x, MILL.z) + 0.8) return 'wood'
    if (insideBuilding(this.px, this.pz, 0)) return 'paver'
    const [r, g] = this.terrain.splatAt(this.px, this.pz)
    this.lastSurface = g > 128 ? 'paver' : r > 128 ? 'gravel' : 'grass'
    return this.lastSurface
  }

  private syncCamera(dt: number) {
    const fly = this.mode === 'fly'
    const bob = fly ? 0 : Math.sin(this.bobT) * 0.028 * Math.min(1, Math.hypot(this.vel.x, this.vel.z) / 2.5)
    const eye = fly ? this.flyY : this.feetY + 1.68 + bob
    this.camera.position.set(this.px, eye, this.pz)
    this.camera.rotation.set(this.pitch, this.yaw, 0)
    const sprint = (this.keys.ShiftLeft || this.keys.ShiftRight) && Math.hypot(this.vel.x, this.vel.z) > 3
    const tf = sprint ? 71 : 66
    this.fovCur += (tf - this.fovCur) * (1 - Math.exp(-dt * 6))
    if (Math.abs(this.camera.fov - this.fovCur) > 0.02) {
      this.camera.fov = this.fovCur
      this.camera.updateProjectionMatrix()
    }
  }

  private updatePins() {
    const cam = this.camera
    const w = this.container.clientWidth
    const h = this.container.clientHeight
    cam.updateMatrixWorld()
    let best: string | null = null
    let bestScore = 0
    const fwd = this.ray.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw))
    POIS.forEach((p, i) => {
      const pin = this.pins[i]
      const gy = groundHeight(p.x, p.z)
      this.tmpV.set(p.x, gy + p.y, p.z)
      const dx = p.x - this.px
      const dz = p.z - this.pz
      const d = Math.hypot(dx, dz)
      const dot = (dx * fwd.x + dz * fwd.z) / (d || 1)
      this.tmpV.project(cam)
      pin.vis = this.tmpV.z < 1 && this.tmpV.z > -1 && Math.abs(this.tmpV.x) < 1.05 && Math.abs(this.tmpV.y) < 1.05 && d < 200 && !this.photo
      pin.x = (this.tmpV.x * 0.5 + 0.5) * w
      pin.y = (-this.tmpV.y * 0.5 + 0.5) * h
      pin.dist = d
      const reach = p.id === 'mill' ? 26 : p.id === 'pavilion' || p.id === 'cafe' ? 24 : 18
      if (d < reach && dot > 0.25) {
        const score = (reach - d) * dot
        if (score > bestScore) {
          bestScore = score
          best = p.id
        }
      }
    })
    this.nearPoi = best
    this.ev.onPins?.(this.pins)
  }

  private probeFlower() {
    this.flower = null
    const d = this.camera.getWorldDirection(this.ray)
    if (d.y > -0.03) return
    const t = (this.camera.position.y - 0.3 - (this.mode === 'fly' ? 0 : 0)) / -d.y
    if (t < 0 || t > (this.mode === 'fly' ? 90 : 22)) return
    const x = this.camera.position.x + d.x * t
    const z = this.camera.position.z + d.z * t
    const bed = bedAt(x, z, this.layout.beds)
    if (!bed) return
    const v = VARIETIES[varietyAt(bed, x, z)]
    this.flower = { name: v.name, kind: v.kind, note: v.note, species: v.species }
  }

  /* ----------------------------------------------------------------- controls from UI */
  setTime(hour: number) {
    this.hour = hour
    this.atmo.set(hour, this.cover)
  }
  setCover(c: number) {
    this.cover = c
    this.atmo.set(this.hour, c)
  }
  setWind(w: number) {
    this.wind = w
  }
  getPlayer() {
    return { x: this.px, z: this.pz, yaw: this.yaw }
  }
  getCoverCfg() {
    return { lakeC: LAKE_C, cafe: CAFE, pavilion: PAVILION }
  }
  getBeds(): Bed[] {
    return this.layout.beds
  }
  /** Debug / testing helper: stop the animation loop and advance the simulation manually. */
  halt() {
    cancelAnimationFrame(this.raf)
    this.disposed = true
  }
  advance(n = 1, dt = 0.016) {
    for (let i = 0; i < n; i++) {
      this.time += dt
      this.frame++
      this.update(dt)
    }
    this.lawn.update(this.camera.position, 80)
  }
  snapshot(): string {
    this.render()
    return this.renderer.domElement.toDataURL('image/png')
  }
  setView(yaw: number, pitch: number) {
    this.yaw = yaw
    this.pitch = pitch
    this.syncCamera(0)
  }
  capture(): string {
    this.render()
    return this.renderer.domElement.toDataURL('image/png')
  }

  /* ----------------------------------------------------------------- render */
  private renderOnce() {
    this.update(0.016)
    this.render()
  }
  private render() {
    if (this.composer) this.composer.render()
    else this.renderer.render(this.scene, this.camera)
  }

  private resize() {
    if (!this.renderer) return
    const w = this.container.clientWidth || 1
    const h = this.container.clientHeight || 1
    this.renderer.setSize(w, h, false)
    this.composer?.setSize(w, h)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  dispose() {
    this.disposed = true
    cancelAnimationFrame(this.raf)
    this.ro.disconnect()
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    window.removeEventListener('mousemove', this.onMouseMove)
    document.removeEventListener('pointerlockchange', this.onLockChange)
    this.exitLock()
    this.audio.dispose()
    this.atmo?.dispose()
    this.beds?.dispose()
    this.trees?.dispose()
    this.lawn?.dispose()
    this.composer?.dispose()
    this.renderer?.dispose()
    this.renderer?.domElement.remove()
    this.fade.remove()
    this.joyEls?.base.remove()
  }
}

export { GROUND_HALF }

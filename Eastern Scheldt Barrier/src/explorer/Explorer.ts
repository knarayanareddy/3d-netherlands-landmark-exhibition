import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { Atmosphere, PRESETS, blendEnv, cloneEnv, type EnvParams, type TimeId } from './atmosphere'
import { Ambience } from './audio'
import { buildBarrier, type BarrierRig } from './barrier'
import { HOTSPOTS, VIEWPOINTS, type Mode } from './data'
import { U, makeMaterials, weather, type Mats } from './kit'
import { buildCollars, buildGrass, buildRiprap, buildRoads, buildTerrain, foamUniforms } from './landscape'
import { Cars, Gulls, Ships, buildIsland, updateFlags, type IslandRig } from './props'
import { asphaltSet, concreteSet, detailTexture, grassTexture, glowTexture, rockSet, waterNormals } from './textures'
import { clamp, smoothstep } from './noise'
import {
  BARRIER_X1, DECK_Y, GATE_H, N_PIERS, PIER_HALF_X, PIER_Z0, PIER_Z1, PITCH, ROAD_X0, ROAD_X1, ROAD_Z, blockedWalk, groundAt, roadY, terrainH,
} from './world'

export interface ExplorerState {
  x: number
  y: number
  z: number
  yaw: number
  mode: Mode
  gates: number
  onDeck: boolean
  storm: number
  time: TimeId
}

export interface ExplorerEvents {
  onProgress?: (p: number, label: string) => void
  onState?: (s: ExplorerState) => void
  onArrive?: (viewId: string) => void
}

const sleep = () => new Promise<void>((r) => setTimeout(r, 12))
const ease = (t: number) => t * t * (3 - 2 * t)

const FinishShader = {
  uniforms: { tDiffuse: { value: null as THREE.Texture | null }, uTime: { value: 0 }, uVignette: { value: 0.32 }, uGrain: { value: 0.016 }, uAberr: { value: 0.0004 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uVignette; uniform float uGrain; uniform float uAberr;
    varying vec2 vUv;
    float rnd(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)) + uTime) * 43758.5453); }
    void main(){
      vec2 c = vUv - 0.5;
      float r2 = dot(c,c);
      vec2 off = c * r2 * uAberr * 14.0;
      vec3 col = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
      col *= 1.0 - uVignette * smoothstep(0.12, 0.85, r2 * 2.4);
      col += (rnd(vUv * 1000.0) - 0.5) * uGrain;
      gl_FragColor = vec4(col, 1.0);
    }`,
}

export class BarrierExplorer {
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera = new THREE.PerspectiveCamera(62, 1, 0.2, 9000)
  private composer!: EffectComposer
  private bloom!: UnrealBloomPass
  private finish!: ShaderPass
  private atmos!: Atmosphere
  private rig!: BarrierRig
  private island!: IslandRig
  private cars!: Cars
  private gulls!: Gulls
  private ships!: Ships
  private collars!: THREE.InstancedMesh
  private foams: THREE.Mesh[] = []
  private mats!: Mats
  private glowLamps!: THREE.Points
  private glowBeacons!: THREE.Points
  private audio = new Ambience()
  private raf = 0
  private disposed = false
  private ro: ResizeObserver
  private clock = new THREE.Clock()
  private t = 0
  private ready = false

  // camera state
  mode: Mode = 'cinema'
  private pos = new THREE.Vector3(-120, 60, 230)
  private yaw = 1.2
  private pitch = -0.2
  private vel = new THREE.Vector3()
  private keys = new Set<string>()
  private joy = new THREE.Vector2()
  private dragging = false
  private lastPt = { x: 0, y: 0 }
  private bob = 0
  private fov = 62
  private fovTarget = 62
  private tween: null | { t: number; dur: number; p0: THREE.Vector3; p1: THREE.Vector3; y0: number; y1: number; pi0: number; pi1: number; view: string; mode: Mode } = null
  private lookTarget = 0

  // environment state
  private todFrom: EnvParams = cloneEnv(PRESETS.midday)
  private todTo: EnvParams = PRESETS.midday
  private todK = 1
  time: TimeId = 'midday'
  private storm = 0
  private stormTarget = 0
  private closeTarget = 0
  private closing = 0
  private scratch = cloneEnv(PRESETS.midday)
  private envNow = cloneEnv(PRESETS.midday)

  private hotEls = new Map<string, HTMLElement>()
  private hotPos = new Map<string, THREE.Vector3>()
  private lastState = 0
  private frameAcc = 0
  private frameN = 0
  private lowFx = false
  private pixelRatio = 1

  constructor(private container: HTMLElement, private ev: ExplorerEvents = {}) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false })
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5)
    this.renderer.setPixelRatio(this.pixelRatio)
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    const el = this.renderer.domElement
    el.style.display = 'block'
    el.style.width = '100%'
    el.style.height = '100%'
    el.style.touchAction = 'none'
    container.appendChild(el)
    this.ro = new ResizeObserver(() => this.resize())
    this.ro.observe(container)
    this.bindInput(el)
  }

  /* ------------------------------------------------------------------ build */
  async init() {
    const P = (p: number, l: string) => this.ev.onProgress?.(p, l)
    const tick = async () => {
      await sleep()
      if (this.disposed) throw new Error('disposed')
    }
    P(0.02, 'Pouring concrete textures')
    await tick()
    const concrete = concreteSet(1024)
    P(0.14, 'Quarrying basalt')
    await tick()
    const rock = rockSet(512)
    const asphalt = asphaltSet(512)
    const detail = detailTexture(256)
    U.uDetail.value = detail
    const normals = waterNormals(512)
    const grassTex = grassTexture()
    P(0.26, 'Filling the Eastern Scheldt')
    await tick()
    this.mats = makeMaterials({ concrete, rock, asphalt })
    this.atmos = new Atmosphere(this.renderer, this.scene, normals)
    P(0.36, 'Casting 23 piers')
    await tick()
    this.rig = buildBarrier(this.mats)
    this.scene.add(this.rig.group)
    this.collars = buildCollars()
    this.scene.add(this.collars)
    P(0.5, 'Raising Neeltje Jans')
    await tick()
    const west = buildTerrain(-740, -90, -230, 230, 2.2)
    const east = buildTerrain(1100, 1740, -230, 230, 3)
    this.scene.add(west.mesh, east.mesh, west.foam, east.foam)
    this.foams.push(west.foam, east.foam)
    P(0.64, 'Paving the N57')
    await tick()
    const grassMat = weather(new THREE.MeshStandardMaterial({ color: '#5d6e31', roughness: 1 }), { grime: 0.5, fine: 0.7 })
    this.scene.add(buildRoads(this.mats, grassMat))
    this.scene.add(buildRiprap(this.mats))
    P(0.76, 'Planting marram grass')
    await tick()
    this.scene.add(buildGrass(grassTex, 26000, -720, -100, -220, 220, 3))
    this.scene.add(buildGrass(grassTex, 9000, 1110, 1730, -220, 220, 5))
    P(0.88, 'Adding traffic, turbines and gulls')
    await tick()
    this.island = buildIsland(this.mats)
    this.scene.add(this.island.group)
    this.cars = new Cars()
    this.gulls = new Gulls(18)
    this.ships = new Ships()
    this.scene.add(this.cars.group, this.gulls.group, this.ships.group)

    // night lights
    const lamps = [...this.rig.lamps, ...this.island.lamps]
    const lg = new THREE.BufferGeometry().setFromPoints(lamps)
    this.glowLamps = new THREE.Points(
      lg,
      new THREE.PointsMaterial({ map: glowTexture(), size: 7, color: new THREE.Color(1.0, 0.78, 0.45), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
    )
    this.glowLamps.frustumCulled = false
    const bg = new THREE.BufferGeometry().setFromPoints(this.rig.beacons)
    this.glowBeacons = new THREE.Points(
      bg,
      new THREE.PointsMaterial({ map: glowTexture(), size: 10, color: new THREE.Color(1.0, 0.1, 0.05), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
    )
    this.glowBeacons.frustumCulled = false
    this.scene.add(this.glowLamps, this.glowBeacons)

    // post processing
    P(0.95, 'Developing the film')
    await tick()
    const size = this.renderer.getSize(new THREE.Vector2())
    const rt = new THREE.WebGLRenderTarget(size.x * this.pixelRatio, size.y * this.pixelRatio, { type: THREE.HalfFloatType, samples: 4 })
    this.composer = new EffectComposer(this.renderer, rt)
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.25, 0.7, 0.95)
    this.composer.addPass(this.bloom)
    this.composer.addPass(new OutputPass())
    this.finish = new ShaderPass(FinishShader)
    this.composer.addPass(this.finish)
    this.resize()

    this.todFrom = cloneEnv(PRESETS.midday)
    this.todTo = PRESETS.midday
    this.rig.setClosing(0)
    this.atmos.apply(this.computeEnv(), 0, true)
    for (const h of HOTSPOTS) this.hotPos.set(h.id, new THREE.Vector3(...h.pos))
    this.ready = true
    P(1, 'Ready')
    this.loop()
  }

  /* ------------------------------------------------------------------ public API */
  registerHotspot(id: string, el: HTMLElement | null) {
    if (el) this.hotEls.set(id, el)
    else this.hotEls.delete(id)
  }

  setTime(id: TimeId, instant = false) {
    this.todFrom = cloneEnv(blendEnv(this.todFrom, this.todTo, ease(this.todK), 0, this.scratch))
    this.todTo = PRESETS[id]
    this.todK = instant ? 1 : 0
    this.time = id
  }

  setStorm(on: boolean, instant = false) {
    this.stormTarget = on ? 1 : 0
    this.closeTarget = on ? 1 : 0
    if (instant) {
      this.storm = this.stormTarget
      this.closing = this.closeTarget
      this.rig.setClosing(this.closing)
    }
  }
  get stormOn() {
    return this.stormTarget > 0
  }

  setGates(closed: boolean) {
    this.closeTarget = closed ? 1 : 0
  }

  setFX(on: boolean) {
    this.bloom.enabled = on
    this.finish.enabled = on
  }

  setPixelRatio(r: number) {
    this.pixelRatio = r
    this.renderer.setPixelRatio(r)
    this.resize()
  }

  async setSound(on: boolean) {
    await this.audio.setEnabled(on)
  }

  setJoystick(x: number, y: number) {
    this.joy.set(x, y)
  }

  setMode(m: Mode) {
    if (m === this.mode) return
    this.tween = null
    if (m === 'walk') {
      this.snapToWalkable()
      this.vel.set(0, 0, 0)
    }
    this.mode = m
    this.emitState(true)
  }

  private snapToWalkable() {
    let g = groundAt(this.pos.x, this.pos.z)
    if (g === null) {
      const x = clamp(this.pos.x, ROAD_X0 + 20, ROAD_X1 - 20)
      this.pos.x = x
      this.pos.z = ROAD_Z
      g = groundAt(x, ROAD_Z)
      if (g === null) {
        this.pos.x = -400
        g = groundAt(-400, ROAD_Z) ?? 3.4
      }
    }
    this.pos.y = g + 1.7
  }

  flyTo(id: string, instant = false) {
    const v = VIEWPOINTS.find((q) => q.id === id)
    if (!v) return
    const p1 = new THREE.Vector3(...v.pos)
    if (v.mode === 'walk') p1.y = (groundAt(p1.x, p1.z) ?? roadY(p1.x)) + 1.7
    let yawTarget = v.yaw
    // shortest rotation
    while (yawTarget - this.yaw > Math.PI) yawTarget -= Math.PI * 2
    while (yawTarget - this.yaw < -Math.PI) yawTarget += Math.PI * 2
    if (instant) {
      this.pos.copy(p1)
      this.yaw = v.yaw
      this.pitch = v.pitch
      this.mode = v.mode
      this.tween = null
      this.vel.set(0, 0, 0)
      this.ev.onArrive?.(id)
      this.emitState(true)
      return
    }
    const dist = this.pos.distanceTo(p1)
    this.tween = {
      t: 0,
      dur: clamp(1.6 + dist / 260, 1.8, 4.5),
      p0: this.pos.clone(),
      p1,
      y0: this.yaw,
      y1: yawTarget,
      pi0: this.pitch,
      pi1: v.pitch,
      view: id,
      mode: v.mode,
    }
    if (this.mode === 'cinema') this.mode = v.mode
  }

  teleportX(x: number) {
    // from the position strip: stay in the current mode if possible
    const cx = clamp(x, ROAD_X0 + 30, ROAD_X1 - 30)
    if (this.mode === 'walk') {
      const g = groundAt(cx, ROAD_Z) ?? roadY(cx)
      this.tween = {
        t: 0, dur: 1.8, p0: this.pos.clone(), p1: new THREE.Vector3(cx, g + 1.7, ROAD_Z), y0: this.yaw, y1: this.yaw, pi0: this.pitch, pi1: this.pitch, view: '', mode: 'walk',
      }
    } else {
      const y = Math.max(this.pos.y, 8)
      this.tween = {
        t: 0, dur: 1.8, p0: this.pos.clone(), p1: new THREE.Vector3(cx, y, clamp(this.pos.z, -300, 400)), y0: this.yaw, y1: this.yaw, pi0: this.pitch, pi1: this.pitch, view: '', mode: this.mode,
      }
    }
  }

  getState(): ExplorerState {
    const p = this.pos
    return {
      x: p.x,
      y: p.y,
      z: p.z,
      yaw: this.yaw,
      mode: this.mode,
      gates: this.closing,
      onDeck: p.x > 0 && p.x < BARRIER_X1 && Math.abs(p.z - ROAD_Z) < 8 && p.y > 12,
      storm: this.storm,
      time: this.time,
    }
  }

  requestPointerLock() {
    this.renderer.domElement.requestPointerLock?.()
  }

  /* ------------------------------------------------------------------ input */
  private onKeyDown = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement)?.tagName === 'INPUT') return
    const k = e.key.toLowerCase()
    this.keys.add(k)
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault()
    if (this.mode === 'cinema' && ['w', 'a', 's', 'd', 'arrowup'].includes(k)) this.beginExplore()
  }
  private onKeyUp = (e: KeyboardEvent) => this.keys.delete(e.key.toLowerCase())
  private onBlur = () => this.keys.clear()

  beginExplore() {
    if (this.mode !== 'cinema') return
    this.flyTo('neeltje')
  }

  private bindInput(el: HTMLElement) {
    el.addEventListener('pointerdown', (e) => {
      this.dragging = true
      this.lastPt = { x: e.clientX, y: e.clientY }
      el.setPointerCapture(e.pointerId)
    })
    el.addEventListener('pointermove', (e) => {
      if (document.pointerLockElement === el) {
        this.look(e.movementX, e.movementY)
        return
      }
      if (!this.dragging || this.mode === 'cinema' || this.tween) return
      this.look(e.clientX - this.lastPt.x, e.clientY - this.lastPt.y)
      this.lastPt = { x: e.clientX, y: e.clientY }
    })
    const up = (e: PointerEvent) => {
      this.dragging = false
      try {
        el.releasePointerCapture(e.pointerId)
      } catch {
        /* noop */
      }
    }
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
    el.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault()
        this.fovTarget = clamp(this.fovTarget + e.deltaY * 0.03, 26, 80)
      },
      { passive: false },
    )
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    window.addEventListener('blur', this.onBlur)
  }

  private look(dx: number, dy: number) {
    const s = 0.0028 * (this.fov / 62)
    this.yaw += dx * s
    this.pitch = clamp(this.pitch - dy * s, -1.5, 1.5)
  }

  /* ------------------------------------------------------------------ update */
  private computeEnv() {
    return blendEnv(this.todFrom, this.todTo, ease(this.todK), this.storm, this.envNow)
  }

  private flyBlocked(x: number, y: number, z: number): boolean {
    const i = Math.round(x / PITCH)
    if (i >= 0 && i < N_PIERS) {
      const dx = Math.abs(x - i * PITCH)
      if (dx < PIER_HALF_X + 0.7 && z > PIER_Z0 - 0.7 && z < PIER_Z1 + 0.7 && y < DECK_Y + 0.4) return true
      if (dx < 5.9 && z > 2.2 && z < 13.4 && y > DECK_Y && y < 32) return true
      if (dx > 0.6 && dx < 2.4 && z > 6.5 && z < 8.5 && y >= 32 && y < 46) return true
    }
    if (x > -3 && x < BARRIER_X1 + 3 && z > -11.3 && z < 3.3 && y > 10.2 && y < 16.5) return true
    // gates
    const k = Math.floor(x / PITCH)
    if (k >= 0 && k < N_PIERS - 1 && z > 2.6 && z < 7.6) {
      const b = this.rig.gateBottom(k)
      if (y > b - 0.6 && y < b + GATE_H + 0.6) return true
    }
    return false
  }

  private updateCamera(dt: number) {
    const cam = this.camera
    // zoom smoothing
    this.fov += (this.fovTarget - this.fov) * (1 - Math.exp(-8 * dt))
    if (Math.abs(cam.fov - this.fov) > 0.01) {
      cam.fov = this.fov
      cam.updateProjectionMatrix()
    }

    if (this.tween) {
      const tw = this.tween
      tw.t += dt
      const k = ease(clamp(tw.t / tw.dur))
      this.pos.lerpVectors(tw.p0, tw.p1, k)
      // arc up a little during long transitions
      this.pos.y += Math.sin(k * Math.PI) * Math.min(25, tw.p0.distanceTo(tw.p1) * 0.08)
      this.yaw = tw.y0 + (tw.y1 - tw.y0) * k
      this.pitch = tw.pi0 + (tw.pi1 - tw.pi0) * k
      if (tw.t >= tw.dur) {
        this.mode = tw.mode
        this.tween = null
        this.vel.set(0, 0, 0)
        if (tw.view) this.ev.onArrive?.(tw.view)
        this.emitState(true)
      }
    } else if (this.mode === 'cinema') {
      this.lookTarget += dt
      const a = 1.28 + Math.sin(this.lookTarget * 0.045) * 0.7
      const R = 360
      this.pos.set(300 + Math.cos(a) * R * 0.25 - 80 + this.lookTarget * 0, 62 + Math.sin(this.lookTarget * 0.07) * 8, 140 + Math.sin(a) * R * 0.55)
      this.pos.x = 120 + Math.sin(this.lookTarget * 0.04) * 330
      const dx = 380 - this.pos.x
      const dz = 0 - this.pos.z
      this.yaw = Math.atan2(dx, -dz)
      this.pitch = -0.19
    } else {
      this.moveFree(dt)
    }
    cam.position.copy(this.pos)
    cam.rotation.set(this.pitch, -this.yaw, 0, 'YXZ')
  }

  private moveFree(dt: number) {
    const k = this.keys
    let f = (k.has('w') || k.has('arrowup') ? 1 : 0) - (k.has('s') || k.has('arrowdown') ? 1 : 0) + -this.joy.y
    let r = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0) + this.joy.x
    if (k.has('arrowleft') && !k.has('a')) this.yaw -= dt * 1.4
    if (k.has('arrowright') && !k.has('d')) this.yaw += dt * 1.4
    if (k.has('arrowleft') || k.has('arrowright')) r = (k.has('d') ? 1 : 0) - (k.has('a') ? 1 : 0) + this.joy.x
    f = clamp(f, -1, 1)
    r = clamp(r, -1, 1)
    const sprint = k.has('shift')
    const sy = Math.sin(this.yaw)
    const cy = Math.cos(this.yaw)
    if (this.mode === 'walk') {
      const sp = sprint ? 9 : 3.6
      const tx = (sy * f + cy * r) * sp
      const tz = (-cy * f + sy * r) * sp
      const a = 1 - Math.exp(-9 * dt)
      this.vel.x += (tx - this.vel.x) * a
      this.vel.z += (tz - this.vel.z) * a
      const nx = this.pos.x + this.vel.x * dt
      const nz = this.pos.z + this.vel.z * dt
      const okX = groundAt(nx, this.pos.z) !== null && !blockedWalk(nx, this.pos.z)
      if (okX) this.pos.x = nx
      else this.vel.x = 0
      const okZ = groundAt(this.pos.x, nz) !== null && !blockedWalk(this.pos.x, nz)
      if (okZ) this.pos.z = nz
      else this.vel.z = 0
      const g = groundAt(this.pos.x, this.pos.z) ?? 0
      const speed = Math.hypot(this.vel.x, this.vel.z)
      this.bob += speed * dt * (sprint ? 1.25 : 1.6)
      const bobY = Math.sin(this.bob) * 0.028 * Math.min(1, speed / 3)
      this.pos.y += (g + 1.7 + bobY - this.pos.y) * (1 - Math.exp(-14 * dt))
    } else {
      const sp = sprint ? 90 : 16
      const cp = Math.cos(this.pitch)
      const fwd = new THREE.Vector3(sy * cp, Math.sin(this.pitch), -cy * cp)
      const right = new THREE.Vector3(cy, 0, sy)
      const up = (k.has(' ') || k.has('e') ? 1 : 0) - (k.has('c') || k.has('q') ? 1 : 0)
      const target = fwd.multiplyScalar(f * sp).add(right.multiplyScalar(r * sp)).add(new THREE.Vector3(0, up * sp * 0.7, 0))
      this.vel.lerp(target, 1 - Math.exp(-5 * dt))
      const p = this.pos
      const nx = p.x + this.vel.x * dt
      const ny = p.y + this.vel.y * dt
      const nz = p.z + this.vel.z * dt
      if (!this.flyBlocked(nx, p.y, p.z)) p.x = clamp(nx, -735, 1735)
      else this.vel.x = 0
      if (!this.flyBlocked(p.x, p.y, nz)) p.z = clamp(nz, -520, 1000)
      else this.vel.z = 0
      if (!this.flyBlocked(p.x, ny, p.z)) p.y = ny
      else this.vel.y = 0
      const floor = Math.max(terrainH(p.x, p.z), this.atmos.current.seaLevel, 0) + 1.1
      const gr = Math.abs(p.z - ROAD_Z) < 8 && (p.x < 0 || p.x > BARRIER_X1) && p.x > ROAD_X0 && p.x < ROAD_X1 ? roadY(p.x) + 1.1 : 0
      p.y = clamp(p.y, Math.max(floor, gr), 420)
    }
  }

  private updateEnv(dt: number) {
    if (this.todK < 1) this.todK = Math.min(1, this.todK + dt / 3.2)
    if (this.storm !== this.stormTarget) {
      const d = this.stormTarget - this.storm
      this.storm += Math.sign(d) * Math.min(Math.abs(d), dt / 9)
    }
    if (this.closing !== this.closeTarget) {
      const d = this.closeTarget - this.closing
      this.closing += Math.sign(d) * Math.min(Math.abs(d), dt / 16)
      this.rig.setClosing(this.closing)
    }
    const moving = this.closing > 0.001 && this.closing < 0.999 ? 1 : 0
    this.audio.setRumble(moving)
    const env = this.computeEnv()
    this.atmos.apply(env, this.t)
    const night = env.night
    this.audio.setStorm(this.storm)
    // lamps & beacons
    const nl = smoothstep(0.2, 0.55, night)
    ;(this.glowLamps.material as THREE.PointsMaterial).opacity = nl
    ;(this.mats.lampGlow as THREE.MeshBasicMaterial).color.setRGB(1.0, 0.8, 0.5).multiplyScalar(0.12 + nl * 5)
    const blink = Math.sin(this.t * 4.2) > 0.55 ? 1 : 0.12
    ;(this.glowBeacons.material as THREE.PointsMaterial).opacity = (0.35 + 0.65 * nl) * blink
    ;(this.mats.redLight as THREE.MeshBasicMaterial).color.setRGB(1.0, 0.1, 0.05).multiplyScalar(0.3 + blink * (0.6 + nl * 6))
    this.cars.setNight(nl)
    // foam tint follows ambient light
    const lum = 0.55 + 0.55 * env.sunInt * Math.max(0, this.atmos.sunDir.y) * 0.25 + env.hemiInt * 0.5
    foamUniforms.uFoamColor.value.copy(env.hemiSky).lerp(new THREE.Color('#ffffff'), 0.6).multiplyScalar(lum * (1 - night * 0.85))
    foamUniforms.uFoam.value = env.foam
    this.bloom.strength = env.bloom * 0.7
    this.bloom.threshold = 0.9 - night * 0.2
    U.uWaterY.value = env.seaLevel
    U.uNight.value = night
    this.collars.position.y = env.seaLevel
    for (const f of this.foams) f.position.y = env.seaLevel
    const wu = this.atmos.water.material.uniforms
    wu.time.value += dt * (0.6 + this.storm * 0.9)
  }

  private lightFollow() {
    const fwd = new THREE.Vector3()
    this.camera.getWorldDirection(fwd)
    const target = this.camera.position.clone().addScaledVector(fwd, 50)
    target.y = Math.min(target.y, this.camera.position.y)
    target.set(Math.round(target.x * 2) / 2, Math.round(target.y * 2) / 2, Math.round(target.z * 2) / 2)
    this.atmos.sun.target.position.copy(target)
    this.atmos.sun.position.copy(target).addScaledVector(this.atmos.sunDir, 700)
    this.atmos.sun.target.updateMatrixWorld()
  }

  private updateHotspots() {
    const w = this.container.clientWidth
    const h = this.container.clientHeight
    const v = new THREE.Vector3()
    for (const [id, el] of this.hotEls) {
      const p = this.hotPos.get(id)
      if (!p) continue
      v.copy(p).project(this.camera)
      const d = this.camera.position.distanceTo(p)
      const vis = v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05 && d > 6 && d < 420 && this.mode !== 'cinema' && !this.tween
      if (!vis) {
        if (el.dataset.v !== '0') {
          el.style.opacity = '0'
          el.style.pointerEvents = 'none'
          el.dataset.v = '0'
        }
        continue
      }
      el.dataset.v = '1'
      el.style.pointerEvents = 'auto'
      el.style.opacity = String(clamp(1.2 - d / 380, 0.3, 1))
      el.style.transform = `translate3d(${((v.x * 0.5 + 0.5) * w).toFixed(1)}px, ${((-v.y * 0.5 + 0.5) * h).toFixed(1)}px, 0) translate(-50%, -50%)`
    }
  }

  private emitState(force = false) {
    const now = performance.now()
    if (!force && now - this.lastState < 100) return
    this.lastState = now
    this.ev.onState?.(this.getState())
  }

  private loop = () => {
    if (this.disposed) return
    if (!(window as any).__manual) this.raf = requestAnimationFrame(this.loop)
    if (!this.ready) return
    this.frame(Math.min(this.clock.getDelta(), 0.05))
  }

  /** advance the simulation by dt and render one frame (also used by automated visual tests) */
  frame(dt: number) {
    this.t += dt
    U.uTime.value = this.t
    this.updateEnv(dt)
    this.updateCamera(dt)
    this.atmos.follow(this.camera)
    this.lightFollow()

    // life
    this.cars.update(this.t, dt)
    this.gulls.update(this.t)
    this.ships.update(this.t)
    const wind = 0.4 + this.storm * 1.0
    for (const tb of this.island.turbines) {
      tb.rotor.rotation.z = this.t * (0.7 + this.storm * 0.9) + tb.phase
      tb.group.rotation.y = 0.15 * Math.sin(this.t * 0.05 + tb.phase)
    }
    updateFlags(this.island.flags, this.t, wind)
    this.finish.uniforms.uTime.value = this.t % 100

    // audio levels
    const st = this.getState()
    this.audio.setWind(clamp(0.3 + (this.pos.y - 2) / 40, 0.2, 1))
    this.audio.setRoad(st.onDeck ? 1 : Math.abs(this.pos.z - ROAD_Z) < 20 && this.pos.y < 20 ? 0.4 : 0.1)

    this.updateHotspots()
    this.emitState()

    // adaptive resolution
    this.frameAcc += dt
    this.frameN++
    if (this.frameN >= 90) {
      const avg = this.frameAcc / this.frameN
      if (avg > 0.034 && this.pixelRatio > 0.7 && !this.lowFx) {
        this.setPixelRatio(Math.max(0.7, this.pixelRatio - 0.25))
      }
      this.frameAcc = 0
      this.frameN = 0
    }

    this.composer.render()
  }

  /* ------------------------------------------------------------------ misc */
  private resize() {
    const w = this.container.clientWidth || 800
    const h = this.container.clientHeight || 600
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.composer?.setPixelRatio(this.pixelRatio)
    this.composer?.setSize(w, h)
  }

  render() {
    this.composer.render()
  }

  dispose() {
    this.disposed = true
    cancelAnimationFrame(this.raf)
    this.ro.disconnect()
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    window.removeEventListener('blur', this.onBlur)
    this.audio.dispose()
    this.atmos?.dispose()
    this.composer?.dispose()
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }
}

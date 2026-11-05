import * as THREE from 'three'
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { initMaterials } from './materials'
import { buildWorld, World, Hotspot } from './world'
import { CanalWater } from './Water'
import { waterNormalTex, windU, clamp } from './gfx'
import { bridgeY, heightAt, groundY, TERRAIN_X, WATER_Y } from './canal'
import { Ambience } from './audio'
import { FLOOR1_Y, INT_ORIGIN, Interior, buildInterior } from './interior'

import skyDay from '../assets/sky/day.hdr?url'
import skyGolden from '../assets/sky/golden.hdr?url'
import skyOvercast from '../assets/sky/overcast.hdr?url'

export type TimeId = 'day' | 'golden' | 'overcast'
export type Quality = 'low' | 'medium' | 'high'
export type CamMode = 'walk' | 'fly'

export interface ExpEvents {
  onProgress?: (p: number, label: string) => void
  onPlayer?: (x: number, z: number, yaw: number, pitch: number, mode: CamMode) => void
  onNear?: (id: string | null) => void
  onOpen?: (id: string) => void
  onLock?: (locked: boolean) => void
  onZone?: (inside: boolean) => void
}

interface Preset {
  url: string
  /** desired world azimuth of the sun (radians, atan2(z,x)) */
  sunAz: number
  sunInt: number
  sunColor: string
  env: number
  bg: number
  exposure: number
  fog: number
  bloom: number
  water: string
  shadowSoft: number
}
const PRESETS: Record<TimeId, Preset> = {
  day: { url: skyDay, sunAz: 1.15, sunInt: 3.0, sunColor: '#fff3e1', env: 0.95, bg: 1.0, exposure: 0.74, fog: 0.00105, bloom: 0.1, water: '#16261a', shadowSoft: 1 },
  golden: { url: skyGolden, sunAz: 0.85, sunInt: 3.6, sunColor: '#ffbf85', env: 0.95, bg: 1.0, exposure: 0.9, fog: 0.0014, bloom: 0.2, water: '#16221a', shadowSoft: 1.3 },
  overcast: { url: skyOvercast, sunAz: 1.15, sunInt: 0.0, sunColor: '#e8eef5', env: 1.45, bg: 1.0, exposure: 0.9, fog: 0.0019, bloom: 0.06, water: '#17261e', shadowSoft: 1 },
}

const FinishShader = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uVig: { value: 0.28 }, uGrain: { value: 0.03 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uVig; uniform float uGrain; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){
      vec2 uv = vUv;
      vec3 c = texture2D(tDiffuse, uv).rgb;
      // gentle filmic contrast + saturation
      c = mix(vec3(dot(c, vec3(0.299,0.587,0.114))), c, 1.08);
      c = c * c * (3.0 - 2.0 * c) * 0.35 + c * 0.65;
      vec2 q = uv - 0.5; q.x *= 1.15;
      float v = smoothstep(0.85, 0.2, length(q));
      c *= mix(1.0 - uVig, 1.0, v);
      c += (h(uv * 1000.0 + uTime) - 0.5) * uGrain;
      gl_FragColor = vec4(c, 1.0);
    }`,
}

export class Experience {
  renderer: THREE.WebGLRenderer
  scene = new THREE.Scene()
  camera: THREE.PerspectiveCamera
  private container: HTMLElement
  private ev: ExpEvents
  private composer: EffectComposer | null = null
  private bloom!: UnrealBloomPass
  private finish!: ShaderPass
  private pmrem: THREE.PMREMGenerator
  private sun: THREE.DirectionalLight
  private sunDir = new THREE.Vector3(0.5, 0.7, 0.3)
  private world!: World
  private water!: CanalWater
  private skies = new Map<TimeId, { bg: THREE.DataTexture; env: THREE.Texture; sunEl: number; sunAzRaw: number; horizon: THREE.Color; zenith: THREE.Color }>()
  private timeId: TimeId = 'day'
  private clock = new THREE.Clock()
  private raf = 0
  private disposed = false
  private ro: ResizeObserver
  private labelRoot: HTMLDivElement
  private markers: { h: Hotspot; el: HTMLButtonElement }[] = []
  private audio = new Ambience()
  private t = 0
  private accPos = 0
  private nearId: string | null = null
  private farGround!: THREE.Mesh
  private interior: Interior | null = null
  inside = false
  floor = 0
  private floorY = 0

  // state
  quality: Quality = 'high'
  mode: CamMode = 'walk'
  wind = 0.45
  sailsOn = true
  fov = 68
  x = 0
  z = 0
  private y = 1.7
  yaw = 0
  pitch = 0
  private vx = 0
  private vz = 0
  private bob = 0
  private keys: Record<string, boolean> = {}
  private joy = { x: 0, y: 0 }
  private locked = false
  private drag = { on: false, x: 0, y: 0, moved: 0, id: -1 }
  private flyY = 12
  private shadowSize = 4096
  private shadowExtent = 120
  active = false
  paused = false

  constructor(container: HTMLElement, ev: ExpEvents = {}) {
    this.container = container
    this.ev = ev
    const w = container.clientWidth || 1
    const h = container.clientHeight || 1
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: false })
    this.renderer.setSize(w, h)
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 0.85
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    const cv = this.renderer.domElement
    cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;outline:none;touch-action:none'
    cv.tabIndex = 0
    container.appendChild(cv)

    this.camera = new THREE.PerspectiveCamera(this.fov, w / h, 0.15, 6000)
    this.camera.rotation.order = 'YXZ'
    this.pmrem = new THREE.PMREMGenerator(this.renderer)

    this.sun = new THREE.DirectionalLight('#fff3e1', 3.4)
    this.sun.castShadow = true
    this.sun.shadow.bias = -0.00025
    this.sun.shadow.normalBias = 0.05
    this.sun.shadow.radius = 2.2
    this.sun.shadow.camera.near = 10
    this.sun.shadow.camera.far = 600
    this.scene.add(this.sun, this.sun.target)
    this.scene.fog = new THREE.FogExp2('#b9c9d8', 0.00105)

    this.labelRoot = document.createElement('div')
    this.labelRoot.style.cssText = 'position:absolute;inset:0;overflow:hidden;pointer-events:none'
    container.appendChild(this.labelRoot)

    this.bindInput()
    this.ro = new ResizeObserver(() => this.resize())
    this.ro.observe(container)
  }

  /* --------------------------------------------------------------- loading */
  async load() {
    const p = (v: number, label: string) => this.ev.onProgress?.(v, label)
    p(0.01, 'Loading photographic textures')
    await initMaterials(Math.min(16, this.renderer.capabilities.getMaxAnisotropy()), (k) => p(0.01 + k * 0.06, 'Loading photographic textures'))
    p(0.08, 'Loading skies')
    const loader = new RGBELoader().setDataType(THREE.FloatType)
    let n = 0
    for (const id of ['day', 'golden', 'overcast'] as TimeId[]) {
      const tex = await loader.loadAsync(PRESETS[id].url)
      this.skies.set(id, this.processSky(tex))
      p(0.08 + (++n / 3) * 0.1, 'Loading skies')
    }
    const world = await buildWorld((v, l) => p(0.18 + v * 0.78, l))
    this.world = world
    this.scene.add(world.group)

    // far ground to the horizon
    const fg = new THREE.Mesh(new THREE.PlaneGeometry(60000, 60000), new THREE.MeshStandardMaterial({ color: '#566a35', roughness: 1 }))
    fg.rotation.x = -Math.PI / 2
    fg.position.y = -1.6
    this.farGround = fg
    this.scene.add(fg)

    const wn = waterNormalTex(256)
    this.water = new CanalWater(world.waterGeo, wn, 1024, WATER_Y)
    this.water.frustumCulled = false
    this.water.onReflect = (on) => {
      world.grass.group.visible = !on
    }
    this.scene.add(this.water)

    this.interior = buildInterior()
    this.scene.add(this.interior.group)
    world.hotspots.push(...this.interior.hotspots)

    this.setupComposer()
    this.setTime('day')
    this.setQuality('high')
    this.teleport(world.spawn.x, world.spawn.z, world.spawn.yaw, 0)
    this.createMarkers()
    p(1, 'Ready')
  }

  private processSky(tex: THREE.DataTexture) {
    const W = tex.image.width
    const H = tex.image.height
    const data = tex.image.data as unknown as Float32Array
    // brightest region -> sun direction
    let best = 0
    for (let i = 0; i < W * H; i++) {
      const l = data[i * 4] + data[i * 4 + 1] + data[i * 4 + 2]
      if (l > best) best = l
    }
    let sx = 0
    let sy = 0
    let sw = 0
    for (let i = 0; i < W * H; i++) {
      const l = data[i * 4] + data[i * 4 + 1] + data[i * 4 + 2]
      if (l > best * 0.6) {
        sx += (i % W) * l
        sy += Math.floor(i / W) * l
        sw += l
      }
    }
    const col = sx / sw
    const row = sy / sw
    const u = (col + 0.5) / W
    const v = 1 - (row + 0.5) / H
    const az = (u - 0.5) * 2 * Math.PI
    const el = (v - 0.5) * Math.PI
    // horizon + zenith average colours
    const hor = new THREE.Color(0, 0, 0)
    const zen = new THREE.Color(0, 0, 0)
    let hn = 0
    let zn = 0
    for (let rr = 0; rr < H; rr++) {
      const e = (1 - (rr + 0.5) / H - 0.5) * Math.PI
      const isH = e > 0.0 && e < 0.1
      const isZ = e > 0.9
      if (!isH && !isZ) continue
      for (let cc = 0; cc < W; cc++) {
        const i = (rr * W + cc) * 4
        const r = Math.min(data[i], 3)
        const g = Math.min(data[i + 1], 3)
        const b = Math.min(data[i + 2], 3)
        if (isH) {
          hor.r += r
          hor.g += g
          hor.b += b
          hn++
        } else {
          zen.r += r
          zen.g += g
          zen.b += b
          zn++
        }
      }
    }
    hor.multiplyScalar(1 / Math.max(1, hn))
    zen.multiplyScalar(1 / Math.max(1, zn))
    // environment copy with the sun disc clamped (the directional light supplies the sun)
    const copy = new Float32Array(data.length)
    for (let i = 0; i < data.length; i++) copy[i] = Math.min(data[i], 6)
    const envSrc = new THREE.DataTexture(copy, W, H, THREE.RGBAFormat, THREE.FloatType)
    envSrc.mapping = THREE.EquirectangularReflectionMapping
    envSrc.minFilter = THREE.LinearFilter
    envSrc.magFilter = THREE.LinearFilter
    envSrc.flipY = true
    envSrc.generateMipmaps = false
    envSrc.needsUpdate = true
    const envRT = this.pmrem.fromEquirectangular(envSrc)
    envSrc.dispose()
    tex.mapping = THREE.EquirectangularReflectionMapping
    tex.minFilter = THREE.LinearFilter
    tex.magFilter = THREE.LinearFilter
    tex.needsUpdate = true
    return { bg: tex, env: envRT.texture, sunEl: el, sunAzRaw: az, horizon: hor, zenith: zen }
  }

  private setupComposer() {
    const w = this.container.clientWidth || 1
    const h = this.container.clientHeight || 1
    const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 4 })
    this.composer = new EffectComposer(this.renderer, rt)
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.12, 0.7, 1.0)
    this.composer.addPass(this.bloom)
    this.composer.addPass(new OutputPass())
    this.finish = new ShaderPass(FinishShader)
    this.composer.addPass(this.finish)
  }

  /* --------------------------------------------------------- environment */
  setTime(id: TimeId) {
    this.timeId = id
    const pr = PRESETS[id]
    const sky = this.skies.get(id)!
    const rotY = sky.sunAzRaw - pr.sunAz
    // rotate sky so the sun sits at the desired azimuth
    this.scene.background = sky.bg
    this.scene.environment = sky.env
    this.scene.backgroundRotation.set(0, rotY, 0)
    this.scene.environmentRotation.set(0, rotY, 0)
    this.scene.backgroundIntensity = pr.bg
    this.scene.environmentIntensity = pr.env
    const el = sky.sunEl
    this.sunDir.set(Math.cos(el) * Math.cos(pr.sunAz), Math.sin(el), Math.cos(el) * Math.sin(pr.sunAz)).normalize()
    this.sun.color.set(pr.sunColor)
    this.sun.intensity = pr.sunInt
    this.sun.castShadow = pr.sunInt > 0.05
    this.renderer.toneMappingExposure = pr.exposure
    const fog = this.scene.fog as THREE.FogExp2
    const hz = sky.horizon.clone().multiplyScalar(pr.bg)
    fog.color.copy(hz)
    fog.density = pr.fog
    this.farGround.material = this.farGround.material as THREE.Material
    ;(this.farGround.material as THREE.MeshStandardMaterial).color.set(id === 'golden' ? '#4a5430' : '#566a35')
    if (this.water) {
      const u = this.water.u
      u.sunDirection.value.copy(this.sunDir)
      u.sunColor.value.set(pr.sunColor).multiplyScalar(pr.sunInt > 0.05 ? 1 : 0)
      u.waterColor.value.set(pr.water)
      u.skyColor.value.copy(sky.zenith.clone().lerp(sky.horizon, 0.5)).multiplyScalar(pr.bg)
    }
    this.bloom.strength = pr.bloom
  }
  getTime() {
    return this.timeId
  }

  setQuality(q: Quality) {
    this.quality = q
    const dpr = window.devicePixelRatio || 1
    const pr = q === 'low' ? 1 : q === 'medium' ? Math.min(dpr, 1.5) : Math.min(dpr, 2)
    this.renderer.setPixelRatio(pr)
    this.shadowSize = q === 'high' ? 4096 : 2048
    this.sun.shadow.mapSize.set(this.shadowSize, this.shadowSize)
    this.sun.shadow.map?.dispose()
    ;(this.sun.shadow as any).map = null
    this.shadowExtent = q === 'low' ? 80 : 120
    const e = this.shadowExtent
    const c = this.sun.shadow.camera
    c.left = -e
    c.right = e
    c.top = e
    c.bottom = -e
    c.updateProjectionMatrix()
    if (this.water) {
      const s = q === 'low' ? 384 : q === 'medium' ? 640 : 1024
      this.water.rt.setSize(s, s)
      this.water.setMirror(true)
    }
    this.world?.grass.setDensity(q === 'low' ? 0.45 : q === 'medium' ? 0.75 : 1)
    this.grassRange = q === 'low' ? 55 : q === 'medium' ? 80 : 100
    this.resize()
  }
  private grassRange = 100

  setWind(w: number) {
    this.wind = w
    windU.uWind.value = w
    this.audio.setWind(w)
  }
  setSails(on: boolean) {
    this.sailsOn = on
  }
  setFov(f: number) {
    this.fov = f
    this.camera.fov = f
    this.camera.updateProjectionMatrix()
  }
  setSound(on: boolean) {
    if (on) this.audio.start()
    this.audio.setOn(on)
  }
  startAudio() {
    this.audio.start()
  }

  private resize() {
    const w = this.container.clientWidth || 1
    const h = this.container.clientHeight || 1
    this.renderer.setSize(w, h)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    const pr = this.renderer.getPixelRatio()
    this.composer?.setPixelRatio(pr)
    this.composer?.setSize(w, h)
  }

  /* ----------------------------------------------------------------- input */
  private bindInput() {
    const cv = this.renderer.domElement
    const kd = (e: KeyboardEvent) => {
      if (!this.active) return
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return
      this.keys[e.code] = true
      if (e.code === 'KeyE' && this.nearId) this.activate(this.nearId)
      if (e.code === 'KeyF') this.setMode(this.mode === 'walk' ? 'fly' : 'walk')
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault()
    }
    const ku = (e: KeyboardEvent) => {
      this.keys[e.code] = false
    }
    window.addEventListener('keydown', kd)
    window.addEventListener('keyup', ku)
    window.addEventListener('blur', () => (this.keys = {}))
    cv.addEventListener('pointerdown', (e) => {
      if (!this.active || e.pointerType === 'touch') return
      this.drag = { on: true, x: e.clientX, y: e.clientY, moved: 0, id: e.pointerId }
      cv.setPointerCapture(e.pointerId)
    })
    cv.addEventListener('pointermove', (e) => {
      if (!this.active || e.pointerType === 'touch') return
      if (this.locked) {
        this.look(e.movementX, e.movementY)
      } else if (this.drag.on) {
        const dx = e.clientX - this.drag.x
        const dy = e.clientY - this.drag.y
        this.drag.x = e.clientX
        this.drag.y = e.clientY
        this.drag.moved += Math.abs(dx) + Math.abs(dy)
        this.look(dx, dy)
      }
    })
    cv.addEventListener('pointerup', (e) => {
      if (e.pointerType === 'touch') return
      const wasClick = this.drag.on && this.drag.moved < 4
      this.drag.on = false
      if (wasClick && this.active && !this.locked) cv.requestPointerLock?.()
    })
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === cv
      this.ev.onLock?.(this.locked)
    })
    cv.addEventListener(
      'wheel',
      (e) => {
        if (!this.active) return
        this.setFov(clamp(this.fov + e.deltaY * 0.02, 38, 90))
        e.preventDefault()
      },
      { passive: false },
    )
  }
  look(dx: number, dy: number, k = 0.0022) {
    this.yaw -= dx * k
    this.pitch = clamp(this.pitch - dy * k, -1.45, 1.45)
  }
  setJoystick(x: number, y: number) {
    this.joy.x = x
    this.joy.y = y
  }
  unlock() {
    if (document.pointerLockElement) document.exitPointerLock()
  }
  setMode(m: CamMode) {
    if (this.inside) return
    this.mode = m
    if (m === 'fly') this.flyY = Math.max(this.y, groundY(this.x, this.z) + 14)
    this.ev.onPlayer?.(this.x, this.z, this.yaw, this.pitch, this.mode)
  }

  teleport(x: number, z: number, yaw: number, pitch = 0, mode: CamMode = 'walk') {
    if (this.inside) this.setInsideVisuals(false)
    this.x = x
    this.z = z
    this.yaw = yaw
    this.pitch = pitch
    this.vx = this.vz = 0
    this.mode = mode
    this.y = groundY(x, z) + 1.68
    if (mode === 'fly') this.flyY = groundY(x, z) + 30
    this.applyCamera()
  }
  /** Nearest standable point to (x,z), used by the minimap. */
  safeSpot(x: number, z: number): [number, number] | null {
    const free = (px: number, pz: number) => !this.blocked(px, pz) && !this.world.colliders.some((c) => Math.hypot(px - c.x, pz - c.z) < c.r + 0.5)
    if (free(x, z)) return [x, z]
    for (let r = 1; r < 24; r += 1)
      for (let a = 0; a < 16; a++) {
        const px = x + Math.cos((a / 16) * Math.PI * 2) * r
        const pz = z + Math.sin((a / 16) * Math.PI * 2) * r
        if (free(px, pz)) return [px, pz]
      }
    return null
  }
  aerial(x: number, z: number, yaw: number) {
    this.teleport(x, z, yaw, -0.28, 'fly')
    this.flyY = groundY(x, z) + 34
    this.y = this.flyY
    this.applyCamera()
  }

  /* -------------------------------------------------------------- interior */
  activate(id: string) {
    const h = this.world.hotspots.find((x) => x.id === id)
    if (!h) return
    if (h.action === 'enter') this.enterMill()
    else if (h.action === 'exit') this.exitMill()
    else if (h.action === 'ladder') this.toggleFloor()
    else this.ev.onOpen?.(id)
  }
  private setInsideVisuals(on: boolean) {
    this.inside = on
    const it = this.interior!
    it.group.visible = on
    this.world.group.visible = !on
    this.water.visible = !on
    this.farGround.visible = !on
    this.sun.visible = !on
    if (on) {
      this.scene.background = new THREE.Color('#0d0b09')
      this.scene.environment = null
      ;(this.scene.fog as THREE.FogExp2).density = 0
      this.renderer.toneMappingExposure = 1.05
      this.bloom.strength = 0.22
    } else this.setTime(this.timeId)
    this.ev.onZone?.(on)
  }
  enterMill() {
    if (this.inside || !this.interior) return
    this.setInsideVisuals(true)
    const s = this.interior.spawn
    this.floor = 0
    this.floorY = 0
    this.x = s.x
    this.z = s.z
    this.yaw = s.yaw
    this.pitch = 0
    this.vx = this.vz = 0
    this.mode = 'walk'
    this.y = 1.68
    this.ev.onNear?.(null)
    this.nearId = null
  }
  exitMill() {
    if (!this.inside) return
    this.setInsideVisuals(false)
    const e = this.world.mill.exit
    this.x = e.x
    this.z = e.z
    this.yaw = e.yaw
    this.pitch = 0
    this.vx = this.vz = 0
    this.y = groundY(e.x, e.z) + 1.68
    this.nearId = null
  }
  toggleFloor() {
    const it = this.interior!
    if (this.floor === 0) {
      this.floor = 1
      this.floorY = FLOOR1_Y
      this.x = it.ladderUp.x
      this.z = it.ladderUp.z
    } else {
      this.floor = 0
      this.floorY = 0
      this.x = it.ladderDown.x
      this.z = it.ladderDown.z
    }
    this.vx = this.vz = 0
  }

  /* --------------------------------------------------------------- markers */
  private createMarkers() {
    for (const h of this.world.hotspots) {
      const el = document.createElement('button')
      el.className = 'kd-hot'
      el.innerHTML = `<span class="kd-hot-ring"></span><span class="kd-hot-dot">i</span><span class="kd-hot-label">${h.title}</span>`
      el.style.pointerEvents = 'auto'
      el.onclick = (e) => {
        e.stopPropagation()
        this.activate(h.id)
      }
      el.onpointerdown = (e) => e.stopPropagation()
      this.labelRoot.appendChild(el)
      this.markers.push({ h, el })
    }
  }
  setMarkersVisible(v: boolean) {
    this.labelRoot.style.display = v ? 'block' : 'none'
  }

  /* ---------------------------------------------------------------- physics */
  private blocked(x: number, z: number) {
    if (Math.abs(x) > 232) return true
    if (heightAt(x, z) < -0.14 && bridgeY(x, z) === null) return true
    return false
  }
  private push(x: number, z: number) {
    const R = 0.38
    for (const c of this.world.colliders) {
      const dx = x - c.x
      const dz = z - c.z
      const rr = c.r + R
      const d2 = dx * dx + dz * dz
      if (d2 < rr * rr) {
        const d = Math.sqrt(d2) || 0.001
        x = c.x + (dx / d) * rr
        z = c.z + (dz / d) * rr
      }
    }
    return [x, z] as const
  }

  private step(dt: number) {
    const k = this.keys
    // arrow keys look
    const turn = (k.ArrowLeft ? 1 : 0) - (k.ArrowRight ? 1 : 0)
    const tilt = (k.ArrowUp ? 1 : 0) - (k.ArrowDown ? 1 : 0)
    this.yaw += turn * dt * 1.7
    this.pitch = clamp(this.pitch + tilt * dt * 1.2, -1.45, 1.45)
    const f = (k.KeyW ? 1 : 0) - (k.KeyS ? 1 : 0) + this.joy.y
    const s = (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0) + this.joy.x
    const run = k.ShiftLeft || k.ShiftRight
    const fwd = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw))
    const right = new THREE.Vector3(-Math.cos(this.yaw), 0, Math.sin(this.yaw))
    if (this.inside && this.interior) {
      const it = this.interior
      const sp = run ? 3.6 : 1.9
      const tx = (fwd.x * f + right.x * s) * sp
      const tz = (fwd.z * f + right.z * s) * sp
      const a = 1 - Math.exp(-dt * 9)
      this.vx += (tx - this.vx) * a
      this.vz += (tz - this.vz) * a
      let nx = this.x + this.vx * dt
      let nz = this.z + this.vz * dt
      const R = 0.34
      for (const c of this.floor === 0 ? it.c0 : it.c1) {
        const dx = nx - c.x
        const dz = nz - c.z
        const rr = c.r + R
        const d2 = dx * dx + dz * dz
        if (d2 < rr * rr) {
          const d = Math.sqrt(d2) || 0.001
          nx = c.x + (dx / d) * rr
          nz = c.z + (dz / d) * rr
        }
      }
      const ox = nx - INT_ORIGIN.x
      const oz = nz - INT_ORIGIN.z
      const rad = Math.hypot(ox, oz)
      const lim = it.radius - R
      if (rad > lim) {
        nx = INT_ORIGIN.x + (ox / rad) * lim
        nz = INT_ORIGIN.z + (oz / rad) * lim
      }
      const moved = Math.hypot(nx - this.x, nz - this.z)
      this.x = nx
      this.z = nz
      this.bob += moved * 2.4
      const bobY = Math.sin(this.bob * 2.2) * 0.03 * Math.min(1, moved / dt / 1.5)
      this.y += (this.floorY + 1.66 + bobY - this.y) * (1 - Math.exp(-dt * 10))
    } else if (this.mode === 'walk') {
      const sp = run ? 6.0 : 2.9
      const tx = (fwd.x * f + right.x * s) * sp
      const tz = (fwd.z * f + right.z * s) * sp
      const len = Math.hypot(tx, tz)
      const cap = sp
      const mx = len > cap ? (tx / len) * cap : tx
      const mz = len > cap ? (tz / len) * cap : tz
      const a = 1 - Math.exp(-dt * 9)
      this.vx += (mx - this.vx) * a
      this.vz += (mz - this.vz) * a
      let nx = this.x + this.vx * dt
      let nz = this.z + this.vz * dt
      if (this.blocked(nx, nz)) {
        if (!this.blocked(nx, this.z)) nz = this.z
        else if (!this.blocked(this.x, nz)) nx = this.x
        else {
          nx = this.x
          nz = this.z
          this.vx = this.vz = 0
        }
      }
      ;[nx, nz] = this.push(nx, nz)
      if (this.blocked(nx, nz)) {
        nx = this.x
        nz = this.z
      }
      const moved = Math.hypot(nx - this.x, nz - this.z)
      this.x = nx
      this.z = nz
      this.bob += moved * (run ? 1.9 : 2.4)
      const ground = groundY(this.x, this.z)
      const bobY = Math.sin(this.bob * 2.2) * 0.035 * Math.min(1, moved / dt / 2)
      const ty = ground + 1.68 + bobY
      this.y += (ty - this.y) * (1 - Math.exp(-dt * 14))
    } else {
      const up = (k.KeyE ? 1 : 0) - (k.KeyQ ? 1 : 0) + (k.Space ? 1 : 0) - (k.ControlLeft ? 1 : 0)
      const sp = run ? 46 : 15
      const cp = Math.cos(this.pitch)
      const dir = new THREE.Vector3(fwd.x * cp, Math.sin(this.pitch), fwd.z * cp)
      const mv = dir.multiplyScalar(f).add(right.clone().multiplyScalar(s))
      const a = 1 - Math.exp(-dt * 5)
      this.vx += (mv.x * sp - this.vx) * a
      this.vz += (mv.z * sp - this.vz) * a
      this.flyY += (mv.y * sp + up * sp * 0.6) * dt
      this.x = clamp(this.x + this.vx * dt, -TERRAIN_X * 0.5, TERRAIN_X * 0.5)
      this.z = clamp(this.z + this.vz * dt, -600, 600)
      this.flyY = Math.max(this.flyY, groundY(this.x, this.z) + 1.6)
      this.y += (this.flyY - this.y) * (1 - Math.exp(-dt * 8))
    }
  }

  private applyCamera() {
    this.camera.position.set(this.x, this.y, this.z)
    this.camera.rotation.set(this.pitch, this.yaw + Math.PI, 0, 'YXZ')
  }

  private updateSun() {
    const e = this.shadowExtent
    const texel = (2 * e) / this.shadowSize
    // snap light target to shadow-texel grid to avoid shimmering
    const L = this.sunDir
    const up = new THREE.Vector3(0, 1, 0)
    const r = new THREE.Vector3().crossVectors(up, L).normalize()
    const u = new THREE.Vector3().crossVectors(L, r).normalize()
    const c = new THREE.Vector3(this.camera.position.x, 0, this.camera.position.z)
    c.addScaledVector(new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)), e * 0.35)
    const a = Math.round(c.dot(r) / texel) * texel
    const b = Math.round(c.dot(u) / texel) * texel
    const d = c.dot(L)
    const snapped = r.clone().multiplyScalar(a).addScaledVector(u, b).addScaledVector(L, d)
    this.sun.target.position.copy(snapped)
    this.sun.position.copy(snapped).addScaledVector(L, 300)
    this.sun.target.updateMatrixWorld()
  }

  private updateMarkers() {
    const v = new THREE.Vector3()
    const cam = this.camera
    const w = this.container.clientWidth
    const h = this.container.clientHeight
    const fwd = new THREE.Vector3()
    cam.getWorldDirection(fwd)
    let best: string | null = null
    let bestScore = 0
    for (const m of this.markers) {
      v.set(m.h.x, m.h.y, m.h.z)
      const dx = v.x - cam.position.x
      const dy = v.y - cam.position.y
      const dz = v.z - cam.position.z
      const dist = Math.hypot(dx, dy, dz)
      const facing = (dx * fwd.x + dy * fwd.y + dz * fwd.z) / (dist || 1)
      v.project(cam)
      const zoneOk = (m.h.zone === 'in') === this.inside
      const reachFar = this.inside ? 12 : 200
      const visible = zoneOk && v.z < 1 && facing > 0.05 && dist < reachFar && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1
      if (!visible) {
        m.el.style.opacity = '0'
        m.el.style.pointerEvents = 'none'
        continue
      }
      const sx = (v.x * 0.5 + 0.5) * w
      const sy = (-v.y * 0.5 + 0.5) * h
      const sc = clamp(1.25 - dist / 220, 0.55, 1.1)
      m.el.style.transform = `translate(${sx}px,${sy}px) translate(-50%,-50%) scale(${sc})`
      m.el.style.opacity = String(clamp(1.4 - dist / 150, 0.25, 1))
      m.el.style.pointerEvents = 'auto'
      if (dist < (m.h.reach ?? 24) && this.mode === 'walk' && facing > (this.inside ? 0.55 : 0.82) && facing > bestScore) {
        best = m.h.id
        bestScore = facing
      }
    }
    if (best !== this.nearId) {
      this.nearId = best
      this.ev.onNear?.(best)
    }
  }

  /* ------------------------------------------------------------------ loop */
  start() {
    this.clock.start()
    const loop = () => {
      if (this.disposed) return
      this.raf = requestAnimationFrame(loop)
      if (!this.paused) this.frame()
    }
    loop()
  }

  private frame() {
    const dt = Math.min(this.clock.getDelta(), 0.1)
    this.t += dt
    windU.uTime.value = this.t
    if (this.active) this.step(dt)
    else {
      // idle drift while on the start screen
      this.yaw += dt * 0.012
    }
    this.applyCamera()
    if (!this.inside) {
      this.world.update(this.t, dt, this.wind, this.sailsOn, this.x, this.z)
      this.world.grass.update(this.x, this.z, this.grassRange)
      this.water.u.time.value = this.t
      this.updateSun()
    }
    this.updateMarkers()
    this.audio.update(dt)
    this.accPos += dt
    if (this.accPos > 0.08) {
      this.accPos = 0
      this.ev.onPlayer?.(this.x, this.z, this.yaw, this.pitch, this.mode)
    }
    this.finish.uniforms.uTime.value = this.t % 10
    if (this.quality === 'low') {
      this.renderer.render(this.scene, this.camera)
    } else {
      this.composer!.render(dt)
    }
  }

  /** Render a frame and return it as a PNG data URL. */
  photo() {
    this.frame()
    return this.renderer.domElement.toDataURL('image/png')
  }

  getState() {
    return { x: this.x, z: this.z, yaw: this.yaw, pitch: this.pitch }
  }
  getHotspots() {
    return this.world.hotspots
  }
  getWorld() {
    return this.world
  }

  dispose() {
    this.disposed = true
    cancelAnimationFrame(this.raf)
    this.ro.disconnect()
    this.renderer.dispose()
    this.renderer.domElement.remove()
    this.labelRoot.remove()
  }
}

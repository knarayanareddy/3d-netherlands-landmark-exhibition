import * as THREE from 'three'
import { Sky } from 'three/examples/jsm/objects/Sky.js'
import { Water } from 'three/examples/jsm/objects/Water.js'
import { rng } from './noise'

export interface EnvParams {
  elev: number
  azim: number
  turbidity: number
  rayleigh: number
  mie: number
  mieG: number
  exposure: number
  sunInt: number
  sunColor: THREE.Color
  hemiInt: number
  hemiSky: THREE.Color
  hemiGround: THREE.Color
  fogColor: THREE.Color
  fogDensity: number
  cover: number
  dark: number
  haze: THREE.Color
  waterColor: THREE.Color
  distortion: number
  waveSize: number
  night: number
  envInt: number
  seaLevel: number
  foam: number
  bloom: number
}

type Raw = Omit<EnvParams, 'sunColor' | 'hemiSky' | 'hemiGround' | 'fogColor' | 'haze' | 'waterColor'> & {
  sunColor: string
  hemiSky: string
  hemiGround: string
  fogColor: string
  haze: string
  waterColor: string
}

const C = (s: string) => new THREE.Color(s)
const mk = (r: Raw): EnvParams => ({
  ...r,
  sunColor: C(r.sunColor),
  hemiSky: C(r.hemiSky),
  hemiGround: C(r.hemiGround),
  fogColor: C(r.fogColor),
  haze: C(r.haze),
  waterColor: C(r.waterColor),
})

export type TimeId = 'morning' | 'midday' | 'golden' | 'blue' | 'night'

export const PRESETS: Record<TimeId, EnvParams> = {
  morning: mk({
    elev: 13, azim: 52, turbidity: 3.2, rayleigh: 1.5, mie: 0.005, mieG: 0.8, exposure: 0.62, sunInt: 3.0, sunColor: '#ffe0bb',
    hemiInt: 0.45, hemiSky: '#a9c1db', hemiGround: '#756f60', fogColor: '#bccad3', fogDensity: 0.00042, cover: 0.42, dark: 0.04,
    haze: '#c8d3db', waterColor: '#2d5059', distortion: 3.4, waveSize: 1.5, night: 0, envInt: 0.9, seaLevel: 0, foam: 0.5, bloom: 0.25,
  }),
  midday: mk({
    elev: 46, azim: 28, turbidity: 2.4, rayleigh: 1.0, mie: 0.004, mieG: 0.8, exposure: 0.5, sunInt: 4.4, sunColor: '#fff3de',
    hemiInt: 0.55, hemiSky: '#a2c4ec', hemiGround: '#7a7563', fogColor: '#b9cfe5', fogDensity: 0.00036, cover: 0.4, dark: 0.0,
    haze: '#c3d6ea', waterColor: '#1c5463', distortion: 3.2, waveSize: 1.5, night: 0, envInt: 1.0, seaLevel: 0, foam: 0.45, bloom: 0.2,
  }),
  golden: mk({
    elev: 5, azim: 72, turbidity: 6, rayleigh: 2.0, mie: 0.01, mieG: 0.9, exposure: 0.6, sunInt: 3.6, sunColor: '#ffb06a',
    hemiInt: 0.38, hemiSky: '#8e9bbb', hemiGround: '#65524a', fogColor: '#d6b9a0', fogDensity: 0.0005, cover: 0.62, dark: 0.05,
    haze: '#e4bc94', waterColor: '#3a4c58', distortion: 3.0, waveSize: 1.9, night: 0, envInt: 0.9, seaLevel: 0, foam: 0.5, bloom: 0.45,
  }),
  blue: mk({
    elev: -3.2, azim: 82, turbidity: 3.4, rayleigh: 1.3, mie: 0.004, mieG: 0.9, exposure: 0.95, sunInt: 0.0, sunColor: '#8da6d8',
    hemiInt: 0.45, hemiSky: '#4a5f88', hemiGround: '#2c313c', fogColor: '#4d5f80', fogDensity: 0.00046, cover: 0.5, dark: 0.15,
    haze: '#62769b', waterColor: '#233a49', distortion: 2.6, waveSize: 1.9, night: 0.45, envInt: 1.0, seaLevel: 0, foam: 0.4, bloom: 0.6,
  }),
  night: mk({
    elev: -20, azim: 82, turbidity: 3, rayleigh: 1.0, mie: 0.003, mieG: 0.9, exposure: 1.1, sunInt: 0.0, sunColor: '#8da6d8',
    hemiInt: 0.3, hemiSky: '#22345a', hemiGround: '#10141c', fogColor: '#0d1524', fogDensity: 0.0004, cover: 0.35, dark: 0.55,
    haze: '#101a2c', waterColor: '#0a1a26', distortion: 2.2, waveSize: 1.9, night: 1, envInt: 1.4, seaLevel: 0, foam: 0.3, bloom: 0.85,
  }),
}

/** blend a time-of-day preset with a North Sea storm surge (s: 0..1) */
export function blendEnv(a: EnvParams, b: EnvParams, t: number, storm: number, out: EnvParams): EnvParams {
  const L = (x: number, y: number, k = t) => x + (y - x) * k
  const col = (o: THREE.Color, x: THREE.Color, y: THREE.Color) => o.copy(x).lerp(y, t)
  out.elev = L(a.elev, b.elev)
  out.azim = L(a.azim, b.azim)
  out.turbidity = L(a.turbidity, b.turbidity)
  out.rayleigh = L(a.rayleigh, b.rayleigh)
  out.mie = L(a.mie, b.mie)
  out.mieG = L(a.mieG, b.mieG)
  out.exposure = L(a.exposure, b.exposure)
  out.sunInt = L(a.sunInt, b.sunInt)
  col(out.sunColor, a.sunColor, b.sunColor)
  out.hemiInt = L(a.hemiInt, b.hemiInt)
  col(out.hemiSky, a.hemiSky, b.hemiSky)
  col(out.hemiGround, a.hemiGround, b.hemiGround)
  col(out.fogColor, a.fogColor, b.fogColor)
  out.fogDensity = L(a.fogDensity, b.fogDensity)
  out.cover = L(a.cover, b.cover)
  out.dark = L(a.dark, b.dark)
  col(out.haze, a.haze, b.haze)
  col(out.waterColor, a.waterColor, b.waterColor)
  out.distortion = L(a.distortion, b.distortion)
  out.waveSize = L(a.waveSize, b.waveSize)
  out.night = L(a.night, b.night)
  out.envInt = L(a.envInt, b.envInt)
  out.seaLevel = L(a.seaLevel, b.seaLevel)
  out.foam = L(a.foam, b.foam)
  out.bloom = L(a.bloom, b.bloom)
  if (storm > 0) {
    const s = storm
    const lum = 1 - out.night * 0.85
    const grey = new THREE.Color('#6d767b').multiplyScalar(lum)
    const greyHaze = new THREE.Color('#808a8f').multiplyScalar(lum)
    out.turbidity += (18 - out.turbidity) * s
    out.rayleigh += (0.5 - out.rayleigh) * s
    out.exposure *= 1 - 0.1 * s
    out.sunInt *= 1 - 0.78 * s
    out.hemiInt *= 1 - 0.1 * s
    out.hemiSky.lerp(grey, 0.6 * s)
    out.fogColor.lerp(grey, 0.85 * s)
    out.haze.lerp(greyHaze, 0.9 * s)
    out.fogDensity += 0.0009 * s
    out.cover += (0.97 - out.cover) * s
    out.dark = Math.max(out.dark, 0.9 * s)
    out.waterColor.lerp(new THREE.Color('#34454a').multiplyScalar(lum), 0.8 * s)
    out.distortion += 2.2 * s
    out.waveSize -= 0.7 * s
    out.seaLevel += 0.9 * s
    out.foam += 0.6 * s
    out.bloom *= 1 - 0.3 * s
  }
  return out
}

export const cloneEnv = (p: EnvParams): EnvParams => ({
  ...p,
  sunColor: p.sunColor.clone(),
  hemiSky: p.hemiSky.clone(),
  hemiGround: p.hemiGround.clone(),
  fogColor: p.fogColor.clone(),
  haze: p.haze.clone(),
  waterColor: p.waterColor.clone(),
})

/* ---------------------------------------------------------------- cloud dome */
const cloudVS = /* glsl */ `
varying vec3 vDir;
void main(){
  vDir = normalize(position);
  vec4 p = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * p;
  gl_Position.z = gl_Position.w;
}`
const cloudFS = /* glsl */ `
uniform float uTime; uniform vec3 uSunDir; uniform vec3 uSunColor; uniform vec3 uAmbient;
uniform float uCover; uniform float uDark; uniform vec3 uHaze; uniform float uNight; uniform float uStorm;
varying vec3 vDir;
float hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float a=0.5, s=0.0; for(int i=0;i<6;i++){ s+=a*noise(p); p=p*2.03+vec2(17.1,9.2); a*=0.5; } return s; }
float dens(vec2 uv){
  vec2 w = vec2(uTime*0.006, uTime*0.0025);
  float base = fbm(uv + w);
  float det = fbm(uv*3.3 - w*2.0 + base*0.6);
  float d = base*0.72 + det*0.28;
  float lo = 1.0 - uCover;
  return smoothstep(lo, lo + 0.26, d);
}
void main(){
  vec3 d = normalize(vDir);
  if (d.y <= 0.002) discard;
  vec2 uv = d.xz / (d.y + 0.14) * 0.85;
  float c = dens(uv);
  vec2 sdir = normalize(uSunDir.xz + vec2(1e-4));
  float c2 = dens(uv + sdir * 0.06);
  float c3 = dens(uv + sdir * 0.14);
  float shade = clamp(1.0 - (c2*0.6 + c3*0.4) * 0.9 + (1.0 - c) * 0.0, 0.0, 1.0);
  float sunAmt = max(uSunDir.y, 0.0);
  float forward = pow(max(dot(d, uSunDir), 0.0), 6.0);
  vec3 lit = uSunColor * (0.45 + 0.85 * shade) * (0.35 + 0.65*smoothstep(-0.02, 0.2, uSunDir.y));
  lit += uSunColor * forward * (1.0 - c*0.4) * 0.7;
  vec3 amb = uAmbient * 0.95;
  vec3 col = mix(amb, lit + amb*0.5, (1.0 - uDark) * (0.35 + 0.65*shade));
  col = mix(col, col*vec3(0.55,0.58,0.62), uDark*0.6);
  // dense cores darker, edges brighter (silver lining)
  col *= mix(1.0, 0.82, smoothstep(0.7, 1.0, c) * (1.0 - uDark*0.2));
  float a = c * smoothstep(0.0, 0.1, d.y);
  a *= mix(1.0, 0.97, uStorm);
  float hz = 1.0 - smoothstep(0.02, 0.3, d.y);
  col = mix(col, uHaze, hz * 0.85);
  gl_FragColor = vec4(col, a * (1.0 - uNight*0.15));
}`

export class Atmosphere {
  sky = new Sky()
  skyEnv = new Sky()
  skyScene = new THREE.Scene()
  clouds: THREE.Mesh
  stars: THREE.Points
  sun = new THREE.DirectionalLight('#ffffff', 3)
  moon = new THREE.DirectionalLight('#8fa8ff', 0)
  hemi = new THREE.HemisphereLight('#aaccff', '#776655', 0.5)
  fog = new THREE.FogExp2('#b9cfe5', 0.0004)
  water: Water
  sunDir = new THREE.Vector3()
  cloudMat: THREE.ShaderMaterial
  starMat: THREE.PointsMaterial
  pmrem: THREE.PMREMGenerator
  envRT: THREE.WebGLRenderTarget | null = null
  current: EnvParams
  private lastEnvBuild = -1

  constructor(private renderer: THREE.WebGLRenderer, private scene: THREE.Scene, normals: THREE.Texture) {
    this.current = cloneEnv(PRESETS.midday)
    for (const sk of [this.sky, this.skyEnv]) {
      const m = sk.material
      m.uniforms.uNightK = { value: 0 }
      m.fragmentShader = m.fragmentShader
        .replace('void main() {', 'uniform float uNightK;\nvoid main() {')
        .replace('gl_FragColor = vec4( retColor, 1.0 );', 'retColor = mix(retColor, vec3(0.006, 0.011, 0.03) + retColor * vec3(0.05, 0.07, 0.12), uNightK);\n\t\t\tgl_FragColor = vec4( retColor, 1.0 );')
    }
    this.sky.scale.setScalar(3000)
    this.skyEnv.scale.setScalar(3000)
    this.skyScene.add(this.skyEnv)
    scene.add(this.sky)
    scene.fog = this.fog

    this.cloudMat = new THREE.ShaderMaterial({
      vertexShader: cloudVS,
      fragmentShader: cloudFS,
      transparent: true,
      depthWrite: false,
      side: THREE.BackSide,
      fog: false,
      uniforms: {
        uTime: { value: 0 },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        uSunColor: { value: new THREE.Color() },
        uAmbient: { value: new THREE.Color() },
        uCover: { value: 0.5 },
        uDark: { value: 0 },
        uHaze: { value: new THREE.Color() },
        uNight: { value: 0 },
        uStorm: { value: 0 },
      },
    })
    this.clouds = new THREE.Mesh(new THREE.SphereGeometry(3000, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2), this.cloudMat)
    this.clouds.frustumCulled = false
    this.clouds.renderOrder = 2
    scene.add(this.clouds)

    // stars
    const r = rng(77)
    const pos = new Float32Array(2200 * 3)
    for (let i = 0; i < 2200; i++) {
      const u = r() * Math.PI * 2
      const y = 0.02 + r() * 0.98
      const rr = Math.sqrt(1 - y * y)
      pos.set([Math.cos(u) * rr * 2900, y * 2900, Math.sin(u) * rr * 2900], i * 3)
    }
    const sg = new THREE.BufferGeometry()
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    this.starMat = new THREE.PointsMaterial({ size: 1.15, sizeAttenuation: false, color: '#cfe0ff', transparent: true, opacity: 0, fog: false, depthWrite: false })
    this.stars = new THREE.Points(sg, this.starMat)
    this.stars.frustumCulled = false
    scene.add(this.stars)

    // lights
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(4096, 4096)
    const sc = this.sun.shadow.camera
    sc.left = -110
    sc.right = 110
    sc.top = 110
    sc.bottom = -110
    sc.near = 5
    sc.far = 1400
    this.sun.shadow.bias = -0.0004
    this.sun.shadow.normalBias = 0.35
    scene.add(this.sun, this.sun.target, this.moon, this.hemi)
    this.moon.position.set(-300, 400, 200)

    // ocean
    this.water = new Water(new THREE.PlaneGeometry(26000, 26000), {
      textureWidth: 1024,
      textureHeight: 1024,
      waterNormals: normals,
      sunDirection: new THREE.Vector3(0, 1, 0),
      sunColor: 0xffffff,
      waterColor: 0x1f4a5a,
      distortionScale: 2.5,
      fog: true,
    })
    this.water.rotation.x = -Math.PI / 2
    this.water.material.uniforms.size.value = 2
    scene.add(this.water)

    this.pmrem = new THREE.PMREMGenerator(renderer)
    this.pmrem.compileEquirectangularShader()
  }

  apply(p: EnvParams, time: number, forceEnv = false) {
    this.current = p
    const el = THREE.MathUtils.degToRad(p.elev)
    const az = THREE.MathUtils.degToRad(p.azim)
    this.sunDir.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az))
    for (const s of [this.sky, this.skyEnv]) {
      const u = s.material.uniforms
      u.turbidity.value = p.turbidity
      u.rayleigh.value = p.rayleigh
      u.mieCoefficient.value = p.mie
      u.mieDirectionalG.value = p.mieG
      u.sunPosition.value.copy(this.sunDir)
      u.uNightK.value = Math.min(1, Math.max(0, (p.night - 0.3) / 0.6))
    }
    this.fog.color.copy(p.fogColor)
    this.fog.density = p.fogDensity
    this.sun.color.copy(p.sunColor)
    this.sun.intensity = p.sunInt * Math.min(1, Math.max(0, p.elev / 4 + 0.15))
    this.moon.intensity = p.night * 0.55 * (1 - p.dark * 0.4)
    this.hemi.color.copy(p.hemiSky)
    this.hemi.groundColor.copy(p.hemiGround)
    this.hemi.intensity = p.hemiInt
    this.renderer.toneMappingExposure = p.exposure
    this.scene.environmentIntensity = p.envInt
    this.starMat.opacity = Math.max(0, p.night - 0.5) * 1.0 * (1 - p.dark)

    const cu = this.cloudMat.uniforms
    cu.uSunDir.value.copy(this.sunDir)
    cu.uSunColor.value.copy(p.sunColor).multiplyScalar(1.5 * Math.max(0.05, 1 - p.night))
    cu.uAmbient.value.copy(p.hemiSky).lerp(p.haze, 0.5).multiplyScalar(0.55 + 0.35 * (1 - p.night))
    cu.uCover.value = p.cover
    cu.uDark.value = p.dark
    cu.uHaze.value.copy(p.haze).multiplyScalar(0.8)
    cu.uNight.value = p.night

    const wu = this.water.material.uniforms
    wu.sunDirection.value.copy(this.sunDir.y > -0.02 ? this.sunDir : this.moon.position.clone().normalize())
    wu.sunColor.value.copy(p.sunColor).multiplyScalar(this.sunDir.y > 0 ? 1 : 0.15 + p.night * 0.2)
    wu.waterColor.value.copy(p.waterColor)
    wu.distortionScale.value = p.distortion
    wu.size.value = p.waveSize
    this.water.position.y = p.seaLevel
    this.cloudMat.uniforms.uTime.value = time

    if (forceEnv || time - this.lastEnvBuild > 0.35) {
      this.lastEnvBuild = time
      this.buildEnv()
    }
  }

  buildEnv() {
    const rt = this.pmrem.fromScene(this.skyScene, 0.02, 1, 3000)
    this.envRT?.dispose()
    this.envRT = rt
    this.scene.environment = rt.texture
  }

  follow(cam: THREE.Camera) {
    this.sky.position.copy(cam.position)
    this.clouds.position.copy(cam.position)
    this.stars.position.copy(cam.position)
  }

  dispose() {
    this.envRT?.dispose()
    this.pmrem.dispose()
  }
}

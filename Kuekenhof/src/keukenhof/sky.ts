import * as THREE from 'three'
import { Sky } from 'three/examples/jsm/objects/Sky.js'
import { clamp, lerp, smooth } from './util'

const CLOUD_VS = /* glsl */ `
varying vec3 vDir;
void main(){
  vDir = normalize(position);
  vec4 p = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * p;
}`
const CLOUD_FS = /* glsl */ `
varying vec3 vDir;
uniform float uTime; uniform float uCover; uniform vec3 uSunDir; uniform vec3 uSunColor; uniform float uSunI; uniform vec3 uAmb;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 6; i++){ s += a*n(p); p = p*2.03 + vec2(17.1, 9.2); a *= 0.5; } return s; }
float dens(vec2 p){
  float base = fbm(p * 0.55 + vec2(uTime * 0.004, 0.0));
  float det = fbm(p * 2.4 - vec2(uTime * 0.012, 3.0));
  float d = base * 0.78 + det * 0.3;
  float thr = mix(0.72, 0.38, uCover);
  return smoothstep(thr, thr + 0.2, d);
}
void main(){
  vec3 d = normalize(vDir);
  if (d.y < 0.015) discard;
  vec2 uv = d.xz / (d.y + 0.14) * 1.15;
  float c = dens(uv);
  if (c < 0.003) discard;
  // cheap self-shadow: sample toward the sun
  vec2 sd = normalize(uSunDir.xz + 1e-4) * 0.09 / max(0.25, uSunDir.y + 0.4);
  float c2 = dens(uv + sd) ;
  float c3 = dens(uv + sd * 2.2);
  float lit = clamp(1.0 - (c2 * 0.5 + c3 * 0.5 - c * 0.3) * 0.95, 0.0, 1.0);
  float silver = pow(max(dot(d, uSunDir), 0.0), 6.0);
  vec3 shade = uAmb * 0.85;
  vec3 light = uSunColor * (0.55 + uSunI * 0.2) + uAmb * 0.3;
  vec3 col = mix(shade, light, lit);
  col += uSunColor * silver * (1.0 - c * 0.5) * 0.45 * uSunI * 0.35;
  col = mix(col, uAmb * 0.7, uCover * uCover * 0.45);
  float a = c * smoothstep(0.015, 0.2, d.y);
  gl_FragColor = vec4(col, a * 0.98);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`

export interface AtmoState {
  hour: number
  cover: number
  elev: number
  sunDir: THREE.Vector3
  sunColor: THREE.Color
  sunI: number
}

export class Atmosphere {
  sky = new Sky()
  clouds: THREE.Mesh
  sun = new THREE.DirectionalLight(0xffffff, 3)
  hemi = new THREE.HemisphereLight(0xbcd6f0, 0x6a7a48, 0.5)
  fog = new THREE.FogExp2(0xbfd4e6, 0.0008)
  state: AtmoState = { hour: 13, cover: 0.3, elev: 50, sunDir: new THREE.Vector3(0, 1, 0), sunColor: new THREE.Color(), sunI: 3 }
  private envScene = new THREE.Scene()
  private envSky = new Sky()
  private pmrem: THREE.PMREMGenerator
  private envRT: THREE.WebGLRenderTarget | null = null
  private cu: Record<string, { value: unknown }>
  private shadowCenter = new THREE.Vector3()
  shadowHalf = 70
  private lastEnvKey = ''

  constructor(private renderer: THREE.WebGLRenderer, private scene: THREE.Scene, shadowSize: number) {
    this.sky.scale.setScalar(12000)
    this.envSky.scale.setScalar(1000)
    this.envScene.add(this.envSky)
    scene.add(this.sky)
    this.pmrem = new THREE.PMREMGenerator(renderer)
    this.cu = {
      uTime: { value: 0 },
      uCover: { value: 0.3 },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunColor: { value: new THREE.Color(1, 1, 1) },
      uSunI: { value: 1 },
      uAmb: { value: new THREE.Color(0.5, 0.6, 0.75) },
    }
    this.clouds = new THREE.Mesh(
      new THREE.SphereGeometry(9000, 32, 20),
      new THREE.ShaderMaterial({ uniforms: this.cu as never, vertexShader: CLOUD_VS, fragmentShader: CLOUD_FS, transparent: true, depthWrite: false, side: THREE.BackSide, fog: false }),
    )
    this.clouds.renderOrder = -1
    this.clouds.frustumCulled = false
    scene.add(this.clouds)

    scene.fog = this.fog
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(shadowSize, shadowSize)
    this.sun.shadow.bias = -0.00025
    this.sun.shadow.normalBias = 0.04
    this.sun.shadow.radius = 2.5
    this.sun.shadow.camera.near = 1
    this.sun.shadow.camera.far = 500
    scene.add(this.sun, this.sun.target, this.hemi)
    this.set(13, 0.3)
  }

  set(hour: number, cover: number) {
    const st = this.state
    st.hour = hour
    st.cover = cover
    const t = clamp((hour - 6.7) / 14.1, 0, 1)
    const elev = 52 * Math.sin(Math.PI * t) - 0.5
    const az = ((90 + 180 * t) * Math.PI) / 180
    const e = (elev * Math.PI) / 180
    st.elev = elev
    st.sunDir.set(Math.sin(az) * Math.cos(e), Math.sin(e), -Math.cos(az) * Math.cos(e)).normalize()
    // sun colour by elevation
    const k = smooth(0, 28, elev)
    const warm = new THREE.Color(1.0, 0.55, 0.3)
    const mid = new THREE.Color(1.0, 0.82, 0.62)
    const hi = new THREE.Color(1.0, 0.96, 0.9)
    st.sunColor.copy(warm).lerp(mid, smooth(0, 12, elev)).lerp(hi, k)
    const overcast = Math.pow(cover, 1.6)
    st.sunI = (0.5 + 2.7 * smooth(0, 22, elev)) * (1 - 0.8 * overcast)
    this.sun.color.copy(st.sunColor)
    this.sun.intensity = st.sunI
    // sky
    const su = (this.sky.material as THREE.ShaderMaterial).uniforms
    const turb = lerp(2.5, 9, overcast) + (1 - k) * 2
    for (const u of [su, (this.envSky.material as THREE.ShaderMaterial).uniforms]) {
      u.turbidity.value = turb
      u.rayleigh.value = lerp(1.1, 0.55, overcast) + (1 - k) * 0.8
      u.mieCoefficient.value = 0.004 + 0.006 * (1 - k)
      u.mieDirectionalG.value = 0.82
      u.sunPosition.value.copy(st.sunDir)
    }
    // ambient & fog
    const day = new THREE.Color(0.74, 0.84, 0.94)
    const gold = new THREE.Color(0.96, 0.76, 0.6)
    const grey = new THREE.Color(0.7, 0.73, 0.77)
    const fogC = day.clone().lerp(gold, 1 - smooth(2, 20, elev)).lerp(grey, overcast * 0.85)
    this.fog.color.copy(fogC)
    this.fog.density = lerp(0.00078, 0.0014, overcast) + (1 - k) * 0.0003
    this.hemi.color.copy(fogC).lerp(new THREE.Color(0.6, 0.78, 1), 0.3)
    this.hemi.groundColor.set('#6d7a4a')
    this.hemi.intensity = lerp(0.42, 0.7, overcast) * (0.55 + 0.45 * k)
    // clouds
    const cu = this.cu
    cu.uCover.value = cover
    ;(cu.uSunDir.value as THREE.Vector3).copy(st.sunDir)
    ;(cu.uSunColor.value as THREE.Color).copy(st.sunColor)
    cu.uSunI.value = st.sunI
    ;(cu.uAmb.value as THREE.Color).copy(fogC).multiplyScalar(0.85)
    this.renderer.toneMappingExposure = lerp(0.5, 0.74, 1 - k) * lerp(1, 1.15, overcast)
    this.scene.environmentIntensity = (0.35 + 0.3 * k) * (1 - 0.25 * overcast)
    this.updateEnv()
  }

  private updateEnv() {
    const key = `${this.state.elev.toFixed(0)}|${(this.state.cover * 4).toFixed(0)}`
    if (key === this.lastEnvKey && this.envRT) return
    this.lastEnvKey = key
    this.envRT?.dispose()
    this.envRT = this.pmrem.fromScene(this.envScene, 0, 0.1, 1000)
    this.scene.environment = this.envRT.texture
  }

  update(t: number, cam: THREE.Vector3, focus: THREE.Vector3) {
    this.cu.uTime.value = t
    this.clouds.position.copy(cam)
    this.sky.position.copy(cam)
    // shadow follows the player in texel-snapped steps
    const S = this.shadowHalf
    const texel = (S * 2) / this.sun.shadow.mapSize.x
    this.shadowCenter.set(Math.round(focus.x / (texel * 8)) * texel * 8, 0, Math.round(focus.z / (texel * 8)) * texel * 8)
    this.sun.target.position.copy(this.shadowCenter)
    this.sun.position.copy(this.shadowCenter).addScaledVector(this.state.sunDir, 250)
    const c = this.sun.shadow.camera
    if (Math.abs(c.right - S) > 0.5) {
      c.left = -S
      c.right = S
      c.top = S
      c.bottom = -S
      c.updateProjectionMatrix()
    }
    this.sun.target.updateMatrixWorld()
  }

  dispose() {
    this.envRT?.dispose()
    this.pmrem.dispose()
  }
}

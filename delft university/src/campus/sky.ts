import * as THREE from 'three'
import { Sky } from 'three/examples/jsm/objects/Sky.js'
import { clamp, lerp, smooth, rng } from './noise'

export interface EnvParams {
  lightDir: THREE.Vector3
  sunDir: THREE.Vector3
  sunColor: THREE.Color
  sunInt: number
  hemiSky: THREE.Color
  hemiGround: THREE.Color
  hemiInt: number
  fog: THREE.Color
  fogDensity: number
  exposure: number
  night: number
  cover: number
  elev: number
}

const C = (r: number, g: number, b: number) => new THREE.Color(r, g, b)

export function computeEnv(elev: number, az: number, cover: number): EnvParams {
  const e = (elev * Math.PI) / 180, a = (az * Math.PI) / 180
  const sunDir = new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)).normalize()
  const moonDir = new THREE.Vector3(Math.sin(1.9) * Math.cos(0.7), Math.sin(0.7), -Math.cos(1.9) * Math.cos(0.7)).normalize()
  const day = smooth(-6, 4, elev) // sun weight
  const night = 1 - smooth(-9, 3, elev)
  const high = smooth(2, 28, elev)
  const ovc = smooth(0.6, 1, cover)
  const lightDir = moonDir.clone().lerp(sunDir, day).normalize()
  const sunColor = C(1, 0.5, 0.22).lerp(C(1, 0.96, 0.88), high).lerp(C(0.55, 0.65, 1), 1 - day)
  const sunInt = (lerp(0.55, 1, 1 - day) * 0 + day * lerp(0.4, 1, high) * 5.5 + (1 - day) * 0.55) * lerp(1, 0.18, ovc)
  const hemiSky = C(0.55, 0.7, 0.95).lerp(C(0.9, 0.62, 0.5), (1 - high) * day * 0.5).lerp(C(0.1, 0.14, 0.3), night)
  const hemiGround = C(0.34, 0.31, 0.24).lerp(C(0.05, 0.05, 0.07), night)
  const hemiInt = lerp(0.07, 0.4, day) * lerp(1, 1.6, ovc)
  const fogDay = C(0.62, 0.75, 0.9).lerp(C(0.78, 0.55, 0.42), (1 - high) * 0.7).lerp(C(0.62, 0.65, 0.68), ovc)
  const fog = fogDay.lerp(C(0.012, 0.018, 0.04), night)
  const fogDensity = lerp(0.00013, 0.00032, ovc) * (1 + (1 - high) * 0.6)
  const exposure = lerp(1.25, 0.42, smooth(-10, 14, elev)) * lerp(1, 1.2, ovc)
  return { lightDir, sunDir, sunColor, sunInt, hemiSky, hemiGround, hemiInt, fog, fogDensity, exposure, night, cover, elev }
}

const CLOUD_VS = `
varying vec3 vW;
void main(){
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`
const CLOUD_FS = `
uniform float uTime; uniform float uCover; uniform vec3 uSunDir; uniform vec3 uSunColor; uniform float uNight; uniform float uLight;
varying vec3 vW;
float h21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float a=0.5, s=0.0; for(int i=0;i<6;i++){ s+=a*vn(p); p=p*2.03+vec2(11.7,3.1); a*=0.5; } return s; }
void main(){
  vec2 p = vW.xz * 0.00042 + vec2(uTime*0.006, uTime*0.0025);
  float n = fbm(p);
  float c = smoothstep(1.02 - uCover*0.72, 1.02 - uCover*0.72 + 0.22, n);
  vec2 sp = uSunDir.xz * 0.03;
  float n2 = fbm(p + sp);
  float shade = clamp(0.62 + (n - n2) * 5.0, 0.2, 1.0);
  vec3 lit = uSunColor * 1.15;
  vec3 dark = vec3(0.42, 0.46, 0.54) * (0.35 + 0.65*uLight);
  vec3 col = mix(dark, lit, shade) * (0.15 + 0.85 * uLight);
  col = mix(col, vec3(0.012,0.016,0.03)+uSunColor*0.02, uNight);
  float d = length(vW.xz - cameraPosition.xz);
  float fade = 1.0 - smoothstep(2200.0, 5200.0, d);
  float top = smoothstep(0.0, 1.0, c);
  gl_FragColor = vec4(col, top * fade * mix(0.97, 0.9, uNight));
}`

export class SkyRig {
  visible = new THREE.Group()
  envScene = new THREE.Scene()
  private sky: Sky
  private skyEnv: Sky
  private clouds: THREE.Mesh
  private cloudMat: THREE.ShaderMaterial
  private stars: THREE.Points
  private starMat: THREE.PointsMaterial

  constructor() {
    const mk = () => {
      const s = new Sky()
      s.geometry = new THREE.SphereGeometry(1, 48, 24) as unknown as THREE.BoxGeometry
      s.frustumCulled = false
      return s
    }
    this.sky = mk(); this.sky.scale.setScalar(5600); this.sky.renderOrder = -1000
    this.skyEnv = mk(); this.skyEnv.scale.setScalar(1500)
    this.envScene.add(this.skyEnv)
    this.visible.add(this.sky)

    this.cloudMat = new THREE.ShaderMaterial({
      vertexShader: CLOUD_VS, fragmentShader: CLOUD_FS, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 }, uCover: { value: 0.3 }, uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        uSunColor: { value: new THREE.Color(1, 1, 1) }, uNight: { value: 0 }, uLight: { value: 1 },
      },
    })
    this.clouds = new THREE.Mesh(new THREE.PlaneGeometry(12000, 12000, 1, 1), this.cloudMat)
    this.clouds.rotation.x = -Math.PI / 2
    this.clouds.renderOrder = -900
    this.clouds.frustumCulled = false
    this.visible.add(this.clouds)

    const R = rng(99)
    const n = 1800
    const pos = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      const u = R() * 2 - 1, th = R() * Math.PI * 2
      const r = Math.sqrt(1 - u * u)
      const y = Math.abs(u) * 0.95 + 0.05
      pos[i * 3] = r * Math.cos(th) * 5000; pos[i * 3 + 1] = y * 5000; pos[i * 3 + 2] = r * Math.sin(th) * 5000
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    this.starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.8, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false })
    this.stars = new THREE.Points(g, this.starMat)
    this.stars.frustumCulled = false
    this.stars.renderOrder = -950
    this.visible.add(this.stars)
  }

  apply(e: EnvParams) {
    for (const s of [this.sky, this.skyEnv]) {
      const u = s.material.uniforms
      const ovc = smooth(0.5, 1, e.cover)
      u.turbidity.value = lerp(2.6, 14, ovc)
      u.rayleigh.value = lerp(1.1, 0.35, ovc) + (1 - smooth(-4, 12, e.elev)) * 1.2
      u.mieCoefficient.value = lerp(0.005, 0.03, ovc)
      u.mieDirectionalG.value = lerp(0.82, 0.6, ovc)
      u.sunPosition.value.copy(e.sunDir)
    }
    this.cloudMat.uniforms.uCover.value = e.cover
    this.cloudMat.uniforms.uSunDir.value.copy(e.sunDir)
    this.cloudMat.uniforms.uSunColor.value.copy(e.sunColor)
    this.cloudMat.uniforms.uNight.value = e.night
    this.cloudMat.uniforms.uLight.value = clamp(smooth(-8, 10, e.elev) * lerp(1, 0.55, smooth(0.6, 1, e.cover)))
    this.starMat.opacity = clamp(e.night * 1.2 - 0.2) * (1 - smooth(0.3, 0.8, e.cover))
  }

  update(t: number, cam: THREE.Vector3) {
    this.sky.position.copy(cam)
    this.stars.position.copy(cam)
    this.clouds.position.set(cam.x, 850, cam.z)
    this.cloudMat.uniforms.uTime.value = t
  }
}

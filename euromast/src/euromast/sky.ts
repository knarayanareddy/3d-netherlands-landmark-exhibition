import * as THREE from 'three'

const VERT = /* glsl */ `
varying vec3 vDir;
void main(){
  vDir = position;
  mat4 vm = mat4(mat3(viewMatrix)); // rotation only: sky never translates
  gl_Position = projectionMatrix * vm * vec4(position, 1.0);
  gl_Position.z = gl_Position.w * 0.9999;
}`

const FRAG = /* glsl */ `
precision highp float;
varying vec3 vDir;
uniform vec3 uSun;
uniform float uTime;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uGround;
uniform vec3 uSunColor;
uniform vec3 uCloudLit;
uniform vec3 uCloudDark;
uniform float uCover;
uniform float uNight;
uniform float uDisk;
float hash(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
float noise(vec2 p){
  vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y);
}
float fbm(vec2 p){
  float a=.5, s=0.;
  for(int i=0;i<6;i++){ s+=a*noise(p); p=p*2.03+vec2(17.1,9.3); a*=.5; }
  return s;
}
float cloudDensity(vec2 p){
  float base = fbm(p*0.55);
  float detail = fbm(p*2.1 + base*1.6);
  return base*0.72 + detail*0.42;
}
void main(){
  vec3 d = normalize(vDir);
  float h = max(d.y, 0.0);
  vec3 col = mix(uHorizon, uZenith, pow(h, 0.42));
  // horizon haze band
  col = mix(col, uHorizon*1.05, exp(-h*9.0)*0.55);
  float sd = max(dot(d, uSun), 0.0);
  float glow = pow(sd, 6.0)*0.22 + pow(sd, 48.0)*0.5;
  col += uSunColor * glow * (1.0 - uNight);
  float disk = smoothstep(0.99965, 0.99985, sd);
  col += uSunColor * disk * uDisk;
  // stars
  if (uNight > 0.01 && d.y > 0.0) {
    vec2 sp = d.xz / (d.y + 0.6) * 520.0;
    float s = hash(floor(sp));
    float dd = length(fract(sp) - 0.5);
    float star = step(0.9975, s) * smoothstep(0.5, 0.05, dd) * smoothstep(0.0, 0.25, d.y);
    col += vec3(star) * uNight * (0.6 + 0.8*hash(floor(sp)+3.1));
  }
  if (d.y < 0.0) {
    col = mix(uHorizon, uGround, smoothstep(0.0, -0.08, d.y));
  } else {
    // clouds: planar projection onto a high layer
    vec2 p = d.xz / (d.y + 0.14) * 0.85 + vec2(uTime*0.012, uTime*0.004);
    float dens = cloudDensity(p);
    float lo = 1.0 - uCover;
    float c = smoothstep(lo, lo + 0.22, dens);
    float dl = cloudDensity(p + uSun.xz * 0.12 / (0.25 + uSun.y));
    float lit = clamp(0.58 + (dens - dl) * 3.2, 0.0, 1.0);
    float thick = smoothstep(lo, lo + 0.5, dens);
    vec3 cc = mix(uCloudDark, uCloudLit, lit);
    cc = mix(cc, uCloudDark*0.8, thick*0.35);
    // silver lining near sun
    cc += uSunColor * pow(sd, 10.0) * (1.0 - thick) * 0.5 * (1.0 - uNight);
    float fade = smoothstep(0.0, 0.1, d.y);
    col = mix(col, cc, c * fade);
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`

export function createSky() {
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    uniforms: {
      uSun: { value: new THREE.Vector3(0, 1, 0) },
      uTime: { value: 0 },
      uZenith: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() },
      uGround: { value: new THREE.Color() },
      uSunColor: { value: new THREE.Color() },
      uCloudLit: { value: new THREE.Color() },
      uCloudDark: { value: new THREE.Color() },
      uCover: { value: 0.5 },
      uNight: { value: 0 },
      uDisk: { value: 12 },
    },
  })
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), mat)
  mesh.frustumCulled = false
  mesh.renderOrder = -1000
  mesh.scale.setScalar(1)
  return { mesh, mat }
}

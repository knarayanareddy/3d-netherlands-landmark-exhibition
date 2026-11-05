import * as THREE from 'three'
import { Water } from 'three/examples/jsm/objects/Water.js'
import { Bed, CANAL_HW, CANAL_Z, GROUND_HALF, PAVILION, CAFE, MILL, MILL_APRON, WATER_Y, groundHeight, paths, plazas } from './layout'
import { TexSet } from './textures'

const SPLAT = 2048

export interface Terrain {
  ground: THREE.Mesh
  far: THREE.Mesh
  water: Water
  splat: Uint8ClampedArray
  splatAt: (x: number, z: number) => [number, number, number]
  setSun: (dir: THREE.Vector3, color: THREE.Color) => void
}

function paintSplat(beds: Bed[]) {
  const c = document.createElement('canvas')
  c.width = c.height = SPLAT
  const g = c.getContext('2d', { willReadFrequently: true })!
  g.fillStyle = '#000'
  g.fillRect(0, 0, SPLAT, SPLAT)
  const k = SPLAT / (GROUND_HALF * 2)
  const px = (x: number) => (x + GROUND_HALF) * k
  g.lineCap = 'round'
  g.lineJoin = 'round'
  // beds -> soil
  g.fillStyle = '#0000ff'
  for (const b of beds) {
    if (b.indoor) continue
    g.beginPath()
    b.poly.forEach(([x, z], i) => (i ? g.lineTo(px(x), px(z)) : g.moveTo(px(x), px(z))))
    g.closePath()
    g.fill()
    g.strokeStyle = '#0000ff'
    g.lineWidth = 2
    g.stroke()
  }
  // gravel paths
  g.strokeStyle = '#ff0000'
  for (const p of paths) {
    g.lineWidth = p.w * k
    g.beginPath()
    p.pts.forEach(([x, z], i) => (i ? g.lineTo(px(x), px(z)) : g.moveTo(px(x), px(z))))
    if (p.closed) g.closePath()
    g.stroke()
  }
  // pavers: plazas, mill apron, building floors
  g.fillStyle = '#00ff00'
  for (const r of plazas) g.fillRect(px(r.x0), px(r.z0), (r.x1 - r.x0) * k, (r.z1 - r.z0) * k)
  g.beginPath()
  g.arc(px(MILL.x), px(MILL.z), MILL_APRON * k, 0, Math.PI * 2)
  g.fill()
  for (const b of [PAVILION, CAFE]) g.fillRect(px(b.cx - b.hx), px(b.cz - b.hz), b.hx * 2 * k, b.hz * 2 * k)
  const data = g.getImageData(0, 0, SPLAT, SPLAT).data
  // soften edges slightly for the GPU texture
  const c2 = document.createElement('canvas')
  c2.width = c2.height = SPLAT
  const g2 = c2.getContext('2d')!
  g2.filter = 'blur(1.4px)'
  g2.drawImage(c, 0, 0)
  const tex = new THREE.CanvasTexture(c2)
  tex.colorSpace = THREE.NoColorSpace
  tex.flipY = false
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping
  tex.generateMipmaps = true
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.anisotropy = 8
  return { tex, data }
}

const FIELD_GLSL = /* glsl */ `
float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
vec3 fieldColor(vec2 p, float lowFade){
  float blockId = floor((p.y + 112.0) / 230.0);
  float sw = 11.0 + 15.0*h21(vec2(blockId, 3.0));
  float off = 40.0*h21(vec2(blockId, 7.0));
  float sid = floor((p.x + off) / sw);
  float hh = h21(vec2(sid, blockId*1.7));
  vec3 col;
  if (hh < 0.15) col = vec3(0.60,0.045,0.035);
  else if (hh < 0.30) col = vec3(0.86,0.60,0.03);
  else if (hh < 0.40) col = vec3(0.82,0.20,0.03);
  else if (hh < 0.50) col = vec3(0.70,0.17,0.30);
  else if (hh < 0.60) col = vec3(0.72,0.68,0.58);
  else if (hh < 0.68) col = vec3(0.20,0.05,0.30);
  else if (hh < 0.76) col = vec3(0.40,0.16,0.50);
  else if (hh < 0.86) col = vec3(0.07,0.20,0.04);
  else if (hh < 0.93) col = vec3(0.65,0.50,0.03);
  else col = vec3(0.18,0.12,0.07);
  float row = abs(fract(p.x / 0.75) - 0.5) * 2.0;
  float fw = fwidth(p.x / 0.75);
  float rowFade = 1.0 - smoothstep(0.25, 0.6, fw);
  vec3 leaf = vec3(0.045,0.13,0.03);
  col = mix(col, mix(col, leaf, 0.7), smoothstep(0.55, 1.0, row) * rowFade);
  col *= mix(0.82, 1.1, h21(floor(p * 0.5)) * rowFade + (1.0 - rowFade) * 0.5);
  // ditches between stripes
  float e = fract((p.x + off) / sw);
  float ditch = smoothstep(0.012, 0.0, min(e, 1.0 - e) * sw * 0.25 - 0.012);
  col = mix(col, vec3(0.03,0.07,0.02), ditch * 0.8);
  // headlands between blocks
  float bz = fract((p.y + 112.0) / 230.0) * 230.0;
  float head = smoothstep(7.0, 5.0, min(bz, 230.0 - bz));
  col = mix(col, vec3(0.07,0.17,0.04), head);
  return col;
}
`

function groundMaterial(tex: TexSet, splat: THREE.Texture | null) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 })
  m.onBeforeCompile = (sh) => {
    sh.uniforms.tSplat = { value: splat }
    sh.uniforms.tGrass = { value: tex.grass.map }
    sh.uniforms.tGrassN = { value: tex.grass.normal }
    sh.uniforms.tGravel = { value: tex.gravel.map }
    sh.uniforms.tGravelN = { value: tex.gravel.normal }
    sh.uniforms.tSoil = { value: tex.soil.map }
    sh.uniforms.tPaver = { value: tex.paver.map }
    sh.uniforms.uHalf = { value: GROUND_HALF }
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;')
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vWP;
uniform sampler2D tSplat, tGrass, tGrassN, tGravel, tGravelN, tSoil, tPaver;
uniform float uHalf;
float gRough; float gWet; float gGrassW; vec3 gDetail;
${FIELD_GLSL}`,
      )
      .replace(
        '#include <map_fragment>',
        `
vec2 w = vWP.xz;
vec3 g1 = texture2D(tGrass, w * 0.34).rgb;
vec3 g2 = texture2D(tGrass, w * 0.043).rgb;
vec3 g3 = texture2D(tGrass, w * 1.9).rgb;
float macro = texture2D(tGrass, w * 0.0075 + 0.31).g;
vec3 grassC = g1 * (0.5 + g2.g * 1.5) * (0.7 + g3.g * 0.7);
grassC = mix(grassC * vec3(1.1, 0.95, 0.7), grassC * vec3(0.8, 1.05, 0.9), smoothstep(0.35, 0.65, macro));
vec3 col = grassC;
float rough = 0.95;
float soilW = 0.0; float gravW = 0.0; float pavW = 0.0;
#ifdef GROUND_SPLAT
  vec2 suv = (w + uHalf) / (2.0 * uHalf);
  vec2 jit = (texture2D(tGrass, w * 0.17).rg - 0.5) * 0.0007;
  vec3 sp = smoothstep(0.25, 0.75, texture2D(tSplat, suv + jit).rgb);
  gravW = sp.r; pavW = sp.g; soilW = sp.b;
  vec3 gravC = texture2D(tGravel, w * 0.8).rgb * (0.8 + texture2D(tGravel, w * 0.13).g * 1.0) * vec3(1.7, 1.55, 1.2);
  vec3 pavC = texture2D(tPaver, w * 0.42).rgb * (0.8 + g2.g * 0.5) * vec3(1.25, 1.1, 0.9);
  vec3 soilC = texture2D(tSoil, w * 0.7).rgb * (0.7 + g2.g * 0.6);
  col = mix(col, soilC, soilW);
  col = mix(col, gravC, gravW);
  col = mix(col, pavC, pavW);
  rough = mix(rough, 0.97, soilW); rough = mix(rough, 0.82, gravW); rough = mix(rough, 0.7, pavW);
#endif
// bulb fields beyond the canal
float fieldMask = smoothstep(-110.5, -113.5, w.y + (texture2D(tGrass, w * 0.02).g - 0.5) * 2.5);
vec3 fcol = fieldColor(w, 1.0);
col = mix(col, fcol, fieldMask);
rough = mix(rough, 0.9, fieldMask);
// wet mud / banks near the water
gWet = smoothstep(0.0, -0.45, vWP.y);
col = mix(col, vec3(0.045, 0.036, 0.028) * (0.6 + g2.g), gWet);
col = mix(col, vec3(0.012, 0.03, 0.03), smoothstep(-0.6, -1.4, vWP.y));
gRough = mix(rough, 0.35, gWet * 0.6);
gGrassW = (1.0 - soilW) * (1.0 - gravW) * (1.0 - pavW) * (1.0 - fieldMask);
gDetail = vec3(0.0);
diffuseColor.rgb *= col;
#ifdef GROUND_CANAL_CUT
  if (abs(vWP.x) < ${(GROUND_HALF - 0.5).toFixed(1)} && abs(vWP.z) < ${(GROUND_HALF - 0.5).toFixed(1)}) discard;
  if (abs(vWP.z - (${CANAL_Z.toFixed(1)})) < ${CANAL_HW.toFixed(1)} && abs(vWP.x) > ${(GROUND_HALF - 6).toFixed(1)}) discard;
#endif
`,
      )
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = gRough;')
      .replace(
        '#include <normal_fragment_maps>',
        `
{
  vec3 n1 = texture2D(tGrassN, w * 0.34).xyz * 2.0 - 1.0;
  vec3 n2 = texture2D(tGrassN, w * 1.9).xyz * 2.0 - 1.0;
  vec3 dn = vec3(n1.xy * 0.8 + n2.xy * 0.6, 1.0);
  #ifdef GROUND_SPLAT
    vec3 gn = texture2D(tGravelN, w * 0.8).xyz * 2.0 - 1.0;
    dn.xy = mix(dn.xy, gn.xy * 1.25, gravW);
    dn.xy *= (1.0 - 0.7 * pavW);
  #endif
  dn.xy *= (1.0 - gWet);
  vec3 nW = normalize(vec3(dn.x * 0.55, 1.0, dn.y * 0.55));
  normal = normalize(mix(normal, normalize((viewMatrix * vec4(nW, 0.0)).xyz), 0.75 * (1.0 - gWet)));
}
`,
      )
  }
  m.defines = splat ? { GROUND_SPLAT: '' } : { GROUND_CANAL_CUT: '' }
  m.customProgramCacheKey = () => (splat ? 'kgs' : 'kgf')
  return m
}

export function buildTerrain(tex: TexSet, beds: Bed[]): Terrain {
  const { tex: splatTex, data } = paintSplat(beds)
  // ----- heightfield
  const cells = 380
  const geo = new THREE.PlaneGeometry(GROUND_HALF * 2, GROUND_HALF * 2, cells, cells)
  geo.rotateX(-Math.PI / 2)
  const pos = geo.attributes.position
  for (let i = 0; i < pos.count; i++) pos.setY(i, groundHeight(pos.getX(i), pos.getZ(i)))
  geo.computeVertexNormals()
  const ground = new THREE.Mesh(geo, groundMaterial(tex, splatTex))
  ground.receiveShadow = true
  ground.matrixAutoUpdate = false

  // ----- far land
  const farGeo = new THREE.PlaneGeometry(9000, 9000, 1, 1)
  farGeo.rotateX(-Math.PI / 2)
  const far = new THREE.Mesh(farGeo, groundMaterial(tex, null))
  far.position.y = -0.06
  far.receiveShadow = true

  // ----- water
  const water = new Water(new THREE.PlaneGeometry(700, 700), {
    textureWidth: 512,
    textureHeight: 512,
    waterNormals: tex.waterNormal,
    sunDirection: new THREE.Vector3(0.5, 0.8, 0.2),
    sunColor: 0xffffff,
    waterColor: 0x16363a,
    distortionScale: 1.6,
    fog: true,
  })
  water.rotation.x = -Math.PI / 2
  water.position.y = WATER_Y
  ;(water.material as THREE.ShaderMaterial).uniforms.size.value = 1.4

  const splatAt = (x: number, z: number): [number, number, number] => {
    const px = Math.floor(((x + GROUND_HALF) / (GROUND_HALF * 2)) * SPLAT)
    const pz = Math.floor(((z + GROUND_HALF) / (GROUND_HALF * 2)) * SPLAT)
    if (px < 0 || pz < 0 || px >= SPLAT || pz >= SPLAT) return [0, 0, 0]
    const i = (pz * SPLAT + px) * 4
    return [data[i], data[i + 1], data[i + 2]]
  }

  return {
    ground,
    far,
    water,
    splat: data,
    splatAt,
    setSun: (dir, color) => {
      const u = (water.material as THREE.ShaderMaterial).uniforms
      u.sunDirection.value.copy(dir).normalize()
      u.sunColor.value.copy(color)
    },
  }
}

import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { PBRSet } from './textures'

/* ------------------------------------------------------------------ geometry helpers */

export const boxG = (w: number, h: number, d: number, x = 0, y = 0, z = 0) => {
  const g = new THREE.BoxGeometry(w, h, d)
  g.translate(x, y, z)
  return g
}

export const cylG = (r1: number, r2: number, h: number, x = 0, y = 0, z = 0, seg = 16, axis: 'x' | 'y' | 'z' = 'y') => {
  const g = new THREE.CylinderGeometry(r1, r2, h, seg, 1)
  if (axis === 'x') g.rotateZ(Math.PI / 2)
  if (axis === 'z') g.rotateX(Math.PI / 2)
  g.translate(x, y, z)
  return g
}

const UP = new THREE.Vector3(0, 1, 0)
/** square or round beam between two points */
export function beamG(a: [number, number, number], b: [number, number, number], t: number, round = false, seg = 8) {
  const A = new THREE.Vector3(...a)
  const B = new THREE.Vector3(...b)
  const dir = B.clone().sub(A)
  const L = dir.length()
  const g = round ? new THREE.CylinderGeometry(t / 2, t / 2, L, seg, 1) : new THREE.BoxGeometry(t, L, t)
  const q = new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize())
  const m = new THREE.Matrix4().compose(A.add(B).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1))
  g.applyMatrix4(m)
  return g
}

/** extrude a (z,y) profile along X, centered around x=0 */
export function profileX(pts: [number, number][], length: number, bevel = 0) {
  const s = new THREE.Shape()
  pts.forEach((p, i) => (i ? s.lineTo(p[0], p[1]) : s.moveTo(p[0], p[1])))
  s.closePath()
  const g = new THREE.ExtrudeGeometry(s, {
    depth: length,
    bevelEnabled: bevel > 0,
    bevelSize: bevel,
    bevelThickness: bevel,
    bevelSegments: 2,
    curveSegments: 6,
  })
  g.rotateY(-Math.PI / 2)
  g.translate(length / 2, 0, 0)
  return g
}

/** planar / box projection UVs (world metres / tile) so any merged geometry gets consistent texel density */
function projectUV(g: THREE.BufferGeometry, tile: number) {
  const p = g.attributes.position
  const n = g.attributes.normal
  const uv = new Float32Array(p.count * 2)
  for (let i = 0; i < p.count; i++) {
    const nx = Math.abs(n.getX(i))
    const ny = Math.abs(n.getY(i))
    const nz = Math.abs(n.getZ(i))
    let u: number
    let v: number
    if (nx >= ny && nx >= nz) {
      u = p.getZ(i)
      v = p.getY(i)
    } else if (ny >= nz) {
      u = p.getX(i)
      v = p.getZ(i)
    } else {
      u = p.getX(i)
      v = p.getY(i)
    }
    uv[i * 2] = u / tile
    uv[i * 2 + 1] = v / tile
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
}

function clean(g: THREE.BufferGeometry, tile: number) {
  const ng = g.index ? g.toNonIndexed() : g.clone()
  for (const k of Object.keys(ng.attributes)) if (!['position', 'normal', 'uv'].includes(k)) ng.deleteAttribute(k)
  if (!ng.attributes.normal) ng.computeVertexNormals()
  projectUV(ng, tile)
  return ng
}

export class Parts {
  map = new Map<string, THREE.BufferGeometry[]>()
  constructor(public tile = 6) {}
  add(key: string, g: THREE.BufferGeometry | THREE.BufferGeometry[]) {
    const list = this.map.get(key) ?? []
    for (const x of Array.isArray(g) ? g : [g]) list.push(clean(x, this.tile))
    this.map.set(key, list)
  }
  merged(key: string) {
    const l = this.map.get(key)
    if (!l?.length) return null
    return mergeGeometries(l, false)
  }
  keys() {
    return [...this.map.keys()]
  }
}

/* ------------------------------------------------------------------ materials */

export interface SharedUniforms {
  uWaterY: { value: number }
  uTime: { value: number }
  uNight: { value: number }
  uDetail: { value: THREE.Texture | null }
}

export const U: SharedUniforms = {
  uWaterY: { value: 0 },
  uTime: { value: 0 },
  uNight: { value: 0 },
  uDetail: { value: null },
}

/** adds world position varying + weathering (tidal wet band, algae, large-scale grime) */
export function weather(mat: THREE.MeshStandardMaterial, opts: { tide?: boolean; grime?: number; wind?: boolean; fine?: number } = {}) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uWaterY = U.uWaterY
    sh.uniforms.uDetail = U.uDetail as any
    sh.uniforms.uTime = U.uTime
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP;\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        ${
          opts.wind
            ? `{ float sw = uv.y; vec2 ip = vec2(0.0);
                 #ifdef USE_INSTANCING
                   ip = instanceMatrix[3].xz;
                 #endif
                 transformed.x += sin(uTime*1.9 + ip.x*0.27 + ip.y*0.21) * 0.16 * sw * sw;
                 transformed.z += cos(uTime*1.4 + ip.x*0.19 - ip.y*0.31) * 0.10 * sw * sw; }`
            : ''
        }
        vec4 wp4 = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          wp4 = instanceMatrix * wp4;
        #endif
        wp4 = modelMatrix * wp4;
        vWP = wp4.xyz;`,
      )
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP;\nuniform float uWaterY;\nuniform sampler2D uDetail;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float hh = vWP.y - uWaterY;
        float wetBand = ${opts.tide ? 'smoothstep(3.4, 0.1, hh)' : '0.0'};
        float algae = ${opts.tide ? 'smoothstep(1.6, -0.6, hh)' : '0.0'};
        float gr = texture2D(uDetail, vWP.xy * 0.0113 + vWP.zy * 0.0091 + vWP.xz * 0.0071).r;
        diffuseColor.rgb *= ${opts.grime === undefined ? '1.0' : `(${(1 - (opts.grime ?? 0) / 2).toFixed(3)} + ${(opts.grime ?? 0).toFixed(3)} * gr)`};
        ${opts.fine ? `diffuseColor.rgb *= (${(1 - opts.fine / 2).toFixed(3)} + ${opts.fine.toFixed(3)} * texture2D(uDetail, vWP.xz * 0.37).r) * (${(1 - opts.fine / 3).toFixed(3)} + ${(opts.fine / 1.5).toFixed(3)} * texture2D(uDetail, vWP.xz * 1.9 + 0.5).r);` : ''}
        diffuseColor.rgb *= mix(vec3(1.0), vec3(0.64, 0.62, 0.58), wetBand);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.5, 0.66, 0.4), algae * 0.75);`,
      )
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.32, wetBand);')
  }
  mat.customProgramCacheKey = () => `weather-${opts.tide ? 1 : 0}-${opts.grime ?? -1}-${opts.wind ? 1 : 0}-${opts.fine ?? 0}`
  return mat
}

export interface Mats {
  concrete: THREE.MeshStandardMaterial
  rock: THREE.MeshStandardMaterial
  asphalt: THREE.MeshStandardMaterial
  whiteSteel: THREE.MeshStandardMaterial
  gateSteel: THREE.MeshStandardMaterial
  gateSkin: THREE.MeshStandardMaterial
  galv: THREE.MeshStandardMaterial
  darkSteel: THREE.MeshStandardMaterial
  glass: THREE.MeshStandardMaterial
  blue: THREE.MeshStandardMaterial
  line: THREE.MeshStandardMaterial
  paintWhite: THREE.MeshStandardMaterial
  lampGlow: THREE.MeshBasicMaterial
  redLight: THREE.MeshBasicMaterial
  [k: string]: THREE.Material
}

export function makeMaterials(t: { concrete: PBRSet; rock: PBRSet; asphalt: PBRSet }): Mats {
  const concrete = weather(
    new THREE.MeshStandardMaterial({
      map: t.concrete.map,
      bumpMap: t.concrete.bump,
      bumpScale: 2.2,
      roughnessMap: t.concrete.rough,
      roughness: 1,
      metalness: 0,
      envMapIntensity: 0.55,
    }),
    { tide: true, grime: 0.55 },
  )
  const rock = weather(
    new THREE.MeshStandardMaterial({ map: t.rock.map, bumpMap: t.rock.bump, bumpScale: 4, roughness: 0.95, envMapIntensity: 0.4 }),
    { tide: true, grime: 0.4 },
  )
  const asphalt = new THREE.MeshStandardMaterial({ map: t.asphalt.map, bumpMap: t.asphalt.bump, bumpScale: 1.2, roughness: 0.88, metalness: 0, envMapIntensity: 0.5 })
  const steel = (color: string, rough: number, metal: number) =>
    weather(new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, envMapIntensity: 1.0 }), { tide: true, grime: 0.25 })
  return {
    concrete,
    rock,
    asphalt,
    whiteSteel: steel('#dfe2e1', 0.55, 0.15),
    paintWhite: steel('#e9ebe8', 0.62, 0.0),
    gateSteel: steel('#c9cfd1', 0.5, 0.35),
    gateSkin: steel('#7d878c', 0.58, 0.4),
    galv: steel('#a9b0b4', 0.4, 0.85),
    darkSteel: steel('#2d3236', 0.62, 0.5),
    glass: new THREE.MeshStandardMaterial({ color: '#16242e', roughness: 0.06, metalness: 0.9, envMapIntensity: 1.6 }),
    blue: steel('#1f4f93', 0.5, 0.2),
    line: (() => {
      const m = new THREE.MeshStandardMaterial({ color: '#ecece6', roughness: 0.7 })
      m.polygonOffset = true
      m.polygonOffsetFactor = -2
      m.polygonOffsetUnits = -2
      return m
    })(),
    lampGlow: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.85, 0.55).multiplyScalar(0.15) }),
    redLight: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.1, 0.05).multiplyScalar(0.2) }),
  } as Mats
}

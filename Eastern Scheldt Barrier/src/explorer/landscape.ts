import * as THREE from 'three'
import { Parts, U, boxG, weather, type Mats } from './kit'
import { fbm, hash2, mix, rng, smoothstep } from './noise'
import {
  BARRIER_X1, DECK_Y, EAST_RAMP, N_PIERS, PITCH, PIER_HALF_X, PIER_Z0, PIER_Z1, ROAD_X0, ROAD_X1, ROAD_Z, WEST_RAMP, roadY, terrainH,
} from './world'

/* ------------------------------------------------------------------ terrain */
export function buildTerrain(x0: number, x1: number, z0: number, z1: number, step: number) {
  const nx = Math.round((x1 - x0) / step)
  const nz = Math.round((z1 - z0) / step)
  const pos = new Float32Array((nx + 1) * (nz + 1) * 3)
  const col = new Float32Array((nx + 1) * (nz + 1) * 3)
  const H = new Float32Array((nx + 1) * (nz + 1))
  const sand = [0.8, 0.72, 0.55]
  const wet = [0.4, 0.36, 0.29]
  const seabed = [0.26, 0.3, 0.3]
  const g1 = [0.33, 0.4, 0.16]
  const g2 = [0.5, 0.52, 0.25]
  const dry = [0.66, 0.6, 0.38]
  const forest = [0.14, 0.22, 0.1]
  const c = new THREE.Color()
  for (let j = 0; j <= nz; j++) {
    for (let i = 0; i <= nx; i++) {
      const x = x0 + i * step
      const z = z0 + j * step
      const h = terrainH(x, z)
      const k = j * (nx + 1) + i
      H[k] = h
      pos.set([x, h, z], k * 3)
      const n = fbm(x * 0.035, z * 0.035, 3, 14)
      const n2 = fbm(x * 0.2, z * 0.2, 2, 4)
      const tg = smoothstep(1.0, 2.7, h + (n - 0.5) * 1.6)
      let rgb = [0, 0, 0]
      const grass = [mix(g1[0], g2[0], n), mix(g1[1], g2[1], n), mix(g1[2], g2[2], n)]
      const dryK = smoothstep(0.55, 0.8, fbm(x * 0.02, z * 0.02, 3, 31))
      for (let q = 0; q < 3; q++) {
        let v = mix(sand[q], mix(grass[q], dry[q], dryK * 0.7), tg)
        v = mix(v, forest[q], smoothstep(5.5, 11, h))
        v = mix(v, wet[q], smoothstep(0.5, -0.1, h))
        v = mix(v, seabed[q], smoothstep(-0.3, -1.2, h))
        rgb[q] = v * (0.9 + n2 * 0.2)
      }
      c.setRGB(rgb[0], rgb[1], rgb[2], THREE.SRGBColorSpace)
      col.set([c.r, c.g, c.b], k * 3)
    }
  }
  const idx: number[] = []
  const fidx: number[] = []
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i
      const b = a + 1
      const cc = a + nx + 1
      const d = cc + 1
      idx.push(a, cc, b, b, cc, d)
      const mn = Math.min(H[a], H[b], H[cc], H[d])
      const mxh = Math.max(H[a], H[b], H[cc], H[d])
      if (mn < 0.7 && mxh > -2.4) fidx.push(a, cc, b, b, cc, d)
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
  geo.setIndex(idx)
  geo.computeVertexNormals()
  const mat = weather(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, envMapIntensity: 0.5 }), { grime: 0.5, fine: 0.5 })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.receiveShadow = true
  mesh.castShadow = false

  // shoreline foam: flat mesh at sea level carrying the true terrain height as an attribute
  const fpos = new Float32Array(pos.length)
  for (let k = 0; k < H.length; k++) fpos.set([pos[k * 3], 0.03, pos[k * 3 + 2]], k * 3)
  const fgeo = new THREE.BufferGeometry()
  fgeo.setAttribute('position', new THREE.BufferAttribute(fpos, 3))
  fgeo.setAttribute('aH', new THREE.BufferAttribute(H, 1))
  fgeo.setIndex(fidx)
  const foam = new THREE.Mesh(fgeo, foamMaterial(true))
  foam.renderOrder = 3
  foam.frustumCulled = false
  return { mesh, foam }
}

const noiseGLSL = /* glsl */ `
float h21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float n21(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
`

export const foamUniforms = { uFoamColor: { value: new THREE.Color('#e8f0f2') }, uFoam: { value: 0.5 } }

function foamMaterial(shore: boolean) {
  const m = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: U.uTime, uWaterY: U.uWaterY }]),
    vertexShader: /* glsl */ `
      attribute float aH; varying float vH; varying vec3 vWP; varying vec2 vUv;
      #include <fog_pars_vertex>
      void main(){
        vH = aH; vUv = uv;
        vec4 w = vec4(position,1.0);
        #ifdef USE_INSTANCING
          w = instanceMatrix * w;
        #endif
        w = modelMatrix * w; vWP = w.xyz;
        vec4 mvPosition = viewMatrix * w;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uFoamColor; uniform float uFoam; uniform float uWaterY;
      varying float vH; varying vec3 vWP; varying vec2 vUv;
      ${noiseGLSL}
      #include <fog_pars_fragment>
      void main(){
        float a = 0.0;
        ${
          shore
            ? `float tide = sin(uTime*0.55 + vWP.x*0.015)*0.22 + sin(uTime*1.3 + vWP.z*0.05)*0.08;
               float h = vH - tide - uWaterY;
               float band = smoothstep(-1.6, -0.25, h) * (1.0 - smoothstep(-0.2, 0.16, h));
               float n = n21(vWP.xz * 0.8 + uTime*0.15) * 0.6 + n21(vWP.xz*3.1 - uTime*0.3)*0.4;
               float rings = 0.5 + 0.5*sin(h*9.0 - uTime*1.0 + n*4.0);
               a = band * smoothstep(0.35, 0.8, n*0.7 + rings*0.45) * 0.85;
               a += (1.0 - smoothstep(-0.06, 0.1, h)) * smoothstep(-0.5, -0.12, h) * 0.35;`
            : `vec2 p = (vUv - 0.5) * vec2(${(PIER_HALF_X * 2 + 10).toFixed(1)}, ${(PIER_Z1 - PIER_Z0 + 12).toFixed(1)});
               vec2 q = abs(p - vec2(0.0, ${((PIER_Z1 + PIER_Z0) / 2 - 0).toFixed(1)}*0.0)) - vec2(${PIER_HALF_X.toFixed(2)}, ${((PIER_Z1 - PIER_Z0) / 2).toFixed(2)});
               float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
               float n = n21(vWP.xz*0.9 + uTime*0.25)*0.55 + n21(vWP.xz*2.6 - uTime*0.4)*0.45;
               float ring = smoothstep(0.0, 0.25, d) * (1.0 - smoothstep(0.4, 4.2, d + (n-0.5)*2.0));
               float stream = smoothstep(0.0, 0.3, d) * (1.0 - smoothstep(0.0, 7.0, d)) * smoothstep(0.0, 1.0, p.y*0.12);
               a = ring * (0.35 + n*0.7) * 0.9 + stream * n * 0.4;
               a *= 0.5 + uFoam;`
        }
        gl_FragColor = vec4(uFoamColor, clamp(a * (${shore ? '0.55 + uFoam*0.8' : '1.0'}), 0.0, 0.92));
        #include <fog_fragment>
      }`,
  })
  m.uniforms.uFoamColor = foamUniforms.uFoamColor
  m.uniforms.uFoam = foamUniforms.uFoam
  m.uniforms.uTime = U.uTime
  m.uniforms.uWaterY = U.uWaterY
  return m
}

/* ------------------------------------------------------------------ foam collars around pier bases */
export function buildCollars() {
  const g = new THREE.PlaneGeometry(1, 1)
  g.rotateX(-Math.PI / 2)
  g.setAttribute('aH', new THREE.BufferAttribute(new Float32Array(4), 1))
  const m = new THREE.InstancedMesh(g, foamMaterial(false), N_PIERS)
  const o = new THREE.Object3D()
  const w = PIER_HALF_X * 2 + 10
  const d = PIER_Z1 - PIER_Z0 + 12
  for (let i = 0; i < N_PIERS; i++) {
    o.position.set(i * PITCH, 0.06, (PIER_Z0 + PIER_Z1) / 2)
    o.scale.set(w, 1, d)
    o.updateMatrix()
    m.setMatrixAt(i, o.matrix)
  }
  m.frustumCulled = false
  m.renderOrder = 3
  return m
}

/* ------------------------------------------------------------------ road ribbons */
function ribbon(xs: number[], prof: (x: number) => [number, number][], uvScale: number) {
  const rows = prof(xs[0]).length
  const pos: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  for (let i = 0; i < xs.length; i++) {
    const p = prof(xs[i])
    let acc = 0
    for (let j = 0; j < rows; j++) {
      if (j) acc += Math.hypot(p[j][0] - p[j - 1][0], p[j][1] - p[j - 1][1])
      pos.push(xs[i], p[j][1], p[j][0])
      uv.push(xs[i] / uvScale, acc / uvScale)
    }
  }
  for (let i = 0; i < xs.length - 1; i++) {
    for (let j = 0; j < rows - 1; j++) {
      const a = i * rows + j
      const b = (i + 1) * rows + j
      const c = a + 1
      const d = b + 1
      idx.push(a, c, b, b, c, d)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}
const range = (a: number, b: number, s: number) => {
  const r: number[] = []
  for (let x = a; x < b; x += s) r.push(x)
  r.push(b)
  return r
}

function slopedBox(x0: number, x1: number, yOff: number, z: number, h: number, d: number) {
  const y0 = roadY(x0)
  const y1 = roadY(x1)
  const len = Math.hypot(x1 - x0, y1 - y0)
  const g = new THREE.BoxGeometry(len + 0.02, h, d)
  g.rotateZ(Math.atan2(y1 - y0, x1 - x0))
  g.translate((x0 + x1) / 2, (y0 + y1) / 2 + yOff, z)
  return g
}

export function buildRoads(mats: Mats, grassMat: THREE.Material) {
  const group = new THREE.Group()
  const half = 5.5
  const ranges: [number, number][] = [
    [ROAD_X0, 0],
    [BARRIER_X1, ROAD_X1],
  ]
  // asphalt + gravel shoulders
  for (const [a, b] of ranges) {
    const xs = range(a, b, 3)
    const asph = new THREE.Mesh(ribbon(xs, (x) => [[ROAD_Z - half, roadY(x) + 0.03], [ROAD_Z + half, roadY(x) + 0.03]], 6), mats.asphalt)
    asph.receiveShadow = true
    group.add(asph)
    const crown = new THREE.Mesh(ribbon(xs, (x) => [[ROAD_Z - 7.5, roadY(x) + 0.01], [ROAD_Z + 7.5, roadY(x) + 0.01]], 6), mats.concrete)
    crown.receiveShadow = true
    group.add(crown)
  }
  // embankments
  const embank = (a: number, b: number, mat: THREE.Material, uv: number) => {
    const xs = range(a, b, 4)
    const prof = (x: number): [number, number][] => {
      const ry = roadY(x)
      const L = (ry + 16) * 2.5
      return [[ROAD_Z - 7.5 - L, -16], [ROAD_Z - 7.5, ry], [ROAD_Z + 7.5, ry], [ROAD_Z + 7.5 + L, -16]]
    }
    const m = new THREE.Mesh(ribbon(xs, prof, uv), mat)
    m.receiveShadow = true
    m.castShadow = true
    group.add(m)
  }
  embank(WEST_RAMP[0], WEST_RAMP[1], grassMat, 7)
  embank(WEST_RAMP[1], 0, mats.rock, 8)
  embank(BARRIER_X1, EAST_RAMP[0], mats.rock, 8)
  embank(EAST_RAMP[0], EAST_RAMP[1], grassMat, 7)

  // railings, curbs and markings following the profile
  const p = new Parts(6)
  const seg = 5
  const furn = (a: number, b: number) => {
    for (let x = a; x < b; x += seg) {
      for (const z of [ROAD_Z - 6, ROAD_Z + 6]) {
        p.add('concrete', slopedBox(x, x + seg, 0.34, z, 0.7, 1.0))
        p.add('galv', [slopedBox(x, x + seg, 1.22, z + (z > ROAD_Z ? 0.25 : -0.25), 0.07, 0.07), slopedBox(x, x + seg, 0.88, z + (z > ROAD_Z ? 0.25 : -0.25), 0.04, 0.04)])
        for (let k = 0; k < seg; k += 2.5) {
          const xx = x + k
          p.add('galv', boxG(0.06, 0.7, 0.06, xx, roadY(xx) + 0.9, z + (z > ROAD_Z ? 0.25 : -0.25)))
        }
      }
    }
  }
  furn(WEST_RAMP[0], 0)
  furn(BARRIER_X1, EAST_RAMP[1])
  // lane markings
  for (const [a, b] of ranges) {
    for (let x = a; x < b; x += seg) {
      for (const z of [ROAD_Z - 5.1, ROAD_Z + 5.1]) p.add('line', slopedBox(x, x + seg, 0.04, z, 0.012, 0.15))
    }
    for (let x = a; x < b; x += 9) p.add('line', slopedBox(x, x + 3, 0.04, ROAD_Z, 0.012, 0.15))
  }
  for (const key of p.keys()) {
    const m = new THREE.Mesh(p.merged(key)!, mats[key])
    m.castShadow = key !== 'line'
    m.receiveShadow = true
    group.add(m)
  }
  // lamp posts along the ramps
  return group
}

/* ------------------------------------------------------------------ riprap boulders along the causeways */
export function buildRiprap(mats: Mats) {
  const geo = new THREE.IcosahedronGeometry(1, 2)
  const p = geo.attributes.position
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i)
    const y = p.getY(i)
    const z = p.getZ(i)
    const n = 0.78 + 0.45 * fbm(x * 1.7 + 4, y * 1.7 + z * 1.3, 3, 2)
    p.setXYZ(i, x * n, y * n * 0.72, z * n)
  }
  geo.computeVertexNormals()
  const N = 4200
  const m = new THREE.InstancedMesh(geo, mats.rock, N)
  const r = rng(404)
  const o = new THREE.Object3D()
  const col = new THREE.Color()
  const spans: [number, number][] = [[-150, -2], [BARRIER_X1 + 2, EAST_RAMP[0]]]
  for (let i = 0; i < N; i++) {
    const [a, b] = spans[r() < 0.5 ? 0 : 1]
    const x = a + r() * (b - a)
    const y = -3.2 + Math.pow(r(), 0.8) * 9.5
    const ry = roadY(x)
    const dz = 7.5 + (ry - y) * 2.5
    const side = r() < 0.5 ? -1 : 1
    const s = 0.7 + r() * 1.3
    o.position.set(x, y, ROAD_Z + side * (dz + (r() - 0.5) * 1.2))
    o.rotation.set(r() * 3, r() * 3, r() * 3)
    o.scale.set(s * (1 + r() * 0.5), s * (0.7 + r() * 0.4), s)
    o.updateMatrix()
    m.setMatrixAt(i, o.matrix)
    const t = 0.65 + r() * 0.5
    col.setRGB(t, t, t * 1.03)
    m.setColorAt(i, col)
  }
  m.castShadow = true
  m.receiveShadow = true
  return m
}

/* ------------------------------------------------------------------ dune grass */
export function buildGrass(grassTex: THREE.Texture, count: number, x0: number, x1: number, z0: number, z1: number, seed: number) {
  const planes: THREE.BufferGeometry[] = []
  for (let k = 0; k < 3; k++) {
    const g = new THREE.PlaneGeometry(1.1, 0.9)
    g.translate(0, 0.45, 0)
    g.rotateY((k * Math.PI) / 3)
    planes.push(g)
  }
  const merged = mergeSimple(planes)
  const mat = weather(
    new THREE.MeshStandardMaterial({ map: grassTex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 1, envMapIntensity: 0.4 }),
    { wind: true },
  )
  const m = new THREE.InstancedMesh(merged, mat, count)
  const r = rng(seed)
  const o = new THREE.Object3D()
  const c = new THREE.Color()
  let n = 0
  let guard = 0
  while (n < count && guard++ < count * 30) {
    const x = x0 + r() * (x1 - x0)
    const z = z0 + r() * (z1 - z0)
    const h = terrainH(x, z)
    if (h < 1.5) continue
    const dz = Math.abs(z - ROAD_Z)
    if (dz < 11 && x > WEST_RAMP[0] - 40 && x < EAST_RAMP[1] + 40) continue
    if (dz < 9) continue
    if (x > -575 && x < -465 && z > -108 && z < -60) continue // visitor centre
    if (x > -470 && x < -400 && z > -60 && z < -10) continue // plaza
    const d = fbm(x * 0.03, z * 0.03, 3, 77)
    if (r() > smoothstep(0.35, 0.65, d) * 0.95 + 0.04) continue
    o.position.set(x, h - 0.05, z)
    o.rotation.set(0, r() * 6.28, 0)
    const s = 0.55 + r() * 1.0
    o.scale.set(s, s * (0.8 + r() * 0.7), s)
    o.updateMatrix()
    m.setMatrixAt(n, o.matrix)
    const t = 0.7 + r() * 0.5
    c.setRGB(t * 1.0, t * 1.02, t * 0.85)
    m.setColorAt(n, c)
    n++
  }
  m.count = n
  m.receiveShadow = false
  m.frustumCulled = false
  return m
}

export function mergeSimple(list: THREE.BufferGeometry[]) {
  const pos: number[] = []
  const uv: number[] = []
  const nor: number[] = []
  const idx: number[] = []
  let off = 0
  for (const g of list) {
    const p = g.attributes.position
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i))
      nor.push(0, 1, 0)
      uv.push(g.attributes.uv.getX(i), g.attributes.uv.getY(i))
    }
    for (const i of Array.from(g.index!.array)) idx.push(i + off)
    off += p.count
  }
  const out = new THREE.BufferGeometry()
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  out.setIndex(idx)
  return out
}

export { hash2, DECK_Y }

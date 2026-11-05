import * as THREE from 'three'
import { Bed, groundHeight, isLawn, waterSD } from './layout'
import { flowerMaterial, getKit, flowerUniforms } from './flowers'
import { TexSet } from './textures'
import { TAU, fbm, rng } from './util'

const CHUNK = 16

function tuftGeometry(w: number, h: number, planes: number) {
  const pos: number[] = []
  const uv: number[] = []
  const nrm: number[] = []
  const idx: number[] = []
  for (let i = 0; i < planes; i++) {
    const a = (i / planes) * Math.PI
    const dx = Math.cos(a) * w * 0.5
    const dz = Math.sin(a) * w * 0.5
    const b = pos.length / 3
    pos.push(-dx, 0, -dz, dx, 0, dz, -dx, h, -dz, dx, h, dz)
    uv.push(0, 0, 1, 0, 0, 1, 1, 1)
    for (let k = 0; k < 4; k++) nrm.push(0, 1, 0)
    idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3))
  g.setIndex(idx)
  return g
}

export const grassUniforms = { uFade0: { value: 26 }, uFade1: { value: 40 } }

function tuftMaterial(map: THREE.Texture, wind: number) {
  const m = new THREE.MeshStandardMaterial({ map, side: THREE.DoubleSide, alphaTest: 0.4, roughness: 0.9, metalness: 0 })
  m.alphaToCoverage = true
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = flowerUniforms.uTime
    sh.uniforms.uWind = flowerUniforms.uWind
    sh.uniforms.uFade0 = grassUniforms.uFade0
    sh.uniforms.uFade1 = grassUniforms.uFade1
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime, uWind, uFade0, uFade1;')
      .replace(
        '#include <project_vertex>',
        `vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
mvPosition = instanceMatrix * mvPosition;
vec3 ip = vec3(instanceMatrix[3]);
float hw = uv.y * uv.y;
float ph = dot(ip.xz, vec2(0.31, 0.19)) - uTime * 1.9;
float gust = sin(ph) * 0.6 + sin(ph * 2.9 + ip.z) * 0.3 + sin(uTime * 0.5 + ip.x * 0.04) * 0.25;
mvPosition.x += uWind * hw * gust * ${wind.toFixed(3)};
mvPosition.z += uWind * hw * sin(ph * 0.7 + 2.0) * ${(wind * 0.5).toFixed(3)};
float dd = distance(mvPosition.xyz, cameraPosition);
float fade = 1.0 - smoothstep(uFade0, uFade1, dd);
mvPosition.y = ip.y + (mvPosition.y - ip.y) * fade;
#endif
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;`,
      )
    sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * 0.03;')
  }
  m.customProgramCacheKey = () => 'tuft' + wind
  return m
}

interface Chunk {
  key: string
  cx: number
  cz: number
  meshes: THREE.InstancedMesh[]
}

export interface GrassCfg {
  density: number
  radius: number
}

export class Lawn {
  group = new THREE.Group()
  private chunks = new Map<string, Chunk>()
  private tuftGeo = tuftGeometry(0.5, 0.36, 3)
  private reedGeo = tuftGeometry(1.0, 1.7, 2)
  private tuftMat: THREE.Material
  private reedMat: THREE.Material
  private daff = getKit('daffodil', 'cup')
  private musc = getKit('muscari', 'cup')

  constructor(private beds: Bed[], tex: TexSet, private cfg: GrassCfg) {
    this.tuftMat = tuftMaterial(tex.tuft, 0.1)
    this.reedMat = tuftMaterial(tex.reed, 0.2)
    grassUniforms.uFade0.value = cfg.radius * 0.62
    grassUniforms.uFade1.value = cfg.radius * 0.98
  }

  update(cam: THREE.Vector3, burst = 2) {
    const R = this.cfg.radius
    const cx0 = Math.floor((cam.x - R) / CHUNK)
    const cx1 = Math.floor((cam.x + R) / CHUNK)
    const cz0 = Math.floor((cam.z - R) / CHUNK)
    const cz1 = Math.floor((cam.z + R) / CHUNK)
    const need: { k: string; i: number; j: number; d: number }[] = []
    for (let i = cx0; i <= cx1; i++)
      for (let j = cz0; j <= cz1; j++) {
        const d = Math.hypot((i + 0.5) * CHUNK - cam.x, (j + 0.5) * CHUNK - cam.z)
        if (d < R + CHUNK * 0.6) {
          const k = i + ',' + j
          if (!this.chunks.has(k)) need.push({ k, i, j, d })
        }
      }
    need.sort((a, b) => a.d - b.d)
    for (let n = 0; n < Math.min(burst, need.length); n++) this.make(need[n].i, need[n].j)
    // evict
    for (const [k, c] of this.chunks) {
      if (Math.hypot(c.cx - cam.x, c.cz - cam.z) > R + CHUNK * 2.2) {
        c.meshes.forEach((m) => {
          this.group.remove(m)
          m.dispose()
        })
        this.chunks.delete(k)
      }
    }
  }

  private make(i: number, j: number) {
    const key = i + ',' + j
    const r = rng(i * 73856093 + j * 19349663)
    const x0 = i * CHUNK
    const z0 = j * CHUNK
    const chunk: Chunk = { key, cx: x0 + CHUNK / 2, cz: z0 + CHUNK / 2, meshes: [] }
    this.chunks.set(key, chunk)
    const n = Math.floor(CHUNK * CHUNK * this.cfg.density)
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const e = new THREE.Euler()
    const p = new THREE.Vector3()
    const s = new THREE.Vector3()
    const col = new THREE.Color()
    const spots: [number, number][] = []
    for (let k = 0; k < n; k++) {
      const x = x0 + r() * CHUNK
      const z = z0 + r() * CHUNK
      if (!isLawn(x, z, this.beds)) continue
      spots.push([x, z])
    }
    if (spots.length) {
      const mesh = new THREE.InstancedMesh(this.tuftGeo, this.tuftMat, spots.length)
      spots.forEach(([x, z], k) => {
        e.set((r() - 0.5) * 0.3, r() * TAU, (r() - 0.5) * 0.3)
        q.setFromEuler(e)
        const sc = 0.65 + r() * 1.0
        p.set(x, groundHeight(x, z) - 0.015, z)
        s.set(sc * (0.8 + r() * 0.5), sc * (0.7 + r() * 0.8), sc)
        m.compose(p, q, s)
        mesh.setMatrixAt(k, m)
        const v = 0.78 + r() * 0.4
        col.setRGB(v * (0.95 + r() * 0.1), v, v * (0.82 + r() * 0.2))
        mesh.setColorAt(k, col)
      })
      mesh.receiveShadow = true
      mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage)
      mesh.computeBoundingSphere()
      if (mesh.boundingSphere) mesh.boundingSphere.radius += 0.6
      this.group.add(mesh)
      chunk.meshes.push(mesh)
    }
    // naturalised bulbs in drifts
    const drift = fbm(chunk.cx * 0.045 + 5, chunk.cz * 0.045, 3, 21)
    if (drift > 0.5) {
      const kit = drift > 0.6 ? this.daff : this.musc
      const species = drift > 0.6 ? 'daffodil' : 'muscari'
      const colors = species === 'daffodil' ? ['#f7cd18', '#fff2b0', '#f7cd18'] : ['#3a4ec6']
      const pts: [number, number, THREE.Color][] = []
      const tries = Math.floor(CHUNK * CHUNK * (species === 'daffodil' ? 1.8 : 4))
      for (let k = 0; k < tries; k++) {
        const x = x0 + r() * CHUNK
        const z = z0 + r() * CHUNK
        const dn = fbm(x * 0.09 + 11, z * 0.09, 3, 5)
        if (dn < 0.52 || !isLawn(x, z, this.beds)) continue
        pts.push([x, z, new THREE.Color(colors[Math.floor(r() * colors.length)]).multiplyScalar(0.85 + r() * 0.25)])
      }
      if (pts.length) {
        const mesh = new THREE.InstancedMesh(kit.lods[1], flowerMaterial(species, 0), pts.length)
        pts.forEach(([x, z, c], k) => {
          e.set((r() - 0.5) * 0.25, r() * TAU, (r() - 0.5) * 0.25)
          q.setFromEuler(e)
          const sc = 0.85 + r() * 0.35
          p.set(x, groundHeight(x, z), z)
          s.setScalar(sc)
          m.compose(p, q, s)
          mesh.setMatrixAt(k, m)
          mesh.setColorAt(k, c)
        })
        mesh.receiveShadow = true
        mesh.computeBoundingSphere()
        if (mesh.boundingSphere) mesh.boundingSphere.radius += 0.5
        this.group.add(mesh)
        chunk.meshes.push(mesh)
      }
    }
    // reeds on the shore
    if (waterSD(chunk.cx, chunk.cz) < 24) {
      const pts: [number, number][] = []
      for (let k = 0; k < 90; k++) {
        const x = x0 + r() * CHUNK
        const z = z0 + r() * CHUNK
        const sd = waterSD(x, z)
        if (sd > -0.5 && sd < 2.0 && fbm(x * 0.2, z * 0.2, 2, 3) > 0.35) pts.push([x, z])
      }
      if (pts.length) {
        const mesh = new THREE.InstancedMesh(this.reedGeo, this.reedMat, pts.length)
        pts.forEach(([x, z], k) => {
          e.set(0, r() * TAU, 0)
          q.setFromEuler(e)
          const sc = 0.7 + r() * 0.8
          p.set(x, groundHeight(x, z) - 0.05, z)
          s.set(sc, sc * (0.8 + r() * 0.5), sc)
          m.compose(p, q, s)
          mesh.setMatrixAt(k, m)
          mesh.setColorAt(k, col.setRGB(0.8 + r() * 0.3, 0.8 + r() * 0.25, 0.7))
        })
        mesh.receiveShadow = true
        mesh.computeBoundingSphere()
        if (mesh.boundingSphere) mesh.boundingSphere.radius += 1
        this.group.add(mesh)
        chunk.meshes.push(mesh)
      }
    }
  }
  dispose() {
    for (const c of this.chunks.values()) c.meshes.forEach((m) => m.dispose())
    this.tuftGeo.dispose()
    this.reedGeo.dispose()
  }
}

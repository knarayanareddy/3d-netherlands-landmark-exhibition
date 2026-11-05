import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/* ------------------------------------------------------------------ */
/*  Texture loading (CC0 PBR textures from Poly Haven, inlined)        */
/* ------------------------------------------------------------------ */
const files = import.meta.glob("../assets/tex/*.jpg", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

export const loadingManager = new THREE.LoadingManager();
const loader = new THREE.TextureLoader(loadingManager);
const cache = new Map<string, THREE.Texture>();

/** resolves once every texture requested so far has decoded */
export function whenTexturesLoaded(progress?: (f: number) => void): Promise<void> {
  return new Promise((res) => {
    const check = () => {
      const all = [...cache.values()];
      const done = all.filter((t) => t.image).length;
      progress?.(all.length ? done / all.length : 1);
      if (done >= all.length) res();
      else setTimeout(check, 60);
    };
    check();
  });
}

export let MAX_ANISO = 8;
export function setAniso(n: number) {
  MAX_ANISO = n;
  cache.forEach((t) => (t.anisotropy = n));
}

function tx(name: string, srgb: boolean): THREE.Texture {
  const key = name + srgb;
  const hit = cache.get(key);
  if (hit) return hit;
  const url = files[`../assets/tex/${name}.jpg`];
  const t = loader.load(url);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = MAX_ANISO;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  cache.set(key, t);
  return t;
}

/* ------------------------------------------------------------------ */
/*  Material helpers                                                   */
/* ------------------------------------------------------------------ */
interface PBROpts {
  color?: number;
  rough?: number;
  metal?: number;
  normal?: number;
  macro?: number;
  grime?: number;
  side?: THREE.Side;
}

const NOISE_GLSL = /* glsl */ `
float h21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y);}
`;

/** world-space macro colour variation + weathering (kills visible tiling) */
export function patch(m: THREE.MeshStandardMaterial, macro: number, grime: number) {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uMacro = { value: macro };
    sh.uniforms.uGrime = { value: grime };
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vWP;")
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvWP = (modelMatrix * vec4(transformed,1.0)).xyz;"
      );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>\nvarying vec3 vWP;\nuniform float uMacro;\nuniform float uGrime;\n${NOISE_GLSL}`
      )
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
        float mn = vn(vWP.xz*0.045)*0.55 + vn(vWP.xz*0.19+7.0)*0.3 + vn(vWP.xz*0.83+3.0)*0.15;
        diffuseColor.rgb *= 1.0 + (mn-0.5)*uMacro;
        float stk = vn(vec2((vWP.x+vWP.z)*2.3, vWP.y*0.18));
        float low = 1.0 - smoothstep(0.0, 2.2, vWP.y);
        diffuseColor.rgb *= 1.0 - uGrime*(low*0.45 + smoothstep(0.55,0.95,stk)*0.35);`
      );
  };
  m.customProgramCacheKey = () => `patch${macro}_${grime}`;
}

export function pbr(id: string, tile: number, o: PBROpts = {}) {
  const m = new THREE.MeshStandardMaterial({
    map: tx(id + "_diff", true),
    normalMap: tx(id + "_nor", false),
    roughness: o.rough ?? 0.9,
    metalness: o.metal ?? 0,
    color: o.color ?? 0xffffff,
    side: o.side ?? THREE.FrontSide,
  });
  m.normalScale.set(o.normal ?? 1, o.normal ?? 1);
  m.userData.tile = tile;
  patch(m, o.macro ?? 0.35, o.grime ?? 0.0);
  return m;
}

export function plain(color: number, rough = 0.8, metal = 0, tile = 2): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
  m.userData.tile = tile;
  return m;
}

export function glassMat(color = 0xbfd8e0, opacity = 0.16) {
  const m = new THREE.MeshPhysicalMaterial({
    color,
    transparent: true,
    opacity,
    roughness: 0.03,
    metalness: 0,
    clearcoat: 1,
    side: THREE.DoubleSide,
    depthWrite: false,
    envMapIntensity: 1.4,
  });
  m.userData.tile = 2;
  return m;
}

/* ---- canvas procedural textures ---- */
export function canvasTex(
  w: number,
  h: number,
  draw: (c: CanvasRenderingContext2D, w: number, h: number) => void,
  srgb = true
) {
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  draw(cv.getContext("2d")!, w, h);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  return t;
}

let seedv = 1337;
export function rnd() {
  seedv = (seedv * 16807) % 2147483647;
  return (seedv - 1) / 2147483646;
}
export function setSeed(s: number) {
  seedv = s;
}
export const rr = (a: number, b: number) => a + (b - a) * rnd();
export const pick = <T,>(a: T[]): T => a[Math.floor(rnd() * a.length)];

export function noiseTex(size = 256, base = 128, amp = 60, blotch = 0, srgb = false) {
  return canvasTex(
    size,
    size,
    (c, w, h) => {
      const img = c.createImageData(w, h);
      for (let i = 0; i < w * h; i++) {
        const v = base + (Math.random() - 0.5) * amp;
        img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
        img.data[i * 4 + 3] = 255;
      }
      c.putImageData(img, 0, 0);
      for (let i = 0; i < blotch; i++) {
        c.fillStyle = `rgba(${Math.random() < 0.5 ? 255 : 0},${Math.random() < 0.5 ? 255 : 0},${Math.random() < 0.5 ? 255 : 0},0.05)`;
        c.beginPath();
        c.arc(Math.random() * w, Math.random() * h, 4 + Math.random() * 30, 0, 7);
        c.fill();
      }
    },
    srgb
  );
}

/* ------------------------------------------------------------------ */
/*  Geometry helpers with world-scale UVs (tile = metres per texture)  */
/* ------------------------------------------------------------------ */
export function mbox(w: number, h: number, d: number, tile: number) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const dims = [
    [d, h],
    [d, h],
    [w, d],
    [w, d],
    [w, h],
    [w, h],
  ];
  for (let f = 0; f < 6; f++)
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      uv.setXY(k, (uv.getX(k) * dims[f][0]) / tile, (uv.getY(k) * dims[f][1]) / tile);
    }
  return g;
}
export function mplane(w: number, d: number, tile: number) {
  const g = new THREE.PlaneGeometry(w, d);
  g.rotateX(-Math.PI / 2);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / tile, (uv.getY(i) * d) / tile);
  return g;
}
export function mvplane(w: number, h: number, tile: number) {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / tile, (uv.getY(i) * h) / tile);
  return g;
}
export function mcyl(rt: number, rb: number, h: number, seg: number, tile: number, open = false, a0 = 0, al = Math.PI * 2) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1, open, a0, al);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const circ = (rt + rb) * Math.PI * (al / (Math.PI * 2));
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * circ) / tile, (uv.getY(i) * h) / tile);
  return g;
}
/** Flat polygon (xz) with world uvs; y = 0 */
export function polyFlat(pts: [number, number][], tile: number) {
  const shape = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, z)));
  const g = new THREE.ShapeGeometry(shape);
  g.rotateX(Math.PI / 2); // shape y -> world z (flip so normal is +y)
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / tile, pos.getZ(i) / tile);
  return g;
}
/** Ribbon along a polyline (xz) at height y. Used for paths, moats, rails. */
export function ribbon(pts: [number, number][], width: number, tile: number, y = 0) {
  const pos: number[] = [];
  const uvs: number[] = [];
  const idx: number[] = [];
  let acc = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    let dx = b[0] - a[0],
      dz = b[1] - a[1];
    const l = Math.hypot(dx, dz) || 1;
    dx /= l;
    dz /= l;
    const nx = -dz,
      nz = dx;
    if (i > 0) acc += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]);
    pos.push(p[0] + (nx * width) / 2, y, p[1] + (nz * width) / 2, p[0] - (nx * width) / 2, y, p[1] - (nz * width) / 2);
    uvs.push(0, acc / tile, width / tile, acc / tile);
    if (i < pts.length - 1) {
      const k = i * 2;
      idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // make sure normals face up
  const n = g.attributes.normal as THREE.BufferAttribute;
  if (n.getY(0) < 0) {
    for (let i = 0; i < idx.length; i += 3) {
      const t = idx[i + 1];
      idx[i + 1] = idx[i + 2];
      idx[i + 2] = t;
    }
    g.setIndex(idx);
    g.computeVertexNormals();
  }
  return g;
}

export function smoothPath(pts: [number, number][], per = 8): [number, number][] {
  if (pts.length < 3) return pts;
  const v = pts.map(([x, z]) => new THREE.Vector3(x, 0, z));
  const c = new THREE.CatmullRomCurve3(v, false, "centripetal");
  return c.getPoints((pts.length - 1) * per).map((p) => [p.x, p.z] as [number, number]);
}

/* ------------------------------------------------------------------ */
/*  Scene builder: static batching + colliders + registries            */
/* ------------------------------------------------------------------ */
export type Seg = [number, number, number, number, number]; // ax,az,bx,bz,radius

export interface Zone {
  id: string;
  name: string;
  kind: "outdoor" | "interior";
  /** polygon in xz */
  poly: [number, number][];
  color: string;
  dark?: number; // interior light factor (0 dark … 1 bright)
  fog?: number; // tint when underwater/inside tunnels
}
export interface POI {
  id: string;
  name: string;
  x: number;
  z: number;
  yaw: number;
  zone: string;
  blurb: string;
}
export interface LightSpot {
  x: number;
  y: number;
  z: number;
  color: number;
  intensity: number;
  dist: number;
  night: boolean; // only lit at night
}
export interface GlowEntry {
  mat: THREE.MeshStandardMaterial;
  day: number;
  night: number;
}

interface Pending {
  geo: THREE.BufferGeometry;
  mat: THREE.Material;
  cast: boolean;
  recv: boolean;
}

const CELL = 70;

export class Builder {
  root = new THREE.Group();
  private pend: Pending[] = [];
  colliders: Seg[] = [];
  zones: Zone[] = [];
  pois: POI[] = [];
  lights: LightSpot[] = [];
  glow: GlowEntry[] = [];
  tmp = new THREE.Matrix4();
  q = new THREE.Quaternion();
  e = new THREE.Euler();

  m(x: number, y: number, z: number, ry = 0, rx = 0, rz = 0, s = 1) {
    this.e.set(rx, ry, rz, "YXZ");
    this.q.setFromEuler(this.e);
    return this.tmp.compose(new THREE.Vector3(x, y, z), this.q, new THREE.Vector3(s, s, s)).clone();
  }

  /** add geometry (consumed) with matrix */
  addM(geo: THREE.BufferGeometry, mat: THREE.Material, M: THREE.Matrix4, cast = true, recv = true) {
    const g = geo.clone();
    g.applyMatrix4(M);
    this.pend.push({ geo: g, mat, cast, recv });
  }
  add(geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, ry = 0, rx = 0, rz = 0, cast = true, recv = true) {
    this.addM(geo, mat, this.m(x, y, z, ry, rx, rz), cast, recv);
  }

  /** box with base at y, centred on x,z */
  box(mat: THREE.MeshStandardMaterial, x: number, z: number, w: number, d: number, h: number, o: { y?: number; ry?: number; collide?: boolean; cast?: boolean } = {}) {
    const y = o.y ?? 0;
    this.add(mbox(w, h, d, mat.userData.tile ?? 2), mat, x, y + h / 2, z, o.ry ?? 0, 0, 0, o.cast ?? true, true);
    if (o.collide) this.collideBox(x, z, w, d, o.ry ?? 0);
  }
  cyl(mat: THREE.MeshStandardMaterial, x: number, z: number, rt: number, rb: number, h: number, o: { y?: number; seg?: number; collide?: boolean; open?: boolean } = {}) {
    const y = o.y ?? 0;
    this.add(mcyl(rt, rb, h, o.seg ?? 24, mat.userData.tile ?? 2, o.open), mat, x, y + h / 2, z);
    if (o.collide) this.collideCircle(x, z, Math.max(rt, rb), o.seg ?? 16);
  }
  wall(mat: THREE.MeshStandardMaterial, x1: number, z1: number, x2: number, z2: number, h: number, th = 0.4, o: { y?: number; collide?: boolean } = {}) {
    const len = Math.hypot(x2 - x1, z2 - z1);
    const ry = Math.atan2(-(z2 - z1), x2 - x1);
    this.box(mat, (x1 + x2) / 2, (z1 + z2) / 2, len, th, h, { y: o.y, ry, collide: false });
    if (o.collide !== false) this.colliders.push([x1, z1, x2, z2, th / 2 + 0.05]);
  }
  /** wall with openings: gaps = [[t0,t1],...] in metres along the wall */
  wallGaps(mat: THREE.MeshStandardMaterial, x1: number, z1: number, x2: number, z2: number, h: number, gaps: [number, number][], th = 0.4, lintel = 0) {
    const len = Math.hypot(x2 - x1, z2 - z1);
    const dx = (x2 - x1) / len,
      dz = (z2 - z1) / len;
    let t = 0;
    const g = [...gaps].sort((a, b) => a[0] - b[0]);
    const at = (s: number): [number, number] => [x1 + dx * s, z1 + dz * s];
    for (const [a, b] of g) {
      if (a > t + 0.01) {
        const p = at(t),
          q = at(a);
        this.wall(mat, p[0], p[1], q[0], q[1], h, th);
      }
      if (lintel > 0) {
        const p = at(a),
          q = at(b);
        this.wall(mat, p[0], p[1], q[0], q[1], h - lintel, th, { y: lintel, collide: false });
      }
      t = b;
    }
    if (t < len - 0.01) {
      const p = at(t),
        q = at(len);
      this.wall(mat, p[0], p[1], q[0], q[1], h, th);
    }
  }
  collideBox(x: number, z: number, w: number, d: number, ry = 0) {
    const c = Math.cos(ry),
      s = Math.sin(ry);
    // rotation about Y by ry maps local (lx,lz) -> (lx*c + lz*s, -lx*s + lz*c)
    const P = ([lx, lz]: [number, number]): [number, number] => [x + lx * c + lz * s, z - lx * s + lz * c];
    const a = P([-w / 2, -d / 2]),
      b = P([w / 2, -d / 2]),
      cc = P([w / 2, d / 2]),
      dd = P([-w / 2, d / 2]);
    this.colliders.push([a[0], a[1], b[0], b[1], 0.1], [b[0], b[1], cc[0], cc[1], 0.1], [cc[0], cc[1], dd[0], dd[1], 0.1], [dd[0], dd[1], a[0], a[1], 0.1]);
  }
  collideCircle(x: number, z: number, r: number, seg = 14) {
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2,
        a1 = ((i + 1) / seg) * Math.PI * 2;
      this.colliders.push([x + Math.cos(a0) * r, z + Math.sin(a0) * r, x + Math.cos(a1) * r, z + Math.sin(a1) * r, 0.1]);
    }
  }
  collidePoly(pts: [number, number][], closed = true, r = 0.15) {
    for (let i = 0; i < pts.length - (closed ? 0 : 1); i++) {
      const a = pts[i],
        b = pts[(i + 1) % pts.length];
      this.colliders.push([a[0], a[1], b[0], b[1], r]);
    }
  }
  /** curved wall (cylinder segment) with colliders; angles: 0 = +z, π/2 = +x */
  arcWall(mat: THREE.MeshStandardMaterial, cx: number, cz: number, r: number, h: number, a0: number, a1: number, o: { y?: number; collide?: boolean; seg?: number } = {}) {
    const seg = o.seg ?? Math.max(8, Math.ceil(((a1 - a0) / (Math.PI * 2)) * 48));
    const g = mcyl(r, r, h, seg, mat.userData.tile ?? 2, true, a0, a1 - a0);
    this.add(g, mat.side === THREE.DoubleSide ? mat : dmFor(mat), cx, (o.y ?? 0) + h / 2, cz);
    if (o.collide !== false) {
      const n = Math.max(4, Math.ceil(seg / 2));
      for (let i = 0; i < n; i++) {
        const t0 = a0 + ((a1 - a0) * i) / n,
          t1 = a0 + ((a1 - a0) * (i + 1)) / n;
        this.colliders.push([cx + Math.sin(t0) * r, cz + Math.cos(t0) * r, cx + Math.sin(t1) * r, cz + Math.cos(t1) * r, 0.15]);
      }
    }
  }

  /** register zone polygon (rect helper) */
  rectPoly(cx: number, cz: number, w: number, d: number): [number, number][] {
    return [
      [cx - w / 2, cz - d / 2],
      [cx + w / 2, cz - d / 2],
      [cx + w / 2, cz + d / 2],
      [cx - w / 2, cz + d / 2],
    ];
  }
  zone(z: Zone) {
    this.zones.push(z);
  }
  poi(p: POI) {
    this.pois.push(p);
  }
  light(l: LightSpot) {
    this.lights.push(l);
  }
  glowMat(color: number, day = 0, night = 3, emissive = color) {
    const m = new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: day, roughness: 0.4 });
    m.userData.tile = 2;
    this.glow.push({ mat: m, day, night });
    return m;
  }

  /** merge everything pending into per-material, per-cell meshes */
  finalize(): THREE.Group {
    const buckets = new Map<string, Pending[]>();
    for (const p of this.pend) {
      const g = p.geo;
      if (!g.index) {
        const n = g.attributes.position.count;
        const idx = new Uint32Array(n);
        for (let i = 0; i < n; i++) idx[i] = i;
        g.setIndex(new THREE.BufferAttribute(idx, 1));
      }
      for (const k of Object.keys(g.attributes)) if (!["position", "normal", "uv", "color"].includes(k)) g.deleteAttribute(k);
      if (!g.attributes.uv) {
        g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      }
      if (!g.attributes.normal) g.computeVertexNormals();
      if ((p.mat as THREE.MeshStandardMaterial).vertexColors && !g.attributes.color) {
        g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3));
      }
      g.computeBoundingBox();
      const c = g.boundingBox!.getCenter(new THREE.Vector3());
      const key = `${p.mat.uuid}|${Math.floor(c.x / CELL)}|${Math.floor(c.z / CELL)}|${p.cast ? 1 : 0}${p.recv ? 1 : 0}`;
      let arr = buckets.get(key);
      if (!arr) buckets.set(key, (arr = []));
      arr.push(p);
    }
    for (const arr of buckets.values()) {
      // protect against 16-bit overflow – chunks use 32-bit indices
      const merged = mergeGeometries(arr.map((a) => a.geo), false);
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, arr[0].mat);
      mesh.castShadow = arr[0].cast && !(arr[0].mat as THREE.Material).transparent;
      mesh.receiveShadow = arr[0].recv;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      if ((arr[0].mat as THREE.Material).transparent) mesh.renderOrder = 2;
      this.root.add(mesh);
      arr.forEach((a) => a.geo.dispose());
    }
    this.pend = [];
    return this.root;
  }
}

const dmCache = new WeakMap<THREE.Material, THREE.Material>();
function dmFor(mat: THREE.MeshStandardMaterial): THREE.Material {
  let d = dmCache.get(mat);
  if (!d) {
    d = mat.clone();
    d.userData = mat.userData;
    (d as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
    (d as THREE.MeshStandardMaterial).onBeforeCompile = mat.onBeforeCompile;
    (d as THREE.MeshStandardMaterial).customProgramCacheKey = mat.customProgramCacheKey;
    dmCache.set(mat, d);
  }
  return d;
}

export function pointInPoly(x: number, z: number, poly: [number, number][]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i],
      [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

import * as THREE from "three";
import { Builder, mcyl, rnd, rr, pick } from "./kit";
import { M } from "./mats";

const nz = (x: number, y: number, z: number) =>
  Math.sin(x * 2.1 + y * 1.3) * Math.cos(z * 1.9 - x * 0.7) + Math.sin(y * 3.1 + z * 2.3) * 0.5 + Math.cos(x * 4.3 + z * 3.7) * 0.25;

/** displaced icosphere with spherical normals + baked vertex shading => soft, volumetric foliage */
export function blob(radius: number, squashY = 0.85, jitter = 0.28, dark = 0.55, seed = 0) {
  const g = new THREE.IcosahedronGeometry(radius, 3);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const n = pos.count;
  const nor = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    const f = nz(v.x * 2 + seed, v.y * 2 + seed * 0.7, v.z * 2 - seed);
    const r = radius * (1 + jitter * f * 0.5);
    const px = v.x * r,
      py = v.y * r * squashY,
      pz = v.z * r;
    pos.setXYZ(i, px, py, pz);
    nor[i * 3] = v.x;
    nor[i * 3 + 1] = v.y * 0.8 + 0.2;
    nor[i * 3 + 2] = v.z;
    const t = (v.y + 1) / 2;
    const shade = dark + (1 - dark) * Math.pow(t, 0.8) + (f * 0.5) * 0.12;
    col[i * 3] = shade;
    col[i * 3 + 1] = shade;
    col[i * 3 + 2] = shade * 0.96;
    uv.setXY(i, uv.getX(i) * 5, uv.getY(i) * 3);
  }
  g.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return g;
}

function cone(r: number, h: number, dark: number) {
  const g = new THREE.ConeGeometry(r, h, 14, 4);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const t = (pos.getY(i) + h / 2) / h;
    const rr2 = Math.hypot(pos.getX(i), pos.getZ(i));
    const wob = 1 + Math.sin(Math.atan2(pos.getZ(i), pos.getX(i)) * 9 + t * 5) * 0.08;
    pos.setX(i, pos.getX(i) * wob);
    pos.setZ(i, pos.getZ(i) * wob);
    const s = dark + (1 - dark) * t * 0.7 + (rr2 / r) * 0.15;
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = s;
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 5, uv.getY(i) * 2);
  g.computeVertexNormals();
  return g;
}

function bentCard(w: number, l: number, bend: number, seg = 5) {
  const g = new THREE.PlaneGeometry(w, l, 1, seg);
  g.translate(0, l / 2, 0);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const t = p.getY(i) / l;
    p.setZ(i, p.getZ(i) + bend * t * t * l * 0.8 + Math.abs(p.getX(i)) * 0.18 * (1 - t * 0.4));
    p.setY(i, p.getY(i) * (1 - 0.25 * t * t * bend));
  }
  g.computeVertexNormals();
  return g;
}

export type TreeKind = "oak" | "plane" | "conifer" | "palm" | "acacia" | "birch" | "shrub";

export function tree(b: Builder, kind: TreeKind, x: number, z: number, s = 1, collide = true) {
  const leaf = pick([M.leafOak, M.leafLight]);
  const bark = M.bark;
  switch (kind) {
    case "oak":
    case "plane": {
      const h = rr(3.4, 5) * s;
      const rad = rr(0.2, 0.3) * s;
      b.add(mcyl(rad * 0.65, rad, h, 8, 1.5), bark, x, h / 2, z, 0, rr(-0.05, 0.05), rr(-0.05, 0.05));
      const cr = (kind === "oak" ? rr(2.8, 3.8) : rr(2.4, 3.2)) * s;
      const mat = kind === "oak" ? (rnd() < 0.5 ? M.leafOak : M.leafLight) : leaf;
      b.add(blob(cr, 0.8, 0.3, 0.5, rnd() * 9), mat, x, h + cr * 0.45, z);
      const n = 3 + Math.floor(rnd() * 2);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rnd();
        const rd = cr * rr(0.55, 0.8);
        b.add(blob(cr * rr(0.55, 0.75), 0.8, 0.3, 0.5, rnd() * 9), mat, x + Math.cos(a) * rd, h + cr * rr(0.15, 0.55), z + Math.sin(a) * rd);
      }
      // branches
      for (let i = 0; i < 3; i++) {
        const a = rnd() * 6.28;
        b.add(mcyl(0.05 * s, 0.1 * s, 2 * s, 5, 1.5), bark, x + Math.cos(a) * 0.5 * s, h * 0.85, z + Math.sin(a) * 0.5 * s, a, 0, 0.8);
      }
      break;
    }
    case "birch": {
      const h = rr(4, 6) * s;
      b.add(mcyl(0.08 * s, 0.14 * s, h, 7, 1.5), M.plasterWhite, x, h / 2, z);
      const cr = rr(1.7, 2.3) * s;
      b.add(blob(cr, 1.1, 0.3, 0.55, rnd() * 9), M.leafLight, x, h + cr * 0.4, z);
      b.add(blob(cr * 0.7, 1.0, 0.3, 0.55, rnd() * 9), M.leafLight, x + cr * 0.4, h - cr * 0.1, z + cr * 0.3);
      break;
    }
    case "conifer": {
      const h = rr(7, 11) * s;
      b.add(mcyl(0.12 * s, 0.25 * s, h * 0.35, 7, 1.5), bark, x, h * 0.17, z);
      for (let i = 0; i < 4; i++) {
        const t = i / 4;
        const r = (h * 0.28 * (1 - t * 0.75)) ;
        b.add(cone(r, h * 0.38, 0.38), M.leafDark, x, h * (0.2 + t * 0.62) + h * 0.19, z, rnd() * 6);
      }
      break;
    }
    case "acacia": {
      const h = rr(3.8, 5.2) * s;
      b.add(mcyl(0.12 * s, 0.22 * s, h, 7, 1.5), bark, x, h / 2, z, 0, 0.06, 0.04);
      b.add(mcyl(0.06 * s, 0.1 * s, 2.2 * s, 5, 1.5), bark, x + 0.6 * s, h - 0.2, z, 0, 0, -0.9);
      b.add(mcyl(0.06 * s, 0.1 * s, 2.2 * s, 5, 1.5), bark, x - 0.6 * s, h - 0.2, z + 0.3, 0, 0, 0.9);
      const cr = rr(3.6, 4.6) * s;
      b.add(blob(cr, 0.28, 0.35, 0.6, rnd() * 9), M.leafLight, x, h + 0.6, z);
      b.add(blob(cr * 0.65, 0.3, 0.3, 0.6, rnd() * 9), M.leafLight, x + cr * 0.5, h + 0.3, z - cr * 0.3);
      b.add(blob(cr * 0.6, 0.3, 0.3, 0.6, rnd() * 9), M.leafLight, x - cr * 0.55, h + 0.2, z + cr * 0.2);
      break;
    }
    case "palm": {
      const h = rr(4.5, 7.5) * s;
      const lean = rr(-0.25, 0.25);
      const segs = 5;
      for (let i = 0; i < segs; i++) {
        const t0 = i / segs;
        b.add(mcyl(0.16 * s * (1 - t0 * 0.4), 0.18 * s * (1 - t0 * 0.4 + 0.08), (h / segs) * 1.05, 8, 1.2), bark, x + lean * h * t0 * t0 * 0.5, (h / segs) * (i + 0.5), z, 0, 0, -lean * t0 * 0.7);
      }
      const topx = x + lean * h * 0.5;
      for (let i = 0; i < 11; i++) {
        const a = (i / 11) * Math.PI * 2 + rnd() * 0.3;
        b.add(bentCard(1.5 * s, rr(3, 4) * s, rr(0.7, 1.3)), M.frond, topx, h - 0.1, z, a, rr(0.8, 1.35), 0, false, true);
      }
      break;
    }
    case "shrub": {
      const n = 2 + Math.floor(rnd() * 2);
      for (let i = 0; i < n; i++) {
        const r = rr(0.8, 1.4) * s;
        b.add(blob(r, 0.8, 0.3, 0.5, rnd() * 9), pick([M.leafOak, M.leafLight, M.leafDark]), x + rr(-0.7, 0.7) * s, r * 0.6, z + rr(-0.7, 0.7) * s);
      }
      return;
    }
  }
  if (collide) b.collideCircle(x, z, 0.38 * s, 5);
}

export function tropicalPlant(b: Builder, x: number, z: number, s = 1) {
  const n = 7 + Math.floor(rnd() * 4);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rnd() * 0.5;
    b.add(bentCard(rr(0.8, 1.2) * s, rr(1.8, 3) * s, rr(0.5, 1.1)), M.bigLeaf, x, 0.1, z, a, rr(0.3, 0.9), 0, false, true);
  }
}

export function tufts(b: Builder, x: number, z: number, count: number, radius: number, o: { dry?: boolean; h?: number } = {}) {
  const mat = o.dry ? M.tuftDry : M.tuft;
  const pl = new THREE.PlaneGeometry(1, 1);
  pl.translate(0, 0.5, 0);
  for (let i = 0; i < count; i++) {
    const a = rnd() * Math.PI * 2;
    const d = Math.sqrt(rnd()) * radius;
    const s = rr(0.7, 1.3) * (o.h ?? 0.8);
    const yaw = rnd() * Math.PI;
    const px = x + Math.cos(a) * d,
      pz = z + Math.sin(a) * d;
    const g1 = pl.clone();
    g1.scale(s * 1.2, s, s);
    b.add(g1, mat, px, 0, pz, yaw, 0, 0, false, true);
    b.add(g1, mat, px, 0, pz, yaw + Math.PI / 2, 0, 0, false, true);
  }
}

export function tuftsPoly(b: Builder, poly: [number, number][], density: number, o: { dry?: boolean; h?: number } = {}) {
  let minx = 1e9,
    maxx = -1e9,
    minz = 1e9,
    maxz = -1e9;
  poly.forEach(([x, z]) => {
    minx = Math.min(minx, x);
    maxx = Math.max(maxx, x);
    minz = Math.min(minz, z);
    maxz = Math.max(maxz, z);
  });
  const area = (maxx - minx) * (maxz - minz);
  const n = Math.floor(area * density);
  const pl = new THREE.PlaneGeometry(1, 1);
  pl.translate(0, 0.5, 0);
  const mat = o.dry ? M.tuftDry : M.tuft;
  for (let i = 0; i < n; i++) {
    const x = rr(minx, maxx),
      z = rr(minz, maxz);
    if (!inPoly(x, z, poly)) continue;
    const s = rr(0.6, 1.2) * (o.h ?? 0.7);
    const g = pl.clone();
    g.scale(s * 1.3, s, s);
    const yaw = rnd() * Math.PI;
    b.add(g, mat, x, 0, z, yaw, 0, 0, false, true);
    b.add(g, mat, x, 0, z, yaw + Math.PI / 2, 0, 0, false, true);
  }
}

function inPoly(x: number, z: number, poly: [number, number][]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i],
      [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

export function forestPoly(b: Builder, poly: [number, number][], n: number, kinds: TreeKind[], s = 1, avoid?: (x: number, z: number) => boolean) {
  let minx = 1e9,
    maxx = -1e9,
    minz = 1e9,
    maxz = -1e9;
  poly.forEach(([x, z]) => {
    minx = Math.min(minx, x);
    maxx = Math.max(maxx, x);
    minz = Math.min(minz, z);
    maxz = Math.max(maxz, z);
  });
  let placed = 0,
    guard = 0;
  while (placed < n && guard++ < n * 30) {
    const x = rr(minx, maxx),
      z = rr(minz, maxz);
    if (!inPoly(x, z, poly)) continue;
    if (avoid && avoid(x, z)) continue;
    tree(b, pick(kinds), x, z, s * rr(0.8, 1.25));
    placed++;
  }
}

export function flowerBed(b: Builder, cx: number, cz: number, w: number, d: number, colors: number[]) {
  const mats = colors.map((c) => {
    const m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 });
    m.userData.tile = 1;
    return m;
  });
  b.box(M.mud, cx, cz, w, d, 0.18);
  const n = Math.floor(w * d * 6);
  const sp = new THREE.IcosahedronGeometry(0.11, 1);
  for (let i = 0; i < n; i++) {
    const m = mats[Math.floor(rnd() * mats.length)];
    b.add(sp, m, cx + rr(-w / 2, w / 2), 0.28 + rnd() * 0.12, cz + rr(-d / 2, d / 2), 0, 0, 0, false, true);
  }
  tufts(b, cx, cz, Math.floor(w * d * 0.6), Math.max(w, d) * 0.5, { h: 0.5 });
}

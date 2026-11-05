import * as THREE from "three";
import { Builder, canvasTex, mbox, mcyl, mvplane, ribbon, rnd, rr } from "./kit";
import { M } from "./mats";
import type { Animal, Swimmer, FishSchool, Butterflies, Flyer } from "./animals";

export interface Ctx {
  b: Builder;
  dyn: THREE.Group;
  animals: Animal[];
  swimmers: Swimmer[];
  schools: FishSchool[];
  butterflies: Butterflies[];
  flyers: Flyer[];
  lampMat: THREE.MeshStandardMaterial;
  windowGlow: THREE.MeshStandardMaterial;
  tankGlow: THREE.MeshStandardMaterial;
  /** objects that only update when the player is near */
  nearby: { pos: THREE.Vector3; r: number; objs: THREE.Object3D[]; update?: (dt: number, t: number) => void }[];
}

const rotY = (x1: number, z1: number, x2: number, z2: number) => Math.atan2(-(z2 - z1), x2 - x1);

export function glassWall(
  b: Builder,
  x1: number,
  z1: number,
  x2: number,
  z2: number,
  y0: number,
  y1: number,
  o: { mull?: number; collide?: boolean; mat?: THREE.MeshStandardMaterial; frame?: THREE.MeshStandardMaterial } = {}
) {
  const len = Math.hypot(x2 - x1, z2 - z1);
  const ry = rotY(x1, z1, x2, z2);
  const h = y1 - y0;
  const mat = o.mat ?? M.glass;
  const frame = o.frame ?? M.steelDark;
  b.add(mvplane(len, h, 2), mat, (x1 + x2) / 2, y0 + h / 2, (z1 + z2) / 2, ry, 0, 0, false, false);
  const dx = (x2 - x1) / len,
    dz = (z2 - z1) / len;
  const step = o.mull ?? 3;
  const n = Math.max(1, Math.round(len / step));
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * len;
    b.box(frame, x1 + dx * t, z1 + dz * t, 0.1, 0.14, h, { y: y0, ry, cast: false });
  }
  b.box(frame, (x1 + x2) / 2, (z1 + z2) / 2, len, 0.14, 0.12, { y: y1 - 0.12, ry, cast: false });
  b.box(frame, (x1 + x2) / 2, (z1 + z2) / 2, len, 0.16, 0.2, { y: y0, ry, cast: false });
  if (o.collide !== false) b.colliders.push([x1, z1, x2, z2, 0.2]);
}

/* wire-mesh texture for zoo fences */
let meshMat: THREE.MeshStandardMaterial | null = null;
function wire() {
  if (meshMat) return meshMat;
  const t = canvasTex(64, 64, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    c.strokeStyle = "#8f979c";
    c.lineWidth = 2;
    for (let i = -h; i < w + h; i += 16) {
      c.beginPath();
      c.moveTo(i, 0);
      c.lineTo(i + h, h);
      c.moveTo(i + h, 0);
      c.lineTo(i, h);
      c.stroke();
    }
  });
  meshMat = new THREE.MeshStandardMaterial({ map: t, alphaTest: 0.4, side: THREE.DoubleSide, metalness: 0.6, roughness: 0.5 });
  meshMat.userData.tile = 1.6;
  return meshMat;
}

export type FenceKind = "rail" | "mesh" | "glass" | "moat" | "rock" | "low" | "hedge";

/** Fence / barrier along a polyline. Colliders follow the visitor side. */
export function fence(b: Builder, pts: [number, number][], kind: FenceKind, o: { closed?: boolean; collide?: boolean; gap?: [number, number][] } = {}) {
  const n = pts.length - (o.closed ? 0 : 1);
  for (let i = 0; i < n; i++) {
    const [x1, z1] = pts[i];
    const [x2, z2] = pts[(i + 1) % pts.length];
    const len = Math.hypot(x2 - x1, z2 - z1);
    if (len < 0.1) continue;
    const ry = rotY(x1, z1, x2, z2);
    const dx = (x2 - x1) / len,
      dz = (z2 - z1) / len;
    const mx = (x1 + x2) / 2,
      mz = (z1 + z2) / 2;
    const posts = Math.max(1, Math.round(len / (kind === "mesh" ? 3.5 : 2.5)));
    const col = o.collide !== false;
    switch (kind) {
      case "rail": {
        for (let k = 0; k <= posts; k++) {
          const t = (k / posts) * len;
          b.box(M.woodDark, x1 + dx * t, z1 + dz * t, 0.14, 0.14, 1.15, { cast: false });
        }
        b.box(M.wood, mx, mz, len, 0.07, 0.1, { y: 1.0, ry, cast: false });
        b.box(M.wood, mx, mz, len, 0.07, 0.1, { y: 0.55, ry, cast: false });
        if (col) b.colliders.push([x1, z1, x2, z2, 0.15]);
        break;
      }
      case "low": {
        b.box(M.concrete, mx, mz, len, 0.3, 0.6, { ry, cast: false });
        if (col) b.colliders.push([x1, z1, x2, z2, 0.25]);
        break;
      }
      case "mesh": {
        for (let k = 0; k <= posts; k++) {
          const t = (k / posts) * len;
          b.box(M.steelDark, x1 + dx * t, z1 + dz * t, 0.14, 0.14, 4.2, { cast: false });
        }
        b.add(mvplane(len, 3.8, 1.6), wire(), mx, 2.1, mz, ry, 0, 0, false, false);
        b.box(M.steelDark, mx, mz, len, 0.08, 0.1, { y: 4.1, ry, cast: false });
        b.box(M.concrete, mx, mz, len, 0.2, 0.25, { ry, cast: false });
        if (col) b.colliders.push([x1, z1, x2, z2, 0.2]);
        break;
      }
      case "glass": {
        glassWall(b, x1, z1, x2, z2, 0, 3, { mull: 3, collide: col, mat: M.acrylic });
        break;
      }
      case "rock": {
        const r = Math.max(2, Math.round(len / 3));
        for (let k = 0; k < r; k++) {
          const t = ((k + 0.5) / r) * len;
          const s = rr(1.6, 2.4);
          const g = new THREE.IcosahedronGeometry(s, 1);
          const p = g.attributes.position as THREE.BufferAttribute;
          for (let v = 0; v < p.count; v++) p.setXYZ(v, p.getX(v) * rr(0.9, 1.15), p.getY(v) * 1.2, p.getZ(v) * rr(0.9, 1.15));
          g.computeVertexNormals();
          const uv = g.attributes.uv as THREE.BufferAttribute;
          for (let v = 0; v < uv.count; v++) uv.setXY(v, uv.getX(v) * 2, uv.getY(v) * 2);
          b.add(g, rnd() < 0.5 ? M.rock : M.rockGrey, x1 + dx * t, s * 0.9, z1 + dz * t, rnd() * 6);
        }
        if (col) b.colliders.push([x1, z1, x2, z2, 1.6]);
        break;
      }
      case "hedge": {
        b.box(M.leafDark as unknown as THREE.MeshStandardMaterial, mx, mz, len, 1.2, 1.6, { ry });
        if (col) b.colliders.push([x1, z1, x2, z2, 0.7]);
        break;
      }
      case "moat": {
        // water strip (3.5 m) with concrete kerb on the visitor side
        const nx = -dz,
          nz = dx;
        b.add(mbox(len, 0.3, 3.6, 2), M.moat, mx, 0.02, mz, ry, 0, 0, false, true);
        b.box(M.concrete, mx + nx * 1.9, mz + nz * 1.9, len, 0.35, 0.5, { ry, cast: false });
        b.box(M.concrete, mx - nx * 1.9, mz - nz * 1.9, len, 0.35, 0.5, { ry, cast: false });
        if (col) b.colliders.push([x1 + nx * 1.9, z1 + nz * 1.9, x2 + nx * 1.9, z2 + nz * 1.9, 0.2], [x1 - nx * 1.9, z1 - nz * 1.9, x2 - nx * 1.9, z2 - nz * 1.9, 0.2]);
        break;
      }
    }
  }
}

export function rectPts(cx: number, cz: number, w: number, d: number): [number, number][] {
  return [
    [cx - w / 2, cz - d / 2],
    [cx + w / 2, cz - d / 2],
    [cx + w / 2, cz + d / 2],
    [cx - w / 2, cz + d / 2],
  ];
}

/** rectangular fence loop with openings on given sides */
export function fenceRect(b: Builder, cx: number, cz: number, w: number, d: number, kind: FenceKind, openings: { side: "n" | "s" | "e" | "w"; at: number; width: number }[] = []) {
  const hx = w / 2,
    hz = d / 2;
  const sides: Record<string, [number, number, number, number]> = {
    n: [cx - hx, cz - hz, cx + hx, cz - hz],
    e: [cx + hx, cz - hz, cx + hx, cz + hz],
    s: [cx + hx, cz + hz, cx - hx, cz + hz],
    w: [cx - hx, cz + hz, cx - hx, cz - hz],
  };
  for (const k of Object.keys(sides)) {
    const [x1, z1, x2, z2] = sides[k];
    const op = openings.find((o) => o.side === k);
    if (!op) fence(b, [[x1, z1], [x2, z2]], kind);
    else {
      const len = Math.hypot(x2 - x1, z2 - z1);
      const dx = (x2 - x1) / len,
        dz = (z2 - z1) / len;
      const a = len / 2 + op.at - op.width / 2,
        c = len / 2 + op.at + op.width / 2;
      fence(b, [[x1, z1], [x1 + dx * a, z1 + dz * a]], kind);
      fence(b, [[x1 + dx * c, z1 + dz * c], [x2, z2]], kind);
    }
  }
}

export function signBoard(b: Builder, x: number, z: number, yaw: number, text: string, sub = "", bg = "#1f5b3a") {
  const tex = canvasTex(512, 160, (c, w, h) => {
    c.fillStyle = bg;
    c.fillRect(0, 0, w, h);
    c.strokeStyle = "#f3ecd8";
    c.lineWidth = 6;
    c.strokeRect(8, 8, w - 16, h - 16);
    c.fillStyle = "#f3ecd8";
    c.textAlign = "center";
    c.font = "bold 58px 'Helvetica Neue', Arial, sans-serif";
    c.fillText(text, w / 2, sub ? 78 : 98, w - 40);
    if (sub) {
      c.font = "32px 'Helvetica Neue', Arial, sans-serif";
      c.globalAlpha = 0.85;
      c.fillText(sub, w / 2, 124, w - 40);
    }
  });
  const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 });
  m.userData.tile = 1;
  b.box(M.steelDark, x, z, 0.12, 0.12, 2.6, { collide: false });
  const g = new THREE.PlaneGeometry(2.5, 0.78);
  b.add(g, m, x + Math.sin(yaw) * 0.08, 2.35, z + Math.cos(yaw) * 0.08, yaw);
  b.add(g, m, x - Math.sin(yaw) * 0.08, 2.35, z - Math.cos(yaw) * 0.08, yaw + Math.PI);
  b.box(M.steelDark, x, z, 2.6, 0.06, 0.8, { y: 1.95, ry: yaw + Math.PI / 2, cast: false });
  b.colliders.push([x, z, x, z, 0.15]);
}

export function lampPost(b: Builder, ctx: Ctx, x: number, z: number, h = 5.2, light = true) {
  b.add(mcyl(0.06, 0.1, h, 8, 1), M.steelDark, x, h / 2, z);
  b.add(new THREE.SphereGeometry(0.22, 10, 8), ctx.lampMat, x, h + 0.1, z, 0, 0, 0, false, false);
  b.add(mcyl(0.26, 0.2, 0.08, 10, 1), M.steelDark, x, h + 0.32, z);
  if (light) b.light({ x, y: h, z, color: 0xffd9a0, intensity: 14, dist: 22, night: true });
  b.colliders.push([x, z, x, z, 0.2]);
}

export function bench(b: Builder, x: number, z: number, yaw: number) {
  b.box(M.wood, x, z, 1.8, 0.45, 0.07, { y: 0.45, ry: yaw, cast: false });
  b.box(M.wood, x - Math.sin(yaw) * 0.0, z, 1.8, 0.07, 0.45, { y: 0.52, ry: yaw, cast: false });
  b.box(M.steelDark, x + Math.cos(yaw) * 0.8, z - Math.sin(yaw) * 0.8, 0.06, 0.45, 0.45, { ry: yaw, cast: false });
  b.box(M.steelDark, x - Math.cos(yaw) * 0.8, z + Math.sin(yaw) * 0.8, 0.06, 0.45, 0.45, { ry: yaw, cast: false });
  b.colliders.push([x - Math.cos(yaw) * 0.8, z + Math.sin(yaw) * 0.8, x + Math.cos(yaw) * 0.8, z - Math.sin(yaw) * 0.8, 0.3]);
}

export function bin(b: Builder, x: number, z: number) {
  b.cyl(M.green, x, z, 0.32, 0.28, 0.9, { seg: 10 });
  b.cyl(M.steelDark, x, z, 0.33, 0.33, 0.06, { y: 0.9, seg: 10 });
  b.colliders.push([x, z, x, z, 0.35]);
}

export function parasolTable(b: Builder, x: number, z: number, color = M.red) {
  b.cyl(M.white, x, z, 0.5, 0.5, 0.04, { y: 0.74, seg: 12 });
  b.cyl(M.steelDark, x, z, 0.04, 0.04, 0.74, { seg: 6 });
  b.cyl(M.steelDark, x, z, 0.04, 0.04, 2.3, { seg: 6 });
  b.add(new THREE.ConeGeometry(1.5, 0.5, 10), color, x, 2.55, z);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * 6.28 + 0.4;
    b.box(M.steelDark, x + Math.cos(a) * 0.8, z + Math.sin(a) * 0.8, 0.4, 0.4, 0.05, { y: 0.45, cast: false });
    b.box(M.steelDark, x + Math.cos(a) * 0.8, z + Math.sin(a) * 0.8, 0.04, 0.04, 0.45, { cast: false });
  }
  b.colliders.push([x, z, x, z, 1.0]);
}

/** Path polylines drawn as paving / asphalt ribbons with kerbs; returns nothing */
export function pathLine(b: Builder, pts: [number, number][], width: number, mat: THREE.MeshStandardMaterial, y = 0.03) {
  b.add(ribbon(pts, width, mat.userData.tile ?? 3, y), mat, 0, 0, 0, 0, 0, 0, false, true);
}

/** big sandy / plain polygon patch lying on the ground */
export function patchGeo(g: THREE.BufferGeometry, mat: THREE.Material, y: number, b: Builder) {
  b.add(g, mat, 0, y, 0, 0, 0, 0, false, true);
}

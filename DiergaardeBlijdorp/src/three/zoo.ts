import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Builder, mbox, mcyl, mplane, polyFlat, ribbon, rnd, rr, pick, setSeed, smoothPath } from "./kit";
import type { Seg, Zone, POI, LightSpot, GlowEntry } from "./kit";
import { M } from "./mats";
import { Animal, Flyer, Swimmer, FishSchool, Butterflies } from "./animals";
import { tree, tufts, tuftsPoly, TreeKind, flowerBed } from "./flora";
import { Ctx, fence, FenceKind, signBoard, bench, bin, lampPost, pathLine, rectPts } from "./props";
import { rivierahal, entrance } from "./bldg1";
import { oceanium, madagascar, amazonica } from "./bldg2";
import { tamanIndah, crocRiver, lodge, aviary, arctica, northGate, flamingoStrand } from "./bldg3";

export interface ZooResult {
  root: THREE.Group;
  dyn: THREE.Group;
  colliders: Seg[];
  zones: Zone[];
  pois: POI[];
  lights: LightSpot[];
  glow: GlowEntry[];
  animals: Animal[];
  swimmers: Swimmer[];
  schools: FishSchool[];
  butterflies: Butterflies[];
  flyers: Flyer[];
  train: THREE.Group;
  paths: { pts: [number, number][]; w: number }[];
  crowd: Crowd;
  water: THREE.Material[];
}

/** flat ground layer that never z-fights with the terrain */
function layer(mat: THREE.MeshStandardMaterial, off: number) {
  const m = mat.clone();
  m.userData = { ...mat.userData };
  m.onBeforeCompile = mat.onBeforeCompile;
  m.customProgramCacheKey = mat.customProgramCacheKey;
  m.polygonOffset = true;
  m.polygonOffsetFactor = -off;
  m.polygonOffsetUnits = -off * 2;
  return m;
}

function along(pts: [number, number][], spacing: number, off: number, cb: (x: number, z: number, tx: number, tz: number, side: number) => void, startAt = 0) {
  let acc = startAt;
  let side = 1;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, z1] = pts[i],
      [x2, z2] = pts[i + 1];
    const len = Math.hypot(x2 - x1, z2 - z1);
    const tx = (x2 - x1) / len,
      tz = (z2 - z1) / len;
    let t = spacing - (acc % spacing);
    acc += len;
    while (t < len) {
      cb(x1 + tx * t + -tz * off * side, z1 + tz * 0 + tz * t + tx * off * side, tx, tz, side);
      side *= -1;
      t += spacing;
    }
  }
}

/* ------------------------------------------------------------------ */
/*  People (instanced, walking the paths)                              */
/* ------------------------------------------------------------------ */
export class Crowd {
  body: THREE.InstancedMesh;
  head: THREE.InstancedMesh;
  n: number;
  st: { path: number; s: number; v: number; off: number; h: number; ph: number }[] = [];
  lens: number[][] = [];
  paths: [number, number][][];
  d = new THREE.Object3D();
  constructor(paths: [number, number][][], n: number) {
    this.paths = paths;
    this.n = n;
    const body = new THREE.CapsuleGeometry(0.17, 0.85, 4, 10);
    body.translate(0, 0.85, 0);
    const head = new THREE.SphereGeometry(0.13, 12, 10);
    head.translate(0, 1.57, 0);
    this.body = new THREE.InstancedMesh(body, new THREE.MeshStandardMaterial({ roughness: 0.85 }), n);
    this.head = new THREE.InstancedMesh(head, new THREE.MeshStandardMaterial({ roughness: 0.7 }), n);
    this.body.castShadow = true;
    this.body.frustumCulled = false;
    this.head.frustumCulled = false;
    const cols = [0xc0392b, 0x2e86c1, 0x27ae60, 0xf1c40f, 0x7d3c98, 0x2c3e50, 0xe67e22, 0xecf0f1, 0x16a085, 0xd35400, 0x34495e];
    const skin = [0xf1c9a5, 0xd8a47f, 0xa8704b, 0x6f4a32, 0xffdcb8];
    const c = new THREE.Color();
    paths.forEach((p) => {
      const l = [0];
      for (let i = 1; i < p.length; i++) l.push(l[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]));
      this.lens.push(l);
    });
    for (let i = 0; i < n; i++) {
      const pi = Math.floor(rnd() * paths.length);
      const total = this.lens[pi][this.lens[pi].length - 1];
      this.st.push({ path: pi, s: rnd() * total, v: rr(0.9, 1.5) * (rnd() < 0.5 ? 1 : -1), off: rr(-1.8, 1.8), h: rr(0.82, 1.1), ph: rnd() * 6 });
      c.setHex(pick(cols));
      this.body.setColorAt(i, c);
      c.setHex(pick(skin));
      this.head.setColorAt(i, c);
    }
  }
  update(dt: number, t: number) {
    const d = this.d;
    for (let i = 0; i < this.n; i++) {
      const s = this.st[i];
      const L = this.lens[s.path];
      const total = L[L.length - 1];
      s.s += s.v * dt;
      if (s.s > total) {
        s.s = total;
        s.v = -Math.abs(s.v);
      } else if (s.s < 0) {
        s.s = 0;
        s.v = Math.abs(s.v);
      }
      let k = 0;
      while (k < L.length - 2 && L[k + 1] < s.s) k++;
      const p = this.paths[s.path];
      const f = (s.s - L[k]) / (L[k + 1] - L[k] || 1);
      const x = p[k][0] + (p[k + 1][0] - p[k][0]) * f,
        z = p[k][1] + (p[k + 1][1] - p[k][1]) * f;
      const dx = p[k + 1][0] - p[k][0],
        dz = p[k + 1][1] - p[k][1];
      const dl = Math.hypot(dx, dz) || 1;
      const sg = Math.sign(s.v);
      d.position.set(x - (dz / dl) * s.off, Math.abs(Math.sin(t * 5 + s.ph)) * 0.04, z + (dx / dl) * s.off);
      d.rotation.set(0, Math.atan2(dx * sg, dz * sg), Math.sin(t * 5 + s.ph) * 0.04);
      d.scale.setScalar(s.h);
      d.updateMatrix();
      this.body.setMatrixAt(i, d.matrix);
      this.head.setMatrixAt(i, d.matrix);
    }
    this.body.instanceMatrix.needsUpdate = true;
    this.head.instanceMatrix.needsUpdate = true;
  }
}

/* ------------------------------------------------------------------ */
export function buildZoo(): ZooResult {
  setSeed(20240607);
  const b = new Builder();
  const dyn = new THREE.Group();
  const lampMat = b.glowMat(0xfff1d0, 0.0, 4.0, 0xffd9a0);
  const windowGlow = b.glowMat(0xfff2d6, 0.6, 2.2, 0xffe2b0);
  const tankGlow = b.glowMat(0x7fd4ff, 1.2, 1.6, 0x4aa8ff);
  const ctx: Ctx = { b, dyn, animals: [], swimmers: [], schools: [], butterflies: [], flyers: [], lampMat, windowGlow, tankGlow, nearby: [] };

  /* ---------- ground ---------- */
  b.add(mplane(5000, 5000, 3), M.grass, 0, -0.05, 0, 0, 0, 0, false, true);
  b.add(mplane(520, 580, 3), M.grass, 0, 0, -20, 0, 0, 0, false, true);

  const pavingL = layer(M.paving, 2);
  const asphaltL = layer(M.asphalt, 2);
  const dryL = layer(M.grassDry, 1);
  const sandL = layer(M.sand, 1.5);
  const mudL = layer(M.mud, 1.5);
  const snowL = layer(M.plasterWhite, 1.5);

  const keep: [number, number, number, number][] = [];
  const K = (cx: number, cz: number, w: number, d: number, m = 2) => keep.push([cx - w / 2 - m, cz - d / 2 - m, cx + w / 2 + m, cz + d / 2 + m]);

  /* ---------- paths ---------- */
  const S = (p: [number, number][], n = 6) => smoothPath(p, n);
  const paths: { pts: [number, number][]; w: number; mat: THREE.MeshStandardMaterial }[] = [];
  const P = (pts: [number, number][], w = 6, smooth = true, mat = pavingL) => paths.push({ pts: smooth ? S(pts) : pts, w, mat });

  // south / city side
  P([[0, 246], [0, 182]], 12, false);
  P([[0, 182], [-26, 174], [-44, 156], [-47, 130], [-45, 104], [-37, 84], [-26, 72]], 7);
  P([[0, 182], [26, 174], [44, 156], [47, 130], [45, 104], [37, 84], [26, 72]], 7);
  P([[-44, 150], [-22, 142], [0, 140], [22, 142], [44, 150]], 5);
  P([[-100, 74], [100, 74]], 8, false);
  P([[0, 74], [0, 66]], 10, false);
  // Africa (west)
  P([[-96, 74], [-100, 92], [-125, 101], [-151, 103], [-180, 100]], 6);
  P([[-96, 74], [-95, 52], [-91, 24], [-91, -6], [-91, -34], [-92, -56], [-70, -61], [-38, -62], [-10, -62]], 6);
  // Asia (east)
  P([[96, 74], [100, 92], [110, 118], [118, 131], [146, 129], [168, 120]], 6);
  P([[96, 74], [104, 52], [108, 22], [108, -6], [108, -34], [100, -56], [74, -61], [42, -62], [10, -62]], 6);
  P([[168, 70], [188, 66], [212, 62], [214, 30], [212, 0], [205, -44]], 6);
  P([[100, 70], [140, 68], [168, 68]], 6);
  // Europe & Australia
  P([[-44, 148], [-80, 147], [-120, 146], [-150, 144], [-195, 140]], 6);
  P([[44, 148], [80, 147], [117, 146], [150, 146], [190, 142]], 6);
  P([[117, 146], [117, 170]], 4, false);
  // rail underpass
  P([[0, 22], [0, 0], [0, -40], [0, -62], [0, -92], [0, -114]], 9, false);
  // Oceanium side
  P([[0, -276], [0, -186]], 14, false);
  P([[0, -112], [0, -96]], 12, false);
  P([[-30, -214], [-62, -198], [-80, -182], [-91, -175]], 6);
  P([[-62, -198], [-72, -216], [-100, -228], [-150, -228], [-180, -216]], 6);
  P([[-120, -153], [-122, -130], [-100, -113], [-58, -106]], 6);
  P([[58, -108], [82, -112], [106, -120], [126, -132], [150, -132], [185, -132], [204, -120]], 6);
  P([[30, -226], [70, -222], [100, -213], [130, -215], [160, -218], [190, -214], [204, -190], [204, -150], [204, -122]], 6);
  P([[66, -126], [69, -118]], 5, false);
  P([[-58, -106], [-40, -98], [0, -96]], 6);
  P([[58, -108], [40, -98], [0, -96]], 6);
  // forecourt plaza
  b.add(mplane(112, 26, 3), pavingL, 0, 0.03, 75);
  b.add(mplane(90, 22, 3), pavingL, 0, 0.03, -103);
  b.add(mplane(100, 70, 4), pavingL, 0, 0.03, -235);
  b.add(mplane(34, 16, 3), pavingL, 0, 0.03, 207);
  b.add(mplane(70, 20, 3), pavingL, 0, 0.03, 190);
  b.add(mplane(64, 16, 3), pavingL, 0, 0.03, 140);
  for (const p of paths) pathLine(b, p.pts, p.w, p.mat, 0.03);
  K(0, 75, 112, 26, 0);
  K(0, -103, 90, 22, 0);
  K(0, -235, 100, 70, 0);
  K(0, 190, 70, 20, 0);

  // streets outside the zoo
  const street = (pts: [number, number][]) => b.add(ribbon(pts, 14, 4, 0.025), asphaltL, 0, 0, 0, 0, 0, 0, false, true);
  street([[-300, 258], [300, 258]]);
  street([[-300, -284], [300, -284]]);
  b.add(mplane(600, 6, 3), pavingL, 0, 0.03, 249);
  b.add(mplane(600, 6, 3), pavingL, 0, 0.03, -277);

  /* ---------- Rivièrahal, tea house, entrances ---------- */
  rivierahal(ctx);
  entrance(ctx);
  northGate(ctx);
  K(0, 43, 190, 50, 2);
  K(0, 158, 40, 14, 2);
  K(0, 116, 66, 32, 2);
  K(0, 214, 130, 30, 2);

  /* ---------- Oceanium side buildings ---------- */
  oceanium(ctx);
  madagascar(ctx);
  amazonica(ctx);
  K(0, -150, 112, 72, 4);
  K(69, -150, 26, 32, 3);
  K(-120, -175, 56, 44, 3);

  /* ---------- Asia / Africa buildings ---------- */
  tamanIndah(ctx);
  crocRiver(ctx);
  lodge(ctx);
  aviary(ctx);
  arctica(ctx);
  flamingoStrand(ctx);
  K(140, 35, 58, 40, 4);
  K(-151, 77, 44, 32, 3);
  K(-118, 120, 24, 24, 3);
  K(118, 108, 30, 30, 2);
  K(152, -172, 80, 70, 3);
  K(-82, -100, 50, 32, 3);

  /* ---------- generic habitats ---------- */
  interface HabO {
    cx: number;
    cz: number;
    w: number;
    d: number;
    ground?: "dry" | "sand" | "snow" | "mud" | "grass";
    fence?: Partial<Record<"n" | "e" | "s" | "w", FenceKind>> & { all?: FenceKind };
    gaps?: { side: "n" | "e" | "s" | "w"; at: number; width: number }[];
    animals: [string, number, { scale?: number; speed?: number; graze?: boolean }?][];
    trees?: [TreeKind, number][];
    rocks?: number;
    pond?: [number, number, number];
    sign?: [number, number, number, string, string, string];
    tufts?: number;
    round?: boolean;
    hide?: boolean;
  }
  const groundMat = { dry: dryL, sand: sandL, snow: snowL, mud: mudL, grass: null };
  const habitat = (o: HabO) => {
    const { cx, cz, w, d } = o;
    const g = groundMat[o.ground ?? "grass"];
    if (g) b.add(mplane(w, d, 3), g, cx, 0.012, cz, 0, 0, 0, false, true);
    const f = o.fence ?? { all: "rail" };
    const hx = w / 2,
      hz = d / 2;
    const sides: Record<string, [number, number, number, number]> = {
      n: [cx - hx, cz - hz, cx + hx, cz - hz],
      e: [cx + hx, cz - hz, cx + hx, cz + hz],
      s: [cx + hx, cz + hz, cx - hx, cz + hz],
      w: [cx - hx, cz + hz, cx - hx, cz - hz],
    };
    for (const k of ["n", "e", "s", "w"] as const) {
      const kind = f[k] ?? f.all ?? "rail";
      const [x1, z1, x2, z2] = sides[k];
      const gap = o.gaps?.find((q) => q.side === k);
      if (!gap) fence(b, [[x1, z1], [x2, z2]], kind);
      else {
        const len = Math.hypot(x2 - x1, z2 - z1);
        const dx = (x2 - x1) / len,
          dz = (z2 - z1) / len;
        const a = len / 2 + gap.at - gap.width / 2,
          c = len / 2 + gap.at + gap.width / 2;
        fence(b, [[x1, z1], [x1 + dx * a, z1 + dz * a]], kind);
        fence(b, [[x1 + dx * c, z1 + dz * c], [x2, z2]], kind);
      }
    }
    if (o.pond) {
      const [px, pz, pr] = o.pond;
      const pg = new THREE.CircleGeometry(pr, 32);
      pg.rotateX(-Math.PI / 2);
      pg.scale(1, 1, 0.7);
      b.add(pg, M.pond, px, 0.05, pz, 0, 0, 0, false, true);
    }
    for (let i = 0; i < (o.rocks ?? 0); i++) {
      const s = rr(0.7, 2.2);
      const rg = new THREE.IcosahedronGeometry(s, 1);
      const p = rg.attributes.position as THREE.BufferAttribute;
      for (let v = 0; v < p.count; v++) p.setXYZ(v, p.getX(v) * rr(0.9, 1.3), p.getY(v) * 0.8, p.getZ(v) * rr(0.9, 1.2));
      rg.computeVertexNormals();
      b.add(rg, rnd() < 0.5 ? M.rock : M.rockGrey, cx + rr(-hx + 3, hx - 3), s * 0.35, cz + rr(-hz + 3, hz - 3), rnd() * 6);
    }
    for (const [k, n] of o.trees ?? [])
      for (let i = 0; i < n; i++) {
        const x = cx + rr(-hx + 3, hx - 3),
          z = cz + rr(-hz + 3, hz - 3);
        if (o.pond && Math.hypot(x - o.pond[0], z - o.pond[1]) < o.pond[2] + 2) continue;
        tree(b, k, x, z, rr(0.8, 1.2), true);
      }
    tuftsPoly(b, rectPts(cx, cz, w - 2, d - 2), o.tufts ?? 0.12, { dry: o.ground === "dry" || o.ground === "sand", h: 0.7 });
    const hab = { cx, cz, w: w - 1, d: d - 1, round: o.round };
    for (const [id, n, opt] of o.animals)
      for (let i = 0; i < n; i++) {
        const sc = (opt?.scale ?? 1) * (n > 1 && i === n - 1 && ["elephant", "giraffe", "zebra", "wolf", "reindeer", "camel", "rhino"].includes(id) ? 0.65 : rr(0.95, 1.05));
        ctx.animals.push(new Animal(id, hab, sc, opt?.speed ?? 0.7, opt?.graze ?? false));
      }
    if (o.sign) signBoard(b, o.sign[0], o.sign[1], o.sign[2], o.sign[3], o.sign[4], o.sign[5]);
    K(cx, cz, w, d, 1.5);
  };

  /* AFRICA – savanna with moat */
  habitat({
    cx: -151.5, cz: -2, w: 107, d: 100, ground: "dry",
    fence: { all: "rail", e: "moat", s: "moat" },
    animals: [
      ["giraffe", 4, { speed: 0.55, graze: true }],
      ["zebra", 6, { speed: 0.9, graze: true }],
      ["ostrich", 4, { speed: 1.1 }],
      ["rhino", 2, { speed: 0.5, graze: true }],
      ["gazelle", 5, { speed: 1.2, graze: true }],
      ["warthog", 3, { speed: 0.8, graze: true }],
    ],
    trees: [["acacia", 12]], rocks: 10, pond: [-150, -10, 12], tufts: 0.2,
    sign: [-89, 20, Math.PI / 2, "SAVANNE", "giraffes · zebras · rhinos · ostriches", "#8a5a1d"],
  });
  // gorilla island
  {
    const cx = -112, cz = 66, r = 12;
    const ring: [number, number][] = [];
    for (let i = 0; i < 24; i++) ring.push([cx + Math.cos((i / 24) * 6.283) * r, cz + Math.sin((i / 24) * 6.283) * r]);
    b.add(mplane(r * 2, r * 2, 3), M.grass, cx, 0.012, cz, 0, 0, 0, false, true);
    fence(b, [...ring, ring[0]], "moat");
    for (let i = 0; i < 9; i++) {
      const s = rr(1, 2.5);
      b.add(new THREE.IcosahedronGeometry(s, 1), M.rockGrey, cx + rr(-7, 7), s * 0.45, cz + rr(-7, 7), rnd() * 6);
    }
    for (let i = 0; i < 4; i++) tree(b, "oak", cx + rr(-7, 7), cz + rr(-7, 7), 1, false);
    tuftsPoly(b, rectPts(cx, cz, 20, 20), 0.25);
    for (let i = 0; i < 3; i++) ctx.animals.push(new Animal("gorilla", { cx, cz, w: 20, d: 20, round: true }, i === 0 ? 1.1 : 0.85, 0.45));
    signBoard(b, -98, 78, 0.6, "GORILLA-EILAND", "silverback and his troop", "#6b4a2a");
    K(cx, cz, 30, 30, 2);
  }
  /* ASIA – elephants, camels, tigers, red pandas */
  habitat({
    cx: 143, cz: -14, w: 44, d: 48, ground: "sand",
    fence: { all: "rail", s: "moat", w: "moat" },
    animals: [["elephant", 3, { speed: 0.5 }]],
    trees: [["palm", 5], ["oak", 3]], rocks: 6, pond: [143, -22, 8], tufts: 0.05,
    sign: [118, 6, -Math.PI / 2, "OLIFANTEN", "Aziatische olifanten", "#7a3b1d"],
  });
  habitat({
    cx: 187, cz: -14, w: 38, d: 48, ground: "dry",
    fence: { all: "mesh", w: "moat" },
    animals: [["camel", 3, { speed: 0.7, graze: true }]],
    trees: [["acacia", 3]], rocks: 8,
    sign: [168, 8, -Math.PI / 2, "MONGOOLSE STEPPE", "tweebultige kamelen", "#8a5a1d"],
  });
  habitat({
    cx: 192, cz: 41, w: 32, d: 34, ground: "mud",
    fence: { all: "mesh" },
    animals: [["tiger", 2, { speed: 0.9 }]],
    trees: [["palm", 4], ["birch", 2]], rocks: 8, pond: [196, 48, 6],
    sign: [175, 62, Math.PI, "SUMATRAANSE TIJGER", "kritiek bedreigd", "#7a3b1d"],
  });
  habitat({
    cx: 160, cz: 108, w: 18, d: 14, ground: "mud",
    fence: { all: "mesh" },
    animals: [["redpanda", 2, { speed: 0.3 }]],
    trees: [["birch", 4]], rocks: 3,
    sign: [150, 120, Math.PI, "RODE PANDA", "Ailurus fulgens", "#7a3b1d"],
  });
  /* EUROPE */
  habitat({
    cx: -111, cz: 176, w: 38, d: 30, ground: "mud",
    fence: { all: "mesh", n: "rail" },
    animals: [["wolf", 4, { speed: 1.2 }]],
    trees: [["conifer", 9]], rocks: 8,
    sign: [-96, 158, 0.5, "WOLVEN", "Canis lupus", "#4a5a28"],
  });
  habitat({
    cx: -165, cz: 172, w: 50, d: 40,
    fence: { all: "rail", n: "moat" },
    animals: [["reindeer", 5, { speed: 0.8, graze: true }]],
    trees: [["conifer", 10], ["birch", 6]], rocks: 6,
    sign: [-140, 156, 0.2, "RENDIEREN", "Rangifer tarandus", "#4a5a28"],
  });
  // rock garden
  for (let i = 0; i < 18; i++) {
    const s = rr(0.8, 2.6);
    const rg = new THREE.IcosahedronGeometry(s, 1);
    b.add(rg, rnd() < 0.5 ? M.rock : M.rockGrey, -70 + rr(-14, 14), s * 0.5, 172 + rr(-10, 10), rnd() * 6);
  }
  flowerBed(b, -70, 170, 10, 5, [0xc66ad8, 0xe33d5b, 0xffffff]);
  K(-70, 172, 34, 28, 0);
  /* AUSTRALIA – wallaby walk-through (open gap at the north fence) */
  habitat({
    cx: 118, cz: 178, w: 46, d: 36,
    fence: { all: "rail" },
    gaps: [{ side: "n", at: 0, width: 6 }],
    animals: [["wallaby", 7, { speed: 0.9, graze: true }]],
    trees: [["birch", 6], ["acacia", 3]], rocks: 4, tufts: 0.2,
    sign: [112, 160, 0, "AUSTRALIË", "wallaby walk-through · stay on the path", "#8a5a1d"],
  });
  /* OCEANIUM-SIDE OUTDOOR HABITATS */
  habitat({
    cx: 115, cz: -98, w: 30, d: 18, ground: "dry",
    fence: { all: "mesh" },
    animals: [["prairie", 9, { speed: 0.4 }]],
    rocks: 4, tufts: 0.15,
    sign: [96, -112, 0, "PRAIRIEHONDEN", "Cynomys ludovicianus", "#8a5a1d"],
  });
  for (let i = 0; i < 9; i++) {
    const g = new THREE.SphereGeometry(rr(0.5, 0.9), 10, 6, 0, 6.283, 0, 1.5);
    b.add(g, M.mud, 115 + rr(-12, 12), 0, -98 + rr(-6, 6), 0, 0, 0, false, true);
  }
  habitat({
    cx: 98, cz: -194, w: 24, d: 18, ground: "mud",
    fence: { all: "mesh" },
    animals: [["raccoon", 3, { speed: 0.5 }]],
    trees: [["oak", 3]], rocks: 4,
    sign: [84, -184, Math.PI / 2, "WASBEREN", "Procyon lotor", "#6b4a2a"],
  });
  habitat({
    cx: -140, cz: -211, w: 60, d: 16,
    fence: { all: "rail" },
    animals: [["vicuna", 4, { speed: 1, graze: true }], ["ibis", 4, { speed: 0.4 }]],
    rocks: 5, pond: [-128, -211, 6],
    sign: [-170, -224, 0, "ZUID-AMERIKA", "vicuña · rode ibis", "#2e6b45"],
  });

  /* ---------- railway embankment + underpass ---------- */
  {
    const zc = -75;
    const prof = new THREE.Shape();
    prof.moveTo(-11, 0);
    prof.lineTo(-5, 4.1);
    prof.lineTo(5, 4.1);
    prof.lineTo(11, 0);
    prof.closePath();
    const mk = (x0: number, x1: number) => {
      const g = new THREE.ExtrudeGeometry(prof, { depth: x1 - x0, bevelEnabled: false });
      g.translate(0, 0, -(x1 - x0) / 2);
      g.rotateY(-Math.PI / 2);
      const uv = g.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 4, uv.getY(i) / 4);
      b.add(g, layer(M.grass, 0.5) , (x0 + x1) / 2, 0, zc, 0, 0, 0, false, true);
    };
    mk(-240, -6);
    mk(6, 240);
    // tunnel structure
    b.box(M.concrete, 0, zc, 12, 22, 0.8, { y: 3.4, collide: false });
    b.box(M.concrete, -6, zc - 5.5, 0.9, 11, 3.6, { collide: false });
    b.box(M.concrete, -6, zc + 5.5, 0.9, 11, 3.6, { collide: false });
    b.box(M.concrete, 6, zc - 5.5, 0.9, 11, 3.6, { collide: false });
    b.box(M.concrete, 6, zc + 5.5, 0.9, 11, 3.6, { collide: false });
    b.box(M.concrete, 0, zc - 10.8, 12, 0.6, 4.2, { collide: false });
    b.box(M.concrete, 0, zc + 10.8, 12, 0.6, 4.2, { collide: false });
    b.colliders.push([-6, zc - 11, -6, zc + 11, 0.3], [6, zc - 11, 6, zc + 11, 0.3]);
    b.colliders.push([-240, zc - 11, -6, zc - 11, 0.3], [6, zc - 11, 240, zc - 11, 0.3], [-240, zc + 11, -6, zc + 11, 0.3], [6, zc + 11, 240, zc + 11, 0.3]);
    b.zone({ id: "rail", name: "Railway underpass", kind: "interior", poly: [[-6, zc - 11], [6, zc - 11], [6, zc + 11], [-6, zc + 11]], color: "#888", dark: 0.35 });
    b.light({ x: 0, y: 3.2, z: zc - 6, color: 0xffe0b0, intensity: 16, dist: 16, night: false });
    b.light({ x: 0, y: 3.2, z: zc + 6, color: 0xffe0b0, intensity: 16, dist: 16, night: false });
    for (let i = 0; i < 4; i++) b.box(windowGlow, 0, zc - 8 + i * 5.3, 0.4, 0.4, 0.06, { y: 3.33, collide: false, cast: false });
    // ballast + rails (y = 4.1)
    b.add(mplane(480, 4.2, 2), layer(M.sand, 3), 0, 4.13, zc);
    for (const z of [-0.72, 0.72]) b.box(M.steel, 0, zc + z, 480, 0.1, 0.16, { y: 4.14, collide: false, cast: false });
    for (let x = -238; x < 240; x += 0.8) b.box(M.concreteDark, x, zc, 0.22, 2.6, 0.12, { y: 4.13, collide: false, cast: false });
    // catenary masts
    for (let x = -230; x <= 230; x += 40) {
      b.box(M.steelDark, x, zc - 3, 0.3, 0.3, 9, { y: 4.1, collide: false });
      b.box(M.steelDark, x, zc - 1.5, 0.15, 3.4, 0.15, { y: 12.4, collide: false, cast: false });
    }
    b.box(M.black, 0, zc - 0.5, 480, 0.03, 0.03, { y: 12.1, collide: false, cast: false });
    // flanking hedges
    for (let x = -230; x < 230; x += 10) {
      if (Math.abs(x) < 12) continue;
      tree(b, "conifer", x + rr(-2, 2), zc + 14 + rr(-1, 1), 1, false);
      tree(b, "conifer", x + rr(-2, 2), zc - 14 + rr(-1, 1), 1, false);
    }
  }
  // train (Sprinter-like, NS yellow/blue)
  const train = new THREE.Group();
  {
    const yel = new THREE.MeshStandardMaterial({ color: 0xf2c230, roughness: 0.35, metalness: 0.2 });
    const blu = new THREE.MeshStandardMaterial({ color: 0x1c3a8a, roughness: 0.4, metalness: 0.2 });
    const win = new THREE.MeshStandardMaterial({ color: 0x1a222b, roughness: 0.1, metalness: 0.6 });
    const roofM = new THREE.MeshStandardMaterial({ color: 0x8a9096, roughness: 0.6 });
    for (let i = 0; i < 4; i++) {
      const c = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(24, 3.2, 3), yel);
      body.position.y = 2.7;
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(24.02, 0.6, 3.02), blu);
      stripe.position.y = 1.4;
      const w1 = new THREE.Mesh(new THREE.BoxGeometry(22, 1.0, 3.04), win);
      w1.position.y = 3.2;
      const roof = new THREE.Mesh(new THREE.BoxGeometry(23, 0.35, 2.6), roofM);
      roof.position.y = 4.45;
      [body, stripe, w1, roof].forEach((m) => {
        m.castShadow = true;
        c.add(m);
      });
      c.position.x = i * 24.6;
      train.add(c);
    }
    train.position.y = 4.15;
    train.position.z = -75;
    dyn.add(train);
  }

  /* ---------- vegetation ---------- */
  const inKeep = (x: number, z: number) => keep.some(([a, c, d, e]) => x > a && x < d && z > c && z < e);
  const nearPath = (x: number, z: number, m: number) => {
    for (const p of paths) {
      for (let i = 0; i < p.pts.length - 1; i += 1) {
        const [x1, z1] = p.pts[i],
          [x2, z2] = p.pts[i + 1];
        const dx = x2 - x1,
          dz = z2 - z1;
        const l2 = dx * dx + dz * dz || 1;
        const t = Math.max(0, Math.min(1, ((x - x1) * dx + (z - z1) * dz) / l2));
        if (Math.hypot(x - (x1 + dx * t), z - (z1 + dz * t)) < p.w / 2 + m) return true;
      }
    }
    return false;
  };
  // avenues along main axes
  for (const [pts, side] of [[paths[1].pts, 1], [paths[2].pts, 1]] as [[number, number][], number][]) {
    along(pts, 16, 7, (x, z) => {
      if (!inKeep(x, z) && z > 76) tree(b, "plane", x, z, 1.15);
    });
    void side;
  }
  along([[0, 246], [0, 182]], 15, 9, (x, z) => tree(b, "plane", x, z, 1.15));
  along([[0, -276], [0, -190]], 15, 10, (x, z) => tree(b, "plane", x, z, 1.1));
  along([[0, 20], [0, -64]], 14, 7, (x, z) => tree(b, "plane", x, z, 1.1));
  // park trees
  let placed = 0,
    guard = 0;
  const kinds: TreeKind[] = ["oak", "oak", "plane", "birch", "conifer", "shrub", "shrub"];
  while (placed < 380 && guard++ < 6000) {
    const x = rr(-218, 218),
      z = rr(-262, 218);
    if (inKeep(x, z) || nearPath(x, z, 3.5)) continue;
    if (Math.abs(z + 75) < 16) continue;
    tree(b, pick(kinds), x, z, rr(0.85, 1.35), true);
    placed++;
  }
  // boundary tree belt + hedge
  for (let i = 0; i < 230; i++) {
    const side = Math.floor(rnd() * 4);
    let x = 0,
      z = 0;
    if (side === 0) [x, z] = [rr(-228, 228), rr(224, 232)];
    if (side === 1) [x, z] = [rr(-228, 228), rr(-270, -264)];
    if (side === 2) [x, z] = [rr(-232, -226), rr(-268, 226)];
    if (side === 3) [x, z] = [rr(226, 232), rr(-268, 226)];
    if (inKeep(x, z)) continue;
    tree(b, rnd() < 0.5 ? "conifer" : "oak", x, z, rr(1.1, 1.6), false);
  }
  tufts(b, 0, 0, 0, 1);
  // ground tufts along edges of paths
  for (const p of paths.slice(0, 18)) {
    along(p.pts, 3.2, p.w / 2 + 1.2, (x, z) => {
      if (!inKeep(x, z)) tufts(b, x, z, 2, 1.2, { h: 0.7 });
    });
  }

  // outer boundary
  const bound: [number, number][] = [[-226, -268], [226, -268], [226, 227], [-226, 227]];
  const gate: [number, number][] = [];
  void gate;
  b.collidePoly(bound, true, 0.5);
  // brick boundary wall (with visible gaps for the two gates)
  const bw = (x1: number, z1: number, x2: number, z2: number) => b.wall(M.brick, x1, z1, x2, z2, 2.4, 0.5, { collide: false });
  bw(-226, 227, -14, 227);
  bw(14, 227, 226, 227);
  bw(-226, -268, -22, -268);
  bw(22, -268, 226, -268);
  bw(-226, -268, -226, 227);
  bw(226, -268, 226, 227);

  /* ---------- city backdrop ---------- */
  for (let i = 0; i < 90; i++) {
    const side = i % 4;
    const w = rr(18, 42),
      d = rr(12, 18),
      h = rr(12, 30);
    let x = 0,
      z = 0;
    if (side === 0) [x, z] = [rr(-320, 320), rr(278, 330)];
    if (side === 1) [x, z] = [rr(-320, 320), rr(-340, -300)];
    if (side === 2) [x, z] = [rr(-340, -250), rr(-290, 270)];
    if (side === 3) [x, z] = [rr(250, 340), rr(-290, 270)];
    const mat = rnd() < 0.6 ? M.brick : rnd() < 0.5 ? M.plaster : M.concrete;
    b.box(mat, x, z, w, d, h, { collide: false });
    b.box(M.roofTileDark, x, z, w + 0.6, d + 0.6, 0.5, { y: h, collide: false });
  }
  // street trees / lamps at the entrance streets
  for (let x = -120; x <= 120; x += 20) {
    if (Math.abs(x) < 14) continue;
    tree(b, "plane", x, 241, 1.2, false);
    tree(b, "plane", x, -272, 1.2, false);
  }

  /* ---------- furniture along paths ---------- */
  const lampPaths = [paths[0], paths[1], paths[2], paths[8], paths[16], paths[17]].filter(Boolean);
  for (const p of lampPaths) along(p.pts, 26, p.w / 2 + 0.8, (x, z) => lampPost(b, ctx, x, z));
  for (const p of paths) {
    along(p.pts, 52, p.w / 2 + 1.2, (x, z, tx, tz) => {
      if (!inKeep(x, z)) bench(b, x, z, Math.atan2(-tz, tx));
    }, 20);
    along(p.pts, 70, p.w / 2 + 1, (x, z) => bin(b, x, z), 35);
  }
  // sign posts at main junctions
  signBoard(b, 14, 181, 0, "◄ AFRIKA   AZIË ►", "via Rivièrahal", "#1f5b3a");
  signBoard(b, 14, -200, 0, "◄ AMAZONICA   ARCTICA ►", "Oceanium straight ahead", "#12527a");
  signBoard(b, 12, -64, 0, "OCEANIUM ▲", "through the underpass", "#12527a");
  signBoard(b, -12, -64, 0, "▼ RIVIÈRAHAL", "Biotopia & gorillas", "#5a3a2a");

  // storks over the zoo & flamingos in flight
  for (let i = 0; i < 3; i++) {
    const s = new Flyer("stork", new THREE.Vector3(rr(-60, 60), rr(24, 34), rr(-40, 60)), rr(55, 95), 0.045, 1.9);
    ctx.flyers.push(s);
    dyn.add(s.group);
  }

  /* ---------- zones (outdoor, checked after interiors) ---------- */
  const oz = (id: string, name: string, poly: [number, number][], color: string) => b.zone({ id, name, kind: "outdoor", poly, color });
  oz("asia", "Azië", [[92, -60], [215, -60], [215, 130], [92, 130]], "#e0833a");
  oz("africa", "Afrika", [[-215, -60], [-92, -60], [-92, 135], [-215, 135]], "#d9a23a");
  oz("europe", "Europa", [[-215, 135], [-40, 135], [-40, 226], [-215, 226]], "#4f9a58");
  oz("australia", "Australië", [[40, 130], [215, 130], [215, 226], [40, 226]], "#b9893a");
  oz("entrance", "City entrance · Theeschenkerij · Pond", [[-60, 135], [60, 135], [60, 226], [-60, 226]], "#6fa08a");
  oz("forecourt", "Rivièrahal forecourt", [[-92, 62], [92, 62], [92, 135], [-92, 135]], "#c9b27a");
  oz("railz", "Railway embankment", [[-226, -90], [226, -90], [226, -62], [-226, -62]], "#888");
  oz("samerica", "Zuid-Amerika", [[-215, -232], [-60, -232], [-60, -100], [-215, -100]], "#3aa55a");
  oz("oceanside", "Oceanium plaza · Flamingo beach", [[-115, -114], [88, -114], [88, -90], [-115, -90]], "#3a9fc8");
  oz("oceanplaza", "Oceanium front plaza", [[-60, -232], [88, -232], [88, -100], [-60, -100]], "#3a9fc8");
  oz("mid", "Rivièrahal · rear gardens", [[-92, -62], [92, -62], [92, 62], [-92, 62]], "#7fb27a");

  /* ---------- crowd ---------- */
  const crowdPaths = paths.filter((p) => p.pts.length > 3 && p.w >= 6).map((p) => p.pts);
  const crowd = new Crowd(crowdPaths, 150);
  dyn.add(crowd.body, crowd.head);

  ctx.animals.forEach((a) => dyn.add(a.group));
  const root = b.finalize();
  void mcyl;
  void mbox;
  void polyFlat;
  void mergeGeometries;
  return {
    root,
    dyn,
    colliders: b.colliders,
    zones: b.zones,
    pois: b.pois,
    lights: b.lights,
    glow: b.glow,
    animals: ctx.animals,
    swimmers: ctx.swimmers,
    schools: ctx.schools,
    butterflies: ctx.butterflies,
    flyers: ctx.flyers,
    train,
    paths: paths.map((p) => ({ pts: p.pts, w: p.w })),
    crowd,
    water: [M.pond, M.moat, M.poolBlue],
  };
}

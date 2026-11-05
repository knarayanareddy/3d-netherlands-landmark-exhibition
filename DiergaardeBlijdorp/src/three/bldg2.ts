import * as THREE from "three";
import { mbox, mcyl, mplane, plain, rnd, rr, pick } from "./kit";
import { M } from "./mats";
import { Animal, Swimmer, FishSchool, Butterflies, Flyer } from "./animals";
import { blob, tree, tropicalPlant } from "./flora";
import { Ctx, glassWall, fence, signBoard, bench } from "./props";

const floorDark = new THREE.MeshStandardMaterial({ color: 0x2a3036, roughness: 0.32, metalness: 0.12 });
floorDark.userData.tile = 4;
const waveBlue = plain(0x2d7ea3, 0.35, 0.2);
const snow = plain(0xe9eff3, 0.9);
const coralCols = [0xff6f91, 0xff9a3c, 0xb15bff, 0xffd23f, 0x4fd1c5, 0xff5a5f].map((c) => plain(c, 0.7));
const kelpMat = plain(0x4a7a2a, 0.6);

/* ------------------------------------------------------------------ */
interface TankO {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  h: number;
  front: "n" | "s" | "e" | "w";
  fish: number[];
  count: number;
  kelp?: boolean;
  swim?: ("shark" | "ray" | "turtle")[];
  glow?: number;
  id?: string;
}

function decorate(ctx: Ctx, x0: number, x1: number, z0: number, z1: number, y: number, kelp: boolean, n: number) {
  const { b } = ctx;
  for (let i = 0; i < n; i++) {
    const x = rr(x0, x1),
      z = rr(z0, z1);
    const k = rnd();
    if (k < 0.35) {
      const g = new THREE.IcosahedronGeometry(rr(0.4, 1.1), 1);
      b.add(g, M.rockGrey, x, y + 0.2, z, rnd() * 6);
    } else if (k < 0.7 && !kelp) {
      const m = pick(coralCols);
      for (let j = 0; j < 5; j++) {
        const a = rnd() * 6;
        b.add(mcyl(0.03, 0.09, rr(0.5, 1.1), 5, 1), m, x + Math.cos(a) * 0.2, y + 0.4, z + Math.sin(a) * 0.2, 0, Math.cos(a) * 0.5, Math.sin(a) * 0.5);
      }
      b.add(new THREE.IcosahedronGeometry(rr(0.25, 0.5), 1), m, x, y + 0.2, z);
    } else {
      const hgt = kelp ? rr(3, 6) : rr(1, 2);
      for (let j = 0; j < 3; j++) b.add(mcyl(0.03, 0.06, hgt, 5, 1), kelpMat, x + rr(-0.3, 0.3), y + hgt / 2, z + rr(-0.3, 0.3), 0, rr(-0.1, 0.1), rr(-0.1, 0.1));
    }
  }
}

function tank(ctx: Ctx, o: TankO) {
  const { b } = ctx;
  const cx = (o.x0 + o.x1) / 2,
    cz = (o.z0 + o.z1) / 2,
    w = o.x1 - o.x0,
    d = o.z1 - o.z0;
  const y0 = 0.9;
  b.box(M.concreteDark, cx, cz, w, d, y0, { collide: true });
  b.add(mplane(w - 0.2, d - 0.2, 3), M.sand, cx, y0 + 0.08, cz, 0, 0, 0, false, true);
  b.add(mbox(w - 0.3, o.h, d - 0.3, 2), M.aquaWater, cx, y0 + o.h / 2, cz, 0, 0, 0, false, false);
  b.box(ctx.tankGlow, cx, cz, w - 0.2, d - 0.2, 0.15, { y: y0 + o.h, cast: false });
  b.box(M.black, cx, cz, w + 0.4, d + 0.4, 1.4, { y: y0 + o.h + 0.1, cast: false });
  // dark side walls and glass front
  const sides: Record<string, [number, number, number, number]> = {
    n: [o.x0, o.z0, o.x1, o.z0],
    s: [o.x1, o.z1, o.x0, o.z1],
    e: [o.x1, o.z0, o.x1, o.z1],
    w: [o.x0, o.z1, o.x0, o.z0],
  };
  for (const k of Object.keys(sides)) {
    const [a, c, e, f] = sides[k];
    if (k === o.front) glassWall(b, a, c, e, f, y0, y0 + o.h, { mull: 4, collide: false, mat: M.acrylic });
    else b.wall(M.black, a, c, e, f, o.h + y0, 0.2, { collide: false });
  }
  decorate(ctx, o.x0 + 1, o.x1 - 1, o.z0 + 1, o.z1 - 1, y0, !!o.kelp, Math.round((w * d) / 3));
  const sc = new FishSchool(o.count, new THREE.Vector3(cx, y0 + o.h * 0.5, cz), new THREE.Vector3(w * 0.38, o.h * 0.3, d * 0.36), o.fish, 0.14);
  ctx.schools.push(sc);
  ctx.dyn.add(sc.mesh);
  (o.swim ?? []).forEach((k, i) => {
    const s = new Swimmer(k, new THREE.Vector3(cx, y0 + o.h * 0.5, cz), new THREE.Vector3(w * 0.3, o.h * 0.2, d * 0.28), 0.25 + i * 0.05, k === "turtle" ? 0.8 : 0.7);
    ctx.swimmers.push(s);
    ctx.dyn.add(s.group);
  });
  b.light({ x: cx, y: y0 + o.h * 0.6, z: cz, color: o.glow ?? 0x4aa8ff, intensity: 14, dist: 14, night: false });
}

/* ------------------------------------------------------------------ */
export function oceanium(ctx: Ctx) {
  const { b } = ctx;
  const X0 = -55,
    X1 = 55,
    Z0 = -185,
    Z1 = -115,
    H = 13;
  b.zone({ id: "ocean", name: "Oceanium", kind: "interior", poly: [[X0, Z0], [X1, Z0], [X1, Z1], [X0, Z1]], color: "#2f9fd0", dark: 0.04 });
  b.zone({ id: "tunnel", name: "Oceanium · Shark tunnel", kind: "interior", poly: [[-5, -167], [5, -167], [5, -133], [-5, -133]], color: "#2f9fd0", dark: 0.02, fog: 1 });

  b.add(mplane(110, 70, 4), floorDark, 0, 0.06, -150);
  // shell
  b.wallGaps(M.concreteDark, X0, Z0, X1, Z0, H, [[49, 61]], 0.8, 5.5);
  b.wallGaps(M.concreteDark, X0, Z1, X1, Z1, H, [[49, 61]], 0.8, 5.5);
  b.wall(M.concreteDark, X0, Z0, X0, Z1, H, 0.8);
  b.wall(M.concreteDark, X1, Z0, X1, Z1, H, 0.8);
  b.box(M.concreteDark, 0, -150, 112, 72, 0.9, { y: H, collide: false });
  b.box(M.black, 0, -150, 110, 70, 0.1, { y: H - 0.1, collide: false, cast: false });
  // wave-shaped facade fins
  for (let i = 0; i < 28; i++) {
    const x = -53.5 + i * 3.96;
    const hh = 4 + 4.5 * Math.abs(Math.sin(i * 0.42 + 0.4));
    b.box(waveBlue, x, Z0 - 0.9, 3.2, 0.7, hh, { y: H, collide: false });
    b.box(waveBlue, x, Z1 + 0.9, 3.2, 0.7, hh * 0.6, { y: H, collide: false });
  }
  b.box(M.white, 0, Z0 - 0.4, 112, 0.4, 0.5, { y: H - 0.2, collide: false });
  // entrance canopy
  b.box(M.glassTint as unknown as THREE.MeshStandardMaterial, 0, Z0 - 6, 16, 10, 0.2, { y: 6.2, collide: false, cast: false });
  b.box(M.steelDark, 0, Z0 - 11, 16.4, 0.3, 0.5, { y: 6.1, collide: false });
  for (const sx of [-1, 1]) b.cyl(M.steelDark, sx * 7.8, Z0 - 10.8, 0.18, 0.18, 6.3, { collide: true, seg: 8 });
  const t = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x4fc3ff, emissiveIntensity: 0, roughness: 0.4 });
  t.userData.tile = 1;
  ctx.b.glow.push({ mat: t, day: 0.0, night: 2.0 });
  signBoard(b, -10, Z0 - 14, 0, "OCEANIUM", "The largest aquarium in the Netherlands", "#12527a");
  b.light({ x: 0, y: 5.5, z: Z0 - 3, color: 0x9fd8ff, intensity: 30, dist: 26, night: false });

  // ---- main shark tank with walk-through tunnel ----
  const TX0 = -30,
    TX1 = 30,
    TZ0 = -166,
    TZ1 = -134,
    TH = 11;
  const tcx = 0,
    tcz = -150;
  b.add(mbox(TX1 - TX0, TH, TZ1 - TZ0, 2), M.aquaWater, tcx, TH / 2, tcz, 0, 0, 0, false, false);
  b.add(mplane(TX1 - TX0 - 0.4, TZ1 - TZ0 - 0.4, 3), M.sand, tcx, 0.08, tcz, 0, 0, 0, false, true);
  b.box(ctx.tankGlow, tcx, tcz, TX1 - TX0, TZ1 - TZ0, 0.2, { y: TH, cast: false });
  b.box(M.black, tcx, tcz, TX1 - TX0 + 1, TZ1 - TZ0 + 1, 2, { y: TH + 0.2, cast: false });
  glassWall(b, TX0, TZ0, -2.8, TZ0, 0, TH, { mull: 5, mat: M.acrylic });
  glassWall(b, 2.8, TZ0, TX1, TZ0, 0, TH, { mull: 5, mat: M.acrylic });
  glassWall(b, TX0, TZ1, -2.8, TZ1, 0, TH, { mull: 5, mat: M.acrylic });
  glassWall(b, 2.8, TZ1, TX1, TZ1, 0, TH, { mull: 5, mat: M.acrylic });
  glassWall(b, TX0, TZ0, TX0, TZ1, 0, TH, { mull: 5, mat: M.acrylic });
  glassWall(b, TX1, TZ0, TX1, TZ1, 0, TH, { mull: 5, mat: M.acrylic });
  // tunnel (acrylic arch) + floor + collision walls
  const tg = mcyl(2.7, 2.7, TZ1 - TZ0, 28, 2, true, Math.PI / 2, Math.PI);
  tg.rotateX(Math.PI / 2);
  b.add(tg, M.acrylic, tcx, 0.05, tcz, 0, 0, 0, false, false);
  b.add(mplane(5.4, TZ1 - TZ0, 2), plain(0x15171a, 0.5), tcx, 0.2, tcz, 0, 0, 0, false, true);
  for (let i = 0; i < 8; i++) {
    const z = TZ0 + 2 + i * 4.4;
    b.box(M.steel, tcx, z, 5.6, 0.14, 0.14, { y: 0, collide: false, cast: false });
    b.add(new THREE.TorusGeometry(2.72, 0.07, 6, 20, Math.PI), M.steelDark, tcx, 0.05, z, 0, 0, 0, false, false);
    b.box(t, -2.5, z, 0.12, 0.5, 0.06, { y: 0.1, collide: false, cast: false });
    b.box(t, 2.5, z, 0.12, 0.5, 0.06, { y: 0.1, collide: false, cast: false });
  }
  b.colliders.push([-2.7, TZ0, -2.7, TZ1, 0.1], [2.7, TZ0, 2.7, TZ1, 0.1]);
  // tank decor – big rock & coral mounds, wreck-ish pillars
  decorate(ctx, TX0 + 2, -4, TZ0 + 2, TZ1 - 2, 0.1, false, 14);
  decorate(ctx, 4, TX1 - 2, TZ0 + 2, TZ1 - 2, 0.1, false, 14);
  for (const [x, z] of [[-18, -158], [20, -142], [-12, -140], [14, -160]]) {
    for (let i = 0; i < 4; i++) b.add(new THREE.IcosahedronGeometry(rr(1.5, 2.8), 1), M.rockGrey, x + rr(-2, 2), rr(0.5, 1.5), z + rr(-2, 2), rnd() * 6);
  }
  // inhabitants
  const sharks = 3,
    rays = 3,
    turtles = 2;
  for (let i = 0; i < sharks; i++) {
    const s = new Swimmer("shark", new THREE.Vector3(0, 6.5 + i * 0.4, -150), new THREE.Vector3(18 + i * 3, 1.6, 10 + i), 0.16 + i * 0.03, 1.15);
    s.ph = i * 2.1;
    ctx.swimmers.push(s);
    ctx.dyn.add(s.group);
  }
  for (let i = 0; i < rays; i++) {
    const s = new Swimmer("ray", new THREE.Vector3(0, 5 + i * 0.7, -150), new THREE.Vector3(14 + i * 4, 1.2, 8 + i * 2), 0.14 + i * 0.03, 1.3);
    s.ph = i * 2.4 + 1;
    ctx.swimmers.push(s);
    ctx.dyn.add(s.group);
  }
  for (let i = 0; i < turtles; i++) {
    const s = new Swimmer("turtle", new THREE.Vector3(0, 4 + i, -150), new THREE.Vector3(21, 1.5, 12), 0.1 + i * 0.03, 1.1);
    s.ph = i * 3;
    ctx.swimmers.push(s);
    ctx.dyn.add(s.group);
  }
  for (const [cols, n, rad] of [
    [[0xffd21a, 0xff8a1e, 0x2f6bff], 90, 1],
    [[0xc7d5e0, 0xe5eef5], 110, 1.2],
    [[0xff4f8a, 0xffd21a], 60, 0.9],
    [[0x9bb0c0, 0xcfd9e0, 0x6a7b8a], 80, 1.1],
  ] as [number[], number, number][]) {
    const sc = new FishSchool(n, new THREE.Vector3(0, 5.5, -150), new THREE.Vector3(24 * rad, 3.2, 12 * rad), cols, 0.16);
    sc.ph.forEach((_, k) => (sc.ph[k] += rnd() * 6));
    ctx.schools.push(sc);
    ctx.dyn.add(sc.mesh);
  }
  b.light({ x: -14, y: 4, z: -150, color: 0x3aa0ff, intensity: 70, dist: 24, night: false });
  b.light({ x: 14, y: 4, z: -150, color: 0x3aa0ff, intensity: 70, dist: 24, night: false });
  b.light({ x: 0, y: 2, z: -150, color: 0x6fc6ff, intensity: 40, dist: 20, night: false });
  signBoard(b, -10, -168.5, 0, "HAAIENTUNNEL", "8 million litres of seawater above you", "#12527a");

  // ---- penguin habitat ----
  const pcx = -37,
    pcz = -175;
  b.box(snow, pcx, pcz, 30, 14, 0.5, { collide: false });
  glassWall(b, -52, -168, -22, -168, 0.5, 3.4, { mull: 5, mat: M.acrylic });
  glassWall(b, -22, -168, -22, -182, 0.5, 3.4, { mull: 5, mat: M.acrylic });
  b.wall(M.concreteDark, -52, -182, -52, -168, 6, 0.4, { collide: false });
  for (let i = 0; i < 9; i++) {
    const s = rr(1, 2.4);
    b.add(new THREE.IcosahedronGeometry(s, 1), snow, pcx + rr(-14, 14), s * 0.4 + 0.3, pcz + rr(-6, 6), rnd() * 6, 0, 0, true, true);
  }
  const pool = new THREE.CircleGeometry(4.5, 28);
  pool.rotateX(-Math.PI / 2);
  b.add(pool, M.poolBlue, pcx + 6, 0.55, pcz + 1, 0, 0, 0, false, true);
  b.box(M.concrete, 0, -168, 30, 0.4, 0.5, { collide: false });
  b.colliders.push([-52, -168, -22, -168, 0.3], [-22, -168, -22, -182, 0.3]);
  for (let i = 0; i < 9; i++) ctx.animals.push(new Animal("penguin", { cx: pcx, cz: pcz, w: 28, d: 12 }, rr(0.9, 1.05), 0.5));
  signBoard(b, -22, -164, 0.3, "PINGUÏNS", "king penguins", "#12527a");
  b.light({ x: pcx, y: 6, z: pcz, color: 0xcfeaff, intensity: 40, dist: 28, night: false });

  // ---- window tanks ----
  tank(ctx, { x0: 22, x1: 52, z0: -182, z1: -170, h: 6, front: "s", fish: [0xb7c4cf, 0xe5eef5, 0xd9a84a], count: 80, kelp: true, id: "northsea", glow: 0x5fb8c8 });
  tank(ctx, { x0: -54, x1: -44, z0: -164, z1: -142, h: 6, front: "e", fish: [0xffd21a, 0x2f6bff, 0xff8a1e], count: 70, swim: ["turtle"], id: "carib", glow: 0x35d0d0 });
  tank(ctx, { x0: 44, x1: 54, z0: -164, z1: -142, h: 6, front: "w", fish: [0xff4f8a, 0x4fd1c5, 0xffd21a], count: 70, id: "cortez", glow: 0x4aa8ff });
  tank(ctx, { x0: -52, x1: -24, z0: -132, z1: -120, h: 6, front: "e", fish: [0xff8a1e, 0x2f6bff, 0xffd21a, 0xff4f8a], count: 110, swim: ["turtle", "ray"], id: "reefW", glow: 0x35d0d0 });
  tank(ctx, { x0: 24, x1: 52, z0: -132, z1: -120, h: 6, front: "w", fish: [0xffd21a, 0xff6f91, 0x4fd1c5], count: 110, swim: ["ray"], id: "reefE", glow: 0x35d0d0 });
  signBoard(b, -42, -139, 0, "GREAT BARRIER REEF", "replica reef", "#12527a");
  signBoard(b, 38, -166, 0, "NOORDZEE", "North Sea", "#12527a");

  // columns and benches
  for (const x of [-42, 42]) for (const z of [-178, -158, -138]) b.cyl(M.concrete, x, z, 0.55, 0.55, H, { collide: true, seg: 14 });
  bench(b, -38, -150, Math.PI / 2);
  bench(b, 38, -150, -Math.PI / 2);
  bench(b, -12, -127, 0);
  bench(b, 12, -127, 0);

  b.poi({ id: "oc-door", name: "Oceanium entrance", x: 0, z: -208, yaw: 0, zone: "ocean", blurb: "The biggest building in the zoo – wave-shaped fins crown the entrance facade." });
  b.poi({ id: "tunnel", name: "Shark tunnel", x: 0, z: -164, yaw: 0, zone: "tunnel", blurb: "Sand tiger sharks, eagle rays and sea turtles glide over you inside the acrylic tunnel." });
  b.poi({ id: "penguin", name: "Penguins", x: -36, z: -160, yaw: Math.PI, zone: "ocean", blurb: "King penguins on an ice-white shore, viewed from above and beneath the waterline." });
  b.poi({ id: "reef", name: "Great Barrier Reef", x: -20, z: -126, yaw: -Math.PI / 2, zone: "ocean", blurb: "A living replica reef with tropical fish, rays and turtles." });
}

/* ------------------------------------------------------------------ */
export function madagascar(ctx: Ctx) {
  const { b } = ctx;
  const x0 = 56,
    x1 = 82,
    z0 = -166,
    z1 = -134;
  b.zone({ id: "mada", name: "Madagaskar (lemur walk-through)", kind: "interior", poly: [[x0, z0], [x1, z0], [x1, z1], [x0, z1]], color: "#6aa84f", dark: 0.75 });
  const cx = (x0 + x1) / 2,
    cz = (z0 + z1) / 2;
  b.add(mplane(26, 32, 3), M.mud, cx, 0.07, cz, 0, 0, 0, false, true);
  glassWall(b, x0, z0, x1, z0, 0, 7, { mull: 3 });
  glassWall(b, x1, z0, x1, z1, 0, 7, { mull: 3 });
  glassWall(b, x0, z1, 66, z1, 0, 7, { mull: 3 });
  glassWall(b, 72, z1, x1, z1, 0, 7, { mull: 3 });
  b.wallGaps(M.concreteDark, x0, z0, x0, z1, 7, [], 0.5);
  b.box(M.glass as unknown as THREE.MeshStandardMaterial, cx, cz, 26.4, 32.4, 0.2, { y: 7, collide: false, cast: false });
  b.box(M.steelDark, cx, cz, 26.6, 0.3, 0.3, { y: 7.1, collide: false });
  b.box(M.steelDark, cx, cz, 0.3, 32.6, 0.3, { y: 7.1, collide: false });
  // baobabs
  for (const [x, z, s] of [[63, -158, 1], [76, -142, 1.2], [75, -160, 0.8]] as number[][]) {
    b.add(mcyl(1.1 * s, 1.7 * s, 5 * s, 14, 1.5), M.bark, x, 2.5 * s, z);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * 6.28;
      b.add(mcyl(0.12, 0.35, 2.2 * s, 6, 1.5), M.bark, x + Math.cos(a) * 0.6 * s, 5.2 * s, z + Math.sin(a) * 0.6 * s, 0, Math.sin(a) * 0.8, Math.cos(a) * -0.8 + 0);
    }
    b.add(blob(2.2 * s, 0.5, 0.3, 0.5, x), M.leafLight, x, 6.4 * s, z);
    b.collideCircle(x, z, 1.8 * s, 8);
  }
  for (let i = 0; i < 16; i++) tropicalPlant(b, rr(x0 + 2, x1 - 2), rr(z0 + 2, z1 - 2), 1.1);
  for (let i = 0; i < 5; i++) tree(b, "palm", rr(x0 + 3, x1 - 3), rr(z0 + 3, z1 - 3), 1, false);
  for (let i = 0; i < 10; i++) b.add(mcyl(0.07, 0.1, rr(3, 5), 5, 1), M.bark, rr(x0 + 2, x1 - 2), 3.8, rr(z0 + 2, z1 - 2), 0, 0, rr(1, 1.4));
  for (let i = 0; i < 7; i++) ctx.animals.push(new Animal("lemur", { cx, cz, w: 22, d: 28 }, rr(0.95, 1.1), 0.6));
  b.light({ x: cx, y: 6, z: cz, color: 0xfff0d0, intensity: 26, dist: 30, night: false });
  signBoard(b, 69, -131, 0, "MADAGASKAR", "ring-tailed lemurs walk freely – please stay on the path", "#6b4a2a");
  b.poi({ id: "lemur", name: "Madagaskar – lemur walk-through", x: 69, z: -126, yaw: Math.PI, zone: "mada", blurb: "Ring-tailed lemurs roam freely through a warm glasshouse of baobabs." });
}

/* ------------------------------------------------------------------ */
export function amazonica(ctx: Ctx) {
  const { b } = ctx;
  const x0 = -148,
    x1 = -92,
    z0 = -197,
    z1 = -153,
    H = 9;
  const cx = (x0 + x1) / 2,
    cz = (z0 + z1) / 2;
  b.zone({ id: "amaz", name: "Amazonica · butterfly paradise", kind: "interior", poly: [[x0, z0], [x1, z0], [x1, z1], [x0, z1]], color: "#6bd36a", dark: 0.7 });
  b.add(mplane(56, 44, 3), M.mud, cx, 0.07, cz, 0, 0, 0, false, true);
  // stone paths
  b.add(mplane(56, 3.6, 3), M.paving, cx, 0.1, -175, 0, 0, 0, false, true);
  b.add(mplane(3.6, 22, 3), M.paving, -120, 0.1, -164, 0, 0, 0, false, true);
  // frame + glazing
  glassWall(b, x0, z0, x1, z0, 0, H, { mull: 3.5, frame: M.steel });
  glassWall(b, x0, z0, x0, z1, 0, H, { mull: 3.5, frame: M.steel });
  glassWall(b, x0, z1, -126, z1, 0, H, { mull: 3.5, frame: M.steel });
  glassWall(b, -114, z1, x1, z1, 0, H, { mull: 3.5, frame: M.steel });
  glassWall(b, x1, z0, x1, -178, 0, H, { mull: 3.5, frame: M.steel });
  glassWall(b, x1, -172, x1, z1, 0, H, { mull: 3.5, frame: M.steel });
  b.box(M.concrete, x1, -175, 1, 0.5, H, { collide: false });
  // gabled glass roof
  const rise = 6,
    half = 22,
    ang = Math.atan2(rise, half);
  const plane = new THREE.PlaneGeometry(56, Math.hypot(half, rise));
  plane.rotateX(-Math.PI / 2);
  b.add(plane, M.glass, cx, H + rise / 2, cz + half / 2, 0, ang, 0, false, false);
  b.add(plane, M.glass, cx, H + rise / 2, cz - half / 2, 0, -ang, 0, false, false);
  for (let i = 0; i <= 8; i++) {
    const x = x0 + (i * 56) / 8;
    for (const s of [-1, 1]) b.add(mcyl(0.07, 0.07, Math.hypot(half, rise), 6, 1), M.steel, x, H + rise / 2, cz + s * (half / 2), 0, s * (Math.PI / 2 - ang) * -1 + 0, 0, false, false);
  }
  b.box(M.steel, cx, cz, 56, 0.3, 0.3, { y: H + rise, collide: false });
  // gable ends
  const tri = new THREE.Shape();
  tri.moveTo(-half, 0);
  tri.lineTo(half, 0);
  tri.lineTo(0, rise);
  const tg = new THREE.ShapeGeometry(tri);
  tg.rotateY(Math.PI / 2);
  b.add(tg, M.glass, x0, H, cz, 0, 0, 0, false, false);
  b.add(tg, M.glass, x1, H, cz, 0, 0, 0, false, false);
  // waterfall rock wall + lake
  b.add(mplane(30, 9, 3), M.poolBlue, -125, 0.4, -186, 0, 0, 0, false, true);
  for (let i = 0; i < 12; i++) {
    const s = rr(2, 3.6);
    b.add(new THREE.IcosahedronGeometry(s, 1), M.rock, -125 + rr(-14, 14), s * 0.8 + (i % 3) * 1.4, -193 + rr(-1, 1), rnd() * 6);
  }
  const wf = new THREE.MeshStandardMaterial({ color: 0xcfe9f2, transparent: true, opacity: 0.55, roughness: 0.1 });
  wf.userData.tile = 1;
  b.add(new THREE.PlaneGeometry(3, 7), wf, -125, 4.5, -190.6, 0, 0, 0, false, false);
  b.collidePoly([[-140, -182], [-110, -182], [-110, -190], [-140, -190]]);
  // vegetation
  for (let i = 0; i < 46; i++) {
    const x = rr(x0 + 2, x1 - 2),
      z = rr(z0 + 3, z1 - 2);
    if (Math.abs(z + 175) < 2.4 || (Math.abs(x + 120) < 2.4 && z > -175) || (x > -142 && x < -108 && z < -181)) continue;
    tropicalPlant(b, x, z, rr(0.9, 1.7));
  }
  for (let i = 0; i < 12; i++) {
    const x = rr(x0 + 3, x1 - 3),
      z = rr(z0 + 3, z1 - 3);
    if (Math.abs(z + 175) < 3 || (Math.abs(x + 120) < 3 && z > -175) || (x > -142 && x < -108 && z < -181)) continue;
    tree(b, "palm", x, z, rr(1, 1.5), true);
  }
  for (const [x, z] of [[-142, -158], [-97, -160], [-98, -192], [-142, -192]]) {
    b.add(mcyl(0.5, 0.9, 8, 10, 1.5), M.bark, x, 4, z);
    b.add(blob(4.2, 0.6, 0.3, 0.5, x), M.leafOak, x, 8.6, z);
  }
  flowerBedStrip(ctx);
  // fauna
  const bf = new Butterflies(110, new THREE.Box3(new THREE.Vector3(x0 + 2, 0.8, z0 + 2), new THREE.Vector3(x1 - 2, 6.5, z1 - 2)));
  ctx.butterflies.push(bf);
  ctx.dyn.add(bf.group);
  for (let i = 0; i < 4; i++) {
    const f = new Flyer("macaw", new THREE.Vector3(cx, 6.5, cz), rr(12, 20), 0.14 + i * 0.02, 0.55);
    ctx.flyers.push(f);
    ctx.dyn.add(f.group);
  }
  b.light({ x: -135, y: 7, z: -165, color: 0xfff0d8, intensity: 26, dist: 34, night: false });
  b.light({ x: -105, y: 7, z: -180, color: 0xfff0d8, intensity: 26, dist: 34, night: false });
  b.light({ x: -120, y: 7, z: -176, color: 0xfff0d8, intensity: 26, dist: 34, night: false });
  signBoard(b, -88, -168, Math.PI / 2, "AMAZONICA", "Zuid-Amerika · butterfly paradise", "#2e6b45");
  b.poi({ id: "amazonica", name: "Amazonica", x: -88, z: -175, yaw: -Math.PI / 2, zone: "amaz", blurb: "A tropical glasshouse with free-flying butterflies, macaws, a waterfall and a lake." });
  void fence;
}

function flowerBedStrip(ctx: Ctx) {
  const { b } = ctx;
  const mats = [0xe33d5b, 0xff9d2e, 0xf4d03f, 0xc66ad8].map((c) => {
    const m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 });
    m.userData.tile = 1;
    return m;
  });
  const g = new THREE.IcosahedronGeometry(0.14, 1);
  for (let i = 0; i < 90; i++) {
    const x = rr(-144, -96),
      z = rr(-195, -156);
    if (Math.abs(z + 175) < 3 || (Math.abs(x + 120) < 3 && z > -175) || (x > -142 && x < -108 && z < -181)) continue;
    b.add(g, pick(mats), x, rr(0.5, 1.3), z, 0, 0, 0, false, true);
  }
}

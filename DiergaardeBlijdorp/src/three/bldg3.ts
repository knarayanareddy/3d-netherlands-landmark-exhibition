import * as THREE from "three";
import { canvasTex, mbox, mcyl, mplane, plain, rnd, rr } from "./kit";
import { M } from "./mats";
import { Animal, Flyer } from "./animals";
import { blob, tree, tropicalPlant, flowerBed } from "./flora";
import { Ctx, glassWall, fence, signBoard, bench, parasolTable, lampPost } from "./props";

const floorStone = new THREE.MeshStandardMaterial({ color: 0x9d968a, roughness: 0.6 });
floorStone.userData.tile = 3;
const snow = plain(0xf2f6f8, 0.9);
const domeWire = new THREE.MeshBasicMaterial({ color: 0xa5adb2, wireframe: true, transparent: true, opacity: 0.75 });
domeWire.userData.tile = 1;
const lakeRock = M.rockGrey;

/* ------------------------------------------------------------------ */
export function tamanIndah(ctx: Ctx) {
  const { b } = ctx;
  const x0 = 112,
    x1 = 168,
    z0 = 17,
    z1 = 53,
    H = 5.6;
  b.zone({ id: "taman", name: "Taman Indah (Asia house)", kind: "interior", poly: [[x0, z0], [x1, z0], [x1, z1], [x0, z1]], color: "#e0833a", dark: 0.32 });
  const cx = (x0 + x1) / 2;
  b.add(mplane(56, 36, 3), floorStone, cx, 0.07, 35, 0, 0, 0, false, true);
  // shell
  b.wallGaps(M.plaster, x0, z1, x1, z1, H, [[25, 31]], 0.6, 3.6);
  b.wall(M.plaster, x0, z0, x0, z1, H, 0.6);
  b.wall(M.plaster, x1, z0, x1, z1, H, 0.6);
  glassWall(b, x0, z0, x1, z0, 0, H, { mull: 4, frame: M.woodDark });
  b.box(M.woodDark, cx, z1 + 0.35, 56.6, 0.3, 0.5, { y: H - 0.6, collide: false });
  // roof deck + joglo tiers
  b.box(M.roofTileDark, cx, 35, 60, 40, 0.6, { y: H, collide: false });
  for (const [px, r] of [[126, 12], [154, 12], [140, 17]] as number[][]) {
    for (let k = 0; k < 3; k++) {
      const rb = r * 1.41 * (1 - k * 0.28);
      const g = new THREE.CylinderGeometry(rb * 0.74, rb, 2.3, 4);
      g.rotateY(Math.PI / 4);
      b.add(g, M.roofTileDark, px, H + 0.6 + k * 2.2 + 1.15, 35);
      if (k < 2) b.box(M.woodDark, px, 35, rb * 0.75 * 1.41 * 0.7, rb * 0.75 * 1.41 * 0.7, 0.8, { y: H + 0.6 + k * 2.2 + 2.2, collide: false });
    }
    b.add(new THREE.ConeGeometry(0.6, 2.4, 6), M.gold, px, H + 10.6, 35);
  }
  // south colonnade
  for (let i = 0; i <= 10; i++) {
    b.cyl(M.woodDark, x0 + 2 + i * 5.2, z1 + 3.6, 0.28, 0.3, H, { collide: i % 1 === 0, seg: 8 });
  }
  b.box(M.roofTileDark, cx, z1 + 3, 58, 7, 0.4, { y: H + 0.2, collide: false });
  b.box(M.roofTileDark, cx, z1 + 6.4, 58, 0.5, 0.8, { y: H - 0.6, collide: false });
  signBoard(b, cx - 12, z1 + 9, Math.PI, "TAMAN INDAH", "Asia · elephants · tapirs · reptiles", "#7a3b1d");
  // indoor elephant hall – bars and stall floor
  b.add(mplane(48, 17, 3), M.sand, cx, 0.1, 28.5, 0, 0, 0, false, true);
  for (let i = 0; i < 74; i++) b.box(M.steelDark, x0 + 4 + i * 0.64, 37, 0.07, 0.07, 3.6, { collide: false, cast: false });
  b.box(M.steelDark, cx, 37, 48, 0.1, 0.12, { y: 3.5, collide: false });
  b.box(M.steelDark, cx, 37, 48, 0.1, 0.12, { y: 0.4, collide: false });
  b.colliders.push([x0 + 3, 37, x1 - 3, 37, 0.15]);
  for (let i = 0; i < 6; i++) b.add(new THREE.IcosahedronGeometry(rr(0.6, 1.2), 1), M.rockGrey, rr(120, 160), 0.5, rr(21, 33), rnd() * 6);
  b.add(mcyl(0.3, 0.3, 4, 8, 1), M.bark, 126, 2, 24);
  ctx.animals.push(new Animal("elephant", { cx, cz: 28, w: 44, d: 14 }, 1, 0.45));
  ctx.animals.push(new Animal("elephant", { cx, cz: 28, w: 44, d: 14 }, 0.5, 0.45));
  // terrariums (west) and tapir pen (east)
  for (let i = 0; i < 3; i++) {
    const tx = 119 + i * 6.4;
    b.box(M.concreteDark, tx, 47.5, 5.4, 3.6, 0.8, { collide: true });
    b.add(mbox(5.2, 1.8, 0.05, 2), M.acrylic, tx, 1.7, 45.7);
    b.add(mplane(5, 3.2, 1), M.sand, tx, 0.82, 47.5, 0, 0, 0, false, true);
    tropicalPlant(b, tx + 1.5, 48.5, 0.7);
    b.add(new THREE.IcosahedronGeometry(0.5, 1), M.rock, tx - 1, 1.1, 48);
    b.light({ x: tx, y: 3.4, z: 47.5, color: 0xffb060, intensity: 7, dist: 7, night: false });
  }
  ctx.animals.push(new Animal("komodo", { cx: 119, cz: 47.5, w: 4.2, d: 3 }, 1, 0.25));
  b.add(mplane(14, 11, 2), M.mud, 157, 0.1, 46.5, 0, 0, 0, false, true);
  fence(b, [[150, 41], [150, 53], [164, 53]], "rail");
  fence(b, [[150, 41], [164, 41], [164, 53]], "rail");
  ctx.animals.push(new Animal("tapir", { cx: 157, cz: 47, w: 13, d: 10 }, 1, 0.3));
  for (let i = 0; i < 6; i++) tropicalPlant(b, rr(152, 162), rr(43, 51), 1);
  b.light({ x: 126, y: 5, z: 28, color: 0xffd9a0, intensity: 24, dist: 28, night: false });
  b.light({ x: 154, y: 5, z: 28, color: 0xffd9a0, intensity: 24, dist: 28, night: false });
  b.light({ x: 140, y: 5, z: 44, color: 0xffd9a0, intensity: 20, dist: 28, night: false });
  b.poi({ id: "taman", name: "Taman Indah", x: 140, z: 76, yaw: Math.PI, zone: "taman", blurb: "A tropical Asian house with Javanese-style tiered roofs: elephants, tapirs and Komodo dragons." });
  b.poi({ id: "elephants-in", name: "Indoor elephants", x: 140, z: 42, yaw: 0, zone: "taman", blurb: "Asian elephants in their indoor hall behind steel bars." });
}

/* ------------------------------------------------------------------ */
export function crocRiver(ctx: Ctx) {
  const { b } = ctx;
  const x0 = -172,
    x1 = -130,
    z0 = 62,
    z1 = 92,
    H = 5;
  const cx = (x0 + x1) / 2;
  b.zone({ id: "croc", name: "Krokodillenrivier", kind: "interior", poly: [[x0, z0], [x1, z0], [x1, z1], [x0, z1]], color: "#7a8f3a", dark: 0.28 });
  b.add(mplane(42, 30, 3), floorStone, cx, 0.07, 77, 0, 0, 0, false, true);
  b.wallGaps(M.brick, x0, z1, x1, z1, H, [[18, 24]], 0.6, 3.4);
  b.wall(M.brick, x0, z0, x0, z1, H, 0.6);
  b.wall(M.brick, x1, z0, x1, z1, H, 0.6);
  b.wall(M.brick, x0, z0, x1, z0, H, 0.6);
  b.box(M.roofTileDark, cx, 77, 44, 32, 0.6, { y: H, collide: false });
  b.box(M.glass as unknown as THREE.MeshStandardMaterial, cx, 77, 40, 6, 0.1, { y: H + 0.62, collide: false, cast: false });
  // pool + bank
  b.box(M.concreteDark, cx, 69, 38, 14, 0.8, { collide: false });
  const pool = new THREE.PlaneGeometry(38, 8);
  pool.rotateX(-Math.PI / 2);
  b.add(pool, M.poolBlue, cx, 0.88, 65, 0, 0, 0, false, true);
  b.add(mplane(38, 6, 3), M.sand, cx, 0.88, 73, 0, 0, 0, false, true);
  b.add(mbox(38, 3, 8, 2), M.aquaWater, cx, 0.8 + 1.5, 65, 0, 0, 0, false, false);
  glassWall(b, x0 + 2, 76.5, x1 - 2, 76.5, 0.8, 4.2, { mull: 4, mat: M.acrylic });
  b.colliders.push([x0 + 2, 76.9, x1 - 2, 76.9, 0.3]);
  for (let i = 0; i < 8; i++) b.add(new THREE.IcosahedronGeometry(rr(0.5, 1.1), 1), M.rockGrey, rr(x0 + 4, x1 - 4), 1.1, rr(62.5, 73), rnd() * 6);
  for (let i = 0; i < 6; i++) tropicalPlant(b, rr(x0 + 3, x1 - 3), rr(63, 72), 1.1);
  for (let i = 0; i < 3; i++) ctx.animals.push(new Animal("croc", { cx, cz: 73, w: 32, d: 5 }, rr(0.9, 1.15), 0.2));
  for (const x of [-160, -150, -140]) b.light({ x, y: 4.2, z: 72, color: 0xffa550, intensity: 14, dist: 14, night: false });
  b.light({ x: cx, y: 4.2, z: 84, color: 0xffe0b0, intensity: 14, dist: 22, night: false });
  signBoard(b, -151, 97, Math.PI, "KROKODILLENRIVIER", "Nile crocodiles", "#4a5a28");
  b.poi({ id: "croc", name: "Krokodillenrivier", x: -151, z: 112, yaw: Math.PI, zone: "croc", blurb: "Nile crocodiles basking on a warm riverbank." });
}

/* ------------------------------------------------------------------ */
export function lodge(ctx: Ctx) {
  const { b } = ctx;
  const x = -118,
    z = 118;
  b.box(M.plaster, x, z, 20, 11, 3.6, { collide: true });
  b.box(M.woodDark, x, z + 5.6, 20.4, 0.3, 0.4, { y: 3.4, collide: false });
  for (const s of [-1, 1]) {
    const g = new THREE.PlaneGeometry(22, 8.4);
    g.rotateX(-Math.PI / 2);
    b.add(g, M.thatch, x, 5.8, z + s * 3.8, 0, s * 0.62, 0, true, true);
  }
  b.box(M.woodDark, x, z, 22, 0.25, 0.25, { y: 7.9, collide: false });
  for (let i = 0; i <= 5; i++) b.cyl(M.woodDark, x - 10 + i * 4, z + 8, 0.16, 0.18, 3.4, { collide: true, seg: 8 });
  b.box(M.wood, x, z + 8, 20, 4.4, 0.2, { y: 0.1, collide: false });
  b.box(M.thatch as unknown as THREE.MeshStandardMaterial, x, z + 8, 21, 5, 0.15, { y: 3.5, collide: false });
  for (let i = 0; i < 4; i++) parasolTable(b, x - 8 + i * 5.4, z + 12.5, M.yellow);
  signBoard(b, x + 13, z + 12, Math.PI, "OEWANJA LODGE", "restaurant & terrace", "#6b4a2a");
  b.light({ x, y: 3.2, z: z + 8, color: 0xffd9a0, intensity: 16, dist: 22, night: true });
}

/* ------------------------------------------------------------------ */
export function aviary(ctx: Ctx) {
  const { b } = ctx;
  const cx = 118,
    cz = 108,
    r = 14;
  b.zone({ id: "aviary", name: "Burung Asia (walk-through aviary)", kind: "outdoor", poly: [[cx - r, cz - r], [cx + r, cz - r], [cx + r, cz + r], [cx - r, cz + r]], color: "#e0833a" });
  b.add(new THREE.SphereGeometry(r, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2), domeWire, cx, 0, cz, 0, 0, 0, false, false);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI;
    b.add(new THREE.TorusGeometry(r, 0.12, 6, 28, Math.PI), M.steel, cx, 0, cz, a, 0, 0, false, false);
  }
  // ring kerb with a south entrance
  b.arcWall(M.concrete, cx, cz, r, 0.5, 0.35, Math.PI * 2 - 0.35, { seg: 40 });
  b.add(mplane(r * 2, r * 2, 3), M.mud, cx, 0.02, cz, 0, 0, 0, false, true);
  const pond = new THREE.CircleGeometry(4.5, 24);
  pond.rotateX(-Math.PI / 2);
  b.add(pond, M.pond, cx + 3, 0.06, cz - 3, 0, 0, 0, false, true);
  b.collideCircle(cx + 3, cz - 3, 4.8, 12);
  for (let i = 0; i < 8; i++) tree(b, "palm", cx + rr(-10, 10), cz + rr(-10, 10), 1.1, false);
  for (let i = 0; i < 12; i++) tropicalPlant(b, cx + rr(-11, 11), cz + rr(-11, 8), 1);
  for (let i = 0; i < 8; i++) ctx.animals.push(new Animal("ibis", { cx: cx + 3, cz: cz - 3, w: 22, d: 22, round: true }, 1.05, 0.4));
  for (let i = 0; i < 3; i++) {
    const f = new Flyer("macaw", new THREE.Vector3(cx, 6.5, cz), rr(5, 8), 0.3, 0.5);
    ctx.flyers.push(f);
    ctx.dyn.add(f.group);
  }
  signBoard(b, cx - 6, cz + r + 4, Math.PI, "BURUNG ASIA", "walk-through aviary", "#7a3b1d");
}

/* ------------------------------------------------------------------ */
export function arctica(ctx: Ctx) {
  const { b } = ctx;
  const x0 = 115,
    x1 = 190;
  b.zone({ id: "arctic", name: "Noord-Amerika · Arctica", kind: "outdoor", poly: [[88, -232], [205, -232], [205, -96], [88, -96]], color: "#8ec5e8" });
  const cx = (x0 + x1) / 2;
  // snow field + ice shelf
  b.add(mplane(75, 40, 3), snow, cx, 0.03, -183, 0, 0, 0, false, true);
  // pool with underwater viewing glass
  b.box(M.rockGrey, 150, -154, 46, 28, 0.6, { collide: false });
  b.add(mbox(40, 3.6, 22, 2), M.aquaWater, 150, 0.6 + 1.8, -154, 0, 0, 0, false, false);
  const surf = new THREE.PlaneGeometry(40, 22);
  surf.rotateX(-Math.PI / 2);
  b.add(surf, M.poolBlue, 150, 4.22, -154, 0, 0, 0, false, true);
  b.box(M.concreteDark, 150, -154, 40.6, 22.6, 0.3, { y: 0.3, collide: false });
  b.add(mplane(40, 22, 3), M.sand, 150, 0.7, -154, 0, 0, 0, false, true);
  b.box(M.rockGrey, 128.3, -154, 1.5, 22.6, 4.8, { collide: false });
  b.box(M.rockGrey, 171.7, -154, 1.5, 22.6, 4.8, { collide: false });
  b.box(M.rockGrey, 150, -165.4, 40, 1.5, 4.8, { collide: false });
  glassWall(b, 130, -142.7, 170, -142.7, 0.6, 4.2, { mull: 6, mat: M.acrylic });
  b.colliders.push([128, -142.2, 172, -142.2, 0.3]);
  // rocky haul-out + mountain backdrop
  for (let i = 0; i < 20; i++) {
    const s = rr(2.5, 6);
    const g = new THREE.IcosahedronGeometry(s, 2);
    const p = g.attributes.position as THREE.BufferAttribute;
    for (let v = 0; v < p.count; v++) p.setXYZ(v, p.getX(v) * 1.2, p.getY(v) * 0.9, p.getZ(v));
    g.computeVertexNormals();
    b.add(g, rnd() < 0.6 ? M.rockGrey : snow, rr(120, 186), s * 0.5, rr(-203, -172), rnd() * 6);
  }
  for (let i = 0; i < 4; i++) {
    const s = rr(9, 14);
    b.add(new THREE.ConeGeometry(s, s * 1.4, 8), M.rockGrey, 125 + i * 20, s * 0.6, -207, rnd() * 6);
    b.add(new THREE.ConeGeometry(s * 0.45, s * 0.7, 8), snow, 125 + i * 20, s * 1.1, -207);
  }
  fence(b, [[x0, -206], [x1, -206], [x1, -168], [x1, -144]], "rock", { collide: true });
  fence(b, [[x0, -206], [x0, -144]], "rock", { collide: true });
  fence(b, [[x0, -143], [129, -143]], "glass");
  fence(b, [[171, -143], [x1, -143]], "glass");
  for (let i = 0; i < 2; i++) ctx.animals.push(new Animal("polar", { cx: 152, cz: -186, w: 66, d: 28 }, i ? 0.85 : 1.05, 0.55));
  b.light({ x: 150, y: 3, z: -154, color: 0x6fc6ff, intensity: 30, dist: 26, night: false });
  signBoard(b, 108, -136, 0.4, "ARCTICA", "ijsberen · polar bears", "#12527a");
  b.poi({ id: "polar", name: "Arctica – polar bears", x: 150, z: -130, yaw: Math.PI, zone: "arctic", blurb: "Polar bears on rocky snowfields with an underwater viewing window." });
}

/* ------------------------------------------------------------------ */
export function northGate(ctx: Ctx) {
  const { b } = ctx;
  const gz = -248;
  b.zone({ id: "gateN", name: "Main entrance (Blijdorplaan)", kind: "outdoor", poly: [[-55, -275], [55, -275], [55, -205], [-55, -205]], color: "#5aa0c8" });
  b.box(M.plasterWhite, -22, gz, 24, 10, 6.5, { collide: true });
  b.box(M.plasterWhite, 22, gz, 24, 10, 6.5, { collide: true });
  b.box(M.steelDark, 0, gz, 20, 11, 0.6, { y: 6.8, collide: false });
  b.box(M.glassTint as unknown as THREE.MeshStandardMaterial, 0, gz + 2, 20, 8, 0.2, { y: 7.3, collide: false, cast: false });
  b.box(M.steelDark, 0, gz + 8, 20.4, 0.3, 0.8, { y: 6.7, collide: false });
  const t = canvasTex(1024, 180, (c, w, h) => {
    c.fillStyle = "#f6f1e4";
    c.fillRect(0, 0, w, h);
    c.fillStyle = "#1c3a2c";
    c.font = "bold 92px 'Helvetica Neue', Arial, sans-serif";
    c.textAlign = "center";
    c.fillText("DIERGAARDE BLIJDORP", w / 2, 118, w - 60);
  });
  const sm = new THREE.MeshStandardMaterial({ map: t, roughness: 0.5 });
  sm.userData.tile = 1;
  b.add(new THREE.PlaneGeometry(22, 3.9), sm, -22, 4.2, gz + 5.05);
  // ticket desks + turnstiles
  for (let i = -1; i <= 1; i += 2) b.box(M.woodDark, i * 7, gz + 1, 3.2, 1.2, 1.1, { collide: true });
  for (let i = -2; i <= 2; i++) {
    if (i === 0) continue;
    b.box(M.steel, i * 2.4, gz - 3, 0.5, 1.4, 1.1, { collide: true });
  }
  for (let i = 0; i < 5; i++) {
    const x = -48 + i * 24;
    b.add(mcyl(0.07, 0.1, 11, 8, 1), M.steel, x, 5.5, gz + 12);
    const flag = new THREE.PlaneGeometry(2.4, 1.5);
    const fm = [M.green, M.white, M.blue][i % 3];
    b.add(flag, fm, x + 1.3, 10, gz + 12);
    b.add(flag, fm, x + 1.3, 10, gz + 12, Math.PI);
    b.colliders.push([x, gz + 12, x, gz + 12, 0.2]);
  }
  for (let i = 0; i < 4; i++) bench(b, -30 + i * 20, gz + 20, Math.PI);
  for (const sx of [-1, 1]) {
    for (let k = 0; k < 4; k++) lampPost(b, ctx, sx * (14 + k * 10), -228 + (k % 2) * 6);
    flowerBed(b, sx * 34, -218, 14, 5, [0xe33d5b, 0xffffff, 0xf4d03f]);
  }
  b.poi({ id: "gate-n", name: "Main entrance (Oceanium side)", x: 0, z: -266, yaw: 0, zone: "gateN", blurb: "The modern main gate on Blijdorplaan. The Oceanium is straight ahead." });
}

/* ------------------------------------------------------------------ */
export function flamingoStrand(ctx: Ctx) {
  const { b } = ctx;
  const cx = -72,
    cz = -100;
  b.add(mplane(46, 28, 3), M.sand, cx, 0.03, cz, 0, 0, 0, false, true);
  const pond = new THREE.CircleGeometry(1, 36);
  pond.rotateX(-Math.PI / 2);
  pond.scale(14, 1, 8);
  b.add(pond, M.pond, cx, 0.07, cz - 2, 0, 0, 0, false, true);
  fence(b, [[cx - 23, cz - 14], [cx + 23, cz - 14], [cx + 23, cz + 14], [cx - 23, cz + 14]], "rail", { closed: true });
  for (let i = 0; i < 9; i++) ctx.animals.push(new Animal("flamingo", { cx, cz, w: 40, d: 24 }, rr(0.95, 1.1), 0.35));
  for (let i = 0; i < 5; i++) b.add(new THREE.IcosahedronGeometry(rr(0.4, 0.9), 1), M.rockGrey, cx + rr(-18, 18), 0.3, cz + rr(-10, 10), rnd() * 6);
  signBoard(b, cx - 20, cz + 18, Math.PI, "FLAMINGO-STRAND", "greater flamingos", "#c05a78");
  b.poi({ id: "flamingo", name: "Flamingo beach", x: cx, z: cz + 24, yaw: Math.PI, zone: "oceanside", blurb: "Greater flamingos wading in a shallow lagoon." });
  void blob;
  void lakeRock;
  void parasolTable;
}

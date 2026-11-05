import * as THREE from "three";
import { canvasTex, mbox, mcyl, mplane, rnd, rr } from "./kit";
import { M } from "./mats";
import { Animal } from "./animals";
import { blob, tree, tropicalPlant, flowerBed, tufts } from "./flora";
import { Ctx, glassWall, fence, fenceRect, parasolTable, signBoard, bench, lampPost } from "./props";

const floorTile = new THREE.MeshStandardMaterial({ color: 0xd9ceb6, roughness: 0.38, metalness: 0.02 });
floorTile.userData.tile = 4;
const ceilingMat = new THREE.MeshStandardMaterial({ color: 0xece6d8, roughness: 0.9, side: THREE.DoubleSide });
ceilingMat.userData.tile = 4;
const tealTile = new THREE.MeshStandardMaterial({ color: 0x2f8f8a, roughness: 0.25, metalness: 0.1 });
tealTile.userData.tile = 2;

export function archRoof(span: number, rise: number, thick: number, length: number, tile: number) {
  const R = (span * span / 4 + rise * rise) / (2 * rise);
  const cy = rise - R;
  const half = Math.asin(span / 2 / R);
  const N = 30;
  const outer: [number, number][] = [],
    inner: [number, number][] = [];
  for (let i = 0; i <= N; i++) {
    const a = -half + (2 * half * i) / N;
    outer.push([R * Math.sin(a), cy + R * Math.cos(a)]);
    inner.push([(R - thick) * Math.sin(a), cy + (R - thick) * Math.cos(a)]);
  }
  const sh = new THREE.Shape();
  sh.moveTo(outer[0][0], outer[0][1]);
  outer.forEach((p) => sh.lineTo(p[0], p[1]));
  inner.reverse().forEach((p) => sh.lineTo(p[0], p[1]));
  sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: length, bevelEnabled: false, steps: 1, curveSegments: 1 });
  g.translate(0, 0, -length / 2);
  g.rotateY(Math.PI / 2);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / tile, uv.getY(i) / tile);
  return g;
}

function mosaicTex() {
  return canvasTex(512, 512, (c, w, h) => {
    c.fillStyle = "#1f4f7a";
    c.fillRect(0, 0, w, h);
    const cols = ["#e8c14a", "#d8742a", "#2c8f86", "#f1ead2", "#b53d3a", "#4a7fb8", "#6aa84f"];
    const cx = w / 2;
    for (let r = 12; r < 250; r += 14) {
      const n = Math.floor(r * 0.45);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + r * 0.1;
        const k = Math.floor((r / 14 + Math.sin(a * 3) * 1.5 + 10) % cols.length);
        c.fillStyle = cols[Math.abs(k) % cols.length];
        c.globalAlpha = 0.85;
        c.save();
        c.translate(cx + Math.cos(a) * r, cx + Math.sin(a) * r);
        c.rotate(a);
        c.fillRect(-5, -5, 10, 10);
        c.restore();
      }
    }
    c.globalAlpha = 1;
  });
}

export function rivierahal(ctx: Ctx) {
  const { b } = ctx;
  const W = M.plasterWhite;
  b.zone({ id: "hall", name: "Rivièrahal · Biotopia", kind: "interior", poly: [[-30, 22], [30, 22], [30, 62], [-30, 62]], color: "#d9b36a", dark: 0.5 });
  b.zone({ id: "wingW", name: "Rivièrahal · West wing (gorillas)", kind: "interior", poly: [[-60, 28], [-30, 28], [-30, 58], [-60, 58]], color: "#d9b36a", dark: 0.45 });
  b.zone({ id: "wingE", name: "Rivièrahal · East wing (giraffes)", kind: "interior", poly: [[30, 28], [60, 28], [60, 58], [30, 58]], color: "#d9b36a", dark: 0.45 });
  b.zone({ id: "pavW", name: "Victoria pavilion (water lilies)", kind: "interior", poly: [[-90, 28], [-60, 28], [-60, 58], [-90, 58]], color: "#d9b36a", dark: 0.5 });
  b.zone({ id: "pavE", name: "East pavilion (terrariums)", kind: "interior", poly: [[60, 28], [90, 28], [90, 58], [60, 58]], color: "#d9b36a", dark: 0.5 });

  // ---------- floors ----------
  b.add(mplane(124, 40, 4), floorTile, 0, 0.06, 42);
  for (const sx of [-1, 1]) {
    const g = new THREE.CircleGeometry(14, 40);
    g.rotateX(-Math.PI / 2);
    b.add(g, floorTile, sx * 74, 0.06, 43, 0, 0, 0, false, true);
  }

  // ---------- hall shell ----------
  const hallH = 9;
  // front: glass between columns, two entrances + central semicircular bay
  const fz = 62;
  const frontSegs: [number, number][] = [[-30, -18.5], [-13.5, -9], [9, 13.5], [18.5, 30]];
  frontSegs.forEach(([a, c]) => glassWall(b, a, fz, c, fz, 0, hallH, { mull: 2.5, frame: M.steel }));
  for (const sx of [-1, 1]) b.box(W, sx * 16, fz, 5.4, 0.6, hallH - 4.4, { y: 4.4, collide: false });
  [-30, -9.4, 9.4, 30].forEach((x) => b.box(W, x, fz, 1.3, 1.3, hallH + 1.3, { collide: true }));
  [-18.5, -13.5, 13.5, 18.5].forEach((x) => b.box(W, x, fz, 0.5, 0.5, 4.4, { collide: false }));
  // canopies over the entrances
  for (const sx of [-1, 1]) {
    b.box(W, sx * 16, fz + 3.6, 9.5, 7.2, 0.35, { y: 4.3, collide: false });
    b.box(tealTile, sx * 16, fz + 7.2, 9.5, 0.2, 0.5, { y: 4.1, collide: false });
    [-4, 4].forEach((o) => b.cyl(W, sx * 16 + o, fz + 6.6, 0.25, 0.25, 4.3, { collide: true, seg: 12 }));
  }
  // semicircular bay
  b.arcWall(M.glassRound, 0, fz, 9, 6.6, -Math.PI / 2, Math.PI / 2, { seg: 28 });
  b.add(mcyl(9.4, 9.4, 0.5, 28, 4, false, -Math.PI / 2, Math.PI), W, 0, 6.85, fz);
  b.arcWall(W, 0, fz, 9.4, 1.3, -Math.PI / 2, Math.PI / 2, { y: 7.1, collide: false, seg: 28 });
  for (let i = 0; i <= 8; i++) {
    const a = -Math.PI / 2 + (i / 8) * Math.PI;
    b.box(M.steel, Math.sin(a) * 9, fz + Math.cos(a) * 9, 0.14, 0.14, 6.6, { cast: false });
  }
  // back wall + sides
  b.wallGaps(W, -30, 22, 30, 22, hallH, [[27, 33]], 0.5, 3.6);
  b.wallGaps(W, -30, 22, -30, 62, hallH, [[8, 32]], 0.5, 4.5);
  b.wallGaps(W, 30, 22, 30, 62, hallH, [[8, 32]], 0.5, 4.5);
  // clerestory strip + arched ridgeless roof + glazed edge tiles
  glassWall(b, -30, fz, 30, fz, hallH, hallH + 1.3, { mull: 2.5, collide: false });
  glassWall(b, -30, 22, 30, 22, hallH, hallH + 1.3, { mull: 2.5, collide: false });
  b.add(archRoof(40.6, 5.2, 0.7, 61, 4), M.plaster, 0, hallH + 1.3, 42);
  b.box(tealTile, 0, fz + 0.2, 61, 0.4, 0.5, { y: hallH + 1.2, collide: false });
  b.box(tealTile, 0, 21.8, 61, 0.4, 0.5, { y: hallH + 1.2, collide: false });
  // interior glow strips along the roof
  for (const z of [30, 42, 54]) b.box(ctx.windowGlow, 0, z, 56, 0.3, 0.1, { y: hallH + 1.25, collide: false, cast: false });

  // Roof sculptures (angel + unicorns) – stylised
  const gold = M.gold;
  b.add(new THREE.SphereGeometry(0.5, 12, 10), gold, 0, hallH + 7.6, 24);
  b.add(mcyl(0.3, 0.6, 2.6, 10, 1), gold, 0, hallH + 6.3, 24);
  for (const sx of [-1, 1]) {
    const wing = new THREE.SphereGeometry(1, 10, 8);
    wing.scale(0.08, 1.2, 0.5);
    b.add(wing, gold, sx * 0.7, hallH + 7.0, 24, 0, 0, sx * -0.4);
    const u = new THREE.SphereGeometry(1, 10, 8);
    u.scale(0.5, 0.6, 1.1);
    b.add(u, gold, sx * 6, hallH + 6.7, 24);
    b.add(mcyl(0.12, 0.2, 1.2, 8, 1), gold, sx * 6, hallH + 7.8, 25.2, 0, 0.5);
  }

  // ---------- wings ----------
  for (const sx of [-1, 1]) {
    const x0 = sx * 30,
      x1 = sx * 58;
    glassWall(b, x0, 58, x1, 58, 0, 8.4, { mull: 2.5, frame: M.steel });
    b.wallGaps(W, x0, 28, x1, 28, 8.4, [], 0.5);
    // wing end opens to pavilion
    b.wallGaps(W, x1, 28, x1, 58, 8.4, [[6, 24]], 0.5, 4.5);
    b.box(W, sx * 44, 43, 29, 31, 0.8, { y: 8.4, collide: false });
    b.box(tealTile, sx * 44, 58.2, 29, 0.3, 0.45, { y: 8.4, collide: false });
    for (const z of [38, 48]) b.box(ctx.windowGlow, sx * 44, z, 26, 0.3, 0.08, { y: 8.35, collide: false, cast: false });
  }

  // ---------- round pavilions ----------
  for (const sx of [-1, 1]) {
    const cx = sx * 74,
      cz = 43,
      r = 14.5;
    const face = sx > 0 ? -Math.PI / 2 : Math.PI / 2; // opening towards the wing
    const a0 = face + 0.62,
      a1 = face + Math.PI * 2 - 0.62;
    b.arcWall(W, cx, cz, r, 2.4, a0, a1, { seg: 40 });
    b.arcWall(M.glassRound, cx, cz, r, 5.2, a0, a1, { y: 2.4, collide: false, seg: 40 });
    b.arcWall(W, cx, cz, r, 2.2, a0, a1, { y: 7.6, collide: false, seg: 40 });
    for (let i = 0; i <= 14; i++) {
      const a = a0 + ((a1 - a0) * i) / 14;
      b.box(M.steel, cx + Math.sin(a) * r, cz + Math.cos(a) * r, 0.14, 0.14, 7.6, { cast: false });
    }
    b.add(mcyl(r + 0.4, r + 0.4, 0.7, 40, 4), W, cx, 9.95, cz);
    b.add(mcyl(r + 0.5, r + 0.5, 0.3, 40, 2), tealTile, cx, 9.6, cz);
    b.add(new THREE.CylinderGeometry(r * 0.55, r + 0.3, 1.1, 40), W, cx, 10.7, cz);
  }

  // ---------- interiors ----------
  // central fountain with mosaic
  const mos = new THREE.MeshStandardMaterial({ map: mosaicTex(), roughness: 0.3, metalness: 0.05 });
  mos.userData.tile = 1;
  b.add(mcyl(4.6, 4.6, 0.5, 36, 2), W, 0, 0.3, 42);
  const disc = new THREE.CircleGeometry(4.2, 40);
  disc.rotateX(-Math.PI / 2);
  b.add(disc, mos, 0, 0.56, 42, 0, 0, 0, false, true);
  b.add(disc, M.poolBlue, 0, 0.78, 42, 0, 0, 0, false, true);
  b.collideCircle(0, 42, 4.7, 16);
  b.add(new THREE.SphereGeometry(0.9, 14, 10), gold, 0, 1.6, 42);
  b.add(mcyl(0.25, 0.4, 1.2, 10, 1), gold, 0, 1.0, 42);
  b.light({ x: 0, y: 7.5, z: 42, color: 0xffe2b0, intensity: 30, dist: 40, night: false });
  b.light({ x: -20, y: 7.5, z: 36, color: 0xffe2b0, intensity: 20, dist: 34, night: false });
  b.light({ x: 20, y: 7.5, z: 36, color: 0xffe2b0, intensity: 20, dist: 34, night: false });

  // Biotopia – jungle gym trees, ropes, whale-fin slide
  const towers: [number, number][] = [[-19, 36], [19, 34], [-8, 29], [9, 30]];
  towers.forEach(([x, z], i) => {
    const h = 6 + (i % 2);
    b.add(mcyl(0.55, 0.8, h, 12, 1.5), M.bark, x, h / 2, z);
    b.add(blob(3.6, 0.7, 0.3, 0.55, i * 3), i % 2 ? M.leafOak : M.leafLight, x, h + 0.8, z);
    b.add(mcyl(2.4, 2.4, 0.2, 18, 2), M.wood, x, 2.8, z);
    b.add(mcyl(1.8, 1.8, 0.2, 18, 2), M.wood, x, 4.8, z);
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * 6.28;
      b.add(mcyl(0.025, 0.025, 4.6, 5, 1), M.steelDark, x + Math.cos(a) * 2.3, 2.3, z + Math.sin(a) * 2.3);
      b.add(mcyl(0.02, 0.02, 3.2, 5, 1), M.rubber, x + Math.cos(a) * 1.4, 2.4, z + Math.sin(a) * 1.4, 0, 0.9 * Math.sin(a), 0.9 * Math.cos(a));
    }
    b.collideCircle(x, z, 2.4, 10);
  });
  // whale fin slide
  const fin = new THREE.SphereGeometry(1, 16, 12);
  fin.scale(0.5, 3.2, 1.8);
  const blueWhale = new THREE.MeshStandardMaterial({ color: 0x2c4e7c, roughness: 0.4 });
  blueWhale.userData.tile = 2;
  b.add(fin, blueWhale, 22, 3.0, 50, 0.5, 0, -0.15);
  b.add(mbox(1.8, 0.12, 8, 2), M.steel, 22, 2.0, 46.3, 0, 0.5, 0);
  b.box(M.steelDark, 22 - 0.95, 46.3, 0.08, 7.4, 0.5, { y: 1.6, ry: 0, cast: false });
  b.collideBox(22, 49, 4, 6, 0);
  // benches & café tables
  for (const [x, z] of [[-12, 56], [12, 56], [-24, 42], [24, 42]] as number[][]) parasolTable(b, x, z, rnd() < 0.5 ? M.teal : M.yellow);
  // hall plants
  [[-27, 26], [27, 26], [-27, 58], [27, 58], [-5, 60], [5, 60]].forEach(([x, z]) => tropicalPlant(b, x, z, 1.4));
  signBoard(b, 0, 56, 0, "BIOTOPIA", "indoor jungle playground", "#c7762b");

  // gorilla house (west wing)
  const gx = -47,
    gz = 40;
  b.add(mplane(18, 16, 3), M.mud, gx, 0.08, gz, 0, 0, 0, false, true);
  glassWall(b, -56, 48, -38, 48, 0, 4.4, { mull: 3, mat: M.acrylic });
  glassWall(b, -38, 48, -38, 32, 0, 4.4, { mull: 3, mat: M.acrylic });
  b.wall(M.concreteDark, -56, 32, -38, 32, 6, 0.4);
  b.wall(M.concreteDark, -56, 32, -56, 48, 6, 0.4);
  for (let i = 0; i < 7; i++) {
    const g = new THREE.IcosahedronGeometry(rr(0.7, 1.5), 1);
    b.add(g, M.rockGrey, gx + rr(-7, 7), 0.5, gz + rr(-6, 6), rnd() * 6);
  }
  for (const [x, z] of [[-52, 36], [-43, 36]]) {
    b.add(mcyl(0.22, 0.3, 6, 8, 1.5), M.bark, x, 3, z);
    b.add(mcyl(0.05, 0.05, 8, 5, 1), M.rubber, x + 4.5, 5.2, z, 0, 0, Math.PI / 2 - 0.1);
  }
  tropicalPlant(b, -54, 34, 1.3);
  tropicalPlant(b, -41, 34, 1.1);
  b.light({ x: -47, y: 6, z: 42, color: 0xfff0d0, intensity: 24, dist: 26, night: false });
  signBoard(b, -34, 52, -Math.PI / 2, "HART VAN AFRIKA", "Western lowland gorillas", "#6b4a2a");
  for (let i = 0; i < 2; i++) {
    const a = new Animal("gorilla", { cx: gx, cz: gz, w: 16, d: 14 }, i ? 0.8 : 1.05, 0.5);
    ctx.animals.push(a);
  }

  // giraffe wing (east)
  b.add(mplane(20, 22, 3), M.sand, 47, 0.08, 43, 0, 0, 0, false, true);
  fence(b, [[37, 54], [57, 54], [57, 32]], "rail");
  fence(b, [[37, 54], [37, 32]], "rail");
  for (let i = 0; i < 2; i++) ctx.animals.push(new Animal("giraffe", { cx: 47, cz: 43, w: 18, d: 20 }, i ? 0.85 : 1, 0.35, true));
  ctx.animals.push(new Animal("warthog", { cx: 47, cz: 43, w: 18, d: 20 }, 1, 0.5, true));
  b.light({ x: 47, y: 8, z: 43, color: 0xfff0d0, intensity: 22, dist: 30, night: false });
  signBoard(b, 34, 56, Math.PI / 2, "DIKHUIDENVLEUGEL", "Giraffes & warthogs", "#6b4a2a");

  // Victoria pavilion (west)
  {
    const cx = -76,
      cz = 43;
    b.add(mcyl(8.2, 8.2, 0.7, 40, 2), M.concrete, cx, 0.35, cz);
    const d = new THREE.CircleGeometry(7.6, 40);
    d.rotateX(-Math.PI / 2);
    b.add(d, M.poolBlue, cx, 0.72, cz, 0, 0, 0, false, true);
    b.collideCircle(cx, cz, 8.3, 20);
    const pad = new THREE.CylinderGeometry(1, 1, 0.06, 18);
    const padM = new THREE.MeshStandardMaterial({ color: 0x3f7a2a, roughness: 0.6 });
    padM.userData.tile = 1;
    for (let i = 0; i < 24; i++) {
      const a = rnd() * 6.28,
        rd = Math.sqrt(rnd()) * 6.4;
      const s = rr(0.7, 1.3);
      const g = pad.clone();
      g.scale(s, 1, s);
      b.add(g, padM, cx + Math.cos(a) * rd, 0.78, cz + Math.sin(a) * rd, 0, 0, 0, false, true);
    }
    const lot = new THREE.MeshStandardMaterial({ color: 0xf3c3d6, roughness: 0.5 });
    lot.userData.tile = 1;
    for (let i = 0; i < 6; i++) {
      const a = rnd() * 6.28,
        rd = rr(1, 6);
      b.add(new THREE.SphereGeometry(0.2, 8, 6), lot, cx + Math.cos(a) * rd, 0.95, cz + Math.sin(a) * rd, 0, 0, 0, false, true);
    }
    for (let i = 0; i < 9; i++) {
      const a = rr(0.6, 5.7) + Math.PI;
      tropicalPlant(b, cx + Math.cos(a) * 11.3, cz + Math.sin(a) * 11.3, 1.5);
    }
    b.light({ x: cx, y: 8, z: cz, color: 0xffeccc, intensity: 22, dist: 30, night: false });
    signBoard(b, cx, 56, 0, "VICTORIA SERRE", "giant Amazon water lilies", "#2e6b45");
  }
  // East pavilion – terrariums with Komodo dragon
  {
    const cx = 74,
      cz = 43;
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 2 + 0.3 + (i / 5) * (Math.PI * 2 - 0.9) + Math.PI;
      const tx = cx + Math.sin(a) * 11.2,
        tz = cz + Math.cos(a) * 11.2;
      const ry = a + Math.PI;
      b.box(M.concreteDark, tx, tz, 3.6, 2.4, 0.9, { ry: ry + Math.PI / 2, collide: true });
      b.add(mbox(3.4, 1.6, 0.05, 2), M.acrylic, tx + Math.sin(a) * -1.2, 1.7, tz + Math.cos(a) * -1.2, a + Math.PI);
      b.add(mplane(3.2, 2.2, 1), M.sand, tx, 0.95, tz, 0, 0, 0, false, true);
      tropicalPlant(b, tx + 0.5, tz + 0.5, 0.5);
      b.add(new THREE.IcosahedronGeometry(0.4, 1), M.rockGrey, tx - 0.5, 1.1, tz - 0.4);
    }
    b.add(mcyl(2, 2, 0.5, 20, 2), M.wood, cx, 0.25, cz);
    b.collideCircle(cx, cz, 2.2, 10);
    b.light({ x: cx, y: 8, z: cz, color: 0xffeccc, intensity: 22, dist: 30, night: false });
    signBoard(b, cx, 56, 0, "TERRARIA", "reptiles & amphibians", "#2e6b45");
  }

  // plaza in front
  signBoard(b, -26, 78, 0.2, "RIVIÈRAHAL", "Sybold van Ravesteyn · 1940 · rijksmonument", "#5a3a2a");

  b.poi({ id: "hall-front", name: "Rivièrahal – South facade", x: 0, z: 96, yaw: Math.PI, zone: "hall", blurb: "Sybold van Ravesteyn's 1940 landmark: a steel frame wrapped in sculpted concrete, with a curved ridgeless roof, glass curtain walls and a semicircular bay." });
  b.poi({ id: "hall-in", name: "Biotopia (inside the hall)", x: 0, z: 56, yaw: Math.PI, zone: "hall", blurb: "Under the 40 m wide arched roof: fountain with mosaic, jungle-gym trees and a whale-fin slide." });
  b.poi({ id: "gorilla-in", name: "Gorilla house", x: -47, z: 54, yaw: Math.PI, zone: "wingW", blurb: "Western lowland gorillas behind acrylic glass, in the hall's west wing." });
  b.poi({ id: "victoria", name: "Victoria pavilion", x: -76, z: 56, yaw: Math.PI, zone: "pavW", blurb: "A round pavilion with the giant Amazon water lily Victoria amazonica." });
}

/* ------------------------------------------------------------------ */
/*  Tea house, pond and south entrance                                */
/* ------------------------------------------------------------------ */
export function entrance(ctx: Ctx) {
  const { b } = ctx;
  const W = M.plasterWhite;
  // pond (vijver) – the formal axis tea house → pond → Rivièrahal
  const pond = new THREE.CircleGeometry(1, 64);
  pond.rotateX(-Math.PI / 2);
  pond.scale(31, 1, 14);
  b.add(pond, M.pond, 0, 0.06, 116, 0, 0, 0, false, true);
  const ringPts: [number, number][] = [];
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    ringPts.push([Math.cos(a) * 31.8, 116 + Math.sin(a) * 14.8]);
  }
  for (let i = 0; i < 48; i++) {
    const a = ringPts[i],
      c = ringPts[(i + 1) % 48];
    b.wall(M.concrete, a[0], a[1], c[0], c[1], 0.45, 0.7, { collide: true });
  }
  // fountain jets
  for (let i = 0; i < 5; i++) {
    const x = -8 + i * 4;
    b.add(new THREE.CylinderGeometry(0.03, 0.06, 4 + (i % 2) * 2, 6), M.white, x, 2.3, 116);
  }
  // tea house (Theeschenkerij)
  const tz = 158;
  b.box(W, 0, tz, 34, 9, 4.8, { collide: true });
  b.box(W, 0, tz, 36, 11, 0.5, { y: 4.8, collide: false });
  b.cyl(W, 0, tz - 0.5, 6.5, 6.5, 8.4, { collide: true, seg: 24 });
  b.add(new THREE.CylinderGeometry(7.2, 7.2, 0.6, 28), W, 0, 8.7, tz - 0.5);
  b.add(new THREE.SphereGeometry(5, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.copper, 0, 9, tz - 0.5);
  b.add(new THREE.CylinderGeometry(0.1, 0.1, 3, 6), M.gold, 0, 15, tz - 0.5);
  glassWall(b, -16.5, tz + 4.6, -7, tz + 4.6, 0.3, 4.3, { collide: false, mull: 2 });
  glassWall(b, 7, tz + 4.6, 16.5, tz + 4.6, 0.3, 4.3, { collide: false, mull: 2 });
  for (let i = 0; i <= 6; i++) b.cyl(W, -15 + i * 5, tz + 5.5, 0.28, 0.28, 4.8, { collide: false, seg: 10 });
  b.box(W, 0, tz + 3, 36, 3.6, 0.25, { y: 4.8, collide: false });
  b.box(tealTile, 0, tz + 4.9, 36, 0.2, 0.45, { y: 4.7, collide: false });
  signBoard(b, 0, tz + 11, Math.PI, "THEESCHENKERIJ", "tea house · rijksmonument", "#5a3a2a");
  for (const [x, z] of [[-14, tz + 9], [-9, tz + 11], [9, tz + 11], [14, tz + 9], [-20, tz + 7], [20, tz + 7]] as number[][]) parasolTable(b, x, z, M.red);
  b.light({ x: 0, y: 4, z: tz + 5, color: 0xffd9a0, intensity: 20, dist: 26, night: true });

  // flower beds along the axis
  for (const sx of [-1, 1]) {
    flowerBed(b, sx * 12, 136, 14, 4, [0xe33d5b, 0xf4d03f, 0xffffff, 0xc66ad8]);
    flowerBed(b, sx * 12, 98, 14, 4, [0xff9d2e, 0xf4d03f, 0xe33d5b]);
    flowerBed(b, sx * 44, 90, 10, 6, [0xc66ad8, 0xffffff, 0xf4d03f]);
  }
  for (const sx of [-1, 1])
    for (let i = 0; i < 6; i++) {
      tree(b, "plane", sx * 36, 195 - i * 18, 1.1);
    }

  // south gate (Van Aerssenlaan)
  const gz = 214;
  const brickG = M.brick;
  for (const sx of [-1, 1]) {
    // director's building / Winkel van Sinkel
    b.box(brickG, sx * 38, gz - 6, 18, 12, 6.5, { collide: true });
    const roof = new THREE.CylinderGeometry(0.6, 11.6, 3.4, 4);
    roof.rotateY(Math.PI / 4);
    roof.scale(1.1, 1, 0.78);
    b.add(roof, M.roofTile, sx * 38, 8.2, gz - 6);
    for (let i = 0; i < 4; i++) {
      b.box(M.black, sx * 38 - 6 + i * 4, gz + 0.05, 1.6, 0.15, 2.0, { y: 1.8, collide: false, cast: false });
      b.box(M.white, sx * 38 - 6 + i * 4, gz + 0.09, 1.9, 0.1, 0.2, { y: 3.8, collide: false, cast: false });
    }
    // ticket booths
    b.box(brickG, sx * 17, gz - 1, 5, 4, 3.4, { collide: true });
    b.box(M.copper, sx * 17, gz - 1, 6, 5, 0.3, { y: 3.4, collide: false });
    b.box(M.glassTint, sx * 17, gz + 1.05, 3.2, 0.1, 1.4, { y: 1.3, collide: false, cast: false });
    // gate pillars
    b.box(brickG, sx * 10.5, gz + 3, 2, 2, 5.2, { collide: true });
    b.box(M.gold, sx * 10.5, gz + 3, 2.4, 2.4, 0.3, { y: 5.2, collide: false });
    // brick wall & iron fence
    b.wall(brickG, sx * 12, gz + 3, sx * 64, gz + 3, 2.4, 0.6);
    b.wall(M.steelDark, sx * 10.5, gz + 3, sx * 4, gz + 3, 0.2, 0.2, { collide: false });
  }
  // iron gates (open)
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 9; i++) b.box(M.steelDark, sx * (5 + i * 0.45), gz + 3, 0.04, 0.04, 2.6, { cast: false });
    b.box(M.steelDark, sx * 7.2, gz + 3, 4.2, 0.05, 0.08, { y: 2.4, cast: false });
  }
  // turnstile line
  for (let i = -1; i <= 1; i++) {
    b.box(M.steel, i * 5.2, gz - 6, 0.6, 1.4, 1.1, { collide: true });
    b.box(M.blue, i * 5.2, gz - 6, 0.7, 0.2, 0.1, { y: 1.1, collide: false });
  }
  // entrance arch sign
  const t = canvasTex(1024, 160, (c, w, h) => {
    c.fillStyle = "#1c3a2c";
    c.fillRect(0, 0, w, h);
    c.fillStyle = "#e6c36a";
    c.font = "bold 72px Georgia, serif";
    c.textAlign = "center";
    c.fillText("DIERGAARDE BLIJDORP", w / 2, 108, w - 80);
  });
  const sm = new THREE.MeshStandardMaterial({ map: t, roughness: 0.5 });
  sm.userData.tile = 1;
  b.add(new THREE.PlaneGeometry(14, 2.2), sm, 0, 6.3, gz + 3.2);
  b.add(new THREE.PlaneGeometry(14, 2.2), sm, 0, 6.3, gz + 2.8, Math.PI);
  b.box(M.steelDark, 0, gz + 3, 22, 0.4, 0.3, { y: 5.1, collide: false });
  b.box(M.steelDark, 0, gz + 3, 14.4, 0.4, 2.4, { y: 5.1, collide: false });

  // outer pavement + street
  b.poi({ id: "gate-s", name: "City entrance (Van Aerssenlaan)", x: 0, z: 232, yaw: Math.PI, zone: "entrance", blurb: "The monumental 1940 entrance: ticket booths, gate pillars, the director's building and the Winkel van Sinkel café." });
  b.poi({ id: "tea", name: "Theeschenkerij & pond", x: 0, z: 140, yaw: Math.PI, zone: "entrance", blurb: "The compositional axis of the zoo runs from the tea house across the pond to the Rivièrahal." });
  bench(b, -22, 120, Math.PI / 2);
  bench(b, 22, 120, -Math.PI / 2);
  for (const sx of [-1, 1]) lampPost(b, ctx, sx * 12, 176);
  tufts(b, 0, 190, 20, 4);
  void fence;
  void fenceRect;
}

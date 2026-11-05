import * as THREE from "three";
import { pbr, plain, glassMat, canvasTex, patch, rnd, rr } from "./kit";

/* leaf / foliage textures (procedural, painted once) */
function leafTexture(hueA: string, hueB: string) {
  return canvasTex(256, 256, (c, w, h) => {
    c.fillStyle = hueA;
    c.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) {
      const x = Math.random() * w,
        y = Math.random() * h;
      const l = 6 + Math.random() * 10;
      const a = Math.random() * Math.PI * 2;
      c.fillStyle = Math.random() < 0.5 ? hueB : `rgba(0,0,0,${Math.random() * 0.35})`;
      c.globalAlpha = 0.25 + Math.random() * 0.5;
      c.beginPath();
      c.ellipse(x, y, l * 0.5, l * 0.22, a, 0, 7);
      c.fill();
      // wrap
      c.ellipse(x - w, y, l * 0.5, l * 0.22, a, 0, 7);
      c.ellipse(x + w, y, l * 0.5, l * 0.22, a, 0, 7);
      c.fill();
    }
    c.globalAlpha = 1;
  });
}

function tuftTexture(col: [string, string]) {
  return canvasTex(256, 256, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) {
      const x = 20 + Math.random() * (w - 40);
      const hgt = 90 + Math.random() * 160;
      const lean = (Math.random() - 0.5) * 70;
      const g = c.createLinearGradient(0, h, 0, h - hgt);
      g.addColorStop(0, col[0]);
      g.addColorStop(1, col[1]);
      c.fillStyle = g;
      c.beginPath();
      c.moveTo(x - 3, h);
      c.quadraticCurveTo(x + lean * 0.3, h - hgt * 0.6, x + lean, h - hgt);
      c.quadraticCurveTo(x + lean * 0.3 + 2, h - hgt * 0.55, x + 3, h);
      c.fill();
    }
  });
}

function frondTexture() {
  return canvasTex(256, 512, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    c.strokeStyle = "#3d5a1c";
    c.lineWidth = 4;
    c.beginPath();
    c.moveTo(w / 2, h);
    c.lineTo(w / 2, 10);
    c.stroke();
    for (let i = 0; i < 38; i++) {
      const y = h - 14 - i * 12.5;
      const len = (w / 2 - 6) * Math.sin(Math.min(1, (i + 3) / 34) * Math.PI * 0.85 + 0.2);
      for (const s of [-1, 1]) {
        const g = c.createLinearGradient(w / 2, y, w / 2 + s * len, y + 26);
        g.addColorStop(0, "#2f5a1d");
        g.addColorStop(1, "#6f9a3a");
        c.strokeStyle = g;
        c.lineWidth = 9;
        c.beginPath();
        c.moveTo(w / 2, y);
        c.quadraticCurveTo(w / 2 + s * len * 0.6, y - 4, w / 2 + s * len, y + 24);
        c.stroke();
      }
    }
  });
}

function bigLeafTexture() {
  return canvasTex(256, 256, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    const g = c.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, "#2f6a24");
    g.addColorStop(0.5, "#4b8f33");
    g.addColorStop(1, "#2f6a24");
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(w / 2, h);
    c.bezierCurveTo(w * 0.05, h * 0.75, w * 0.0, h * 0.2, w / 2, 4);
    c.bezierCurveTo(w, h * 0.2, w * 0.95, h * 0.75, w / 2, h);
    c.fill();
    c.strokeStyle = "rgba(190,230,140,0.7)";
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(w / 2, h);
    c.lineTo(w / 2, 6);
    c.stroke();
    c.lineWidth = 1.2;
    for (let i = 0; i < 16; i++) {
      const y = h - 14 - i * 15;
      for (const s of [-1, 1]) {
        c.beginPath();
        c.moveTo(w / 2, y);
        c.lineTo(w / 2 + s * w * 0.42, y - 26);
        c.stroke();
      }
    }
  });
}

function thatchTexture() {
  return canvasTex(256, 256, (c, w, h) => {
    c.fillStyle = "#8a7144";
    c.fillRect(0, 0, w, h);
    for (let i = 0; i < 1800; i++) {
      c.strokeStyle = `rgba(${90 + Math.random() * 80},${70 + Math.random() * 60},${30 + Math.random() * 30},0.7)`;
      c.lineWidth = 1 + Math.random() * 1.5;
      const x = Math.random() * w;
      c.beginPath();
      c.moveTo(x, Math.random() * h);
      c.lineTo(x + (Math.random() - 0.5) * 6, Math.random() * h);
      c.stroke();
    }
  });
}

function waterNormal() {
  const t = canvasTex(
    256,
    256,
    (c, w, h) => {
      const img = c.createImageData(w, h);
      const H = (x: number, y: number) =>
        Math.sin(x * 0.12 + Math.sin(y * 0.07) * 2) * 0.5 + Math.sin(y * 0.19 + x * 0.05) * 0.35 + Math.sin((x + y) * 0.31) * 0.15;
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          // periodic: use wrap-friendly frequencies
          const fx = (x / w) * Math.PI * 2,
            fy = (y / h) * Math.PI * 2;
          const dx = Math.cos(fx * 3 + Math.sin(fy * 2) * 1.5) * 0.5 + Math.cos(fx * 7 + fy * 5) * 0.25 + Math.cos(fx * 13 - fy * 9) * 0.12;
          const dy = Math.cos(fy * 4 + Math.sin(fx * 3)) * 0.5 + Math.cos(fy * 9 + fx * 6) * 0.25 + Math.cos(fy * 11 + fx * 8) * 0.12;
          void H;
          const i = (y * w + x) * 4;
          img.data[i] = 128 + dx * 60;
          img.data[i + 1] = 128 + dy * 60;
          img.data[i + 2] = 255;
          img.data[i + 3] = 255;
        }
      c.putImageData(img, 0, 0);
    },
    false
  );
  return t;
}

const alphaMat = (tex: THREE.Texture, rough = 0.9) => {
  const m = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: rough, transparent: false });
  m.userData.tile = 1;
  return m;
};

const leafMapA = leafTexture("#35581f", "#7aa83a");
const leafMapB = leafTexture("#4d6a22", "#a9b840");
const leafMapC = leafTexture("#243f1a", "#4f7a32");
const wNormal = waterNormal();
wNormal.repeat.set(30, 30);

const foliage = (map: THREE.Texture, color = 0xffffff) => {
  const m = new THREE.MeshStandardMaterial({ map, color, vertexColors: true, roughness: 0.85 });
  m.userData.tile = 1;
  return m;
};

export const M = {
  grass: pbr("leafy_grass", 3, { color: 0xc9d8b8, macro: 0.55, rough: 0.95 }),
  grassDry: pbr("withered_grass", 3, { color: 0xe0d5b4, macro: 0.5, rough: 0.97 }),
  paving: pbr("concrete_pavers", 3, { color: 0xffffff, macro: 0.25, rough: 0.85 }),
  asphalt: pbr("asphalt_04", 4, { color: 0xe0e0e0, macro: 0.3, rough: 0.9 }),
  brick: pbr("red_brick_03", 2, { macro: 0.4, grime: 0.7, rough: 0.9 }),
  plaster: pbr("beige_wall_001", 4, { color: 0xf1e8d3, macro: 0.2, grime: 0.9, rough: 0.93 }),
  plasterWhite: pbr("beige_wall_001", 4, { color: 0xfdfaf2, macro: 0.18, grime: 0.9, rough: 0.9 }),
  concrete: pbr("rough_concrete", 3, { color: 0xc2c0bb, macro: 0.3, grime: 0.8, rough: 0.92 }),
  concreteDark: pbr("rough_concrete", 3, { color: 0x6c6e72, macro: 0.3, grime: 0.6, rough: 0.9 }),
  roofTile: pbr("roof_tiles", 2, { macro: 0.3, grime: 0.3, rough: 0.8 }),
  roofTileDark: pbr("roof_tiles", 2, { color: 0x6a5a55, macro: 0.3, rough: 0.8 }),
  rock: pbr("rock_face", 5, { color: 0xffffff, macro: 0.4, rough: 0.95, normal: 1.4 }),
  rockGrey: pbr("rock_face", 5, { color: 0xd4d6d8, macro: 0.4, rough: 0.95, normal: 1.4 }),
  wood: pbr("brown_planks_03", 2, { macro: 0.3, rough: 0.8 }),
  woodDark: pbr("brown_planks_03", 2, { color: 0x7a5e48, macro: 0.3, rough: 0.8 }),
  bark: pbr("bark_brown_02", 1.5, { macro: 0.1, rough: 1 }),
  sand: pbr("sandy_gravel_02", 3, { color: 0xe6d3a8, macro: 0.4, rough: 1 }),
  mud: pbr("brown_mud_leaves_01", 3, { macro: 0.4, rough: 1 }),
  corrugated: pbr("corrugated_iron", 2, { color: 0xbfc5c8, metal: 0.5, rough: 0.55 }),

  white: plain(0xf4f1ea, 0.75),
  cream: plain(0xe8dcc0, 0.8),
  steel: plain(0x8d949a, 0.4, 0.85),
  steelDark: plain(0x2e3236, 0.5, 0.8),
  black: plain(0x15161a, 0.6, 0.2),
  rubber: plain(0x232323, 0.95),
  red: plain(0xb5352a, 0.6),
  blue: plain(0x2a58a0, 0.6),
  yellow: plain(0xe8b52c, 0.6),
  green: plain(0x2f7a44, 0.6),
  teal: plain(0x2a8f95, 0.6),
  copper: plain(0x5da38a, 0.55, 0.4),
  gold: plain(0xc99a2e, 0.35, 0.9),
  ticket: plain(0xd9c28a, 0.8),
  thatch: (() => {
    const m = new THREE.MeshStandardMaterial({ map: thatchTexture(), roughness: 1, side: THREE.DoubleSide });
    m.map!.repeat.set(1, 1);
    m.userData.tile = 3;
    patch(m, 0.3, 0);
    return m;
  })(),
  glass: glassMat(0xcfe3ea, 0.14),
  glassTint: glassMat(0x6aa0b4, 0.22),
  glassRound: glassMat(0xd7eaf0, 0.1),
  acrylic: glassMat(0xbfe6f5, 0.1),
  aquaWater: (() => {
    const m = new THREE.MeshStandardMaterial({
      color: 0x1d8fb3,
      transparent: true,
      opacity: 0.42,
      roughness: 0.2,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    m.userData.tile = 2;
    return m;
  })(),
  pond: (() => {
    const m = new THREE.MeshStandardMaterial({
      color: 0x27493f,
      roughness: 0.06,
      metalness: 0.25,
      normalMap: wNormal,
      transparent: true,
      opacity: 0.93,
      envMapIntensity: 1.6,
    });
    m.normalScale.set(0.35, 0.35);
    m.userData.tile = 2;
    return m;
  })(),
  moat: (() => {
    const m = new THREE.MeshStandardMaterial({ color: 0x3a4a3a, roughness: 0.1, metalness: 0.2, normalMap: wNormal, envMapIntensity: 1.4 });
    m.normalScale.set(0.3, 0.3);
    m.userData.tile = 2;
    return m;
  })(),
  poolBlue: (() => {
    const m = new THREE.MeshStandardMaterial({ color: 0x2f9fbf, roughness: 0.05, metalness: 0.1, normalMap: wNormal, transparent: true, opacity: 0.8 });
    m.normalScale.set(0.4, 0.4);
    m.userData.tile = 2;
    return m;
  })(),

  leafOak: foliage(leafMapA),
  leafLight: foliage(leafMapB),
  leafDark: foliage(leafMapC),
  tuft: alphaMat(tuftTexture(["#3b5a22", "#8db04a"])),
  tuftDry: alphaMat(tuftTexture(["#7a6a38", "#cdb868"])),
  frond: alphaMat(frondTexture(), 0.7),
  bigLeaf: alphaMat(bigLeafTexture(), 0.65),
};

M.rock.color.setRGB(1.9, 1.8, 1.7);
M.rockGrey.color.setRGB(1.7, 1.7, 1.75);

export const waterNormalMap = wNormal;
export { rr, rnd };

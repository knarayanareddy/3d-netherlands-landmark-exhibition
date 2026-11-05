import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import { canvasTex, loadingManager, rnd, rr } from "./kit";
import flamingoUrl from "../assets/models/Flamingo.glb?url";
import parrotUrl from "../assets/models/Parrot.glb?url";
import storkUrl from "../assets/models/Stork.glb?url";

/* ------------------------------------------------------------------ */
/*  Species catalogue (shown in the HUD when you look at an animal)     */
/* ------------------------------------------------------------------ */
export interface SpeciesInfo {
  en: string;
  nl: string;
  latin: string;
  fact: string;
}
export const INFO: Record<string, SpeciesInfo> = {
  elephant: { en: "Asian elephant", nl: "Aziatische olifant", latin: "Elephas maximus", fact: "Lives in family herds led by an older female. Eats up to 150 kg of plants a day and uses its trunk, with ~40,000 muscles, like a hand." },
  tiger: { en: "Sumatran tiger", nl: "Sumatraanse tijger", latin: "Panthera tigris sumatrae", fact: "The smallest tiger subspecies; critically endangered with fewer than 400 left in the wild. Every tiger has a unique stripe pattern." },
  redpanda: { en: "Red panda", nl: "Rode panda", latin: "Ailurus fulgens", fact: "Not related to the giant panda. Spends most of its life in trees and eats mainly bamboo leaves." },
  tapir: { en: "Malayan tapir", nl: "Maleise tapir", latin: "Tapirus indicus", fact: "Its black-and-white coat breaks up its outline in the jungle at night. The short flexible snout works like a snorkel." },
  komodo: { en: "Komodo dragon", nl: "Komodovaraan", latin: "Varanus komodoensis", fact: "The largest living lizard, up to 3 m long. Its saliva is full of bacteria and mild venom." },
  camel: { en: "Bactrian camel", nl: "Kameel (tweebultig)", latin: "Camelus bactrianus", fact: "Two humps store fat, not water. Can drink 100 litres in minutes and survive -30 °C winters on the Mongolian steppe." },
  giraffe: { en: "Reticulated giraffe", nl: "Netgiraffe", latin: "Giraffa reticulata", fact: "Up to 5.5 m tall. Has the same number of neck vertebrae as you: seven, each up to 28 cm long." },
  zebra: { en: "Plains zebra", nl: "Steppezebra", latin: "Equus quagga", fact: "No two zebras share the same stripe pattern. Herds gather in huge numbers during migration." },
  rhino: { en: "Southern white rhino", nl: "Breedlipneushoorn", latin: "Ceratotherium simum", fact: "The second-largest land mammal. The 'white' comes from the Afrikaans word 'wyd', meaning wide, for its broad lips." },
  ostrich: { en: "Ostrich", nl: "Struisvogel", latin: "Struthio camelus", fact: "The largest and fastest-running bird: up to 70 km/h. Its eye is bigger than its brain." },
  warthog: { en: "Common warthog", nl: "Wrattenzwijn", latin: "Phacochoerus africanus", fact: "Kneels on its front knees to dig, and trots with its tail held up like an antenna." },
  gazelle: { en: "Mhorr gazelle", nl: "Mhorrgazelle", latin: "Nanger dama mhorr", fact: "Extinct in the wild since the 1970s; the entire population descends from a handful of animals in a Spanish breeding station." },
  gorilla: { en: "Western lowland gorilla", nl: "Westelijke laaglandgorilla", latin: "Gorilla gorilla gorilla", fact: "A silverback leads the troop. Gorillas build a fresh nest of leaves every night." },
  croc: { en: "Nile crocodile", nl: "Nijlkrokodil", latin: "Crocodylus niloticus", fact: "An ambush hunter that has barely changed in 80 million years. Mothers carry hatchlings to the water in their mouths." },
  wolf: { en: "Grey wolf", nl: "Wolf", latin: "Canis lupus", fact: "Lives in packs with a strict social order. Its howl can carry 10 km across open country." },
  reindeer: { en: "Reindeer", nl: "Rendier", latin: "Rangifer tarandus", fact: "The only deer in which both sexes grow antlers. Hooves widen in winter to work as snowshoes." },
  wallaby: { en: "Swamp wallaby", nl: "Moeraswallaby", latin: "Wallabia bicolor", fact: "Hops on powerful hind legs, using its tail as a counterbalance. Wallabies walk freely among visitors here." },
  polar: { en: "Polar bear", nl: "IJsbeer", latin: "Ursus maritimus", fact: "Its fur is transparent and hollow, and its skin is black. Can swim for days across Arctic seas." },
  prairie: { en: "Black-tailed prairie dog", nl: "Prairiehond", latin: "Cynomys ludovicianus", fact: "Lives in huge underground 'towns' and greets neighbours with a kiss-like touch of the teeth." },
  raccoon: { en: "Raccoon", nl: "Wasbeer", latin: "Procyon lotor", fact: "Very dexterous front paws; seems to 'wash' its food by dousing it in water to feel it better." },
  vicuna: { en: "Vicuña", nl: "Vicuña", latin: "Vicugna vicugna", fact: "A wild relative of the llama from the high Andes. Its wool is among the finest in the world." },
  flamingo: { en: "Greater flamingo", nl: "Flamingo", latin: "Phoenicopterus roseus", fact: "Its pink colour comes from carotenoid pigments in the algae and shrimp it eats. Often rests on one leg." },
  ibis: { en: "Scarlet ibis", nl: "Rode ibis", latin: "Eudocimus ruber", fact: "Chicks hatch grey and turn bright red as they eat shrimp-rich food." },
  penguin: { en: "King penguin", nl: "Koningspinguïn", latin: "Aptenodytes patagonicus", fact: "Second-largest penguin. Dives deeper than 300 m and incubates its single egg on its feet." },
  lemur: { en: "Ring-tailed lemur", nl: "Ringstaartmaki", latin: "Lemur catta", fact: "Native to Madagascar. Sunbathes upright and holds its striped tail high as a flag to keep the troop together." },
  shark: { en: "Sand tiger shark", nl: "Zandtijgerhaai", latin: "Carcharias taurus", fact: "Looks fierce but is docile. Gulps air at the surface to hover motionless in the water." },
  ray: { en: "Eagle ray", nl: "Adelaarsrog", latin: "Aetobatus narinari", fact: "Glides through the water by flapping its wings like a bird in flight." },
  turtle: { en: "Green sea turtle", nl: "Soepschildpad", latin: "Chelonia mydas", fact: "Returns to the very beach where it was born to lay eggs, after crossing entire oceans." },
  fish: { en: "Reef fish", nl: "Rifvissen", latin: "Various", fact: "Schooling fish move as one: each follows the neighbours' direction and speed, so a whole shoal can turn in a split second." },
  macaw: { en: "Blue-and-yellow macaw", nl: "Blauwgele ara", latin: "Ara ararauna", fact: "Mates for life and can live 60 years. Can mimic human speech." },
  stork: { en: "White stork", nl: "Ooievaar", latin: "Ciconia ciconia", fact: "Wild storks nest in the zoo's trees. They migrate to Africa every autumn." },
  butterfly: { en: "Tropical butterflies", nl: "Tropische vlinders", latin: "Various", fact: "Free-flying butterflies from South America, Africa and Asia. Many taste with their feet." },
  sloth: { en: "Two-toed sloth", nl: "Tweevingerige luiaard", latin: "Choloepus didactylus", fact: "Moves so slowly that algae grows in its fur. Descends to the ground only once a week." },
};

/* ------------------------------------------------------------------ */
/*  Skin textures                                                      */
/* ------------------------------------------------------------------ */
type SkinKind = "fur" | "zebra" | "tiger" | "giraffe" | "hide" | "scales" | "polar" | "ring";
const skinCache = new Map<string, THREE.MeshStandardMaterial>();

function skinMat(kind: SkinKind, color: number, vcol = false) {
  const key = `${kind}${color}${vcol}`;
  const hit = skinCache.get(key);
  if (hit) return hit;
  const c = new THREE.Color(color);
  const css = `#${c.getHexString()}`;
  const dark = `#${c.clone().multiplyScalar(0.55).getHexString()}`;
  const light = `#${c.clone().lerp(new THREE.Color(1, 1, 1), 0.35).getHexString()}`;
  const tex = canvasTex(512, 256, (g, w, h) => {
    g.fillStyle = css;
    g.fillRect(0, 0, w, h);
    const strokes = (n: number, len: number) => {
      for (let i = 0; i < n; i++) {
        g.strokeStyle = Math.random() < 0.5 ? light : dark;
        g.globalAlpha = 0.08 + Math.random() * 0.2;
        g.lineWidth = 1;
        const x = Math.random() * w,
          y = Math.random() * h;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + (Math.random() - 0.5) * 3, y + len * (0.5 + Math.random()));
        g.stroke();
      }
      g.globalAlpha = 1;
    };
    if (kind === "fur" || kind === "ring") strokes(5200, 7);
    if (kind === "polar") {
      strokes(5000, 9);
    }
    if (kind === "zebra") {
      g.fillStyle = "#f2efe8";
      g.fillRect(0, 0, w, h);
      g.fillStyle = "#16161a";
      const n = 22;
      for (let i = 0; i < n; i++) {
        const x0 = (i / n) * w;
        const wd = (w / n) * (0.4 + Math.random() * 0.25);
        g.beginPath();
        g.moveTo(x0, 0);
        for (let y = 0; y <= h; y += 16) g.lineTo(x0 + Math.sin(y * 0.05 + i) * 5 + (y > h * 0.5 ? 4 : 0), y);
        for (let y = h; y >= 0; y -= 16) g.lineTo(x0 + wd * (0.7 + 0.5 * Math.sin(y * 0.03 + i * 2)) + Math.sin(y * 0.05 + i) * 5, y);
        g.fill();
      }
      strokes(1500, 5);
    }
    if (kind === "tiger") {
      g.fillStyle = "#d9731f";
      g.fillRect(0, 0, w, h);
      g.fillStyle = "#14100c";
      const n = 30;
      for (let i = 0; i < n; i++) {
        const x0 = (i / n) * w + Math.random() * 8;
        const len = h * (0.35 + Math.random() * 0.5);
        g.beginPath();
        g.moveTo(x0, h * 0.12 + Math.random() * 20);
        g.quadraticCurveTo(x0 + 8, h * 0.12 + len * 0.5, x0 + Math.random() * 6, h * 0.12 + len);
        g.quadraticCurveTo(x0 - 2, h * 0.12 + len * 0.5, x0 - 3, h * 0.12 + 5);
        g.fill();
      }
      g.fillStyle = "#f3e7d3";
      g.fillRect(0, h * 0.82, w, h * 0.18);
      strokes(3000, 5);
    }
    if (kind === "giraffe") {
      g.fillStyle = "#e9d7ae";
      g.fillRect(0, 0, w, h);
      for (let gy = 0; gy < 11; gy++)
        for (let gx = 0; gx < 22; gx++) {
          const cx = gx * (w / 22) + (gy % 2) * (w / 44) + (Math.random() - 0.5) * 5,
            cy = gy * (h / 11) + 12 + (Math.random() - 0.5) * 5;
          g.fillStyle = `hsl(${22 + Math.random() * 8},${55 + Math.random() * 15}%,${26 + Math.random() * 12}%)`;
          g.beginPath();
          const sides = 6 + Math.floor(Math.random() * 2);
          for (let s = 0; s < sides; s++) {
            const a = (s / sides) * Math.PI * 2;
            const rad = 11 + Math.random() * 3;
            g.lineTo(cx + Math.cos(a) * rad * 1.15, cy + Math.sin(a) * rad * 0.9);
          }
          g.fill();
        }
    }
    if (kind === "hide") {
      for (let i = 0; i < 900; i++) {
        g.strokeStyle = dark;
        g.globalAlpha = 0.12 + Math.random() * 0.2;
        g.lineWidth = 1 + Math.random() * 2;
        const x = Math.random() * w,
          y = Math.random() * h;
        g.beginPath();
        g.moveTo(x, y);
        g.bezierCurveTo(x + 10, y + 4, x + 25, y - 4, x + 20 + Math.random() * 30, y + 2);
        g.stroke();
      }
      g.globalAlpha = 1;
      strokes(2000, 3);
    }
    if (kind === "scales") {
      for (let y = 0; y < h; y += 8)
        for (let x = 0; x < w; x += 8) {
          const o = (y / 8) % 2 ? 4 : 0;
          g.fillStyle = Math.random() < 0.5 ? dark : css;
          g.globalAlpha = 0.5 + Math.random() * 0.4;
          g.beginPath();
          g.ellipse(x + o, y, 4.5, 4, 0, 0, 7);
          g.fill();
        }
      g.globalAlpha = 1;
    }
    if (kind === "ring") {
      // ring-tailed lemur: tail rings drawn along v
      for (let y = 0; y < h; y += 28) {
        g.fillStyle = "#17171a";
        g.fillRect(0, y, w, 14);
      }
    }
  });
  const m = new THREE.MeshStandardMaterial({
    map: tex,
    roughness: kind === "scales" ? 0.55 : 0.92,
    metalness: 0,
    vertexColors: vcol,
    bumpMap: kind === "hide" || kind === "scales" ? tex : null,
    bumpScale: kind === "hide" ? 1.2 : 0.8,
  });
  skinCache.set(key, m);
  return m;
}

const flat = (color: number, rough = 0.6, metal = 0) => {
  const k = `flat${color}${rough}${metal}`;
  let m = skinCache.get(k);
  if (!m) skinCache.set(k, (m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal })));
  return m;
};

/* ------------------------------------------------------------------ */
/*  Geometry primitives                                                */
/* ------------------------------------------------------------------ */
interface Part {
  geo: THREE.BufferGeometry;
  mat: THREE.MeshStandardMaterial;
}
const SPH = new THREE.SphereGeometry(1, 20, 14);
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _e = new THREE.Euler();

function ell(mat: THREE.MeshStandardMaterial, rx: number, ry: number, rz: number, x: number, y: number, z: number, ex = 0, ey = 0, ez = 0): Part {
  const g = SPH.clone();
  _e.set(ex, ey, ez, "YXZ");
  _q.setFromEuler(_e);
  _m.compose(new THREE.Vector3(x, y, z), _q, new THREE.Vector3(rx, ry, rz));
  g.applyMatrix4(_m);
  return { geo: g, mat };
}
function limb(mat: THREE.MeshStandardMaterial, p0: number[], p1: number[], r0: number, r1: number, seg = 10): Part {
  const a = new THREE.Vector3(...p0),
    b = new THREE.Vector3(...p1);
  const d = b.clone().sub(a);
  const len = d.length();
  const g = new THREE.CylinderGeometry(r1, r0, len, seg, 1);
  g.translate(0, len / 2, 0);
  _q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  _m.compose(a, _q, new THREE.Vector3(1, 1, 1));
  g.applyMatrix4(_m);
  return { geo: g, mat };
}
function mergeParts(parts: Part[], target: THREE.Object3D, shadow = true) {
  const by = new Map<THREE.Material, THREE.BufferGeometry[]>();
  for (const p of parts) {
    for (const k of Object.keys(p.geo.attributes)) if (!["position", "normal", "uv"].includes(k)) p.geo.deleteAttribute(k);
    if (p.geo.index) p.geo = p.geo.toNonIndexed();
    const arr = by.get(p.mat) ?? [];
    arr.push(p.geo);
    by.set(p.mat, arr);
  }
  by.forEach((geos, mat) => {
    const g = mergeGeometries(geos, false)!;
    if (mat.vertexColors) {
      // vertex colour hook is filled in by caller via userData
    }
    const mesh = new THREE.Mesh(g, mat);
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    target.add(mesh);
  });
}
function paintVertexColors(root: THREE.Object3D, fn: (x: number, y: number, z: number) => [number, number, number]) {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mat = mesh.material as THREE.MeshStandardMaterial;
    if (!mat.vertexColors) return;
    const p = mesh.geometry.attributes.position;
    const col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const c = fn(p.getX(i), p.getY(i), p.getZ(i));
      col[i * 3] = c[0];
      col[i * 3 + 1] = c[1];
      col[i * 3 + 2] = c[2];
    }
    mesh.geometry.setAttribute("color", new THREE.BufferAttribute(col, 3));
  });
}

/* ------------------------------------------------------------------ */
/*  Quadruped builder                                                  */
/* ------------------------------------------------------------------ */
interface Q {
  len: number;
  bh: number;
  bw: number;
  leg: number;
  legF?: number;
  legR: number;
  neck: number;
  na: number; // neck angle (rad above horizontal)
  neckR: number;
  head: [number, number, number]; // l, w, h
  hp: number; // head pitch down
  skin: SkinKind;
  color: number;
  ears?: "round" | "big" | "pointed" | "long" | "none";
  horns?: "giraffe" | "rhino" | "curve" | "antler" | "none";
  trunk?: boolean;
  tusks?: boolean;
  hump?: number;
  mane?: number;
  tail?: number;
  tailKind?: "thin" | "bushy" | "croc";
  chestUp?: number;
  vcol?: (x: number, y: number, z: number) => [number, number, number];
  muzzle?: number;
  hoof?: number;
  snoutColor?: number;
}

export interface Rig {
  group: THREE.Group;
  legs: THREE.Object3D[];
  head?: THREE.Object3D;
  trunk?: THREE.Object3D;
  tail?: THREE.Object3D;
  hop?: boolean;
  swim?: THREE.Object3D[];
}

function buildQuad(s: Q): Rig {
  const vc = !!s.vcol;
  const skin = skinMat(s.skin, s.color, vc);
  const dk = flat(0x141414, 0.5);
  const hoofM = flat(s.hoof ?? 0x2a2420, 0.6);
  const group = new THREE.Group();
  const torso: Part[] = [];
  const headParts: Part[] = [];
  const pyB = s.leg + s.bh * 0.15,
    pyF = (s.legF ?? s.leg) + s.bh * 0.15;
  const cy = s.leg + s.bh * 0.4;
  const sh = s.chestUp ?? 0;

  torso.push(ell(skin, s.bw / 2, s.bh / 2, s.len / 2, 0, cy, 0));
  torso.push(ell(skin, s.bw * 0.52, s.bh * 0.52, s.len * 0.27, 0, cy + s.bh * (0.04 + sh), s.len * 0.25));
  torso.push(ell(skin, s.bw * 0.5, s.bh * 0.5, s.len * 0.27, 0, cy + s.bh * 0.03, -s.len * 0.26));
  if (s.hump) {
    torso.push(ell(skin, s.bw * 0.3, s.hump, s.len * 0.12, 0, cy + s.bh * 0.5, s.len * 0.14));
    torso.push(ell(skin, s.bw * 0.3, s.hump * 0.9, s.len * 0.12, 0, cy + s.bh * 0.5, -s.len * 0.17));
  }
  // tail
  const tl = s.tail ?? s.len * 0.3;
  const t0 = [0, cy + s.bh * 0.15, -s.len * 0.48];
  if (s.tailKind === "croc") {
    torso.push(limb(skin, [0, cy, -s.len * 0.4], [0, cy - s.bh * 0.15, -s.len * 0.4 - tl * 0.5], s.bw * 0.35, s.bw * 0.2));
    torso.push(limb(skin, [0, cy - s.bh * 0.15, -s.len * 0.4 - tl * 0.5], [0, cy - s.bh * 0.3, -s.len * 0.4 - tl], s.bw * 0.2, 0.02));
  } else if (s.tailKind === "bushy") {
    torso.push(limb(skin, t0, [0, t0[1] - tl * 0.4, t0[2] - tl * 0.8], s.bw * 0.14, s.bw * 0.2));
    torso.push(ell(skin, s.bw * 0.2, s.bw * 0.2, tl * 0.4, 0, t0[1] - tl * 0.42, t0[2] - tl * 0.95));
  } else if (tl > 0.05) {
    torso.push(limb(skin, t0, [0, t0[1] - tl * 0.9, t0[2] - tl * 0.25], 0.04 + s.bw * 0.03, 0.025));
    torso.push(ell(dk, 0.05 + s.bw * 0.05, tl * 0.17, 0.05 + s.bw * 0.05, 0, t0[1] - tl * 0.95, t0[2] - tl * 0.27));
  }

  // legs (own pivots for walk animation)
  const legs: THREE.Object3D[] = [];
  const mkLeg = (x: number, z: number, py: number) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, py, z);
    const parts: Part[] = [
      limb(skin, [0, 0, 0], [0, -py * 0.5, 0.0], s.legR * 1.35, s.legR),
      limb(skin, [0, -py * 0.5, 0.0], [0, -py + s.legR * 0.8, 0], s.legR, s.legR * 0.78),
      ell(hoofM, s.legR * 0.95, s.legR * 0.9, s.legR * 1.4, 0, -py + s.legR * 0.7, s.legR * 0.35),
    ];
    mergeParts(parts, pivot);
    group.add(pivot);
    legs.push(pivot);
  };
  mkLeg(s.bw * 0.3, s.len * 0.3, pyF);
  mkLeg(-s.bw * 0.3, s.len * 0.3, pyF);
  mkLeg(s.bw * 0.3, -s.len * 0.3, pyB);
  mkLeg(-s.bw * 0.3, -s.len * 0.3, pyB);

  // neck + head on a pivot at the shoulder
  const [hl, hw, hh] = s.head;
  const headPivot = new THREE.Group();
  headPivot.position.set(0, cy + s.bh * (0.2 + sh), s.len * 0.36);
  const tip: number[] = [0, Math.sin(s.na) * s.neck, Math.cos(s.na) * s.neck];
  headParts.push(limb(skin, [0, -s.neckR * 0.4, -s.neckR * 0.5], tip, s.neckR, s.neckR * 0.7, 12));
  headParts.push(ell(skin, s.neckR * 1.05, s.neckR * 1.05, s.neckR * 1.3, 0, 0, 0));
  if (s.mane) {
    for (let i = 0; i < 8; i++) {
      const t = i / 7;
      headParts.push(ell(dk, 0.035, s.mane, 0.05, 0, tip[1] * t + s.neckR * 0.8, tip[2] * t - s.neckR * 0.2, 0.2));
    }
  }
  // head in its own frame
  const H: Part[] = [];
  H.push(ell(skin, hw / 2, hh / 2, hl * 0.42, 0, 0, hl * 0.15));
  H.push(ell(skin, hw * (s.muzzle ?? 0.34), hh * 0.34, hl * 0.4, 0, -hh * 0.12, hl * 0.52));
  H.push(ell(dk, hw * 0.08, hw * 0.08, hw * 0.08, hw * 0.46, hh * 0.12, hl * 0.22));
  H.push(ell(dk, hw * 0.08, hw * 0.08, hw * 0.08, -hw * 0.46, hh * 0.12, hl * 0.22));
  H.push(ell(dk, hw * 0.09, hh * 0.06, hw * 0.07, hw * 0.12, -hh * 0.05, hl * 0.9));
  H.push(ell(dk, hw * 0.09, hh * 0.06, hw * 0.07, -hw * 0.12, -hh * 0.05, hl * 0.9));
  const ears = s.ears ?? "round";
  const ear = (sx: number) => {
    if (ears === "big") H.push(ell(skin, hw * 0.08, hh * 0.9, hl * 0.55, sx * hw * 0.85, 0.05, -hl * 0.1, 0, sx * 0.5, sx * 0.1));
    else if (ears === "pointed") H.push(ell(skin, hw * 0.1, hh * 0.45, hw * 0.15, sx * hw * 0.32, hh * 0.65, -hl * 0.05, 0, 0, sx * -0.3));
    else if (ears === "long") H.push(ell(skin, hw * 0.1, hh * 0.28, hw * 0.4, sx * hw * 0.62, hh * 0.35, -hl * 0.05, 0.4, 0, sx * -0.9));
    else if (ears === "round") H.push(ell(skin, hw * 0.1, hh * 0.22, hw * 0.2, sx * hw * 0.38, hh * 0.52, -hl * 0.06, 0, 0, sx * -0.4));
  };
  if (ears !== "none") {
    ear(1);
    ear(-1);
  }
  const horn = s.horns ?? "none";
  const bone = flat(0xd6cdb8, 0.6);
  const hornDark = flat(0x3a332d, 0.5);
  if (horn === "giraffe") {
    for (const sx of [-1, 1]) {
      H.push(limb(skin, [sx * hw * 0.2, hh * 0.35, -hl * 0.05], [sx * hw * 0.22, hh * 0.35 + 0.22, -hl * 0.1], 0.035, 0.03));
      H.push(ell(dk, 0.055, 0.06, 0.055, sx * hw * 0.22, hh * 0.35 + 0.25, -hl * 0.1));
    }
  } else if (horn === "rhino") {
    H.push(limb(hornDark, [0, hh * 0.05, hl * 0.72], [0, hh * 0.05 + 0.5, hl * 0.78 + 0.1], 0.2, 0.03));
    H.push(limb(hornDark, [0, hh * 0.25, hl * 0.4], [0, hh * 0.25 + 0.2, hl * 0.4 + 0.05], 0.1, 0.02));
  } else if (horn === "curve") {
    for (const sx of [-1, 1]) {
      H.push(limb(hornDark, [sx * hw * 0.2, hh * 0.45, 0], [sx * hw * 0.3, hh * 0.45 + 0.28, -0.1], 0.03, 0.022));
      H.push(limb(hornDark, [sx * hw * 0.3, hh * 0.45 + 0.28, -0.1], [sx * hw * 0.25, hh * 0.45 + 0.5, 0.0], 0.022, 0.006));
    }
  } else if (horn === "antler") {
    for (const sx of [-1, 1]) {
      const b0 = [sx * hw * 0.2, hh * 0.45, -hl * 0.05];
      const b1 = [sx * hw * 0.55, hh * 0.45 + 0.5, -hl * 0.2];
      const b2 = [sx * hw * 0.7, hh * 0.45 + 0.95, hl * 0.1];
      H.push(limb(bone, b0, b1, 0.03, 0.022), limb(bone, b1, b2, 0.022, 0.012));
      for (let k = 0; k < 3; k++) {
        const t = 0.3 + k * 0.25;
        const p = [b0[0] + (b1[0] - b0[0]) * t, b0[1] + (b1[1] - b0[1]) * t, b0[2] + (b1[2] - b0[2]) * t];
        H.push(limb(bone, p, [p[0] + sx * 0.12, p[1] + 0.3 - k * 0.05, p[2] + 0.28], 0.014, 0.006));
      }
      H.push(limb(bone, b2, [b2[0] + sx * 0.12, b2[1] + 0.2, b2[2] + 0.2], 0.012, 0.006));
      H.push(limb(bone, b2, [b2[0] - sx * 0.05, b2[1] + 0.25, b2[2] - 0.12], 0.012, 0.006));
    }
  }
  if (s.tusks) {
    for (const sx of [-1, 1]) {
      H.push(limb(bone, [sx * hw * 0.25, -hh * 0.2, hl * 0.4], [sx * hw * 0.33, -hh * 0.55, hl * 0.78], 0.07, 0.035));
      H.push(limb(bone, [sx * hw * 0.33, -hh * 0.55, hl * 0.78], [sx * hw * 0.3, -hh * 0.5, hl * 1.1], 0.035, 0.012));
    }
  }
  const headG = new THREE.Group();
  headG.position.set(tip[0], tip[1], tip[2]);
  headG.rotation.x = s.hp;
  mergeParts(H, headG);
  mergeParts(headParts, headPivot);
  headPivot.add(headG);

  let trunk: THREE.Object3D | undefined;
  if (s.trunk) {
    trunk = new THREE.Group();
    trunk.position.set(0, -hh * 0.1, hl * 0.5);
    const T: Part[] = [];
    let px = 0,
      py = 0,
      pz = 0;
    const n = 7;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const nx = 0,
        ny = py - hh * 0.5 * (1 - t * 0.2),
        nz = pz + 0.06 + Math.sin(t * 3) * 0.12 * t;
      T.push(limb(skin, [px, py, pz], [nx, ny, nz], hw * (0.27 - t * 0.17), hw * (0.27 - (t + 1 / n) * 0.17), 9));
      px = nx;
      py = ny;
      pz = nz;
    }
    mergeParts(T, trunk);
    headG.add(trunk);
  }
  mergeParts(torso, group);
  group.add(headPivot);
  if (vc) paintVertexColors(group, s.vcol!);
  return { group, legs, head: headPivot, trunk };
}

/* ------------------------------------------------------------------ */
/*  Birds                                                              */
/* ------------------------------------------------------------------ */
interface B {
  body: [number, number, number];
  legH: number;
  legR: number;
  neck: number[][]; // path of [y,z] from body front
  neckR: number;
  headR: number;
  beak: number;
  beakColor: number;
  beakBend?: boolean;
  color: number;
  wing: number;
  tail: number;
  legColor: number;
  upright?: boolean;
  vcol?: (x: number, y: number, z: number) => [number, number, number];
  flippers?: boolean;
}

function buildBird(s: B): Rig {
  const skin = skinMat("fur", s.color, !!s.vcol);
  const leg = flat(s.legColor, 0.6);
  const beak = flat(s.beakColor, 0.5);
  const dk = flat(0x111111, 0.4);
  const group = new THREE.Group();
  const P: Part[] = [];
  const [rx, ry, rz] = s.body;
  const cy = s.legH + ry * 0.9;
  P.push(ell(skin, rx, ry, rz, 0, cy, 0));
  P.push(ell(skin, rx * 0.85, ry * 0.8, rz * 0.6, 0, cy + ry * 0.1, -rz * 0.55));
  // wings folded
  for (const sx of [-1, 1]) P.push(ell(skin, s.wing * 0.12, ry * 0.7, s.wing * 0.8 * rz, sx * rx * 0.9, cy + ry * 0.1, -rz * 0.1, 0.1));
  // tail
  if (s.tail > 0) P.push(ell(skin, rx * 0.5, 0.03, s.tail, 0, cy - ry * 0.1, -rz - s.tail * 0.6, 0.2));
  // neck
  let prev = [0, cy + ry * 0.2, rz * 0.8];
  for (const [ny, nzv] of s.neck) {
    const next = [0, cy + ry * 0.2 + ny, rz * 0.8 + nzv];
    P.push(limb(skin, prev, next, s.neckR, s.neckR * 0.85, 8));
    P.push(ell(skin, s.neckR * 0.95, s.neckR * 0.95, s.neckR * 0.95, next[0], next[1], next[2]));
    prev = next;
  }
  P.push(ell(skin, s.headR, s.headR * 0.9, s.headR * 1.15, prev[0], prev[1], prev[2] + s.headR * 0.4));
  P.push(ell(dk, s.headR * 0.18, s.headR * 0.18, s.headR * 0.18, s.headR * 0.8, prev[1] + s.headR * 0.2, prev[2] + s.headR * 0.6));
  P.push(ell(dk, s.headR * 0.18, s.headR * 0.18, s.headR * 0.18, -s.headR * 0.8, prev[1] + s.headR * 0.2, prev[2] + s.headR * 0.6));
  const bs = [prev[0], prev[1] - s.headR * 0.1, prev[2] + s.headR * 1.4];
  if (s.beakBend) {
    const mid = [0, bs[1] - s.headR * 0.2, bs[2] + s.beak * 0.6];
    P.push(limb(beak, bs, mid, s.headR * 0.5, s.headR * 0.4, 7), limb(dk, mid, [0, mid[1] - s.beak * 0.35, mid[2] + s.beak * 0.25], s.headR * 0.4, s.headR * 0.12, 7));
  } else P.push(limb(beak, bs, [0, bs[1] - s.beak * 0.05, bs[2] + s.beak], s.headR * 0.5, s.headR * 0.08, 7));
  mergeParts(P, group);
  const legs: THREE.Object3D[] = [];
  for (const sx of [-1, 1]) {
    const pv = new THREE.Group();
    pv.position.set(sx * rx * 0.45, s.legH + 0.02, -rz * 0.05);
    const L: Part[] = [limb(leg, [0, 0, 0], [0, -s.legH * 0.5, -0.02], s.legR, s.legR * 0.9, 6), limb(leg, [0, -s.legH * 0.5, -0.02], [0, -s.legH + 0.02, 0.0], s.legR * 0.9, s.legR * 0.8, 6)];
    L.push(ell(leg, s.legR * 4, s.legR * 0.5, s.legR * 5, 0, -s.legH + 0.01, s.legR * 3));
    if (s.flippers) {
      /* flipper handled below */
    }
    mergeParts(L, pv);
    group.add(pv);
    legs.push(pv);
  }
  if (s.vcol) paintVertexColors(group, s.vcol);
  return { group, legs };
}

function buildPenguin(): Rig {
  const skin = skinMat("fur", 0x15171b, true);
  const group = new THREE.Group();
  const P: Part[] = [];
  P.push(ell(skin, 0.19, 0.42, 0.17, 0, 0.5, 0));
  P.push(ell(skin, 0.1, 0.1, 0.1, 0, 0.99, 0.02));
  P.push(limb(flat(0x161616), [0, 0.9, 0.02], [0, 0.99, 0.03], 0.07, 0.065));
  P.push(ell(flat(0x111111), 0.02, 0.02, 0.02, 0.07, 1.02, 0.1), ell(flat(0x111111), 0.02, 0.02, 0.02, -0.07, 1.02, 0.1));
  P.push(limb(flat(0x2a2a2a, 0.4), [0, 1.0, 0.09], [0, 0.97, 0.26], 0.03, 0.008, 6));
  P.push(ell(flat(0xf0a020, 0.5), 0.1, 0.08, 0.05, 0.0, 0.86, 0.1)); // orange chest patch
  for (const sx of [-1, 1]) {
    P.push(ell(skin, 0.025, 0.2, 0.08, sx * 0.2, 0.55, 0, 0, 0, sx * 0.25));
    P.push(ell(flat(0xf0a020), 0.03, 0.04, 0.03, sx * 0.1, 0.99, 0.0));
  }
  mergeParts(P, group);
  const legs: THREE.Object3D[] = [];
  for (const sx of [-1, 1]) {
    const pv = new THREE.Group();
    pv.position.set(sx * 0.07, 0.12, 0.02);
    mergeParts([ell(flat(0x222222), 0.04, 0.12, 0.04, 0, -0.04, 0), ell(flat(0x222222), 0.06, 0.02, 0.11, 0, -0.11, 0.05)], pv);
    group.add(pv);
    legs.push(pv);
  }
  paintVertexColors(group, (_x, y, z) => (z > 0.04 && y < 0.92 && y > 0.18 ? [0.95, 0.95, 0.9] : [0.9, 0.9, 0.95]));
  return { group, legs };
}

function buildWallaby(): Rig {
  const skin = skinMat("fur", 0x8a6a4c);
  const dk = flat(0x1b1613);
  const light = skinMat("fur", 0xcdb998);
  const group = new THREE.Group();
  const P: Part[] = [];
  P.push(ell(skin, 0.22, 0.4, 0.26, 0, 0.62, 0, -0.45));
  P.push(ell(light, 0.15, 0.25, 0.1, 0, 0.58, 0.14, -0.45));
  P.push(ell(skin, 0.1, 0.12, 0.17, 0, 0.98, 0.3, 0.2));
  P.push(ell(skin, 0.065, 0.06, 0.12, 0, 0.94, 0.45, 0.6));
  P.push(ell(dk, 0.025, 0.025, 0.025, 0, 0.93, 0.56));
  for (const sx of [-1, 1]) {
    P.push(ell(dk, 0.02, 0.02, 0.02, sx * 0.075, 1.0, 0.4));
    P.push(ell(skin, 0.03, 0.14, 0.05, sx * 0.07, 1.14, 0.27, 0, 0, sx * -0.2));
    P.push(limb(skin, [sx * 0.12, 0.8, 0.22], [sx * 0.14, 0.62, 0.36], 0.035, 0.02));
  }
  P.push(limb(skin, [0, 0.4, -0.22], [0, 0.18, -0.75], 0.1, 0.04));
  P.push(limb(skin, [0, 0.18, -0.75], [0, 0.05, -1.1], 0.04, 0.025));
  mergeParts(P, group);
  const legs: THREE.Object3D[] = [];
  for (const sx of [-1, 1]) {
    const pv = new THREE.Group();
    pv.position.set(sx * 0.17, 0.42, -0.08);
    mergeParts([ell(skin, 0.11, 0.2, 0.14, 0, -0.1, -0.02, 0.2), limb(skin, [0, -0.2, 0.0], [0, -0.38, 0.1], 0.06, 0.03), ell(dk, 0.04, 0.025, 0.14, 0, -0.41, 0.17)], pv);
    group.add(pv);
    legs.push(pv);
  }
  return { group, legs, hop: true };
}

/* ------------------------------------------------------------------ */
/*  Species definitions                                                */
/* ------------------------------------------------------------------ */
const tapirV = (_x: number, y: number, z: number): [number, number, number] => (z > -0.7 && z < 0.55 && y > 0.8 ? [0.93, 0.93, 0.9] : [0.1, 0.1, 0.11]);
const gorillaV = (_x: number, y: number, z: number): [number, number, number] => (y > 1.0 && z < 0.2 && z > -0.5 ? [0.62, 0.62, 0.6] : [0.1, 0.1, 0.1]);
const giraffeV = (_x: number, y: number): [number, number, number] => (y < 1.4 ? [0.92, 0.9, 0.85] : [1, 1, 1]);
const lemurV = (_x: number, y: number, z: number): [number, number, number] => (z > 0.1 && y < 0.5 ? [0.95, 0.95, 0.95] : [0.55, 0.55, 0.58]);
void giraffeV;

export const BUILD: Record<string, () => Rig> = {
  elephant: () =>
    buildQuad({ len: 3.0, bh: 2.2, bw: 1.9, leg: 1.2, legR: 0.28, neck: 0.5, na: 0.25, neckR: 0.55, head: [1.2, 1.1, 1.3], hp: 0.35, skin: "hide", color: 0x7a7570, ears: "big", trunk: true, tusks: true, tail: 1.1, hoof: 0xb8aea0, muzzle: 0.3 }),
  tiger: () =>
    buildQuad({ len: 1.7, bh: 0.7, bw: 0.55, leg: 0.58, legR: 0.1, neck: 0.3, na: 0.1, neckR: 0.22, head: [0.5, 0.42, 0.38], hp: 0.15, skin: "tiger", color: 0xd9731f, ears: "round", tail: 1.0, tailKind: "thin", muzzle: 0.42, hoof: 0x3a3028 }),
  redpanda: () =>
    buildQuad({ len: 0.55, bh: 0.24, bw: 0.22, leg: 0.17, legR: 0.045, neck: 0.06, na: 0.1, neckR: 0.1, head: [0.17, 0.2, 0.15], hp: 0.1, skin: "fur", color: 0xb5501f, ears: "pointed", tail: 0.5, tailKind: "bushy", muzzle: 0.3, hoof: 0x1a1210 }),
  tapir: () =>
    buildQuad({ len: 2.0, bh: 0.95, bw: 0.8, leg: 0.6, legR: 0.1, neck: 0.25, na: 0.1, neckR: 0.3, head: [0.7, 0.4, 0.4], hp: 0.5, skin: "fur", color: 0xffffff, ears: "round", tail: 0.1, muzzle: 0.35, vcol: tapirV, hoof: 0x222222 }),
  komodo: () =>
    buildQuad({ len: 1.5, bh: 0.28, bw: 0.35, leg: 0.15, legR: 0.045, neck: 0.3, na: 0.05, neckR: 0.09, head: [0.32, 0.17, 0.14], hp: 0.0, skin: "scales", color: 0x6b5a45, ears: "none", tail: 1.4, tailKind: "croc", muzzle: 0.5 }),
  croc: () =>
    buildQuad({ len: 2.6, bh: 0.35, bw: 0.55, leg: 0.12, legR: 0.07, neck: 0.15, na: 0.0, neckR: 0.18, head: [0.8, 0.28, 0.17], hp: 0.0, skin: "scales", color: 0x4d5a3a, ears: "none", tail: 2.0, tailKind: "croc", muzzle: 0.7 }),
  camel: () =>
    buildQuad({ len: 2.0, bh: 0.95, bw: 0.7, leg: 1.05, legR: 0.09, neck: 1.0, na: 0.95, neckR: 0.17, head: [0.5, 0.26, 0.28], hp: 1.1, skin: "fur", color: 0x9b7650, ears: "round", hump: 0.35, tail: 0.6, mane: 0.1, muzzle: 0.4 }),
  giraffe: () =>
    buildQuad({ len: 1.9, bh: 1.2, bw: 0.7, leg: 1.8, legF: 2.0, legR: 0.1, neck: 2.3, na: 1.2, neckR: 0.22, head: [0.62, 0.28, 0.3], hp: 0.7, skin: "giraffe", color: 0xe0cfa8, ears: "long", horns: "giraffe", tail: 0.9, mane: 0.1, muzzle: 0.45, chestUp: 0.2, hoof: 0x2a2420 }),
  zebra: () =>
    buildQuad({ len: 1.9, bh: 0.82, bw: 0.55, leg: 0.85, legR: 0.075, neck: 0.6, na: 0.8, neckR: 0.19, head: [0.55, 0.24, 0.3], hp: 0.65, skin: "zebra", color: 0xffffff, ears: "pointed", tail: 0.7, mane: 0.1, muzzle: 0.4, hoof: 0x2a2a2a }),
  rhino: () =>
    buildQuad({ len: 3.2, bh: 1.6, bw: 1.35, leg: 0.8, legR: 0.24, neck: 0.5, na: -0.15, neckR: 0.5, head: [1.1, 0.55, 0.6], hp: 0.35, skin: "hide", color: 0x8a857c, ears: "pointed", horns: "rhino", tail: 0.7, muzzle: 0.45, hoof: 0x55504a }),
  warthog: () =>
    buildQuad({ len: 1.1, bh: 0.55, bw: 0.45, leg: 0.4, legR: 0.055, neck: 0.15, na: 0.1, neckR: 0.2, head: [0.5, 0.35, 0.3], hp: 0.3, skin: "fur", color: 0x6a5a4a, ears: "pointed", tusks: true, tail: 0.4, mane: 0.1, muzzle: 0.45 }),
  gazelle: () =>
    buildQuad({ len: 1.05, bh: 0.44, bw: 0.3, leg: 0.68, legR: 0.04, neck: 0.4, na: 0.85, neckR: 0.09, head: [0.3, 0.14, 0.16], hp: 0.55, skin: "fur", color: 0xd4b28c, ears: "long", horns: "curve", tail: 0.25, muzzle: 0.4 }),
  wolf: () =>
    buildQuad({ len: 1.1, bh: 0.45, bw: 0.3, leg: 0.5, legR: 0.055, neck: 0.2, na: 0.2, neckR: 0.14, head: [0.34, 0.22, 0.2], hp: 0.15, skin: "fur", color: 0x7e7a72, ears: "pointed", tail: 0.5, tailKind: "bushy", muzzle: 0.4, hoof: 0x222222 }),
  reindeer: () =>
    buildQuad({ len: 1.5, bh: 0.7, bw: 0.45, leg: 0.8, legR: 0.065, neck: 0.5, na: 0.65, neckR: 0.15, head: [0.45, 0.2, 0.24], hp: 0.55, skin: "fur", color: 0x8c7660, ears: "round", horns: "antler", tail: 0.15, muzzle: 0.4 }),
  polar: () =>
    buildQuad({ len: 2.5, bh: 1.2, bw: 1.0, leg: 0.6, legR: 0.19, neck: 0.4, na: 0.1, neckR: 0.38, head: [0.7, 0.45, 0.4], hp: 0.35, skin: "polar", color: 0xf1ead8, ears: "round", tail: 0.12, muzzle: 0.34, hoof: 0x2a2a2a }),
  prairie: () =>
    buildQuad({ len: 0.34, bh: 0.2, bw: 0.18, leg: 0.06, legR: 0.025, neck: 0.04, na: 0.2, neckR: 0.08, head: [0.12, 0.11, 0.1], hp: 0.2, skin: "fur", color: 0xa88a62, ears: "round", tail: 0.08, muzzle: 0.35 }),
  raccoon: () =>
    buildQuad({ len: 0.7, bh: 0.3, bw: 0.28, leg: 0.15, legR: 0.04, neck: 0.1, na: 0.05, neckR: 0.12, head: [0.2, 0.18, 0.15], hp: 0.2, skin: "fur", color: 0x6f6b66, ears: "round", tail: 0.35, tailKind: "bushy", muzzle: 0.3 }),
  vicuna: () =>
    buildQuad({ len: 1.2, bh: 0.5, bw: 0.35, leg: 0.75, legR: 0.045, neck: 0.65, na: 0.95, neckR: 0.1, head: [0.3, 0.14, 0.17], hp: 0.9, skin: "fur", color: 0xc19a6b, ears: "pointed", tail: 0.2, muzzle: 0.4 }),
  lemur: () =>
    buildQuad({ len: 0.42, bh: 0.2, bw: 0.17, leg: 0.15, legR: 0.025, neck: 0.05, na: 0.3, neckR: 0.07, head: [0.13, 0.1, 0.1], hp: 0.15, skin: "fur", color: 0xffffff, ears: "round", tail: 0.55, vcol: lemurV, muzzle: 0.3 }),
  gorilla: () =>
    buildQuad({ len: 1.2, bh: 1.0, bw: 0.85, leg: 0.5, legF: 0.75, legR: 0.16, neck: 0.15, na: 0.1, neckR: 0.32, head: [0.42, 0.38, 0.4], hp: 0.2, skin: "fur", color: 0xffffff, ears: "round", tail: 0, chestUp: 0.4, vcol: gorillaV, muzzle: 0.45, hoof: 0x1a1a1a }),
  wallaby: buildWallaby,
  ostrich: () =>
    buildBird({ body: [0.38, 0.45, 0.65], legH: 1.2, legR: 0.055, neck: [[0.35, 0.1], [0.4, 0.05], [0.4, 0.0]], neckR: 0.07, headR: 0.09, beak: 0.12, beakColor: 0xd0a090, color: 0x121214, wing: 1, tail: 0.3, legColor: 0xd8b8a8, vcol: (x, y, z) => (y > 1.9 ? [0.85, 0.7, 0.65] : y > 1.3 && Math.abs(x) < 0.08 ? [0.85, 0.7, 0.65] : (y > 1.35 ? [0.85, 0.7, 0.65] : (z < -0.2 && y > 1.0 ? [0.92, 0.92, 0.9] : [0.1, 0.1, 0.11]))) }),
  flamingo: () =>
    buildBird({ body: [0.14, 0.17, 0.3], legH: 0.85, legR: 0.012, neck: [[0.2, 0.1], [0.22, 0.12], [0.15, 0.0], [0.08, -0.08]], neckR: 0.035, headR: 0.045, beak: 0.12, beakColor: 0xf0d8d0, beakBend: true, color: 0xf08a9b, wing: 1, tail: 0.1, legColor: 0xe58a95 }),
  ibis: () =>
    buildBird({ body: [0.09, 0.1, 0.2], legH: 0.4, legR: 0.012, neck: [[0.1, 0.08], [0.1, 0.05]], neckR: 0.025, headR: 0.03, beak: 0.2, beakColor: 0xe45a4a, beakBend: true, color: 0xe5262a, wing: 1, tail: 0.08, legColor: 0xe05050 }),
  penguin: buildPenguin,
};

/* ------------------------------------------------------------------ */
/*  Aquatic builders                                                   */
/* ------------------------------------------------------------------ */
function finVcol(root: THREE.Object3D, top: [number, number, number], bottom: [number, number, number]) {
  paintVertexColors(root, (_x, y) => {
    const t = THREE.MathUtils.smoothstep(y, -0.05, 0.07);
    return [bottom[0] + (top[0] - bottom[0]) * t, bottom[1] + (top[1] - bottom[1]) * t, bottom[2] + (top[2] - bottom[2]) * t];
  });
}

export function buildShark(): Rig {
  const skin = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.05, color: 0xffffff });
  const g = new THREE.Group();
  const P: Part[] = [];
  P.push(ell(skin, 0.38, 0.36, 1.5, 0, 0, 0));
  P.push(ell(skin, 0.3, 0.28, 0.6, 0, 0, 1.4));
  P.push(ell(skin, 0.04, 0.5, 0.35, 0, 0.45, 0.2, -0.5));
  for (const sx of [-1, 1]) P.push(ell(skin, 0.55, 0.03, 0.2, sx * 0.55, -0.12, 0.6, 0, 0, sx * -0.35));
  P.push(ell(flat(0x111111), 0.03, 0.03, 0.03, 0.25, 0.08, 1.6), ell(flat(0x111111), 0.03, 0.03, 0.03, -0.25, 0.08, 1.6));
  mergeParts(P, g, false);
  const tail = new THREE.Group();
  tail.position.set(0, 0, -1.4);
  mergeParts([ell(skin, 0.14, 0.15, 0.55, 0, 0, -0.4), ell(skin, 0.03, 0.55, 0.22, 0, 0.3, -0.85, 0.5), ell(skin, 0.03, 0.28, 0.16, 0, -0.18, -0.8, -0.5)], tail, false);
  g.add(tail);
  finVcol(g, [0.45, 0.42, 0.38], [0.9, 0.88, 0.84]);
  finVcol(tail, [0.45, 0.42, 0.38], [0.9, 0.88, 0.84]);
  return { group: g, legs: [], swim: [tail] };
}

export function buildRay(): Rig {
  const skin = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, color: 0xffffff });
  const g = new THREE.Group();
  mergeParts([ell(skin, 0.3, 0.1, 0.5, 0, 0, 0), ell(skin, 0.12, 0.08, 0.2, 0, 0.0, 0.6), limb(skin, [0, 0, -0.4], [0, -0.02, -2.0], 0.04, 0.008, 6)], g, false);
  const wings: THREE.Object3D[] = [];
  for (const sx of [-1, 1]) {
    const w = new THREE.Group();
    w.position.set(sx * 0.2, 0, 0.0);
    mergeParts([ell(skin, 0.85, 0.025, 0.42, sx * 0.8, 0, -0.1, 0, 0, 0)], w, false);
    w.userData.s = sx;
    g.add(w);
    wings.push(w);
  }
  paintVertexColors(g, (_x, y) => (y >= -0.001 ? [0.14, 0.17, 0.25] : [0.9, 0.9, 0.92]));
  return { group: g, legs: [], swim: wings };
}

export function buildTurtle(): Rig {
  const skin = skinMat("scales", 0x5d6a3a);
  const shell = new THREE.MeshStandardMaterial({ color: 0x6b5a34, roughness: 0.5, map: skinMat("scales", 0x7a6a3a).map });
  const g = new THREE.Group();
  mergeParts([ell(shell, 0.45, 0.2, 0.6, 0, 0.05, 0), ell(skin, 0.3, 0.07, 0.4, 0, -0.1, 0), limb(skin, [0, 0, 0.5], [0, 0.07, 0.8], 0.09, 0.07), ell(skin, 0.09, 0.07, 0.12, 0, 0.08, 0.86)], g, false);
  const fl: THREE.Object3D[] = [];
  for (const [x, z, s] of [
    [0.38, 0.3, 1],
    [-0.38, 0.3, -1],
    [0.3, -0.35, 0.6],
    [-0.3, -0.35, -0.6],
  ] as number[][]) {
    const pv = new THREE.Group();
    pv.position.set(x, -0.03, z);
    mergeParts([ell(skin, 0.4 * Math.abs(s), 0.025, 0.12, Math.sign(s) * 0.32 * Math.abs(s), 0, -0.05)], pv, false);
    pv.userData.s = Math.sign(s);
    g.add(pv);
    fl.push(pv);
  }
  return { group: g, legs: [], swim: fl };
}

/* ------------------------------------------------------------------ */
/*  Fish schools (instanced)                                           */
/* ------------------------------------------------------------------ */
export class FishSchool {
  mesh: THREE.InstancedMesh;
  n: number;
  center: THREE.Vector3;
  radius: THREE.Vector3;
  ph: Float32Array;
  sp: Float32Array;
  ofs: Float32Array;
  dummy = new THREE.Object3D();
  constructor(n: number, center: THREE.Vector3, radius: THREE.Vector3, colors: number[], size = 0.18) {
    this.n = n;
    this.center = center;
    this.radius = radius;
    const body = SPH.clone();
    body.scale(0.35 * size, 0.9 * size, 1.5 * size);
    body.rotateZ(0); // keep
    const tailG = new THREE.ConeGeometry(0.5 * size, 0.8 * size, 6);
    tailG.rotateX(-Math.PI / 2);
    tailG.scale(0.15 / 0.5, 1, 1);
    tailG.translate(0, 0, -1.5 * size);
    const fin = new THREE.ConeGeometry(0.4 * size, 0.7 * size, 4);
    fin.scale(0.12 / 0.4, 1, 1);
    fin.translate(0, 0.9 * size, 0);
    const parts = [body, tailG, fin].map((g) => (g.index ? g.toNonIndexed() : g));
    parts.forEach((g) => {
      for (const k of Object.keys(g.attributes)) if (!["position", "normal", "uv"].includes(k)) g.deleteAttribute(k);
    });
    const geo = mergeGeometries(parts)!;
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.25 });
    this.mesh = new THREE.InstancedMesh(geo, mat, n);
    this.mesh.frustumCulled = false;
    this.ph = new Float32Array(n);
    this.sp = new Float32Array(n);
    this.ofs = new Float32Array(n * 3);
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      this.ph[i] = rnd() * 6.28;
      this.sp[i] = rr(0.12, 0.28);
      this.ofs[i * 3] = rr(-1, 1);
      this.ofs[i * 3 + 1] = rr(-1, 1);
      this.ofs[i * 3 + 2] = rr(-1, 1);
      c.setHex(colors[i % colors.length]);
      c.offsetHSL(rr(-0.02, 0.02), 0, rr(-0.06, 0.06));
      this.mesh.setColorAt(i, c);
    }
  }
  update(t: number) {
    const d = this.dummy;
    const p = new THREE.Vector3(),
      p2 = new THREE.Vector3();
    for (let i = 0; i < this.n; i++) {
      const a = t * this.sp[i] + this.ph[i];
      const f = (tt: number) => {
        const q = tt * this.sp[i] + this.ph[i];
        return new THREE.Vector3(
          this.center.x + Math.cos(q) * this.radius.x * (0.7 + this.ofs[i * 3] * 0.3) + Math.sin(q * 3.1 + i) * 0.4,
          this.center.y + Math.sin(q * 1.7 + i) * this.radius.y * (0.6 + this.ofs[i * 3 + 1] * 0.4),
          this.center.z + Math.sin(q) * this.radius.z * (0.7 + this.ofs[i * 3 + 2] * 0.3)
        );
      };
      void a;
      p.copy(f(t));
      p2.copy(f(t + 0.25));
      d.position.copy(p);
      d.lookAt(p2);
      d.rotateY(Math.sin(t * 9 + i) * 0.12);
      d.updateMatrix();
      this.mesh.setMatrixAt(i, d.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/* ------------------------------------------------------------------ */
/*  Butterflies (two instanced wing meshes)                            */
/* ------------------------------------------------------------------ */
export class Butterflies {
  left: THREE.InstancedMesh;
  right: THREE.InstancedMesh;
  n: number;
  box: THREE.Box3;
  st: { p: THREE.Vector3; h: number; sp: number; ph: number; fl: number; tgt: THREE.Vector3 }[] = [];
  d = new THREE.Object3D();
  group = new THREE.Group();
  constructor(n: number, box: THREE.Box3) {
    this.n = n;
    this.box = box;
    const tex = canvasTex(64, 64, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.fillStyle = "#fff";
      g.beginPath();
      g.ellipse(w * 0.55, h * 0.3, w * 0.45, h * 0.28, -0.3, 0, 7);
      g.ellipse(w * 0.45, h * 0.72, w * 0.32, h * 0.22, 0.4, 0, 7);
      g.fill();
      g.globalCompositeOperation = "source-atop";
      g.fillStyle = "rgba(0,0,0,0.65)";
      g.beginPath();
      g.arc(w * 0.62, h * 0.28, 7, 0, 7);
      g.arc(w * 0.4, h * 0.7, 5, 0, 7);
      g.fill();
      g.strokeStyle = "rgba(0,0,0,0.8)";
      g.lineWidth = 3;
      g.stroke();
    });
    const wingL = new THREE.PlaneGeometry(0.16, 0.14);
    wingL.rotateX(-Math.PI / 2);
    wingL.translate(0.08, 0, 0);
    const wingR = wingL.clone();
    wingR.scale(-1, 1, 1);
    // flip uv for mirrored wing so winding stays correct
    const mk = (g: THREE.BufferGeometry) => {
      const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, roughness: 0.6, emissive: 0x222222 });
      const m = new THREE.InstancedMesh(g, mat, n);
      m.frustumCulled = false;
      return m;
    };
    this.left = mk(wingL);
    this.right = mk(wingR);
    const cols = [0xff7a1a, 0x2e7bff, 0xffd21a, 0xff4fa0, 0xffffff, 0x8be04a, 0xb15bff];
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      c.setHex(cols[i % cols.length]);
      this.left.setColorAt(i, c);
      this.right.setColorAt(i, c);
      this.st.push({ p: this.rp(), h: rnd() * 6, sp: rr(0.5, 1.2), ph: rnd() * 6, fl: rr(14, 22), tgt: this.rp() });
    }
    this.group.add(this.left, this.right);
  }
  rp() {
    return new THREE.Vector3(rr(this.box.min.x, this.box.max.x), rr(this.box.min.y, this.box.max.y), rr(this.box.min.z, this.box.max.z));
  }
  update(dt: number, t: number) {
    const d = this.d;
    for (let i = 0; i < this.n; i++) {
      const s = this.st[i];
      const dir = s.tgt.clone().sub(s.p);
      if (dir.length() < 0.8) s.tgt = this.rp();
      dir.normalize();
      s.p.addScaledVector(dir, s.sp * dt * 1.6);
      s.p.y += Math.sin(t * 2 + s.ph) * 0.004;
      s.h = Math.atan2(dir.x, dir.z);
      const f = Math.sin(t * s.fl + s.ph) * 0.9;
      d.position.copy(s.p);
      d.rotation.set(0, s.h, f, "YXZ");
      d.rotateZ(-f);
      d.rotation.set(0, s.h, 0);
      d.rotateZ(f);
      d.updateMatrix();
      this.right.setMatrixAt(i, d.matrix);
      d.rotation.set(0, s.h, 0);
      d.rotateZ(-f);
      d.updateMatrix();
      this.left.setMatrixAt(i, d.matrix);
    }
    this.left.instanceMatrix.needsUpdate = true;
    this.right.instanceMatrix.needsUpdate = true;
  }
}

/* ------------------------------------------------------------------ */
/*  Animal instances (behaviour)                                       */
/* ------------------------------------------------------------------ */
export interface Habitat {
  cx: number;
  cz: number;
  w: number;
  d: number;
  /** optional circular habitat */
  round?: boolean;
  /** inside water / shallow – skip */
}

export class Animal {
  group: THREE.Group;
  rig: Rig;
  id: string;
  hab: Habitat;
  speed: number;
  heading = rnd() * 6.28;
  tx = 0;
  tz = 0;
  state: "idle" | "walk" | "graze" = "idle";
  timer = rr(0, 4);
  phase = rnd() * 6;
  graze: boolean;
  scale: number;
  hopY = 0;
  curSpeed = 0;
  restOneLeg = false;
  constructor(id: string, hab: Habitat, scale = 1, speed = 0.8, graze = false) {
    this.id = id;
    this.rig = BUILD[id]();
    this.group = new THREE.Group();
    this.group.add(this.rig.group);
    this.group.scale.setScalar(scale);
    this.scale = scale;
    this.hab = hab;
    this.speed = speed;
    this.graze = graze;
    this.group.userData.species = id;
    this.rig.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.userData.species = id;
    });
    this.group.position.set(hab.cx + rr(-hab.w / 2.5, hab.w / 2.5), 0, hab.cz + rr(-hab.d / 2.5, hab.d / 2.5));
    this.pickTarget();
    this.group.rotation.y = this.heading;
  }
  inside(x: number, z: number) {
    const h = this.hab;
    if (h.round) return ((x - h.cx) / (h.w / 2 - 1.5)) ** 2 + ((z - h.cz) / (h.d / 2 - 1.5)) ** 2 < 1;
    return Math.abs(x - h.cx) < h.w / 2 - 1.5 && Math.abs(z - h.cz) < h.d / 2 - 1.5;
  }
  pickTarget() {
    for (let i = 0; i < 12; i++) {
      const a = rnd() * 6.28,
        d = rr(3, 14);
      const x = this.group.position.x + Math.sin(a) * d,
        z = this.group.position.z + Math.cos(a) * d;
      if (this.inside(x, z)) {
        this.tx = x;
        this.tz = z;
        return;
      }
    }
    this.tx = this.hab.cx;
    this.tz = this.hab.cz;
  }
  update(dt: number) {
    const p = this.group.position;
    this.timer -= dt;
    if (this.state !== "walk" && this.timer <= 0) {
      if (this.graze && rnd() < 0.4 && this.state !== "graze") {
        this.state = "graze";
        this.timer = rr(4, 10);
      } else {
        this.pickTarget();
        this.state = "walk";
        this.timer = 30;
      }
    }
    let target = 0;
    if (this.state === "walk") {
      const dx = this.tx - p.x,
        dz = this.tz - p.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.8) {
        this.state = "idle";
        this.timer = rr(2, 9);
      } else {
        const want = Math.atan2(dx, dz);
        let diff = want - this.heading;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        this.heading += THREE.MathUtils.clamp(diff, -dt * 1.2, dt * 1.2);
        target = this.speed * (Math.abs(diff) > 1.2 ? 0.3 : 1);
      }
    }
    this.curSpeed += (target - this.curSpeed) * Math.min(1, dt * 3);
    if (this.curSpeed > 0.02) {
      const nx = p.x + Math.sin(this.heading) * this.curSpeed * dt,
        nz = p.z + Math.cos(this.heading) * this.curSpeed * dt;
      if (this.inside(nx, nz)) {
        p.x = nx;
        p.z = nz;
      } else {
        this.state = "idle";
        this.timer = 0.5;
      }
    }
    this.group.rotation.y = this.heading;
    const r = this.rig;
    const stride = this.curSpeed / (0.5 + this.scale * 0.35);
    this.phase += stride * dt * 4.5;
    const amp = Math.min(0.6, this.curSpeed * 0.5) * (r.legs.length === 2 && !r.hop ? 1.2 : 1);
    if (r.hop) {
      const hop = Math.abs(Math.sin(this.phase * 0.9)) * Math.min(1, this.curSpeed * 1.5) * 0.5;
      this.rig.group.position.y = hop;
      r.legs.forEach((l) => (l.rotation.x = -hop * 1.2));
    } else if (r.legs.length === 4) {
      const s = Math.sin(this.phase) * amp;
      r.legs[0].rotation.x = s;
      r.legs[3].rotation.x = s;
      r.legs[1].rotation.x = -s;
      r.legs[2].rotation.x = -s;
      this.rig.group.position.y = Math.abs(Math.cos(this.phase)) * amp * 0.03;
    } else if (r.legs.length === 2) {
      const s = Math.sin(this.phase) * amp;
      r.legs[0].rotation.x = s;
      r.legs[1].rotation.x = -s;
      if (this.id === "penguin") this.rig.group.rotation.z = Math.sin(this.phase) * Math.min(0.2, this.curSpeed * 0.25);
    }
    if (r.head) {
      const target2 = this.state === "graze" ? 0.9 : 0 + Math.sin(this.phase * 0.4) * 0.03 * (this.curSpeed > 0.1 ? 1 : 0);
      r.head.rotation.x += (target2 - r.head.rotation.x) * Math.min(1, dt * 2.5);
    }
    if (r.trunk) r.trunk.rotation.x = Math.sin(performance.now() * 0.0012 + this.phase) * 0.18;
  }
}

/** Swimming creature on an elliptical path inside a tank */
export class Swimmer {
  group: THREE.Group;
  rig: Rig;
  c: THREE.Vector3;
  r: THREE.Vector3;
  sp: number;
  ph: number;
  dir: number;
  kind: string;
  constructor(kind: "shark" | "ray" | "turtle", c: THREE.Vector3, r: THREE.Vector3, sp: number, scale = 1) {
    this.kind = kind;
    this.rig = kind === "shark" ? buildShark() : kind === "ray" ? buildRay() : buildTurtle();
    this.group = new THREE.Group();
    this.group.add(this.rig.group);
    this.group.scale.setScalar(scale);
    this.c = c;
    this.r = r;
    this.sp = sp;
    this.ph = rnd() * 6.28;
    this.dir = rnd() < 0.5 ? 1 : -1;
    this.group.userData.species = kind;
    this.rig.group.traverse((o) => ((o as THREE.Mesh).isMesh ? (o.userData.species = kind) : 0));
  }
  update(t: number) {
    const a = t * this.sp * this.dir + this.ph;
    const x = this.c.x + Math.cos(a) * this.r.x;
    const z = this.c.z + Math.sin(a) * this.r.z;
    const y = this.c.y + Math.sin(a * 2.3 + this.ph) * this.r.y;
    this.group.position.set(x, y, z);
    const dx = -Math.sin(a) * this.r.x * this.dir,
      dz = Math.cos(a) * this.r.z * this.dir;
    this.group.rotation.y = Math.atan2(dx, dz);
    this.group.rotation.z = Math.sin(a * 2.3) * 0.05;
    const w = t * (this.kind === "shark" ? 3.2 : this.kind === "ray" ? 2.2 : 1.6) + this.ph;
    const sw = this.rig.swim!;
    if (this.kind === "shark") sw[0].rotation.y = Math.sin(w * 1.6) * 0.35;
    else if (this.kind === "ray") sw.forEach((s) => (s.rotation.z = (s.userData.s as number) * Math.sin(w * 1.8) * 0.45));
    else sw.forEach((s) => ((s.rotation.z = (s.userData.s as number) * Math.sin(w) * 0.5), (s.rotation.x = 0.1)));
  }
}

/* ------------------------------------------------------------------ */
/*  Flying birds (GLB models: Flamingo, Parrot, Stork)                 */
/* ------------------------------------------------------------------ */
const gltf = new GLTFLoader(loadingManager);
interface GLB {
  scene: THREE.Object3D;
  clips: THREE.AnimationClip[];
  h: number;
}
const glbCache: Record<string, Promise<GLB>> = {};
function loadGLB(url: string): Promise<GLB> {
  return (glbCache[url] ??= new Promise((res, rej) =>
    gltf.load(
      url,
      (g) => {
        const box = new THREE.Box3().setFromObject(g.scene);
        res({ scene: g.scene, clips: g.animations, h: box.max.x - box.min.x || 1 });
      },
      undefined,
      rej
    )
  ));
}

export class Flyer {
  group = new THREE.Group();
  mixer?: THREE.AnimationMixer;
  c: THREE.Vector3;
  r: number;
  sp: number;
  ph: number;
  dir: number;
  wob: number;
  constructor(kind: "macaw" | "stork" | "flamingoFly", c: THREE.Vector3, r: number, sp: number, span: number) {
    this.c = c;
    this.r = r;
    this.sp = sp;
    this.ph = rnd() * 6.28;
    this.dir = rnd() < 0.5 ? 1 : -1;
    this.wob = rnd() * 6;
    const url = kind === "macaw" ? parrotUrl : kind === "stork" ? storkUrl : flamingoUrl;
    this.group.userData.species = kind === "flamingoFly" ? "flamingo" : kind;
    loadGLB(url).then((g) => {
      const m = SkeletonUtils.clone(g.scene) as THREE.Object3D;
      const k = span / g.h;
      m.scale.setScalar(k);
      m.rotation.y = -Math.PI / 2; // models fly along +x
      m.traverse((o) => {
        const me = o as THREE.Mesh;
        if (me.isMesh) {
          me.castShadow = true;
          me.userData.species = this.group.userData.species;
          const mt = (me.material as THREE.MeshStandardMaterial).clone();
          if (kind === "macaw") {
            mt.color = new THREE.Color(0x3f6bd8);
          }
          mt.roughness = 0.7;
          mt.metalness = 0;
          me.material = mt;
        }
      });
      this.group.add(m);
      if (g.clips[0]) {
        this.mixer = new THREE.AnimationMixer(m);
        const a = this.mixer.clipAction(g.clips[0]);
        a.time = rnd() * g.clips[0].duration;
        a.play();
      }
    });
  }
  update(dt: number, t: number) {
    this.mixer?.update(dt);
    const a = t * this.sp * this.dir + this.ph;
    this.group.position.set(this.c.x + Math.cos(a) * this.r, this.c.y + Math.sin(a * 1.7 + this.wob) * 1.2, this.c.z + Math.sin(a) * this.r * 0.8);
    this.group.rotation.y = Math.atan2(-Math.sin(a) * this.r * this.dir, Math.cos(a) * this.r * 0.8 * this.dir) + 0;
    this.group.rotation.z = -0.25 * this.dir;
  }
}

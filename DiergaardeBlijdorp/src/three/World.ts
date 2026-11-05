import * as THREE from "three";
import { Sky } from "three/examples/jsm/objects/Sky.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { setAniso, whenTexturesLoaded, pointInPoly } from "./kit";
import type { Zone, POI, Seg } from "./kit";
import { buildZoo, ZooResult } from "./zoo";
import { waterNormalMap } from "./mats";
import { INFO, SpeciesInfo, Animal } from "./animals";

export type TimePreset = "day" | "golden" | "night";
export type Mode = "walk" | "fly";

export interface Hooks {
  onProgress?: (p: number, label: string) => void;
  onReady?: () => void;
  onZone?: (z: { id: string; name: string; color: string; kind: string }) => void;
  onTarget?: (t: { id: string; info: SpeciesInfo; dist: number } | null) => void;
  onLock?: (locked: boolean) => void;
  onTour?: (poi: POI | null, index: number, total: number) => void;
  onFps?: (fps: number) => void;
}

const PRESETS = {
  day: { elev: 52, az: 140, turb: 2.2, ray: 1.0, mie: 0.004, g: 0.8, exposure: 0.62, sun: 3.4, sunCol: 0xfff1de, hemi: 0.75, hemiSky: 0xcfe3ff, hemiGnd: 0x7b8a5a, env: 1.0, fog: 0xbfd2e2, fogD: 0.00115, night: 0 },
  golden: { elev: 7, az: 232, turb: 5, ray: 2.4, mie: 0.012, g: 0.86, exposure: 0.55, sun: 3.0, sunCol: 0xffb069, hemi: 0.5, hemiSky: 0xffc9a0, hemiGnd: 0x6a5238, env: 0.85, fog: 0xe4b48f, fogD: 0.0016, night: 0.3 },
  night: { elev: -7, az: 60, turb: 0.6, ray: 0.12, mie: 0.0006, g: 0.7, exposure: 0.95, sun: 0.55, sunCol: 0x8fb0ff, hemi: 0.22, hemiSky: 0x24365a, hemiGnd: 0x0b0e14, env: 0.18, fog: 0x0c1220, fogD: 0.0016, night: 1 },
} as const;

interface Tracked {
  g: THREE.Object3D;
  id: string;
  h: number;
  r: number;
}

export class World {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(68, 1, 0.15, 1800);
  composer: EffectComposer;
  bloom: UnrealBloomPass;
  sunLight = new THREE.DirectionalLight(0xffffff, 3);
  hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
  ambient = new THREE.AmbientLight(0x9fb4d0, 0.02);
  skyMain = new Sky();
  skyEnv = new Sky();
  envScene = new THREE.Scene();
  pmrem: THREE.PMREMGenerator;
  envRT: THREE.WebGLRenderTarget | null = null;
  stars: THREE.Points;
  pool: THREE.PointLight[] = [];
  zoo!: ZooResult;
  hooks: Hooks;
  container: HTMLElement;
  raf = 0;
  clock = new THREE.Clock();
  ready = false;
  disposed = false;

  // player
  px = 0;
  pz = 236;
  heading = Math.PI;
  pitch = 0;
  py = 1.7;
  vel = new THREE.Vector2();
  mode: Mode = "walk";
  keys = new Set<string>();
  locked = false;
  bob = 0;
  preset: TimePreset = "day";
  nightF = 0;
  interiorK = 1;
  fogK = 0;
  zoneCur = "";
  zoneTimer = 0;
  targetTimer = 0;
  tracked: Tracked[] = [];
  fpsAcc = 0;
  fpsN = 0;
  touch: { id: number; x: number; y: number; sx: number; sy: number; type: "move" | "look" }[] = [];
  quality: "high" | "balanced" = "balanced";
  pr = 1;

  // tour
  tour: { i: number; t: number; from: { x: number; z: number; h: number }; phase: "fly" | "hold" } | null = null;

  // collision grid
  grid = new Map<number, Seg[]>();
  static CELL = 16;

  constructor(container: HTMLElement, hooks: Hooks = {}) {
    this.container = container;
    this.hooks = hooks;
    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance", stencil: false }));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 0.62;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.pr = Math.min(window.devicePixelRatio || 1, 1.5);
    r.setPixelRatio(this.pr);
    container.appendChild(r.domElement);
    r.domElement.style.display = "block";
    r.domElement.style.touchAction = "none";
    setAniso(Math.min(8, r.capabilities.getMaxAnisotropy()));

    // sky & environment
    for (const s of [this.skyMain, this.skyEnv]) s.scale.setScalar(1000);
    this.scene.add(this.skyMain);
    this.envScene.add(this.skyEnv);
    this.pmrem = new THREE.PMREMGenerator(r);
    // stars
    const sg = new THREE.BufferGeometry();
    const sp = new Float32Array(1600 * 3);
    for (let i = 0; i < 1600; i++) {
      const u = Math.random() * 2 - 1,
        a = Math.random() * 6.283,
        s = Math.sqrt(1 - u * u);
      sp[i * 3] = Math.cos(a) * s * 900;
      sp[i * 3 + 1] = Math.abs(u) * 900 * 0.98 + 20;
      sp[i * 3 + 2] = Math.sin(a) * s * 900;
    }
    sg.setAttribute("position", new THREE.BufferAttribute(sp, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    this.scene.add(this.stars);

    // lights
    this.scene.add(this.hemi, this.ambient, this.sunLight, this.sunLight.target);
    const sh = this.sunLight.shadow;
    sh.mapSize.set(2048, 2048);
    const c = sh.camera;
    c.left = -70;
    c.right = 70;
    c.top = 70;
    c.bottom = -70;
    c.near = 1;
    c.far = 500;
    sh.bias = -0.0004;
    sh.normalBias = 0.06;
    this.sunLight.castShadow = true;
    for (let i = 0; i < 8; i++) {
      const p = new THREE.PointLight(0xffffff, 0, 20, 1.6);
      this.pool.push(p);
      this.scene.add(p);
    }
    this.scene.fog = new THREE.FogExp2(0xbfd2e2, 0.0012);

    // post-processing (MSAA HDR target → bloom → ACES output)
    const size = new THREE.Vector2(1, 1);
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(r, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.28, 0.7, 0.92);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.camera.position.set(this.px, this.py, this.pz);
    this.onResize();
    window.addEventListener("resize", this.onResize);
    this.bindInput();
    this.applyPreset("day", true);
    void this.build();
  }

  /* ---------------------------------------------------------------- */
  async build() {
    const tick = () => new Promise((res) => setTimeout(res, 30));
    this.hooks.onProgress?.(0.05, "Surveying the grounds…");
    await tick();
    if (this.disposed) return;
    this.zoo = buildZoo();
    this.hooks.onProgress?.(0.45, "Planting trees, stocking enclosures…");
    await tick();
    if (this.disposed) return;
    this.scene.add(this.zoo.root, this.zoo.dyn);
    // shadows for animals
    this.zoo.dyn.traverse((o) => ((o as THREE.Mesh).isMesh ? ((o as THREE.Mesh).castShadow = true) : 0));
    // collision grid
    this.zoo.colliders.forEach((s) => this.insertSeg(s));
    // tracking list (for the "look at an animal" HUD)
    const box = new THREE.Box3();
    const sz = new THREE.Vector3();
    const reg = (g: THREE.Object3D, id: string) => {
      box.setFromObject(g);
      box.getSize(sz);
      this.tracked.push({ g, id, h: Math.max(0.3, sz.y), r: Math.max(0.4, Math.max(sz.x, sz.z) * 0.6) });
    };
    this.zoo.animals.forEach((a) => reg(a.group, a.group.userData.species));
    this.zoo.swimmers.forEach((s) => reg(s.group, s.kind));
    this.zoo.dyn.updateMatrixWorld(true);
    // weather-proof the glow table and apply current preset
    this.applyPreset(this.preset, true);
    this.hooks.onProgress?.(0.6, "Loading textures…");
    await whenTexturesLoaded((f) => this.hooks.onProgress?.(0.6 + f * 0.3, "Loading textures…"));
    if (this.disposed) return;
    this.hooks.onProgress?.(0.92, "Compiling shaders…");
    await tick();
    if (this.disposed) return;
    try {
      this.renderer.compile(this.scene, this.camera);
    } catch {
      /* ignore */
    }
    this.hooks.onProgress?.(1, "Ready");
    this.ready = true;
    this.hooks.onReady?.();
    this.clock.start();
    this.loop();
  }

  insertSeg(s: Seg) {
    const C = World.CELL;
    const m = s[4] + 1.2;
    const x0 = Math.floor((Math.min(s[0], s[2]) - m) / C),
      x1 = Math.floor((Math.max(s[0], s[2]) + m) / C),
      z0 = Math.floor((Math.min(s[1], s[3]) - m) / C),
      z1 = Math.floor((Math.max(s[1], s[3]) + m) / C);
    for (let x = x0; x <= x1; x++)
      for (let z = z0; z <= z1; z++) {
        const k = x * 4096 + z;
        const a = this.grid.get(k);
        if (a) a.push(s);
        else this.grid.set(k, [s]);
      }
  }

  /* ---------------------------------------------------------------- */
  onResize = () => {
    const w = this.container.clientWidth || window.innerWidth,
      h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.composer.setPixelRatio(this.pr);
    this.composer.setSize(w, h);
    this.bloom.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  setQuality(q: "high" | "balanced") {
    this.quality = q;
    this.pr = q === "high" ? Math.min(window.devicePixelRatio || 1, 2) : Math.min(window.devicePixelRatio || 1, 1.25);
    const s = q === "high" ? 4096 : 2048;
    const sh = this.sunLight.shadow;
    if (sh.mapSize.x !== s) {
      sh.mapSize.set(s, s);
      sh.map?.dispose();
      sh.map = null;
    }
    this.onResize();
  }

  /* ---------------------------------------------------------------- */
  applyPreset(name: TimePreset, instant = false) {
    void instant;
    this.preset = name;
    const p = PRESETS[name];
    const phi = THREE.MathUtils.degToRad(90 - p.elev),
      theta = THREE.MathUtils.degToRad(p.az);
    const dir = new THREE.Vector3().setFromSphericalCoords(1, phi, theta);
    for (const s of [this.skyMain, this.skyEnv]) {
      const u = s.material.uniforms;
      u.turbidity.value = p.turb;
      u.rayleigh.value = p.ray;
      u.mieCoefficient.value = p.mie;
      u.mieDirectionalG.value = p.g;
      u.sunPosition.value.copy(dir);
    }
    // night: use a moon direction for the shadow light
    const lightDir = name === "night" ? new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(40), THREE.MathUtils.degToRad(40)) : dir;
    this.sunDir = lightDir.clone();
    this.sunLight.color.setHex(p.sunCol);
    this.sunLight.intensity = p.sun;
    this.hemi.color.setHex(p.hemiSky);
    this.hemi.groundColor.setHex(p.hemiGnd);
    this.baseHemi = p.hemi;
    this.baseEnv = p.env;
    this.renderer.toneMappingExposure = p.exposure;
    (this.scene.fog as THREE.FogExp2).color.setHex(p.fog);
    this.baseFog = new THREE.Color(p.fog);
    this.baseFogD = p.fogD;
    this.nightF = p.night;
    (this.stars.material as THREE.PointsMaterial).opacity = name === "night" ? 0.95 : 0;
    this.bloom.strength = name === "night" ? 0.7 : name === "golden" ? 0.35 : 0.22;
    this.bloom.threshold = name === "night" ? 0.7 : 0.92;
    // env map from the procedural sky
    this.envRT?.dispose();
    this.envRT = this.pmrem.fromScene(this.envScene, 0.02);
    this.scene.environment = this.envRT.texture;
    this.scene.environmentIntensity = p.env;
    // emissives
    if (this.zoo) for (const g of this.zoo.glow) g.mat.emissiveIntensity = THREE.MathUtils.lerp(g.day, g.night, name === "night" ? 1 : name === "golden" ? 0.4 : 0);
  }
  sunDir = new THREE.Vector3(0.5, 1, 0.5).normalize();
  baseHemi = 0.7;
  baseEnv = 1;
  baseFog = new THREE.Color(0xbfd2e2);
  baseFogD = 0.0012;

  setTime(p: TimePreset) {
    this.applyPreset(p);
  }

  setMode(m: Mode) {
    this.mode = m;
    if (m === "walk") this.py = 1.7;
    else this.py = Math.max(this.py, 12);
  }

  teleport(x: number, z: number, heading: number) {
    this.px = x;
    this.pz = z;
    this.heading = heading;
    this.pitch = 0;
    this.vel.set(0, 0);
    if (this.mode === "walk") this.py = 1.7;
  }
  teleportPoi(p: POI) {
    this.stopTour();
    this.teleport(p.x, p.z, p.yaw);
  }

  startTour() {
    if (!this.ready) return;
    this.tour = { i: 0, t: 0, from: { x: this.px, z: this.pz, h: this.heading }, phase: "fly" };
    this.hooks.onTour?.(this.zoo.pois[0], 0, this.zoo.pois.length);
  }
  stopTour() {
    if (this.tour) {
      this.tour = null;
      this.hooks.onTour?.(null, 0, 0);
      if (this.mode === "walk") this.py = 1.7;
    }
  }

  /* ---------------------------------------------------------------- */
  bindInput() {
    const el = this.renderer.domElement;
    const kd = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      this.keys.add(e.code);
      if (e.code === "KeyF") this.setMode(this.mode === "walk" ? "fly" : "walk");
      if (e.code === "Digit1") this.setTime("day");
      if (e.code === "Digit2") this.setTime("golden");
      if (e.code === "Digit3") this.setTime("night");
      if (e.code === "KeyT") (this.tour ? this.stopTour() : this.startTour());
      if (["Space", "ArrowUp", "ArrowDown"].includes(e.code)) e.preventDefault();
    };
    const ku = (e: KeyboardEvent) => this.keys.delete(e.code);
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    window.addEventListener("blur", () => this.keys.clear());
    el.addEventListener("click", () => {
      if (!this.locked && !this.touch.length && el.requestPointerLock) el.requestPointerLock();
    });
    document.addEventListener("pointerlockchange", () => {
      this.locked = document.pointerLockElement === el;
      this.hooks.onLock?.(this.locked);
    });
    let dragging = false;
    el.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse") dragging = true;
    });
    window.addEventListener("pointerup", () => (dragging = false));
    window.addEventListener("pointermove", (e) => {
      if (e.pointerType !== "mouse") return;
      if (this.locked || dragging) this.look(e.movementX, e.movementY);
    });
    el.addEventListener("wheel", (e) => {
      this.camera.fov = THREE.MathUtils.clamp(this.camera.fov + e.deltaY * 0.03, 30, 90);
      this.camera.updateProjectionMatrix();
    });
    // touch
    el.addEventListener(
      "touchstart",
      (e) => {
        for (const t of Array.from(e.changedTouches)) {
          const left = t.clientX < el.clientWidth * 0.45;
          this.touch.push({ id: t.identifier, x: t.clientX, y: t.clientY, sx: t.clientX, sy: t.clientY, type: left ? "move" : "look" });
        }
      },
      { passive: true }
    );
    el.addEventListener(
      "touchmove",
      (e) => {
        for (const t of Array.from(e.changedTouches)) {
          const f = this.touch.find((q) => q.id === t.identifier);
          if (!f) continue;
          if (f.type === "look") this.look((t.clientX - f.x) * 1.4, (t.clientY - f.y) * 1.4);
          f.x = t.clientX;
          f.y = t.clientY;
        }
      },
      { passive: true }
    );
    const te = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) this.touch = this.touch.filter((q) => q.id !== t.identifier);
    };
    el.addEventListener("touchend", te);
    el.addEventListener("touchcancel", te);
  }

  look(dx: number, dy: number) {
    if (this.tour) return;
    this.heading -= dx * 0.0022;
    this.pitch = THREE.MathUtils.clamp(this.pitch - dy * 0.0022, -1.45, 1.45);
  }

  /* ---------------------------------------------------------------- */
  collide(x: number, z: number, r = 0.42): [number, number] {
    const C = World.CELL;
    const k = Math.floor(x / C) * 4096 + Math.floor(z / C);
    const arr = this.grid.get(k);
    if (!arr) return [x, z];
    for (let pass = 0; pass < 2; pass++)
      for (const s of arr) {
        const dx = s[2] - s[0],
          dz = s[3] - s[1];
        const l2 = dx * dx + dz * dz;
        const t = l2 < 1e-6 ? 0 : Math.max(0, Math.min(1, ((x - s[0]) * dx + (z - s[1]) * dz) / l2));
        const cx = s[0] + dx * t,
          cz = s[1] + dz * t;
        let ox = x - cx,
          oz = z - cz;
        const d = Math.hypot(ox, oz);
        const min = r + s[4];
        if (d < min) {
          if (d < 1e-5) {
            ox = -dz;
            oz = dx;
            const n = Math.hypot(ox, oz) || 1;
            ox /= n;
            oz /= n;
          } else {
            ox /= d;
            oz /= d;
          }
          x = cx + ox * min;
          z = cz + oz * min;
        }
      }
    return [x, z];
  }

  /* ---------------------------------------------------------------- */
  loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, this.clock.getDelta());
    const t = this.clock.elapsedTime;
    this.update(dt, t);
    this.composer.render();
    this.fpsAcc += dt;
    this.fpsN++;
    if (this.fpsAcc > 1) {
      this.hooks.onFps?.(Math.round(this.fpsN / this.fpsAcc));
      this.fpsAcc = 0;
      this.fpsN = 0;
    }
  };

  update(dt: number, t: number) {
    this.updatePlayer(dt);
    const cam = this.camera;
    cam.position.set(this.px, this.py + (this.mode === "walk" && !this.tour ? Math.sin(this.bob) * 0.035 : 0), this.pz);
    cam.rotation.set(this.pitch, this.heading + Math.PI, 0, "YXZ");

    // sun/moon follows the player (texel-snapped to avoid shimmer)
    const snap = 140 / this.sunLight.shadow.mapSize.x;
    const tx = Math.round(this.px / snap) * snap,
      tz = Math.round(this.pz / snap) * snap;
    this.sunLight.target.position.set(tx, 0, tz);
    this.sunLight.position.set(tx + this.sunDir.x * 220, this.sunDir.y * 220, tz + this.sunDir.z * 220);
    this.sunLight.target.updateMatrixWorld();
    this.skyMain.position.copy(cam.position);
    this.stars.position.copy(cam.position);

    if (!this.zoo) return;
    const pos = cam.position;

    // zone & interior lighting
    this.zoneTimer -= dt;
    let targetK = 1,
      targetFog = 0;
    const zone = this.zoneAt(this.px, this.pz);
    if (zone.kind === "interior") {
      targetK = zone.dark ?? 0.5;
      targetFog = zone.fog ?? 0;
    }
    this.interiorK += (targetK - this.interiorK) * Math.min(1, dt * 2.5);
    this.fogK += (targetFog - this.fogK) * Math.min(1, dt * 3);
    if (this.zoneTimer <= 0) {
      this.zoneTimer = 0.25;
      if (zone.id !== this.zoneCur) {
        this.zoneCur = zone.id;
        this.hooks.onZone?.({ id: zone.id, name: zone.name, color: zone.color, kind: zone.kind });
      }
    }
    const k = this.interiorK;
    this.scene.environmentIntensity = this.baseEnv * (0.04 + 0.96 * k * k);
    this.hemi.intensity = this.baseHemi * (0.1 + 0.9 * k);
    this.ambient.intensity = 0.04 + (1 - k) * 0.22;
    const fog = this.scene.fog as THREE.FogExp2;
    fog.color.copy(this.baseFog).lerp(new THREE.Color(0x0a3a58), this.fogK * 0.9);
    fog.density = this.baseFogD * (1 - this.fogK) + 0.012 * this.fogK;

    // point-light pool: nearest light spots
    const spots = this.zoo.lights;
    const picks: { i: number; d: number }[] = [];
    const nf = this.nightF;
    for (let i = 0; i < spots.length; i++) {
      const s = spots[i];
      if (s.night && nf < 0.25) continue;
      const dx = s.x - pos.x,
        dy = s.y - pos.y,
        dz = s.z - pos.z;
      const d = dx * dx + dy * dy + dz * dz;
      if (d < (s.dist * 1.6) ** 2) picks.push({ i, d });
    }
    picks.sort((a, b) => a.d - b.d);
    for (let i = 0; i < this.pool.length; i++) {
      const p = this.pool[i];
      const pk = picks[i];
      if (!pk) {
        p.intensity += (0 - p.intensity) * Math.min(1, dt * 8);
        continue;
      }
      const s = spots[pk.i];
      p.position.set(s.x, s.y, s.z);
      p.color.setHex(s.color);
      p.distance = s.dist * 1.4;
      const target = s.intensity * (s.night ? Math.min(1, nf * 1.4) : 1) * (this.preset === "night" ? 1.25 : 1);
      p.intensity += (target - p.intensity) * Math.min(1, dt * 6);
    }

    // water motion
    waterNormalMap.offset.x += dt * 0.012;
    waterNormalMap.offset.y += dt * 0.008;

    // ---- dynamic things (LOD by distance) ----
    const near = (x: number, z: number, r: number) => (x - pos.x) ** 2 + (z - pos.z) ** 2 < r * r;
    for (const a of this.zoo.animals) {
      const g = a.group.position;
      const d2 = (g.x - pos.x) ** 2 + (g.z - pos.z) ** 2;
      const vis = d2 < 190 * 190;
      a.group.visible = vis;
      if (!vis) continue;
      if (d2 < 90 * 90 || ((Math.floor(t * 10) + a.group.id) & 3) === 0) a.update(d2 < 90 * 90 ? dt : dt * 4);
    }
    for (const s of this.zoo.swimmers) {
      const d2 = (s.c.x - pos.x) ** 2 + (s.c.z - pos.z) ** 2;
      s.group.visible = d2 < 90 * 90;
      if (s.group.visible) s.update(t);
    }
    for (const s of this.zoo.schools) {
      const on = near(s.center.x, s.center.z, 80);
      s.mesh.visible = on;
      if (on) s.update(t);
    }
    for (const b of this.zoo.butterflies) {
      const c = b.box.getCenter(new THREE.Vector3());
      const on = near(c.x, c.z, 90);
      b.group.visible = on;
      if (on) b.update(dt, t);
    }
    for (const f of this.zoo.flyers) f.update(dt, t);
    this.zoo.crowd.update(dt, t);
    // train
    const tr = this.zoo.train;
    const cycle = 1100;
    tr.position.x = ((t * 24) % cycle) - 560 - 98;

    // tour + target HUD
    this.updateTour(dt);
    this.targetTimer -= dt;
    if (this.targetTimer <= 0) {
      this.targetTimer = 0.12;
      this.updateTarget();
    }
  }

  zoneAt(x: number, z: number): Zone {
    const zs = this.zoo.zones;
    for (const z0 of zs) if (z0.kind === "interior" && pointInPoly(x, z, z0.poly)) return z0;
    for (const z0 of zs) if (z0.kind === "outdoor" && pointInPoly(x, z, z0.poly)) return z0;
    return { id: "park", name: "Diergaarde Blijdorp", kind: "outdoor", poly: [], color: "#7fb27a" };
  }

  updatePlayer(dt: number) {
    if (this.tour) return;
    const k = this.keys;
    let f = 0,
      s = 0;
    if (k.has("KeyW") || k.has("ArrowUp")) f += 1;
    if (k.has("KeyS") || k.has("ArrowDown")) f -= 1;
    if (k.has("KeyD") || k.has("ArrowRight")) s += 1;
    if (k.has("KeyA") || k.has("ArrowLeft")) s -= 1;
    const mv = this.touch.find((q) => q.type === "move");
    if (mv) {
      const dx = THREE.MathUtils.clamp((mv.x - mv.sx) / 60, -1, 1),
        dy = THREE.MathUtils.clamp((mv.y - mv.sy) / 60, -1, 1);
      s += dx;
      f -= dy;
    }
    if (k.has("ArrowLeft") && !k.has("KeyA")) this.heading += dt * 1.6;
    if (k.has("ArrowRight") && !k.has("KeyD")) this.heading -= dt * 1.6;
    const run = k.has("ShiftLeft") || k.has("ShiftRight");
    const fly = this.mode === "fly";
    const speed = fly ? (run ? 70 : 24) : run ? 7.2 : 3.4;
    // desired velocity in world space
    const fx = Math.sin(this.heading),
      fz = Math.cos(this.heading);
    const rx = -Math.cos(this.heading),
      rz = Math.sin(this.heading);
    let dxv: number, dzv: number;
    if (fly) {
      const cp = Math.cos(this.pitch);
      dxv = fx * cp * f + rx * s;
      dzv = fz * cp * f + rz * s;
      this.py += (f * Math.sin(this.pitch) + (k.has("Space") ? 1 : 0) - (k.has("KeyC") ? 1 : 0)) * speed * dt;
      this.py = THREE.MathUtils.clamp(this.py, 1.2, 260);
    } else {
      dxv = fx * f + rx * s;
      dzv = fz * f + rz * s;
    }
    const len = Math.hypot(dxv, dzv);
    if (len > 1) {
      dxv /= len;
      dzv /= len;
    }
    this.vel.x += (dxv * speed - this.vel.x) * Math.min(1, dt * 9);
    this.vel.y += (dzv * speed - this.vel.y) * Math.min(1, dt * 9);
    let nx = this.px + this.vel.x * dt,
      nz = this.pz + this.vel.y * dt;
    if (!fly) [nx, nz] = this.collide(nx, nz);
    else {
      nx = THREE.MathUtils.clamp(nx, -400, 400);
      nz = THREE.MathUtils.clamp(nz, -450, 400);
    }
    const moved = Math.hypot(nx - this.px, nz - this.pz);
    this.px = nx;
    this.pz = nz;
    if (!fly) {
      this.bob += moved * (run ? 2.2 : 2.9);
      this.py = 1.7;
    }
  }

  updateTour(dt: number) {
    const tr = this.tour;
    if (!tr) return;
    const pois = this.zoo.pois;
    const poi = pois[tr.i];
    tr.t += dt;
    if (tr.phase === "fly") {
      const D = 3.2;
      const u = Math.min(1, tr.t / D);
      const e = u * u * (3 - 2 * u);
      this.px = tr.from.x + (poi.x - tr.from.x) * e;
      this.pz = tr.from.z + (poi.z - tr.from.z) * e;
      let dh = poi.yaw - tr.from.h;
      dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      this.heading = tr.from.h + dh * e;
      this.py = 1.7 + Math.sin(e * Math.PI) * 40;
      this.pitch = -Math.sin(e * Math.PI) * 0.5;
      if (u >= 1) {
        tr.phase = "hold";
        tr.t = 0;
        this.hooks.onTour?.(poi, tr.i, pois.length);
      }
    } else if (tr.t > 7) {
      const ni = (tr.i + 1) % pois.length;
      this.tour = { i: ni, t: 0, from: { x: this.px, z: this.pz, h: this.heading }, phase: "fly" };
    }
  }

  updateTarget() {
    if (this.tour && this.tour.phase === "fly") {
      this.hooks.onTarget?.(null);
      return;
    }
    const cam = this.camera;
    const fwd = new THREE.Vector3();
    cam.getWorldDirection(fwd);
    let best: { id: string; dist: number; score: number } | null = null;
    const p = cam.position;
    const v = new THREE.Vector3();
    for (const tk of this.tracked) {
      if (!tk.g.visible) continue;
      const g = tk.g.position;
      v.set(g.x - p.x, g.y + tk.h * 0.5 - p.y, g.z - p.z);
      const d = v.length();
      if (d > 34 || d < 0.5) continue;
      v.divideScalar(d);
      const ang = Math.acos(THREE.MathUtils.clamp(v.dot(fwd), -1, 1));
      const lim = Math.atan2(tk.r + 0.4, d) + 0.04;
      if (ang < lim) {
        const score = d + ang * 40;
        if (!best || score < best.score) best = { id: tk.id, dist: d, score };
      }
    }
    if (best && INFO[best.id]) this.hooks.onTarget?.({ id: best.id, info: INFO[best.id], dist: best.dist });
    else this.hooks.onTarget?.(null);
  }

  /* ---------------------------------------------------------------- */
  exitLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.onResize);
    this.exitLock();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

export type { Animal };

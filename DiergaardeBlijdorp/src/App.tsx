import { useCallback, useEffect, useRef, useState } from "react";
import { World, TimePreset } from "./three/World";
import type { POI } from "./three/kit";
import type { SpeciesInfo } from "./three/animals";

const BX0 = -232,
  BX1 = 232,
  BZ0 = -288,
  BZ1 = 248;

interface Target {
  id: string;
  info: SpeciesInfo;
  dist: number;
}

const TIMES: { id: TimePreset; label: string; icon: string }[] = [
  { id: "day", label: "Day", icon: "☀" },
  { id: "golden", label: "Golden hour", icon: "🌇" },
  { id: "night", label: "Night", icon: "🌙" },
];

export default function App() {
  const mount = useRef<HTMLDivElement>(null);
  const mini = useRef<HTMLCanvasElement>(null);
  const w = useRef<World | null>(null);
  const baseMap = useRef<HTMLCanvasElement | null>(null);

  const [progress, setProgress] = useState(0);
  const [label, setLabel] = useState("Starting…");
  const [ready, setReady] = useState(false);
  const [started, setStarted] = useState(false);
  const [locked, setLocked] = useState(false);
  const [zone, setZone] = useState({ name: "City entrance", color: "#6fa08a", kind: "outdoor" });
  const [target, setTarget] = useState<Target | null>(null);
  const [tour, setTour] = useState<{ poi: POI | null; i: number; n: number } | null>(null);
  const [time, setTime] = useState<TimePreset>("day");
  const [mode, setMode] = useState<"walk" | "fly">("walk");
  const [quality, setQuality] = useState<"balanced" | "high">("balanced");
  const [fps, setFps] = useState(0);
  const [menu, setMenu] = useState(false);
  const [bigMap, setBigMap] = useState(false);
  const [fade, setFade] = useState(false);
  const [pois, setPois] = useState<POI[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!mount.current) return;
    let world: World;
    try {
      world = new World(mount.current, {
        onProgress: (p, l) => {
          setProgress(p);
          setLabel(l);
        },
        onReady: () => {
          setReady(true);
          setPois(world.zoo.pois);
          buildBase(world);
        },
        onZone: (z) => setZone(z),
        onTarget: (t) => setTarget(t),
        onLock: (l) => setLocked(l),
        onTour: (poi, i, n) => setTour(poi || n ? { poi, i, n } : null),
        onFps: (f) => setFps(f),
      });
    } catch (e) {
      setErr(String(e));
      return;
    }
    w.current = world;
    (window as unknown as { __world: World }).__world = world;
    return () => {
      world.dispose();
      w.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- minimap ---------- */
  const MW = bigMap ? 420 : 210;
  const MH = Math.round((MW * (BZ1 - BZ0)) / (BX1 - BX0));
  const toMap = useCallback((x: number, z: number): [number, number] => [((x - BX0) / (BX1 - BX0)) * MW, ((z - BZ0) / (BZ1 - BZ0)) * MH], [MW, MH]);

  const buildBase = useCallback(
    (world: World, W = MW, H = MH) => {
      const c = document.createElement("canvas");
      c.width = W;
      c.height = H;
      const g = c.getContext("2d")!;
      const m = (x: number, z: number): [number, number] => [((x - BX0) / (BX1 - BX0)) * W, ((z - BZ0) / (BZ1 - BZ0)) * H];
      g.fillStyle = "#35553a";
      g.fillRect(0, 0, W, H);
      // zones
      for (const z of world.zoo.zones) {
        if (!z.poly.length) continue;
        g.beginPath();
        z.poly.forEach(([x, zz], i) => {
          const [px, py] = m(x, zz);
          i ? g.lineTo(px, py) : g.moveTo(px, py);
        });
        g.closePath();
        g.fillStyle = z.color + (z.kind === "interior" ? "cc" : "33");
        g.fill();
      }
      // railway
      g.fillStyle = "#555";
      const [rx0, ry0] = m(-232, -86);
      const [rx1, ry1] = m(232, -64);
      g.fillRect(rx0, ry0, rx1 - rx0, ry1 - ry0);
      // paths
      g.lineCap = "round";
      g.lineJoin = "round";
      g.strokeStyle = "#d8cdb2";
      for (const p of world.zoo.paths) {
        g.lineWidth = Math.max(1.2, (p.w * W) / (BX1 - BX0));
        g.beginPath();
        p.pts.forEach(([x, z], i) => {
          const [px, py] = m(x, z);
          i ? g.lineTo(px, py) : g.moveTo(px, py);
        });
        g.stroke();
      }
      // ponds etc.
      g.fillStyle = "#4b91ad";
      const [pxx, pyy] = m(0, 116);
      g.beginPath();
      g.ellipse(pxx, pyy, (31 * W) / (BX1 - BX0), (14 * H) / (BZ1 - BZ0), 0, 0, 7);
      g.fill();
      // labels
      g.fillStyle = "#fff";
      g.font = `${Math.round(W / 24)}px system-ui, sans-serif`;
      g.textAlign = "center";
      g.shadowColor = "#000";
      g.shadowBlur = 3;
      const lab: [string, number, number][] = [
        ["OCEANIUM", 0, -150],
        ["AMAZONICA", -120, -175],
        ["ARCTICA", 152, -172],
        ["RIVIÈRAHAL", 0, 43],
        ["AFRIKA", -150, 0],
        ["AZIË", 160, 0],
        ["TAMAN INDAH", 140, 35],
        ["EUROPA", -120, 175],
        ["AUSTRALIË", 118, 178],
        ["ENTRANCE", 0, 225],
        ["MAIN GATE", 0, -262],
      ];
      for (const [t, x, z] of lab) {
        const [px, py] = m(x, z);
        g.fillText(t, px, py);
      }
      baseMap.current = c;
    },
    [MW, MH]
  );

  useEffect(() => {
    if (w.current && ready) buildBase(w.current, MW, MH);
  }, [MW, MH, ready, buildBase]);

  useEffect(() => {
    if (!ready) return;
    const id = setInterval(() => {
      const world = w.current,
        cv = mini.current,
        base = baseMap.current;
      if (!world || !cv || !base) return;
      const g = cv.getContext("2d")!;
      g.clearRect(0, 0, cv.width, cv.height);
      g.drawImage(base, 0, 0);
      for (const p of world.zoo.pois) {
        const [x, y] = toMap(p.x, p.z);
        g.fillStyle = "#ffd36a";
        g.beginPath();
        g.arc(x, y, 2.2, 0, 7);
        g.fill();
      }
      const [x, y] = toMap(world.px, world.pz);
      const h = world.heading;
      g.save();
      g.translate(x, y);
      g.rotate(-h + Math.PI);
      g.fillStyle = "#ff4d3d";
      g.strokeStyle = "#fff";
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(0, -7);
      g.lineTo(5, 5);
      g.lineTo(0, 2);
      g.lineTo(-5, 5);
      g.closePath();
      g.fill();
      g.stroke();
      g.restore();
    }, 100);
    return () => clearInterval(id);
  }, [ready, toMap]);

  const clickMap = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = BX0 + ((e.clientX - r.left) / r.width) * (BX1 - BX0);
    const z = BZ0 + ((e.clientY - r.top) / r.height) * (BZ1 - BZ0);
    const world = w.current;
    if (!world) return;
    world.stopTour();
    world.teleport(x, z, world.heading);
    // nudge out of walls
    const [nx, nz] = world.collide(x, z, 0.5);
    world.teleport(nx, nz, world.heading);
  };

  /* ---------- actions ---------- */
  const enter = () => {
    setStarted(true);
    const el = w.current?.renderer.domElement;
    el?.requestPointerLock?.();
  };
  const changeTime = (t: TimePreset) => {
    setFade(true);
    setTimeout(() => {
      w.current?.setTime(t);
      setTime(t);
      setTimeout(() => setFade(false), 120);
    }, 260);
  };
  const toggleMode = () => {
    const m = mode === "walk" ? "fly" : "walk";
    w.current?.setMode(m);
    setMode(m);
  };
  const toggleQuality = () => {
    const q = quality === "balanced" ? "high" : "balanced";
    w.current?.setQuality(q);
    setQuality(q);
  };
  const goPoi = (p: POI) => {
    w.current?.teleportPoi(p);
    setMenu(false);
    w.current?.renderer.domElement.requestPointerLock?.();
  };
  const toggleTour = () => {
    const world = w.current;
    if (!world) return;
    if (tour) world.stopTour();
    else {
      world.startTour();
      setMenu(false);
    }
  };

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.code === "KeyM") setBigMap((v) => !v);
      if (e.code === "KeyF") setMode((m) => (m === "walk" ? "fly" : "walk"));
      if (e.code === "Digit1") setTime("day");
      if (e.code === "Digit2") setTime("golden");
      if (e.code === "Digit3") setTime("night");
      if (e.code === "Tab") {
        e.preventDefault();
        setMenu((v) => !v);
      }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);

  const showWelcome = ready && !started;
  const hudOn = ready && started;

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black text-white select-none" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div ref={mount} className="absolute inset-0" />

      {/* vignette + crosshair */}
      {hudOn && (
        <>
          <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.38) 100%)" }} />
          <div className="pointer-events-none absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/70 ring-1 ring-black/30" />
        </>
      )}
      <div className={`pointer-events-none absolute inset-0 bg-black transition-opacity duration-300 ${fade ? "opacity-100" : "opacity-0"}`} />

      {/* loading */}
      {!ready && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-gradient-to-b from-[#0d2a22] via-[#123b30] to-[#0a1d18]">
          <div className="mb-2 text-xs uppercase tracking-[0.35em] text-emerald-300/70">Rotterdam · 1857</div>
          <h1 className="text-center text-4xl font-semibold tracking-tight md:text-6xl" style={{ fontFamily: "Georgia, serif" }}>
            Diergaarde Blijdorp
          </h1>
          <p className="mt-3 max-w-md text-center text-sm text-emerald-100/70">A walkable 1:1 scale reconstruction of the whole zoo</p>
          {err ? (
            <p className="mt-8 max-w-md rounded-lg bg-red-900/50 p-4 text-sm">WebGL could not start: {err}</p>
          ) : (
            <>
              <div className="mt-10 h-1.5 w-72 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-gradient-to-r from-emerald-300 to-amber-200 transition-all duration-300" style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
              <div className="mt-3 text-xs text-emerald-100/60">{label}</div>
            </>
          )}
        </div>
      )}

      {/* welcome */}
      {showWelcome && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
          <div className="max-h-full w-full max-w-3xl overflow-auto rounded-3xl border border-white/10 bg-[#0f2a22]/95 p-6 shadow-2xl md:p-9">
            <div className="text-xs uppercase tracking-[0.3em] text-emerald-300/70">Explore on foot</div>
            <h2 className="mt-1 text-3xl font-semibold md:text-4xl" style={{ fontFamily: "Georgia, serif" }}>
              Welcome to Diergaarde Blijdorp
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-emerald-50/80">
              Walk the grounds at human scale: from the 1940 city entrance and the Rivièrahal across the pond, through Africa's savanna and Taman Indah's elephants,
              under the railway to the Oceanium shark tunnel, the Amazonica butterfly house and Arctica. Every enclosure is populated.
            </p>
            <div className="mt-5 grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
              {[
                ["W A S D", "walk"],
                ["Shift", "run"],
                ["Mouse", "look (click to capture)"],
                ["F", "fly mode"],
                ["1 · 2 · 3", "day / golden / night"],
                ["M", "big map"],
                ["Tab", "destinations"],
                ["T", "guided tour"],
              ].map(([k, v]) => (
                <div key={k} className="rounded-xl bg-white/5 px-3 py-2">
                  <div className="font-mono text-xs text-amber-200">{k}</div>
                  <div className="text-xs text-white/70">{v}</div>
                </div>
              ))}
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button onClick={enter} className="rounded-full bg-gradient-to-r from-emerald-400 to-amber-300 px-7 py-3 text-sm font-semibold text-emerald-950 shadow-lg shadow-emerald-900/40 transition hover:scale-105">
                Enter the zoo
              </button>
              <button
                onClick={() => {
                  setStarted(true);
                  setTimeout(() => w.current?.startTour(), 100);
                }}
                className="rounded-full border border-white/20 px-6 py-3 text-sm font-medium text-white/90 transition hover:bg-white/10"
              >
                ▶ Take the guided tour
              </button>
            </div>
            <p className="mt-5 text-[11px] leading-relaxed text-white/40">
              Textures: Poly Haven (CC0). Flying birds: three.js example models. Animals, buildings, and layout are procedural reconstructions inspired by the real park and are simplified in places.
            </p>
          </div>
        </div>
      )}

      {/* HUD */}
      {hudOn && (
        <>
          {/* top-left: location */}
          <div className="pointer-events-none absolute left-4 top-4 z-20 max-w-[60vw]">
            <div className="text-[10px] uppercase tracking-[0.3em] text-white/60">Diergaarde Blijdorp</div>
            <div className="mt-1 flex items-center gap-2 rounded-full bg-black/45 px-4 py-2 text-sm font-medium backdrop-blur-md">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: zone.color }} />
              {zone.name}
              {zone.kind === "interior" && <span className="rounded bg-white/15 px-1.5 text-[10px] uppercase tracking-wide">inside</span>}
            </div>
          </div>

          {/* top-right: controls */}
          <div className="absolute right-4 top-4 z-30 flex flex-wrap justify-end gap-2">
            <div className="flex overflow-hidden rounded-full bg-black/45 backdrop-blur-md">
              {TIMES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => changeTime(t.id)}
                  title={t.label}
                  className={`px-3 py-2 text-sm transition ${time === t.id ? "bg-white/90 text-black" : "text-white/80 hover:bg-white/10"}`}
                >
                  {t.icon}
                </button>
              ))}
            </div>
            <button onClick={toggleMode} className="rounded-full bg-black/45 px-4 py-2 text-xs font-medium backdrop-blur-md hover:bg-black/65">
              {mode === "walk" ? "🚶 Walking" : "🕊 Flying"}
            </button>
            <button onClick={toggleTour} className={`rounded-full px-4 py-2 text-xs font-medium backdrop-blur-md ${tour ? "bg-amber-300 text-black" : "bg-black/45 hover:bg-black/65"}`}>
              {tour ? "■ Stop tour" : "▶ Tour"}
            </button>
            <button onClick={() => setMenu((v) => !v)} className="rounded-full bg-black/45 px-4 py-2 text-xs font-medium backdrop-blur-md hover:bg-black/65">
              ☰ Destinations
            </button>
            <button onClick={toggleQuality} title="Shadow resolution / pixel ratio" className="rounded-full bg-black/45 px-3 py-2 text-xs backdrop-blur-md hover:bg-black/65">
              {quality === "high" ? "HQ" : "SQ"} · {fps} fps
            </button>
          </div>

          {/* minimap */}
          <div className="absolute bottom-4 left-4 z-30">
            <div className="overflow-hidden rounded-2xl border border-white/20 bg-black/40 shadow-xl backdrop-blur-md">
              <canvas ref={mini} width={MW} height={MH} onClick={clickMap} className="block cursor-crosshair" style={{ width: MW, height: MH }} />
              <div className="flex justify-between px-2 py-1 text-[10px] text-white/60">
                <span>click to teleport</span>
                <button onClick={() => setBigMap((v) => !v)} className="hover:text-white">
                  M · {bigMap ? "shrink" : "enlarge"}
                </button>
              </div>
            </div>
          </div>

          {/* animal card */}
          {target && !tour && (
            <div className="pointer-events-none absolute bottom-6 left-1/2 z-20 w-[min(92vw,30rem)] -translate-x-1/2 rounded-2xl border border-white/15 bg-black/60 p-4 shadow-2xl backdrop-blur-md">
              <div className="flex items-baseline justify-between gap-3">
                <div className="text-lg font-semibold">{target.info.en}</div>
                <div className="text-xs text-white/50">{Math.round(target.dist)} m</div>
              </div>
              <div className="text-xs text-amber-200">
                {target.info.nl} · <i>{target.info.latin}</i>
              </div>
              <p className="mt-2 text-[13px] leading-snug text-white/80">{target.info.fact}</p>
            </div>
          )}

          {/* tour caption */}
          {tour?.poi && (
            <div className="absolute bottom-6 left-1/2 z-20 w-[min(92vw,34rem)] -translate-x-1/2 rounded-2xl border border-amber-200/30 bg-black/65 p-4 shadow-2xl backdrop-blur-md">
              <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.25em] text-amber-200/80">
                <span>Guided tour</span>
                <span>
                  {tour.i + 1} / {tour.n}
                </span>
              </div>
              <div className="mt-1 text-lg font-semibold">{tour.poi.name}</div>
              <p className="mt-1 text-[13px] leading-snug text-white/80">{tour.poi.blurb}</p>
            </div>
          )}

          {/* pause hint */}
          {!locked && !tour && !menu && (
            <div className="pointer-events-none absolute left-1/2 top-16 z-20 -translate-x-1/2 rounded-full bg-black/55 px-4 py-1.5 text-xs text-white/80 backdrop-blur">
              Click the scene to capture the mouse · WASD to walk · Esc to release
            </div>
          )}

          {/* destinations panel */}
          {menu && (
            <div className="absolute right-4 top-16 z-40 max-h-[75vh] w-80 overflow-auto rounded-2xl border border-white/15 bg-[#0d1f1a]/95 p-3 shadow-2xl backdrop-blur-md">
              <div className="mb-2 flex items-center justify-between px-1">
                <div className="text-sm font-semibold">Destinations</div>
                <button onClick={() => setMenu(false)} className="text-white/60 hover:text-white">
                  ✕
                </button>
              </div>
              <div className="space-y-1">
                {pois.map((p) => (
                  <button key={p.id} onClick={() => goPoi(p)} className="block w-full rounded-xl px-3 py-2 text-left transition hover:bg-white/10">
                    <div className="text-sm font-medium">{p.name}</div>
                    <div className="line-clamp-2 text-[11px] text-white/55">{p.blurb}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Experience, type ExpState, type Label, type TimeName, type Weather, type Quality } from './campus/Experience'
import { POIS, type Poi } from './campus/pois'
import MiniMap from './components/MiniMap'

const TIMES: { id: TimeName; label: string; icon: string }[] = [
  { id: 'sunrise', label: 'Sunrise', icon: '🌅' },
  { id: 'morning', label: 'Morning', icon: '🌤️' },
  { id: 'noon', label: 'Noon', icon: '☀️' },
  { id: 'golden', label: 'Golden hour', icon: '🌇' },
  { id: 'dusk', label: 'Dusk', icon: '🌆' },
  { id: 'night', label: 'Night', icon: '🌙' },
]
const WEATHERS: { id: Weather; label: string; icon: string }[] = [
  { id: 'clear', label: 'Clear', icon: '☀️' },
  { id: 'partly', label: 'Partly cloudy', icon: '⛅' },
  { id: 'overcast', label: 'Overcast', icon: '☁️' },
]

const INITIAL: ExpState = {
  x: 0, y: 0, z: 0, yaw: 0, phase: 'loading', mode: 'walk', tour: false, tourIdx: -1, fps: 60, locked: false,
  quality: 'high', time: 'morning', weather: 'partly', joy: null,
}

const Glass = ({ className = '', children }: { className?: string; children: React.ReactNode }) => (
  <div className={`pointer-events-auto rounded-2xl border border-white/10 bg-slate-950/65 backdrop-blur-xl shadow-xl shadow-black/40 ${className}`}>{children}</div>
)

function Key({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded-md border border-white/20 bg-white/10 px-1.5 py-0.5 font-mono text-[10px] text-white/90">{children}</kbd>
}

export default function App() {
  const host = useRef<HTMLDivElement>(null)
  const exp = useRef<Experience | null>(null)
  const [progress, setProgress] = useState({ p: 0, label: 'Starting' })
  const [st, setSt] = useState<ExpState>(INITIAL)
  const [nearby, setNearby] = useState<Poi | null>(null)
  const [selected, setSelected] = useState<Poi | null>(null)
  const [labels, setLabels] = useState<Label[]>([])
  const [views, setViews] = useState<Map<string, { cx: number; cz: number }> | null>(null)
  const [dirOpen, setDirOpen] = useState(true)
  const [bigMap, setBigMap] = useState(false)
  const [showLabels, setShowLabels] = useState(true)
  const [hud, setHud] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [panel, setPanel] = useState<'env' | null>(null)
  const [filter, setFilter] = useState('')

  useEffect(() => {
    if (!host.current) return
    const e = new Experience(host.current, {
      onProgress: (p, label) => setProgress({ p, label }),
      onState: (s) => setSt(s),
      onPoi: (p) => setNearby(p),
      onLabels: (l) => setLabels(l),
    })
    exp.current = e
    ;(window as unknown as { __exp?: Experience }).__exp = e
    e.init()
      .then(() => setViews(new Map([...e.getViews()].map(([k, v]) => [k, { cx: v.cx, cz: v.cz }]))))
      .catch((err) => { console.error(err); setError(String(err?.message ?? err)) })
    return () => { e.dispose(); exp.current = null }
  }, [])

  useEffect(() => {
    const k = (ev: KeyboardEvent) => {
      const t = ev.target as HTMLElement
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return
      if (ev.code === 'KeyM') setBigMap((v) => !v)
      if (ev.code === 'KeyH') setHud((v) => !v)
      if (ev.code === 'KeyL') exp.current?.requestLock()
      if (ev.code === 'KeyT') { if (exp.current) { if (st.tour) exp.current.stopTour(); else exp.current.startTour() } }
      if (ev.code === 'KeyB') setDirOpen((v) => !v)
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [st.tour])

  const go = useCallback((p: Poi, id?: string) => {
    setSelected(p)
    exp.current?.stopTour()
    exp.current?.goTo(id ?? p.id, 3.6)
  }, [])

  const loading = st.phase === 'loading'
  const attract = st.phase === 'attract'
  const focus = nearby ?? (st.phase === 'play' || st.phase === 'flight' ? selected : null)

  const grouped = useMemo(() => {
    const f = filter.trim().toLowerCase()
    const m = (p: Poi) => !f || (p.name + ' ' + p.sub + ' ' + (p.abbr ?? '') + ' ' + p.ref).toLowerCase().includes(f)
    return {
      faculty: POIS.filter((p) => p.kind === 'faculty' && m(p)),
      landmark: POIS.filter((p) => p.kind === 'landmark' && m(p)),
      facility: POIS.filter((p) => p.kind === 'facility' && m(p)),
    }
  }, [filter])

  const Row = ({ p }: { p: Poi }) => (
    <button
      onClick={() => go(p)}
      className={`group flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition hover:bg-white/10 ${focus?.id === p.id ? 'bg-white/10' : ''}`}
    >
      <span className="h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-white/20" style={{ background: p.color }} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] font-medium text-white">{p.abbr ? <b className="mr-1.5 text-cyan-300">{p.abbr}</b> : null}{p.name}</span>
        <span className="block truncate text-[10.5px] text-white/50">{p.sub}</span>
      </span>
      <span className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 font-mono text-[10px] text-white/60 group-hover:text-white">{p.ref}</span>
    </button>
  )

  return (
    <div className="fixed inset-0 overflow-hidden bg-slate-950 text-white select-none" style={{ fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif' }}>
      <div ref={host} className="absolute inset-0" />

      {/* floating building labels */}
      {hud && showLabels && (st.phase === 'play' || st.phase === 'flight') && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {labels.slice(0, 22).map((l) => (
            <div
              key={l.id}
              className="absolute -translate-x-1/2 -translate-y-full whitespace-nowrap"
              style={{ left: l.x, top: l.y, opacity: Math.max(0.0, Math.min(1, 1.25 - l.d / 700)), transform: `translate(-50%,-100%) scale(${Math.max(0.7, Math.min(1.1, 1.2 - l.d / 900))})` }}
            >
              <div className="flex items-center gap-1.5 rounded-full border border-white/20 bg-slate-950/70 px-2.5 py-1 text-[11px] font-semibold shadow-lg backdrop-blur">
                <span className="h-2 w-2 rounded-full" style={{ background: l.color }} />
                {l.name}
                <span className="font-mono text-[9px] text-white/50">{l.ref}</span>
              </div>
              <div className="mx-auto h-4 w-px bg-white/40" />
            </div>
          ))}
        </div>
      )}

      {/* crosshair */}
      {!loading && !attract && st.mode === 'walk' && (
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/50" />
      )}

      {/* loading */}
      {loading && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[radial-gradient(ellipse_at_center,#0d2230,#05080c)]">
          <div className="mb-8 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-500 text-xl font-black text-slate-950 shadow-lg shadow-cyan-500/30">TU</div>
            <div>
              <div className="text-2xl font-semibold tracking-tight">TU Delft Campus</div>
              <div className="text-[11px] uppercase tracking-[0.3em] text-cyan-300/80">Explorable 3D · Delft, NL</div>
            </div>
          </div>
          {error ? (
            <div className="max-w-md rounded-xl border border-red-400/30 bg-red-950/40 p-4 text-sm text-red-200">
              The 3D engine could not start (WebGL 2 is required).<br /><span className="text-xs opacity-70">{error}</span>
            </div>
          ) : (
            <>
              <div className="h-1.5 w-72 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-sky-500 transition-all duration-300" style={{ width: `${Math.round(progress.p * 100)}%` }} />
              </div>
              <div className="mt-3 text-xs text-white/60">{progress.label}…</div>
            </>
          )}
        </div>
      )}

      {/* attract screen */}
      {attract && (
        <div className="pointer-events-none absolute inset-0 z-40 flex flex-col justify-between bg-gradient-to-b from-black/50 via-transparent to-black/70 p-6 sm:p-10">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-500 text-lg font-black text-slate-950">TU</div>
            <div className="text-[11px] uppercase tracking-[0.3em] text-white/70">Netherlands Landmark Exhibition<br /><span className="text-cyan-300">Individual monument · Delft</span></div>
          </div>
          <div className="max-w-2xl">
            <h1 className="text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">Walk the<br />TU Delft campus.</h1>
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-white/75 sm:text-base">
              Built on real OpenStreetMap footprints, heights and building numbers: all eight faculties, the grass-roofed Library, the Aula, the 90&nbsp;m EEMCS tower and
              roughly 3,700 surrounding buildings, canals and streets. Explore on foot or fly.
            </p>
            <div className="pointer-events-auto mt-7 flex flex-wrap items-center gap-3">
              <button onClick={() => exp.current?.enter()} className="rounded-full bg-cyan-400 px-7 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-cyan-500/30 transition hover:scale-[1.03] hover:bg-cyan-300">
                Enter the campus →
              </button>
              <span className="text-xs text-white/55">8 faculties · 20 landmarks · day, dusk &amp; night</span>
            </div>
          </div>
        </div>
      )}

      {/* HUD */}
      {!loading && !attract && hud && (
        <div className="pointer-events-none absolute inset-0 z-30">
          {/* top left: title + env */}
          <div className="absolute left-3 top-3 flex flex-col gap-2 sm:left-4 sm:top-4">
            <Glass className="flex items-center gap-3 px-3.5 py-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500 text-sm font-black text-slate-950">TU</div>
              <div className="leading-tight">
                <div className="text-sm font-semibold">TU Delft Campus</div>
                <div className="text-[10px] uppercase tracking-widest text-white/50">{st.phase === 'flight' ? 'Flying…' : st.mode === 'fly' ? 'Fly mode' : 'Walking'}{st.tour ? ' · Guided tour' : ''}</div>
              </div>
            </Glass>
            <div className="flex gap-2">
              <Glass className="flex p-1">
                <button onClick={() => (st.tour ? exp.current?.stopTour() : exp.current?.startTour())} className={`rounded-xl px-3 py-1.5 text-xs font-medium transition ${st.tour ? 'bg-cyan-400 text-slate-950' : 'hover:bg-white/10'}`}>
                  {st.tour ? '■ Stop tour' : '▶ Guided tour'}
                </button>
                <button onClick={() => exp.current?.setMode(st.mode === 'walk' ? 'fly' : 'walk')} className="rounded-xl px-3 py-1.5 text-xs font-medium transition hover:bg-white/10">
                  {st.mode === 'walk' ? '🕊 Fly' : '🚶 Walk'}
                </button>
                <button onClick={() => setPanel(panel === 'env' ? null : 'env')} className={`rounded-xl px-3 py-1.5 text-xs font-medium transition ${panel === 'env' ? 'bg-white/15' : 'hover:bg-white/10'}`}>
                  🌦 Sky
                </button>
              </Glass>
            </div>
            {panel === 'env' && (
              <Glass className="w-64 p-3">
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-white/50">Time of day</div>
                <div className="grid grid-cols-3 gap-1.5">
                  {TIMES.map((t) => (
                    <button key={t.id} onClick={() => exp.current?.setTime(t.id)} className={`rounded-lg px-1.5 py-2 text-[11px] transition ${st.time === t.id ? 'bg-cyan-400 font-semibold text-slate-950' : 'bg-white/5 hover:bg-white/10'}`}>
                      <div className="text-base leading-none">{t.icon}</div>{t.label}
                    </button>
                  ))}
                </div>
                <div className="mb-1.5 mt-3 text-[10px] font-semibold uppercase tracking-widest text-white/50">Weather</div>
                <div className="grid grid-cols-3 gap-1.5">
                  {WEATHERS.map((t) => (
                    <button key={t.id} onClick={() => exp.current?.setWeather(t.id)} className={`rounded-lg px-1.5 py-2 text-[11px] transition ${st.weather === t.id ? 'bg-cyan-400 font-semibold text-slate-950' : 'bg-white/5 hover:bg-white/10'}`}>
                      <div className="text-base leading-none">{t.icon}</div>{t.label}
                    </button>
                  ))}
                </div>
                <div className="mb-1.5 mt-3 text-[10px] font-semibold uppercase tracking-widest text-white/50">Graphics</div>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['high', 'medium', 'low'] as Quality[]).map((q) => (
                    <button key={q} onClick={() => exp.current?.setQuality(q)} className={`rounded-lg px-1.5 py-1.5 text-[11px] capitalize transition ${st.quality === q ? 'bg-cyan-400 font-semibold text-slate-950' : 'bg-white/5 hover:bg-white/10'}`}>{q}</button>
                  ))}
                </div>
                <label className="mt-3 flex cursor-pointer items-center justify-between rounded-lg bg-white/5 px-2.5 py-2 text-[11px]">
                  Building labels
                  <input type="checkbox" checked={showLabels} onChange={(e) => { setShowLabels(e.target.checked); exp.current?.setLabels(e.target.checked) }} className="accent-cyan-400" />
                </label>
              </Glass>
            )}
          </div>

          {/* top right: minimap + directory */}
          <div className="absolute right-3 top-3 flex flex-col items-end gap-2 sm:right-4 sm:top-4">
            <div className="pointer-events-auto relative">
              <MiniMap x={st.x} z={st.z} yaw={st.yaw} phase={st.phase} large={bigMap} views={views} onPick={(x, z) => exp.current?.goToXZ(x, z)} />
              <button onClick={() => setBigMap((v) => !v)} className="absolute bottom-1.5 right-1.5 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] text-white/80 hover:bg-black/80">{bigMap ? '–' : '⤢'} M</button>
            </div>
            <Glass className="w-72 overflow-hidden">
              <button onClick={() => setDirOpen((v) => !v)} className="flex w-full items-center justify-between px-3.5 py-2.5 text-left">
                <span className="text-sm font-semibold">Campus directory</span>
                <span className="text-xs text-white/50">{dirOpen ? '▾' : '▸'} B</span>
              </button>
              {dirOpen && (
                <div className="max-h-[46vh] overflow-y-auto border-t border-white/10 px-1.5 pb-2 pt-1.5 [scrollbar-width:thin]">
                  <input
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    placeholder="Search building, faculty, number…"
                    className="mx-1 mb-1.5 w-[calc(100%-0.5rem)] rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs outline-none placeholder:text-white/35 focus:border-cyan-400/60"
                  />
                  {grouped.faculty.length > 0 && <div className="px-2 pb-0.5 pt-1 text-[10px] font-semibold uppercase tracking-widest text-cyan-300/80">Faculties</div>}
                  {grouped.faculty.map((p) => <Row key={p.id} p={p} />)}
                  {grouped.landmark.length > 0 && <div className="px-2 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-widest text-amber-300/80">Landmarks</div>}
                  {grouped.landmark.map((p) => <Row key={p.id} p={p} />)}
                  {!filter && (
                    <button onClick={() => go(POIS[0], 'library-roof')} className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-white/10">
                      <span className="text-sm">🌱</span>
                      <span className="text-[12.5px] font-medium">Stand on the Library’s grass roof</span>
                    </button>
                  )}
                  {grouped.facility.length > 0 && <div className="px-2 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-widest text-emerald-300/80">Facilities</div>}
                  {grouped.facility.map((p) => <Row key={p.id} p={p} />)}
                </div>
              )}
            </Glass>
          </div>

          {/* info card */}
          {focus && (
            <div className="absolute bottom-20 left-3 w-[min(24rem,calc(100vw-1.5rem))] sm:bottom-6 sm:left-4">
              <Glass className="overflow-hidden">
                <div className="h-1" style={{ background: focus.color }} />
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: focus.color }}>
                        {focus.kind === 'faculty' ? 'Faculty' : focus.kind === 'landmark' ? 'Landmark' : 'Campus facility'}
                        {focus.abbr ? ` · ${focus.abbr}` : ''}
                      </div>
                      <h2 className="mt-0.5 text-lg font-semibold leading-tight">{focus.name}</h2>
                      <div className="text-xs text-white/55">{focus.sub}</div>
                    </div>
                    <div className="shrink-0 rounded-lg border border-white/15 bg-white/5 px-2 py-1 text-center">
                      <div className="text-[8px] uppercase tracking-wider text-white/45">Building</div>
                      <div className="font-mono text-sm font-bold">{focus.ref}</div>
                    </div>
                  </div>
                  <p className="mt-2.5 text-[12.5px] leading-relaxed text-white/80">{focus.blurb}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {focus.address && <span className="rounded-md bg-white/8 px-2 py-1 text-[10.5px] text-white/75 ring-1 ring-white/10">📍 {focus.address}</span>}
                    {focus.year && <span className="rounded-md bg-white/8 px-2 py-1 text-[10.5px] text-white/75 ring-1 ring-white/10">🗓 {focus.year}</span>}
                    {focus.arch && <span className="rounded-md bg-white/8 px-2 py-1 text-[10.5px] text-white/75 ring-1 ring-white/10">✎ {focus.arch}</span>}
                    {focus.facts.map(([a, b]) => (
                      <span key={a} className="rounded-md bg-white/8 px-2 py-1 text-[10.5px] ring-1 ring-white/10"><span className="text-white/45">{a}: </span><span className="font-medium text-white/90">{b}</span></span>
                    ))}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button onClick={() => go(focus)} className="rounded-lg bg-cyan-400 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-cyan-300">Fly here</button>
                    {focus.id === 'library' && <button onClick={() => go(focus, 'library-roof')} className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium hover:bg-white/15">Walk on the roof</button>}
                    <button onClick={() => { setSelected(null) }} className="rounded-lg px-3 py-1.5 text-xs text-white/60 hover:bg-white/10">Dismiss</button>
                  </div>
                </div>
              </Glass>
            </div>
          )}

          {/* bottom bar */}
          <div className="absolute bottom-3 left-1/2 hidden -translate-x-1/2 sm:block">
            <Glass className="flex items-center gap-4 px-4 py-2 text-[11px] text-white/70">
              <span><Key>W</Key><Key>A</Key><Key>S</Key><Key>D</Key> move</span>
              <span><Key>Shift</Key> run</span>
              <span><Key>Space</Key> jump</span>
              <span>drag / <Key>L</Key> look</span>
              <span><Key>F</Key> fly</span>
              <span><Key>T</Key> tour</span>
              <span><Key>M</Key> map</span>
              <span><Key>H</Key> hide UI</span>
            </Glass>
          </div>
          <div className="absolute bottom-3 right-4 hidden text-right text-[9px] leading-tight text-white/45 sm:block">
            Footprints, heights &amp; building numbers © OpenStreetMap contributors (ODbL) · {st.fps} fps
          </div>

          {/* touch joystick */}
          {st.joy && (
            <div className="absolute bottom-24 left-10 h-24 w-24 rounded-full border border-white/25 bg-white/5">
              <div className="absolute left-1/2 top-1/2 h-10 w-10 rounded-full bg-white/40" style={{ transform: `translate(calc(-50% + ${Math.max(-40, Math.min(40, st.joy.x))}px), calc(-50% + ${Math.max(-40, Math.min(40, st.joy.y))}px))` }} />
            </div>
          )}
        </div>
      )}

      {!loading && !attract && !hud && (
        <button onClick={() => setHud(true)} className="absolute right-4 top-4 z-30 rounded-full bg-black/50 px-3 py-1.5 text-xs text-white/80 hover:bg-black/70">Show UI (H)</button>
      )}
    </div>
  )
}

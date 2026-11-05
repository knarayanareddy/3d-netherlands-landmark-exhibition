import { useCallback, useEffect, useRef, useState } from 'react'
import { CubeExperience, Mode, Prompt, Quality, TimeOfDay } from './cube/engine'
import { KEY_FACTS, LEVEL_NAMES, POI, POIS } from './cube/data'

const TIMES: { id: TimeOfDay; label: string; icon: React.ReactNode }[] = [
  {
    id: 'day',
    label: 'Day',
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    ),
  },
  {
    id: 'golden',
    label: 'Golden hour',
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M17 18a5 5 0 0 0-10 0M12 9V2M4.2 10.2l1.4 1.4M1 18h2M21 18h2M18.4 11.6l1.4-1.4M23 22H1M8 6l4-4 4 4" />
      </svg>
    ),
  },
  {
    id: 'night',
    label: 'Night',
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
      </svg>
    ),
  },
]

const Key = ({ children }: { children: React.ReactNode }) => <span className="kbd">{children}</span>

export default function App() {
  const hostRef = useRef<HTMLDivElement>(null)
  const engRef = useRef<CubeExperience | null>(null)
  const [phase, setPhase] = useState<'loading' | 'start' | 'running'>('loading')
  const [progress, setProgress] = useState(0)
  const [label, setLabel] = useState('Starting')
  const [mode, setMode] = useState<Mode>('walk')
  const [level, setLevel] = useState(0)
  const [prompt, setPrompt] = useState<Prompt | null>(null)
  const [poi, setPoi] = useState<POI | null>(null)
  const [time, setTime] = useState<TimeOfDay>('day')
  const [quality, setQuality] = useState<Quality>('high')
  const [locked, setLocked] = useState(false)
  const [help, setHelp] = useState(false)
  const [about, setAbout] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let eng: CubeExperience | null = null
    let dead = false
    try {
      eng = new CubeExperience(host, {
        onProgress: (p, l) => {
          if (dead) return
          setProgress(p)
          setLabel(l)
        },
        onPrompt: setPrompt,
        onLevel: (l) => setLevel(l),
        onMode: setMode,
        onPOI: (id) => setPoi(id ? (POIS.find((p) => p.id === id) ?? null) : null),
        onLock: setLocked,
        onQuality: setQuality,
      })
      engRef.current = eng
      ;(window as any).__cube = eng
      eng
        .init()
        .then(() => {
          if (!dead) setPhase('start')
        })
        .catch((e) => {
          console.error(e)
          if (!dead) setError(String(e?.message ?? e))
        })
    } catch (e: any) {
      console.error(e)
      setError(String(e?.message ?? e))
    }
    return () => {
      dead = true
      eng?.dispose()
      engRef.current = null
    }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'KeyH') setHelp((h) => !h)
      if (e.code === 'Escape') {
        setPoi(null)
        setHelp(false)
      }
      if (e.code === 'Digit1') pickTime('day')
      if (e.code === 'Digit2') pickTime('golden')
      if (e.code === 'Digit3') pickTime('night')
      if (e.code === 'KeyO') engRef.current && phase === 'running' && pickMode(mode === 'walk' ? 'orbit' : 'walk')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const begin = useCallback((m: Mode) => {
    engRef.current?.start(m)
    setPhase('running')
  }, [])

  const pickTime = (t: TimeOfDay) => {
    setTime(t)
    engRef.current?.setTime(t)
  }
  const pickMode = (m: Mode) => {
    engRef.current?.setMode(m)
  }
  const pickQuality = (q: Quality) => {
    setQuality(q)
    engRef.current?.setQuality(q)
  }
  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen()
    else document.documentElement.requestFullscreen?.()
  }
  const closePoi = () => {
    setPoi(null)
    engRef.current?.closePOI()
  }

  const running = phase === 'running'

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#0b1118] text-white select-none">
      <div ref={hostRef} className="absolute inset-0" />

      {/* crosshair */}
      {running && mode === 'walk' && locked && !prompt?.up && (
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/80 shadow" />
      )}

      {/* HUD */}
      {running && (
        <>
          <div className="pointer-events-none absolute left-5 top-5 fade-up">
            <div className="serif text-2xl font-semibold leading-none tracking-tight drop-shadow-lg">Kubuswoningen</div>
            <div className="mt-1.5 text-[11px] font-medium uppercase tracking-[0.22em] text-white/75 drop-shadow">Rotterdam · Piet Blom · 1984</div>
            {mode === 'walk' && (
              <div className="glass pointer-events-auto mt-3 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium">
                <span className="h-2 w-2 rounded-full bg-amber-300" />
                {LEVEL_NAMES[level]}
              </div>
            )}
          </div>

          <div className="absolute right-5 top-5 flex flex-wrap items-center justify-end gap-2 fade-up">
            <div className="glass flex rounded-full p-1">
              {(['walk', 'orbit'] as Mode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => pickMode(m)}
                  className={`rounded-full px-3.5 py-1.5 text-xs font-semibold capitalize transition ${mode === m ? 'bg-white text-slate-900' : 'text-white/80 hover:text-white'}`}
                >
                  {m === 'walk' ? 'Explore on foot' : 'Aerial orbit'}
                </button>
              ))}
            </div>
            <div className="glass flex rounded-full p-1">
              {TIMES.map((t) => (
                <button
                  key={t.id}
                  title={t.label}
                  onClick={() => pickTime(t.id)}
                  className={`grid h-8 w-8 place-items-center rounded-full transition ${time === t.id ? 'bg-amber-300 text-slate-900' : 'text-white/80 hover:text-white'}`}
                >
                  {t.icon}
                </button>
              ))}
            </div>
            <select
              value={quality}
              onChange={(e) => pickQuality(e.target.value as Quality)}
              className="glass rounded-full bg-transparent px-3 py-2 text-xs font-semibold outline-none"
              title="Graphics quality"
            >
              <option className="text-black" value="high">Quality: High</option>
              <option className="text-black" value="medium">Quality: Medium</option>
              <option className="text-black" value="low">Quality: Low</option>
            </select>
            <button onClick={() => setAbout((a) => !a)} className="glass grid h-9 w-9 place-items-center rounded-full text-sm font-bold" title="About the monument">
              i
            </button>
            <button onClick={() => setHelp((h) => !h)} className="glass grid h-9 w-9 place-items-center rounded-full text-sm font-bold" title="Controls (H)">
              ?
            </button>
            <button onClick={toggleFullscreen} className="glass grid h-9 w-9 place-items-center rounded-full" title="Fullscreen">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3" />
              </svg>
            </button>
          </div>

          {/* level selector */}
          {mode === 'walk' && (
            <div className="absolute left-5 top-1/2 -translate-y-1/2 fade-up">
              <div className="glass flex flex-col gap-1 rounded-2xl p-1.5">
                <div className="px-2 pb-1 pt-1 text-[9px] font-semibold uppercase tracking-[0.2em] text-white/60">Kijk-Kubus</div>
                {[3, 2, 1, 0].map((l) => (
                  <button
                    key={l}
                    onClick={() => engRef.current?.visitLevel(l)}
                    className={`flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-left text-xs font-semibold transition ${level === l ? 'bg-amber-300 text-slate-900' : 'text-white/85 hover:bg-white/10'}`}
                  >
                    <span className={`grid h-5 w-5 place-items-center rounded-md text-[10px] font-bold ${level === l ? 'bg-slate-900/15' : 'bg-white/10'}`}>{l === 0 ? 'G' : l}</span>
                    <span className="hidden sm:inline">{['Hall', 'Kitchen & living', 'Bedrooms', 'Loft'][l]}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* prompt */}
          {mode === 'walk' && prompt && (
            <div className="absolute bottom-24 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2 fade-up">
              {prompt.hint && !prompt.up && !prompt.down && <div className="glass rounded-full px-4 py-2 text-xs font-medium">{prompt.hint}</div>}
              <div className="flex gap-2">
                {prompt.up && (
                  <button onClick={() => engRef.current?.stairs(1)} className="glass flex items-center gap-2.5 rounded-full px-4 py-2.5 text-sm font-semibold hover:bg-white/15">
                    <Key>E</Key> {prompt.up} ▲
                  </button>
                )}
                {prompt.down && (
                  <button onClick={() => engRef.current?.stairs(-1)} className="glass flex items-center gap-2.5 rounded-full px-4 py-2.5 text-sm font-semibold hover:bg-white/15">
                    <Key>Q</Key> {prompt.down} ▼
                  </button>
                )}
              </div>
            </div>
          )}

          {/* bottom hint bar */}
          <div className="pointer-events-none absolute bottom-5 left-1/2 -translate-x-1/2 fade-up">
            <div className="glass flex items-center gap-4 rounded-full px-5 py-2 text-[11px] font-medium text-white/85">
              {mode === 'walk' ? (
                <>
                  <span className="flex items-center gap-1.5"><Key>W</Key><Key>A</Key><Key>S</Key><Key>D</Key> move</span>
                  <span className="hidden items-center gap-1.5 sm:flex">{locked ? <><Key>Esc</Key> release mouse</> : 'Click & drag to look'}</span>
                  <span className="hidden items-center gap-1.5 sm:flex"><Key>Shift</Key> run</span>
                  <span className="flex items-center gap-1.5"><Key>E</Key>/<Key>Q</Key> stairs</span>
                </>
              ) : (
                <span>Drag to orbit · scroll to zoom · right-drag to pan · click the markers</span>
              )}
            </div>
          </div>
        </>
      )}

      {/* POI card */}
      {running && poi && (
        <div className="glass absolute bottom-20 right-5 top-24 z-10 flex w-[22rem] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-2xl fade-up sm:top-auto sm:max-h-[26rem]">
          <div className="flex items-start justify-between gap-3 p-5 pb-3">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-amber-300">{poi.subtitle}</div>
              <h2 className="serif mt-1 text-2xl font-semibold leading-tight">{poi.title}</h2>
            </div>
            <button onClick={closePoi} className="grid h-8 w-8 flex-none place-items-center rounded-full bg-white/10 hover:bg-white/20" aria-label="Close">
              ✕
            </button>
          </div>
          <div className="overflow-y-auto px-5 pb-5 text-sm leading-relaxed text-white/85">
            <p>{poi.body}</p>
            {poi.facts && (
              <dl className="mt-4 grid grid-cols-2 gap-2">
                {poi.facts.map(([k, v]) => (
                  <div key={k} className="rounded-xl bg-white/8 p-2.5">
                    <dt className="text-[10px] uppercase tracking-wider text-white/55">{k}</dt>
                    <dd className="mt-0.5 text-xs font-semibold">{v}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        </div>
      )}

      {/* About panel */}
      {running && about && (
        <div className="glass absolute right-5 top-20 z-10 w-80 rounded-2xl p-5 fade-up">
          <div className="flex items-center justify-between">
            <h3 className="serif text-xl font-semibold">The monument</h3>
            <button onClick={() => setAbout(false)} className="grid h-7 w-7 place-items-center rounded-full bg-white/10 text-xs hover:bg-white/20">✕</button>
          </div>
          <dl className="mt-3 divide-y divide-white/10 text-sm">
            {KEY_FACTS.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 py-2">
                <dt className="text-white/60">{k}</dt>
                <dd className="text-right font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-[11px] leading-relaxed text-white/55">
            Tip: enter the open door of the highlighted cube (the Kijk-Kubus), walk to the spiral stair and press <b>E</b>. Furnishings and room layouts are an interpretive reconstruction.
          </p>
        </div>
      )}

      {/* Help */}
      {help && running && (
        <div className="absolute inset-0 z-20 grid place-items-center bg-black/50 backdrop-blur-sm" onClick={() => setHelp(false)}>
          <div className="glass w-[26rem] max-w-[92vw] rounded-3xl p-7" onClick={(e) => e.stopPropagation()}>
            <h3 className="serif text-2xl font-semibold">Controls</h3>
            <ul className="mt-4 space-y-3 text-sm">
              <li className="flex items-center justify-between"><span>Move</span><span className="flex gap-1"><Key>W</Key><Key>A</Key><Key>S</Key><Key>D</Key></span></li>
              <li className="flex items-center justify-between"><span>Look around</span><span className="text-white/70">Mouse (click to capture)</span></li>
              <li className="flex items-center justify-between"><span>Run</span><Key>Shift</Key></li>
              <li className="flex items-center justify-between"><span>Climb / descend the stair</span><span className="flex gap-1"><Key>E</Key><Key>Q</Key></span></li>
              <li className="flex items-center justify-between"><span>Time of day</span><span className="flex gap-1"><Key>1</Key><Key>2</Key><Key>3</Key></span></li>
              <li className="flex items-center justify-between"><span>Walk ⇄ aerial orbit</span><Key>O</Key></li>
              <li className="flex items-center justify-between"><span>This help</span><Key>H</Key></li>
              <li className="flex items-center justify-between"><span>Touch</span><span className="text-white/70">left thumb walk · right thumb look</span></li>
            </ul>
          </div>
        </div>
      )}

      {/* Loading */}
      {phase === 'loading' && (
        <div className="absolute inset-0 z-30 grid place-items-center bg-[radial-gradient(ellipse_at_top,#1b2a3a,#0b1118_70%)]">
          <div className="w-80 text-center">
            <div className="mx-auto mb-6 h-16 w-16 rotate-45 rounded-md bg-gradient-to-br from-amber-300 to-amber-500 shadow-[0_0_40px_rgba(251,191,36,0.35)]" style={{ transform: 'rotateX(35deg) rotateZ(45deg)' }} />
            <div className="serif text-3xl font-semibold">Kubuswoningen</div>
            <div className="mt-1 text-xs uppercase tracking-[0.25em] text-white/55">Building the cube houses</div>
            <div className="mt-8 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-amber-300 transition-all duration-300" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
            <div className="mt-3 text-xs text-white/60">{error ? <span className="text-red-300">WebGL error: {error}</span> : label}</div>
          </div>
        </div>
      )}

      {/* Start screen */}
      {phase === 'start' && (
        <div className="absolute inset-0 z-30 flex items-end bg-gradient-to-t from-black/75 via-black/20 to-black/10 p-6 sm:p-12">
          <div className="max-w-xl fade-up">
            <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-amber-300">Rotterdam · The Netherlands</div>
            <h1 className="serif mt-2 text-5xl font-semibold leading-[1.02] tracking-tight sm:text-6xl">Walk through the<br />Cube Houses</h1>
            <p className="mt-4 max-w-md text-[15px] leading-relaxed text-white/85">
              Piet Blom's tilted cubes balance on hexagonal pylons above the street. Stroll beneath them, step through the open door of the Kijk-Kubus show cube and climb its spiral stair through every level.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <button onClick={() => begin('walk')} className="rounded-full bg-amber-300 px-7 py-3.5 text-sm font-bold text-slate-900 shadow-lg shadow-amber-500/20 transition hover:scale-[1.03] hover:bg-amber-200">
                Start exploring on foot →
              </button>
              <button onClick={() => begin('orbit')} className="glass rounded-full px-6 py-3.5 text-sm font-semibold transition hover:bg-white/15">
                Aerial orbit view
              </button>
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-white/70">
              <span className="flex items-center gap-1.5"><Key>W</Key><Key>A</Key><Key>S</Key><Key>D</Key> move</span>
              <span>Mouse look</span>
              <span className="flex items-center gap-1.5"><Key>E</Key> climb stairs</span>
              <span className="flex items-center gap-1.5"><Key>H</Key> help</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

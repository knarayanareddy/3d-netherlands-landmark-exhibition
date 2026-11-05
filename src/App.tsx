import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Exhibition, Mode, TimeOfDay } from './three/Exhibition'
import { LANDMARKS } from './three/landmarks'
import Minimap from './components/Minimap'
import { cn } from './utils/cn'

const I = {
  orbit: 'M12 3a9 9 0 1 0 9 9M12 3v4m0-4 3 2M3 12h4m-4 0 2 3m7-3a3 3 0 1 0 6 0 3 3 0 0 0-6 0',
  walk: 'M13 4.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0ZM9 21l2-6-2-2 1-5 3 3 3 1M13 13l2 3 1 5',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0-13v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4',
  dusk: 'M3 18h18M6 18a6 6 0 0 1 12 0M12 6v3M4.5 10.5l1.8 1.8M19.5 10.5l-1.8 1.8',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z',
  play: 'M8 5v14l11-7z',
  pause: 'M7 5h3v14H7zM14 5h3v14h-3z',
  list: 'M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18',
  left: 'M15 6l-6 6 6 6',
  right: 'M9 6l6 6-6 6',
  close: 'M6 6l12 12M18 6 6 18',
  map: 'M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2ZM9 4v14M15 6v14',
}
function Icon({ n, className }: { n: keyof typeof I; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn('h-4 w-4 shrink-0', className)} fill={n === 'play' || n === 'pause' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={I[n]} />
    </svg>
  )
}

function Seg<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { v: T; label: string; icon: keyof typeof I }[] }) {
  return (
    <div className="flex rounded-full bg-black/30 p-0.5">
      {items.map((it) => (
        <button
          key={it.v}
          onClick={() => onChange(it.v)}
          title={it.label}
          className={cn(
            'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition',
            value === it.v ? 'bg-brass text-ink shadow' : 'text-white/70 hover:text-white',
          )}
        >
          <Icon n={it.icon} />
          <span className="hidden md:inline">{it.label}</span>
        </button>
      ))}
    </div>
  )
}

export default function App() {
  const host = useRef<HTMLDivElement>(null)
  const ex = useRef<Exhibition | null>(null)
  const cam = useRef({ x: 0, z: 0, yaw: 0 })
  const [progress, setProgress] = useState({ p: 0, label: 'Preparing the exhibition hall' })
  const [ready, setReady] = useState(false)
  const [entered, setEntered] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [mode, setMode] = useState<Mode>('orbit')
  const [tour, setTour] = useState(false)
  const [time, setTime] = useState<TimeOfDay>('golden')
  const [listOpen, setListOpen] = useState(false)
  const [mapOpen, setMapOpen] = useState(true)
  const [error, setError] = useState('')
  const [hint, setHint] = useState(true)

  useEffect(() => {
    let e: Exhibition
    try {
      e = new Exhibition(host.current!, {
        onProgress: (p, label) => setProgress({ p, label }),
        onSelect: setSelected,
        onCamera: (x, z, yaw) => {
          cam.current.x = x
          cam.current.z = z
          cam.current.yaw = yaw
        },
        onMode: setMode,
        onTour: setTour,
      })
    } catch (err) {
      setError(String(err))
      return
    }
    ex.current = e
    e.setTime('golden')
    e.start().then(() => {
      if (!(e as any).disposed) setReady(true)
    })
    return () => {
      e.dispose()
      ex.current = null
    }
  }, [])

  useEffect(() => {
    if (!entered) return
    setHint(true)
    const t = setTimeout(() => setHint(false), 9000)
    return () => clearTimeout(t)
  }, [mode, entered])

  const pick = useCallback((id: string) => ex.current?.select(id, true), [])
  const def = useMemo(() => LANDMARKS.find((l) => l.id === selected) ?? null, [selected])
  const idx = def ? LANDMARKS.indexOf(def) : -1

  const changeTime = (t: TimeOfDay) => {
    setTime(t)
    ex.current?.setTime(t)
  }
  const enter = (guided: boolean) => {
    setEntered(true)
    if (guided) ex.current?.setTour(true)
  }

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#0b1219] font-sans text-white">
      <div ref={host} className="absolute inset-0" />

      {/* ----------------------------------------------------------- HUD */}
      {entered && (
        <div className="fade-in pointer-events-none absolute inset-0">
          {/* brand */}
          <div className="pointer-events-auto absolute left-3 top-3 sm:left-5 sm:top-5">
            <div className="glass flex items-center gap-3 rounded-2xl py-2.5 pl-3 pr-5">
              <div className="flex h-9 w-9 flex-col overflow-hidden rounded-md ring-1 ring-white/20">
                <div className="flex-1 bg-[#ae1c28]" />
                <div className="flex-1 bg-white" />
                <div className="flex-1 bg-[#21468b]" />
              </div>
              <div className="leading-tight">
                <div className="font-display text-[17px] font-semibold tracking-tight">Nederland, in Detail</div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-brass">Landmark Exhibition · 11 works</div>
              </div>
            </div>
            <button
              onClick={() => setListOpen((v) => !v)}
              className="glass mt-2 flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold text-white/90 transition hover:text-brass"
            >
              <Icon n={listOpen ? 'close' : 'list'} /> {listOpen ? 'Close' : 'All exhibits'}
            </button>
            {listOpen && (
              <div className="glass scroll-thin fade-up mt-2 max-h-[52vh] w-[min(320px,calc(100vw-1.5rem))] overflow-y-auto rounded-2xl p-1.5">
                {LANDMARKS.map((l, i) => (
                  <button
                    key={l.id}
                    onClick={() => {
                      pick(l.id)
                      if (window.innerWidth < 640) setListOpen(false)
                    }}
                    className={cn('group flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition', selected === l.id ? 'bg-brass/90 text-ink' : 'hover:bg-white/10')}
                  >
                    <span className={cn('grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11px] font-bold', selected === l.id ? 'bg-ink text-brass' : 'bg-brass text-ink')}>{i + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold">{l.name}</span>
                      <span className={cn('block truncate text-[11px]', selected === l.id ? 'text-ink/70' : 'text-white/50')}>
                        {l.city} · {l.year}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* controls */}
          <div className="pointer-events-auto absolute right-3 top-3 flex flex-wrap items-center justify-end gap-2 sm:right-5 sm:top-5">
            <div className="glass flex items-center gap-1 rounded-full p-1">
              <Seg<Mode>
                value={mode}
                onChange={(m) => ex.current?.setMode(m)}
                items={[
                  { v: 'orbit', label: 'Fly', icon: 'orbit' },
                  { v: 'walk', label: 'Walk', icon: 'walk' },
                ]}
              />
              <Seg<TimeOfDay>
                value={time}
                onChange={changeTime}
                items={[
                  { v: 'day', label: 'Day', icon: 'sun' },
                  { v: 'golden', label: 'Dusk', icon: 'dusk' },
                  { v: 'night', label: 'Night', icon: 'moon' },
                ]}
              />
            </div>
            <div className="glass flex items-center gap-1 rounded-full p-1">
              <button
                onClick={() => ex.current?.setTour(!tour)}
                className={cn('flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition', tour ? 'bg-brass text-ink' : 'text-white/80 hover:text-white')}
              >
                <Icon n={tour ? 'pause' : 'play'} /> <span className="hidden md:inline">{tour ? 'Pause tour' : 'Guided tour'}</span>
              </button>
              <button onClick={() => ex.current?.overview()} className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-white/80 transition hover:text-white" title="Overview of the whole map">
                <Icon n="globe" /> <span className="hidden md:inline">Overview</span>
              </button>
            </div>
          </div>

          {/* minimap */}
          <div className="pointer-events-auto absolute bottom-3 left-3 sm:bottom-5 sm:left-5">
            <button onClick={() => setMapOpen((v) => !v)} className="glass mb-2 flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-semibold text-white/80 transition hover:text-brass">
              <Icon n="map" className="h-3.5 w-3.5" /> {mapOpen ? 'Hide map' : 'Map'}
            </button>
            {mapOpen && <Minimap className="w-[150px] sm:w-[210px]" selected={selected} camRef={cam} onPick={pick} onJump={(x, z) => ex.current?.flyToPoint(x, z)} />}
          </div>

          {/* hints */}
          {hint && !def && (
            <div className="fade-up absolute bottom-5 left-1/2 hidden -translate-x-1/2 sm:block">
              <div className="glass flex items-center gap-4 rounded-full px-5 py-2.5 text-xs text-white/85">
                {mode === 'orbit' ? (
                  <>
                    <span><span className="kbd">drag</span> orbit</span>
                    <span><span className="kbd">scroll</span> zoom</span>
                    <span><span className="kbd">right-drag</span> pan</span>
                    <span>click a <span className="text-brass">numbered label</span> to visit</span>
                  </>
                ) : (
                  <>
                    <span><span className="kbd">W</span> <span className="kbd">A</span> <span className="kbd">S</span> <span className="kbd">D</span> move</span>
                    <span><span className="kbd">drag</span> look</span>
                    <span><span className="kbd">Shift</span> run</span>
                    <span>walk up to an exhibit for details</span>
                  </>
                )}
              </div>
            </div>
          )}

          {/* info card */}
          {def && (
            <div key={def.id} className="fade-up pointer-events-auto absolute bottom-3 right-3 w-[min(400px,calc(100vw-1.5rem))] sm:bottom-5 sm:right-5">
              <div className="glass scroll-thin max-h-[62vh] overflow-y-auto rounded-3xl p-5 sm:p-6">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="mb-2 flex items-center gap-2">
                      <span className="grid h-6 w-6 place-items-center rounded-full bg-brass text-[11px] font-bold text-ink">{idx + 1}</span>
                      <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-brass">{def.tag}</span>
                    </div>
                    <h2 className="font-display text-[28px] font-semibold leading-[1.05] tracking-tight">{def.name}</h2>
                    <div className="mt-1 font-display text-sm italic text-white/55">{def.nl}</div>
                  </div>
                  <button onClick={() => ex.current?.select(null)} className="rounded-full p-1.5 text-white/50 transition hover:bg-white/10 hover:text-white" aria-label="Close">
                    <Icon n="close" />
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/70">
                  <span>{def.city}</span>
                  <span className="h-1 w-1 rounded-full bg-brass" />
                  <span>{def.province}</span>
                  <span className="h-1 w-1 rounded-full bg-brass" />
                  <span>{def.year}</span>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2">
                  {def.stat.map(([k, v]) => (
                    <div key={k} className="rounded-xl bg-white/[0.06] px-2.5 py-2 ring-1 ring-white/5">
                      <div className="text-[9px] font-semibold uppercase tracking-[0.15em] text-white/45">{k}</div>
                      <div className="mt-0.5 text-[13px] font-semibold leading-tight">{v}</div>
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-[13.5px] leading-relaxed text-white/80">{def.blurb}</p>
                <div className="mt-4 rounded-xl border border-brass/30 bg-brass/10 p-3">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-brass">Did you know</div>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-white/80">{def.fact}</p>
                </div>
                <div className="mt-5 flex items-center justify-between">
                  <button onClick={() => ex.current?.next(-1)} className="flex items-center gap-1 rounded-full bg-white/10 py-2 pl-2.5 pr-4 text-xs font-semibold transition hover:bg-white/20">
                    <Icon n="left" /> Prev
                  </button>
                  <div className="flex gap-1">
                    {LANDMARKS.map((l) => (
                      <span key={l.id} className={cn('h-1.5 rounded-full transition-all', l.id === def.id ? 'w-5 bg-brass' : 'w-1.5 bg-white/25')} />
                    ))}
                  </div>
                  <button onClick={() => ex.current?.next(1)} className="flex items-center gap-1 rounded-full bg-brass py-2 pl-4 pr-2.5 text-xs font-semibold text-ink transition hover:brightness-110">
                    Next <Icon n="right" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ----------------------------------------------------------- splash */}
      <div
        className={cn(
          'absolute inset-0 z-50 flex items-center justify-center overflow-hidden transition-opacity duration-1000',
          entered ? 'pointer-events-none opacity-0' : 'opacity-100',
        )}
        style={{ background: 'radial-gradient(120% 90% at 50% 20%, rgba(18,32,46,0.55), rgba(8,13,19,0.93) 70%)', backdropFilter: entered ? 'none' : 'blur(3px)' }}
      >
        <div className="mx-auto max-w-2xl px-6 text-center">
          <div className="mx-auto mb-7 flex h-1.5 w-28 overflow-hidden rounded-full">
            <div className="flex-1 bg-[#ae1c28]" />
            <div className="flex-1 bg-white" />
            <div className="flex-1 bg-[#21468b]" />
          </div>
          <div className="mb-4 text-[11px] font-semibold uppercase tracking-[0.4em] text-brass">An interactive 3D exhibition</div>
          <h1 className="font-display text-5xl font-semibold leading-[0.98] tracking-tight sm:text-7xl">
            Nederland,
            <br />
            <span className="italic text-brass">in Detail</span>
          </h1>
          <p className="mx-auto mt-6 max-w-lg text-[15px] leading-relaxed text-white/70">
            Eleven landmarks, from Amsterdam&rsquo;s canal houses to the Delta Works, rebuilt in 3D and placed across a giant floor map of the Netherlands. Fly above them, or walk right up to the brickwork.
          </p>
          <div className="mx-auto mt-9 h-16 max-w-sm">
            {!ready && !error && (
              <div className="fade-in">
                <div className="h-1 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-gradient-to-r from-brass to-orange-nl transition-all duration-300" style={{ width: `${Math.round(progress.p * 100)}%` }} />
                </div>
                <div className="mt-3 text-xs tracking-wide text-white/55">{progress.label}…</div>
              </div>
            )}
            {error && <div className="text-sm text-red-300">WebGL could not start on this device. {error}</div>}
            {ready && !error && (
              <div className="fade-up flex items-center justify-center gap-3">
                <button onClick={() => enter(true)} className="rounded-full bg-brass px-6 py-3 text-sm font-semibold text-ink shadow-lg shadow-brass/20 transition hover:brightness-110">
                  Begin guided tour
                </button>
                <button onClick={() => enter(false)} className="rounded-full border border-white/25 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10">
                  Explore freely
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

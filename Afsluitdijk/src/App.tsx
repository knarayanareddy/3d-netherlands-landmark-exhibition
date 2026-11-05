import { useEffect, useRef, useState } from 'react'
import { Experience, type ExpState, type Quality, type TimeName, type Weather } from './afsluitdijk/Experience'
import { POIS, TOUR, type Poi } from './afsluitdijk/pois'
import { MiniMap } from './components/MiniMap'

const TIMES: { id: TimeName; label: string }[] = [
  { id: 'sunrise', label: 'Sunrise' },
  { id: 'morning', label: 'Morning' },
  { id: 'noon', label: 'Midday' },
  { id: 'golden', label: 'Golden hour' },
  { id: 'night', label: 'Night' },
]
const WEATHERS: { id: Weather; label: string }[] = [
  { id: 'clear', label: 'Clear' },
  { id: 'partly', label: 'Partly cloudy' },
  { id: 'overcast', label: 'Overcast' },
]
const QUALITIES: Quality[] = ['high', 'medium', 'low']

function Chip({ active, onClick, children }: { active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition ${
        active ? 'bg-amber-300 text-black' : 'bg-white/10 text-white/80 hover:bg-white/20'
      }`}
    >
      {children}
    </button>
  )
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded border border-white/25 bg-white/10 px-1.5 py-0.5 font-mono text-[10px] text-white/90">{children}</kbd>
}

export default function App() {
  const host = useRef<HTMLDivElement>(null)
  const exp = useRef<Experience | null>(null)
  const [progress, setProgress] = useState({ p: 0, label: 'Preparing…' })
  const [st, setSt] = useState<ExpState | null>(null)
  const [poi, setPoi] = useState<Poi | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [time, setTime] = useState<TimeName>('noon')
  const [weather, setWeather] = useState<Weather>('partly')
  const [panel, setPanel] = useState(true)
  const [places, setPlaces] = useState(true)

  useEffect(() => {
    if (!host.current) return
    const e = new Experience(host.current, {
      onProgress: (p, label) => setProgress({ p, label }),
      onState: (s) => setSt(s),
      onPoi: (p) => setPoi(p),
    })
    exp.current = e
    ;(window as unknown as { __afsluitdijk?: Experience }).__afsluitdijk = e
    e.init().catch((err) => {
      console.error(err)
      setError(err instanceof Error ? err.message : String(err))
    })
    return () => {
      e.dispose()
      exp.current = null
    }
  }, [])

  const phase = st?.phase ?? 'loading'
  const playing = phase === 'play' || phase === 'flight'

  return (
    <div className="fixed inset-0 select-none overflow-hidden bg-[#0b1118] font-sans text-white">
      <div ref={host} className="absolute inset-0" />

      {/* ------------------------------------------------------------ loading */}
      {phase === 'loading' && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-[#0b1118]">
          <div className="mb-2 text-xs uppercase tracking-[0.4em] text-amber-300/80">Nederland · 3D landmark exhibition</div>
          <h1 className="font-serif text-5xl font-semibold tracking-tight md:text-6xl">Afsluitdijk</h1>
          {error ? (
            <p className="mt-8 max-w-md text-center text-sm text-red-300">
              This experience needs WebGL 2. {error}
            </p>
          ) : (
            <>
              <div className="mt-10 h-1 w-72 overflow-hidden rounded-full bg-white/10">
                <div className="h-full bg-amber-300 transition-all duration-300" style={{ width: `${Math.round(progress.p * 100)}%` }} />
              </div>
              <div className="mt-3 text-xs text-white/60">{progress.label}…</div>
            </>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------ start card */}
      {phase === 'attract' && (
        <div className="absolute inset-0 z-20 flex items-end justify-center bg-gradient-to-t from-black/70 via-black/10 to-black/30 pb-[8vh]">
          <div className="mx-4 max-w-2xl text-center">
            <div className="mb-2 text-xs uppercase tracking-[0.4em] text-amber-300">De Afsluitdijk · 1932</div>
            <h1 className="font-serif text-5xl font-semibold tracking-tight drop-shadow md:text-7xl">Walk the dike</h1>
            <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-white/80 md:text-base">
              A 32-kilometre barrier between the Wadden Sea and the IJsselmeer. Explore it at full scale: walk the cycle path, climb Dudok’s monument tower, cross the A7 on the
              footbridge and stand on the Levvel blocks at the water’s edge.
            </p>
            <button
              onClick={() => exp.current?.enter()}
              className="mt-7 rounded-full bg-amber-300 px-9 py-3 text-sm font-semibold uppercase tracking-widest text-black shadow-xl shadow-black/40 transition hover:bg-amber-200"
            >
              Enter the dike
            </button>
            <div className="mt-4 text-[11px] text-white/55">Sound on for the full experience · Best in Chrome, Edge or Firefox with a GPU</div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------ HUD */}
      {playing && st && (
        <div data-hud className="contents">
          {/* title */}
          <div className="pointer-events-none absolute left-4 top-4 z-10">
            <div className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 backdrop-blur-md">
              <div className="font-serif text-lg font-semibold leading-none">Afsluitdijk</div>
              <div className="mt-1 text-[10px] uppercase tracking-[0.25em] text-amber-300/90">
                {st.mode === 'walk' ? 'Walking' : 'Flying'} · {Math.round(Math.max(0, st.y - 7.6))} m above the road
              </div>
            </div>
          </div>

          {/* places list */}
          <div className="absolute left-4 top-[74px] z-10 w-56">
            <button
              onClick={() => setPlaces((v) => !v)}
              className="mb-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-left text-[11px] font-semibold uppercase tracking-widest text-white/80 backdrop-blur-md hover:bg-black/55"
            >
              {places ? '▾' : '▸'} Places
            </button>
            {places && (
              <div className="max-h-[48vh] space-y-1 overflow-y-auto rounded-lg border border-white/10 bg-black/40 p-1.5 backdrop-blur-md">
                {POIS.map((p, i) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      exp.current?.stopTour()
                      exp.current?.goTo(p.id)
                    }}
                    className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition hover:bg-white/15 ${poi?.id === p.id ? 'bg-white/15' : ''}`}
                  >
                    <span className="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-amber-300 text-[10px] font-bold text-black">{i + 1}</span>
                    <span className="leading-tight text-white/90">{p.title}</span>
                  </button>
                ))}
                <button
                  onClick={() => (st.tour ? exp.current?.stopTour() : exp.current?.startTour())}
                  className="mt-1 w-full rounded-md bg-amber-300 px-2 py-1.5 text-xs font-semibold text-black hover:bg-amber-200"
                >
                  {st.tour ? `■ Stop tour (${Math.min(st.tourIdx + 1, TOUR.length)}/${TOUR.length})` : '▶ Guided tour'}
                </button>
              </div>
            )}
          </div>

          {/* settings */}
          <div className="absolute right-4 top-4 z-10 w-60">
            <button
              onClick={() => setPanel((v) => !v)}
              className="mb-1 ml-auto block rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-white/80 backdrop-blur-md hover:bg-black/55"
            >
              {panel ? '▾' : '▸'} Atmosphere
            </button>
            {panel && (
              <div className="space-y-3 rounded-lg border border-white/10 bg-black/45 p-3 backdrop-blur-md">
                <div>
                  <div className="mb-1.5 text-[10px] uppercase tracking-widest text-white/50">Time of day</div>
                  <div className="flex flex-wrap gap-1">
                    {TIMES.map((t) => (
                      <Chip
                        key={t.id}
                        active={time === t.id}
                        onClick={() => {
                          setTime(t.id)
                          exp.current?.setTime(t.id)
                        }}
                      >
                        {t.label}
                      </Chip>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="mb-1.5 text-[10px] uppercase tracking-widest text-white/50">Weather</div>
                  <div className="flex flex-wrap gap-1">
                    {WEATHERS.map((w) => (
                      <Chip
                        key={w.id}
                        active={weather === w.id}
                        onClick={() => {
                          setWeather(w.id)
                          exp.current?.setWeather(w.id)
                        }}
                      >
                        {w.label}
                      </Chip>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="mb-1.5 text-[10px] uppercase tracking-widest text-white/50">Movement</div>
                  <div className="flex flex-wrap gap-1">
                    <Chip active={st.mode === 'walk'} onClick={() => exp.current?.setMode('walk')}>
                      Walk
                    </Chip>
                    <Chip active={st.mode === 'fly'} onClick={() => exp.current?.setMode('fly')}>
                      Fly (F)
                    </Chip>
                    <Chip active={st.locked} onClick={() => exp.current?.requestLock()}>
                      Mouse look
                    </Chip>
                    <Chip active={st.audio} onClick={() => exp.current?.setAudio(!st.audio)}>
                      {st.audio ? 'Sound on' : 'Sound off'}
                    </Chip>
                  </div>
                </div>
                <div>
                  <div className="mb-1.5 text-[10px] uppercase tracking-widest text-white/50">Quality · {st.fps} fps</div>
                  <div className="flex gap-1">
                    {QUALITIES.map((q) => (
                      <Chip key={q} active={st.quality === q} onClick={() => exp.current?.setQuality(q)}>
                        {q}
                      </Chip>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* minimap */}
          <div className="absolute bottom-4 right-4 z-10 hidden sm:block">
            <MiniMap x={st.x} z={st.z} yaw={st.yaw} />
          </div>

          {/* controls hint */}
          <div className="pointer-events-none absolute bottom-4 left-4 z-10 hidden max-w-sm space-y-1 rounded-lg border border-white/10 bg-black/35 px-3 py-2 text-[11px] text-white/75 backdrop-blur-md md:block">
            <div>
              <Kbd>W</Kbd> <Kbd>A</Kbd> <Kbd>S</Kbd> <Kbd>D</Kbd> move · <Kbd>Shift</Kbd> run · <Kbd>Space</Kbd> jump
            </div>
            <div>
              Drag to look · <Kbd>F</Kbd> fly · <Kbd>Z</Kbd> zoom · scroll for field of view
            </div>
          </div>

          {/* touch joystick */}
          {st.joy && (
            <div className="pointer-events-none absolute bottom-20 left-10 z-10 h-28 w-28 rounded-full border border-white/30 bg-white/5">
              <div
                className="absolute h-12 w-12 rounded-full bg-white/40"
                style={{
                  left: 32 + Math.max(-40, Math.min(40, st.joy.x)),
                  top: 32 + Math.max(-40, Math.min(40, st.joy.y)),
                }}
              />
            </div>
          )}

          {/* poi card */}
          {poi && (
            <div className="pointer-events-none absolute bottom-6 left-1/2 z-10 w-[min(92vw,560px)] -translate-x-1/2 md:bottom-8">
              <div className="rounded-xl border border-white/15 bg-black/55 p-4 shadow-2xl backdrop-blur-lg">
                <div className="text-[10px] font-semibold uppercase tracking-[0.3em] text-amber-300">{poi.kicker}</div>
                <div className="mt-0.5 font-serif text-2xl font-semibold">{poi.title}</div>
                <p className="mt-2 text-[13px] leading-relaxed text-white/85">{poi.body}</p>
                {poi.fact && <p className="mt-2 border-l-2 border-amber-300/70 pl-3 text-xs italic leading-relaxed text-white/65">{poi.fact}</p>}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

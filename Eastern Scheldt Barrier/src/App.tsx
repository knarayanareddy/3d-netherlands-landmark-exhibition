import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BarrierExplorer, type ExplorerState } from './explorer/Explorer'
import { FACTS, HOTSPOTS, VIEWPOINTS, type Hotspot } from './explorer/data'
import type { TimeId } from './explorer/atmosphere'
import { BARRIER_X1, PITCH } from './explorer/world'
import { Icon } from './ui/icons'

const TIMES: { id: TimeId; label: string; icon: string }[] = [
  { id: 'morning', label: 'Morning', icon: 'sunrise' },
  { id: 'midday', label: 'Midday', icon: 'sun' },
  { id: 'golden', label: 'Golden hour', icon: 'sunset' },
  { id: 'blue', label: 'Blue hour', icon: 'dusk' },
  { id: 'night', label: 'Night', icon: 'night' },
]

const glass = 'bg-slate-950/55 backdrop-blur-xl border border-white/10 shadow-2xl shadow-black/30'

function IconButton({ active, title, onClick, children }: { active?: boolean; title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      title={title}
      aria-label={title}
      onClick={onClick}
      className={`grid h-10 w-10 place-items-center rounded-xl border transition ${
        active ? 'border-orange-400/60 bg-orange-500/20 text-orange-200' : 'border-white/10 bg-white/5 text-slate-200 hover:bg-white/15'
      }`}
    >
      {children}
    </button>
  )
}

function Joystick({ onMove }: { onMove: (x: number, y: number) => void }) {
  const [knob, setKnob] = useState({ x: 0, y: 0 })
  const ref = useRef<HTMLDivElement>(null)
  const handle = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect()
    let dx = e.clientX - (r.left + r.width / 2)
    let dy = e.clientY - (r.top + r.height / 2)
    const m = Math.hypot(dx, dy)
    const max = r.width / 2 - 14
    if (m > max) {
      dx = (dx / m) * max
      dy = (dy / m) * max
    }
    setKnob({ x: dx, y: dy })
    onMove(dx / max, dy / max)
  }
  return (
    <div
      ref={ref}
      className="relative h-28 w-28 touch-none rounded-full border border-white/20 bg-white/10 backdrop-blur"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        handle(e)
      }}
      onPointerMove={(e) => e.buttons && handle(e)}
      onPointerUp={() => {
        setKnob({ x: 0, y: 0 })
        onMove(0, 0)
      }}
    >
      <div className="absolute left-1/2 top-1/2 h-12 w-12 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/50 shadow-lg" style={{ transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))` }} />
    </div>
  )
}

function PositionStrip({ st, onGo }: { st: ExplorerState | null; onGo: (x: number) => void }) {
  const min = -740
  const max = 1740
  const pct = (x: number) => ((x - min) / (max - min)) * 100
  const piers = useMemo(() => Array.from({ length: 23 }, (_, i) => i * PITCH), [])
  return (
    <div className={`${glass} pointer-events-auto w-[min(520px,92vw)] rounded-2xl px-4 py-3`}>
      <div className="mb-1.5 flex items-center justify-between text-[10px] font-medium uppercase tracking-[0.18em] text-slate-400">
        <span>Neeltje Jans</span>
        <span>Barrier · piers 1 – 23 of 65</span>
        <span>Noordland</span>
      </div>
      <div
        className="relative h-9 cursor-pointer select-none"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          onGo(min + ((e.clientX - r.left) / r.width) * (max - min))
        }}
      >
        <div className="absolute inset-x-0 top-1/2 h-px bg-sky-400/30" />
        <div className="absolute top-[58%] h-2.5 rounded-full bg-amber-200/70" style={{ left: `${pct(-700)}%`, width: `${pct(-140) - pct(-700)}%` }} />
        <div className="absolute top-[58%] h-2.5 rounded-full bg-amber-200/70" style={{ left: `${pct(1130)}%`, width: `${pct(1740) - pct(1130)}%` }} />
        <div className="absolute top-[40%] h-1.5 rounded-sm bg-slate-400/80" style={{ left: `${pct(-140)}%`, width: `${pct(BARRIER_X1) - pct(-140)}%` }} />
        {piers.map((x) => (
          <div key={x} className="absolute top-[18%] h-[52%] w-[2px] rounded bg-slate-200/90" style={{ left: `${pct(x)}%` }} />
        ))}
        <div className="absolute top-[40%] h-1.5 rounded-sm bg-slate-400/80" style={{ left: `${pct(BARRIER_X1)}%`, width: `${pct(1130) - pct(BARRIER_X1)}%` }} />
        {st && (
          <div className="pointer-events-none absolute top-0 h-full" style={{ left: `${Math.min(100, Math.max(0, pct(st.x)))}%` }}>
            <div className="absolute -translate-x-1/2 top-[2px] h-0 w-0 border-x-[5px] border-t-[8px] border-x-transparent border-t-orange-400" />
            <div className="absolute -translate-x-1/2 top-[8px] h-6 w-[2px] bg-orange-400" />
          </div>
        )}
      </div>
    </div>
  )
}

export default function App() {
  const host = useRef<HTMLDivElement>(null)
  const ex = useRef<BarrierExplorer | null>(null)
  const hotRefs = useRef(new Map<string, HTMLElement>())
  const [progress, setProgress] = useState({ p: 0, label: 'Starting engine' })
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [entered, setEntered] = useState(false)
  const [st, setSt] = useState<ExplorerState | null>(null)
  const [panel, setPanel] = useState<Hotspot | null>(null)
  const [sound, setSound] = useState(false)
  const [fx, setFx] = useState(true)
  const [showViews, setShowViews] = useState(true)
  const [help, setHelp] = useState(true)
  const [time, setTime] = useState<TimeId>('midday')
  const [storm, setStorm] = useState(false)
  const [coarse] = useState(() => typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches)

  useEffect(() => {
    let cancelled = false
    let explorer: BarrierExplorer
    try {
      explorer = new BarrierExplorer(host.current!, {
        onProgress: (p, label) => !cancelled && setProgress({ p, label }),
        onState: (s) => !cancelled && setSt(s),
      })
    } catch (e) {
      setError('Your browser could not start WebGL, which this 3D experience needs.')
      return
    }
    ex.current = explorer
    hotRefs.current.forEach((el, id) => explorer.registerHotspot(id, el))
    explorer
      .init()
      .then(() => {
        if (cancelled) return
        ;(window as any).__ex = explorer
        setReady(true)
      })
      .catch((e) => {
        if (String(e?.message) !== 'disposed') {
          console.error(e)
          setError('Something went wrong while building the scene: ' + String(e?.message ?? e))
        }
      })
    return () => {
      cancelled = true
      explorer.dispose()
      ex.current = null
    }
  }, [])

  const enter = useCallback(() => {
    const e = ex.current
    if (!e) return
    setEntered(true)
    setSound(true)
    void e.setSound(true)
    e.flyTo('neeltje')
  }, [])

  const toggleStorm = useCallback(() => {
    const e = ex.current
    if (!e) return
    const on = !e.stormOn
    e.setStorm(on)
    setStorm(on)
  }, [])

  const pickTime = useCallback((id: TimeId) => {
    ex.current?.setTime(id)
    setTime(id)
  }, [])

  const toggleMode = useCallback(() => {
    const e = ex.current
    if (!e) return
    e.setMode(e.mode === 'walk' ? 'fly' : 'walk')
  }, [])

  const openHotspot = useCallback((h: Hotspot) => {
    setPanel(h)
    ex.current?.flyTo(h.view)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!entered) return
      const k = e.key.toLowerCase()
      if (k === 'f') toggleMode()
      else if (k === 'escape') setPanel(null)
      else if (k === 'h') setHelp((v) => !v)
      else if (k === 't') toggleStorm()
      else if (k >= '1' && k <= '5') pickTime(TIMES[Number(k) - 1].id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [entered, toggleMode, toggleStorm, pickTime])

  const gates = st?.gates ?? 0
  const gateLabel = gates < 0.02 && !storm ? 'Open' : gates > 0.98 && storm ? 'Closed' : storm ? 'Closing…' : 'Opening…'

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-slate-950 font-sans text-slate-100 select-none">
      <div ref={host} className="absolute inset-0" />

      {/* hotspots */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {HOTSPOTS.map((h) => (
          <button
            key={h.id}
            ref={(el) => {
              if (el) hotRefs.current.set(h.id, el)
              else hotRefs.current.delete(h.id)
              ex.current?.registerHotspot(h.id, el)
            }}
            onClick={() => openHotspot(h)}
            style={{ opacity: 0, position: 'absolute', left: 0, top: 0, transition: 'opacity .25s' }}
            className="group pointer-events-none"
            aria-label={h.title}
          >
            <span className="relative grid h-8 w-8 place-items-center">
              <span className="absolute inset-0 animate-ping rounded-full bg-orange-400/40" />
              <span className="relative grid h-7 w-7 place-items-center rounded-full border border-white/70 bg-slate-900/70 text-[11px] font-bold text-orange-200 shadow-lg backdrop-blur">i</span>
            </span>
            <span className="pointer-events-none absolute left-9 top-1/2 -translate-y-1/2 whitespace-nowrap rounded-lg bg-slate-950/80 px-2.5 py-1 text-xs font-medium text-white opacity-0 shadow-xl backdrop-blur transition group-hover:opacity-100">
              {h.title}
            </span>
          </button>
        ))}
      </div>

      {/* intro / loader */}
      {!entered && (
        <div className="absolute inset-0 z-30 flex items-end justify-start bg-gradient-to-t from-slate-950/90 via-slate-950/35 to-slate-950/10 p-6 sm:p-12">
          <div className="max-w-2xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-orange-300/30 bg-orange-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-orange-200">
              <span className="h-1.5 w-1.5 rounded-full bg-orange-400" /> {FACTS.where}
            </div>
            <h1 className="text-5xl font-semibold leading-[1.02] tracking-tight text-white sm:text-7xl">{FACTS.title}</h1>
            <p className="mt-3 text-lg text-slate-200 sm:text-xl">{FACTS.subtitle} — explore it on foot, by drone and from the sea.</p>
            <div className="mt-6 flex flex-wrap gap-3">
              {FACTS.stats.map(([k, v]) => (
                <div key={k} className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 backdrop-blur">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400">{k}</div>
                  <div className="text-lg font-semibold">{v}</div>
                </div>
              ))}
              <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 backdrop-blur">
                <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400">Completed</div>
                <div className="text-lg font-semibold">{FACTS.year}</div>
              </div>
            </div>
            <div className="mt-8">
              {error ? (
                <p className="max-w-md rounded-xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-200">{error}</p>
              ) : !ready ? (
                <div className="w-full max-w-md">
                  <div className="mb-2 flex justify-between text-xs text-slate-300">
                    <span>{progress.label}…</span>
                    <span>{Math.round(progress.p * 100)}%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-gradient-to-r from-orange-400 to-amber-300 transition-all duration-300" style={{ width: `${progress.p * 100}%` }} />
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-4">
                  <button onClick={enter} className="group inline-flex items-center gap-3 rounded-2xl bg-orange-500 px-7 py-4 text-base font-semibold text-white shadow-xl shadow-orange-900/40 transition hover:bg-orange-400">
                    Enter the barrier
                    <Icon name="chevron" className="transition group-hover:translate-x-1" />
                  </button>
                  <span className="text-sm text-slate-300">Sound on · best experienced full screen</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* HUD */}
      {entered && (
        <>
          <div className="pointer-events-none absolute left-4 top-4 z-20 flex flex-col gap-3 sm:left-6 sm:top-6">
            <div className={`${glass} pointer-events-auto rounded-2xl px-4 py-3`}>
              <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-orange-300">{FACTS.where}</div>
              <div className="text-lg font-semibold leading-tight">{FACTS.title}</div>
              <div className="text-xs text-slate-300">{FACTS.subtitle}</div>
            </div>

            <div className={`${glass} pointer-events-auto w-64 overflow-hidden rounded-2xl`}>
              <button onClick={() => setShowViews((v) => !v)} className="flex w-full items-center justify-between px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">
                <span className="flex items-center gap-2">
                  <Icon name="pin" size={15} /> Viewpoints
                </span>
                <Icon name="chevron" size={15} className={`transition ${showViews ? 'rotate-90' : ''}`} />
              </button>
              {showViews && (
                <ul className="max-h-[42vh] overflow-y-auto border-t border-white/10 py-1">
                  {VIEWPOINTS.map((v) => (
                    <li key={v.id}>
                      <button onClick={() => ex.current?.flyTo(v.id)} className="flex w-full items-start gap-3 px-4 py-2 text-left transition hover:bg-white/10">
                        <span className="mt-0.5 text-slate-400">
                          <Icon name={v.mode === 'walk' ? 'walk' : 'fly'} size={15} />
                        </span>
                        <span>
                          <span className="block text-sm font-medium">{v.label}</span>
                          <span className="block text-[11px] leading-snug text-slate-400">{v.blurb}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="absolute right-4 top-4 z-20 flex items-center gap-2 sm:right-6 sm:top-6">
            <div className={`${glass} flex items-center gap-1.5 rounded-2xl p-1.5`}>
              <button
                onClick={toggleMode}
                className="flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 text-sm font-medium text-slate-100 transition hover:bg-white/15"
                title="Toggle walk / fly (F)"
              >
                <Icon name={st?.mode === 'fly' ? 'fly' : 'walk'} />
                {st?.mode === 'fly' ? 'Drone' : 'Walking'}
              </button>
              <IconButton
                title={sound ? 'Mute ambience' : 'Enable ambience'}
                active={sound}
                onClick={() => {
                  const n = !sound
                  setSound(n)
                  void ex.current?.setSound(n)
                }}
              >
                <Icon name={sound ? 'sound' : 'mute'} />
              </IconButton>
              <IconButton
                title="Cinematic effects (bloom, grain, vignette)"
                active={fx}
                onClick={() => {
                  setFx(!fx)
                  ex.current?.setFX(!fx)
                }}
              >
                <Icon name="fx" />
              </IconButton>
              <IconButton title="Fullscreen" onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.())}>
                <Icon name="full" />
              </IconButton>
              <IconButton title="Controls (H)" active={help} onClick={() => setHelp((v) => !v)}>
                <Icon name="help" />
              </IconButton>
            </div>
          </div>

          {/* bottom-left: time + storm */}
          <div className="absolute bottom-4 left-4 z-20 flex flex-col gap-2 sm:bottom-6 sm:left-6">
            <div className={`${glass} pointer-events-auto flex items-center gap-1 rounded-2xl p-1.5`}>
              {TIMES.map((t, i) => (
                <button
                  key={t.id}
                  title={`${t.label} (${i + 1})`}
                  onClick={() => pickTime(t.id)}
                  className={`grid h-10 w-10 place-items-center rounded-xl border transition sm:w-auto sm:px-3 ${
                    time === t.id ? 'border-orange-400/60 bg-orange-500/20 text-orange-100' : 'border-transparent text-slate-300 hover:bg-white/10'
                  }`}
                >
                  <span className="flex items-center gap-2 text-xs font-medium">
                    <Icon name={t.icon} size={17} />
                    <span className="hidden xl:inline">{t.label}</span>
                  </span>
                </button>
              ))}
            </div>
            <div className={`${glass} pointer-events-auto flex items-center gap-3 rounded-2xl p-2 pr-4`}>
              <button
                onClick={toggleStorm}
                className={`flex h-11 items-center gap-2 rounded-xl px-4 text-sm font-semibold transition ${
                  storm ? 'bg-red-500 text-white shadow-lg shadow-red-900/40 hover:bg-red-400' : 'bg-sky-500/90 text-white hover:bg-sky-400'
                }`}
              >
                <Icon name="storm" />
                {storm ? 'Reopen the barrier' : 'Storm surge: close gates'}
              </button>
              <div className="min-w-[88px]">
                <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.16em] text-slate-400">
                  <span>Gates</span>
                  <span className="font-semibold text-slate-200">{gateLabel}</span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-gradient-to-r from-sky-400 to-red-400" style={{ width: `${gates * 100}%` }} />
                </div>
              </div>
            </div>
          </div>

          {/* bottom-center strip */}
          <div className="pointer-events-none absolute inset-x-0 top-4 z-10 hidden justify-center lg:flex sm:top-6">
            <PositionStrip st={st} onGo={(x) => ex.current?.teleportX(x)} />
          </div>

          {/* controls card */}
          {help && (
            <div className={`${glass} pointer-events-auto absolute bottom-4 right-4 z-20 hidden w-72 rounded-2xl p-4 text-xs text-slate-300 md:block sm:bottom-6 sm:right-6`}>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-orange-300">Controls</span>
                <button onClick={() => setHelp(false)} className="text-slate-400 hover:text-white">
                  <Icon name="close" size={14} />
                </button>
              </div>
              <ul className="space-y-1.5">
                {[
                  ['W A S D', 'move'],
                  ['Shift', 'run / boost'],
                  ['Drag', 'look around'],
                  ['Scroll', 'zoom'],
                  ['F', 'walk ⇄ drone'],
                  ['Space / C', 'up / down (drone)'],
                  ['1 – 5', 'time of day'],
                  ['T', 'storm surge'],
                ].map(([k, v]) => (
                  <li key={k} className="flex items-center justify-between">
                    <kbd className="rounded-md border border-white/15 bg-white/10 px-1.5 py-0.5 font-mono text-[11px] text-slate-100">{k}</kbd>
                    <span>{v}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 border-t border-white/10 pt-2 text-[11px] text-slate-400">Click the pulsing “i” markers to learn about the structure.</p>
            </div>
          )}

          {/* info panel */}
          {panel && (
            <div className={`${glass} pointer-events-auto absolute right-4 top-20 z-30 w-[min(360px,calc(100vw-2rem))] rounded-2xl p-5 sm:right-6 sm:top-24`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-orange-300">{panel.kicker}</div>
                  <h3 className="mt-1 text-xl font-semibold leading-tight">{panel.title}</h3>
                </div>
                <button onClick={() => setPanel(null)} className="rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-white" aria-label="Close">
                  <Icon name="close" />
                </button>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-slate-200">{panel.text}</p>
              <div className="mt-4 grid grid-cols-3 gap-2">
                {panel.stats.map(([k, v]) => (
                  <div key={k} className="rounded-xl border border-white/10 bg-white/5 px-2.5 py-2">
                    <div className="text-[9px] uppercase tracking-[0.14em] text-slate-400">{k}</div>
                    <div className="text-[13px] font-semibold leading-tight">{v}</div>
                  </div>
                ))}
              </div>
              {panel.id === 'surge' && (
                <button onClick={toggleStorm} className={`mt-4 flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition ${storm ? 'bg-red-500 hover:bg-red-400' : 'bg-sky-500 hover:bg-sky-400'}`}>
                  <Icon name="gate" size={16} /> {storm ? 'Reopen the barrier' : 'Close the gates now'}
                </button>
              )}
            </div>
          )}

          {coarse && (
            <div className="absolute bottom-24 left-6 z-20">
              <Joystick onMove={(x, y) => ex.current?.setJoystick(x, y)} />
            </div>
          )}
        </>
      )}
    </div>
  )
}

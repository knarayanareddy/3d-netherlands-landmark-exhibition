import type React from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Experience, Mode, Status, TimeOfDay } from './scene/Experience'
import { HOTSPOTS, VIEWPOINTS, X_END, X_START, deckY, PYLON, PYLON_TOP } from './scene/config'
import { cn } from './utils/cn'

const TOTAL = X_END - X_START
const TIMES: { v: TimeOfDay; label: string; hint: string }[] = [
  { v: 'day', label: 'Day', hint: 'Late morning' },
  { v: 'golden', label: 'Golden', hint: 'Golden hour' },
  { v: 'dusk', label: 'Dusk', hint: 'Blue hour' },
  { v: 'night', label: 'Night', hint: 'After dark' },
]
const MODES: { v: Mode; label: string; sub: string }[] = [
  { v: 'orbit', label: 'Orbit', sub: 'Drag · scroll' },
  { v: 'walk', label: 'Walk', sub: 'On foot' },
  { v: 'fly', label: 'Fly', sub: 'Free camera' },
]

function Ico({ d, className }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn('h-4 w-4 shrink-0', className)} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  )
}
const ICON = {
  sound: 'M11 5 6 9H3v6h3l5 4V5Zm4.5 3.5a5 5 0 0 1 0 7M18 6a8.5 8.5 0 0 1 0 12',
  mute: 'M11 5 6 9H3v6h3l5 4V5Zm5 4 5 6m0-6-5 6',
  cam: 'M4 8h3l2-3h6l2 3h3v11H4V8Zm8 9a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
  list: 'M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-11v6m0-9h.01',
  close: 'M6 6l12 12M18 6 6 18',
  full: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
}

/* ------------------------------------------------------------------ bridge profile mini-map */
function Profile({ along, mode, onPick }: { along: number; mode: Mode; onPick: (a: number) => void }) {
  const H = 150
  const sy = 0.95
  const Y = (y: number) => H - 14 - y * sy
  const deck = useMemo(() => {
    const pts: string[] = []
    for (let x = X_START; x <= X_END; x += 8) pts.push(`${x - X_START},${Y(deckY(x))}`)
    return pts.join(' ')
  }, [])
  const px = (x: number) => x - X_START
  const [fx, fy] = PYLON.legFoot
  const [kx, ky] = PYLON.kink
  const [tx, ty] = PYLON.top
  const stays = useMemo(() => {
    const l: React.ReactElement[] = []
    for (let k = 0; k < 16; k++) {
      const y = 133 - 3.2 * k
      const xk = 22 + (15 - k) * 16.5
      l.push(<line key={k} x1={px(tx + (y - ty) * 0.17)} y1={Y(y)} x2={px(xk)} y2={Y(deckY(xk))} stroke="#e8f0f5" strokeWidth="0.7" opacity="0.8" />)
    }
    return l
  }, [])
  return (
    <svg
      viewBox={`0 0 ${TOTAL} ${H}`}
      className="h-[62px] w-full cursor-crosshair"
      preserveAspectRatio="none"
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect()
        onPick(((e.clientX - r.left) / r.width) * TOTAL)
      }}
    >
      <rect x="0" y={Y(0)} width={TOTAL} height={H} fill="#2a4a5c" opacity="0.55" />
      <rect x="0" y={Y(3)} width={px(-130)} height="40" fill="#3b4551" opacity="0.7" />
      <rect x={px(290)} y={Y(3)} width={TOTAL} height="40" fill="#3b4551" opacity="0.7" />
      {stays}
      <polygon points={`${px(fx)},${Y(fy)} ${px(kx)},${Y(ky)} ${px(tx)},${Y(ty)} ${px(tx + 3)},${Y(ty)} ${px(kx + 4)},${Y(ky - 2)} ${px(fx + 5)},${Y(fy)}`} fill="#f2f6f8" />
      <polyline points={deck} fill="none" stroke="#f2f6f8" strokeWidth="3.2" strokeLinejoin="round" />
      <line x1={px(-130)} x2={px(-41)} y1={Y(14.5)} y2={Y(14.5)} stroke="#ffb347" strokeWidth="2" opacity="0" />
      <g transform={`translate(${Math.max(0, Math.min(TOTAL, along))},0)`}>
        <line y1="0" y2={H} stroke="#ffb347" strokeWidth="1.5" opacity="0.6" />
        <circle cy={Y(deckY(along + X_START)) - 2} r={mode === 'orbit' ? 5 : 7} fill="#ffb347" stroke="#0b121b" strokeWidth="2" />
      </g>
    </svg>
  )
}

/* ------------------------------------------------------------------ joystick (touch) */
function Joystick({ onMove }: { onMove: (x: number, y: number) => void }) {
  const [knob, setKnob] = useState({ x: 0, y: 0 })
  const base = useRef<HTMLDivElement>(null)
  const active = useRef(false)
  const handle = (e: React.PointerEvent) => {
    const r = base.current!.getBoundingClientRect()
    let dx = e.clientX - (r.left + r.width / 2)
    let dy = e.clientY - (r.top + r.height / 2)
    const R = r.width / 2 - 18
    const l = Math.hypot(dx, dy)
    if (l > R) (dx = (dx / l) * R), (dy = (dy / l) * R)
    setKnob({ x: dx, y: dy })
    onMove(dx / R, -dy / R)
  }
  return (
    <div
      ref={base}
      className="glass pointer-events-auto relative h-32 w-32 touch-none rounded-full"
      onPointerDown={(e) => {
        active.current = true
        e.currentTarget.setPointerCapture(e.pointerId)
        handle(e)
      }}
      onPointerMove={(e) => active.current && handle(e)}
      onPointerUp={() => {
        active.current = false
        setKnob({ x: 0, y: 0 })
        onMove(0, 0)
      }}
    >
      <div className="absolute left-1/2 top-1/2 h-14 w-14 rounded-full bg-white/70 shadow-lg" style={{ transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))` }} />
    </div>
  )
}

/* ------------------------------------------------------------------ app */
export default function App() {
  const host = useRef<HTMLDivElement>(null)
  const ex = useRef<Experience | null>(null)
  const [progress, setProgress] = useState({ p: 0, label: 'Preparing' })
  const [ready, setReady] = useState(false)
  const [entered, setEntered] = useState(false)
  const [mode, setMode] = useState<Mode>('orbit')
  const [time, setTime] = useState<TimeOfDay>('golden')
  const [status, setStatus] = useState<Status>({ mode: 'orbit', along: 0, z: 0, y: 0 })
  const [vp, setVp] = useState<string | null>('river')
  const [hotspot, setHotspot] = useState<string | null>(null)
  const [locked, setLocked] = useState(false)
  const [sound, setSound] = useState(false)
  const [listOpen, setListOpen] = useState(false)
  const [error, setError] = useState('')
  const [fps, setFps] = useState({ fps: 0, pr: 1 })
  const [quality, setQuality] = useState<'high' | 'balanced'>('high')
  const [toast, setToast] = useState('')
  const touch = useMemo(() => typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches, [])

  useEffect(() => {
    let e: Experience | null = null
    try {
      e = new Experience(host.current!, {
        onProgress: (p, label) => setProgress({ p, label }),
        onReady: () => setReady(true),
        onMode: setMode,
        onStatus: setStatus,
        onHotspot: (id) => setHotspot(id),
        onViewpoint: setVp,
        onLock: setLocked,
        onFps: (f, pr) => setFps({ fps: f, pr }),
      })
      ex.current = e
      ;(window as any).__ex = e
      e.init().catch((err) => {
        console.error(err)
        setError(String(err?.message || err))
      })
    } catch (err: any) {
      setError(err?.message || 'WebGL could not be started on this device.')
    }
    return () => {
      e?.dispose()
      ex.current = null
    }
  }, [])

  useEffect(() => {
    ex.current?.setLabelsVisible(entered)
  }, [entered, ready])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(''), 2600)
    return () => clearTimeout(t)
  }, [toast])

  const enter = useCallback((m: 'walk' | 'orbit') => {
    setEntered(true)
    setSound(true)
    ex.current?.setAudio(true)
    if (m === 'walk') ex.current?.goTo('deck')
    setToast('Tip: keys 1–8 or the list icon jump between viewpoints')
  }, [])
  const changeMode = (m: Mode) => {
    ex.current?.setMode(m)
    setVp(null)
  }
  const changeTime = (t: TimeOfDay) => {
    setTime(t)
    ex.current?.setTime(t)
  }
  const shot = () => {
    const url = ex.current?.screenshot()
    if (!url) return
    const a = document.createElement('a')
    a.href = url
    a.download = `erasmusbrug-${time}.jpg`
    a.click()
    setToast('Screenshot saved')
  }
  const toggleFull = () => {
    if (document.fullscreenElement) document.exitFullscreen()
    else document.documentElement.requestFullscreen?.()
  }
  const hs = HOTSPOTS.find((h) => h.id === hotspot)
  const cur = VIEWPOINTS.find((v) => v.id === vp)
  const along = Math.round(status.along)
  const firstPerson = mode !== 'orbit'

  return (
    <div className="fixed inset-0 select-none overflow-hidden bg-ink text-white">
      <div ref={host} className="absolute inset-0" />

      {/* ------------------------------------------------ loading */}
      {!ready && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[radial-gradient(ellipse_at_50%_30%,#17304a,#0b121b_70%)] px-6 text-center">
          <svg viewBox="0 0 200 90" className="mb-8 w-56 opacity-90">
            <path d="M12 76 H190" stroke="#9fb6c7" strokeWidth="2" />
            <path d="M12 70 Q90 62 190 68" stroke="#e8f0f5" strokeWidth="3" fill="none" />
            <path d="M70 70 L52 8 L60 8 L82 69 Z" fill="#e8f0f5" />
            {Array.from({ length: 12 }).map((_, i) => (
              <line key={i} x1="57" y1={12 + i * 3} x2={92 + i * 8} y2={68 - i * 0.2} stroke="#e8f0f5" strokeWidth="0.6" opacity="0.7" />
            ))}
          </svg>
          <h1 className="font-display text-4xl tracking-tight md:text-5xl">Erasmusbrug</h1>
          <p className="mt-2 text-sm uppercase tracking-[0.3em] text-steel">De Zwaan · Rotterdam</p>
          {error ? (
            <p className="mt-10 max-w-md text-sm text-red-300">{error}</p>
          ) : (
            <>
              <div className="mt-10 h-1 w-72 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-amber transition-all duration-300" style={{ width: `${Math.round(progress.p * 100)}%` }} />
              </div>
              <p className="mt-3 text-xs text-steel">{progress.label}…</p>
            </>
          )}
        </div>
      )}

      {/* ------------------------------------------------ intro card */}
      {ready && !entered && (
        <div className="absolute inset-0 z-40 flex items-end justify-center bg-gradient-to-t from-ink/85 via-ink/10 to-transparent p-6 pb-14 md:items-center md:justify-start md:bg-gradient-to-r md:from-ink/85 md:via-ink/30 md:to-transparent md:p-16">
          <div className="fade-in max-w-lg">
            <p className="text-xs uppercase tracking-[0.35em] text-amber">Rotterdam · Nieuwe Maas · 1996</p>
            <h1 className="font-display mt-3 text-5xl leading-[1.05] md:text-7xl">Erasmusbrug</h1>
            <p className="mt-4 text-base leading-relaxed text-white/80 md:text-lg">
              Step onto “The Swan”. An 802&nbsp;m bridge with a 139&nbsp;m bent steel pylon, 40 stay cables and a bascule span, modelled at true scale. Walk the deck, look up the pylon, fly over the river or watch the lights come on at night.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <button onClick={() => enter('walk')} className="rounded-full bg-amber px-7 py-3 text-sm font-bold text-ink shadow-lg shadow-amber/20 transition hover:scale-[1.03]">
                Walk the bridge
              </button>
              <button onClick={() => enter('orbit')} className="glass rounded-full px-7 py-3 text-sm font-semibold transition hover:bg-white/15">
                Explore from the river
              </button>
            </div>
            <p className="mt-6 text-xs text-white/50">Ambient sound is generated live · best on desktop with a GPU</p>
          </div>
        </div>
      )}

      {/* ------------------------------------------------ HUD */}
      {ready && entered && (
        <>
          {/* top-left */}
          <div className="pointer-events-none absolute left-4 top-4 z-30 max-w-[60vw]">
            <div className="glass pointer-events-auto rounded-2xl px-4 py-2.5">
              <div className="font-display text-lg leading-none">Erasmusbrug</div>
              <div className="mt-1 text-[10px] uppercase tracking-[0.22em] text-steel">{cur ? cur.title : mode === 'walk' ? 'On foot' : mode === 'fly' ? 'Free flight' : 'Orbit view'}</div>
            </div>
            {cur && <p className="fade-in mt-2 hidden max-w-xs text-xs leading-relaxed text-white/80 drop-shadow md:block">{cur.caption}</p>}
          </div>

          {/* top-right */}
          <div className="pointer-events-none absolute right-4 top-4 z-30 flex flex-col items-end gap-2">
            <div className="glass pointer-events-auto flex items-center gap-1 rounded-full p-1">
              {TIMES.map((t) => (
                <button
                  key={t.v}
                  title={t.hint}
                  onClick={() => changeTime(t.v)}
                  className={cn('rounded-full px-3 py-1.5 text-xs font-semibold transition', time === t.v ? 'bg-amber text-ink' : 'text-white/75 hover:text-white')}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className="pointer-events-auto flex gap-1.5">
              <button
                title="Quality"
                onClick={() => {
                  const q = quality === 'high' ? 'balanced' : 'high'
                  setQuality(q)
                  ex.current?.setQuality(q)
                  setToast(q === 'high' ? 'Quality: high' : 'Quality: balanced (faster)')
                }}
                className="glass rounded-full px-3 py-2 text-[11px] font-semibold text-white/80 hover:text-white"
              >
                {quality === 'high' ? 'HQ' : 'SD'} · {Math.round(fps.fps) || '–'} fps
              </button>
              <button
                title={sound ? 'Mute' : 'Sound on'}
                onClick={() => {
                  setSound(!sound)
                  ex.current?.setAudio(!sound)
                }}
                className="glass rounded-full p-2.5 text-white/80 hover:text-white"
              >
                <Ico d={sound ? ICON.sound : ICON.mute} />
              </button>
              <button title="Save screenshot" onClick={shot} className="glass rounded-full p-2.5 text-white/80 hover:text-white">
                <Ico d={ICON.cam} />
              </button>
              <button title="Fullscreen" onClick={toggleFull} className="glass rounded-full p-2.5 text-white/80 hover:text-white">
                <Ico d={ICON.full} />
              </button>
              <button title="Viewpoints" onClick={() => setListOpen(!listOpen)} className={cn('glass rounded-full p-2.5 hover:text-white', listOpen ? 'text-amber' : 'text-white/80')}>
                <Ico d={ICON.list} />
              </button>
            </div>
            {listOpen && (
              <div className="glass scroll-thin pointer-events-auto fade-in max-h-[52vh] w-72 overflow-y-auto rounded-2xl p-2">
                <div className="px-2 pb-1 pt-1 text-[10px] uppercase tracking-[0.22em] text-steel">Viewpoints</div>
                {VIEWPOINTS.map((v, i) => (
                  <button
                    key={v.id}
                    onClick={() => {
                      ex.current?.goTo(v.id)
                      setHotspot(null)
                    }}
                    className={cn('group flex w-full items-start gap-3 rounded-xl px-2.5 py-2 text-left transition hover:bg-white/10', vp === v.id && 'bg-white/10')}
                  >
                    <span className={cn('mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-bold', vp === v.id ? 'bg-amber text-ink' : 'bg-white/15 text-white/80')}>{i + 1}</span>
                    <span>
                      <span className="block text-[13px] font-semibold leading-tight">{v.title}</span>
                      <span className="mt-0.5 block text-[11px] leading-snug text-white/55">{v.mode === 'walk' ? 'On foot' : v.mode === 'fly' ? 'Free camera' : 'Orbit'}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* hotspot panel */}
          {hs && (
            <div className="glass fade-in absolute bottom-28 left-4 z-30 w-[min(22rem,calc(100vw-2rem))] rounded-2xl p-5 md:bottom-auto md:left-4 md:top-28">
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-display text-xl leading-tight">{hs.title}</h3>
                <button onClick={() => setHotspot(null)} className="rounded-full p-1 text-white/60 hover:text-white">
                  <Ico d={ICON.close} />
                </button>
              </div>
              <p className="mt-2 text-[13px] leading-relaxed text-white/80">{hs.body}</p>
              <dl className="mt-4 grid grid-cols-1 gap-1.5">
                {hs.stats.map(([k, v]) => (
                  <div key={k} className="flex items-baseline justify-between gap-4 border-t border-white/10 pt-1.5 text-xs">
                    <dt className="text-steel">{k}</dt>
                    <dd className="text-right font-semibold">{v}</dd>
                  </div>
                ))}
              </dl>
              <button onClick={() => ex.current?.focusHotspot(hs.id)} className="mt-4 rounded-full bg-white/10 px-4 py-1.5 text-xs font-semibold hover:bg-white/20">
                Fly closer
              </button>
            </div>
          )}

          {/* bottom bar */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex flex-col items-center gap-2 p-3 md:flex-row md:items-end md:justify-between md:p-4">
            <div className="pointer-events-auto flex items-center gap-2">
              <div className="glass flex rounded-full p-1">
                {MODES.map((m) => (
                  <button key={m.v} onClick={() => changeMode(m.v)} className={cn('rounded-full px-4 py-1.5 text-left transition', mode === m.v ? 'bg-white text-ink' : 'text-white/75 hover:text-white')}>
                    <span className="block text-xs font-bold leading-tight">{m.label}</span>
                    <span className={cn('hidden text-[9px] leading-tight md:block', mode === m.v ? 'text-ink/60' : 'text-white/40')}>{m.sub}</span>
                  </button>
                ))}
              </div>
              <div className="glass hidden items-center gap-3 rounded-full px-4 py-2 text-[11px] text-white/70 lg:flex">
                {mode === 'orbit' ? (
                  <>
                    <span>
                      <kbd>Drag</kbd> orbit
                    </span>
                    <span>
                      <kbd>Right-drag</kbd> pan
                    </span>
                    <span>
                      <kbd>Scroll</kbd> zoom
                    </span>
                  </>
                ) : (
                  <>
                    <span>
                      <kbd>W</kbd>
                      <kbd>A</kbd>
                      <kbd>S</kbd>
                      <kbd>D</kbd> move
                    </span>
                    <span>
                      <kbd>Shift</kbd> {mode === 'walk' ? 'run' : 'boost'}
                    </span>
                    {mode === 'fly' && (
                      <span>
                        <kbd>Q</kbd>
                        <kbd>E</kbd> down / up
                      </span>
                    )}
                    <span>
                      <kbd>1</kbd>–<kbd>8</kbd> viewpoints
                    </span>
                  </>
                )}
              </div>
            </div>

            <div className="glass pointer-events-auto w-full max-w-md rounded-2xl px-4 pb-2 pt-2.5 md:w-[26rem]">
              <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-[0.2em] text-steel">
                <span className="whitespace-nowrap">South</span>
                <span className="whitespace-nowrap text-white/90">
                  {Math.max(0, Math.min(TOTAL, along))} m / 806 m{status.y > 3 && mode !== 'orbit' ? ` · ${Math.round(status.y)} m up` : ''}
                </span>
                <span className="whitespace-nowrap">North</span>
              </div>
              <Profile along={status.along} mode={mode} onPick={(a) => ex.current?.walkAlong(a)} />
              <div className="mt-0.5 text-center text-[9px] text-white/40">Click the profile to teleport onto the bridge</div>
            </div>
          </div>

          {/* look-around hint (desktop pointer lock) */}
          {firstPerson && !locked && !touch && (
            <div className="pointer-events-none absolute left-1/2 top-24 z-20 -translate-x-1/2">
              <div className="glass fade-in rounded-full px-5 py-2 text-xs text-white/90">Click the scene to look around · <kbd>Esc</kbd> releases the mouse</div>
            </div>
          )}
          {firstPerson && (
            <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/60 shadow" />
          )}

          {touch && firstPerson && (
            <div className="absolute bottom-24 left-5 z-30">
              <Joystick onMove={(x, y) => ex.current?.setMove(x, y)} />
            </div>
          )}

          {mode === 'orbit' && !hs && (
            <div className="pointer-events-none absolute bottom-28 left-1/2 z-20 hidden -translate-x-1/2 md:bottom-4 md:block">
              <div className="text-[11px] text-white/45">Tap the glowing markers to learn how the bridge works</div>
            </div>
          )}

          {toast && <div className="glass fade-in absolute left-1/2 top-20 z-40 -translate-x-1/2 rounded-full px-4 py-2 text-xs">{toast}</div>}
        </>
      )}
    </div>
  )
}

void PYLON_TOP

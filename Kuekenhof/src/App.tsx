import { useCallback, useEffect, useRef, useState } from 'react'
import { KeukenhofExperience, Hud, Pin, Quality, TELEPORTS } from './keukenhof/Experience'
import { MILL, POIS, CAFE, PAVILION, waterSD } from './keukenhof/layout'
import { Minimap } from './components/Minimap'

const isTouch = typeof window !== 'undefined' && (window.matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window)

function defaultQuality(): Quality {
  if (isTouch) return 'low'
  const cores = navigator.hardwareConcurrency || 4
  return cores >= 8 ? 'high' : 'medium'
}

function fmtHour(h: number) {
  const hh = Math.floor(h)
  const mm = Math.round((h - hh) * 60)
  return `${hh}:${mm.toString().padStart(2, '0')}`
}

function placeName(h: Hud) {
  if (h.onGallery) return 'Windmill gallery'
  if (h.indoors) return 'Glasshouse pavilion'
  const dm = Math.hypot(h.x - MILL.x, h.z - MILL.z)
  if (dm < 15) return 'The Windmill'
  if (Math.abs(h.x - CAFE.cx) < CAFE.hx + 14 && Math.abs(h.z - CAFE.cz) < CAFE.hz + 18) return 'Café terrace'
  if (Math.abs(h.x - PAVILION.cx) < PAVILION.hx + 12 && Math.abs(h.z - PAVILION.cz) < PAVILION.hz + 16) return 'Glasshouse plaza'
  if (h.z > 100) return 'Entrance forecourt'
  if (h.z < -92) return 'Canal & bulb fields'
  if (h.z < -2 && waterSD(h.x, h.z) < 16) return 'Water garden'
  return 'Flower gardens'
}

const PRESETS = [
  { label: 'Morning', hour: 8.6 },
  { label: 'Midday', hour: 13.3 },
  { label: 'Afternoon', hour: 16.8 },
  { label: 'Golden hour', hour: 20.0 },
]
const WEATHER = [
  { label: 'Clear', v: 0.12 },
  { label: 'Partly cloudy', v: 0.5 },
  { label: 'Overcast', v: 0.92 },
]

function Icon({ d, className = 'h-5 w-5' }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  )
}
const ICONS = {
  sun: 'M12 3v2M12 19v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M3 12h2M19 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4M12 8a4 4 0 100 8 4 4 0 000-8z',
  pin: 'M12 21s7-6.2 7-11a7 7 0 10-14 0c0 4.8 7 11 7 11zM12 12a2 2 0 100-4 2 2 0 000 4z',
  camera: 'M4 8h3l2-3h6l2 3h3v11H4V8zM12 17a4 4 0 100-8 4 4 0 000 8z',
  sound: 'M4 10v4h4l5 4V6L8 10H4zM16 9a4 4 0 010 6M18.5 6.5a8 8 0 010 11',
  mute: 'M4 10v4h4l5 4V6L8 10H4zM17 9l5 6M22 9l-5 6',
  help: 'M12 17v.01M9.5 9a2.5 2.5 0 115 0c0 1.5-2.5 2-2.5 4M12 21a9 9 0 100-18 9 9 0 000 18z',
  drone: 'M12 12m-2 0a2 2 0 104 0 2 2 0 10-4 0M5 5m-2.5 0a2.5 2.5 0 105 0 2.5 2.5 0 10-5 0M19 5m-2.5 0a2.5 2.5 0 105 0 2.5 2.5 0 10-5 0M5 19m-2.5 0a2.5 2.5 0 105 0 2.5 2.5 0 10-5 0M19 19m-2.5 0a2.5 2.5 0 105 0 2.5 2.5 0 10-5 0M7 7l3 3M17 7l-3 3M7 17l3-3M17 17l-3-3',
  close: 'M6 6l12 12M18 6L6 18',
}

export default function App() {
  const mount = useRef<HTMLDivElement>(null)
  const expRef = useRef<KeukenhofExperience | null>(null)
  const pinEls = useRef<Record<string, HTMLButtonElement | null>>({})
  const [phase, setPhase] = useState<'intro' | 'loading' | 'ready' | 'error'>('intro')
  const [quality, setQuality] = useState<Quality>(defaultQuality())
  const [prog, setProg] = useState({ f: 0, label: 'Preparing' })
  const [hud, setHud] = useState<Hud | null>(null)
  const [locked, setLocked] = useState(false)
  const [freeLook, setFreeLook] = useState(false)
  const [info, setInfo] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [panel, setPanel] = useState<null | 'time' | 'tp' | 'help'>(null)
  const [muted, setMuted] = useState(false)
  const [photo, setPhoto] = useState(false)
  const [hour, setHour] = useState(13.3)
  const [cover, setCover] = useState(0.25)
  const [wind, setWind] = useState(0.6)
  const [err, setErr] = useState('')
  const toastT = useRef<number>(0)
  const hudRef = useRef<Hud | null>(null)

  const showToast = useCallback((m: string) => {
    setToast(m)
    window.clearTimeout(toastT.current)
    toastT.current = window.setTimeout(() => setToast(null), 3200)
  }, [])

  const start = useCallback(async () => {
    if (!mount.current) return
    setPhase('loading')
    const exp = new KeukenhofExperience(mount.current, quality, {
      onProgress: (f, label) => setProg({ f, label }),
      onHud: (h) => {
        hudRef.current = h
        setHud(h)
      },
      onPins: (pins: Pin[]) => {
        for (const p of pins) {
          const el = pinEls.current[p.id]
          if (!el) continue
          el.style.opacity = p.vis ? (p.dist < 70 ? '1' : '0.75') : '0'
          el.style.pointerEvents = p.vis ? 'auto' : 'none'
          el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%) scale(${Math.max(0.65, Math.min(1.1, 60 / Math.max(p.dist, 40)))})`
        }
      },
      onLock: (l) => setLocked(l),
      onToast: showToast,
    })
    expRef.current = exp
    ;(window as unknown as { __kx?: KeukenhofExperience }).__kx = exp
    try {
      await exp.init()
      setPhase('ready')
    } catch (e) {
      console.error(e)
      setErr(e instanceof Error ? e.message : String(e))
      setPhase('error')
    }
  }, [quality, showToast])

  useEffect(
    () => () => {
      expRef.current?.dispose()
      expRef.current = null
    },
    [],
  )

  // keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const exp = expRef.current
      if (!exp || !exp.ready) return
      if (e.code === 'KeyE') {
        const np = hudRef.current?.nearPoi
        setInfo((cur) => (cur ? null : np ?? null))
      } else if (e.code === 'KeyM') {
        setMuted((m) => {
          exp.setMuted(!m)
          return !m
        })
      } else if (e.code === 'KeyP') setPhoto((p) => !p)
      else if (e.code === 'KeyH') setPanel((p) => (p === 'help' ? null : 'help'))
      else if (e.code === 'KeyT') setPanel((p) => (p === 'time' ? null : 'time'))
      else if (e.code === 'KeyG') setPanel((p) => (p === 'tp' ? null : 'tp'))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    const exp = expRef.current
    if (exp?.ready) exp.photo = photo
    if (photo) exp?.exitLock()
  }, [photo])

  const resume = () => {
    setFreeLook(false)
    expRef.current?.requestLock()
  }
  const getPlayer = useCallback(() => expRef.current?.getPlayer() ?? { x: 0, z: 0, yaw: 0 }, [])
  const poi = info ? POIS.find((p) => p.id === info) : null
  const near = hud?.nearPoi ? POIS.find((p) => p.id === hud.nearPoi) : null
  const paused = phase === 'ready' && !locked && !freeLook && !photo && !isTouch && !panel && !info
  const hudVisible = phase === 'ready' && !photo

  const capture = () => {
    const url = expRef.current?.capture()
    if (!url) return
    const a = document.createElement('a')
    a.href = url
    a.download = `keukenhof-${Date.now()}.png`
    a.click()
    showToast('Photo saved')
  }

  return (
    <div className="relative h-full w-full select-none overflow-hidden bg-[#0b140b] text-white">
      <div ref={mount} className="absolute inset-0" />

      {/* ------------------------------------------------ intro */}
      {(phase === 'intro' || phase === 'loading' || phase === 'error') && (
        <div className="absolute inset-0 z-30 flex flex-col overflow-hidden">
          <div className="tulip-stripes absolute inset-0 opacity-90" />
          <div className="absolute inset-0 bg-gradient-to-b from-[#0b140b]/55 via-[#0b140b]/80 to-[#0b140b]" />
          <div className="relative mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-6 text-center">
            <p className="mb-3 text-xs font-medium uppercase tracking-[0.35em] text-pink-200/90">Lisse · The Netherlands</p>
            <h1 className="font-display text-6xl font-bold leading-none tracking-tight sm:text-8xl">Keukenhof</h1>
            <p className="font-display mt-3 text-xl italic text-white/80 sm:text-2xl">Walk through the Garden of Europe</p>
            <p className="mt-6 max-w-xl text-sm leading-relaxed text-white/70">
              A first-person, real-time 3D recreation: stroll tulip-lined avenues, circle the swan lake, climb the 1892 windmill and look out over the bulb fields — with wind, weather and a sun that moves from morning to golden hour.
            </p>

            {phase === 'intro' && (
              <div className="fade-in mt-9 flex flex-col items-center gap-5">
                <div className="glass flex items-center gap-1 rounded-full p-1">
                  {(['low', 'medium', 'high'] as Quality[]).map((q) => (
                    <button key={q} onClick={() => setQuality(q)} className={`rounded-full px-4 py-1.5 text-sm capitalize transition ${quality === q ? 'bg-white text-black' : 'text-white/75 hover:text-white'}`}>
                      {q}
                    </button>
                  ))}
                </div>
                <button onClick={start} className="group rounded-full bg-gradient-to-r from-pink-500 to-orange-400 px-9 py-3.5 text-base font-semibold text-white shadow-xl shadow-pink-900/40 transition hover:scale-[1.03]">
                  Enter the garden <span className="ml-1 inline-block transition group-hover:translate-x-1">→</span>
                </button>
                <p className="text-xs text-white/50">
                  {isTouch ? 'Left thumb moves · right thumb looks' : 'WASD to walk · mouse to look · Shift to run · E to interact'} · headphones recommended
                </p>
              </div>
            )}

            {phase === 'loading' && (
              <div className="fade-in mt-10 w-full max-w-sm">
                <div className="h-1.5 overflow-hidden rounded-full bg-white/15">
                  <div className="h-full rounded-full bg-gradient-to-r from-pink-400 to-amber-300 transition-all duration-300" style={{ width: `${Math.round(prog.f * 100)}%` }} />
                </div>
                <p className="mt-3 text-sm text-white/70">{prog.label}…</p>
              </div>
            )}
            {phase === 'error' && (
              <div className="glass mt-8 max-w-md rounded-2xl p-5 text-left text-sm">
                <p className="font-semibold">Couldn’t start the 3D view</p>
                <p className="mt-1 text-white/70">This experience needs WebGL 2. Try a recent Chrome, Edge, Firefox or Safari with hardware acceleration enabled, or choose the Low quality preset.</p>
                <p className="mt-2 break-words font-mono text-xs text-white/40">{err}</p>
              </div>
            )}
          </div>
          <p className="relative pb-5 text-center text-[11px] text-white/40">Interpretive recreation · generated procedurally in your browser — no photos or models are downloaded</p>
        </div>
      )}

      {/* ------------------------------------------------ crosshair & prompts */}
      {hudVisible && !paused && (
        <>
          <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/80 shadow-[0_0_6px_rgba(0,0,0,0.6)]" />
          {near && !info && (
            <button
              onClick={() => setInfo(near.id)}
              className="glass fade-in absolute bottom-28 left-1/2 z-10 flex -translate-x-1/2 items-center gap-3 rounded-full py-2 pl-2 pr-5 text-sm"
            >
              <kbd className="rounded-md bg-white px-2 py-0.5 text-xs font-bold text-black">E</kbd>
              <span>
                <span className="text-white/60">Discover · </span>
                {near.name}
              </span>
            </button>
          )}
          {hud?.flower && !near && (
            <div className="glass fade-in pointer-events-none absolute bottom-28 left-1/2 z-10 max-w-xs -translate-x-1/2 rounded-2xl px-5 py-3 text-center">
              <p className="text-[10px] uppercase tracking-[0.25em] text-pink-200/80">{hud.flower.kind}</p>
              <p className="font-display text-xl leading-tight">‘{hud.flower.name}’</p>
              <p className="mt-0.5 text-xs text-white/65">{hud.flower.note}</p>
            </div>
          )}
        </>
      )}

      {/* ------------------------------------------------ POI pins */}
      {hudVisible &&
        POIS.map((p) => (
          <button
            key={p.id}
            ref={(el) => {
              pinEls.current[p.id] = el
            }}
            onClick={() => {
              expRef.current?.exitLock()
              setInfo(p.id)
            }}
            style={{ opacity: 0, left: 0, top: 0 }}
            className="absolute z-10 flex items-center gap-2 rounded-full border border-white/40 bg-black/35 py-1 pl-1 pr-3 text-xs font-medium backdrop-blur-md transition-opacity hover:bg-black/55"
          >
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white text-[10px] font-bold text-pink-600">✿</span>
            {p.name}
          </button>
        ))}

      {/* ------------------------------------------------ top bars */}
      {hudVisible && (
        <>
          <div className="pointer-events-none absolute left-4 top-4 z-10">
            <div className="glass rounded-2xl px-4 py-2.5">
              <p className="font-display text-lg leading-none">Keukenhof</p>
              <p className="mt-1 text-xs text-white/70">{hud ? placeName(hud) : '…'}</p>
            </div>
          </div>
          <div className="absolute right-4 top-4 z-20 flex items-center gap-2">
            <ToolBtn label="Teleport (G)" active={panel === 'tp'} onClick={() => setPanel(panel === 'tp' ? null : 'tp')}>
              <Icon d={ICONS.pin} />
            </ToolBtn>
            <ToolBtn label="Time & weather (T)" active={panel === 'time'} onClick={() => setPanel(panel === 'time' ? null : 'time')}>
              <Icon d={ICONS.sun} />
            </ToolBtn>
            <ToolBtn label={hud?.mode === 'fly' ? 'Land (F)' : 'Drone view (F)'} active={hud?.mode === 'fly'} onClick={() => expRef.current?.toggleFly()}>
              <Icon d={ICONS.drone} />
            </ToolBtn>
            <ToolBtn label="Photo mode (P)" onClick={() => setPhoto(true)}>
              <Icon d={ICONS.camera} />
            </ToolBtn>
            <ToolBtn
              label={muted ? 'Unmute (M)' : 'Mute (M)'}
              onClick={() => {
                expRef.current?.setMuted(!muted)
                setMuted(!muted)
              }}
            >
              <Icon d={muted ? ICONS.mute : ICONS.sound} />
            </ToolBtn>
            <ToolBtn label="Help (H)" active={panel === 'help'} onClick={() => setPanel(panel === 'help' ? null : 'help')}>
              <Icon d={ICONS.help} />
            </ToolBtn>
          </div>

          {/* panels */}
          {panel === 'time' && (
            <div className="glass fade-in absolute right-4 top-[72px] z-20 w-80 rounded-2xl p-5">
              <div className="mb-3 flex items-center justify-between">
                <p className="font-display text-lg">Time & weather</p>
                <button onClick={() => setPanel(null)} className="text-white/60 hover:text-white">
                  <Icon d={ICONS.close} className="h-4 w-4" />
                </button>
              </div>
              <div className="mb-1 flex justify-between text-xs text-white/70">
                <span>Time of day</span>
                <span className="tabular-nums">{fmtHour(hour)}</span>
              </div>
              <input
                type="range"
                min={7.5}
                max={20.3}
                step={0.05}
                value={hour}
                onChange={(e) => {
                  const v = +e.target.value
                  setHour(v)
                  expRef.current?.setTime(v)
                }}
                className="w-full"
              />
              <div className="mt-3 flex flex-wrap gap-1.5">
                {PRESETS.map((p) => (
                  <button
                    key={p.label}
                    onClick={() => {
                      setHour(p.hour)
                      expRef.current?.setTime(p.hour)
                    }}
                    className="rounded-full border border-white/25 px-3 py-1 text-xs hover:bg-white/15"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <p className="mb-2 mt-5 text-xs text-white/70">Sky</p>
              <div className="flex gap-1.5">
                {WEATHER.map((w) => (
                  <button
                    key={w.label}
                    onClick={() => {
                      setCover(w.v)
                      expRef.current?.setCover(w.v)
                    }}
                    className={`flex-1 rounded-lg border px-2 py-1.5 text-xs ${Math.abs(cover - w.v) < 0.2 ? 'border-white bg-white text-black' : 'border-white/25 hover:bg-white/15'}`}
                  >
                    {w.label}
                  </button>
                ))}
              </div>
              <div className="mb-1 mt-5 flex justify-between text-xs text-white/70">
                <span>Wind</span>
                <span>{wind < 0.3 ? 'Calm' : wind < 0.9 ? 'Breezy' : 'Gusty'}</span>
              </div>
              <input
                type="range"
                min={0}
                max={1.6}
                step={0.02}
                value={wind}
                onChange={(e) => {
                  const v = +e.target.value
                  setWind(v)
                  expRef.current?.setWind(v)
                }}
                className="w-full"
              />
              <label className="mt-5 flex items-center gap-2 text-xs text-white/70">
                <input
                  type="checkbox"
                  defaultChecked
                  onChange={(e) => {
                    if (expRef.current) expRef.current.autoQuality = e.target.checked
                  }}
                />
                Adaptive resolution ({hud?.fps ?? 0} fps · {hud?.dpr ?? 1}× render scale)
              </label>
            </div>
          )}
          {panel === 'tp' && (
            <div className="glass fade-in absolute right-4 top-[72px] z-20 w-72 rounded-2xl p-3">
              <p className="font-display px-2 pb-2 pt-1 text-lg">Go to…</p>
              {TELEPORTS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    expRef.current?.teleport(t.id)
                    setPanel(null)
                    if (!isTouch) resume()
                  }}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm hover:bg-white/15"
                >
                  <span className="text-pink-300">✿</span>
                  {t.label}
                </button>
              ))}
            </div>
          )}
          {panel === 'help' && (
            <div className="glass fade-in absolute right-4 top-[72px] z-20 w-80 rounded-2xl p-5 text-sm">
              <p className="font-display mb-3 text-lg">Controls</p>
              <ul className="space-y-1.5 text-white/80">
                {[
                  ['W A S D / arrows', 'Walk'],
                  ['Mouse', 'Look around'],
                  ['Shift', 'Run'],
                  ['E', 'Read about what’s ahead'],
                  ['F', 'Toggle drone view (Space / C = up / down)'],
                  ['G · T · P · M', 'Teleport · Time · Photo · Mute'],
                  ['Esc', 'Release mouse'],
                ].map(([k, v]) => (
                  <li key={k} className="flex justify-between gap-3">
                    <kbd className="whitespace-nowrap rounded bg-white/15 px-1.5 text-xs leading-6">{k}</kbd>
                    <span className="text-right text-xs leading-6">{v}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-xs leading-relaxed text-white/55">
                Tip: look down at any flower bed to learn the cultivar. Walk up the stairs of the windmill for the view over the bulb fields. Beds are off-limits — as in the real garden, please don’t walk on the flowers.
              </p>
            </div>
          )}

          {/* minimap */}
          <div className="absolute bottom-4 right-4 z-10 hidden sm:block">
            <Minimap getPlayer={getPlayer} onPick={(x, z) => expRef.current?.teleportXZ(x, z)} />
          </div>
          <div className="pointer-events-none absolute bottom-4 left-4 z-10 hidden text-xs text-white/70 sm:block">
            <div className="glass rounded-xl px-3 py-2">
              <span className="text-white/50">WASD</span> move · <span className="text-white/50">Shift</span> run · <span className="text-white/50">E</span> discover · <span className="text-white/50">F</span> drone
            </div>
          </div>
          {isTouch && (
            <div className="absolute bottom-6 right-5 z-10 flex flex-col gap-3">
              <button onClick={() => near && setInfo(near.id)} className="glass h-14 w-14 rounded-full text-lg font-bold">
                E
              </button>
              <button onClick={() => expRef.current?.toggleFly()} className="glass flex h-14 w-14 items-center justify-center rounded-full">
                <Icon d={ICONS.drone} />
              </button>
            </div>
          )}
        </>
      )}

      {/* ------------------------------------------------ info card */}
      {poi && (
        <div className="glass fade-in absolute bottom-6 left-1/2 z-30 w-[min(92vw,34rem)] -translate-x-1/2 rounded-3xl p-6 sm:left-6 sm:translate-x-0">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-[0.3em] text-pink-200/90">{poi.tag}</p>
              <h2 className="font-display mt-1 text-3xl leading-tight">{poi.name}</h2>
            </div>
            <button onClick={() => setInfo(null)} className="rounded-full p-1.5 text-white/60 hover:bg-white/15 hover:text-white">
              <Icon d={ICONS.close} />
            </button>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-white/80">{poi.text}</p>
          <dl className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
            {poi.facts.map(([k, v]) => (
              <div key={k} className="rounded-xl bg-white/8 px-3 py-2">
                <dt className="text-[10px] uppercase tracking-wider text-white/50">{k}</dt>
                <dd className="mt-0.5 text-sm font-medium">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-4 flex gap-2">
            {TELEPORTS.find((t) => t.id === poi.id) && (
              <button
                onClick={() => {
                  expRef.current?.teleport(poi.id)
                  setInfo(null)
                  if (!isTouch) resume()
                }}
                className="rounded-full bg-white px-4 py-1.5 text-sm font-semibold text-black hover:bg-pink-100"
              >
                Take me there
              </button>
            )}
            <button
              onClick={() => {
                setInfo(null)
                if (!isTouch) resume()
              }}
              className="rounded-full border border-white/30 px-4 py-1.5 text-sm hover:bg-white/15"
            >
              Keep exploring
            </button>
          </div>
        </div>
      )}

      {/* ------------------------------------------------ pause overlay */}
      {paused && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/35 backdrop-blur-[3px]">
          <div className="glass fade-in max-w-md rounded-3xl p-8 text-center">
            <h2 className="font-display text-3xl">Ready to wander?</h2>
            <p className="mt-2 text-sm text-white/70">Click to capture your mouse and look around. Press Esc any time to pause.</p>
            <button onClick={resume} className="mt-6 rounded-full bg-gradient-to-r from-pink-500 to-orange-400 px-8 py-3 font-semibold shadow-lg">
              Start walking
            </button>
            <button onClick={() => setFreeLook(true)} className="mt-3 block w-full text-xs text-white/50 underline-offset-2 hover:text-white/80 hover:underline">
              Continue without mouse capture (drag to look)
            </button>
            <p className="mt-5 text-xs text-white/45">WASD walk · Shift run · E discover · F drone · G teleport · T time & weather · P photo</p>
          </div>
        </div>
      )}

      {/* ------------------------------------------------ photo mode */}
      {phase === 'ready' && photo && (
        <div className="absolute inset-x-0 bottom-6 z-30 flex justify-center gap-3">
          <button onClick={capture} className="rounded-full bg-white px-6 py-3 text-sm font-semibold text-black shadow-xl hover:bg-pink-100">
            Save photo
          </button>
          <button onClick={() => setPhoto(false)} className="glass rounded-full px-6 py-3 text-sm">
            Back to walking
          </button>
        </div>
      )}

      {toast && <div className="glass fade-in pointer-events-none absolute left-1/2 top-20 z-30 -translate-x-1/2 rounded-full px-5 py-2 text-sm">{toast}</div>}
    </div>
  )
}

function ToolBtn({ children, label, onClick, active }: { children: React.ReactNode; label: string; onClick: () => void; active?: boolean }) {
  return (
    <button onClick={onClick} title={label} aria-label={label} className={`glass flex h-11 w-11 items-center justify-center rounded-full transition hover:bg-white/20 ${active ? '!bg-white !text-black' : ''}`}>
      {children}
    </button>
  )
}

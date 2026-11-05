import { useCallback, useEffect, useRef, useState } from 'react'
import { ArtisWorld, Mode, Quality, TimeOfDay, WorldState } from './artis/world'
import { POIS } from './artis/data'
import Minimap from './components/Minimap'
import { cn } from './utils/cn'

const ICON: Record<string, string> = {
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0-13v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4',
  dusk: 'M3 18h18M6 18a6 6 0 0 1 12 0M12 6v3M4.5 10.5l1.8 1.8M19.5 10.5l-1.8 1.8',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z',
  walk: 'M13 4.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0ZM9 21l2-6-2-2 1-5 3 3 3 1M13 13l2 3 1 5',
  aerial: 'M12 3 3 8l9 5 9-5-9-5ZM3 12l9 5 9-5M3 16l9 5 9-5',
  list: 'M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01',
  vol: 'M11 5 6 9H3v6h3l5 4V5Zm4.5 3.5a5 5 0 0 1 0 7M18 6a8.5 8.5 0 0 1 0 12',
  mute: 'M11 5 6 9H3v6h3l5 4V5ZM22 9l-6 6m0-6 6 6',
  full: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  close: 'M6 6l12 12M18 6 6 18',
  pin: 'M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11Zm0-8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-10v6m0-9.5v.01',
}
function Icon({ n, className }: { n: keyof typeof ICON; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn('h-4 w-4 shrink-0', className)} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={ICON[n]} />
    </svg>
  )
}

function Seg<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { v: T; label: string; icon?: keyof typeof ICON }[] }) {
  return (
    <div className="glass flex rounded-full p-0.5">
      {items.map((it) => (
        <button
          key={it.v}
          onClick={() => onChange(it.v)}
          title={it.label}
          className={cn(
            'flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[11px] font-semibold tracking-wide transition',
            value === it.v ? 'bg-[var(--gold)] text-[var(--ink)] shadow' : 'text-white/75 hover:text-white',
          )}
        >
          {it.icon && <Icon n={it.icon} />}
          <span className={it.icon ? 'hidden lg:inline' : ''}>{it.label}</span>
        </button>
      ))}
    </div>
  )
}

function IconBtn({ n, on, onClick, title }: { n: keyof typeof ICON; on?: boolean; onClick: () => void; title: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn('glass flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-white/15', on ? 'text-[var(--gold)]' : 'text-white/80')}
    >
      <Icon n={n} className="h-[18px] w-[18px]" />
    </button>
  )
}

export default function App() {
  const host = useRef<HTMLDivElement>(null)
  const worldRef = useRef<ArtisWorld | null>(null)
  const pos = useRef({ x: 0, z: 79, yaw: 0 })
  const mapPing = useRef<() => void>(() => {})
  const [progress, setProgress] = useState({ p: 0, label: 'Preparing' })
  const [ready, setReady] = useState(false)
  const [entered, setEntered] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  const [tod, setTod] = useState<TimeOfDay>('day')
  const [mode, setMode] = useState<Mode>('walk')
  const [quality, setQuality] = useState<Quality>(() => (typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches ? 'low' : 'high'))
  const [muted, setMuted] = useState(false)
  const [panel, setPanel] = useState(() => (typeof window !== 'undefined' ? window.innerWidth > 900 : true))
  const [sel, setSel] = useState<string | null>(null)
  const [hud, setHud] = useState<{ area: string; poi: string | null; inside: number }>({ area: 'Plantage Kerklaan', poi: null, inside: 0 })
  const [fade, setFade] = useState(false)
  const [lock, setLock] = useState(false)
  const [hint, setHint] = useState(true)
  const [joy, setJoy] = useState({ active: false, ox: 0, oy: 0, x: 0, y: 0 })
  const enteredRef = useRef(false)

  useEffect(() => {
    if (!host.current) return
    let dead = false
    const w = new ArtisWorld(host.current, {
      onProgress: (p, label) => !dead && setProgress({ p, label }),
      onState: (s: WorldState) => {
        pos.current = { x: s.x, z: s.z, yaw: s.yaw }
        mapPing.current()
        setHud((h) => (h.area === s.area && h.poi === s.poi && Math.abs(h.inside - s.inside) < 0.2 ? h : { area: s.area, poi: s.poi, inside: s.inside }))
      },
      onFade: setFade,
      onLock: setLock,
      onJoy: setJoy,
      onPoi: (id) => {
        setSel(id)
      },
    })
    w.quality = quality
    worldRef.current = w
    w.init()
      .then(() => !dead && setReady(true))
      .catch((e) => {
        console.error(e)
        if (!dead) setFailed(String(e?.message ?? e))
      })
    return () => {
      dead = true
      worldRef.current = null
      try {
        w.dispose()
      } catch {
        /* ignore */
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const enter = useCallback(() => {
    setEntered(true)
    enteredRef.current = true
    worldRef.current?.startAudio()
    setTimeout(() => setHint(false), 22000)
  }, [])

  const changeTod = useCallback((t: TimeOfDay) => {
    setTod(t)
    worldRef.current?.setTime(t)
  }, [])
  const changeMode = useCallback((m: Mode) => {
    setMode(m)
    worldRef.current?.setMode(m)
  }, [])
  const changeQ = useCallback((q: Quality) => {
    setQuality(q)
    worldRef.current?.setQuality(q)
  }, [])
  const toggleMute = useCallback(() => {
    setMuted((m) => {
      worldRef.current?.setMuted(!m)
      return !m
    })
  }, [])
  const visit = useCallback((id: string) => {
    setSel(id)
    worldRef.current?.goTo(id)
    if (window.innerWidth < 900) setPanel(false)
  }, [])
  const fullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void document.documentElement.requestFullscreen?.()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!enteredRef.current || e.repeat) return
      const order: TimeOfDay[] = ['day', 'golden', 'night']
      if (e.code === 'KeyT') setTod((t) => {
        const n = order[(order.indexOf(t) + 1) % 3]
        worldRef.current?.setTime(n)
        return n
      })
      else if (e.code === 'KeyV') setMode((m) => {
        const n: Mode = m === 'walk' ? 'aerial' : 'walk'
        worldRef.current?.setMode(n)
        return n
      })
      else if (e.code === 'KeyM') toggleMute()
      else if (e.code === 'KeyP') setPanel((p) => !p)
      else if (e.code === 'KeyF') fullscreen()
      else if (/^Digit[1-8]$/.test(e.code)) {
        const p = POIS[Number(e.code.slice(5)) - 1]
        if (p) visit(p.id)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggleMute, fullscreen, visit])

  const activeId = sel ?? hud.poi
  const active = POIS.find((p) => p.id === activeId) ?? null

  return (
    <div className="relative h-full w-full select-none overflow-hidden bg-[var(--ink)] text-[var(--cream)]">
      <div ref={host} className="absolute inset-0" />

      {/* fade overlay */}
      <div className={cn('pointer-events-none absolute inset-0 bg-black transition-opacity duration-300', fade ? 'opacity-100' : 'opacity-0')} />

      {/* touch joystick */}
      {joy.active && (
        <div className="pointer-events-none absolute z-20" style={{ left: joy.ox - 56, top: joy.oy - 56 }}>
          <div className="h-28 w-28 rounded-full border border-white/30 bg-white/10 backdrop-blur-sm" />
          <div className="absolute h-12 w-12 rounded-full border border-white/50 bg-white/30" style={{ left: 28 + joy.x, top: 28 + joy.y }} />
        </div>
      )}

      {/* HUD */}
      {entered && (
        <>
          <div className="pointer-events-none absolute left-4 top-4 z-10 flex flex-col gap-2">
            <div className="glass flex items-center gap-3 rounded-2xl px-4 py-2.5">
              <div className="font-display text-2xl font-semibold leading-none tracking-[0.18em] text-[var(--gold)]">ARTIS</div>
              <div className="h-6 w-px bg-white/20" />
              <div className="leading-tight">
                <div className="text-[10px] uppercase tracking-[0.2em] text-white/50">You are in</div>
                <div className="text-sm font-semibold">{hud.area}</div>
              </div>
            </div>
          </div>

          <div className="absolute right-4 top-4 z-10 flex flex-wrap items-center justify-end gap-2">
            <Seg
              value={tod}
              onChange={changeTod}
              items={[
                { v: 'day', label: 'Day', icon: 'sun' },
                { v: 'golden', label: 'Golden hour', icon: 'dusk' },
                { v: 'night', label: 'Night', icon: 'moon' },
              ]}
            />
            <Seg
              value={mode}
              onChange={changeMode}
              items={[
                { v: 'walk', label: 'Walk', icon: 'walk' },
                { v: 'aerial', label: 'Aerial', icon: 'aerial' },
              ]}
            />
            <Seg
              value={quality}
              onChange={changeQ}
              items={[
                { v: 'low', label: 'Fast' },
                { v: 'medium', label: 'Balanced' },
                { v: 'high', label: 'Ultra' },
              ]}
            />
            <IconBtn n={muted ? 'mute' : 'vol'} on={!muted} onClick={toggleMute} title="Sound (M)" />
            <IconBtn n="full" onClick={fullscreen} title="Fullscreen (F)" />
            <IconBtn n="list" on={panel} onClick={() => setPanel((p) => !p)} title="Places (P)" />
          </div>

          {/* minimap */}
          <div className="absolute bottom-4 left-4 z-10">
            <Minimap pos={pos} register={(f) => (mapPing.current = f)} onPick={visit} />
          </div>

          {/* hint */}
          {hint && mode === 'walk' && (
            <div className={cn('pointer-events-none absolute bottom-5 z-10 hidden justify-center md:flex', panel ? 'left-[230px] right-[400px]' : 'left-[230px] right-4')}>
              <div className="glass flex items-center gap-4 rounded-full px-5 py-2 text-[11px] text-white/80">
                <span><Key>W</Key><Key>A</Key><Key>S</Key><Key>D</Key> walk</span>
                <span><Key>Shift</Key> run</span>
                <span>{lock ? <><Key>Esc</Key> release mouse</> : <>drag or click to look</>}</span>
                <span><Key>T</Key> time</span>
                <span><Key>V</Key> aerial</span>
                <span><Key>1</Key>–<Key>8</Key> places</span>
              </div>
            </div>
          )}
          {mode === 'aerial' && (
            <div className="pointer-events-none absolute bottom-5 left-1/2 z-10 -translate-x-1/2">
              <div className="glass rounded-full px-5 py-2 text-[11px] text-white/80">Drag to orbit · scroll to zoom · right-drag to pan · tap a label to descend</div>
            </div>
          )}

          {/* side panel */}
          <aside
            className={cn(
              'glass-strong absolute bottom-4 right-4 top-[68px] z-10 flex w-[min(92vw,370px)] flex-col overflow-hidden rounded-2xl transition-all duration-300',
              panel ? 'translate-x-0 opacity-100' : 'pointer-events-none translate-x-8 opacity-0',
            )}
          >
            <div className="flex items-center justify-between px-5 pb-2 pt-4">
              <div>
                <div className="text-[10px] uppercase tracking-[0.22em] text-[var(--gold)]">Natura Artis Magistra</div>
                <div className="font-display text-2xl font-semibold leading-tight">Amsterdam Royal Zoo</div>
              </div>
              <button onClick={() => setPanel(false)} className="rounded-full p-1.5 text-white/60 hover:bg-white/10 hover:text-white">
                <Icon n="close" />
              </button>
            </div>
            <div className="scroll-slim flex-1 overflow-y-auto px-3 pb-4">
              {active && (
                <div className="mx-2 mb-3 rounded-xl border border-[var(--gold)]/30 bg-black/25 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-display text-xl font-semibold leading-tight">{active.name}</div>
                      <div className="text-[11px] italic text-white/50">{active.nl}</div>
                    </div>
                    <div className="rounded-md bg-[var(--gold)]/15 px-2 py-1 text-[11px] font-semibold text-[var(--gold)]">{active.year}</div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] uppercase tracking-wider text-white/60">
                    <span className="rounded-full border border-white/15 px-2 py-0.5">{active.tag}</span>
                    <span className="rounded-full border border-white/15 px-2 py-0.5">{active.architect}</span>
                  </div>
                  <p className="mt-3 text-[13px] leading-relaxed text-white/80">{active.blurb}</p>
                  <ul className="mt-3 space-y-1.5">
                    {active.facts.map((f) => (
                      <li key={f} className="flex gap-2 text-[12px] leading-snug text-white/70">
                        <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[var(--gold)]" />
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="px-2 pb-1 pt-1 text-[10px] uppercase tracking-[0.2em] text-white/40">Places to visit</div>
              <div className="space-y-1">
                {POIS.map((p, i) => (
                  <button
                    key={p.id}
                    onClick={() => visit(p.id)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-white/10',
                      activeId === p.id ? 'bg-white/10' : '',
                    )}
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--gold)]/50 text-[11px] font-bold text-[var(--gold)]">{i + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{p.name}</span>
                      <span className="block truncate text-[11px] text-white/45">{p.tag}</span>
                    </span>
                    <Icon n="pin" className="text-white/30" />
                  </button>
                ))}
              </div>
              <p className="mx-2 mt-4 flex gap-2 text-[11px] leading-relaxed text-white/40">
                <Icon n="info" className="mt-0.5" />
                An artistic reconstruction built from public descriptions and photographs of ARTIS. Proportions and details are approximations, not survey data. Textures: Poly Haven (CC0).
              </p>
            </div>
          </aside>
        </>
      )}

      {/* intro / loading */}
      <div
        className={cn(
          'absolute inset-0 z-30 flex items-center justify-center transition-all duration-1000',
          entered ? 'pointer-events-none opacity-0' : 'opacity-100',
          ready ? 'bg-gradient-to-t from-[#0d1813] via-[#0d1813]/55 to-[#0d1813]/20' : 'bg-[#0d1813]',
        )}
      >
        <div className="mx-6 max-w-xl text-center">
          <div className="mb-3 text-[11px] uppercase tracking-[0.4em] text-[var(--gold)]">Amsterdam · Plantage · since 1838</div>
          <h1 className="font-display text-7xl font-semibold tracking-[0.2em] text-[var(--cream)] drop-shadow-[0_4px_30px_rgba(0,0,0,0.6)] md:text-8xl">ARTIS</h1>
          <div className="mx-auto my-4 h-px w-40 bg-gradient-to-r from-transparent via-[var(--gold)] to-transparent" />
          <p className="font-display text-xl italic text-white/80">Natura Artis Magistra — nature is the teacher of art</p>
          <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-white/60">
            Step through the gilded gate and walk the historic grounds of the Netherlands’ oldest zoo: the Groote Museum, the 1882 Aquarium with its temple front and copper dome, and the flamingo pond.
          </p>
          <div className="mt-8 h-[66px]">
            {failed ? (
              <div className="text-sm text-red-300">Could not start the 3D renderer: {failed}</div>
            ) : !ready ? (
              <div className="mx-auto w-72">
                <div className="h-1 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-[var(--gold)] transition-all duration-300" style={{ width: `${progress.p * 100}%` }} />
                </div>
                <div className="mt-3 text-xs text-white/50">{progress.label}…</div>
              </div>
            ) : (
              <button
                onClick={enter}
                className="rounded-full bg-[var(--gold)] px-10 py-3.5 text-sm font-bold uppercase tracking-[0.22em] text-[var(--ink)] shadow-[0_8px_40px_rgba(217,178,74,0.35)] transition hover:scale-105 hover:bg-[#ecc863]"
              >
                Enter ARTIS
              </button>
            )}
          </div>
          <div className="mt-6 text-[11px] text-white/35">Headphones recommended · WASD / arrow keys · mouse or touch to look</div>
        </div>
      </div>
    </div>
  )
}

function Key({ children }: { children: React.ReactNode }) {
  return <kbd className="mx-0.5 rounded border border-white/25 bg-white/10 px-1.5 py-0.5 font-mono text-[10px] text-white">{children}</kbd>
}

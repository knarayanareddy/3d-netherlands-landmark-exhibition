import { useCallback, useEffect, useRef, useState } from 'react'
import { MuseumEngine, Mode, TimeOfDay } from './museum/engine'
import { PaintingDef } from './museum/paintings'
import type { Seg } from './museum/builder'
import { cn } from './utils/cn'

const ICON: Record<string, string> = {
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0-13v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4',
  dusk: 'M3 18h18M6 18a6 6 0 0 1 12 0M12 6v3M4.5 10.5l1.8 1.8M19.5 10.5l-1.8 1.8',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z',
  walk: 'M13 4.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0ZM9 21l2-6-2-2 1-5 3 3 3 1M13 13l2 3 1 5',
  orbit: 'M12 3a9 9 0 1 0 9 9M12 3v4m0-4 3 2M3 12h4m-4 0 2 3m7-3a3 3 0 1 0 6 0 3 3 0 0 0-6 0',
  sound: 'M4 9v6h4l5 4V5L8 9H4Zm13 0a4 4 0 0 1 0 6m2-9a8 8 0 0 1 0 12',
  mute: 'M4 9v6h4l5 4V5L8 9H4Zm13 1 5 4m0-4-5 4',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  stairs: 'M3 20h5v-4h5v-4h5V8h3',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
}
function Icon({ n, className }: { n: keyof typeof ICON; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn('h-4 w-4 shrink-0', className)} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={ICON[n]} />
    </svg>
  )
}

/* ------------------------------------------------------------ minimap */
function Minimap({ segs, pose }: { segs: Seg[]; pose: { x: number; y: number; z: number; yaw: number } }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const S = 2.4
  const X0 = -44, Z0 = -28, W = 112, H = 66
  useEffect(() => {
    const c = ref.current
    if (!c) return
    const g = c.getContext('2d')!
    const dpr = 2
    c.width = W * S * dpr; c.height = H * S * dpr
    g.setTransform(dpr * S, 0, 0, dpr * S, 0, 0)
    g.clearRect(0, 0, W, H)
    g.fillStyle = 'rgba(14,18,22,0.0)'
    g.fillRect(0, 0, W, H)
    const eye = pose.y + 1.2
    g.strokeStyle = 'rgba(255,255,255,0.78)'
    g.lineWidth = 0.35
    g.lineCap = 'round'
    g.beginPath()
    for (const s of segs) {
      if (s.y0 > eye || s.y1 < eye) continue
      g.moveTo(s.x0 - X0, s.z0 - Z0)
      g.lineTo(s.x1 - X0, s.z1 - Z0)
    }
    g.stroke()
    const px = pose.x - X0, pz = pose.z - Z0
    g.save()
    g.translate(px, pz)
    g.rotate(-pose.yaw + Math.PI)
    g.fillStyle = 'rgba(242,194,48,0.25)'
    g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, 9, Math.PI / 2 - 0.55, Math.PI / 2 + 0.55); g.closePath(); g.fill()
    g.restore()
    g.fillStyle = '#f2c230'
    g.beginPath(); g.arc(px, pz, 1.5, 0, Math.PI * 2); g.fill()
    g.strokeStyle = '#0d1114'; g.lineWidth = 0.4; g.stroke()
  }, [segs, pose])
  return <canvas ref={ref} style={{ width: W * S, height: H * S }} className="block max-w-[44vw]" />
}

/* ---------------------------------------------------------------- app */
const TIMES: { v: TimeOfDay; label: string; icon: keyof typeof ICON }[] = [
  { v: 'day', label: 'Day', icon: 'sun' },
  { v: 'golden', label: 'Golden', icon: 'dusk' },
  { v: 'night', label: 'Night', icon: 'moon' },
]

export default function App() {
  const host = useRef<HTMLDivElement>(null)
  const eng = useRef<MuseumEngine | null>(null)
  const [progress, setProgress] = useState({ p: 0, label: 'Preparing the museum' })
  const [ready, setReady] = useState(false)
  const [entered, setEntered] = useState(false)
  const [mode, setMode] = useState<Mode>('orbit')
  const [time, setTime] = useState<TimeOfDay>('golden')
  const [zone, setZone] = useState('Museumplein')
  const [focus, setFocus] = useState<PaintingDef | null>(null)
  const [pose, setPose] = useState({ x: 10, y: 0, z: 44, yaw: 0 })
  const [segs, setSegs] = useState<Seg[]>([])
  const [tps, setTps] = useState<{ id: string; label: string }[]>([])
  const [muted, setMuted] = useState(false)
  const [locked, setLocked] = useState(false)
  const [hint, setHint] = useState(true)
  const [err, setErr] = useState('')
  const [fade, setFade] = useState(false)

  useEffect(() => {
    let e: MuseumEngine
    try {
      e = new MuseumEngine(host.current!, {
        onProgress: (p, label) => setProgress({ p, label }),
        onZone: setZone,
        onFocus: setFocus,
        onMode: setMode,
        onPose: (x, y, z, yaw) => setPose({ x, y, z, yaw }),
        onLock: setLocked,
      })
    } catch (er) {
      setErr(String(er))
      return
    }
    eng.current = e
    e.start()
      .then(() => {
        if (eng.current !== e) return
        setSegs(e.getSegs())
        setTps(e.getTeleports())
        setReady(true)
      })
      .catch((er) => setErr(String(er?.message ?? er)))
    return () => {
      e.dispose()
      eng.current = null
    }
  }, [])

  useEffect(() => {
    if (!entered || mode !== 'walk') return
    setHint(true)
    const t = setTimeout(() => setHint(false), 12000)
    return () => clearTimeout(t)
  }, [entered, mode])

  const enter = (walk: boolean) => {
    setEntered(true)
    eng.current?.startAudio()
    if (walk) eng.current?.setMode('walk')
  }
  const changeTime = (t: TimeOfDay) => {
    setFade(true)
    setTimeout(() => {
      setTime(t)
      eng.current?.setTime(t)
      setFade(false)
    }, 180)
  }
  const go = useCallback((id: string) => eng.current?.teleport(id), [])
  const toggleMute = () => {
    setMuted((m) => {
      eng.current?.setMuted(!m)
      return !m
    })
  }
  const panel = 'rounded-2xl border border-white/10 bg-[#0d1114]/70 backdrop-blur-md shadow-xl shadow-black/30'

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#0d1114] text-white select-none">
      <div ref={host} className="absolute inset-0" />
      <div className={cn('pointer-events-none absolute inset-0 bg-black transition-opacity duration-200', fade ? 'opacity-60' : 'opacity-0')} />

      {/* crosshair */}
      {entered && mode === 'walk' && !focus && (
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/70 shadow ring-1 ring-black/30" />
      )}

      {/* ---------------- HUD ---------------- */}
      {ready && entered && (
        <>
          <div className="pointer-events-none absolute left-4 top-4 flex flex-col gap-2 fade-up">
            <div className={cn(panel, 'pointer-events-auto flex items-center gap-3 px-4 py-2.5')}>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#f2c230] text-[#1b1a19]">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="3.2" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" /></svg>
              </div>
              <div className="leading-tight">
                <div className="serif text-[15px] font-semibold tracking-wide">Van Gogh Museum</div>
                <div className="text-[11px] text-white/60">{mode === 'walk' ? zone : 'Overview · drag to orbit, scroll to zoom'}</div>
              </div>
            </div>
          </div>

          <div className="absolute right-4 top-4 flex flex-wrap items-center justify-end gap-2 fade-up">
            <div className={cn(panel, 'flex p-1')}>
              {TIMES.map((t) => (
                <button key={t.v} onClick={() => changeTime(t.v)} title={t.label}
                  className={cn('flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition', time === t.v ? 'bg-[#f2c230] text-[#1b1a19]' : 'text-white/70 hover:text-white')}>
                  <Icon n={t.icon} /> <span className="hidden sm:inline">{t.label}</span>
                </button>
              ))}
            </div>
            <div className={cn(panel, 'flex p-1')}>
              <button onClick={() => eng.current?.setMode('orbit')} className={cn('flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition', mode === 'orbit' ? 'bg-[#f2c230] text-[#1b1a19]' : 'text-white/70 hover:text-white')}>
                <Icon n="orbit" /> <span className="hidden sm:inline">Overview</span>
              </button>
              <button onClick={() => eng.current?.setMode('walk')} className={cn('flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition', mode === 'walk' ? 'bg-[#f2c230] text-[#1b1a19]' : 'text-white/70 hover:text-white')}>
                <Icon n="walk" /> <span className="hidden sm:inline">Walk</span>
              </button>
            </div>
            <div className={cn(panel, 'flex items-center p-1 text-white/80')}>
              <button onClick={() => eng.current?.adjustExposure(1 / 1.15)} title="Darker" className="rounded-lg p-2 hover:text-white"><Icon n="minus" /></button>
              <Icon n="eye" className="text-white/50" />
              <button onClick={() => eng.current?.adjustExposure(1.15)} title="Brighter" className="rounded-lg p-2 hover:text-white"><Icon n="plus" /></button>
              <button onClick={toggleMute} title={muted ? 'Unmute' : 'Mute'} className="ml-1 rounded-lg p-2 hover:text-white"><Icon n={muted ? 'mute' : 'sound'} /></button>
            </div>
          </div>

          {/* teleports */}
          <div className="absolute bottom-4 left-4 fade-up">
            <div className={cn(panel, 'w-56 p-2')}>
              <div className="flex items-center gap-2 px-2 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/50"><Icon n="stairs" className="h-3.5 w-3.5" /> Go to</div>
              <div className="flex flex-col">
                {tps.map((t) => (
                  <button key={t.id} onClick={() => go(t.id)} className="rounded-lg px-2.5 py-1.5 text-left text-[13px] text-white/80 transition hover:bg-white/10 hover:text-white">{t.label}</button>
                ))}
              </div>
            </div>
          </div>

          {/* minimap */}
          {mode === 'walk' && (
            <div className="absolute bottom-4 right-4 fade-up">
              <div className={cn(panel, 'p-2')}>
                <Minimap segs={segs} pose={pose} />
              </div>
            </div>
          )}

          {/* painting card */}
          {focus && mode === 'walk' && (
            <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center px-3 sm:inset-x-auto sm:bottom-auto sm:right-4 sm:top-24 sm:w-[21rem] sm:justify-end sm:px-0">
              <div className={cn(panel, 'fade-up pointer-events-auto max-w-lg px-5 py-4 sm:max-w-none')}>
                <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#f2c230]">{focus.place} · {focus.year}</div>
                <div className="serif mt-1 text-xl font-semibold">{focus.title}</div>
                <div className="mt-0.5 text-xs text-white/50">Vincent van Gogh · Oil on canvas · {focus.dims}</div>
                <p className="mt-2 text-[13px] leading-relaxed text-white/80">{focus.text}</p>
                <button onClick={() => eng.current?.inspect(focus)} className="mt-3 rounded-full bg-[#f2c230] px-4 py-1.5 text-xs font-semibold text-[#1b1a19] transition hover:brightness-110">Step closer · E</button>
              </div>
            </div>
          )}

          {/* controls hint */}
          {mode === 'walk' && hint && !focus && (
            <div className="pointer-events-none absolute inset-x-0 bottom-6 flex justify-center px-4">
              <div className={cn(panel, 'fade-up flex flex-wrap items-center justify-center gap-x-5 gap-y-1 px-5 py-2.5 text-xs text-white/75')}>
                <span><b className="text-white">WASD</b> move</span>
                <span><b className="text-white">Shift</b> run</span>
                <span><b className="text-white">Drag</b> / click to look</span>
                <span><b className="text-white">Z</b> zoom</span>
                <span><b className="text-white">E</b> inspect painting</span>
                <span className="text-white/50">Touch: left thumb walks, right looks{locked ? ' · Esc frees the mouse' : ''}</span>
              </div>
            </div>
          )}
        </>
      )}

      {/* ---------------- loading ---------------- */}
      {!ready && !err && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#0d1114] px-6 text-center">
          <div className="mb-8 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#f2c230] text-[#1b1a19] shadow-lg shadow-[#f2c230]/20">
            <svg viewBox="0 0 24 24" className="h-9 w-9 animate-spin" style={{ animationDuration: '6s' }} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="3.2" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" /></svg>
          </div>
          <div className="serif text-2xl font-semibold tracking-wide">Van Gogh Museum</div>
          <div className="mt-1 text-sm text-white/50">Building the museum, Museumplein, Amsterdam</div>
          <div className="mt-8 h-1 w-64 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-[#f2c230] transition-all duration-300" style={{ width: `${Math.round(progress.p * 100)}%` }} />
          </div>
          <div className="mt-3 text-xs text-white/50">{progress.label}…</div>
        </div>
      )}

      {err && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#0d1114] p-8 text-center">
          <div className="max-w-md">
            <div className="serif text-xl">The museum could not open</div>
            <p className="mt-2 text-sm text-white/60">This experience needs WebGL. {err}</p>
          </div>
        </div>
      )}

      {/* ---------------- intro ---------------- */}
      {ready && !entered && (
        <div className="absolute inset-0 z-10 flex items-end justify-center bg-gradient-to-t from-black/80 via-black/20 to-transparent p-6 pb-10 sm:items-center sm:justify-start sm:bg-gradient-to-r sm:from-black/80 sm:via-black/30 sm:to-transparent sm:p-16">
          <div className="fade-up max-w-md">
            <div className="text-[11px] font-semibold uppercase tracking-[0.25em] text-[#f2c230]">Museumplein · Amsterdam</div>
            <h1 className="serif mt-3 text-4xl font-semibold leading-tight sm:text-5xl">Walk through the Van Gogh Museum</h1>
            <p className="mt-4 text-[15px] leading-relaxed text-white/75">
              Explore the Rietveld building, Kurokawa’s titanium-zinc wing and the glass entrance hall. Climb the stair hall and stand in front of
              Sunflowers, The Bedroom and Wheatfield with Crows.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <button onClick={() => enter(true)} className="flex items-center gap-2 rounded-full bg-[#f2c230] px-6 py-3 text-sm font-semibold text-[#1b1a19] shadow-lg shadow-[#f2c230]/20 transition hover:brightness-110">
                <Icon n="walk" /> Enter the museum
              </button>
              <button onClick={() => enter(false)} className="flex items-center gap-2 rounded-full border border-white/25 bg-white/5 px-6 py-3 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/15">
                <Icon n="orbit" /> View from above
              </button>
            </div>
            <div className="mt-6 text-xs text-white/40">Paintings: public-domain works from the museum’s collection, shown 1.5× life size. The building is an artistic interpretation.</div>
          </div>
        </div>
      )}
    </div>
  )
}

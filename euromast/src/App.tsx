import { useCallback, useEffect, useRef, useState } from 'react'
import { Experience, Hud, Quality, SPOTS, TimeKey } from './euromast/Experience'

const FACTS = [
  ['Height', '185 m'],
  ['Opened', '1960'],
  ['Space Tower', '1970'],
  ['Architect', 'H. A. Maaskant'],
  ['Crow’s nest', '96 m'],
  ['Shaft wall', '30 cm'],
]

const TIMES: { k: TimeKey; label: string; icon: string }[] = [
  { k: 'day', label: 'Day', icon: '☀' },
  { k: 'overcast', label: 'Overcast', icon: '☁' },
  { k: 'golden', label: 'Golden hour', icon: '◐' },
  { k: 'night', label: 'Night', icon: '☾' },
]

const cardinal = (b: number) => ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(b / 45) % 8]

export default function App() {
  const host = useRef<HTMLDivElement>(null)
  const ex = useRef<Experience | null>(null)
  const [progress, setProgress] = useState({ p: 0, label: 'Preparing' })
  const [ready, setReady] = useState(false)
  const [entered, setEntered] = useState(false)
  const [hud, setHud] = useState<Hud | null>(null)
  const [time, setTime] = useState<TimeKey>('day')
  const [quality, setQuality] = useState<Quality>('high')
  const [muted, setMuted] = useState(false)
  const [panel, setPanel] = useState(false)
  const [help, setHelp] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!host.current) return
    let e: Experience
    try {
      e = new Experience(host.current, {
        onProgress: (p, label) => setProgress({ p, label }),
        onHud: (h) => setHud(h),
      })
    } catch (err) {
      setError('Your browser could not start WebGL. Please try a recent Chrome, Edge, Firefox or Safari.')
      return
    }
    ex.current = e
    ;(window as unknown as { __euromast?: Experience }).__euromast = e
    e.build()
      .then(() => setReady(true))
      .catch((err) => {
        console.error(err)
        setError('Something went wrong while building the scene.')
      })
    return () => {
      e.dispose()
      ex.current = null
    }
  }, [])

  const enter = useCallback(() => {
    setEntered(true)
    void ex.current?.enter()
    setTimeout(() => setHelp(false), 9000)
  }, [])

  const onTime = (k: TimeKey) => {
    setTime(k)
    ex.current?.setTime(k)
  }
  const onQuality = (q: Quality) => {
    setQuality(q)
    ex.current?.setQuality(q)
  }
  const go = (id: string) => void ex.current?.teleport(id)

  const mode = hud?.mode ?? 'intro'
  const alt = hud ? Math.round(Math.max(0, hud.altitude - (mode === 'walk' || mode === 'euroscope' ? 1.65 : 0))) : 0

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#0b1118] font-sans text-white select-none">
      <style>{`
        .em-hot{background:none;border:0;padding:0;cursor:pointer;z-index:5}
        .em-dot{display:block;width:18px;height:18px;border-radius:50%;background:rgba(255,255,255,.95);box-shadow:0 0 0 4px rgba(255,255,255,.25),0 2px 10px rgba(0,0,0,.45);position:relative}
        .em-dot::after{content:'';position:absolute;inset:-9px;border-radius:50%;border:1.5px solid rgba(255,255,255,.7);animation:emp 2.2s ease-out infinite}
        @keyframes emp{0%{transform:scale(.6);opacity:.9}100%{transform:scale(1.5);opacity:0}}
        .em-card{position:absolute;left:26px;top:-6px;white-space:nowrap;text-align:left;background:rgba(10,16,24,.72);backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,.14);border-radius:10px;padding:6px 10px;display:flex;flex-direction:column;transition:transform .2s,background .2s}
        .em-hot:hover .em-card{background:rgba(20,30,44,.9);transform:translateX(3px)}
        .em-card b{font-size:12px;font-weight:600;color:#fff}
        .em-card i{font-size:10.5px;font-style:normal;color:rgba(255,255,255,.62)}
        .em-fade{animation:emf .7s ease both}
        @keyframes emf{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
        input[type=range]{accent-color:#e04a3f}
      `}</style>

      <div ref={host} className="absolute inset-0" />

      {/* crosshair */}
      {entered && (mode === 'walk' || mode === 'euroscope') && (
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/70 shadow ring-1 ring-black/30" />
      )}

      {/* HUD */}
      {entered && ready && (
        <div className="em-fade pointer-events-none absolute inset-0">
          {/* top-left: title + place */}
          <div className="absolute left-4 top-4 flex max-w-[min(420px,calc(100vw-2rem))] flex-col gap-2 sm:left-6 sm:top-6">
            <div className="pointer-events-auto rounded-2xl border border-white/10 bg-black/45 px-4 py-3 shadow-2xl backdrop-blur-xl">
              <div className="flex items-center gap-3">
                <div className="grid h-9 w-9 place-items-center rounded-lg bg-[#c1272d] text-[15px] font-bold shadow-inner">E</div>
                <div className="min-w-0">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/50">Rotterdam · Het Park</div>
                  <div className="truncate text-base font-semibold leading-tight">Euromast</div>
                </div>
                <button onClick={() => setPanel((v) => !v)} className="ml-auto rounded-md px-2 py-1 text-[11px] text-white/60 hover:bg-white/10 hover:text-white">
                  {panel ? 'Hide' : 'Info'}
                </button>
              </div>
              {panel && (
                <div className="mt-3 grid grid-cols-3 gap-x-3 gap-y-2 border-t border-white/10 pt-3">
                  {FACTS.map(([k, v]) => (
                    <div key={k}>
                      <div className="text-[9.5px] uppercase tracking-wider text-white/45">{k}</div>
                      <div className="text-[13px] font-medium">{v}</div>
                    </div>
                  ))}
                </div>
              )}
              {panel && (
                <p className="mt-3 text-[12px] leading-relaxed text-white/65">
                  Built for the 1960 Floriade and listed as a monument in 2010. A 100 m concrete shaft with a crow’s nest at 96 m; the steel Space Tower of 1970 lifts the Euroscope to 185 m.
                </p>
              )}
            </div>
            <div className="pointer-events-none flex items-center gap-2 rounded-full border border-white/10 bg-black/40 px-3 py-1.5 text-[12px] backdrop-blur-xl">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              <span className="font-medium">{hud?.place ?? ''}</span>
              <span className="text-white/40">·</span>
              <span className="tabular-nums text-white/70">{alt} m</span>
              {mode === 'euroscope' && <span className="text-white/50">· {hud?.euro}</span>}
            </div>
          </div>

          {/* top-right: controls */}
          <div className="pointer-events-auto absolute right-4 top-4 flex flex-col items-end gap-2 sm:right-6 sm:top-6">
            <div className="flex rounded-full border border-white/10 bg-black/45 p-0.5 backdrop-blur-xl">
              {TIMES.map((t) => (
                <button
                  key={t.k}
                  onClick={() => onTime(t.k)}
                  title={t.label}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition ${time === t.k ? 'bg-white text-black shadow' : 'text-white/70 hover:text-white'}`}
                >
                  <span className="text-[13px] leading-none">{t.icon}</span>
                  <span className="hidden md:inline">{t.label}</span>
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1.5">
              <div className="flex rounded-full border border-white/10 bg-black/45 p-0.5 backdrop-blur-xl">
                {(['high', 'balanced', 'low'] as Quality[]).map((q) => (
                  <button key={q} onClick={() => onQuality(q)} className={`rounded-full px-2.5 py-1 text-[11px] font-medium capitalize transition ${quality === q ? 'bg-white/90 text-black' : 'text-white/65 hover:text-white'}`}>
                    {q}
                  </button>
                ))}
              </div>
              <button
                onClick={() => {
                  setMuted((m) => !m)
                  ex.current?.setMuted(!muted)
                }}
                className="rounded-full border border-white/10 bg-black/45 px-3 py-1.5 text-[11px] font-medium text-white/80 backdrop-blur-xl hover:text-white"
              >
                {muted ? 'Sound off' : 'Sound on'}
              </button>
              <button
                onClick={() => ex.current?.setMode(mode === 'orbit' ? 'walk' : 'orbit')}
                disabled={mode === 'lift' || mode === 'euroscope'}
                className="rounded-full border border-white/10 bg-black/45 px-3 py-1.5 text-[11px] font-medium text-white/80 backdrop-blur-xl hover:text-white disabled:opacity-40"
              >
                {mode === 'orbit' ? 'Walk' : 'Orbit'}
              </button>
            </div>
            <div className="text-right text-[10px] tabular-nums text-white/35">{hud?.fps ?? 0} fps</div>
          </div>

          {/* compass */}
          <div className="absolute left-1/2 top-4 -translate-x-1/2 sm:top-6">
            <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/40 px-3 py-1 text-[11px] backdrop-blur-xl">
              <span className="font-semibold">{cardinal(hud?.bearing ?? 0)}</span>
              <span className="tabular-nums text-white/60">{Math.round(hud?.bearing ?? 0)}°</span>
            </div>
          </div>

          {/* prompt */}
          {hud?.prompt && (
            <div className="absolute bottom-28 left-1/2 -translate-x-1/2 sm:bottom-32">
              <button
                onClick={() => ex.current?.interact()}
                className="pointer-events-auto flex items-center gap-3 rounded-full border border-white/20 bg-black/65 px-5 py-2.5 text-sm font-medium shadow-2xl backdrop-blur-xl transition hover:bg-black/80"
              >
                <kbd className="grid h-6 w-6 place-items-center rounded-md bg-white text-xs font-bold text-black">E</kbd>
                {hud.prompt.replace(/ · E$| · press E$/, '')}
              </button>
            </div>
          )}

          {/* help */}
          {help && (mode === 'walk' || mode === 'orbit') && (
            <div className="em-fade absolute bottom-28 left-4 hidden max-w-xs rounded-2xl border border-white/10 bg-black/50 p-4 text-[12px] leading-relaxed text-white/80 backdrop-blur-xl sm:block sm:left-6">
              {mode === 'walk' ? (
                <>
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-white/50">Controls</div>
                  <div><b>W A S D</b> walk · <b>Shift</b> run</div>
                  <div><b>Drag</b> or click to look · <b>Scroll</b> zoom</div>
                  <div><b>E</b> interact · <b>O</b> orbit view</div>
                  <div className="mt-1 text-white/55">Walk into the lobby and take the lift to the crow’s nest.</div>
                </>
              ) : (
                <>
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-white/50">Orbit</div>
                  <div><b>Drag</b> rotate · <b>Scroll</b> zoom · <b>Right-drag</b> pan</div>
                  <div className="mt-1 text-white/55">Click a glowing hotspot to fly closer.</div>
                </>
              )}
            </div>
          )}

          {/* bottom: teleport bar */}
          <div className="pointer-events-auto absolute inset-x-0 bottom-4 flex justify-center px-3 sm:bottom-6">
            <div className="flex max-w-full gap-1.5 overflow-x-auto rounded-2xl border border-white/10 bg-black/50 p-1.5 shadow-2xl backdrop-blur-xl [scrollbar-width:none]">
              {SPOTS.map((s, i) => (
                <button
                  key={s.id}
                  onClick={() => go(s.id)}
                  className="group flex shrink-0 flex-col items-start rounded-xl px-3 py-2 text-left transition hover:bg-white/10"
                >
                  <span className="flex items-center gap-1.5 text-[12px] font-medium">
                    <span className="grid h-4 w-4 place-items-center rounded-full bg-white/15 text-[9px] tabular-nums group-hover:bg-[#c1272d]">{i + 1}</span>
                    {s.label}
                  </span>
                  <span className="hidden pl-[22px] text-[10.5px] text-white/45 md:block">{s.desc}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* loading / intro */}
      <div
        className={`absolute inset-0 z-20 flex items-center justify-center transition-opacity duration-1000 ${entered ? 'pointer-events-none opacity-0' : 'opacity-100'}`}
        style={{ background: ready ? 'linear-gradient(to top, rgba(6,10,16,.88), rgba(6,10,16,.25) 55%, rgba(6,10,16,.5))' : '#0b1118' }}
      >
        <div className="mx-auto flex max-w-xl flex-col items-center px-6 text-center">
          <div className="mb-5 text-[11px] font-semibold uppercase tracking-[0.35em] text-white/55">Rotterdam · Netherlands</div>
          <h1 className="text-5xl font-semibold tracking-tight sm:text-7xl">Euromast</h1>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-white/70">
            Walk the park, ride the lift to the crow’s nest, step onto the 96 m terrace and rise to 185 m in the Euroscope — at real scale.
          </p>
          {error ? (
            <p className="mt-8 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</p>
          ) : !ready ? (
            <div className="mt-9 w-72">
              <div className="h-[3px] w-full overflow-hidden rounded-full bg-white/15">
                <div className="h-full rounded-full bg-white transition-all duration-300" style={{ width: `${Math.round(progress.p * 100)}%` }} />
              </div>
              <div className="mt-3 text-xs text-white/55">{progress.label}…</div>
            </div>
          ) : (
            <button
              onClick={enter}
              className="mt-9 rounded-full bg-white px-9 py-3.5 text-sm font-semibold text-black shadow-[0_10px_40px_rgba(0,0,0,.45)] transition hover:scale-[1.03] active:scale-95"
            >
              Start exploring
            </button>
          )}
          {ready && <div className="mt-5 text-[11px] text-white/40">Best with headphones · desktop recommended · WASD + mouse</div>}
        </div>
      </div>
    </div>
  )
}

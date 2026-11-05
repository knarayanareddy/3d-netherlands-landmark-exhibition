import { useCallback, useEffect, useRef, useState } from 'react'
import { Explorer, FrameInfo, Mode, TimeOfDay } from './rijks/Explorer'
import { POIS } from './rijks/pois'
import type { POI } from './rijks/world'
import Minimap from './components/Minimap'

const TOD: { id: TimeOfDay; label: string; key: string }[] = [
  { id: 'day', label: 'Day', key: '1' },
  { id: 'golden', label: 'Golden hour', key: '2' },
  { id: 'night', label: 'Night', key: '3' },
]
const ZONE_LABEL: Record<string, string> = { outside: 'Museumplein', passage: 'The Passage', atrium: 'Atrium', gallery: 'Gallery of Honour' }

const Kbd = ({ children }: { children: React.ReactNode }) => (
  <kbd className="rounded-md border border-white/25 bg-white/10 px-1.5 py-0.5 font-mono text-[11px] text-white/90">{children}</kbd>
)

export default function App() {
  const host = useRef<HTMLDivElement>(null)
  const ex = useRef<Explorer | null>(null)
  const [prog, setProg] = useState({ p: 0, label: 'Warming up' })
  const [ready, setReady] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [frame, setFrame] = useState<FrameInfo | null>(null)
  const [poi, setPoi] = useState<POI | null>(null)
  const [locked, setLocked] = useState(false)
  const [mode, setMode] = useState<Mode>('walk')
  const [tod, setTod] = useState<TimeOfDay>('day')
  const [hq, setHq] = useState(true)
  const [intro, setIntro] = useState(true)
  const [tour, setTour] = useState(true)
  const [map, setMap] = useState(true)
  const [touch] = useState(() => typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0))

  useEffect(() => {
    let alive = true
    const timer = setTimeout(() => {
      if (!host.current) return
      try {
        const e = new Explorer(host.current, {
          onProgress: (p, label) => alive && setProg({ p, label }),
          onFrame: (f) => alive && setFrame(f),
          onPOI: (p) => alive && setPoi(p),
          onLock: (l) => alive && setLocked(l),
          onMode: (m) => alive && setMode(m),
        })
        ex.current = e
        ;(window as unknown as { __rijks?: Explorer }).__rijks = e
        e.start().then(() => alive && setReady(true)).catch((er) => alive && setErr(String(er?.message ?? er)))
      } catch (er) {
        setErr(String((er as Error)?.message ?? er))
      }
    }, 30)
    return () => {
      alive = false
      clearTimeout(timer)
      ex.current?.dispose()
      ex.current = null
    }
  }, [])

  const go = useCallback((i: number) => {
    ex.current?.teleport(POIS[i].view)
    setIntro(false)
  }, [])
  const setTime = (t: TimeOfDay) => { ex.current?.setTime(t); setTod(t) }
  const toggleMode = useCallback(() => ex.current?.setMode(ex.current.mode === 'walk' ? 'orbit' : 'walk'), [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!ready) return
      const k = e.key.toLowerCase()
      if (k === '1') setTime('day')
      else if (k === '2') setTime('golden')
      else if (k === '3') setTime('night')
      else if (k === 'o') toggleMode()
      else if (k === 'm') setMap((v) => !v)
      else if (k === 'h') setIntro((v) => !v)
      else if (k === 't') setTour((v) => !v)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [ready, toggleMode])

  const start = () => {
    setIntro(false)
    if (!touch) ex.current?.requestLock()
    host.current?.querySelector('canvas')?.focus()
  }

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#0b1220] text-white select-none font-sans">
      <div ref={host} className="absolute inset-0" onClick={() => { if (ready && !intro && mode === 'walk' && !touch && !locked) ex.current?.requestLock() }} />

      {/* crosshair */}
      {ready && mode === 'walk' && !intro && (
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/70 ring-1 ring-black/30" />
      )}

      {/* HUD */}
      {ready && (
        <>
          <div className="pointer-events-none absolute left-4 top-4 max-w-[60vw]">
            <div className="rounded-2xl border border-white/10 bg-black/35 px-4 py-3 shadow-xl backdrop-blur-md">
              <div className="text-[10px] uppercase tracking-[0.28em] text-red-300/90">Amsterdam · since 1885</div>
              <h1 className="font-serif text-xl leading-tight sm:text-2xl">Rijksmuseum</h1>
              <div className="mt-1 text-xs text-white/70">
                {mode === 'orbit' ? 'Overview – drag to orbit, scroll to zoom' : frame ? <>You are in: <span className="text-white">{ZONE_LABEL[frame.zone]}</span>{frame.level ? ' · first floor' : ''}</> : ' '}
              </div>
            </div>
          </div>

          <div className="absolute right-4 top-4 flex flex-col items-end gap-2">
            <div className="flex gap-1 rounded-full border border-white/10 bg-black/40 p-1 backdrop-blur-md">
              {TOD.map((t) => (
                <button key={t.id} onClick={() => setTime(t.id)} title={`Key ${t.key}`}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${tod === t.id ? 'bg-white text-slate-900' : 'text-white/80 hover:bg-white/15'}`}>
                  {t.label}
                </button>
              ))}
            </div>
            <div className="flex gap-1 rounded-full border border-white/10 bg-black/40 p-1 backdrop-blur-md">
              <button onClick={toggleMode} className="rounded-full px-3 py-1.5 text-xs font-medium text-white/90 hover:bg-white/15" title="Key O">
                {mode === 'walk' ? 'Aerial overview' : 'Back to walking'}
              </button>
              <button onClick={() => { const v = !hq; setHq(v); ex.current?.setQuality(v) }} className="rounded-full px-3 py-1.5 text-xs font-medium text-white/90 hover:bg-white/15">
                Quality: {hq ? 'High' : 'Light'}
              </button>
              <button onClick={() => setIntro(true)} className="rounded-full px-3 py-1.5 text-xs font-medium text-white/90 hover:bg-white/15" title="Key H">Help</button>
            </div>
          </div>

          {/* tour menu */}
          <div className="absolute right-4 top-[7.2rem] w-56">
            <button onClick={() => setTour((v) => !v)} className="mb-1 ml-auto block rounded-full border border-white/10 bg-black/40 px-3 py-1 text-[11px] text-white/80 backdrop-blur-md hover:bg-white/15">
              {tour ? 'Hide tour ▴' : 'Tour ▾'}
            </button>
            {tour && (
              <div className="max-h-[48vh] overflow-auto rounded-2xl border border-white/10 bg-black/40 p-1.5 backdrop-blur-md">
                {POIS.map((p, i) => (
                  <button key={p.id} onClick={() => go(i)}
                    className={`block w-full rounded-xl px-3 py-2 text-left transition hover:bg-white/15 ${poi?.id === p.id ? 'bg-white/15' : ''}`}>
                    <div className="text-[9px] uppercase tracking-[0.2em] text-red-300/80">{p.kicker}</div>
                    <div className="text-[13px] leading-tight">{p.title}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* minimap */}
          <div className="absolute bottom-4 left-4 flex flex-col items-start gap-1">
            <button onClick={() => setMap((v) => !v)} className="rounded-full border border-white/10 bg-black/40 px-3 py-1 text-[11px] text-white/80 backdrop-blur-md hover:bg-white/15" title="Key M">
              {map ? 'Hide map' : 'Map'}
            </button>
            {map && (
              <div className="rounded-2xl border border-white/10 bg-black/40 p-1.5 backdrop-blur-md">
                <Minimap frame={frame} onGo={go} />
              </div>
            )}
          </div>

          {/* info card */}
          {poi && mode === 'walk' && (
            <div className="pointer-events-none absolute bottom-6 left-1/2 w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 sm:bottom-8">
              <div className="rounded-2xl border border-white/15 bg-black/55 p-4 shadow-2xl backdrop-blur-lg">
                <div className="text-[10px] uppercase tracking-[0.25em] text-red-300/90">{poi.kicker}</div>
                <h2 className="mt-0.5 font-serif text-xl">{poi.title}</h2>
                <p className="mt-1.5 text-[13px] leading-relaxed text-white/80">{poi.text}</p>
              </div>
            </div>
          )}

          {/* controls strip */}
          {!intro && mode === 'walk' && !poi && !touch && (
            <div className="pointer-events-none absolute bottom-5 left-1/2 hidden -translate-x-1/2 items-center gap-3 rounded-full border border-white/10 bg-black/40 px-4 py-2 text-xs text-white/80 backdrop-blur-md md:flex">
              <span><Kbd>W</Kbd><Kbd>A</Kbd><Kbd>S</Kbd><Kbd>D</Kbd> walk</span>
              <span><Kbd>Shift</Kbd> run</span>
              <span>{locked ? <><Kbd>Esc</Kbd> release mouse</> : 'click to capture mouse · or drag to look'}</span>
              <span><Kbd>1</Kbd><Kbd>2</Kbd><Kbd>3</Kbd> time of day</span>
            </div>
          )}
          {touch && mode === 'walk' && !intro && (
            <div className="pointer-events-none absolute bottom-6 left-6 flex h-24 w-24 items-center justify-center rounded-full border border-white/25 bg-white/5 text-[10px] text-white/50">walk</div>
          )}
        </>
      )}

      {/* intro */}
      {ready && intro && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-3xl border border-white/15 bg-slate-950/80 p-6 shadow-2xl">
            <div className="text-[10px] uppercase tracking-[0.3em] text-red-300">Explorable 3D monument</div>
            <h2 className="mt-1 font-serif text-3xl">Walk into the Rijksmuseum</h2>
            <p className="mt-2 text-sm leading-relaxed text-white/75">
              Stroll across Museumplein, ride through Cuypers’ cycle passage, look up into the glass atrium, climb to the Gallery of Honour and stand before Rembrandt’s Night Watch.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-white/80">
              <div className="rounded-xl bg-white/5 p-3"><div className="mb-1 text-white/50">Move</div><Kbd>W</Kbd> <Kbd>A</Kbd> <Kbd>S</Kbd> <Kbd>D</Kbd> or arrows · <Kbd>Shift</Kbd> to run</div>
              <div className="rounded-xl bg-white/5 p-3"><div className="mb-1 text-white/50">Look</div>Mouse (click to capture) or drag · scroll to zoom</div>
              <div className="rounded-xl bg-white/5 p-3"><div className="mb-1 text-white/50">Time of day</div><Kbd>1</Kbd> <Kbd>2</Kbd> <Kbd>3</Kbd> day · golden · night</div>
              <div className="rounded-xl bg-white/5 p-3"><div className="mb-1 text-white/50">Overview</div><Kbd>O</Kbd> aerial view · <Kbd>M</Kbd> map · <Kbd>T</Kbd> tour</div>
            </div>
            {touch && <p className="mt-3 text-xs text-white/60">Touch: drag with your left thumb to walk, right thumb to look.</p>}
            <div className="mt-5 flex gap-2">
              <button onClick={start} className="flex-1 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-red-100">Start exploring</button>
              <button onClick={() => { setIntro(false); go(3) }} className="rounded-full border border-white/25 px-4 py-2.5 text-sm text-white/90 hover:bg-white/10">Start in the passage</button>
            </div>
          </div>
        </div>
      )}

      {/* loader */}
      {!ready && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-gradient-to-b from-[#1a0f0d] via-[#2a1512] to-[#0b1220]">
          {err ? (
            <div className="max-w-md rounded-2xl border border-red-400/40 bg-red-950/50 p-5 text-center text-sm">
              <div className="mb-1 font-serif text-lg">Could not start the 3D view</div>
              <div className="text-white/70">{err}</div>
              <div className="mt-2 text-xs text-white/50">This experience needs a browser with WebGL enabled.</div>
            </div>
          ) : (
            <>
              <div className="text-[11px] uppercase tracking-[0.4em] text-red-300/80">Amsterdam</div>
              <h1 className="font-serif text-4xl tracking-wide sm:text-5xl">Rijksmuseum</h1>
              <div className="h-1 w-64 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-gradient-to-r from-red-400 to-amber-300 transition-all duration-300" style={{ width: `${Math.round(prog.p * 100)}%` }} />
              </div>
              <div className="text-xs text-white/60">{prog.label}…</div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

import { useCallback, useEffect, useRef, useState } from 'react'
import { World, Mode, Quality, TimeOfDay } from './three/blijdorp/World'
import { POIS, Poi } from './three/blijdorp/poi'
import { POND } from './three/blijdorp/grounds'

/* ------------------------------------------------------------------ small pieces */
const Btn = ({ active, onClick, children, title, className = '' }: { active?: boolean; onClick: () => void; children: React.ReactNode; title?: string; className?: string }) => (
  <button
    title={title}
    onClick={onClick}
    className={`rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors ${active ? 'bg-amber-300 text-stone-900' : 'bg-white/10 text-white/90 hover:bg-white/20'} ${className}`}
  >
    {children}
  </button>
)

type Pose = { x: number; z: number; yaw: number }

function Minimap({ pose, onPick }: { pose: React.MutableRefObject<Pose>; onPick: (x: number, z: number) => void }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const X0 = -62, X1 = 62, Z0 = -72, Z1 = 182
  const W = 150
  const H = Math.round((W * (Z1 - Z0)) / (X1 - X0))
  useEffect(() => {
    const c = ref.current!
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    c.width = W * dpr
    c.height = H * dpr
    const g = c.getContext('2d')!
    const sx = (x: number) => ((x - X0) / (X1 - X0)) * W * dpr
    const sz = (z: number) => ((Z1 - z) / (Z1 - Z0)) * H * dpr // north (+z) at the top
    const rect = (x0: number, z0: number, x1: number, z1: number, fill: string) => {
      g.fillStyle = fill
      g.fillRect(sx(x0), sz(z1), sx(x1) - sx(x0), sz(z0) - sz(z1))
    }
    const draw = () => {
      g.clearRect(0, 0, c.width, c.height)
      rect(X0, Z0, X1, Z1, '#3f5b34')
      rect(-52, 14, 52, 58, '#9b9a98')
      rect(-46, -66, 46, -12, '#8f8e8c')
      rect(-5.6, 96, 5.6, 156, '#7e7a74')
      rect(-26, 142, 26, 176, '#8f8e8c')
      g.fillStyle = '#4c7f8a'
      g.beginPath()
      g.ellipse(sx(POND.x), sz(POND.z), (POND.rx / (X1 - X0)) * W * dpr, (POND.rz / (Z1 - Z0)) * H * dpr, 0, 0, Math.PI * 2)
      g.fill()
      const bld = '#e3d9a9'
      rect(-13.4, -21, 13.4, 21, bld)
      rect(13.4, -21, 22.4, 14.4, '#d2c692')
      rect(-22.4, -21, -13.4, 14.4, '#d2c692')
      for (const s of [-1, 1]) {
        g.fillStyle = '#c9ddd0'
        g.beginPath()
        g.arc(sx(s * 27), sz(-18), (8.5 / (X1 - X0)) * W * dpr, 0, Math.PI * 2)
        g.fill()
      }
      rect(-13, 118, 13, 126, bld)
      rect(-34, 152, -16, 168, '#b46d54')
      rect(16, 152, 34, 168, '#b46d54')
      const p = pose.current
      g.save()
      g.translate(sx(p.x), sz(p.z))
      g.rotate(p.yaw)
      g.fillStyle = '#ffd25e'
      g.strokeStyle = '#1b1b1b'
      g.lineWidth = 1.4 * dpr
      g.beginPath()
      g.moveTo(0, -7 * dpr)
      g.lineTo(5 * dpr, 6 * dpr)
      g.lineTo(0, 3 * dpr)
      g.lineTo(-5 * dpr, 6 * dpr)
      g.closePath()
      g.fill()
      g.stroke()
      g.restore()
    }
    const id = setInterval(draw, 100)
    draw()
    return () => clearInterval(id)
  }, [H, pose])
  return (
    <canvas
      ref={ref}
      style={{ width: W, height: H }}
      className="cursor-crosshair rounded-lg border border-white/20"
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect()
        const x = X0 + ((e.clientX - r.left) / r.width) * (X1 - X0)
        const z = Z1 - ((e.clientY - r.top) / r.height) * (Z1 - Z0)
        onPick(x, z)
      }}
    />
  )
}

function Joystick({ onMove }: { onMove: (x: number, y: number) => void }) {
  const [k, setK] = useState({ x: 0, y: 0 })
  const base = useRef<HTMLDivElement>(null)
  const handle = (e: React.PointerEvent) => {
    const r = base.current!.getBoundingClientRect()
    let dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2)
    let dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2)
    const l = Math.hypot(dx, dy)
    if (l > 1) { dx /= l; dy /= l }
    setK({ x: dx, y: dy })
    onMove(dx, -dy)
  }
  return (
    <div
      ref={base}
      className="relative h-28 w-28 touch-none rounded-full border border-white/30 bg-black/30 backdrop-blur"
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); handle(e) }}
      onPointerMove={(e) => e.buttons && handle(e)}
      onPointerUp={() => { setK({ x: 0, y: 0 }); onMove(0, 0) }}
      onPointerCancel={() => { setK({ x: 0, y: 0 }); onMove(0, 0) }}
    >
      <div className="absolute h-12 w-12 rounded-full bg-white/60" style={{ left: `calc(50% + ${k.x * 34}px - 24px)`, top: `calc(50% + ${k.y * 34}px - 24px)` }} />
    </div>
  )
}

/* ------------------------------------------------------------------ app */
export default function App() {
  const host = useRef<HTMLDivElement>(null)
  const world = useRef<World | null>(null)
  const pose = useRef<Pose>({ x: 0, z: 0, yaw: 0 })
  const [prog, setProg] = useState({ p: 0, label: 'Starting' })
  const [ready, setReady] = useState(false)
  const [entered, setEntered] = useState(false)
  const [zone, setZone] = useState('Diergaarde Blijdorp')
  const [mode, setMode] = useState<Mode>('orbit')
  const [poi, setPoi] = useState<Poi | null>(null)
  const [tour, setTour] = useState(false)
  const [time, setTime] = useState<TimeOfDay>('day')
  const [quality, setQuality] = useState<Quality>(() => (Math.min(window.innerWidth, window.innerHeight) < 700 ? 'low' : 'medium'))
  const [tower, setTower] = useState(false)
  const [panel, setPanel] = useState(true)
  const [help, setHelp] = useState(true)
  const [error, setError] = useState('')
  const touch = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0)

  useEffect(() => {
    const el = host.current!
    let w: World
    try {
      w = new World(
        el,
        {
          onProgress: (p, label) => setProg({ p, label }),
          onReady: () => setReady(true),
          onZone: (n) => setZone(n),
          onPose: (x, z, yaw) => (pose.current = { x, z, yaw }),
          onMode: (m) => setMode(m),
          onPoi: (p) => setPoi(p),
          onTour: (on) => setTour(on),
        },
        quality,
      )
    } catch (e) {
      setError(String(e))
      return
    }
    world.current = w
    w.start().catch((e) => setError(String(e)))
    return () => {
      w.dispose()
      world.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const enter = useCallback(() => {
    setEntered(true)
    world.current?.goto(POIS[0])
  }, [])
  const go = useCallback((p: Poi) => {
    setEntered(true)
    world.current?.stopTour()
    world.current?.goto(p)
  }, [])
  const setT = (t: TimeOfDay) => {
    setTime(t)
    world.current?.setTime(t)
  }
  const setQ = (q: Quality) => {
    setQuality(q)
    world.current?.applyQuality(q)
  }
  const toggleTower = () => {
    const n = !tower
    setTower(n)
    world.current?.setTower(n)
  }
  const startTour = () => {
    setEntered(true)
    world.current?.startTour()
  }
  const pick = (x: number, z: number) => {
    const w = world.current
    if (!w) return
    w.stopTour()
    setEntered(true)
    const p = pose.current
    w.goto({ id: 'free', title: 'Walking', tag: '', text: '', pos: [x, 1.7, z], look: [x + Math.sin(p.yaw) * 10, 2, z - Math.cos(p.yaw) * 10], mode: 'walk' })
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t && ['INPUT', 'SELECT', 'TEXTAREA'].includes(t.tagName)) return
      if (!ready) return
      if (e.code === 'Digit1') setT('day')
      if (e.code === 'Digit2') setT('golden')
      if (e.code === 'Digit3') setT('night')
      if (e.code === 'KeyM') { setEntered(true); world.current?.toggleMode() }
      if (e.code === 'KeyL') world.current?.togglePointerLock()
      if (e.code === 'KeyT') (world.current?.touring ? world.current?.stopTour() : startTour())
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready])

  const idx = poi ? POIS.findIndex((p) => p.id === poi.id) : -1
  const step = (d: number) => {
    const n = (Math.max(idx, 0) + d + POIS.length) % POIS.length
    go(POIS[n])
  }
  const glass = 'border border-white/15 bg-black/45 text-white backdrop-blur-md'

  return (
    <div className="fixed inset-0 overflow-hidden bg-stone-900 font-sans text-white select-none">
      <div ref={host} className="absolute inset-0" />

      {/* loading */}
      {!ready && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-gradient-to-b from-[#1b2a2c] via-[#23352f] to-[#12191a] p-8 text-center">
          <div>
            <p className="mb-2 text-xs tracking-[0.35em] text-amber-200/80 uppercase">Rotterdam · 1940</p>
            <h1 className="font-serif text-4xl font-semibold tracking-tight sm:text-5xl">Diergaarde Blijdorp</h1>
            <p className="mt-2 font-serif text-xl text-white/70 italic">the Rivièrahal, in 3D</p>
          </div>
          <div className="w-72 max-w-full">
            <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-amber-300 transition-all duration-300" style={{ width: `${Math.round(prog.p * 100)}%` }} />
            </div>
            <p className="mt-3 text-sm text-white/60">{error ? 'Something went wrong: ' + error : prog.label + '…'}</p>
          </div>
        </div>
      )}

      {/* intro */}
      {ready && !entered && (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-end p-4 sm:items-center sm:p-12">
          <div className={`pointer-events-auto max-w-lg rounded-2xl p-6 sm:p-8 ${glass}`}>
            <p className="mb-2 text-[11px] tracking-[0.3em] text-amber-200/90 uppercase">Rijksmonument · Rotterdam</p>
            <h1 className="font-serif text-3xl leading-tight font-semibold sm:text-4xl">Diergaarde Blijdorp</h1>
            <p className="mt-1 font-serif text-lg text-white/70 italic">Walk through Sybold van Ravesteyn’s Rivièrahal</p>
            <p className="mt-4 text-sm leading-relaxed text-white/80">
              A life-size, explorable model of the zoo’s 1940 main building and its formal garden axis: the curved wave roof, the four giant columns, the glass walls, the fountain hall and the Victoria greenhouse. Everything is built at real scale, so you can stroll up from the gate, cross the plaza and step inside.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <button onClick={enter} className="rounded-xl bg-amber-300 px-5 py-2.5 text-sm font-semibold text-stone-900 shadow-lg shadow-amber-300/20 hover:bg-amber-200">Enter the zoo →</button>
              <button onClick={startTour} className="rounded-xl bg-white/10 px-5 py-2.5 text-sm font-medium hover:bg-white/20">Guided tour</button>
              <button onClick={() => go(POIS.find((p) => p.id === 'hall')!)} className="rounded-xl bg-white/10 px-5 py-2.5 text-sm font-medium hover:bg-white/20">Go inside</button>
            </div>
          </div>
        </div>
      )}

      {ready && (
        <>
          {/* top-left: location */}
          <div className={`absolute top-3 left-3 z-20 flex max-w-[60vw] items-center gap-2 rounded-xl px-3.5 py-2 ${glass}`}>
            <span className="h-2 w-2 shrink-0 rounded-full bg-amber-300" />
            <div className="min-w-0">
              <p className="text-[10px] tracking-widest text-white/50 uppercase">{mode === 'walk' ? 'You are in' : 'Viewing'}</p>
              <p className="truncate font-serif text-[15px] leading-tight">{zone}</p>
            </div>
          </div>

          {/* top-right: controls */}
          <div className={`absolute top-3 right-3 z-20 flex max-w-[92vw] flex-col items-end gap-2 rounded-xl p-2 ${glass}`}>
            <div className="flex flex-wrap items-center justify-end gap-1.5">
              <div className="flex gap-1 rounded-lg bg-black/20 p-0.5">
                <Btn active={time === 'day'} onClick={() => setT('day')} title="Daylight (1)">Day</Btn>
                <Btn active={time === 'golden'} onClick={() => setT('golden')} title="Golden hour (2)">Golden</Btn>
                <Btn active={time === 'night'} onClick={() => setT('night')} title="Night (3)">Night</Btn>
              </div>
              <Btn active={mode === 'orbit'} onClick={() => { setEntered(true); world.current?.toggleMode() }} title="Toggle aerial / walking (M)">{mode === 'orbit' ? 'Aerial' : 'Walking'}</Btn>
              <Btn active={tower} onClick={toggleTower} title="Show the demolished 47 m lookout tower">1940 tower</Btn>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-1.5">
              <Btn active={tour} onClick={() => (tour ? world.current?.stopTour() : startTour())} title="Guided tour (T)">{tour ? '■ Stop tour' : '▶ Guided tour'}</Btn>
              {!touch && <Btn onClick={() => world.current?.togglePointerLock()} title="Capture mouse for look-around (L)">🖱 Mouse look</Btn>}
              <select
                value={quality}
                onChange={(e) => setQ(e.target.value as Quality)}
                className="rounded-lg bg-white/10 px-2 py-1.5 text-[13px] text-white outline-none hover:bg-white/20"
                title="Graphics quality"
              >
                <option className="text-black" value="low">Low</option>
                <option className="text-black" value="medium">Medium</option>
                <option className="text-black" value="high">High</option>
              </select>
            </div>
          </div>

          {/* info card */}
          {poi && poi.text && (
            <div className={`absolute bottom-24 left-3 z-20 w-[min(26rem,calc(100vw-1.5rem))] rounded-2xl p-4 sm:bottom-20 ${glass}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] tracking-[0.25em] text-amber-200/90 uppercase">{poi.tag}</p>
                  <h2 className="font-serif text-xl leading-tight font-semibold">{poi.title}</h2>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button onClick={() => step(-1)} className="h-7 w-7 rounded-md bg-white/10 hover:bg-white/20" aria-label="Previous">‹</button>
                  <button onClick={() => step(1)} className="h-7 w-7 rounded-md bg-white/10 hover:bg-white/20" aria-label="Next">›</button>
                  <button onClick={() => setPoi(null)} className="h-7 w-7 rounded-md bg-white/10 hover:bg-white/20" aria-label="Close">×</button>
                </div>
              </div>
              <p className="mt-2 text-[13px] leading-relaxed text-white/80">{poi.text}</p>
            </div>
          )}

          {/* places strip */}
          <div className="absolute right-0 bottom-0 left-0 z-20 flex flex-col items-center gap-2 p-3 sm:pr-[11.5rem]">
            {help && !touch && (
              <div className={`pointer-events-auto flex items-center gap-3 rounded-full px-4 py-1.5 text-[12px] text-white/80 ${glass}`}>
                <span><b className="text-white">W A S D</b> move</span>
                <span><b className="text-white">Shift</b> run</span>
                <span><b className="text-white">Drag</b> look</span>
                <span><b className="text-white">Scroll</b> zoom</span>
                <span className="hidden md:inline"><b className="text-white">1·2·3</b> time · <b className="text-white">M</b> aerial</span>
                <button onClick={() => setHelp(false)} className="ml-1 text-white/50 hover:text-white" aria-label="Hide help">×</button>
              </div>
            )}
            <div className={`flex w-full max-w-4xl items-center gap-1 overflow-x-auto rounded-2xl p-1.5 ${glass} ${panel ? '' : 'hidden'}`}>
              {POIS.map((p, i) => (
                <button
                  key={p.id}
                  onClick={() => go(p)}
                  className={`shrink-0 rounded-xl px-3 py-1.5 text-left text-[12px] leading-tight transition-colors ${poi?.id === p.id ? 'bg-amber-300 text-stone-900' : 'text-white/85 hover:bg-white/15'}`}
                >
                  <span className="block text-[9px] tracking-widest uppercase opacity-60">{String(i + 1).padStart(2, '0')}</span>
                  {p.title}
                </button>
              ))}
            </div>
            <button onClick={() => setPanel((v) => !v)} className="text-[11px] text-white/60 hover:text-white">{panel ? 'Hide places ▾' : 'Show places ▴'}</button>
          </div>

          {/* minimap */}
          <div className="absolute right-3 bottom-3 z-20 hidden sm:block">
            <Minimap pose={pose} onPick={pick} />
          </div>

          {/* touch controls */}
          {touch && mode === 'walk' && (
            <div className="absolute bottom-28 left-4 z-30">
              <Joystick onMove={(x, y) => world.current?.setStick(x, y)} />
            </div>
          )}
        </>
      )}
    </div>
  )
}

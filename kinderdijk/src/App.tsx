import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Camera, Compass, Expand, Footprints, Info, Map as MapIcon, MousePointer2, Plane, Settings2, Volume2, VolumeX, Wind, X, ListTree } from 'lucide-react'
import { CamMode, Experience, Quality, TimeId } from './kd/Experience'
import type { Hotspot } from './kd/world'
import { Minimap } from './components/Minimap'

type Phase = 'loading' | 'ready' | 'playing' | 'error'

const heading = (yaw: number) => {
  const deg = (Math.atan2(Math.sin(yaw), -Math.cos(yaw)) * 180) / Math.PI
  return (deg + 360) % 360
}
const DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']

export default function App() {
  const host = useRef<HTMLDivElement>(null)
  const expRef = useRef<Experience | null>(null)
  const [phase, setPhase] = useState<Phase>('loading')
  const [progress, setProgress] = useState({ p: 0, label: 'Preparing' })
  const [err, setErr] = useState('')
  const [pos, setPos] = useState({ x: 0, z: 0, yaw: 0, pitch: 0, mode: 'walk' as CamMode })
  const [hotspots, setHotspots] = useState<Hotspot[]>([])
  const [near, setNear] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [panel, setPanel] = useState<'none' | 'settings' | 'guide' | 'map'>('none')
  const [locked, setLocked] = useState(false)
  const [time, setTime] = useState<TimeId>('day')
  const [quality, setQuality] = useState<Quality>('high')
  const [wind, setWind] = useState(0.45)
  const [sails, setSails] = useState(true)
  const [sound, setSound] = useState(true)
  const [fov, setFov] = useState(68)
  const [markers, setMarkers] = useState(true)
  const [mini, setMini] = useState(true)
  const [flash, setFlash] = useState(false)
  const [hint, setHint] = useState(true)
  const [inside, setInside] = useState(false)
  const mapData = useRef<{ mills: { x: number; z: number; far: boolean }[]; bridges: { x: number; z: number }[] }>({ mills: [], bridges: [] })
  const touch = useMemo(() => typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0), [])

  useEffect(() => {
    if (!host.current) return
    let cancelled = false
    let exp: Experience | null = null
    try {
      exp = new Experience(host.current, {
        onProgress: (p, label) => !cancelled && setProgress({ p, label }),
        onPlayer: (x, z, yaw, pitch, mode) => !cancelled && setPos({ x, z, yaw, pitch, mode }),
        onNear: (id) => !cancelled && setNear(id),
        onOpen: (id) => {
          if (cancelled) return
          setOpen(id)
          exp?.unlock()
        },
        onLock: (l) => !cancelled && setLocked(l),
        onZone: (i) => !cancelled && setInside(i),
      })
    } catch (e) {
      setErr('Your browser could not start WebGL. Please try a recent desktop Chrome, Edge, Firefox or Safari.')
      setPhase('error')
      return
    }
    expRef.current = exp
    ;(window as any).__kd = exp
    exp
      .load()
      .then(() => {
        if (cancelled) return
        const w = exp!.getWorld()
        mapData.current = { mills: w.millPoints, bridges: w.bridgePoints }
        setHotspots(exp!.getHotspots())
        exp!.start()
        setPhase('ready')
      })
      .catch((e) => {
        console.error(e)
        if (!cancelled) {
          setErr(String(e?.message || e))
          setPhase('error')
        }
      })
    return () => {
      cancelled = true
      exp?.dispose()
    }
  }, [])

  const enter = useCallback(() => {
    const e = expRef.current
    if (!e) return
    e.active = true
    e.setSound(true)
    e.setMarkersVisible(true)
    setPhase('playing')
    setTimeout(() => setHint(false), 14000)
    e.renderer.domElement.focus()
  }, [])

  // apply settings
  useEffect(() => void expRef.current?.setWind(wind), [wind, phase])
  useEffect(() => void expRef.current?.setSails(sails), [sails, phase])
  useEffect(() => void expRef.current?.setFov(fov), [fov, phase])
  useEffect(() => {
    if (phase === 'ready' || phase === 'playing') expRef.current?.setMarkersVisible(markers && phase === 'playing')
  }, [markers, phase])
  useEffect(() => {
    if (phase === 'playing') expRef.current?.setSound(sound)
  }, [sound, phase])

  const changeTime = (t: TimeId) => {
    setFlash(true)
    setTimeout(() => {
      expRef.current?.setTime(t)
      setTime(t)
    }, 220)
    setTimeout(() => setFlash(false), 520)
  }
  const changeQuality = (q: Quality) => {
    setQuality(q)
    expRef.current?.setQuality(q)
  }
  const go = (h: { x: number; z: number; yaw: number }, aerial = false) => {
    const e = expRef.current
    if (!e) return
    if (aerial) e.aerial(h.x, h.z, h.yaw)
    else e.teleport(h.x, h.z, h.yaw, 0)
    setPanel('none')
  }
  const photo = () => {
    const e = expRef.current
    if (!e) return
    const url = e.photo()
    const a = document.createElement('a')
    a.href = url
    a.download = 'kinderdijk.png'
    a.click()
  }
  const fullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen()
    else document.documentElement.requestFullscreen?.()
  }

  const info = hotspots.find((h) => h.id === open) ?? null
  const nearSpot = hotspots.find((h) => h.id === near) ?? null
  const hd = heading(pos.yaw)
  const dir = DIRS[Math.round(hd / 45) % 8]
  const playing = phase === 'playing'

  // keep keyboard shortcuts for panels
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (!playing) return
      if (e.code === 'KeyM') setPanel((p) => (p === 'map' ? 'none' : 'map'))
      if (e.code === 'KeyG') setPanel((p) => (p === 'guide' ? 'none' : 'guide'))
      if (e.code === 'Escape') {
        setPanel('none')
        setOpen(null)
      }
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [playing])

  return (
    <div className="fixed inset-0 select-none overflow-hidden bg-slate-950 text-white">
      <div ref={host} className="absolute inset-0" />

      {/* time-of-day flash */}
      <div className={`pointer-events-none absolute inset-0 bg-black transition-opacity duration-300 ${flash ? 'opacity-70' : 'opacity-0'}`} />

      {/* LOADING */}
      {phase === 'loading' && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[radial-gradient(ellipse_at_top,#1e3a5f,#0b1220_70%)]">
          <div className="font-display text-sm uppercase tracking-[0.4em] text-amber-300/80">UNESCO World Heritage</div>
          <h1 className="font-display mt-3 text-5xl font-semibold tracking-tight md:text-6xl">Kinderdijk</h1>
          <p className="mt-2 text-slate-300">Preparing your walk along the Molenkade…</p>
          <div className="mt-8 h-1.5 w-72 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all duration-300" style={{ width: `${Math.round(progress.p * 100)}%` }} />
          </div>
          <div className="mt-3 text-xs text-slate-400">{progress.label}</div>
        </div>
      )}

      {phase === 'error' && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-slate-950 p-8 text-center">
          <h1 className="font-display text-3xl">Something went wrong</h1>
          <p className="mt-3 max-w-md text-slate-300">{err}</p>
        </div>
      )}

      {/* START */}
      {phase === 'ready' && (
        <div className="absolute inset-0 z-40 flex items-end justify-center bg-gradient-to-t from-slate-950/85 via-slate-950/20 to-slate-950/30 p-6 pb-10 md:items-center md:justify-start md:bg-gradient-to-r md:from-slate-950/80 md:via-slate-950/30 md:to-transparent md:p-16">
          <div className="fade-up max-w-xl">
            <div className="font-display text-xs uppercase tracking-[0.4em] text-amber-300">Zuid-Holland · Alblasserwaard</div>
            <h1 className="font-display mt-3 text-6xl font-semibold leading-none tracking-tight md:text-7xl">Kinderdijk</h1>
            <p className="mt-4 text-lg leading-relaxed text-slate-200">
              Walk the Molenkade between nineteen 18th-century windmills. Cross the footbridges, stand beneath the sails and read the story of the polder.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button onClick={enter} className="rounded-full bg-gradient-to-r from-amber-400 to-orange-500 px-8 py-3.5 text-base font-semibold text-slate-950 shadow-xl shadow-orange-900/30 transition hover:scale-[1.03] active:scale-95">
                Enter the polder
              </button>
              <div className="flex gap-1 rounded-full bg-white/10 p-1 backdrop-blur">
                {(['day', 'golden', 'overcast'] as TimeId[]).map((t) => (
                  <button key={t} onClick={() => changeTime(t)} className={`rounded-full px-3.5 py-2 text-xs font-medium capitalize transition ${time === t ? 'bg-white text-slate-900' : 'text-slate-200 hover:bg-white/10'}`}>
                    {t === 'golden' ? 'Golden hour' : t === 'day' ? 'Sunny' : 'Overcast'}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-6 grid max-w-md grid-cols-2 gap-x-6 gap-y-1.5 text-sm text-slate-300">
              {touch ? (
                <>
                  <span>Left thumb · walk</span>
                  <span>Right thumb · look</span>
                </>
              ) : (
                <>
                  <span><kbd className="kbd">W A S D</kbd> walk</span>
                  <span><kbd className="kbd">Shift</kbd> run</span>
                  <span><kbd className="kbd">Mouse</kbd> look (click to capture)</span>
                  <span><kbd className="kbd">E</kbd> read a guide post</span>
                  <span><kbd className="kbd">F</kbd> walk / fly</span>
                  <span><kbd className="kbd">M</kbd> map · <kbd className="kbd">G</kbd> guide</span>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* HUD */}
      {playing && (
        <>
          <div className="pointer-events-none absolute left-4 top-4 z-20 flex flex-col gap-2">
            <div className="glass pointer-events-auto rounded-2xl px-4 py-2.5">
              <div className="font-display text-lg leading-none">Kinderdijk</div>
              <div className="mt-1 text-[11px] uppercase tracking-widest text-amber-300/90">Molenvliet · UNESCO 1997</div>
            </div>
          </div>

          {/* compass */}
          <div className="pointer-events-none absolute left-1/2 top-4 z-20 -translate-x-1/2">
            <div className="glass flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-medium tabular-nums">
              <Compass size={14} className="text-amber-300" />
              {inside && <span className="rounded bg-amber-300/90 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-950">Inside the mill</span>}
              <span className="w-6 text-center text-white">{dir}</span>
              <span className="text-slate-300">{Math.round(hd)}°</span>
              <span className="ml-2 rounded bg-white/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-slate-200">{pos.mode === 'walk' ? 'Walking' : 'Flying'}</span>
            </div>
          </div>

          {/* toolbar */}
          <div className="absolute right-4 top-4 z-30 flex flex-col gap-2">
            <Tool icon={<ListTree size={18} />} label="Guide (G)" active={panel === 'guide'} onClick={() => setPanel(panel === 'guide' ? 'none' : 'guide')} />
            <Tool icon={<MapIcon size={18} />} label="Map (M)" active={panel === 'map'} onClick={() => setPanel(panel === 'map' ? 'none' : 'map')} />
            <Tool icon={<Settings2 size={18} />} label="Settings" active={panel === 'settings'} onClick={() => setPanel(panel === 'settings' ? 'none' : 'settings')} />
            <Tool icon={pos.mode === 'walk' ? <Plane size={18} /> : <Footprints size={18} />} label={pos.mode === 'walk' ? 'Fly (F)' : 'Walk (F)'} onClick={() => expRef.current?.setMode(pos.mode === 'walk' ? 'fly' : 'walk')} />
            <Tool icon={sound ? <Volume2 size={18} /> : <VolumeX size={18} />} label="Sound" onClick={() => setSound(!sound)} />
            <Tool icon={<Camera size={18} />} label="Photo" onClick={photo} />
            <Tool icon={<Expand size={18} />} label="Fullscreen" onClick={fullscreen} />
          </div>

          {/* crosshair */}
          {!touch && <div className={`pointer-events-none absolute left-1/2 top-1/2 z-10 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/70 ring-1 ring-black/30 transition-opacity ${locked ? 'opacity-90' : 'opacity-0'}`} />}

          {/* minimap */}
          {mini && !inside && panel !== 'map' && (
            <div className="absolute bottom-4 left-4 z-20 hidden md:block">
              <div className="glass rounded-2xl p-1.5">
                <Minimap
                  x={pos.x} z={pos.z} yaw={pos.yaw}
                  mills={mapData.current.mills} bridges={mapData.current.bridges}
                  spots={hotspots}
                  onPick={(x, z) => {
                    const s = expRef.current?.safeSpot(x, z)
                    if (s) expRef.current?.teleport(s[0], s[1], pos.yaw, 0)
                  }}
                />
              </div>
              <button onClick={() => setMini(false)} className="mt-1 ml-1 text-[10px] uppercase tracking-widest text-white/60 hover:text-white">hide map</button>
            </div>
          )}
          {!mini && !inside && (
            <button onClick={() => setMini(true)} className="glass absolute bottom-4 left-4 z-20 hidden items-center gap-2 rounded-full px-3 py-2 text-xs md:flex">
              <MapIcon size={14} /> Show map
            </button>
          )}

          {/* prompt */}
          {nearSpot && !open && (
            <div className="fade-up absolute bottom-24 left-1/2 z-20 -translate-x-1/2">
              <button onClick={() => { setOpen(nearSpot.id); expRef.current?.unlock() }} className="glass flex items-center gap-3 rounded-full px-5 py-2.5 text-sm hover:bg-white/10">
                <span className="grid h-6 w-6 place-items-center rounded-md bg-white text-xs font-bold text-slate-900">E</span>
                <span>{nearSpot.title}</span>
              </button>
            </div>
          )}

          {/* hint */}
          {hint && !touch && (
            <div className="pointer-events-none absolute bottom-6 left-1/2 z-10 -translate-x-1/2 text-center text-xs text-white/85 drop-shadow">
              <span className="glass rounded-full px-4 py-2">
                {locked ? 'Esc to release the mouse · ' : 'Click the scene to look around · '}
                <kbd className="kbd">WASD</kbd> to walk · look for the <span className="font-display italic text-amber-200">i</span> markers
              </span>
            </div>
          )}

          {/* info card */}
          {info && (
            <div className="fade-up absolute inset-x-4 bottom-4 z-40 md:inset-x-auto md:bottom-6 md:right-6 md:w-[26rem]">
              <div className="glass rounded-3xl p-6 shadow-2xl">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.25em] text-amber-300">{info.kicker}</div>
                    <h2 className="font-display mt-1 text-2xl leading-tight">{info.title}</h2>
                  </div>
                  <button onClick={() => setOpen(null)} className="rounded-full bg-white/10 p-1.5 hover:bg-white/20"><X size={16} /></button>
                </div>
                <p className="mt-3 text-[13.5px] leading-relaxed text-slate-200">{info.text}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {info.facts.map(([k, v]) => (
                    <div key={k} className="rounded-xl bg-white/8 px-3 py-1.5 text-xs ring-1 ring-white/10">
                      <div className="text-[10px] uppercase tracking-wider text-slate-400">{k}</div>
                      <div className="font-medium text-white">{v}</div>
                    </div>
                  ))}
                </div>
                <button onClick={() => (info.view ? go(info.view) : setOpen(null))} className="mt-5 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-semibold text-slate-900 hover:bg-amber-200">
                  <MousePointer2 size={13} /> {info.view ? 'Take me there' : 'Continue exploring'}
                </button>
              </div>
            </div>
          )}

          {/* side panels */}
          {panel === 'guide' && (
            <Panel title="Guide" onClose={() => setPanel('none')}>
              <div className="space-y-1.5">
                {hotspots.filter((h) => h.zone !== 'in' && h.view).map((h) => (
                  <button key={h.id} onClick={() => { go(h.view!); if (!h.action) setOpen(h.id) }} className="group flex w-full items-center gap-3 rounded-xl bg-white/5 px-3 py-2.5 text-left transition hover:bg-white/12">
                    <span className="font-display grid h-7 w-7 shrink-0 place-items-center rounded-full bg-amber-300 text-sm italic text-amber-950">i</span>
                    <span>
                      <span className="block text-sm font-medium">{h.title}</span>
                      <span className="block text-[10px] uppercase tracking-widest text-slate-400">{h.kicker}</span>
                    </span>
                  </button>
                ))}
                <button
                  onClick={() => { const w = expRef.current!.getWorld(); go({ x: w.spawn.x, z: w.spawn.z, yaw: w.spawn.yaw }, true) }}
                  className="flex w-full items-center gap-3 rounded-xl bg-gradient-to-r from-sky-500/30 to-indigo-500/30 px-3 py-2.5 text-left hover:from-sky-500/40"
                >
                  <Plane size={18} className="ml-1" />
                  <span className="text-sm font-medium">Aerial view of the mills</span>
                </button>
              </div>
            </Panel>
          )}
          {panel === 'map' && (
            <div className="absolute inset-0 z-40 grid place-items-center bg-slate-950/50 p-4 backdrop-blur-sm" onClick={() => setPanel('none')}>
              <div className="glass fade-up rounded-3xl p-4" onClick={(e) => e.stopPropagation()}>
                <div className="mb-3 flex items-center justify-between px-1">
                  <div className="font-display text-lg">Molenvliet map</div>
                  <button onClick={() => setPanel('none')} className="rounded-full bg-white/10 p-1.5"><X size={16} /></button>
                </div>
                <Minimap
                  big x={pos.x} z={pos.z} yaw={pos.yaw}
                  mills={mapData.current.mills} bridges={mapData.current.bridges} spots={hotspots}
                  onPick={(x, z) => {
                    const s = expRef.current?.safeSpot(x, z)
                    if (s) { expRef.current?.teleport(s[0], s[1], pos.yaw, 0); setPanel('none') }
                  }}
                />
                <div className="mt-3 px-1 text-xs text-slate-300">Click anywhere on solid ground to teleport. White circles are windmills, amber dots are guide posts, brown bars are footbridges.</div>
              </div>
            </div>
          )}
          {panel === 'settings' && (
            <Panel title="Settings" onClose={() => setPanel('none')}>
              <div className="space-y-5 text-sm">
                <Field label="Light & weather">
                  <div className="flex gap-1 rounded-full bg-white/10 p-1">
                    {(['day', 'golden', 'overcast'] as TimeId[]).map((t) => (
                      <button key={t} onClick={() => changeTime(t)} className={`flex-1 rounded-full px-2 py-1.5 text-xs font-medium transition ${time === t ? 'bg-white text-slate-900' : 'text-slate-200 hover:bg-white/10'}`}>
                        {t === 'golden' ? 'Golden hour' : t === 'day' ? 'Sunny' : 'Overcast'}
                      </button>
                    ))}
                  </div>
                </Field>
                <Field label={<span className="flex items-center gap-1.5"><Wind size={13} /> Wind · {Math.round(wind * 100)}%</span>}>
                  <input type="range" min={0} max={1.2} step={0.01} value={wind} onChange={(e) => setWind(parseFloat(e.target.value))} className="w-full" />
                </Field>
                <Field label="Sails">
                  <Toggle on={sails} onClick={() => setSails(!sails)} label={sails ? 'Turning' : 'Resting'} />
                </Field>
                <Field label={`Field of view · ${fov}°`}>
                  <input type="range" min={40} max={90} step={1} value={fov} onChange={(e) => setFov(parseInt(e.target.value))} className="w-full" />
                </Field>
                <Field label="Graphics quality">
                  <div className="flex gap-1 rounded-full bg-white/10 p-1">
                    {(['low', 'medium', 'high'] as Quality[]).map((q) => (
                      <button key={q} onClick={() => changeQuality(q)} className={`flex-1 rounded-full px-2 py-1.5 text-xs font-medium capitalize transition ${quality === q ? 'bg-white text-slate-900' : 'text-slate-200 hover:bg-white/10'}`}>{q}</button>
                    ))}
                  </div>
                  <div className="mt-1.5 text-[11px] text-slate-400">Lower the quality if the scene feels slow on your device.</div>
                </Field>
                <Field label="Guide markers">
                  <Toggle on={markers} onClick={() => setMarkers(!markers)} label={markers ? 'Visible' : 'Hidden'} />
                </Field>
              </div>
            </Panel>
          )}

          {touch && <TouchControls exp={expRef} />}
        </>
      )}

      {/* About button on start screen */}
      {phase === 'ready' && (
        <div className="absolute bottom-4 right-4 z-40 flex items-center gap-1.5 text-[11px] text-white/60">
          <Info size={12} /> Textures &amp; skies: Poly Haven (CC0)
        </div>
      )}
    </div>
  )
}

function Tool({ icon, label, onClick, active }: { icon: React.ReactNode; label: string; onClick: () => void; active?: boolean }) {
  return (
    <button title={label} aria-label={label} onClick={onClick} className={`glass grid h-10 w-10 place-items-center rounded-full transition hover:scale-105 hover:bg-white/15 ${active ? 'bg-white/25 ring-1 ring-amber-300/60' : ''}`}>
      {icon}
    </button>
  )
}
function Panel({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fade-up absolute right-16 top-4 z-30 max-h-[calc(100%-2rem)] w-80 max-w-[calc(100%-5.5rem)] overflow-y-auto rounded-3xl glass p-5 shadow-2xl">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-display text-xl">{title}</h3>
        <button onClick={onClose} className="rounded-full bg-white/10 p-1.5 hover:bg-white/20"><X size={16} /></button>
      </div>
      {children}
    </div>
  )
}
function Field({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-widest text-slate-300">{label}</div>
      {children}
    </div>
  )
}
function Toggle({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} className="flex w-full items-center justify-between rounded-full bg-white/10 px-3 py-2 text-xs">
      <span>{label}</span>
      <span className={`relative h-5 w-9 rounded-full transition ${on ? 'bg-amber-400' : 'bg-white/20'}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
      </span>
    </button>
  )
}

function TouchControls({ exp }: { exp: React.RefObject<Experience | null> }) {
  const [stick, setStick] = useState<{ x: number; y: number } | null>(null)
  const origin = useRef<{ x: number; y: number; id: number } | null>(null)
  const lookId = useRef<{ id: number; x: number; y: number } | null>(null)

  const onStart = (e: React.TouchEvent) => {
    for (const t of Array.from(e.changedTouches)) {
      if (t.clientX < window.innerWidth * 0.5 && !origin.current) origin.current = { x: t.clientX, y: t.clientY, id: t.identifier }
      else if (!lookId.current) lookId.current = { id: t.identifier, x: t.clientX, y: t.clientY }
    }
  }
  const onMove = (e: React.TouchEvent) => {
    for (const t of Array.from(e.changedTouches)) {
      if (origin.current && t.identifier === origin.current.id) {
        const dx = clampN((t.clientX - origin.current.x) / 50)
        const dy = clampN((t.clientY - origin.current.y) / 50)
        setStick({ x: dx, y: dy })
        exp.current?.setJoystick(dx, -dy)
      } else if (lookId.current && t.identifier === lookId.current.id) {
        exp.current?.look(t.clientX - lookId.current.x, t.clientY - lookId.current.y, 0.0045)
        lookId.current.x = t.clientX
        lookId.current.y = t.clientY
      }
    }
  }
  const onEnd = (e: React.TouchEvent) => {
    for (const t of Array.from(e.changedTouches)) {
      if (origin.current && t.identifier === origin.current.id) {
        origin.current = null
        setStick(null)
        exp.current?.setJoystick(0, 0)
      }
      if (lookId.current && t.identifier === lookId.current.id) lookId.current = null
    }
  }
  return (
    <div className="absolute inset-x-0 bottom-0 top-20 z-10" onTouchStart={onStart} onTouchMove={onMove} onTouchEnd={onEnd} onTouchCancel={onEnd}>
      <div className="pointer-events-none absolute bottom-10 left-10 grid h-28 w-28 place-items-center rounded-full border border-white/25 bg-white/5">
        <div className="h-12 w-12 rounded-full bg-white/40 backdrop-blur" style={{ transform: `translate(${(stick?.x ?? 0) * 34}px, ${(stick?.y ?? 0) * 34}px)` }} />
      </div>
    </div>
  )
}
const clampN = (v: number) => Math.max(-1, Math.min(1, v))

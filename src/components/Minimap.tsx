import { useEffect, useRef } from 'react'
import { LANDMARKS } from '../three/landmarks'
import { MAP_BOUNDS, drawMap, mapSize, miniToWorld, worldToMini } from '../three/map'

interface Props {
  selected: string | null
  camRef: React.MutableRefObject<{ x: number; z: number; yaw: number }>
  onPick: (id: string) => void
  onJump: (x: number, z: number) => void
  className?: string
}

export default function Minimap({ selected, camRef, onPick, onJump, className }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const marker = useRef<HTMLDivElement>(null)
  const { W, H } = mapSize(360)
  const aspect = (MAP_BOUNDS.maxX - MAP_BOUNDS.minX) / (MAP_BOUNDS.maxZ - MAP_BOUNDS.minZ)

  useEffect(() => {
    const c = canvas.current!
    c.width = W
    c.height = H
    drawMap(c.getContext('2d')!, W, H, 'mini')
  }, [W, H])

  useEffect(() => {
    let raf = 0
    const loop = () => {
      const m = marker.current
      if (m) {
        const [u, v] = worldToMini(camRef.current.x, camRef.current.z)
        m.style.left = `${Math.max(0, Math.min(1, u)) * 100}%`
        m.style.top = `${Math.max(0, Math.min(1, v)) * 100}%`
        m.style.transform = `translate(-50%,-50%) rotate(${camRef.current.yaw}rad)`
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [camRef])

  return (
    <div
      className={`relative overflow-hidden rounded-xl border border-brass/40 shadow-2xl shadow-black/60 ${className ?? ''}`}
      style={{ aspectRatio: String(aspect) }}
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect()
        const [x, z] = miniToWorld((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height)
        onJump(x, z)
      }}
    >
      <canvas ref={canvas} className="absolute inset-0 h-full w-full" />
      {LANDMARKS.map((l, i) => {
        const [u, v] = worldToMini(l.x, l.z)
        const active = l.id === selected
        return (
          <button
            key={l.id}
            title={l.name}
            onClick={(e) => {
              e.stopPropagation()
              onPick(l.id)
            }}
            className={`absolute grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full font-bold transition-all ${
              active ? 'z-10 h-[18px] w-[18px] bg-white text-[10px] text-ink ring-2 ring-brass' : 'h-[14px] w-[14px] bg-brass text-[8px] text-ink hover:scale-125'
            }`}
            style={{ left: `${u * 100}%`, top: `${v * 100}%` }}
          >
            {i + 1}
          </button>
        )
      })}
      <div ref={marker} className="pointer-events-none absolute z-20">
        <svg width="18" height="18" viewBox="0 0 18 18">
          <path d="M9 1 L15 16 L9 12.5 L3 16 Z" fill="#ff7a1a" stroke="#fff" strokeWidth="1.4" strokeLinejoin="round" />
        </svg>
      </div>
      <div className="pointer-events-none absolute bottom-1 left-2 text-[9px] font-semibold uppercase tracking-[0.2em] text-white/60">N ↑</div>
    </div>
  )
}

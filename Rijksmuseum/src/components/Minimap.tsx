import { useEffect, useRef } from 'react'
import { POIS } from '../rijks/pois'
import { C } from '../rijks/world'
import type { FrameInfo } from '../rijks/Explorer'

const SIZE = 208
const X0 = -92, X1 = 92, Z0 = -72, Z1 = 112
const sx = (x: number) => ((x - X0) / (X1 - X0)) * SIZE
const sz = (z: number) => ((z - Z0) / (Z1 - Z0)) * SIZE

export default function Minimap({ frame, onGo }: { frame: FrameInfo | null; onGo: (i: number) => void }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const c = ref.current
    if (!c) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    c.width = SIZE * dpr
    c.height = SIZE * dpr
    const g = c.getContext('2d')!
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    g.clearRect(0, 0, SIZE, SIZE)
    // lawn
    g.fillStyle = '#34512f'
    g.fillRect(0, 0, SIZE, SIZE)
    // promenade + pond
    g.fillStyle = '#9a9283'
    g.fillRect(sx(-10), sz(66), sx(10) - sx(-10), SIZE - sz(66))
    g.fillRect(sx(-92), sz(-68), SIZE, sz(68) - sz(-68))
    g.fillStyle = '#3d6f86'
    g.fillRect(sx(-26), sz(98), sx(26) - sx(-26), sz(130) - sz(98))
    // building
    g.fillStyle = '#8c3f2d'
    g.fillRect(sx(-C.HW), sz(-C.HD), sx(C.HW) - sx(-C.HW), sz(C.HD) - sz(-C.HD))
    // atria
    g.fillStyle = frame && frame.level ? '#e8dcc0' : '#d6c9a8'
    for (const s of [-1, 1]) g.fillRect(sx(s > 0 ? C.AX0 : -C.AX1), sz(-C.AZ), sx(C.AX1) - sx(C.AX0), sz(C.AZ) - sz(-C.AZ))
    // passage
    g.fillStyle = '#b46a5a'
    g.fillRect(sx(-C.PW), sz(-C.HD), sx(C.PW) - sx(-C.PW), sz(C.HD) - sz(-C.HD))
    // gallery of honour (highlighted on level 1)
    g.fillStyle = frame && frame.level ? '#e9c46a' : 'rgba(233,196,106,0.35)'
    g.fillRect(sx(-C.PW), sz(C.GZ0), sx(C.PW) - sx(-C.PW), sz(C.GZ1) - sz(C.GZ0))
    // pois
    POIS.forEach((p) => {
      g.fillStyle = '#ffffff'
      g.beginPath()
      g.arc(sx(p.view.x), sz(p.view.z), 2.4, 0, Math.PI * 2)
      g.fill()
    })
    // player
    if (frame) {
      g.save()
      g.translate(sx(frame.x), sz(frame.z))
      g.rotate(-frame.yaw)
      g.fillStyle = '#ff4d3a'
      g.strokeStyle = '#fff'
      g.lineWidth = 1.4
      g.beginPath()
      g.moveTo(0, -8); g.lineTo(5.5, 6); g.lineTo(0, 3); g.lineTo(-5.5, 6); g.closePath()
      g.fill(); g.stroke()
      g.restore()
    }
  }, [frame])

  const click = (e: React.MouseEvent) => {
    const r = (e.target as HTMLCanvasElement).getBoundingClientRect()
    const x = X0 + ((e.clientX - r.left) / r.width) * (X1 - X0)
    const z = Z0 + ((e.clientY - r.top) / r.height) * (Z1 - Z0)
    let best = -1, bd = 14
    POIS.forEach((p, i) => {
      const d = Math.hypot(p.view.x - x, p.view.z - z)
      if (d < bd) { bd = d; best = i }
    })
    if (best >= 0) onGo(best)
  }

  return (
    <canvas
      ref={ref}
      onClick={click}
      style={{ width: SIZE, height: SIZE }}
      className="block cursor-pointer rounded-xl ring-1 ring-white/20"
      aria-label="Floor plan minimap"
    />
  )
}

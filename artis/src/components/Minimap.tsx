import { useEffect, useRef } from 'react'
import { ISLAND, PATHS, PLAZA_R, POND, pondR } from '../artis/nature'
import { POIS } from '../artis/data'

const W = 190
const H = 160
const X0 = -100
const X1 = 100
const Z0 = -72
const Z1 = 98
const sx = (x: number) => ((x - X0) / (X1 - X0)) * W
const sz = (z: number) => ((z - Z0) / (Z1 - Z0)) * H

function drawStatic(g: CanvasRenderingContext2D) {
  g.fillStyle = '#35502b'
  g.fillRect(0, 0, W, H)
  // street
  g.fillStyle = '#3b3d40'
  g.fillRect(0, sz(75), W, sz(89) - sz(75))
  g.fillStyle = '#8f8576'
  g.fillRect(0, sz(70), W, sz(75) - sz(70))
  // paths
  for (const p of PATHS) {
    g.strokeStyle = p.kind === 'paving' ? '#9d8d80' : '#cdbf9f'
    g.lineWidth = Math.max(1.5, (p.w / (X1 - X0)) * W)
    g.lineCap = 'round'
    g.beginPath()
    p.pts.forEach(([x, z], i) => (i ? g.lineTo(sx(x), sz(z)) : g.moveTo(sx(x), sz(z))))
    g.stroke()
  }
  g.fillStyle = '#9d8d80'
  g.beginPath()
  g.arc(sx(0), sz(0), (PLAZA_R / (X1 - X0)) * W, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = '#c14b5a'
  g.beginPath()
  g.arc(sx(0), sz(0), (6 / (X1 - X0)) * W, 0, Math.PI * 2)
  g.fill()
  // pond
  g.fillStyle = '#2f6a74'
  g.beginPath()
  for (let i = 0; i <= 60; i++) {
    const a = (i / 60) * Math.PI * 2
    const r = pondR(a)
    const x = sx(POND.cx + Math.cos(a) * r)
    const z = sz(POND.cz + Math.sin(a) * r)
    i ? g.lineTo(x, z) : g.moveTo(x, z)
  }
  g.fill()
  g.fillStyle = '#58803e'
  g.beginPath()
  g.arc(sx(ISLAND.x), sz(ISLAND.z), (ISLAND.r / (X1 - X0)) * W, 0, Math.PI * 2)
  g.fill()
  // buildings
  const rect = (x0: number, x1: number, z0: number, z1: number, c: string) => {
    g.fillStyle = c
    g.fillRect(sx(x0), sz(z0), sx(x1) - sx(x0), sz(z1) - sz(z0))
  }
  rect(-36, 36, -62, -40, '#d8c9a4')
  g.fillStyle = '#6fa592'
  g.beginPath()
  g.arc(sx(36), sz(-51), (11 / (X1 - X0)) * W, -Math.PI / 2, Math.PI / 2)
  g.fill()
  rect(-74, -56, -21, 33, '#e5dcc3')
  rect(14, 46, 58, 70, '#9a4a35')
  // fence
  g.strokeStyle = '#111'
  g.lineWidth = 1
  g.strokeRect(sx(-92), sz(-66), sx(92) - sx(-92), sz(70) - sz(-66))
  // gate
  g.fillStyle = '#d9b24a'
  g.fillRect(sx(-5), sz(70) - 1.5, sx(5) - sx(-5), 3)
}

export default function Minimap({ pos, register, onPick }: { pos: React.RefObject<{ x: number; z: number; yaw: number }>; register: (f: () => void) => void; onPick: (id: string) => void }) {
  const cv = useRef<HTMLCanvasElement>(null)
  const base = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const b = document.createElement('canvas')
    b.width = W * 2
    b.height = H * 2
    const g = b.getContext('2d')!
    g.scale(2, 2)
    drawStatic(g)
    base.current = b
    const draw = () => {
      const c = cv.current
      if (!c || !base.current) return
      const ctx = c.getContext('2d')!
      ctx.setTransform(2, 0, 0, 2, 0, 0)
      ctx.clearRect(0, 0, W, H)
      ctx.drawImage(base.current, 0, 0, W, H)
      // pois
      for (const p of POIS) {
        ctx.fillStyle = '#f4ecd6'
        ctx.strokeStyle = '#d9b24a'
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.arc(sx(p.anchor[0]), sz(p.anchor[2]), 3, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
      }
      const { x, z, yaw } = pos.current!
      const px = sx(x)
      const pz = sz(z)
      // view cone
      ctx.save()
      ctx.translate(px, pz)
      ctx.rotate(-yaw)
      const grd = ctx.createRadialGradient(0, 0, 0, 0, 0, 36)
      grd.addColorStop(0, 'rgba(255,255,255,0.5)')
      grd.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = grd
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.arc(0, 0, 36, -Math.PI / 2 - 0.55, -Math.PI / 2 + 0.55)
      ctx.fill()
      ctx.fillStyle = '#ff5a4d'
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(0, -6)
      ctx.lineTo(4.5, 5)
      ctx.lineTo(0, 2.5)
      ctx.lineTo(-4.5, 5)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
      ctx.restore()
    }
    register(draw)
    draw()
  }, [pos, register])

  const click = (e: React.MouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const x = ((e.clientX - r.left) / r.width) * (X1 - X0) + X0
    const z = ((e.clientY - r.top) / r.height) * (Z1 - Z0) + Z0
    let best: string | null = null
    let bd = 16
    for (const p of POIS) {
      const d = Math.hypot(p.anchor[0] - x, p.anchor[2] - z)
      if (d < bd) {
        bd = d
        best = p.id
      }
    }
    if (best) onPick(best)
  }

  return (
    <div className="glass overflow-hidden rounded-2xl p-1.5">
      <canvas ref={cv} width={W * 2} height={H * 2} onClick={click} className="block cursor-pointer rounded-xl" style={{ width: W, height: H }} />
      <div className="flex justify-between px-1.5 pb-0.5 pt-1 text-[9px] uppercase tracking-[0.18em] text-white/45">
        <span>Plan</span>
        <span>click a place to visit</span>
      </div>
    </div>
  )
}

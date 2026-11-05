import { useEffect, useMemo, useRef } from 'react'
import { DATA, ptsOf } from '../campus/data'
import { POIS } from '../campus/pois'
import type { Phase } from '../campus/Experience'

const X0 = -760, X1 = 960, Z0 = -1270, Z1 = 1270

interface Props {
  x: number; z: number; yaw: number; phase: Phase; large: boolean
  onPick: (x: number, z: number) => void
  views: Map<string, { cx: number; cz: number }> | null
}

export default function MiniMap({ x, z, yaw, phase, large, onPick, views }: Props) {
  const W = large ? 340 : 168
  const H = Math.round((W * (Z1 - Z0)) / (X1 - X0))
  const ref = useRef<HTMLCanvasElement>(null)

  const base = useMemo(() => {
    const S = 2
    const w = 340 * S, h = Math.round((340 * (Z1 - Z0)) / (X1 - X0)) * S
    const c = document.createElement('canvas')
    c.width = w; c.height = h
    const g = c.getContext('2d')!
    const k = w / (X1 - X0)
    const tx = (px: number) => (px - X0) * k
    const tz = (pz: number) => (pz - Z0) * k
    g.fillStyle = '#243326'
    g.fillRect(0, 0, w, h)
    const poly = (p: number[], fill: string) => {
      const P = ptsOf(p)
      g.beginPath()
      P.forEach((q, i) => (i ? g.lineTo(tx(q[0]), tz(q[1])) : g.moveTo(tx(q[0]), tz(q[1]))))
      g.closePath()
      g.fillStyle = fill
      g.fill()
    }
    for (const a of DATA.areas) {
      if (a.k === 'grass' || a.k === 'wood' || a.k === 'meadow' || a.k === 'garden') poly(a.p, a.k === 'wood' ? '#2d4a2f' : '#36513a')
      else if (a.k === 'pitch' || a.k === 'court') poly(a.p, '#3f6b45')
      else if (a.k === 'parking' || a.k === 'paved') poly(a.p, '#3a3d42')
    }
    for (const a of DATA.areas) if (a.k === 'water') poly(a.p, '#2f6f95')
    g.lineCap = 'round'
    g.lineJoin = 'round'
    for (const w2 of DATA.water) {
      const P = ptsOf(w2.p)
      g.beginPath()
      P.forEach((q, i) => (i ? g.lineTo(tx(q[0]), tz(q[1])) : g.moveTo(tx(q[0]), tz(q[1]))))
      g.strokeStyle = '#2f6f95'; g.lineWidth = Math.max(1, w2.w * k); g.stroke()
    }
    for (const r of DATA.roads) {
      if (r.k === 'service' && r.w < 4) continue
      const P = ptsOf(r.p)
      g.beginPath()
      P.forEach((q, i) => (i ? g.lineTo(tx(q[0]), tz(q[1])) : g.moveTo(tx(q[0]), tz(q[1]))))
      g.strokeStyle = r.k === 'cycleway' ? '#7a4a45' : r.k === 'footway' || r.k === 'path' ? '#555a60' : '#8d939a'
      g.lineWidth = Math.max(0.8, Math.min(r.w, 9) * k * 0.9)
      g.stroke()
    }
    for (const b of DATA.buildings) {
      const uni = b.t === 'university' || b.ref !== ''
      poly(b.p, uni ? '#00a6d6' : '#9aa0a8')
    }
    return c.toDataURL()
  }, [])

  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    cv.width = W * 2; cv.height = H * 2
    const g = cv.getContext('2d')!
    const img = new Image()
    img.onload = () => {
      g.clearRect(0, 0, cv.width, cv.height)
      g.drawImage(img, 0, 0, cv.width, cv.height)
      const k = cv.width / (X1 - X0)
      if (views) {
        for (const p of POIS) {
          const v = views.get(p.id)
          if (!v) continue
          if (p.kind !== 'faculty' && !large) continue
          g.beginPath()
          g.arc((v.cx - X0) * k, (v.cz - Z0) * k, p.kind === 'faculty' ? 4.5 : 3, 0, Math.PI * 2)
          g.fillStyle = p.color
          g.fill()
          g.lineWidth = 1.5
          g.strokeStyle = '#0b1218'
          g.stroke()
          if (large && p.abbr) {
            g.font = 'bold 15px system-ui, sans-serif'
            g.fillStyle = '#fff'
            g.strokeStyle = 'rgba(0,0,0,.8)'
            g.lineWidth = 3
            g.strokeText(p.abbr, (v.cx - X0) * k + 7, (v.cz - Z0) * k + 5)
            g.fillText(p.abbr, (v.cx - X0) * k + 7, (v.cz - Z0) * k + 5)
          }
        }
      }
    }
    img.src = base
  }, [base, W, H, views, large])

  const px = ((x - X0) / (X1 - X0)) * W
  const pz = ((z - Z0) / (Z1 - Z0)) * H
  const inside = px >= 0 && px <= W && pz >= 0 && pz <= H

  return (
    <div
      className="relative overflow-hidden rounded-xl border border-white/15 shadow-2xl shadow-black/50 cursor-crosshair"
      style={{ width: W, height: H }}
      onPointerDown={(e) => {
        if (phase === 'attract' || phase === 'loading') return
        const r = (e.currentTarget as HTMLDivElement).getBoundingClientRect()
        const mx = ((e.clientX - r.left) / r.width) * (X1 - X0) + X0
        const mz = ((e.clientY - r.top) / r.height) * (Z1 - Z0) + Z0
        onPick(mx, mz)
      }}
    >
      <canvas ref={ref} style={{ width: W, height: H }} className="block" />
      {inside && (
        <div className="absolute" style={{ left: px, top: pz, transform: 'translate(-50%,-50%)' }}>
          <div style={{ transform: `rotate(${-yaw}rad)` }}>
            <svg width="34" height="34" viewBox="-17 -17 34 34">
              <path d="M0 0 L-9 -16 A18 18 0 0 1 9 -16 Z" fill="rgba(255,255,255,0.28)" />
              <circle r="4.6" fill="#fff" stroke="#00a6d6" strokeWidth="2.2" />
            </svg>
          </div>
        </div>
      )}
      <div className="absolute left-1.5 top-1 text-[9px] font-semibold uppercase tracking-widest text-white/70">N ↑</div>
    </div>
  )
}

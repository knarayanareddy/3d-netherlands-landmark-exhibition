import { useEffect, useRef } from 'react'
import { canalZ } from '../kd/canal'

interface Props {
  x: number
  z: number
  yaw: number
  mills: { x: number; z: number; far: boolean }[]
  bridges: { x: number; z: number }[]
  spots: { id: string; x: number; z: number }[]
  big?: boolean
  onPick: (x: number, z: number) => void
}

const X0 = -270
const X1 = 270
const Z0 = -105
const Z1 = 105

export function Minimap({ x, z, yaw, mills, bridges, spots, big, onPick }: Props) {
  const ref = useRef<HTMLCanvasElement>(null)
  const W = big ? 560 : 232
  const H = Math.round((W * (Z1 - Z0)) / (X1 - X0))

  useEffect(() => {
    const c = ref.current!
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    c.width = W * dpr
    c.height = H * dpr
    const g = c.getContext('2d')!
    g.scale(dpr, dpr)
    const sx = (wx: number) => ((wx - X0) / (X1 - X0)) * W
    const sz = (wz: number) => ((wz - Z0) / (Z1 - Z0)) * H
    // polder
    const bg = g.createLinearGradient(0, 0, 0, H)
    bg.addColorStop(0, '#5f7a3c')
    bg.addColorStop(1, '#6d8744')
    g.fillStyle = bg
    g.fillRect(0, 0, W, H)
    // canal
    const path = (off: number) => {
      g.beginPath()
      for (let wx = X0; wx <= X1; wx += 6) {
        const px = sx(wx)
        const py = sz(canalZ(wx) + off)
        if (wx === X0) g.moveTo(px, py)
        else g.lineTo(px, py)
      }
    }
    g.lineCap = 'round'
    g.strokeStyle = '#d9c9a3'
    g.lineWidth = (W / (X1 - X0)) * 3.6 * 2 * 3.1
    for (const off of [-9.6, 9.6]) {
      g.lineWidth = (W / (X1 - X0)) * 2.4
      g.strokeStyle = '#cdbf9e'
      path(off)
      g.stroke()
    }
    g.strokeStyle = '#2b5f73'
    g.lineWidth = (W / (X1 - X0)) * 12
    path(0)
    g.stroke()
    // bridges
    g.fillStyle = '#7a5a3a'
    for (const b of bridges) g.fillRect(sx(b.x) - 1.5, sz(b.z) - (W / (X1 - X0)) * 11, 3, (W / (X1 - X0)) * 22)
    // mills
    for (const m of mills) {
      if (m.x < X0 || m.x > X1) continue
      g.fillStyle = '#fff7e6'
      g.strokeStyle = '#7c2d12'
      g.lineWidth = 1.5
      g.beginPath()
      g.arc(sx(m.x), sz(m.z), big ? 4.5 : 3.2, 0, Math.PI * 2)
      g.fill()
      g.stroke()
    }
    // hotspots
    for (const s of spots) {
      if (s.x < X0 || s.x > X1) continue
      g.fillStyle = '#f59e0b'
      g.beginPath()
      g.arc(sx(s.x), sz(s.z), big ? 3.5 : 2.4, 0, Math.PI * 2)
      g.fill()
    }
    // player
    g.save()
    g.translate(sx(x), sz(z))
    g.rotate(-yaw + Math.PI)
    g.fillStyle = '#ef4444'
    g.strokeStyle = '#fff'
    g.lineWidth = 1.6
    g.beginPath()
    g.moveTo(0, -8)
    g.lineTo(5.5, 6)
    g.lineTo(0, 3)
    g.lineTo(-5.5, 6)
    g.closePath()
    g.fill()
    g.stroke()
    g.restore()
  }, [x, z, yaw, mills, bridges, spots, W, H, big])

  return (
    <canvas
      ref={ref}
      style={{ width: W, height: H }}
      className="block cursor-crosshair rounded-xl"
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect()
        const wx = X0 + ((e.clientX - r.left) / r.width) * (X1 - X0)
        const wz = Z0 + ((e.clientY - r.top) / r.height) * (Z1 - Z0)
        onPick(wx, wz)
      }}
    />
  )
}

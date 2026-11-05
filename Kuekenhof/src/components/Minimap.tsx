import { useEffect, useRef } from 'react'
import { MILL, PAVILION, CAFE, VARIETIES, buildings, getLayout, lakePoly, paths, plazas, CANAL_Z, CANAL_HW } from '../keukenhof/layout'

const X0 = -128
const X1 = 128
const Z0 = -112
const Z1 = 146

interface Props {
  size?: number
  getPlayer: () => { x: number; z: number; yaw: number }
  onPick: (x: number, z: number) => void
}

export function Minimap({ size = 188, getPlayer, onPick }: Props) {
  const ref = useRef<HTMLCanvasElement>(null)
  const base = useRef<HTMLCanvasElement | null>(null)
  const W = size
  const H = Math.round((size * (Z1 - Z0)) / (X1 - X0))
  const tx = (x: number) => ((x - X0) / (X1 - X0)) * W
  const tz = (z: number) => ((z - Z0) / (Z1 - Z0)) * H

  useEffect(() => {
    const c = document.createElement('canvas')
    const dpr = 2
    c.width = W * dpr
    c.height = H * dpr
    const g = c.getContext('2d')!
    g.scale(dpr, dpr)
    g.fillStyle = '#6f9a4a'
    g.fillRect(0, 0, W, H)
    // fields
    g.fillStyle = '#c96a4c'
    g.fillRect(0, 0, W, tz(CANAL_Z - CANAL_HW - 2))
    const cols = ['#d8281c', '#f2c312', '#e86a98', '#f26412', '#7c2d9c', '#f5f2e8']
    for (let i = 0; i < 14; i++) {
      g.fillStyle = cols[(i * 5) % cols.length]
      g.globalAlpha = 0.85
      g.fillRect((i / 14) * W, 0, W / 14, tz(CANAL_Z - CANAL_HW - 2))
    }
    g.globalAlpha = 1
    // canal
    g.fillStyle = '#4c8aa0'
    g.fillRect(0, tz(CANAL_Z - CANAL_HW), W, tz(CANAL_Z + CANAL_HW) - tz(CANAL_Z - CANAL_HW))
    // lake
    g.beginPath()
    lakePoly.forEach(([x, z], i) => (i ? g.lineTo(tx(x), tz(z)) : g.moveTo(tx(x), tz(z))))
    g.closePath()
    g.fill()
    // paths
    g.strokeStyle = '#e6dcc3'
    g.lineCap = 'round'
    g.lineJoin = 'round'
    for (const p of paths) {
      g.lineWidth = Math.max(1.2, (p.w / (X1 - X0)) * W * 1.1)
      g.beginPath()
      p.pts.forEach(([x, z], i) => (i ? g.lineTo(tx(x), tz(z)) : g.moveTo(tx(x), tz(z))))
      if (p.closed) g.closePath()
      g.stroke()
    }
    g.fillStyle = '#e6dcc3'
    for (const r of plazas) g.fillRect(tx(r.x0), tz(r.z0), tx(r.x1) - tx(r.x0), tz(r.z1) - tz(r.z0))
    g.beginPath()
    g.arc(tx(MILL.x), tz(MILL.z), 7, 0, Math.PI * 2)
    g.fill()
    // beds
    for (const b of getLayout().beds) {
      if (b.indoor) continue
      g.fillStyle = VARIETIES[b.va].color
      g.beginPath()
      b.poly.forEach(([x, z], i) => (i ? g.lineTo(tx(x), tz(z)) : g.moveTo(tx(x), tz(z))))
      g.closePath()
      g.fill()
    }
    // buildings
    g.fillStyle = '#f4f1ea'
    g.strokeStyle = '#555'
    g.lineWidth = 1
    for (const b of buildings) {
      g.fillRect(tx(b.cx - b.hx), tz(b.cz - b.hz), tx(b.cx + b.hx) - tx(b.cx - b.hx), tz(b.cz + b.hz) - tz(b.cz - b.hz))
      g.strokeRect(tx(b.cx - b.hx), tz(b.cz - b.hz), tx(b.cx + b.hx) - tx(b.cx - b.hx), tz(b.cz + b.hz) - tz(b.cz - b.hz))
    }
    void PAVILION
    void CAFE
    // windmill
    g.fillStyle = '#8c3b2a'
    g.beginPath()
    g.arc(tx(MILL.x), tz(MILL.z), 3, 0, Math.PI * 2)
    g.fill()
    base.current = c
  }, [W, H])

  useEffect(() => {
    let raf = 0
    let last = 0
    const draw = (t: number) => {
      raf = requestAnimationFrame(draw)
      if (t - last < 66) return
      last = t
      const cv = ref.current
      const b = base.current
      if (!cv || !b) return
      const g = cv.getContext('2d')!
      g.clearRect(0, 0, cv.width, cv.height)
      g.drawImage(b, 0, 0, cv.width, cv.height)
      const p = getPlayer()
      const dpr = cv.width / W
      g.save()
      g.scale(dpr, dpr)
      g.translate(tx(p.x), tz(p.z))
      g.rotate(-p.yaw)
      // view cone
      const grd = g.createRadialGradient(0, 0, 0, 0, 0, 34)
      grd.addColorStop(0, 'rgba(255,255,255,0.55)')
      grd.addColorStop(1, 'rgba(255,255,255,0)')
      g.fillStyle = grd
      g.beginPath()
      g.moveTo(0, 0)
      g.arc(0, 0, 34, -Math.PI / 2 - 0.55, -Math.PI / 2 + 0.55)
      g.closePath()
      g.fill()
      g.fillStyle = '#fff'
      g.strokeStyle = '#1b2a1b'
      g.lineWidth = 1.5
      g.beginPath()
      g.moveTo(0, -6)
      g.lineTo(4.5, 5)
      g.lineTo(0, 2.5)
      g.lineTo(-4.5, 5)
      g.closePath()
      g.fill()
      g.stroke()
      g.restore()
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [getPlayer, W])

  return (
    <canvas
      ref={ref}
      width={W * 2}
      height={H * 2}
      style={{ width: W, height: H }}
      className="block cursor-crosshair rounded-xl border border-white/25 shadow-2xl"
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect()
        const x = X0 + ((e.clientX - r.left) / r.width) * (X1 - X0)
        const z = Z0 + ((e.clientY - r.top) / r.height) * (Z1 - Z0)
        onPick(x, z)
      }}
      title="Click to teleport"
    />
  )
}

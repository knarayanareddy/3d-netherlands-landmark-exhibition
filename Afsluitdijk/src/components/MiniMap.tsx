import { memo } from 'react'
import { POIS } from '../afsluitdijk/pois'
import { PLAZA_S, TERRACE_N } from '../afsluitdijk/profile'
import { BX, SX, SZ, TX, TZ } from '../afsluitdijk/monument'

interface Props {
  x: number
  z: number
  yaw: number
}

const SIZE = 168
const WINDOW = 170 // metres across

function MiniMapInner({ x, z, yaw }: Props) {
  const s = SIZE / WINDOW
  const deg = (yaw * 180) / Math.PI
  const big = 6000
  return (
    <div className="relative overflow-hidden rounded-full border border-white/25 bg-black/40 shadow-xl backdrop-blur-sm" style={{ width: SIZE, height: SIZE }}>
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        <g transform={`translate(${SIZE / 2} ${SIZE / 2}) rotate(${deg}) scale(${s}) translate(${-x} ${-z})`}>
          {/* Wadden Sea */}
          <rect x={-big} y={-600} width={big * 2} height={600 - 31.85 - 26} fill="#3b514e" />
          {/* Levvel slope */}
          <rect x={-big} y={-57.85} width={big * 2} height={26} fill="#a3a39d" />
          {/* berm + basalt */}
          <rect x={-big} y={-31.85} width={big * 2} height={4} fill="#c0bfb8" />
          <rect x={-big} y={-27.85} width={big * 2} height={9} fill="#3a3d40" />
          {/* cycle path N, verge */}
          <rect x={-big} y={-17.9} width={big * 2} height={3.6} fill="#a9503c" />
          <rect x={-big} y={-14.3} width={big * 2} height={2.4} fill="#6f8a47" />
          {/* road */}
          <rect x={-big} y={-11.9} width={big * 2} height={23.8} fill="#4a4d52" />
          <rect x={-big} y={-1.6} width={big * 2} height={3.2} fill="#7a7c80" />
          <rect x={-big} y={11.9} width={big * 2} height={2.4} fill="#6f8a47" />
          <rect x={-big} y={14.3} width={big * 2} height={3.2} fill="#a9503c" />
          {/* grass slope + IJsselmeer */}
          <rect x={-big} y={17.5} width={big * 2} height={26} fill="#7f9c55" />
          <rect x={-big} y={43.5} width={big * 2} height={6} fill="#8a857a" />
          <rect x={-big} y={49.5} width={big * 2} height={600} fill="#47636d" />
          {/* plaza + terrace */}
          <rect x={PLAZA_S.x0} y={17.5} width={PLAZA_S.x1 - PLAZA_S.x0} height={PLAZA_S.depth} fill="#b8b2a3" />
          <rect x={TERRACE_N.x0} y={-17.9 - TERRACE_N.depth} width={TERRACE_N.x1 - TERRACE_N.x0} height={TERRACE_N.depth} fill="#b8b2a3" />
          {/* footbridge */}
          <rect x={BX - 1.6} y={-27} width={3.2} height={54} fill="#2d3238" />
          {/* tower */}
          <rect x={TX - 5.5} y={TZ - 5.5} width={11} height={11} fill="#8a4f38" stroke="#e8d9c0" strokeWidth={0.5} />
          <rect x={TX - 3.7} y={TZ - 3.7} width={7.4} height={7.4} fill="#6d3b2b" />
          {/* statue */}
          <circle cx={SX} cy={SZ} r={2.4} fill="#e8d9c0" />
          {/* pois */}
          {POIS.map((p) => (
            <circle key={p.id} cx={p.at[0]} cy={p.at[1]} r={2.6} fill="#ffbf47" stroke="#2a1d05" strokeWidth={0.6} />
          ))}
        </g>
        {/* player */}
        <g transform={`translate(${SIZE / 2} ${SIZE / 2})`}>
          <path d="M0 -9 L6 7 L0 3 L-6 7 Z" fill="#ffffff" stroke="#111" strokeWidth="1.2" />
        </g>
      </svg>
      <div className="pointer-events-none absolute left-1/2 top-1 -translate-x-1/2 text-[9px] font-semibold tracking-widest text-white/70">↑</div>
    </div>
  )
}

export const MiniMap = memo(MiniMapInner, (a, b) => Math.abs(a.x - b.x) < 0.15 && Math.abs(a.z - b.z) < 0.15 && Math.abs(a.yaw - b.yaw) < 0.01)

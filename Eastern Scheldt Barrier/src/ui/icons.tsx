import type { ReactNode } from 'react'

const base = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

const paths: Record<string, ReactNode> = {
  walk: (
    <>
      <circle cx="13" cy="4.5" r="1.8" />
      <path d="M9 21l2.2-6.2L9 12.5l1.2-4.2 3.3 1.7 2.5 2.3M13 10l-.3 4.3 3 2.4 1 4.3" />
    </>
  ),
  fly: (
    <>
      <path d="M2 14l8-2 4-8 2 .5-1.5 7.5 6 1.5.5 1.5-7 .5-3 5-1.5-.5.5-5-7-1.5z" />
    </>
  ),
  sound: (
    <>
      <path d="M4 9v6h3.5L12 19V5L7.5 9H4z" />
      <path d="M15.5 8.5a5 5 0 010 7M18 6a8.5 8.5 0 010 12" />
    </>
  ),
  mute: (
    <>
      <path d="M4 9v6h3.5L12 19V5L7.5 9H4z" />
      <path d="M16 9.5l5 5M21 9.5l-5 5" />
    </>
  ),
  fx: (
    <>
      <path d="M12 3l1.8 4.6L18.5 9l-4.7 1.4L12 15l-1.8-4.6L5.5 9l4.7-1.4z" />
      <path d="M18.5 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" />
    </>
  ),
  full: <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />,
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.6 2.6 0 115 .6c0 1.6-2.5 2-2.5 3.7M12 17.2v.1" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21s7-6.2 7-11.5A7 7 0 005 9.5C5 14.8 12 21 12 21z" />
      <circle cx="12" cy="9.5" r="2.4" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6L6 18" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6" />
    </>
  ),
  sunrise: (
    <>
      <path d="M3 18h18M7 18a5 5 0 0110 0M12 6v3M4.6 10.6l1.7 1.7M19.4 10.6l-1.7 1.7" />
    </>
  ),
  sunset: (
    <>
      <path d="M3 18h18M7 18a5 5 0 0110 0M12 4v5M9.5 6.5L12 9l2.5-2.5" />
    </>
  ),
  dusk: (
    <>
      <path d="M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z" />
    </>
  ),
  night: (
    <>
      <path d="M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z" />
      <path d="M17 4l.6 1.4L19 6l-1.4.6L17 8l-.6-1.4L15 6l1.4-.6z" />
    </>
  ),
  storm: (
    <>
      <path d="M7 16a4.5 4.5 0 01.5-9 5.5 5.5 0 0110.6 1.6A3.7 3.7 0 0117 16" />
      <path d="M12.5 12l-2.5 4h3l-2 4.5" />
    </>
  ),
  chevron: <path d="M9 6l6 6-6 6" />,
  gate: (
    <>
      <path d="M4 3v18M20 3v18M4 8h16M4 13h16M4 18h16" />
    </>
  ),
}

export function Icon({ name, size = 18, className = '' }: { name: keyof typeof paths | string; size?: number; className?: string }) {
  return (
    <svg {...base} width={size} height={size} className={className} aria-hidden>
      {paths[name]}
    </svg>
  )
}

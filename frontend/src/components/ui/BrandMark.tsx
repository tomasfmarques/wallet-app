import { useId } from 'react'

interface Props {
  /** Rendered width/height in px (the mark is square). */
  size?: number
  /** 'dark' = sits on a dark surface (brighter nodes, white connectors). */
  tone?: 'light' | 'dark'
  className?: string
}

// Wallet360 "Converge" brand mark — a gradient core with six alternating
// blue/green nodes drawn inward, signalling every account converging into one
// view. Geometry from the brand sheet (viewBox 180×180). Gradient ids are
// scoped per instance so multiple marks can render on the same page.
export function BrandMark({ size = 28, tone = 'light', className }: Props) {
  const gid = useId().replace(/:/g, '')
  const dark = tone === 'dark'
  const blue = dark ? '#46A3FF' : '#2F74D8'
  const green = dark ? '#3FD08A' : '#2FAA6A'
  const line = dark ? '#FFFFFF' : '#D6DDDA'
  const nodeR = dark ? 9 : 8
  return (
    <svg width={size} height={size} viewBox="0 0 180 180" className={className}
      role="img" aria-label="Wallet360" focusable="false">
      <defs>
        <linearGradient id={`core-${gid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={blue} />
          <stop offset="1" stopColor={green} />
        </linearGradient>
      </defs>
      <g stroke={line} strokeOpacity={dark ? 0.3 : 1} strokeWidth="2.8" strokeLinecap="round">
        <line x1="90" y1="28" x2="90" y2="62" />
        <line x1="143.7" y1="59" x2="114.25" y2="76" />
        <line x1="143.7" y1="121" x2="114.25" y2="104" />
        <line x1="90" y1="152" x2="90" y2="118" />
        <line x1="36.3" y1="121" x2="65.75" y2="104" />
        <line x1="36.3" y1="59" x2="65.75" y2="76" />
      </g>
      <circle cx="90" cy="18" r={nodeR} fill={blue} />
      <circle cx="152.35" cy="54" r={nodeR} fill={green} />
      <circle cx="152.35" cy="126" r={nodeR} fill={blue} />
      <circle cx="90" cy="162" r={nodeR} fill={green} />
      <circle cx="27.65" cy="126" r={nodeR} fill={blue} />
      <circle cx="27.65" cy="54" r={nodeR} fill={green} />
      <circle cx="90" cy="90" r="22" fill={`url(#core-${gid})`} />
      {!dark && <circle cx="83" cy="83" r="6" fill="#fff" fillOpacity="0.28" />}
    </svg>
  )
}

export default BrandMark

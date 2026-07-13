interface Props {
  src: string
  className?: string
}

/**
 * Full-bleed lifestyle photo band used between sections (Design v2,
 * docs/landing-spec.md "photo divider"). Purely decorative (alt="") — the
 * surrounding sections carry the actual content — so it's excluded from
 * the SW precache glob (vite.config.ts globIgnores) and lazy-loaded.
 */
export function PhotoDivider({ src, className }: Props) {
  return (
    <div className={`mkt-divider ${className ?? ''}`}>
      <img src={src} alt="" width={1200} height={520} loading="lazy" decoding="async" />
    </div>
  )
}

export default PhotoDivider

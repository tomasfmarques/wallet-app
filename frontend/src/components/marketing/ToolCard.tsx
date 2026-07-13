import { Link } from 'react-router-dom'

interface Props {
  to: string
  image: string
  imageAlt: string
  name: string
  oneLiner: string
}

/**
 * One of the 4 free-tool cards — photo header + name + one line + arrow
 * (Design v2, docs/landing-spec.md). Reused on the landing page and
 * /simuladores.
 */
export function ToolCard({ to, image, imageAlt, name, oneLiner }: Props) {
  return (
    <Link to={to} className="mkt-tool-card">
      <div className="mkt-tool-card-media">
        <img src={image} alt={imageAlt} width={800} height={520} loading="lazy" decoding="async" />
      </div>
      <div className="mkt-tool-card-body">
        <span className="mkt-tool-name">{name}</span>
        <span className="mkt-tool-oneliner">{oneLiner}</span>
        <span className="mkt-tool-arrow" aria-hidden="true">→</span>
      </div>
    </Link>
  )
}

export default ToolCard

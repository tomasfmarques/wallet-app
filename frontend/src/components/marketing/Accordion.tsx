import { useState, type ReactNode } from 'react'

export interface AccordionItem {
  id: string
  question: string
  answer: ReactNode
}

interface Props {
  items: AccordionItem[]
}

/** Simple single-open FAQ accordion used on every tool page's explainer section. */
export function Accordion({ items }: Props) {
  const [openId, setOpenId] = useState<string | null>(items[0]?.id ?? null)

  return (
    <div className="mkt-accordion">
      {items.map((item) => {
        const isOpen = openId === item.id
        return (
          <div key={item.id} className="mkt-accordion-item">
            <button
              type="button"
              className="mkt-accordion-btn"
              aria-expanded={isOpen}
              onClick={() => setOpenId(isOpen ? null : item.id)}
            >
              <span>{item.question}</span>
              <span className="mkt-accordion-chevron" aria-hidden="true">{isOpen ? '−' : '+'}</span>
            </button>
            {isOpen && <div className="mkt-accordion-panel">{item.answer}</div>}
          </div>
        )
      })}
    </div>
  )
}

export default Accordion

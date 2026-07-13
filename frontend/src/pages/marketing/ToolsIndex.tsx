import { useTranslation } from 'react-i18next'
import { MarketingLayout } from '@/components/marketing/MarketingLayout'
import { ToolCard } from '@/components/marketing/ToolCard'
import { usePageMeta } from '@/hooks/usePageMeta'

/** /simuladores — index listing the 4 free tools (docs/landing-spec.md WS-L1). */
export function ToolsIndex() {
  const { t } = useTranslation('landing')
  usePageMeta(t('toolsIndex.metaTitle'), t('toolsIndex.metaDescription'), '/simuladores')

  return (
    <MarketingLayout>
      <div className="mkt-container mkt-section">
        <div className="mkt-section-head">
          <h2>{t('toolsIndex.title')}</h2>
          <p>{t('toolsIndex.intro')}</p>
        </div>
        <div className="mkt-tools-grid">
          <ToolCard
            to="/simuladores/irs-mais-valias" image="/img/marketing/tool-irs.webp" imageAlt={t('tools.irs.imageAlt')}
            name={t('tools.irs.name')} oneLiner={t('tools.irs.oneLiner')}
          />
          <ToolCard
            to="/simuladores/credito-habitacao" image="/img/marketing/tool-credito.webp" imageAlt={t('tools.credito.imageAlt')}
            name={t('tools.credito.name')} oneLiner={t('tools.credito.oneLiner')}
          />
          <ToolCard
            to="/simuladores/amortizar-ou-investir" image="/img/marketing/tool-comparar.webp" imageAlt={t('tools.compare.imageAlt')}
            name={t('tools.compare.name')} oneLiner={t('tools.compare.oneLiner')}
          />
          <ToolCard
            to="/simuladores/revisao-euribor" image="/img/marketing/tool-euribor.webp" imageAlt={t('tools.euribor.imageAlt')}
            name={t('tools.euribor.name')} oneLiner={t('tools.euribor.oneLiner')}
          />
        </div>
      </div>
    </MarketingLayout>
  )
}

export default ToolsIndex

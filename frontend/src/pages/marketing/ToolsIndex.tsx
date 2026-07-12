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
        <h1 style={{ fontSize: 26, marginBottom: 8 }}>{t('toolsIndex.title')}</h1>
        <p className="muted" style={{ marginBottom: 20, maxWidth: 640 }}>{t('toolsIndex.intro')}</p>
        <div className="mkt-tools-grid">
          <ToolCard to="/simuladores/irs-mais-valias" icon="barChart" name={t('tools.irs.name')} oneLiner={t('tools.irs.oneLiner')} />
          <ToolCard to="/simuladores/credito-habitacao" icon="home" name={t('tools.credito.name')} oneLiner={t('tools.credito.oneLiner')} />
          <ToolCard to="/simuladores/amortizar-ou-investir" icon="scale" name={t('tools.compare.name')} oneLiner={t('tools.compare.oneLiner')} />
          <ToolCard to="/simuladores/revisao-euribor" icon="trendingUp" name={t('tools.euribor.name')} oneLiner={t('tools.euribor.oneLiner')} />
        </div>
      </div>
    </MarketingLayout>
  )
}

export default ToolsIndex

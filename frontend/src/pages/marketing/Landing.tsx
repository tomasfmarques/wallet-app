import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { MarketingLayout } from '@/components/marketing/MarketingLayout'
import { ToolCard } from '@/components/marketing/ToolCard'
import { InstallCta } from '@/components/marketing/InstallCta'
import { AdSlot } from '@/components/marketing/AdSlot'
import { Icon } from '@/components/ui/Icon'
import { usePageMeta } from '@/hooks/usePageMeta'

/**
 * Public landing page (docs/landing-spec.md WS-L2) — the top of the
 * acquisition funnel. Render-pure: zero API calls before interaction, no
 * pop-ups, no Chart.js. Sections: hero → 4 tool cards → "why" bullets →
 * free/pro comparison → install banner → footer (MarketingLayout).
 */
export function Landing() {
  const { t } = useTranslation('landing')
  usePageMeta(t('meta.title'), t('meta.description'), '/')

  return (
    <MarketingLayout>
      {/* ── Hero ── */}
      <section className="mkt-hero">
        <div className="mkt-hero-inner">
          <h1 className="mkt-hero-title">{t('hero.title')}</h1>
          <p className="mkt-hero-sub">{t('hero.subtitle')}</p>
          <div className="mkt-hero-actions">
            <a href="#simuladores" className="btn btn-primary">{t('hero.ctaPrimary')}</a>
            <Link to="/signin" className="btn btn-ghost-light">{t('hero.ctaSecondary')}</Link>
          </div>
        </div>
      </section>

      <div className="mkt-container">
        {/* ── 4 tool cards ── */}
        <section id="simuladores" className="mkt-section">
          <h2 className="section-label">{t('tools.sectionTitle')}</h2>
          <p className="muted" style={{ marginBottom: 16 }}>{t('tools.sectionSubtitle')}</p>
          <div className="mkt-tools-grid">
            <ToolCard to="/simuladores/irs-mais-valias" icon="barChart" name={t('tools.irs.name')} oneLiner={t('tools.irs.oneLiner')} />
            <ToolCard to="/simuladores/credito-habitacao" icon="home" name={t('tools.credito.name')} oneLiner={t('tools.credito.oneLiner')} />
            <ToolCard to="/simuladores/amortizar-ou-investir" icon="scale" name={t('tools.compare.name')} oneLiner={t('tools.compare.oneLiner')} />
            <ToolCard to="/simuladores/revisao-euribor" icon="trendingUp" name={t('tools.euribor.name')} oneLiner={t('tools.euribor.oneLiner')} />
          </div>
        </section>

        {/* ── Why Wallet360 ── */}
        <section className="mkt-section">
          <h2 className="section-label">{t('why.title')}</h2>
          <div className="mkt-why-grid">
            <div className="mkt-why-item">
              <span className="mkt-why-icon"><Icon name="lock" size={19} /></span>
              <span className="mkt-why-title">{t('why.privacy.title')}</span>
              <span className="mkt-why-body">{t('why.privacy.body')}</span>
            </div>
            <div className="mkt-why-item">
              <span className="mkt-why-icon"><Icon name="bank" size={19} /></span>
              <span className="mkt-why-title">{t('why.portugal.title')}</span>
              <span className="mkt-why-body">{t('why.portugal.body')}</span>
            </div>
            <div className="mkt-why-item">
              <span className="mkt-why-icon"><Icon name="bulb" size={19} /></span>
              <span className="mkt-why-title">{t('why.free.title')}</span>
              <span className="mkt-why-body">{t('why.free.body')}</span>
            </div>
          </div>
        </section>

        {/* ── Grátis vs Pro ── */}
        <section className="mkt-section">
          <h2 className="section-label">{t('pricing.title')}</h2>
          <div className="mkt-pricing-grid">
            <div className="mkt-pricing-col">
              <div className="mkt-pricing-title">{t('pricing.free.title')}</div>
              <ul className="mkt-pricing-list">
                <li><Icon name="check" size={16} />{t('pricing.free.item1')}</li>
                <li><Icon name="check" size={16} />{t('pricing.free.item2')}</li>
                <li><Icon name="check" size={16} />{t('pricing.free.item3')}</li>
                <li><Icon name="check" size={16} />{t('pricing.free.item4')}</li>
              </ul>
            </div>
            <div className="mkt-pricing-col mkt-pricing-col-pro">
              <div className="mkt-pricing-title">
                {t('pricing.pro.title')}
                <span className="mkt-pricing-badge">{t('pricing.pro.badge')}</span>
              </div>
              <ul className="mkt-pricing-list">
                <li><Icon name="check" size={16} />{t('pricing.pro.item1')}</li>
                <li><Icon name="check" size={16} />{t('pricing.pro.item2')}</li>
                <li><Icon name="check" size={16} />{t('pricing.pro.item3')}</li>
                <li><Icon name="check" size={16} />{t('pricing.pro.item4')}</li>
              </ul>
            </div>
          </div>
          <p className="mkt-pricing-note">{t('pricing.note')}</p>
        </section>

        <AdSlot className="mkt-landing-ad" />

        {/* ── Install banner ── */}
        <section className="mkt-section">
          <div className="mkt-install-section">
            <div className="mkt-install-title">{t('install.sectionTitle')}</div>
            <p className="mkt-install-sub">{t('install.sectionSubtitle')}</p>
            <InstallCta />
          </div>
        </section>
      </div>
    </MarketingLayout>
  )
}

export default Landing

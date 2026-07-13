import { useTranslation } from 'react-i18next'
import { MarketingLayout } from '@/components/marketing/MarketingLayout'
import { ToolCard } from '@/components/marketing/ToolCard'
import { PhotoDivider } from '@/components/marketing/PhotoDivider'
import { InstallCta } from '@/components/marketing/InstallCta'
import { AdSlot } from '@/components/marketing/AdSlot'
import { Icon } from '@/components/ui/Icon'
import { usePageMeta } from '@/hooks/usePageMeta'

/**
 * Public landing page (docs/landing-spec.md WS-L2, Design v2) — the top of
 * the acquisition funnel. Render-pure: zero API calls before interaction, no
 * pop-ups, no Chart.js. Photo-led, white-first: hero photo → 4 photo cards →
 * "why" strip → photo divider → free/pro comparison → install banner (photo
 * bg) → footer (MarketingLayout).
 */
export function Landing() {
  const { t } = useTranslation('landing')
  usePageMeta(t('meta.title'), t('meta.description'), '/', '/img/marketing/hero.webp')

  return (
    <MarketingLayout>
      {/* ── Hero ── */}
      <section className="mkt-hero">
        <img
          src="/img/marketing/hero.webp"
          alt=""
          width={1600}
          height={900}
          className="mkt-hero-img"
          fetchPriority="high"
          decoding="async"
        />
        <div className="mkt-hero-scrim" aria-hidden="true" />
        <div className="mkt-hero-inner">
          <h1 className="mkt-hero-title">{t('hero.title')}</h1>
          <p className="mkt-hero-sub">{t('hero.subtitle')}</p>
          <div className="mkt-hero-actions">
            <a href="#simuladores" className="btn btn-primary">{t('hero.ctaPrimary')}</a>
          </div>
        </div>
      </section>

      <div className="mkt-container">
        {/* ── 4 tool cards ── */}
        <section id="simuladores" className="mkt-section">
          <div className="mkt-section-head">
            <h2>{t('tools.sectionTitle')}</h2>
            <p>{t('tools.sectionSubtitle')}</p>
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
        </section>

        {/* ── Why Wallet360 — slim strip ── */}
        <section className="mkt-why-strip">
          <div className="mkt-why-item">
            <span className="mkt-why-icon"><Icon name="lock" size={18} /></span>
            <span className="mkt-why-text">{t('why.privacy')}</span>
          </div>
          <div className="mkt-why-item">
            <span className="mkt-why-icon"><Icon name="bank" size={18} /></span>
            <span className="mkt-why-text">{t('why.portugal')}</span>
          </div>
          <div className="mkt-why-item">
            <span className="mkt-why-icon"><Icon name="bulb" size={18} /></span>
            <span className="mkt-why-text">{t('why.free')}</span>
          </div>
        </section>

        <PhotoDivider src="/img/marketing/divider.webp" />

        {/* ── Grátis vs Pro ── */}
        <section className="mkt-section">
          <div className="mkt-section-head">
            <h2>{t('pricing.title')}</h2>
          </div>
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

        {/* ── Install banner (photo bg) ── */}
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

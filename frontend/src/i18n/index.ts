// ── i18n setup ───────────────────────────────────────────────────
// i18next + react-i18next with browser language detection. Default is
// Portuguese (pt-PT); English (en) is fully supported. The active language
// is detected from localStorage → browser, cached to localStorage, and (for
// signed-in users) synced to the DB via PortfolioSettings.language.
//
// To add a language: add its code to SUPPORTED_LANGUAGES, drop a folder under
// locales/<code>/ with the same namespaces, and register it in `resources`.
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

import ptCommon from './locales/pt/common.json'
import ptNav from './locales/pt/nav.json'
import ptAuth from './locales/pt/auth.json'
import ptSettings from './locales/pt/settings.json'
import ptOverview from './locales/pt/overview.json'
import ptPortfolio from './locales/pt/portfolio.json'
import ptBudget from './locales/pt/budget.json'
import ptLoan from './locales/pt/loan.json'
import ptCompare from './locales/pt/compare.json'
import ptHousehold from './locales/pt/household.json'
import ptLanding from './locales/pt/landing.json'
import enCommon from './locales/en/common.json'
import enNav from './locales/en/nav.json'
import enAuth from './locales/en/auth.json'
import enSettings from './locales/en/settings.json'
import enOverview from './locales/en/overview.json'
import enPortfolio from './locales/en/portfolio.json'
import enBudget from './locales/en/budget.json'
import enLoan from './locales/en/loan.json'
import enCompare from './locales/en/compare.json'
import enHousehold from './locales/en/household.json'
import enLanding from './locales/en/landing.json'

export const SUPPORTED_LANGUAGES = ['pt', 'en'] as const
export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number]

export const LANGUAGE_LABELS: Record<AppLanguage, string> = {
  pt: 'Português',
  en: 'English',
}

export const NAMESPACES = ['common', 'nav', 'auth', 'settings', 'overview', 'portfolio', 'budget', 'loan', 'compare', 'household', 'landing'] as const

export const resources = {
  pt: { common: ptCommon, nav: ptNav, auth: ptAuth, settings: ptSettings, overview: ptOverview, portfolio: ptPortfolio, budget: ptBudget, loan: ptLoan, compare: ptCompare, household: ptHousehold, landing: ptLanding },
  en: { common: enCommon, nav: enNav, auth: enAuth, settings: enSettings, overview: enOverview, portfolio: enPortfolio, budget: enBudget, loan: enLoan, compare: enCompare, household: enHousehold, landing: enLanding },
} as const

/** Narrow any i18next language string to a supported app language. */
export function asAppLanguage(lng: string | null | undefined): AppLanguage {
  const base = (lng ?? '').slice(0, 2).toLowerCase()
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(base) ? (base as AppLanguage) : 'pt'
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'pt',
    supportedLngs: SUPPORTED_LANGUAGES as unknown as string[],
    load: 'languageOnly', // pt-PT → pt, en-US → en
    defaultNS: 'common',
    ns: NAMESPACES as unknown as string[],
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'wallet360.lang',
      caches: ['localStorage'],
    },
    interpolation: { escapeValue: false }, // React already escapes
    returnNull: false,
    saveMissing: import.meta.env.DEV,
    missingKeyHandler: import.meta.env.DEV
      ? (lngs, ns, key) => console.warn(`[i18n] missing key: ${ns}:${key} (${lngs.join(',')})`)
      : undefined,
  })

export default i18n

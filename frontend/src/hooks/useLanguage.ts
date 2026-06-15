import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { usePortfolio, useUpdateSettings } from '@/hooks/usePortfolio'
import { asAppLanguage, type AppLanguage } from '@/i18n'

// ── Language preference ──────────────────────────────────────────
// localStorage (via i18next's LanguageDetector) is the immediate source of
// truth — it works before login and applies instantly. For signed-in users we
// also persist to PortfolioSettings.language so the choice follows them across
// devices, and hydrate from it on login (DB wins once authenticated).

/** Hydrate the UI language from the signed-in user's saved preference (once). */
export function useLanguageSync() {
  const { data } = usePortfolio()
  const { i18n } = useTranslation()
  const applied = useRef(false)
  const saved = data?.settings.language ?? null
  useEffect(() => {
    if (applied.current || !saved) return
    const lng = asAppLanguage(saved)
    if (lng !== asAppLanguage(i18n.language)) i18n.changeLanguage(lng)
    applied.current = true
  }, [saved, i18n])
}

/** Change language + persist (localStorage via i18next, and the user's account). */
export function useChangeLanguage() {
  const { i18n } = useTranslation()
  const update = useUpdateSettings()
  return async (lng: AppLanguage) => {
    await i18n.changeLanguage(lng) // detector caches it to localStorage
    try {
      await update.mutateAsync({ language: lng } as Record<string, unknown>)
    } catch {
      // Non-fatal: the local choice already applied; DB sync can fail offline.
    }
  }
}

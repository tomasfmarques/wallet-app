import i18n from '@/i18n'

// Translate backend-originated error messages. The API returns free-text
// Portuguese strings (see backend/src/routes/*); this maps the common,
// user-visible ones to common.errors.* so EN users see English. Unmapped
// strings fall back to the raw backend message (no regression) and non-Error
// failures fall back to the caller's own message.
//
// Keep MAP values in sync with locales/{pt,en}/common.json → "errors".
const MAP: Record<string, string> = {
  'Erro interno do servidor': 'errors.server',
  'Erro de sessão': 'errors.session',
  'Sessão inválida': 'errors.session',
  'Não autenticado': 'errors.unauthenticated',
  'Email e password são obrigatórios': 'errors.emailPasswordRequired',
  'Email ou password incorretos': 'errors.invalidCredentials',
  'Demasiadas tentativas falhadas. Tenta novamente em 15 minutos.': 'errors.tooManyAttempts',
  'Email inválido': 'errors.invalidEmail',
  'O link de recuperação é inválido ou expirou.': 'errors.resetLinkInvalid',
  'Esta conta usa Sign in with Google. Usa o botão Google para entrar.': 'errors.useGoogle',
  'Não encontrado': 'errors.notFound',
  'Crédito não encontrado': 'errors.notFound',
  'Erro ao terminar sessão': 'errors.logout',
}

// Cast: i18n.t is type-safe over literal keys, but we look up dynamic keys here.
const tt = (key: string): string =>
  (i18n.t as (k: string, opts?: Record<string, unknown>) => string)(key, { ns: 'common' })

export function apiErrorMessage(err: unknown, fallback?: string): string {
  const raw = err instanceof Error ? err.message : ''
  if (raw) {
    const key = MAP[raw]
    return key ? tt(key) : raw
  }
  return fallback ?? tt('errors.unknown')
}

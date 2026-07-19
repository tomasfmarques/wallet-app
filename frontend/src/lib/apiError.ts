import i18n from '@/i18n'

// Translate backend-originated error messages. The API returns free-text
// Portuguese strings (see backend/src/routes/*); this maps the common,
// user-visible ones to common.errors.* so EN users see English. Unmapped
// strings fall back to the raw backend message (no regression) and non-Error
// failures fall back to the caller's own message.
//
// Keep MAP values in sync with locales/{pt,en}/common.json → "errors".
//
// Only errors a person can actually reach through the UI are mapped. The API
// also returns contract errors ("items deve ser um array", "symbol query param
// required") that only fire when our own frontend sends something malformed —
// translating those would be work no user ever sees. The keys on the LEFT are
// verbatim backend strings: change one in backend/src/routes and the mapping
// silently falls back to raw Portuguese.
const MAP: Record<string, string> = {
  // ── Session / server ──
  'Erro interno do servidor': 'errors.server',
  'Erro de sessão': 'errors.session',
  'Sessão inválida': 'errors.session',
  'Sessão expirada': 'errors.unauthenticated',
  'Não autenticado': 'errors.unauthenticated',
  'Não autorizado': 'errors.unauthorized',
  'Erro ao terminar sessão': 'errors.logout',
  'Não encontrado': 'errors.notFound',

  // ── Sign in / sign up ──
  'Email e password são obrigatórios': 'errors.emailPasswordRequired',
  'Email ou password incorretos': 'errors.invalidCredentials',
  'Demasiadas tentativas falhadas. Tenta novamente em 15 minutos.': 'errors.tooManyAttempts',
  'Demasiadas tentativas falhadas.': 'errors.tooManyAttemptsShort',
  'Email inválido': 'errors.invalidEmail',
  'O link de recuperação é inválido ou expirou.': 'errors.resetLinkInvalid',
  'Esta conta usa Sign in with Google. Usa o botão Google para entrar.': 'errors.useGoogle',
  'A conta usa Sign in with Google. Não existe password local para mudar.': 'errors.googleNoPassword',
  'Token Google inválido': 'errors.googleTokenInvalid',
  'Não foi possível validar a sessão Google': 'errors.googleSessionInvalid',
  'Sign in with Google não está configurado. Define GOOGLE_CLIENT_ID no servidor.': 'errors.googleNotConfigured',
  'Token inválido': 'errors.tokenInvalid',

  // ── Email verification (S3/F7) ──
  'O link de confirmação é inválido ou expirou.': 'errors.verifyLinkInvalid',
  'Já enviámos vários emails. Tenta novamente daqui a uma hora.': 'errors.verifyResendThrottled',
  'As contas demo não têm email para confirmar.': 'errors.verifyDemo',
  'Já existe uma conta com este email por confirmar. Abre o link de confirmação que enviámos para a tua caixa de correio e tenta novamente.': 'errors.googleLinkUnverified',

  // ── PIN / biometrics ──
  'PIN inválido': 'errors.pinInvalid',
  'PIN incorreto': 'errors.pinWrong',
  'PIN não configurado': 'errors.pinNotSet',
  'Confirmação inválida': 'errors.confirmInvalid',
  'Define um PIN antes de ativar a biometria.': 'errors.pinBeforeBiometrics',
  'Sem biometria registada': 'errors.noBiometrics',
  'Biometria não verificada': 'errors.biometricsUnverified',
  'Não foi possível verificar a biometria': 'errors.biometricsUnverified',
  'Falha na autenticação biométrica': 'errors.biometricsAuthFailed',
  'Falha no registo da biometria': 'errors.biometricsRegisterFailed',
  'Sessão de registo expirada': 'errors.registrationExpired',
  'Credencial desconhecida': 'errors.credentialUnknown',
  'Credencial em falta ou inválida': 'errors.credentialMissing',

  // ── Modo Casal (household) ──
  'Já pertences a um agregado': 'errors.householdAlreadyMember',
  'Não pertences a um agregado': 'errors.householdNotMember',
  'Cria primeiro o agregado': 'errors.householdCreateFirst',
  'O agregado já está completo': 'errors.householdFull',
  'Convite inválido': 'errors.inviteInvalid',
  'O convite é inválido ou expirou': 'errors.inviteExpired',
  'Demasiados convites por usar. Aguarda que expirem.': 'errors.inviteTooMany',
  'Confirma o teu email antes de partilhares o agregado.': 'errors.householdVerifyEmail',
  'As contas demo não podem criar um agregado.': 'errors.householdDemo',

  // ── Bank / broker ──
  'Integração bancária não configurada': 'errors.bankNotConfigured',
  'Falha a criar a ligação ao banco': 'errors.bankLinkFailed',
  'Falha a confirmar a ligação ao banco': 'errors.bankConfirmFailed',
  'Nenhum banco ligado ainda. Autoriza primeiro no site do banco.': 'errors.bankNoneLinked',
  'Ligação não encontrada': 'errors.connectionNotFound',
  'Nenhuma corretora ligada.': 'errors.brokerNoneLinked',
  'Chave da API obrigatória': 'errors.apiKeyRequired',
  'Sincronizado há instantes — espera uns segundos.': 'errors.syncCooldown',
  'Integração não configurada no servidor': 'errors.integrationNotConfigured',
  'Notificações não configuradas no servidor': 'errors.pushNotConfigured',

  // ── Data / module ──
  'Crédito não encontrado': 'errors.loanNotFound',
  'Ativo não encontrado': 'errors.assetNotFound',
  'Amortização não encontrada': 'errors.amortizationNotFound',
  'O crédito já está liquidado': 'errors.loanSettled',
  'Nada para importar': 'errors.nothingToImport',
  'Nenhum ativo para importar': 'errors.nothingToImport',
  'Nenhuma transação para importar': 'errors.nothingToImport',
  'Nada para remover': 'errors.nothingToRemove',
  'Demasiados ativos (máx. 500 por importação)': 'errors.tooManyAssets',
  'Demasiadas transações (máx. 2000 por importação)': 'errors.tooManyTxns',

  // ── Public contact form ──
  'Preenche nome, email válido e mensagem.': 'errors.contactIncomplete',
  'Demasiadas mensagens — tenta novamente mais tarde.': 'errors.contactThrottled',
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

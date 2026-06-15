import i18n from '@/i18n'

// ── Category inference dictionary ────────────────────────────────
// Maps Portuguese keywords (common service names, brands, household terms)
// to a curated category. Used by the budget modals to auto-suggest a
// category as the user types the item's name.
//
// Matching is case- and accent-insensitive ("agua" matches "água").
// Longer keywords win over shorter ones to avoid e.g. "uber eats" being
// misclassified as "uber" (Transportes).

export const INCOME_CATEGORIES = [
  'Salário',
  'Freelance',
  'Investimentos',
  'Aluguer',
  'Subsídios',
  'Transferências',
  'Outros',
] as const

export const EXPENSE_CATEGORIES = [
  'Habitação',
  'Serviços',
  'Subscrições',
  'Seguros',
  'Saúde',
  'Educação',
  'Alimentação',
  'Restauração',
  'Transportes',
  'Lazer',
  'Vestuário',
  'Compras',
  'Viagens',
  'Impostos',
  'Transferências',
  'Outros',
] as const

// Categories are STORED in the DB as their canonical Portuguese string
// (e.g. "Habitação"). For display we translate via the `common:categories.*`
// keys, keyed by that canonical string. The stored value never changes — only
// the label shown to the user. Falls back to the canonical string if no
// translation exists (e.g. a custom category).
export function categoryLabel(canonical: string): string {
  return i18n.t(`categories.${canonical}`, { ns: 'common', defaultValue: canonical })
}

const DICTIONARY: Record<string, string> = {
  // ── Income ──────────────────────────────────────────────
  'salario': 'Salário', 'ordenado': 'Salário', 'vencimento': 'Salário',
  'freelance': 'Freelance', 'recibos verdes': 'Freelance', 'projeto': 'Freelance',
  'dividendos': 'Investimentos', 'juros': 'Investimentos', 'mais valias': 'Investimentos',
  'rendas': 'Aluguer', 'aluguer recebido': 'Aluguer', 'arrendamento': 'Aluguer',
  'subsidio': 'Subsídios', 'apoio': 'Subsídios',

  // ── Transferências (in or out) ──────────────────────────
  'transferencia': 'Transferências', 'transferencias': 'Transferências',
  'mbway': 'Transferências', 'trf': 'Transferências',
  'trf mbway': 'Transferências', 'trf inst': 'Transferências', 'anul trf': 'Transferências',

  // ── Habitação ───────────────────────────────────────────
  'renda': 'Habitação', 'hipoteca': 'Habitação', 'prestacao casa': 'Habitação',
  'condominio': 'Habitação', 'imi': 'Habitação', 'iptu': 'Habitação',

  // ── Serviços (utilities) ────────────────────────────────
  'agua': 'Serviços', 'epal': 'Serviços',
  'luz': 'Serviços', 'eletricidade': 'Serviços', 'electricidade': 'Serviços',
  'edp': 'Serviços', 'galp power': 'Serviços', 'iberdrola': 'Serviços', 'endesa': 'Serviços',
  'gas': 'Serviços', 'galp gas': 'Serviços', 'g.n. fenosa': 'Serviços',
  'internet': 'Serviços', 'fibra': 'Serviços', 'meo': 'Serviços', 'nos': 'Serviços',
  'vodafone': 'Serviços', 'nowo': 'Serviços',
  'telefone': 'Serviços', 'telemovel': 'Serviços',
  'tv cabo': 'Serviços', 'televisao': 'Serviços',

  // ── Subscrições ────────────────────────────────────────
  'netflix': 'Subscrições', 'spotify': 'Subscrições', 'disney+': 'Subscrições',
  'hbo': 'Subscrições', 'max': 'Subscrições',
  'amazon prime': 'Subscrições', 'prime video': 'Subscrições',
  'youtube premium': 'Subscrições', 'youtube music': 'Subscrições',
  'apple music': 'Subscrições', 'icloud': 'Subscrições', 'apple one': 'Subscrições',
  'google one': 'Subscrições', 'office 365': 'Subscrições', 'microsoft 365': 'Subscrições',
  'chatgpt': 'Subscrições', 'github': 'Subscrições',
  'ginasio': 'Subscrições', 'fitness': 'Subscrições', 'gym': 'Subscrições',
  'jornal': 'Subscrições', 'revista': 'Subscrições',

  // ── Seguros ────────────────────────────────────────────
  'seguro': 'Seguros', 'seguros': 'Seguros',
  'fidelidade': 'Seguros', 'tranquilidade': 'Seguros', 'allianz': 'Seguros',
  'zurich': 'Seguros', 'lusitania': 'Seguros', 'mapfre': 'Seguros',

  // ── Saúde ──────────────────────────────────────────────
  'medico': 'Saúde', 'medica': 'Saúde', 'dentista': 'Saúde', 'consulta': 'Saúde',
  'farmacia': 'Saúde', 'farmacia portuguesa': 'Saúde',
  'hospital': 'Saúde', 'clinica': 'Saúde',
  'oculos': 'Saúde', 'multiopticas': 'Saúde',

  // ── Alimentação (groceries) ────────────────────────────
  'continente': 'Alimentação', 'pingo doce': 'Alimentação', 'lidl': 'Alimentação',
  'aldi': 'Alimentação', 'auchan': 'Alimentação', 'jumbo': 'Alimentação',
  'mercadona': 'Alimentação', 'minipreco': 'Alimentação',
  'supermercado': 'Alimentação', 'mercado': 'Alimentação',
  'comida': 'Alimentação', 'compras casa': 'Alimentação',

  // ── Restauração ───────────────────────────────────────
  'restaurante': 'Restauração', 'almoco': 'Restauração', 'jantar': 'Restauração',
  'pequeno almoco': 'Restauração',
  'cafe': 'Restauração', 'pastelaria': 'Restauração', 'padaria': 'Restauração',
  'mcdonalds': 'Restauração', 'burger king': 'Restauração', 'kfc': 'Restauração',
  'pizza': 'Restauração', 'sushi': 'Restauração',
  'uber eats': 'Restauração', 'glovo': 'Restauração', 'bolt food': 'Restauração',

  // ── Transportes ───────────────────────────────────────
  'gasolina': 'Transportes', 'gasoleo': 'Transportes', 'combustivel': 'Transportes',
  'uber': 'Transportes', 'bolt': 'Transportes', 'taxi': 'Transportes',
  'comboio': 'Transportes', 'cp ': 'Transportes', 'metro': 'Transportes',
  'autocarro': 'Transportes', 'passe': 'Transportes',
  'portagem': 'Transportes', 'via verde': 'Transportes', 'brisa': 'Transportes',
  'estacionamento': 'Transportes', 'parking': 'Transportes', 'empark': 'Transportes',

  // ── Lazer ─────────────────────────────────────────────
  'cinema': 'Lazer', 'nos cinemas': 'Lazer',
  'teatro': 'Lazer', 'concerto': 'Lazer', 'museu': 'Lazer', 'exposicao': 'Lazer',
  'livros': 'Lazer', 'fnac': 'Lazer', 'wook': 'Lazer', 'bertrand': 'Lazer',
  'steam': 'Lazer', 'playstation': 'Lazer', 'xbox': 'Lazer', 'nintendo': 'Lazer',
  'jogos': 'Lazer', 'entretenimento': 'Lazer',

  // ── Vestuário ─────────────────────────────────────────
  'roupa': 'Vestuário', 'sapatos': 'Vestuário',
  'zara': 'Vestuário', 'h&m': 'Vestuário', 'mango': 'Vestuário',
  'springfield': 'Vestuário', 'parfois': 'Vestuário', 'decathlon': 'Vestuário',

  // ── Compras ───────────────────────────────────────────
  'amazon': 'Compras', 'worten': 'Compras', 'fnac compras': 'Compras',
  'pingo doce online': 'Compras', 'continente online': 'Compras',
  'ikea': 'Compras', 'leroy merlin': 'Compras', 'aki': 'Compras',

  // ── Educação ──────────────────────────────────────────
  'escola': 'Educação', 'universidade': 'Educação', 'propinas': 'Educação',
  'curso': 'Educação', 'manuais': 'Educação', 'cursos online': 'Educação',
  'udemy': 'Educação', 'coursera': 'Educação',

  // ── Viagens ───────────────────────────────────────────
  'viagem': 'Viagens', 'ferias': 'Viagens',
  'hotel': 'Viagens', 'airbnb': 'Viagens', 'booking': 'Viagens',
  'aviao': 'Viagens', 'tap': 'Viagens', 'ryanair': 'Viagens', 'easyjet': 'Viagens',
  'aluguer carro': 'Viagens',

  // ── Impostos ─────────────────────────────────────────
  'irs': 'Impostos', 'iva': 'Impostos', 'imposto': 'Impostos',
  'financas': 'Impostos', 'autoridade tributaria': 'Impostos',
}

// Normalize for matching: lowercase + strip accents
function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

// Sort keywords by length descending so longer phrases match first
const KEYWORDS_NORM = Object.keys(DICTIONARY)
  .map((kw) => ({ kw, norm: normalize(kw) }))
  .sort((a, b) => b.norm.length - a.norm.length)

/**
 * Infer a category from an item name. Returns null if no keyword from the
 * dictionary appears (case + accent insensitive) in the name.
 */
export function inferCategory(name: string): string | null {
  if (!name) return null
  const norm = normalize(name)
  for (const { kw, norm: kwNorm } of KEYWORDS_NORM) {
    // Match if the keyword appears as a substring of the input. Boundary
    // checks aren't strict — Portuguese item names are typically short and
    // mostly composed of single keywords anyway.
    if (norm.includes(kwNorm)) return DICTIONARY[kw]
  }
  return null
}

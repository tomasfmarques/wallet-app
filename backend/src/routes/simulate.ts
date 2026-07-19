import { Router } from 'express'
import { requireAuth } from '../middleware/requireAuth'
import { prisma } from '../lib/prisma'
import { type LoanInput } from '../lib/loanEngine'
import { runCompare, addMonths, currentYm, type Frequencia } from '../lib/compareEngine'

const router = Router()
router.use(requireAuth)

// ── POST /api/simulate/compare ────────────────────────────────────
// Compares putting a lump sum toward a mortgage vs investing it.
// Returns interest saved, investment gain, and a recommendation.
//
// The maths lives in lib/compareEngine so the monthly digest can run the same
// simulation without an HTTP round-trip (it used to be inline here, which is
// exactly why WS4 deferred the digest's wedge line). This handler owns only
// what HTTP owns: validation, ownership, status codes.
router.post('/compare', async (req, res) => {
  const { loanId, valor, modo, ymAmortizacao, investReturn, taxRate, frequencia, returnMode, riskVolatility } = req.body

  if (!loanId || typeof loanId !== 'string') {
    res.status(400).json({ error: 'loanId obrigatório' }); return
  }
  const valorN = Number(valor)
  if (!Number.isFinite(valorN) || valorN <= 0) {
    res.status(400).json({ error: 'valor deve ser um número positivo' }); return
  }
  if (modo !== 'prazo' && modo !== 'prestacao') {
    res.status(400).json({ error: 'modo deve ser prazo ou prestacao' }); return
  }
  const investReturnN = Number(investReturn)
  if (!Number.isFinite(investReturnN) || investReturnN < 0 || investReturnN > 100) {
    res.status(400).json({ error: 'investReturn inválido (0–100%)' }); return
  }
  const taxRateN = Number(taxRate)
  if (!Number.isFinite(taxRateN) || taxRateN < 0 || taxRateN > 100) {
    res.status(400).json({ error: 'taxRate inválido (0–100%)' }); return
  }
  // Lump sum ('unica') vs recurring monthly ('mensal') vs recurring yearly
  // ('anual'). Default lump (back-compat).
  const freq: Frequencia =
    frequencia === 'mensal' ? 'mensal' : frequencia === 'anual' ? 'anual' : 'unica'
  // 'portfolio' → invest by projecting the amount across the user's real assets
  // (per-asset returns); 'manual' → the flat investReturn slider. Default
  // portfolio; falls back to manual automatically when the user holds no assets.
  if (returnMode !== undefined && returnMode !== 'portfolio' && returnMode !== 'manual') {
    res.status(400).json({ error: 'returnMode inválido' }); return
  }
  const wantPortfolio = returnMode !== 'manual'

  try {
    const loan = await prisma.loan.findUnique({
      where: { id: loanId },
      include: { amortizations: { orderBy: { ym: 'asc' } } },
    })
    if (!loan || loan.userId !== req.session.userId) {
      res.status(404).json({ error: 'Crédito não encontrado' }); return
    }

    const YM_RE = /^\d{4}-(0[1-9]|1[0-2])$/
    const ym = typeof ymAmortizacao === 'string' && YM_RE.test(ymAmortizacao)
      ? ymAmortizacao
      : addMonths(currentYm(), 1)

    const baseInput: LoanInput = {
      capital: loan.capital, prazoMeses: loan.prazoMeses, tanFixa: loan.tanFixa,
      mesesFixos: loan.mesesFixos, spread: loan.spread, euribor: loan.euribor,
      dataInicio: loan.dataInicio,
      amortizacoes: loan.amortizations.map((a: { ym: string; valor: number; modo: string }) => ({
        ym: a.ym, valor: a.valor, modo: a.modo as 'prazo' | 'prestacao',
      })),
    }

    const assets = wantPortfolio
      ? await prisma.portfolioAsset.findMany({
          where: { userId: req.session.userId! },
          select: { value: true, expectedReturn: true },
        })
      : []

    // Coerce here rather than in the engine: absent/garbage → NaN → the engine's
    // isFinite check drops the risk band, exactly as before the extraction.
    const result = runCompare(baseInput, {
      valor: valorN, modo, ym, investReturn: investReturnN, taxRate: taxRateN,
      frequencia: freq, wantPortfolio, riskVolatility: Number(riskVolatility),
    }, assets)

    if (!result) {
      res.status(400).json({ error: 'O crédito já está liquidado' }); return
    }

    res.json(result)
  } catch (err) {
    console.error('POST /api/simulate/compare failed:', err)
    res.status(500).json({ error: 'Erro interno do servidor' })
  }
})

export default router

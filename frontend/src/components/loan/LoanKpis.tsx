import { eur, eur2, pct, ymToLong, ymYearsDiff, currentYm, ymAddMonths } from '@/lib/format'
import type { LoanKpis as LoanKpisData } from '@/hooks/useLoan'

interface Props {
  kpis: LoanKpisData
  capitalInicial: number
  dataInicio: string
  bonificacaoMensal?: number | null
  bonificacaoMeses?: number | null
}

// 4-card grid mirroring the design's "Empréstimo da casa" section:
// CAPITAL EM DÍVIDA · PRÓXIMA PRESTAÇÃO · CONCLUSÃO PREVISTA · POUPANÇA EM JUROS
export function LoanKpis({ kpis, capitalInicial, dataInicio, bonificacaoMensal, bonificacaoMeses }: Props) {
  const today = currentYm()
  const anosRestantes = ymYearsDiff(today, kpis.conclusaoYm)
  const [anoConclusao] = kpis.conclusaoYm.split('-')

  const bonAtiva = bonificacaoMensal != null && bonificacaoMensal > 0
    && bonificacaoMeses != null && bonificacaoMeses > 0
    && today < ymAddMonths(dataInicio, bonificacaoMeses)
  const netPrestacao = bonAtiva ? kpis.proximaPrestacao - bonificacaoMensal! : null

  return (
    <div className="kpi-grid">
      <div className="kpi">
        <div className="kpi-label">CAPITAL EM DÍVIDA</div>
        <div className="kpi-value">{eur(kpis.capitalAtual)}</div>
        <div className="kpi-progress" aria-label={`${(kpis.pctPago * 100).toFixed(1)}% pago`}>
          <div
            className="kpi-progress-fill"
            style={{ width: `${Math.min(100, kpis.pctPago * 100)}%` }}
          />
        </div>
        <div className="kpi-meta">{pct(kpis.pctPago)} pago · de {eur(capitalInicial)}</div>
      </div>

      <div className="kpi">
        <div className="kpi-label">PRÓXIMA PRESTAÇÃO</div>
        <div className="kpi-value">{eur2(kpis.proximaPrestacao)}</div>
        {netPrestacao != null
          ? <div className="kpi-meta kpi-meta-bon">líquido {eur2(netPrestacao)} · bonificação ativa</div>
          : <div className="kpi-meta">{ymToLong(kpis.proximaYm)}</div>
        }
      </div>

      <div className="kpi">
        <div className="kpi-label">CONCLUSÃO PREVISTA</div>
        <div className="kpi-value">Ano {anoConclusao}</div>
        <div className="kpi-meta">{anosRestantes} anos restantes</div>
      </div>

      <div className={`kpi ${kpis.poupancaJuros > 0 ? 'kpi-accent-green' : ''}`}>
        <div className="kpi-label">POUPANÇA EM JUROS</div>
        <div className="kpi-value">
          {kpis.poupancaJuros > 0 ? eur(kpis.poupancaJuros) : '—'}
        </div>
        <div className="kpi-meta">
          {kpis.poupancaJuros > 0 ? 'das amortizações registadas' : 'amortizações registadas'}
        </div>
      </div>
    </div>
  )
}

export default LoanKpis

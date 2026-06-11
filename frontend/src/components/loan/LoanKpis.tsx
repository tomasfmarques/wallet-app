import { eur, eur2, pct, ymToLong, ymYearsDiff, currentYm, ymAddMonths } from '@/lib/format'
import type { LoanKpis as LoanKpisData } from '@/hooks/useLoan'

interface Props {
  kpis: LoanKpisData
  capitalInicial: number
  dataInicio: string
  tanFixa: number
  spread: number
  euribor: number
  taeg?: number | null
  bonificacaoMensal?: number | null
  bonificacaoMeses?: number | null
}

export function LoanKpis({
  kpis, capitalInicial, dataInicio,
  tanFixa, spread, euribor, taeg,
  bonificacaoMensal, bonificacaoMeses,
}: Props) {
  const today = currentYm()
  const anosRestantes = ymYearsDiff(today, kpis.conclusaoYm)
  const [anoConclusao] = kpis.conclusaoYm.split('-')

  const bonAtiva = bonificacaoMensal != null && bonificacaoMensal > 0
    && bonificacaoMeses != null && bonificacaoMeses > 0
    && today < ymAddMonths(dataInicio, bonificacaoMeses)
  const netPrestacao = bonAtiva ? kpis.proximaPrestacao - bonificacaoMensal! : null

  const isFixedOnly = spread === 0 && euribor === 0

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
        <div className="kpi-meta">{pct(kpis.pctPago)} amortizado · de {eur(capitalInicial)}</div>
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

      {/* Rate info card — shows TAEG if set, otherwise effective rate */}
      <div className="kpi">
        <div className="kpi-label">TAXA EFETIVA</div>
        {taeg != null ? (
          <>
            <div className="kpi-value">{(taeg * 100).toFixed(2)} %</div>
            <div className="kpi-meta">TAEG · TAN {(tanFixa * 100).toFixed(2)} %</div>
          </>
        ) : isFixedOnly ? (
          <>
            <div className="kpi-value">{(tanFixa * 100).toFixed(2)} %</div>
            <div className="kpi-meta">TAN fixa</div>
          </>
        ) : (
          <>
            <div className="kpi-value">{((euribor + spread) * 100).toFixed(2)} %</div>
            <div className="kpi-meta">
              Euribor {(euribor * 100).toFixed(2)} % + spread {(spread * 100).toFixed(2)} %
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default LoanKpis

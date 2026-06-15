import { useMemo } from 'react'
import { Doughnut } from 'react-chartjs-2'
import { useTranslation } from 'react-i18next'
import type { ChartData, ChartOptions } from 'chart.js'
import { eur } from '@/lib/format'
import { categoryLabel } from '@/lib/categoryDictionary'

interface Item {
  name: string
  amount: number
  category: string | null
  active: boolean
}

interface Props {
  items: Item[]
  title: string
  emptyText: string
  totalSuffix?: string   // appended to the total, e.g. "/mês"; "" for month views
}

const UNCAT = 'Por classificar'  // internal bucket key (category is null/empty)

// Tones from the existing accent palette.
const COLOURS = [
  '#2563EB', '#0EA5A4', '#7C3AED', '#E8590C', '#D97706',
  '#059669', '#DC2626', '#475569', '#0F172A',
]
const OTHERS_COLOUR = '#94A3B8'

// Beyond this many slices the right-hand legend overflows the card, so
// the smallest categories collapse into a single "Outras" bucket.
const MAX_SLICES = 7

// Donut chart breaking down a budget list by category. Inactive items are
// excluded — they don't count toward the active budget. Items without a
// category fall into the "Por classificar" bucket.
export function CategoryDonut({ items, title, emptyText, totalSuffix }: Props) {
  const { t } = useTranslation('budget')
  const suffix = totalSuffix ?? t('donut.perMonth')
  const { data, options, total, hasData } = useMemo(() => {
    const byCat = new Map<string, number>()
    for (const it of items) {
      if (!it.active || it.amount <= 0) continue
      const key = (it.category && it.category.trim()) || UNCAT
      byCat.set(key, (byCat.get(key) ?? 0) + it.amount)
    }
    let entries = Array.from(byCat.entries()).sort((a, b) => b[1] - a[1])
    let othersCount = 0
    if (entries.length > MAX_SLICES) {
      const rest = entries.slice(MAX_SLICES - 1)
      entries = entries.slice(0, MAX_SLICES - 1)
      entries.push(['__others__', rest.reduce((s, [, v]) => s + v, 0)])
      othersCount = rest.length
    }
    const hasOthers = othersCount > 0
    const labelFor = (k: string): string =>
      k === '__others__' ? t('donut.others', { count: othersCount })
        : k === UNCAT ? t('donut.uncategorized')
        : categoryLabel(k)
    const labels = entries.map(([k]) => labelFor(k))
    const values = entries.map(([, v]) => v)
    const tot = values.reduce((s, v) => s + v, 0)

    const colours = labels.map((_, i) =>
      hasOthers && i === labels.length - 1 ? OTHERS_COLOUR : COLOURS[i % COLOURS.length])

    const chartData: ChartData<'doughnut'> = {
      labels,
      datasets: [{
        data: values,
        backgroundColor: colours,
        borderColor: '#FFFFFF',
        borderWidth: 2,
        hoverOffset: 8,
      }],
    }
    const opts: ChartOptions<'doughnut'> = {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '62%',
      plugins: {
        legend: {
          position: 'right',
          labels: {
            boxWidth: 10,
            boxHeight: 10,
            padding: 10,
            font: { size: 12 },
            generateLabels: (chart) => {
              const data = chart.data
              if (!data.labels?.length || !data.datasets.length) return []
              const ds = data.datasets[0]
              const bg = ds.backgroundColor as string[]
              return (data.labels as string[]).map((lbl, i) => {
                const val = (ds.data as number[])[i]
                const pct = tot > 0 ? ((val / tot) * 100).toFixed(0) : '0'
                return {
                  text: `${lbl} · ${pct}%`,
                  fillStyle: bg[i],
                  strokeStyle: bg[i],
                  hidden: false,
                  index: i,
                }
              })
            },
          },
        },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const v = ctx.parsed
              const pct = tot > 0 ? ((v / tot) * 100).toFixed(1) : '0'
              return `${ctx.label}: ${eur(v)} (${pct}%)`
            },
          },
        },
      },
    }
    return { data: chartData, options: opts, total: tot, hasData: values.length > 0 }
  }, [items, t])

  return (
    <div className="card card-pad-lg category-donut">
      <h3 className="settings-subhead" style={{ marginBottom: 4 }}>{title}</h3>
      <div className="muted donut-total">{t('donut.totalPrefix')} <strong>{eur(total)}{suffix}</strong></div>
      {hasData ? (
        <div className="chart-wrap" style={{ height: 220 }}>
          <Doughnut data={data} options={options} />
        </div>
      ) : (
        <div className="muted" style={{ padding: '24px 0', textAlign: 'center' }}>{emptyText}</div>
      )}
    </div>
  )
}

export default CategoryDonut

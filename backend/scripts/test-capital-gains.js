// Unit tests for the FIFO capital-gains engine (lib/capitalGains) — a tax-money
// calculation, so the verification scenarios live IN the repo and are
// reproducible. Run:  npm run build -w backend && node scripts/test-capital-gains.js
const { computeRealizedGains, buildGainsReport } = require('../dist/lib/capitalGains')

const tx = (side, qty, totalEur, ym, time) =>
  ({ side, isin: 'IE000TEST0001', ticker: 'TST', qty, totalEur, ym, txnTime: time })

const cases = []
const check = (name, cond) => { cases.push({ name, ok: !!cond }); if (!cond) process.exitCode = 1 }

// 1. Spec scenario: buy 10 @ €10 (Jan), buy 10 @ €20 (Feb), sell 15 @ €30 (Nov)
//    → two rows: 10 units gain €200 (lot 1) + 5 units gain €50 (lot 2); tax €70.
const base = [tx('buy', 10, 100, '2026-01', 'a'), tx('buy', 10, 200, '2026-02', 'b'), tx('sell', 15, 450, '2026-11', 'c')]
const rows = computeRealizedGains(base)
const rep = buildGainsReport(base, 2026)
check('spec: two lot rows', rows.length === 2)
check('spec: lot1 gain 200', rows[0].gainEur === 200 && rows[0].qty === 10 && rows[0].acquiredYm === '2026-01')
check('spec: lot2 gain 50', rows[1].gainEur === 50 && rows[1].qty === 5 && rows[1].acquiredYm === '2026-02')
check('spec: tax 70', rep.estimatedTax === 70)

// 2. Fractional shares
const frac = computeRealizedGains([tx('buy', 0.5, 50, '2025-03', 'a'), tx('sell', 0.25, 40, '2025-09', 'b')])
check('fractional: one row gain 15', frac.length === 1 && Math.abs(frac[0].gainEur - 15) < 1e-9)

// 3. Sell without any buy → incomplete, zero cost
const inc = computeRealizedGains([tx('sell', 5, 500, '2024-06', 'c')])
check('incomplete: flagged, cost 0, gain = proceeds', inc.length === 1 && inc[0].incomplete && inc[0].costEur === 0 && inc[0].gainEur === 500)

// 4. Partial coverage: buy 3, sell 5 → covered row + incomplete remainder of 2
const part = computeRealizedGains([tx('buy', 3, 30, '2024-01', 'a'), tx('sell', 5, 100, '2024-06', 'b')])
check('partial: covered row gain 30', part.length === 2 && !part[0].incomplete && Math.abs(part[0].gainEur - 30) < 1e-9)
check('partial: incomplete remainder qty 2', part[1].incomplete && Math.abs(part[1].qty - 2) < 1e-9)

// 5. Year filter: a 2025 sale is absent from the 2026 report but listed in availableYears
const yr = buildGainsReport([tx('buy', 1, 10, '2024-01', 'a'), tx('sell', 1, 20, '2025-05', 'b')], 2026)
check('year filter: empty 2026, years=[2025]', yr.rows.length === 0 && yr.availableYears.join() === '2025')

// 6. Free shares (T212 promo): zero-cost BUY lot must be kept, not filtered
const free = computeRealizedGains([tx('buy', 2, 0, '2025-01', 'a'), tx('sell', 2, 100, '2025-06', 'b')])
check('free shares: complete row, full proceeds as gain', free.length === 1 && !free[0].incomplete && free[0].gainEur === 100 && free[0].costEur === 0)

// 7. No tax on a net loss
const loss = buildGainsReport([tx('buy', 1, 100, '2025-01', 'a'), tx('sell', 1, 60, '2025-06', 'b')], 2025)
check('net loss: tax 0', loss.totals.gain === -40 && loss.estimatedTax === 0)

for (const c of cases) console.log(`${c.ok ? 'ok  ' : 'FAIL'} ${c.name}`)
console.log(process.exitCode ? 'FAILED' : 'ALL PASS')

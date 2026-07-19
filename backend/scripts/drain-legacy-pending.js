// One-time drain: release rows still waiting in the retired fixed/variable
// triage box (`pending: true`).
//
// Background: until 2026-07-16 an import parked every line in a triage box for
// the user to classify. IMPORTS_AUTO_CLASSIFY (routes/budget.ts) retired that —
// imports now land as classified variable actuals — and the triage UI is hidden
// behind SHOW_PENDING_CLASSIFIER. Nothing creates `pending: true` rows any more,
// but rows from before the flip are still sitting there, and GET /api/budget
// only returns `pending: false` rows in the classified lanes. Left alone they'd
// be invisible: absent from the budget, absent from the (hidden) triage box.
//
// The first version of this swept on EVERY GET /api/budget — a transaction plus
// two writes per request, forever, to fix a finite backlog exactly once. This is
// that sweep, lifted out to run once.
//
// Rows keep their import-time GUESSED type (unmatched incomes defaulted to
// fixed), which for expenses feeds realMonth's fixed/variable split — so a
// drained backlog can show a slightly-off split until corrected with a bulk
// "Tipo →". That was equally true of the per-GET sweep; surfacing the count is
// what makes it auditable.
//
// Idempotent: once drained it matches nothing and reports 0. Runs against
// whatever DATABASE_URL points at, so it drains ALL users in one pass.
//
//   npm run db:drain-pending -w backend                    # local dev.db
//   DATABASE_URL="postgres://…" node scripts/drain-legacy-pending.js   # prod
//
// It uses whichever Prisma client was generated last. That's exactly right in
// the vercel-build chain (it runs straight after db:generate:prod), but locally
// it means a `db:generate:prod` run leaves a Postgres client pointed at your
// SQLite DATABASE_URL — run `npm run db:generate -w backend` first if a prod
// generate happened in this checkout.
//
// It also runs automatically on deploy (root `vercel-build`). Once a prod
// deploy reports 0, both that step and this script can be deleted.

const { PrismaClient } = require('@prisma/client')

async function main() {
  const prisma = new PrismaClient()
  try {
    const [incomes, expenses] = await prisma.$transaction([
      prisma.income.updateMany({ where: { pending: true }, data: { pending: false } }),
      prisma.expense.updateMany({ where: { pending: true }, data: { pending: false } }),
    ])
    const total = incomes.count + expenses.count
    if (total === 0) {
      console.log('[drain-legacy-pending] nothing to drain (0 rows) — already clean.')
    } else {
      console.log(`[drain-legacy-pending] released ${total} legacy pending row(s): ${incomes.count} income(s), ${expenses.count} expense(s).`)
      console.log('[drain-legacy-pending] their type is an import-time guess — a bulk "Tipo →" may be needed to correct the fixed/variable split.')
    }
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((err) => {
  console.error('[drain-legacy-pending] FAILED:', err)
  process.exit(1)
})

# Decisions — Crédito / Loan (amortization engine + UI)

_Source: split from CAVEATS-full.md._

## Phase 2A — Loan core

### Decisions

- **Engine lives on the backend only**
  - **What**: `backend/src/lib/loanEngine.ts` is the single source of truth for
    amortization math. The frontend never recomputes; it hits the API.
  - **Why**: avoid drift between two implementations.
  - **How to change**: if you ever need pure-frontend simulation (e.g. for an
    offline mode), copy the file to `frontend/src/lib/loanEngine.ts`. The
    module has no Node-specific imports.

- **Rate units: fraction in DB, percent in UI**
  - **What**: TAN, spread, Euribor are stored as fractions (e.g. `0.022`) but
    entered/displayed as percent (`2.2`).
  - **Why**: matches financial convention, easier UX.
  - **How to change**: conversion happens at form submit
    (`LoanSetupForm.tsx`) and on edit-prefill. If you change one place, mirror
    the other.

- **`computeKpis` uses UTC "today"**
  - **What**: the "current month" anchor for KPIs comes from `new Date()`
    in UTC.
  - **Why**: avoids timezone drift between server and client.
  - **How to change**: pass a `referenceYm` to `computeKpis()` if you want a
    fixed reference month (e.g. for testing).

### Behavioural caveats

- **Last installment rounding**: when the schedule is about to pay off, the
  last installment is clamped so principal doesn't go negative. The `prestacao`
  on that last row may be slightly smaller than the steady-state PMT.

- **Extra amortizations applied after the regular installment**: interest for
  the month is computed on the pre-payment capital. Matches most real bank
  behaviour but verify against your contract if it matters.

---

## Phase 2B — Loan UI

### Decisions

- **Dropped `MonthlyTracking.tsx` from the Loan page**
  - **What**: the flat tracking list from Phase 2A was replaced by
    `YearAccordion.tsx`. The old file still exists in the repo, no longer
    imported anywhere.
  - **Why**: kept it as a reference; harmless dead code.
  - **How to change**: delete `frontend/src/components/loan/MonthlyTracking.tsx`
    whenever you're done with it.

- **Capital chart samples every 6 months**
  - **What**: `CapitalChart.tsx` plots every 6th month + the final point.
  - **Why**: 480-row schedules choke Chart.js with all points enabled.
  - **How to change**: pass `sampleEvery={1}` for full resolution, or `12` for
    yearly. The last point is always included.

- **Simulator schedules amortizations only in January each year**
  - **What**: `POST /api/loan/simulate` places `annualAmount` at `YYYY-01` for
    each year from `startYear` onward, mode `prazo`.
  - **Why**: simplest model matching the README's "annual amortization" slider.
  - **How to change**: extend the endpoint body with a `month` field (1-12)
    and use that in `simAmortizations.push({ ym: \`${y}-${month}\`, ... })`.

- **Dark navy navbar**
  - **What**: `#0B1120` background matching the design screenshot. Section
    title + subtitle visible only on ≥900px screens.
  - **Why**: high-fidelity match to the design reference.
  - **How to change**: edit `.navbar` and related selectors in
    `frontend/src/index.css`.

### Behavioural caveats

- **Simulate compares base = current loan vs sim = with overrides**: the base
  uses `loan.euribor` (your persisted value), so if you change Euribor in
  Configurações it will change the baseline. The simulator's "savings" KPI
  therefore mixes rate-delta savings with amortization savings — that's
  intentional (it's what really matters to your wallet) but worth knowing.

- **`POST /api/loan/euribor` updates both history and the loan**: posting a
  new Euribor entry also overwrites `loan.euribor` (the current value used by
  the engine). If you want history-only with no engine effect, add a `dryRun`
  flag to the endpoint.

---


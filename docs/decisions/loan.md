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

## 2026-06-19 — "Deeper wedge": portfolio-projected invest + recurring mode

`POST /api/simulate/compare` ("Amortizar vs Investir", powering the /comparar
page **and** the dashboard `WedgeInsight` card) was simplistic: it invested a
one-off lump at a single flat rate and the default rate was the *simple average*
of per-asset expected returns. Two upgrades:

- **Invest across the real portfolio (not a flat rate).** New
  `returnMode: 'portfolio' | 'manual'` (default `portfolio`). In portfolio mode
  the amount is spread across the user's `PortfolioAsset` rows **by current value
  weight** and each slice compounds at its own `expectedReturn` — the same
  per-asset model as the Portfolio projection, so the wedge agrees with that
  page. Falls back to `manual` automatically when the user holds no assets (or
  total value 0). The flat `investReturn` **slider stays as a manual override /
  what-if**. Response adds `investir.effectiveReturn` (value-weighted annual %,
  shown in the RETORNO ANUAL KPI) and `investir.returnMode` (the mode actually
  used). Decision (asked): *project across real assets*, keep the slider.
  - **Note (convexity):** the per-asset projection is **slightly higher** than a
    flat rate at the average return (Jensen's inequality on `(1+rᵢ/12)ⁿ`). That's
    correct, not a bug — don't "fix" it by averaging the rate then compounding.

- **Recurring (monthly / yearly) mode.** New
  `frequencia: 'unica' | 'mensal' | 'anual'` (default `unica`, back-compat).
  `mensal` invests/amortizes `valor` **every month**; `anual` does it **every 12
  months** from `ym` (the "recurrent all years" mode, like the Loan simulator's
  yearly `annualAmount`). Invest = annuity FV via an iterative monthly loop (a
  shared `contribMonth(m)` adds the amount monthly, or when `m % 12 === 0`);
  amortize = one engine `Amortization` per period over the loan's remaining life
  (entries past payoff are capped to the outstanding capital by `loanEngine`, so
  it's safe). Measured **over the loan's remaining term** (decision asked:
  *outlay over loan life* — mirrors the lump-sum logic, no "invest-the-difference
  after early payoff"). Response adds `investir.totalContributed`; `monthlyFreed`
  is intentionally **null** in recurring modes (a recurring overpayment changes
  the installment every period, so a single "freed" figure would mislead).
  Note: `anual` is anchored to `ym`'s anniversary (every 12 months), not calendar
  January like `/api/loan/simulate` — the annual *cadence* is what matters here.

- **Break-even** is now computed by iterating the same cash-flow shape (lump or
  annuity) in a binary search rather than the closed-form lump formula — so it
  stays a clean "what flat return would I need to beat amortizing" for both modes
  and is independent of the projection.

- **No schema change.** Pure engine + UI. The dashboard card needed no change —
  it calls the same endpoint and only fires when the user has investments, so it
  now uses the projection automatically.
- **Don't:** revert the invest side to `valor*(1+r)^n` flat — that drops both the
  recurring annuity and the per-asset projection.

### 2026-06-19 — Risk band (±1σ) in the wedge

- **What:** `/compare` accepts optional `riskVolatility` (annual %, the
  portfolio's volatility from `/api/portfolio/risk`). When present it returns
  `investir.pessimisticNet` / `optimisticNet` — the net gain re-priced at
  `effectiveReturn ∓ σ` (a "bad year / good year" band) — plus echoes
  `riskVolatility`. The Compare page passes the portfolio vol in and renders a
  risk callout: level pill + the ±1σ band + a robustness verdict (does the
  recommendation still hold in a bad year?).
- **Why:** the investment side is uncertain while interest saved by amortizing is
  GUARANTEED. The band puts that uncertainty next to the guaranteed saving so the
  recommendation is read with risk in mind, not just expected value.
- **Tax on the band:** `netFromGross` taxes only POSITIVE gains — a pessimistic
  scenario can be a real loss, and you aren't taxed on a loss. (`flatNetGain`,
  used for break-even, now routes through the same helper.)
- **Kept out of the compare engine's Yahoo path:** `riskVolatility` is passed IN
  as a number (computed by the lazy `/portfolio/risk` endpoint), so `/compare`
  stays fast and the dashboard `WedgeInsight` (which doesn't pass it) shows no
  band — by design.

### 2026-06-26 — Risk band corrected: scale σ by √T (terminal ±1σ, not per-year)

- **Bug:** the band above re-priced at `effectiveReturn ∓ σ` and compounded that
  rate over the WHOLE horizon — i.e. "what if *every* year were a ±1σ year",
  which over ~25 years gave a nonsensical **€8.7M "Ano bom"** beside a −€787
  "Ano mau". (The earlier `dde91a9` ÷100 fix only stopped a numeric overflow; the
  conceptual per-year error remained — it was never actually sane.)
- **Fix:** σ is the std-dev of a SINGLE year's return. The uncertainty of the
  **terminal** gain over T years is σ·√T in log-space, so the band on the
  ANNUALIZED return is **σ/√T**. `simulate.ts` now shifts the rate by
  `riskVolN / Math.sqrt(horizonYears)` before compounding. Verified numerically
  (old ≈ €6.3M good-year / new band ≈ €28k–€198k straddling the ~€78k mean).
- **Consequences:** (a) the corrected bad case is solidly positive for long
  horizons, so the robustness verdict often flips "fragile" → "robust" — the
  honest result; (b) the "Ano mau/bom" copy implies a single year but the figure
  is a *horizon outcome* → "Cenário mau/bom" reads truer (open copy decision);
  (c) for recurring contributions the full-horizon √T is applied to the whole
  stream — a reasonable approximation (late contributions truly have a shorter
  horizon).
- Also: the **σ/Σ symbols were stripped from the user-facing labels**
  (`compare.json` pt+en) as statistics jargon — now plain "RISCO DO INVESTIMENTO
  / Ano mau: / Ano bom:". (Status: both changes shipped to `main`/prod.)
- **2026-07-08 — "Ano mau/bom" → "Cenário mau/bom" (done).** Applied the copy
  fix flagged above: `risk.pessimistic`/`risk.optimistic`/`risk.robustInvest`/
  `risk.fragileInvest` in `compare.json` (pt+en) now say "Cenário mau/bom" /
  "bad/good scenario" instead of "Ano mau/bom" / "bad/good year" — matches the
  fact that the figure is a horizon outcome, not a single year. Copy-only, no
  schema/logic change.


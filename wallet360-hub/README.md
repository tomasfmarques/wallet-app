# Wallet360 — War Room 🛰️

> Single command center for the project. Open this file every morning. Everything
> else (to-dos, gotchas, the app manual, decisions) hangs off the index below.
> Structure/notes are in English; app screen names stay in **pt-PT** because the
> app is Portuguese.
>
> 📊 **Visual dashboard:** run `npm run hub` then open
> [`wallet360-hub/hub.html`](hub.html) — one self-contained page that renders every
> doc here + in `docs/` with phase progress, open items, and quick links. Re-run
> `npm run hub` to refresh after editing any `.md`.

---

## Current status (snapshot)

- **Live:** https://wallet360.pt — Vercel (serverless API + static SPA), TLS ok, `/api/health` → `{"status":"ok"}`. DB is **Neon Postgres, currently empty** (wiped 2026-06-12 after a failed SQLite→Neon migration; prod started fresh).
- **Works today:** auth (email/password + Google), the 5 modules (Visão geral, Crédito, Investimentos, Saldo, Configurações) + the **Amortizar vs Investir** screen, statement import with dedup + merchant rule-learning, password-gated export, account deletion. Cross-user isolation and auth hygiene are **audited-good**.
- **Blocking public launch (4 🔴):** **F1** migration drift 500s a fresh checkout · **F2** zero production observability · **F3** no PWA shell (gates the Play Store path) · **F4** imported income shows `0 €` on Visão geral (looks broken to a new user).
- **Local dev note:** backend runs on **:4000** (not the `:3001` the older docs claim — that's finding **F10**). Frontend on :5173.
- **Next physical step:** Phase 0 in [`TODO.md`](TODO.md) — F1 fix (`cd backend && npx prisma db push && npx prisma generate`), F10 doc fix, S6 rotate Neon password, make imported income visible.

---

## Hub index (the files you live in)

| File | What it's for |
|------|---------------|
| [`TODO.md`](TODO.md) | The consolidated backlog. Grouped by Phase 0→4, checkbox per item, each tagged with its plan ID + severity + likely files. **Pick the top unchecked box.** |
| [`KEEP-IN-MIND.md`](KEEP-IN-MIND.md) | Landmines / "read before you touch X." Two-Prisma-schema trap, prod `db push`, merchant.ts parity, CommonJS, in-memory state on serverless, Yahoo endpoint, CSV injection, the :4000 drift. |
| [`USER-MANUAL.md`](USER-MANUAL.md) | Short end-user manual (pt-PT) of the app as it exists today — what each screen actually does, including the rough edges. |
| [`DECISIONS-LOG.md`](DECISIONS-LOG.md) | Running log (newest first) of non-obvious go-public decisions. Complements the per-module logs in `../docs/decisions/`. |

## Canonical docs (the sources of truth — don't duplicate, link)

| Doc | What it is |
|-----|------------|
| [`../docs/PUBLIC-LAUNCH-PLAN.md`](../docs/PUBLIC-LAUNCH-PLAN.md) | **The master go-public plan.** Fragility audit F1–F11, security scope S1–S9, session plan P1–P4, the PWA→TWA→Capacitor Android path, feature scope, phased roadmap, one-glance scope table, and Appendix A (the "Rita" test-profile recipe). The hub indexes this. |
| [`../docs/STATE.md`](../docs/STATE.md) | Living state: deployment status, next steps, open threads, known traps. Updated via `/handoff`. |
| [`../CLAUDE.md`](../CLAUDE.md) | Project guide: stack, code map, the non-negotiable rules. Loads every session. |
| [`../MARKET-FEEDBACK.md`](../MARKET-FEEDBACK.md) | Product/market strategy — why the **"amortizar vs investir"** wedge is the whole game. |
| [`../docs/decisions/`](../docs/decisions/) | Per-module decision logs (auth, loan, portfolio, budget, settings, deploy). Read only the module you're in. |

---

## Daily flow

1. Skim **status** above + the top of [`TODO.md`](TODO.md).
2. Before touching anything risky, scan [`KEEP-IN-MIND.md`](KEEP-IN-MIND.md).
3. Do the work. Log any non-obvious call in [`DECISIONS-LOG.md`](DECISIONS-LOG.md).
4. Before committing: run `/handoff` (updates `../docs/STATE.md`) and `/ship` (pre-deploy checklist).

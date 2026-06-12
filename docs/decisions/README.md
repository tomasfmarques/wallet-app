# Decision log — index

Per-module record of decisions, shortcuts, and behavioural caveats. Split from
the old monolithic `CAVEATS.md` so a session only loads the file it needs.

**Rule:** read ONLY the file for the module you're touching. Never load all of them.

| File | Covers | Read when you're working on… |
|------|--------|------------------------------|
| [`00-setup.md`](00-setup.md) | Project setup, stack, tooling, Node version | build scripts, deps, workspace config |
| [`auth.md`](auth.md) | Email/password auth, sessions, Google Sign In | login, signup, route guards, OAuth |
| [`loan.md`](loan.md) | Crédito — amortization engine + UI | mortgage/credit features, simulator |
| [`portfolio.md`](portfolio.md) | Investments, quotes, FX, per-stock charts | assets, watchlist, Yahoo/Finnhub, projections |
| [`settings.md`](settings.md) | Account, Euribor editor, export/import, danger zone | Settings page, backup/restore |
| [`budget.md`](budget.md) | Saldo — incomes, expenses, statement import, bank connect | budget module, CSV/OFX/PDF import, GoCardless |
| [`deploy.md`](deploy.md) | Deploy, hosting, production readiness | Render/Vercel, env vars, CI/CD, going live |

Full original (verbatim, for reference only): [`../archive/CAVEATS-full.md`](../archive/CAVEATS-full.md).

## Logging a new decision

Append to the relevant file using the `**What / Why / How to change**` format
already used throughout, or run the `/caveat` command and let Claude file it in
the right place.

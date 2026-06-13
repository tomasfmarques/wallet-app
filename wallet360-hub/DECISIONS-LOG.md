# Wallet360 — Decisions Log (go-public)

> Lightweight running log of **non-obvious decisions** as the project moves to
> public — newest first. This is the *project-level / cross-cutting* log.
> It **complements, does not replace**, the per-module logs in
> [`../docs/decisions/`](../docs/decisions/) (auth, loan, portfolio, budget,
> settings, deploy) — put module-specific caveats there (or run `/caveat`).
>
> Format per entry: **date · decision · why · link to the relevant plan section.**

---

### 2026-06-12 — Android path: PWA → TWA → Capacitor (in that order)
- **Decision:** ship a real PWA first, wrap it as a Trusted Web Activity (Bubblewrap) for the Play Store, and only reach for Capacitor if a concrete native feature forces it.
- **Why:** TWA runs same-origin in a Chrome container, so the **existing cookie session works unchanged** — no token rewrite. Reuses 100 % of the web app, yields both an `.aab` (store) and an `.apk` (sideload) from one toolchain, and defers all native complexity. Capacitor would force a token-based session and a native build for no current benefit.
- **Ref:** [plan Part 4 — Path to Android](../docs/PUBLIC-LAUNCH-PLAN.md) · sessions implication in Part 3 (P3).

### 2026-06-12 — Imported statement lines stay month-scoped; reconcile via a planned-vs-actuals split (not by making them recurring)
- **Decision:** keep imported lines as single-month (`startYm === endYm`) realised movements, and fix the Visão geral `0 €` bug by introducing a separate "realised this month" lane — **not** by reclassifying imports as recurring budget items.
- **Why:** imports are facts about one month; the budget model is about recurring plan. Conflating them is exactly what produces the false `0 €` income / fake deficit (F4). A clean planned-vs-actuals split (FX1) fixes the bug *and* unlocks honest month-by-month reporting, instead of polluting the recurring model.
- **Ref:** [plan F4](../docs/PUBLIC-LAUNCH-PLAN.md) + [plan Part 5(a) FX1](../docs/PUBLIC-LAUNCH-PLAN.md). User-facing symptom in [`USER-MANUAL.md`](USER-MANUAL.md).

### 2026-06-12 — Prod runs on `db push`, not migrations (and that's the chosen trade-off)
- **Decision:** prod schema is pushed (`db:push:prod` in `vercel-build`) rather than migrated. Accepted as the working model; mitigation is process, not tooling — take a Neon snapshot before any rename/drop.
- **Why:** keeps prod schema tracking code automatically on every deploy without maintaining a migration history that's already drifted (see F1). The cost is that `db push` is destructive on column renames — handled by the snapshot rule rather than by switching to migrations now.
- **Ref:** [plan F1](../docs/PUBLIC-LAUNCH-PLAN.md) · CLAUDE.md rule #2 · trap detail in [`KEEP-IN-MIND.md`](KEEP-IN-MIND.md).

---

_To add an entry: copy the format above, put it at the top. For a module-specific
decision, file it under [`../docs/decisions/`](../docs/decisions/) instead (or run `/caveat`)._

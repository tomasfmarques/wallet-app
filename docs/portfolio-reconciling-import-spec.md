# Reconciling portfolio import — spec (sells & reductions)

**Status:** designed 2026-06-25, not yet implemented.
**Why:** today's import is **add-only + dedup-by-ISIN** ([`processPortfolioImportItems`](../backend/src/routes/portfolio.ts)),
so it can never express a **sell or reduction**. A Trading 212 CSV containing a
sell is silently dropped, and the live-API sync ([`broker.ts`](../backend/src/routes/broker.ts))
has the same gap. Reported incident: sold all TTWO + rotated into SXR8/IWDA → the
sell was ignored and the holding stayed at its old quantity.

## Core design — two sources, two semantics

The two import sources carry **different kinds of data**, so they reconcile differently:

| Source | Data | "Absent from payload" means | Reconcile model |
|--------|------|------------------------------|-----------------|
| **CSV export** (`trading212Parser.ts`) | partial **transaction ledger** (≤1 yr/file; can be a single day) | *no transactions in that window* (NOT sold) | **transaction delta** vs existing holdings |
| **Live API** (`fetchT212ImportItems`) | authoritative **current snapshot** (every open position, live qty/invested/value) | **fully sold** | **snapshot reconcile** |

Using snapshot logic on a CSV would wrongly delete everything not in the file — the trap to avoid.

## Locked decisions (2026-06-25)
1. **Zeroed positions → removed** (qty ~0 ⇒ delete the holding + its flows). The app tracks current holdings, not realized P&L.
2. **Idempotency via a txn-ID dedup table** (`ImportedTxn`, keyed on the CSV order `ID`), so re-importing a file is always safe.
3. **Build A (CSV delta) and B (live snapshot) together.**

## Out of scope (v1)
Realized P&L / freed-cash tracking. We reflect a sale only by reducing/closing the position.

---

## Schema (additive — **two-schema rule**, db:push:prod safe, no Neon snapshot)

Touch **both** `schema.prisma` + `schema.prod.prisma`, **and** `export.ts` + `import.ts`.

1. `PortfolioAsset.source String @default("manual")` — `"manual" | "trading212"`. Set by import/sync. Existing rows default `"manual"` (conservative: snapshot-reconcile only auto-closes `source = "trading212"` holdings, so legacy imported rows are never auto-deleted until re-synced).
2. New model:
   ```prisma
   model ImportedTxn {
     id         String   @id @default(cuid())
     userId     String
     user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
     source     String   // "trading212"
     externalId String   // CSV order ID, e.g. EOF53208567774
     createdAt  DateTime @default(now())
     @@unique([userId, source, externalId])
     @@index([userId])
   }
   ```
   Both `source` and `ImportedTxn` are carried in the backup `export.ts`/`import.ts` (so dedup survives a restore).

---

## A. CSV → transaction-delta import

### Parser (`frontend/src/lib/trading212Parser.ts`)
- Add `orderId` to `T212Transaction` (from the CSV `ID` column).
- **Stop dropping** sell-only/closed positions (remove the `qty <= 1e-6 continue` at line ~175 from the *new* path).
- New `aggregateForReview(txns)` → per-instrument **delta** for the review table only: `{ isin, ticker, name, netQty, netCost, sells: bool, txns: T212Transaction[] }`. The underlying `txns` (with `orderId`) are what's sent to the backend — the net figures are display-only.

### Review UI (`Trading212ImportModal`)
- One row per instrument, showing the **delta vs current holdings**: e.g. `TTWO −3.49 → fechar posição`, `SXR8 +0.575 (+€400)`, `IWDA +2.57 (+€318)`.
- Sells/closures rendered explicitly (red/"fechar"), never hidden. ISIN→Yahoo resolution + per-row ticker edit unchanged.
- Confirm → `POST /api/portfolio/transactions` with the raw txns.

### Backend `applyPortfolioTransactions(userId, txns)` (new, in `portfolio.ts`)
1. Load existing holdings (map by ISIN, then ticker) and the set of already-applied `externalId`s for `(userId, "trading212")`.
2. **Drop txns whose `orderId` is already applied** (idempotent re-import).
3. Group remaining by instrument key (`isin ?? TK:ticker`); **sort each group by `time`**; seed `(qty, cost)` from the existing holding (or `0,0`).
4. Replay chronologically:
   - **buy** → `qty += s; cost += total;` record flow `(ym, total)`.
   - **sell** → if `qty > 0`: `avg = cost/qty; sold = min(s, qty); cost -= avg*sold; qty -= sold`. (Average cost uses the *existing* holding's basis — that's why this is backend, not parser.)
5. Commit per instrument:
   - existing & `qty > ~0` → **update** `qty`, `invested = cost`; scale `value *= newQty/oldQty` (buys add `buyTotal` to value); append new flows.
   - existing & `qty ~0` → **delete** holding + flows.
   - no existing & `qty > ~0` → **create** (`source = "trading212"`, `value = cost`; user runs "Atualizar valores" for market value).
   - no existing & `qty ~0` (sell of an un-held ISIN) → no-op.
6. Record every applied `orderId` into `ImportedTxn`. Wrap all writes in one `prisma.$transaction`.
7. Return `{ created, updated, closed, skipped }`.

---

## B. Live API → snapshot reconcile

### Backend `reconcileBrokerSnapshot(userId, items)` (new, replaces the `processPortfolioImportItems` call at `broker.ts:96`)
- `items` = current snapshot `{ name, ticker, isin, qty, invested, value }` per open position.
- For each item: match by ISIN→ticker → **update** `qty/invested/value` to the snapshot; else **create** (`source = "trading212"`).
- Each existing `source = "trading212"` holding **absent** from the snapshot → **close** (delete). Manual holdings are never touched.
- Return `{ created, updated, closed }`.

### Sync safety (destructive)
- `/sync` becomes two-step: returns a **preview** (`created/updated/closed` lists); the UI shows it (closures highlighted); user confirms → `/sync/apply`. Avoids one-click silent deletion.

---

## Edge cases
- **Sell of an ISIN not held** → no-op, but the txn is still recorded as applied (won't re-surface). (In the incident the holding *does* exist, so the sell correctly reduces it.)
- **GBp / non-EUR** — unchanged; CSV `Total` is account-currency EUR, live items are FX-converted upstream (skipped if FX unavailable).
- **Partial sell** → qty/invested reduced at avg; value scaled.
- **Re-import same file** → all orderIds deduped → zero changes.
- **Manual holding matching a broker ISIN** → updated by snapshot (by ISIN), but never auto-closed (source gate).

## Test plan
- Parser: sell-only file keeps the txn + orderId; mixed buy/sell nets; non-T212 file still returns `[]`.
- `applyPortfolioTransactions`: existing + sell-all → removed; existing + partial sell → reduced at avg; buys top up existing (qty/invested/flow); re-import → deduped no-op; sell of un-held ISIN → no-op + recorded.
- `reconcileBrokerSnapshot`: update qty, create new, close absent broker holding, leave manual holding.

## Rollout
- CSV path ships ungated (it's the live user path). Live snapshot stays behind `BROKER_ENC_KEY` like today.
- Build + verify on the dev SQLite DB first; **do not** `db:push:prod` until reviewed (additive, but destructive *logic* — confirm on dev data first).

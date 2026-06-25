-- CreateTable
CREATE TABLE "imported_txns" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "imported_txns_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_portfolio_assets" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "isin" TEXT,
    "qty" REAL NOT NULL,
    "invested" REAL NOT NULL,
    "value" REAL NOT NULL,
    "monthly" REAL NOT NULL DEFAULT 0,
    "expected_return" REAL NOT NULL DEFAULT 0.07,
    "last_price_eur" REAL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    CONSTRAINT "portfolio_assets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_portfolio_assets" ("expected_return", "id", "invested", "isin", "last_price_eur", "monthly", "name", "qty", "ticker", "user_id", "value") SELECT "expected_return", "id", "invested", "isin", "last_price_eur", "monthly", "name", "qty", "ticker", "user_id", "value" FROM "portfolio_assets";
DROP TABLE "portfolio_assets";
ALTER TABLE "new_portfolio_assets" RENAME TO "portfolio_assets";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "imported_txns_user_id_idx" ON "imported_txns"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "imported_txns_user_id_source_external_id_key" ON "imported_txns"("user_id", "source", "external_id");

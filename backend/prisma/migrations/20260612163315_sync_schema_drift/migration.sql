-- AlterTable
ALTER TABLE "portfolio_assets" ADD COLUMN "last_price_eur" REAL;

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" DATETIME NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "bank_connections" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "requisition_id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "institution_name" TEXT NOT NULL,
    "logo" TEXT,
    "status" TEXT NOT NULL DEFAULT 'created',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "bank_connections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "classification_rules" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "match_key" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "category" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "classification_rules_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_expenses" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "type" TEXT NOT NULL,
    "category" TEXT,
    "day_of_month" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "pending" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT,
    "start_ym" TEXT,
    "end_ym" TEXT,
    "notes" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "expenses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_expenses" ("active", "amount", "category", "created_at", "day_of_month", "end_ym", "id", "name", "notes", "start_ym", "type", "user_id") SELECT "active", "amount", "category", "created_at", "day_of_month", "end_ym", "id", "name", "notes", "start_ym", "type", "user_id" FROM "expenses";
DROP TABLE "expenses";
ALTER TABLE "new_expenses" RENAME TO "expenses";
CREATE INDEX "expenses_user_id_idx" ON "expenses"("user_id");
CREATE INDEX "expenses_user_id_type_idx" ON "expenses"("user_id", "type");
CREATE TABLE "new_incomes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'fixed',
    "category" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "pending" BOOLEAN NOT NULL DEFAULT false,
    "day_of_month" INTEGER,
    "source" TEXT,
    "start_ym" TEXT,
    "end_ym" TEXT,
    "notes" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "incomes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_incomes" ("active", "amount", "category", "created_at", "end_ym", "id", "name", "notes", "start_ym", "user_id") SELECT "active", "amount", "category", "created_at", "end_ym", "id", "name", "notes", "start_ym", "user_id" FROM "incomes";
DROP TABLE "incomes";
ALTER TABLE "new_incomes" RENAME TO "incomes";
CREATE INDEX "incomes_user_id_idx" ON "incomes"("user_id");
CREATE TABLE "new_loans" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Crédito',
    "capital" REAL NOT NULL,
    "prazo_meses" INTEGER NOT NULL,
    "tan_fixa" REAL NOT NULL,
    "meses_fixos" INTEGER NOT NULL,
    "spread" REAL NOT NULL,
    "euribor" REAL NOT NULL,
    "data_inicio" TEXT NOT NULL,
    "bonificacao_mensal" REAL,
    "bonificacao_meses" INTEGER,
    "taeg" REAL,
    CONSTRAINT "loans_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_loans" ("capital", "data_inicio", "euribor", "id", "meses_fixos", "prazo_meses", "spread", "tan_fixa", "user_id") SELECT "capital", "data_inicio", "euribor", "id", "meses_fixos", "prazo_meses", "spread", "tan_fixa", "user_id" FROM "loans";
DROP TABLE "loans";
ALTER TABLE "new_loans" RENAME TO "loans";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key" ON "password_reset_tokens"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "bank_connections_requisition_id_key" ON "bank_connections"("requisition_id");

-- CreateIndex
CREATE INDEX "bank_connections_user_id_idx" ON "bank_connections"("user_id");

-- CreateIndex
CREATE INDEX "classification_rules_user_id_idx" ON "classification_rules"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "classification_rules_user_id_match_key_key" ON "classification_rules"("user_id", "match_key");


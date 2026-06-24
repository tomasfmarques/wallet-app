-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_expenses" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "frequency" TEXT NOT NULL DEFAULT 'monthly',
    "type" TEXT NOT NULL,
    "category" TEXT,
    "day_of_month" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "pending" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT,
    "loan_id" TEXT,
    "match_hint" TEXT,
    "start_ym" TEXT,
    "end_ym" TEXT,
    "notes" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "expenses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_expenses" ("active", "amount", "category", "created_at", "day_of_month", "end_ym", "id", "loan_id", "match_hint", "name", "notes", "pending", "source", "start_ym", "type", "user_id") SELECT "active", "amount", "category", "created_at", "day_of_month", "end_ym", "id", "loan_id", "match_hint", "name", "notes", "pending", "source", "start_ym", "type", "user_id" FROM "expenses";
DROP TABLE "expenses";
ALTER TABLE "new_expenses" RENAME TO "expenses";
CREATE INDEX "expenses_user_id_idx" ON "expenses"("user_id");
CREATE INDEX "expenses_user_id_type_idx" ON "expenses"("user_id", "type");
CREATE TABLE "new_incomes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "frequency" TEXT NOT NULL DEFAULT 'monthly',
    "type" TEXT NOT NULL DEFAULT 'fixed',
    "category" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "pending" BOOLEAN NOT NULL DEFAULT false,
    "day_of_month" INTEGER,
    "source" TEXT,
    "match_hint" TEXT,
    "start_ym" TEXT,
    "end_ym" TEXT,
    "notes" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "incomes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_incomes" ("active", "amount", "category", "created_at", "day_of_month", "end_ym", "id", "match_hint", "name", "notes", "pending", "source", "start_ym", "type", "user_id") SELECT "active", "amount", "category", "created_at", "day_of_month", "end_ym", "id", "match_hint", "name", "notes", "pending", "source", "start_ym", "type", "user_id" FROM "incomes";
DROP TABLE "incomes";
ALTER TABLE "new_incomes" RENAME TO "incomes";
CREATE INDEX "incomes_user_id_idx" ON "incomes"("user_id");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "loans" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "capital" REAL NOT NULL,
    "prazo_meses" INTEGER NOT NULL,
    "tan_fixa" REAL NOT NULL,
    "meses_fixos" INTEGER NOT NULL,
    "spread" REAL NOT NULL,
    "euribor" REAL NOT NULL,
    "data_inicio" TEXT NOT NULL,
    CONSTRAINT "loans_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "loan_payments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "loan_id" TEXT NOT NULL,
    "ym" TEXT NOT NULL,
    "paid" BOOLEAN NOT NULL DEFAULT false,
    "real" REAL,
    CONSTRAINT "loan_payments_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "loans" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "loan_amortizations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "loan_id" TEXT NOT NULL,
    "ym" TEXT NOT NULL,
    "valor" REAL NOT NULL,
    "modo" TEXT NOT NULL,
    CONSTRAINT "loan_amortizations_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "loans" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "euribor_history" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "loan_id" TEXT NOT NULL,
    "ym" TEXT NOT NULL,
    "valor" REAL NOT NULL,
    CONSTRAINT "euribor_history_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "loans" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "portfolio_assets" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "qty" REAL NOT NULL,
    "invested" REAL NOT NULL,
    "value" REAL NOT NULL,
    "monthly" REAL NOT NULL DEFAULT 0,
    "expected_return" REAL NOT NULL DEFAULT 0.07,
    CONSTRAINT "portfolio_assets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "portfolio_flows" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "asset_id" TEXT NOT NULL,
    "ym" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    CONSTRAINT "portfolio_flows_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "portfolio_assets" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "portfolio_settings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "gInc" INTEGER NOT NULL DEFAULT 3,
    "gFY" INTEGER NOT NULL DEFAULT 2,
    "gH" INTEGER NOT NULL DEFAULT 20,
    CONSTRAINT "portfolio_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "loan_payments_loan_id_ym_key" ON "loan_payments"("loan_id", "ym");

-- CreateIndex
CREATE UNIQUE INDEX "euribor_history_loan_id_ym_key" ON "euribor_history"("loan_id", "ym");

-- CreateIndex
CREATE UNIQUE INDEX "portfolio_settings_user_id_key" ON "portfolio_settings"("user_id");

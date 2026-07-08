-- AlterTable
ALTER TABLE "loans" ADD COLUMN "euribor_tenor" TEXT;

-- CreateTable
CREATE TABLE "euribor_rates" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenor" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "value" REAL NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "euribor_rates_tenor_month_key" ON "euribor_rates"("tenor", "month");

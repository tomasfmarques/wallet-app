-- AlterTable
ALTER TABLE "imported_txns" ADD COLUMN "isin" TEXT;
ALTER TABLE "imported_txns" ADD COLUMN "qty" REAL;
ALTER TABLE "imported_txns" ADD COLUMN "side" TEXT;
ALTER TABLE "imported_txns" ADD COLUMN "ticker" TEXT;
ALTER TABLE "imported_txns" ADD COLUMN "total_eur" REAL;
ALTER TABLE "imported_txns" ADD COLUMN "txn_time" TEXT;
ALTER TABLE "imported_txns" ADD COLUMN "ym" TEXT;

-- CreateTable
CREATE TABLE "broker_connections" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "broker" TEXT NOT NULL,
    "env" TEXT NOT NULL DEFAULT 'live',
    "key_enc" TEXT NOT NULL,
    "secret_enc" TEXT,
    "account_ccy" TEXT,
    "last_sync_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "broker_connections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "broker_connections_user_id_idx" ON "broker_connections"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "broker_connections_user_id_broker_key" ON "broker_connections"("user_id", "broker");

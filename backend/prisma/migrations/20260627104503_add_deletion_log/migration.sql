-- CreateTable
CREATE TABLE "deletion_log" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email_hash" TEXT NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'self-service',
    "note" TEXT,
    "deleted_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

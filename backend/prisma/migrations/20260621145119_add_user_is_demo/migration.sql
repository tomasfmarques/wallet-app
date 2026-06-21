-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "password_hash" TEXT,
    "google_id" TEXT,
    "pin_hash" TEXT,
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "name" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_users" ("created_at", "email", "google_id", "id", "name", "password_hash", "pin_hash") SELECT "created_at", "email", "google_id", "id", "name", "password_hash", "pin_hash" FROM "users";
DROP TABLE "users";
ALTER TABLE "new_users" RENAME TO "users";
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX "users_google_id_key" ON "users"("google_id");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- Platform account first-login enrollment and v1 login lockout.

ALTER TABLE "account"
ADD COLUMN "failed_login_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "locked_until" TIMESTAMPTZ(3);

ALTER TABLE "account"
ADD CONSTRAINT "account_failed_login_count_check"
CHECK ("failed_login_count" >= 0);

CREATE INDEX "account_locked_until_idx"
ON "account" ("locked_until");

CREATE TABLE "platform_account_enrollment" (
  "id" UUID NOT NULL,
  "account_id" UUID NOT NULL,
  "token_hash" CHAR(64) NOT NULL,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "consumed_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "platform_account_enrollment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "platform_account_enrollment_account_id_key"
ON "platform_account_enrollment" ("account_id");

CREATE UNIQUE INDEX "platform_account_enrollment_token_hash_key"
ON "platform_account_enrollment" ("token_hash");

CREATE INDEX "platform_account_enrollment_expires_at_consumed_at_idx"
ON "platform_account_enrollment" ("expires_at", "consumed_at");

ALTER TABLE "platform_account_enrollment"
ADD CONSTRAINT "platform_account_enrollment_account_id_fkey"
FOREIGN KEY ("account_id")
REFERENCES "account" ("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

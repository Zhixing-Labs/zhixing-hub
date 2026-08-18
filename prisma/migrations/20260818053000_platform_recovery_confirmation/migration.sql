-- Keep a platform account pending until recovery codes are explicitly saved.

ALTER TABLE "platform_account_enrollment"
ADD COLUMN "pending_password_hash" VARCHAR(255),
ADD COLUMN "recovery_codes_issued_at" TIMESTAMPTZ(3);

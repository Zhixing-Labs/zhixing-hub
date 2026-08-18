-- CreateEnum
CREATE TYPE "PhoneChangeInitiator" AS ENUM ('SELF', 'COUNSELOR');

-- CreateEnum
CREATE TYPE "PhoneChangeStatus" AS ENUM ('PENDING_SMS', 'PENDING_CONFIRM', 'APPLIED', 'REJECTED');

-- CreateTable
CREATE TABLE "phone_change_request" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "new_phone" VARCHAR(11) NOT NULL,
    "initiated_by" "PhoneChangeInitiator" NOT NULL DEFAULT 'SELF',
    "status" "PhoneChangeStatus" NOT NULL DEFAULT 'PENDING_CONFIRM',
    "verified_new_phone_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(3),
    "resolved_by_account_id" UUID,

    CONSTRAINT "phone_change_request_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "phone_change_request_account_id_status_idx" ON "phone_change_request"("account_id", "status");

-- CreateIndex
CREATE INDEX "phone_change_request_status_created_at_idx" ON "phone_change_request"("status", "created_at");

-- AddForeignKey
ALTER TABLE "phone_change_request" ADD CONSTRAINT "phone_change_request_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "phone_change_request" ADD CONSTRAINT "phone_change_request_resolved_by_account_id_fkey" FOREIGN KEY ("resolved_by_account_id") REFERENCES "account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

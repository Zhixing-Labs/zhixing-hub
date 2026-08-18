-- CreateEnum
CREATE TYPE "ClassTransferStatus" AS ENUM ('PENDING_OUTGOING', 'PENDING_INCOMING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "staff_post_handover" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "from_membership_id" UUID NOT NULL,
    "to_membership_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_post_handover_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "staff_post_handover_distinct_members_check" CHECK ("from_membership_id" <> "to_membership_id")
);

-- CreateTable
CREATE TABLE "class_transfer_request" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "student_account_id" UUID NOT NULL,
    "from_class_id" UUID NOT NULL,
    "to_class_id" UUID NOT NULL,
    "status" "ClassTransferStatus" NOT NULL DEFAULT 'PENDING_OUTGOING',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "outgoing_resolved_at" TIMESTAMPTZ(3),
    "incoming_resolved_at" TIMESTAMPTZ(3),
    "resolved_at" TIMESTAMPTZ(3),
    "resolved_by_account_id" UUID,

    CONSTRAINT "class_transfer_request_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "class_transfer_request_distinct_classes_check" CHECK ("from_class_id" <> "to_class_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "staff_post_handover_from_membership_id_key" ON "staff_post_handover"("from_membership_id");

-- CreateIndex
CREATE INDEX "staff_post_handover_tenant_id_to_membership_id_idx" ON "staff_post_handover"("tenant_id", "to_membership_id");

-- CreateIndex
CREATE INDEX "class_transfer_request_tenant_id_status_idx" ON "class_transfer_request"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "class_transfer_request_from_class_id_status_idx" ON "class_transfer_request"("from_class_id", "status");

-- CreateIndex
CREATE INDEX "class_transfer_request_to_class_id_status_idx" ON "class_transfer_request"("to_class_id", "status");

-- CreateIndex
CREATE INDEX "class_transfer_request_student_account_id_status_idx" ON "class_transfer_request"("student_account_id", "status");

-- 同一学生至多一件未决转班（《07》6.1）
CREATE UNIQUE INDEX "class_transfer_request_one_open_per_student"
ON "class_transfer_request" ("student_account_id")
WHERE "status" IN ('PENDING_OUTGOING', 'PENDING_INCOMING');

-- AddForeignKey
ALTER TABLE "staff_post_handover" ADD CONSTRAINT "staff_post_handover_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "staff_post_handover" ADD CONSTRAINT "staff_post_handover_from_membership_id_tenant_id_fkey" FOREIGN KEY ("from_membership_id", "tenant_id") REFERENCES "membership"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "staff_post_handover" ADD CONSTRAINT "staff_post_handover_to_membership_id_tenant_id_fkey" FOREIGN KEY ("to_membership_id", "tenant_id") REFERENCES "membership"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "class_transfer_request" ADD CONSTRAINT "class_transfer_request_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "class_transfer_request" ADD CONSTRAINT "class_transfer_request_student_account_id_fkey" FOREIGN KEY ("student_account_id") REFERENCES "account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "class_transfer_request" ADD CONSTRAINT "class_transfer_request_from_class_id_tenant_id_fkey" FOREIGN KEY ("from_class_id", "tenant_id") REFERENCES "class"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "class_transfer_request" ADD CONSTRAINT "class_transfer_request_to_class_id_tenant_id_fkey" FOREIGN KEY ("to_class_id", "tenant_id") REFERENCES "class"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "class_transfer_request" ADD CONSTRAINT "class_transfer_request_resolved_by_account_id_fkey" FOREIGN KEY ("resolved_by_account_id") REFERENCES "account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

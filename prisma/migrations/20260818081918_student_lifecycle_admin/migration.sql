-- AlterTable
ALTER TABLE "legal_document_version" ALTER COLUMN "updated_at" DROP DEFAULT;

-- CreateTable
CREATE TABLE "retired_student_number" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "student_number" VARCHAR(50) NOT NULL,
    "student_name" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "retired_student_number_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "retired_student_number_tenant_id_student_number_key" ON "retired_student_number"("tenant_id", "student_number");

-- AddForeignKey
ALTER TABLE "retired_student_number" ADD CONSTRAINT "retired_student_number_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

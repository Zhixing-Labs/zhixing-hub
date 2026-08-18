-- CreateEnum
CREATE TYPE "OnboardingLeadKind" AS ENUM ('UNIVERSITY', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "OnboardingLeadStatus" AS ENUM ('NEW', 'IN_PROGRESS', 'OPENED', 'CLOSED');

-- CreateTable
CREATE TABLE "onboarding_lead" (
    "id" UUID NOT NULL,
    "kind" "OnboardingLeadKind" NOT NULL,
    "institution_name" VARCHAR(200) NOT NULL,
    "contact_name" VARCHAR(100) NOT NULL,
    "contact_method" VARCHAR(100) NOT NULL,
    "intent" VARCHAR(2000) NOT NULL,
    "status" "OnboardingLeadStatus" NOT NULL DEFAULT 'NEW',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status_changed_at" TIMESTAMPTZ(3),

    CONSTRAINT "onboarding_lead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "onboarding_lead_status_created_at_idx" ON "onboarding_lead"("status", "created_at");

-- CreateIndex
CREATE INDEX "onboarding_lead_kind_created_at_idx" ON "onboarding_lead"("kind", "created_at");

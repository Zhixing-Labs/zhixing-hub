-- CreateEnum
CREATE TYPE "TenantType" AS ENUM ('PLATFORM', 'UNIVERSITY', 'ENTERPRISE', 'GOVERNMENT');

-- CreateEnum
CREATE TYPE "RecordStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "AccountKind" AS ENUM ('PLATFORM_ADMIN', 'END_USER');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('PENDING_ACTIVATION', 'ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "MembershipRole" AS ENUM ('SUPER_ADMIN', 'ORGANIZATION_ADMIN', 'OPERATIONS_SPECIALIST', 'PLATFORM_DASHBOARD', 'UNIVERSITY_ADMIN', 'COLLEGE_ADMIN', 'PROGRAM_LEAD', 'COUNSELOR', 'STUDENT', 'UNIVERSITY_DASHBOARD', 'ENTERPRISE_ADMIN', 'HR', 'PROJECT_LEAD', 'MENTOR', 'ENTERPRISE_DASHBOARD', 'GOVERNMENT_DASHBOARD_ADMIN', 'GOVERNMENT_DASHBOARD');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'UNSPECIFIED');

-- CreateEnum
CREATE TYPE "StudentKind" AS ENUM ('UNIVERSITY_CERTIFIED', 'PLATFORM');

-- CreateEnum
CREATE TYPE "StudentLifecycleState" AS ENUM ('ENROLLED', 'GRADUATE_ACTIVE', 'READ_ONLY', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "AdministrativeDivisionLevel" AS ENUM ('PROVINCE', 'PREFECTURE');

-- CreateEnum
CREATE TYPE "LegalDocumentType" AS ENUM ('USER_AGREEMENT', 'PRIVACY_POLICY');

-- CreateEnum
CREATE TYPE "LegalDocumentStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'RETIRED');

-- CreateTable
CREATE TABLE "administrative_division" (
    "code" VARCHAR(12) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "level" "AdministrativeDivisionLevel" NOT NULL,
    "parent_code" VARCHAR(12),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "administrative_division_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "enterprise_nature_tag" (
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "enterprise_nature_tag_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "industry_category" (
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "industry_category_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "tenant" (
    "id" UUID NOT NULL,
    "type" "TenantType" NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "university" (
    "tenant_id" UUID NOT NULL,
    "is_public_academy" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "university_pkey" PRIMARY KEY ("tenant_id")
);

-- CreateTable
CREATE TABLE "enterprise" (
    "tenant_id" UUID NOT NULL,
    "nature_tag_code" VARCHAR(50) NOT NULL,
    "industry_category_code" VARCHAR(50) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "enterprise_pkey" PRIMARY KEY ("tenant_id")
);

-- CreateTable
CREATE TABLE "government_office" (
    "tenant_id" UUID NOT NULL,
    "division_code" VARCHAR(12) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "government_office_pkey" PRIMARY KEY ("tenant_id")
);

-- CreateTable
CREATE TABLE "government_university_scope" (
    "government_tenant_id" UUID NOT NULL,
    "university_tenant_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "government_university_scope_pkey" PRIMARY KEY ("government_tenant_id","university_tenant_id")
);

-- CreateTable
CREATE TABLE "department" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campus" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "division_code" VARCHAR(12) NOT NULL,
    "is_system_managed" BOOLEAN NOT NULL DEFAULT false,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "campus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "college" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "college_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "college_campus" (
    "tenant_id" UUID NOT NULL,
    "college_id" UUID NOT NULL,
    "campus_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "college_campus_pkey" PRIMARY KEY ("college_id","campus_id")
);

-- CreateTable
CREATE TABLE "major" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "college_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "major_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "major_id" UUID NOT NULL,
    "counselor_membership_id" UUID,
    "name" VARCHAR(100) NOT NULL,
    "grade_label" VARCHAR(20) NOT NULL,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "class_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enterprise_location" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "division_code" VARCHAR(12) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enterprise_location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" UUID NOT NULL,
    "kind" "AccountKind" NOT NULL,
    "phone" VARCHAR(11),
    "username" VARCHAR(64),
    "password_hash" VARCHAR(255),
    "status" "AccountStatus" NOT NULL DEFAULT 'PENDING_ACTIVATION',
    "display_name" VARCHAR(100) NOT NULL,
    "gender" "Gender",
    "birth_date" DATE,
    "political_affiliation" VARCHAR(50),
    "profile_completed_at" TIMESTAMPTZ(3),
    "last_login_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membership" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "role" "MembershipRole" NOT NULL,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "department_id" UUID,
    "college_id" UUID,
    "major_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_profile" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "kind" "StudentKind" NOT NULL,
    "student_number" VARCHAR(50),
    "lifecycle_state" "StudentLifecycleState" NOT NULL DEFAULT 'ENROLLED',
    "class_id" UUID,
    "resident_city_code" VARCHAR(12),
    "registration_city_code" VARCHAR(12),
    "profile_frozen_until" TIMESTAMPTZ(3),
    "last_self_edited_at" TIMESTAMPTZ(3),
    "graduated_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "student_profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_session" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "csrf_token_hash" CHAR(64) NOT NULL,
    "device_summary" VARCHAR(255),
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "last_used_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "totp_credential" (
    "account_id" UUID NOT NULL,
    "secret_ciphertext" BYTEA NOT NULL,
    "secret_iv" BYTEA NOT NULL,
    "secret_auth_tag" BYTEA NOT NULL,
    "enabled_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "totp_credential_pkey" PRIMARY KEY ("account_id")
);

-- CreateTable
CREATE TABLE "totp_recovery_code" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "code_hash" VARCHAR(255) NOT NULL,
    "consumed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "totp_recovery_code_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legal_document_version" (
    "id" UUID NOT NULL,
    "type" "LegalDocumentType" NOT NULL,
    "version" VARCHAR(30) NOT NULL,
    "status" "LegalDocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "content_hash" CHAR(64) NOT NULL,
    "published_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "legal_document_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "protocol_consent" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "document_version_id" UUID NOT NULL,
    "source" VARCHAR(50) NOT NULL,
    "ip_address" VARCHAR(64),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "protocol_consent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_event" (
    "id" UUID NOT NULL,
    "tenant_id" UUID,
    "actor_account_id" UUID,
    "action" VARCHAR(100) NOT NULL,
    "target_type" VARCHAR(100) NOT NULL,
    "target_id" VARCHAR(100),
    "reason" TEXT,
    "request_id" VARCHAR(100),
    "before" JSONB,
    "after" JSONB,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "administrative_division_parent_code_idx" ON "administrative_division"("parent_code");

-- CreateIndex
CREATE UNIQUE INDEX "enterprise_nature_tag_name_key" ON "enterprise_nature_tag"("name");

-- CreateIndex
CREATE UNIQUE INDEX "industry_category_name_key" ON "industry_category"("name");

-- CreateIndex
CREATE INDEX "tenant_type_status_idx" ON "tenant"("type", "status");

-- CreateIndex
CREATE INDEX "enterprise_nature_tag_code_idx" ON "enterprise"("nature_tag_code");

-- CreateIndex
CREATE INDEX "enterprise_industry_category_code_idx" ON "enterprise"("industry_category_code");

-- CreateIndex
CREATE INDEX "government_office_division_code_idx" ON "government_office"("division_code");

-- CreateIndex
CREATE INDEX "government_university_scope_university_tenant_id_idx" ON "government_university_scope"("university_tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "department_tenant_id_name_key" ON "department"("tenant_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "department_id_tenant_id_key" ON "department"("id", "tenant_id");

-- CreateIndex
CREATE INDEX "campus_division_code_idx" ON "campus"("division_code");

-- CreateIndex
CREATE UNIQUE INDEX "campus_tenant_id_name_key" ON "campus"("tenant_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "campus_id_tenant_id_key" ON "campus"("id", "tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "college_tenant_id_name_key" ON "college"("tenant_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "college_id_tenant_id_key" ON "college"("id", "tenant_id");

-- CreateIndex
CREATE INDEX "college_campus_tenant_id_campus_id_idx" ON "college_campus"("tenant_id", "campus_id");

-- CreateIndex
CREATE UNIQUE INDEX "college_campus_tenant_id_college_id_sort_order_key" ON "college_campus"("tenant_id", "college_id", "sort_order");

-- CreateIndex
CREATE INDEX "major_tenant_id_idx" ON "major"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "major_college_id_name_key" ON "major"("college_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "major_id_tenant_id_key" ON "major"("id", "tenant_id");

-- CreateIndex
CREATE INDEX "class_tenant_id_counselor_membership_id_idx" ON "class"("tenant_id", "counselor_membership_id");

-- CreateIndex
CREATE UNIQUE INDEX "class_major_id_name_key" ON "class"("major_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "class_id_tenant_id_key" ON "class"("id", "tenant_id");

-- CreateIndex
CREATE INDEX "enterprise_location_division_code_idx" ON "enterprise_location"("division_code");

-- CreateIndex
CREATE UNIQUE INDEX "enterprise_location_tenant_id_division_code_key" ON "enterprise_location"("tenant_id", "division_code");

-- CreateIndex
CREATE UNIQUE INDEX "account_phone_key" ON "account"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "account_username_key" ON "account"("username");

-- CreateIndex
CREATE INDEX "account_status_idx" ON "account"("status");

-- CreateIndex
CREATE UNIQUE INDEX "membership_account_id_key" ON "membership"("account_id");

-- CreateIndex
CREATE INDEX "membership_tenant_id_role_status_idx" ON "membership"("tenant_id", "role", "status");

-- CreateIndex
CREATE UNIQUE INDEX "membership_id_tenant_id_key" ON "membership"("id", "tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "student_profile_account_id_key" ON "student_profile"("account_id");

-- CreateIndex
CREATE INDEX "student_profile_tenant_id_lifecycle_state_graduated_at_idx" ON "student_profile"("tenant_id", "lifecycle_state", "graduated_at");

-- CreateIndex
CREATE INDEX "student_profile_class_id_idx" ON "student_profile"("class_id");

-- CreateIndex
CREATE UNIQUE INDEX "student_profile_tenant_id_student_number_key" ON "student_profile"("tenant_id", "student_number");

-- CreateIndex
CREATE UNIQUE INDEX "auth_session_token_hash_key" ON "auth_session"("token_hash");

-- CreateIndex
CREATE INDEX "auth_session_account_id_expires_at_idx" ON "auth_session"("account_id", "expires_at");

-- CreateIndex
CREATE INDEX "auth_session_expires_at_revoked_at_idx" ON "auth_session"("expires_at", "revoked_at");

-- CreateIndex
CREATE INDEX "totp_recovery_code_account_id_consumed_at_idx" ON "totp_recovery_code"("account_id", "consumed_at");

-- CreateIndex
CREATE UNIQUE INDEX "totp_recovery_code_account_id_code_hash_key" ON "totp_recovery_code"("account_id", "code_hash");

-- CreateIndex
CREATE INDEX "legal_document_version_type_status_idx" ON "legal_document_version"("type", "status");

-- CreateIndex
CREATE UNIQUE INDEX "legal_document_version_type_version_key" ON "legal_document_version"("type", "version");

-- CreateIndex
CREATE INDEX "protocol_consent_document_version_id_idx" ON "protocol_consent"("document_version_id");

-- CreateIndex
CREATE UNIQUE INDEX "protocol_consent_account_id_document_version_id_key" ON "protocol_consent"("account_id", "document_version_id");

-- CreateIndex
CREATE INDEX "audit_event_tenant_id_occurred_at_idx" ON "audit_event"("tenant_id", "occurred_at");

-- CreateIndex
CREATE INDEX "audit_event_actor_account_id_occurred_at_idx" ON "audit_event"("actor_account_id", "occurred_at");

-- CreateIndex
CREATE INDEX "audit_event_target_type_target_id_idx" ON "audit_event"("target_type", "target_id");

-- AddForeignKey
ALTER TABLE "administrative_division" ADD CONSTRAINT "administrative_division_parent_code_fkey" FOREIGN KEY ("parent_code") REFERENCES "administrative_division"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "university" ADD CONSTRAINT "university_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enterprise" ADD CONSTRAINT "enterprise_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enterprise" ADD CONSTRAINT "enterprise_nature_tag_code_fkey" FOREIGN KEY ("nature_tag_code") REFERENCES "enterprise_nature_tag"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enterprise" ADD CONSTRAINT "enterprise_industry_category_code_fkey" FOREIGN KEY ("industry_category_code") REFERENCES "industry_category"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "government_office" ADD CONSTRAINT "government_office_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "government_office" ADD CONSTRAINT "government_office_division_code_fkey" FOREIGN KEY ("division_code") REFERENCES "administrative_division"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "government_university_scope" ADD CONSTRAINT "government_university_scope_government_tenant_id_fkey" FOREIGN KEY ("government_tenant_id") REFERENCES "government_office"("tenant_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "government_university_scope" ADD CONSTRAINT "government_university_scope_university_tenant_id_fkey" FOREIGN KEY ("university_tenant_id") REFERENCES "university"("tenant_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "department" ADD CONSTRAINT "department_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campus" ADD CONSTRAINT "campus_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campus" ADD CONSTRAINT "campus_division_code_fkey" FOREIGN KEY ("division_code") REFERENCES "administrative_division"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "college" ADD CONSTRAINT "college_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "college_campus" ADD CONSTRAINT "college_campus_college_id_tenant_id_fkey" FOREIGN KEY ("college_id", "tenant_id") REFERENCES "college"("id", "tenant_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "college_campus" ADD CONSTRAINT "college_campus_campus_id_tenant_id_fkey" FOREIGN KEY ("campus_id", "tenant_id") REFERENCES "campus"("id", "tenant_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "major" ADD CONSTRAINT "major_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "major" ADD CONSTRAINT "major_college_id_tenant_id_fkey" FOREIGN KEY ("college_id", "tenant_id") REFERENCES "college"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class" ADD CONSTRAINT "class_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class" ADD CONSTRAINT "class_major_id_tenant_id_fkey" FOREIGN KEY ("major_id", "tenant_id") REFERENCES "major"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class" ADD CONSTRAINT "class_counselor_membership_id_tenant_id_fkey" FOREIGN KEY ("counselor_membership_id", "tenant_id") REFERENCES "membership"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enterprise_location" ADD CONSTRAINT "enterprise_location_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "enterprise"("tenant_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enterprise_location" ADD CONSTRAINT "enterprise_location_division_code_fkey" FOREIGN KEY ("division_code") REFERENCES "administrative_division"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership" ADD CONSTRAINT "membership_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership" ADD CONSTRAINT "membership_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership" ADD CONSTRAINT "membership_department_id_tenant_id_fkey" FOREIGN KEY ("department_id", "tenant_id") REFERENCES "department"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership" ADD CONSTRAINT "membership_college_id_tenant_id_fkey" FOREIGN KEY ("college_id", "tenant_id") REFERENCES "college"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership" ADD CONSTRAINT "membership_major_id_tenant_id_fkey" FOREIGN KEY ("major_id", "tenant_id") REFERENCES "major"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_profile" ADD CONSTRAINT "student_profile_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_profile" ADD CONSTRAINT "student_profile_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_profile" ADD CONSTRAINT "student_profile_class_id_tenant_id_fkey" FOREIGN KEY ("class_id", "tenant_id") REFERENCES "class"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_profile" ADD CONSTRAINT "student_profile_resident_city_code_fkey" FOREIGN KEY ("resident_city_code") REFERENCES "administrative_division"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_profile" ADD CONSTRAINT "student_profile_registration_city_code_fkey" FOREIGN KEY ("registration_city_code") REFERENCES "administrative_division"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_session" ADD CONSTRAINT "auth_session_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "totp_credential" ADD CONSTRAINT "totp_credential_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "totp_recovery_code" ADD CONSTRAINT "totp_recovery_code_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "protocol_consent" ADD CONSTRAINT "protocol_consent_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "protocol_consent" ADD CONSTRAINT "protocol_consent_document_version_id_fkey" FOREIGN KEY ("document_version_id") REFERENCES "legal_document_version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_actor_account_id_fkey" FOREIGN KEY ("actor_account_id") REFERENCES "account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

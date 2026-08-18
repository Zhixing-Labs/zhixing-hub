-- Identity / Organization invariants that Prisma schema cannot express directly.

ALTER TABLE "account"
ADD CONSTRAINT "account_credential_shape_check"
CHECK (
  (
    "kind" = 'PLATFORM_ADMIN'
    AND "phone" IS NULL
    AND "username" IS NOT NULL
  )
  OR
  (
    "kind" = 'END_USER'
    AND "phone" IS NOT NULL
    AND "username" IS NULL
  )
);

ALTER TABLE "account"
ADD CONSTRAINT "account_phone_format_check"
CHECK (
  "phone" IS NULL
  OR "phone" ~ '^1[3-9][0-9]{9}$'
);

ALTER TABLE "student_profile"
ADD CONSTRAINT "student_profile_kind_shape_check"
CHECK (
  (
    "kind" = 'UNIVERSITY_CERTIFIED'
    AND "student_number" IS NOT NULL
    AND "class_id" IS NOT NULL
    AND "registration_city_code" IS NULL
  )
  OR
  (
    "kind" = 'PLATFORM'
    AND "student_number" IS NULL
    AND "class_id" IS NULL
    AND "registration_city_code" IS NOT NULL
    AND "resident_city_code" IS NOT NULL
  )
);

ALTER TABLE "college_campus"
ADD CONSTRAINT "college_campus_sort_order_check"
CHECK ("sort_order" >= 0);

ALTER TABLE "enterprise_nature_tag"
ADD CONSTRAINT "enterprise_nature_tag_sort_order_check"
CHECK ("sort_order" >= 0);

ALTER TABLE "legal_document_version"
ADD CONSTRAINT "legal_document_publish_shape_check"
CHECK (
  ("status" = 'PUBLISHED' AND "published_at" IS NOT NULL)
  OR ("status" <> 'PUBLISHED')
);

CREATE UNIQUE INDEX "membership_single_active_super_admin"
ON "membership" ("role")
WHERE "role" = 'SUPER_ADMIN' AND "status" = 'ACTIVE';

CREATE UNIQUE INDEX "university_single_public_academy"
ON "university" ("is_public_academy")
WHERE "is_public_academy" = true;

CREATE UNIQUE INDEX "campus_system_managed_city_key"
ON "campus" ("tenant_id", "division_code")
WHERE "is_system_managed" = true;

CREATE UNIQUE INDEX "legal_document_single_published_type"
ON "legal_document_version" ("type")
WHERE "status" = 'PUBLISHED';

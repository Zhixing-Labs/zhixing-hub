-- 行政区划首批种子（《06》第 3 节：省 + 地级市）。完整全国字典由运营后续扩展，不在业务模块写入。
INSERT INTO "administrative_division"
  ("code", "name", "level", "parent_code", "active", "created_at", "updated_at")
VALUES
  ('110000', '北京市', 'PROVINCE', NULL, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('110100', '北京市', 'PREFECTURE', '110000', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('640000', '宁夏回族自治区', 'PROVINCE', NULL, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('640100', '银川市', 'PREFECTURE', '640000', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('640200', '石嘴山市', 'PREFECTURE', '640000', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('640300', '吴忠市', 'PREFECTURE', '640000', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('640400', '固原市', 'PREFECTURE', '640000', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('640500', '中卫市', 'PREFECTURE', '640000', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO UPDATE
SET
  "name" = EXCLUDED."name",
  "level" = EXCLUDED."level",
  "parent_code" = EXCLUDED."parent_code",
  "active" = EXCLUDED."active",
  "updated_at" = CURRENT_TIMESTAMP;

CREATE OR REPLACE FUNCTION enforce_membership_identity_boundary()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  account_kind "AccountKind";
  tenant_type "TenantType";
BEGIN
  SELECT "kind" INTO account_kind
  FROM "account"
  WHERE "id" = NEW."account_id";

  SELECT "type" INTO tenant_type
  FROM "tenant"
  WHERE "id" = NEW."tenant_id";

  IF NEW."role" IN (
    'SUPER_ADMIN',
    'ORGANIZATION_ADMIN',
    'OPERATIONS_SPECIALIST',
    'PLATFORM_DASHBOARD'
  ) THEN
    IF account_kind <> 'PLATFORM_ADMIN' OR tenant_type <> 'PLATFORM' THEN
      RAISE EXCEPTION 'platform roles require a PLATFORM_ADMIN account in the PLATFORM tenant'
        USING ERRCODE = '23514';
    END IF;
  ELSIF NEW."role" IN (
    'UNIVERSITY_ADMIN',
    'COLLEGE_ADMIN',
    'PROGRAM_LEAD',
    'COUNSELOR',
    'STUDENT',
    'UNIVERSITY_DASHBOARD'
  ) THEN
    IF account_kind <> 'END_USER' OR tenant_type <> 'UNIVERSITY' THEN
      RAISE EXCEPTION 'university roles require an END_USER account in a UNIVERSITY tenant'
        USING ERRCODE = '23514';
    END IF;
  ELSIF NEW."role" IN (
    'ENTERPRISE_ADMIN',
    'HR',
    'PROJECT_LEAD',
    'MENTOR',
    'ENTERPRISE_DASHBOARD'
  ) THEN
    IF account_kind <> 'END_USER' OR tenant_type <> 'ENTERPRISE' THEN
      RAISE EXCEPTION 'enterprise roles require an END_USER account in an ENTERPRISE tenant'
        USING ERRCODE = '23514';
    END IF;
  ELSIF NEW."role" IN (
    'GOVERNMENT_DASHBOARD_ADMIN',
    'GOVERNMENT_DASHBOARD'
  ) THEN
    IF account_kind <> 'END_USER' OR tenant_type <> 'GOVERNMENT' THEN
      RAISE EXCEPTION 'government roles require an END_USER account in a GOVERNMENT tenant'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW."role" IN ('UNIVERSITY_ADMIN', 'UNIVERSITY_DASHBOARD') THEN
    IF NEW."college_id" IS NOT NULL
      OR NEW."major_id" IS NOT NULL
      OR NEW."department_id" IS NOT NULL THEN
      RAISE EXCEPTION 'university-wide roles cannot attach to a college, major, or department'
        USING ERRCODE = '23514';
    END IF;
  ELSIF NEW."role" IN ('COLLEGE_ADMIN', 'PROGRAM_LEAD', 'COUNSELOR') THEN
    IF NEW."college_id" IS NULL
      OR NEW."major_id" IS NOT NULL
      OR NEW."department_id" IS NOT NULL THEN
      RAISE EXCEPTION 'college-scoped roles require a college and no major or department'
        USING ERRCODE = '23514';
    END IF;
  ELSIF NEW."role" = 'STUDENT' THEN
    IF NEW."department_id" IS NOT NULL THEN
      RAISE EXCEPTION 'student membership cannot attach to a department'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "membership_identity_boundary" ON "membership";
CREATE TRIGGER "membership_identity_boundary"
BEFORE INSERT OR UPDATE OF "account_id", "tenant_id", "role", "college_id", "major_id", "department_id"
ON "membership"
FOR EACH ROW
EXECUTE FUNCTION enforce_membership_identity_boundary();

CREATE OR REPLACE FUNCTION enforce_class_counselor_boundary()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  counselor_role "MembershipRole";
  counselor_college UUID;
  counselor_status "RecordStatus";
  major_college UUID;
BEGIN
  IF NEW."counselor_membership_id" IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT "role", "college_id", "status"
  INTO counselor_role, counselor_college, counselor_status
  FROM "membership"
  WHERE "id" = NEW."counselor_membership_id"
    AND "tenant_id" = NEW."tenant_id";

  IF counselor_role IS NULL THEN
    RAISE EXCEPTION 'class counselor must belong to the same tenant'
      USING ERRCODE = '23514';
  END IF;

  IF counselor_role <> 'COUNSELOR' OR counselor_status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'class counselor must be an active COUNSELOR'
      USING ERRCODE = '23514';
  END IF;

  SELECT "college_id" INTO major_college
  FROM "major"
  WHERE "id" = NEW."major_id"
    AND "tenant_id" = NEW."tenant_id";

  IF counselor_college IS DISTINCT FROM major_college THEN
    RAISE EXCEPTION 'class counselor must belong to the class college'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "class_counselor_boundary" ON "class";
CREATE TRIGGER "class_counselor_boundary"
BEFORE INSERT OR UPDATE OF "counselor_membership_id", "major_id", "tenant_id"
ON "class"
FOR EACH ROW
EXECUTE FUNCTION enforce_class_counselor_boundary();

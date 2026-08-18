-- 院辖挂靠与班级辅导员资格由应用服务保证，不再用触发器重复同一条业务规则。
-- 角色 × 主体种类边界仍保留（账号 kind 与租户 type，属于身份结构而非院务规则）。

DROP TRIGGER IF EXISTS "class_counselor_boundary" ON "class";
DROP FUNCTION IF EXISTS enforce_class_counselor_boundary();

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

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "membership_identity_boundary" ON "membership";
CREATE TRIGGER "membership_identity_boundary"
BEFORE INSERT OR UPDATE OF "account_id", "tenant_id", "role"
ON "membership"
FOR EACH ROW
EXECUTE FUNCTION enforce_membership_identity_boundary();

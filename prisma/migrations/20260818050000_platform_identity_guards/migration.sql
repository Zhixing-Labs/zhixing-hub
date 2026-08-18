-- Platform identity hardening and base product dictionaries.

ALTER TABLE "totp_credential"
ADD COLUMN "last_used_time_step" INTEGER;

CREATE UNIQUE INDEX "tenant_type_name_key"
ON "tenant" ("type", "name");

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

CREATE TRIGGER "membership_identity_boundary"
BEFORE INSERT OR UPDATE OF "account_id", "tenant_id", "role"
ON "membership"
FOR EACH ROW
EXECUTE FUNCTION enforce_membership_identity_boundary();

CREATE OR REPLACE FUNCTION prevent_identity_boundary_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_TABLE_NAME = 'account' AND OLD."kind" <> NEW."kind" THEN
    RAISE EXCEPTION 'account kind is immutable'
      USING ERRCODE = '23514';
  END IF;

  IF TG_TABLE_NAME = 'tenant' AND OLD."type" <> NEW."type" THEN
    RAISE EXCEPTION 'tenant type is immutable'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "account_kind_immutable"
BEFORE UPDATE OF "kind"
ON "account"
FOR EACH ROW
EXECUTE FUNCTION prevent_identity_boundary_mutation();

CREATE TRIGGER "tenant_type_immutable"
BEFORE UPDATE OF "type"
ON "tenant"
FOR EACH ROW
EXECUTE FUNCTION prevent_identity_boundary_mutation();

INSERT INTO "enterprise_nature_tag"
  ("code", "name", "sort_order", "active", "created_at", "updated_at")
VALUES
  ('CENTRAL_SOE', '央企', 10, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('STATE_OWNED', '国企', 20, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('LISTED', '上市公司', 30, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('SPECIALIZED_SME', '专精特新', 40, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('GENERAL', '一般企业', 50, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO UPDATE
SET
  "name" = EXCLUDED."name",
  "sort_order" = EXCLUDED."sort_order",
  "active" = EXCLUDED."active",
  "updated_at" = CURRENT_TIMESTAMP;

INSERT INTO "industry_category"
  ("code", "name", "active", "created_at", "updated_at")
VALUES
  ('A', '农、林、牧、渔业', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('B', '采矿业', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('C', '制造业', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('D', '电力、热力、燃气及水生产和供应业', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('E', '建筑业', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('F', '批发和零售业', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('G', '交通运输、仓储和邮政业', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('H', '住宿和餐饮业', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('I', '信息传输、软件和信息技术服务业', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('J', '金融业', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('K', '房地产业', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('L', '租赁和商务服务业', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('M', '科学研究和技术服务业', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('N', '水利、环境和公共设施管理业', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('O', '居民服务、修理和其他服务业', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('P', '教育', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('Q', '卫生和社会工作', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('R', '文化、体育和娱乐业', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('S', '公共管理、社会保障和社会组织', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('T', '国际组织', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO UPDATE
SET
  "name" = EXCLUDED."name",
  "active" = EXCLUDED."active",
  "updated_at" = CURRENT_TIMESTAMP;

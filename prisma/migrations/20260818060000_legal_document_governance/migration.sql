-- Editable legal document drafts and audited publication metadata.

ALTER TABLE "legal_document_version"
ADD COLUMN "content" TEXT NOT NULL DEFAULT '',
ADD COLUMN "created_by_account_id" UUID,
ADD COLUMN "published_by_account_id" UUID,
ADD COLUMN "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "legal_document_version_created_by_account_id_idx"
ON "legal_document_version" ("created_by_account_id");

CREATE INDEX "legal_document_version_published_by_account_id_idx"
ON "legal_document_version" ("published_by_account_id");

ALTER TABLE "legal_document_version"
ADD CONSTRAINT "legal_document_version_created_by_account_id_fkey"
FOREIGN KEY ("created_by_account_id")
REFERENCES "account" ("id")
ON DELETE SET NULL
ON UPDATE CASCADE;

ALTER TABLE "legal_document_version"
ADD CONSTRAINT "legal_document_version_published_by_account_id_fkey"
FOREIGN KEY ("published_by_account_id")
REFERENCES "account" ("id")
ON DELETE SET NULL
ON UPDATE CASCADE;

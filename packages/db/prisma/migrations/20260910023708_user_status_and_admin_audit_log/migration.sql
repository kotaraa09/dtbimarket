-- CreateEnum
CREATE TYPE "user_status" AS ENUM ('active', 'suspended', 'anonymised');

-- CreateEnum
CREATE TYPE "admin_target_type" AS ENUM ('user');

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "status" "user_status" NOT NULL DEFAULT 'active';

-- CreateTable
CREATE TABLE "admin_audit_log" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "target_type" "admin_target_type",
    "target_id" TEXT,
    "request_id" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,
    "is_seed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "admin_audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "admin_audit_log_actor_id_occurred_at_idx" ON "admin_audit_log"("actor_id", "occurred_at");

-- CreateIndex
CREATE INDEX "admin_audit_log_occurred_at_idx" ON "admin_audit_log"("occurred_at");

-- CreateIndex
CREATE INDEX "admin_audit_log_action_idx" ON "admin_audit_log"("action");

-- CreateIndex
CREATE INDEX "user_status_idx" ON "user"("status");

-- ---------------------------------------------------------------------------
-- Append-only enforcement for admin_audit_log
-- ---------------------------------------------------------------------------
--
-- Created in the same migration as the table, so there is no window in which
-- the audit trail is editable.
--
-- The point of this trail is that an administrator cannot erase it. A grant
-- would not achieve that: a table's owner bypasses its own grants, and in
-- local development and simple managed-Postgres setups the application
-- connects as the owner. A trigger is checked whoever is connected.
--
-- Same reasoning and same technique as event_append_only; a separate function
-- so that migration stays untouched and each table's error names itself.

CREATE OR REPLACE FUNCTION admin_audit_log_is_append_only()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION
    'admin_audit_log is append-only: % is not permitted (ADR-0005). An operator must not be able to edit or erase their own audit trail.',
    TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;

DROP TRIGGER IF EXISTS admin_audit_log_no_update ON "admin_audit_log";
CREATE TRIGGER admin_audit_log_no_update
  BEFORE UPDATE ON "admin_audit_log"
  FOR EACH ROW EXECUTE FUNCTION admin_audit_log_is_append_only();

DROP TRIGGER IF EXISTS admin_audit_log_no_delete ON "admin_audit_log";
CREATE TRIGGER admin_audit_log_no_delete
  BEFORE DELETE ON "admin_audit_log"
  FOR EACH ROW EXECUTE FUNCTION admin_audit_log_is_append_only();

-- Belt and braces for deployments that use a dedicated application role.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dtbi_app') THEN
    REVOKE UPDATE, DELETE, TRUNCATE ON "admin_audit_log" FROM dtbi_app;
    GRANT INSERT, SELECT ON "admin_audit_log" TO dtbi_app;
  END IF;
END;
$$;

-- Append-only enforcement for the event table.
--
-- ADR-0001 requires this in three places: one insert path in the application,
-- no UPDATE or DELETE grant for the application's database role, and no
-- migration that rewrites rows.
--
-- Grants alone do not hold in every environment we actually run in. A table's
-- owner bypasses its grants, and in local development and in the simplest
-- managed-Postgres setups the application connects as the owner. A trigger is
-- checked regardless of who is connected, so it is the mechanism that is
-- genuinely always on. The role grants below are applied additionally, when a
-- separate application role exists.
--
-- This does not weaken ADR-0001; it is how enforcement point 2 is implemented
-- so that it also holds for a superuser connection.
--
-- Note what is NOT blocked: DROP and TRUNCATE. `prisma migrate reset` drops the
-- schema, so a developer can still start from a clean database.

CREATE OR REPLACE FUNCTION event_is_append_only()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION
    'event is append-only: % is not permitted (CLAUDE.md rule 2, ADR-0001). Add a new event type instead of rewriting a row.',
    TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;

DROP TRIGGER IF EXISTS event_no_update ON "event";
CREATE TRIGGER event_no_update
  BEFORE UPDATE ON "event"
  FOR EACH ROW EXECUTE FUNCTION event_is_append_only();

DROP TRIGGER IF EXISTS event_no_delete ON "event";
CREATE TRIGGER event_no_delete
  BEFORE DELETE ON "event"
  FOR EACH ROW EXECUTE FUNCTION event_is_append_only();

-- Enforcement point 2, for deployments that use a dedicated application role.
-- Skipped silently when the role does not exist, so this migration still runs
-- against an empty local database.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dtbi_app') THEN
    REVOKE UPDATE, DELETE, TRUNCATE ON "event" FROM dtbi_app;
    GRANT INSERT, SELECT ON "event" TO dtbi_app;
  END IF;
END;
$$;

---
name: db-change
description: Safely change the Prisma schema in this repository, with hard protection for the append-only research tables. Use whenever the user asks to add, rename, remove, or alter any database field, model, relation, index, or migration, or mentions changing the data model in any way.
---

# Database change

Most schema changes here are ordinary. Three tables are not.

## The protected tables

`Event`, `Assignment`, `Recommendation`.

These hold the study. They are append-only: rows are written once and never updated, never deleted, never rewritten by a migration.

**If a requested change touches any of them, stop and ask the owner before writing anything.** Not because the change is necessarily wrong, but because the consequences do not surface until analysis, months later, when there is nothing left to recover. There is no backup that helps once a semester of collection is gone.

Safe on protected tables: adding a nullable column, adding an index.

Requires asking: renaming a column, changing a type, adding a `NOT NULL` column, anything with a data backfill, anything that drops.

Never, under any circumstances: `DROP TABLE`, `DELETE FROM`, `UPDATE` on historical rows, or a migration that rewrites past data into a new shape. If old rows do not fit a new shape, add a new column or a new event type and leave the old rows exactly as they are.

## Sequence for an ordinary change

1. **Name what breaks.** Which code reads this field today? An unused field is easy; a field read in three places and one analysis query is not.

2. **Edit `packages/db/schema.prisma`.** Prefer additive changes. A nullable column added today costs nothing; a renamed column costs every reader.

3. **Generate and read the migration.** Read the generated SQL before running it. Look for `DROP`, `DELETE`, `UPDATE`, and any implicit type coercion.

4. **Run against a clean database.** `pnpm db:migrate` on a fresh database, not only on your current one. Migrations that depend on the state of your local machine fail on deployment.

5. **Update the types** in `packages/shared`, and every reader found in step 1.

6. **Check the analysis.** If any query in `analysis/` reads this table, run it. A schema change that silently changes what a research query returns is the worst outcome available here, because it produces numbers that look fine.

7. **Log it** in `docs/06-log/`. If it was irreversible, write an ADR in `docs/02-design/decisions/`.

## Report back

State which tables were touched, whether any were protected, and paste the migration SQL. If a protected table was involved, do not run the migration — present the plan and wait.

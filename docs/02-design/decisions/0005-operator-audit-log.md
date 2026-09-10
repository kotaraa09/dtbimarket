# 0005 — A separate append-only audit log for operator actions

**Status:** accepted
**Date:** 2026-09-10
**Context:** CLAUDE.md rules 1 and 2, ADR-0001, REQ-A4, REQ-N21, REQ-N2, ACT-3
**Supersedes:** nothing, but it corrects a decision that was very nearly made

## Context

The administrator area (ACT-3) had to exist before roles could mean anything. Its purpose is REQ-N21: answering a PDPA request, which means looking up what personal data is held about a person and erasing it when they ask. Its ordinary work is therefore **reading other people's personal data**.

The question was where an admin's actions get recorded. `Event` is the obvious candidate, since CLAUDE.md rule 1 says every user-facing action emits an event, and suspending an account is unmistakably an action.

## The decision that was nearly made, and why it was wrong

The first proposal was to keep admin actions out of `Event` and let the `User` row be the record — a `status` column plus `statusChangedAt` and `statusChangedById`. It kept operator activity out of the study's data, it touched no protected table, and it had a precedent: ADR-0001 argues that if assignment ever needs an audit trail, it belongs in `Assignment` rather than in `Event`.

The owner asked one question: *if an admin account is compromised, can we still trace what was done?*

The honest answer was no, and the reasons are worth writing down because they generalise:

- **Reads leave nothing.** The whole point of the admin area is reading personal data. A compromised account could page through every seller's email address and contact channel and there would be no record it had happened — a breach that cannot be scoped, and therefore cannot be notified accurately, which is itself a PDPA failure.
- **Single columns are overwritten.** Suspend fifty accounts, reinstate them, and all that survives is `status = active` and whichever admin touched it last. The suspensions vanish.
- **A mutable row is not a trail.** It records the present, not the past.

The mistake in the original proposal was conflating two separate things: *do not pollute the research data* and *do not record it anywhere*. Only the first was justified.

## Decision

**Operator actions go to a separate, append-only `AdminAuditLog` table.**

- **Separate from `Event`.** `Event` measures the behaviour of research subjects; an administrator is ACT-3, the researcher. Mixing them means every analysis query must exclude `actor_type = 'admin'`, and the query that forgets produces a quietly wrong number months later. The protected table is not touched at all — no migration, no new enum value.
- **Append-only, by trigger.** Same technique as `event`: `BEFORE UPDATE OR DELETE` raising an exception. Grants alone would not do, because a table's owner bypasses its own grants and locally the application connects as the owner. An operator must not be able to erase their own trail whatever role they connect as.
- **Reads are recorded, not only writes.** `admin.users_listed`, `admin.user_viewed` and `admin.audit_viewed` are in the vocabulary alongside the mutations. This is the property the whole table exists for.
- **Metadata is an allowlist per action**, the same shape as event payloads, holding IDs, counts, statuses and **field names** — `"email,display_name"`, never the address itself. An audit trail that copies the data it protects has doubled the problem rather than solved it.
- **No foreign key on `actorId`**, matching `Event`: an audit entry is a historical fact, and deleting a user must not cascade away the record of what that user did.
- **One insert path**, `writeAudit`, with no update or delete path anywhere. A write action passes the transaction that performs it, so the change and its record commit together.

## Alternatives considered

**Add `admin` to the `ActorType` enum and use `Event`.** Rule 1 would hold uniformly with no exception to remember, and it is one table instead of two. The migration is additive and rewrites nothing. Rejected because it puts operator activity into the measurement instrument: every analysis query acquires a filter it must not forget, and the failure mode is a plausible-looking wrong number rather than an error. It also changes the shape of a protected table for a need that is not measurement.

**The `User` row alone.** Described above. Rejected once the compromise question was asked.

**Both — `User` row now, events later.** Rejected: it defers the decision precisely until admin actions exist and have accumulated no trail, which is when it is least recoverable.

**Application logs instead of a table.** Structured logs already carry a request ID. Rejected: logs rotate, they are not queryable as a record, and nothing stops an operator with host access from editing them. A table with a trigger is checkable.

## Consequences

**Rule 1 has one recorded exception.** Admin actions do not write to `Event`. They write to `AdminAuditLog` instead, so nothing goes unrecorded — the exception is about *which* table, not about *whether*. Written into `feature-list.md` alongside FEAT-A3's "emits nothing on purpose" so it is not re-litigated.

**Two vocabularies to keep straight.** `EVENT_TYPES` and `ADMIN_ACTIONS` are separate lists in `packages/shared`, each with its own metadata allowlist. Someone adding an admin capability must add its action, and the guard throws on an unknown one rather than writing a row nobody can interpret.

**The audit log will grow with every admin page view.** It holds IDs and counts only, so it is small, and it has no retention policy yet. Noted rather than solved.

**An admin can read the trail but not change it.** `GET /admin/audit` exists, and reading it is itself audited. Being able to see the trail does not weaken it: the database refuses `UPDATE` and `DELETE` regardless of connection.

**What this does not protect against.** Someone with direct database credentials and the right to drop triggers. The trigger stops an administrator acting through the application, which is the threat this addresses; it is not a defence against a compromised database server. Backups are the answer there, and REQ-N35 already requires a tested restore.

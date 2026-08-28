# 0001 — Append-only event store, written inside the action's transaction

**Status:** accepted
**Date:** 2026-08-28
**Context:** `CLAUDE.md` rules 1 and 2, `../detailed-design.md`, `../../04-testing/test-specs/TS-01-recommendation-to-action.md`

## Context

The 7-day action rate is computed by joining `Recommendation` to `Event`. Events therefore are not diagnostics — they are the measurement instrument of the thesis. They cannot be backfilled, because the fact they record has already happened and left no other trace, and the study window is fixed to the university calendar.

Two questions had to be settled before the first feature: how strongly the table is protected from modification, and at what moment an event is written.

## Decision

**The `event` table is append-only, enforced in three places.**

1. The application has exactly one insert path (`emitEvent`) and no update or delete path anywhere.
2. The database role used by the application is granted `INSERT` and `SELECT` on `event` — not `UPDATE`, not `DELETE`.
3. No migration may modify existing event rows. A change of shape is a new event type, never a rewrite of old ones.

**An event is written inside the same database transaction as the action it describes.**

```
BEGIN
  INSERT ProductPhoto …
  INSERT Event product.photo_added …
COMMIT
```

## Alternatives considered

**Emit after the transaction commits.** The natural reading of "emit on success". Rejected: it opens a window in which the action is committed and the event is not — a crash, a dropped connection, a recycled container. The seller acted and the study scores it as ignored. The failure is invisible, unrecoverable, and biased toward whichever moments the platform was under stress.

**Emit to a queue and persist asynchronously.** Standard at scale, and it survives a database outage. Rejected: it adds a broker to a solo project, and it converts a lost event from impossible into unlikely-but-silent. Unlikely-but-silent is the failure mode this whole repository is organised against.

**Allow deletes for correcting mistakes.** Rejected: the correction that seems obviously right in October is indistinguishable, in March, from tampering with the data behind the result. An append-only table means the raw record can always be shown.

## Consequences

**Accepted cost.** The event insert participates in the transaction, so a slow event write slows the action. At this scale that is a rounding error.

**Accepted cost.** File storage is not transactional. A stored file whose transaction then rolls back leaves an orphan in the bucket. An orphaned file is a cleanup job; a missing event is a permanently wrong number in the thesis, so the trade is one-sided.

**Consequence for PDPA.** Because events reference people by ID and hold no personal data, deleting a person's account never requires deleting events. Append-only and the right to erasure coexist only because of that rule, which makes REQ-N2 a structural requirement rather than a hygiene one.

**Consequence for corrections.** A wrong event type or a wrong payload cannot be fixed in place. The remedy is a new event type and an explicit note in `docs/06-log/` and in the analysis, so the correction is visible in the record rather than hidden in it.

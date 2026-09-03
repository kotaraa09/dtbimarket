# 04-testing

See `docs/README.md` for what belongs in this folder.

| Path | What it holds |
|---|---|
| `test-specs/` | One spec per journey or critical feature (TS-*): cases, manual scripts, exit criteria, known gaps |

Test specs here concentrate on failures that produce a plausible result rather than an error — re-rolled assignment, an event that never fires, an `action_type` with no matching event type. Those cost a semester and are invisible on screen. Cases that only assert a framework works do not belong here.

Every spec ends with known gaps. A gap that is written down is a decision; a gap that is not is a surprise during analysis.

| Spec | Tests |
|---|---|
| `TS-01-recommendation-to-action.md` | UJ-01 — recommendation delivery, assignment stability, the 7-day action join, PDPA |

## Known gaps

Recorded here rather than left to be discovered. A gap that is written down is a
decision; a gap that is not is a surprise.

| Gap | Why it exists | Risk |
|---|---|---|
| The S3 storage driver is not covered by automated tests | The suite runs against the `memory` driver so it needs no bucket and stays fast. The `s3` driver is exercised manually against MinIO — upload, thumbnail render, delete, and the row/object reconciliation | A change to `storage.ts` could pass every test and still fail against a real bucket. Re-check manually after touching it |
| Rate limiting (REQ-N26) is specified but not implemented | Not yet built | Auth endpoints are unthrottled |
| No test asserts the orphaned-object cleanup (ADR-0004) | There is no cleanup job yet | Orphans accumulate slowly; harmless until they are not |

## Test databases

Integration tests run against `dtbimarket_test`, never the development database,
so a test run cannot write event rows into the data used for demos. Setup is in
`docs/08-operations/local-development.md`.

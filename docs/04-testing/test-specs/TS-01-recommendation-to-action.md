# TS-01 — Recommendation to action

**Status:** draft
**Written:** 2026-08-28
**Tests:** `docs/02-design/user-journeys/UJ-01-recommendation-to-action.md`
**Features:** FEAT-D1, FEAT-E1, FEAT-E2, FEAT-E3, FEAT-B4, FEAT-F1, FEAT-F3, FEAT-G2
**Backlog:** PB-26 — this spec must pass end to end on a clean database before the experiment starts

## What this spec is for

UJ-01 is the path the thesis measures. Almost every way it can fail produces a plausible number rather than an error: a re-rolled assignment, an event emitted from the browser and silently blocked, an `action_type` with no matching event type. None of those raise an exception, and none are visible in the UI. They surface during analysis, months after the collection window has closed, when nothing can be fixed.

So the cases below concentrate on wiring that is invisible when it is wrong, on the auth boundary, and on PDPA. They deliberately do not test that Prisma writes rows or that Next.js renders — if a case would only assert that a framework works, it is not here.

## Environment and data

- A clean database, migrated from empty. Not a copy of the development database.
- All test rows carry `is_seed = true`. Test accounts are never real sellers, and no real seller is contacted for any case here.
- **The clock must be injectable in the API and advisor layers.** The 7-day boundary cases cannot be written otherwise, and waiting seven days is not a test. This is a design implication of this spec: if the code reads the system clock directly, TS-01-09 cannot be written, and the primary metric ships untested.
- Static checks run against the built web bundle, not against source only.

## Case list

Priority: **P1** — the study is invalid if this fails. **P2** — the platform is wrong but the study survives.

| ID | Case | Type | Pri | UJ-01 step |
|---|---|---|---|---|
| TS-01-01 | Assignment is written exactly once per unit | Integration | P1 | 4 |
| TS-01-02 | Assignment is stable across refresh, re-login and a second device | Integration | P1 | 11 |
| TS-01-03 | Concurrent delivery attempts produce one assignment, not two | Integration | P1 | ALT-7 |
| TS-01-04 | No randomisation exists in the client bundle | Static | P1 | 4 |
| TS-01-05 | `metric_snapshot` holds the numbers as they were at generation, and does not change when the store does | Integration | P1 | 5 |
| TS-01-06 | `recommendation.delivered` is emitted once, with variant and experiment IDs | Integration | P1 | 5 |
| TS-01-07 | `product.photo_added` is emitted after commit, once per photo, and not at all on a failed upload | Integration | P1 | 9 |
| TS-01-08 | Every recommendation `action_type` resolves to a real event type | Unit | P1 | 5, 9 |
| TS-01-09 | The 7-day window boundary is exact | Unit | P1 | analysis |
| TS-01-10 | Attribution is scoped to the store | Integration | P1 | analysis |
| TS-01-11 | Seed rows are excluded from the export | Integration | P1 | analysis |
| TS-01-12 | A dismissed recommendation stays in the denominator | Unit | P1 | ALT-1 |
| TS-01-13 | Every number in delivered copy appears in `metric_snapshot` | Unit | P1 | 6 |
| TS-01-14 | Rendered variant text matches the experiment document verbatim | Integration | P1 | 6 |
| TS-01-15 | A seller cannot read or act on another store's recommendations | Integration | P1 | 2, 7 |
| TS-01-16 | No personal data appears in any event payload or log line | Integration | P1 | all |
| TS-01-17 | `Event` rows cannot be updated or deleted through the application | Integration | P1 | all |
| TS-01-18 | No recommendation is delivered to a store with zero published products | Integration | P2 | ALT-5 |
| TS-01-19 | A recommendation delivered but never viewed is still recorded as delivered | Integration | P2 | ALT-2 |

## Detailed cases

### TS-01-02 — Assignment is stable

**Given** a store assigned to variant B for the running experiment
**When** the seller refreshes the dashboard, signs out and back in, and opens it on a second device
**Then** every response carries variant B, exactly one `Assignment` row exists for that unit, and its `assigned_at` is unchanged.

Also assert that no new assignment is written on any of those requests. A second row with the same variant would pass a naive equality check while proving the code re-rolls.

### TS-01-04 — No randomisation in the client

**When** the web bundle is built and searched for randomisation in any variant, assignment or recommendation path
**Then** there are no matches.

A repository check, not a runtime one. Client-side randomisation cannot be caught by a normal test, because it produces a working screen every time — a different one each time.

### TS-01-05 — Snapshot is a snapshot

**Given** a store with 6 published products, 4 of which have fewer than 2 photos
**When** a recommendation is generated, and the seller then adds photos to all four
**Then** `metric_snapshot` still reads 6 and 4.

The advisor said something at a moment in time. Analysis has to know what was true at that moment, not what is true now.

### TS-01-07 — The measured action

**Given** an authenticated seller and a product they own
**When** two photos upload successfully
**Then** two `product.photo_added` events exist, each written after the file write committed, each carrying `store_id`, `product_id` and the photo count before and after.

**And when** an upload fails at storage
**Then** no event exists for it.

An event for a photo that is not there inflates the action rate of whichever variant the seller happened to receive.

### TS-01-08 — The mapping cannot be missing

**When** every recommendation type registered in the advisor is enumerated
**Then** each `action_type` resolves to at least one event type that exists in the shared enum.

This case is the reason a recommendation type and its detecting event ship together. Without it, a new recommendation type can be added, delivered for weeks, and score zero — and the zero looks like the framing failed.

### TS-01-09 — The boundary

With `delivered_at` fixed and the clock injected:

| Event at | Acted |
|---|---|
| 1 second before `delivered_at` | no |
| `delivered_at` + 1 second | yes |
| `delivered_at` + 6 days | yes |
| `delivered_at` + exactly 7 days | yes |
| `delivered_at` + 7 days + 1 second | no |

The inclusive boundary at exactly seven days is a pre-registration decision, not a coding preference. If `docs/03-research/analysis-plan.md` is refined to say otherwise, this table changes with it and the change is dated there.

### TS-01-13 — Grounding

**When** copy is generated for every recommendation type and variant
**Then** every numeric token in the output appears as a value in that recommendation's `metric_snapshot`, and generation is refused when a required snapshot field is absent.

This is a blunt check and it will not catch an ungrounded sentence that contains no number — for example, a claim about what customers want. That remains a human review step, listed under known gaps.

### TS-01-15 — Auth boundary

Seller B, authenticated, attempts to read seller A's dashboard metrics, read seller A's recommendations, and dismiss one of them. All three are refused, and the refusals write no store-scoped events for either store.

### TS-01-16 — PDPA

**When** the full set of events produced by running the manual script is inspected
**Then** no payload key or value contains a name, phone number, address or email, and the same holds for application log lines emitted during the run.

Implemented as an allowlist of payload keys per event type. A denylist of the personal fields we happen to think of today will pass on the day someone adds `buyer_note`.

## Manual script — MS-01

Run on a phone-sized viewport against staging, with a seeded seller account. Thai UI throughout.

| # | Action | Expected |
|---|---|---|
| 1 | Sign in as the seeded seller | Dashboard opens; `seller.signed_in` recorded |
| 2 | Read the dashboard | Metrics shown; `dashboard.viewed` recorded; no seeded demo store appears in the numbers |
| 3 | Read the recommendation card | Copy is Thai, short, and matches one of the variants verbatim; `recommendation.delivered` and `recommendation.viewed` recorded |
| 4 | Note the variant, then pull to refresh three times | The same variant every time; still one `Assignment` row |
| 5 | Sign out, sign back in | Same variant |
| 6 | Open the card | `recommendation.opened` recorded |
| 7 | Follow it to the product and add two photos | Two `product.photo_added` events, after the upload completes |
| 8 | Query the export for this store | The recommendation shows as acted, against the recorded variant |
| 9 | Inspect the events written during steps 1 to 7 | IDs and values only. No names, no phone numbers, no addresses, no email |

Step 4 is the one to run slowly. It is the failure that no user would ever report, because every individual screen looks correct.

## Exit criteria

- Every P1 case passes on a clean database.
- MS-01 has been run once end to end on staging, on a real phone.
- Any P2 failure is written into known gaps below with a decision, rather than left open.

Until these hold, PB-29 (the freeze) does not happen and the experiment does not start. Starting collection over untested wiring risks a semester to save a day.

## Known gaps

- **Causality cannot be tested.** ALT-4 — a seller adding photos without seeing the card — counts as acted. No test can separate that from a real response. It is handled by randomisation, and reported as a property of the metric in the thesis.
- **Ungrounded sentences without numbers** are not caught by TS-01-13. Owner review of every generated string before the freeze, sentence by sentence, per the `advisor-recommendation` skill.
- **Naturalness of the Thai copy** is not machine-testable. Reviewed by the owner and one native-speaking seller who is not in the study.
- **No load testing.** The expected population is small; if that assumption changes, this gap reopens.
- **Cross-variant learning.** A seller who receives variant A then variant B may respond to the second differently because of the first. Listed as a threat in the experiment document; not testable here.

# Feature list

Derived from `requirements.md` and ordered for delivery in `product-backlog.md`. This is the single list of what the platform does.

Status: **first pass, 2026-08-28.** No code exists in the repository yet, so every feature below is `todo`. Update the status column as slices land; do not create a second list somewhere else.

## How to read this

| Column | Meaning |
|---|---|
| Feature | One user-facing capability. If it needs two different events for two different actions, it is probably two features. |
| Actor | Who does it. `System` means no human triggers it. |
| REQ | The requirement it satisfies. A feature with no REQ is scope creep. |
| PB | The backlog item that delivers it. |
| Events | The event types emitted. **A user-facing feature with an empty events cell is not ready to build** — see `CLAUDE.md` rule 1. |
| Pri | Must / Should / Could. |
| Status | todo / in progress / done. |

Event names follow `noun.past_tense_verb` and must stay specific enough to count on their own. `product.updated` is not an event type here, because it merges price changes, description edits and photo uploads into one bucket that cannot be separated again during analysis.

The canonical event enum will live in `packages/shared` once code exists. Until then this table is the proposal, not the source of truth.

---

## A. Accounts and access

| ID | Feature | Actor | REQ | PB | Events | Pri | Status |
|---|---|---|---|---|---|---|---|
| FEAT-A1 | Seller registration and sign-in | Seller | REQ-A1 | PB-06 | `seller.registered`, `seller.signed_in` | Must | todo |
| FEAT-A2 | Buyer registration and sign-in | Buyer | REQ-A2 | PB-14 | `buyer.registered`, `buyer.signed_in` | Must | todo |
| FEAT-A3 | Store-scoped authorisation on every store-owned route | System | REQ-A3 | PB-07 | none — a guard, not an action | Must | todo |

FEAT-A3 emits nothing on purpose: it changes nothing a user does, it only refuses requests that should never have succeeded. Recording that decision here is what stops it being re-litigated later.

## B. Store and catalogue

| ID | Feature | Actor | REQ | PB | Events | Pri | Status |
|---|---|---|---|---|---|---|---|
| FEAT-B1 | Store profile create and edit | Seller | REQ-B1 | PB-07 | `store.created`, `store.profile_updated` | Must | todo |
| FEAT-B2 | Product create, edit, delete | Seller | REQ-B2 | PB-08 | `product.created`, `product.description_changed`, `product.deleted` | Must | todo |
| FEAT-B3 | Product publish and unpublish | Seller | REQ-B2 | PB-09 | `product.published`, `product.unpublished` | Must | todo |
| FEAT-B4 | Product photo add and remove | Seller | REQ-B3 | PB-10 | `product.photo_added`, `product.photo_removed` | Must | todo |
| FEAT-B5 | Price and stock change | Seller | REQ-B4 | PB-11 | `product.price_changed`, `product.stock_changed` | Must | todo |

**FEAT-B4 is the most research-sensitive feature in the platform.** `product.photo_added` is the event that detects action on the first planned recommendation. If it is missed, emitted from the browser, or emitted before the write commits, the primary metric of the thesis is wrong and cannot be repaired afterwards.

## C. Buyer browsing and ordering

| ID | Feature | Actor | REQ | PB | Events | Pri | Status |
|---|---|---|---|---|---|---|---|
| FEAT-C1 | Catalogue browsing across stores | Buyer | REQ-C1 | PB-12 | `catalog.viewed` | Must | todo |
| FEAT-C2 | Storefront and product detail pages | Buyer | REQ-C1 | PB-12 | `storefront.viewed`, `product.viewed` | Must | todo |
| FEAT-C3 | Search and category filter | Buyer | REQ-C2 | PB-13 | `catalog.searched` | Should | todo |
| FEAT-C4 | Cart and order placement | Buyer | REQ-C3 | PB-15 | `cart.item_added`, `cart.item_removed`, `order.placed` | Must | todo |
| FEAT-C5 | Order status handling | Seller | REQ-C4 | PB-16 | `order.status_changed`, `order.cancelled` | Must | todo |

`catalog.searched` carries the category ID, the result count and the length of the query — **not the query text**. A free-text search box is a place where people type things about themselves, and REQ-N2 does not have an exception for search.

## D. Seller dashboard

| ID | Feature | Actor | REQ | PB | Events | Pri | Status |
|---|---|---|---|---|---|---|---|
| FEAT-D1 | Seller dashboard: views, orders, revenue, product count, photo coverage | Seller | REQ-D1 | PB-17 | `dashboard.viewed` | Must | todo |
| FEAT-D2 | Shared metric layer used by both the dashboard and the advisor | System | REQ-D2, REQ-D3 | PB-18 | none — internal | Must | todo |

## E. AI advisor

| ID | Feature | Actor | REQ | PB | Events | Pri | Status |
|---|---|---|---|---|---|---|---|
| FEAT-E1 | Recommendation generation, snapshot storage and delivery | System | REQ-E1, REQ-E2, REQ-E3 | PB-21, PB-24 | `recommendation.delivered` | Must | todo |
| FEAT-E2 | Photo-coverage advice — the first recommendation type | System | REQ-E1 | PB-24 | (delivery event above); `action_type` = `photo_added`, detected by `product.photo_added` | Must | todo |
| FEAT-E3 | Recommendation card: view, open, dismiss | Seller | REQ-E4 | PB-25 | `recommendation.viewed`, `recommendation.opened`, `recommendation.dismissed` | Must | todo |
| FEAT-E4 | Thai variant copy for EXP-001 | System | REQ-E1 | PB-23 | none — content, delivered by FEAT-E1 | Must | todo |
| FEAT-E5 | Second recommendation type | System | REQ-E1 | PB-33 | its own `action_type` and detecting event, added together | Could | todo |

Every recommendation type added later must arrive with the event that detects its action, in the same change. A recommendation whose `action_type` has no matching event type will read as a total failure in the results, and the failure will look like the variant rather than like the wiring.

## F. Telemetry and experiment infrastructure

| ID | Feature | Actor | REQ | PB | Events | Pri | Status |
|---|---|---|---|---|---|---|---|
| FEAT-F1 | `Event` model, append-only guard, server-side emitter | System | REQ-F1, REQ-F2, REQ-F5 | PB-03 | infrastructure — carries every event above | Must | todo |
| FEAT-F2 | Experiment and variant registry | Researcher | REQ-F3 | PB-19 | `experiment.started`, `experiment.stopped` (actor `system`) | Must | todo |
| FEAT-F3 | Server-side assignment, persisted once per unit | System | REQ-F3, REQ-F4 | PB-20 | none — the `Assignment` row is the record; `variant_id` travels on `recommendation.delivered` | Must | todo |
| FEAT-F4 | Seed flagging and exclusion | System | REQ-F6 | PB-05 | none — internal | Must | todo |

FEAT-F3 deliberately emits no event. The `Assignment` row with its unique constraint is the durable record, and adding a second write of the same fact creates a way for the two to disagree. If assignment ever needs an audit trail, it belongs in `Assignment`, not in `Event`.

## G. Analysis

| ID | Feature | Actor | REQ | PB | Events | Pri | Status |
|---|---|---|---|---|---|---|---|
| FEAT-G1 | Analysis export, seed rows excluded | Researcher | REQ-G1, REQ-F6 | PB-30 | none — reads only | Must | todo |
| FEAT-G2 | Pre-registered 7-day action rate analysis | Researcher | REQ-G1, REQ-G2 | PB-31 | none — reads only | Must | todo |

## H. Platform

| ID | Feature | Actor | REQ | PB | Events | Pri | Status |
|---|---|---|---|---|---|---|---|
| FEAT-H1 | Cloud deployment of web, api and database | System | REQ-H1 | PB-01, PB-04 | none | Must | todo |
| FEAT-H2 | External API integration | System | REQ-H2 | PB-27 | depends on choice — **[OPEN]** Q-2 | Must | todo |
| FEAT-H3 | Core data model and seed data | System | REQ-D3, REQ-F6 | PB-02, PB-05 | none | Must | todo |
| FEAT-H4 | Seller onboarding runbook | Researcher | REQ-H3 | PB-28 | none — an operational process, not a feature of the app | Must | todo |

FEAT-H2 cannot be built until Q-2 is answered. A notification channel is the tempting option because it also improves recommendation delivery — which is exactly why it is dangerous: introducing it mid-study changes how sellers are exposed to recommendations, and REQ-N1 forbids that. If it is chosen, it ships before the study window opens or not at all.

---

## Coursework coverage

| Coursework requirement | Covered by | Status |
|---|---|---|
| Authentication | FEAT-A1, FEAT-A2, FEAT-A3 | todo |
| CRUD | FEAT-B2 (product), FEAT-B1 (store) | todo |
| Dashboard | FEAT-D1 | todo |
| Cloud deployment | FEAT-H1 | todo |
| External API integration | FEAT-H2 | **blocked on Q-2** |

Only one row is blocked, and it is blocked on a decision rather than on work.

## Research critical path

These features carry the thesis. Everything else can be late, simplified or cut.

| Feature | What breaks if it is wrong |
|---|---|
| FEAT-F1 | No events, no data, no study — and nothing can be backfilled |
| FEAT-F3 | Re-rolled assignment invalidates every comparison, silently |
| FEAT-E1 | No `metric_snapshot` means no grounding and no defensible advisor |
| FEAT-E2 | The recommendation under test |
| FEAT-B4 | The event that detects action on it |
| FEAT-G2 | The primary metric itself |

The measurement chain is `FEAT-E1 → FEAT-E3 → FEAT-B4 → FEAT-G2`. It is walked end to end in `docs/02-design/user-journeys/UJ-01-recommendation-to-action.md` and tested in `docs/04-testing/test-specs/TS-01-recommendation-to-action.md`.

## Not in this cycle

`PB-34` reviews and ratings, `PB-35` in-platform payment, `PB-36` chat. Reasons are recorded in `product-backlog.md` so they do not have to be re-argued.

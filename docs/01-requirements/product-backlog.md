# Product backlog

Ordered list of work, derived from `requirements.md`. `feature-list.md` is the *what*; this is the *when and in which order*.

Status: **updated 2026-09-03.**

**Done:** PB-01, PB-02, PB-03, PB-05 (M0 foundation), PB-06, PB-07, PB-08, PB-09, PB-10, PB-11 (all of the M1 seller catalogue).

**M0 is not complete.** Its exit condition is "a user action *in production* writes an `Event` row that analysis can read". Events are written and read locally, but PB-04 (deploy) is blocked on D-1, so the milestone stays open.

**M1 is feature-complete.** PB-10 landed with ADR-0004, so `product.photo_added` — the event the thesis's primary metric is joined on — is now produced by a real upload path. M1's exit condition is a *real seller* onboarding without help, which is an operational step, not a coding one.

**The next blocker is D-1**, hosting and managed database. It gates PB-04 and therefore M0's exit condition, and it carries the storage provider with it. Q-2 also stays open by the owner's choice, so PB-27 / FEAT-H2 is still the one blocked coursework row.

## How this backlog is ordered

Ordering is not by product value. It is by **what has to exist before the study window opens**, because the study window is fixed by the university calendar and everything else can slip.

Two rules constrain the order and are not negotiable:

1. **There is no instrumentation item.** No backlog item says "add events" or "add analytics". Emitting the event is inside the definition of done of the item that creates the action. An item that ships without its event has not shipped.
2. **The experiment design item precedes the experiment code item.** `docs/03-research/experiments/EXP-001-*.md` is written and complete before any variant code exists.

## Priority scale

`Must` — the thesis or the coursework fails without it.
`Should` — the platform is noticeably worse without it, but the study still runs.
`Could` — only if time remains after M4.
`Won't (this cycle)` — recorded so it stops being re-proposed.

## Milestones

| ID | Milestone | Goal | Exit condition |
|---|---|---|---|
| M0 | Walking skeleton | Deployed, empty, instrumented | A user action in production writes an `Event` row that analysis can read |
| M1 | Seller catalogue | A seller can put a real product online | A real seller onboards without help from the owner |
| M2 | Buyer side | A buyer can find a product and order it | A real order is placed by someone who is not the owner |
| M3 | Dashboard and advisor | A seller sees their numbers and one grounded recommendation | A recommendation is delivered with a stored `metric_snapshot` |
| M4 | Study run | Frozen platform, experiment running | Assignment logic, variant text and prompt unchanged for the whole window |
| M5 | Analysis and writing | The pre-registered analysis runs | 7-day action rate per variant, reproducible from one command |

Milestone dates are **not set** — they depend on Q-1 (study window dates) in `requirements.md`.

## Backlog

| ID | Item | Milestone | Priority | Feature | Blocked by | Size |
|---|---|---|---|---|---|---|
| PB-01 | Monorepo, TypeScript config, lint, typecheck, test commands as documented in `CLAUDE.md` | M0 | Must | FEAT-H1 | — | M |
| PB-02 | Prisma schema for `Store`, `Product`, `Order`, `OrderItem` with `is_seed` on every table | M0 | Must | FEAT-H3 | PB-01 | M |
| PB-03 | `Event` model, append-only guard, server-side emitter in `apps/api` | M0 | Must | FEAT-F1 | PB-02 | M |
| PB-04 | Deploy web and api to cloud with a managed Postgres | M0 | Must | FEAT-H1 | PB-01 | L |
| PB-05 | Seed script, every row `is_seed = true` | M0 | Must | FEAT-H3 | PB-02 | S |
| PB-06 | Seller registration and sign-in | M1 | Must | FEAT-A1 | PB-03 | M |
| PB-07 | Store profile create and edit | M1 | Must | FEAT-B1 | PB-06 | S |
| PB-08 | Product create, edit, delete | M1 | Must | FEAT-B2 | PB-07 | L |
| PB-09 | Product publish and unpublish | M1 | Must | FEAT-B3 | PB-08 | S |
| PB-10 | Product photo add and remove | M1 | Must | FEAT-B4 | PB-08 | M |
| PB-11 | Price and stock change, emitted as distinct events | M1 | Must | FEAT-B5 | PB-08 | S |
| PB-12 | Buyer catalogue and storefront pages, view events | M2 | Must | FEAT-C1, FEAT-C2 | PB-09 | M |
| PB-13 | Search and category filter | M2 | Should | FEAT-C3 | PB-12 | M |
| PB-14 | Buyer account and sign-in — **decide Q-3 first** | M2 | Must | FEAT-A2 | PB-06 | M |
| PB-15 | Cart and order placement | M2 | Must | FEAT-C4 | PB-14 | L |
| PB-16 | Seller order list and status change — **decide Q-5 first** | M2 | Must | FEAT-C5 | PB-15 | M |
| PB-17 | Seller dashboard: views, orders, revenue, product count, photo coverage | M3 | Must | FEAT-D1 | PB-15 | L |
| PB-18 | Metric layer shared by dashboard and advisor | M3 | Must | FEAT-D2 | PB-17 | M |
| PB-19 | `Experiment`, `Variant`, `Assignment` models and migration | M3 | Must | FEAT-F2 | PB-02 | M |
| PB-20 | Server-side assignment service, persisted, unique per unit | M3 | Must | FEAT-F3 | PB-19 | M |
| PB-21 | `Recommendation` model with `metric_snapshot`, `action_type`, `delivered_at`, `dismissed_at` | M3 | Must | FEAT-E1 | PB-19 | M |
| PB-22 | Write EXP-001 design document — **before any variant code** | M3 | Must | — | PB-18 | S |
| PB-23 | Thai variant copy for EXP-001, matched on everything except framing | M3 | Must | FEAT-E4 | PB-22 | M |
| PB-24 | Advisor: photo-coverage recommendation, grounded, with snapshot | M3 | Must | FEAT-E2 | PB-18, PB-21 | L |
| PB-25 | Recommendation card in the dashboard: view, open, dismiss | M3 | Must | FEAT-E3 | PB-24, PB-20 | M |
| PB-26 | Test spec TS-01 executed end to end against a clean database | M3 | Must | — | PB-25 | M |
| PB-27 | External API integration — **decide Q-2 first**, ADR required | M3 | Must | FEAT-H2 | Q-2 | M |
| PB-28 | Seller onboarding runbook in `docs/08-operations/` | M4 | Must | FEAT-H4 | PB-16 | S |
| PB-29 | Freeze check: assignment logic, variant text, advisor prompt tagged and unchanged | M4 | Must | — | PB-26 | S |
| PB-30 | Export script producing the analysis dataset, seed rows excluded | M5 | Must | FEAT-G1 | PB-03 | M |
| PB-31 | Pre-registered analysis: 7-day action rate per variant, store fixed effect | M5 | Must | FEAT-G2 | PB-30 | M |
| PB-32 | Findings written up, including the negative case | M5 | Must | — | PB-31 | M |
| PB-33 | Second advisor recommendation type — only if EXP-001 has enough units without it | M4 | Could | FEAT-E5 | PB-24 | M |
| PB-34 | Buyer reviews and ratings | — | Won't (this cycle) | — | — | L |
| PB-35 | In-platform payment | — | Won't (this cycle) | — | — | XL |
| PB-36 | Seller-to-buyer chat | — | Won't (this cycle) | — | — | L |

## Why the last three are out

- **Reviews** add a second social signal that the advisor would have to reason about, and a second thing that could move seller behaviour during the study window. It is a confound with a UI attached.
- **In-platform payment** touches real money and real regulation, and `CLAUDE.md` requires the owner to be asked before anything in that area. It is not needed for any of the three project goals.
- **Chat** is a support burden for a solo developer during the exact weeks the study is running.

Recorded here so that when one of them is proposed again in month three, the reason it was declined is already written down.

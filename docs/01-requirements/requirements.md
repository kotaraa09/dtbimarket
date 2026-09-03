# Requirements

Source document for `feature-list.md` and `product-backlog.md`. Every feature must trace to a requirement here; a feature with no requirement is scope creep, and a requirement with no feature is an unmet obligation.

Status: **first pass, 2026-08-28.** Items marked **[ASSUMED]** were inferred from `CLAUDE.md` and have not been confirmed by the owner or supervisor. Items marked **[OPEN]** must be decided before the milestone that depends on them.

## Actors

| ID | Actor | Description |
|---|---|---|
| ACT-1 | Seller | MFU student running a micro-business. Owns exactly one store. The research subject. |
| ACT-2 | Buyer | Student or staff browsing and ordering. Not a research subject; generates the data sellers are advised on. |
| ACT-3 | Researcher / admin | The repository owner. Reads analysis, starts and stops experiments. Never edits telemetry. |
| ACT-4 | System | The advisor service and scheduled jobs. Writes recommendations and system events. |

## Requirement sources

| Code | Source | Priority when in conflict |
|---|---|---|
| RS-R | Thesis research design (`docs/03-research/`) | 1 — wins |
| RS-C | Coursework rubric: auth, CRUD, cloud deployment, dashboard, external API | 2 |
| RS-P | Real sellers and buyers using the platform | 3 |

## Functional requirements

### A. Accounts and access

| ID | Requirement | Actor | Source | Notes |
|---|---|---|---|---|
| REQ-A1 | A seller can register and sign in with email and password | ACT-1 | RS-C, RS-P | Satisfies the coursework authentication requirement |
| REQ-A2 | A buyer can register and sign in | ACT-2 | RS-P | **[OPEN]** Q-3 — guest checkout would remove the buyer identity that order events reference |
| REQ-A3 | Every request reading or writing store-owned data is authorised against the owning store | ACT-1 | RS-P | Seller A must never read seller B's metrics or recommendations |
| REQ-A4 | The researcher can read experiment state and analysis output without being able to edit telemetry rows | ACT-3 | RS-R | Append-only is enforced in the application layer, not by convention |

### B. Store and catalogue

| ID | Requirement | Actor | Source | Notes |
|---|---|---|---|---|
| REQ-B1 | A seller can create and edit one store profile | ACT-1 | RS-C, RS-P | One store per seller |
| REQ-B2 | A seller can create, edit, publish, unpublish and delete products | ACT-1 | RS-C, RS-P | Satisfies the coursework CRUD requirement |
| REQ-B3 | A seller can add and remove product photos | ACT-1 | RS-R, RS-P | **On the research critical path** — photo count is the metric behind the first planned recommendation |
| REQ-B4 | A seller can set and later change price and stock | ACT-1 | RS-P | Price and stock changes stay separately countable; never merged into one `product.updated` |

### C. Buyer browsing and ordering

| ID | Requirement | Actor | Source | Notes |
|---|---|---|---|---|
| REQ-C1 | A buyer can browse a catalogue across stores and view a single storefront | ACT-2 | RS-P | Produces the view counts the advisor reasons about |
| REQ-C2 | A buyer can search and filter by category | ACT-2 | RS-P | |
| REQ-C3 | A buyer can place an order containing one or more products | ACT-2 | RS-C, RS-P | |
| REQ-C4 | A seller can move an order through its status lifecycle | ACT-1 | RS-P | Statuses **[OPEN]** Q-5 |
| REQ-C5 | Payment is arranged off-platform between buyer and seller | — | RS-P | **[ASSUMED]** The platform records that an order exists; it does not move money. Changing this needs the owner — `CLAUDE.md`, Ask before doing |

### D. Seller dashboard

| ID | Requirement | Actor | Source | Notes |
|---|---|---|---|---|
| REQ-D1 | A seller can see their own store metrics: views, orders, revenue, product count, photo coverage | ACT-1 | RS-C, RS-P | Satisfies the coursework dashboard requirement |
| REQ-D2 | Dashboard numbers are computed from the same tables the advisor reads | ACT-1 | RS-R | If the dashboard and the advisor disagree, sellers stop trusting both |
| REQ-D3 | Seed and demo rows never appear in a seller's numbers | ACT-1 | RS-R | `is_seed = true` is filtered in the product too, not only in analysis |

### E. AI advisor

| ID | Requirement | Actor | Source | Notes |
|---|---|---|---|---|
| REQ-E1 | The advisor generates recommendations for a store from that store's own metrics | ACT-4 | RS-R | |
| REQ-E2 | Every recommendation stores the metric snapshot it was generated from | ACT-4 | RS-R | The value **at generation time**, not a live query |
| REQ-E3 | Every recommendation carries an `action_type` that maps to a real event type | ACT-4 | RS-R | Without this the 7-day action rate cannot be computed |
| REQ-E4 | A seller can see, open and dismiss a recommendation | ACT-1 | RS-R | Dismissal is a secondary metric |
| REQ-E5 | The advisor makes no claim it cannot point to a stored number for | ACT-4 | RS-R | Enforced by test, not by review alone — TS-01-13 |

### F. Telemetry and experiment infrastructure

| ID | Requirement | Actor | Source | Notes |
|---|---|---|---|---|
| REQ-F1 | Every user-facing action writes an `Event` row | all | RS-R | Ships with the feature, never after it |
| REQ-F2 | The `Event` table is append-only | — | RS-R | No update, no delete, no reshaping of old rows |
| REQ-F3 | Variant assignment happens on the server, once per unit, and is persisted | ACT-4 | RS-R | Unique on (`experiment_id`, `unit_type`, `unit_id`) |
| REQ-F4 | Assignment is stable across refresh, re-login and re-render | ACT-1 | RS-R | Re-rolling destroys the experiment silently |
| REQ-F5 | Event payloads and application logs contain no personal data | — | RS-R, PDPA | IDs and values only |
| REQ-F6 | Seed rows are marked `is_seed = true` and excluded from every analysis query | — | RS-R | |

### G. Analysis

| ID | Requirement | Actor | Source | Notes |
|---|---|---|---|---|
| REQ-G1 | The 7-day action rate is computable per variant, exactly as pre-registered | ACT-3 | RS-R | `docs/03-research/analysis-plan.md` is the specification |
| REQ-G2 | Analysis output is reproducible from one command over exported data | ACT-3 | RS-R | `uv run python analysis/export.py` |

### H. Platform

| ID | Requirement | Actor | Source | Notes |
|---|---|---|---|---|
| REQ-H1 | The application is deployed to a cloud environment reachable by real sellers and buyers | — | RS-C, RS-P | Coursework requirement |
| REQ-H2 | The application integrates one external API | — | RS-C | **[OPEN]** Q-2. Needs an ADR before any service is added |
| REQ-H3 | The UI is Thai-language and usable on a phone | ACT-1, ACT-2 | RS-P | **[ASSUMED]** sellers and buyers are on phones, not laptops |

## Non-functional requirements

The five below are the ones that constrain almost every decision. The full set — performance, availability, durability, security, privacy, usability, maintainability and operability, each with a measurable target and how it is checked — is in **`non-functional-requirements.md`**, which continues the same ID series from REQ-N17.

| ID | Requirement | Why |
|---|---|---|
| REQ-N1 | Assignment logic, variant text and the advisor prompt stay frozen for the whole study window | A change mid-run ends the experiment and starts a new one |
| REQ-N2 | People are referenced by ID; no names, phone numbers, addresses or email in events or logs | PDPA. These are real people in Thailand |
| REQ-N3 | No secrets in the repository, including docs, seeds and fixtures | |
| REQ-N4 | A dependency is added only when neither the standard library nor an existing dependency solves the problem | Solo project, thesis deadline |
| REQ-N5 | Recommendation generation must work for a store with very little activity | Most stores will be quiet, especially early in the semester |

## Constraints

- The study window is locked to the university calendar. There is no second semester to re-run it.
- Solo developer. Every feature carries its own maintenance for the rest of the project.
- The novel part of this project is the study, not the stack.

## Open questions

| ID | Question | Blocks | Needed by |
|---|---|---|---|
| Q-1 | Exact study window start and end dates | Backlog milestones, stopping rule of the first experiment | Before M2 |
| Q-2 | Which external API satisfies REQ-H2? Candidates: image hosting for product photos, Thai address/postcode lookup, a notification channel. A notification channel changes the recommendation exposure path and must not be introduced mid-study. **A language model API is no longer a candidate — ADR-0002 keeps one out of the advisor** | REQ-H2, FEAT-H2 | Before M3 |
| Q-3 | Guest checkout, or accounts required for buyers? | REQ-A2, FEAT-C4 | Before M2 |
| Q-4 | How many sellers will be onboarded, and when? | Experiment sample size and stopping rule | Before M2 |
| Q-5 | What order statuses does a seller actually need? | REQ-C4 | Before M2 |

These are for the owner and supervisor to answer. They are not to be guessed and built on.

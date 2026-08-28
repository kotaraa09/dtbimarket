# UJ-01 — A seller receives a grounded recommendation and acts on it

**Status:** draft
**Written:** 2026-08-28
**Covers:** FEAT-D1, FEAT-E1, FEAT-E2, FEAT-E3, FEAT-B4, FEAT-F1, FEAT-F3, FEAT-G2
**Requirements:** REQ-D1, REQ-E1 to REQ-E5, REQ-F1 to REQ-F5, REQ-B3
**Tested by:** `docs/04-testing/test-specs/TS-01-recommendation-to-action.md`

This is the journey the thesis measures. Every other journey on the platform exists so that this one has data to run on.

## Persona

A third-year student running a snack store between classes. Composite and fictional — no real seller is described here, and no real seller data appears in this document.

They check the platform on a phone, usually for under two minutes at a time, and they have no obligation to do anything the platform suggests. Six products are published; four of them have a single photo. They have never opened a dashboard metric on purpose.

The relevant fact about them is not that they lack skill. It is that they have very little time and no reason to trust the advice, so a recommendation that does not immediately show why it is worth doing gets nothing.

## Preconditions

- The seller has an account and one store (FEAT-A1, FEAT-B1).
- The store has at least one published product. A store with none is excluded from the study by the analysis plan, and the advisor must not deliver to it.
- An experiment is `running` with at least two variants (FEAT-F2).
- The advisor can compute photo coverage for this store from real rows, none of them `is_seed = true`.

## Main path

| # | Seller does | System does | Rows written | Event | Why the study needs this step |
|---|---|---|---|---|---|
| 1 | Signs in on their phone | Creates a session | — | `seller.signed_in` | Establishes the actor for everything that follows |
| 2 | Opens the dashboard | Computes store metrics through the shared metric layer, seed rows excluded | — | `dashboard.viewed` | The exposure surface. If sellers never open this, delivery never happens |
| 3 | — | Advisor runs the photo-coverage query: 4 of 6 published products have fewer than 2 photos | — | — | The number that grounds the advice, and the trigger threshold |
| 4 | — | Assignment service picks a variant **on the server**, once, and persists it | `Assignment` | — | Rule 3. Nothing about this step may happen in the browser |
| 5 | — | Writes the recommendation with the exact numbers used, the `action_type`, the variant and the delivery time | `Recommendation` (`metric_snapshot`, `action_type = photo_added`, `variant_id`, `delivered_at`) | `recommendation.delivered` | `delivered_at` starts the 7-day clock. `metric_snapshot` is what makes the advice defensible afterwards |
| 6 | Sees the recommendation card | Renders the variant text exactly as recorded in the experiment document | — | `recommendation.viewed` | Separates delivered from actually seen |
| 7 | Taps the card open | Expands the detail and offers a link to the product | — | `recommendation.opened` | Secondary metric: attention before action |
| 8 | Taps through to a product | Opens the product editor for one of the four products | — | — | Reducing the distance between advice and action is a product decision, and it is identical for every variant |
| 9 | Uploads two photos | Stores the files, commits, then emits — one event per photo, from the API | `Product` photo rows | `product.photo_added` ×2 | **This is the measured action.** Emitted after the write commits, never from the browser |
| 10 | Closes the app | — | — | — | |
| 11 | Returns two days later | Reads the same assignment from the database and renders the same variant text | — | — | Rule 3 again. A different variant on the second visit would destroy the comparison without any error appearing anywhere |

At day 7 the analysis asks one question: did an event of type `product.photo_added` exist for this `store_id` with `occurred_at` inside the window after `delivered_at`? Here the answer is yes, and this recommendation counts as acted for its variant.

## Measurement chain

```
Recommendation.delivered_at ──┐
Recommendation.action_type ───┼──► join on store_id, within 7 days ──► acted = 0 / 1
Event.type = product.photo_added ─┘                                        │
Recommendation.variant_id ─────────────────────────────────────────────────┴──► rate per variant
```

Every link is a feature that must ship correctly. Break any one and the result is not a wrong number that looks wrong — it is a plausible number that is quietly wrong.

## Alternate paths

| ID | What happens | System behaviour | Effect on the study |
|---|---|---|---|
| ALT-1 | Seller dismisses the card | Sets `dismissed_at`, emits `recommendation.dismissed` | Stays in the denominator. The analysis plan defines the rate as acted / delivered, so a dismissal is a delivered recommendation that was not acted on, not a removed one |
| ALT-2 | Seller ignores it entirely | Nothing | Counts as not acted. This is the measurement working, not a failure |
| ALT-3 | Seller adds photos on day 9 | `product.photo_added` is recorded normally | Not acted, by the pre-registered 7-day rule. The delay is visible in the time-to-action secondary metric |
| ALT-4 | Seller adds photos without ever seeing the card | Event recorded normally, `recommendation.viewed` absent | **Still counted as acted.** The metric cannot tell intent apart from coincidence. This is exactly what randomisation is for: the same background noise lands on every variant. Stated here so it appears in the thesis as a known property rather than as a surprise |
| ALT-5 | Store has zero published products | The advisor does not deliver | Excluded from analysis anyway. Delivering advice to an empty store also wastes the seller's trust |
| ALT-6 | The advisor cannot ground a claim in the snapshot | Delivers nothing | Rule 7. A vague recommendation is worse than silence, because it is indistinguishable from a general chatbot |
| ALT-7 | Two sellers open the dashboard at the same instant | Assignment is written under a unique constraint on (`experiment_id`, `unit_type`, `unit_id`); a losing write reads the existing row | One unit, one variant, always |

## What must not happen

- Randomisation in the browser, or on re-render, or on re-login.
- A second variant shown for the same recommendation.
- `product.photo_added` emitted from the UI, or before the upload commits.
- Any name, phone number, address or email in an event payload or a log line. The payload here carries `product_id`, `store_id`, and the photo count before and after — nothing else.
- Variant text edited while the experiment is running. If the copy is wrong, the experiment stops and a new one starts with a new ID.
- The advisor claiming that customers want more photos. Nothing in the snapshot measures what customers want. It may state the store's own photo coverage, and, if the comparison figure was computed and stored, the category figure alongside it.

## Variant text

Not reproduced here. The verbatim text lives in the experiment document under `docs/03-research/experiments/`, and is written with the `variant-copy` skill so the variants differ in framing and nothing else.

Copying it into this journey would create a second version that drifts, and a drifted variant string is an experiment measuring something nobody wrote down.

## Open questions from this journey

| ID | Question | Why it matters | Needed by |
|---|---|---|---|
| OQ-J1 | Does `delivered_at` mean generated, or rendered to the seller? | It starts the 7-day clock. If a recommendation is generated by a nightly job and seen four days later, the window is nearly half gone before exposure. Simplest answer: generate on dashboard load so the two coincide — but that must be a decision, not an accident | Before PB-24 |
| OQ-J2 | Is a recommendation delivered but never viewed still in the denominator? | The analysis plan currently says acted / delivered. Consistent with ALT-1, but it should be affirmed deliberately, because the alternative — acted / viewed — is a different study | Before the experiment starts |
| OQ-J3 | How many recommendations may one store receive per week? | Recommendations to the same store are not independent. The analysis plan handles this with a store fixed effect, but the delivery rate is still a design choice that affects fatigue and spillover | Before the experiment starts |
| OQ-J4 | Does the seller reach the product editor from the card, or navigate there themselves? | It must be identical across variants. If one variant links and another does not, the experiment is measuring the link | Before PB-25 |

OQ-J1 and OQ-J2 are research decisions and belong to the experiment document. They are recorded here because this is where the ambiguity was noticed.

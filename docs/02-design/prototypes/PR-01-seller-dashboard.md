# PR-01 — Seller dashboard with recommendation card

**Status:** draft
**Written:** 2026-08-28
**File:** `PR-01-seller-dashboard.html` — open it in a browser, no build step, no server
**Prototypes:** UJ-01 steps 2 to 9
**Features:** FEAT-D1, FEAT-E1, FEAT-E2, FEAT-E3, FEAT-B4
**Tested by:** TS-01 cases 05, 06, 07, 12, 13, 16, 18

## What this is

The one screen the study depends on: what a seller sees when they open the dashboard, and what the platform records while they look at it.

The layout puts the phone on the left and an inspector panel on the right. The split is the point. Everything in the phone is product; everything in the panel is instrumentation, in monospace on a dark ground so the two are never confused. Building the recommendation card without showing the events beside it would have produced a screen that looks finished and records nothing — which is the exact failure `CLAUDE.md` opens with.

## What this is not

- **Not production code.** No framework, no data layer, no auth. It is a drawing that responds to clicks.
- **Not the experiment copy.** The two variant texts are placeholders, marked as such on screen. Real copy is written with the `variant-copy` skill and lives in the experiment document. If the copy here is ever mistaken for the real thing, an experiment ends up measuring a string nobody registered.
- **Not real data.** Every number is demo data, marked `is_seed = true` on screen, matching rule 6.
- **Not a decision about the app's visual identity.** Colour and type here are a starting point for one screen, not a design system.

## States

Switchable from the inspector panel, because a prototype that only shows the happy path hides the states that are hardest to get right.

| State | Journey ref | What it shows |
|---|---|---|
| Normal | UJ-01 steps 2–7 | Metrics, one recommendation, product list |
| Dismissed | ALT-1 | Card replaced by a quiet acknowledgement; the panel notes the recommendation stays in the denominator |
| Store with no products | ALT-5 | No recommendation is generated at all |
| Cannot be grounded | ALT-6 | The advisor says nothing rather than something vague |

## Interaction and event map

Every interaction below writes one row in the panel, in the shape an `Event` row would take. This is the check that the events listed in `feature-list.md` are actually sufficient to reconstruct the journey.

| Interaction | Event | Payload |
|---|---|---|
| Screen loads | `dashboard.viewed` | `period_days` |
| Card renders | `recommendation.delivered` | `recommendation_id`, `experiment_id`, `variant_id`, `action_type` |
| Card is on screen | `recommendation.viewed` | `recommendation_id` |
| Tap the number source | `recommendation.opened` | `recommendation_id` |
| Tap dismiss | `recommendation.dismissed` | `recommendation_id`, `variant_id` |
| Add a photo | `product.photo_added` | `product_id`, `photos_before`, `photos_after` |

No payload carries a name, a phone number, an address or an email — REQ-N2, verifiable by reading the panel during a demo.

Tapping the primary button opens the product editor as a sheet **inside the same screen**. The distance between advice and action is a variable in its own right, so it has to be identical for every variant, which is OQ-J4 in UJ-01.

## What building this exposed

Three things that were not visible while the journey was only prose.

**1. Variant B cannot be delivered without a category benchmark.** The comparison framing says other stores average three photos per product. Under rule 7 a comparison may only be stated when the comparison figure is in the snapshot, so `category_avg_photos` has to be computed and stored at generation time. The prototype adds that field to the snapshot when variant B is selected — click between A and B to see it appear.

This is a real constraint on the experiment: if the metric layer cannot produce a defensible category average early in the semester, when few stores have listings, then variant B cannot be delivered honestly and the experiment as designed cannot start. It belongs in the EXP-001 design document, not in a code comment.

**2. Card copy must be rendered from the stored snapshot, never from live metrics.** Add a photo in the prototype and watch: the dashboard tile drops from 4 to 3, and the card still says 4. That looks like a bug and is the correct behaviour — the advice was given about a moment in time, and TS-01-05 asserts the snapshot does not move. Had the card been wired to live numbers, the text would silently disagree with the row analysis reads.

Suggested new test case for TS-01: **TS-01-20 — rendered recommendation text is generated from `metric_snapshot`, and does not change when the store's live metrics change.** Add it when TS-01 is next revised.

**3. Researcher vocabulary leaked into the seller screen.** The first draft of the dismissed state told the seller their dismissal still counted in the denominator. That sentence is for the panel, not for a student selling snacks between classes. It was moved. Worth watching for elsewhere: this is a project where the person writing the UI is also the person writing the analysis.

## Deliberately not shown to the seller

The seven-day window end date appears in the inspector only. Putting a deadline on the seller's screen would be a nudge in its own right — one that is not part of any variant and would apply unevenly depending on when the seller happened to look. If a deadline is ever wanted, it is a variant, and it belongs in an experiment.

## Design notes

Teal-green accent with neutrals biased the same way, a warm amber reserved strictly for the one metric that needs attention, and `IBM Plex Sans Thai` for interface, `Sarabun` for body, `IBM Plex Mono` for anything the system recorded. Type carries the product-versus-instrumentation split as much as colour does.

The screen is built at phone width first, since REQ-H3 assumes sellers are on phones. On a wide screen the phone stays phone-sized and the panel sits beside it rather than the layout stretching, because a stretched version of this screen is not a screen anyone will use.

## Open questions this prototype does not answer

| ID | Question |
|---|---|
| OQ-J1 | Does `delivered_at` mean generated or rendered? The prototype assumes rendered, because it generates on load. That assumption needs confirming, not inheriting |
| OQ-J3 | How many recommendations per store per week, and what happens to the card when there are two |
| PR-01-a | Where does the recommendation sit once a store has several? Above the metrics, or below |
| PR-01-b | What does the card look like after the seller has acted? Confirmation, or silence |

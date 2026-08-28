# EXP-NNN — <short name>

**Status:** draft | running | stopped
**Owner:**
**Started:**  **Stopped:**

## Question
One sentence. What do we want to know?

## Hypothesis
What we predict, and why. Write this before looking at any data.

## Unit of randomisation
recommendation | session | store — and *why this unit*.

> Default is the recommendation. Randomising per store gives too few units to detect anything.

## Variants
| ID | Name | Description |
|---|---|---|
| A | Control | |
| B | | |

Variant text is recorded here verbatim, exactly as the user sees it.

## Primary metric
One metric. How it is computed, from which tables, with the exact join.

## Secondary metrics
Exploratory. Not used to claim success.

## Exclusions
Decided now, not after seeing results. E.g. seed rows, stores with no listings, recommendations delivered in the final week.

## Sample size
Expected number of units. Minimum before any result is reported.

## Stopping rule
When this experiment ends, decided in advance. A date or a unit count — never "when it looks significant".

## Threats
What could make this result wrong. Contamination, spillover between recommendations to the same store, seasonality, the seller learning from an earlier variant.

## Result
Filled in after stopping. Include the negative case.

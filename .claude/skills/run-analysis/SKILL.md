---
name: run-analysis
description: Run the pre-registered analysis for an experiment using the exclusions and model recorded in the analysis plan. Use whenever the user asks for experiment results, whether something worked, action rates, statistics, findings, or a summary of what the platform data shows.
---

# Run analysis

Read the plan first, then the data. Never the other way round.

Writing a fresh query when curious about a result is how anyone ends up reporting whichever comparison happened to look best. It rarely feels like cherry-picking from the inside — it feels like exploring.

## Sequence

### 1. Read the plan
`docs/03-research/analysis-plan.md` and the experiment's own file in `docs/03-research/experiments/`.

Take from them: the primary metric, the exclusions, the model, the stopping rule.

### 2. Check the stopping rule
Has the experiment reached its date or its unit count?

If not, the numbers can be produced but **must be labelled as an interim look, and must not be used to decide anything** — including whether to stop. Looking repeatedly and stopping at a good moment manufactures significance out of noise.

### 3. Apply exclusions exactly as written
`is_seed = true`, recommendations delivered within seven days of study end, stores with no published products at delivery, plus any recorded in the experiment file.

Report how many rows each exclusion removed. A rule that removes 60% of the data needs discussing before anything else.

### 4. Compute the primary metric
For each `Recommendation` with a non-null `delivered_at`: acted = an `Event` exists with matching `store_id`, a `type` mapping to the recommendation's `action_type`, and `occurred_at` within seven days after `delivered_at`.

Rate = acted / delivered, by variant.

### 5. Fit the model in the plan
Action as outcome, variant as predictor, **store as a fixed effect**. Recommendations to the same store are not independent — a store that acts on one is more likely to act on the next, and ignoring that overstates confidence.

### 6. Secondary metrics
Compute and label them exploratory. They do not support a claim of success.

### 7. Write it down
`docs/03-research/findings/EXP-NNN.md`, whatever the result.

A null result is a finding and is written up with the same care. For this project a null result on framing is genuinely informative: it would suggest the barrier for micro-entrepreneurs is capacity rather than motivation.

## Do not

- Add an exclusion that was not pre-registered, without recording the date and reason in the plan
- Switch the primary metric after seeing the primary metric
- Promote a secondary metric to primary because it looks better
- Report a result below the minimum sample size in the experiment file

If the data suggests the plan was wrong, say so plainly and write a new experiment. Do not quietly repair the old one.

## Report back

Report in this order: n before exclusions, n after, rate per variant, model output, and whether the stopping rule was met. State the result in one sentence, including when that sentence is "no difference was detected".

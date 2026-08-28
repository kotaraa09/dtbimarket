---
name: new-experiment
description: Design and register a randomised experiment before any code is written for it — hypothesis, variants, unit of randomisation, primary metric, exclusions, and stopping rule. Use whenever the user mentions running an experiment, an A/B test, comparing variants or framings, testing whether something changes behaviour, or measuring the effect of a change on sellers or buyers.
---

# New experiment

The design document comes first. Not as process for its own sake — writing the exclusions and the stopping rule *after* seeing data means choosing whichever version makes the result look best, and that choice is usually invisible even to the person making it.

**Do not write code for an experiment until its file is complete.** This is the rule most likely to be dropped near a deadline, and dropping it costs the semester rather than the afternoon.

## Step 1 — Write the file

Copy `docs/03-research/experiments/TEMPLATE.md` to `EXP-NNN-short-name.md`, taking the next free number.

Work through it with the user. Do not fill gaps with plausible defaults — an unanswered question is a design decision that has not been made yet.

**Question** — one sentence, answerable with data.

**Hypothesis** — the prediction and the reason for it, written before any data is seen.

**Unit of randomisation** — default to the *recommendation*. Randomising by store gives too few units to detect anything at this scale. If the user proposes the store as the unit, say plainly how few units that leaves and what it does to the chance of finding a real effect.

**Variants** — recorded verbatim, exactly as the seller will see them. Use the `variant-copy` skill to write them; variants that differ in more than framing measure something other than framing.

**Primary metric** — exactly one. Write the actual join: which tables, which condition, which window. "Engagement" is not a metric; a query is.

**Secondary metrics** — exploratory, and labelled as such. They do not get used to declare success.

**Exclusions** — decided now. Typically `is_seed = true`, stores with no published products at delivery, and anything delivered inside the final seven days of the study, which cannot have a full 7-day window.

**Sample size** — expected units, and the minimum below which no result is reported.

**Stopping rule** — a date or a unit count. Never "when it looks significant".

**Threats** — what could make the result wrong. For this project, most often: spillover, where a seller learns from one variant and applies it to a later recommendation in a different arm.

## Step 2 — Register in the database

Create the `Experiment` row with `status = draft`, and one `Variant` row per variant, with text matching the file exactly. If the file and the database disagree, the analysis is analysing something nobody designed.

## Step 3 — Only now, code

Assignment is server-side, written once at first exposure, read from the database afterwards. Never re-rolled on refresh, re-login, or re-render.

Set `status = running` and `started_at` only when assignment goes live.

## While it runs

Nothing changes. Not the variant text, not the assignment logic, not the advisor prompt. If a change is genuinely needed, this experiment stops and a new one begins with a new ID, and both files record why.

## Report back

Give the experiment ID, the unit of randomisation, the primary metric as a sentence, and the stopping rule. If any section of the file is still blank, say so and do not proceed to step 3.

# Project skills

Skills are procedures. `CLAUDE.md` holds the rules that must be known at all times; a skill holds a sequence of steps that is only needed when a particular kind of work comes up. A rule that is buried in a skill will not be read at the moment it matters. A ten-step procedure pasted into `CLAUDE.md` crowds out the rules that do.

Each skill is a folder containing `SKILL.md`. The frontmatter `description` decides when it loads, so it is written to trigger readily — under deadline pressure the failure mode is a skill that never fires, not one that fires too often.

## What each skill is for

| Skill | Say something like | What it protects |
|---|---|---|
| `feature-slice` | "add a way for sellers to set holiday dates" | The event that would otherwise be forgotten |
| `add-event` | "track when a seller changes a price" | Events that get stored but never counted |
| `db-change` | "add `is_featured` to Product" | Append-only research tables |
| `advisor-recommendation` | "add advice about products with no photos" | The advisor's grounding — the whole moat |
| `new-experiment` | "start an experiment comparing instruction vs comparison" | The thesis |
| `variant-copy` | "write three variants for the photo recommendation" | Experiment validity |
| `run-analysis` | "analyse EXP-003" | The pre-registered plan |

## Reading them in order

**`feature-slice`** is the one used most days. Building a feature in this repo touches seven places, and the seventh — emitting the event — is the one that gets skipped when the other six are working and the feature looks finished. The skill exists to make the sequence identical every time so nothing depends on remembering.

**`add-event`** covers the narrower case of introducing a new event type. Four places must change: the enum, the emit site, the `action_type` mapping if it is the target of a recommendation, and the analysis query that detects it. Stopping after the second is the common outcome — the event lands in the database and is invisible to the study. That is discovered during analysis, which is too late to fix.

**`db-change`** guards `Event`, `Assignment`, and `Recommendation`. One wrong `ALTER TABLE` on those loses experiment history permanently, and there is no undo and no backup that helps once a semester of collection is gone. The skill refuses and asks rather than proceeding.

**`advisor-recommendation`** wires a new piece of advice end to end: the query that produces the number, the snapshot that stores it, the `action_type`, the event that detects the action, and the copy. It also refuses to ship a recommendation containing any sentence that cannot be traced to a stored figure. That refusal is the point — an advisor that is allowed one ungrounded sentence is no longer distinguishable from a general chatbot, which is the entire argument for the product.

**`new-experiment`** writes the design document before any code exists, and declines to write code until it is complete. This is the rule most likely to be skipped when a deadline is close, and skipping it costs a semester rather than an afternoon.

**`variant-copy`** writes Thai variants that differ in framing and in nothing else — same politeness level, same length band, same register, no dialect in one and not another. If variant A is accidentally more polite than variant B, the experiment is measuring politeness, and nothing in the results will reveal that. The numbers come out clean and wrong.

**`run-analysis`** reads `docs/03-research/analysis-plan.md` and applies the exclusions and model recorded there. Writing a fresh query when curious about a result is how anyone ends up reporting whichever comparison happened to look best, without noticing they did it.

## Adding another

Add a skill when the same instruction has been repeated three times. Before then it is guesswork, and a skill that is not used drifts out of step with the repository until it is actively misleading. Few and accurate beats many and stale.

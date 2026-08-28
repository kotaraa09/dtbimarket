---
name: advisor-recommendation
description: Add a new grounded recommendation type to the AI advisor — the metric query, the stored snapshot, the action_type, the detecting event, and the Thai copy. Use whenever the user asks to add advice, suggestions, tips, insights, nudges, or coaching for sellers, or wants the advisor to say something new.
---

# Advisor recommendation

Every sentence the advisor produces must be traceable to a number stored in `metric_snapshot`.

This is not a style preference. The argument for this product is that a general chatbot has never seen this seller's listings, prices, visitors, or orders. An advisor allowed one ungrounded sentence is a chatbot with extra steps, and the thesis argument goes with it.

## Sequence

### 1. The metric query
Write the query that produces the number, in `services/advisor/`.

It must be computable for a store with very little activity. A recommendation that only triggers for a busy store will never fire — most stores here are quiet, especially early in the semester.

Decide the trigger threshold now, and write down why that threshold. "Fewer than 2 photos" needs a reason; "looks low" does not survive being asked about.

### 2. The snapshot
Store the exact numbers used, in `Recommendation.metric_snapshot`, at generation time.

Not a reference to a live query — the value **as it was when the advice was given**. The seller may fix the problem an hour later, and analysis still needs to know what was true when they were told.

### 3. The action type
Define what acting on this advice looks like, as one `action_type`.

It must be observable. "Improve the listing" cannot be detected; "added a product photo" can.

### 4. The detecting event
Confirm an event type exists that maps to this `action_type`. If not, use the `add-event` skill before continuing.

**Without this, the recommendation can never be marked as acted on**, and every variant of it will read as a failure in the results.

### 5. The copy
Use the `variant-copy` skill. If this recommendation is part of a running experiment, its variants must differ only in framing.

### 6. The grounding check
Read every sentence of the generated output and ask: which field of `metric_snapshot` does this come from?

Any sentence with no answer is removed. Common offenders, all of which sound helpful and are unsupported:

- "Customers are probably looking for more detail" — no data on what customers want
- "This is the best time to post" — no timing analysis exists
- "Similar stores are doing well with this" — only true if the comparison was actually computed and stored

Comparisons against other stores are allowed **only** when the comparison figure is in the snapshot.

## Report back

Give the trigger condition, the snapshot fields, the `action_type`, the event that detects it, and confirm the grounding check was run sentence by sentence.

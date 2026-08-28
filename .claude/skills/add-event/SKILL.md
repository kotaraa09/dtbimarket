---
name: add-event
description: Add a new event type to the append-only telemetry system, wired correctly across all four places it must appear. Use whenever the user mentions tracking, logging, recording, measuring, or instrumenting an action, asks whether something is being captured, or asks why an action is not appearing in analysis or in the action-rate calculation.
---

# Add an event

An event type is only useful if it can be counted later. Adding the enum value and the emit call makes events appear in the database; it does not make them countable. Four places must change together.

The usual failure: places 1 and 2 get done, rows accumulate for weeks, and the gap surfaces during analysis — after the collection window has closed.

## The four places

### 1. The event type
Add to the event type enum or constant in `packages/shared`.

Naming: `noun.past_tense_verb`, specific enough to count on its own.

- `product.photo_added` — countable
- `product.updated` — not countable, because it merges several different actions into one bucket and the study cannot separate them again

### 2. The emit site
In `apps/api`, at the point the action actually succeeds — after the write commits, never before, never in the UI.

Payload carries IDs and values only. No names, phone numbers, addresses, or email.

### 3. The `action_type` mapping
**Only if this event can be what a recommendation asks for.**

A recommendation stores an `action_type`. The 7-day action rate is computed by asking whether an event matching that `action_type` occurred for that store within seven days of delivery. If the mapping is missing, the recommendation can never be marked as acted on — and its variant will appear to have failed when it may have worked.

Update wherever `action_type` resolves to event types, then check whether an existing recommendation type quietly needs this new event too.

### 4. The analysis query
In `analysis/`, include the new type where it belongs and exclude it where it does not. Confirm `is_seed = true` rows are still filtered out.

## Check before finishing

- Can this event be counted per store, per day, without depending on a join that might be missing?
- If a recommendation asked a seller to do this, would the join find it?
- Does the payload contain anything that identifies a person?
- Does an existing event already cover this, making the new one a duplicate under a different name?

## Report back

List all four places and what changed in each. If place 3 was skipped, state explicitly that this event is not a recommendation target — that sentence is the record that it was considered.

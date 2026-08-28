---
name: feature-slice
description: Build a complete vertical feature slice in this repository — Prisma model, migration, Express endpoint, shared types, Next.js UI, event emission, tests, and log entry. Use this whenever the user asks to add, build, implement, or wire up any user-facing capability for sellers or buyers — a page, a form, a setting, a button, a flow — even when they describe it casually and say nothing about layers, events, or the database.
---

# Feature slice

A feature in this repository is not done when it works on screen. It is done when it works on screen **and produced an event**. The event is the part that gets skipped, because by the time the UI works the feature looks finished.

Events cannot be backfilled. A feature that shipped without one produced no data for the study, and the study window is locked to the university calendar.

## Before starting

Confirm one thing: **does this feature change what a seller or a buyer does?** If yes, it needs an event. If it is purely internal — a refactor, a cron job, an admin tool — say so and skip step 6.

If the request is ambiguous about behaviour ("make the dashboard better"), ask what the user should be able to *do* that they cannot do now. Build from that, not from the adjective.

## Sequence

Work in this order. Later steps depend on earlier ones, and starting from the UI tends to produce a schema shaped to fit the screen rather than the data.

### 1. Schema
Add or extend the Prisma model in `packages/db`. If the change touches `Event`, `Assignment`, or `Recommendation`, **stop** — those are append-only. Use the `db-change` skill and ask the owner.

### 2. Migration
`pnpm db:migrate`. Verify it runs against a clean database, not just the current one. A migration that only works against your machine's existing state will fail on deployment.

### 3. API
Add the endpoint in `apps/api`. Include:
- An auth check — who may call this, and does the resource belong to them
- Input validation at the boundary, not inside business logic
- No personal data in any log line

### 4. Shared types
Add types to `packages/shared`. Both web and api import from there. Do not define the same type twice; the copies will diverge.

### 5. UI
Build in `apps/web`. Keep Thai copy short and in the same register as the rest of the app.

### 6. Event
Emit on success, in the API layer, not the UI. Emitting from the browser means it can be blocked, dropped, or replayed.

- `type` — past tense and specific: `product.price_changed`, not `update`
- `actor_type`, `actor_id`, `store_id`
- `payload` — IDs and values only. **No names, phone numbers, addresses, or email.**

If this event could be the target of a recommendation, use the `add-event` skill instead — it also wires the `action_type` mapping and the analysis query.

### 7. Tests
Cover the auth boundary and the event emission. If a test would only assert that a framework works, skip it.

### 8. Log
One line in `docs/06-log/YYYY-MM.md`: what was built, and anything surprising found along the way.

## Report back

Say which layers were touched and name the event type emitted. If no event was emitted, say why in one sentence — that sentence turns an omission into a decision.

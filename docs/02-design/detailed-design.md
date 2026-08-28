# Detailed design

**Status:** draft
**Written:** 2026-08-28
**Related:** `architecture.md`, `api-spec.md`, `database-schema.md`, `../04-testing/test-specs/TS-01-recommendation-to-action.md`

How the pieces named in the architecture are actually built. Code below is a sketch of the intended shape, not the final source.

## Module layout

```
apps/api/src/
  server.ts              app wiring, middleware order
  middleware/
    session.ts           resolves the signed-in user
    store-scope.ts       resolves and enforces the caller's store — REQ-A3
    validate.ts          schema validation at the boundary
    errors.ts            one error shape, no stack traces outbound
  modules/
    auth/                register, login, logout
    stores/              profile CRUD
    products/            CRUD, publish, price, stock
    photos/              upload, delete, storage adapter
    orders/              placement, status
    metrics/             THE metric layer — dashboard and advisor both read it
    recommendations/     delivery, assignment, dismissal
  events/
    types.ts             re-exports the constants from packages/shared
    emit.ts              the only place an Event row is written
  lib/
    clock.ts             injectable time — TS-01-09 depends on it
    ids.ts, logger.ts, config.ts

services/advisor/src/
  rules/photo_coverage.py    trigger + snapshot construction
  render.py                  template filling and the grounding guard
  api_client.py              calls GET /internal/stores/:id/metrics
  main.py                    POST /internal/advisor/generate
```

Middleware order matters and is fixed: `session → store-scope → validate → handler`. Validation after authorisation means an unauthorised caller cannot use validation error messages to learn which IDs exist.

## The event emitter

One function. Every event in the system goes through it, and nothing else inserts into `event`.

```ts
export async function emitEvent(tx: Prisma.TransactionClient, e: {
  type: EventType;                 // union from packages/shared, not string
  actorType: 'seller' | 'buyer' | 'system';
  actorId?: string;
  storeId?: string;
  entityType?: string;
  entityId?: string;
  payload?: Record<string, string | number | boolean>;
}) {
  assertNoPersonalData(e.payload);              // REQ-N2, TS-01-16
  await tx.event.create({ data: { ...e, occurredAt: clock.now(), payload: e.payload ?? {} } });
}
```

Three properties are doing the work.

**It takes a transaction client, not the global one.** The caller must already be inside a transaction, so the event cannot be written for an action that did not commit.

**The payload type excludes objects and arrays.** Nested structures are where a `buyer` object with a `display_name` inside eventually gets passed. Flat primitives make `assertNoPersonalData` a check that can actually be complete: it validates keys against an allowlist per event type, rather than hunting for personal data by name.

**`EventType` is a union, not a string.** A typo is a compile error rather than a category of event that quietly never gets counted.

### Why inside the transaction, not after commit

The `feature-slice` skill says to emit after the write commits, meaning: never before, and never from the UI. Writing the event *in the same transaction* satisfies that intent more strongly than writing it after the commit returns.

If the event is inserted after commit, there is a window — a crashed process, a dropped connection, a container recycled mid-request — where the photo exists and its event does not. The seller acted, and the study will score that recommendation as ignored. Inside one transaction there is no window: either both rows exist or neither does.

The cost: the event row is written before the file upload's own commit in an external system, so a storage write that succeeds while the database transaction rolls back leaves an orphaned file. An orphaned file is a cleanup job. A missing event is a permanently wrong number in the thesis.

Recorded as ADR-0001.

## Assignment

Called only from the delivery path, only on the server.

```ts
async function assignVariant(tx, experimentId: string, unitType: 'recommendation', unitId: string) {
  const existing = await tx.assignment.findUnique({
    where: { experimentId_unitType_unitId: { experimentId, unitType, unitId } }
  });
  if (existing) return existing.variantId;               // stable forever — REQ-F4

  const variants = await tx.variant.findMany({ where: { experimentId }, orderBy: { key: 'asc' } });
  const chosen = variants[randomInt(variants.length)];   // server-side, once

  try {
    await tx.assignment.create({
      data: { experimentId, variantId: chosen.id, unitType, unitId, assignedAt: clock.now() }
    });
    return chosen.id;
  } catch (err) {
    if (isUniqueViolation(err)) {                        // lost a race — ALT-7
      const winner = await tx.assignment.findUnique({ /* same key */ });
      return winner.variantId;                           // never re-roll
    }
    throw err;
  }
}
```

**Why a random draw plus a unique constraint, and not a hash of the unit ID.** A hash is stateless and reproducible, which is attractive. It is also silently re-derivable, which means that if the hash input or the variant ordering ever changes — a variant added, a key renamed — every past assignment is reinterpreted, and nothing in the data shows that it happened. A persisted row cannot be reinterpreted. `CLAUDE.md` rule 3 requires persistence, and this is why.

**Balance.** A uniform draw per recommendation gives roughly even arms in expectation but can drift with small samples. Block randomisation within a store would balance better; it also correlates consecutive recommendations to the same store, which the store fixed effect in the analysis plan then has to absorb. Decision belongs in the EXP-001 document, with the sample size, not here.

## Recommendation delivery

```
GET /recommendations/current
  └─ resolve caller's store (store-scope middleware)
  └─ metrics = metricsModule.forStore(storeId, now)         same code as the dashboard
  └─ candidate = advisor.generate(storeId, metrics)          800 ms budget; 204 → return null
  └─ BEGIN
       recId       = newId()
       variantId   = assignVariant(tx, experiment.id, 'recommendation', recId)
       snapshot    = candidate.metric_snapshot                frozen here, never re-read
       { title, body } = render(variant.template, snapshot)   throws if a placeholder is unresolved
       INSERT Recommendation { id: recId, storeId, actionType, variantId, snapshot,
                               deliveredAt: clock.now() }
       emitEvent(tx, 'recommendation.delivered', { recommendation_id, experiment_id,
                                                   variant_id, action_type })
     COMMIT
  └─ 200 { recommendation }   ← without variant_id
```

Four details are deliberate.

**The recommendation ID is generated before the insert**, because it is the randomisation unit and the assignment row needs it. Assignment and recommendation are written in one transaction, so an assignment can never exist for a recommendation that was never delivered.

**The snapshot is frozen at generation and never re-read.** The card keeps saying "4 products" after the seller fixes three of them. That looks like a bug and is the requirement (TS-01-05); PR-01 shows it on screen with a note explaining why.

**Rendering can throw.** If the variant template references `category_avg_photos` and the snapshot has no such key, the whole delivery fails and nothing is written. The alternative — rendering an empty string into the sentence — produces a recommendation that is live, ungrounded, and indistinguishable in the data from a good one.

**One recommendation per response.** Whether a store may receive several per week is OQ-J3, and it changes the fatigue profile and the spillover between units. Until it is answered, the endpoint returns at most one.

## Copy rendering and the grounding guard

```python
PLACEHOLDER = re.compile(r"\{(\w+)\}")

def render(template: str, snapshot: dict) -> str:
    missing = [k for k in PLACEHOLDER.findall(template) if k not in snapshot]
    if missing:
        raise UngroundedTemplate(missing)      # refuse to deliver — rule 7
    return PLACEHOLDER.sub(lambda m: fmt(snapshot[m.group(1)]), template)
```

Every number a seller reads is a key of the snapshot that was stored beside it. Not a live query, not a constant in the template, not a value the model produced. This is checkable after the fact: take any delivered recommendation, take its stored snapshot, re-render, and the text must be identical.

Two limits worth stating plainly. The guard catches missing numbers; it does not catch an ungrounded sentence containing no number — "ลูกค้าน่าจะอยากเห็นรูปมากกว่านี้" passes it. That remains a human review of every template before the freeze, per the `advisor-recommendation` skill and TS-01-13. And the template checksum check at start-up catches text that drifted from what was pre-registered, but only if the experiment document records the checksum, which is a step in the EXP-001 write-up.

## The metric layer

One module, in the API, in TypeScript. The advisor calls it over HTTP instead of writing its own SQL.

```ts
export async function forStore(storeId: string, asOf: Date) {
  const since = subDays(asOf, 7);
  return {
    period_days: 7,
    store_views:  await countEvents(storeId, 'storefront.viewed', since, asOf),
    orders:       await countOrders(storeId, since, asOf),
    revenue_satang: await sumRevenue(storeId, since, asOf),
    published_products:      await countProducts(storeId, 'published'),
    products_under_2_photos: await countProductsUnderPhotos(storeId, 2),
    computed_at: asOf,
  };
}
```

Every query filters `is_seed = false`. The photo-coverage one is the metric that matters most:

```sql
SELECT count(*) FROM product p
WHERE p.store_id = $1 AND p.status = 'published' AND p.is_seed = false
  AND (SELECT count(*) FROM product_photo ph
       WHERE ph.product_id = p.id AND ph.is_seed = false) < $2;
```

Duplicating this in Python for the advisor would be two implementations of one definition, and the day they disagree is the day the dashboard says 4 and the card says 5 and the seller stops believing both. REQ-D2 exists for that reason, and the HTTP hop is the price of holding it.

## Trigger thresholds

The photo-coverage rule fires when at least one published product has fewer than two photos.

Two is the threshold because one photo is what the create-product form produces by default, so a count of one carries no information about effort, while a second photo is the smallest change a seller can make that is visible to a buyer. It is a defensible line, not a discovered optimum — written down here so that when it is questioned in the defence there is an answer that is not "it looked low".

The rule must also fire for a store with almost no activity (REQ-N5). It depends only on products and photos, never on traffic, precisely so that a quiet store early in the semester is still reachable.

## Time

```ts
export interface Clock { now(): Date }
export const systemClock: Clock = { now: () => new Date() };
```

Injected into the emitter, the delivery path and the analysis window logic. Nothing calls `new Date()` inline. Without this, TS-01-09 — the exact seven-day boundary, the definition of the primary metric — cannot be written, and the metric ships untested.

## Errors and logging

- One error shape, produced by one middleware. No stack traces leave the process.
- Structured logs: `request_id`, `route`, `status`, `duration_ms`, `user_id`, `store_id`. Never an email, a name, a phone number or an address.
- Unexpected errors log the request ID and the error; the client gets the request ID so a seller can quote it in a message without either of us needing their personal details to find the incident.

## Failure modes

| Failure | Behaviour | Why |
|---|---|---|
| Advisor times out or errors | No recommendation, nothing written, dashboard renders normally | A missing card costs one impression; a half-written recommendation is permanent bad data |
| Object storage unavailable | Upload returns 503, transaction rolls back, no event | An event for a photo that is not there inflates a variant's action rate |
| Database unavailable | 503 on everything, readiness probe fails | Better a clear outage than a session that appears to work and records nothing |
| Two tabs deliver at once | Unique constraint on assignment; loser reads the winner's row | One unit, one variant, always |
| Template drifted from the pre-registered text | Refuse to deliver, alert the owner | A silently different string is a different experiment |
| Seed data leaks into a metric | Caught by tests on the metric layer | Seed rows in a seller's numbers is also a trust problem, not only an analysis one |

## Testing seams

The design exists partly to make TS-01 writable at all:

| Seam | Enables |
|---|---|
| Injectable clock | TS-01-09 — the seven-day boundary |
| Single `emitEvent` | TS-01-16 — payload inspection in one place |
| Assignment as a pure-ish function over a transaction | TS-01-01, 02, 03 |
| Snapshot frozen at insert | TS-01-05 |
| Render throws on unresolved placeholder | TS-01-13 |
| `action_type` mapping in `packages/shared` | TS-01-08 — enumerable at test time |

## Configuration

Environment variables only: `DATABASE_URL`, `SESSION_SECRET`, `STORAGE_*`, `ADVISOR_URL`, `ADVISOR_SHARED_SECRET`, `NODE_ENV`. Validated once at start-up, and the process refuses to boot if one is missing — a service that starts without its session secret and generates a new one per restart signs everybody out at random and looks like a bug in the login form.

No secrets in the repository, including in seeds and fixtures (REQ-N3).

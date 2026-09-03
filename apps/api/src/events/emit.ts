/**
 * The only place an Event row is written.
 *
 * Nothing else in this repository may call `prisma.event.create`. There is no
 * update path and no delete path anywhere, by design (ADR-0001, CLAUDE.md
 * rule 2).
 *
 * Three properties of the signature are doing the work, per detailed-design.md:
 *
 *   1. It takes a TRANSACTION CLIENT, not the global one. The caller must
 *      already be inside a transaction, so an event cannot be written for an
 *      action that did not commit — and, equally, an action cannot commit
 *      without its event. Either both rows exist or neither does.
 *
 *   2. The payload type excludes objects and arrays. Nested structures are
 *      where a `buyer` object with a `display_name` inside eventually gets
 *      passed. Flat primitives make the personal-data check completable.
 *
 *   3. `EventType` is a union, not a string. A typo is a compile error rather
 *      than a category of event that quietly never gets counted.
 */
import type { Prisma } from '@dtbi/db';
import {
  assertNoPersonalData,
  isEventType,
  type ActorType,
  type EventPayload,
  type EventType,
} from '@dtbi/shared';
import { getClock } from '../lib/clock.ts';

export interface EmitEventInput {
  type: EventType;
  actorType: ActorType;
  /** null/undefined for system events. */
  actorId?: string | null;
  /** The join key for the entire study. Set it whenever the action has a store. */
  storeId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  payload?: EventPayload;
  /** Set only by the seed script. Excluded from every analysis query. */
  isSeed?: boolean;
}

export async function emitEvent(
  tx: Prisma.TransactionClient,
  e: EmitEventInput,
): Promise<void> {
  // Defence for callers that reach here from untyped code. The union already
  // catches this at compile time; this catches it at run time.
  if (!isEventType(e.type)) {
    throw new Error(
      `Unknown event type "${e.type}". Add it to EVENT_TYPES in packages/shared first.`,
    );
  }

  // REQ-N2, TS-01-16. Throws rather than stripping: silently dropping a key
  // would let a feature ship believing it recorded something it did not.
  assertNoPersonalData(e.type, e.payload);

  await tx.event.create({
    data: {
      type: e.type,
      actorType: e.actorType,
      actorId: e.actorId ?? null,
      storeId: e.storeId ?? null,
      entityType: e.entityType ?? null,
      entityId: e.entityId ?? null,
      payload: e.payload ?? {},
      occurredAt: getClock().now(),
      isSeed: e.isSeed ?? false,
    },
  });
}

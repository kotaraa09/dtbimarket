/**
 * The canonical event vocabulary.
 *
 * `feature-list.md` names this file as the source of truth: "The canonical event
 * enum will live in packages/shared once code exists." The API, the advisor and
 * the analysis all read from here so they cannot disagree about the spelling of
 * a string the entire thesis is joined on.
 *
 * Adding a type here is cheap. Renaming one is not: `event.type` is stored as
 * written and the table is append-only, so a rename splits one measure into two
 * that can never be recombined. Add a new type instead.
 */

export const EVENT_TYPES = [
  // A. Accounts and access
  'seller.registered',
  'seller.signed_in',
  'buyer.registered',
  'buyer.signed_in',

  // B. Store and catalogue
  'store.created',
  'store.profile_updated',
  'product.created',
  'product.description_changed',
  'product.deleted',
  'product.published',
  'product.unpublished',
  'product.photo_added',
  'product.photo_removed',
  'product.price_changed',
  'product.stock_changed',

  // C. Buyer browsing and ordering
  'catalog.viewed',
  'catalog.searched',
  'storefront.viewed',
  'product.viewed',
  'cart.item_added',
  'cart.item_removed',
  'order.placed',
  'order.status_changed',
  'order.cancelled',

  // D. Seller dashboard
  'dashboard.viewed',

  // E. AI advisor
  'recommendation.delivered',
  'recommendation.viewed',
  'recommendation.opened',
  'recommendation.dismissed',

  // F. Experiment infrastructure
  'experiment.started',
  'experiment.stopped',
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

const EVENT_TYPE_SET: ReadonlySet<string> = new Set(EVENT_TYPES);

export function isEventType(value: string): value is EventType {
  return EVENT_TYPE_SET.has(value);
}

export type ActorType = 'seller' | 'buyer' | 'system';

/**
 * `action_type` -> the event types that count as having taken that action.
 *
 * This mapping is the second half of the primary metric. `database-schema.md`
 * defines the 7-day action rate as a join from `recommendation` to `event`
 * where `e.type = ANY(:event_types_for_action)`, and this is where that array
 * comes from.
 *
 * CLAUDE.md: "If you add a recommendation type, you add the event that detects
 * it in the same change." An action_type with an empty array would score every
 * recommendation in its arm as ignored, and the failure would look like the
 * variant rather than like the wiring. TS-01-08 asserts this for every entry.
 */
export const ACTION_TYPE_EVENTS = {
  photo_added: ['product.photo_added'],
} as const satisfies Record<string, readonly EventType[]>;

export type ActionType = keyof typeof ACTION_TYPE_EVENTS;

export function eventTypesForAction(actionType: ActionType): readonly EventType[] {
  return ACTION_TYPE_EVENTS[actionType];
}

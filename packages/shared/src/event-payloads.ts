import type { EventType } from './events.ts';

/**
 * The keys each event type is allowed to carry.
 *
 * `detailed-design.md` specifies the guard as an allowlist per event type,
 * "rather than hunting for personal data by name". That direction matters: a
 * denylist only catches the personal data you thought of, while an allowlist
 * rejects the key you did not think about, which is the one that leaks.
 *
 * Every entry below is an ID, a count, a length, a status or an amount.
 * No names, phone numbers, addresses or email — REQ-N2, CLAUDE.md rule 8.
 *
 * Note two deliberate absences:
 *   - `catalog.searched` carries `query_length`, never the query text. A search
 *     box is where people type things about themselves.
 *   - `product.description_changed` carries lengths, never the description.
 *
 * The `satisfies` clause makes a missing event type a compile error, so a new
 * event cannot be emitted without someone deciding what it may carry.
 */
export const EVENT_PAYLOAD_KEYS = {
  'seller.registered': [],
  'seller.signed_in': [],
  'buyer.registered': [],
  'buyer.signed_in': [],

  'store.created': ['category'],
  'store.profile_updated': [
    'name_changed',
    'description_changed',
    'category_changed',
    'contact_changed',
  ],

  'product.created': ['price_satang', 'stock', 'status'],
  'product.description_changed': [
    'name_changed',
    'description_length_before',
    'description_length_after',
  ],
  'product.deleted': ['status_before', 'photo_count'],
  'product.published': ['photo_count'],
  'product.unpublished': ['photo_count'],
  'product.photo_added': ['photo_count', 'position'],
  'product.photo_removed': ['photo_count'],
  'product.price_changed': ['price_satang_before', 'price_satang_after'],
  'product.stock_changed': ['stock_before', 'stock_after'],

  'catalog.viewed': ['result_count'],
  'catalog.searched': ['category', 'result_count', 'query_length'],
  'storefront.viewed': ['product_count'],
  'product.viewed': ['price_satang'],
  'cart.item_added': ['product_id', 'quantity'],
  'cart.item_removed': ['product_id', 'quantity'],
  'order.placed': ['item_count', 'total_satang'],
  'order.status_changed': ['status_before', 'status_after'],
  'order.cancelled': ['cancelled_by', 'status_before'],

  'dashboard.viewed': ['period_days'],

  'recommendation.delivered': [
    'recommendation_id',
    'experiment_id',
    'variant_id',
    'action_type',
  ],
  'recommendation.viewed': ['recommendation_id'],
  'recommendation.opened': ['recommendation_id'],
  'recommendation.dismissed': ['recommendation_id'],

  'experiment.started': ['experiment_id'],
  'experiment.stopped': ['experiment_id'],
} as const satisfies Record<EventType, readonly string[]>;

/** Flat primitives only. Nested objects are where a `buyer` with a
 *  `display_name` inside eventually gets passed — see detailed-design.md. */
export type EventPayload = Record<string, string | number | boolean>;

export class PersonalDataInPayloadError extends Error {
  readonly type: EventType;

  constructor(type: EventType, message: string) {
    super(`[${type}] ${message}`);
    this.name = 'PersonalDataInPayloadError';
    this.type = type;
  }
}

/**
 * Defence in depth. The allowlist above is the real guard; this catches the
 * case where someone adds a personal-looking key *to* the allowlist without
 * thinking, which is the more likely mistake once the allowlist is trusted.
 */
const BANNED_KEY_FRAGMENTS = [
  'email',
  'name',
  'phone',
  'tel',
  'address',
  'contact',
  'display',
  'password',
  'token',
  'secret',
  'line_id',
  'lineid',
];

const ALLOWED_NAME_KEYS: ReadonlySet<string> = new Set([
  // "was the name changed" is a boolean about a field, not the field.
  'name_changed',
]);

export function assertNoPersonalData(type: EventType, payload?: EventPayload): void {
  if (payload === undefined) return;

  const allowed: readonly string[] = EVENT_PAYLOAD_KEYS[type];

  for (const [key, value] of Object.entries(payload)) {
    if (!allowed.includes(key)) {
      throw new PersonalDataInPayloadError(
        type,
        `payload key "${key}" is not in the allowlist for this event type. ` +
          `Allowed: ${allowed.length ? allowed.join(', ') : '(none)'}. ` +
          `Add it to EVENT_PAYLOAD_KEYS only if it is an ID, count, length, status or amount.`,
      );
    }

    const t = typeof value;
    if (t !== 'string' && t !== 'number' && t !== 'boolean') {
      throw new PersonalDataInPayloadError(
        type,
        `payload key "${key}" has type ${t}. Only flat string, number or boolean are allowed.`,
      );
    }

    if (!ALLOWED_NAME_KEYS.has(key)) {
      const lower = key.toLowerCase();
      const hit = BANNED_KEY_FRAGMENTS.find((f) => lower.includes(f));
      if (hit) {
        throw new PersonalDataInPayloadError(
          type,
          `payload key "${key}" contains "${hit}", which reads as personal data (REQ-N2).`,
        );
      }
    }
  }
}

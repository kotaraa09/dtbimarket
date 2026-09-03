/**
 * The personal-data guard is the one piece of this repository that cannot be
 * fixed after the fact. The event table is append-only, so a payload that
 * carried a phone number into production stays there.
 *
 * These tests are therefore about REQ-N2 and PDPA, not about code coverage.
 */
import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import {
  assertNoPersonalData,
  EVENT_PAYLOAD_KEYS,
  PersonalDataInPayloadError,
} from './event-payloads.ts';
import { ACTION_TYPE_EVENTS, EVENT_TYPES, isEventType } from './events.ts';

describe('assertNoPersonalData', () => {
  test('accepts a payload whose keys are all on the allowlist', () => {
    assert.doesNotThrow(() =>
      assertNoPersonalData('product.price_changed', {
        price_satang_before: 4500,
        price_satang_after: 5000,
      }),
    );
  });

  test('accepts an absent payload', () => {
    assert.doesNotThrow(() => assertNoPersonalData('seller.signed_in', undefined));
  });

  test('rejects a key that is not on the allowlist for that event type', () => {
    assert.throws(
      () =>
        assertNoPersonalData('product.price_changed', {
          price_satang_before: 1,
          price_satang_after: 2,
          // Plausible, useful, and exactly the kind of thing that leaks.
          buyer_email: 'someone@example.com',
        } as never),
      PersonalDataInPayloadError,
    );
  });

  test('rejects a key that is valid for a DIFFERENT event type', () => {
    // `category` is allowed on store.created but says nothing on a price change.
    assert.throws(
      () => assertNoPersonalData('product.price_changed', { category: 'food' } as never),
      PersonalDataInPayloadError,
    );
  });

  test('rejects nested objects', () => {
    assert.throws(
      () =>
        assertNoPersonalData('order.placed', {
          item_count: 2,
          total_satang: { amount: 1 },
        } as never),
      PersonalDataInPayloadError,
    );
  });

  test('rejects arrays', () => {
    assert.throws(
      () => assertNoPersonalData('order.placed', { item_count: [1, 2] } as never),
      PersonalDataInPayloadError,
    );
  });

  test('rejects a personal-looking key even if someone allowlisted it', () => {
    // Simulates the likelier mistake: the allowlist gets edited carelessly once
    // it is trusted. The banned-fragment check is the second net.
    const patched = EVENT_PAYLOAD_KEYS as unknown as Record<string, string[]>;
    const original = patched['dashboard.viewed'];
    patched['dashboard.viewed'] = ['period_days', 'seller_phone'];

    try {
      assert.throws(
        () =>
          assertNoPersonalData('dashboard.viewed', {
            period_days: 7,
            seller_phone: '0812345678',
          } as never),
        PersonalDataInPayloadError,
      );
    } finally {
      patched['dashboard.viewed'] = original!;
    }
  });

  test('catalog.searched cannot carry the query text', () => {
    // REQ-N2 has no exception for search: a search box is where people type
    // things about themselves.
    assert.throws(
      () =>
        assertNoPersonalData('catalog.searched', {
          category: 'food',
          result_count: 3,
          query_length: 12,
          query: 'ร้านของสมชาย',
        } as never),
      PersonalDataInPayloadError,
    );

    assert.doesNotThrow(() =>
      assertNoPersonalData('catalog.searched', {
        category: 'food',
        result_count: 3,
        query_length: 12,
      }),
    );
  });
});

describe('event vocabulary', () => {
  test('every event type has a payload allowlist entry', () => {
    // The `satisfies` clause enforces this at compile time; this asserts it at
    // run time too, so a JS-side edit cannot slip past.
    for (const type of EVENT_TYPES) {
      assert.ok(
        Object.prototype.hasOwnProperty.call(EVENT_PAYLOAD_KEYS, type),
        `${type} has no payload allowlist`,
      );
    }
  });

  test('event type names are noun.past_tense_verb', () => {
    for (const type of EVENT_TYPES) {
      assert.match(type, /^[a-z]+\.[a-z_]+$/, `${type} does not match the naming rule`);
    }
  });

  test('isEventType rejects a near miss', () => {
    assert.equal(isEventType('product.photo_added'), true);
    assert.equal(isEventType('product.photo_add'), false);
    assert.equal(isEventType('product.updated'), false);
  });
});

describe('action_type mapping (TS-01-08)', () => {
  test('every action_type maps to at least one real event type', () => {
    // An action_type with no detecting event scores every recommendation in its
    // arm as ignored, and the failure looks like the variant rather than the
    // wiring. CLAUDE.md requires the event to arrive in the same change.
    const entries = Object.entries(ACTION_TYPE_EVENTS);
    assert.ok(entries.length > 0, 'no action types registered');

    for (const [actionType, eventTypes] of entries) {
      assert.ok(
        eventTypes.length > 0,
        `action_type "${actionType}" maps to no event types`,
      );
      for (const t of eventTypes) {
        assert.ok(
          isEventType(t),
          `action_type "${actionType}" maps to unknown event type "${t}"`,
        );
      }
    }
  });
});

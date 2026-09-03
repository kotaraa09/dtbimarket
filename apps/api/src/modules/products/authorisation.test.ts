/**
 * The two things the feature-slice skill says must be covered: the auth
 * boundary, and event emission.
 *
 * REQ-A3 / FEAT-A3 is a guard that emits nothing, so the only way it can be
 * shown to work is a test that tries to cross it. And the event assertions
 * matter more than the HTTP ones: a route that returns 200 without writing its
 * event looks completely correct from the browser and produces no data.
 *
 * Runs against its own database (.env.test), so it never writes event rows into
 * the database a demo or a real seller uses. Skips with an explanation if that
 * database is not configured, rather than failing and looking like a bug.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

const CONFIGURED =
  typeof process.env.DATABASE_URL === 'string' &&
  process.env.DATABASE_URL.includes('dtbimarket_test');

const skip = CONFIGURED
  ? false
  : 'needs .env.test pointing at dtbimarket_test — see .env.test.example';

let server: Server;
let base: string;
let prisma: typeof import('@dtbi/db').prisma;

before(async () => {
  if (!CONFIGURED) return;

  ({ prisma } = await import('@dtbi/db'));
  const { app } = await import('../../server.ts');

  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
});

after(async () => {
  if (!CONFIGURED) return;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface Caller {
  cookie: string;
  userId: string;
  storeId: string;
}

async function call(
  cookie: string | null,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; json: any; setCookie: string | null }> {
  const res = await fetch(base + path, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(cookie ? { cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return {
    status: res.status,
    json: text ? JSON.parse(text) : null,
    setCookie: res.headers.get('set-cookie'),
  };
}

/** A seller with a store, freshly created so tests never share state. */
async function makeSeller(): Promise<Caller> {
  const tag = randomUUID().slice(0, 8);

  const reg = await call(null, 'POST', '/auth/register', {
    email: `test-${tag}@example.invalid`,
    password: 'test-password-1234',
    displayName: `ผู้ทดสอบ ${tag}`,
    role: 'seller',
  });
  assert.equal(reg.status, 201, JSON.stringify(reg.json));

  const cookie = (reg.setCookie ?? '').split(';')[0]!;

  const store = await call(cookie, 'POST', '/stores', {
    name: `ร้านทดสอบ ${tag}`,
    slug: `test-${tag}`,
    category: 'food',
  });
  assert.equal(store.status, 201, JSON.stringify(store.json));

  return { cookie, userId: reg.json.user.id, storeId: store.json.store.id };
}

async function makeProduct(seller: Caller, priceSatang = 4500): Promise<string> {
  const r = await call(seller.cookie, 'POST', '/products', {
    name: 'สินค้าทดสอบ',
    priceSatang,
    stock: 5,
  });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  return r.json.product.id;
}

function eventsFor(entityId: string, type: string) {
  return prisma.event.findMany({
    where: { entityId, type },
    orderBy: { occurredAt: 'asc' },
  });
}

// ---------------------------------------------------------------------------
// The auth boundary — REQ-A3
// ---------------------------------------------------------------------------

describe('store-scoped authorisation', { skip }, () => {
  test('a seller cannot change another seller\'s price', async () => {
    const alice = await makeSeller();
    const bob = await makeSeller();
    const product = await makeProduct(alice);

    const r = await call(bob.cookie, 'PATCH', `/products/${product}/price`, {
      priceSatang: 1,
    });

    // 404, not 403. A 403 confirms the ID is real, which turns the endpoint
    // into a way to enumerate other sellers' catalogues.
    assert.equal(r.status, 404);
    assert.equal(r.json.error.code, 'product_not_found');

    const after_ = await prisma.product.findUniqueOrThrow({ where: { id: product } });
    assert.equal(after_.priceSatang, 4500, 'price must be untouched');

    assert.equal(
      (await eventsFor(product, 'product.price_changed')).length,
      0,
      'a refused request must not write an event',
    );
  });

  test('a seller cannot delete another seller\'s product', async () => {
    const alice = await makeSeller();
    const bob = await makeSeller();
    const product = await makeProduct(alice);

    const r = await call(bob.cookie, 'DELETE', `/products/${product}`);
    assert.equal(r.status, 404);

    assert.ok(
      await prisma.product.findUnique({ where: { id: product } }),
      'product must still exist',
    );
    assert.equal((await eventsFor(product, 'product.deleted')).length, 0);
  });

  test('a seller cannot publish another seller\'s product', async () => {
    const alice = await makeSeller();
    const bob = await makeSeller();
    const product = await makeProduct(alice);

    const r = await call(bob.cookie, 'POST', `/products/${product}/publish`);
    assert.equal(r.status, 404);

    const after_ = await prisma.product.findUniqueOrThrow({ where: { id: product } });
    assert.equal(after_.status, 'draft');
  });

  test('an anonymous caller is refused with 401, not 404', async () => {
    const alice = await makeSeller();
    const product = await makeProduct(alice);

    const r = await call(null, 'PATCH', `/products/${product}/price`, { priceSatang: 1 });
    assert.equal(r.status, 401);
    assert.equal(r.json.error.code, 'not_signed_in');
  });

  test('a seller with no store cannot reach store-scoped routes', async () => {
    const tag = randomUUID().slice(0, 8);
    const reg = await call(null, 'POST', '/auth/register', {
      email: `nostore-${tag}@example.invalid`,
      password: 'test-password-1234',
      displayName: 'ยังไม่มีร้าน',
      role: 'seller',
    });
    const cookie = (reg.setCookie ?? '').split(';')[0]!;

    const r = await call(cookie, 'GET', '/products/mine');
    assert.equal(r.status, 404);
    assert.equal(r.json.error.code, 'store_not_found');
  });
});

// ---------------------------------------------------------------------------
// Event emission
// ---------------------------------------------------------------------------

describe('event emission', { skip }, () => {
  test('a price change writes exactly one event with before and after', async () => {
    const alice = await makeSeller();
    const product = await makeProduct(alice, 4500);

    const r = await call(alice.cookie, 'PATCH', `/products/${product}/price`, {
      priceSatang: 5000,
    });
    assert.equal(r.status, 200);

    const events = await eventsFor(product, 'product.price_changed');
    assert.equal(events.length, 1);

    const e = events[0]!;
    assert.deepEqual(e.payload, {
      price_satang_before: 4500,
      price_satang_after: 5000,
    });
    assert.equal(e.actorType, 'seller');
    assert.equal(e.actorId, alice.userId);
    assert.equal(e.storeId, alice.storeId, 'store_id is the join key for the study');
    assert.equal(e.entityType, 'product');
  });

  test('a no-op price change writes no event', async () => {
    const alice = await makeSeller();
    const product = await makeProduct(alice, 4500);

    const r = await call(alice.cookie, 'PATCH', `/products/${product}/price`, {
      priceSatang: 4500,
    });
    assert.equal(r.status, 200);

    // "A seller pressed save" is not the same fact as "a seller changed a
    // price", and counting the first as the second inflates the measure.
    assert.equal((await eventsFor(product, 'product.price_changed')).length, 0);
  });

  test('price and stock are separately countable, not one product.updated', async () => {
    const alice = await makeSeller();
    const product = await makeProduct(alice, 4500);

    await call(alice.cookie, 'PATCH', `/products/${product}/price`, { priceSatang: 6000 });
    await call(alice.cookie, 'PATCH', `/products/${product}/stock`, { stock: 12 });

    assert.equal((await eventsFor(product, 'product.price_changed')).length, 1);
    assert.equal((await eventsFor(product, 'product.stock_changed')).length, 1);
  });

  test('deleting a product writes the event before the row disappears', async () => {
    const alice = await makeSeller();
    const product = await makeProduct(alice);
    await call(alice.cookie, 'POST', `/products/${product}/publish`);

    const r = await call(alice.cookie, 'DELETE', `/products/${product}`);
    assert.equal(r.status, 204);

    assert.equal(await prisma.product.findUnique({ where: { id: product } }), null);

    // The event survives the row it describes. That is the whole point of the
    // table having no foreign keys (ADR-0001).
    const events = await eventsFor(product, 'product.deleted');
    assert.equal(events.length, 1);
    assert.deepEqual(events[0]!.payload, { status_before: 'published', photo_count: 0 });
  });

  test('a validation failure writes no event', async () => {
    const alice = await makeSeller();
    const product = await makeProduct(alice);

    const r = await call(alice.cookie, 'PATCH', `/products/${product}/price`, {
      priceSatang: -1,
    });
    assert.equal(r.status, 422);
    assert.equal((await eventsFor(product, 'product.price_changed')).length, 0);
  });

  test('no event payload contains personal data', async () => {
    const alice = await makeSeller();
    const product = await makeProduct(alice);
    await call(alice.cookie, 'PATCH', `/products/${product}`, {
      name: 'ชื่อใหม่',
      description: 'ติดต่อ 081-234-5678',
    });

    // TS-01-16. The description above deliberately contains a phone number:
    // the event must carry its LENGTH, never its text.
    const events = await eventsFor(product, 'product.description_changed');
    assert.equal(events.length, 1);

    const serialised = JSON.stringify(events[0]!.payload);
    assert.ok(!serialised.includes('081'), 'phone number leaked into the payload');
    assert.ok(!serialised.includes('ชื่อใหม่'), 'product name leaked into the payload');
    assert.deepEqual(events[0]!.payload, {
      name_changed: true,
      description_length_before: 0,
      description_length_after: 'ติดต่อ 081-234-5678'.length,
    });
  });
});

// ---------------------------------------------------------------------------
// Append-only
// ---------------------------------------------------------------------------

describe('the event table is append-only', { skip }, () => {
  test('the database refuses an UPDATE even from the owning role', async () => {
    const alice = await makeSeller();
    const product = await makeProduct(alice);
    await call(alice.cookie, 'PATCH', `/products/${product}/price`, { priceSatang: 7000 });

    const event = (await eventsFor(product, 'product.price_changed'))[0]!;

    await assert.rejects(
      () =>
        prisma.$executeRaw`UPDATE "event" SET type = 'tampered' WHERE id = ${event.id}`,
      /append-only/,
    );
  });

  test('the database refuses a DELETE', async () => {
    const alice = await makeSeller();
    const product = await makeProduct(alice);
    await call(alice.cookie, 'PATCH', `/products/${product}/stock`, { stock: 9 });

    const event = (await eventsFor(product, 'product.stock_changed'))[0]!;

    await assert.rejects(
      () => prisma.$executeRaw`DELETE FROM "event" WHERE id = ${event.id}`,
      /append-only/,
    );

    assert.ok(await prisma.event.findUnique({ where: { id: event.id } }));
  });
});

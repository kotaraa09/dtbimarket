/**
 * PB-10 tests.
 *
 * `product.photo_added` is the event that detects action on the first planned
 * recommendation, which makes it the primary metric of the thesis. These tests
 * are therefore weighted toward the event rather than the HTTP response: an
 * upload that returns 201 without writing its event looks perfect from the
 * browser and silently scores the seller as having ignored the advice.
 *
 * Uses the in-memory storage driver (.env.test). The S3 path is exercised
 * manually against MinIO — recorded as a gap in docs/04-testing/README.md.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { deflateSync, crc32 } from 'node:zlib';
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
// Fixtures
// ---------------------------------------------------------------------------

function chunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function pngBytes(width = 2, height = 2): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const row = Buffer.concat([
    Buffer.from([0]),
    Buffer.concat(Array.from({ length: width }, () => Buffer.from([10, 20, 30]))),
  ]);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const JPEG_BYTES = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  Buffer.alloc(64, 7),
]);

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

/** Upload, with the declared content type controllable so it can be a lie. */
async function uploadPhoto(
  cookie: string,
  productId: string,
  bytes: Buffer,
  { filename = 'photo.png', declaredType = 'image/png' } = {},
): Promise<{ status: number; json: any }> {
  const form = new FormData();
  form.append(
    'file',
    new File([new Uint8Array(bytes)], filename, { type: declaredType }),
  );

  const res = await fetch(`${base}/products/${productId}/photos`, {
    method: 'POST',
    headers: { cookie },
    body: form,
  });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null };
}

interface Caller {
  cookie: string;
  userId: string;
  storeId: string;
}

async function makeSeller(): Promise<Caller> {
  const tag = randomUUID().slice(0, 8);
  const reg = await call(null, 'POST', '/auth/register', {
    email: `photo-${tag}@example.invalid`,
    password: 'test-password-1234',
    displayName: `ผู้ทดสอบ ${tag}`,
    role: 'seller',
  });
  assert.equal(reg.status, 201, JSON.stringify(reg.json));
  const cookie = (reg.setCookie ?? '').split(';')[0]!;

  const store = await call(cookie, 'POST', '/stores', {
    name: `ร้านรูป ${tag}`,
    slug: `photo-${tag}`,
    category: 'food',
  });
  assert.equal(store.status, 201, JSON.stringify(store.json));

  return { cookie, userId: reg.json.user.id, storeId: store.json.store.id };
}

async function makeProduct(seller: Caller): Promise<string> {
  const r = await call(seller.cookie, 'POST', '/products', {
    name: 'สินค้าทดสอบ',
    priceSatang: 4500,
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
// The measured action
// ---------------------------------------------------------------------------

describe('product.photo_added — the primary metric', { skip }, () => {
  test('an upload writes the row and its event together', async () => {
    const alice = await makeSeller();
    const product = await makeProduct(alice);

    const r = await uploadPhoto(alice.cookie, product, pngBytes());
    assert.equal(r.status, 201, JSON.stringify(r.json));
    assert.equal(r.json.product.photo_count, 1);
    assert.equal(r.json.photo.position, 0);
    assert.ok(r.json.photo.url, 'a URL must be built at read time');

    const photos = await prisma.productPhoto.findMany({
      where: { productId: product },
    });
    assert.equal(photos.length, 1);

    const events = await eventsFor(product, 'product.photo_added');
    assert.equal(events.length, 1, 'exactly one event per photo');
    assert.deepEqual(events[0]!.payload, { photo_count: 1, position: 0 });
    assert.equal(events[0]!.storeId, alice.storeId, 'store_id is the study join key');
    assert.equal(events[0]!.actorId, alice.userId);
    assert.equal(events[0]!.actorType, 'seller');
  });

  test('photo_count counts up across uploads', async () => {
    const alice = await makeSeller();
    const product = await makeProduct(alice);

    const first = await uploadPhoto(alice.cookie, product, pngBytes());
    const second = await uploadPhoto(alice.cookie, product, JPEG_BYTES, {
      filename: 'second.jpg',
      declaredType: 'image/jpeg',
    });

    assert.equal(first.json.product.photo_count, 1);
    assert.equal(second.json.product.photo_count, 2);
    assert.equal(second.json.photo.position, 1);

    const events = await eventsFor(product, 'product.photo_added');
    assert.deepEqual(
      events.map((e) => e.payload),
      [
        { photo_count: 1, position: 0 },
        { photo_count: 2, position: 1 },
      ],
    );
  });

  test('the stored key is a key, not a URL', async () => {
    // database-schema.md: the row holds an object-storage key so the bucket can
    // move without rewriting rows. A persisted URL pins the data to one vendor.
    const alice = await makeSeller();
    const product = await makeProduct(alice);
    await uploadPhoto(alice.cookie, product, pngBytes());

    const photo = await prisma.productPhoto.findFirstOrThrow({
      where: { productId: product },
    });
    assert.ok(!photo.storageKey.includes('://'), 'storage_key must not be a URL');
    assert.match(photo.storageKey, /^stores\/.+\/products\/.+\.png$/);
  });

  test('removing a photo writes product.photo_removed with the count after', async () => {
    const alice = await makeSeller();
    const product = await makeProduct(alice);

    const a = await uploadPhoto(alice.cookie, product, pngBytes());
    await uploadPhoto(alice.cookie, product, pngBytes());

    const r = await call(
      alice.cookie,
      'DELETE',
      `/products/${product}/photos/${a.json.photo.id}`,
    );
    assert.equal(r.status, 200);
    assert.equal(r.json.product.photo_count, 1);

    const events = await eventsFor(product, 'product.photo_removed');
    assert.equal(events.length, 1);
    assert.deepEqual(events[0]!.payload, { photo_count: 1 });

    // The add events remain. The table is append-only: removing a photo does
    // not un-happen the fact that one was added.
    assert.equal((await eventsFor(product, 'product.photo_added')).length, 2);
  });
});

// ---------------------------------------------------------------------------
// REQ-N27 — upload constraints, verified server-side
// ---------------------------------------------------------------------------

describe('upload constraints (REQ-N27)', { skip }, () => {
  test('a non-image is refused however it labels itself', async () => {
    const alice = await makeSeller();
    const product = await makeProduct(alice);

    const r = await uploadPhoto(
      alice.cookie,
      product,
      Buffer.from('#!/bin/sh\necho not an image'),
      { filename: 'evil.png', declaredType: 'image/png' },
    );

    // The declared type said image/png. The bytes decide.
    assert.equal(r.status, 415);
    assert.equal(r.json.error.code, 'unsupported_media_type');
    assert.equal((await eventsFor(product, 'product.photo_added')).length, 0);
    assert.equal(
      await prisma.productPhoto.count({ where: { productId: product } }),
      0,
    );
  });

  test('a file over 5 MB is refused with 413, not a dropped connection', async () => {
    const alice = await makeSeller();
    const product = await makeProduct(alice);

    const oversize = Buffer.concat([pngBytes(), Buffer.alloc(6 * 1024 * 1024)]);
    const r = await uploadPhoto(alice.cookie, product, oversize);

    assert.equal(r.status, 413);
    assert.equal(r.json.error.code, 'file_too_large');
    assert.equal((await eventsFor(product, 'product.photo_added')).length, 0);
  });

  test('a request that is not multipart is refused', async () => {
    const alice = await makeSeller();
    const product = await makeProduct(alice);

    const res = await fetch(`${base}/products/${product}/photos`, {
      method: 'POST',
      headers: { cookie: alice.cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ file: 'nope' }),
    });
    assert.equal(res.status, 415);
    assert.equal((await eventsFor(product, 'product.photo_added')).length, 0);
  });

  test('multipart with no file field is a validation error', async () => {
    const alice = await makeSeller();
    const product = await makeProduct(alice);

    const form = new FormData();
    form.append('notafile', 'hello');
    const res = await fetch(`${base}/products/${product}/photos`, {
      method: 'POST',
      headers: { cookie: alice.cookie },
      body: form,
    });
    assert.equal(res.status, 422);
    assert.equal((await eventsFor(product, 'product.photo_added')).length, 0);
  });
});

// ---------------------------------------------------------------------------
// REQ-A3 — the guard applies to photos too
// ---------------------------------------------------------------------------

describe('photo routes are store-scoped', { skip }, () => {
  test('a seller cannot add a photo to another seller\'s product', async () => {
    const alice = await makeSeller();
    const bob = await makeSeller();
    const product = await makeProduct(alice);

    const r = await uploadPhoto(bob.cookie, product, pngBytes());

    assert.equal(r.status, 404);
    assert.equal(r.json.error.code, 'product_not_found');
    assert.equal((await eventsFor(product, 'product.photo_added')).length, 0);
  });

  test('a seller cannot delete a photo from another seller\'s product', async () => {
    const alice = await makeSeller();
    const bob = await makeSeller();
    const product = await makeProduct(alice);
    const uploaded = await uploadPhoto(alice.cookie, product, pngBytes());

    const r = await call(
      bob.cookie,
      'DELETE',
      `/products/${product}/photos/${uploaded.json.photo.id}`,
    );

    assert.equal(r.status, 404);
    assert.equal(
      await prisma.productPhoto.count({ where: { productId: product } }),
      1,
      'the photo must survive',
    );
    assert.equal((await eventsFor(product, 'product.photo_removed')).length, 0);
  });

  test('an anonymous caller cannot upload', async () => {
    const alice = await makeSeller();
    const product = await makeProduct(alice);

    const form = new FormData();
    form.append('file', new File([new Uint8Array(pngBytes())], 'a.png'));
    const res = await fetch(`${base}/products/${product}/photos`, {
      method: 'POST',
      body: form,
    });

    assert.equal(res.status, 401);
    assert.equal((await eventsFor(product, 'product.photo_added')).length, 0);
  });
});

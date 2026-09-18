/**
 * Tests for the week-8 AI assistant (ADR-0007).
 *
 * **No test in this file calls the model.** `.env.test` does not set
 * `OPENROUTER_API_KEY`, so `config.ai.enabled` is false throughout, and the
 * routes refuse before they reach OpenRouter. That is deliberate twice over:
 * the course key has a fixed allowance that a test suite would drain, and a
 * test whose result depends on what a language model felt like writing today
 * is not a test.
 *
 * What is left is what actually breaks: the authorisation boundary, the
 * refusal path, and the two pure functions that decide whether a generated
 * summary is allowed to be shown at all.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

// Pure, imports nothing. Safe at the top level even with no database around.
import { allowedNumbers, ungroundedNumbers } from './grounding.ts';

const CONFIGURED =
  typeof process.env.DATABASE_URL === 'string' &&
  process.env.DATABASE_URL.includes('dtbimarket_test');

const skip = CONFIGURED
  ? false
  : 'needs .env.test pointing at dtbimarket_test — see .env.test.example';

let server: Server;
let base: string;
let prisma: typeof import('@dtbi/db').prisma;
let parseSummary: typeof import('./prompts.ts').parseSummary;
let assertNoContactData: typeof import('./openrouter.ts').assertNoContactData;

before(async () => {
  if (!CONFIGURED) return;

  ({ prisma } = await import('@dtbi/db'));
  ({ parseSummary } = await import('./prompts.ts'));
  ({ assertNoContactData } = await import('./openrouter.ts'));
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
// The grounding guard — pure, always runs
// ---------------------------------------------------------------------------

describe('grounding', () => {
  const facts = ['4 รายการ', '3 รายการ', '45.00 ถึง 60.00 บาท', '0 ครั้ง'];

  test('a summary quoting only the numbers it was given passes', () => {
    const text = 'ร้านมีสินค้า 4 รายการ เผยแพร่แล้ว 3 รายการ ราคา 45.00 ถึง 60.00 บาท';
    assert.deepEqual(ungroundedNumbers(text, facts), []);
  });

  test('a number the model computed for itself is caught', () => {
    // 75% is a real percentage of a real pair of numbers, and it is still
    // invented: nothing in the snapshot says 75, so nothing can be pointed at.
    const text = 'สินค้า 75% ของร้านเผยแพร่แล้ว';
    assert.deepEqual(ungroundedNumbers(text, facts), ['75']);
  });

  test('a comparison with other stores is caught by its number', () => {
    const text = 'ร้านอื่นในหมวดนี้มีสินค้าเฉลี่ย 12 รายการ';
    assert.deepEqual(ungroundedNumbers(text, facts), ['12']);
  });

  test('trailing zeros do not cause a false refusal', () => {
    // formatSatang always writes two decimals; a model restating the figure
    // usually drops them. Refusing that would make the guard fire on correct
    // output, which is how a guard gets switched off.
    assert.deepEqual(ungroundedNumbers('ราคาเริ่มที่ 45 บาท', facts), []);
  });

  test('the photo threshold and the seven-day window are always allowed', () => {
    // Both appear in fact LABELS rather than values, so a summary quoting the
    // question it was asked would otherwise be refused.
    const allowed = allowedNumbers([]);
    assert.ok(allowed.has('2'));
    assert.ok(allowed.has('7'));
  });
});

// ---------------------------------------------------------------------------
// Output parsing
// ---------------------------------------------------------------------------

describe('parsing the model reply', { skip }, () => {
  test('reads the two labelled lines', () => {
    const parsed = parseSummary('สรุป: มีสินค้า 4 รายการ\nควรทำต่อ: เผยแพร่ฉบับร่าง');
    assert.equal(parsed?.summary, 'มีสินค้า 4 รายการ');
    assert.equal(parsed?.suggestedAction, 'เผยแพร่ฉบับร่าง');
  });

  test('survives the model bulleting a list it was told not to make', () => {
    const parsed = parseSummary('- สรุป: ก\n- ควรทำต่อ: ข');
    assert.equal(parsed?.summary, 'ก');
  });

  test('returns null when a line is missing, so the caller can retry', () => {
    assert.equal(parseSummary('สรุป: มีสินค้า 4 รายการ'), null);
    assert.equal(parseSummary('ร้านของคุณดูดีมาก!'), null);
  });
});

// ---------------------------------------------------------------------------
// The personal-data guard — CLAUDE.md rule 8
// ---------------------------------------------------------------------------

describe('prompt personal-data guard', { skip }, () => {
  test('refuses a prompt carrying a contact channel', () => {
    assert.throws(
      () => assertNoContactData('ติดต่อ @ploycafe ได้เลย', ['@ploycafe']),
      /personal field/,
    );
  });

  test('allows a prompt built from business fields only', () => {
    assert.doesNotThrow(() =>
      assertNoContactData('ชื่อร้าน: ร้านกาแฟพลอย\nชื่อสินค้า: ลาเต้ร้อน', [
        '@ploycafe',
        'ploy@example.invalid',
      ]),
    );
  });

  test('ignores values too short to match anything but noise', () => {
    assert.doesNotThrow(() => assertNoContactData('ลาเต้ร้อน', ['ร้']));
  });
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
): Promise<{ status: number; json: unknown }> {
  const res = await fetch(base + path, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(cookie ? { cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null };
}

async function makeSeller(): Promise<Caller> {
  const tag = randomUUID().slice(0, 8);

  const reg = await fetch(base + '/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: `ai-${tag}@example.invalid`,
      password: 'test-password-1234',
      displayName: `ผู้ทดสอบ ${tag}`,
      role: 'seller',
    }),
  });
  assert.equal(reg.status, 201);
  const cookie = (reg.headers.get('set-cookie') ?? '').split(';')[0]!;
  const regBody = (await reg.json()) as { user: { id: string } };

  const store = await call(cookie, 'POST', '/stores', {
    name: `ร้านทดสอบ ${tag}`,
    slug: `ai-${tag}`,
    category: 'food',
  });
  assert.equal(store.status, 201, JSON.stringify(store.json));

  return {
    cookie,
    userId: regBody.user.id,
    storeId: (store.json as { store: { id: string } }).store.id,
  };
}

// ---------------------------------------------------------------------------
// The auth boundary — REQ-A3
// ---------------------------------------------------------------------------

describe('AI routes: authorisation', { skip }, () => {
  test('a stranger cannot ask for a summary', async () => {
    const r = await call(null, 'POST', '/ai/summary');
    assert.equal(r.status, 401);
  });

  test("a seller cannot draft a description for another seller's product", async () => {
    const alice = await makeSeller();
    const bob = await makeSeller();

    const product = await call(alice.cookie, 'POST', '/products', {
      name: 'สินค้าทดสอบ',
      priceSatang: 4500,
      stock: 5,
    });
    assert.equal(product.status, 201);
    const productId = (product.json as { product: { id: string } }).product.id;

    const r = await call(
      bob.cookie,
      'POST',
      `/ai/products/${productId}/description`,
    );

    // 404, not 403 — a 403 confirms the ID is real. Same rule as every other
    // store-scoped route here.
    assert.equal(r.status, 404);
    assert.equal((r.json as { error: { code: string } }).error.code, 'product_not_found');
  });

  test("a seller cannot dismiss another store's summary", async () => {
    const alice = await makeSeller();
    const bob = await makeSeller();

    const summary = await prisma.aiSummary.create({
      data: {
        storeId: alice.storeId,
        summary: 'สรุปทดสอบ',
        suggestedAction: 'ทดสอบ',
        metricSnapshot: {},
        model: 'test',
        promptVersion: 'test',
        generatedAt: new Date(),
      },
    });

    const r = await call(bob.cookie, 'POST', `/ai/summary/${summary.id}/dismiss`);
    assert.equal(r.status, 404);
  });
});

// ---------------------------------------------------------------------------
// Refusing cleanly when the key is absent
// ---------------------------------------------------------------------------

describe('AI routes: no key configured', { skip }, () => {
  test('the summary endpoint refuses with a Thai message and writes nothing', async () => {
    const seller = await makeSeller();

    const r = await call(seller.cookie, 'POST', '/ai/summary');

    // 503, not 500: the platform is fine, one optional dependency is not.
    assert.equal(r.status, 503);
    assert.equal(
      (r.json as { error: { code: string } }).error.code,
      'ai_not_configured',
    );
    assert.match((r.json as { error: { message: string } }).error.message, /คีย์ AI/);

    // No call was made, so there is nothing to log. A run row here would mean
    // the failure counter includes refusals that never reached the provider.
    const runs = await prisma.aiRunLog.count({ where: { storeId: seller.storeId } });
    assert.equal(runs, 0);
  });

  test('the dashboard is told the feature is off rather than being left guessing', async () => {
    const seller = await makeSeller();
    const r = await call(seller.cookie, 'GET', '/ai/summary');

    assert.equal(r.status, 200);
    assert.equal((r.json as { enabled: boolean }).enabled, false);
    assert.equal((r.json as { summary: unknown }).summary, null);
  });
});

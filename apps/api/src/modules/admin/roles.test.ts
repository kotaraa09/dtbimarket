/**
 * Roles, the escalation that was possible before this change, and the operator
 * audit trail.
 *
 * The first test in this file is the one that matters most: for a while the
 * public registration endpoint accepted `role` from the request body and wrote
 * it through, so a stranger could POST themselves an administrator account.
 * That test exists so it cannot come back.
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
let hash: typeof import('@node-rs/argon2').hash;

before(async () => {
  if (!CONFIGURED) return;
  ({ prisma } = await import('@dtbi/db'));
  ({ hash } = await import('@node-rs/argon2'));
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

const PASSWORD = 'test-password-1234';

async function register(role: 'seller' | 'buyer', extra: Record<string, unknown> = {}) {
  const tag = randomUUID().slice(0, 8);
  const res = await call(null, 'POST', '/auth/register', {
    email: `role-${tag}@example.invalid`,
    password: PASSWORD,
    displayName: `ผู้ทดสอบ ${tag}`,
    role,
    ...extra,
  });
  return { res, cookie: (res.setCookie ?? '').split(';')[0] ?? '' };
}

/** Administrators exist only via the out-of-band path, so tests create one the
 *  same way the CLI does rather than through any endpoint. */
async function makeAdmin(): Promise<{ cookie: string; id: string; email: string }> {
  const tag = randomUUID().slice(0, 8);
  const email = `admin-${tag}@example.invalid`;
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: await hash(PASSWORD),
      role: 'admin',
      displayName: 'ผู้ดูแลทดสอบ',
      status: 'active',
    },
  });
  const res = await call(null, 'POST', '/auth/login', { email, password: PASSWORD });
  assert.equal(res.status, 200, JSON.stringify(res.json));
  return { cookie: (res.setCookie ?? '').split(';')[0] ?? '', id: user.id, email };
}

async function makeSellerWithStore() {
  const { res, cookie } = await register('seller');
  assert.equal(res.status, 201);
  const tag = randomUUID().slice(0, 8);
  const store = await call(cookie, 'POST', '/stores', {
    name: `ร้าน ${tag}`,
    slug: `role-${tag}`,
    category: 'food',
  });
  assert.equal(store.status, 201, JSON.stringify(store.json));
  return { cookie, userId: res.json.user.id, storeId: store.json.store.id };
}

/** Prisma types a Json column as a union; the writer guarantees a flat object. */
function meta(entry: { metadata: unknown }): Record<string, string | number | boolean> {
  return entry.metadata as Record<string, string | number | boolean>;
}

function auditFor(targetId: string, action?: string) {
  return prisma.adminAuditLog.findMany({
    where: { targetId, ...(action ? { action } : {}) },
    orderBy: { occurredAt: 'asc' },
  });
}

// ---------------------------------------------------------------------------
// Privilege escalation
// ---------------------------------------------------------------------------

describe('public registration cannot grant privilege', { skip }, () => {
  test('a stranger cannot register themselves as admin', async () => {
    const tag = randomUUID().slice(0, 8);
    const res = await call(null, 'POST', '/auth/register', {
      email: `escalate-${tag}@example.invalid`,
      password: PASSWORD,
      displayName: 'ผู้บุกรุก',
      role: 'admin',
    });

    // 422 from the schema, because `admin` is not in PUBLIC_SIGNUP_ROLES.
    assert.equal(res.status, 422, JSON.stringify(res.json));
    assert.equal(res.json.error.code, 'validation_failed');

    const created = await prisma.user.findUnique({
      where: { email: `escalate-${tag}@example.invalid` },
    });
    assert.equal(created, null, 'no account may be created at all');
  });

  test('an unknown role is refused rather than silently defaulted', async () => {
    // Falling back to `seller` would be worse than refusing: the caller asked
    // for something the system does not have, and got an account anyway.
    const tag = randomUUID().slice(0, 8);
    const res = await call(null, 'POST', '/auth/register', {
      email: `weird-${tag}@example.invalid`,
      password: PASSWORD,
      displayName: 'x',
      role: 'superuser',
    });
    assert.equal(res.status, 422);
  });

  test('seller and buyer registration still work', async () => {
    for (const role of ['seller', 'buyer'] as const) {
      const { res } = await register(role);
      assert.equal(res.status, 201, JSON.stringify(res.json));
      assert.equal(res.json.user.role, role);
      assert.equal(res.json.user.status, 'active');
    }
  });
});

// ---------------------------------------------------------------------------
// Role gating
// ---------------------------------------------------------------------------

describe('role gating', { skip }, () => {
  test('a buyer cannot reach seller routes', async () => {
    const { cookie } = await register('buyer');
    const res = await call(cookie, 'GET', '/products/mine');
    // 403, not 401: they are signed in, and signing in again will not help.
    assert.equal(res.status, 403);
    assert.equal(res.json.error.code, 'forbidden');
  });

  test('a seller cannot reach admin routes', async () => {
    const { cookie } = await makeSellerWithStore();
    for (const path of ['/admin/users', '/admin/audit']) {
      const res = await call(cookie, 'GET', path);
      assert.equal(res.status, 403, `${path} should be forbidden`);
    }
  });

  test('an admin cannot reach seller routes', async () => {
    // Admin used to be admitted by requireSeller and stopped only by the store
    // lookup that followed. Now it is refused by the role guard itself.
    const admin = await makeAdmin();
    const res = await call(admin.cookie, 'GET', '/products/mine');
    assert.equal(res.status, 403);
  });

  test('an anonymous caller gets 401 from admin routes, not 403', async () => {
    const res = await call(null, 'GET', '/admin/users');
    assert.equal(res.status, 401);
    assert.equal(res.json.error.code, 'not_signed_in');
  });
});

// ---------------------------------------------------------------------------
// Suspension
// ---------------------------------------------------------------------------

describe('suspension', { skip }, () => {
  test('suspending kills the live session, not just future sign-ins', async () => {
    const admin = await makeAdmin();
    const seller = await makeSellerWithStore();

    // The seller's session works before.
    assert.equal((await call(seller.cookie, 'GET', '/auth/me')).status, 200);

    const res = await call(
      admin.cookie,
      'POST',
      `/admin/users/${seller.userId}/suspend`,
    );
    assert.equal(res.status, 200, JSON.stringify(res.json));
    assert.equal(res.json.user.status, 'suspended');
    assert.ok(res.json.sessionsRevoked >= 1);

    // And stops working immediately afterwards, without waiting for the cookie
    // to expire — which would otherwise be up to fourteen days of access.
    assert.equal((await call(seller.cookie, 'GET', '/auth/me')).status, 401);
  });

  test('a suspended user cannot sign in, and is told why', async () => {
    const admin = await makeAdmin();
    const { res: reg } = await register('buyer');
    const email = (await prisma.user.findUniqueOrThrow({
      where: { id: reg.json.user.id },
    })).email;

    await call(admin.cookie, 'POST', `/admin/users/${reg.json.user.id}/suspend`);

    const login = await call(null, 'POST', '/auth/login', { email, password: PASSWORD });
    assert.equal(login.status, 403);
    assert.equal(login.json.error.code, 'account_not_active');
  });

  test('a wrong password on a suspended account still says invalid credentials', async () => {
    // Status is checked after the password, so the endpoint does not confirm
    // that an address exists to somebody who cannot authenticate as it.
    const admin = await makeAdmin();
    const { res: reg } = await register('buyer');
    const user = await prisma.user.findUniqueOrThrow({ where: { id: reg.json.user.id } });
    await call(admin.cookie, 'POST', `/admin/users/${user.id}/suspend`);

    const login = await call(null, 'POST', '/auth/login', {
      email: user.email,
      password: 'completely-wrong-password',
    });
    assert.equal(login.status, 401);
    assert.equal(login.json.error.code, 'invalid_credentials');
  });

  test('reinstating restores access', async () => {
    const admin = await makeAdmin();
    const seller = await makeSellerWithStore();

    await call(admin.cookie, 'POST', `/admin/users/${seller.userId}/suspend`);
    const res = await call(
      admin.cookie,
      'POST',
      `/admin/users/${seller.userId}/reinstate`,
    );
    assert.equal(res.status, 200);
    assert.equal(res.json.user.status, 'active');

    // The old session stays revoked; they sign in again.
    const user = await prisma.user.findUniqueOrThrow({ where: { id: seller.userId } });
    const login = await call(null, 'POST', '/auth/login', {
      email: user.email,
      password: PASSWORD,
    });
    assert.equal(login.status, 200);
  });

  test('an admin cannot suspend themselves', async () => {
    // Otherwise the only administrator can lock the platform out of its own
    // administration, mid-request.
    const admin = await makeAdmin();
    const res = await call(admin.cookie, 'POST', `/admin/users/${admin.id}/suspend`);
    assert.equal(res.status, 409);
    assert.equal(res.json.error.code, 'cannot_act_on_self');
  });
});

// ---------------------------------------------------------------------------
// Anonymisation — REQ-N21
// ---------------------------------------------------------------------------

describe('anonymisation (REQ-N21)', { skip }, () => {
  test('clears personal fields but leaves telemetry standing', async () => {
    const admin = await makeAdmin();
    const seller = await makeSellerWithStore();

    // Generate some telemetry first: creating the store already emitted
    // store.created, which must survive the erasure.
    const before = await prisma.event.findMany({ where: { storeId: seller.storeId } });
    assert.ok(before.length > 0, 'precondition: the seller has events');

    const res = await call(
      admin.cookie,
      'POST',
      `/admin/users/${seller.userId}/anonymise`,
      { confirm: 'anonymise' },
    );
    assert.equal(res.status, 200, JSON.stringify(res.json));

    const user = await prisma.user.findUniqueOrThrow({ where: { id: seller.userId } });
    assert.equal(user.status, 'anonymised');
    assert.equal(user.email, `anonymised-${seller.userId}@invalid`);
    assert.equal(user.displayName, 'ผู้ใช้ที่ถูกลบข้อมูล');

    const store = await prisma.store.findUniqueOrThrow({ where: { id: seller.storeId } });
    assert.equal(store.contactChannel, null);
    assert.equal(store.status, 'paused', 'a storefront nobody can run must not stay open');

    // The point of REQ-N2: because events hold no personal data, erasure does
    // not require touching them. Append-only and the right to erasure coexist
    // only because of that.
    const after = await prisma.event.findMany({ where: { storeId: seller.storeId } });
    assert.equal(after.length, before.length, 'no event may be removed');
  });

  test('the anonymised account cannot be signed into afterwards', async () => {
    const admin = await makeAdmin();
    const seller = await makeSellerWithStore();
    const emailBefore = (
      await prisma.user.findUniqueOrThrow({ where: { id: seller.userId } })
    ).email;

    await call(admin.cookie, 'POST', `/admin/users/${seller.userId}/anonymise`, {
      confirm: 'anonymise',
    });

    const login = await call(null, 'POST', '/auth/login', {
      email: emailBefore,
      password: PASSWORD,
    });
    assert.equal(login.status, 401, 'the old address no longer resolves to an account');
  });

  test('requires explicit confirmation', async () => {
    const admin = await makeAdmin();
    const seller = await makeSellerWithStore();

    const res = await call(
      admin.cookie,
      'POST',
      `/admin/users/${seller.userId}/anonymise`,
      {},
    );
    assert.equal(res.status, 422);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: seller.userId } });
    assert.equal(user.status, 'active', 'nothing may change without confirmation');
  });

  test('an anonymised account cannot be reinstated', async () => {
    const admin = await makeAdmin();
    const seller = await makeSellerWithStore();
    await call(admin.cookie, 'POST', `/admin/users/${seller.userId}/anonymise`, {
      confirm: 'anonymise',
    });

    const res = await call(
      admin.cookie,
      'POST',
      `/admin/users/${seller.userId}/reinstate`,
    );
    assert.equal(res.status, 409);
    assert.equal(res.json.error.code, 'already_anonymised');
  });
});

// ---------------------------------------------------------------------------
// The audit trail — ADR-0005
// ---------------------------------------------------------------------------

describe('operator audit trail', { skip }, () => {
  test('reading a user is recorded, naming fields but not values', async () => {
    const admin = await makeAdmin();
    const seller = await makeSellerWithStore();
    const user = await prisma.user.findUniqueOrThrow({ where: { id: seller.userId } });

    const res = await call(admin.cookie, 'GET', `/admin/users/${seller.userId}`);
    assert.equal(res.status, 200);
    assert.equal(res.json.email, user.email, 'the admin did see the address');

    const entries = await auditFor(seller.userId, 'admin.user_viewed');
    assert.equal(entries.length, 1, 'a read must leave a record');

    const entry = entries[0]!;
    assert.equal(entry.actorId, admin.id);
    assert.ok(entry.requestId, 'ties the entry to the access log line');

    const meta = JSON.stringify(entry.metadata);
    assert.match(meta, /email/, 'records WHICH fields were disclosed');
    assert.ok(
      !meta.includes(user.email),
      'but never the value — an audit trail must not copy what it protects',
    );
    assert.ok(!meta.includes(user.displayName));
  });

  test('suspension and anonymisation are recorded with before and after', async () => {
    const admin = await makeAdmin();
    const seller = await makeSellerWithStore();

    await call(admin.cookie, 'POST', `/admin/users/${seller.userId}/suspend`);
    const suspended = meta((await auditFor(seller.userId, 'admin.user_suspended'))[0]!);
    assert.equal(suspended.status_before, 'active');
    assert.equal(suspended.status_after, 'suspended');
    assert.ok(Number(suspended.sessions_revoked) >= 1);

    await call(admin.cookie, 'POST', `/admin/users/${seller.userId}/anonymise`, {
      confirm: 'anonymise',
    });
    const erased = meta((await auditFor(seller.userId, 'admin.user_anonymised'))[0]!);
    assert.equal(erased.status_before, 'suspended');
    assert.equal(erased.status_after, 'anonymised');
    assert.match(String(erased.fields_cleared), /email/);
  });

  test('admin sign-in goes to the trail, never to the event stream', async () => {
    const admin = await makeAdmin();

    const entries = await prisma.adminAuditLog.findMany({
      where: { actorId: admin.id, action: 'admin.signed_in' },
    });
    assert.equal(entries.length, 1);

    // The bug this replaces: an admin signing in was recorded as
    // `buyer.signed_in`, putting operator activity into the study's data.
    const leaked = await prisma.event.findMany({ where: { actorId: admin.id } });
    assert.deepEqual(leaked, [], 'no admin activity may appear in Event');
  });

  test('the database refuses to let an admin edit or erase the trail', async () => {
    const admin = await makeAdmin();
    const entry = (
      await prisma.adminAuditLog.findMany({ where: { actorId: admin.id }, take: 1 })
    )[0]!;

    await assert.rejects(
      () =>
        prisma.$executeRaw`UPDATE "admin_audit_log" SET action = 'nothing_happened' WHERE id = ${entry.id}`,
      /append-only/,
    );
    await assert.rejects(
      () => prisma.$executeRaw`DELETE FROM "admin_audit_log" WHERE id = ${entry.id}`,
      /append-only/,
    );

    assert.ok(await prisma.adminAuditLog.findUnique({ where: { id: entry.id } }));
  });

  test('a refused admin request writes no audit entry', async () => {
    const seller = await makeSellerWithStore();
    const before = await prisma.adminAuditLog.count();

    const res = await call(seller.cookie, 'GET', '/admin/users');
    assert.equal(res.status, 403);

    assert.equal(
      await prisma.adminAuditLog.count(),
      before,
      'the guard runs before anything is recorded',
    );
  });
});

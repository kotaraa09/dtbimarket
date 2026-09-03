/**
 * PB-05 / FEAT-F4 — seed data.
 *
 * Every row written here carries is_seed = true (CLAUDE.md rule 6). Seed rows
 * are excluded from every analysis query AND from every seller-facing metric
 * (REQ-D3) — seed data appearing in a real seller's numbers is a trust problem,
 * not only an analysis one.
 *
 * This script never creates rows in experiment, variant or assignment. It could
 * not do so safely for a running experiment, and the guard against that is to
 * not have the capability at all.
 *
 * It is deliberately NOT idempotent-by-upsert. The event table is append-only,
 * so a re-run cannot clean up after the previous one; instead it refuses when
 * seed data is already present and tells you to reset.
 *
 * ON THE SECOND INSERT PATH. ADR-0001 says the application has exactly one
 * insert path into `event`, which is `emitEvent` in apps/api. That function
 * cannot be imported here: packages/db must not depend on apps/api, and the
 * dependency the other way is what makes the API the choke point. So this file
 * has its own writer — but it calls the SAME assertNoPersonalData guard, and it
 * can only ever write is_seed = true rows. Flagged in docs/06-log/2026-09.md as
 * a deviation worth a decision rather than a detail to discover later.
 */
import { Algorithm, hash } from '@node-rs/argon2';
import { assertNoPersonalData, type EventPayload, type EventType } from '@dtbi/shared';
import { PrismaClient, type Prisma } from '../src/generated/client/client.ts';
import { createSeedStorage, placeholderFor } from './seed-photos.ts';

const prisma = new PrismaClient();
const seedStorage = createSeedStorage();

/**
 * Not a secret. These accounts exist only in a local or staging database, and
 * this file is committed — so it must never hold a credential that protects
 * anything (CLAUDE.md rule 9). The seed refuses to run against production below.
 */
const SEED_PASSWORD = 'seed-password-not-a-secret';

const ARGON2 = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

let eventCount = 0;

async function seedEvent(
  tx: Prisma.TransactionClient,
  e: {
    type: EventType;
    actorType: 'seller' | 'buyer' | 'system';
    actorId?: string;
    storeId?: string;
    entityType?: string;
    entityId?: string;
    payload?: EventPayload;
    occurredAt: Date;
  },
): Promise<void> {
  // Same guard as the real emitter. A seeded row with a name in it would still
  // be a name in an append-only table.
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
      occurredAt: e.occurredAt,
      isSeed: true,
    },
  });
  eventCount++;
}

/** Days ago, as a timestamp, so seeded history is spread out rather than piled
 *  onto the instant the script ran. */
function daysAgo(days: number, hour = 12): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  d.setUTCHours(hour, 0, 0, 0);
  return d;
}

const SEED_STORES = [
  {
    email: 'seed.ploy@example.invalid',
    displayName: 'พลอย (ตัวอย่าง)',
    store: {
      name: 'ร้านกาแฟพลอย',
      slug: 'seed-ploy-coffee',
      category: 'drinks' as const,
      description: 'กาแฟสดคั่วเอง ส่งในมหาวิทยาลัย',
      contactChannel: '@seed-ploy',
    },
    products: [
      { name: 'อเมริกาโน่เย็น', priceSatang: 4500, stock: 40, photos: 3 },
      { name: 'ลาเต้ร้อน', priceSatang: 5000, stock: 25, photos: 2 },
      { name: 'โกโก้ปั่น', priceSatang: 5500, stock: 18, photos: 2 },
    ],
  },
  {
    email: 'seed.nut@example.invalid',
    displayName: 'ณัฐ (ตัวอย่าง)',
    store: {
      name: 'ร้านของฝากณัฐ',
      slug: 'seed-nut-gifts',
      category: 'handmade' as const,
      description: 'งานแฮนด์เมดทำเอง',
      contactChannel: '@seed-nut',
    },
    // Deliberately thin on photos — this is the store the photo-coverage
    // recommendation (PB-24) should have something to say about.
    products: [
      { name: 'พวงกุญแจไม้', priceSatang: 8900, stock: 12, photos: 1 },
      { name: 'กระเป๋าผ้าปัก', priceSatang: 25000, stock: 6, photos: 1 },
      { name: 'สมุดทำมือ', priceSatang: 15000, stock: 9, photos: 0 },
      { name: 'เทียนหอม', priceSatang: 12000, stock: 15, photos: 1 },
    ],
  },
];

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production' && process.env.DTBI_SEED_CONFIRM !== '1') {
    throw new Error(
      'Refusing to seed a production database. Set DTBI_SEED_CONFIRM=1 if this is genuinely intended.',
    );
  }

  const existing = await prisma.store.count({ where: { isSeed: true } });
  if (existing > 0) {
    process.stdout.write(
      `Seed data is already present (${existing} seeded stores).\n` +
        'Events are append-only, so this script cannot clean up after itself.\n' +
        'Run `pnpm db:reset` for a clean database, then seed again.\n',
    );
    return;
  }

  const passwordHash = await hash(SEED_PASSWORD, ARGON2);

  let productCount = 0;
  let photoCount = 0;

  for (const spec of SEED_STORES) {
    await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: spec.email,
          passwordHash,
          role: 'seller',
          displayName: spec.displayName,
          createdAt: daysAgo(30),
          isSeed: true,
        },
      });

      await seedEvent(tx, {
        type: 'seller.registered',
        actorType: 'seller',
        actorId: user.id,
        occurredAt: daysAgo(30),
      });

      const store = await tx.store.create({
        data: {
          ownerId: user.id,
          ...spec.store,
          createdAt: daysAgo(29),
          isSeed: true,
        },
      });

      await seedEvent(tx, {
        type: 'store.created',
        actorType: 'seller',
        actorId: user.id,
        storeId: store.id,
        entityType: 'store',
        entityId: store.id,
        payload: { category: store.category },
        occurredAt: daysAgo(29),
      });

      for (const [index, p] of spec.products.entries()) {
        const createdAt = daysAgo(28 - index);

        const product = await tx.product.create({
          data: {
            storeId: store.id,
            name: p.name,
            description: null,
            priceSatang: p.priceSatang,
            stock: p.stock,
            status: 'published',
            createdAt,
            isSeed: true,
          },
        });
        productCount++;

        await seedEvent(tx, {
          type: 'product.created',
          actorType: 'seller',
          actorId: user.id,
          storeId: store.id,
          entityType: 'product',
          entityId: product.id,
          payload: {
            price_satang: product.priceSatang,
            stock: product.stock,
            status: 'draft',
          },
          occurredAt: createdAt,
        });

        for (let i = 0; i < p.photos; i++) {
          // A real object is written behind every seeded row. A row whose
          // object does not exist renders as a broken image in exactly the
          // demos and screenshots the seed exists to make safe.
          const key = `seed/${store.slug}/${product.id}/${i}.png`;
          if (seedStorage.available) {
            await seedStorage.put(key, placeholderFor(productCount + i));
          }

          await tx.productPhoto.create({
            data: {
              productId: product.id,
              storageKey: key,
              position: i,
              createdAt,
              isSeed: true,
            },
          });
          photoCount++;

          await seedEvent(tx, {
            type: 'product.photo_added',
            actorType: 'seller',
            actorId: user.id,
            storeId: store.id,
            entityType: 'product',
            entityId: product.id,
            payload: { photo_count: i + 1, position: i },
            occurredAt: createdAt,
          });
        }

        await seedEvent(tx, {
          type: 'product.published',
          actorType: 'seller',
          actorId: user.id,
          storeId: store.id,
          entityType: 'product',
          entityId: product.id,
          payload: { photo_count: p.photos },
          occurredAt: createdAt,
        });
      }

      // A little buyer traffic, so the dashboard in PB-17 has non-zero numbers
      // to render. These are system-attributed because no seeded buyer account
      // exists yet (PB-14).
      for (let d = 1; d <= 7; d++) {
        const views = 3 + ((d * 5) % 7);
        for (let v = 0; v < views; v++) {
          await seedEvent(tx, {
            type: 'storefront.viewed',
            actorType: 'system',
            storeId: store.id,
            entityType: 'store',
            entityId: store.id,
            payload: { product_count: spec.products.length },
            occurredAt: daysAgo(d, 9 + (v % 10)),
          });
        }
      }
    });
  }

  if (!seedStorage.available) {
    process.stdout.write(
      [
        'WARNING: object storage is not configured, so seeded photo rows have no',
        'image behind them and will render as broken thumbnails. Start it with',
        '`pnpm db:up`, check STORAGE_* in .env, then reset and seed again.',
        '',
      ].join('\n'),
    );
  }

  process.stdout.write(
    `Seeded ${SEED_STORES.length} stores, ${productCount} products, ` +
      `${photoCount} photos, ${eventCount} events — every row is_seed = true.\n` +
      `Sign in as ${SEED_STORES[0]!.email} / ${SEED_PASSWORD}\n`,
  );
}

main()
  .catch((err: unknown) => {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });

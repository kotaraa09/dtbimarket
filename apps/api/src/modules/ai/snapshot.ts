/**
 * Level 2, step 1: read the store's own data.
 *
 * Three tables, not one — `product`, `product_photo` and `event`. That is the
 * whole difference between this and Level 1: a single-shot call restates what
 * the seller just typed, while this one has to go and find out what is true.
 *
 * Everything the model is later allowed to say comes from the object this
 * returns and from nothing else. That is CLAUDE.md rule 7 applied to a feature
 * that is not the advisor: the snapshot is stored with the summary, the panel
 * renders it beside the text, and a sentence with no matching field in here is
 * a sentence the model invented.
 *
 * Seed rows are NOT excluded. A seed store asking for a summary of itself
 * should get an accurate one; `is_seed` on `ai_summary` is what keeps the row
 * out of analysis (CLAUDE.md rule 6), not arithmetic that lies to the seller.
 */
import { prisma } from '@dtbi/db';
import type { Store } from '@dtbi/db';
import type { AiSummaryMetricSnapshot, EventType } from '@dtbi/shared';
import { getClock } from '../../lib/clock.ts';

/**
 * What counts as the seller changing their catalogue.
 *
 * Views are excluded: a buyer looking at a product is not work the seller did,
 * and "you have not touched your shop in 12 days" has to stay true even on a
 * week when traffic was good.
 */
const CATALOGUE_CHANGE_EVENTS: readonly EventType[] = [
  'product.created',
  'product.description_changed',
  'product.published',
  'product.unpublished',
  'product.photo_added',
  'product.photo_removed',
  'product.price_changed',
  'product.stock_changed',
  'store.profile_updated',
];

/** Photo coverage below this is what the panel calls out. */
export const MIN_PHOTOS_PER_PRODUCT = 2;

const DAY_MS = 24 * 60 * 60 * 1000;

export async function buildStoreSnapshot(
  store: Store,
): Promise<AiSummaryMetricSnapshot> {
  const now = getClock().now();
  const sevenDaysAgo = new Date(now.getTime() - 7 * DAY_MS);

  const [products, recentChanges, lastChange] = await Promise.all([
    prisma.product.findMany({
      where: { storeId: store.id },
      select: {
        status: true,
        priceSatang: true,
        stock: true,
        createdAt: true,
        _count: { select: { photos: true } },
      },
    }),
    prisma.event.count({
      where: {
        storeId: store.id,
        type: { in: [...CATALOGUE_CHANGE_EVENTS] },
        occurredAt: { gte: sevenDaysAgo },
      },
    }),
    prisma.event.findFirst({
      where: { storeId: store.id, type: { in: [...CATALOGUE_CHANGE_EVENTS] } },
      orderBy: { occurredAt: 'desc' },
      select: { occurredAt: true },
    }),
  ]);

  const published = products.filter((p) => p.status === 'published');
  const publishedPrices = published.map((p) => p.priceSatang);

  const newestCreatedAt = products.reduce<Date | null>(
    (newest, p) => (newest === null || p.createdAt > newest ? p.createdAt : newest),
    null,
  );

  return {
    storeCategory: store.category,

    productCount: products.length,
    publishedCount: published.length,
    draftCount: products.filter((p) => p.status === 'draft').length,
    unpublishedCount: products.filter((p) => p.status === 'unpublished').length,

    // Counted over published products only. A draft with no photo is not a
    // problem the buyer can see, and telling a seller to photograph something
    // they have not finished writing is advice they will ignore, correctly.
    photosMissingCount: published.filter(
      (p) => p._count.photos < MIN_PHOTOS_PER_PRODUCT,
    ).length,
    photoCount: products.reduce((sum, p) => sum + p._count.photos, 0),
    outOfStockCount: published.filter((p) => p.stock === 0).length,

    lowestPriceSatang: publishedPrices.length ? Math.min(...publishedPrices) : null,
    highestPriceSatang: publishedPrices.length ? Math.max(...publishedPrices) : null,
    stockValueSatang: published.reduce(
      (sum, p) => sum + p.priceSatang * p.stock,
      0,
    ),

    daysSinceNewestProduct: newestCreatedAt ? wholeDaysBetween(newestCreatedAt, now) : null,

    catalogueChangesLast7Days: recentChanges,
    daysSinceLastCatalogueChange: lastChange
      ? wholeDaysBetween(lastChange.occurredAt, now)
      : null,

    computedAt: now.toISOString(),
  };
}

/** Floor, so "today" is 0 days ago and not "almost 1". */
function wholeDaysBetween(from: Date, to: Date): number {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / DAY_MS));
}

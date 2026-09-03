import type { Product, ProductPhoto, Store } from '@dtbi/db';
import type { ProductDto, StoreDto } from '@dtbi/shared';
import { getStorage } from '../photos/storage.ts';

/**
 * `contactChannel` is personal data. It is returned here because the seller is
 * reading their own store and buyers need it on the storefront, but it must
 * never reach an event payload or a log line (REQ-N2).
 */
export function toStoreDto(store: Store): StoreDto {
  return {
    id: store.id,
    name: store.name,
    slug: store.slug,
    description: store.description,
    category: store.category,
    contactChannel: store.contactChannel,
    status: store.status,
  };
}

/**
 * Async because photo URLs are built here, at read time, from the stored keys.
 * That is the rule from database-schema.md — a persisted URL would pin the
 * project to one bucket for the life of the data — and it is why this cannot
 * be a plain field mapping.
 */
export async function toProductDto(
  product: Product & { photos?: ProductPhoto[]; _count?: { photos: number } },
): Promise<ProductDto> {
  const storage = getStorage();
  const photos = product.photos ?? [];

  return {
    id: product.id,
    storeId: product.storeId,
    name: product.name,
    description: product.description,
    priceSatang: product.priceSatang,
    stock: product.stock,
    status: product.status,
    photoCount: product._count?.photos ?? photos.length,
    photos: await Promise.all(
      [...photos]
        .sort((a, b) => a.position - b.position)
        .map(async (p) => ({
          id: p.id,
          url: await storage.urlFor(p.storageKey),
          position: p.position,
        })),
    ),
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  };
}

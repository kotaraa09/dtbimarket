import type { Response } from 'express';
import type { Prisma } from '@dtbi/db';

/**
 * The product resolved by `requireOwnProduct`, already checked against the
 * caller's store. Shared by the product routes and the photo routes so that
 * both read it the same way.
 */
export type LoadedProduct = Prisma.ProductModel & {
  photos: Prisma.ProductPhotoModel[];
  _count: { photos: number };
};

export function loadedProduct(res: Response): LoadedProduct {
  return res.locals.product as LoadedProduct;
}

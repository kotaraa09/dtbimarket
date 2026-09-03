/**
 * REQ-A3 / FEAT-A3 — store-scoped authorisation.
 *
 * One rule, applied in one place: a request touching store-owned data must
 * resolve to a store owned by the caller. It lives here rather than in each
 * route so it cannot be forgotten on the route added in a hurry in week nine.
 *
 * FEAT-A3 emits no event on purpose. It changes nothing a user does; it only
 * refuses requests that should never have succeeded. That decision is recorded
 * in feature-list.md so it does not get re-litigated.
 */
import type { NextFunction, Request, Response } from 'express';
import { prisma } from '@dtbi/db';
import { errors } from './errors.ts';
import { currentAuth } from './session.ts';

/**
 * Resolves the caller's own store onto res.locals.store.
 * 404 rather than 403 when they have none: "does not exist, or exists and is
 * not visible to this caller" (api-spec.md).
 */
export async function requireOwnStore(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const auth = currentAuth(res);
    if (!auth) return next(errors.unauthorized());

    if (!auth.store) {
      return next(
        errors.notFound('store_not_found', 'คุณยังไม่ได้สร้างร้าน'),
      );
    }

    res.locals.store = auth.store;
    res.locals.storeId = auth.store.id;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Loads a product and refuses if it belongs to another store.
 *
 * Returns 404, not 403, for someone else's product. A 403 confirms the ID is
 * real, which turns the endpoint into a way to enumerate other sellers'
 * catalogues.
 */
export async function requireOwnProduct(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const store = res.locals.store as { id: string } | undefined;
    if (!store) return next(errors.forbidden());

    const raw = req.params.id;
    const id = Array.isArray(raw) ? raw[0] : raw;
    if (!id) return next(errors.notFound('product_not_found', 'ไม่พบสินค้านี้'));

    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        photos: { orderBy: { position: 'asc' } },
        _count: { select: { photos: true } },
      },
    });

    if (!product || product.storeId !== store.id) {
      return next(errors.notFound('product_not_found', 'ไม่พบสินค้านี้'));
    }

    res.locals.product = product;
    next();
  } catch (err) {
    next(err);
  }
}

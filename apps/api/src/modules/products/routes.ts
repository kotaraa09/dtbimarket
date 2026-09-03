/**
 * PB-08 / FEAT-B2 — product create, edit, delete
 * PB-09 / FEAT-B3 — publish and unpublish
 * PB-11 / FEAT-B5 — price and stock change
 *
 * Events: product.created, product.description_changed, product.deleted,
 *         product.published, product.unpublished,
 *         product.price_changed, product.stock_changed
 *
 * Price, stock, publish and unpublish each get their own endpoint rather than
 * being fields on a general PATCH. This is not REST purity — it is the only way
 * to emit them as separate countable events (api-spec.md). Collapsing them into
 * one `product.updated` would merge four different seller behaviours into a
 * bucket that analysis cannot separate again.
 *
 * Photo add and remove (PB-10) live in ../photos, mounted below. They are a
 * separate module because they are the only routes that touch object storage,
 * and because product.photo_added carries the primary metric of the thesis and
 * is worth reading on its own.
 */
import { Router } from 'express';
import { Prisma, prisma } from '@dtbi/db';
import { emitEvent } from '../../events/emit.ts';
import { errors } from '../../middleware/errors.ts';
import { validateBody, validatedBody } from '../../middleware/validate.ts';
import {
  attachSession,
  authedSeller,
  requireSeller,
  scopedStore,
} from '../../middleware/session.ts';
import { requireOwnProduct, requireOwnStore } from '../../middleware/store-scope.ts';
import { toProductDto } from '../stores/dto.ts';
import { photosRouter } from '../photos/routes.ts';
import { loadedProduct } from './loaded.ts';
import {
  changePriceSchema,
  changeStockSchema,
  createProductSchema,
  updateProductSchema,
  type ChangePriceInput,
  type ChangeStockInput,
  type CreateProductInput,
  type UpdateProductInput,
} from './schemas.ts';

export const productsRouter: Router = Router();

/** Every route below is the seller acting on their own store. */
const sellerScope = [attachSession, requireSeller, requireOwnStore] as const;


// ---------------------------------------------------------------------------
// /products/:id/photos — PB-10, in ../photos
// ---------------------------------------------------------------------------
//
// Mounted with the same guard chain as every other product route, so the photo
// endpoints cannot accidentally miss store-scoped authorisation (REQ-A3).

productsRouter.use('/:id/photos', ...sellerScope, requireOwnProduct, photosRouter);

// ---------------------------------------------------------------------------
// GET /products/mine — the seller's own catalogue, drafts included
// ---------------------------------------------------------------------------
//
// No event. This is the seller's management list, and the view event for the
// seller's own numbers is `dashboard.viewed`, which belongs to the dashboard
// endpoint in PB-17. Emitting a second view event here would double-count
// dashboard views the moment PB-17 lands.

productsRouter.get('/mine', ...sellerScope, async (_req, res, next) => {
  try {
    const store = scopedStore(res);
    const products = await prisma.product.findMany({
      where: { storeId: store.id },
      include: {
        photos: { orderBy: { position: 'asc' } },
        _count: { select: { photos: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.status(200).json({
      products: await Promise.all(products.map((p) => toProductDto(p))),
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /products
// ---------------------------------------------------------------------------

productsRouter.post(
  '/',
  ...sellerScope,
  validateBody(createProductSchema),
  async (_req, res, next) => {
    try {
      const auth = authedSeller(res);
      const store = scopedStore(res);
      const body = validatedBody<CreateProductInput>(res);

      const product = await prisma.$transaction(async (tx) => {
        const created = await tx.product.create({
          data: {
            storeId: store.id,
            name: body.name,
            description: body.description ?? null,
            priceSatang: body.priceSatang,
            stock: body.stock,
            // Created as a draft. Publishing is a separate, countable act.
            status: 'draft',
            // A product created on a seed store is demo data, and rule 6 says
            // demo rows must be excludable from every query — including the
            // photo-coverage metric the first recommendation is built on.
            isSeed: store.isSeed,
          },
        });

        await emitEvent(tx, {
          type: 'product.created',
          actorType: 'seller',
          actorId: auth.user.id,
          storeId: store.id,
          isSeed: store.isSeed,
          entityType: 'product',
          entityId: created.id,
          payload: {
            price_satang: created.priceSatang,
            stock: created.stock,
            status: created.status,
          },
        });

        return created;
      });

      res.status(201).json({ product: await toProductDto(product) });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// PATCH /products/:id — name and description only
// ---------------------------------------------------------------------------

productsRouter.patch(
  '/:id',
  ...sellerScope,
  requireOwnProduct,
  validateBody(updateProductSchema),
  async (_req, res, next) => {
    try {
      const auth = authedSeller(res);
      const store = scopedStore(res);
      const product = loadedProduct(res);
      const body = validatedBody<UpdateProductInput>(res);

      const nameChanged = body.name !== undefined && body.name !== product.name;
      const descriptionChanged =
        body.description !== undefined && body.description !== product.description;

      if (!nameChanged && !descriptionChanged) {
        return res.status(200).json({ product: await toProductDto(product) });
      }

      const updated = await prisma.$transaction(async (tx) => {
        const next_ = await tx.product.update({
          where: { id: product.id },
          data: {
            ...(body.name !== undefined ? { name: body.name } : {}),
            ...(body.description !== undefined
              ? { description: body.description }
              : {}),
          },
        });

        // Lengths, never the text. A description is free text a seller can put
        // anything into, including a phone number (REQ-N2).
        await emitEvent(tx, {
          type: 'product.description_changed',
          actorType: 'seller',
          actorId: auth.user.id,
          storeId: store.id,
          isSeed: store.isSeed,
          entityType: 'product',
          entityId: product.id,
          payload: {
            name_changed: nameChanged,
            description_length_before: product.description?.length ?? 0,
            description_length_after: next_.description?.length ?? 0,
          },
        });

        return next_;
      });

      res.status(200).json({
        product: await toProductDto({
          ...updated,
          photos: product.photos,
          _count: product._count,
        }),
      });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// PATCH /products/:id/price
// ---------------------------------------------------------------------------

productsRouter.patch(
  '/:id/price',
  ...sellerScope,
  requireOwnProduct,
  validateBody(changePriceSchema),
  async (_req, res, next) => {
    try {
      const auth = authedSeller(res);
      const store = scopedStore(res);
      const product = loadedProduct(res);
      const { priceSatang } = validatedBody<ChangePriceInput>(res);

      if (priceSatang === product.priceSatang) {
        return res.status(200).json({ product: await toProductDto(product) });
      }

      const updated = await prisma.$transaction(async (tx) => {
        const next_ = await tx.product.update({
          where: { id: product.id },
          data: { priceSatang },
        });

        await emitEvent(tx, {
          type: 'product.price_changed',
          actorType: 'seller',
          actorId: auth.user.id,
          storeId: store.id,
          isSeed: store.isSeed,
          entityType: 'product',
          entityId: product.id,
          payload: {
            price_satang_before: product.priceSatang,
            price_satang_after: next_.priceSatang,
          },
        });

        return next_;
      });

      res.status(200).json({
        product: await toProductDto({
          ...updated,
          photos: product.photos,
          _count: product._count,
        }),
      });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// PATCH /products/:id/stock
// ---------------------------------------------------------------------------

productsRouter.patch(
  '/:id/stock',
  ...sellerScope,
  requireOwnProduct,
  validateBody(changeStockSchema),
  async (_req, res, next) => {
    try {
      const auth = authedSeller(res);
      const store = scopedStore(res);
      const product = loadedProduct(res);
      const { stock } = validatedBody<ChangeStockInput>(res);

      if (stock === product.stock) {
        return res.status(200).json({ product: await toProductDto(product) });
      }

      const updated = await prisma.$transaction(async (tx) => {
        const next_ = await tx.product.update({
          where: { id: product.id },
          data: { stock },
        });

        await emitEvent(tx, {
          type: 'product.stock_changed',
          actorType: 'seller',
          actorId: auth.user.id,
          storeId: store.id,
          isSeed: store.isSeed,
          entityType: 'product',
          entityId: product.id,
          payload: { stock_before: product.stock, stock_after: next_.stock },
        });

        return next_;
      });

      res.status(200).json({
        product: await toProductDto({
          ...updated,
          photos: product.photos,
          _count: product._count,
        }),
      });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /products/:id/publish and /unpublish
// ---------------------------------------------------------------------------

productsRouter.post(
  '/:id/publish',
  ...sellerScope,
  requireOwnProduct,
  async (_req, res, next) => {
    try {
      const auth = authedSeller(res);
      const store = scopedStore(res);
      const product = loadedProduct(res);

      if (product.status === 'published') {
        return res.status(200).json({ product: await toProductDto(product) });
      }

      const updated = await prisma.$transaction(async (tx) => {
        const next_ = await tx.product.update({
          where: { id: product.id },
          data: { status: 'published' },
        });

        // photo_count travels with publish and unpublish because photo coverage
        // is the trigger for the first recommendation, and knowing how many
        // photos a product had when it went live is not recoverable later:
        // ProductPhoto rows can be deleted, this event cannot.
        await emitEvent(tx, {
          type: 'product.published',
          actorType: 'seller',
          actorId: auth.user.id,
          storeId: store.id,
          isSeed: store.isSeed,
          entityType: 'product',
          entityId: product.id,
          payload: { photo_count: product._count.photos },
        });

        return next_;
      });

      res.status(200).json({
        product: await toProductDto({
          ...updated,
          photos: product.photos,
          _count: product._count,
        }),
      });
    } catch (err) {
      next(err);
    }
  },
);

productsRouter.post(
  '/:id/unpublish',
  ...sellerScope,
  requireOwnProduct,
  async (_req, res, next) => {
    try {
      const auth = authedSeller(res);
      const store = scopedStore(res);
      const product = loadedProduct(res);

      if (product.status !== 'published') {
        return res.status(200).json({ product: await toProductDto(product) });
      }

      const updated = await prisma.$transaction(async (tx) => {
        const next_ = await tx.product.update({
          where: { id: product.id },
          data: { status: 'unpublished' },
        });

        await emitEvent(tx, {
          type: 'product.unpublished',
          actorType: 'seller',
          actorId: auth.user.id,
          storeId: store.id,
          isSeed: store.isSeed,
          entityType: 'product',
          entityId: product.id,
          payload: { photo_count: product._count.photos },
        });

        return next_;
      });

      res.status(200).json({
        product: await toProductDto({
          ...updated,
          photos: product.photos,
          _count: product._count,
        }),
      });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// DELETE /products/:id
// ---------------------------------------------------------------------------

productsRouter.delete(
  '/:id',
  ...sellerScope,
  requireOwnProduct,
  async (_req, res, next) => {
    try {
      const auth = authedSeller(res);
      const store = scopedStore(res);
      const product = loadedProduct(res);

      await prisma.$transaction(async (tx) => {
        // The event is written BEFORE the row is deleted, inside the same
        // transaction. Afterwards there would be nothing left to read the
        // status and photo count from.
        await emitEvent(tx, {
          type: 'product.deleted',
          actorType: 'seller',
          actorId: auth.user.id,
          storeId: store.id,
          isSeed: store.isSeed,
          entityType: 'product',
          entityId: product.id,
          payload: {
            status_before: product.status,
            photo_count: product._count.photos,
          },
        });

        await tx.product.delete({ where: { id: product.id } });
      });

      res.status(204).end();
    } catch (err) {
      // OrderItem holds product_id with onDelete: Restrict, so a product that
      // has been ordered cannot be deleted. That is the schema doing its job:
      // "deleting a product must not erase order history."
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2003'
      ) {
        return next(
          errors.conflict(
            'product_has_orders',
            'สินค้านี้มีคำสั่งซื้อแล้ว จึงลบไม่ได้ ให้ซ่อนสินค้าแทน',
          ),
        );
      }
      next(err);
    }
  },
);

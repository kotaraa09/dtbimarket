/**
 * PB-10 / FEAT-B4 — product photo add and remove.
 *
 * Events: product.photo_added, product.photo_removed
 *
 * **This is the most research-sensitive endpoint in the platform.**
 * `product.photo_added` is the event that detects action on the first planned
 * recommendation, which makes it the primary metric of the thesis. From
 * feature-list.md: "If it is missed, emitted from the browser, or emitted
 * before the write commits, the primary metric of the thesis is wrong and
 * cannot be repaired afterwards."
 *
 * So the ordering here is not incidental (architecture.md flow 2, ADR-0001):
 *
 *   authorise -> store the file -> BEGIN; INSERT ProductPhoto;
 *                                        INSERT Event; COMMIT
 *
 * The row and its event share one transaction, so there is no window in which
 * a photo exists and its event does not. The file is written first, outside the
 * transaction, which means a rolled-back transaction can leave an unreferenced
 * object in the bucket. That trade is deliberate and one-sided: an orphaned
 * file is a cleanup job, a missing event is a permanently wrong number.
 */
import { Router } from 'express';
import { prisma } from '@dtbi/db';
import { emitEvent } from '../../events/emit.ts';
import { errors } from '../../middleware/errors.ts';
import { authedSeller, scopedStore } from '../../middleware/session.ts';
import { loadedProduct } from '../products/loaded.ts';
import { getStorage, photoKey } from './storage.ts';
import { extensionFor, readUploadedImage } from './upload.ts';

export const photosRouter: Router = Router({ mergeParams: true });

// ---------------------------------------------------------------------------
// POST /products/:id/photos
// ---------------------------------------------------------------------------

photosRouter.post('/', async (req, res, next) => {
  try {
    const auth = authedSeller(res);
    const store = scopedStore(res);
    const product = loadedProduct(res);

    // Validate before touching storage, so a rejected upload never leaves an
    // object behind.
    const image = await readUploadedImage(req);

    const key = photoKey(store.id, product.id, extensionFor(image.type));
    await getStorage().put({
      key,
      body: image.bytes,
      contentType: image.type,
    });

    const { photo, photoCount } = await prisma.$transaction(async (tx) => {
      // Position is derived inside the transaction. Two uploads racing could
      // still land on the same position; that affects display order only, and
      // is not worth a lock on the path the primary metric depends on.
      const existing = await tx.productPhoto.count({
        where: { productId: product.id },
      });

      const created = await tx.productPhoto.create({
        data: {
          productId: product.id,
          storageKey: key,
          position: existing,
          isSeed: store.isSeed,
        },
      });

      await emitEvent(tx, {
        type: 'product.photo_added',
        actorType: 'seller',
        actorId: auth.user.id,
        storeId: store.id,
        isSeed: store.isSeed,
        entityType: 'product',
        entityId: product.id,
        payload: { photo_count: existing + 1, position: created.position },
      });

      return { photo: created, photoCount: existing + 1 };
    });

    // api-spec.md returns photo_count because the dashboard tile and the
    // recommendation both depend on it, and a client that has to re-fetch to
    // learn it will sometimes not bother.
    res.status(201).json({
      photo: {
        id: photo.id,
        url: await getStorage().urlFor(photo.storageKey),
        position: photo.position,
      },
      product: { id: product.id, photo_count: photoCount },
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// DELETE /products/:id/photos/:photoId
// ---------------------------------------------------------------------------

photosRouter.delete('/:photoId', async (req, res, next) => {
  try {
    const auth = authedSeller(res);
    const store = scopedStore(res);
    const product = loadedProduct(res);

    const photoId = req.params.photoId;
    if (!photoId) {
      return next(errors.notFound('photo_not_found', 'ไม่พบรูปนี้'));
    }

    const photo = await prisma.productPhoto.findUnique({
      where: { id: photoId },
    });

    // The product was already resolved against the caller's store, so checking
    // the photo belongs to it completes the chain.
    if (!photo || photo.productId !== product.id) {
      return next(errors.notFound('photo_not_found', 'ไม่พบรูปนี้'));
    }

    const photoCount = await prisma.$transaction(async (tx) => {
      await tx.productPhoto.delete({ where: { id: photo.id } });

      const remaining = await tx.productPhoto.count({
        where: { productId: product.id },
      });

      await emitEvent(tx, {
        type: 'product.photo_removed',
        actorType: 'seller',
        actorId: auth.user.id,
        storeId: store.id,
        isSeed: store.isSeed,
        entityType: 'product',
        entityId: product.id,
        payload: { photo_count: remaining },
      });

      return remaining;
    });

    // Only once the database has committed. Deleting the object first would
    // destroy the file for a transaction that then rolls back, leaving a row
    // pointing at nothing — worse than an orphaned object, which is invisible.
    try {
      await getStorage().remove(photo.storageKey);
    } catch {
      // The record is already correct; the leftover object is a cleanup job,
      // not a reason to fail the seller's request.
    }

    res.status(200).json({
      product: { id: product.id, photo_count: photoCount },
    });
  } catch (err) {
    next(err);
  }
});

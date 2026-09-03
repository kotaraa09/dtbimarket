/**
 * PB-07 / FEAT-B1 — store profile create and edit.
 *
 * Events: store.created, store.profile_updated.
 *
 * `store.profile_updated` carries four booleans rather than the new values.
 * Which fields a seller edits is the analysable fact; the store's contact
 * channel is personal data and the description is free text a seller may put
 * anything into, so neither belongs in an append-only table (REQ-N2).
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
import { requireOwnStore } from '../../middleware/store-scope.ts';
import { toStoreDto } from './dto.ts';
import {
  createStoreSchema,
  slugify,
  updateStoreSchema,
  type CreateStoreInput,
  type UpdateStoreInput,
} from './schemas.ts';

export const storesRouter: Router = Router();

// ---------------------------------------------------------------------------
// POST /stores — create the seller's one store
// ---------------------------------------------------------------------------

storesRouter.post(
  '/',
  attachSession,
  requireSeller,
  validateBody(createStoreSchema),
  async (_req, res, next) => {
    try {
      const auth = authedSeller(res);
      const body = validatedBody<CreateStoreInput>(res);

      const store = await prisma.$transaction(async (tx) => {
        const created = await tx.store.create({
          data: {
            ownerId: auth.user.id,
            name: body.name,
            slug: body.slug ?? slugify(body.name),
            description: body.description ?? null,
            category: body.category,
            contactChannel: body.contactChannel ?? null,
            isSeed: auth.user.isSeed,
          },
        });

        await emitEvent(tx, {
          type: 'store.created',
          actorType: 'seller',
          actorId: auth.user.id,
          storeId: created.id,
          isSeed: auth.user.isSeed,
          entityType: 'store',
          entityId: created.id,
          payload: { category: created.category },
        });

        return created;
      });

      res.status(201).json({ store: toStoreDto(store) });
    } catch (err) {
      // The database enforces one store per seller with a unique constraint on
      // owner_id, and a unique slug. We translate the violation rather than
      // checking first and racing (api-spec.md).
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        const target = (err.meta?.target as string[] | undefined) ?? [];
        if (target.includes('owner_id')) {
          return next(
            errors.conflict('store_already_exists', 'คุณมีร้านอยู่แล้ว'),
          );
        }
        return next(
          errors.conflict('slug_taken', 'ชื่อ URL นี้ถูกใช้งานแล้ว'),
        );
      }
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// PATCH /stores/:id — edit profile
// ---------------------------------------------------------------------------

storesRouter.patch(
  '/:id',
  attachSession,
  requireSeller,
  requireOwnStore,
  validateBody(updateStoreSchema),
  async (req, res, next) => {
    try {
      const auth = authedSeller(res);
      const store = scopedStore(res);
      const body = validatedBody<UpdateStoreInput>(res);

      // Store-scope resolved the caller's own store; this refuses an attempt to
      // edit someone else's by ID. 404, not 403 — a 403 confirms the ID is real.
      if (req.params.id !== store.id) {
        return next(errors.notFound('store_not_found', 'ไม่พบร้านนี้'));
      }

      const changed = {
        name: body.name !== undefined && body.name !== store.name,
        description:
          body.description !== undefined && body.description !== store.description,
        category: body.category !== undefined && body.category !== store.category,
        contact:
          body.contactChannel !== undefined &&
          body.contactChannel !== store.contactChannel,
      };

      // Nothing actually changed. Returning early keeps the event table free of
      // rows that say "a seller pressed save", which is not the same fact as
      // "a seller edited their profile" and would inflate any count of the latter.
      if (!changed.name && !changed.description && !changed.category && !changed.contact) {
        return res.status(200).json({ store: toStoreDto(store) });
      }

      const updated = await prisma.$transaction(async (tx) => {
        const next_ = await tx.store.update({
          where: { id: store.id },
          data: {
            ...(body.name !== undefined ? { name: body.name } : {}),
            ...(body.description !== undefined
              ? { description: body.description }
              : {}),
            ...(body.category !== undefined ? { category: body.category } : {}),
            ...(body.contactChannel !== undefined
              ? { contactChannel: body.contactChannel }
              : {}),
          },
        });

        await emitEvent(tx, {
          type: 'store.profile_updated',
          actorType: 'seller',
          actorId: auth.user.id,
          storeId: store.id,
          isSeed: store.isSeed,
          entityType: 'store',
          entityId: store.id,
          payload: {
            name_changed: changed.name,
            description_changed: changed.description,
            category_changed: changed.category,
            contact_changed: changed.contact,
          },
        });

        return next_;
      });

      res.status(200).json({ store: toStoreDto(updated) });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        return next(errors.conflict('slug_taken', 'ชื่อ URL นี้ถูกใช้งานแล้ว'));
      }
      next(err);
    }
  },
);

/**
 * The administrator area (ACT-3, REQ-A4, REQ-N21).
 *
 * It exists to answer PDPA requests: look up what personal data is held about a
 * person, and erase it on request. That means its ordinary work is reading
 * personal data, which is exactly why **every route here writes an audit entry,
 * reads included** (ADR-0005).
 *
 * Three things it deliberately cannot do:
 *
 *  - **Change anyone's role.** No requirement asks for it, and an endpoint that
 *    grants roles is the escalation surface this whole change exists to close.
 *  - **Touch Event, Assignment or Recommendation.** REQ-A4: the researcher can
 *    read study state without being able to edit telemetry. There is no write
 *    path to those tables anywhere in the application.
 *  - **Act on itself.** An admin cannot suspend or anonymise their own account:
 *    it would end their session mid-request and, if they were the only admin,
 *    lock the platform out of its own administration.
 */
import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { Algorithm, hash } from '@node-rs/argon2';
import { prisma } from '@dtbi/db';
import {
  ANONYMISED_FIELDS,
  DISCLOSED_FIELDS,
  type AdminAuditEntryDto,
  type AdminUserDetailDto,
  type AdminUserSummaryDto,
  type Paginated,
} from '@dtbi/shared';
import { writeAudit } from '../../audit/write.ts';
import { errors } from '../../middleware/errors.ts';
import { attachSession, authedUser, requireAdmin } from '../../middleware/session.ts';
import {
  validateBody,
  validateQuery,
  validatedQuery,
} from '../../middleware/validate.ts';
import {
  anonymiseSchema,
  listAuditQuerySchema,
  listUsersQuerySchema,
  type ListAuditQuery,
  type ListUsersQuery,
} from './schemas.ts';

export const adminRouter: Router = Router();

const adminOnly = [attachSession, requireAdmin] as const;

function requestId(res: import('express').Response): string | undefined {
  return res.locals.requestId as string | undefined;
}

/** Express 5 types a route param as string | string[]; take the first. */
function paramId(req: import('express').Request): string | undefined {
  const raw = req.params.id;
  return Array.isArray(raw) ? raw[0] : raw;
}

type UserWithStore = Awaited<ReturnType<typeof loadUser>>;

function loadUser(id: string) {
  return prisma.user.findUnique({ where: { id }, include: { store: true } });
}

function toSummary(u: {
  id: string;
  role: string;
  status: string;
  createdAt: Date;
  isSeed: boolean;
  store: unknown | null;
}): AdminUserSummaryDto {
  return {
    id: u.id,
    role: u.role as AdminUserSummaryDto['role'],
    status: u.status as AdminUserSummaryDto['status'],
    hasStore: u.store !== null,
    createdAt: u.createdAt.toISOString(),
    isSeed: u.isSeed,
  };
}

// ---------------------------------------------------------------------------
// GET /admin/users — list. No personal data.
// ---------------------------------------------------------------------------
//
// The list carries IDs, roles, statuses and dates only. Browsing it is
// therefore not itself a disclosure, which keeps the routine work of finding
// an account from generating a personal-data access every time. Names and
// email addresses live in the detail view, one deliberate click away.

adminRouter.get(
  '/users',
  ...adminOnly,
  validateQuery(listUsersQuerySchema),
  async (_req, res, next) => {
    try {
      const admin = authedUser(res);
      const q = validatedQuery<ListUsersQuery>(res);

      const rows = await prisma.user.findMany({
        where: {
          ...(q.role ? { role: q.role } : {}),
          ...(q.status ? { status: q.status } : {}),
        },
        include: { store: true },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: q.limit + 1,
        ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      });

      const hasMore = rows.length > q.limit;
      const page = hasMore ? rows.slice(0, q.limit) : rows;

      await writeAudit(prisma, {
        action: 'admin.users_listed',
        actorId: admin.user.id,
        requestId: requestId(res),
        metadata: {
          result_count: page.length,
          role_filter: q.role ?? 'any',
          status_filter: q.status ?? 'any',
        },
      });

      const body: Paginated<AdminUserSummaryDto> = {
        items: page.map(toSummary),
        nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
      };
      res.status(200).json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /admin/users/:id — detail. This IS a personal-data disclosure.
// ---------------------------------------------------------------------------

adminRouter.get('/users/:id', ...adminOnly, async (req, res, next) => {
  try {
    const admin = authedUser(res);
    const id = paramId(req);
    if (!id) return next(errors.notFound('user_not_found', 'ไม่พบผู้ใช้นี้'));

    const user = await loadUser(id);
    if (!user) return next(errors.notFound('user_not_found', 'ไม่พบผู้ใช้นี้'));

    // Written before the response, and naming the fields revealed — not their
    // values. After an incident this is what scopes the exposure.
    await writeAudit(prisma, {
      action: 'admin.user_viewed',
      actorId: admin.user.id,
      targetType: 'user',
      targetId: user.id,
      requestId: requestId(res),
      metadata: {
        target_role: user.role,
        target_status: user.status,
        fields_disclosed: DISCLOSED_FIELDS.join(','),
      },
    });

    const body: AdminUserDetailDto = {
      ...toSummary(user),
      email: user.email,
      displayName: user.displayName,
      store: user.store
        ? {
            id: user.store.id,
            name: user.store.name,
            slug: user.store.slug,
            contactChannel: user.store.contactChannel,
          }
        : null,
    };
    res.status(200).json(body);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Status changes
// ---------------------------------------------------------------------------

/** Shared guard: the target must exist, and must not be the caller. */
async function resolveTarget(
  req: import('express').Request,
  res: import('express').Response,
): Promise<NonNullable<UserWithStore>> {
  const admin = authedUser(res);
  const id = paramId(req);
  if (!id) throw errors.notFound('user_not_found', 'ไม่พบผู้ใช้นี้');

  if (id === admin.user.id) {
    throw errors.conflict(
      'cannot_act_on_self',
      'ไม่สามารถดำเนินการกับบัญชีของตัวเองได้',
    );
  }

  const user = await loadUser(id);
  if (!user) throw errors.notFound('user_not_found', 'ไม่พบผู้ใช้นี้');
  return user;
}

adminRouter.post('/users/:id/suspend', ...adminOnly, async (req, res, next) => {
  try {
    const admin = authedUser(res);
    const target = await resolveTarget(req, res);

    if (target.status === 'anonymised') {
      return next(
        errors.conflict('already_anonymised', 'บัญชีนี้ถูกลบข้อมูลไปแล้ว'),
      );
    }
    if (target.status === 'suspended') {
      return res.status(200).json({ user: toSummary(target) });
    }

    const { updated, revoked } = await prisma.$transaction(async (tx) => {
      const next_ = await tx.user.update({
        where: { id: target.id },
        data: { status: 'suspended' },
        include: { store: true },
      });

      const count = await tx.session.updateMany({
        where: { userId: target.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      // Same transaction as the change it describes, so the record and the
      // effect cannot come apart.
      await writeAudit(tx, {
        action: 'admin.user_suspended',
        actorId: admin.user.id,
        targetType: 'user',
        targetId: target.id,
        requestId: requestId(res),
        metadata: {
          target_role: target.role,
          status_before: target.status,
          status_after: 'suspended',
          sessions_revoked: count.count,
        },
      });

      return { updated: next_, revoked: count.count };
    });

    res.status(200).json({ user: toSummary(updated), sessionsRevoked: revoked });
  } catch (err) {
    next(err);
  }
});

adminRouter.post('/users/:id/reinstate', ...adminOnly, async (req, res, next) => {
  try {
    const admin = authedUser(res);
    const target = await resolveTarget(req, res);

    if (target.status === 'anonymised') {
      // Anonymisation destroyed the personal data. There is no account left to
      // restore, and pretending otherwise would hand back a login nobody can use.
      return next(
        errors.conflict(
          'already_anonymised',
          'บัญชีนี้ถูกลบข้อมูลถาวรแล้ว กู้คืนไม่ได้',
        ),
      );
    }
    if (target.status === 'active') {
      return res.status(200).json({ user: toSummary(target) });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const next_ = await tx.user.update({
        where: { id: target.id },
        data: { status: 'active' },
        include: { store: true },
      });

      await writeAudit(tx, {
        action: 'admin.user_reinstated',
        actorId: admin.user.id,
        targetType: 'user',
        targetId: target.id,
        requestId: requestId(res),
        metadata: {
          target_role: target.role,
          status_before: target.status,
          status_after: 'active',
          // Reinstating does not restore old sessions; the person signs in again.
          sessions_revoked: 0,
        },
      });

      return next_;
    });

    res.status(200).json({ user: toSummary(updated) });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /admin/users/:id/anonymise — REQ-N21, irreversible
// ---------------------------------------------------------------------------

adminRouter.post(
  '/users/:id/anonymise',
  ...adminOnly,
  validateBody(anonymiseSchema),
  async (req, res, next) => {
    try {
      const admin = authedUser(res);
      const target = await resolveTarget(req, res);

      if (target.status === 'anonymised') {
        return res.status(200).json({ user: toSummary(target) });
      }

      // A hash of random bytes rather than an empty or fixed value: the account
      // must be unusable, and a predictable hash is a shared password across
      // every anonymised account.
      const deadPasswordHash = await hash(randomBytes(32).toString('hex'), {
        algorithm: Algorithm.Argon2id,
        memoryCost: 19456,
        timeCost: 2,
        parallelism: 1,
      });

      const { updated, revoked } = await prisma.$transaction(async (tx) => {
        const next_ = await tx.user.update({
          where: { id: target.id },
          data: {
            // Unique, non-routable, and carries no information about the person.
            email: `anonymised-${target.id}@invalid`,
            displayName: 'ผู้ใช้ที่ถูกลบข้อมูล',
            passwordHash: deadPasswordHash,
            status: 'anonymised',
          },
          include: { store: true },
        });

        if (target.store) {
          await tx.store.update({
            where: { id: target.store.id },
            data: {
              contactChannel: null,
              // A storefront whose owner can no longer sign in must not keep
              // taking orders nobody can fulfil.
              status: 'paused',
            },
          });
        }

        const count = await tx.session.updateMany({
          where: { userId: target.id, revokedAt: null },
          data: { revokedAt: new Date() },
        });

        await writeAudit(tx, {
          action: 'admin.user_anonymised',
          actorId: admin.user.id,
          targetType: 'user',
          targetId: target.id,
          requestId: requestId(res),
          metadata: {
            target_role: target.role,
            status_before: target.status,
            status_after: 'anonymised',
            sessions_revoked: count.count,
            fields_cleared: ANONYMISED_FIELDS.join(','),
          },
        });

        return { updated: next_, revoked: count.count };
      });

      // Nothing above touches Event. It does not need to: events reference
      // people by ID and hold no personal data (REQ-N2), which is the whole
      // reason append-only telemetry and the right to erasure can coexist.
      res.status(200).json({ user: toSummary(updated), sessionsRevoked: revoked });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /admin/audit — the trail itself, read-only
// ---------------------------------------------------------------------------
//
// Visible to administrators, and unalterable by them: the database refuses
// UPDATE and DELETE on this table whoever is connected. Reading it is itself
// audited, so "who went looking at the trail" is answerable too.

adminRouter.get(
  '/audit',
  ...adminOnly,
  validateQuery(listAuditQuerySchema),
  async (_req, res, next) => {
    try {
      const admin = authedUser(res);
      const q = validatedQuery<ListAuditQuery>(res);

      const rows = await prisma.adminAuditLog.findMany({
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        take: q.limit + 1,
        ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      });

      const hasMore = rows.length > q.limit;
      const page = hasMore ? rows.slice(0, q.limit) : rows;

      await writeAudit(prisma, {
        action: 'admin.audit_viewed',
        actorId: admin.user.id,
        requestId: requestId(res),
        metadata: { result_count: page.length },
      });

      const body: Paginated<AdminAuditEntryDto> = {
        items: page.map((r) => ({
          id: r.id,
          action: r.action,
          actorId: r.actorId,
          targetType: r.targetType,
          targetId: r.targetId,
          requestId: r.requestId,
          metadata: r.metadata as AdminAuditEntryDto['metadata'],
          occurredAt: r.occurredAt.toISOString(),
        })),
        nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
      };
      res.status(200).json(body);
    } catch (err) {
      next(err);
    }
  },
);

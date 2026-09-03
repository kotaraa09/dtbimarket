/**
 * PB-06 / FEAT-A1 — seller registration and sign-in.
 *
 * Events: seller.registered, seller.signed_in (buyer.* for the buyer role,
 * which PB-14 will use; the endpoint already writes the right one).
 *
 * Neither event carries a payload. There is nothing to record about a
 * registration that is not personal data, and an empty payload is the honest
 * answer rather than a padded one.
 */
import { Router } from 'express';
import { Algorithm, hash, verify } from '@node-rs/argon2';
import { prisma } from '@dtbi/db';
import type { MeResponse, UserDto } from '@dtbi/shared';
import { emitEvent } from '../../events/emit.ts';
import { errors } from '../../middleware/errors.ts';
import { validateBody, validatedBody } from '../../middleware/validate.ts';
import {
  attachSession,
  currentAuth,
  requireAuth,
} from '../../middleware/session.ts';
import {
  clearedSessionCookie,
  createSession,
  revokeSession,
  sessionCookie,
} from '../../lib/session.ts';
import { toStoreDto } from '../stores/dto.ts';
import { registerSchema, loginSchema } from './schemas.ts';
import type { LoginInput, RegisterInput } from './schemas.ts';

/**
 * Argon2id, per database-schema.md. Parameters are the @node-rs defaults for
 * memory and time cost, which follow the OWASP guidance; they are named here
 * rather than left implicit so that a future change is a visible one.
 */
const ARGON2 = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
} as const;

function toUserDto(user: { id: string; role: string; displayName: string }): UserDto {
  return {
    id: user.id,
    role: user.role as UserDto['role'],
    displayName: user.displayName,
  };
}

export const authRouter: Router = Router();

// ---------------------------------------------------------------------------
// POST /auth/register
// ---------------------------------------------------------------------------

authRouter.post('/register', validateBody(registerSchema), async (req, res, next) => {
  try {
    const body = validatedBody<RegisterInput>(res);
    const email = body.email.trim().toLowerCase();

    const passwordHash = await hash(body.password, ARGON2);

    // The user row and its event share one transaction (ADR-0001).
    const user = await prisma.$transaction(async (tx) => {
      const existing = await tx.user.findUnique({ where: { email } });
      if (existing) {
        // Deliberately the same wording as a failed login would give for a
        // wrong password: telling an anonymous caller which addresses are
        // registered is an enumeration oracle over real students.
        throw errors.conflict(
          'email_already_registered',
          'อีเมลนี้ถูกใช้งานแล้ว',
        );
      }

      const created = await tx.user.create({
        data: {
          email,
          passwordHash,
          role: body.role,
          displayName: body.displayName.trim(),
        },
      });

      await emitEvent(tx, {
        type: body.role === 'seller' ? 'seller.registered' : 'buyer.registered',
        actorType: body.role === 'seller' ? 'seller' : 'buyer',
        actorId: created.id,
        isSeed: created.isSeed,
      });

      return created;
    });

    const sessionId = await createSession(user.id);
    res.setHeader('Set-Cookie', sessionCookie(sessionId));
    res.status(201).json({ user: toUserDto(user) });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /auth/login
// ---------------------------------------------------------------------------

authRouter.post('/login', validateBody(loginSchema), async (req, res, next) => {
  try {
    const body = validatedBody<LoginInput>(res);
    const email = body.email.trim().toLowerCase();

    const user = await prisma.user.findUnique({ where: { email } });

    const invalid = errors.invalidCredentials;

    if (!user) {
      // Spend comparable time on a missing account so that response time does
      // not answer the question the error message refuses to.
      await hash(body.password, ARGON2);
      throw invalid();
    }

    const ok = await verify(user.passwordHash, body.password);
    if (!ok) throw invalid();

    await prisma.$transaction(async (tx) => {
      await emitEvent(tx, {
        type: user.role === 'seller' ? 'seller.signed_in' : 'buyer.signed_in',
        actorType: user.role === 'seller' ? 'seller' : 'buyer',
        actorId: user.id,
        isSeed: user.isSeed,
      });
    });

    const sessionId = await createSession(user.id);
    res.setHeader('Set-Cookie', sessionCookie(sessionId));
    res.status(200).json({ user: toUserDto(user) });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /auth/logout — no event (api-spec.md)
// ---------------------------------------------------------------------------

authRouter.post('/logout', attachSession, async (_req, res, next) => {
  try {
    const auth = currentAuth(res);
    if (auth) await revokeSession(auth.sessionId);
    res.setHeader('Set-Cookie', clearedSessionCookie());
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /auth/me — no event
// ---------------------------------------------------------------------------

authRouter.get('/me', attachSession, requireAuth, (_req, res, next) => {
  try {
    const auth = currentAuth(res)!;
    const body: MeResponse = {
      user: toUserDto(auth.user),
      store: auth.store ? toStoreDto(auth.store) : null,
    };
    res.status(200).json(body);
  } catch (err) {
    next(err);
  }
});

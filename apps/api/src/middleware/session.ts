/**
 * Resolves the signed-in user. First in the chain.
 *
 * Middleware order is fixed: session -> store-scope -> validate -> handler
 * (detailed-design.md). Validation runs after authorisation so that an
 * unauthorised caller cannot use validation error messages to learn which IDs
 * exist.
 */
import type { NextFunction, Request, Response } from 'express';
import type { Store } from '@dtbi/db';
import type { AuthContext } from '../lib/session.ts';
import { resolveSession } from '../lib/session.ts';
import { errors } from './errors.ts';

/** Attaches the caller, or null. Never refuses on its own. */
export async function attachSession(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const auth = await resolveSession(req.headers.cookie);
    res.locals.auth = auth;
    if (auth) res.locals.userId = auth.user.id;
    next();
  } catch (err) {
    next(err);
  }
}

export function currentAuth(res: Response): AuthContext | null {
  return (res.locals.auth as AuthContext | null) ?? null;
}

/** Signed in as anyone. */
export function requireAuth(
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!currentAuth(res)) return next(errors.unauthorized());
  next();
}

/**
 * Signed in as a seller. Role gates the dashboard, not the storefront
 * (database-schema.md), so this is only applied to seller routes.
 */
export function requireSeller(
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  const auth = currentAuth(res);
  if (!auth) return next(errors.unauthorized());
  if (auth.user.role !== 'seller' && auth.user.role !== 'admin') {
    return next(errors.forbidden());
  }
  next();
}

/** Convenience accessors for handlers that ran behind the guards above. */
export function authedSeller(res: Response): AuthContext {
  const auth = currentAuth(res);
  if (!auth) throw errors.unauthorized();
  return auth;
}

export function scopedStore(res: Response): Store {
  const store = res.locals.store as Store | undefined;
  if (!store) throw errors.forbidden();
  return store;
}

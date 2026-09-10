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
import type { UserRole } from '@dtbi/shared';
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
 * Signed in as one of the given roles.
 *
 * One place decides what a role may reach, so a new route cannot invent its own
 * interpretation — the same reasoning that puts store scoping in one middleware
 * rather than in each handler (REQ-A3).
 *
 * 401 when nobody is signed in, 403 when somebody is but holds the wrong role.
 * The distinction matters to the client: one means "sign in", the other means
 * "signing in again will not help".
 */
export function requireRole(...roles: readonly UserRole[]) {
  return (_req: Request, res: Response, next: NextFunction): void => {
    const auth = currentAuth(res);
    if (!auth) return next(errors.unauthorized());
    if (!roles.includes(auth.user.role)) return next(errors.forbidden());
    next();
  };
}

/**
 * Signed in as a seller. Role gates the dashboard, not the storefront
 * (database-schema.md), so this is only applied to seller routes.
 *
 * Sellers only — an administrator is NOT admitted here. Previously admin was
 * allowed through, which was harmless only by accident: every route behind this
 * guard then resolves the caller's own store, and an admin has none, so it
 * 404ed. Relying on a second guard to catch what the first should have refused
 * is the kind of thing that stops being true when someone adds a route.
 * Administrators have their own area.
 */
export const requireSeller = requireRole('seller');

/** Signed in as an administrator. */
export const requireAdmin = requireRole('admin');

/**
 * The signed-in caller, for a handler that already ran behind one of the guards
 * above. It asserts only that somebody is signed in — the role was decided by
 * the guard, which is why this is not named for any one role.
 */
export function authedUser(res: Response): AuthContext {
  const auth = currentAuth(res);
  if (!auth) throw errors.unauthorized();
  return auth;
}

export function scopedStore(res: Response): Store {
  const store = res.locals.store as Store | undefined;
  if (!store) throw errors.forbidden();
  return store;
}

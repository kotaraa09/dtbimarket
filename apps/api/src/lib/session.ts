/**
 * Server-side sessions (ADR-0003).
 *
 * The session is a row in the database. The cookie carries only its ID, signed
 * so a forged ID is rejected before it reaches a query. Revocation is a write
 * to that row — which is the property the study needs: a seller who withdraws
 * must be signable-out, and a self-contained token cannot be taken back.
 *
 * Implemented with node:crypto rather than a session library. The whole
 * mechanism is an HMAC and a lookup, and CLAUDE.md rule 10 says not to add a
 * dependency for what the standard library already does.
 */
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { prisma } from '@dtbi/db';
import type { Store, User } from '@dtbi/db';
import { config, isProduction } from './config.ts';
import { getClock } from './clock.ts';

export const SESSION_COOKIE = 'dtbi_session';

const SESSION_DAYS = 14;
const SESSION_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Cookie encoding
// ---------------------------------------------------------------------------

function sign(sessionId: string): string {
  const mac = createHmac('sha256', config.sessionSecret)
    .update(sessionId)
    .digest('base64url');
  return `${sessionId}.${mac}`;
}

function unsign(value: string): string | null {
  const separator = value.lastIndexOf('.');
  if (separator <= 0) return null;

  const sessionId = value.slice(0, separator);
  const provided = Buffer.from(value.slice(separator + 1), 'base64url');
  const expected = Buffer.from(
    createHmac('sha256', config.sessionSecret).update(sessionId).digest('base64url'),
    'base64url',
  );

  if (provided.length !== expected.length) return null;
  return timingSafeEqual(provided, expected) ? sessionId : null;
}

export function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  const out: Record<string, string> = {};
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    if (key === '') continue;
    out[key] = decodeURIComponent(part.slice(eq + 1).trim());
  }
  return out;
}

export function sessionCookie(sessionId: string): string {
  const attrs = [
    `${SESSION_COOKIE}=${encodeURIComponent(sign(sessionId))}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.floor(SESSION_MS / 1000)}`,
  ];
  // Secure would make the cookie unusable over plain http in local development.
  if (isProduction) attrs.push('Secure');
  return attrs.join('; ');
}

export function clearedSessionCookie(): string {
  const attrs = [
    `${SESSION_COOKIE}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
  ];
  if (isProduction) attrs.push('Secure');
  return attrs.join('; ');
}

// ---------------------------------------------------------------------------
// Session lifecycle
// ---------------------------------------------------------------------------

export interface AuthContext {
  user: User;
  /** The caller's own store, or null if they have not created one yet. */
  store: Store | null;
  sessionId: string;
}

export async function createSession(userId: string): Promise<string> {
  const now = getClock().now();
  const session = await prisma.session.create({
    data: {
      id: randomUUID(),
      userId,
      expiresAt: new Date(now.getTime() + SESSION_MS),
    },
  });
  return session.id;
}

export async function resolveSession(
  cookieHeader: string | undefined,
): Promise<AuthContext | null> {
  const raw = parseCookies(cookieHeader)[SESSION_COOKIE];
  if (!raw) return null;

  const sessionId = unsign(raw);
  if (!sessionId) return null;

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { user: { include: { store: true } } },
  });

  if (!session) return null;
  if (session.revokedAt !== null) return null;
  if (session.expiresAt.getTime() <= getClock().now().getTime()) return null;

  const { store, ...user } = session.user;
  return { user, store, sessionId };
}

export async function revokeSession(sessionId: string): Promise<void> {
  await prisma.session.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: getClock().now() },
  });
}

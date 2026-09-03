/**
 * The database client.
 *
 * Everything that touches Postgres imports from here. apps/web must not — the
 * browser never talks to the database (architecture.md); only apps/api and the
 * seed script use this module.
 */
import { PrismaClient } from './generated/client/client.ts';

export * from './generated/client/client.ts';
export * from './generated/client/enums.ts';

/**
 * One client per process. Next.js and `node --watch` both re-evaluate modules
 * on reload, and a fresh PrismaClient per reload exhausts the connection pool
 * within a few saves. Stashing it on globalThis survives the reload.
 */
const globalForPrisma = globalThis as unknown as { __dtbiPrisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.__dtbiPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__dtbiPrisma = prisma;
}

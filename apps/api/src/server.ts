/**
 * apps/api — the choke point.
 *
 * architecture.md: "Everything a user does passes through apps/api. That is the
 * single choke point where an event can be guaranteed, and it is the reason the
 * browser never talks to the database or to the advisor directly."
 *
 * Middleware order is fixed and matters:
 *   requestId -> cors -> json -> [routes: session -> store-scope -> validate -> handler]
 *   -> notFound -> errorHandler
 */
import { randomUUID } from 'node:crypto';
import express from 'express';
import type { Express, NextFunction, Request, Response, Router } from 'express';
import { prisma } from '@dtbi/db';
import { config, isProduction } from './lib/config.ts';
import { log } from './lib/logger.ts';
import { errorHandler, notFoundHandler } from './middleware/errors.ts';
import { authRouter } from './modules/auth/routes.ts';
import { storesRouter } from './modules/stores/routes.ts';
import { productsRouter } from './modules/products/routes.ts';

export const app: Express = express();

// Behind a proxy in deployment; needed for correct protocol detection.
app.set('trust proxy', 1);
app.disable('x-powered-by');

// ---------------------------------------------------------------------------
// Request ID + access log
// ---------------------------------------------------------------------------

app.use((req: Request, res: Response, next: NextFunction) => {
  const requestId = randomUUID();
  res.locals.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);

  const startedAt = process.hrtime.bigint();
  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    // Never an email, a name, a phone number or an address. People by ID only.
    log.info({
      requestId,
      method: req.method,
      route: req.path,
      status: res.statusCode,
      durationMs: Math.round(durationMs),
      userId: res.locals.userId as string | undefined,
      storeId: res.locals.storeId as string | undefined,
    });
  });

  next();
});

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------
//
// Written out rather than pulling in the `cors` package. It is one origin, one
// allowlist and a preflight reply — CLAUDE.md rule 10.
//
// The origin is echoed only when it matches the configured one. `*` cannot be
// used at all here: credentials are required for the session cookie, and the
// browser refuses a wildcard origin alongside them.

app.use((req: Request, res: Response, next: NextFunction) => {
  const origin = req.headers.origin;
  if (origin && origin === config.webOrigin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Max-Age', '600');
  }

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  next();
});

app.use(express.json({ limit: '100kb' }));

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.get('/health/ready', async (_req, res) => {
  try {
    // Readiness means the database is reachable and migrations are applied.
    await prisma.$queryRaw`SELECT 1`;
    const applied = await prisma.$queryRaw<
      { count: bigint }[]
    >`SELECT count(*) AS count FROM _prisma_migrations WHERE finished_at IS NOT NULL`;
    res.status(200).json({
      status: 'ready',
      migrationsApplied: Number(applied[0]?.count ?? 0),
    });
  } catch {
    // Better a clear outage than a session that appears to work and records
    // nothing (detailed-design.md).
    res.status(503).json({ status: 'not_ready' });
  }
});

// ---------------------------------------------------------------------------
// API v1
// ---------------------------------------------------------------------------

const v1: Router = express.Router();
v1.use('/auth', authRouter);
v1.use('/stores', storesRouter);
v1.use('/products', productsRouter);

app.use('/api/v1', v1);

app.use(notFoundHandler);
app.use(errorHandler);

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

const isEntryPoint =
  process.argv[1] !== undefined &&
  import.meta.url === new URL(`file://${process.argv[1].replace(/\\/g, '/')}`).href;

if (isEntryPoint || process.env.DTBI_START === '1') {
  app.listen(config.port, () => {
    log.info({
      message: `api listening on http://localhost:${config.port} (${config.nodeEnv})`,
    });
    if (!isProduction) {
      process.stdout.write(`  web origin allowed: ${config.webOrigin}\n`);
    }
  });
}

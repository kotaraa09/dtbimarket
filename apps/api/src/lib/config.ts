/**
 * Environment configuration, validated once at start-up.
 *
 * architecture.md: "the process refuses to boot if one is missing — a service
 * that starts without its session secret and generates a new one per restart
 * signs everybody out at random and looks like a bug in the login form."
 */

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') {
    throw new Error(
      `Missing required environment variable ${name}. Copy .env.example to .env and fill it in.`,
    );
  }
  return value;
}

function optional(name: string, fallback: string): string {
  const value = process.env[name];
  return value === undefined || value.trim() === '' ? fallback : value;
}

const sessionSecret = required('SESSION_SECRET');
if (sessionSecret.length < 32) {
  throw new Error('SESSION_SECRET must be at least 32 characters.');
}

const nodeEnv = optional('NODE_ENV', 'development');
const isProd = nodeEnv === 'production';

// ---------------------------------------------------------------------------
// Object storage (ADR-0004)
// ---------------------------------------------------------------------------

/**
 * `s3` talks to any S3-compatible bucket — MinIO locally, a managed bucket in
 * deployment. `memory` keeps objects in a Map and exists only so the test suite
 * does not need a running bucket.
 *
 * Production must be `s3`. architecture.md: "the file system of the API
 * container is not durable. Product photos must go to object storage from the
 * first version, or every deploy silently deletes the seller's photos — which
 * would also destroy the primary metric." A non-durable driver in production
 * is that failure with extra steps, so the process refuses to start.
 */
const storageDriver = optional('STORAGE_DRIVER', 's3');

if (!['s3', 'memory'].includes(storageDriver)) {
  throw new Error(`STORAGE_DRIVER must be "s3" or "memory", got "${storageDriver}".`);
}

if (isProd && storageDriver !== 's3') {
  throw new Error(
    'STORAGE_DRIVER must be "s3" in production. A non-durable driver loses every ' +
      'product photo on deploy, and photo count is the metric the first ' +
      'recommendation is built on.',
  );
}

const storage =
  storageDriver === 's3'
    ? ({
        driver: 's3' as const,
        bucket: required('STORAGE_BUCKET'),
        region: optional('STORAGE_REGION', 'auto'),
        accessKeyId: required('STORAGE_ACCESS_KEY_ID'),
        secretAccessKey: required('STORAGE_SECRET_ACCESS_KEY'),
        /** Set for MinIO and R2; leave empty for AWS S3 itself. */
        endpoint: optional('STORAGE_ENDPOINT', ''),
        /** MinIO needs path-style addressing; most managed providers do not. */
        forcePathStyle: optional('STORAGE_FORCE_PATH_STYLE', 'false') === 'true',
        /**
         * If the bucket is served publicly (a CDN in front of it), photo URLs
         * are built from this prefix. If empty, URLs are presigned at read time.
         */
        publicBaseUrl: optional('STORAGE_PUBLIC_BASE_URL', '').replace(/\/+$/, ''),
      } as const)
    : ({ driver: 'memory' as const } as const);

export const config = {
  nodeEnv,
  port: Number(optional('API_PORT', '4000')),
  databaseUrl: required('DATABASE_URL'),
  sessionSecret,
  webOrigin: optional('WEB_ORIGIN', 'http://localhost:3000'),
  storage,
} as const;

export const isProduction = isProd;

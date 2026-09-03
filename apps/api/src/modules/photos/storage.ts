/**
 * The storage adapter (ADR-0004).
 *
 * Everything above this file deals in **storage keys**, never URLs.
 * `database-schema.md`: "Object storage key, not a public URL — the URL is
 * built at read time so the bucket can move." A row holding
 * `https://some-vendor.example/...` pins the project to that vendor for the
 * life of the data; a row holding `stores/x/products/y/z.jpg` does not.
 *
 * Two drivers, one interface. `s3` speaks the S3 API and is what runs in
 * development (MinIO) and in deployment (a managed bucket) — the same code
 * path, differing only in configuration, so the thing that ships is the thing
 * that was exercised. `memory` exists so the test suite does not need a running
 * bucket; `config.ts` refuses to boot with it in production.
 */
import { randomUUID } from 'node:crypto';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../../lib/config.ts';

export interface StoredObject {
  key: string;
}

export interface Storage {
  put(input: {
    key: string;
    body: Buffer;
    contentType: string;
  }): Promise<StoredObject>;
  remove(key: string): Promise<void>;
  urlFor(key: string): Promise<string>;
}

/**
 * Keys are namespaced by store and product so that a bucket listing is
 * readable, and carry a random segment so that a deleted-then-re-added photo
 * never collides with a cached copy of the old one.
 */
export function photoKey(
  storeId: string,
  productId: string,
  extension: string,
): string {
  return `stores/${storeId}/products/${productId}/${randomUUID()}.${extension}`;
}

// ---------------------------------------------------------------------------
// S3
// ---------------------------------------------------------------------------

const PRESIGN_TTL_SECONDS = 60 * 60;

function createS3Storage(cfg: Extract<typeof config.storage, { driver: 's3' }>): Storage {
  const client = new S3Client({
    region: cfg.region,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
    ...(cfg.endpoint ? { endpoint: cfg.endpoint } : {}),
    forcePathStyle: cfg.forcePathStyle,
  });

  return {
    async put({ key, body, contentType }) {
      await client.send(
        new PutObjectCommand({
          Bucket: cfg.bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
        }),
      );
      return { key };
    },

    async remove(key) {
      await client.send(
        new DeleteObjectCommand({ Bucket: cfg.bucket, Key: key }),
      );
    },

    async urlFor(key) {
      // A bucket fronted by a CDN serves photos directly and the URL is stable
      // and cacheable. Without one, the object is private and the URL is signed
      // for an hour — correct by default, since an unsigned URL to a private
      // bucket would simply 403 and look like a broken image.
      if (cfg.publicBaseUrl) {
        return `${cfg.publicBaseUrl}/${key}`;
      }
      return getSignedUrl(
        client,
        new GetObjectCommand({ Bucket: cfg.bucket, Key: key }),
        { expiresIn: PRESIGN_TTL_SECONDS },
      );
    },
  };
}

// ---------------------------------------------------------------------------
// Memory — tests only
// ---------------------------------------------------------------------------

function createMemoryStorage(): Storage {
  const objects = new Map<string, { body: Buffer; contentType: string }>();

  return {
    async put({ key, body, contentType }) {
      objects.set(key, { body, contentType });
      return { key };
    },
    async remove(key) {
      objects.delete(key);
    },
    async urlFor(key) {
      // Shaped like a real URL so that a test asserting on the DTO exercises
      // the same code path a browser would follow.
      return `memory://${key}`;
    },
  };
}

let instance: Storage | null = null;

export function getStorage(): Storage {
  instance ??=
    config.storage.driver === 's3'
      ? createS3Storage(config.storage)
      : createMemoryStorage();
  return instance;
}

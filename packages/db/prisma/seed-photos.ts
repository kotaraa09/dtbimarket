/**
 * Placeholder images for the seed.
 *
 * Once PB-10 made photos real, seeded `ProductPhoto` rows pointing at keys with
 * no object behind them became broken thumbnails in every demo and screenshot
 * — and `database-schema.md` says the seed exists precisely so that "screenshots
 * and demos never use a real person's data". A seed that produces visibly
 * broken screens does not serve that purpose.
 *
 * So the seed writes real objects. The images are generated here rather than
 * committed as binary files: a solid colour is enough to show that a photo
 * exists, and it keeps the repository free of stock images with unclear
 * licensing.
 *
 * PNG is written by hand with node:zlib. It is about twenty lines and avoids an
 * image library for something with no image processing in it (REQ-N4).
 */
import { crc32, deflateSync } from 'node:zlib';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

function chunk(type: string, data: Buffer): Buffer {
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([length, typeAndData, checksum]);
}

/** A solid-colour PNG, 8-bit RGB. */
export function solidPng(
  width: number,
  height: number,
  rgb: [number, number, number],
): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // colour type: truecolour
  // 10..12 are compression, filter and interlace, all zero.

  const row = Buffer.concat([
    Buffer.from([0]), // filter: none
    Buffer.concat(Array.from({ length: width }, () => Buffer.from(rgb))),
  ]);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * A muted palette so a seeded catalogue looks like a catalogue rather than a
 * test fixture, without any of it being mistaken for a real product photo.
 */
const PALETTE: [number, number, number][] = [
  [122, 148, 140],
  [163, 148, 122],
  [140, 122, 148],
  [122, 135, 163],
  [148, 130, 122],
];

export interface SeedStorage {
  put(key: string, body: Buffer): Promise<void>;
  readonly available: boolean;
}

/**
 * Writes to the same bucket the API uses, configured from the same variables.
 *
 * This duplicates a little of the API's storage adapter, which is the price of
 * the dependency direction: packages/db must not import from apps/api, since
 * the arrow pointing the other way is what makes the API the choke point where
 * events are guaranteed.
 *
 * If storage is unreachable the seed still writes its rows and says so, rather
 * than failing outright — a developer seeding a database before starting the
 * storage container should get a clear warning, not a stack trace.
 */
export function createSeedStorage(): SeedStorage {
  const driver = process.env.STORAGE_DRIVER ?? 's3';
  const bucket = process.env.STORAGE_BUCKET;
  const accessKeyId = process.env.STORAGE_ACCESS_KEY_ID;
  const secretAccessKey = process.env.STORAGE_SECRET_ACCESS_KEY;

  if (driver !== 's3' || !bucket || !accessKeyId || !secretAccessKey) {
    return { available: false, put: async () => {} };
  }

  const client = new S3Client({
    region: process.env.STORAGE_REGION ?? 'auto',
    credentials: { accessKeyId, secretAccessKey },
    ...(process.env.STORAGE_ENDPOINT
      ? { endpoint: process.env.STORAGE_ENDPOINT }
      : {}),
    forcePathStyle: process.env.STORAGE_FORCE_PATH_STYLE === 'true',
  });

  return {
    available: true,
    async put(key, body) {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentType: 'image/png',
        }),
      );
    },
  };
}

export function placeholderFor(index: number): Buffer {
  return solidPng(480, 480, PALETTE[index % PALETTE.length]!);
}

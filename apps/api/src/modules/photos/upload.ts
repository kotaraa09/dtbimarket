/**
 * Reading and validating an uploaded photo — REQ-N27: "Images only, 5 MB per
 * file, content-type verified server-side rather than trusted from the client."
 *
 * That last clause is the whole point. `Content-Type` in a multipart part is
 * whatever the client wrote there; a file claiming `image/png` can be anything
 * at all. So the declared type is ignored entirely and the format is decided
 * from the leading bytes.
 *
 * Multipart is parsed with `Response.formData()`, which is Node's own
 * implementation — no `multer`, no `busboy`. REQ-N4 / rule 10: the standard
 * library already solves this.
 */
import type { Request } from 'express';
import { AppError, errors } from '../../middleware/errors.ts';

/** REQ-N27. */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export type ImageType = 'image/jpeg' | 'image/png' | 'image/webp';

const EXTENSIONS: Record<ImageType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export function extensionFor(type: ImageType): string {
  return EXTENSIONS[type];
}

/**
 * Identify the format from its magic bytes. Returns null for anything that is
 * not one of the three formats a phone camera or a screenshot produces.
 */
export function sniffImageType(buf: Buffer): ImageType | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return 'image/jpeg';
  }

  const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (buf.length >= 8 && PNG.every((b, i) => buf[i] === b)) {
    return 'image/png';
  }

  // RIFF....WEBP
  if (
    buf.length >= 12 &&
    buf.toString('ascii', 0, 4) === 'RIFF' &&
    buf.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }

  return null;
}

/**
 * Buffer the request body, refusing early once it exceeds the limit.
 *
 * The check is on bytes actually received, not on `Content-Length`, because a
 * client that lies in the header would otherwise stream an unbounded body into
 * memory before anyone noticed.
 */
function tooLarge(): AppError {
  return new AppError(413, 'file_too_large', 'ไฟล์ใหญ่เกินไป ขนาดสูงสุด 5 MB');
}

function readBody(req: Request, limit: number): Promise<Buffer> {
  // A body already declared too large is rejected without reading it, but the
  // stream is still drained: a client mid-upload that has its socket destroyed
  // reports a connection reset, not the 413 it was actually sent, and the
  // seller sees "something went wrong" instead of "your photo is too big".
  const declared = Number(req.headers['content-length'] ?? 0);
  if (Number.isFinite(declared) && declared > limit) {
    req.resume();
    return Promise.reject(tooLarge());
  }

  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let over = false;

    req.on('data', (chunk: Buffer) => {
      if (over) return; // keep draining, stop accumulating

      total += chunk.length;
      if (total > limit) {
        over = true;
        chunks.length = 0; // release what was buffered

        // A client that lied in Content-Length still gets a real answer, but
        // it does not get to stream forever on the way to receiving it.
        if (total > limit * 10) req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => (over ? reject(tooLarge()) : resolve(Buffer.concat(chunks))));
    req.on('error', reject);
    req.on('aborted', () => reject(tooLarge()));
  });
}

export interface UploadedImage {
  bytes: Buffer;
  type: ImageType;
}

/**
 * Pull exactly one image out of a `multipart/form-data` request.
 *
 * The multipart envelope carries a little overhead beyond the file itself, so
 * the body limit is the file limit plus a small allowance; the file's own size
 * is then checked exactly.
 */
export async function readUploadedImage(req: Request): Promise<UploadedImage> {
  const contentType = req.headers['content-type'];

  if (!contentType?.includes('multipart/form-data')) {
    throw new AppError(
      415,
      'unsupported_media_type',
      'ต้องส่งไฟล์แบบ multipart/form-data',
    );
  }

  const body = await readBody(req, MAX_UPLOAD_BYTES + 8 * 1024);

  let form: FormData;
  try {
    form = await new Response(body, {
      headers: { 'content-type': contentType },
    }).formData();
  } catch {
    throw new AppError(400, 'malformed_upload', 'ไฟล์ที่ส่งมาไม่ถูกต้อง');
  }

  const file = form.get('file');
  if (!(file instanceof File)) {
    throw errors.validation({ file: 'กรุณาเลือกไฟล์รูป' });
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    throw new AppError(413, 'file_too_large', 'ไฟล์ใหญ่เกินไป ขนาดสูงสุด 5 MB');
  }

  const bytes = Buffer.from(await file.arrayBuffer());

  // The client's declared type is deliberately not consulted.
  const type = sniffImageType(bytes);
  if (!type) {
    throw new AppError(
      415,
      'unsupported_media_type',
      'รองรับเฉพาะไฟล์ JPEG, PNG และ WebP',
    );
  }

  return { bytes, type };
}

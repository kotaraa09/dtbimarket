/**
 * The only way apps/web talks to apps/api.
 *
 * architecture.md forbids the browser from writing events, computing metrics or
 * randomising anything. This module therefore does exactly one thing: send the
 * request and hand back the parsed result. Any logic beyond that belongs in the
 * API, where it can be guaranteed.
 *
 * `credentials: 'include'` sends the httpOnly session cookie (ADR-0003). The
 * cookie itself is unreadable from JavaScript, which is the point.
 */
import type { ApiError } from '@dtbi/shared';

const BASE =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: string;
  /** Thai, safe to render directly. */
  readonly thaiMessage: string;
  readonly details: Record<string, string>;

  constructor(status: number, body: ApiError['error']) {
    super(`${body.code}: ${body.message}`);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = body.code;
    this.thaiMessage = body.message;
    this.details = body.details ?? {};
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${BASE}/api/v1${path}`, {
      method,
      credentials: 'include',
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
    });
  } catch {
    // The API being unreachable is a different problem from the API refusing,
    // and a seller should be told which one it is.
    throw new ApiRequestError(0, {
      code: 'network_error',
      message: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่',
    });
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  const parsed: unknown = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const err = (parsed as ApiError | null)?.error ?? {
      code: 'unknown_error',
      message: 'เกิดข้อผิดพลาด',
    };
    throw new ApiRequestError(response.status, err);
  }

  return parsed as T;
}

/**
 * File upload. Deliberately not part of `request`: the body must be FormData
 * and the Content-Type header must be left unset so the browser can generate
 * the multipart boundary. Setting it by hand produces a body the server cannot
 * parse, with no useful error.
 */
async function upload<T>(path: string, file: File): Promise<T> {
  const form = new FormData();
  form.append('file', file);

  let response: Response;
  try {
    response = await fetch(`${BASE}/api/v1${path}`, {
      method: 'POST',
      credentials: 'include',
      body: form,
      cache: 'no-store',
    });
  } catch {
    throw new ApiRequestError(0, {
      code: 'network_error',
      message: 'อัปโหลดไม่สำเร็จ กรุณาลองใหม่',
    });
  }

  const text = await response.text();
  const parsed: unknown = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const err = (parsed as ApiError | null)?.error ?? {
      code: 'unknown_error',
      message: 'อัปโหลดไม่สำเร็จ',
    };
    throw new ApiRequestError(response.status, err);
  }

  return parsed as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
  upload,
};

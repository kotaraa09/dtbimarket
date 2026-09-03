/**
 * One error shape, produced in one place (api-spec.md).
 *
 * `code` is stable and English and is what the client branches on.
 * `message` is Thai and safe to display to a seller or a buyer.
 * No stack trace ever leaves the process.
 */
import type { NextFunction, Request, Response } from 'express';
import type { ApiError } from '@dtbi/shared';
import { log } from '../lib/logger.ts';

export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  /** Thai, safe to display. */
  readonly thaiMessage: string;
  readonly details: Record<string, string> | undefined;

  constructor(
    status: number,
    code: string,
    thaiMessage: string,
    details?: Record<string, string>,
  ) {
    super(`${code}: ${thaiMessage}`);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.thaiMessage = thaiMessage;
    this.details = details;
  }
}

export const errors = {
  unauthorized: () =>
    new AppError(401, 'not_signed_in', 'กรุณาเข้าสู่ระบบก่อน'),
  forbidden: () =>
    new AppError(403, 'forbidden', 'คุณไม่มีสิทธิ์เข้าถึงรายการนี้'),
  /** One message for "no such account" and "wrong password" alike — telling an
   *  anonymous caller which addresses are registered enumerates real students. */
  invalidCredentials: () =>
    new AppError(401, 'invalid_credentials', 'อีเมลหรือรหัสผ่านไม่ถูกต้อง'),
  notFound: (code = 'not_found', message = 'ไม่พบรายการนี้') =>
    new AppError(404, code, message),
  conflict: (code: string, message: string) => new AppError(409, code, message),
  validation: (details: Record<string, string>) =>
    new AppError(422, 'validation_failed', 'ข้อมูลไม่ถูกต้อง', details),
};

/** Terminal middleware. Must be registered last. */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const requestId = res.locals.requestId as string;

  if (err instanceof AppError) {
    log.warn({
      requestId,
      route: req.path,
      method: req.method,
      status: err.status,
      code: err.code,
      userId: res.locals.userId as string | undefined,
    });

    const body: ApiError = {
      error: {
        code: err.code,
        message: err.thaiMessage,
        ...(err.details ? { details: err.details } : {}),
      },
    };
    res.status(err.status).json(body);
    return;
  }

  // Unexpected. The seller gets a request ID they can quote in a message,
  // which means neither of us needs their personal details to find the
  // incident (detailed-design.md).
  log.exception(requestId, err);

  const body: ApiError = {
    error: {
      code: 'internal_error',
      message: 'ระบบขัดข้อง กรุณาลองใหม่อีกครั้ง',
      details: { request_id: requestId },
    },
  };
  res.status(500).json(body);
}

/** 404 for unmatched routes, in the same shape as everything else. */
export function notFoundHandler(_req: Request, res: Response): void {
  const body: ApiError = {
    error: { code: 'route_not_found', message: 'ไม่พบเส้นทางนี้' },
  };
  res.status(404).json(body);
}

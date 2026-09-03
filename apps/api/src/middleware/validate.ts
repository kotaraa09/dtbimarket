/**
 * Validation at the boundary, with the schema declared next to the route.
 *
 * Runs after the auth guards, never before — see the order note in session.ts.
 * On failure it produces 422 with `details` naming the fields (api-spec.md).
 */
import type { NextFunction, Request, Response } from 'express';
import type { ZodType } from 'zod';
import { errors } from './errors.ts';

export function validateBody<T>(schema: ZodType<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      const details: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join('.') || '_';
        // First message per field. A field with three problems is still one
        // thing for the seller to fix.
        details[key] ??= issue.message;
      }
      return next(errors.validation(details));
    }

    res.locals.body = result.data;
    next();
  };
}

export function validatedBody<T>(res: Response): T {
  return res.locals.body as T;
}

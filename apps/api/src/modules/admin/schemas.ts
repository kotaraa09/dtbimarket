import { z } from 'zod';
import { USER_ROLES, USER_STATUSES } from '@dtbi/shared';

export const listUsersQuerySchema = z.object({
  role: z.enum(USER_ROLES).optional(),
  status: z.enum(USER_STATUSES).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().min(1).max(64).optional(),
});

export const listAuditQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().min(1).max(64).optional(),
});

/**
 * Anonymisation is irreversible and destroys a real person's personal data on
 * purpose. An explicit confirmation in the body means it cannot happen through
 * a mistyped URL or a replayed request.
 */
export const anonymiseSchema = z.object({
  confirm: z.literal('anonymise', {
    message: 'ต้องยืนยันด้วยคำว่า anonymise',
  }),
});

export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
export type ListAuditQuery = z.infer<typeof listAuditQuerySchema>;

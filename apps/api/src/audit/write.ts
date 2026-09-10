/**
 * The only place an AdminAuditLog row is written (ADR-0005).
 *
 * Nothing else calls `prisma.adminAuditLog.create`. There is no update path and
 * no delete path anywhere, and the database refuses both regardless — an
 * operator must not be able to edit their own trail.
 *
 * Deliberately separate from `emitEvent`. That function writes the study's
 * measurement instrument; this one writes an operational record. Two callers,
 * two vocabularies, two tables, so an admin action can never be counted as
 * seller behaviour in the analysis.
 */
import type { Prisma, PrismaClient } from '@dtbi/db';
import {
  assertAuditMetadata,
  isAdminAction,
  type AdminAction,
  type AdminAuditMetadata,
  type AdminTargetType,
} from '@dtbi/shared';
import { getClock } from '../lib/clock.ts';

/**
 * Either the global client or a transaction client.
 *
 * A write action (suspend, anonymise) MUST pass the transaction that performs
 * it, so the change and its audit entry commit together — the same rule
 * ADR-0001 applies to events. A read action has nothing to be atomic with and
 * passes the global client.
 */
type AuditClient = PrismaClient | Prisma.TransactionClient;

export interface WriteAuditInput {
  action: AdminAction;
  /** The administrator who acted. */
  actorId: string;
  targetType?: AdminTargetType;
  targetId?: string;
  /** Ties the entry to the access log line for the same request. */
  requestId?: string;
  /** IDs, counts, statuses and field NAMES. Never personal values. */
  metadata?: AdminAuditMetadata;
}

export async function writeAudit(
  db: AuditClient,
  e: WriteAuditInput,
): Promise<void> {
  if (!isAdminAction(e.action)) {
    throw new Error(
      `Unknown admin action "${e.action}". Add it to ADMIN_ACTIONS in packages/shared first.`,
    );
  }

  assertAuditMetadata(e.action, e.metadata);

  await db.adminAuditLog.create({
    data: {
      action: e.action,
      actorId: e.actorId,
      targetType: e.targetType ?? null,
      targetId: e.targetId ?? null,
      requestId: e.requestId ?? null,
      metadata: e.metadata ?? {},
      occurredAt: getClock().now(),
    },
  });
}

/**
 * The operator audit vocabulary (ADR-0005).
 *
 * Deliberately a separate list from `EVENT_TYPES`. `Event` records what
 * research subjects do; this records what an operator does, including what
 * they read. Keeping the two vocabularies apart is what stops an admin action
 * from ever being counted as seller behaviour in the analysis.
 *
 * Read actions are in here on purpose. The admin area exists to answer PDPA
 * requests (REQ-N21), which means its normal work is looking at people's
 * personal data — and a trail that only records writes cannot answer the one
 * question that matters after a compromise: what did they see?
 */

export const ADMIN_ACTIONS = [
  /** Bootstrap: an administrator was created out of band by the CLI. */
  'admin.account_created',
  'admin.signed_in',

  // Reads. The whole reason this table exists.
  'admin.users_listed',
  'admin.user_viewed',
  'admin.audit_viewed',

  // Writes.
  'admin.user_suspended',
  'admin.user_reinstated',
  'admin.user_anonymised',
] as const;

export type AdminAction = (typeof ADMIN_ACTIONS)[number];

const ADMIN_ACTION_SET: ReadonlySet<string> = new Set(ADMIN_ACTIONS);

export function isAdminAction(value: string): value is AdminAction {
  return ADMIN_ACTION_SET.has(value);
}

export type AdminTargetType = 'user';

/**
 * Metadata keys each action may carry.
 *
 * Same shape of guard as the event payload allowlist, and for the same reason:
 * an allowlist rejects the key nobody thought about, which is the one that
 * leaks.
 *
 * `fields_disclosed` and `fields_cleared` hold **field names**, never values —
 * `"email,display_name"`, not the email address. An audit trail that copies the
 * data it is protecting has doubled the problem rather than solved it.
 */
export const ADMIN_ACTION_METADATA_KEYS = {
  'admin.account_created': ['created_via'],
  'admin.signed_in': [],

  'admin.users_listed': ['result_count', 'role_filter', 'status_filter'],
  'admin.user_viewed': ['target_role', 'target_status', 'fields_disclosed'],
  'admin.audit_viewed': ['result_count'],

  'admin.user_suspended': [
    'target_role',
    'status_before',
    'status_after',
    'sessions_revoked',
  ],
  'admin.user_reinstated': [
    'target_role',
    'status_before',
    'status_after',
    'sessions_revoked',
  ],
  'admin.user_anonymised': [
    'target_role',
    'status_before',
    'status_after',
    'sessions_revoked',
    'fields_cleared',
  ],
} as const satisfies Record<AdminAction, readonly string[]>;

/** Flat primitives only, for the same reason event payloads are. */
export type AdminAuditMetadata = Record<string, string | number | boolean>;

export class AuditMetadataError extends Error {
  readonly action: AdminAction;

  constructor(action: AdminAction, message: string) {
    super(`[${action}] ${message}`);
    this.name = 'AuditMetadataError';
    this.action = action;
  }
}

export function assertAuditMetadata(
  action: AdminAction,
  metadata?: AdminAuditMetadata,
): void {
  if (metadata === undefined) return;

  const allowed: readonly string[] = ADMIN_ACTION_METADATA_KEYS[action];

  for (const [key, value] of Object.entries(metadata)) {
    if (!allowed.includes(key)) {
      throw new AuditMetadataError(
        action,
        `metadata key "${key}" is not in the allowlist for this action. ` +
          `Allowed: ${allowed.length ? allowed.join(', ') : '(none)'}.`,
      );
    }

    const t = typeof value;
    if (t !== 'string' && t !== 'number' && t !== 'boolean') {
      throw new AuditMetadataError(
        action,
        `metadata key "${key}" has type ${t}. Only flat string, number or boolean are allowed.`,
      );
    }
  }
}

/**
 * The personal fields an anonymisation clears, named once so the operation and
 * the audit entry cannot disagree about what was done (REQ-N21).
 */
export const ANONYMISED_FIELDS = [
  'email',
  'display_name',
  'password_hash',
  'store.contact_channel',
] as const;

/**
 * The personal fields the admin detail view discloses. Recorded on every read
 * so a PDPA incident can be scoped to exactly what was exposed.
 */
export const DISCLOSED_FIELDS = [
  'email',
  'display_name',
  'store.contact_channel',
] as const;

/**
 * Create an administrator. The only way one comes into existence.
 *
 * The public registration endpoint accepts `seller` and `buyer` only, because
 * any role a public endpoint accepts is a role a stranger can grant themselves.
 * This script is the deliberate, out-of-band alternative.
 *
 *   pnpm admin:create you@example.com
 *
 * It generates the password and prints it once rather than taking one on the
 * command line, where it would land in shell history and in the process list.
 * Set ADMIN_PASSWORD in the environment instead if you need a specific one.
 */
import { randomBytes } from 'node:crypto';
import { Algorithm, hash } from '@node-rs/argon2';
import { assertAuditMetadata } from '@dtbi/shared';
import { PrismaClient } from '../src/generated/client/client.ts';

const prisma = new PrismaClient();

const ARGON2 = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

/** Readable but high-entropy: 24 bytes of base64url is ~144 bits. */
function generatePassword(): string {
  return randomBytes(24).toString('base64url');
}

async function main(): Promise<void> {
  const email = process.argv[2]?.trim().toLowerCase();
  const displayName = process.argv[3]?.trim() || 'ผู้ดูแลระบบ';

  if (!email || !email.includes('@')) {
    throw new Error('Usage: pnpm admin:create <email> [displayName]');
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new Error(
      `A user with that email already exists (role: ${existing.role}). ` +
        'This script will not change an existing account\'s role — ' +
        'promoting by side effect is how a support request becomes an escalation.',
    );
  }

  const supplied = process.env.ADMIN_PASSWORD;
  const password = supplied ?? generatePassword();
  const passwordHash = await hash(password, ARGON2);

  const admin = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: { email, passwordHash, role: 'admin', displayName, status: 'active' },
    });

    // Bootstrap has no acting administrator, so the new account is recorded as
    // its own actor with the route noted. Without this entry, the most
    // security-relevant event in the system — an administrator coming into
    // existence — would be the one thing the trail did not contain.
    const metadata = { created_via: 'cli' };
    assertAuditMetadata('admin.account_created', metadata);

    await tx.adminAuditLog.create({
      data: {
        action: 'admin.account_created',
        actorId: created.id,
        targetType: 'user',
        targetId: created.id,
        metadata,
        occurredAt: new Date(),
      },
    });

    return created;
  });

  process.stdout.write(`\nAdministrator created.\n  id:    ${admin.id}\n  email: ${email}\n`);
  if (supplied) {
    process.stdout.write('  password: (taken from ADMIN_PASSWORD)\n\n');
  } else {
    process.stdout.write(
      `  password: ${password}\n\n` +
        'Shown once and not stored anywhere in plain text. Save it now.\n\n',
    );
  }
}

main()
  .catch((err: unknown) => {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });

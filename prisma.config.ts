import { existsSync } from 'node:fs';
import { defineConfig } from 'prisma/config';

// Prisma stops loading .env automatically once a config file exists.
// process.loadEnvFile is Node stdlib, so this does not add a dependency
// (CLAUDE.md rule 10).
//
// DTBI_ENV_FILE selects a different file, so a migration can be run against a
// deployed database without editing .env and breaking local development:
//   DTBI_ENV_FILE=.env.neon pnpm db:deploy
// Every .env.* variant is gitignored, so the deployed credentials stay out of
// the repository (REQ-N3, CLAUDE.md rule 9).
const envFile = process.env.DTBI_ENV_FILE ?? '.env';
if (existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

export default defineConfig({
  schema: 'packages/db/prisma/schema.prisma',
  migrations: {
    path: 'packages/db/prisma/migrations',
    seed: 'node packages/db/prisma/seed.ts',
  },
});

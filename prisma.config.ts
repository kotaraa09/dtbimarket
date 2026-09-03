import { existsSync } from 'node:fs';
import { defineConfig } from 'prisma/config';

// Prisma stops loading .env automatically once a config file exists.
// process.loadEnvFile is Node stdlib, so this does not add a dependency
// (CLAUDE.md rule 10).
if (existsSync('.env')) {
  process.loadEnvFile('.env');
}

export default defineConfig({
  schema: 'packages/db/prisma/schema.prisma',
  migrations: {
    path: 'packages/db/prisma/migrations',
    seed: 'node packages/db/prisma/seed.ts',
  },
});

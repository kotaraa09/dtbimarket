/**
 * End-to-end tests against the deployed site — Module 2, week 9 homework.
 *
 * They run against production by default, because what has to be proven is that
 * the site the instructor opens from README.md works, not that a laptop does.
 * To point them at a local stack instead:
 *
 *   BASE_URL=http://localhost:3000 pnpm test:e2e
 *
 * Every test signs in as one of the two seed sellers from README.md. Their
 * stores are `is_seed = true`, so every product and event these tests create is
 * seed-flagged and excluded from analysis (CLAUDE.md rule 6). The tests must
 * never sign up a new account: that would write a real, non-seed user.
 */
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',

  // The API is on Render's free plan and sleeps after 15 idle minutes. The
  // first sign-in of a run can take most of a minute to wake it.
  timeout: 120_000,
  expect: { timeout: 15_000 },

  // One at a time. Tests share two seed stores, and parallel runs would make
  // "the row count did not change" in the required-field test meaningless.
  workers: 1,
  fullyParallel: false,

  reporter: [['list'], ['json', { outputFile: 'e2e-results/results.json' }]],
  outputDir: 'e2e-results/artifacts',

  use: {
    baseURL: process.env.BASE_URL ?? 'https://dtbimarket-web.vercel.app',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    locale: 'th-TH',
    timezoneId: 'Asia/Bangkok',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});

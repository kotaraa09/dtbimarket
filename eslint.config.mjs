import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      '**/dist/**',
      'packages/db/src/generated/**',
      'docs/**',
      'screenshot/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // Unused args prefixed with _ are deliberate: Express middleware
      // signatures require the parameter to be present to be recognised.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // The API deliberately uses `any` at the fetch boundary in tests.
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    // The one place a raw console is correct is a CLI script.
    files: ['packages/db/prisma/**'],
    rules: { 'no-console': 'off' },
  },
);

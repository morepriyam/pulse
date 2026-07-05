// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const prettier = require('eslint-config-prettier');
const simpleImportSort = require('eslint-plugin-simple-import-sort');

module.exports = defineConfig([
  expoConfig,
  prettier,
  {
    plugins: { 'simple-import-sort': simpleImportSort },
    rules: {
      // Enforce the house import grouping: external packages → `@/` alias → relative.
      // Safe to autosort here — the app has no side-effect (order-dependent) imports.
      'simple-import-sort/imports': [
        'error',
        {
          groups: [['^\\u0000', '^react', '^@?\\w'], ['^@/'], ['^\\.']],
        },
      ],
      'simple-import-sort/exports': 'error',
    },
  },
  {
    // TS-only: the @typescript-eslint plugin is registered by eslint-config-expo
    // for TS files only, so this rule must not apply to plain .js (e.g. this file).
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      // One type-import form across the app (`import type { … }`). Allow inline
      // `typeof import('…')` annotations — used with the `__DEV__`-guarded
      // `require` in app/index.tsx to keep dev-only code out of the prod bundle.
      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          prefer: 'type-imports',
          fixStyle: 'separate-type-imports',
          disallowTypeAnnotations: false,
        },
      ],
    },
  },
  {
    ignores: ['dist/*'],
  },
]);

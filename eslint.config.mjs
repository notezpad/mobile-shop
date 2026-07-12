// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import importPlugin from 'eslint-plugin-import';

/**
 * Shared ESLint flat config for the entire monorepo.
 * - apps/web: React + Vite (browser)
 * - apps/worker: Hono + Cloudflare Workers (service worker runtime)
 * - packages/*: Pure TypeScript libraries (shared types/schemas/DB)
 */
export default tseslint.config(
  // ─── Global ignores ──────────────────────────────────────────────
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.turbo/**',
      '**/.wrangler/**',
      '**/.output/**',
      '**/coverage/**',
      '**/*.tsbuildinfo',
      'packages/db/src/generated/**',
    ],
  },

  // ─── Base JS + TS rules ──────────────────────────────────────────
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // ─── Import ordering & hygiene ───────────────────────────────────
  {
    plugins: { import: importPlugin },
    rules: {
      'import/order': [
        'error',
        {
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index', 'type'],
          pathGroups: [
            { pattern: 'react', group: 'external', position: 'before' },
            { pattern: '@mobile-shop/**', group: 'internal', position: 'before' },
            { pattern: '@/**', group: 'internal', position: 'before' },
            { pattern: '#/**', group: 'internal', position: 'before' },
          ],
          pathGroupsExcludedImportTypes: ['react'],
        },
      ],
      'import/no-cycle': 'error',
      'import/no-self-import': 'error',
      'import/no-default-export': 'off',
      'import/consistent-type-specifier-style': ['error', 'prefer-top-level'],
    },
  },

  // ─── General TS rules ────────────────────────────────────────────
  {
    rules: {
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-non-null-assertion': 'warn',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/require-await': 'off',
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
      'no-debugger': 'error',
    },
  },

  // ─── React-specific (apps/web only — applied via globs) ──────────
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    ...react.configs.flat.recommended,
    ...react.configs.flat['jsx-runtime'],
    ...jsxA11y.flatConfigs.recommended,
    languageOptions: {
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      'react/prop-types': 'off',
      'react/react-in-jsx-scope': 'off',
      'react/self-closing-comp': 'error',
      'react/jsx-curly-brace-presence': ['error', { props: 'never', children: 'never' }],
      'react/jsx-boolean-value': ['error', 'never'],
      'react/jsx-fragments': ['error', 'syntax'],
      'react/jsx-no-duplicate-props': 'error',
      'react/jsx-no-undef': 'error',
      'react/jsx-pascal-case': 'error',
      'react/no-array-index-key': 'warn',
      'react/no-danger': 'warn',
      'react/no-deprecated': 'error',
      'react/no-direct-mutation-state': 'error',
      'react/no-unescaped-entities': 'error',
      'react/no-unknown-property': 'error',
      'react-hooks/exhaustive-deps': 'error',
      'react-hooks/rules-of-hooks': 'error',
    },
  },

  // ─── Worker (service-worker runtime, no DOM) ─────────────────────
  {
    files: ['apps/worker/src/**/*.{ts,tsx}'],
    languageOptions: {
      globals: {
        crypto: 'readonly',
        caches: 'readonly',
        Headers: 'readonly',
        Request: 'readonly',
        Response: 'readonly',
        FormData: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        Blob: 'readonly',
        File: 'readonly',
        AbortController: 'readonly',
        setTimeout: 'readonly',
        clearInterval: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        btoa: 'readonly',
        atob: 'readonly',
        fetch: 'readonly',
      },
    },
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'Workers do not have access to `window`.' },
        { name: 'document', message: 'Workers do not have access to `document`.' },
        { name: 'localStorage', message: 'Workers do not have access to `localStorage`.' },
        { name: 'sessionStorage', message: 'Workers do not have access to `sessionStorage`.' },
      ],
    },
  },

  // ─── Config files (less strict) ──────────────────────────────────
  {
    files: ['**/*.config.{ts,js,mjs,cjs}', '**/vite.config.*', '**/wrangler.*'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-console': 'off',
    },
  },
);

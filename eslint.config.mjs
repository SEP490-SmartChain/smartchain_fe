import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import importPlugin from 'eslint-plugin-import';
import prettierPlugin from 'eslint-plugin-prettier';
import prettierConfig from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  // ────────────────────────────────────────────
  // Global ignores
  // ────────────────────────────────────────────
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'build/**',
      'coverage/**',
      '.next/**',
      'out/**',
      '*.config.ts',
      '*.config.js',
      '*.config.mjs',
    ],
  },

  // ────────────────────────────────────────────
  // Base: eslint recommended + TS recommended
  // ────────────────────────────────────────────
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // ────────────────────────────────────────────
  // Prettier (disables conflicting format rules)
  // ────────────────────────────────────────────
  prettierConfig,

  // ────────────────────────────────────────────
  // Project-wide settings
  // ────────────────────────────────────────────
  {
    files: ['src/**/*.{ts,tsx}'],

    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
      import: importPlugin,
      prettier: prettierPlugin,
    },

    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.es2021,
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },

    settings: {
      react: { version: 'detect' },
      'import/resolver': {
        typescript: { alwaysTryTypes: true },
      },
    },

    rules: {
      // ── Prettier ──────────────────────────
      'prettier/prettier': ['warn', {}, { usePrettierrc: true }],

      // ── Code style ────────────────────────
      'prefer-const': 'error',
      'no-var': 'error',
      'no-unused-vars': 'off', // use TS version below
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'eqeqeq': ['error', 'always'],
      'curly': ['error', 'multi-line'],
      'no-duplicate-imports': 'error',

      // ── TypeScript ────────────────────────
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/consistent-type-imports': [
        'warn',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-empty-object-type': 'off',

      // ── React ─────────────────────────────
      'react/react-in-jsx-scope': 'off',        // React 17+ JSX transform
      'react/prop-types': 'off',                 // using TypeScript
      'react/display-name': 'off',               // forwardRef display names handled manually
      'react/jsx-no-target-blank': 'error',
      'react/jsx-curly-brace-presence': ['warn', { props: 'never', children: 'never' }],
      'react/self-closing-comp': ['warn', { component: true, html: true }],
      'react/jsx-boolean-value': ['warn', 'never'],
      'react/no-array-index-key': 'warn',

      // ── React Hooks ───────────────────────
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // ── Imports ───────────────────────────
      'import/order': [
        'warn',
        {
          groups: [
            'builtin',
            'external',
            'internal',
            ['parent', 'sibling', 'index'],
            'type',
            'object',
          ],
          pathGroups: [
            { pattern: 'react', group: 'builtin', position: 'before' },
            { pattern: 'react-**', group: 'builtin', position: 'before' },
            { pattern: '@/**', group: 'internal', position: 'before' },
            { pattern: '@messages/**', group: 'internal', position: 'before' },
          ],
          pathGroupsExcludedImportTypes: ['react'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
      'import/no-duplicates': 'warn',
      'import/no-unresolved': 'off',  // TS handles resolution
      'import/named': 'off',          // TS handles this
    },
  },
);

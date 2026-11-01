import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  globalIgnores(['dist', 'legacy-index.html']),
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    languageOptions: { globals: globals.browser },
    // The classic hook rules. The React Compiler rules in the plugin's presets assume the compiler, which we don't use.
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    // ADR 0002: the engine never depends on React or the rest of the app.
    files: ['src/engine/**'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react-dom', 'react/*', 'react-dom/*'],
              message: 'The engine stays free of React (docs/adr/0002).',
            },
            {
              group: ['../components/*', '../lib/*', '../App'],
              message: 'The engine never imports the app (docs/adr/0002).',
            },
          ],
        },
      ],
    },
  },
  {
    // ADR 0003: components reach storage only through the Repo interface.
    files: ['src/components/**'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@supabase/supabase-js',
              allowTypeImports: true,
              message: 'Use the Repo interface in src/lib/repos.ts (docs/adr/0003).',
            },
            {
              name: '../lib/supabase',
              importNames: ['supabase'],
              message: 'Use the Repo interface in src/lib/repos.ts (docs/adr/0003).',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['scripts/**', '*.config.{js,ts}'],
    languageOptions: { globals: globals.node },
  },
  prettier,
);

import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

const supabasePath = {
  name: '@supabase/supabase-js',
  message: 'Only src/lib/supabase.ts and src/sync/** may import Supabase.',
};
const dexiePath = {
  name: 'dexie',
  message: 'Only src/db/** and src/hooks/useLiveQuery.ts may import Dexie.',
};

export default tseslint.config(
  {
    ignores: ['dist', 'coverage', 'playwright-report', 'test-results', 'supabase/.temp', 'dev-dist'],
  },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    files: ['src/**/*.{ts,tsx}', 'tests/**/*.{ts,tsx}'],
    rules: { 'no-restricted-imports': ['error', { paths: [supabasePath, dexiePath] }] },
  },
  {
    files: ['src/lib/supabase.ts', 'src/sync/**/*.{ts,tsx}', 'tests/rls/**/*.{ts,tsx}'],
    rules: { 'no-restricted-imports': ['error', { paths: [dexiePath] }] },
  },
  {
    files: ['src/db/**/*.{ts,tsx}', 'src/hooks/useLiveQuery.ts'],
    rules: { 'no-restricted-imports': ['error', { paths: [supabasePath] }] },
  },
);

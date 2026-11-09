import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

const noSuppressions = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      forbidden: 'Do not suppress type or lint errors; fix the cause. See AGENTS.md (Proibido).',
    },
  },
  create(context) {
    return {
      Program() {
        for (const comment of context.sourceCode.getAllComments()) {
          if (/\beslint-disable(?:-next-line|-line)?\b|@ts-ignore\b/u.test(comment.value)) {
            context.report({ loc: comment.loc, messageId: 'forbidden' });
          }
        }
      },
    };
  },
};

export default defineConfig([
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/.vite/**',
      '**/.cache/**',
      // Prisma 7 emits plain TypeScript; it is generated output, not our code.
      'apps/api/src/generated/**',
      '**/playwright-report/**',
      '**/test-results/**',
      '**/blob-report/**',
      '.pi/**',
      '.omp/**',
      '.claude/**',
      '.codex/**',
      '.superpowers/**',
      '.specs/**',
      '.agents/**',
      'skills/**',
      'memory/**',
      '.napkin/**',
    ],
  },
  {
    files: ['**/*.{js,mjs,cjs,ts,tsx,mts,cts}'],
    extends: [js.configs.recommended],
  },
  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    extends: [tseslint.configs.recommended],
  },
  {
    files: ['*.{js,mjs,cjs}', '**/*.config.{js,mjs,cjs,ts,mts,cts}', 'scripts/**/*.{js,mjs,cjs}'],
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        URL: 'readonly',
        fetch: 'readonly',
        AbortSignal: 'readonly',
        module: 'readonly',
        exports: 'readonly',
        require: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
      },
    },
  },
  {
    files: ['**/*.{js,mjs,cjs,ts,tsx,mts,cts}'],
    linterOptions: {
      noInlineConfig: true,
      reportUnusedDisableDirectives: 'error',
    },
    plugins: {
      project: { rules: { 'no-suppressions': noSuppressions } },
    },
    rules: {
      'project/no-suppressions': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector: 'TSAnyKeyword',
          message: 'Use a precise type or narrow unknown, never any. See AGENTS.md (Regras de código).',
        },
        {
          selector: 'TSAsExpression > TSAsExpression[typeAnnotation.type="TSUnknownKeyword"]',
          message: 'Do not bypass types with as unknown as. See AGENTS.md (Regras de código).',
        },
        {
          selector: 'MemberExpression[computed=false][property.name=/^(only|skip)$/]',
          message: 'Do not focus or skip tests. See docs/TESTING.md §10 and AGENTS.md (Proibido).',
        },
        {
          selector: 'MemberExpression[computed=true][property.value=/^(only|skip)$/]',
          message: 'Do not focus or skip tests. See docs/TESTING.md §10 and AGENTS.md (Proibido).',
        },
        {
          selector: 'JSXElement Literal[value=/#(?:[0-9a-fA-F]{3,8})\\b/]',
          message: 'Use semantic color tokens, not hex in JSX. See AGENTS.md (Design / Proibido).',
        },
        {
          selector: 'JSXElement TemplateElement[value.raw=/#(?:[0-9a-fA-F]{3,8})\\b/]',
          message: 'Use semantic color tokens, not hex in JSX. See AGENTS.md (Design / Proibido).',
        },
      ],
    },
  },
]);

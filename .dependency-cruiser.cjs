/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-unresolved',
      severity: 'error',
      comment: 'Resolve every import before delivery; see AGENTS.md (Fluxo obrigatório).',
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: 'no-cycles',
      severity: 'error',
      comment: 'Keep dependency direction explicit; see docs/ARCHITECTURE.md §4.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'contract-no-apps',
      severity: 'error',
      comment: 'The shared contract cannot depend on applications; see docs/ARCHITECTURE.md §4.',
      from: { path: '^packages/contract/src/' },
      to: { path: '^(apps/|@drlaudo/(web|api|e2e)(/|$))' },
    },
    {
      name: 'contract-no-frameworks',
      severity: 'error',
      comment: 'No React, Fastify or Prisma in the contract; see docs/ARCHITECTURE.md §4.',
      from: { path: '^packages/contract/src/' },
      to: {
        path: '(^|/)(react|react-dom|@types/react|@types/react-dom|fastify|fastify-plugin|@fastify/[^/]+|prisma|@prisma/[^/]+|\\.prisma)(/|$)',
      },
    },
    {
      name: 'contract-no-mocks',
      severity: 'error',
      comment: 'Mocks consume the contract, never the reverse; see AGENTS.md (Invariantes críticos).',
      from: { path: '^packages/contract/src/' },
      to: { path: '(^|/)(mocks|msw)(/|$)' },
    },
  ],
  options: {
    doNotFollow: { path: '(^|/)node_modules/' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'packages/contract/tsconfig.build.json' },
    enhancedResolveOptions: {
      extensions: ['.ts', '.tsx', '.js', '.jsx', '.json', '.node'],
      conditionNames: ['import', 'types', 'node', 'default'],
    },
  },
};

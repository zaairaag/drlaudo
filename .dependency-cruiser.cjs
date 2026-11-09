/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-unresolved',
      severity: 'error',
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: 'no-cycles',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'contract-no-apps',
      severity: 'error',
      from: { path: '^packages/contract/src/' },
      to: { path: '^(apps/|@drlaudo/(web|api|e2e)(/|$))' },
    },
    {
      name: 'contract-no-frameworks',
      severity: 'error',
      from: { path: '^packages/contract/src/' },
      to: {
        path: '(^|/)(react|react-dom|@types/react|@types/react-dom|fastify|fastify-plugin|@fastify/[^/]+|prisma|@prisma/[^/]+|\\.prisma)(/|$)',
      },
    },
    {
      name: 'contract-no-node-runtime',
      severity: 'error',
      from: { path: '^packages/contract/src/' },
      to: { dependencyTypes: ['core'] },
    },
    {
      name: 'contract-no-mocks',
      severity: 'error',
      from: { path: '^packages/contract/src/' },
      to: { path: '(^|/)(mocks|msw|@mswjs)(/|$)' },
    },
    {
      name: 'api-domain-pure',
      severity: 'error',
      comment: 'Only pure domain/contract helpers and Clock/DomainError types belong here.',
      from: { path: '^apps/api/src/domain/' },
      to: {
        pathNot: '^(apps/api/src/domain/|apps/api/src/(clock|errors)\\.ts$|packages/contract/|node_modules/(zod|date-fns|@date-fns/tz)/)',
      },
    },
    {
      name: 'api-routes-no-prisma',
      severity: 'error',
      comment: 'Routes delegate database access to their own service, including type-only imports.',
      from: { path: '^apps/api/src/.*\\.routes\\.ts$' },
      to: { path: '(^apps/api/src/(prisma\\.ts$|generated/))|(^|/)(prisma|@prisma|\\.prisma)(/|$)' },
    },
    {
      name: 'api-services-no-http',
      severity: 'error',
      from: { path: '^apps/api/src/.*\\.service\\.ts$' },
      to: {
        path: '(^|/)(fastify|fastify-plugin|@fastify)(/|$)|^apps/api/src/(app\\.ts$|server\\.ts$|plugins/)|\\.routes\\.ts$',
      },
    },
    {
      name: 'api-features-isolated',
      severity: 'error',
      comment: 'Features share DTO/domain helpers, never another feature service or route.',
      from: { path: '^apps/api/src/features/([^/]+)/' },
      to: {
        path: '^apps/api/src/features/',
        pathNot: '^apps/api/src/features/($1|shared)/',
      },
    },
    {
      name: 'api-no-browser',
      severity: 'error',
      from: { path: '^apps/api/src/' },
      to: { path: '^apps/(web|e2e)/|(^|/)(react|react-dom|msw|@mswjs)(/|$)' },
    },
    {
      name: 'web-no-api-internals',
      severity: 'error',
      from: { path: '^apps/web/' },
      to: {
        path: '^apps/(api|e2e)/|(^|/)(fastify|fastify-plugin|@fastify|prisma|@prisma|\\.prisma|pg)(/|$)',
      },
    },
    {
      name: 'web-mocks-only-from-bootstrap',
      severity: 'error',
      from: { path: '^apps/web/src/', pathNot: '^apps/web/src/(mocks/|main\\.tsx$)' },
      to: { path: '^apps/web/src/mocks/' },
    },
    {
      name: 'web-msw-only-under-mocks',
      severity: 'error',
      comment: 'MSW imports, including test setup and handlers, stay under src/mocks.',
      from: { path: '^apps/web/src/', pathNot: '^apps/web/src/mocks/' },
      to: { path: '(^|/)(msw|@mswjs)(/|$)' },
    },
    {
      name: 'production-no-test-code',
      severity: 'error',
      from: {
        path: '^(packages/contract/src/|apps/(api|web)/src/)',
        pathNot: '/mocks/|\\.(test|spec)\\.[cm]?[jt]sx?$|/testFixtures\\.ts$',
      },
      to: {
        path: '/tests/|\\.(test|spec)\\.[cm]?[jt]sx?$|/testFixtures\\.ts$|(^|/)(vitest|@vitest|@testing-library|@playwright|@axe-core)(/|$)',
      },
    },
    {
      name: 'e2e-through-public-http',
      severity: 'error',
      comment: 'Only support bootstrap/fixtures may load API setup; specs use HTTP and the UI.',
      from: { path: '^apps/e2e/.*\\.(test|spec)\\.[cm]?[jt]sx?$' },
      to: { path: '^apps/(api|web)/' },
    },
    {
      name: 'e2e-no-product-shortcuts',
      severity: 'error',
      from: { path: '^apps/e2e/' },
      to: { path: '^apps/api/src/features/|^apps/web/src/' },
    },
  ],
  options: {
    // Do not traverse dependencies or generated Prisma implementation, but keep
    // their incoming edges visible to boundary and unresolved-import rules.
    doNotFollow: {
      path: '(^|/)node_modules/|^packages/contract/dist/|^apps/api/src/generated/',
    },
    tsPreCompilationDeps: true,
    // Web owns the only path alias (@/*); all other apps use relative/package imports.
    tsConfig: { fileName: 'apps/web/tsconfig.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      extensions: ['.ts', '.tsx', '.js', '.jsx', '.json', '.node', '.css', '.svg'],
      conditionNames: ['import', 'types', 'node', 'default'],
    },
  },
};

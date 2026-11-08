# CLAUDE.md

@AGENTS.md

Requisitos: [enunciado original](teste-agendamento-exames-laudos.pdf) e [PRD](docs/PRD.md). Regras de implementação: [RULES](docs/RULES.md).

## Específico do Claude Code

- Antes de editar mais de 2 arquivos, apresente um plano curto (arquivos + motivo) e siga.
- Não declare "pronto" sem rodar `npm run lint && npm run typecheck && npm test` e mostrar o resultado.
- Para APIs de bibliotecas (Prisma, Fastify, shadcn, RTK Query, Playwright), consulte a documentação atual (ex.: MCP Context7) em vez de confiar na memória. Prisma 7 mudou a configuração (`prisma.config.ts`, driver adapters).
- Comandos do projeto: `/nova-regra` (implementar uma RN com teste primeiro) e `/revisar` (revisão do diff contra as invariantes).
- Ao terminar, sugira a entrada correspondente em `docs/AI_USAGE.md`, principalmente quando você errou e foi corrigido.

# Decisões — Dr. Laudo

**Referências:** [enunciado original](../teste-agendamento-exames-laudos.pdf) · [PRD — requisitos e regras de negócio](PRD.md) · [RULES — regras de implementação](RULES.md).

Formato: contexto → decisão → consequência. Para reabrir uma decisão, é preciso um motivo novo.

**D-01 — Monorepo npm workspaces.** Um repositório, um `npm install`, tipos e scripts centralizados. Sem Turborepo/Nx: overhead desnecessário em 3 dias.

**D-02 — Fastify 5.** Rápido, schema-first, `app.inject()` permite testar sem subir porta. Express seria mais familiar, mas exigiria mais montagem manual; NestJS seria pesado para o escopo.

**D-03 — PostgreSQL 16 + Prisma.** Postgres tem índice único parcial e `FOR UPDATE`. Prisma dá migrations e tipos. SQLite foi descartado porque esconderia problemas reais de concorrência.

**D-04 — Conflito de horário via índice único parcial.** "SELECT antes do INSERT" tem corrida entre as duas requisições. O banco é o único árbitro confiável. `P2002` → `409 SLOT_TAKEN`.

**D-05 — `SELECT ... FOR UPDATE` contra write skew.** Cancelar altera `Appointment`; publicar altera `Report`. Um `updateMany` condicional em cada um não impede que as duas passem juntas (*write skew* no READ COMMITTED). As duas operações travam a linha do agendamento. Alternativa descartada: isolamento SERIALIZABLE (exige retry em toda operação).

**D-06 — 404 em vez de 403 para recurso de outro paciente ou rascunho.** 403 confirma que o recurso existe (enumeração). 404 idêntico não vaza nada.

**D-07 — Funcionamento das 07:00 às 19:00.** O enunciado (§4.1) exige uma única sala e slots de 30 min, independentemente do exame. O horário de funcionamento não é definido; adotamos 07:00–19:00, com último início às 18:30, como decisão simples e testável. Multi-sala seria uma evolução fora do escopo atual (índice em `(roomId, startsAt)`).

**D-08 — Laudo pode ser criado antes do horário do exame.** Permite preparar o modelo; o enunciado não proíbe. A publicação continua sendo a etapa de liberação.

**D-09 — Cancelar com rascunho é permitido.** O rascunho é preservado para auditoria, mas fica bloqueado. Com laudo publicado, o cancelamento é proibido (o paciente já recebeu o resultado).

**D-10 — Ações como `POST /recurso/:id/acao`.** `cancel` e `publish` são transições de estado com regra, não updates genéricos. Isso deixa a intenção explícita e evita `PATCH { status }` arbitrário.

**D-11 — JWT em `localStorage`.** Simples, sem CSRF, fácil de testar no E2E. Risco: XSS, mitigado com React (escape por padrão), sem `dangerouslySetInnerHTML` e CSP no Nginx. Em produção real: cookie `httpOnly` + `SameSite=Strict` + refresh token.

**D-12 — Redux Toolkit + RTK Query.** Diferencial citado na vaga. RTK Query cuida de cache e invalidação; slices só para sessão e filtros.

**D-13 — shadcn/ui + Tailwind v4 + tokens OKLCH.** O código dos componentes fica no repositório (customizável), Radix garante acessibilidade e OKLCH dá escalas perceptualmente uniformes.

**D-14 — Testes de integração contra Postgres real.** Mock esconderia exatamente o que importa (índice, trava, transação). Banco `drlaudo_test` separado, truncado por arquivo.

**D-15 — Playwright em Docker.** O avaliador roda E2E sem instalar navegador. A versão da lib é fixada igual à da imagem oficial.

**D-16 — Relógio injetado (`clock`).** Testes de "passado" determinísticos, sem `vi.useFakeTimers` interferindo no driver do banco.

**D-17 — Nginx com proxy `/api` (mesma origem).** Sem CORS, um router no Traefik, mesma imagem em local e produção.

**D-18 — Docker opcional, 3 modos.** O enunciado não exige Docker. Docker completo para o avaliador, híbrido para desenvolvimento, 100% local documentado.

**D-19 — Seed idempotente e contas `.test`.** `.test` é reservado (RFC 2606/6761) e nunca entrega e-mail real. Upsert permite rodar o seed a cada boot.

**D-20 — Fora de escopo.** PDF, anexos, DICOM, recuperação de senha, multi-sala, notificações e tema escuro. Estão listados no README como evoluções.

## Dependências registradas

| Pacote | Motivo |
|---|---|
| `fastify`, `@fastify/jwt`, `@fastify/rate-limit`, `@fastify/sensible` | API, auth, rate limit |
| `zod`, `fastify-type-provider-zod` | Validação e tipos |
| `prisma`, `@prisma/client` | ORM e migrations |
| `bcryptjs` | Hash de senha sem binário nativo |
| `date-fns`, `@date-fns/tz` | Fuso sem offset fixo |
| `pino-pretty` (dev) | Logs legíveis em dev |
| `vitest` | Testes |
| `@reduxjs/toolkit`, `react-redux`, `react-router` | Estado e rotas |
| shadcn/ui + Radix, `lucide-react`, `sonner`, `react-hook-form`, `@hookform/resolvers`, `react-day-picker` | UI |
| `vite-plugin-svgr` | Logo como componente |
| `@fontsource-variable/inter`, `@fontsource-variable/plus-jakarta-sans` | Fontes self-hosted |
| `@playwright/test`, `@axe-core/playwright` | E2E e acessibilidade |
| `dependency-cruiser` | Regras de arquitetura |

Novas dependências entram aqui no mesmo PR.

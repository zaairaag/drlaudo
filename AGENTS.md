# AGENTS.md — Dr. Laudo

Instruções para agentes de IA (Codex, Claude Code e outros) e para humanos.
Este arquivo é a **fonte única** de regras para agentes. `CLAUDE.md` apenas o importa.

**Fonte primária dos requisitos:** [enunciado original do desafio](teste-agendamento-exames-laudos.pdf). O [PRD](docs/PRD.md) organiza as regras de negócio; [RULES](docs/RULES.md) define as regras de implementação. Se houver divergência com o enunciado, registre e pergunte antes de implementar.

## O projeto

**Dr. Laudo** é uma aplicação web para uma clínica de exames fictícia:

- A **equipe** (`STAFF`) agenda exames, cancela agendamentos, escreve laudos (rascunho) e os publica.
- O **paciente** (`PATIENT`) consulta seus agendamentos e lê os laudos **publicados**.

Desafio técnico com prazo de 3 dias e escopo fechado. Prioridade, nesta ordem:
**regras de negócio → segurança/autorização → testes → UX → extras.**

## Leia antes de qualquer tarefa

| Documento | Papel |
|---|---|
| [Enunciado original (PDF)](teste-agendamento-exames-laudos.pdf) | Exigências do avaliador, inclusive tecnologias, cenários e itens de entrega. |
| [docs/PRD.md](docs/PRD.md) | **Fonte de verdade da especificação consolidada** do comportamento (RF-xx, RN-xx), subordinada ao enunciado original. |
| [docs/RULES.md](docs/RULES.md) | Regras de código, não negociáveis. |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Camadas, pastas, modelo de dados, fluxos. |
| [docs/API.md](docs/API.md) | Contrato HTTP. Mudou rota ou payload, atualize no **mesmo commit**. |
| [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md) | Tokens, componentes, microcopy. |
| [docs/TESTING.md](docs/TESTING.md) | Estratégia de testes, 5 cenários obrigatórios, contrato E2E. |
| [docs/TASKS.md](docs/TASKS.md) | Tarefas com critérios de aceite. |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Decisões já tomadas. Não reabra sem motivo novo. |
| [docs/HARNESS.md](docs/HARNESS.md) | Como guias e sensores controlam o trabalho do agente. |
| [docs/STATUS.md](docs/STATUS.md) | O que já existe e o que ainda é planejamento. |

## Stack

- Monorepo npm workspaces: `apps/api`, `apps/web`, `apps/e2e`. Node >= 22.
- **API:** Fastify 5 + TypeScript strict + Zod + Prisma + PostgreSQL 16 + @fastify/jwt + bcryptjs.
- **Web:** Vite + React + TypeScript strict + Redux Toolkit/RTK Query + React Router + Tailwind v4 + shadcn/ui.
- **Testes:** Vitest (unitário e integração via `app.inject()` contra Postgres real em `DATABASE_URL_TEST`); Playwright + axe (E2E).
- **Infra:** Docker Compose (dev, QA, prod com Traefik) e GitHub Actions.

## Comandos

```bash
npm install
docker compose up -d db          # só o Postgres (porta 5433)
npm run db:setup                 # migrate + seed
npm run dev                      # api :3333 | web :5173
npm test                         # unitário + integração
npm run test:e2e                 # Playwright (exige app rodando)
npm run lint && npm run typecheck
npm run check:arch               # dependency-cruiser
docker compose up --build        # stack completa → http://localhost:8080
```

## Fluxo obrigatório

1. Identifique a task (`T-xx`) e as RNs envolvidas. Se houver conflito com o PRD, **pare e pergunte**.
2. Escreva ou ajuste o teste **primeiro** e confirme que ele falha pelo motivo certo.
3. Implemente a menor mudança que deixa o teste verde.
4. Rode `npm run lint && npm run typecheck && npm test` (e `check:arch` se mexeu em imports).
5. Atualize a documentação afetada no mesmo commit.
6. Encerre com um resumo: o que mudou, o que foi testado, o que ficou pendente e uma sugestão de entrada para `docs/AI_USAGE.md`.

## Invariantes críticos (nunca quebre)

1. **Conflito de horário** é garantido pelo índice único parcial `appointment_active_slot_unique` (`startsAt` WHERE `status = 'SCHEDULED'`). Erro Prisma `P2002` → `409 SLOT_TAKEN`. **Nunca** use "SELECT antes do INSERT" como proteção.
2. Toda operação que envolve agendamento **e** laudo roda em `prisma.$transaction` com `SELECT ... FOR UPDATE` na linha do `Appointment`. O estado `CANCELED` + laudo `PUBLISHED` é impossível.
3. O id do paciente vem **sempre** de `request.user.sub`. Nunca de params, query ou body.
4. Recurso de outro paciente, ou laudo em rascunho, retorna `404 NOT_FOUND`, idêntico ao inexistente.
5. A saída da API é sempre um DTO com `select` explícito. Nunca retorne entidade Prisma crua (risco de vazar `passwordHash`).
6. Datas: `timestamptz` no banco, ISO 8601 UTC na API, exibição em `America/Sao_Paulo`. "Agora" vem de `clock.now()` (injetável), nunca de `new Date()` solto em regra de negócio.
7. Laudo publicado é imutável.
8. A UI do paciente não dá **nenhum** indício de que existe rascunho.

## Design

- Use só componentes de `src/components/ui` (shadcn) e `src/components/product`.
- Cores só por tokens semânticos. No shadcn, `accent` é hover de menu; o destaque da marca é `highlight` / `highlight-strong` / `highlight-soft`.
- Status sempre via `statusMap` + `<StatusBadge>`. Estado nunca é transmitido só por cor.

## Proibido

- `any`, `@ts-ignore`, `eslint-disable`, `.only` / `.skip` em testes.
- Mockar o banco em testes de integração. Alterar um teste só para fazê-lo passar.
- Adicionar dependência sem registrar em `docs/DECISIONS.md`.
- Commitar `.env` ou segredos. Hex solto no JSX.
- Usar marcas, logos ou cores de empresas reais.
- Implementar fora do escopo: PDF, anexos, DICOM, recuperação de senha, multi-sala, notificações, tema escuro.

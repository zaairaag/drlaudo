# RULES — Regras de código

Não negociáveis. Violou, o PR volta.

**Referências:** [enunciado original](../teste-agendamento-exames-laudos.pdf) e [PRD](PRD.md) definem o que o produto deve atender. Este documento define como implementar; as invariantes dos agentes estão em [AGENTS.md](../AGENTS.md).

## 1. TypeScript

- `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`.
- Proibido: `any`, `@ts-ignore`, `as unknown as`, non-null `!` sem comentário justificando.
- Tipos de payload derivados dos schemas Zod (`z.infer`). Nada de interface duplicada à mão.

## 2. Camadas da API (por feature)

```
src/features/<feature>/
  <feature>.routes.ts    # HTTP: schema, auth, chama service, mapeia DTO. Sem regra de negócio.
  <feature>.service.ts   # Regra de negócio + Prisma. Sem Fastify (sem request/reply).
  <feature>.schemas.ts   # Zod de entrada e saída.
  <feature>.dto.ts       # select explícito + mapeadores.
src/domain/              # Funções puras (slots, fuso, transições). Sem Prisma, sem Fastify.
```

- `domain` não importa nada de `features`, nem Prisma, nem Fastify (checado por `check:arch`).
- O service recebe `{ prisma, clock }` por parâmetro (injeção simples, sem container de DI).

## 3. Erros

Formato único:

```json
{ "error": { "code": "SLOT_TAKEN", "message": "Este horário acabou de ser ocupado." } }
```

Lance `DomainError(code, status, message)` no service; o error handler global formata. Erro desconhecido → 500 `INTERNAL_ERROR` sem stack na resposta (stack só no log).

| Status | Code | Quando |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Zod falhou (inclui `details` com os campos) |
| 401 | `UNAUTHORIZED` | Sem token, token inválido/expirado, login errado |
| 403 | `FORBIDDEN` | Perfil sem permissão |
| 404 | `NOT_FOUND` | Inexistente, de outro paciente ou rascunho (paciente) |
| 409 | `SLOT_TAKEN` | Slot já ocupado |
| 409 | `REPORT_EXISTS` | Agendamento já tem laudo |
| 409 | `REPORT_LOCKED` | Laudo publicado |
| 409 | `CANNOT_CANCEL` | Já cancelado ou com laudo publicado |
| 409 | `APPOINTMENT_CANCELED` | Operação de laudo em agendamento cancelado |
| 422 | `PAST_DATE` | Slot no passado |
| 422 | `INVALID_SLOT` | Fora de hh:00/hh:30 ou fora de 07:00–18:30 |
| 429 | `RATE_LIMITED` | Excesso de tentativas de login |
| 500 | `INTERNAL_ERROR` | Inesperado |

O login errado retorna a mesma mensagem para e-mail inexistente e senha errada.

## 4. Banco e Prisma

- Migrations versionadas. SQL manual (índice parcial) via `prisma migrate dev --create-only`.
- Toda leitura que vira resposta usa `select` explícito.
- Concorrência: índice único + `P2002` → 409; operações cruzadas com `$transaction` + `SELECT ... FOR UPDATE` via `$queryRaw` parametrizado (tagged template, nunca `$queryRawUnsafe`).
- Confira a documentação oficial da versão instalada do Prisma (v7 introduziu `prisma.config.ts` e driver adapters).

## 5. Segurança

- bcryptjs com custo 10. Seed com senha conhecida apenas para contas `.test`.
- JWT: expira em 8h, `iss: "drlaudo-api"`, `sub` = id do usuário, `role` no payload. `JWT_SECRET` com pelo menos 32 caracteres em produção.
- Rate limit no login (`LOGIN_RATE_LIMIT_MAX`, padrão 10/min por IP).
- `env.ts` valida variáveis com Zod e derruba o boot se faltar algo.
- Logs com pino; nunca logar senha, token ou texto de laudo.

## 6. Tempo

- `CLINIC_TZ = "America/Sao_Paulo"`. `?date=YYYY-MM-DD` é interpretado como dia local da clínica.
- Use `date-fns` + `@date-fns/tz`. Proibido calcular fuso com offset fixo.
- `clock.now()` em toda regra que depende do presente; testes usam relógio fixo.

## 7. Frontend

- Estado de servidor: RTK Query (com `providesTags` / `invalidatesTags`). Slices só para sessão (`authSlice`) e filtros (`filtersSlice`).
- Formulários: react-hook-form + zod (mesmas regras do backend).
- Erros da API mapeados para microcopy em [DESIGN_SYSTEM.md §9](DESIGN_SYSTEM.md#9-microcopy-de-erros). Nunca mostre `error.code` cru.
- Acessível por padrão: `label` em todo input, foco visível, `aria-live` para toasts.
- Seletores de teste: `getByRole` / `getByLabel`; `data-testid` só em último caso.

## 8. Testes

- Integração contra Postgres real (`DATABASE_URL_TEST`), banco limpo por arquivo (truncate).
- Concorrência testada com `Promise.all` real, sem mock.
- Nomes: `cenário 1: ...` até `cenário 5: ...` para os obrigatórios.
- Teste gerado por IA só entra se foi visto falhar antes.

## 9. Git

- Conventional Commits (`feat:`, `fix:`, `test:`, `docs:`, `chore:`, `refactor:`).
- Branch por task (`feat/T-08-agendamento`), PR com template, CI verde, nada direto na `main`.

## 10. Definição de pronto

Lint, typecheck, testes e `check:arch` verdes, docs atualizadas, `/revisar` sem bloqueadores, critério de aceite da task atendido.

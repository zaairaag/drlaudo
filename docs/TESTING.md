# Testes e QA — Dr. Laudo

**Referências:** [enunciado original](../teste-agendamento-exames-laudos.pdf), §4.4 (cinco cenários obrigatórios) · [PRD — requisitos e regras de negócio](PRD.md) · [RULES — regras de implementação](RULES.md).

## 1. Pirâmide

| Camada | Ferramenta | O que cobre | Onde |
|---|---|---|---|
| Unitário | Vitest | Slots, fuso, transições de estado (funções puras) | `apps/api/tests/unit` |
| Integração | Vitest + `app.inject()` + Postgres real | Regras, autorização, concorrência, contratos | `apps/api/tests/integration` |
| E2E | Playwright + axe | Fluxos reais no navegador, vazamento na UI, acessibilidade | `apps/e2e/tests` |

Não há mock de banco: concorrência e índices só existem de verdade no Postgres.

## 2. Como rodar

**Só Docker (avaliador):**
```bash
docker compose -f docker-compose.qa.yml run --rm api-test
docker compose -f docker-compose.qa.yml run --rm e2e
docker compose -f docker-compose.qa.yml down -v
```
Projeto separado `drlaudo-qa`, banco em tmpfs, sem portas expostas, `LOGIN_RATE_LIMIT_MAX=1000`. O E2E só começa depois que `/api/health` responde pelo Nginx (Nginx → API → banco). Funciona em Windows, macOS e Linux.

**Local:**
```bash
docker compose up -d db
npm test                                   # usa DATABASE_URL_TEST (drlaudo_test)
npx playwright install --with-deps chromium
npm run dev  # em outro terminal
BASE_URL=http://localhost:5173 npm run test:e2e
```

Relatórios: `apps/e2e/playwright-report/` (trace, screenshot e vídeo só em falha).

## 3. Os 5 cenários obrigatórios

| # | Cenário | Integração | Assert principal | E2E |
|---|---|---|---|---|
| 1 | Dois agendamentos simultâneos no mesmo slot | `appointments.concurrency.test.ts` | `Promise.all` de 2 POSTs → status ordenados `[201, 409]`, 1 linha `SCHEDULED` no banco | `staff.scheduling.spec.ts`: slot ocupado aparece desabilitado |
| 2 | Paciente acessando dado de outro | `patient.access.test.ts` | Bruno pede laudo da Ana → `404 NOT_FOUND`; lista do Bruno não contém ids da Ana | `patient.access.spec.ts`: URL direta → "Não encontramos este registro" |
| 3 | Rascunho invisível | `patient.access.test.ts` | `404` com corpo idêntico ao de inexistente; `hasPublishedReport: false` | Intercepta todas as respostas `/api/` e verifica que o texto do rascunho nunca trafega |
| 4 | Publicado visível | `patient.access.test.ts` | `200` com título, texto, profissional, `publishedAt` | Card "Laudo disponível" → leitura com "Publicado em" |
| 5 | Agendamento no passado | `appointments.create.test.ts` | `422 PAST_DATE` com relógio fixo | Slots passados desabilitados com motivo |

Nomes dos testes: `cenário 1: ...` até `cenário 5: ...` (`npx vitest -t "cenário"` roda só eles).

## 4. Outros testes críticos (integração)

- Corrida cancelar × publicar com `Promise.all` → nunca termina em `CANCELED` + `PUBLISHED` (repetir 20×).
- Horário cancelado pode ser reagendado (RN-10).
- `INVALID_SLOT`: 10:15, 06:30, 19:00.
- `REPORT_EXISTS`, `REPORT_LOCKED`, `CANNOT_CANCEL`, `APPOINTMENT_CANCELED`.
- `401` sem token / token expirado / `iss` errado; `403` paciente em rota STAFF.
- Nenhuma resposta de nenhuma rota contém a chave `passwordHash` (varredura recursiva).
- `?date=` respeita o dia de São Paulo (agendamento às 23:30 local não aparece no dia seguinte UTC).
- Rate limit do login → `429`.

## 5. Unitários

`generateDaySlots` (24 slots, mudança de data em UTC), `isValidSlot`, `isPast` com relógio fixo, mapa de transições permitidas.

## 6. E2E

`playwright.config.ts`: `workers: 1`, `retries: 0`, `locale: 'pt-BR'`, `timezoneId: 'America/Sao_Paulo'`, projetos `setup`, `desktop` (Chrome) e `mobile-paciente` (Pixel 7, só `patient.*.spec.ts`). A versão de `@playwright/test` deve ser **exatamente** a da imagem `mcr.microsoft.com/playwright:vX.Y.Z-noble` (fixada em 1.64.1 no momento do setup).

| Spec | Cobre |
|---|---|
| `auth.setup.ts` | Login dos 3 usuários → `storageState` |
| `auth.spec.ts` | Login, erro de credencial, redirecionamento por perfil, logout |
| `staff.scheduling.spec.ts` | Agendar, slot ocupado, passado, cancelar |
| `staff.reports.spec.ts` | Rascunho, editar, publicar com confirmação, imutável depois |
| `patient.access.spec.ts` | Cenários 2, 3 e 4 |
| `timezone.spec.ts` | Navegador em `Asia/Tokyo` continua mostrando o horário de Brasília (RN-25) |
| `a11y.spec.ts` | axe com `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa` → zero violações nas telas principais |

Os testes criam seus próprios dados via API (`ClinicApi` em `support/fixtures.ts`) e não dependem do seed além dos usuários.

## 7. Contrato de testabilidade da UI

A UI deve expor (e o E2E depende disso):

- Inputs com `<Label>`: "E-mail", "Senha", "Paciente", "Exame", "Data", "Título", "Texto do laudo", "Profissional responsável".
- Botões de slot com nome acessível `"10:00, disponível"`, `"10:30, ocupado"`, `"07:00, horário passado"`.
- Card de agendamento com `data-appointment-id`.
- `?date=YYYY-MM-DD` na URL da agenda e do novo agendamento.
- Textos fixos: "Agendado", "Cancelado", "Rascunho", "Publicado", "Laudo disponível", "Publicado em", "Horário de Brasília", "Não encontramos este registro".

Mudou algum desses textos? Atualize este contrato e os specs no mesmo commit.

## 8. Smoke na VPS

```bash
BASE_URL=https://drlaudo.seudominio.com.br npm run test:smoke -w apps/e2e
```
Só leitura: login, agenda carrega, portal do paciente carrega, `/api/health` ok.

## 9. Checklist exploratório (manual, antes da entrega)

- [ ] Navegar tudo só com teclado (Tab, Enter, Esc no diálogo).
- [ ] Leitor de tela anuncia o status do slot e os toasts.
- [ ] Portal do paciente em 375 px sem scroll horizontal.
- [ ] F5 em qualquer rota não quebra (SPA fallback).
- [ ] Mensagens de erro claras para cada código.
- [ ] Token expirado leva ao login com aviso.

## 10. Regras para testes gerados por IA

Todo teste gerado por IA precisa ser visto falhando antes de entrar. Proibido enfraquecer um assert para passar. Os 5 cenários foram escritos e revisados pelo desenvolvedor.

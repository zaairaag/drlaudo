# Arquitetura — Dr. Laudo

**Estado:** desenho adotado no plano de implementação frontend autorizado em 2026-11-08, iniciando pela T1 (contrato/tooling). [DESAFIO](DESAFIO.md) → [PRD](PRD.md) define comportamento; [API](API.md) define wire contract; [DECISIONS](DECISIONS.md) registra motivos.
**Limite:** somente Fase A autorizada, com OK por unidade. Gate A visual/UX e autorização B continuam separados; backend e infraestrutura não foram iniciados.

## 1. Visão geral
`React/RTK Query → /api → MSW dev-only (A) | Fastify → Prisma → PostgreSQL 16 (B/C)`. `packages/contract` fornece schemas runtime, tipos inferidos, enums, erros e funções de tempo aos três consumidores.
A substituição do transporte não muda telas/hooks. Gate A explícito precede backend; CI/E2E são C, Docker/deploy opcionais. Mock simula comportamento, nunca assinatura, autorização ou garantia de banco reais.

```mermaid
sequenceDiagram
    participant W as React / RTK Query
    participant M as MSW (A, dev-only)
    participant A as Fastify (B/C)
    participant S as Service
    participant D as PostgreSQL 16
    W->>W: Validar entrada; fetch /api
    alt A: DEV e flag string true
        W->>M: Requisição HTTP
        M->>M: Schema, acesso e regra simulados
        M-->>W: Status e DTO/erro validado
    else B/C: mock desligado
        W->>A: Mesma requisição HTTP
        A->>A: Autenticar, autorizar, validar
        A->>S: Entrada válida e identidade confiável
        S->>D: Consulta/escrita; mutação em transação
        D-->>S: Dados selecionados
        S->>S: Mapear e validar DTO
        opt Mutação transacional
            S->>D: Commit ou rollback
            D-->>S: Confirmação
        end
        S-->>A: Resultado confirmado ou erro
        A-->>W: Serializar DTO confirmado ou erro público
    end
    W->>W: Descartar geração antiga; validar saída e reconciliar
```

### Code Reuse Analysis
O primeiro módulo implementado é `packages/contract`, com primitivas e identidade de T1. Os destinos de web/MSW/API/E2E abaixo continuam futuros; não há aplicação anterior para migrar.
Reuso disponível: API §§1–8 para contrato e precedências; PRD para jornadas; TESTING para padrões/oráculos; D-01…40 para decisões herdadas. Na implementação, contract é compartilhado por web/MSW/API; UI compartilha primitivas e componentes de produto. Regras de banco não são copiadas do mock.

## 2. Estrutura de diretórios
Estrutura incremental: somente o contrato é criado em T1; demais destinos entram com a primeira entrega real de cada camada. Node >=22.13/TypeScript strict e npm workspaces; versões/engines e lockfile da unidade constam em DECISIONS, sem major de Prisma presumido.
| Raiz | Responsabilidade / fase |
|---|---|
| `packages/contract/src/`, `tests/` | A: contrato ESM compilado em `dist` com declarations; `index.ts` exporta somente API §8. `exports` aponta a `dist/index.js`/`dist/index.d.ts`. |
| `apps/web/src/app/`, `features/`, `components/`, `lib/` | A: store/transporte/sessão, jornadas, UI/produto/marca/layout e formatação. Vite/React/Router/RTK Query/Tailwind v4/shadcn-Radix. |
| `apps/web/src/mocks/` | A: `db.ts`, `handlers.ts`, `browser.ts`, `node.ts`, `setupTests.ts`, `controls.tsx`, `handlers.test.ts`; todos os imports de teste MSW permanecem aqui. |
| `apps/web/scripts/assert-production-clean.mjs` | A: inspecionar módulos emitidos e assets, incluindo worker copiado de public. |
| `apps/api/src/`, `prisma/`, `scripts/database.ts`, `tests/` | B: app/server/env/clock/plugins/domain/features, schema/migrations/seed, launcher e helpers/unidade/integração. |
| `apps/e2e/`, `.github/workflows/ci.yml` | C: Playwright/axe e CI; configuração Docker/Nginx/Traefik somente se incluída/autorizada. |
Configuração raiz compartilhada: npm/lockfile, TS strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), ESLint flat, dependency-cruiser, Prettier, Node, editor e exemplos sanitizados de ambiente. Contract build/watch precede consumidores; não antecipar workspace vazio, API, E2E ou infra na A.

## 3. Modelo de dados
Todos os campos sem `?` são obrigatórios; `?` significa nullable persistido. UUIDs da aplicação/Prisma, enums fechados, timestamps `timestamptz(3)`, FKs obrigatórias com exclusão restrita. DTOs não são cópia do modelo.
| Entidade | Campos | Restrições |
|---|---|---|
| `User` | `id uuid`, `name string`, `email string`, `passwordHash string`, `role STAFF/PATIENT`, `createdAt timestamp` | PK id; e-mail único normalizado; bcrypt custo 10. |
| `ExamType` | `id uuid`, `code string`, `name string` | PK id; código único; catálogo fixo. |
| `Appointment` | `id uuid`, `patientId uuid`, `examTypeId uuid`, `startsAt timestamp`, `status SCHEDULED/CANCELED`, `createdAt timestamp`, `canceledAt? timestamp` | FKs User/ExamType; default SCHEDULED; índices startsAt/patientId; índice parcial abaixo. |
| `Report` | `id uuid`, `appointmentId uuid`, `title string`, `body text`, `professionalName string`, `status DRAFT/PUBLISHED`, `createdAt timestamp`, `updatedAt timestamp`, `publishedAt? timestamp` | FK Appointment; appointmentId único; default DRAFT. |
O serviço verifica `User.role = PATIENT`, não apenas a FK. Datas de transição vêm do clock. Sem delete, transferência de vínculo ou reativação.
Ownership lógico: auth possui User; catálogo possui ExamType; Appointment é o agregado que inclui Report. User/ExamType têm 1:N Appointment; Appointment tem 0..1 Report. Consistência forte nas transições/índices, sem estado replicado ou eventual.
### 3.2 Restrições e migration
Migration Prisma criada inicialmente com `--create-only` inclui SQL manual para o índice parcial e checks; não aplicar nada nesta revisão:
```sql
CREATE UNIQUE INDEX "appointment_active_slot_unique"
  ON "Appointment" ("startsAt") WHERE "status" = 'SCHEDULED';
ALTER TABLE "Appointment" ADD CONSTRAINT "appointment_canceled_at_consistent"
  CHECK (("status" = 'SCHEDULED' AND "canceledAt" IS NULL)
      OR ("status" = 'CANCELED' AND "canceledAt" IS NOT NULL));
ALTER TABLE "Report" ADD CONSTRAINT "report_published_at_consistent"
  CHECK (("status" = 'DRAFT' AND "publishedAt" IS NULL)
      OR ("status" = 'PUBLISHED' AND "publishedAt" IS NOT NULL));
```
`Report.appointmentId @unique` protege RN-14. Checks não impedem sozinhos CANCELED + PUBLISHED: isso exige §5. [TESTING](TESTING.md) exige inspeção e colisões reais, não leitura de SQL como prova.
Não há legado ou backfill. Na B, revisar a migration em QA descartável e conferir constraints/colisões antes de qualquer base persistente autorizada.
Reversão: rollback de transação não deixa escrita parcial; rollback de aplicação exige versão compatível com o schema. Em base persistente, preparar backup/restauração antes da migration; recriação/limpeza só em alvo descartável autorizado com guarda QA, nunca como down destrutivo genérico.

## 4. Fluxo de uma requisição
Cada linha descreve componentes a criar; dependências apontam para dentro do monólito, sem comunicação assíncrona ou evento.
| Componente / localização | Interface e responsabilidade | Dependências / reuso |
|---|---|---|
| `packages/contract/src/` | Schemas runtime, tipos inferidos, erros e tempo; superfície fechada de API §8: 45 schemas, 13 ErrorCode, 10 ValidationRule, 9 constantes e 5 funções de tempo. | Zod/IANA; sem React, Fastify, Prisma ou imports de apps. |
| `apps/web/src/app/` | `store.ts`: createAppStore(); `api.ts`: RTK Query único, parse de respostas/tags; `session.ts`: restaurar/resetar sessão e geração. | Contract e Redux; estado de servidor só em memória, sem DTO paralelo. |
| `apps/web/src/features/{auth,agenda,appointments,reports,patient}/` | Jornadas e hooks de §8; RHF para edição local, URL para filtros; nenhuma consulta privada antes do guard/restauração. | App, contract e components; nenhuma feature importa mocks, Prisma ou outra fonte de dados. |
| `apps/web/src/router.tsx` | Rotas, guards e retorno interno seguro; coordena restauração e navegação sem conter regra de servidor. | Router, app e componentes de layout; mapa de telas do PRD. |
| `apps/web/src/mocks/` | createMockDb({clock}), createHandlers({db,clock}); HTTP → parse → regra simulada → DTO parseado. | Contract, MSW, seed fictício §9; sem ORM/servidor ou promessa de segurança real. |
| `apps/api/src/features/<feature>/<feature>.routes.ts` e `plugins/` | HTTP/status, auth/perfil antes de parser, validação, resposta; auth usa JWT verificado, nunca decode. | Fastify/Zod, contract e service correspondente; sem regra de negócio no handler. |
| `apps/api/src/features/<feature>/<feature>.service.ts` | Factories com `{prisma,clock}`; entrada inferida e identidade confiável quando necessária; regra/consulta/transação. | Prisma e contract/domínio; sem Fastify/request/reply ou imports entre features. |
| `apps/api/src/features/<feature>/<feature>.dto.ts`; `domain/transitions.ts` | Select/mapper explícito separado da decisão pura de transição; nas mutações, mapear e validar saída ainda na transação. | Mapper usa tipos Prisma/contract; domínio puro não importa HTTP, Prisma ou features. |
| `apps/api/src/app.ts`, `server.ts`, `env.ts`, `clock.ts` | buildApp({prisma,clock,config}) sem listen para app.inject(); server carrega env/abre porta/encerra recursos; Clock.now(): Date. | Plugins/features, parser §11 e Prisma; testes injetam clock, não processo servidor. |
Interfaces dos services, sempre assíncronas e com tipos de API §8: createAppointmentsService oferece create(input) → StaffAppointment, list(query) → StaffAppointmentListResponse, getById(id)/cancel(id) → StaffAppointment.
createReportsService oferece getByAppointment(appointmentId), create(appointmentId,input), update(reportId,input), publish(reportId) → StaffReport. createMeService oferece listAppointments(patientId) → MyAppointmentListResponse e getPublishedReport(patientId,appointmentId) → PublishedPatientReport; patientId vem exclusivamente de sub.
Features auth/patients/exam-types/slots/health seguem a mesma separação: credenciais e usuário, catálogos, disponibilidade e SELECT1. JWT/limiter são plugins de borda; services não dependem da API do framework. Rotas completas, payloads, autenticação, status e exemplos permanecem somente em API §§3/5.
Fluxo B: auth → perfil → validação → service → banco/select explícito → mapper/schema de saída ainda na transação de mutação → commit → resposta. Falha de construção/validação do DTO antes do commit provoca rollback; a resposta usa esse resultado confirmado, sem nova leitura pós-commit. Falha de transporte após commit é resultado incerto para o cliente, não desfaz o banco. A ordem e o envelope são de API §§4.3/7. DomainError/formatError(error: unknown) retornam só status/erro permitido; saída inválida e P2002 desconhecido são internos sanitizados.
STAFF lê detalhe por id sem janela/cache, inclusive report:null; GET laudo mantém 404 quando ausente. PATIENT usa patientId = sub no where e PUBLISHED na leitura. Quatro casos indisponíveis usam consulta filtrada/corpo 404 byte a byte idêntico; selecionar DTO próprio, nunca entidade crua/passwordHash.

### Error Handling Strategy
| Falha | Tratamento na fronteira / recuperação |
|---|---|
| Entrada inválida / 400 | Rejeitar antes de consultar estado; normalizar detalhes de API §7.1, sem escrita parcial. UI mantém campos e associa erro/resumo. |
| Sessão / 401; perfil / 403 | Reset/abort/geração e login no primeiro; home compatível sem retry no segundo. Login inicial inválido não anuncia sessão expirada. |
| Singular indisponível / 404 | Corpo único da API; nunca sucesso null ou erro interno tratado como ausência. Paciente usa apresentação opaca do PRD. |
| Conflito / 409; slot / 422 | Banco/estado arbitram; refazer agenda/grade ou detalhe/laudo, preservar dados locais. INVALID_SLOT não arredonda; PAST_DATE limpa só horário. |
| Login limitado / 429 | Respeitar Retry-After antes de novo envio; manter e-mail, sem retry automático. |
| Rede, DTO inválido ou 500; health 503 | Falha segura, sem sucesso/JSON bruto. Leitura admite retry; mutação incerta exige reconciliação antes de nova ação, sem reenvio automático. |

## 5. Concorrência
| Operação | Mecanismo do desenho existente |
|---|---|
| Criar agendamento | Existência → grade → passado → INSERT; somente índice ativo arbitra slot. P2002 desse alvo → SLOT_TAKEN, nunca SELECT de disponibilidade como proteção. |
| Cancelar | Transação, FOR UPDATE Appointment, releitura de agendamento/laudo, validação e escrita de status/canceledAt; preservar rascunho. |
| Criar laudo | Mesma trava/releitura; validar SCHEDULED e ausência; inserir DRAFT. Unique appointmentId/P2002 conhecido → REPORT_EXISTS. |
| Editar/publicar | Resolver appointmentId sem decidir estado; travar primeiro Appointment; reler ambos; validar cancelado antes de bloqueado; só então escrever campos/timestamps. |
Usar transação interativa Prisma e `SELECT id FROM "Appointment" WHERE id = $1::uuid FOR UPDATE` parametrizado, na mesma conexão das leituras/escritas. Dentro do callback, somente client transacional. Capturar um `now` após lock/releitura; DTO corresponde ao commit, qualquer falha faz rollback integral.
Todas as quatro transições usam a mesma trava/ordem, nunca Report primeiro. READ COMMITTED é suficiente; transação curta, sem chamada externa/espera de UI, SERIALIZABLE, fila ou retry genérico. Atualização explícita de timestamps preserva clock mesmo com `@updatedAt`.
Os resultados legais e repetições são de API §6.1: cancelar × publicar tem só um sucesso; editar antes de publicar pode ser incorporado, depois não; criar antes de cancelar preserva DRAFT bloqueado. Saves DRAFT são última escrita por campo enviado; sem versionamento. [TESTING](TESTING.md) define quatro corridas e prova controlada de espera/releitura, não promessa de cobertura de todos os interleavings.

## 6. Autenticação e autorização
API §§5.2/6.2 é a norma de JWT HS256/issuer/claims/8 h, bcrypt custo10 e limiter10/IP/60s. Hooks auth/perfil precedem inclusive JSON malformado; limiter precede parse no login. E-mail ausente usa hash fictício do mesmo custo; nunca decode como autenticação.
Persistir só LoginResponse em `drlaudo.session`; expiração derivada dos claims é UX. Restaurar via `/auth/me` antes de dado privado. Logout/expiração/troca/storage abortam operações, avançam geração, resetam RTK Query/slices/filtros/formulários/destino privado e ignoram respostas antigas. Logout local não revoga token; sem senha/texto clínico no storage, salvo snapshot exclusivamente fictício do mock (§8).
Mesma origem `/api`, sem CORS permissivo; HTTP só loopback, HTTPS se publicada. Toda resposta no-store; sem cache privado em service worker. React escapa texto, sem HTML/Markdown clínico, script externo ou analytics. Headers/proxy C estão em §12; localStorage é limite da demo, vedado uso clínico real sem novo desenho.

## 7. Tempo
`Clock.now(): Date` injetado em service/mock; uma leitura de relógio por operação, após lock nas transições. Regras não usam `new Date()` solto nem aceitam now do cliente. Constantes/assinaturas exatas, sem aliases, pertencem a API §8.2 (`CLINIC_TZ`, `SLOT_MINUTES` e demais exports).
`slots.ts` é a implementação única de generateDaySlots/isValidSlot/isPast/localDayRange/defaultAgendaRange. Recebe UTC validado; `clock.now().toISOString()` fornece now. UtcRange contém Dates internos, inclusive fim exclusivo no ano10000 para 9999-12-31; não amplia o formato HTTP nem limita o calendário.
Conversão IANA, nunca offset fixo/TZ do host. Dia e janela padrão são intervalos civis semiabertos de API §4; PAST precede TAKEN. `web/lib/time.ts` centraliza formatação pt-BR com `timeZone: CLINIC_TZ` e “Horário de Brasília”, inclusive hoje; date-only não representa meia-noite UTC.

## 8. Frontend
URL é autoridade de filtros; RTK Query só guarda servidor em memória, slices sessão/filtros efêmeros, RHF edição. Hooks planejados: useLoginMutation/useGetMeQuery, useGetPatientsQuery/useGetExamTypesQuery/useGetSlotsQuery, useGetAppointmentsQuery/useGetAppointmentQuery/useCreateAppointmentMutation/useCancelAppointmentMutation, useGetReportQuery/useCreateReportMutation/useUpdateReportMutation/usePublishReportMutation, useGetMyAppointmentsQuery/useGetMyReportQuery. Health é verificado diretamente no smoke; não exige hook/tela de produto.
Tags `Appointment`, `Slot`, `Report`, `MyAppointment` e invalidações seguem API §6.3. Listas/detalhes refazem leitura em foco/reconexão; sem polling/websocket. Reconciliação não sobrescreve formulário local nem repete mutação incerta. [PRD](PRD.md#user-stories) define navegação/gestos/estados; [TESTING §7](TESTING.md#7-contrato-de-testabilidade-da-ui), nomes acessíveis/seletores.
ReportEditor mantém baseline do último DTO salvo e dirty em memória; usa z.input dos schemas transformados, com trim/limites do contrato. Só publica DRAFT salvo/válido/limpo mediante PublishDialog; nunca save+publish implícito.
Navegação dirty confirma descarte; F5/fechar usa aviso nativo; envio bloqueia duplo clique/alteração/abandono interno. Conflito preserva edição, relê agendamento e laudo; recarregar exige descarte explícito, estado bloqueado vira leitura canônica sem forçar escrita. Troca de id limpa o anterior.
### 8.2 Mock descartável e fronteira de produção
Somente `main.tsx`, fora de mocks, importa dinamicamente mocks quando `import.meta.env.DEV && import.meta.env.VITE_API_MOCKING === "true"`; aguardar worker.start antes do primeiro fetch/render. Ausente/false/1 e produção+true não ativam MSW. Ao desligar/trocar modo, parar/limpar somente registro MSW próprio no origin/path, nunca worker de outra aplicação.
Snapshot fictício versionado por aba em sessionStorage; primeira inicialização usa §9, F5 preserva snapshot e reset explícito recalcula datas. Latência demo300–600ms; testes com clock/latência fixos e dados novos. `/_ds` lazy/dev-only recebe controles injetados, sem import de mocks nem rota/módulo em produção. Setup/node/handlers ficam sob mocks inclusive nos testes.
Worker de public só é materializado em dev; build limpa dist e não copia worker/mocks/handlers/controles. assert-production-clean inspeciona módulos/artefatos, não strings de componentes; preview/rede complementam a prova. Não confiar apenas no tree-shaking.
### 8.3 Baseline visual herdado
Primitivas em components/ui (shadcn/Radix); produto em components/product: StatusBadge/statusMap, SlotGrid, AppointmentTable, ReportEditor, PublishDialog, ReportViewer, EmptyState, PageHeader e TimezoneNote. Ícones Lucide; fontes self-hosted Inter/Plus Jakarta Sans; tokens semânticos, tema claro, sem hex JSX/marca real. `accent` é hover; marca usa highlight/strong/soft.
| Tokens | Valores iniciais OKLCH, ainda sem contraste homologado |
|---|---|
| background / foreground; card/popover | `0.99 0.003 250` / `0.22 0.02 255`; `1 0 0`, foreground herdado |
| muted / muted-foreground; border/input / ring | `0.96 0.008 250` / `0.48 0.02 255`; `0.91 0.01 250` / `0.57 0.14 257` |
| primary / primary-foreground; secondary/accent / foregrounds | `0.43 0.13 259` / `0.99 0 0`; `0.97 0.015 250` / `0.37 0.11 260` |
| highlight / highlight-strong / highlight-soft | `0.58 0.10 190` / `0.47 0.09 192` / `0.95 0.03 190` |
| success / soft; warning / soft | `0.55 0.13 150` / `0.95 0.04 150`; `0.52 0.12 65` / `0.96 0.05 80` |
| destructive / soft; info | `0.55 0.21 27` / `0.96 0.03 27`; `0.50 0.14 258` |
Status: SCHEDULED CalendarClock/secondary; CANCELED CalendarX/muted; DRAFT FilePen/warning-soft+warning só STAFF; PUBLISHED FileCheck2/highlight-soft+strong STAFF; REPORT_AVAILABLE FileCheck2/highlight-soft+strong PATIENT. Texto/ícone sempre presentes. Slot livre outline, selecionado primary, indisponível motivo; texto de marca usa strong, não highlight de área/ícone.
Logo D/folha/dobra/check48×48, respiro meio símbolo, sem deformar/rotacionar/sombra; wordmark “Dr.” medium/“Laudo” bold em Plus Jakarta. Mínimos símbolo16px/completo96px. Hex só no asset: fundo#1e4f8f/dobra#b9d0ee/check#12907f/folha branca. SVG logo/favicon, PNG apple-touch180×180/og1200×630.
Larguras STAFF72rem/paciente42rem; título24px/600 e seção18px/600 Plus Jakarta, corpo STAFF14px/paciente16px Inter; laudo16px/linha relaxada/pre-wrap/max65ch; datas tabulares. Grid4px, gap16px, padding24px, raio10px; abaixo768px tabela vira cards, reflow375px e alvos44px. Layout/foco/contraste precisam observação real; ajustes de pares medidos são registrados antes do Gate A.

## 9. Seed e dados demonstrativos
Senha pública fictícia das três contas: `Demo@1234`. UUIDs fixos terminam nos sufixos abaixo; prefixos completos tornam todos UUIDv4:
| Prefixo UUID | Sufixo | Registro |
|---|---|---|
| `10000000-0000-4000-8000-` | `000000000001` / `000000000002` / `000000000003` | Equipe Dr. Laudo, equipe@drlaudo.test, STAFF / Ana Souza, ana.souza@drlaudo.test, PATIENT / Bruno Lima, bruno.lima@drlaudo.test, PATIENT. |
| `20000000-0000-4000-8000-` | `000000000001` / `000000000002` / `000000000003` | XRAY, Raio-X de tórax / ULTRASOUND, Ultrassonografia de abdome / MRI, Ressonância de crânio. |
No primeiro create, D é o dia civil do clock em Brasília; converter por IANA. Appointments prefixo `30000000-0000-4000-8000-`, sufixos1…5 em 12 dígitos; reports prefixo `40000000-0000-4000-8000-`, sufixos1/2.
| Item | Paciente/exame; D+1 local | Estado / conteúdo inicial |
|---|---|---|
| 1 | Ana/XRAY;08:00 | SCHEDULED+PUBLISHED; “Raio-X de tórax”; “Exemplo fictício: campos pulmonares sem alterações relevantes.”; Dra. Marina Costa; publishedAt=clock inicial. |
| 2 | Ana/ULTRASOUND;09:00 | SCHEDULED+DRAFT; “Ultrassonografia de abdome”; “Rascunho fictício: avaliação abdominal em preparação pela equipe.”; Dra. Marina Costa. |
| 3 / 4 / 5 | Ana/MRI;10:00 / Bruno/XRAY;11:00 / Bruno/ULTRASOUND;12:00 | 3/4 SCHEDULED sem laudo;5 CANCELED sem laudo, canceledAt=clock inicial, slot livre. |
Seed é transação atômica, upsert por UUID com `update: {}`. Datas relativas/hash/textos só no create; repetição não move horário, reseta senha, reabre, republica ou sobrescreve. Colisão e-mail/slot com dados externos aborta sanitizada sem apagar/consertar; não fazer upsert por e-mail. Base demo dedicada. db:setup migra+seed explícitos; iniciar API apenas conecta. Dados envelhecem por desenho. Mock segue primeira criação/snapshot; QA cria fixtures independentes e clock fixo.

## 10. Observabilidade
Pino estruturado: reqId, método, rota parametrizada, status, duração e ErrorCode. Ocultar Authorization, senha, token e credenciais de conexão; não registrar body/query arbitrária ou conteúdo clínico. Inesperados não expõem stack. Health faz SELECT1 e segue API §5.1 (200/503 canônico); sem novo código ou telemetria externa. Shutdown fecha Fastify/Prisma.
Taxa, erro e latência derivam desses logs; sem tracing distribuído, telemetria externa ou SLA numérico inventado. Topologia prevista: uma instância API e Postgres; volume/custo monetário/capacidade ainda não medidos.

## 11. Modos de execução
Procedimentos futuros, não comandos aprovados/executados nesta rodada.
| Modo | Topologia / preparação |
|---|---|
| A | Web:5173 com VITE_API_MOCKING=true; sem API/banco/Docker. |
| Final sem Docker | npm ci; PostgreSQL16 dedicado; env raiz; db:setup; dev. Web5173 → /api → API3333; demo e QA separados. |
| Docker / híbrido C, opcionais | Compose completo web8080/db5433 no loopback; híbrido só db5433 com web5173/API3333 locais. |
| QA B/C | drlaudo_test exclusivo; migrate-test/integrations; E2E só C. Compose QA opcional usa projeto drlaudo-qa, tmpfs, sem porta/volume demo. |
| Produção C, opcional | Domínio/env fornecidos e alvo autorizado; HTTPS, volume persistente, banco sem porta pública. |

Na B, o Fastify registra os caminhos de API §3 sem o prefixo externo `/api`: acesso direto e `app.inject()` usam `/health`, por exemplo. Vite encaminha `/api/*` removendo esse prefixo uma única vez; Nginx faz o mesmo quando incluído na C. O navegador mantém `/api/health`; não há segunda rota-alias nem fallback de API para HTML.

### 11.1 Contrato de configuração
| Variável | Restrição |
|---|---|
| DATABASE_URL / DATABASE_URL_TEST | Demo/produção externa; TEST só QA, database drlaudo_test, URL diferente da principal e alvo autorizado. Recusar limpeza fora da allowlist. TEST não é requisito de boot demo/prod. |
| JWT_SECRET | Mínimo32 caracteres e entropia suficiente, recomendado32bytes aleatórios codificados; falhar boot ausente/inseguro fora de teste, nunca valor no Git. |
| PORT / HOST | API3333 padrão, inteiro válido; loopback local,0.0.0.0 só rede/container configurado. |
| TRUST_PROXY_HOPS | 0 local;1 Nginx;2 só Traefik+Nginx com API inacessível fora da cadeia. |
| VITE_API_MOCKING / NODE_ENV | String true+DEV apenas; development/test/production validados; prefixo VITE nunca contém segredo. |
| DOMAIN / ACME_EMAIL | Só produção opcional, domínio controlado/e-mail válido do operador. |
| LOGIN_RATE_LIMIT_MAX | Padrão10, inteiro positivo; QA isolado não desativa prova do limite. |
### 11.2 Carregamento de ambiente portável
.env local único na raiz, ignorado/copied de .env.example; ambiente externo prevalece, produção não exige arquivo. Vite envDir resolve raiz por URL do config (`../..`), não cwd. Vitest define TZ por JS antes dos workers, sem sintaxe POSIX.
env.ts resolve `new URL("../../../.env", import.meta.url)` em src/dist e process.loadEnvFile Node22 se existir, depois valida sem exibir valores. database.ts reutiliza parser; operações fixas setup=migrate deploy+seed, seed, migrate-test. Última valida alvo antes de injetar TEST como DATABASE_URL só no filho.
Launcher usa process.execPath/npm_execpath, argumentos constantes `exec -- prisma`, schema absoluto/cwd do workspace e env explícito; sem segredo em shell/args. Seed TS via tsx. Config Prisma do major escolhido aponta ao mesmo schema/env. Provar raiz e npm-workspace na execução, sem cópia de env ou descoberta implícita do Prisma.
Scripts futuros são contratados em TESTING; npm test agrega unidade/componentes/integração, E2E separado em test:e2e. Não existe suíte de produto verde antes de um comportamento real.

## 12. Infraestrutura e publicação opcionais
Docker multi-stage, lockfile/imagens fixados na execução, sem segredo de build e usuário não root quando compatível. Nginx serve assets/fallback SPA só para telas; /api nunca vira index.html. CSP self-only, sem inline não autorizado, frame-ancestors none/base-uri self/object-src none/connect-src self; nosniff, no-referrer, noindex/nofollow e no-store privado. Fontes/assets locais.
Compose demo: db → migration/seed explícitos → API saudável → web. QA não monta volume demo. CI exige contrato/UI, integração Postgres, build sem mock e E2E C, sem continue-on-error. Traefik termina TLS; só web na rede do proxy, API/db internos. Produção requer autorização exata, backup e reversão de imagem/dados; migration não admite rollback destrutivo improvisado. Sem autorização, publicação não realizada, entrega local completa permanece obrigatória.

## 13. Handoffs e verificação por foco
Frontend: contrato/UI/MSW; backend: API/regras/locks/seed; arquitetura: garantias de banco; QA: oráculos/E2E; segurança: auth/exposição; entrega/operação: configuração/CI/ambientes; liderança técnica/coordenação: coerência e integração. São responsabilidades previstas, não despachos reais.
| Sequência de construção futura | Dependência / saída observável |
|---|---|
| A: contrato → mock/web → jornadas | Tooling mínimo junto do primeiro comportamento real; contrato completo antes dos consumidores. Gate A visual/UX explícito, celular real, build sem mock/worker; não prova auth/banco. |
| B: banco/app/health → auth/catálogos/slots → agendamento/laudo/portal | Gate A e autorização B; migrations/seed/QA reais junto do primeiro uso. Encerrar com mesmas telas sobre API/Postgres, sem MSW ou mudança de contrato. |
| C: execução reproduzível/CI → E2E/a11y → entrega | B aceito; npm test raiz e test:e2e separado obrigatórios. Modo sem Docker e smoke real; Docker/deploy só se incluídos e autorizados, fora da cadeia obrigatória. |
Testes comportamentais acompanham cada entrega, com RED real antes da implementação; bootstrap sem stubs ou suíte verde vazia. TESTING mantém cinco CEN, quatro RACE (cancelar/publicar 20×), arquivos serializados e requests concorrentes com ≥2 conexões/commits reais, além de prova controlada de lock/releitura.

### Risks & Concerns
| Risco / evidência documental | Impacto e mitigação do desenho |
|---|---|
| Isolamento/rascunho/cache (PRD S2/S5; API §6.2) | Crítico: sub/PUBLISHED no where, DTO próprio, quatro 404 iguais e geração/reset; falha bloqueia entrega. |
| Slot ou cancelado+publicado (API §6.1; D-04/05) | Crítico: índice/unique específicos, mesma trava Appointment, releitura/clock pós-lock; MSW não prova garantia. |
| XSS/JWT local (D-11; DT-01/04) | Alto: texto escapado, assets locais/CSP/8h/reset; sem revogação. Vedado dado clínico real sem novo desenho. |
| Mock divergente ou em produção (D-21; §8.2) | Alto: schemas compartilhados, handlers HTTP e cutover real; assert de módulos/assets mais preview/rede sem worker. |
| Tempo/edição/histórico (D-16/22/26/28; DT-02/03) | Clock/IANA/calendário inteiro, DRAFT última escrita por campo enviado, reconciliação e seed sem sobrescrita; QA independente. |
| SDK/config/banco ainda inexistentes (API §9; §11) | [verificar na execução autorizada]: versões/engines, hooks antes do parser, metadado P2002 real, migrations/locks/env. Provar em uso, sem APIs presumidas. |
Gargalos previstos: leituras de histórico sem paginação e escritas serializadas por agendamento; são limites da demo, sem demanda medida para fila/réplica/partição/cache extra. Inesperado sanitizado não vira fallback de sucesso.
Evidências/gates pertencem a TESTING, motivos/dívida a DECISIONS, comportamento ao PRD e HTTP à API. T1 implementou/verificou somente primitivas/identidade e tooling do contrato. Baseline visual não é captura binding nem contraste homologado; UI, mock e backend continuam futuros.

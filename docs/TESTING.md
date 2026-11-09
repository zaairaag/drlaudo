# Testes e QA — Dr. Laudo

**Autoridade:** [enunciado](DESAFIO.md), §4.4 → [PRD](PRD.md) → [API](API.md). [ARCHITECTURE](ARCHITECTURE.md) define mecanismos; [DECISIONS](DECISIONS.md), motivos; [AGENTS](../AGENTS.md), engenharia.
**Status:** em cópia limpa das fontes candidatas, `npm ci`, lint, typecheck, check:arch, build, `npm test` e `npm run test:e2e` passaram. Foram 514 testes de contrato, 314 de API/unidade, 424 web e 38 E2E. A stack Docker foi iniciada com PostgreSQL real; o teste de entrega confirmou headers, proxy, limite de login e rejeição de corpo proibido com envio aberto. Homologação visual/UX, leitor de tela nativo e celular físico dependem de avaliação humana.

## 1. Estratégia, risco e camadas

Críticos primeiro: isolamento do paciente/rascunho/cache, alvo QA e integridade de slot/laudo (CEN-01…05, RACE-01…04). Depois, limites temporais, recuperação, URL/F5, administração e acessibilidade. MSW é simulação de UI; aprovação visual/UX permanece humana e separada da autorização de implementação.

| Camada / fase | Método e fronteira | Prova / limite |
|---|---|---|
| Unidade A | Vitest/Node em `C/` | Schemas, slots e intervalos; não prova seu uso em UI/API |
| Componente A | Vitest/Testing Library, jsdom, store/router reais, MSW HTTP | Formulário, sessão/cache e recuperação; não layout, JWT ou banco |
| Handler A | Vitest + `msw/node` em `H/` | Requests/DTOs e estado simulado contra exemplos independentes da API |
| Unidade B | Vitest/Node em `U/` e sockets HTTP locais | Guarda estrutural, DTO, erros e corpo proibido; sem conexão ou mock de banco |
| Integração B | Fastify `app.inject()`, JWT/bcrypt, Prisma/PostgreSQL 16 com migrations reais | HTTP, propriedade, erros, índice/lock e pós-commit; sem mocks de banco/services/auth/transação |
| Produto B / E2E C | Mesma web sem MSW, proxy `/api` e API/Postgres reais; depois Playwright/axe e exploração | B dirigida; C automatizada/manual (§6/§9), sem substituir corridas B |

Cada caso nomeia RF/RN ou ID abaixo. Inventário e nomes reais acompanham a implementação; presença de arquivo e cobertura de linhas não são aceite.

| Prefixo / raiz | Responsabilidade |
|---|---|
| `C/` = `packages/contract/tests/` | `schemas.test.ts`, `slots.test.ts`, `dates.test.ts` |
| `W/` = `apps/web/src/` | `features/{auth/auth,agenda/agenda,appointments/appointments,reports/reports,patient/patient}.test.tsx`; `lib/time.test.ts` |
| `H/` = `apps/web/src/mocks/` | `handlers.test.ts`, `setupTests.ts` (MSW/DOM); nenhum setup externo ganha exceção para importar mocks |
| `I/` = `apps/api/tests/integration/` | Agendamentos, laudos, acesso do paciente, auth, proxy, administração, HTTP, concorrência, locks, banco e seed; fixtures e SQL reais |
| `U/` = `apps/api/tests/unit/` | Guards de ambiente, DTOs, redaction de logs e cancelamento de requisição; configuração própria permite provar alvos recusados sem abrir conexão |
| `E/` = `apps/e2e/tests/` | Setup por identidade, auth, agenda, laudos, pacientes, portal, timezone, axe/teclado/reflow e smoke |

## 2. Ambiente, fixtures, relógio e execução

- Só dados fictícios: STAFF, Ana e Bruno com credenciais/ids distintos e exames `XRAY`, `ULTRASOUND`, `MRI`. IDs QA possíveis: `11111111-1111-4111-8111-111111111111`, `22222222-2222-4222-8222-222222222222`, `33333333-3333-4333-8333-333333333333`, respectivamente. IDs de recursos criados por HTTP vêm das respostas; ids/ownership de fixtures vêm de seus dados explícitos, nunca do mapper sob teste.
- Cobrir `SCHEDULED` sem laudo/com `DRAFT`/com `PUBLISHED` e `CANCELED` sem laudo/com rascunho preservado. Slots distintos salvo colisão intencional; sentinelas distintas por paciente/estado (`SENTINELA-RASCUNHO-ANA-741`, `SENTINELA-PUBLICADO-ANA-852`). Conferir também ids, vínculo, estado e chaves exatas; ausência de sentinela sozinha não prova privacidade.
- A: dados completos, store/router/storages novos por caso. `H/setupTests.ts` inicia/encerra MSW, falha em request não tratado e restaura handlers/dados/clock/DOM.
- B: `apps/api/tests/helpers/` prepara identidades, catálogo e estados de negócio explícitos via Prisma/Postgres real, apenas no Arrange. Fixtures são confirmadas antes da ação; permitem testar, por exemplo, cancelar com DRAFT/PUBLISHED antes de existir o endpoint que os produz. A operação sob teste sempre passa por `app.inject()`/API real; observar HTTP e banco pós-commit. Não mockar auth/service/banco/transação nem tratar preparação direta como prova de criação/publicação.
- C: bootstrap QA sem cadastro público; `E/support/fixtures.ts` autentica e cria negócios por API real; `auth.setup.ts` usa credenciais QA controladas. Nenhuma camada depende do seed demo, ordem entre specs ou service para calcular expected.

- Clock padrão `2026-11-10T12:00:00.000Z` (09:00 Brasília): nesse dia, 11:30Z e 12:00Z são passado; 12:30Z é futuro. Injetar clock no domínio/mock; uma captura por operação, após lock/releitura nas mutações do agregado. Comparar milissegundos persistidos de `publishedAt`/`updatedAt`/`canceledAt` (este só no banco). Avançar clock entre escritas quando timestamps forem o objeto; grade inteira futura usa clock no dia anterior.
- Unidade/integração em Node, componentes explicitamente em jsdom. Processos e browser também em `Asia/Tokyo`; configurar TZ antes dos workers por configuração JS portável Windows, sem exigir `TZ=... comando`. Expected UTC/Brasília é literal: `2026-11-10T13:00:00.000Z` → 10:00. Não congelar timers do driver; expiração usa relógio de verificação controlado com assinatura real; timers de componente são locais/restaurados.
- `DATABASE_URL_TEST` aponta exclusivamente para `drlaudo_test` descartável. Validar protocolo, host e pathname decodificado; rejeitar query capaz de substituir destino/conexão e conferir `SELECT current_database()` antes de `DROP SCHEMA`. Igualdade com DATABASE_URL só é admitida no processo explicitamente de teste que usa um único banco QA; dev/produção nunca são alvos de limpeza. Migrations antes da suíte, arquivos serializados, fixtures independentes; corridas usam múltiplas conexões e requests independentes, não transação externa envolvendo a ação HTTP.
- Limiter isolado por instância/caso ou IPs controlados, nunca desabilitado no seu teste. Sem retries de suíte, sleeps arbitrários ou dependência de relógio de parede.

Scripts constroem o contrato antes de consumidores, inclusive em instalação limpa. Não criar testes permanentes de mapa/string/wiring/nonempty nem `passWithNoTests` para fabricar verde. Contrato, componentes, integração e E2E são executados e relatados separadamente.

| Fase | Comando | Critério |
|---|---|---|
| A | `npm test -w packages/contract -- --run`; `npm test -w apps/web -- --run` | Node para contrato; handlers/componentes isolados, sem atingir API real |
| A/B | `npm run lint`; `npm run typecheck`; `npm run check:arch`; `npm run build` | Só fases implementadas; bundle sem mocks/worker. Não são prova das RNs |
| B | `npm test -w apps/api -- --run`; seleção `npm test -w apps/api -- --run -t "cenário"` | Integração/transições reais; seleção encontra os cinco CEN, nunca zero casos |
| A/B/C | `npm test` na raiz | Agrega unidade, componentes/handlers e integração real existentes, propagando falhas |
| C | `npm run test:e2e` (alternativa: `npm test -w apps/e2e`) | Separado da raiz, Playwright sem MSW com health pronto; C exige raiz + E2E, sem duplicá-lo |

B funciona sem Docker com PostgreSQL 16 local. Integração Compose opcional: `docker compose -p drlaudo-qa -f docker-compose.qa.yml run --rm --build api-test`. E2E roda no host sobre QA dedicada com o runner próprio; não há serviço Compose `e2e` implícito. Para publicar conexão QA só em loopback, adicionar `docker-compose.qa-host.yml`. Provas de Nginx usam outro projeto com perfil `http`, sem seed demo. Nunca executar integração/E2E concorrentemente na mesma base. Limpeza só após conferir projeto/alvo descartável; relatórios/auth/screenshots ficam ignorados.

## 3. Os cinco cenários obrigatórios do enunciado

Prova final contra API/PostgreSQL; E2E regride a jornada sem substituir a concorrência de integração. O caso 4 deve encadear publicação HTTP e posterior leitura do paciente no mesmo teste, não usar somente fixture já PUBLISHED. CEN-01 não exige corrida por cliques E2E.

| ID / arquivos B; C | Preparação e ação | Resultado exato |
|---|---|---|
| CEN-01 / `I/appointments.test.ts`; `E/staff.scheduling.spec.ts` | STAFF, slot futuro livre; dois pacientes/tipos diferentes; dois POST simultâneos no mesmo início | Status `[201,409]`; perdedora SLOT_TAKEN; um SCHEDULED do vencedor após commit, vínculos corretos. UI refaz disponibilidade e mantém paciente/exame/data |
| CEN-02 / `I/patient.access.test.ts`; `E/patient.access.spec.ts` | Publicado da Ana; token real do Bruno; GET direto alheio e lista própria | 404 canônico igual ao inexistente; nenhum dado da Ana na resposta de Bruno |
| CEN-03 / mesmos arquivos CEN-02 | Rascunho sentinela; listar/ler e comparar inexistente, alheio, próprio sem laudo e próprio DRAFT | hasPublishedReport false; nenhum id/status/texto/metadado de rascunho; quatro 404 byte-exact e UI opaca |
| CEN-04 / mesmos arquivos CEN-02 | Próprio DRAFT inicialmente invisível; STAFF publica por HTTP; Ana refaz lista/leitura; Bruno tenta o id | Persistência PUBLISHED/publishedAt pelo clock; Ana200 com conteúdo exato e flag true; Bruno404, sem fixture PUBLISHED substituindo a transição |
| CEN-05 / `I/appointments.test.ts`; `E/staff.scheduling.spec.ts` | Clock09h Brasília; criar às08h30 e09h; controle09h30 | Ambos passados422 PAST_DATE e zero inserts; controle futuro201. UI desabilita passados com motivo textual |

## 4. Provas críticas de API e persistência

### 4.1 Segurança por chamadas diretas e contrato

Em `I/auth.test.ts`, `I/http.contract.test.ts`, `I/patient.access.test.ts` e `C/schemas.test.ts`, inputs/expected independentes exercitam o registro integral de rotas e schemas da API, não cópias de mapas:

- Autenticar cada rota protegida, inclusive detalhe STAFF: ausente/assinatura inválida/expirado/issuer errado → 401 antes de UUID/body/JSON inválidos. PATIENT em STAFF e STAFF em `/me/*` → 403 antes de formato/existência; login/health públicos. Login usa bcrypt real custo 10; verificar JWT HS256/claims exatos da API, último instante válido e `now >= exp`, `alg:none`, algoritmo/claims inválidos. `/auth/me` confere identidade e nega usuário removido. E-mail normaliza; senha não transforma; desconhecido/senha errada têm o mesmo 401 genérico.
- Ownership vem de `sub` no filtro real: injetar `patientId` em params/query/body não amplia acesso. Conferir conjuntos exatos de ids/chaves em sucesso/erro de todas as famílias, varredura recursiva sem `passwordHash` e PATIENT sem terceiro/rascunho; revisão dos selects explícitos complementa HTTP. Só STAFF autorizado lê rascunho; logs/evidências sem senha/token/texto clínico.
- Comparar quatro 404 por bytes UTF-8 compactos `{"error":{"code":"NOT_FOUND","message":"Não encontramos este registro"}}`, status, content-type e ausência de cabeçalho distintivo. Ignorar apenas metadados de transporte variáveis comuns (ex.: request id); não prometer latência indistinguível.
- Validar entradas na fronteira real e em schema: tipos/null/ausência, UUID v4 inválido/com espaços/maiúsculo normalizado, datas impossíveis, UTC sem `.SSSZ`/com offset/fração extra, desconhecidos/query duplicada, Content-Type/JSON inválidos, NoBody não ausente e PATCH vazio. Sem coerção/strip ou escrita parcial; timestamp válido com segundos/ms residuais chega a `INVALID_SLOT`, não erro de formato.
- Em sockets reais, GET e POST com cliente conectado devem receber 500 `INTERNAL_ERROR` em falha inesperada; cliente desconectado não deve impedir chamadas posteriores. `NoBody` com `Content-Length` ou chunked, inclusive envio ainda aberto após o primeiro byte, deve receber 400 `UNEXPECTED_BODY`; o servidor pode fechar a conexão após a resposta sem drenar conteúdo ilimitado.
- Comparar envelopes/detalhes **exatos de API §7/§7.1**, incluindo chaves/mensagens/ordem/deduplicação, `[]` versus `[""]`; matriz de ausência/tipo/comprimento/formato, PATCH `{}`/ausente/null/array/só desconhecido, query duplicada até desconhecida, NoBody antes de parse e JSON inválido agregando params/query. Exercitar duas falhas juntas conforme API §4.3: 401/403 antes de parse; PATCH vazio publicado 400 versus válido 409; cancelado vence laudo existente/bloqueado; UUID inválido → 400 e válido inexistente → 404 antes de estado; paciente/exame inexistentes vencem slot, grade vence passado, passado vence ocupado. STAFF como paciente → 404 na criação.
- RN-16 em `C/schemas.test.ts`, handlers, formulário e `I/reports.test.ts`: criar/PATCH com título/profissional 2/3/120/121 e texto 9/10/10.000/10.001 unidades UTF-16 após trim. Mín/máx aceitos; abaixo/acima/vazio/só espaços/null → 400/detalhes canônicos, sem alterar banco/formulário; Unicode com par substituto/espaços internos/quebras preservados, sem validação clínica.
- Saídas: positivos/negativos de todas as uniões da API §2; rejeitar DRAFT/publicação não nula, PUBLISHED/publicação nula, CANCELED/resumo publicado ou flag true, slot livre/com reason ou indisponível/sem reason e campos extras PATIENT. Toda resposta (login/health/erro inclusos) `Cache-Control:no-store`; somente `VALIDATION_ERROR` tem `details` não vazio; demais omitem. Schema de saída inválido → 500 `INTERNAL_ERROR`, nunca 400/sucesso parcial; preservar os 14 ErrorCode, incluindo EMAIL_TAKEN.
- Limiter real: 10 tentativas/IP em 60 s desde a primeira, contando sucesso/credencial errada/input inválido; 11ª → 429 antes de parse, `Retry-After = ceil(segundos restantes) > 0`. Em 60 s exatos inicia nova janela; outro IP independente; `X-Forwarded-For` arbitrário não burla proxy não confiável.
- Health: conexão real disponível → 200/DTO exato; indisponibilidade por conexão QA independente → 503 `INTERNAL_ERROR`, sem derrubar base compartilhada. Falha inesperada → 500 sanitizado; revisão de segurança cuida do parecer AppSec/credenciais.

### 4.2 Slots, precisão, filtros e UTC

`C/{slots,dates}.test.ts` e `I/appointments.{create,query}.test.ts` com os oráculos de tempo da API §4/§8:

| ID / ação | Critério literal |
|---|---|
| TEMPO-01 / grade de 2026-11-10, clock no dia anterior | 24 instantes únicos crescentes, diferença 1.800.000 ms; primeiro `2026-11-10T10:00:00.000Z`, último `2026-11-10T21:30:00.000Z`; 07:00–18:30 locais, todos os dias |
| TEMPO-02 / bordas e resíduos | 06:30/10:15/19:00 locais ou segundos/ms não zero → 422 `INVALID_SLOT`, zero inserts; 07:00/18:30 futuros livres aceitos. Timestamp malformado → 400 |
| TEMPO-03 / passado também ocupado | Grade `PAST` e criação `PAST_DATE` antes de INSERT; futuro ocupado `TAKEN`/`SLOT_TAKEN` |
| TEMPO-04 / dia civil 2026-11-10 | `[2026-11-10T03:00:00.000Z,2026-11-11T03:00:00.000Z)` inclui início, exclui fim/véspera; fixtures de borda por helper SQL, não criação fora da grade |
| TEMPO-05 / agenda sem date, clock padrão | `[2026-11-10T03:00:00.000Z,2026-12-10T03:00:00.000Z)`: hoje inteiro + 29 dias, inclui passados de hoje/cancelados, exclui fim/31º dia; bordas por helper, não `[now,now+720h]` |
| TEMPO-06 / data/paciente/ambos/nenhum | Conjunto exato com AND, estados preservados, `startsAt ASC,id ASC` lexicográfico e GET repetido estável. Filtro patientId inexistente/STAFF → `200 []`; paciente vê histórico próprio inteiro, sem janela/filtros |
| TEMPO-07 / processo/browser Brasília e Tóquio | Mesmo UTC e dia/hora Brasília no DOM, com “Horário de Brasília”, independente da máquina |

Exceção histórica aprovada: `1931-10-03` omite posições civis eliminadas pela transição IANA de São Paulo. Testar round-trip local de cada início, ordenação e unicidade, sem exigir 24 ou inventar instantes inexistentes. Datas normais mantêm os 24 do TEMPO-01; calendário 0001–9999 preservado.

`C/dates.test.ts` comprova `localDayRange/defaultAgendaRange` com `Date` válidos/ordenados internos: `9999-12-31` admite fim exclusivo no ano 10000 sem ampliar HTTP ou reduzir calendário 0001–9999. `I/catalog.test.ts` confere só PATIENT no catálogo de pacientes, os três códigos distintos de exame e ids exatos; ordem `name,id` por pontos de código Unicode/binária com fixtures que diferenciem collation local; lista vazia permitida → `200 []`, PATIENT não acessa catálogos STAFF.

### 4.3 Transições e concorrência

`U/transitions.test.ts`; `I/appointments.cancel.test.ts`, `I/reports.test.ts` e `I/reports.concurrency.test.ts`: comparar HTTP e leitura real pós-commit. Capturar antes título/corpo/profissional/status/vínculos/timestamps; todo erro preserva esses valores.

| ID / ação | Resultado exato |
|---|---|
| ESTADO-01 / cancelar SCHEDULED sem laudo, inclusive passado; repetir | 200 CANCELED, `canceledAt = clock`; repetição 409 `CANNOT_CANCEL` sem trocar data; sem reativação/restrição por passado |
| ESTADO-02 / reagendar slot cancelado, com/sem rascunho | Futuro → 201 com id novo, antigo cancelado intacto, sem transferir vínculos/laudo, um SCHEDULED; passado continua proibido |
| ESTADO-03 / cancelar com DRAFT; criar/editar/publicar depois | 200 preserva id/campos/DRAFT/publicação nula; três mutações posteriores 409 `APPOINTMENT_CANCELED`, sem escrita |
| ESTADO-04 / criar laudo em ativo, inclusive futuro; repetir | 201 DRAFT/publicação nula/conteúdo normalizado; repetição 409 `REPORT_EXISTS`; um laudo |
| ESTADO-05 / PATCH de campo válido; repetir mesmo valor com clock avançado | Só enviados mudam; omitidos preservados; mesmo valor aceito com novo `updatedAt`, DRAFT. Vazio/null/desconhecidos/estado → 400, sem escrita |
| ESTADO-06 / publicar rascunho em exame futuro; repetir | 200 PUBLISHED, `publishedAt = updatedAt = clock`; repetição 409 `REPORT_LOCKED` sem mudar nada |
| ESTADO-07 / publicado: PATCH válido/republicar/cancelar/status/DELETE | PATCH/republicar 409 `REPORT_LOCKED`; cancelar 409 `CANNOT_CANCEL`; status 400; `DELETE /reports/:id` 404 `NOT_FOUND`. Sem editar/despublicar/excluir/mudar timestamps |
| RACE-01 / cancelar × publicar, rascunho/slot futuro novos por iteração, 20 vezes | Todas: um 200 + um 409, apenas os dois resultados abaixo; conferir ambas respostas/join pós-commit; zero CANCELED+PUBLISHED, 500 ou timeout |
| RACE-02 / duas criações de laudo no mesmo ativo | `[201,409]`, perdedora `REPORT_EXISTS`; um laudo vinculado/conteúdo do vencedor |
| RACE-03 / editar × publicar | Edição primeiro: ambos 200, publicado incorpora edição. Publicação primeiro: PATCH 409 `REPORT_LOCKED`, conteúdo anterior intacto; nunca editar após publicar |
| RACE-04 / criar × cancelar | Cancelar primeiro: criação 409 `APPOINTMENT_CANCELED`, sem laudo. Criar primeiro: criação 201 + cancelamento 200, DRAFT preservado/bloqueado |

RACE-01 só admite: cancelar 200 + publicar 409 `APPOINTMENT_CANCELED`, banco CANCELED/DRAFT, `canceledAt=clock` e `publishedAt=null`; **ou** publicar 200 + cancelar 409 `CANNOT_CANCEL`, banco SCHEDULED/PUBLISHED, `canceledAt=null` e `publishedAt=clock`. Alternar disparo, incluir controles sequenciais das duas ordens e diagnóstico por iteração; não exigir ambos vencedores do scheduler nem alegar cobertura de todos os interleavings em 20 repetições.

### 4.4 Prova do mecanismo real e seed

Em `I/database.test.ts`, conforme API §6 e ARCHITECTURE (modelo/concorrência/seed):
- Inspecionar metadados migrados de `appointment_active_slot_unique`, único em startsAt só SCHEDULED; colidir INSERTs reais, permitir cancelado + novo ativo e comprovar HTTP `P2002` desse índice → `SLOT_TAKEN`. Não trocar índice por SELECT prévio. Colidir também unique real `Report.appointmentId` → `REPORT_EXISTS`, sem erro Prisma fabricado.
- Transação de controle segura `FOR UPDATE` no Appointment; iniciar por HTTP cada criar/editar/publicar laudo/cancelar e observar espera real com deadline, sem sleep/spy. Mudar estado antes de liberar (CANCELED para laudo, PUBLISHED para cancelar); após commit, request relê e devolve 409 correspondente, sem escrita tardia. Revisão confirma trava Appointment primeiro e releitura/escrita na mesma transação/conexão; avançar clock durante espera para observar captura pós-lock.
- Seed duas vezes em base isolada mantém ids/contagens de usuários/catálogo/demo. Avançar clock, editar rascunho, publicar outro, cancelar item e alterar senha antes de reexecutar: upsert de ids fixos com update vazio não move datas, sobrescreve conteúdo/publicação, reabre cancelado ou reseta senha. Datas relativas só no primeiro create; colisão alheia aborta atomicamente sem apagar dados. Iniciar API não resemeia; QA continua independente da demo.

## 5. Matriz de cobertura e aceites Given/When/Then

Rastrear os AC EARS do PRD por estes IDs estáveis. A usa componentes reais e `H/handlers.test.ts` na fronteira HTTP simulada; **todos** os casos B são obrigatórios e reais. C seleciona regressão (§6), sem substituir B.

| RF/RN cobertos | Arquivos A; B; C | Preparação/ação → oráculo |
|---|---|---|
| RF-01, RF-02; RN-01, RN-02, RN-03 | `W/features/auth/auth.test.tsx`, `C/schemas.test.ts`; `I/{auth,http.contract,proxy}.test.ts`; `E/auth.spec.ts` | Dois perfis, credencial inválida, token/clock/limite, autenticação/role em todas as rotas e retomada segura |
| RF-03; RN-05…09 | `C/slots.test.ts`, `W/features/appointments/appointments.test.tsx`; `I/{appointments,database}.test.ts`; `E/staff.scheduling.spec.ts` | Seleção explícita, grade/tempo, um ativo por slot concorrente, passado e ocupação; conflito preserva campos |
| RF-04; RN-25 | `W/features/agenda/agenda.test.tsx`, `W/lib/time.test.ts`, `C/dates.test.ts`; `I/appointments.test.ts`; `E/{staff.scheduling,timezone}.spec.ts` | Filtros/URL/F5/ordem/intervalos e fuso independente do navegador; falha de catálogo tem recuperação |
| RF-05; RN-10…13 | `W/features/agenda/agenda.test.tsx`, `W/features/reports/reports.test.tsx`; `I/{appointments,concurrency,locks}.test.ts`; `E/staff.scheduling.spec.ts` | Desistência sem mutação; cancelar/preservar DRAFT/bloquear/reutilizar novo id; resultado incerto reconcilia |
| RF-06; RN-14…18, RN-21 | `W/features/reports/reports.test.tsx`, `C/schemas.test.ts`; `I/{reports,concurrency,locks,database}.test.ts`; `E/staff.reports.spec.ts` | Detalhe independente, normalização/limites, PATCH parcial, erro sem escrita, relógio após lock e futuro permitido |
| RF-07; RN-19, RN-20 | `W/features/reports/reports.test.tsx`; `I/{reports,concurrency,locks,patient.access}.test.ts`; `E/staff.reports.spec.ts` | Salvar/confirmar/publicar explicitamente; persistência e timestamps; edição recusada preserva banco e texto local |
| RF-08; RN-04, RN-22…24 | `W/features/patient/patient.test.tsx`, `W/features/auth/auth.test.tsx`, `C/schemas.test.ts`; `I/{patient.access,http.contract}.test.ts`; `E/patient.access.spec.ts` | Histórico só próprio, publicação HTTP→leitura, quatro 404 opacos, sem dado anterior/rascunho/terceiro em DTO/DOM/cache |
| RF-09 | `W/features/patients/patients.test.tsx`, `H/handlers.test.ts`; `I/patients.test.ts`; E2E administração | STAFF cadastra/edita, valida limites e email único sem escrita parcial; nova conta autentica e vê somente dados próprios; PATIENT não acessa gestão |

### 5.1 UI, sessão e recuperação

- Usar componentes/providers reais e `getByRole/getByLabel` com §7; não mockar formulário, ReportViewer, SlotGrid, guard ou RTK Query para provar seus efeitos. Exercitar loading/vazio/erro/sucesso e ações/textos dos AC EARS de UI do PRD, não só presença de elementos.
- Persistir só `LoginResponse` em `drlaudo.session`, sem senha/cache/lista/laudo/formulário. No F5 validar estrutura e `/auth/me` antes de conteúdo/queries privados; inválida/expirada/401 limpa tudo; rede/500 mostra erro com tentar novamente, sem liberar cache antigo. F5 não renova exp.
- Preencher cache Ana/equipe, deixar request antigo em voo, fazer logout/expiração/troca/substituição de sessão ou evento storage de outra aba e só depois liberar resposta. Abortar/ignorar antigos; novo cache/DOM, filtros/seleções/formulários e histórico continuam sem dados anteriores. Conferir efeito após resposta tardia, não chamada de reset. Logout é local, funciona offline/substitui histórico; JWT copiado continua válido até expirar, sem logout/refresh remoto.
- Login demo só preenche; retorno só interno conhecido/compatível com perfil, preservando os parâmetros válidos da jornada. Sem sessão não renderiza privado; perfil errado não dispara query proibida. Erro inicial é genérico, sem falso aviso de expiração. Invalidar/refazer as tags de API, incluindo Patient e nomes em Appointment após edição; foco/online reais devem alcançar o store, sem despachar apenas ações internas no teste.
- Erros conforme PRD: leitura permite retry; 400 mantém campos/associa input; SLOT_TAKEN/PAST_DATE limpa só slot/refaz grade; INVALID_SLOT não arredonda; 409 de estado refaz recurso e preserva texto; 401 limpa sessão; 403 redireciona; 404 opaco; 429 respeita Retry-After. Rede/500/DTO inválido não anuncia sucesso nem conteúdo parcial; mutação incerta preserva formulário e exige reconciliar leituras antes de nova ação, nunca retry cego.
- Editor por URL/F5 sem cache/fora dos 30 dias: detalhe confirmado antes do formulário; `report:null` permite criar só em SCHEDULED; DRAFT carrega texto, publicado é imutável, cancelado bloqueado. Detalhe 404 continua 404; resumo existente + falha GET report exige erro/refazer ambas, nunca “sem laudo”/nova criação. Mudar id limpa conteúdo anterior; erro 500 não vira ausência.
- Publicar só após POST de rascunho válido e formulário salvo/limpo/válido. Dirty mostra “Salve o rascunho antes de publicar.” com zero save/publish automático; salvar envia os três campos normalizados e troca baseline pelo DTO. Voltar/Esc no diálogo não muta; confirmar envia única publicação NoBody, sem save oculto. Cancelamento também não muta ao desistir.
- Dirty confirma descarte na navegação interna; F5/fechar aba usa aviso nativo em browser real. Conflito/erro de leitura não sobrescreve edição em memória; “Recarregar rascunho” confirma descarte. Salvar/publicar bloqueia duplo envio/abandono interno; texto clínico nunca vai a storage para recuperação.
- Novo agendamento sem paciente/exame pré-selecionados; trocar data preserva ambos, limpa só slot e refaz grade/URL. Loading/erro/data inválida não deixa slot utilizável; usa startsAt da API. Sucesso volta à agenda da data sem filtro de paciente/foca item novo; ocupados/passados não selecionáveis.
- MSW só com DEV + string exata `VITE_API_MOCKING=true`; ausente/false/produção com true não ativa. Check de arquitetura e bundle/preview comprovam imports permitidos e produção sem mocks/worker, sem teste permanente de busca de strings do código-fonte. Formulário/handler/API compartilharem Zod não dispensa negativos reais em cada fronteira.

## 6. Integração sem mocks e E2E

A entrega usa a mesma web, MSW desligado/sem worker registrado, proxy `/api` para Fastify/Postgres. Jornada dirigida: STAFF login → filtros → agendar → cancelar → reutilizar com novo id → criar/editar/publicar → imutabilidade → logout → paciente próprio lista/lê → outro paciente recebe 404 opaco; editor URL/F5 sem cache/fora da janela. Registrar HTTP e pós-commit/reload: nenhum handler, `page.route` ou worker fabrica sucesso, nenhuma tela muda imports/lógica; API indisponível mostra erro, não demo. 409 preserva campos/reconcilia recurso real. Integração dirigida e E2E automatizado são provas distintas. Autorização de execução técnica não concede Gate A visual humano.

Configuração entregue: `workers:1`, `retries:0`, locale pt-BR, timezone America/Sao_Paulo, projetos setup/desktop/mobile-patient/tokyo e contexto por identidade. Playwright 1.65.0 e axe 4.14.0 estão fixados no workspace E2E; o navegador Chromium é instalado pelo comando do README. Não há runner E2E em imagem Docker entregue.

| Arquivo | Regressão / aceite |
|---|---|
| `E/auth.setup.ts`; `E/auth.spec.ts` | Três logins reais/storageStates separados, sem segredos no relatório; RF-01/02, erro/role/F5/logout/expiração/troca e voltar com cache anterior |
| `E/staff.scheduling.spec.ts` | RF-03/04/05, CEN-01/05 representativos: slots/filtros URL, desistência sem mutar, conflito/refetch/passado/cancelar/reutilizar |
| `E/staff.reports.spec.ts` | RF-06/07, RN-16: URL/F5 com/sem laudo, salvar antes/publicação dirty/descarte/confirmação, futuro permitido, bloqueios e rede/500 com reconciliação |
| `E/patient.access.spec.ts` | RF-08/CEN-02/03/04: próprios, quatro 404, rede sem rascunho, publicado correto e mobile |
| `E/timezone.spec.ts` | RN-25/TEMPO-07 também em Asia/Tokyo, filtros e indicação Brasília |
| `E/a11y.spec.ts` | axe `wcag2a,wcag2aa,wcag21a,wcag21aa`: zero violações nas telas principais e formulário/diálogo/erro; complementar §9 |

Axe não certifica AA; contraste exige medição WebAIM Contrast Checker, foco/teclado/leitor de tela exigem observação. jsdom não mede layout. Gate visual usa aplicação aberta, viewport 375 px e celular real da responsável pelo produto.

## 7. Contrato de testabilidade da UI

A UI deve expor (e o E2E depende disso):

- Inputs com `<Label>`: "E-mail", "Senha", "Paciente", "Exame", "Data", "Título", "Texto do laudo", "Profissional responsável".
- Botões de slot com nome acessível `"10:00, disponível"`, `"10:30, ocupado"`, `"07:00, horário passado"`.
- Card de agendamento com `data-appointment-id`.
- `?date=YYYY-MM-DD` na URL da agenda e do novo agendamento.
- Textos fixos: "Agendado", "Cancelado", "Rascunho", "Publicado", "Laudo disponível", "Publicado em", "Horário de Brasília", "Não encontramos este registro".

Mudou algum desses textos? Atualize este contrato e os specs no mesmo commit.

## 8. Smoke de entrega e ambiente autorizado

`E/smoke.spec.ts` só lê negócio: health 200 pelo proxy, login STAFF/agenda e login PATIENT/portal. Execute `npm run test:e2e:smoke` na raiz com `BASE_URL` configurada para o alvo autorizado; não cria/cancela/edita/publica. Sem `BASE_URL`, o padrão é `http://127.0.0.1:5173`; para Compose, usar `http://127.0.0.1:8080`. Credenciais demo são padrão; `SMOKE_STAFF_EMAIL`, `SMOKE_STAFF_PASSWORD`, `SMOKE_PATIENT_EMAIL` e `SMOKE_PATIENT_PASSWORD` permitem contas fictícias específicas. Health sozinho não aprova jornada/autorização.
Partir de ambiente limpo pelas instruções públicas: versões/lockfile autorizados, Postgres/dados fictícios, web/API e checks da fase sem Docker; repetir Compose se entregue. Registrar comandos/tempo/diferenças; alvo PRD <5 min ainda não medido.

## 9. Exploração colaborativa dirigida

QA e implementação executam charters futuros, críticos primeiro; produto participa do Gate A. Exploração não substitui prova automatizada de autorização/concorrência.

| Charter / time-box | Missão | Critério / evidência |
|---|---|---|
| EXP-01 / 20 min | Alternar Ana/Bruno/STAFF; expirar no formulário; histórico/URL alheia/storage em outra aba/request antigo | DOM/rede/cache sem dado anterior/rascunho; sessão inválida bloqueia; vazamento interrompe liberação e vai à implementação/segurança |
| EXP-02 / 20 min | Login/filtros/grade/formulário/diálogos por Tab/Shift+Tab/Enter/Espaço/Esc; erro/confirmação | Labels §7, foco visível/ordem útil, diálogo prende/devolve foco, Esc/desistir não muta; slot/toast/erro anunciados além da cor, leitor de tela |
| EXP-03 / 20 min | Portal 375 px/celular real, textos longos/vazio/loading/erro, zoom 200%, leitura publicada | Sem scroll horizontal/cortes; texto legível/ações alcançáveis, sem indício de rascunho; capturas sanitizadas |
| EXP-04 / 20 min | Lentidão/queda pós-envio, duplo clique, conflito, publicação concorrente, navegação/F5 dirty | Sem duplicação/retry cego; reconciliar antes de mutar, confirmação/aviso nativo, nenhum texto clínico em storage; fallback SPA/detalhe por id recupera sem cache |

Registrar ambiente/revisão/dados fictícios/passos e observado versus esperado: reproduzido, hipótese [verificar] ou limite do ambiente. Achado crítico bloqueia e recebe regressão pela implementação; configuração/entrega → entrega/operação, disponibilidade → operação, risco/credenciais → segurança.

## 10. Disciplina TDD e qualidade das asserções

Na implementação autorizada: RED pelo comportamento ausente → menor implementação → GREEN → refatorar verde; runner/import/conexão quebrados não provam RED. Nomear o defeito detectável (ownership/lock/<=/segundo ativo/publicado/cache/rascunho); expected independente e literal de ids/conjuntos/UTC/status/código/pós-commit/interações. Schema compartilhado ou parse sozinho não prova propriedade/estado/privacidade.
A mocka só HTTP e observa handlers por request/estado, componentes reais por interação; B/C não mockam Prisma/banco/transação/auth/services nem substituem pós-commit por spy. Sem testes de mapa/microcopy/string incidental/export/wiring/nonempty ou setup decorativo. Não enfraquecer assert/expected, usar only/skip/retries/passWithNoTests permanente; investigar falha, alterar contrato só por decisão explícita. Cobertura/exit zero sem casos/persistência não libera.

## 11. Evidências, gates e parecer de qualidade

Registrar revisão/build/fase/ambiente/base QA/clock/TZ, RF/RN/AC EARS/caso, comando exato, número de casos encontrados, resultado e artefato sanitizado; RED/GREEN pertinentes, separando unidade, MSW, integração real, E2E e manual. Corridas registram ambas respostas/status/códigos e pós-commit por iteração; privacidade registra igualdade dos quatro corpos/campos sem publicar conteúdo. Traces/capturas brutos com credenciais são restritos/ignorados.

| Gate | Evidência mínima / decisão |
|---|---|
| Autorizar implementação | Specify/PRD aprovado; Tasks exige aprovação própria e autorização explícita do escopo pela responsável pelo produto. Este plano de provas não concede execução |
| A / frontend simulado | RF-01…08/casos A das RN e §5.1, teclado/mobile/§7/§9; comandos observados, bundle sem mock/worker, visual/celular real e aprovação explícita de produto; sem Go de backend/produto |
| B / API real | Todos RF/RN B, CEN-01…05 reais, RACE-01 20/20 válidas + RACE-02…04/transições/locks/colisões, DTOs/quatro 404 exatos e UI/API sem mocks; nenhuma falha crítica/alta sem solução comprovada |
| C / entrega | `npm test` raiz + E2E separado e axe reais, charters/contraste observados, execução sem Docker/Compose quando entregue, enunciado §5 completo e smoke no alvo autorizado quando houver deploy; gate operacional separado |

**Vermelho / No-Go:** falha de isolamento/rascunho/cache, regra crítica/concorrência, cobertura B essencial ausente, simulação apresentada como real, ambiente desconhecido ou falha alta sem mitigação comprovada. Encaminhar implementação e revisão técnica quando necessário; entrega/operação recebem seu gate. **Verde condicionado:** só risco não crítico com cenário/impacto/responsável/aceitação explícita, sem dispensar cinco CEN, invariantes ou autorização. **Verde:** evidência realmente obtida e critérios atendidos, nunca apenas exit zero.
**Parecer técnico local:** gates automatizados e smoke da stack real executados; no Chromium foram observados login, agenda da equipe, portal e laudo publicado do paciente em 375 px, sem rolagem horizontal no portal. Esses resultados não substituem aprovação visual/UX, teste com leitor de tela nativo ou celular físico, nem autorizam publicação.

### Implantação pública e conferência documental — 2026-11-09

Demo autorizada: <https://drlaudo.zairagoncalves.com>, via Cloudflare Tunnel → Nginx → API/PostgreSQL. Na implantação, HTTPS/HTML/health e login da equipe foram observados no navegador, com console sem erros.

Nesta conferência foi executado `BASE_URL=https://drlaudo.zairagoncalves.com npm run test:e2e:smoke`: **3/3 passaram**, em 13,1 s no runner, com um worker e zero retries. A prova confirmou health/DTO, autenticação dos dois perfis e leitura concluída de agenda/catálogo e portal, sem worker MSW e sem mutações de negócio. Não substitui a suíte local de 1.290 casos registrada acima, que não foi reexecutada nesta revisão documental.

Após autorização explícita da autora, o repositório foi tornado público em 09/11/2026; a consulta ao GitHub confirmou `PUBLIC`. Antes da mudança, foram conferidos 234 arquivos atuais e 325 blobs do histórico por padrões conhecidos de tokens/chaves privadas, sem ocorrências e sem caminhos de ambiente privado no histórico; não equivale a auditoria completa de segredos. O CI remoto revelou erro de validação nas linhas 35/36: `job.services` não é permitido no `env` do job. A configuração da conexão QA foi movida para um step, onde esse contexto é válido, e exportada pelo `GITHUB_ENV`; a execução remota deve comprovar o resultado. Meta de instalação <5 min não medida. Aprovação visual/UX, leitor de tela nativo e celular físico permanecem pendentes.

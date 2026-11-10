# API — Dr. Laudo

**Autoridade:** [enunciado](DESAFIO.md) → [PRD](PRD.md) → este contrato. Engenharia: [AGENTS](../AGENTS.md); desenho: [ARCHITECTURE](ARCHITECTURE.md); motivos: [DECISIONS](DECISIONS.md); provas previstas: [TESTING](TESTING.md).
**Estado:** contrato compartilhado por API, web e testes, com complemento autorizado de administração de pacientes. O registro contém 18 rotas sobre Fastify/PostgreSQL; a evidência de implementação e execução pertence a TESTING. A web usa `/api` relativo; MSW permanece ferramenta apenas de desenvolvimento.

## 1. Fronteira e convenções HTTP

REST/JSON, monólito modular, 18 rotas relativas a `/api`. Web usa essa origem relativa em todas as fases: MSW dev-only, proxy Vite e Nginx para a API real, sem mudar telas. Não há fila/evento, serviço separado, cadastro público, logout ou refresh HTTP. Cadastro e edição administrativos são exclusivos de STAFF.
- Toda resposta é JSON UTF-8 com `Cache-Control: no-store`, inclusive login, health e erros. Listas são arrays, inclusive `[]`; sem envelope de sucesso, `204`, paginação, ETag ou cache HTTP privado.
- Rotas protegidas exigem um único `Authorization: Bearer <JWT>` válido; ausente/malformado/inválido/expirado → `401 UNAUTHORIZED`. Login e health são públicos e independem de token eventualmente enviado. Auth/perfil precedem até o parser (§4.3).
- Objetos de entrada **e saída** são strict: rejeitar campos desconhecidos, não removê-los. Obrigatórios não podem ser omitidos; `null` só onde explícito. Não coagir número/booleano/array para string. Opcional ausente é omitido, nunca `""` ou `null`.
- Params/query sem campos usam `EmptyObjectSchema`. Query plana, nomes exatos, um valor/chave: repetição mesmo com valores iguais → `DUPLICATE_QUERY`; `date[]` é desconhecida. Query desconhecida (inclusive `patientId` em `/me/*`) → `400` após auth/perfil. Sem filtros implícitos de status, busca, intervalo, sort ou paginação.
- `NoBodySchema` exige ausência/zero bytes (`undefined` na fronteira), inclusive GETs, cancel e publish; qualquer corpo não vazio, inclusive `{}`, `null`, array ou string → `UNEXPECTED_BODY`, antes de Content-Type/JSON. O servidor pode encerrar a conexão após entregar a resposta, sem consumir indefinidamente um corpo não finalizado.
- Rotas com corpo exigem `Content-Type: application/json`, aceitando `charset=utf-8`. Outro tipo com corpo não vazio → `INVALID_FORMAT`, `location: "body"`, `path: []`, antes de parse; JSON malformado → `INVALID_JSON`. Ausência e agregação seguem §7.1.
- Método/rota não definido → `404 NOT_FOUND`, sem operação alternativa. Inesperado → `500 INTERNAL_ERROR`; somente health usa `503 INTERNAL_ERROR` por indisponibilidade do banco.
- API usa `select` explícito e DTO validado, nunca entidade Prisma crua. Falha no schema de saída → `500`, não `400` do cliente nem fallback com entidade.

## 2. Valores, normalização e DTOs exatos

Cada `NomeSchema` também define o tipo `Nome` (§8). As tabelas listam **todos** os campos: `?` = propriedade opcional; `| null` = obrigatória e anulável; demais campos são obrigatórios/não nulos. Comprimentos contam unidades UTF-16 (`String.length`). Zod 4.6 usa pontos de código em min/max/length: aplicar explicitamente os limites UTF-16 do contrato, sem mudar a regra ao atualizar a biblioteca.

### 2.1 Primitivos
| Schema | Definição normativa |
|---|---|
| `UUIDSchema` | String UUIDv4 `8-4-4-4-12`, versão `4`, variante `8`/`9`/`a`/`b`; aceita hex maiúsculo/minúsculo e normaliza para minúsculo, sem trim. Saída minúscula. |
| `UtcDateTimeSchema` | String gregoriana existente, exata `YYYY-MM-DDTHH:mm:ss.SSSZ`, ano `0001`…`9999`, segundos `00`…`59`. Sem offset, data sem hora, fração omitida/extra ou rollover; precisão de milissegundos. |
| `LocalDateSchema` | String gregoriana existente `YYYY-MM-DD`, ano `0001`…`9999`; dia civil de `America/Sao_Paulo`, não instante UTC. Sem hora/espaços/rollover (`2026-02-30` é inválida). |
| `EmailSchema` | String, trim + minúsculas, comprimento 1…254, expressão `^[^\s@]+@[^\s@]+\.[^\s@]+$`. Validação simples das contas cadastradas, sem cadastro público ou verificação de entrega. |
| `TokenSchema` | String compacta de três segmentos base64url não vazios, sem espaços: `^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$`. Estrutura não comprova assinatura/autenticidade. |
| `RoleSchema` | `STAFF` ou `PATIENT`. |
| `AppointmentStatusSchema` | `SCHEDULED` ou `CANCELED`. |
| `ReportStatusSchema` | `DRAFT` ou `PUBLISHED`. |
| `ExamTypeCodeSchema` | `XRAY`, `ULTRASOUND` ou `MRI`, catálogo fixo (RN-05). |
| `SlotUnavailableReasonSchema` | `PAST` ou `TAKEN`. |

Título, corpo e profissional recebem trim nativo JavaScript **antes** dos limites no formulário/MSW/API; preservar espaços internos, quebras e texto literal. Sem HTML ou validação clínica. E-mail só recebe a normalização acima; senha não recebe trim, mudança de caixa ou outra transformação.

### 2.2 Objetos reutilizados
| Schema | Campos exatos e restrições |
|---|---|
| `EmptyObjectSchema` | Objeto sem propriedades. |
| `NoBodySchema` | Ausência HTTP, não objeto JSON (§1). |
| `IdParamsSchema` | `id: UUID`; identifica paciente, agendamento ou laudo conforme a rota, sem converter recursos. |
| `UserSchema` | `id: UUID`, `name: string` não vazia, `email: Email`, `role: Role`. |
| `PatientSchema` | `id: UUID`, `name: string` não vazia, `email: Email`, `active: boolean`; somente PATIENT, sem role/hash no DTO. |
| `PatientSummarySchema` | `id: UUID`, `name: string` não vazia. |
| `ExamTypeSchema` | `id: UUID`, `code: ExamTypeCode`, `name: string` não vazia. |
| `ExamTypeSummarySchema` | `id: UUID`, `name: string` não vazia. |
| `ExamTypeNameSchema` | `name: string` não vazia. |
| `ReportSummarySchema` | `id: UUID`, `status: ReportStatus`; sem texto. |
| `StaffAppointmentSchema` | `id: UUID`, `startsAt: UtcDateTime`, `status: AppointmentStatus`, `patient: PatientSummary`, `examType: ExamTypeSummary`, `report: ReportSummary \| null`. CANCELED nunca contém resumo PUBLISHED. Mesmo shape em criação/lista/detalhe/cancelamento. |
| `StaffReportSchema` | `id: UUID`, `appointmentId: UUID`, `title: string` 3…120, `body: string` 10…10.000, `professionalName: string` 3…120, `status: ReportStatus`, `publishedAt: UtcDateTime \| null`, `updatedAt: UtcDateTime`. União discriminada: DRAFT exige publicação nula; PUBLISHED exige não nula. Textos normalizados por RN-16. |
| `MyAppointmentSchema` | `id: UUID`, `startsAt: UtcDateTime`, `status: AppointmentStatus`, `examType: ExamTypeSummary`, `hasPublishedReport: boolean`. CANCELED exige false. Sem paciente, resumo/id/status de laudo ou indício de rascunho. |
| `PublishedPatientReportSchema` | `title: string` 3…120, `body: string` 10…10.000, `professionalName: string` 3…120, `publishedAt: UtcDateTime` não nulo, `examType: ExamTypeName`, `startsAt: UtcDateTime`. Sem `id`, `appointmentId`, `status`, `updatedAt` ou paciente. |
| `SlotSchema` | União por `available`: `{startsAt: UtcDateTime, available: true}` **sem** reason; ou `{startsAt: UtcDateTime, available: false, reason: SlotUnavailableReason}` obrigatório. |
| `UtcRangeSchema` | `from: Date`, `to: Date`, instâncias válidas e `from < to`; intervalo interno `[from, to)` para tempo/where, nunca DTO HTTP. Independente do fuso do host; fim exclusivo pode chegar ao ano 10000 sem ampliar o formato HTTP. |

### 2.3 Requests e respostas agregadas
| Schema | Definição completa |
|---|---|
| `HealthResponseSchema` | `status: "ok"`, `db: "ok"`; somente sucesso 200. |
| `LoginRequestSchema` | `email: Email`, `password: string` com mínimo 1, sem normalização. |
| `LoginResponseSchema` | `token: Token`, `user: User`; sem expiresIn, refresh token ou cookie de sessão. |
| `JwtClaimsSchema` | `sub: UUID`, `role: Role`, `name: string` não vazia, `iss: "drlaudo-api"`, `iat: number` inteiro seguro não negativo (segundos Unix), `exp: number` inteiro seguro com `exp = iat + 28800`. Sem outros claims; payload JWT, não resposta HTTP. |
| `PatientListResponseSchema` | `Patient[]`, inclusive vazio. |
| `CreatePatientRequestSchema` | `name: string` 3…120 unidades UTF-16 após trim; `email: Email`; `password: string` literal com mínimo 8 unidades UTF-16 e máximo 72 bytes UTF-8. Sem id/role/hash/datas. |
| `UpdatePatientRequestSchema` | `name?`, `email?` e `active?: boolean`; pelo menos um campo presente. Omissão preserva valor; null, undefined presente, password, role e desconhecidos são recusados. |
| `ExamTypeListResponseSchema` | `ExamType[]`, inclusive vazio; sem restrição de comprimento no DTO. Os três códigos do catálogo fixo pertencem ao seed. |
| `SlotQuerySchema` | `date: LocalDate` obrigatório. |
| `SlotsResponseSchema` | `date: LocalDate`, `timezone: "America/Sao_Paulo"`, `slots: Slot[]`; inícios distintos, ordenados e correspondentes à grade desse dia. São 24 em dias normais; omitir posições civis inexistentes em transições históricas IANA (§4.1). |
| `CreateAppointmentRequestSchema` | `patientId: UUID`, `examTypeId: UUID`, `startsAt: UtcDateTime`; sem id/status/duração/sala/laudo. |
| `AppointmentListQuerySchema` | `date?: LocalDate`, `patientId?: UUID`, `scope?: "all"`; scope e date são mutuamente exclusivos. Ausente scope conserva a janela padrão; nenhum outro filtro. |
| `StaffAppointmentListResponseSchema` | `StaffAppointment[]`, inclusive vazio. |
| `CreateReportRequestSchema` | `title: string` 3…120, `body: string` 10…10.000, `professionalName: string` 3…120, após trim; sem status/publishedAt/ids/datas. |
| `UpdateReportRequestSchema` | Mesmos três campos/limites após trim, todos opcionais, **ao menos um presente**. Validar integralmente cada enviado; omissão preserva valor, null não limpa. |
| `MyAppointmentListResponseSchema` | `MyAppointment[]`, inclusive vazio. |

## 3. Registro de rotas e schemas

Params/query não indicados = `EmptyObjectSchema`; body não indicado = `NoBodySchema`. Falhas usam `ErrorResponseSchema` (§7): toda rota admite 400 por entrada proibida/inválida e 500; protegida também 401; role específico também 403. A coluna final acrescenta falhas de negócio.
| Método e rota | Acesso | Params / query / body não vazios | Sucesso | Falhas adicionais; rastreabilidade |
|---|---|---|---|---|
| `GET /health` | Público | — | `200 HealthResponseSchema` | 503 INTERNAL_ERROR; operação |
| `POST /auth/login` | Público | Body `LoginRequestSchema` | `200 LoginResponseSchema` | 401 UNAUTHORIZED, 429 RATE_LIMITED; RF-01/RN-01 |
| `GET /auth/me` | Ambos os roles | — | `200 UserSchema` | —; RF-02/RN-02 |
| `GET /patients` | STAFF | — | `200 PatientListResponseSchema` | —; RF-03/RN-01/03 |
| `POST /patients` | STAFF | Body `CreatePatientRequestSchema` | `201 PatientSchema` | 409 EMAIL_TAKEN; RF-09 |
| `PATCH /patients/:id` | STAFF | Params `IdParamsSchema`; body `UpdatePatientRequestSchema` | `200 PatientSchema` | 404 NOT_FOUND, 409 EMAIL_TAKEN; RF-09 |
| `GET /exam-types` | STAFF | — | `200 ExamTypeListResponseSchema` | —; RF-03/RN-05 |
| `GET /slots` | STAFF | Query `SlotQuerySchema` | `200 SlotsResponseSchema` | —; RF-03/RN-06…10 |
| `POST /appointments` | STAFF | Body `CreateAppointmentRequestSchema` | `201 StaffAppointmentSchema` | 404 NOT_FOUND, 422 INVALID_SLOT/PAST_DATE, 409 SLOT_TAKEN; RF-03/RN-06…10 |
| `GET /appointments` | STAFF | Query `AppointmentListQuerySchema` | `200 StaffAppointmentListResponseSchema` | —; RF-04/RN-03 |
| `GET /appointments/:id` | STAFF | Params `IdParamsSchema` | `200 StaffAppointmentSchema` | 404 NOT_FOUND; RF-06/07, enunciado §4.2 |
| `POST /appointments/:id/cancel` | STAFF | Params `IdParamsSchema` | `200 StaffAppointmentSchema` | 404 NOT_FOUND, 409 CANNOT_CANCEL; RF-05/RN-10…13 |
| `POST /appointments/:id/report` | STAFF | Params `IdParamsSchema`; body `CreateReportRequestSchema` | `201 StaffReportSchema` | 404 NOT_FOUND, 409 APPOINTMENT_CANCELED/REPORT_EXISTS; RF-06/RN-14…17/21 |
| `GET /appointments/:id/report` | STAFF | Params `IdParamsSchema` | `200 StaffReportSchema` | 404 NOT_FOUND; RF-06/07/RN-20 |
| `PATCH /reports/:id` | STAFF | Params `IdParamsSchema`; body `UpdateReportRequestSchema` | `200 StaffReportSchema` | 404 NOT_FOUND, 409 APPOINTMENT_CANCELED/REPORT_LOCKED; RF-06/RN-15/16/18 |
| `POST /reports/:id/publish` | STAFF | Params `IdParamsSchema` | `200 StaffReportSchema` | 404 NOT_FOUND, 409 APPOINTMENT_CANCELED/REPORT_LOCKED; RF-07/RN-15/19/20 |
| `GET /me/appointments` | PATIENT | — | `200 MyAppointmentListResponseSchema` | —; RF-08/RN-04/22/24 |
| `GET /me/appointments/:id/report` | PATIENT | Params `IdParamsSchema` | `200 PublishedPatientReportSchema` | 404 NOT_FOUND; RF-08/RN-04/23/24 |

## 4. Tempo, filtros e precedência

### 4.1 Relógio e grade
- Banco `timestamptz(3)`, API UTC com três casas de milissegundos; calendário/exibição em `America/Sao_Paulo` via IANA, nunca fuso do processo/navegador ou `-03:00` fixo.
- Serviço recebe `clock.now(): Date`; capturar **um now por operação**, após trava/releitura nas mutações travadas e antes de escrever. Usá-lo nas decisões/timestamps; sem now do cliente, relógio global em regra ou nova leitura a cada slot.
- Grade: posições locais `07:00 + i × 30 minutos`, `i = 0…23`, até 18:30; minuto 00/30 e segundos/milissegundos zero. São 24 inícios em dias normais. Decisão explícita da usuária em 2026-11-08: “Somente horários existentes”; omitir posições civis inexistentes por transição histórica IANA (ex.: 1931-10-03 pode ter menos de 24), sem reduzir calendário ou inventar horários por offset. 19:00 é inválido; 18:30 termina 19:00. Sem restrição por dia da semana, feriado ou distância futura; data futura do exame não impede criar/editar/publicar laudo.
- `isPast(startsAt, now)` = `startsAt <= now`, mesmo antes do fim do slot. `/slots` sempre retorna a grade inteira: PAST primeiro; senão TAKEN se existe SCHEDULED naquele instante; senão disponível sem reason. CANCELED não ocupa. Grade é fotografia, não reserva: só índice arbitra INSERT.

### 4.2 Intervalos e ordenação
- Data explícita filtra dia civil inteiro com `startsAt >= from` e `< to`: `date=2026-11-10` → `[2026-11-10T03:00:00.000Z, 2026-11-11T03:00:00.000Z)`. Offset é exemplo dessa data, não regra fixa.
- Sem date nem scope: `[início de hoje local, início local de hoje + 30 dias)`, hoje inteiro + 29 dias, incluindo horários passados de hoje e cancelados. Não `[now, now + 720h]` nem 31º dia. Somar dias civis no fuso; meia-noite em lacuna usa o primeiro instante válido daquele dia.
- Com `now = 2026-11-10T12:00:00.000Z`, janela padrão termina `2026-12-10T03:00:00.000Z` e começa `2026-11-10T03:00:00.000Z`. `9999-12-31` segue aceito; fim interno no ano 10000 é Date, não timestamp HTTP.
- `scope=all` explícito, exclusivo STAFF: remove a restrição temporal e inclui histórico passado/futuro e ambos os estados, mantendo o filtro por patientId e a mesma ordenação/DTO. `scope` com outro valor, vazio, null ou tipo não string → 400. `scope=all` junto com `date` → 400 VALIDATION_ERROR, detalhe `query/date/INVALID_FORMAT`; query duplicada mantém DUPLICATE_QUERY. `/me/*` não aceita scope nem seleção de paciente.
- date/patientId combinam com AND; sem patientId inclui todos. UUID válido sem paciente correspondente ou de STAFF → `200 []`, não 404. STAFF lista ambos os estados e report/resumo ou null, ordenados por `startsAt ASC, id ASC` lexicográfico. `/me/appointments` mantém essa ordem/estados, sem filtros/janela: histórico próprio completo.
- Detalhe STAFF por id independe de janela, filtros, cache, estado, passado/futuro ou existência de laudo. Pacientes/exames: `name ASC, id ASC`, nomes comparados por pontos de código Unicode, sem locale; PostgreSQL UTF-8 usa binário `COLLATE "C"`. Sem busca/paginação.

### 4.3 Ordem dos erros
Mesma ordem observável em MSW/API:
1. Protegida: autenticar 401 → role 403 → parser/validação, **inclusive JSON malformado**; hooks antes da validação automática. Sem consulta de existência para ator sem acesso à rota.
2. Login: limite IP 429 → parse/formato 400 → credencial 401. Health: validar entrada antes da consulta ao banco.
3. Validar todas as partes/normalizar detalhes (§7.1) e retornar 400 antes de ler existência/estado.
4. Criar agendamento: paciente existente PATIENT **e** exame existente (mesmo 404 se qualquer faltar) → grade válida (422 INVALID_SLOT) → `startsAt <= now` (422 PAST_DATE) → INSERT/índice (409 SLOT_TAKEN). Fora da grade e passado vence INVALID_SLOT; válido passado ocupado vence PAST_DATE.
5. Criar laudo: travar/reler agendamento → ausente 404 → CANCELED: APPOINTMENT_CANCELED → laudo existente: REPORT_EXISTS → criar DRAFT. Cancelado com rascunho retorna APPOINTMENT_CANCELED, não REPORT_EXISTS.
6. Editar/publicar: resolver laudo/agendamento → ausente 404 → travar Appointment/reler ambos → CANCELED: APPOINTMENT_CANCELED → não DRAFT: REPORT_LOCKED → alterar, sem verificar horário do exame.
7. Cancelar: travar/reler → ausente 404 → não SCHEDULED ou laudo PUBLISHED: CANNOT_CANCEL → cancelar/preservar rascunho.
8. Singular: após formato/acesso, indisponível ao ator → 404; lista vazia → 200 []. Paciente usa consulta filtrada única/corpo único (§5.16).
Formato precede estado: PATCH vazio de publicado → 400; válido → 409 REPORT_LOCKED. UUID inválido → 400; válido inexistente → 404. Essas distinções independem da existência e não revelam rascunho/recurso alheio.

## 5. Rotas e exemplos íntegros

Acesso/entradas/saídas estão no §3; abaixo só semântica adicional. IDs dos títulos são exemplos fictícios, **não seed**; identidades/conteúdos demo pertencem a ARCHITECTURE, QA a TESTING. Não recalcular exemplos em cada boot.

### 5.1 `GET /health`
API verifica conexão com `SELECT 1`; MSW só simula. Sucesso `{"status":"ok","db":"ok"}`; falha/timeout do banco → 503 INTERNAL_ERROR canônico (§7), sem driver/host/credenciais/SQL.

### 5.2 `POST /auth/login`
- Retornar somente token próprio/User. JWT real HS256, segredo externo `JWT_SECRET`, claims estritos, `iat = floor(clock.now()/1000)`, `exp = iat + 28800` (8 h); sub/role/name vêm do usuário, não do request. Validar algoritmo permitido, assinatura, issuer, claims e expiração (`now >= exp` inválido); não aceitar `alg: none`.
- bcryptjs custo 10, senha literal. E-mail inexistente/senha errada: mesmo 401 canônico, sem details/distinção de campo; comparar hash fictício do mesmo custo no caminho inexistente, evitando atalho de enumeração.
- Limite por IP: janela fixa 60 s desde primeira tentativa, 10 tentativas contando sucesso, credencial e entrada inválidas; 11ª → 429. No fim exato pode começar nova janela. `Retry-After`: segundos restantes inteiros positivos, arredondados para cima. `LOGIN_RATE_LIMIT_MAX` configurável para isolar QA; caso do limite usa valor finito conhecido. Confiar em IP encaminhado só de proxy configurado, nunca X-Forwarded-For arbitrário; uma instância demo não requer Redis.

### 5.3 `GET /auth/me`
Retorna User diretamente, sem wrapper/lista ou seleção de outro usuário; usuário do token removido → 401 canônico.

### 5.4 `GET /patients`
Somente usuários PATIENT, ativos e inativos, sem role no DTO; ordenação §4.2. O catálogo completo atende gestão/histórico; somente ativos são oferecidos no formulário de novo agendamento.

#### Cadastro e edição administrativos
`POST /patients` cria sempre PATIENT ativo, com UUID novo e bcrypt custo10. Não aceita active no input. A senha não sofre trim/alteração, máximo72bytesUTF-8 antes do hash. Retorna id/nome/e-mail/active; sem senha/hash/role. Sem cadastro público.

`PATCH /patients/:id` altera nome/e-mail e/ou atividade de PATIENT. ID inexistente ou de STAFF →404. Preservar id, role, hash, createdAt e vínculos; atualizar active não cancela exames nem bloqueia trabalho STAFF nos laudos existentes. PATCH vazio →EMPTY_PATCH; formato antes de existência. `active:false` desativa e `active:true` reativa com a mesma senha.

E-mail é único entre todas as contas. Conflito real de `User.email` na criação/edição gera `409 EMAIL_TAKEN`; não sobrescrever a conta concorrente nem classificar outra falha Prisma como esse conflito. DTO é validado ainda na transação antes do commit. Listas e seletores recebem os valores atualizados.

Paciente inativo: login retorna401 genérico, inclusive senha correta; verificação do usuário persistido em cada rota autenticada rejeita o token nas próximas requisições com401. Não há promessa de abortar requisição já autorizada/em curso. Reativar permite autenticação novamente. STAFF continua acessando histórico. Criar exame para inativo usa404NOT_FOUND sem insert; a criação e desativação serializam na linha User dentro da transação, sem substituir o índice parcial que arbitra slots. DTOs de sessão/JWT e de agendamentos não recebem active.

### 5.5 `GET /exam-types`
Catálogo fixo sem alteração: XRAY/“Raio-X de tórax”, MRI/“Ressonância de crânio”, ULTRASOUND/“Ultrassonografia de abdome”, nessa ordem por nome. IDs demo em ARCHITECTURE.

### 5.6 `GET /slots?date=2026-11-10`
Date obrigatório; dia passado também retorna a grade inteira indisponível, com a exceção histórica de posições inexistentes de §4.1. Em 2026-11-10 são 24 slots: primeiro UTC `2026-11-10T10:00:00.000Z`, último `2026-11-10T21:30:00.000Z`. Com now `2026-11-10T12:00:00.000Z` e slot 10:30 local ocupado, três **elementos Slot**, não uma resposta truncada:
| Situação | Elemento JSON válido |
|---|---|
| Igual a now (PAST mesmo ocupado) | `{"startsAt":"2026-11-10T12:00:00.000Z","available":false,"reason":"PAST"}` |
| Futuro livre | `{"startsAt":"2026-11-10T12:30:00.000Z","available":true}` |
| 10:30 local ocupado | `{"startsAt":"2026-11-10T13:30:00.000Z","available":false,"reason":"TAKEN"}` |

### 5.7 `POST /appointments`
Criar SCHEDULED sem laudo (`report: null`); paciente deve existir como PATIENT (id STAFF → 404) e exame existir. Precedência §4.3, conflito §6.1; SELECT de disponibilidade não garante exclusão.

### 5.8 `GET /appointments?date=2026-11-10&patientId=22222222-2222-4222-8222-222222222222`
Paciente combina com data ou com scope=all, nunca data e scope juntos. Sem date/scope aplica a janela padrão; modo completo remove apenas o recorte temporal. Ordenação conforme §4.2; report é resumo ou null, nunca texto.

### 5.9 `GET /appointments/77777777-7777-4777-8777-777777777777`
Detalhe sem laudo retorna 200 com `report: null`; não depende da agenda. Editor lê também §5.12: detalhe 404 encerra fluxo; só detalhe confirmado 200/null admite “sem laudo”, e cancelado bloqueia criação/edição/publicação. Resumo existente + leitura falha exige refazer consultas/tratar inconsistência, nunca criar outro laudo ou restaurar dados de outro id. Jornada em PRD.

### 5.10 `POST /appointments/77777777-7777-4777-8777-777777777777/cancel`
Sem body; preserva rascunho só para leitura STAFF. Persiste canceledAt, não o retorna. Repetir → 409 CANNOT_CANCEL; sem desfazer, reutilizar slot exige novo POST/id. Sem restrição de passado ao cancelar; reutilização continua sujeita a PAST_DATE.

### 5.11 `POST /appointments/77777777-7777-4777-8777-777777777777/report`
Somente SCHEDULED; cria DRAFT com `publishedAt: null`, não publica/aceita status. Futuro permitido. Segundo laudo → 409 REPORT_EXISTS mesmo se o primeiro já publicado e agendamento ativo; CANCELED tem precedência.

### 5.12 `GET /appointments/77777777-7777-4777-8777-777777777777/report`
STAFF lê DRAFT/PUBLISHED, inclusive rascunho preservado em cancelado. Agendamento ausente ou sem laudo → 404, nunca `200 null`; detalhe distingue existência sem laudo.

### 5.13 `PATCH /reports/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`
Exemplo parcial válido: `{"body":"Campos pulmonares sem alterações. Exemplo fictício revisado."}`. Omitidos ficam intactos; vazio/branco/null falha. `{}` → EMPTY_PATCH (§7.1). Mesmo valor é edição aceita: atualiza updatedAt e continua DRAFT. Saves serializados, última escrita concluída prevalece por campo enviado; sem versão otimista.

### 5.14 `POST /reports/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/publish`
Sem body; DRAFT em SCHEDULED → PUBLISHED, mesmo com exame futuro; `publishedAt = updatedAt = now`. Repetir → 409 REPORT_LOCKED sem mudar timestamps. Publicado não admite editar/despublicar/excluir. Confirmação irreversível é da UI (PRD), sem campo confirmed nem mudança no request.

### 5.15 `GET /me/appointments`
`patientId = request.user.sub` no where, nunca selecionável. Histórico completo próprio; false não distingue ausência/rascunho. Não enviar dados alheios, objeto paciente ou id/status/texto/metadados de rascunho. STAFF recebe 403, não seleção alternativa de paciente.

### 5.16 `GET /me/appointments/77777777-7777-4777-8777-777777777777/report`
Consulta única combina `appointment.id`, `appointment.patientId = request.user.sub` e report PUBLISHED. Ausente/alheio/próprio sem laudo/próprio DRAFT: mesmo 404 e corpo UTF-8 **byte a byte** (§7), sem detalhes/ids/cabeçalho que diferencie casos. Correlação, se exposta, só em cabeçalho comum a todas as respostas; sem promessa de igualdade de latência.

## 6. Consistência, transações e segurança

### 6.1 Ownership e locks
User é identidade; Appointment.patientId referencia PATIENT; ExamType é catálogo; Report.appointmentId único pertence ao agregado Appointment. Modelo/migrations em ARCHITECTURE, sem mudança física pelo detalhe STAFF.
| Operação | Garantia obrigatória na API real |
|---|---|
| Criar agendamento | INSERT com `appointment_active_slot_unique`, único em startsAt WHERE status = 'SCHEDULED'; P2002 **desse índice** → 409 SLOT_TAKEN, nunca SELECT/INSERT como proteção. |
| Criar laudo | Transação interativa; `SELECT id FROM "Appointment" WHERE id = $1::uuid FOR UPDATE` com parâmetro vinculado; reler status/laudo na mesma transação. Unique Report.appointmentId; P2002 **dessa chave** → 409 REPORT_EXISTS. |
| Cancelar | Mesma trava/transação, validar SCHEDULED/ausência de PUBLISHED após releitura; gravar CANCELED/canceledAt = now, preservar rascunho intocado. Slot libera só no commit. |
| Editar/publicar | Resolver appointmentId sem mudar vínculo; travar primeiro Appointment e reler ambos na transação antes de estado/escrita. Sem reparenting/deleção nem confiar na leitura pré-trava. |
Criar/editar/publicar laudo e cancelar agendamento usam ordem **Appointment primeiro**, não trava exclusiva só de Report; criar agendamento trava **User** para serializar com a desativação administrativa. READ COMMITTED basta. Transação curta, sem chamada externa/espera de UI; sucesso só após commit, falha reverte tudo. Não introduzir SERIALIZABLE/retry automático/fila. P2002 desconhecido → 500 sanitizado, não conflito genérico.
- Cancelar × publicar: cancelar vence → APPOINTMENT_CANCELED; publicar vence → CANNOT_CANCEL; nunca CANCELED + PUBLISHED.
- Editar × publicar: edição anterior pode ser incorporada; publicação anterior → REPORT_LOCKED na edição. Criar laudo × cancelar: DRAFT nasce e é preservado/bloqueado, ou criação falha ao reler CANCELED; nunca criar após observá-lo na seção crítica.
- Sem chave de idempotência: repetição de criação sujeita a índice/unique; cancel/publish seguem conflitos. Após transporte incerto, refazer leituras antes de nova tentativa, sem retry automático de mutação.
- `publishedAt`/`updatedAt` usam escrita explícita do clock injetado, inclusive com `@updatedAt`; depois de publicar nenhuma rota altera campos/timestamps.

### 6.2 Segurança e limite do mock
API é autoridade de JWT/perfil/ownership/unicidade/transições; guard de UI não substitui backend. `/me/*` filtra sub e, para laudo, PUBLISHED no where; não reutiliza DTO STAFF. Nunca expor passwordHash, senha, token alheio, stack, SQL ou rascunho indevido; logs não registram token nem conteúdo clínico.
MSW executa os mesmos schemas/códigos/filtros/normalizações/estados, mas token/locks/índices são falsos. Token compacto/expiração simulados exercitam UI, nunca autenticam backend nem provam cenários finais/corridas. Ativação só `import.meta.env.DEV && import.meta.env.VITE_API_MOCKING === 'true'`, import dinâmico de mocks fora de mocks somente em main.tsx; sem mocks/worker em produção (ARCHITECTURE).
Segredos JWT/URLs de banco são externos; repositório só nomes/exemplos sanitizados. Logs estruturados: reqId, método, rota parametrizada, status, duração e ErrorCode; redaction de Authorization/senha/token, sem corpo clínico. Health não expõe topologia. Taxa/erro/latência pelos logs bastam à demo; sem SLA numérico ou demanda de tracing distribuído/réplica/partição/Redis. Operação detalhada em ARCHITECTURE.

### 6.3 Sessão e cache no frontend
- Persistir só LoginResponse em localStorage `drlaudo.session`, não RTK Query/listas/laudos/formulários clínicos. Logout local apaga sessão; sem endpoint de revogação por logout, o JWT pode autenticar por até 8 h enquanto a conta estiver ativa. Desativação é verificada no banco em cada nova requisição autenticada e retorna 401. No F5 validar estrutura + `/auth/me` antes de telas/consultas privadas; decode sub/role é UX, não autorização.
- Inválida/expirada ou 401: limpar/ir ao login. Rede/500 ao validar sessão: erro com retry, sem dados privados antigos ou supor login válido. Logout/troca/substituição de sessão/evento storage: abortar/ignorar requests anteriores, limpar seleção/filtros/formulários, `api.util.resetApiState()`; resposta tardia não repovoa cache/tela, nem cache STAFF atende portal.
- Tags: `Appointment`, `Slot`, `Report`, `MyAppointment` e `Patient`. Criar/cancelar invalida listas/detalhes Appointment e Slot; criar/editar/publicar invalida Report e Appointment correspondente; publicar também MyAppointment na sessão que o possuir. Criar/editar paciente invalida Patient e os dados de agendamentos que exibem seu nome. Eventos reais de foco/reconexão estão ligados ao store; sem polling/notificação entre atores.
- SLOT_TAKEN: refazer slots/agenda, manter paciente/exame/data, limpar só slot perdido. Conflitos de laudo/cancelamento: refazer detalhe/laudo, preservar texto não salvo em memória e mostrar estado atual/bloqueado, sem reenvio/sobrescrita automática. Transporte não apaga formulário; jornada em PRD.
- Paciente 404 mostra `Não encontramos este registro`; trocar id limpa visualização anterior antes da leitura. Schema de resposta inválido é indisponibilidade, nunca vazio/sucesso/autorização.
- `view=calendar` e `calendarDate=YYYY-MM-DD` pertencem somente às URLs de tela STAFF. A agenda valida o contexto visual e consulta a API com `scope=all`/patientId; nunca envia esses parâmetros extras aos schemas HTTP. O retorno de login/laudo preserva apenas contexto visual válido.
- `returnTo` em `/agendamentos/novo` é contexto client-only para abandonar o formulário e voltar exclusivamente a uma URL interna `/agenda` validada. Data/paciente da criação e retorno da origem são independentes; o formulário não pré-seleciona paciente/exame. Esse campo não integra o POST de agendamento nem amplia o contrato HTTP.
- `appointmentStatus=SCHEDULED|CANCELED` e `reportStatus=NONE|DRAFT|PUBLISHED` são filtros visuais STAFF opcionais; ausência significa Todos. A UI aplica AND à lista autorizada e à grade, sem enviar esses parâmetros à API. URLs, histórico, login e retorno do laudo/criação preservam valores válidos. Rascunhos de cancelados continuam consultáveis quando a combinação os seleciona; não há novo estado clínico nem mudança em `/me/*`.

## 7. Erros

`ErrorCodeSchema` / `ErrorCode`: **somente 14 códigos** abaixo. Envelope strict `{"error": ...}`, message canônica sem interpolação. Só VALIDATION_ERROR tem details não vazios; demais **omitem** details (não null/array/objeto vazio). Sem requestId/data/causa/stack/recurso no corpo.
| Status | Code | Message canônica | Condição |
|---|---|---|---|
| 400 | `VALIDATION_ERROR` | `Os dados informados são inválidos.` | Entrada inválida, com details. |
| 401 | `UNAUTHORIZED` | `Autenticação necessária ou credenciais inválidas.` | Token ausente/inválido/expirado ou credencial incorreta. |
| 403 | `FORBIDDEN` | `Você não tem permissão para esta ação.` | Role não autorizado. |
| 404 | `NOT_FOUND` | `Não encontramos este registro` | Ausente/indisponível, inclusive quatro casos opacos. |
| 409 | `SLOT_TAKEN` | `Este horário acabou de ser ocupado.` | Índice de slot ativo. |
| 409 | `EMAIL_TAKEN` | `Este e-mail já está cadastrado.` | Unique de e-mail na administração de pacientes. |
| 409 | `REPORT_EXISTS` | `Este agendamento já possui um laudo.` | Laudo único existente. |
| 409 | `REPORT_LOCKED` | `Este laudo foi publicado e não pode ser alterado.` | Editar/republicar publicado. |
| 409 | `CANNOT_CANCEL` | `Este agendamento não pode ser cancelado.` | Cancelado ou com publicado. |
| 409 | `APPOINTMENT_CANCELED` | `Não é possível criar, editar ou publicar laudo de um agendamento cancelado.` | Mutação de laudo em cancelado. |
| 422 | `PAST_DATE` | `Escolha um horário que ainda não começou.` | Slot válido com início <= now. |
| 422 | `INVALID_SLOT` | `Escolha um horário da grade, entre 07:00 e 18:30.` | Fora da grade ou segundos/ms não zero. |
| 429 | `RATE_LIMITED` | `Muitas tentativas de login. Tente novamente em instantes.` | Limite de login. |
| 500; 503 só health | `INTERNAL_ERROR` | `Não foi possível concluir a solicitação.` | Inesperado; banco indisponível no health. |
Corpo compacto canônico NOT_FOUND, inclusive STAFF:
```json
{"error":{"code":"NOT_FOUND","message":"Não encontramos este registro"}}
```

### 7.1 Detalhes de validação
`ValidationLocationSchema` / `ValidationLocation`: `params`, `query`, `body`. `ValidationRuleSchema` / `ValidationRule`: somente as dez regras e mensagens seguintes.
| Rule | Message exata | Uso |
|---|---|---|
| `REQUIRED` | `Campo obrigatório.` | Propriedade/objeto obrigatório ausente. |
| `INVALID_TYPE` | `Tipo de valor inválido.` | Tipo errado/null indevido; corpo requerido deve ser objeto. |
| `INVALID_FORMAT` | `Formato de valor inválido.` | UUID/instante/data/e-mail/Content-Type. |
| `TOO_SHORT` | `Valor menor que o limite permitido.` | Abaixo do mínimo após normalizar. |
| `TOO_LONG` | `Valor maior que o limite permitido.` | Acima do máximo. |
| `UNKNOWN_FIELD` | `Campo não permitido.` | Propriedade/chave fora do schema. |
| `EMPTY_PATCH` | `Informe ao menos um campo.` | Nenhum campo editável reconhecido presente; três campos em laudos ou em pacientes (name, email, active). |
| `UNEXPECTED_BODY` | `Não envie corpo nesta requisição.` | Corpo não vazio em rota sem corpo. |
| `INVALID_JSON` | `Envie JSON válido.` | Falha sintática do parser. |
| `DUPLICATE_QUERY` | `Informe este parâmetro uma única vez.` | Query repetida. |
`ValidationIssueSchema` / `ValidationIssue`: strict `{location: ValidationLocation, path: string[], rule: ValidationRule, message: string canônica da rule}`. Segmentos literais, sem índices numéricos/caminho pontuado (entradas planas); `[]` = parte inteira, `[""]` = chave vazia desconhecida. Não repetir valores, senha ou texto clínico.
`ErrorResponseSchema` / `ErrorResponse`: união strict de `error: {code: "VALIDATION_ERROR", message: "Os dados informados são inválidos.", details: ValidationIssue[]}` com ≥1 item, ou `error: {code: ErrorCode exceto VALIDATION_ERROR, message: canônica do code}`, **sem** details.
- Normalizar, nunca expor ZodError.issues/mensagens de framework. Ordenar por location (params → query → body), path lexicográfico por segmentos (raiz primeiro), rule lexicográfica; comparar strings por pontos de código Unicode, sem locale; remover duplicatas exatas.
- Campo conhecido: ausente → só REQUIRED; tipo errado → só INVALID_TYPE; string → normalizar → limite inferior/superior → formato se comprimento válido; só primeira falha por campo. Objeto correto acumula falhas conhecidas + um UNKNOWN_FIELD por chave desconhecida.
- PATCH sem campo reconhecido também emite EMPTY_PATCH em `[]`: `{}` só EMPTY_PATCH; só desconhecido gera EMPTY_PATCH + UNKNOWN_FIELD. Body ausente → REQUIRED, não EMPTY_PATCH; null/array → INVALID_TYPE. Campo presente inválido não é omitido.
- Query duplicada vence todas as regras **dessa chave**, inclusive UNKNOWN_FIELD: só DUPLICATE_QUERY, sem validar valores. Com body: ausência → Content-Type → JSON → tipo/objeto/campos. JSON malformado: só INVALID_JSON em body, podendo agregar params/query independentes após auth/perfil. Sem body: conteúdo não vazio só UNEXPECTED_BODY em body, sem parse.
Exemplo completo de resposta ao PATCH `{}`:
```json
{"error":{"code":"VALIDATION_ERROR","message":"Os dados informados são inválidos.","details":[{"location":"body","path":[],"rule":"EMPTY_PATCH","message":"Informe ao menos um campo."}]}}
```

## 8. Exports de `packages/contract`

Única superfície pública: `packages/contract/src/index.ts`; exportar cada schema e tipo sem sufixo Schema, derivado de `z.infer<typeof NomeSchema>`, sem interfaces HTTP paralelas. Formulários usam `z.input<typeof CreateReportRequestSchema>`, `z.input<typeof UpdateReportRequestSchema>` ou `z.input<typeof LoginRequestSchema>` quando distinguirem entrada/transformação.

### 8.1 Inventário fechado de schemas/tipos
47 schemas/tipos; caminhos relativos a `packages/contract/src/`:
| Arquivo | Schemas exportados |
|---|---|
| `enums.ts` | `RoleSchema`, `AppointmentStatusSchema`, `ReportStatusSchema`, `ExamTypeCodeSchema`, `SlotUnavailableReasonSchema` |
| `schemas/common.ts` | `UUIDSchema`, `UtcDateTimeSchema`, `LocalDateSchema`, `EmailSchema`, `TokenSchema`, `EmptyObjectSchema`, `NoBodySchema`, `IdParamsSchema`, `UtcRangeSchema` |
| `schemas/auth.ts` | `UserSchema`, `LoginRequestSchema`, `LoginResponseSchema`, `JwtClaimsSchema` |
| `schemas/patients.ts` | `PatientSchema`, `PatientSummarySchema`, `PatientListResponseSchema`, `CreatePatientRequestSchema`, `UpdatePatientRequestSchema` |
| `schemas/exam-types.ts` | `ExamTypeSchema`, `ExamTypeSummarySchema`, `ExamTypeNameSchema`, `ExamTypeListResponseSchema` |
| `schemas/slots.ts` | `SlotSchema`, `SlotQuerySchema`, `SlotsResponseSchema` |
| `schemas/appointments.ts` | `ReportSummarySchema`, `StaffAppointmentSchema`, `CreateAppointmentRequestSchema`, `AppointmentListQuerySchema`, `StaffAppointmentListResponseSchema` |
| `schemas/reports.ts` | `StaffReportSchema`, `CreateReportRequestSchema`, `UpdateReportRequestSchema` |
| `schemas/me.ts` | `MyAppointmentSchema`, `MyAppointmentListResponseSchema`, `PublishedPatientReportSchema` |
| `schemas/health.ts` | `HealthResponseSchema` |
| `errors.ts` | `ErrorCodeSchema`, `ValidationLocationSchema`, `ValidationRuleSchema`, `ValidationIssueSchema`, `ErrorResponseSchema`; mapas readonly `ERROR_MESSAGES`, `VALIDATION_MESSAGES`, pares exatos do §7 |
Sem schemas por handler ou DTO paciente ampliado. ReportSummary fica em appointments sem importar DTO completo de laudo, evitando ciclo.

### 8.2 Constantes e funções puras
`constants.ts` exporta, sem aliases:
- `CLINIC_TZ = "America/Sao_Paulo"`, `SLOT_MINUTES = 30`, `OPENING_HOUR = 7`, `CLOSING_HOUR = 19`, `DEFAULT_AGENDA_DAYS = 30`.
- `JWT_ISSUER = "drlaudo-api"`, `SESSION_DURATION_SECONDS = 28800`, `LOGIN_RATE_LIMIT_MAX = 10`, `LOGIN_RATE_LIMIT_WINDOW_SECONDS = 60`.
`slots.ts` é a única implementação de tempo consumida por mock/API:
| Assinatura exata | Resultado |
|---|---|
| `generateDaySlots(date: LocalDate): readonly UtcDateTime[]` | Instantes existentes da grade civil, normalmente 24, UTC ascendentes; omitir posições inexistentes em transição IANA, sem clock/banco. |
| `isValidSlot(instant: UtcDateTime): boolean` | Grade local, inclusive segundos/ms zero; sem avaliar passado. |
| `isPast(instant: UtcDateTime, now: UtcDateTime): boolean` | `instant <= now`. |
| `localDayRange(date: LocalDate): UtcRange` | Dia civil local, limites UTC `[from, to)`. |
| `defaultAgendaRange(now: UtcDateTime): UtcRange` | Hoje local até hoje + 30 dias locais, exclusivo. |
Entradas já validadas, sem arredondamento de inválidos, dependência de `process.env.TZ` ou relógio global. Services fornecem now via `clock.now().toISOString()`; disponibilidade combina ocupação com a precedência §4.1.

### 8.3 Ordem de construção e evidência exigida
O fluxo técnico é contrato → consumidores → provas de integração e E2E reais. Executar schemas nas fronteiras; mutações validam DTOs dentro da transação antes do commit. Services recebem `{ prisma, clock }`, sem Fastify. Aprovações humanas e publicação não são concedidas por este documento.
Seed é dado fictício estável: contas/catálogo de ARCHITECTURE, datas relativas só no primeiro create; upsert por UUID com update vazio preserva horários, cancelamentos, textos, senha e publishedAt existentes. Não resetar no boot. QA cria massa isolada/clock fixo, não usa exemplos/estado mutável da demo; procedimento nos documentos responsáveis.

## 9. Registro de decisões e limites da evidência

Decisões existentes: D-01/02/10/17/21 (REST/fronteiras), D-22 (tempo), D-23 (detalhe), D-24/32/33 (strict/DTO/erro), D-04/05/09/28 (concorrência), D-11/25/36 (sessão/auth), em [DECISIONS](DECISIONS.md). Nenhum novo ADR ou plano executável é criado aqui.
Fontes: DESAFIO §§3–5; PRD RF/RN; AGENTS; ARCHITECTURE; DECISIONS; TESTING. Referências do desenho, sem nova pesquisa: [índices parciais](https://www.postgresql.org/docs/16/indexes-partial.html), [travas de linha](https://www.postgresql.org/docs/16/explicit-locking.html#LOCKING-ROWS).
As provas atuais e suas limitações estão em TESTING. JWT, autorização direta, alvo QA, índices/locks, isolamento, build de produção e jornadas reais precisam ser verificados na entrega; registros históricos de uma etapa não substituem esse gate.

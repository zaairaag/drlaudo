# Decisões — Dr. Laudo

**Estado:** contrato, frontend, API/PostgreSQL e entrega Docker/E2E implementados; provas e limitações em [TESTING](TESTING.md). Demo pública implantada em 2026-11-09 por autorização específica. Autoridade: [DESAFIO](DESAFIO.md) → [PRD](PRD.md); comportamento no PRD, wire contract em [API](API.md), mecanismo em [ARCHITECTURE](ARCHITECTURE.md). As decisões datadas preservam o histórico; não descrevem todas o estado atual nem concedem novas autorizações.

## Registro
**D-01 — npm workspaces.** Um repositório/install e contrato compartilhado, sem Nx/Turborepo. A contém contract/web; API só B e E2E só C. Não criar workspaces vazios.

**D-02 — Fastify 5.** Schema-first e app.inject sem porta reduzem montagem de HTTP/testes. Express exigiria composição manual; NestJS é excessivo para o desafio.

**D-03 — PostgreSQL 16 + Prisma.** Índice parcial, lock de linha, migrations e tipos. SQLite esconderia a concorrência que precisa ser comprovada.

**D-04 — Índice parcial arbitra slot.** SELECT antes do INSERT tem corrida. appointment_active_slot_unique protege startsAt só em SCHEDULED; P2002 desse alvo vira SLOT_TAKEN. Cancelados não ocupam a chave.

**D-05 — Trava comum contra write skew.** Cancelar muda Appointment e publicar muda Report; updates condicionais separados não bastam em READ COMMITTED. Cancelar/criar/editar/publicar travam primeiro Appointment na mesma transação e releem. SERIALIZABLE foi descartado para não exigir retries globais.

**D-06 — 404 opaco no paciente.** 403 confirmaria existência. Alheio, inexistente, sem laudo e DRAFT usam o mesmo corpo 404, sem indícios em DTO/UI; não é promessa de latência igual.

**D-07 — Expediente 07:00–19:00.** Enunciado fixa uma sala/30min, mas não expediente. Adotado último início18:30, todos os dias. Multi-sala e eventual chave roomId/startsAt são evolução, não escopo atual.

**D-08 — Laudo antecipado permitido.** Preparar modelo antes do exame não é proibido no enunciado. Horário futuro também não impede publicação; estado/validação continuam obrigatórios.

**D-09 — Cancelar com DRAFT preserva histórico.** Conteúdo fica bloqueado para leitura STAFF. Publicado impede cancelar porque o resultado já foi disponibilizado.

**D-10 — POST para ações.** cancel/publish expressam transições com guardas, sem PATCH genérico de status ou campo confirmed no contrato.

**D-11 — JWT em localStorage, somente demo.** Simplicidade e ausência de cookie reduzem CSRF tradicional, não XSS. React escapado, sem HTML clínico, CSP C,8h/reset mitigam. Logout não revoga JWT. Dados clínicos reais exigem novo desenho (httpOnly/SameSite, CSRF, renovação/revogação), privacidade e autorização.

**D-12 — Redux Toolkit/RTK Query.** Diferencial da vaga e cache/invalidação centralizados. Slices só sessão/filtros efêmeros; estado de servidor não vira cópia persistida.

**D-13 — shadcn/Radix, Tailwind4, OKLCH.** Componentes próprios e primitivas acessíveis; labels/foco/teclado/contraste continuam responsabilidade da aplicação. Escalas perceptuais não comprovam AA: WebAIM medido, axe e revisão manual precedem alegação.

**D-14 — Integração contra Postgres real.** Mocks esconderiam índice/trava/transação. B usa drlaudo_test separado e limpeza por arquivo; MSW A prova apenas contrato/UX simulados.

**D-15 — Playwright na C, opção Docker.** Facilita executar E2E sem navegador instalado no host. Se imagem oficial for usada, biblioteca/imagem têm versão exatamente igual, conferida na fase; modo local continua disponível.

**D-16 — Clock injetado.** Passado/timestamps determinísticos sem fake timers globais interferindo no driver. Capturar now após lock/releitura nas transições.

**D-17 — /api relativa em todas as fases.** MSW A, proxy Vite B, Nginx/Traefik C quando incluídos; mesma origem e telas intactas ao trocar transporte.

**D-18 — Docker opcional, infra adiada.** Enunciado não exige container. CI/E2E são C; Compose/Nginx/Traefik opcionais posteriores. Instruções sem Docker são obrigatórias; deploy/extras são cortados antes de regras/testes.

**D-19 — Seed idempotente por UUID.** .test é reservado (RFC2606/6761). Transação com update vazio preserva alterações; datas/hash/textos só no create. Repetir não move, republica ou reseta senha. Boot do servidor só conecta; migration/seed são passos explícitos do launcher/Compose; procedimento em [ARCH §9](ARCHITECTURE.md#9-seed-e-qa).

**D-20 — Escopo fechado.** PDF/anexos/DICOM/recuperação/multi-sala/notificações/dark mode ficam fora, junto às demais exclusões do PRD. Evolução não é entrega prometida.

**D-21 — Frontend first sobre MSW/contract.** Validar uso antes do backend. Zod/erros/enums/tempo únicos em contract, schemas executados por consumidores. Mock fiel às RNs/API, descartável/dev-only/isolado; tipos sozinhos não provam paridade. Gate A explícito da responsável de produto precede B; MSW não substitui backend/Postgres final.

**D-22 — Dias civis e precisão.** Janela padrão [hoje local,hoje+30dias), não720h; data explícita cobre um dia. UTC em ms, slot segundos/ms zero e startsAt>now; PAST vence TAKEN. IANA/clock/helpers únicos, nunca offset fixo. Ordenação/desempate são de API §4.

**D-23 — Detalhe STAFF independente.** GET appointments/:id com DTO STAFF/report:null, sem janela/cache, permite URL/F5 sem laudo ou registro antigo. GET report continua404. Rejeitada lista/cache como prova de existência ou mudança para200null.

**D-24 — Strict e precedência única.** Desconhecidos são rejeitados, inclusive identidade indevida em /me. Trim antes de RN-16; PATCH não vazio/sem null. Auth→perfil→formato→existência→estado/tempo→escrita. Detalhes determinísticos de API §7 não ecoam valores ou internals.

**D-25 — Sessão delimita cache.** Só LoginResponse em drlaudo.session; RTK Query em memória. F5 valida auth/me antes de dado privado, sem renovar expiração. Logout/expiração/troca/storage abortam, avançam geração e limpam cache/slices/formulários; resposta anterior é ignorada. URL guarda filtros recuperáveis; HTTP no-store.

**D-26 — Demo estável, QA independente.** Três contas/exames, cinco agendamentos e dois laudos fixos. Colisão externa aborta sem apagar/consertar. Não deslocar publicado no boot para parecer futuro; QA tem fixtures próprias/clock fixo.

**D-27 — Salvar explicitamente antes de publicar.** Sem save+publish oculto, autosave, texto clínico em storage, edição/exclusão/despublicação de publicado. Exame futuro continua permitido; cancelado preserva DRAFT só leitura STAFF.

**D-28 — Reconciliação, não retry.** Cancelar repetido→CANNOT_CANCEL; publicar repetido→REPORT_LOCKED. Conflito/timeout exige leitura antes de nova ação, mantendo formulário sem sobrescrita silenciosa. Sem idempotency key/retry genérico; DRAFT última gravação vence (DT-02).

**D-29 — Direção A-1 agrupa F-01/F-02.** Setup sozinho não tem prova de produto. Primeiro comportamento de contrato acompanha o tooling; restante fecha contrato antes do mock. Manter ambos IDs e TDD real, sem teste tautológico/passWithNoTests/skip. Agrupamento depende de revisão do futuro Tasks TLC, não libera execução.

**D-30 — Documento não é autorização.** Spec/plano solicitado não significa conteúdo aprovado. Aprovação humana precede implementação; Gate A precede B; commit/push, banco destrutivo e produção têm alçada própria. Três dias de entrega/teto1,5dia A não são horas dedicadas. Previsão de check não é resultado.

**D-31 — Ambientes independentes.** Sem Docker obrigatório; QA drlaudo_test nunca demo/produção. Guarda recusa URL principal ou banco fora da allowlist antes de truncar. Docker QA drlaudo-qa não monta volume demo. Criação/migration/limpeza exigem alvo conhecido e autorização.

**D-32 — Select/DTO e schema de saída.** API/mock/cliente executam schemas do contrato. PATIENT usa sub no where e PUBLISHED na leitura. Quatro404 canônicos sem details/id/cabeçalho distintivo. Saída inválida falha sanitizada; entidade crua nunca é fallback.

**D-33 — Health503 usa INTERNAL_ERROR.** SELECT1 real; sucesso status/db ok. Falha retorna a mensagem canônica existente, sem DB_ERROR/driver/URL/stack. Não acrescenta código específico de banco; o inventário atual tem 14 ErrorCode após EMAIL_TAKEN (D-47). Mock só simula.

**D-34 — Produção depende de alvo autorizado.** Operador fornece domínio/segredos externos e valida proxy:0local,1Nginx,2Traefik+Nginx sem bypass. A responsável de produto autoriza alvo exato; smoke só leitura. Sem autorização T-21 não executa nem bloqueia entrega local. Noindex não autentica.

**D-35 — Dependência somente com uso.** Registrar fase/pacote, conferir engines/APIs e fixar lockfile antes de instalar autorizado. Sem framework de monorepo, retry/monitoramento/servidor mock extras; sensible desnecessário ao envelope próprio fica fora.

**D-36 — Auth concreta.** bcryptjs custo10, JWT HS256/claims exatos; limiter10tentativas/IP/60s desde primeira, incluindo inválidas/sucesso,11ª429/Retry-After. Limiter antes do parser público; auth/perfil antes do parser privado. Hash fictício equivalente para e-mail ausente,401genérico; sem Redis para uma instância demo.

**D-37 — Fronteiras explícitas.** Feature routes/service/dto separa HTTP, regra/Prisma e select/mapper; services recebem prisma/clock, tipos HTTP só em contract. Tempo recebe UtcDateTime validado; UtcRange usa Dates internos até fim exclusivo ano10000 sem cortar calendário aceito.

**D-38 — Direção B-1 agrupa T-03/T-04.** Health/app dependem de schema/client/banco reais: preparar migration/helpers antes do aceite conjunto, sem banco falso. IDs preservados para revisão do futuro Tasks. npm test API inclui unidade/integração; test:integration só seleciona camada. Gate A/autorização B permanecem.

**D-39 — Env raiz portável.** Vite/API/Prisma resolvem o .env da raiz por caminho do módulo, com variáveis externas prevalecendo; sem cópia por workspace. Scripts usam o contexto do workspace para Prisma e validação estrutural do alvo antes das operações QA. Nunca colocar segredo nos argumentos/logs. [ARCH §10](ARCHITECTURE.md#10-configuração-e-execução).

**D-40 — TLC4.1.0, Specify canônico sem duplicação.** Skill instalada/autorizada e lida por arquivo local, com ferramentas nativas do host; não alegar descoberta automática OMP. docs/PRD.md é alvo aceito pelo validator oficial. Preservar RF/RN, EARS e Draft; sem captura binding inventada, .specs ou novo Tasks aprovado. Desenho e roteiro anteriores são apenas condensados. Coordenação executa gates documentais após integração; nenhum gate, commit ou implementação é autorizado por esta adaptação.

Atualização de estado (2026-11-08): a responsável de produto aprovou o Specify com “pode seguir”, conforme PRD. Menções anteriores a Draft/Tasks futuro em D-29/38/40 descrevem aquela etapa; esta continuação autoriza somente Design/Tasks, não instalação, implementação, banco, testes de aplicação, commit ou publicação. Stack/escopo e decisões herdadas não foram reabertos.

**D-41 — Aprovações nas fontes canônicas.** Manter docs/PRD.md e o plano local docs/TASKS.md, sem aliases/cópias. O --execute da skill consulta nomes fixos spec.md/tasks.md e ignora ausentes; não verifica sozinho as duas aprovações deste repositório. O harness deve conferir diretamente ambas, com data/palavras reais da usuária, além da autorização de escopo/fase. Duplicar documentos para satisfazer o gate foi descartado por criar autoridades concorrentes. Gate A e autorização B permanecem; validação documental nunca libera produto, commit ou push.

**D-42 — Somente horários civis existentes.** Em 2026-11-08, a usuária escolheu “Somente horários existentes” ao resolver a contradição entre grade sempre com 24 posições, IANA e calendário 0001–9999. Transições históricas podem eliminar inícios dentro do expediente (São Paulo em 1931-10-03); omitir essas posições, mantendo 24 em dias normais e sem restringir datas. Fonte: [IANA tzdb southamerica](https://data.iana.org/time-zones/tzdb/southamerica). API/PRD e testes temporais registram a exceção; não inventar horário por offset fixo.

## Limitações e dívida técnica
| ID | Risco / limite | Mitigação e gatilho |
|---|---|---|
| DT-01 | localStorage exposto a XSS; JWT não revogável. | Texto puro/CSP/8h/reset; redesenho obrigatório antes de dados reais. |
| DT-02 | Saves DRAFT multioperador podem sobrescrever. | Última gravação vence; preservar formulário/refazer estado; versionamento só com novo requisito. |
| DT-03 | Demo relativa envelhece. | Não reescrever histórico; QA independente; reset só descartável/autorizado. |
| DT-04 | Sem auditoria clínica, assinatura ou retenção clínica. | Fora do enunciado; vedado uso real sem novo escopo/revisão de privacidade. |
Não é aceitação de risco vermelho. Risco, evidência e eventual aceite explícito seguem para coordenação e responsável de produto, sem segunda fila operacional neste registro.

## Dependências registradas
Registro das dependências adotadas por fase e motivo. Os manifestos e o lockfile definem os pacotes e versões efetivamente entregues; registros de aprovação inicial abaixo são históricos. TLC é ferramenta documental instalada, não dependência runtime do produto.
| Fase | Pacotes / motivo |
|---|---|
| A | typescript, vite, react, react-dom, @vitejs/plugin-react, tipos React/Node; runtime web/strict/build. |
| A compartilhado | zod; date-fns/@date-fns/tz; schemas e tempo IANA, reutilizados na B. |
| A | @reduxjs/toolkit, react-redux, react-router; estado/cache/rotas. |
| A | tailwindcss, @tailwindcss/vite, tw-animate-css; shadcn/Radix, lucide-react, sonner, react-hook-form, @hookform/resolvers, react-day-picker; UI/formulários. |
| A | class-variance-authority, clsx, tailwind-merge; variantes/composição. vite-plugin-svgr; logo. @fontsource-variable/inter, @fontsource-variable/plus-jakarta-sans; fontes locais. |
| A/B | vitest; msw (somente A/dev); @testing-library/react, @testing-library/user-event, @testing-library/dom (peer), @testing-library/jest-dom, jsdom; comportamento/DOM, não layout. |
| A/C | dependency-cruiser; eslint/@eslint/js/typescript-eslint/plugins React Hooks/Refresh/a11y; prettier; fronteiras/lint/formatação, não prova de RN. |
| A/B | concurrently, cross-env, tsx; scripts Windows/Linux/TZ/TS; dev paralelo só quando API existir. |
| B | fastify, @fastify/jwt, @fastify/rate-limit, fastify-type-provider-zod; HTTP/auth/limiter/integração Zod, sem sensible. |
| B | prisma, @prisma/client, bcryptjs, pino-pretty(dev); persistência/hash/log local. |
| C | @playwright/test, @axe-core/playwright; E2E/a11y, imagem igual à versão da biblioteca se Docker incluído. |

Entrega autorizada em 2026-11-09: `@playwright/test` **1.65.0** (Node >=20) e `@axe-core/playwright` **4.14.0** (Node >=22.12.0), consultados no registro npm antes da atualização do lockfile. Node 22.22.2 satisfaz ambos. Dependências de teste do workspace E2E; não entram no runtime clínico. A coordenação executa os gates após a implementação.

T1 autorizada: instalar somente Zod 4.6.7, Vitest 5.1.0, TypeScript 5.9.3, ESLint 10.14.0/@eslint/js 10.0.1, typescript-eslint 8.72.1, dependency-cruiser 18.7.2, Prettier 3.9.10 e @types/node 22.20.5. Versões/engines/peers conferidos no registro npm; Node local 22.22.2 atende ao piso >=22.13 das ferramentas. TypeScript 7.0.2 está fora do peer do typescript-eslint (<6.1); usar 5.9.3. A primeira instalação avisou que ESLint 9.39.5 não tem mais suporte: substituir pelo 10 antes do gate. Vite transitivo do Vitest é ferramenta de teste, não workspace web antecipado. Zod 4.6 mede min/max/length por pontos de código, confirmado na documentação e em execução; refinamentos de String.length preservam os limites UTF-16 da API. Lockfile registra resoluções exatas; nenhum pacote de backend/UI nesta unidade.

**D-43 — Prisma 7 com driver adapter e cliente em TypeScript.** `prisma-client` com `output` em `src/generated/prisma` (ignorado no Git) e `@prisma/adapter-pg` sobre `pg`. O `prisma.config.ts` carrega o `.env` da raiz e aceita placeholder quando só há `generate`. `tsx` executa a API em dev e contêiner porque os imports gerados usam extensão `.ts`; `build` é `tsc --noEmit`. Alternativa descartada: emitir JS com extensão `.js` e manter um segundo caminho de execução.

**D-44 — Autenticação em `onRequest`.** O hook roda antes do parse do corpo, garantindo que `401`/`403` precedam JSON malformado. A role do token é reconferida contra o banco a cada requisição autenticada, então remover ou rebaixar um usuário invalida o token mesmo com assinatura válida.

**D-45 — Conflito `P2002` por nome de restrição.** Com driver adapters o Prisma 7 aninha o alvo em `meta.driverAdapterError.cause.constraint.index`. A classificação lê esse caminho, aceita `meta.target` legado e o nome no texto do erro, sempre comparando com os dois índices conhecidos; qualquer outro `P2002` continua `500` sanitizado.

**D-46 — Suítes serializadas na raiz.** `npm test` encadeia contrato → API → web. Executar workspaces em paralelo fazia a integração com Postgres competir por CPU com o jsdom e estourar esperas de UI por tempo, não por defeito.

**Registro de execução do backend (2026-11-08).** Migration aplicada em PostgreSQL 16, seed idempotente verificado por reexecução e 41 testes de integração cobrindo autenticação, autorização, grade, agendamento concorrente, cancelamento, laudo, imutabilidade, corrida cancelar × publicar e envelope HTTP. Os quatro casos opacos do paciente retornam bytes idênticos. `docker-compose.yml` (demo em `:8080`) e `docker-compose.qa.yml` (QA com `tmpfs`, sem portas) acompanham a entrega.

Novas dependências exigem registro junto da mudança autorizada. As versões da T1 acima são as primeiras instaladas; os manifestos e o lockfile são a fonte atual, não as previsões das fases anteriores.

Fase A completa autorizada em 2026-11-08: conferir/instalar dependências da tabela com uso real. npm confirmou Vite 8.3.6, React/React DOM 19.3.1, plugin-react 6.2.1, Tailwind/plugin 4.3.5, RTK 2.14.0, React Redux 9.3.1, Router 7.18.5 (manter API v7 do desenho, sem migração v8 incidental), MSW 3.0.4, date-fns 4.4.0/tz 1.5.0, Radix unificado `radix-ui` 1.8.1 (primitivas shadcn locais), Lucide 1.70.0, Sonner 2.0.8, RHF 7.91.0/resolvers 7.0.3, Testing Library React 16.3.3/user-event 14.6.8/DOM 10.4.2/jest-dom 7.0.1 e jsdom 31.0.0. Node mínimo sobe a 22.22.2 por jsdom; runtime local já atende. Fontsource Inter/Jakarta 5.3.0; SVGR 5.2.0; CVA 0.7.1/clsx 2.1.1/tailwind-merge 3.7.0/tw-animate-css 1.4.0. Engines/peers conferidos; lockfile conserva versões efetivamente consumidas. CLI shadcn 4.23.0 é referência de geração, não dependência runtime. Sem novas dependências de backend/infra.

**D-47 — Administração de pacientes incluída no produto.** A decisão posterior da usuária inclui cadastro e edição administrativa. A correção integral foi autorizada em 2026-11-09 por “corrija tudo e deixe pronto para entrega”. STAFF cadastra nome/e-mail/senha inicial e edita somente nome/e-mail; role é sempre PATIENT. Sem cadastro público, exclusão, mudança de perfil ou reset de senha. Nome tem 3–120 unidades UTF-16 após trim; senha inicial literal tem mínimo 8 unidades UTF-16 e máximo 72 bytes UTF-8, evitando truncamento silencioso do bcrypt. E-mail único em todas as contas gera `409 EMAIL_TAKEN`, sem sobrescrita. O complemento não é apresentado como requisito original do enunciado.

**D-48 — Um relógio também para verificar JWT.** Emissão e verificação usam o Clock injetado. Testes não dependem de tokens com data fixa comparados ao relógio de parede, nem alteram o relógio global do driver. Assinatura, algoritmo, issuer, claims e instante exato de expiração continuam obrigatórios.

**D-49 — Alvo QA validado como URL, não substring.** Antes de qualquer limpeza, interpretar a conexão PostgreSQL estruturalmente e exigir que o banco real seja exatamente `drlaudo_test`; uma ocorrência na query não autoriza operações destrutivas. A igualdade com a conexão principal só é admissível no processo de teste explicitamente descartável, não em desenvolvimento/produção. Base e fixtures QA nunca compartilham volume demonstrativo.

**D-50 — Proxy e headers em todas as superfícies.** Respeitar a quantidade configurada de proxies confiáveis, sem transformar um hop em confiança irrestrita no X-Forwarded-For do cliente. Nginx deve entregar os headers de segurança também no HTML e nos assets, considerando que `add_header` em `location` substitui a herança. URLs `/api` inválidas não viram SPA nem redirecionam para uma porta diferente.

**D-51 — Verificação reproduzível a partir de fontes.** Scripts que consomem `@drlaudo/contract` devem construir seu artefato antes de resolver os exports, inclusive no typecheck de uma instalação limpa. Arquitetura cobre contrato, API e web, não somente os módulos do contrato. E2E real permanece separado da suíte unitária/componentes/integração, com um worker e zero retries. Artefatos de desenvolvimento não são entregues no build de produção.

**D-52 — Demo pública por Cloudflare Tunnel.** Autorização específica da usuária em 2026-11-09: subir na VPS com subdomínio de `zairagoncalves.com`, usando acessos do LifeOS. Escolhido Tunnel para `drlaudo.zairagoncalves.com` → web em loopback8090, sem publicar API/banco. Nginx repassa o IP Cloudflare sob a premissa de origem controlada (ARCH §11.1). Credenciais demo públicas e alterações persistentes limitam a estabilidade da massa; somente dados fictícios. Smoke público é separado dos testes locais e da aprovação visual humana.

**D-53 — Consulta completa explícita da equipe.** A usuária autorizou acrescentar “Ver todos os agendamentos” mantendo a agenda diária e filtro por paciente, com publicação Git/VPS. Escolhido `scope=all` em GET appointments, exclusivo de date: não reinterpretar silenciosamente a ausência de date, que continua com janela de 30 dias. A lista completa inclui passado/futuro/cancelado, em ordem startsAt/id, e preserva contexto ao retornar de laudo. Datas visíveis evitam confundir dias distintos. Sem novo intervalo, paginação, migração ou ampliação de acesso PATIENT; complemento de usabilidade, não requisito original.

**D-54 — Linha do tempo e desativação administrativa, somente local nesta etapa.** A usuária escolheu agrupamento mensal/paciente com marcação temporal, edição apenas de rascunhos e desativação/reativação em vez de excluir paciente. Marcadores de dia civil não atestam realização. `Patient.active` obrigatório é estado de administração, não claim JWT nem campo de DTO do laudo. Migração aditiva `User.active DEFAULT true` preserva cadastros existentes. Desativar bloqueia login/próximas requisições/novas reservas, mas não cancela exames nem apaga histórico; reativação preserva senha. Amplia a edição de D-47 para atividade sem ampliar perfis. A usuária reiterou não publicar na VPS/GitHub antes da aprovação local.

**D-55 — Calendário mensal como alternativa local à linha do tempo.** Pedido explícito de manter linha do tempo e adicionar calendário. Reusar Calendar/shadcn e DayPicker já instalados, sem biblioteca nova. Consulta STAFF continua `scope=all` e patientId opcional; mês/dia selecionado são contexto visual `view=calendar&calendarDate=YYYY-MM-DD`, nunca parâmetros HTTP. Grade mensal conta todos os exames, incluindo cancelados identificados em texto; selecionar dia apresenta detalhes/ações existentes. URL/F5/retorno do laudo preservam calendário/dia/paciente. Meses respeitam calendário0001–9999 e fuso da clínica, sem atestar realização. Entrega limitada ao preview8091, sem Git/VPS.

**D-56 — Refinamento integrado do fluxo da equipe.** Duas avaliações independentes de UI/UX identificaram mistura de recorte/modo, rolagem excessiva até os exames, foco de calendário sem indicador visual e contexto incompleto em leitura publicada/retorno da criação. A usuária aprovou em formulário `initial_view=calendar` e `scope=integrated_staff_flow`. Reorganizar capacidades atuais em Dia/Calendário/Linha do tempo, com Hoje separado, filtros/paciente compactos, detalhe diário próximo da grade e acesso a exames prioritário em Pacientes. Todas as leituras STAFF confirmadas mantêm paciente/exame/data. Cancelar a criação retorna à origem segura em `/agenda`, sem pré-selecionar paciente/exame ou alterar o redirecionamento de sucesso. Preservar identidade, invariantes, portal, confirmações e rodapé do editor; somente preview local.

# Decisões — Dr. Laudo

**Estado:** Specify aprovado em 2026-11-08; Design/Tasks em revisão documental, sem aprovação de execução. Autoridade: [DESAFIO](DESAFIO.md) → [PRD](PRD.md); comportamento no PRD, wire contract em [API](API.md), mecanismo em [ARCHITECTURE](ARCHITECTURE.md), provas em [TESTING](TESTING.md). D-01…40 preservam identidade e histórico; D-41 fecha o gate de aprovação nos caminhos canônicos. Dependências da aplicação seguem planejadas, não instaladas/homologadas.

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

**D-19 — Seed idempotente por UUID.** .test é reservado (RFC2606/6761). Transação com update vazio preserva alterações; datas/hash/textos só no create. Repetir não move, republica ou reseta senha. Boot só conecta; procedimento em [ARCH §9](ARCHITECTURE.md#9-seed-e-dados-demonstrativos).

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

**D-33 — Health503 usa INTERNAL_ERROR.** SELECT1 real; sucesso status/db ok. Falha retorna a mensagem canônica existente, sem DB_ERROR/driver/URL/stack. Preserva os13ErrorCode, mock só simula.

**D-34 — Produção depende de alvo autorizado.** Operador fornece domínio/segredos externos e valida proxy:0local,1Nginx,2Traefik+Nginx sem bypass. A responsável de produto autoriza alvo exato; smoke só leitura. Sem autorização T-21 não executa nem bloqueia entrega local. Noindex não autentica.

**D-35 — Dependência somente com uso.** Registrar fase/pacote, conferir engines/APIs e fixar lockfile antes de instalar autorizado. Sem framework de monorepo, retry/monitoramento/servidor mock extras; sensible desnecessário ao envelope próprio fica fora.

**D-36 — Auth concreta.** bcryptjs custo10, JWT HS256/claims exatos; limiter10tentativas/IP/60s desde primeira, incluindo inválidas/sucesso,11ª429/Retry-After. Limiter antes do parser público; auth/perfil antes do parser privado. Hash fictício equivalente para e-mail ausente,401genérico; sem Redis para uma instância demo.

**D-37 — Fronteiras explícitas.** Feature routes/service/dto separa HTTP, regra/Prisma e select/mapper; services recebem prisma/clock, tipos HTTP só em contract. Tempo recebe UtcDateTime validado; UtcRange usa Dates internos até fim exclusivo ano10000 sem cortar calendário aceito.

**D-38 — Direção B-1 agrupa T-03/T-04.** Health/app dependem de schema/client/banco reais: preparar migration/helpers antes do aceite conjunto, sem banco falso. IDs preservados para revisão do futuro Tasks. npm test API inclui unidade/integração; test:integration só seleciona camada. Gate A/autorização B permanecem.

**D-39 — Env raiz portável.** Vite envDir; API carrega .env por URL do módulo/Node22, env externo prevalece. Launcher reutiliza parser/operações fixas/schema absoluto; TEST vira DATABASE_URL só no filho após guarda, sem segredo em args/shell, cwd implícito ou cópia de env. [ARCH §11](ARCHITECTURE.md#11-modos-de-execução).

**D-40 — TLC4.1.0, Specify canônico sem duplicação.** Skill instalada/autorizada e lida por arquivo local, com ferramentas nativas do host; não alegar descoberta automática OMP. docs/PRD.md é alvo aceito pelo validator oficial. Preservar RF/RN, EARS e Draft; sem captura binding inventada, .specs ou novo Tasks aprovado. Desenho e roteiro anteriores são apenas condensados. Coordenação executa gates documentais após integração; nenhum gate, commit ou implementação é autorizado por esta adaptação.

Atualização de estado (2026-11-08): a responsável de produto aprovou o Specify com “pode seguir”, conforme PRD. Menções anteriores a Draft/Tasks futuro em D-29/38/40 descrevem aquela etapa; esta continuação autoriza somente Design/Tasks, não instalação, implementação, banco, testes de aplicação, commit ou publicação. Stack/escopo e decisões herdadas não foram reabertos.

**D-41 — Aprovações nas fontes canônicas.** Manter docs/PRD.md e o plano local docs/TASKS.md, sem aliases/cópias. O --execute da skill consulta nomes fixos spec.md/tasks.md e ignora ausentes; não verifica sozinho as duas aprovações deste repositório. O harness deve conferir diretamente ambas, com data/palavras reais da usuária, além da autorização de escopo/fase. Duplicar documentos para satisfazer o gate foi descartado por criar autoridades concorrentes. Gate A e autorização B permanecem; validação documental nunca libera produto, commit ou push.

## Limitações e dívida técnica
| ID | Risco / limite | Mitigação e gatilho |
|---|---|---|
| DT-01 | localStorage exposto a XSS; JWT não revogável. | Texto puro/CSP/8h/reset; redesenho obrigatório antes de dados reais. |
| DT-02 | Saves DRAFT multioperador podem sobrescrever. | Última gravação vence; preservar formulário/refazer estado; versionamento só com novo requisito. |
| DT-03 | Demo relativa envelhece. | Não reescrever histórico; QA independente; reset só descartável/autorizado. |
| DT-04 | Sem auditoria clínica, assinatura ou retenção clínica. | Fora do enunciado; vedado uso real sem novo escopo/revisão de privacidade. |
Não é aceitação de risco vermelho. Risco, evidência e eventual aceite explícito seguem para coordenação e responsável de produto, sem segunda fila operacional neste registro.

## Dependências registradas
Planejadas para a aplicação; conferir versões/engines e lockfile na fase autorizada. TLC é ferramenta documental instalada, não dependência runtime do produto.
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
Novas dependências exigem registro junto da mudança autorizada; nenhuma instalação de aplicação foi feita nesta revisão.

# Dr. Laudo — Agendamento de exames e laudos

> Do agendamento ao laudo, sem complicação.

Aplicação fictícia para desafio técnico. A equipe cadastra/edita pacientes, agenda/cancela exames e prepara/publica laudos. Pacientes consultam somente seus próprios agendamentos e laudos publicados. **Não usar dados clínicos reais.**

**Stack:** React + TypeScript + RTK Query; Node 22.22.2 + Fastify 5; Prisma 7 + PostgreSQL 16. Contrato Zod compartilhado, testes Vitest e Playwright/axe. [Enunciado](docs/DESAFIO.md) · [Requisitos](docs/PRD.md) · [Evidências e limites](docs/TESTING.md).

## Executar com Docker

Na raiz do repositório:

```bash
docker compose up --build
```

Abra <http://localhost:8080>. Compose aguarda PostgreSQL, aplica migration, carrega seed idempotente e inicia API/web. Não exige `.env`. Só a web é publicada, no loopback; o banco não fica acessível pela rede do host nesse modo.

Se 8080 estiver ocupada, configure `DRLAUDO_PORT=8090` no ambiente antes do comando e abra <http://localhost:8090>. Exemplos:

```powershell
# PowerShell
$env:DRLAUDO_PORT="8090"
docker compose up --build
```

```bash
# bash
DRLAUDO_PORT=8090 docker compose up --build
```

| Perfil | E-mail | Senha fictícia |
|---|---|---|
| Equipe | `equipe@drlaudo.test` | `Demo@1234` |
| Paciente | `ana.souza@drlaudo.test` | `Demo@1234` |
| Paciente | `bruno.lima@drlaudo.test` | `Demo@1234` |

Os atalhos da tela de login apenas preenchem os campos; clique em Entrar. No primeiro seed, cinco exames são criados para amanhã no fuso da clínica: Ana 08h publicado, 09h rascunho, 10h sem laudo; Bruno 11h sem laudo e 12h cancelado. Reexecutar não desloca datas nem sobrescreve alterações. A agenda pode precisar ser filtrada para a data original do seed.

## Executar sem Docker

Pré-requisitos: **Node >=22.22.2**, npm e **PostgreSQL 16**. Crie uma base demonstrativa dedicada e uma base descartável de QA chamada exatamente `drlaudo_test`, com um usuário que possa preparar seus schemas. Não use uma base compartilhada ou real.

```bash
# Exemplo com PostgreSQL local; prompts de senha dependem da configuração local
createdb -h 127.0.0.1 -p 5432 -U seu_usuario drlaudo
createdb -h 127.0.0.1 -p 5432 -U seu_usuario drlaudo_test
```

Copie `.env.example` para `.env` (`Copy-Item .env.example .env` no PowerShell ou `cp .env.example .env` no bash). Ajuste conexões e segredo JWT; variáveis externas têm precedência. `.env` nunca deve ser versionado. Mantenha `VITE_API_MOCKING=false` para a API real.

```bash
npm ci
npm run db:setup
npm run dev
```

Abra <http://localhost:5173>. API direta: <http://127.0.0.1:3333/health>. O Vite encaminha `/api/*` removendo o prefixo uma única vez. `db:setup` constrói contrato, gera Prisma, migra e carrega seed; iniciar só o servidor não limpa nem resemeia a base.

### Modo híbrido: somente PostgreSQL em Docker

A publicação de banco é opcional e explícita:

```bash
docker compose -p drlaudo -f docker-compose.yml -f docker-compose.hybrid.yml up -d db
```

A base demo fica em `127.0.0.1:5433`. Para testes executados no host, use **outra base descartável**, sem volume demo:

```bash
docker compose -p drlaudo-qa -f docker-compose.qa.yml -f docker-compose.qa-host.yml up -d db-test
```

QA fica em `127.0.0.1:55433`, banco `drlaudo_test`, usuário/senha fictícios `drlaudo`. Configure `DATABASE_URL_TEST` com essa porta. Portas podem ser alteradas por `DRLAUDO_DB_PORT` e `DRLAUDO_QA_DB_PORT` antes dos comandos; atualize `.env` de acordo. Depois execute `npm run db:setup` e `npm run dev` como acima.

## Testes e gates

```bash
npm run lint
npm run typecheck
npm run check:arch
npm run build
npm test
```

Scripts constroem o contrato antes dos consumidores; não é necessário versionar `dist`. A suíte raiz agrega contrato, unidade/API PostgreSQL e componentes/MSW. A integração **recria o schema da base QA**; não aponte `DATABASE_URL_TEST` para dados que deseja preservar. Guarda estrutural rejeita destino não-QA e parâmetros que substituam a conexão; o nome real do banco é conferido antes da limpeza.

Alternativa: integração inteiramente em Docker, sem portas públicas e com PostgreSQL em tmpfs:

```bash
docker compose -p drlaudo-qa -f docker-compose.qa.yml run --rm --build api-test
```

### E2E real e acessibilidade automatizada

Com a conexão QA configurada e livre de outra suíte:

```bash
npm exec -w apps/e2e -- playwright install chromium
npm run test:e2e
```

Playwright inicia API própria em `127.0.0.1:3335` e frontend de produção em `127.0.0.1:4183`, prepara massa fictícia isolada e usa um worker, sem retries, MSW ou respostas de API simuladas. Integração e E2E não podem executar simultaneamente na mesma base. Relatórios/credenciais temporárias ficam ignorados pelo Git.

Axe e provas de teclado/reflow não equivalem a certificação WCAG ou homologação em leitor de tela/celular físico. O parecer e as observações reais estão em [TESTING](docs/TESTING.md#11-evidências-gates-e-parecer-de-qualidade).

### Verificar Nginx, headers e IP do proxy

Use um projeto HTTP QA separado, não a demo e não a base em uso por outra suíte:

```bash
docker compose -p drlaudo-http-qa -f docker-compose.qa.yml --profile http up -d --build --wait web
npm run check:delivery -- --base-url http://127.0.0.1:18080 --check-proxy --login-limit 10
```

Essa prova verifica também a rejeição de corpo proibido, inclusive com upload aberto, através do Nginx. Ela consome deliberadamente o limite de login do processo QA e usa apenas uma identidade fictícia inexistente. Não apaga contas ou dados demo. Para encerrar, use o mesmo nome/arquivo do projeto. Remoção de volumes/bases só após confirmar que o alvo é descartável.

## Cinco cenários obrigatórios

Caminhos relativos a `apps/api/`:

| # | Cenário | Teste de integração |
|---|---|---|
| 1 | Duas reservas simultâneas: uma 201, outra 409; uma linha ativa | `tests/integration/appointments.test.ts` |
| 2 | Paciente não lê laudo alheio | `tests/integration/patient.access.test.ts` |
| 3 | Rascunho não é exposto ao paciente | `tests/integration/patient.access.test.ts` |
| 4 | Publicação por HTTP passa a disponibilizar o laudo ao paciente correto | `tests/integration/patient.access.test.ts` |
| 5 | Início passado ou igual a agora é rejeitado sem inserir | `tests/integration/appointments.test.ts` |

As provas adicionais abrangem transações/locks, corridas, imutabilidade, rollback por saída inválida, seed, JWT, autorização e administração. Resultados efetivamente executados pertencem a TESTING, não são inferidos desta tabela.

## Regras e decisões principais

- Uma sala; três exames; slots de 30min, 07:00–18:30, `America/Sao_Paulo`. UTC na API/banco, exibição explícita em Brasília.
- Índice único parcial em `Appointment.startsAt WHERE status='SCHEDULED'` arbitra reservas concorrentes. Cancelados liberam o slot; SELECT anterior não protege a concorrência.
- Cancelar/criar/editar/publicar laudo trava primeiro Appointment com `FOR UPDATE` e relê na mesma transação. Não há CANCELED com PUBLISHED.
- Um laudo por exame; rascunho editável só pela equipe; publicado é imutável. Publicação exige rascunho salvo e confirmação.
- `/me/*` filtra identidade do token; alheio/inexistente/sem laudo/rascunho usam o mesmo 404. DTOs não expõem hash ou metadados internos.
- Administração de pacientes é complemento autorizado: criação com senha inicial e edição de nome/e-mail, sem exclusão, mudança de perfil ou reset de senha.

## Documentação e limitações

| Documento | Conteúdo |
|---|---|
| [API](docs/API.md) | Contrato, DTOs, autorização, erros e precedências |
| [Arquitetura](docs/ARCHITECTURE.md) | Camadas, dados, transações, sessão, tempo e execução |
| [Decisões](docs/DECISIONS.md) | Escolhas, dependências e dívida técnica |
| [Testes](docs/TESTING.md) | Provas, resultados e limites de homologação |
| [Uso de IA](docs/AI_USAGE.md) | Processo, erros/correções e tempo dedicado |
| [Enunciado](docs/DESAFIO.md) · [PRD](docs/PRD.md) | Requisitos originais e complemento de produto |

Tempo aproximado informado pela autora: **5 horas** até 09/11/2026; ver registro factual em AI_USAGE.

A API executa TypeScript via `tsx`; JWT em localStorage e sem revogação é limitado à demo; edições concorrentes de rascunho têm última gravação por campo enviado. Sem PDF, anexos, DICOM, assinatura digital, recuperação de senha, múltiplas salas, notificações ou tema escuro. Dados demo envelhecem por desenho. Deploy público e aprovação visual humana não são presumidos; uso clínico real exige novo desenho de privacidade, segurança e operação.

Projeto fictício para desafio técnico · dados de demonstração.

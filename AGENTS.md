# AGENTS.md — Dr. Laudo

Instruções para agentes de IA (Codex, Claude Code e outros) e para humanos.
Este arquivo concentra as regras compartilhadas de trabalho. Adaptadores e roteiros pessoais ficam locais e não substituem estas instruções.

**Autoridade:** [enunciado](docs/DESAFIO.md) → [PRD](docs/PRD.md) → demais documentos. Divergência exige pergunta, não mudança silenciosa de escopo.

## O projeto

**Dr. Laudo** é uma aplicação web para uma clínica de exames fictícia:

- A **equipe** (`STAFF`) agenda exames, cancela agendamentos, escreve laudos (rascunho) e os publica.
- O **paciente** (`PATIENT`) consulta seus agendamentos e lê os laudos **publicados**.

Desafio técnico com prazo de entrega de 3 dias, conforme o enunciado, e escopo fechado. Prazo não equivale a horas efetivamente trabalhadas. Prioridade, nesta ordem:
**regras de negócio → segurança/autorização → testes → UX → extras.**

**Limite atual:** em 2026-11-08, a usuária autorizou “faça todo o frontend e me de o amibeinte local pra aparovar”. Concluir T2–T20/Fase A e disponibilizar ambiente local sem pedir OK entre unidades; manter teste primeiro e gates técnicos. Também autorizou commits locais por feature (“é pra ir commietando por ft”), somente após verificação e com seleção explícita dos arquivos. Gate A visual/UX continua humano posterior. Backend/banco, infraestrutura, push e publicação exigem autorização separada.

## Leia antes de qualquer tarefa

| Documento | Papel |
|---|---|
| [Enunciado](docs/DESAFIO.md) | Requisitos originais preservados em texto. |
| [PRD](docs/PRD.md) | RF/RN consolidadas e distinção entre exigências e decisões. |
| [API](docs/API.md) | Contrato HTTP, DTOs e códigos de erro; atualizar com o contrato. |
| [Arquitetura](docs/ARCHITECTURE.md) | Camadas, dados e fluxos planejados. |
| [Testes](docs/TESTING.md) | Estratégia e provas dos cinco cenários obrigatórios. |
| [Decisões](docs/DECISIONS.md) | Escolhas técnicas e dependências; não reabrir sem motivo novo. |
| [Uso de IA](docs/AI_USAGE.md) | Registro factual e tempo dedicado, sem alegar verificações inexistentes. |

## Stack

- Monorepo npm workspaces, começando por `packages/contract` na T1. Web/API/E2E entram com seu primeiro comportamento real. Node >=22.13; desenvolvimento em 22.22.2, versões fixadas no lockfile.
- **Contrato:** schemas Zod, tipos inferidos, enums, erros e funções puras de slots em `packages/contract`.
- **Web, Fase A:** Vite + React + TypeScript strict + RTK Query + React Router + Tailwind v4 + shadcn/Radix. MSW apenas em desenvolvimento.
- **API, Fase B:** Fastify + Prisma + PostgreSQL 16 + JWT + bcryptjs, reutilizando o contrato.
- **Testes:** Fase A, Vitest/Testing Library/MSW; B, integração real com Postgres; C, Playwright/axe. Docker/CI somente na C.

## Regras de código

- TypeScript strict, `noUncheckedIndexedAccess` e `exactOptionalPropertyTypes`; sem `any`, `@ts-ignore`, `as unknown as` ou supressões de lint.
- Schemas HTTP, enums, ErrorCode, constantes e slots só em `packages/contract`; tipos por `z.infer`, com `z.input` quando necessário. Executar schemas nas fronteiras, não apenas importar tipos.
- API: routes cuidam de HTTP; services recebem `{ prisma, clock }` e não importam Fastify; domínio puro não depende de Prisma, HTTP ou features.
- `DomainError` e handler global usam o envelope de [API](docs/API.md#7-erros); não expor stack, senha, token ou conteúdo clínico nos logs.
- Formulários reutilizam contrato. Estado de servidor em RTK Query; sessão/filtros não viram segunda fonte de dados.
- JWT real, hash bcrypt e autorização são do backend. MSW e token falso servem apenas a desenvolvimento/testes de UI.
- Comandos atuais: `npm test`, `npm run build`, `npm run typecheck`, `npm run lint` e `npm run check:arch`, somente para workspaces implementados. `npm run dev` ainda acompanha apenas o contrato, sem servidor/tela. Alteração só documental não justifica testes de produto inventados.

## Fluxo obrigatório

1. Antes de implementar, conferir autorização explícita, fase e RNs; conflito com o enunciado/PRD exige pergunta.
2. Para comportamento, escrever/ajustar teste primeiro e observar a falha correta. Pedido de regras/documentação não autoriza implementação nem instalação.
3. Implemente a menor mudança para o teste ficar verde; não antecipe backend/infra.
4. Execute lint, typecheck, check:arch e test pertinentes à fase; em UI, rode a aplicação e observe a tela real.
5. Atualize documentação afetada. Uma task por branch; exceção apenas para marcos agrupados explicitamente no plano, com todos os IDs rastreáveis e um aceite conjunto real. Conventional Commits, PR; nunca push direto na `main`.
6. Entregar arquivos, comandos/saídas, evidência visual e registro factual de IA. Na autorização atual, executar toda a Fase A sem pausas por task e submeter o frontend local à aprovação visual/UX final; testes verdes não concedem Gate A. Duas falhas pelo mesmo motivo: explicar e corrigir a causa, sem repetir cegamente.

## Especificação com TLC

- `docs/PRD.md` é o Specify canônico: histórias e critérios EARS, preservando RF/RN. O validador oficial aceita esse caminho; não duplicar o documento em `.specs`.
- Antes de apresentar a revisão, executar `validate_spec.py docs/PRD.md --strict` da skill instalada. Esse gate valida Markdown, não o produto.
- Aprovação explícita da spec precede novo Design/Tasks; aprovação do plano e autorização do escopo precedem Execute. Não inventar linhas `Approved`, provas ou comandos executados.
- Regras nativas e deste projeto prevalecem: testes primeiro, Gate A, OK das unidades autorizadas e permissão específica para commit/push. A skill não autoriza commits automáticos nem altera modelo/provider.
- Antes de Execute, conferir explicitamente as duas aprovações nos caminhos canônicos `docs/PRD.md` e `docs/TASKS.md`. O `--execute` da skill procura nomes fixos `spec.md`/`tasks.md` e ignora ausentes; isoladamente não valida a aprovação do nosso PRD. Não duplicar arquivos nem alterar a skill para simular esse gate.
- Enquanto não há manifesto, uma linha `Build: none` apenas descreve a ausência de comandos. Após o primeiro bootstrap autorizado, substituí-la pelos comandos reais de build/typecheck/lint/check:arch e observar os gates antes de avançar; `none` não aprova comportamento nem entrega.


## Invariantes críticos (nunca quebre)

As garantias de banco/transação abaixo são da API real na Fase B. MSW pode simular seus efeitos, mas não comprova essas garantias.

1. **Conflito de horário** é garantido pelo índice único parcial `appointment_active_slot_unique` (`startsAt` WHERE `status = 'SCHEDULED'`). Erro Prisma `P2002` → `409 SLOT_TAKEN`. **Nunca** use "SELECT antes do INSERT" como proteção.
2. Toda operação que envolve agendamento **e** laudo roda em `prisma.$transaction` com `SELECT ... FOR UPDATE` na linha do `Appointment`. O estado `CANCELED` + laudo `PUBLISHED` é impossível.
3. Nas operações do perfil `PATIENT`, o id do paciente vem **sempre** do usuário autenticado, nunca de params/query/body. A equipe pode selecionar `patientId` em suas rotas autorizadas; isso não altera o isolamento de `/me/*`.
4. Recurso de outro paciente, ou laudo em rascunho, retorna `404 NOT_FOUND`, idêntico ao inexistente.
5. A saída da API é sempre um DTO com `select` explícito. Nunca retorne entidade Prisma crua (risco de vazar `passwordHash`).
6. Datas: `timestamptz` no banco, ISO 8601 UTC na API, exibição em `America/Sao_Paulo`. "Agora" vem de `clock.now()` (injetável), nunca de `new Date()` solto em regra de negócio.
7. Laudo publicado é imutável.
8. A UI do paciente não dá **nenhum** indício de que existe rascunho.
9. Sem backend, o front chama `/api` via MSW em `apps/web/src/mocks`; nenhuma tela de produto sabe que é mock. Contrato só em `packages/contract`; mudou lá, atualize API.md no mesmo commit. Ativar MSW somente em dev com `VITE_API_MOCKING=true`; só `main.tsx`, fora de mocks, pode importar mocks. Build de produção sem mocks nem worker.

## Design

- Use só componentes de `src/components/ui` (shadcn) e `src/components/product`.
- Cores só por tokens semânticos. No shadcn, `accent` é hover de menu; o destaque da marca é `highlight` / `highlight-strong` / `highlight-soft`.
- Status sempre via `statusMap` + `<StatusBadge>`. Estado nunca é transmitido só por cor.

## Higiene da entrega ao avaliador

- Versionar somente fontes, testes, migrations, assets necessários, manifestos/lockfile, configuração reproduzível, exemplos sanitizados de ambiente e documentação técnica útil.
- Manter enunciado, README e regras de negócio/contrato acessíveis; README aponta só para arquivos entregues, nunca para guias ignorados.
- Estado de IA/editor, sessões, caches, relatórios gerados, builds, bases locais e segredos ficam no `.gitignore`.
- Roteiros pessoais de execução, comandos de harness, bibliotecas internas de instruções e receitas detalhadas de design podem ficar locais; não são documentação obrigatória do avaliador.
- Não criar MD por sessão/fase ou duplicar status, plano e enunciado. Consolidar informação útil no documento responsável; remover relatório redundante.
- `.gitignore` não retira arquivo já rastreado nem apaga histórico. Para excluir da entrega mantendo no disco, usar remoção somente do índice, dentro do escopo autorizado.
- Nunca ignorar código, testes, `package-lock.json`, migrations ou `.env.example` para esconder falha/pendência. Não usar padrão genérico que exclua todos os Markdown ou imagens.
- Antes de publicar, verificar a lista de arquivos, o comportamento das regras de ignore e os links usando somente o conjunto público. Segredo já publicado exige tratamento próprio, não só ignore.
- Commit/push exigem autorização que cubra o escopo; nunca publicar configuração pessoal ou mudanças alheias por `git add .`.

## Proibido

- `any`, `@ts-ignore`, `eslint-disable`, `.only` / `.skip` em testes.
- Mockar o banco em testes de integração da API. MSW é permitido nos testes do frontend, nunca como substituto dessa integração. Proibido enfraquecer teste para fazê-lo passar.
- Adicionar dependência sem registrar em `docs/DECISIONS.md`.
- Commitar `.env` ou segredos. Hex solto no JSX.
- Usar marcas, logos ou cores de empresas reais.
- Implementar fora do escopo: PDF, anexos, DICOM, recuperação de senha, multi-sala, notificações, tema escuro.

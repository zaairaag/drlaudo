# Dr. Laudo — Agendamento de exames e laudos

> Do agendamento ao laudo, sem complicação.

Aplicação fictícia de clínica, com dados de demonstração. A equipe agenda exames e publica laudos; pacientes consultam somente seus próprios agendamentos e laudos publicados.

**Estado atual:** implementação frontend-first iniciada pelo contrato compartilhado (T1). A aplicação web, o mock e o backend ainda não existem; não há demo publicada. Aprovação visual/UX precede o backend.

## Enunciado e regras

- [Enunciado do desafio](docs/DESAFIO.md): requisitos originais.
- [PRD](docs/PRD.md): regras RF/RN e decisões de produto.
- [AGENTS.md](AGENTS.md): regras compartilhadas de engenharia e higiene do repositório.

Precedência: enunciado → PRD → demais documentos. Planejamento interno e arquivos pessoais não fazem parte da entrega.

## Direção técnica

React + TypeScript, Vite, Tailwind v4 e RTK Query. Contrato Zod compartilhado em `packages/contract`; MSW somente para desenvolvimento/testes de UI. Backend planejado com Fastify, Prisma e PostgreSQL.

A direção é validar o frontend antes do backend, com aprovação visual/UX explícita. Isso não dispensa autorização, concorrência e testes reais no servidor. Docker é opcional e não é exigência do desafio.

A Fase A está autorizada, com teste primeiro e aceite por unidade. Backend, infraestrutura e publicação exigem seus próprios gates e autorizações.

## Como ler a especificação

Comece pelo enunciado e pelo PRD: ele concentra as histórias, os requisitos RF/RN e os aceites testáveis. Consulte API para o contrato, arquitetura para o mecanismo e TESTING para a prova. Não é necessário ler o mesmo requisito recontado em todos os documentos.

| Documento | Responsabilidade |
|---|---|
| [API](docs/API.md) | Entradas, saídas, autorização, erros e precedência de validação |
| [Arquitetura](docs/ARCHITECTURE.md) | Contrato compartilhado, camadas, dados, transações e fluxos de UI |
| [Decisões](docs/DECISIONS.md) | Escolhas, alternativas descartadas e dependências planejadas |
| [Testes](docs/TESTING.md) | Rastreabilidade RF/RN, cinco cenários obrigatórios e gates de aceite |
| [Uso de IA](docs/AI_USAGE.md) | Histórico factual e tempo dedicado |

## Executar o contrato e suas verificações

Requer Node >=22.13 (desenvolvimento em 22.22.2) e npm. O único workspace atual é `packages/contract`; ainda não há servidor/tela para abrir.

```bash
npm ci
npm test
npm run build
npm run typecheck
npm run lint
npm run check:arch
```

`npm run dev` acompanha o build do contrato; não inicia aplicação web. O pacote ESM `@drlaudo/contract` expõe `dist/index.js` e suas declarações após o build. Esta etapa não usa variáveis de ambiente, banco ou Docker; os exemplos de ambiente entram com seus consumidores.

Os schemas validam formato, normalização e estrutura de identidade. Não autenticam usuários nem comprovam autorização, concorrência ou os cinco cenários do backend.

## Dados de demonstração planejados

Contas fictícias planejadas para mock e seed:

| Perfil | E-mail | Senha |
|---|---|---|
| Equipe | `equipe@drlaudo.test` | `Demo@1234` |
| Paciente | `ana.souza@drlaudo.test` | `Demo@1234` |
| Paciente | `bruno.lima@drlaudo.test` | `Demo@1234` |

O aceite final exige frontend/backend reais, instruções reproduzíveis, exemplo de ambiente sem segredos, decisões/limitações/pendências, tempo dedicado e provas dos cinco cenários do enunciado. Aprovar uma UI sobre MSW não conclui o desafio.

## Fora do escopo

PDF de laudos, anexos, DICOM, recuperação de senha, multi-sala, notificações e tema escuro.

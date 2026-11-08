# PRD — Dr. Laudo

**Status:** aprovado para desenvolvimento · **Prazo:** 3 dias
Itens marcados **[DECISÃO]** não estavam no enunciado e foram fixados pelo desenvolvedor (justificativas em `DECISIONS.md`).

**Fonte primária:** [enunciado original do desafio](../teste-agendamento-exames-laudos.pdf), §§1–5. Este PRD organiza a especificação consolidada; regras de implementação estão em [RULES](RULES.md) e as escolhas adicionais em [DECISIONS](DECISIONS.md).

**Uso de IA:** o §2 do enunciado traz “Vive coding” como requisito fundamental (termo literal do PDF). O registro do processo e do tempo dedicado está em [AI_USAGE](AI_USAGE.md).

## 1. Problema

Uma clínica de exames precisa de um sistema simples para agendar exames, registrar laudos e permitir que o paciente consulte seus resultados com segurança.

## 2. Objetivos

- Agendamento sem conflito de horário, inclusive sob concorrência.
- Ciclo do laudo com rascunho e publicação, sem vazamento de rascunho.
- Isolamento total entre pacientes.
- Projeto executável pelo avaliador com um comando e coberto por testes automatizados.

## 3. Não objetivos

PDF, anexos, DICOM, recuperação de senha, cadastro público, múltiplas salas, notificações, pagamentos, tema escuro.

## 4. Personas

| Perfil | Quem | Precisa |
|---|---|---|
| `STAFF` | Recepção/equipe técnica | Agendar rápido, ver a agenda do dia, escrever e publicar laudos. |
| `PATIENT` | Paciente | Ver seus exames e ler laudos liberados, em linguagem clara e no celular. |

## 5. Requisitos funcionais

| ID | Requisito | Perfil |
|---|---|---|
| RF-01 | Login com e-mail e senha; a tela de login mostra as contas demo como atalho. | Todos |
| RF-02 | Logout e expiração de sessão (8 h). | Todos |
| RF-03 | Agendar exame: escolher paciente, tipo de exame, data e horário livre em grade de 30 min. | STAFF |
| RF-04 | Agenda: listar agendamentos com filtro por data e por paciente. | STAFF |
| RF-05 | Cancelar agendamento com confirmação. | STAFF |
| RF-06 | Criar e editar laudo em rascunho (título, texto, profissional responsável). | STAFF |
| RF-07 | Publicar laudo com confirmação explícita de irreversibilidade. | STAFF |
| RF-08 | Portal do paciente: lista dos próprios agendamentos e leitura dos laudos publicados. | PATIENT |

## 6. Regras de negócio

### Acesso
- **RN-01** — Há dois perfis: `STAFF` e `PATIENT`. Não há cadastro público; os usuários vêm do seed.
- **RN-02** — Toda rota, exceto `POST /auth/login` e `GET /health`, exige JWT válido → `401 UNAUTHORIZED`.
- **RN-03** — Rotas de equipe exigem `STAFF` → `403 FORBIDDEN`.
- **RN-04** — O paciente só acessa os próprios dados. O id vem do token. Recurso de outro paciente → `404 NOT_FOUND`.

### Agendamento
- **RN-05** — O catálogo contém pelo menos três tipos de exame; **[DECISÃO]** nesta implementação ele é fixo, com três tipos no seed. Todo exame ocupa um slot de 30 min, independentemente do tipo.
- **RN-06** — Os slots começam em hh:00 ou hh:30 no fuso `America/Sao_Paulo` → `422 INVALID_SLOT`.
- **RN-07** — **[DECISÃO]** Funcionamento das 07:00 às 19:00; o último início é às 18:30 → `422 INVALID_SLOT`.
- **RN-08** — Não é possível agendar no passado (slot iniciado ou anterior a agora) → `422 PAST_DATE`.
- **RN-09** — A clínica tem uma sala, conforme o enunciado (§4.1): um único agendamento `SCHEDULED` por slot → `409 SLOT_TAKEN`.
- **RN-10** — O horário de um agendamento cancelado volta a ficar livre.
- **RN-11** — Só é possível cancelar agendamento `SCHEDULED` sem laudo publicado → `409 CANNOT_CANCEL`.
- **RN-12** — **[DECISÃO]** É permitido cancelar com laudo em rascunho; o rascunho é preservado, mas fica bloqueado.
- **RN-13** — O cancelamento é definitivo. Reagendar significa criar um novo agendamento.

### Laudo
- **RN-14** — Há no máximo um laudo por agendamento → `409 REPORT_EXISTS`.
- **RN-15** — Criar, editar ou publicar laudo exige agendamento `SCHEDULED` → `409 APPOINTMENT_CANCELED`.
- **RN-16** — Campos: título com 3–120 caracteres, texto com 10–10.000, profissional com 3–120, sem espaços nas pontas → `400 VALIDATION_ERROR`.
- **RN-17** — O laudo nasce `DRAFT`.
- **RN-18** — Só `DRAFT` é editável → `409 REPORT_LOCKED`.
- **RN-19** — Publicar muda `DRAFT` para `PUBLISHED`, registra `publishedAt` e é irreversível.
- **RN-20** — O laudo publicado é imutável (sem edição, sem despublicar, sem excluir).
- **RN-21** — **[DECISÃO]** O laudo pode ser criado antes do horário do exame (preparo de modelo); o enunciado não proíbe.

### Portal do paciente
- **RN-22** — O paciente vê a lista dos próprios agendamentos (agendados e cancelados), com `hasPublishedReport`.
- **RN-23** — O paciente só vê laudo `PUBLISHED`. Rascunho → `404`, idêntico ao inexistente. Nenhum indício de rascunho na UI nem nas respostas da API.
- **RN-24** — Nenhuma resposta expõe `passwordHash` nem dados de outro paciente.

### Tempo
- **RN-25** — Datas são armazenadas em UTC. A exibição é sempre em `America/Sao_Paulo`, com a indicação "Horário de Brasília", independentemente do fuso do navegador.

## 7. Requisitos não funcionais

- **Segurança:** bcrypt, JWT com `iss: "drlaudo-api"`, rate limit no login, `noindex` na demo, dados fictícios.
- **Acessibilidade:** WCAG 2.1 AA verificado com axe; navegação por teclado; estado nunca só por cor.
- **Responsivo:** portal do paciente pensado primeiro para celular (375 px).
- **Executabilidade:** `docker compose up --build` sem passos manuais; roda também sem Docker.
- **Qualidade:** lint, typecheck e testes verdes no CI; os 5 cenários do enunciado cobertos.

## 8. Critérios de aceite globais

Os 5 cenários do enunciado passam (ver `TESTING.md`), mais o teste de corrida cancelar × publicar. Avaliador roda demo e testes só com Docker.

A entrega deve incluir todos os itens do §5 do [enunciado original](../teste-agendamento-exames-laudos.pdf): código frontend e backend; instruções de instalação, execução, banco e dados fictícios; credenciais demo; instruções de testes; exemplo de variáveis de ambiente sem segredos; decisões, limitações e pendências; tempo aproximado dedicado ao exercício, registrado em [AI_USAGE](AI_USAGE.md#tempo-dedicado-ao-exercício).

## 9. Métricas de sucesso do desafio

O avaliador roda tudo em menos de 5 min, encontra a prova de cada cenário em uma tabela e entende cada decisão sem perguntar.

# Dr. Laudo Specification

**Approved**: 2026-11-08 - user: "pode seguir"
**Status:** Specify e plano aprovados. Em 2026-11-09, a usuária autorizou “corrija tudo e deixe pronto para entrega”, incluindo as correções da auditoria e o cadastro/gestão administrativa de pacientes já decidido para o produto. A execução técnica não concede aprovação visual/UX humana nem autoriza push ou deploy.
**Autoridade:** [DESAFIO](DESAFIO.md) → este Specify canônico → demais documentos. RF/RN preservam identidade e alcance; [DECISIONS](DECISIONS.md) registra os motivos.
**Entrega:** contrato e frontend compartilhados com API/PostgreSQL reais; gates de segurança, testes, execução limpa e acessibilidade. O Gate A visual/UX continua decisão humana. Três dias de prazo não equivalem a horas dedicadas.

## Problem Statement
A clínica fictícia precisa reservar horários sem conflito, registrar laudos e liberar somente os publicados ao paciente correto. Autorização também em chamadas diretas e cinco cenários automatizados são exigências do desafio.

## Goals
- [ ] Uma reserva ativa por horário, inclusive sob concorrência real.
- [ ] Rascunho → publicação imutável, sem exposição de documento interno ou dado alheio.
- [ ] Jornadas retomáveis por URL/F5, datas de Brasília e portal utilizável a 375 px.
- [ ] Frontend/backend reais e instalação reproduzível sem Docker, com todos os itens DESAFIO §5.

## Out of Scope
| Exclusão | Motivo / limite |
|---|---|
| PDF/anexos/DICOM/assinatura digital/validação clínica | Dispensados; laudo é texto simples. |
| Múltiplas salas/notificações/pagamentos/dark mode | Escopo fechado; template não cria capacidades. |
| Delete/reativação/remarcação por update/transferência/despublicação | Preservar histórico e publicação imutável. |
| Uso clínico real ou deploy presumido | Demo; Docker/deploy opcionais, posteriores e sujeitos a autorização. |

## Assumptions & Open Questions
As escolhas herdadas abaixo integram o Specify aprovado. A aprovação do plano de execução continua separada.
| Assumption / decision | Chosen default | Rationale / origem | Confirmed? |
|---|---|---|---|
| Operação da sala | Três exames fixos; 30 min; todos os dias 07:00–19:00, último início 18:30 | Grade simples; DESAFIO §4.1, D-07/22 | y |
| Futuro/cancelamento com rascunho | Permitir preparo/publicação antes do exame; preservar DRAFT cancelado em leitura STAFF | Não exigir exame realizado nem perder histórico; D-08/09/27 | y |
| Sessão demo | 8 h, logout local, sem refresh/revogação | Simplicidade limitada à demo; D-11/25/36 | y |
| Saves concorrentes | Última gravação DRAFT vence | Sem versionamento contratado; D-28/DT-02 | y |
| Visual sem captura | Preservar resultados/textos e baseline herdado de ARCH §8 | Nenhum mockup binding fornecido; PRD anterior §§10–11/D-13 | y |
| Sequência de entrega | Frontend first/Gate A, backend real e modo sem Docker | Validar uso sem atribuir segurança ao MSW; D-18/21/30/38 | y |
| Organização TLC | PRD, ARCH e TASKS permanecem fontes canônicas, sem cópias por fase | Não duplicar `.specs`; pedido desta revisão/D-40 | y |
**Open questions:** none
Specify aprovado; revisão de Design/Tasks, autorização de implementação e futuros gates permanecem separados. Não são lacunas de comportamento resolvidas por suposição.

### Implicit Requirement Dimensions
| Dimensão | Cobertura ou N/A justificado |
|---|---|
| Input validation & bounds | RN-06/07/16; E1; API §§1–4/7. |
| Failure / partial-failure states | E2–E4; resultado incerto exige reconciliação. |
| Idempotency / retry / duplicates | RN-09/14; E3/E5; sem retry automático/idempotency key. |
| Auth boundaries & rate limits | S1/S2; RN-01…04/23/24; API §5.2. |
| Concurrency / ordering | RN-09/11/14/18…20; E6; API §4/6.1. |
| Data lifecycle / expiry | S2; RN-13/20; seed ARCH §9. Retenção clínica N/A: sem uso real. |
| Observability | E7; health/logs. Tracing/métricas extras N/A: sem demanda/SLA. |
| External-dependency failure | E2/E3, API §5.1. Circuit breaker/fallback externo N/A: não há integração externa. |
| State-transition integrity | RN-11…21; S3/S4; E5/E6. |

## User Stories
O inventário HTTP, campos, schemas, códigos, mensagens de rede e precedências têm fonte única em [API §§2–8](API.md#3-registro-de-rotas-e-schemas). Histórias não recriam wire contract. Cada teste independente usa fixtures próprias; não exige executar a história anterior.

### P1: S1 — Login and navigation
**User Story:** Como equipe ou paciente, quero entrar na área autorizada do meu perfil.
**Why P1:** Autenticação antecede dados privados.
**Acceptance Criteria:**
1. WHEN a pessoa usa atalho demo THEN o login SHALL apenas preencher credenciais, sem autenticar.
2. WHEN “Entrar” conclui login válido THEN a navegação SHALL abrir retorno interno conhecido/compatível ou home do perfil.
3. IF o retorno é externo ou incompatível THEN a navegação SHALL usar a home do perfil.
4. IF a credencial é inválida THEN o login SHALL mostrar “E-mail ou senha incorretos.”.
5. IF o login falha por credencial THEN o formulário SHALL preservar apenas o e-mail entre os dois campos.
6. IF o limite de login é atingido THEN “Entrar” SHALL respeitar a espera de API §5.2.
7. IF o perfil acessa rota incompatível THEN a navegação SHALL retornar à sua home.
8. WHILE falta acesso à tela o cliente SHALL não disparar a consulta proibida.
9. WHEN a pessoa usa URL direta/F5 THEN a jornada SHALL funcionar sem cache ou navegação prévia.
10. IF a URL de tela não existe THEN a aplicação SHALL mostrar “Página não encontrada” com retorno à home adequada.
**Independent Test:** Contas isoladas dos dois perfis: atalhos, submissão, falha, retorno seguro e URL direta; auth real só na B.

### P1: S2 — Session isolation
**User Story:** Como pessoa autenticada, quero sair ou trocar de conta sem revelar dados anteriores.
**Why P1:** Cache e resposta tardia não atravessam identidades.
**Acceptance Criteria:**
1. WHEN há sessão persistida no F5 THEN a aplicação SHALL validar a identidade por API §5.3 antes de dados/consultas privadas.
2. WHILE a restauração está pendente a tela SHALL mostrar shell de carregamento sem dado privado anterior.
3. IF a restauração falha por rede/interno THEN a tela SHALL oferecer “Tentar novamente” e “Sair”, sem liberar conteúdo privado.
4. WHEN há logout, expiração, troca ou substituição externa de sessão THEN a aplicação SHALL zerar o estado privado de ARCH §6.
5. IF a resposta pertence à sessão anterior THEN a aplicação SHALL descartá-la.
6. WHEN a pessoa usa “Sair”, inclusive offline, THEN a navegação SHALL substituir a entrada atual por `/login`.
7. IF uma requisição autenticada recebe falha de sessão de API §7 THEN o login SHALL mostrar “Sua sessão expirou. Entre novamente.”.
8. WHEN ocorre F5 THEN a sessão SHALL manter a expiração original de 8 h.
9. WHILE há sessão local a persistência SHALL conter somente a sessão de API §6.3, nunca senha/filtros/listas/texto clínico.
**Independent Test:** Carregar Ana, deixar request em voo, sair/entrar Bruno e liberá-lo; repetir por storage de outra aba, expiração e logout offline.

### P1: S3 — Schedule, inspect and cancel
**User Story:** Como equipe, quero consultar, reservar e cancelar horários da única sala.
**Why P1:** RF-03/04/05 são a jornada obrigatória de agendamento.
**Acceptance Criteria:**
1. WHEN a equipe consulta agenda THEN a lista SHALL respeitar filtros/intervalo/ordem de API §4.2.
2. WHEN a agenda abre sem data THEN a tela SHALL selecionar hoje em Brasília.
3. WHEN a equipe usa anterior/próxima data THEN a seleção SHALL mudar um dia civil local preservando o paciente; “Hoje” SHALL voltar ao dia atual de Brasília sem limpar esse filtro. A agenda SHALL apresentar data por extenso e marcador “Hoje” somente no dia correspondente.
4. WHEN filtros válidos mudam ou voltam pelo histórico THEN a URL SHALL representar a seleção atual.
5. IF o filtro da URL é inválido THEN a tela SHALL oferecer “Limpar filtros” sem consultar esse filtro.
6. WHEN a agenda é apresentada THEN cada item SHALL mostrar horário/paciente/exame/situação e informação de laudo exclusiva STAFF.
7. WHEN a equipe abre novo agendamento THEN o formulário SHALL começar sem paciente/exame selecionados.
8. WHEN a equipe informa “Data” THEN o controle SHALL aceitar dias civis 0001–9999, sem teto futuro adicional.
9. WHEN a grade carrega THEN a tela SHALL apresentar os horários civis existentes entre 07:00 e 18:30, normalmente 24, omitindo posições inexistentes em transições históricas IANA conforme decisão explícita “Somente horários existentes” de 2026-11-08.
10. WHILE o slot está passado/ocupado seu controle SHALL ficar desabilitado com motivo textual acessível de TESTING §7.
11. WHEN a data muda THEN o formulário SHALL limpar somente o horário selecionado.
12. WHILE a grade carrega, está inválida ou em erro a tela SHALL não oferecer slot acionável.
13. WHEN a criação é confirmada THEN a navegação SHALL abrir a agenda da data sem filtro de paciente.
14. WHEN o novo item aparece após criação confirmada THEN o foco SHALL destacar o registro visível na tabela ou lista mobile com marcador textual “Recém-agendado”, feedback “Exame agendado.” e ação “Abrir agendamento”. URL com foco sem confirmação de criação, leitura pendente/erro ou id ausente SHALL não anunciar sucesso.
15. IF o horário é perdido ou já começou THEN o formulário SHALL preservar paciente/exame/data durante reconciliação.
16. IF o início é inválido THEN a tela SHALL pedir escolha na grade sem arredondar o instante.
17. WHEN a equipe usa “Cancelar” THEN o diálogo SHALL mostrar a confirmação de Interface Contract.
18. WHEN a pessoa usa “Voltar”/Esc antes do envio THEN o diálogo SHALL fechar sem mutação.
19. WHEN cancelar tem sucesso THEN a tela SHALL apresentar o item cancelado após reconciliar agenda/detalhe/grade.
20. IF o item deixou de ser cancelável THEN a tela SHALL mostrar o estado atualizado sem anunciar sucesso.
21. WHEN a equipe reserva horário liberado ainda futuro THEN o sistema SHALL criar novo agendamento, sem reativar o cancelado.
**Independent Test:** Agenda/slots próprios: filtro/URL, criação/perda de slot, cancelar DRAFT e reutilizar; CEN-01/05 exigem Postgres.

### P1: S4 — Draft and publish a report
**User Story:** Como equipe, quero preparar, salvar e publicar resultado imutável ao paciente.
**Why P1:** RF-06/07 e RN-14…21 são obrigatórios.
**Acceptance Criteria:**
1. WHEN o editor abre por id THEN a tela SHALL recuperar detalhe STAFF sem janela/cache da agenda (API §5.9).
2. WHILE o detalhe não está confirmado a tela SHALL não oferecer criação.
3. IF detalhe/leitura de laudo discordam ou falham THEN a tela SHALL reconciliar ambos sem tratar erro interno como ausência.
4. WHEN detalhe confirma agendado sem laudo e a leitura confirma ausência THEN a tela SHALL oferecer formulário vazio com “Salvar rascunho”.
5. WHEN existe DRAFT ativo THEN a tela SHALL oferecer os três campos editáveis de TESTING §7.
6. WHEN “Salvar rascunho” é usado com formulário válido THEN o sistema SHALL persistir os três textos atuais normalizados por RN-16. Os três campos SHALL expor contadores UTF-16 após trim, com limites 120/10.000/120 e associação acessível, sem cortar texto ou salvar automaticamente.
7. WHEN salvar retorna DTO válido THEN o editor SHALL adotar esse conteúdo como baseline na rota do agendamento e anunciar “Rascunho salvo.”. Ao editar novamente SHALL mostrar “Alterações não salvas” sem sucesso antigo; falha de gravação SHALL preservar texto bruto, dirty e proteção de abandono.
8. WHILE falta rascunho salvo, há dirty ou formulário inválido “Publicar” SHALL ficar indisponível.
9. IF há alteração não salva para publicação THEN a tela SHALL mostrar “Salve o rascunho antes de publicar.”.
10. WHEN “Publicar” é usado em DRAFT elegível THEN a tela SHALL abrir a confirmação de Interface Contract com paciente/exame/data, título, profissional e texto literal da última versão salva/reconciliada do mesmo agendamento, sem mutação implícita. A revisão SHALL rolar internamente para textos longos mantendo “Voltar”/“Publicar laudo” alcançáveis e foco inicial seguro.
11. WHEN “Publicar laudo” é confirmado THEN o sistema SHALL somente publicar o rascunho salvo.
12. WHEN publicar tem sucesso válido THEN a tela SHALL trocar editor por leitura com “Publicado em”/horário de Brasília.
13. WHILE o laudo está publicado a tela SHALL apresentar leitura imutável com o aviso de Interface Contract.
14. WHILE o agendamento está cancelado a tela SHALL apresentar o estado bloqueado de Interface Contract, incluindo DRAFT só para STAFF.
15. WHEN há dirty e navegação interna THEN a aplicação SHALL exigir confirmação de descarte.
16. WHEN há dirty e F5/fechamento da aba THEN o navegador SHALL apresentar aviso nativo.
17. WHILE salvar/publicar está pendente a aplicação SHALL bloquear abandono por navegação interna.
18. IF ocorre conflito de estado THEN o editor SHALL manter o texto não salvo em memória durante reconciliação.
19. IF continua editável THEN “Recarregar rascunho” SHALL exigir confirmação antes de descartar alterações.
20. IF ficou bloqueado THEN a tela SHALL mostrar leitura canônica com aviso de alterações não salvas, sem forçar escrita.
21. WHEN o id da rota muda THEN a tela SHALL descartar conteúdo/edição do id anterior.
**Independent Test:** URL antiga sem cache, salvar/editar/publicar exame futuro, desistir, conflito e bloqueios; banco real prova RN-14…21.

### P1: S5 — Patient portal
**User Story:** Como paciente, quero consultar meus exames e somente meus resultados publicados.
**Why P1:** RF-08 exige privacidade em lista, leitura e URL direta.
**Acceptance Criteria:**
1. WHEN o paciente abre a lista THEN a tela SHALL mostrar histórico próprio completo, agendado/cancelado, na ordem de API §4.2, agrupado por mês e ano do exame em Brasília sem reordenar ou omitir registros.
2. WHEN há publicado THEN o item SHALL oferecer “Laudo disponível” e “Ver laudo”.
3. WHILE não há publicado o item SHALL ser idêntico entre ausência/DRAFT, sem id/estado/contador/metadado de laudo.
4. WHEN o leitor é aberto por link/URL THEN a tela SHALL mostrar exame/título/texto simples com quebras/profissional/data do exame/“Publicado em”.
5. IF o registro é alheio/inexistente/sem laudo/DRAFT THEN o leitor SHALL mostrar o mesmo “Não encontramos este registro” e “Voltar para meus exames”.
6. IF a leitura falha por rede/interno THEN o leitor SHALL oferecer recuperação distinta do registro indisponível.
7. WHEN ocorre novo carregamento/foco/reconexão THEN a lista/leitura SHALL refletir publicação recebida da API, sem reload manual ou promessa de tempo real.
**Independent Test:** Ana/Bruno isolados: quatro casos opacos em lista/DOM/rede e leitura própria publicada; CEN-02/03/04 reais.

### P1: S6 — Shared interface states
**User Story:** Como pessoa usuária, quero entender estados e operar por teclado/celular.
**Why P1:** Endpoints não bastam para completar jornadas.
**Acceptance Criteria:**
1. WHILE uma leitura carrega a tela SHALL anunciar loading sem resultado anterior apresentado como atual.
2. IF lista/grade está vazia THEN a tela SHALL mostrar o vazio de Interface Contract.
3. WHEN “Tentar novamente” é usado na leitura THEN a tela SHALL refazê-la mantendo filtros válidos.
4. IF o formulário é inválido THEN a interface SHALL associar erros aos campos, com resumo.
5. WHEN a validação falha THEN o foco SHALL alcançar o primeiro campo inválido.
6. WHEN a navegação termina THEN o foco SHALL alcançar o h1.
7. WHEN o diálogo fecha THEN o foco SHALL retornar ao gatilho.
8. WHILE um diálogo está aberto o foco SHALL ficar contido nele, inicialmente na opção não destrutiva.
9. WHEN a tela é usada a 375 px ou zoom de 200% THEN conteúdo/ações SHALL permanecer legíveis sem scroll horizontal/corte.
10. WHILE o envio está pendente o formulário SHALL impedir duplo envio.
11. WHILE o envio está pendente o formulário SHALL bloquear alteração dos campos enviados.
12. WHEN a mutação recebe DTO válido de sucesso THEN a tela SHALL anunciar seu feedback de Interface Contract.
**Independent Test:** Componentes reais, loading/vazio/erro, teclado/leitor/foco, viewport e zoom; axe complementa revisão manual.

### P1: S7 — Patient administration
**User Story:** Como equipe, quero cadastrar pacientes e corrigir nome/e-mail sem alterar seus exames ou sua identidade.
**Why P1:** Decisão posterior de produto incluiu cadastro e gestão administrativa; não é cadastro público.
**Acceptance Criteria:**
1. WHEN STAFF abre `/pacientes` THEN a tela SHALL listar pacientes e oferecer “Novo paciente” e “Editar paciente”.
2. WHEN STAFF cadastra nome, e-mail e senha válidos THEN o sistema SHALL criar uma identidade PATIENT e retornar somente o DTO de paciente.
3. WHEN nome/e-mail são recebidos THEN o sistema SHALL normalizá-los conforme API; nome SHALL ter 3–120 unidades UTF-16 após trim.
4. WHEN a senha inicial é recebida THEN o sistema SHALL preservar seu valor literal, exigir ao menos 8 unidades UTF-16 e no máximo 72 bytes UTF-8 antes do hash bcrypt.
5. IF o e-mail já pertence a qualquer conta THEN o sistema SHALL retornar `409 EMAIL_TAKEN`, sem alterar a conta existente.
6. WHEN STAFF edita nome/e-mail THEN o sistema SHALL preservar id, role, senha, agendamentos e laudos; omissões SHALL manter seus valores.
7. IF PATIENT ou pessoa sem sessão chama as rotas administrativas diretamente THEN o backend SHALL negar acesso com 403 ou 401, respectivamente.
8. WHEN a conta cadastrada faz login THEN o portal SHALL apresentar somente seus próprios dados, inicialmente sem exames.
9. IF o cadastro/edição falha THEN a tela SHALL associar o erro aos campos e preservar os dados locais sem persistir senha em storage.
10. WHEN o cadastro/edição é confirmado THEN listas e seletores SHALL refletir a identidade atualizada, sem exigir reload manual.
**Independent Test:** STAFF cadastra e edita; duplicação/validação/perfil não escrevem; nova conta autentica e não recebe dados dos pacientes existentes.

## Edge Cases
E1…E7 identificam as linhas abaixo.
1. IF a entrada viola formatos/limites/precedência THEN o sistema SHALL responder exatamente como API §§1–4/7, sem escrita parcial. <!-- E1 -->
2. IF a resposta viola seu schema THEN o cliente SHALL mostrar falha segura, nunca sucesso/ausência/JSON recebido. <!-- E2 -->
3. IF uma mutação de agendamento ou laudo tem resultado incerto THEN a aplicação SHALL refazer leituras antes de permitir nova tentativa, sem retry automático. <!-- E3 -->
4. IF uma mutação de agendamento ou laudo falha THEN o formulário SHALL manter dados locais em memória. <!-- E4 -->
5. WHEN uma ação é repetida THEN o sistema SHALL respeitar duplicidade/repetição de API §§4.3/5/6.1, sem sucesso idempotente inventado. <!-- E5 -->
6. WHEN transições concorrentes terminam THEN o sistema SHALL manter resultados legais de API §6.1, nunca cancelado+publicado. <!-- E6 -->
7. WHEN há diagnóstico THEN logs SHALL conter só metadados sanitizados de ARCH §10, nunca senha/token/conexão/texto clínico. <!-- E7 -->

## Requirement Traceability
Rastreabilidade dos requisitos originais e do complemento autorizado. Estados são atualizados somente após provas correspondentes; planejamento e contagem de testes não concedem aceite. [TESTING](TESTING.md) mantém os cenários e a evidência.
| Requirement ID | Requisito | Story / AC | Status |
|---|---|---|---|
| RF-01 | Login e-mail/senha e atalhos demo. | S1.1–6 | Pending |
| RF-02 | Logout/expiração de 8 h. | S2.1–9 | Pending |
| RF-03 | STAFF seleciona paciente/exame/data/slot de 30 min. | S3.7–16 | Pending |
| RF-04 | Agenda STAFF filtrada por data/paciente. | S3.1–6 | Pending |
| RF-05 | Cancelar com confirmação. | S3.17–21 | Pending |
| RF-06 | Criar/editar rascunho: título/texto/profissional. | S4.1–7/14–21 | Pending |
| RF-07 | Publicar com confirmação de irreversibilidade. | S4.8–13 | Pending |
| RF-08 | Lista própria e leitura própria publicada. | S5.1–7 | Pending |
| RF-09 | Cadastro e edição administrativa de pacientes por STAFF. | S7.1–10 | Pending |
| RN-01 | STAFF/PATIENT; seed, sem cadastro público. | S1; Out of Scope | Pending |
| RN-02 | JWT obrigatório, exceto login/health (API §§3/5.2). | S1; E1 | Pending |
| RN-03 | STAFF obrigatório nas rotas de equipe. | S1.7–8; API §3 | Pending |
| RN-04 | Identidade do token, dados próprios, alheio opaco. | S5.1/5; API §6.2 | Pending |
| RN-05 | Pelo menos três exames; fixos três no seed; 30 min. | S3.7/9; ARCH §9 | Pending |
| RN-06 | hh:00/hh:30 Brasília, segundos/ms zero. | S3.9/16; API §4.1 | Pending |
| RN-07 | 07:00–19:00, último início 18:30. | S3.9/16 | Pending |
| RN-08 | startsAt≤now não agendável. | S3.10/15; API §4.1 | Pending |
| RN-09 | Uma sala, um SCHEDULED por slot concorrente. | S3.13/15; E6 | Pending |
| RN-10 | Cancelar libera slot ainda futuro. | S3.19/21 | Pending |
| RN-11 | Cancelar só SCHEDULED sem publicado; passado permitido. | S3.17–20; API §4.3 | Pending |
| RN-12 | Cancelar preserva DRAFT bloqueado. | S3.19; S4.14 | Pending |
| RN-13 | Definitivo; reagendar cria novo id. | S3.21; E5 | Pending |
| RN-14 | No máximo um laudo/agendamento. | S4.4; E5; API §6.1 | Pending |
| RN-15 | Criar/editar/publicar exige SCHEDULED. | S4.14/20; E1 | Pending |
| RN-16 | Trim antes: título/profissional 3–120, texto 10–10.000 UTF-16; preservar espaços internos/quebras. | S4.5–6; E1; API §2.1 | Pending |
| RN-17 | Nasce DRAFT, publicação nula. | S4.6; API §5.11 | Pending |
| RN-18 | Só DRAFT editável. | S4.5/13–14/20; E6 | Pending |
| RN-19 | DRAFT→PUBLISHED, publishedAt registrado, irreversível. | S4.11–12; API §5.14 | Pending |
| RN-20 | Publicado sem editar/excluir/despublicar. | S4.13; E5/E6 | Pending |
| RN-21 | Futuro permite criar/editar/publicar. | S4; API §4.1 | Pending |
| RN-22 | Próprios agendados/cancelados; indicador só publicado. | S5.1–3 | Pending |
| RN-23 | Só PUBLISHED ao paciente; DRAFT igual a ausente em UI/API. | S5.3/5; API §5.16 | Pending |
| RN-24 | Sem passwordHash ou dado alheio ao paciente nas respostas. | S2.4–5; S5; API §6.2 | Pending |
| RN-25 | UTC armazenado; exibir Brasília com indicação, independente do host/browser. | S3.2–3; S4.12; Interface Contract | Pending |
**Coverage:** requisitos originais RF-01…08/RN-01…25 e complemento RF-09 possuem critérios rastreáveis. O parecer de execução e seus limites pertencem a TESTING.

## Route Map
| Rota de tela | Perfil / resultado |
|---|---|
| `/`, `/login` | STAFF home `/agenda`, PATIENT `/meus-exames`; sem sessão, login: “E-mail”/“Senha”/“Entrar”, três atalhos e aviso fictício. |
| `/agenda?date=YYYY-MM-DD&patientId=UUID` | STAFF: data/paciente opcional; “Novo agendamento” preserva data. |
| `/agendamentos/novo?date=YYYY-MM-DD` | STAFF: paciente→exame→data→horário→“Agendar exame”. |
| `/pacientes` | STAFF: lista, cadastro e edição de nome/e-mail; sem exclusão, reset de senha ou mudança de perfil. |
| `/agendamentos/:id/laudo` | STAFF: detalhe/laudo independente da agenda. |
| `/meus-exames`, `/meus-exames/:id/laudo` | PATIENT: histórico/leitor; id do agendamento, não do laudo. |
| `/_ds` | Só dev: catálogo/estados e controles injetados, sem importar mock. |

## Interface Contract
Baseline textual existente, não mockup binding. [TESTING §7](TESTING.md#7-contrato-de-testabilidade-da-ui) conserva labels/nomes acessíveis/seletores; ARCH §8 conserva tokens, fontes, logo, medidas e componentes herdados, ainda sem homologação visual.
- Marca “Dr. Laudo”; slogan “Do agendamento ao laudo, sem complicação.”; rodapé em toda página: “Projeto fictício para desafio técnico · dados de demonstração”. Linguagem clara, calma e direta.
- Situação “Agendado”/“Cancelado”; laudo separado só STAFF: “Sem laudo”/“Rascunho”/“Publicado”. Ativo sem laudo: “Criar laudo”; DRAFT: “Editar laudo”; publicado: “Ver laudo”, sem cancelar; cancelado: “Ver agendamento” bloqueado.
- Cancelar: “Cancelar este agendamento? O cancelamento é definitivo e o horário ficará disponível.”, paciente/exame/data e, com DRAFT, “O rascunho será preservado e ficará bloqueado.”; ações “Voltar”/“Cancelar agendamento”.
- Publicar: “Publicar laudo?”, exame/paciente, “Depois de publicado, o laudo não poderá ser editado.” e “O paciente poderá consultar este laudo.”; “Voltar”/“Publicar laudo”. Sem autosave ou save+publish oculto.
- Publicado: “Este laudo foi publicado e não pode ser alterado.”. Cancelado sem laudo: “Agendamento cancelado. Não é possível cadastrar laudo.”; com DRAFT: “O agendamento foi cancelado; o laudo está bloqueado.”.
| Situação | Apresentação e recuperação |
|---|---|
| Agenda vazia/erro | “Nenhum agendamento para os filtros selecionados.”, limpar/novo; “Não foi possível carregar a agenda.”, retry/filtros mantidos. |
| Grade sem livres/erro | “Não há horários disponíveis nesta data. Escolha outra data.”; erro tem retry, sem slot acionável. |
| Portal vazio/erro | “Você ainda não tem exames agendados.”; “Não foi possível carregar seus exames.”, retry. |
| Sucesso | “Exame agendado.”/“Agendamento cancelado.”/“Rascunho salvo.”/“Laudo publicado.”, conforme ação. |
| Slot perdido | “Este horário acabou de ser ocupado. Escolha outro.”; limpar só slot/refazer grade/invalidar agenda. |
| Passado/inválido | “Não é possível agendar em um horário que já passou.”/“Escolha um horário entre 07:00 e 18:30, de 30 em 30 minutos.”; refazer grade. |
| Conflito de laudo | “Este agendamento já possui um laudo.”/“Este laudo já foi publicado e não pode ser alterado.”/aviso cancelado; refazer detalhe/laudo. |
| Cancelar recusado/login limitado | “Este agendamento não pode mais ser cancelado.”/“Muitas tentativas. Aguarde um minuto.”; reconciliar/esperar mantendo e-mail. |
| Validação/permissão/registro | Erro por campo/resumo; “Você não tem permissão para esta ação.” e home sem retry; “Não encontramos este registro” e lista adequada. |
| Rede/interno/schema | “Algo deu errado. Tente novamente em instantes.”; leitura retry, mutação reconciliada; sem stack/JSON recebido/código cru. |
- Acessibilidade: h1 único/landmarks/“Pular para o conteúdo”, labels visíveis/nomes em controles, aria-describedby/aria-invalid, loading sem roubar foco e erro persistente além do toast. Status/slot com texto/ícone/estado acessível, não só cor ou tooltip desabilitado.
- Meta WCAG 2.1 AA, não certificação: teclado/leitor/foco/reflow/zoom de 200%/movimento reduzido, axe e contraste WebAIM medido antes de alegação pública. Tabela desktop/cards mobile, sem corte a 375 px; baseline completo em ARCH §8.3.

## Differences from the source
O núcleo do enunciado é preservado. O cadastro e a edição administrativa de pacientes são um complemento explicitamente incluído pela usuária; não são apresentados como exigência original do teste. Sem cadastro público, exclusão de paciente ou recuperação/reset de senha. As demais decisões herdadas permanecem em Assumptions/DECISIONS.

## Sources
- [DESAFIO](DESAFIO.md), §§1–5: autoridade, cenários e entrega; “Vive coding” é o termo literal do uso de IA.
- [API](API.md): wire contract; [ARCHITECTURE](ARCHITECTURE.md): desenho herdado/locks/seed/env; [DECISIONS](DECISIONS.md): motivos/limites; [TESTING](TESTING.md): provas.
- [AGENTS](../AGENTS.md): engenharia/alçada; [AI_USAGE](AI_USAGE.md): autoria/processo/tempo factual.

## Success Criteria
- [ ] A: jornadas/estados MSW observados, celular real e aprovação visual/UX explícita de produto. Não prova JWT/auth/índice/lock.
- [ ] B: 33 RF/RN, CEN-01…05/RACE-01…04 reais, quatro 404 idênticos e ausência de cancelado+publicado.
- [ ] C: unidade/componentes/integração e E2E separados, CI, produção sem mock/worker, a11y e modo sem Docker comprovados; medir meta de instalação/execução <5 min.
- [ ] DESAFIO §5 completo: código/instruções/banco/seed/credenciais/testes/env sem segredo/decisões/limitações/pendências/tempo factual e tabela de provas. Extras não substituem backend/testes.

## Risks and Release Boundaries
Vermelho bloqueia entrega: privacidade/rascunho/cache ou integridade concorrente, mitigados por DTO/filtro/reset e provas reais. Alto: token local/XSS/não revogação(DT-01), mock divergente/em produção; texto escapado/CSP/8h/build limpo limitam risco só da demo. Médio: fuso, sobrescrita DRAFT/demo envelhecida(DT-02/03); clock/helper único, reconciliação e QA independente.
Coordenação integra; frontend mantém as jornadas, backend as regras/locks, QA suas provas e entrega/operação a execução reproduzível. A autorização de correção não equivale a aceite de produto, commit, push, publicação ou permissão para dados clínicos reais.

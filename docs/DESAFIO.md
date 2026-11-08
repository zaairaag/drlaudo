# Desafio técnico

> Transcrição do [PDF original arquivado no histórico](https://github.com/zaairaag/drlaudo/blob/4dbe7f9/teste-agendamento-exames-laudos.pdf). O PDF foi removido da pasta local; o conteúdo do enunciado permanece aqui. Somente quebras de linha e listas foram normalizadas.
>
> Precedência: **enunciado → PRD → demais documentos**. O [PRD](PRD.md) detalha as regras e [AGENTS](../AGENTS.md) concentra as instruções de implementação. Não mudar requisitos por uma divergência de transcrição.

<!-- Início da transcrição do PDF -->

## Agendamento de exames e acesso a laudos

## 1. Contexto

Desenvolva uma aplicação web simplificada para uma clínica. O sistema deve permitir agendar exames, cadastrar seus laudos e disponibilizá-los para consulta pelo paciente. Prazo para entrega: 3 dias.

## 2. Tecnologias

- Frontend com React e TypeScript.
- Backend com Node.js e TypeScript, usando o framework de sua preferência.
- Banco de dados de sua escolha.

**Vive coding** é requisito fundamental para a entrega deste teste.

## 3. Perfis de acesso

O sistema deve ter dois perfis:

- **Equipe da clínica:** agenda exames, consulta agendamentos e cadastra ou publica laudos.
- **Paciente:** consulta seus próprios agendamentos e os laudos publicados dos seus exames.

Implemente um mecanismo simples de autenticação. A autorização deve ser verificada pelo backend, inclusive quando uma requisição for feita diretamente à API.

## 4. Funcionalidades obrigatórias

### 4.1 Agendamento de exames

A equipe da clínica deve conseguir:

- Selecionar um paciente cadastrado.
- Selecionar um tipo de exame.
- Informar data e horário.
- Consultar e filtrar os agendamentos por data e paciente.
- Cancelar um agendamento.

Disponibilize pelo menos três tipos de exame, como raio-X, ultrassom e ressonância magnética. Considere uma única sala, com horários fixos de 30 minutos, independentemente do tipo de exame.

**Regras:**

- Não permitir agendamentos no passado.
- Não permitir dois agendamentos ativos no mesmo horário.
- Permitir reutilizar o horário de um agendamento cancelado.
- Exibir datas e horários de forma consistente, documentando o fuso horário adotado.

### 4.2 Cadastro e publicação de laudos

A equipe da clínica deve conseguir abrir um agendamento e cadastrar um laudo com:

- Título.
- Texto do laudo.
- Nome do profissional responsável.

O laudo deve poder ser salvo como **rascunho** e posteriormente **publicado**.

**Regras:**

- Cada agendamento pode ter apenas um laudo.
- Rascunhos podem ser editados e ficam disponíveis somente para a clínica.
- Laudos publicados ficam disponíveis para o paciente correspondente.
- Para simplificar, laudos publicados não podem ser editados.
- Agendamentos cancelados não podem receber laudos.
- Agendamentos com laudo publicado não podem ser cancelados.
- Registrar a data de publicação.

Não é necessário gerar PDF, receber anexos, implementar assinatura digital ou validar o conteúdo clínico.

### 4.3 Acesso do paciente

O paciente deve conseguir:

- Consultar seus próprios agendamentos, com tipo de exame, data e situação.
- Identificar quais exames possuem laudo publicado (não rascunhos).
- Abrir e ler seus laudos publicados.
- Um paciente não pode acessar agendamentos ou laudos de outro paciente.

### 4.4 Testes automatizados

Além dos testes unitários, inclua testes relevantes para os seguintes cenários:

1. Duas tentativas simultâneas de agendamento no mesmo horário: apenas uma deve ser aceita.
2. Um paciente tenta consultar um laudo de outro paciente: o acesso deve ser negado.
3. Um paciente tenta acessar um rascunho: seu conteúdo não deve ser disponibilizado.
4. Um laudo é publicado e passa a estar disponível para o paciente correto.
5. Uma tentativa de agendar no passado é rejeitada.

## 5. Entrega

Compartilhe um repositório ou arquivo compactado contendo:

- Código do frontend e do backend.
- Instruções para instalar e executar.
- Instruções para preparar o banco e carregar dados fictícios.
- Credenciais das contas de demonstração.
- Instruções para executar os testes.
- Arquivo de exemplo das variáveis de ambiente, sem segredos reais.
- Decisões técnicas, limitações e pendências.
- Tempo aproximado dedicado ao exercício.

<!-- Fim da transcrição do PDF -->

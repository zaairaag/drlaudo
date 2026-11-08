---
description: Revisa o diff atual contra as invariantes do projeto
---

**Referências:** [enunciado original](../../teste-agendamento-exames-laudos.pdf) · [PRD — requisitos e regras de negócio](../../docs/PRD.md) · [RULES — regras de implementação](../../docs/RULES.md).

Revise `git diff main...HEAD` como um revisor sênior cético. Para cada item, responda **OK**, **FALHA (arquivo:linha)** ou **N/A**:

1. Conflito de horário depende do índice único parcial e trata `P2002` → 409? Existe algum "SELECT antes do INSERT"?
2. Operações que envolvem agendamento e laudo usam `$transaction` + `SELECT ... FOR UPDATE`?
3. O id do paciente vem só de `request.user.sub`?
4. Recurso alheio ou rascunho retorna 404 (não 403, não 200 vazio)?
5. Toda resposta usa DTO/`select` explícito? Algum risco de `passwordHash`?
6. Datas: `clock.now()`, UTC na API, `America/Sao_Paulo` na exibição?
7. Laudo publicado continua imutável?
8. A UI do paciente revela rascunho de alguma forma (contagem, badge, request)?
9. Há `any`, `@ts-ignore`, `eslint-disable`, `.only`, `.skip`, hex solto ou dependência não registrada?
10. Os testes cobrem erro e borda, não só o caminho feliz? Algum teste foi enfraquecido?
11. `docs/API.md` e demais docs batem com o código?

Termine com: **bloqueadores**, **sugestões** e **o que eu não consegui verificar**.

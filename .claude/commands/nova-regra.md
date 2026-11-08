---
description: Implementa uma regra de negócio (RN-xx) com teste primeiro
argument-hint: RN-xx [contexto opcional]
---

**Referências:** [enunciado original](../../teste-agendamento-exames-laudos.pdf) · [PRD — requisitos e regras de negócio](../../docs/PRD.md) · [RULES — regras de implementação](../../docs/RULES.md).

Implemente a regra **$ARGUMENTS** seguindo exatamente este fluxo:

1. Leia a RN em `docs/PRD.md` e as seções relacionadas de `docs/API.md` e `docs/RULES.md`.
2. Liste os casos de teste (feliz, erro, borda), com o status HTTP e o `error.code` esperados.
3. Escreva os testes de integração e **rode**. Mostre que falham pelo motivo certo.
4. Implemente a menor mudança possível, respeitando as camadas routes → service → domain.
5. Rode `npm run lint && npm run typecheck && npm test`.
6. Atualize `docs/API.md` se o contrato mudou.
7. Responda com: arquivos alterados, testes adicionados, resultado dos comandos e sugestão para `docs/AI_USAGE.md`.

Se a RN for ambígua ou conflitar com outra, **pare e pergunte** antes de codar.

# API — Dr. Laudo

**Referências:** [enunciado original](../teste-agendamento-exames-laudos.pdf) · [PRD — requisitos e regras de negócio](PRD.md) · [RULES — regras de implementação](RULES.md).

Base: `/api` (via Nginx) ou `http://localhost:3333` (direto). JSON, datas em ISO 8601 UTC.
Auth: `Authorization: Bearer <token>`. Erros no formato `RULES.md` §3.

## Resumo

| Método | Rota | Perfil | RNs |
|---|---|---|---|
| GET | `/health` | público | — |
| POST | `/auth/login` | público | RN-01 |
| GET | `/auth/me` | autenticado | RN-02 |
| GET | `/patients` | STAFF | RN-03 |
| GET | `/exam-types` | STAFF | RN-05 |
| GET | `/slots?date=` | STAFF | RN-06, RN-07, RN-08, RN-09 |
| POST | `/appointments` | STAFF | RN-06 a RN-09 |
| GET | `/appointments?date=&patientId=` | STAFF | RN-03 |
| POST | `/appointments/:id/cancel` | STAFF | RN-10 a RN-13 |
| POST | `/appointments/:id/report` | STAFF | RN-14 a RN-17, RN-21 |
| GET | `/appointments/:id/report` | STAFF | — |
| PATCH | `/reports/:id` | STAFF | RN-15, RN-16, RN-18 |
| POST | `/reports/:id/publish` | STAFF | RN-15, RN-19, RN-20 |
| GET | `/me/appointments` | PATIENT | RN-04, RN-22 |
| GET | `/me/appointments/:id/report` | PATIENT | RN-04, RN-23 |

## Detalhes

### `GET /health`
`200 { "status": "ok", "db": "ok" }` · `503` se o banco cair.

### `POST /auth/login`
```json
{ "email": "equipe@drlaudo.test", "password": "Demo@1234" }
```
`200`
```json
{ "token": "eyJ...", "user": { "id": "uuid", "name": "Equipe Dr. Laudo", "email": "equipe@drlaudo.test", "role": "STAFF" } }
```
`400 VALIDATION_ERROR` · `401 UNAUTHORIZED` (mensagem genérica) · `429 RATE_LIMITED`

### `GET /auth/me`
`200 { "id", "name", "email", "role" }` · `401`

### `GET /patients`
`200 [{ "id", "name", "email" }]` ordenado por nome · `401` · `403`

### `GET /exam-types`
`200 [{ "id", "code", "name" }]`

### `GET /slots?date=2026-11-10`
Dia local da clínica. `200`
```json
{ "date": "2026-11-10", "timezone": "America/Sao_Paulo",
  "slots": [ { "startsAt": "2026-11-10T10:00:00.000Z", "available": true },
             { "startsAt": "2026-11-10T10:30:00.000Z", "available": false, "reason": "TAKEN" } ] }
```
`reason`: `TAKEN` | `PAST`. São 24 slots (07:00–18:30). `400` com data inválida.

### `POST /appointments`
```json
{ "patientId": "uuid", "examTypeId": "uuid", "startsAt": "2026-11-10T13:00:00.000Z" }
```
`201`
```json
{ "id": "uuid", "startsAt": "...", "status": "SCHEDULED",
  "patient": { "id", "name" }, "examType": { "id", "name" }, "report": null }
```
`400 VALIDATION_ERROR` · `404 NOT_FOUND` (paciente/exame inexistente) · `409 SLOT_TAKEN` · `422 PAST_DATE` · `422 INVALID_SLOT`

A ordem das validações é: formato (400) → existência (404) → slot válido (422 `INVALID_SLOT`) → passado (422 `PAST_DATE`) → INSERT (409).

### `GET /appointments?date=YYYY-MM-DD&patientId=uuid`
Filtros opcionais e combináveis. Sem `date`, retorna os próximos 30 dias. Ordenado por `startsAt`.
`200 [{ "id", "startsAt", "status", "patient": {id,name}, "examType": {id,name}, "report": { "id", "status" } | null }]`

### `POST /appointments/:id/cancel`
Sem corpo. `200` (agendamento atualizado) · `404` · `409 CANNOT_CANCEL`

### `POST /appointments/:id/report`
```json
{ "title": "Raio-X de tórax", "body": "Campos pulmonares sem alterações...", "professionalName": "Dra. Marina Costa" }
```
`201 { "id", "appointmentId", "title", "body", "professionalName", "status": "DRAFT", "publishedAt": null, "updatedAt" }`
`400` · `404` · `409 REPORT_EXISTS` · `409 APPOINTMENT_CANCELED`

### `GET /appointments/:id/report`
`200` (laudo, qualquer status) · `404` se o agendamento ou o laudo não existir.

### `PATCH /reports/:id`
Corpo parcial com os mesmos campos (pelo menos um). `200` · `400` · `404` · `409 REPORT_LOCKED` · `409 APPOINTMENT_CANCELED`

### `POST /reports/:id/publish`
Sem corpo. `200` (com `status: "PUBLISHED"` e `publishedAt`) · `404` · `409 REPORT_LOCKED` (já publicado) · `409 APPOINTMENT_CANCELED`

### `GET /me/appointments`
`200 [{ "id", "startsAt", "status", "examType": {id,name}, "hasPublishedReport": true }]`
Nunca inclui id, status ou existência de rascunho.

### `GET /me/appointments/:id/report`
`200 { "title", "body", "professionalName", "publishedAt", "examType": {name}, "startsAt" }`
`404 NOT_FOUND` quando o agendamento é de outro paciente, não existe, não tem laudo ou o laudo é rascunho. A resposta é **byte a byte idêntica** nos quatro casos.

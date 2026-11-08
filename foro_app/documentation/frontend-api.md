# Frontend ↔ API — guia para quem desenvolve o frontend

Este é o contrato entre o frontend e o backend. **Toda chamada HTTP do frontend passa por `frontend/src/api.ts`** — telas e componentes só importam funções prontas (`leadsApi.list(...)`, `lookupApi.cpf(...)`) e os tipos. Se a tela precisa de algo novo do servidor, primeiro entra uma função em `api.ts`.

- Catálogo de todas as funções (gerado do código): seção [Catálogo](#catálogo) abaixo.
- Detalhe de cada rota HTTP (corpo, respostas, erros): [api-reference.md](./api-reference.md).
- Padrões visuais e de UX: [diretrizes-frontend.md](./diretrizes-frontend.md).

## Como o sistema roda

| | |
|---|---|
| **Frontend** | SPA em React 18 + TypeScript + Vite + Tailwind; React Router 6; React Query 5 para dados do servidor; Axios para HTTP. |
| **Backend** | Node/Express + MySQL 8, multi-escritório (cada usuário logado está num escritório; o backend filtra tudo por ele). |
| **Produção** | `npm run build` gera os arquivos em `backend/dist`, e **o próprio Express serve a SPA** (`/assets` com cache longo, demais caminhos → `index.html`; início/privacidade/termos vêm pré-renderizados). Frontend e API ficam no mesmo domínio: a API é sempre `/api/...`, sem CORS. O `docker compose up -d --build` faz o build do frontend dentro da imagem. |
| **Desenvolvimento** | API em `http://localhost:3040`; `cd frontend && npm run dev` abre o Vite em `http://localhost:5173` com proxy de `/api` para a API. |

## Responsabilidades

**Backend: regras e dados.** Autenticação (JWT), escritório de cada usuário, permissões, módulos ligados por conta, planos/cotas/limites, validação, integrações externas (Direct Data, DJEN/DataJud, Google, Stripe, S3, IA), geração de arquivos (planilhas, PDFs, documentos), jobs em segundo plano. **Toda regra de negócio e toda checagem de acesso é feita no servidor**: o frontend esconder um botão é só conforto; a API recusa de qualquer jeito.

**Frontend: telas e experiência.** Layout, navegação, formulários, estados de carregando/erro/vazio, mensagens. Lê o que o usuário pode fazer para **mostrar ou esconder** coisas, sem recalcular regra de negócio (preço, cota, quem vê o quê): esses números vêm prontos da API.

**`src/api.ts`: a ponte.** Cliente Axios configurado + uma função por rota + os tipos TypeScript das respostas. É o único arquivo que conhece URLs.

## Estrutura do frontend

```
frontend/src/
  api.ts            ← TODAS as chamadas HTTP e os tipos (fonte canônica); types/index.ts só reexporta
  App.tsx           ← rotas (React Router)
  main.tsx          ← QueryClient, providers
  context/          ← AuthContext (usuário/token do app), AdminAuthContext (painel /admin), ChatContext (IA)
  hooks/            ← useAuth, useCan (permissões), useModuleEnabled (módulos da conta), useLeads
  config/           ← featureFlags.ts (LOCKED_FEATURES = "Em breve"), consulting.ts (link do plano Consulting)
  lib/              ← utilidades sem HTTP (download.saveFile, datas/etapas/prazos, markdown)
  components/       ← componentes reutilizáveis (Layout, LeadImport, ProcessSnapshotView, GoogleCalendarButton…)
  pages/            ← telas (CRM, processos, agenda, pesquisa, admin…)
```

Verificação feita em 07/11/2026: **nenhum arquivo fora de `api.ts` usa `fetch`, `axios` ou monta URL de `/api`**, e as 233 funções do `api.ts` cobrem todas as rotas que o frontend usa. As únicas rotas sem função são as que o navegador ou terceiros chamam direto (callback do Google, webhooks do Stripe/NFE.io).

## Regras para mexer no `api.ts`

1. **Nada de `fetch`/`axios` em tela ou componente.** Precisa de dado novo → função nova no objeto `xxxApi` certo (ou um objeto novo), com tipo de retorno.
2. **Tipos ficam no `api.ts`**, junto da função (`export interface …`). Telas importam de `'../api'`.
3. As funções devolvem **só o corpo** (`.then(r => r.data)`), já no formato que a tela usa.
4. Documente com um JSDoc curto acima da função (aparece no catálogo).
5. Depois de mudar o `api.ts` ou as rotas: `cd frontend && npm run docs:api` atualiza o catálogo abaixo (`npm run docs:api:check` só confere se está em dia).
6. Rota nova no backend → também entra em `api-reference.md`.

## O que o cliente HTTP já faz sozinho (interceptors do `api.ts`)

| Situação | Comportamento |
|---|---|
| Toda requisição | Envia `Authorization: Bearer <foro_token>` (localStorage). |
| `401` fora de `/auth/*` | Sessão expirou: apaga token/usuário e vai para `/login`. |
| `403 TRIAL_EXPIRED` / `SUBSCRIPTION_EXPIRED` | Vai para `/planos?expirado=1`. |
| `403 EMAIL_NOT_VERIFIED` | Vai para `/verify-email`. |
| `403 MODULE_DISABLED` | Vai para `/modulo-desativado` com a mensagem. |
| Painel da plataforma (`adminApi`) | Cliente separado (`httpAdmin`, token `foro_admin_token`); `401` → `/admin/login`. Nunca misturar com o app do escritório. |

Qualquer outro erro chega na tela (`onError` do React Query).

## Formato dos erros

```json
{ "error": "Mensagem pronta para mostrar ao usuário", "code": "CODIGO_OPCIONAL", "...": "campos extras" }
```
Mostre `error.response.data.error` (já vem em português e amigável). Use `code` para tratar casos especiais, por exemplo:
`LEAD_EXISTS` (com `lead_id` → "Abrir lead existente"), `LOOKUP_QUOTA_EXHAUSTED` (com `quota` → CTA do plano Consulting), `QUOTE_CHANGED`, `FEATURE_LOCKED` ("Em breve"), `NO_CASE_NUMBER`. Validação: `422` com `details[]`. Limite de requisições: `429 RATE_LIMITED`.

## Padrões que se repetem

- **React Query:** `useQuery({ queryKey: ['leads', filtros], queryFn: () => leadsApi.list(filtros) })`; depois de criar/editar, `invalidateQueries` das chaves afetadas (ex.: `['leads']`, `['funnel']`, `['dashboard']`).
- **Downloads** (planilhas, modelos, PDFs): as funções devolvem `{ blob, filename }`; salve com `saveFile(blob, filename)` de `lib/download.ts`. Em erro, o corpo vem como Blob: leia com `await blob.text()` para pegar a mensagem.
- **Uploads de planilha/PDF:** o corpo é o próprio arquivo (`Content-Type: application/octet-stream` ou `application/pdf`); as funções já tratam isso (ex.: `leadImportApi.upload(file)`, `lookupEnrichApi.upload(file)`).
- **Tarefas em segundo plano** (enriquecer lista): `start` devolve `202` e a tela consulta `get(id)` a cada ~1,5 s enquanto o status for `rodando`.
- **Permissões e módulos:** `useCan('create_leads')`, `useModuleEnabled()('crm')`; o que ainda não foi lançado aparece com "Em breve" via `LOCKED_FEATURES`. A coluna **Acesso** do catálogo diz o que a API exige em cada rota.
- **Datas:** a API manda ISO (`2026-11-07T15:00:00.000Z`); datas "só dia" podem chegar como meia-noite UTC: formate pelo dia (`slice(0,10)`) para não voltar um dia no fuso do Brasil.
- **Dinheiro:** valores em centavos (`*_cents`).

## Catálogo

Legenda da coluna **Acesso**: `pública` = sem login · `logado` = qualquer usuário logado com e-mail confirmado · `admin do escritório` · `módulo X` = precisa do módulo ligado na conta · `área X` = acesso à área (leads, cases, agenda…) · `perm. X` = permissão do papel do usuário · `FEATURE_*` = liberado por variável do servidor.

<!-- gerado:inicio -->

_Gerado por `npm run docs:api` (frontend/scripts/gen-api-docs.mjs) a partir de `src/api.ts` e `backend/routes/api.routes.js`. Não edite à mão entre os marcadores._

| Objeto | Área |
|---|---|
| [`authApi`](#authapi) | Login, cadastro, senha e verificação de e-mail |
| [`usersApi`](#usersapi) | Usuários do escritório (convites, papéis, perfil) |
| [`fieldsApi`](#fieldsapi) | Campos personalizados dos leads |
| [`leadImportApi`](#leadimportapi) | Importar leads de planilha (assistente) |
| [`leadsApi`](#leadsapi) | CRM — leads, notas, tarefas, exportação |
| [`casesApi`](#casesapi) | Meus processos (cases) |
| [`areasApi`](#areasapi) | Áreas do direito |
| [`leadStagesApi`](#leadstagesapi) | Etapas do funil de leads |
| [`stagesApi`](#stagesapi) | Etapas dos processos |
| [`casePeopleApi`](#casepeopleapi) | Pessoas ligadas ao processo |
| [`workspacesApi`](#workspacesapi) | Workspaces (escritórios do usuário) |
| [`officeApi`](#officeapi) | Escritório (dados, entrada por código) |
| [`permissionsApi`](#permissionsapi) | Permissões disponíveis |
| [`officeTemplatesApi`](#officetemplatesapi) | Modelos de documento do escritório |
| [`documentsApi`](#documentsapi) | Documentos (gerar, anexar, baixar) |
| [`eventsApi`](#eventsapi) | Agenda — compromissos |
| [`tasksApi`](#tasksapi) | Tarefas e prazos (visão geral) |
| [`aiLogApi`](#ailogapi) | IA — histórico de ações |
| [`aiApi`](#aiapi) | IA — chat |
| [`billingApi`](#billingapi) | Assinatura e assentos por usuário |
| [`paymentsApi`](#paymentsapi) | Pagamentos (checkout/portal) |
| [`plansApi`](#plansapi) | Planos |
| [`settingsApi`](#settingsapi) | Configurações do escritório |
| [`creditsApi`](#creditsapi) | Carteira de créditos (hoje só p/ processos — desligado) |
| [`lookupApi`](#lookupapi) | Consultas de CPF/CNPJ (cota semanal) e criar lead |
| [`lookupEnrichApi`](#lookupenrichapi) | Enriquecer lista (planilha de CPF/CNPJ) |
| [`processSearchApi`](#processsearchapi) | Pesquisa de processos (DJEN + DataJud) |
| [`caseTrackingApi`](#casetrackingapi) | Acompanhamento de publicações em Meus processos |
| [`savedProcessesApi`](#savedprocessesapi) | Processos salvos (sem tela hoje) |
| [`modulesApi`](#modulesapi) | Módulos ligados na conta |
| [`educationApi`](#educationapi) | Educação (trilhas/aulas) |
| [`quizzesApi`](#quizzesapi) | Provas de conceito |
| [`challengesApi`](#challengesapi) | Desafios semanais |
| [`communityApi`](#communityapi) | Comunidade |
| [`adminApi`](#adminapi) | Painel da plataforma (equipe intellsn) |
| [`alertsApi`](#alertsapi) | Alertas de prazo |
| [`dashboardApi`](#dashboardapi) | Painel (dashboard) |
| [`supportApi`](#supportapi) | Suporte |
| [`boardsApi`](#boardsapi) | Quadros personalizáveis |
| [`googleApi`](#googleapi) | Integração Google Agenda |

### authApi

_Login, cadastro, senha e verificação de e-mail_

| Função | Chamada | Retorno | Acesso | Observação |
|---|---|---|---|---|
| `register(data: { name: string; email: string; password: string; phone?: string; accountName?: string })` | `POST /auth/register` | `AuthResponse` | pública |  |
| `login(data: { email: string; password: string })` | `POST /auth/login` | `AuthResponse` | pública |  |
| `refreshToken(refreshToken: string)` | `POST /auth/refresh-token` | `{ token: string }` | pública |  |
| `forgotPassword(email: string)` | `POST /auth/forgot-password` | — | pública |  |
| `resetPassword(token: string, password: string)` | `POST /auth/reset-password` | — | pública |  |
| `sendVerification(channel: 'email' \| 'phone')` | `POST /auth/send-verification` | `{ sent: boolean; channel: string; expires_in_minutes: number }` | logado | (re)envia o código de verificação |
| `verifyCode(channel: 'email' \| 'phone', code: string)` | `POST /auth/verify-code` | `{ verified: boolean; channel: string }` | logado | confirma o código de 6 dígitos |

### usersApi

_Usuários do escritório (convites, papéis, perfil)_

| Função | Chamada | Retorno | Acesso | Observação |
|---|---|---|---|---|
| `list()` | `GET /users` | `User[]` | logado |  |
| `me()` | `GET /users/me` | `User` | logado |  |
| `updateMe(data: { name?: string; oab_number?: string })` | `PUT /users/me` | `User` | logado |  |
| `changePassword(data: { currentPassword: string; newPassword: string })` | `PUT /users/me/password` | — | logado |  |
| `getById(id: string)` | `GET /users/:id` | `User` | logado |  |
| `update(id: string, data: Omit&lt;Partial&lt;User&gt;, 'permissions'&gt; & { permissions?: Partial&lt;Permissions&gt; })` | `PUT /users/:id` | `User` | logado |  |
| `deactivate(id: string)` | `DELETE /users/:id` | — | admin do escritório |  |
| `invite(data: { name: string; email: string; role?: 'admin' \| 'user' })` | `POST /users/invite` | `User` | admin do escritório | admin convida por e-mail (respeita o limite de usuários do plano) |
| `resendInvite(id: string)` | `POST /users/:id/resend-invite` | — | admin do escritório |  |

### fieldsApi

_Campos personalizados dos leads_

| Função | Chamada | Retorno | Acesso | Observação |
|---|---|---|---|---|
| `list()` | `GET /fields` | `FieldDefinition[]` | módulo crm |  |
| `create(data: Partial&lt;FieldDefinition&gt;)` | `POST /fields` | `FieldDefinition` | admin do escritório · módulo crm |  |
| `update(id: string, data: Partial&lt;FieldDefinition&gt;)` | `PUT /fields/:id` | `FieldDefinition` | admin do escritório · módulo crm |  |
| `remove(id: string)` | `DELETE /fields/:id` | — | admin do escritório · módulo crm |  |
| `reorder(order: Array&lt;{ id: string; display_order: number }&gt;)` | `PUT /fields/reorder` | — | admin do escritório · módulo crm |  |

### leadImportApi

_Importar leads de planilha (assistente)_

| Função | Chamada | Retorno | Acesso | Observação |
|---|---|---|---|---|
| `models()` | `GET /leads/import/models` | `ImportModels` | módulo crm · área leads · perm. create_leads |  |
| `template(key: string, format: 'xlsx' \| 'csv')` | `GET /leads/import/models/:key/template` | arquivo (`{ blob, filename }`) | módulo crm · área leads · perm. create_leads |  |
| `history()` | `GET /leads/import` | `{ data: ImportHistoryItem[] }` | módulo crm · área leads · perm. create_leads |  |
| `upload(file: File)` | `POST /leads/import` | `ImportBatch` | módulo crm · área leads · perm. create_leads | corpo = bytes da planilha (.xlsx/.csv) · corpo = arquivo cru |
| `reparse(id: string, data: { sheet?: number; header_row?: number })` | `POST /leads/import/:id/reparse` | `ImportBatch` | módulo crm · área leads · perm. create_leads |  |
| `preview(id: string, data: { model: string; mapping: string[]; options: ImportOptions })` | `POST /leads/import/:id/preview` | `ImportPreview` | módulo crm · área leads · perm. create_leads |  |
| `commit(id: string, data: { model: string; mapping: string[]; options: ImportOptions })` | `POST /leads/import/:id/commit` | `ImportResult` | módulo crm · área leads · perm. create_leads |  |
| `undo(id: string)` | `DELETE /leads/import/:id` | `{ id: string; status: string; removidos: number; mantidos: number }` | módulo crm · área leads · perm. create_leads | desfaz uma importação concluída ou descarta um rascunho |
| `problems(id: string)` | `GET /leads/import/:id/problems` | arquivo (`{ blob, filename }`) | módulo crm · área leads · perm. create_leads |  |
| `export(format: 'xlsx' \| 'csv', params?: { stage?: string; search?: string })` | `GET /leads/export` | arquivo (`{ blob, filename }`) | módulo crm · área leads · perm. export_leads |  |

### leadsApi

_CRM — leads, notas, tarefas, exportação_

| Função | Chamada | Retorno | Acesso | Observação |
|---|---|---|---|---|
| `list(params?: { stage?: string; search?: string; assigned?: string; page?: number; limit?: number })` | `GET /leads` | `PaginatedResult&lt;Lead&gt;` | módulo crm · área leads |  |
| `create(data: Partial&lt;Lead&gt; & { custom_fields?: Record&lt;string, unknown&gt; })` | `POST /leads` | `Lead` | módulo crm · área leads · perm. create_leads |  |
| `getFunnelSummary()` | `GET /leads/funnel` | `FunnelStage[]` | módulo crm · área leads |  |
| `getById(id: string)` | `GET /leads/:id` | `Lead` | módulo crm · área leads · perm. create_leads |  |
| `update(id: string, data: Partial&lt;Lead&gt; & { custom_fields?: Record&lt;string, unknown&gt; })` | `PUT /leads/:id` | `Lead` | módulo crm · área leads |  |
| `moveStage(id: string, stage: string)` | `PATCH /leads/:id/stage` | `Lead` | módulo crm · área leads |  |
| `archive(id: string)` | `PATCH /leads/:id/archive` | `Lead` | módulo crm · área leads |  |
| `delete(id: string)` | `DELETE /leads/:id` | — | módulo crm · área leads · perm. delete_leads |  |
| `listNotes(leadId: string)` | `GET /leads/:leadId/notes` | `Note[]` | módulo crm · área leads · perm. create_leads |  |
| `addNote(leadId: string, text: string)` | `POST /leads/:leadId/notes` | `Note` | módulo crm · área leads |  |
| `deleteNote(leadId: string, noteId: string)` | `DELETE /leads/:leadId/notes/:noteId` | — | módulo crm · área leads |  |
| `listTasks(leadId: string)` | `GET /leads/:leadId/tasks` | `Task[]` | módulo crm · área leads · perm. create_leads |  |
| `createTask(leadId: string, data: { description: string; due_date?: string; case_id?: string; is_deadline?: boolean })` | `POST /leads/:leadId/tasks` | `Task` | módulo crm · área leads |  |
| `completeTask(leadId: string, taskId: string)` | `PATCH /leads/:leadId/tasks/:taskId/complete` | `Task` | módulo crm · área leads |  |

### casesApi

_Meus processos (cases)_

| Função | Chamada | Retorno | Acesso | Observação |
|---|---|---|---|---|
| `list(params?: { status?: string; search?: string; lead_id?: string; area_key?: string })` | `GET /cases` | `{ data: Case[]; total: number }` | módulo crm · área cases |  |
| `getById(id: string)` | `GET /cases/:id` | `CaseDetail` | módulo crm · área cases |  |
| `create(data: Partial&lt;Case&gt; & { cause_value?: string \| number })` | `POST /cases` | `CaseDetail` | módulo crm · área cases · perm. create_cases |  |
| `update(id: string, data: Record&lt;string, unknown&gt;)` | `PUT /cases/:id` | `CaseDetail` | módulo crm · área cases |  |
| `remove(id: string)` | `DELETE /cases/:id` | — | módulo crm · área cases · perm. delete_records |  |
| `analyze(number: string)` | `GET /cases/analyze` | `CaseNumberAnalysis` | módulo crm · área cases |  |
| `addUpdate(id: string, data: { text: string; update_date?: string })` | `POST /cases/:id/updates` | `CaseUpdate` | módulo crm · área cases |  |
| `deleteUpdate(id: string, updateId: string)` | `DELETE /cases/:id/updates/:updateId` | — | módulo crm · área cases |  |

### areasApi

_Áreas do direito_

| Função | Chamada | Retorno | Acesso | Observação |
|---|---|---|---|---|
| `list()` | `GET /areas` | `AreaMeta[]` | módulo crm |  |

### leadStagesApi

_Etapas do funil de leads_

| Função | Chamada | Retorno | Acesso | Observação |
|---|---|---|---|---|
| `list()` | `GET /lead-stages` | `LeadStage[]` | módulo crm |  |
| `create(d: { label: string; color?: string; kind?: LeadStageKind })` | `POST /lead-stages` | `LeadStage` | admin do escritório · módulo crm |  |
| `update(id: string, d: Partial&lt;{ label: string; color: string; kind: LeadStageKind }&gt;)` | `PUT /lead-stages/:id` | `LeadStage` | admin do escritório · módulo crm |  |
| `reorder(ids: string[])` | `PUT /lead-stages/reorder` | `LeadStage[]` | admin do escritório · módulo crm |  |
| `remove(id: string, move_to?: string)` | `DELETE /lead-stages/:id` | — | admin do escritório · módulo crm |  |
| `reset()` | `POST /lead-stages/reset` | `LeadStage[]` | admin do escritório · módulo crm |  |

### stagesApi

_Etapas dos processos_

| Função | Chamada | Retorno | Acesso | Observação |
|---|---|---|---|---|
| `list(area_key?: string)` | `GET /case-stages` | `CaseStage[]` | módulo crm |  |
| `create(d: { area_key: string; label: string; color?: string; is_final?: boolean })` | `POST /case-stages` | `CaseStage` | admin do escritório · módulo crm |  |
| `update(id: string, d: Partial&lt;{ label: string; color: string; is_final: boolean }&gt;)` | `PUT /case-stages/:id` | `CaseStage` | admin do escritório · módulo crm |  |
| `reorder(area_key: string, ids: string[])` | `PUT /case-stages/reorder` | `CaseStage[]` | admin do escritório · módulo crm |  |
| `remove(id: string, move_to?: string)` | `DELETE /case-stages/:id` | — | admin do escritório · módulo crm |  |
| `reset(area_key: string)` | `POST /case-stages/reset` | `CaseStage[]` | admin do escritório · módulo crm |  |

### casePeopleApi

_Pessoas ligadas ao processo_

| Função | Chamada | Retorno | Acesso | Observação |
|---|---|---|---|---|
| `addParty(caseId: string, d: Partial&lt;CaseParty&gt; & { name: string; role: string })` | `POST /cases/:caseId/parties` | `CaseParty` | módulo crm · área cases |  |
| `updateParty(caseId: string, partyId: string, d: Partial&lt;CaseParty&gt;)` | `PUT /cases/:caseId/parties/:partyId` | `CaseParty` | módulo crm · área cases |  |
| `removeParty(caseId: string, partyId: string)` | `DELETE /cases/:caseId/parties/:partyId` | — | módulo crm · área cases |  |
| `setMembers(caseId: string, members: { user_id: string; role: 'responsavel' \| 'colaborador' }[])` | `PUT /cases/:caseId/members` | `CaseMember[]` | módulo crm · área cases |  |
| `moveStage(caseId: string, stage_id: string)` | `PUT /cases/:caseId/stage` | `CaseDetail` | módulo crm · área cases |  |

### workspacesApi

_Workspaces (escritórios do usuário)_

| Função | Chamada | Retorno | Acesso | Observação |
|---|---|---|---|---|
| `list()` | `GET /workspaces` | `Workspace[]` | logado |  |
| `switchTo(user_id: string)` | `POST /workspaces/switch` | `{ token: string; user_id: string }` | logado |  |
| `leave(user_id: string)` | `DELETE /workspaces/:user_id` | `{ switch_to: string \| null }` | logado |  |

### officeApi

_Escritório (dados, entrada por código)_

| Função | Chamada | Retorno | Acesso | Observação |
|---|---|---|---|---|
| `get()` | `GET /office` | `Office` | logado |  |
| `create(d: OfficeData)` | `POST /office` | `{ token: string; user_id: string }` | logado |  |
| `setGovernance(member_defaults: Partial&lt;Permissions&gt;)` | `PUT /office/governance` | `Office` | admin do escritório |  |
| `update(d: OfficeData)` | `PUT /office` | `Office` | admin do escritório |  |
| `regenerateCode()` | `POST /office/code/regenerate` | `Office` | admin do escritório |  |
| `join(code: string)` | `POST /office/join` | `{ office_name: string }` | logado |  |
| `cancelJoin()` | `DELETE /office/join` | — | logado |  |
| `requests()` | `GET /office/requests` | `JoinRequest[]` | admin do escritório |  |
| `decide(id: string, approve: boolean)` | `POST /office/requests/:id` | — | admin do escritório |  |
| `activity(days: number)` | `GET /office/activity` | `ActivityReport` | admin do escritório |  |
| `ping()` | `POST /activity/ping` | — | logado |  |

### permissionsApi

_Permissões disponíveis_

| Função | Chamada | Retorno | Acesso | Observação |
|---|---|---|---|---|
| `defs()` | `GET /permissions` | `PermissionDef[]` | logado |  |

### officeTemplatesApi

_Modelos de documento do escritório_

| Função | Chamada | Retorno | Acesso | Observação |
|---|---|---|---|---|
| `list()` | `GET /office-templates` | `OfficeTemplateRow[]` | módulo crm · área documents |  |
| `get(id: string)` | `GET /office-templates/:id` | `OfficeTemplate` | módulo crm · área documents |  |
| `create(d: TemplateInput)` | `POST /office-templates` | `OfficeTemplate` | módulo crm · área documents · perm. templates_manage |  |
| `update(id: string, d: Partial&lt;TemplateInput&gt;)` | `PUT /office-templates/:id` | `OfficeTemplate` | módulo crm · área documents · perm. templates_manage |  |
| `remove(id: string)` | `DELETE /office-templates/:id` | — | módulo crm · área documents · perm. templates_manage |  |
| `check(body: string, area_key: string)` | `POST /office-templates/check` | `{ unknown_placeholders: string[]; ai_slots: number }` | módulo crm · área documents · perm. templates_manage |  |
| `extract(data_base64: string)` | `POST /office-templates/extract` | `{ text: string; truncated: boolean }` | módulo crm · área documents · perm. templates_manage |  |
| `convert(text: string, area_key?: string)` | `POST /office-templates/convert` | `ConvertResult` | módulo crm · área documents · perm. templates_manage |  |

### documentsApi

_Documentos (gerar, anexar, baixar)_

| Função | Chamada | Retorno | Acesso | Observação |
|---|---|---|---|---|
| `templates(area_key?: string)` | `GET /document-templates` | `{ templates: DocumentTemplate[] }` | módulo crm · área documents |  |
| `list(params?: { case_id?: string; area_key?: string; status?: string; search?: string })` | `GET /documents` | `DocumentSummary[]` | módulo crm · área documents |  |
| `get(id: string)` | `GET /documents/:id` | `DocumentFull` | módulo crm · área documents |  |
| `create(d: { template_key?: string; case_id?: string; title?: string; area_key?: string })` | `POST /documents` | `DocumentFull` | módulo crm · área documents |  |
| `update(id: string, d: { title?: string; content?: string; status?: string })` | `PUT /documents/:id` | `DocumentFull` | módulo crm · área documents |  |
| `remove(id: string)` | `DELETE /documents/:id` | — | módulo crm · área documents · perm. delete_records |  |
| `draft(id: string, instructions?: string)` | `POST /documents/:id/draft` | `DraftResult` | módulo crm · área documents · perm. ai_drafts |  |
| `version(id: string, n: number)` | `GET /documents/:id/versions/:n` | `{ version_no: number; content: string }` | módulo crm · área documents |  |
| `restore(id: string, n: number)` | `POST /documents/:id/versions/:n/restore` | `DocumentFull` | módulo crm · área documents |  |
| `exportDocx(id: string, filename: string)` | `GET /documents/:id/export.docx` | arquivo (`{ blob, filename }`) | módulo crm · área documents |  |

### eventsApi

_Agenda — compromissos_

| Função | Chamada | Retorno | Acesso | Observação |
|---|---|---|---|---|
| `list(params?: { from?: string; to?: string; lead_id?: string; case_id?: string })` | `GET /events` | `CrmEvent[]` | módulo crm · área agenda |  |
| `create(data: Partial&lt;CrmEvent&gt; & { sync_google?: boolean })` | `POST /events` | `CrmEvent` | módulo crm · área agenda · perm. create_events |  |
| `update(id: string, data: Partial&lt;CrmEvent&gt;)` | `PUT /events/:id` | `CrmEvent` | módulo crm · área agenda |  |
| `remove(id: string)` | `DELETE /events/:id` | — | módulo crm · área agenda |  |

### tasksApi

_Tarefas e prazos (visão geral)_

| Função | Chamada | Retorno | Acesso | Observação |
|---|---|---|---|---|
| `listAll(params?: { pending_only?: boolean; page?: number; limit?: number })` | `GET /tasks` | `Task[]` | módulo crm · área agenda |  |
| `create(data: { description: string; due_date?: string; lead_id?: string \| null; case_id?: string; is_deadline?: boolean })` | `POST /tasks` | `Task` | módulo crm · área agenda · perm. create_events | tarefa ou prazo, com ou sem lead/processo |

### aiLogApi

_IA — histórico de ações_

| Função | Chamada | Retorno | Acesso | Observação |
|---|---|---|---|---|
| `list(params?: { mine?: number; status?: string; page?: number })` | `GET /ai/actions` | `{ data: AiLogRow[]; total: number }` | módulo crm · área ai |  |
| `undo(id: string)` | `POST /ai/actions/:id/undo` | `{ id: string; status: string; undo_note: string \| null }` | módulo crm · área ai |  |
| `diagnose()` | `POST /ai/diagnose` | `{ ok: boolean; model: string; status?: number \| null; diagnosis?: string }` | admin do escritório · módulo crm |  |

### aiApi

_IA — chat_

| Função | Chamada | Retorno | Acesso | Observação |
|---|---|---|---|---|
| `sendMessage(message: string, conversation_id?: string)` | `POST /ai/message` | `AiChatResponse` | módulo crm · área ai |  |
| `listConversations(params?: { page?: number; limit?: number })` | `GET /ai/conversations` | — | módulo crm · área ai |  |
| `getConversation(id: string)` | `GET /ai/conversations/:id` | `{ id: string; messages: AiMessage[] }` | módulo crm · área ai |  |
| `clearConversation(id: string)` | `DELETE /ai/conversations/:id` | — | módulo crm · área ai |  |
| `getCredits()` | `GET /ai/credits` | `CreditsStatus` | módulo crm | saldo da semana |
| `getUsage(params?: { from?: string; to?: string })` | `GET /ai/usage` | — | módulo crm |  |

### billingApi

_Assinatura e assentos por usuário_

| Função | Chamada | Retorno | Acesso | Observação |
|---|---|---|---|---|
| `seats()` | `GET /billing/seats` | `Seat[]` | admin do escritório |  |

### paymentsApi

_Pagamentos (checkout/portal)_

| Função | Chamada | Retorno | Acesso | Observação |
|---|---|---|---|---|
| `list(params?: { page?: number; limit?: number })` | `GET /payments` | `Payment[]` | logado |  |
| `checkout(plan: string, user_id?: string)` | `POST /payments/checkout` | `{ url?: string; updated?: boolean }` | admin do escritório | abre o Checkout do Stripe (cartão). Redirecionar o navegador para `url`. |
| `portal()` | `POST /payments/portal` | `{ url: string }` | admin do escritório | Portal do Cliente do Stripe (trocar de plano, cartão, cancelar, faturas). |
| `getById(id: string)` | `GET /payments/:id` | `Payment` | logado |  |
| `getNfse(id: string)` | `GET /payments/:id/nfse` | — | logado |  |

### plansApi

_Planos_

| Função | Chamada | Retorno | Acesso | Observação |
|---|---|---|---|---|
| `list()` | `GET /plans` | `PlanInfo[]` | logado | planos disponíveis para assinatura |

### settingsApi

_Configurações do escritório_

| Função | Chamada | Retorno | Acesso | Observação |
|---|---|---|---|---|
| `get()` | `GET /settings` | — | logado |  |
| `update(data: { name?: string })` | `PUT /settings` | — | admin do escritório |  |
| `getPlan()` | `GET /settings/plan` | `CurrentPlan` | logado |  |

### creditsApi

_Carteira de créditos (hoje só p/ processos — desligado)_

| Função | Chamada | Retorno | Acesso | Observação |
|---|---|---|---|---|
| `getBalance()` | `GET /credits/balance` | `{ balance_cents: number }` | logado |  |
| `listPrices()` | `GET /credits/prices` | `{ prices: ServicePrice[] }` | logado |  |
| `listTransactions(params?: { page?: number; limit?: number })` | `GET /credits/transactions` | `{ transactions: CreditTransaction[] }` | logado |  |

### lookupApi

_Consultas de CPF/CNPJ (cota semanal) e criar lead_

| Função | Chamada | Retorno | Acesso | Observação |
|---|---|---|---|---|
| `status()` | `GET /lookup/status` | `LookupStatus` | módulo pesquisa_cpf_cnpj · FEATURE_LOOKUPS_ENABLED | provedor configurado e cota semanal do usuário |
| `cnpj(cnpj: string, refresh = false)` | `POST /lookup/cnpj` | `LookupResponse&lt;CnpjResult&gt;` | módulo pesquisa_cpf_cnpj · FEATURE_LOOKUPS_ENABLED | `refresh` força nova consulta (cobra de novo) |
| `cpf(cpf: string, refresh = false)` | `POST /lookup/cpf` | `LookupResponse&lt;CpfResult&gt;` | módulo pesquisa_cpf_cnpj · FEATURE_LOOKUPS_ENABLED |  |
| `processo(documento: string, refresh = false)` | `POST /lookup/processo` | `LookupResponse&lt;ProcessoResult&gt;` | módulo pesquisa_processual · FEATURE_LOOKUPS_ENABLED · FEATURE_PROCESS_LOOKUP_ENABLED | por CPF ou CNPJ |
| `processoSummary(processo: ProcessoResult)` | `POST /lookup/processo/summary` | `{ data: { summary: string } }` | módulo pesquisa_processual · FEATURE_LOOKUPS_ENABLED · FEATURE_PROCESS_LOOKUP_ENABLED |  |
| `createLead(kind: 'cpf' \| 'cnpj', document: string, stage?: string)` | `POST /lookup/:kind/create-lead` | `{ data: Lead }` | módulo pesquisa_cpf_cnpj, crm · perm. create_leads · FEATURE_LOOKUPS_ENABLED | usa a consulta já feita (não consulta nem cobra de novo) |

### lookupEnrichApi

_Enriquecer lista (planilha de CPF/CNPJ)_

| Função | Chamada | Retorno | Acesso | Observação |
|---|---|---|---|---|
| `template(format: 'xlsx' \| 'csv')` | `GET /lookup/enrich/template` | arquivo (`{ blob, filename }`) | módulo pesquisa_cpf_cnpj · FEATURE_LOOKUPS_ENABLED |  |
| `history()` | `GET /lookup/enrich` | `{ data: EnrichHistoryItem[] }` | módulo pesquisa_cpf_cnpj · perm. create_leads · FEATURE_LOOKUPS_ENABLED |  |
| `upload(file: File)` | `POST /lookup/enrich` | `EnrichJob` | módulo pesquisa_cpf_cnpj · perm. create_leads · FEATURE_LOOKUPS_ENABLED | corpo = bytes da planilha · corpo = arquivo cru |
| `get(id: string)` | `GET /lookup/enrich/:id` | `EnrichJob` | módulo pesquisa_cpf_cnpj · FEATURE_LOOKUPS_ENABLED |  |
| `analyze(id: string, data: { doc_col?: number; options?: { fill: Partial&lt;EnrichFill&gt; } })` | `POST /lookup/enrich/:id/analyze` | `EnrichJob` | módulo pesquisa_cpf_cnpj · perm. create_leads · FEATURE_LOOKUPS_ENABLED |  |
| `start(id: string, confirm_queries: number)` | `POST /lookup/enrich/:id/start` | `{ id: string; status: EnrichStatus; total: number }` | módulo pesquisa_cpf_cnpj · perm. create_leads · FEATURE_LOOKUPS_ENABLED |  |
| `download(id: string, format: 'xlsx' \| 'csv')` | `GET /lookup/enrich/:id/download` | arquivo (`{ blob, filename }`) | módulo pesquisa_cpf_cnpj · perm. create_leads · FEATURE_LOOKUPS_ENABLED |  |
| `toImport(id: string)` | `POST /lookup/enrich/:id/to-import` | `ImportBatch` | módulo pesquisa_cpf_cnpj, crm · perm. create_leads · FEATURE_LOOKUPS_ENABLED |  |
| `discard(id: string)` | `DELETE /lookup/enrich/:id` | — | módulo pesquisa_cpf_cnpj · perm. create_leads · FEATURE_LOOKUPS_ENABLED |  |

### processSearchApi

_Pesquisa de processos (DJEN + DataJud)_

| Função | Chamada | Retorno | Acesso | Observação |
|---|---|---|---|---|
| `search(q: string, f: ProcessDateFilter = {})` | `POST /process-search` | `ProcessSearchResponse` | módulo crm, pesquisa_processual · área cases |  |
| `detail(ref: string, f: ProcessDateFilter = {})` | `GET /process-search/detail` | `ProcessSnapshot` | módulo crm, pesquisa_processual · área cases | → retrato completo (DataJud + DJEN), sem salvar |
| `preview(ref: string)` | `GET /process-search/preview` | arquivo (`{ blob, filename }`) | módulo crm, pesquisa_processual · área cases | → PDF (blob). Só existe no provedor de teste (mock). |
| `save(ref: string)` | `POST /process-search/save` | `SavedProcess` | módulo crm, pesquisa_processual · área cases · perm. create_cases | grava o estado atual (e, no mock, o PDF) |

### caseTrackingApi

_Acompanhamento de publicações em Meus processos_

| Função | Chamada | Retorno | Acesso | Observação |
|---|---|---|---|---|
| `get(caseId: string)` | `GET /cases/:caseId/tracking` | `{ process: SavedProcess \| null }` | módulo crm · área cases |  |
| `track(caseId: string)` | `POST /cases/:caseId/tracking` | `RefreshResult & { first: boolean }` | módulo crm, pesquisa_processual · área cases · perm. create_cases | Primeira consulta (first: true) ou atualização — devolve o que há de novo. |

### savedProcessesApi

_Processos salvos (sem tela hoje)_

| Função | Chamada | Retorno | Acesso | Observação |
|---|---|---|---|---|
| `summary()` | `GET /saved-processes/summary` | `SavedProcessesSummary` | módulo crm · área cases |  |
| `list(params?: { q?: string; page?: number; limit?: number; tribunal?: string; from?: string; to?: string; sort?: string })` | `GET /saved-processes` | `{ data: SavedProcess[]; total: number; page: number; limit: number }` | módulo crm · área cases |  |
| `get(id: string)` | `GET /saved-processes/:id` | `SavedProcess` | módulo crm · área cases |  |
| `file(id: string)` | `GET /saved-processes/:id/file` | arquivo (`{ blob, filename }`) | módulo crm · área cases |  |
| `refresh(id: string)` | `POST /saved-processes/:id/refresh` | `RefreshResult` | módulo crm, pesquisa_processual · área cases · perm. create_cases | consulta as fontes de novo e grava o novo estado |
| `attachFile(id: string, file: File)` | `PUT /saved-processes/:id/file` | `SavedProcess` | módulo crm · área cases · perm. create_cases | corpo = bytes do PDF (substitui o anterior) · corpo = arquivo cru |
| `removeFile(id: string)` | `DELETE /saved-processes/:id/file` | `SavedProcess` | módulo crm · área cases · perm. delete_records |  |
| `remove(id: string)` | `DELETE /saved-processes/:id` | — | módulo crm · área cases · perm. delete_records |  |

### modulesApi

_Módulos ligados na conta_

| Função | Chamada | Retorno | Acesso | Observação |
|---|---|---|---|---|
| `list()` | `GET /modules` | `{ modules: ModuleStatus[] }` | logado | quais módulos estão ativos para a conta logada |

### educationApi

_Educação (trilhas/aulas)_

| Função | Chamada | Retorno | Acesso | Observação |
|---|---|---|---|---|
| `listTrilhas()` | `GET /education/trilhas` | `{ trilhas: Trilha[] }` | módulo educacao |  |
| `getTrilha(id: string)` | `GET /education/trilhas/:id` | `{ trilha: TrilhaDetail }` | módulo educacao |  |
| `updateProgress(aulaId: string, data: { last_position_seconds?: number; completed?: boolean })` | `PUT /education/aulas/:aulaId/progress` | — | módulo educacao |  |

### quizzesApi

_Provas de conceito_

| Função | Chamada | Retorno | Acesso | Observação |
|---|---|---|---|---|
| `listAvailable()` | `GET /education/quizzes` | `{ quizzes: AvailableQuiz[] }` | módulo provas_conceito | todas as provas disponíveis + melhor resultado do usuário |
| `getForAula(aulaId: string)` | `GET /education/aulas/:aulaId/quiz` | `{ quiz: Quiz \| null }` | módulo provas_conceito | null se a aula não tem prova de conceito |
| `submitAttempt(quizId: string, answers: { question_id: string; option_id: string }[])` | `POST /education/quizzes/:quizId/attempts` | `{ attempt: QuizAttemptResult }` | módulo provas_conceito |  |

### challengesApi

_Desafios semanais_

| Função | Chamada | Retorno | Acesso | Observação |
|---|---|---|---|---|
| `listActive()` | `GET /challenges` | `{ challenges: Challenge[] }` | módulo desafios_semanais |  |
| `complete(id: string)` | `POST /challenges/:id/complete` | `{ completion: { points_awarded: number; already_completed: boolean } }` | módulo desafios_semanais | auto-declarado, idempotente |

### communityApi

_Comunidade_

| Função | Chamada | Retorno | Acesso | Observação |
|---|---|---|---|---|
| `listFeed()` | `GET /community/posts` | `{ posts: CommunityPost[] }` | módulo comunidade | feed da PRÓPRIA conta, nunca cross-tenant |
| `createPost(content: string)` | `POST /community/posts` | `{ post: CommunityPost }` | módulo comunidade |  |
| `deletePost(id: string)` | `DELETE /community/posts/:id` | — | módulo comunidade | só a própria publicação (ou admin da conta) |
| `leaderboard()` | `GET /community/leaderboard` | `{ ranking: LeaderboardEntry[] }` | módulo comunidade | ranking de pontos entre escritórios (cross-tenant, por opção do produto) |

### adminApi

_Painel da plataforma (equipe intellsn)_ — cliente separado (`httpAdmin`, token `foro_admin_token`); só para o painel da plataforma em `/admin`.

| Função | Chamada | Retorno | Acesso | Observação |
|---|---|---|---|---|
| `login(email: string, password: string)` | `POST /auth/platform-login` | `PlatformAdminAuthResponse` | pública |  |
| `listAccounts()` | `GET /admin/accounts` | `{ accounts: AccountSummary[] }` | pública |  |
| `getAccount(id: string)` | `GET /admin/accounts/:id` | `{ account: AccountDetail }` | pública |  |
| `updateAccountStatus(id: string, status: AccountSummary['status'])` | `PATCH /admin/accounts/:id/status` | `{ account: AccountDetail }` | pública |  |
| `listPlans()` | `GET /admin/plans` | `{ plans: Plan[] }` | pública |  |
| `creditsOverview()` | `GET /admin/credits/overview` | `{ overview: CreditsOverview }` | pública |  |
| `adjustCredits(id: string, data: { amount_cents: number; note: string })` | `PATCH /admin/accounts/:id/credits/adjust` | — | pública | único caminho de reembolso/ajuste, exige nota |
| `listModulesCatalog()` | `GET /admin/modules` | `{ modules: ModuleStatus[] }` | pública | catálogo completo de módulos |
| `getAccountModules(accountId: string)` | `GET /admin/accounts/:accountId/modules` | `{ modules: ModuleStatus[] }` | pública | estado dos módulos de uma conta |
| `setAccountModule(accountId: string, moduleKey: string, enabled: boolean)` | `PATCH /admin/accounts/:accountId/modules/:moduleKey` | `{ modules: ModuleStatus[] }` | pública | liga/desliga, exclusivo do admin da plataforma |
| `listTrilhas()` | `GET /admin/education/trilhas` | `{ trilhas: AdminTrilha[] }` | pública |  |
| `getTrilha(id: string)` | `GET /admin/education/trilhas/:id` | `{ trilha: AdminTrilhaDetail }` | pública |  |
| `createTrilha(data: { title: string; description?: string; cover_image_url?: string; display_order?: number; published?: boolean })` | `POST /admin/education/trilhas` | `{ trilha: AdminTrilhaDetail }` | pública |  |
| `updateTrilha(id: string, data: Partial&lt;{ title: string; description: string; cover_image_url: string; display_order: number; published: boolean }&gt;)` | `PUT /admin/education/trilhas/:id` | `{ trilha: AdminTrilhaDetail }` | pública |  |
| `deleteTrilha(id: string)` | `DELETE /admin/education/trilhas/:id` | — | pública |  |
| `createAula(trilhaId: string, data: { title: string; description?: string; video_provider?: string; video_id: string; duration_seconds?: number; display_order?: number; published?: boolean })` | `POST /admin/education/trilhas/:trilhaId/aulas` | `{ aula: AdminAula }` | pública |  |
| `updateAula(aulaId: string, data: Partial&lt;{ title: string; description: string; video_provider: string; video_id: string; duration_seconds: number; display_order: number; published: boolean }&gt;)` | `PUT /admin/education/aulas/:aulaId` | `{ aula: AdminAula }` | pública |  |
| `deleteAula(aulaId: string)` | `DELETE /admin/education/aulas/:aulaId` | — | pública |  |
| `getQuizForAula(aulaId: string)` | `GET /admin/education/aulas/:aulaId/quiz` | `{ quiz: AdminQuiz \| null }` | pública | null se a aula ainda não tem prova |
| `createQuiz(aulaId: string, data: { title: string; passing_score_pct?: number; points_awarded?: number })` | `POST /admin/education/aulas/:aulaId/quiz` | `{ quiz: AdminQuiz }` | pública |  |
| `updateQuiz(id: string, data: Partial&lt;{ title: string; passing_score_pct: number; points_awarded: number }&gt;)` | `PUT /admin/quizzes/:id` | `{ quiz: AdminQuiz }` | pública |  |
| `deleteQuiz(id: string)` | `DELETE /admin/quizzes/:id` | — | pública |  |
| `addQuizQuestion(quizId: string, data: { prompt: string; options: { id: string; label: string }[]; correct_option_id: string; display_order?: number })` | `POST /admin/quizzes/:quizId/questions` | `{ question: AdminQuizQuestion }` | pública |  |
| `updateQuizQuestion(questionId: string, data: Partial&lt;{ prompt: string; options: { id: string; label: string }[]; correct_option_id: string; display_order: number }&gt;)` | `PUT /admin/quizzes/questions/:questionId` | `{ question: AdminQuizQuestion }` | pública |  |
| `deleteQuizQuestion(questionId: string)` | `DELETE /admin/quizzes/questions/:questionId` | — | pública |  |
| `listChallenges()` | `GET /admin/challenges` | `{ challenges: AdminChallenge[] }` | pública |  |
| `createChallenge(data: { title: string; description: string; attachment_url?: string; points_awarded?: number; starts_at: string; ends_at: string; published?: boolean })` | `POST /admin/challenges` | `{ challenge: AdminChallenge }` | pública |  |
| `updateChallenge(id: string, data: Partial&lt;{ title: string; description: string; attachment_url: string; points_awarded: number; starts_at: string; ends_at: string; published: boolean }&gt;)` | `PUT /admin/challenges/:id` | `{ challenge: AdminChallenge }` | pública |  |
| `deleteChallenge(id: string)` | `DELETE /admin/challenges/:id` | — | pública |  |
| `listCommunityPosts()` | `GET /admin/community/posts` | `{ posts: AdminCommunityPost[] }` | pública |  |
| `deleteCommunityPost(id: string)` | `DELETE /admin/community/posts/:id` | — | pública |  |

### alertsApi

_Alertas de prazo_

| Função | Chamada | Retorno | Acesso | Observação |
|---|---|---|---|---|
| `summary()` | `GET /alerts` | `AlertsSummary` | módulo crm |  |
| `getPrefs()` | `GET /alerts/preferences` | `{ deadlines_email: boolean; email: string }` | módulo crm |  |
| `setPrefs(deadlines_email: boolean)` | `PUT /alerts/preferences` | `{ deadlines_email: boolean }` | módulo crm |  |
| `sendTest()` | `POST /alerts/digest/test` | `{ sent_to: string }` | módulo crm |  |

### dashboardApi

_Painel (dashboard)_

| Função | Chamada | Retorno | Acesso | Observação |
|---|---|---|---|---|
| `get()` | `GET /dashboard` | `DashboardData` | módulo crm |  |

### supportApi

_Suporte_

| Função | Chamada | Retorno | Acesso | Observação |
|---|---|---|---|---|
| `info()` | `GET /support` | `SupportInfo` | logado |  |
| `list()` | `GET /support/tickets` | `SupportTicket[]` | logado |  |
| `create(data: { category: string; subject: string; message: string; page?: string })` | `POST /support/tickets` | `{ id: string; status: string; emailed: boolean; reply_to: string }` | logado |  |

### boardsApi

_Quadros personalizáveis_

| Função | Chamada | Retorno | Acesso | Observação |
|---|---|---|---|---|
| `templates()` | `GET /boards/templates` | `BoardTemplate[]` | módulo crm · área boards |  |
| `list()` | `GET /boards` | `BoardSummary[]` | módulo crm · área boards |  |
| `get(id: string)` | `GET /boards/:id` | `Board` | módulo crm · área boards |  |
| `create(data: { name: string; description?: string; template?: string; color?: string })` | `POST /boards` | `Board` | módulo crm · área boards · perm. boards_manage |  |
| `update(id: string, data: { name?: string; description?: string \| null; color?: string })` | `PUT /boards/:id` | `Board` | módulo crm · área boards · perm. boards_manage |  |
| `remove(id: string)` | `DELETE /boards/:id` | — | módulo crm · área boards · perm. boards_manage |  |
| `addColumn(id: string, data: { name: string; type: BoardColumnType })` | `POST /boards/:id/columns` | `BoardColumn` | módulo crm · área boards · perm. boards_manage |  |
| `updateColumn(id: string, colId: string, data: { name?: string; settings?: { options: StatusOption[] } })` | `PUT /boards/:id/columns/:colId` | `BoardColumn` | módulo crm · área boards · perm. boards_manage |  |
| `reorderColumns(id: string, ids: string[])` | `PUT /boards/:id/columns/order` | — | módulo crm · área boards · perm. boards_manage |  |
| `removeColumn(id: string, colId: string)` | `DELETE /boards/:id/columns/:colId` | — | módulo crm · área boards · perm. boards_manage |  |
| `addGroup(id: string, data: { name?: string })` | `POST /boards/:id/groups` | `BoardGroup` | módulo crm · área boards · perm. boards_manage |  |
| `updateGroup(id: string, gid: string, data: { name?: string; color?: string })` | `PUT /boards/:id/groups/:gid` | `BoardGroup` | módulo crm · área boards · perm. boards_manage |  |
| `removeGroup(id: string, gid: string)` | `DELETE /boards/:id/groups/:gid` | — | módulo crm · área boards · perm. boards_manage |  |
| `addItem(id: string, data: { name: string; group_id?: string; vals?: Record&lt;string, BoardCell&gt; })` | `POST /boards/:id/items` | `BoardItem` | módulo crm · área boards · perm. boards_edit |  |
| `updateItem(id: string, itemId: string, data: { name?: string; group_id?: string; vals?: Record&lt;string, BoardCell&gt; })` | `PUT /boards/:id/items/:itemId` | `BoardItem` | módulo crm · área boards · perm. boards_edit |  |
| `removeItem(id: string, itemId: string)` | `DELETE /boards/:id/items/:itemId` | — | módulo crm · área boards · perm. boards_edit |  |

### googleApi

_Integração Google Agenda_

| Função | Chamada | Retorno | Acesso | Observação |
|---|---|---|---|---|
| `status()` | `GET /integrations/google` | `GoogleStatus` | logado |  |
| `start(returnTo: 'agenda' \| 'settings' = 'settings')` | `POST /integrations/google/start` | `{ url: string }` | módulo crm · área agenda | `returnTo`: para onde o Google devolve a pessoa depois de autorizar |
| `sync()` | `POST /integrations/google/sync` | `{ imported?: number; removed?: number; skipped?: boolean }` | módulo crm · área agenda |  |
| `disconnect()` | `DELETE /integrations/google` | `{ disconnected: boolean; removed_imported_events?: number }` | logado |  |

_40 objetos · 233 funções._

<!-- gerado:fim -->

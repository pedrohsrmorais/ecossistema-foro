# Referência da API

Base URL: `https://app.seudominio.com.br/api` (em produção, via nginx; local: `http://localhost:3040/api`)

Todas as rotas protegidas exigem o header:
```
Authorization: Bearer <jwt_token>
```

---

## Autenticação

Limites (por IP, `429 RATE_LIMITED`): login 10 falhas/15 min · cadastro e fluxos de e-mail 10/hora · confirmação de código 20/15 min. Reenvio de código de verificação: 1 a cada 60 s e no máximo 5/hora (`429 RESEND_COOLDOWN` / `RESEND_LIMIT`).
`POST /auth/refresh-token` só aceita um token ainda válido de usuário ativo. `POST /auth/reset-password` (e o convite) exigem senha de 8 a 72 caracteres e também marcam o e-mail como confirmado. Todos os e-mails trazem o aviso para conferir spam/lixeira.

### Registrar conta
```
POST /auth/register
Body: {
  accountName: "Escritório Silva",
  email: "admin@silva.adv.br",
  password: "senha_segura",
  name: "João Silva",
  phone: "+5551999999999"   // opcional
}
Response 201: { token, user: { id, name, email, role }, account: { id, name } }
```
A conta é criada com `status: "trialing"` e 14 dias de teste gratuito. Um código de verificação de e-mail é disparado automaticamente (ver `/auth/send-verification` abaixo) — hoje ele só é logado no console do servidor, sem provedor de e-mail real integrado.

### Login
```
POST /auth/login
Body: { email, password }
Response 200: { token, user: { id, name, email, role, account_id } }
```

### Renovar token
```
POST /auth/refresh-token
Body: { token }
Response 200: { token }
```

### Solicitar reset de senha
```
POST /auth/forgot-password
Body: { email }
Response 200: { message }
```

### Confirmar reset de senha
```
POST /auth/reset-password
Body: { token, password }
Response 200: { message }
```

### Enviar código de verificação (e-mail ou celular)
```
POST /auth/send-verification   (autenticado)
Body: { channel: "email" | "phone" }
Response 200: { sent: true, channel, expires_in_minutes: 10 }
```
> `channel: "email"` envia de verdade via Resend. `channel: "phone"` ainda só loga no console — nenhum provedor de SMS foi integrado.

### Confirmar código de verificação
```
POST /auth/verify-code   (autenticado)
Body: { channel: "email" | "phone", code: "123456" }
Response 200: { verified: true, channel }
```
**Importante**: enquanto o e-mail não é confirmado, toda rota protegida abaixo retorna `403 { error, code: "EMAIL_NOT_VERIFIED" }` (ver `requireVerifiedEmail` em `arquitetura.md`). Só `send-verification`, `verify-code` e `GET /users/me` ficam acessíveis antes da confirmação.

---

## Usuários

### Perfil do usuário logado
```
GET /users/me
Response 200: { id, name, email, role, account_id, created_at }
```

### Atualizar perfil
```
PUT /users/me
Body: { name?, email? }
Response 200: { user }
```

### Alterar senha
```
PUT /users/me/password
Body: { currentPassword, newPassword }   # newPassword: 8 a 72 caracteres
Response 200: { message }
```

### Listar equipe
```
GET /users
Response 200: [ { id, name, email, role, active, email_verified, pending_invite, created_at } ]
```
`pending_invite: true` = ainda não confirmou o e-mail / não aceitou o convite.

### Convidar usuário (admin)
```
POST /users/invite
Body: { name, email, role?: "admin" | "user" }
Response 201: { user }
Erros: 403 PLAN_LIMIT_USERS (limite de usuários do plano) · 409 (e-mail já cadastrado) · 502 INVITE_EMAIL_FAILED (usuário criado, e-mail falhou → reenviar)
```
Cria o usuário com senha inutilizável e envia por e-mail um link de 72h (`/reset-password?token=…&convite=1`). Quem aceita já fica com o e-mail confirmado.

### Reenviar convite (admin)
```
POST /users/:id/resend-invite
```

### Atualizar usuário (admin)
```
PUT /users/:id
Body: { name?, role?: "admin" | "user", active?: boolean }
Erros: 400 LAST_ADMIN (a conta precisa de ao menos 1 administrador ativo) · 403 PLAN_LIMIT_USERS (ao reativar)
```

### Desativar usuário (admin)
```
DELETE /users/:id
Response 200: { message }
```
O acesso é cortado imediatamente: o token de um usuário inativo passa a retornar 401 (o papel e o status são lidos do banco a cada requisição).

---

## Campos customizáveis

### Listar campos
```
GET /fields
Response 200: [
  {
    id, name, label, field_type,
    is_required, collect_via_ai,
    display_order, options
  }
]
```

### Criar campo
```
POST /fields
Body: {
  name: "area_juridica",           // snake_case, sem espaços
  label: "Área jurídica",
  field_type: "select",            // text | textarea | number | date | boolean | select
  is_required: false,
  collect_via_ai: true,
  options: ["Cível", "Trabalhista", "Criminal"]
}
Response 201: { field }
```

### Atualizar campo
```
PUT /fields/:id
Body: { label?, is_required?, collect_via_ai?, options? }
Response 200: { field }
```

### Remover campo
```
DELETE /fields/:id
Response 200: { message }
```

### Reordenar campos
```
PUT /fields/reorder
Body: { fields: [{ id, display_order }] }
Response 200: { message }
```

---

## Leads

### Listar leads
```
GET /leads?search=&stage=&page=1&limit=20
Response 200: {
  leads: [...],
  pagination: { page, limit, total, total_pages }
}
```

### Criar lead
```
POST /leads
Body: {
  name: "Maria Santos",
  email: "maria@email.com",
  phone: "51999999999",
  stage: "novo",               // novo | contatado | reuniao_agendada | proposta | convertido | perdido
  source: "indicação",
  field_values: {              // campos customizáveis
    "area_juridica": "Trabalhista",
    "honorarios": 3500
  }
}
Response 201: { lead }
```

### Resumo do funil
```
GET /leads/funnel
Response 200: [
  { stage: "novo", total: 12 },
  { stage: "contatado", total: 5 },
  ...
]
```

### Buscar lead por ID
```
GET /leads/:id
Response 200: {
  id, name, email, phone, stage, source,
  is_archived, created_at, updated_at,
  custom_fields: {
    area_juridica: { label: "Área jurídica", value: "Trabalhista", field_type: "select" }
  }
}
```

### Atualizar lead
```
PUT /leads/:id
Body: { name?, email?, phone?, source?, field_values? }
Response 200: { lead }
```

### Mover estágio
```
PATCH /leads/:id/stage
Body: { stage: "reuniao_agendada" }
Response 200: { lead }
```

### Arquivar lead
```
PATCH /leads/:id/archive
Response 200: { message }
```

### Excluir lead (soft delete)
```
DELETE /leads/:id
Response 200: { message }
```

---

## Notas do lead

### Listar notas
```
GET /leads/:id/notes
Response 200: { notes: [{ id, content, author_name, created_at }] }
```

### Adicionar nota
```
POST /leads/:id/notes
Body: { content: "Cliente prefere reunião por videochamada." }
Response 201: { note }
```

### Excluir nota
```
DELETE /leads/:leadId/notes/:noteId
Response 200: { message }
```

---

## Tarefas

### Listar tarefas do lead
```
GET /leads/:id/tasks
Response 200: { tasks: [...] }
```

### Criar tarefa no lead
```
POST /leads/:id/tasks
Body: {
  description: "Enviar proposta de honorários",
  due_date: "2024-12-31"    // opcional
}
Response 201: { task }
```

### Concluir tarefa
```
PATCH /leads/:leadId/tasks/:taskId/complete
Response 200: { task }
```

### Listar todas as tarefas da conta
```
GET /tasks?pending_only=true&limit=50
Response 200: { tasks: [{ ...task, lead_name }] }
```

---

## Chat com IA

### Enviar mensagem
```
POST /ai/message
Body: {
  message: "Crie um lead para Dr. Paulo Salave, advogado trabalhista.",
  conversation_id: "uuid"   // opcional — omitir para nova conversa
}
Response 200: {
  conversation_id: "uuid",
  message: "Pronto! Criei o lead para Dr. Paulo Salave...",
  actions: [{ tool, write, ok, summary, lead_id }],   // o que a IA fez no CRM neste turno
  usage: { input_tokens, output_tokens, credits_used },
  credits: { weekly_limit, used, remaining, renews_at, ... }   // saldo atualizado
}
402 { code: "AI_CREDITS_EXHAUSTED", renews_at }   // sem créditos até a renovação semanal
```
Modelo: `claude-sonnet-4-6` (env `ANTHROPIC_MODEL`), com prompt caching.

### Saldo semanal de créditos
```
GET /ai/credits
Response 200: {
  plan_id, plan_name, weekly_limit, used, remaining,
  window_start, renews_at, lookups_week,
  rule: { tokens_per_credit: 2500, output_weight: 5 }
}
```
créditos = (tokens de entrada totais + 5 × tokens de saída) ÷ 2.500.

### Listar conversas
```
GET /ai/conversations
Response 200: { conversations: [{ id, created_at, last_message_at }] }
```

### Buscar conversa
```
GET /ai/conversations/:id
Response 200: {
  conversation: { id, created_at },
  messages: [{ role, content, created_at }]
}
```

### Excluir conversa
```
DELETE /ai/conversations/:id
Response 200: { message }
```

### Uso de IA
```
GET /ai/usage
Response 200: {
  usage: {
    total_turns: 42,
    total_input_tokens: 85000,
    total_output_tokens: 12000,
    total_cost_usd: "0.4350"
  }
}
```

---

## Processos (CRM jurídico)

Todas as rotas exigem autenticação e o módulo `crm`.

| Método | Rota | Descrição |
|---|---|---|
| GET | `/cases` | Lista processos (filtros: `status`, `q`, `page`, `limit`) |
| POST | `/cases` | Cria processo (`case_number` CNJ, `title`, `tribunal`, `court_url`, `area`, `status`, `phase`, `client_role`, `opposing_party`, `cause_value`, `lead_id`, `responsible_user_id`). Número duplicado na conta → 409 |
| GET | `/cases/analyze?number=` | Valida número CNJ (dígito verificador), identifica o tribunal e sugere link (TJSP/e-SAJ) |
| GET | `/cases/:id` | Detalhe com andamentos, tarefas/prazos e eventos, `number_valid`, `tribunal_name`, `suggested_url` |
| PUT | `/cases/:id` | Atualiza processo (`court_url` deve ser http/https) |
| DELETE | `/cases/:id` | Exclusão lógica |
| POST | `/cases/:id/updates` | Adiciona andamento (`update_date`, `text`; origem `manual` ou `ai_chat`) |
| DELETE | `/cases/:id/updates/:updateId` | Remove andamento |

## Agenda

| Método | Rota | Descrição |
|---|---|---|
| GET | `/events` | Lista eventos (`from`, `to`, `type`, `status`) |
| POST | `/events` | Cria evento: `type` (reuniao/audiencia/pericia/outro), `title`, `starts_at`, `ends_at`, `location`, `meeting_url`, `lead_id`, `case_id` |
| PUT | `/events/:id` | Atualiza evento |
| DELETE | `/events/:id` | Remove evento |

## Tarefas e prazos globais

`POST /tasks` cria tarefa sem exigir lead: aceita `case_id` e `is_deadline` (prazo processual). Tarefas listadas em `GET /tasks` incluem o processo vinculado.

## Ferramentas da IA (17)

Além das 10 originais de leads/notas/tarefas, o chat opera: `create_case`, `search_cases`, `get_case`, `update_case`, `add_case_update`, `create_event`, `list_events`. As `actions` retornadas pelo chat incluem `case_id` quando aplicável. Mais ferramentas elevam o consumo-base de créditos por mensagem (~1,1 crédito).

## Pagamentos

### Listar pagamentos
```
GET /payments?status=&page=1&limit=20
Response 200: {
  payments: [...],
  pagination: { ... }
}
```

### Criar cobrança PIX
```
POST /payments/pix
Body: { amount, description, dueDate? }
Response 201: { payment, pix: { encodedImage, payload } }
```

### Criar cobrança no cartão
```
POST /payments/card
Body: { amount, description, card: {...}, holderInfo: {...} }
Response 201: { payment }
```

### Criar assinatura
```
POST /payments/subscription
Body: { plan: "starter" | "pro" }
Response 201: { subscription }
```

### Buscar pagamento
```
GET /payments/:id
Response 200: { payment }
```

### Buscar NFS-e do pagamento
```
GET /payments/:id/nfse
Response 200: { payment, nfse }
```

---

## Configurações

### Buscar configurações da conta
```
GET /settings
Response 200: {
  id, name, slug, status, plan_id,
  settings: { ... }
}
```

### Atualizar configurações
```
PUT /settings
Body: { name?, settings? }
Response 200: { account }
```

### Dados do plano atual
```
GET /settings/plan
Response 200: {
  current: "starter",
  name: "Starter",
  price: 129.9,
  max_users: 1,
  max_leads: 500,
  features: ["CRM com IA", "Até 500 leads", "1 usuário"],
  account_status: "trialing",
  trial_ends_at: "2024-12-31T00:00:00.000Z"
}
```
Também retorna `ai_credits_week` e `lookups_week`.

### Planos disponíveis para assinatura
```
GET /plans
Response 200: [{ id, name, price, max_users, max_leads, ai_credits_week, lookups_week, features }]
```
Lista só planos `purchasable` (o `trial` não aparece). Liberado mesmo com o teste expirado, assim como `/payments/*`, `/settings/plan`, `/users/me`, `/modules` e `/ai/credits`.

Lido diretamente da tabela `plans` (ver [banco-de-dados.md](./banco-de-dados.md)) — não há mais valores fixos no código.

---

## Créditos

Carteira pré-paga usada para pagar as consultas da seção **Consultas pagas** abaixo. Ver [banco-de-dados.md](./banco-de-dados.md#7-créditos--serviços-pagos-de-terceiros) para o modelo de negócio completo. **Não há endpoint de reembolso solicitado pelo tenant** — qualquer reembolso é feito manualmente pela intellsn via painel administrativo.

### Consultar saldo
```
GET /credits/balance
Response 200: { balance_cents: 1500 }
```

### Listar preços dos serviços
```
GET /credits/prices
Response 200: { prices: [{ service_key, name, price_cents, provider, description }] }
```

### Listar movimentações (extrato)
```
GET /credits/transactions?page=1&limit=30
Response 200: { transactions: [{ id, type, amount_cents, balance_after_cents, service_key, note, created_at }] }
```

### Recarregar via PIX
```
POST /credits/purchase/pix
Body: { amount, description? }
Response 201: { payment com pix_qr_code e pix_copy_paste }
```
O saldo só é creditado quando o webhook do Asaas confirma o pagamento (nunca na criação da cobrança) — ver `payments.service.js::_creditWalletOnce`.

### Recarregar via cartão
```
POST /credits/purchase/card
Body: { amount, description?, card: {...} }
Response 201: { payment }
```

---

## Consultas pagas (CPF, CNPJ, processual) e resumo por IA

Cada chamada debita créditos automaticamente antes de consultar o provedor externo (`external-lookup.service.js`). Se o provedor falhar por erro técnico, o crédito é devolvido automaticamente e a resposta é sempre a mensagem genérica abaixo — nunca o erro técnico real.

| Status | Quando acontece                                                        |
|--------|-------------------------------------------------------------------------|
| `402`  | Créditos insuficientes — `{ error: "Créditos insuficientes. Adicione créditos para continuar." }` |
| `502`  | Falha técnica no provedor (crédito já foi devolvido) — `{ error: "Erro na requisição. Tente novamente em alguns minutos ou contate o suporte." }` |

### Consultar CNPJ
```
POST /lookup/cnpj
Body: { cnpj }
Response 200: { data: { cnpj, razao_social, nome_fantasia, situacao_cadastral, ... } }
```
Dígito verificador validado localmente **antes** de debitar — CNPJ malformado nunca gasta crédito.

### Consultar CPF
```
POST /lookup/cpf
Body: { cpf }
Response 200: { data: { cpf, nome, situacao, ... } }
```
Mesmo tratamento de validação local do CPF. O CPF é mascarado nos logs internos (LGPD).

### Buscar processos por CPF/CNPJ
```
POST /lookup/processo
Body: { documento }
Response 200: { data: { documento, processos: [{ numero_cnj, tribunal, classe, ultima_movimentacao, data_ultima_movimentacao }] } }
```

### Resumir processo por IA
```
POST /lookup/processo/summary
Body: { processo }   // o objeto retornado por POST /lookup/processo
Response 200: { data: { summary: "..." } }
```
Usa o mesmo modelo Anthropic do chat interno, mas como chamada avulsa (sem tools/histórico) — cobrada por preço fixo em créditos, não por token.

Sem nenhum provedor configurado (`CNPJ_PROVIDER_BASE_URL`, `CPF_PROVIDER_BASE_URL`, `PROCESS_PROVIDER_BASE_URL` vazios no `.env`), os três primeiros endpoints retornam dado **MOCK** — permite testar todo o fluxo de créditos sem ter contratado nenhuma API externa ainda.

---

## Módulos

Cada funcionalidade do produto (CRM, pesquisa, educação) é um módulo que pode ser desativado por conta — exclusivamente pelos admins da plataforma (ver seção **Painel administrativo**). Rotas de CRM, `/lookup/*` e `/education/*` retornam `403 { code: 'MODULE_DISABLED' }` quando o módulo correspondente está desativado para a conta.

### Quais módulos estão ativos para a conta logada
```
GET /modules
Response 200: { modules: [{ module_key, name, description, display_order, enabled }] }
```
Usado pelo frontend para decidir o que mostrar no menu sem precisar tentar cada rota.

---

## Educação

Trilhas e aulas em vídeo sobre tecnologia/automação/IA, atrás do módulo `educacao`. O conteúdo é da plataforma (criado pela intellsn), não por conta — ver **CMS do módulo Educação** na seção de admin para criar/editar.

### Listar trilhas publicadas
```
GET /education/trilhas
Response 200: { trilhas: [{ id, title, description, cover_image_url, display_order, total_aulas, aulas_concluidas }] }
```
`aulas_concluidas` já vem calculado para o usuário logado.

### Detalhar uma trilha (com aulas e progresso do usuário)
```
GET /education/trilhas/:id
Response 200: { trilha: { ...trilha, aulas: [{ id, title, description, video_provider, video_id, duration_seconds, last_position_seconds, completed_at }] } }
```

### Atualizar progresso de uma aula
```
PUT /education/aulas/:aulaId/progress
Body: { last_position_seconds?, completed? }
Response 200: { progress }
```
Upsert — cada usuário tem seu próprio progresso, mesmo dentro da mesma conta.

---

## Provas de conceito

Quiz de múltipla escolha vinculado a UMA aula de Educação, atrás do módulo `provas_conceito`. No máximo um quiz por aula — conteúdo é da plataforma, criado no CMS do admin.

### Listar provas disponíveis (todas as trilhas) + melhor resultado do usuário
```
GET /education/quizzes
Response 200: { quizzes: [{ quiz_id, title, points_awarded, passing_score_pct, aula_id, aula_title, trilha_id, trilha_title, best_score_pct, best_passed }] }
```

### Buscar a prova de uma aula específica (sem o gabarito)
```
GET /education/aulas/:aulaId/quiz
Response 200: { quiz: { id, aula_id, title, passing_score_pct, points_awarded, questions: [{ id, prompt, options, display_order }], best_attempt } | null }
```
`options` é um array de `{ id, label }` — nunca inclui qual é a correta.

### Submeter respostas
```
POST /education/quizzes/:id/attempts
Body: { answers: [{ question_id, option_id }] }
Response 201: { attempt: { id, score_pct, passed, points_awarded, total_questions, correct_count } }
```
`points_awarded` só é maior que zero na primeira vez que o usuário atinge `passing_score_pct` nesse quiz — tentativas repetidas (mesmo passando de novo) não pontuam de novo. Ao pontuar, um post de "conquista" é gerado automaticamente no feed de Comunidade da conta.

---

## Desafios semanais

Desafios publicados pela equipe intellsn, atrás do módulo `desafios_semanais`. Conclusão é **auto-declarada** pelo usuário (sem verificação).

### Listar desafios publicados
```
GET /challenges
Response 200: { challenges: [{ id, title, description, attachment_url, points_awarded, starts_at, ends_at, is_current, completed }] }
```
`is_current` indica se hoje está dentro da janela `starts_at`–`ends_at`. `completed` já vem calculado para o usuário logado.

### Marcar um desafio como concluído
```
POST /challenges/:id/complete
Response 201: { completion: { points_awarded, already_completed } }
```
Idempotente — chamar de novo num desafio já concluído não gera pontos duplicados (`already_completed: true`, `points_awarded: 0`). Gera um post de "conquista" automático no feed de Comunidade na primeira conclusão.

---

## Comunidade

Atrás do módulo `comunidade`. Duas coisas deliberadamente separadas — ver [arquitetura.md](./arquitetura.md#provas-de-conceito-desafios-semanais-e-comunidade--o-ecossistema).

### Feed da própria conta (nunca cross-tenant)
```
GET /community/posts
Response 200: { posts: [{ id, content, kind, created_at, user_id, user_name }] }

POST /community/posts
Body: { content }
Response 201: { post }

DELETE /community/posts/:id
Response 204
```
`DELETE` só funciona na própria publicação, ou em qualquer uma da conta se o usuário for `role: admin`.

### Ranking de pontos entre escritórios (cross-tenant)
```
GET /community/leaderboard
Response 200: { ranking: [{ account_id, account_name, total_points, pos, is_mine }] }
```
Top 10 contas por pontos totais (soma de `quiz_attempts` + `weekly_challenge_completions`), **mais a posição da própria conta mesmo se estiver fora do top 10** — `is_mine: true` marca essa linha. Esse endpoint é cross-tenant por decisão explícita do dono da plataforma; o feed de posts acima não é.

---

## Painel administrativo (plataforma)

Rotas exclusivas da equipe intellsn — autenticação própria (`platform-login`), **não** usam `account_id`. Veem e gerenciam todos os tenants.

### Login da plataforma
```
POST /auth/platform-login
Body: { email, password }
Response 200: { token, admin: { id, name, email } }
```

### Listar todas as contas (tenants)
```
GET /admin/accounts
Headers: Authorization: Bearer <token_de_platform-login>
Response 200: {
  accounts: [
    { id, name, slug, status, plan_id, plan_name, plan_price, trial_ends_at, users_count, leads_count, created_at }
  ]
}
```

### Detalhar uma conta
```
GET /admin/accounts/:id
Response 200: { account: { ...accounts, plan_name, plan_price, users: [...], recent_payments: [...] } }
```

### Alterar status de uma conta (suspender/reativar/cancelar)
```
PATCH /admin/accounts/:id/status
Body: { status: "trialing" | "active" | "suspended" | "cancelled" }
Response 200: { account }
```

### Listar planos
```
GET /admin/plans
Response 200: { plans: [{ id, name, price, max_users, max_leads, features, active }] }
```

### Visão geral de créditos (todos os tenants)
```
GET /admin/credits/overview
Response 200: {
  overview: {
    total_purchased_cents, total_consumed_cents, total_refunded_cents, total_adjusted_cents,
    by_service: [{ service_key, usage_count, consumed_cents }],
    total_wallets_balance_cents
  }
}
```
Serve para a intellsn comparar o gasto real nos provedores externos com o que foi vendido em créditos — divergência grande é sinal de bug.

### Ajustar créditos de uma conta (único caminho de "reembolso")
```
PATCH /admin/accounts/:id/credits/adjust
Body: { amount_cents, note }   // amount_cents pode ser negativo (desconto) ou positivo (crédito/reembolso); note é obrigatório
Response 200: { transactionId, balance_cents }
```
**Este é o único endpoint que reverte créditos por decisão de reembolso.** Não existe equivalente acionável pelo tenant — conforme definido pelo dono da plataforma, qualquer pedido de reembolso é tratado diretamente com a intellsn, nunca dentro do produto.

### Módulos — catálogo e liga/desliga por conta
```
GET /admin/modules
Response 200: { modules: [{ module_key, name, description, display_order }] }

GET /admin/accounts/:id/modules
Response 200: { modules: [{ module_key, name, description, display_order, enabled }] }

PATCH /admin/accounts/:id/modules/:moduleKey
Body: { enabled: true | false }
Response 200: { modules: [...] }   // estado atualizado de todos os módulos da conta
```
Único jeito do sistema de desativar CRM/pesquisa/educação para um tenant específico — nunca acionável pelo próprio tenant.

### CMS do módulo Educação

Conteúdo é da plataforma (não por conta) — toda conta com o módulo `educacao` ativo vê o mesmo catálogo de trilhas publicadas.

```
GET    /admin/education/trilhas              → { trilhas: [...] }  (inclui rascunhos)
GET    /admin/education/trilhas/:id           → { trilha: { ...trilha, aulas: [...] } }
POST   /admin/education/trilhas               Body: { title, description?, cover_image_url?, display_order?, published? }
PUT    /admin/education/trilhas/:id            Body: campos parciais
DELETE /admin/education/trilhas/:id            → 204 (apaga a trilha e suas aulas em cascata)

POST   /admin/education/trilhas/:id/aulas      Body: { title, description?, video_provider?, video_id, duration_seconds?, display_order?, published? }
PUT    /admin/education/aulas/:aulaId          Body: campos parciais
DELETE /admin/education/aulas/:aulaId          → 204
```
Trilhas/aulas nascem com `published: false` (rascunho) — só aparecem para os tenants depois de publicadas explicitamente.

### CMS do módulo Provas de conceito

Um quiz por aula — criado a partir da aula (`aulaId`), editado/apagado pelo próprio `id` do quiz.

```
GET    /admin/education/aulas/:aulaId/quiz    → { quiz: { ...quiz, questions: [...] } | null }
POST   /admin/education/aulas/:aulaId/quiz    Body: { title, passing_score_pct?, points_awarded? }   → 409 se a aula já tem quiz
PUT    /admin/quizzes/:id                     Body: campos parciais
DELETE /admin/quizzes/:id                     → 204 (apaga perguntas e tentativas em cascata)

POST   /admin/quizzes/:id/questions                Body: { prompt, options: [{id,label}], correct_option_id, display_order? }
PUT    /admin/quizzes/questions/:questionId        Body: campos parciais
DELETE /admin/quizzes/questions/:questionId        → 204
```

### CMS do módulo Desafios semanais

```
GET    /admin/challenges     → { challenges: [{ ...challenge, total_conclusoes }] }
POST   /admin/challenges     Body: { title, description, attachment_url?, points_awarded?, starts_at, ends_at, published? }
PUT    /admin/challenges/:id Body: campos parciais
DELETE /admin/challenges/:id → 204
```
Datas em formato `YYYY-MM-DD`. Nasce com `published: false` por padrão (igual Educação).

### Moderação do módulo Comunidade

O feed de cada conta só é visível pra ela mesma (ver seção **Comunidade**), mas a equipe intellsn pode ver e remover qualquer post, de qualquer conta.

```
GET    /admin/community/posts     → { posts: [{ ...post, account_name, account_id }] }   // 100 mais recentes, todas as contas
DELETE /admin/community/posts/:id → 204
```

---

## Webhooks (sem autenticação)

### Webhook Asaas
```
POST /webhooks/asaas
Body: payload do Asaas
Response 200: { received: true }
```

### Webhook NFE.io
```
POST /webhooks/nfeio
Body: payload do NFE.io
Response 200: { received: true }
```

---

## Códigos de erro

| Status | Descrição                                                   |
|--------|-------------------------------------------------------------|
| `400`  | Dados inválidos (erros de validação detalhados no body)     |
| `401`  | Token ausente, inválido ou expirado                         |
| `403`  | Sem permissão (conta suspensa/cancelada/trial expirado, ou role insuficiente). Trial expirado retorna `{ error, code: "TRIAL_EXPIRED" }` |
| `404`  | Recurso não encontrado                                      |
| `409`  | Conflito (email já cadastrado, etc.)                        |
| `402`  | Créditos insuficientes (rotas de `/lookup/*`)               |
| `403` com `code: "FEATURE_LOCKED"` | Consultas (`/lookup/*`) indisponíveis nesta fase (`FEATURE_LOOKUPS_ENABLED`) |
| `403` com `code: "PLAN_LIMIT_LEADS"` | Limite de leads do plano atingido |
| `402` com `code: "AI_CREDITS_EXHAUSTED"` | Créditos de IA da semana esgotados |
| `403` com `code: "MODULE_DISABLED"` | Módulo desativado para a conta por um admin da plataforma |
| `500`  | Erro interno do servidor                                    |
| `502`  | Falha técnica num provedor externo pago (crédito já devolvido automaticamente) |

Formato de erro:
```json
{
  "error": "Descrição do erro",
  "details": [...]   // apenas em erros de validação (400)
}
```

# Referência da API

Base URL: `http://sua-vps:3040/api`

Todas as rotas protegidas exigem o header:
```
Authorization: Bearer <jwt_token>
```

---

## Autenticação

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
Body: { current_password, new_password }
Response 200: { message }
```

### Listar usuários (admin)
```
GET /users
Response 200: { users: [...] }
```

### Buscar usuário por ID (admin)
```
GET /users/:id
Response 200: { user }
```

### Atualizar usuário (admin)
```
PUT /users/:id
Body: { name?, email?, role? }
Response 200: { user }
```

### Desativar usuário (admin)
```
DELETE /users/:id
Response 200: { message }
```

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
  usage: { input_tokens, output_tokens, cost_usd }
}
```

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
  price: 97,
  max_users: 1,
  max_leads: 500,
  features: ["CRM com IA", "Até 500 leads", "1 usuário"],
  account_status: "trialing",
  trial_ends_at: "2024-12-31T00:00:00.000Z"
}
```
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
| `500`  | Erro interno do servidor                                    |
| `502`  | Falha técnica num provedor externo pago (crédito já devolvido automaticamente) |

Formato de erro:
```json
{
  "error": "Descrição do erro",
  "details": [...]   // apenas em erros de validação (400)
}
```

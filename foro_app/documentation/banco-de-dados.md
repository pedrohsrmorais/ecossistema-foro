# Banco de Dados

Schema único em [`backend/configs/init.sql`](../backend/configs/init.sql), executado automaticamente pelo Docker na primeira inicialização do container MySQL (volume vazio).

> **Enquanto nada estiver em produção**: qualquer alteração de estrutura deve ser feita **direto nesse arquivo** (não crie migrations separadas). Para aplicar uma mudança:
> ```bash
> docker compose down -v      # remove o volume foro_db_data — APAGA os dados
> docker compose up -d --build
> ```
> O MySQL só roda os scripts de `/docker-entrypoint-initdb.d/` quando o volume de dados está vazio. Se o volume já existir, o `init.sql` **não** será re-executado automaticamente.

---

## Diagrama de relacionamento (visão geral)

```
platform_admins                    plans
  (equipe intellsn,                  (catálogo: starter, pro)
   fora de qualquer tenant)             │
                                         │ FK plan_id
                                         ▼
                                     accounts  (tenants)
                                         │
                  ┌──────────────────────┼───────────────────────┐
                  │                      │                       │
                  ▼                      ▼                       ▼
               users                field_definitions          payments
                  │                      │                       │
     ┌────────────┼──────────┐           │ FK                    │ FK
     ▼            ▼          ▼           ▼                       ▼
verification_  password_  ai_conver-  lead_field_values      nfse_records
  codes        reset_      sations         ▲
               tokens         │             │ FK lead_id
                               ▼             │
                           ai_messages      leads ───┬──── lead_notes
                                              │       └──── tasks
                                              ▼
                                        audit_events (log, sem FK)
```

---

## 1. Plataforma (`platform_admins`, `plans`)

Essas duas tabelas ficam **fora** do conceito de tenant — não têm `account_id`.

### `platform_admins`
Equipe da intellsn que administra **todos** os escritórios cadastrados (não é um usuário de um escritório específico).

| Coluna          | Tipo         | Descrição                                   |
|-----------------|--------------|----------------------------------------------|
| `id`            | VARCHAR(36)  | UUID                                          |
| `name`          | VARCHAR(255) | Nome do administrador                         |
| `email`         | VARCHAR(255) | Único — login em `POST /api/auth/platform-login` |
| `password_hash` | VARCHAR(255) | bcrypt (12 rounds)                            |
| `active`        | TINYINT(1)   | Desativa acesso sem apagar o registro         |

**Seed**: `admin@intellsn.com.br` já é criado no `init.sql` com a senha em hash enviada por você. A senha em texto puro **não** está em nenhum arquivo do projeto — apenas o hash bcrypt.

Login gera um JWT com `{ platform_admin_id, email, type: 'platform_admin' }`, validado pelo middleware `authenticatePlatform` (diferente do `authenticate` usado pelos tenants, que exige `account_id`).

### `plans`
Catálogo de planos — fonte única de verdade para preço e recursos (antes esses valores estavam hardcoded em `settings.service.js` e `payments.service.js`; agora ambos leem desta tabela).

| Coluna          | Tipo          | Descrição                              |
|-----------------|---------------|-----------------------------------------|
| `id`            | VARCHAR(50)   | Slug: `starter`, `pro`                  |
| `name`          | VARCHAR(100)  | Nome exibido                            |
| `price`         | DECIMAL(10,2) | Preço mensal em R$                      |
| `max_users`     | INT NULL      | `NULL` = ilimitado                      |
| `max_leads`     | INT NULL      | `NULL` = ilimitado                      |
| `features`      | JSON          | Array de strings (bullets exibidos)     |
| `active`        | TINYINT(1)    | Planos desativados saem do catálogo público |

**Seed**: `starter` (R$ 97) e `pro` (R$ 197).

---

## 2. Contas e usuários (multi-tenancy)

### `accounts`
Cada escritório de advocacia é uma conta isolada (`account_id` é o filtro em praticamente toda query do sistema).

| Coluna          | Tipo         | Descrição                                                |
|-----------------|--------------|------------------------------------------------------------|
| `status`        | ENUM         | `trialing` → `active` → `suspended`/`cancelled`             |
| `plan_id`       | VARCHAR(50)  | FK → `plans.id`                                             |
| `trial_ends_at` | DATETIME     | Fim do teste gratuito de 14 dias (setado no cadastro)       |
| `asaas_id`      | VARCHAR(100) | ID do cliente no Asaas (preenchido no 1º pagamento)         |

Fluxo de `status`:
```
registro  ──▶  trialing (14 dias)  ──▶  [assina um plano]  ──▶  active
                    │
                    └── [trial expira sem assinar] ──▶  bloqueado (403 TRIAL_EXPIRED)
                                                           pelo client.middleware.js
```
`suspended` e `cancelled` são setados manualmente hoje (via `PATCH /api/admin/accounts/:id/status`, pelo painel administrativo) — não há automação ainda ligando atraso de pagamento Asaas a suspensão automática.

### `users`
Usuários de uma conta (advogados/assistentes).

| Coluna              | Tipo         | Descrição                                          |
|---------------------|--------------|------------------------------------------------------|
| `phone`              | VARCHAR(20)  | Opcional no cadastro, único quando preenchido        |
| `email_verified_at`  | DATETIME NULL| Setado por `POST /api/auth/verify-code` (canal email) |
| `phone_verified_at`  | DATETIME NULL| Setado por `POST /api/auth/verify-code` (canal phone) |
| `role`               | ENUM         | `admin` (dono/gestor) ou `user` (colaborador)        |

`email` é **globalmente único** (entre todas as contas) — é o identificador de login.

### `verification_codes`
Códigos OTP de 6 dígitos para confirmar e-mail ou celular.

| Coluna        | Descrição                                               |
|---------------|----------------------------------------------------------|
| `channel`     | `email` ou `phone`                                       |
| `code`        | Código numérico                                          |
| `attempts`    | Incrementado a cada tentativa errada (máx. 5)             |
| `expires_at`  | 10 minutos após a geração                                |
| `consumed_at` | Preenchido quando o código é validado com sucesso         |

Gerado por `authService.sendVerificationCode(userId, channel)`, validado por `authService.verifyCode(userId, channel, code)`.

### `password_reset_tokens`
Fluxo de "esqueci minha senha".

| Coluna       | Descrição                                                      |
|--------------|-------------------------------------------------------------------|
| `token_hash` | SHA-256 do token — o token em texto puro só existe no link enviado por e-mail, nunca é salvo |
| `expires_at` | 1 hora após a geração                                              |
| `used_at`    | Preenchido quando a senha é efetivamente redefinida (token de uso único) |

---

## 3. CRM (`field_definitions`, `leads`, `lead_field_values`, `lead_notes`, `tasks`)

Sem alterações em relação ao desenho original — ver [arquitetura.md](./arquitetura.md#campos-customizáveis-eav) para o padrão EAV dos campos customizáveis.

---

## 4. IA (`ai_conversations`, `ai_messages`, `ai_usage`)

Sem alterações — ver [arquitetura.md](./arquitetura.md#ia-como-interface-do-crm).

---

## 5. Auditoria (`audit_events`)

Sem alterações — log histórico, propositalmente sem FK (não deve ser apagado em cascata).

---

## 6. Pagamentos e NFS-e (`payments`, `nfse_records`)

Sem alterações estruturais — ver [pagamentos.md](./pagamentos.md). A única adição é a coluna `payments.credits_amount_cents` (abaixo).

---

## 7. Créditos — serviços pagos de terceiros

Modelo de negócio (decisão do dono da plataforma): a **intellsn contrata e paga as APIs externas com uma única conta centralizada** (ex: aporta R$ 200 num provedor, e quando o saldo cai para R$ 100 aporta mais R$ 200). Os tenants **nunca** pagam o provedor diretamente — eles compram créditos pré-pagos na própria Foro (via Asaas), e cada consulta paga debita dessa carteira. Isso elimina o risco de um bug estourar o cartão da intellsn: o máximo debitável é sempre o que já foi efetivamente pago e creditado.

**Não existe reembolso self-service.** Em caso de erro técnico do provedor, o crédito é devolvido automaticamente (sem ação do usuário). Em qualquer outro caso, o usuário final só vê "Erro na requisição, contate o suporte" — qualquer reembolso por insatisfação é decisão manual da intellsn, feita através do painel administrativo (`PATCH /api/admin/accounts/:id/credits/adjust`).

### `credit_wallets`
Saldo atual por conta — uma linha por tenant, criada de forma "lazy" (sob demanda) na primeira operação.

| Coluna          | Tipo        | Descrição                              |
|-----------------|-------------|------------------------------------------|
| `account_id`    | VARCHAR(36) | PK, FK → `accounts.id`                   |
| `balance_cents` | BIGINT      | Saldo em centavos (nunca negativo)       |

### `credit_transactions`
Ledger imutável — toda movimentação de saldo gera uma linha aqui; nunca há um `UPDATE` de saldo sem um registro correspondente.

| Coluna                      | Tipo  | Descrição                                                        |
|------------------------------|-------|---------------------------------------------------------------------|
| `type`                       | ENUM  | `purchase` (compra confirmada via Asaas) / `consumption` (uso de serviço) / `refund` (devolução automática por falha técnica) / `adjustment` (ajuste manual do admin) |
| `amount_cents`                | BIGINT| Positivo (`purchase`, `refund`, `adjustment` podem ser +/-) ou negativo (`consumption`) |
| `balance_after_cents`         | BIGINT| Saldo resultante — permite auditar sem recalcular a soma inteira    |
| `service_key`                 | VARCHAR(50) NULL | Qual serviço gerou o débito (ex: `cpf_lookup`)             |
| `reference_type`/`reference_id`| —    | Aponta para o `payments.id` (compra) ou outra `credit_transactions.id` (refund) |
| `created_by_platform_admin`   | VARCHAR(36) NULL | Preenchido só em `adjustment` — qual admin aplicou         |

### `service_prices`
Catálogo de preços cobrados do tenant por serviço (em créditos), com o custo real pago ao provedor para referência interna.

| Coluna                | Descrição                                                      |
|------------------------|-------------------------------------------------------------------|
| `service_key`          | PK: `cnpj_lookup`, `cpf_lookup`, `process_lookup`, `process_summary_ai` |
| `price_cents`          | Quanto o tenant paga (em créditos)                                |
| `provider_cost_cents`  | Quanto a intellsn paga ao provedor (referência, não exposto ao tenant) |

### `service_usage_log`
Histórico de toda chamada (sucesso, não encontrado ou falha) — usado para suporte/auditoria, não para débito (isso já aconteceu em `credit_transactions`).

| Coluna                  | Descrição                                                |
|--------------------------|--------------------------------------------------------------|
| `status`                 | `success` / `not_found` / `failed`                           |
| `credit_transaction_id`  | NULL quando `failed` (o débito foi revertido)                |
| `request_summary`        | JSON com o documento consultado (CPF é mascarado nos logs do serviço, mas aqui fica o input original para suporte) |

**Fluxo de uma consulta paga** (`external-lookup.service.js::runPaidLookup`): debita → chama o provedor → se sucesso/não-encontrado mantém o débito e loga; se erro técnico (timeout/5xx/rede), devolve o crédito automaticamente, loga a falha e retorna ao tenant só a mensagem genérica "Erro na requisição... contate o suporte" — nunca o erro técnico real.

---

## Tabela-resumo

| Tabela                   | Tenant? | Depende de            | Propósito                                      |
|--------------------------|---------|------------------------|-------------------------------------------------|
| `platform_admins`        | não     | —                      | Login da equipe intellsn (backoffice)           |
| `plans`                  | não     | —                      | Catálogo de planos (preço/recursos)             |
| `accounts`               | —       | `plans`                | Tenant (escritório)                             |
| `users`                  | sim     | `accounts`             | Usuários do escritório                          |
| `verification_codes`     | sim     | `users`                | OTP de e-mail/celular                           |
| `password_reset_tokens`  | sim     | `users`                | Reset de senha                                  |
| `field_definitions`      | sim     | `accounts`             | Campos customizáveis do CRM                     |
| `leads`                  | sim     | `accounts`, `users`    | Leads/clientes                                  |
| `lead_field_values`      | sim     | `leads`, `field_definitions` | Valores dos campos customizados           |
| `lead_notes`             | sim     | `leads`, `users`       | Notas do lead                                   |
| `tasks`                  | sim     | `leads`, `users`       | Tarefas                                         |
| `ai_conversations`       | sim     | `users`                | Conversas com a IA                              |
| `ai_messages`            | sim     | `ai_conversations`     | Mensagens da conversa                           |
| `ai_usage`               | sim     | —                      | Custo/tokens por turno                          |
| `audit_events`           | sim     | —                      | Log de auditoria                                |
| `payments`               | sim     | `accounts`             | Pagamentos via Asaas                            |
| `nfse_records`           | sim     | `payments`             | NFS-e emitidas via NFE.io                       |
| `credit_wallets`         | sim     | `accounts`             | Saldo de créditos pré-pagos                     |
| `credit_transactions`    | sim     | `accounts`             | Ledger imutável de créditos                     |
| `service_prices`         | não     | —                      | Catálogo de preços dos serviços pagos           |
| `service_usage_log`      | sim     | `accounts`             | Histórico de chamadas pagas (p/ suporte)        |

---

## Pendências conhecidas (fora do escopo deste schema)

- **Envio real de SMS**: a verificação por `channel: 'phone'` ainda só **loga no console** o código — nenhum provedor de SMS (Twilio/Zenvia) foi integrado. O e-mail já envia de verdade via Resend (`services/email.service.js`) desde que `RESEND_API_KEY` esteja configurada.
- **Suspensão automática por inadimplência**: o webhook do Asaas atualiza `payments.status`, mas não há regra automática que suspenda `accounts.status` em caso de assinatura vencida — hoje isso seria manual via `PATCH /api/admin/accounts/:id/status`.

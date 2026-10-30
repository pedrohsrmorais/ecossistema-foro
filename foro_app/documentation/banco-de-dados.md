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
| `ai_credits_week` | INT         | Créditos de IA que renovam por semana   |
| `lookups_week`  | INT           | Consultas pagas por semana (bloqueadas nesta fase) |
| `purchasable`   | TINYINT(1)    | `0` = plano interno (`trial`), não aparece para compra |
| `features`      | JSON          | Array de strings (bullets exibidos)     |
| `active`        | TINYINT(1)    | Planos desativados saem do catálogo público |

**Seed**: `trial` (interno, R$ 0), `starter` (R$ 129,90), `pro` (R$ 199,90) e `business` (R$ 399,90) — quotas semanais em [plataforma-e-precificacao.md](./plataforma-e-precificacao.md#51-assinatura-mensal--recursos-que-renovam-por-semana).

---

## 2. Contas e usuários (multi-tenancy)

### `accounts`
Cada escritório de advocacia é uma conta isolada (`account_id` é o filtro em praticamente toda query do sistema).

| Coluna          | Tipo         | Descrição                                                |
|-----------------|--------------|------------------------------------------------------------|
| `status`        | ENUM         | `trialing` → `active` → `suspended`/`cancelled`             |
| `plan_id`       | VARCHAR(50)  | FK → `plans.id`                                             |
| `plan_started_at` | DATETIME   | Âncora das janelas semanais de créditos (início do trial ou da assinatura atual) |
| `trial_ends_at` | DATETIME     | Fim do teste gratuito de 14 dias (setado no cadastro)       |
| `stripe_customer_id` | VARCHAR(64) | `cus_...` no Stripe (criado ao abrir o 1º Checkout) |
| `stripe_subscription_id` / `subscription_status` / `current_period_end` / `cancel_at_period_end` | — | Estado da assinatura, mantido pelo webhook do Stripe |
| `asaas_id`      | VARCHAR(100) | LEGADO (Asaas removido)                                      |

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

`ai_usage` agora guarda, por turno de chat: `input_tokens`, `output_tokens`, `cache_creation_tokens`, `cache_read_tokens`, `credits` (regra em [plataforma-e-precificacao.md](./plataforma-e-precificacao.md)) e `cost_usd` (custo real, só para medir margem). O saldo da semana é `plans.ai_credits_week − SUM(ai_usage.credits)` desde o início da janela atual (sem cron). Arquitetura geral em [arquitetura.md](./arquitetura.md#ia-como-interface-do-crm).

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
| `type`                       | ENUM  | `purchase` (compra confirmada) / `consumption` (uso de serviço) / `refund` (devolução automática por falha técnica) / `adjustment` (ajuste manual do admin) |
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

## 8. Módulos — liga/desliga funcionalidade por conta

Cada funcionalidade do produto (CRM, consultas pagas, educação...) é um **módulo**. Por padrão todo módulo está ativo para toda conta; só **admins da plataforma** (nunca o tenant) podem desativar um módulo para uma conta específica — ver [plataforma-e-precificacao.md](./plataforma-e-precificacao.md) para o raciocínio de produto por trás disso.

### `modules`
Catálogo — um módulo por linha.

| Coluna          | Descrição                                                        |
|------------------|----------------------------------------------------------------------|
| `module_key`     | PK: `crm`, `pesquisa_cpf_cnpj`, `pesquisa_processual`, `educacao`, `provas_conceito`, `desafios_semanais`, `comunidade` |
| `display_order`  | Ordem de exibição na tela de toggles do admin                        |

### `account_modules`
Override por conta. **Ausência de linha = módulo ativo** (padrão) — só existe registro aqui quando um admin mudou esse padrão para aquela conta.

| Coluna                      | Descrição                                                  |
|------------------------------|----------------------------------------------------------------|
| `account_id` + `module_key`  | PK composta                                                    |
| `enabled`                    | `0` desativa o módulo só para essa conta                       |
| `updated_by_platform_admin`  | Qual admin fez a última alteração (auditoria)                  |

Checado em toda requisição pelo middleware `requireModule('crm')` (`middlewares/modules.middleware.js`), que retorna `403 { code: 'MODULE_DISABLED' }` quando desativado.

---

## 9. Educação — trilhas e aulas em vídeo

Conteúdo sobre tecnologia/automação/IA para escritórios de advocacia. **Diferente do CRM, não é isolado por conta** — é criado pela equipe intellsn (CMS no painel administrativo) e fica visível para toda conta com o módulo `educacao` ativo. O vídeo em si é hospedado fora (Vimeo privado recomendado — ver `plataforma-e-precificacao.md`); aqui só guardamos o `video_id`.

### `trilhas`
| Coluna       | Descrição                                           |
|---------------|--------------------------------------------------------|
| `published`   | Rascunhos (`0`) não aparecem para os tenants            |

### `aulas`
| Coluna            | Descrição                                                          |
|--------------------|-------------------------------------------------------------------------|
| `trilha_id`        | FK → `trilhas.id`, `ON DELETE CASCADE`                                  |
| `video_provider`   | `vimeo` / `youtube` / `url` (link direto, sem embed)                    |
| `video_id`         | ID do vídeo no provedor, ou a URL completa se `provider = url`          |

### `aula_progresso`
Progresso **por usuário individual** (não por conta — quem assiste é a pessoa).

| Coluna                   | Descrição                                               |
|---------------------------|--------------------------------------------------------------|
| `user_id` + `aula_id`     | `UNIQUE` — upsert a cada atualização de progresso             |
| `completed_at`            | `NULL` até o usuário marcar a aula como concluída             |

---

## 10. Provas de conceito — quiz vinculado a uma aula

Reforça o conteúdo de uma aula de Educação com um teste curto de múltipla escolha. Conteúdo é da plataforma (CMS do painel admin), igual Educação — no máximo **um quiz por aula**. Pontos são concedidos uma única vez por usuário, na primeira tentativa em que ele atinge `passing_score_pct`.

### `quizzes`
| Coluna               | Descrição                                                    |
|-----------------------|-------------------------------------------------------------------|
| `aula_id`             | FK → `aulas.id`, `UNIQUE` (um quiz por aula), `ON DELETE CASCADE`  |
| `passing_score_pct`   | Nota mínima pra passar (padrão 70%)                                |
| `points_awarded`      | Pontos concedidos ao passar pela primeira vez                     |

### `quiz_questions`
| Coluna               | Descrição                                                    |
|-----------------------|-------------------------------------------------------------------|
| `options`             | JSON — array de `{id, label}` (mesmo padrão de `field_definitions.options`) |
| `correct_option_id`   | Qual `id` de `options` é a resposta certa                          |

### `quiz_attempts`
Histórico de tentativas — cada submissão gera uma linha, mesmo repetida.

| Coluna               | Descrição                                                    |
|-----------------------|-------------------------------------------------------------------|
| `account_id`          | Desnormalizado — permite somar pontos por conta sem join em `users` |
| `passed` / `score_pct`| Resultado da tentativa                                             |
| `points_awarded`      | `0` se não passou, ou se já tinha passado antes (evita "farm")    |

### `quiz_passes`
"Trava" de primeira aprovação — não é histórico, é um registro só por `(quiz_id, user_id)`. O `INSERT` nessa tabela (PK composta) é o que decide atomicamente, a nível de banco, se essa tentativa é a que concede os pontos: com duas submissões concorrentes (duplo clique, duas abas, retry de rede), só uma consegue inserir — a outra recebe `ER_DUP_ENTRY` e fica com `points_awarded = 0`. Ver `quizzes.service.js::submitAttempt`.

| Coluna               | Descrição                                                    |
|-----------------------|-------------------------------------------------------------------|
| `quiz_id` + `user_id` | `PRIMARY KEY` composta — garante a unicidade                      |
| `first_attempt_id`    | FK → `quiz_attempts.id` da tentativa que concedeu os pontos       |

---

## 11. Desafios semanais — conclusão auto-declarada

Desafios publicados pela equipe intellsn, com janela de vigência (`starts_at`/`ends_at`). **Conclusão é auto-declarada**: o usuário clica "concluí" e pronto, sem verificação nem evidência anexada — decisão deliberada pra manter o MVP simples. Só pode concluir **dentro** da janela de vigência (`challenges.service.js::complete` valida `CURDATE() BETWEEN starts_at AND ends_at`).

### `weekly_challenges`
| Coluna               | Descrição                                                    |
|-----------------------|-------------------------------------------------------------------|
| `attachment_url`      | Link externo opcional (ex: PDF) — ainda não existe upload de arquivo |
| `published`           | Rascunhos (`0`) não aparecem para os tenants                       |

### `weekly_challenge_completions`
| Coluna               | Descrição                                                    |
|-----------------------|-------------------------------------------------------------------|
| `challenge_id` + `user_id` | `UNIQUE` — auto-declarado uma vez só por usuário               |
| `account_id`          | Desnormalizado, mesmo motivo de `quiz_attempts.account_id`        |

---

## 12. Comunidade — feed por conta + ranking cross-tenant

Duas coisas **deliberadamente separadas**:

1. **Feed de conquistas** (`community_posts`) — isolado por conta. Escritórios de advocacia costumam ser concorrentes entre si, então o feed **nunca** mostra posts de outra conta.
2. **Ranking de pontos** — esse **é** cross-tenant, por opção explícita do dono da plataforma. Não existe tabela própria: é agregação, calculada na hora, de `quiz_attempts.points_awarded` + `weekly_challenge_completions.points_awarded`, somados por `account_id` (ver `community.service.js::leaderboard`).

### `community_posts`
| Coluna                              | Descrição                                                    |
|---------------------------------------|-------------------------------------------------------------------|
| `account_id`                          | Feed isolado por conta — nunca cross-tenant                       |
| `kind`                                | `mensagem` (escrita livre) ou `conquista` (gerado automaticamente) |
| `related_quiz_attempt_id`             | Preenchido quando o post foi gerado ao passar numa prova de conceito |
| `related_challenge_completion_id`     | Preenchido quando o post foi gerado ao concluir um desafio          |

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
| `payments`               | sim     | `accounts`             | Faturas pagas via Stripe                            |
| `nfse_records`           | sim     | `payments`             | NFS-e emitidas via NFE.io                       |
| `credit_wallets`         | sim     | `accounts`             | Saldo de créditos pré-pagos                     |
| `credit_transactions`    | sim     | `accounts`             | Ledger imutável de créditos                     |
| `service_prices`         | não     | —                      | Catálogo de preços dos serviços pagos           |
| `service_usage_log`      | sim     | `accounts`             | Histórico de chamadas pagas (p/ suporte)        |
| `modules`                | não     | —                      | Catálogo de módulos (features) do produto       |
| `account_modules`        | sim     | `accounts`, `modules`  | Override de módulo ativo/inativo por conta      |
| `trilhas`                | não     | —                      | Trilhas do módulo Educação (conteúdo da plataforma) |
| `aulas`                  | não     | `trilhas`              | Aulas em vídeo de uma trilha                    |
| `aula_progresso`         | —       | `users`, `aulas`       | Progresso por usuário (não por conta)           |
| `quizzes`                | não     | `aulas`                | Prova de conceito de uma aula (conteúdo da plataforma) |
| `quiz_questions`         | não     | `quizzes`              | Perguntas de múltipla escolha                   |
| `quiz_attempts`          | sim     | `quizzes`, `users`     | Histórico de tentativas + pontos                |
| `quiz_passes`            | sim     | `quizzes`, `users`     | Trava de 1ª aprovação (evita pontuar em dobro)  |
| `weekly_challenges`      | não     | —                      | Desafios semanais (conteúdo da plataforma)      |
| `weekly_challenge_completions` | sim | `weekly_challenges`, `users` | Conclusão auto-declarada + pontos         |
| `community_posts`        | sim     | `accounts`, `users`    | Feed de conquistas, isolado por conta           |

---

## Pendências conhecidas (fora do escopo deste schema)

- **Envio real de SMS**: a verificação por `channel: 'phone'` ainda só **loga no console** o código — nenhum provedor de SMS (Twilio/Zenvia) foi integrado. O e-mail já envia de verdade via Resend (`services/email.service.js`) desde que `RESEND_API_KEY` esteja configurada.
- **Suspensão automática por inadimplência**: o webhook do Asaas atualiza `payments.status`, mas não há regra automática que suspenda `accounts.status` em caso de assinatura vencida — hoje isso seria manual via `PATCH /api/admin/accounts/:id/status`.


## Processos e agenda

- `cases`: número CNJ único por conta, título, tribunal, `court_url`, área, `status` (ativo/suspenso/arquivado/encerrado), fase, polo, parte contrária, valor da causa, responsável, vínculo opcional com lead, `deleted_at`.
- `case_updates`: andamentos (`update_date`, `text`, `source` = manual | ai_chat | datajud | djen).
- `events`: `type` (reuniao/audiencia/pericia/outro), `starts_at`, `ends_at`, `location`, `meeting_url`, `status` (agendado/realizado/cancelado), vínculo opcional com lead e processo.
- `tasks`: ganhou `case_id` e `is_deadline`.

## Migrações de schema

O `init.sql` só roda na primeira subida do MySQL (volume vazio). Toda mudança posterior vai em `backend/migrations/NNN_nome.js` (exporta `up(db)` com helpers idempotentes `addColumn`, `addIndex`, `tableExists`...). O runner (`backend/configs/migrate.js`) roda no boot da API, com lock do MySQL, e registra o que já foi aplicado em `schema_migrations`. Uma migração aplicada nunca é editada — crie outra. Atualizar produção = `git pull && docker compose up -d --build`.

- `001_baseline_crm_juridico`: leva bancos antigos ao schema atual (cotas semanais nos planos, `plan_started_at`, `tasks.case_id/is_deadline`, `ai_usage` com cache/créditos, `cases`, `case_updates`, `events`, catálogo de planos).
- `002_auth_hardening`: `ai_messages.created_at` com milissegundos; `password_reset_tokens.purpose` (`reset` | `invite`).


## Alertas de prazo e suporte (migração 004)

- `users.notify_deadlines_email` (padrão 1): recebe o resumo diário por e-mail.
- `notification_log (user_id, kind, ref_date)` UNIQUE: garante 1 resumo por usuário por dia (mesmo com reinício/2 instâncias).
- `support_tickets`: chamados da página Suporte (`status` aberto/respondido/fechado, `email_sent`).
- Índice `idx_tasks_deadline (account_id, completed_at, due_date)` para as consultas de prazo.

-- ════════════════════════════════════════════════════════════════════════════
-- Foro — Schema único do banco de dados
-- ════════════════════════════════════════════════════════════════════════════
--
-- Executado AUTOMATICAMENTE pelo Docker na primeira inicialização do container
-- MySQL (volume vazio). O MySQL oficial só roda arquivos de
-- /docker-entrypoint-initdb.d na PRIMEIRA vez que o volume de dados é criado.
--
-- Como isso ainda está em desenvolvimento (nada em produção), este arquivo é
-- a ÚNICA fonte de verdade do schema: qualquer alteração de estrutura deve ser
-- feita direto aqui. Para aplicar uma mudança, é necessário recriar o volume:
--
--   docker compose down -v      # remove o volume foro_db_data (apaga os dados!)
--   docker compose up -d --build
--
-- Para re-executar manualmente sem apagar o volume (ex: só pra comparar):
--   docker exec -i foro_db mysql -u root -p foro_db < init.sql
--
-- Documentação completa do schema: documentation/banco-de-dados.md
-- ════════════════════════════════════════════════════════════════════════════

SET NAMES utf8mb4;
SET time_zone = '-03:00';

-- ────────────────────────────────────────────────────────────────────────────
-- 1. PLATAFORMA (intellsn) — administração do SaaS, fora de qualquer tenant
-- ────────────────────────────────────────────────────────────────────────────

-- Administradores da plataforma (equipe da intellsn — não são usuários de um
-- escritório/tenant, eles administram TODOS os tenants).
CREATE TABLE IF NOT EXISTS platform_admins (
  id            VARCHAR(36)  NOT NULL DEFAULT (UUID()),
  name          VARCHAR(255) NOT NULL,
  email         VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  active        TINYINT(1)   NOT NULL DEFAULT 1,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_platform_admins_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Catálogo de planos (fonte única de verdade para preço/recursos — consumido
-- por settings.service.js e payments.service.js, em vez de valores fixos no código).
CREATE TABLE IF NOT EXISTS plans (
  id            VARCHAR(50)   NOT NULL COMMENT 'slug: starter, pro...',
  name          VARCHAR(100)  NOT NULL,
  price         DECIMAL(10,2) NOT NULL,
  billing_cycle ENUM('monthly') NOT NULL DEFAULT 'monthly',
  max_users     INT           NULL COMMENT 'NULL = ilimitado',
  max_leads     INT           NULL COMMENT 'NULL = ilimitado',
  ai_credits_week INT         NOT NULL DEFAULT 0 COMMENT 'créditos de IA que renovam toda semana (janela de 7 dias ancorada em accounts.plan_started_at)',
  lookups_week    INT         NOT NULL DEFAULT 0 COMMENT 'consultas pagas (CPF/CNPJ/processual) por semana — recurso bloqueado nesta fase (FEATURE_LOOKUPS_ENABLED)',
  purchasable   TINYINT(1)    NOT NULL DEFAULT 1 COMMENT '0 = plano interno (ex: trial), não aparece para compra',
  features      JSON          NULL COMMENT 'array de strings exibidas na UI',
  active        TINYINT(1)    NOT NULL DEFAULT 1,
  display_order INT           NOT NULL DEFAULT 0,
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. CONTAS E USUÁRIOS (multi-tenant)
-- ────────────────────────────────────────────────────────────────────────────

-- Contas (tenants) — cada escritório de advocacia é uma conta isolada.
CREATE TABLE IF NOT EXISTS accounts (
  id             VARCHAR(36)  NOT NULL DEFAULT (UUID()),
  name           VARCHAR(255) NOT NULL,
  slug           VARCHAR(100) NOT NULL,
  status         ENUM('trialing','active','suspended','cancelled') NOT NULL DEFAULT 'trialing',
  plan_id        VARCHAR(50)  NOT NULL DEFAULT 'trial',
  plan_started_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'âncora das janelas semanais de créditos: início do trial ou da assinatura do plano atual',
  trial_ends_at  DATETIME     NULL COMMENT 'fim do período de teste gratuito',
  asaas_id       VARCHAR(100) NULL COMMENT 'Customer ID no Asaas',
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_accounts_slug (slug),
  KEY idx_accounts_plan (plan_id),
  CONSTRAINT fk_accounts_plan FOREIGN KEY (plan_id) REFERENCES plans(id) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Usuários de cada conta (advogados/assistentes do escritório).
CREATE TABLE IF NOT EXISTS users (
  id                 VARCHAR(36)  NOT NULL DEFAULT (UUID()),
  account_id         VARCHAR(36)  NOT NULL,
  name               VARCHAR(255) NOT NULL,
  email              VARCHAR(255) NOT NULL,
  phone              VARCHAR(20)  NULL COMMENT 'E.164 ou nacional, ex: +5551999999999',
  password_hash      VARCHAR(255) NOT NULL,
  role               ENUM('admin','user') NOT NULL DEFAULT 'user',
  active             TINYINT(1)   NOT NULL DEFAULT 1,
  email_verified_at  DATETIME     NULL,
  phone_verified_at  DATETIME     NULL,
  created_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_users_email (email),
  UNIQUE KEY uk_users_phone (phone),
  KEY idx_users_account (account_id),
  CONSTRAINT fk_users_account FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Códigos de verificação (OTP) de e-mail e celular.
-- Gerados em auth.service.js::sendVerificationCode, validados em ::verifyCode.
CREATE TABLE IF NOT EXISTS verification_codes (
  id          VARCHAR(36) NOT NULL DEFAULT (UUID()),
  user_id     VARCHAR(36) NOT NULL,
  channel     ENUM('email','phone') NOT NULL,
  code        VARCHAR(10) NOT NULL COMMENT 'código numérico (ex: 6 dígitos)',
  attempts    INT         NOT NULL DEFAULT 0,
  expires_at  DATETIME    NOT NULL,
  consumed_at DATETIME    NULL,
  created_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_verif_user_channel (user_id, channel),
  CONSTRAINT fk_verif_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tokens de redefinição de senha (fluxo "esqueci minha senha").
-- Apenas o HASH do token é armazenado; o token em texto puro vai só no e-mail.
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id          VARCHAR(36)  NOT NULL DEFAULT (UUID()),
  user_id     VARCHAR(36)  NOT NULL,
  token_hash  VARCHAR(255) NOT NULL COMMENT 'SHA-256 do token enviado por e-mail',
  expires_at  DATETIME     NOT NULL,
  used_at     DATETIME     NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_reset_token (token_hash),
  KEY idx_reset_user (user_id),
  CONSTRAINT fk_reset_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. CRM — Campos customizáveis e leads
-- ────────────────────────────────────────────────────────────────────────────

-- Definições de campo customizáveis por conta (EAV — permite cada escritório
-- configurar os campos do seu funil sem alterar o schema).
CREATE TABLE IF NOT EXISTS field_definitions (
  id                VARCHAR(36)  NOT NULL DEFAULT (UUID()),
  account_id        VARCHAR(36)  NOT NULL,
  name              VARCHAR(100) NOT NULL COMMENT 'nome interno (snake_case)',
  label             VARCHAR(255) NOT NULL COMMENT 'rótulo exibido na UI',
  field_type        ENUM('text','textarea','select','multiselect','number','date','boolean','phone','email') NOT NULL,
  options           JSON         NULL     COMMENT 'array de strings para select/multiselect',
  required          TINYINT(1)   NOT NULL DEFAULT 0,
  collect_via_ai    TINYINT(1)   NOT NULL DEFAULT 1,
  ai_question_hint  VARCHAR(500) NULL     COMMENT 'sugestão de pergunta para a IA',
  display_order     INT          NOT NULL DEFAULT 0,
  active            TINYINT(1)   NOT NULL DEFAULT 1,
  is_system         TINYINT(1)   NOT NULL DEFAULT 0 COMMENT 'campos do sistema não podem ser removidos',
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_field_def (account_id, name),
  KEY idx_field_account (account_id),
  CONSTRAINT fk_field_account FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Leads (clientes/potenciais clientes do escritório).
CREATE TABLE IF NOT EXISTS leads (
  id               VARCHAR(36)  NOT NULL DEFAULT (UUID()),
  account_id       VARCHAR(36)  NOT NULL,
  name             VARCHAR(255) NULL,
  phone            VARCHAR(30)  NULL,
  email            VARCHAR(255) NULL,
  stage            VARCHAR(100) NOT NULL DEFAULT 'novo',
  source           VARCHAR(100) NULL     COMMENT 'ui | ai_chat | whatsapp | api',
  assigned_user_id VARCHAR(36)  NULL,
  last_contact_at  DATETIME     NULL,
  archived_at      DATETIME     NULL,
  deleted_at       DATETIME     NULL,
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_leads_account (account_id),
  KEY idx_leads_stage (account_id, stage),
  KEY idx_leads_deleted (deleted_at),
  CONSTRAINT fk_leads_account  FOREIGN KEY (account_id)       REFERENCES accounts(id) ON DELETE CASCADE,
  CONSTRAINT fk_leads_assigned FOREIGN KEY (assigned_user_id) REFERENCES users(id)    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Valores dos campos customizados por lead (uma linha por campo por lead).
CREATE TABLE IF NOT EXISTS lead_field_values (
  id                   VARCHAR(36)   NOT NULL DEFAULT (UUID()),
  account_id           VARCHAR(36)   NOT NULL,
  lead_id              VARCHAR(36)   NOT NULL,
  field_definition_id  VARCHAR(36)   NOT NULL,
  value_text           TEXT          NULL,
  value_number         DECIMAL(15,4) NULL,
  value_date           DATE          NULL,
  value_boolean        TINYINT(1)    NULL,
  value_json           JSON          NULL,
  updated_at           DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_lfv (lead_id, field_definition_id),
  KEY idx_lfv_account (account_id),
  CONSTRAINT fk_lfv_lead  FOREIGN KEY (lead_id)             REFERENCES leads(id)            ON DELETE CASCADE,
  CONSTRAINT fk_lfv_field FOREIGN KEY (field_definition_id) REFERENCES field_definitions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Notas/observações registradas sobre um lead.
CREATE TABLE IF NOT EXISTS lead_notes (
  id         VARCHAR(36)  NOT NULL DEFAULT (UUID()),
  account_id VARCHAR(36)  NOT NULL,
  lead_id    VARCHAR(36)  NOT NULL,
  user_id    VARCHAR(36)  NOT NULL,
  text       TEXT         NOT NULL,
  channel    ENUM('ui','ai_chat','whatsapp_automation','api') NOT NULL DEFAULT 'ui',
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_notes_lead    (lead_id),
  KEY idx_notes_account (account_id),
  CONSTRAINT fk_notes_lead FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
  CONSTRAINT fk_notes_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tarefas vinculadas (ou não) a um lead.
CREATE TABLE IF NOT EXISTS tasks (
  id           VARCHAR(36)  NOT NULL DEFAULT (UUID()),
  account_id   VARCHAR(36)  NOT NULL,
  lead_id      VARCHAR(36)  NULL,
  user_id      VARCHAR(36)  NOT NULL,
  description  TEXT         NOT NULL,
  due_date     DATETIME     NULL,
  completed_at DATETIME     NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_tasks_account (account_id),
  KEY idx_tasks_user    (user_id),
  KEY idx_tasks_lead    (lead_id),
  CONSTRAINT fk_tasks_lead FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL,
  CONSTRAINT fk_tasks_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ────────────────────────────────────────────────────────────────────────────
-- 4. IA — Chat interno (tool use / function calling)
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ai_conversations (
  id          VARCHAR(36) NOT NULL DEFAULT (UUID()),
  account_id  VARCHAR(36) NOT NULL,
  user_id     VARCHAR(36) NOT NULL,
  started_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at    DATETIME    NULL,
  PRIMARY KEY (id),
  KEY idx_conv_user (user_id),
  CONSTRAINT fk_conv_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ai_messages (
  id              VARCHAR(36)  NOT NULL DEFAULT (UUID()),
  conversation_id VARCHAR(36)  NOT NULL,
  account_id      VARCHAR(36)  NOT NULL,
  role            ENUM('user','assistant','tool') NOT NULL,
  content         LONGTEXT     NOT NULL,
  tool_calls      JSON         NULL,
  tool_call_id    VARCHAR(100) NULL,
  input_tokens    INT          NULL,
  output_tokens   INT          NULL,
  model           VARCHAR(100) NULL,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_msg_conv (conversation_id),
  CONSTRAINT fk_msg_conv FOREIGN KEY (conversation_id) REFERENCES ai_conversations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Uso de IA por turno (para cobrança/relatório de custo — ver GET /api/ai/usage).
CREATE TABLE IF NOT EXISTS ai_usage (
  id              VARCHAR(36)    NOT NULL DEFAULT (UUID()),
  account_id      VARCHAR(36)    NOT NULL,
  user_id         VARCHAR(36)    NOT NULL,
  conversation_id VARCHAR(36)    NULL,
  model           VARCHAR(100)   NOT NULL,
  input_tokens    INT            NOT NULL DEFAULT 0,
  output_tokens   INT            NOT NULL DEFAULT 0,
  cache_creation_tokens INT      NOT NULL DEFAULT 0 COMMENT 'cache_creation_input_tokens — contam como entrada para créditos',
  cache_read_tokens     INT      NOT NULL DEFAULT 0 COMMENT 'cache_read_input_tokens — contam como entrada para créditos',
  credits         DECIMAL(10,3)  NOT NULL DEFAULT 0 COMMENT 'créditos de IA debitados: (entrada total + 5 x saída) / 2500 — ver ai-credits.service.js',
  cost_usd        DECIMAL(10,6)  NOT NULL DEFAULT 0 COMMENT 'custo real em USD (com tarifas de cache) — só para margem, nunca cobrado do tenant',
  created_at      DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_usage_account (account_id),
  KEY idx_usage_date    (account_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ────────────────────────────────────────────────────────────────────────────
-- 5. AUDITORIA
-- ────────────────────────────────────────────────────────────────────────────

-- Log de toda ação significativa, com o canal de origem (ui, ai_chat, api...).
-- Sem FKs (log histórico — não deve ser apagado em cascata com a entidade).
CREATE TABLE IF NOT EXISTS audit_events (
  id          VARCHAR(36)  NOT NULL DEFAULT (UUID()),
  account_id  VARCHAR(36)  NOT NULL,
  user_id     VARCHAR(36)  NULL,
  entity_type VARCHAR(50)  NOT NULL,
  entity_id   VARCHAR(36)  NOT NULL,
  action      VARCHAR(50)  NOT NULL,
  channel     ENUM('ui','ai_chat','whatsapp_automation','api','system') NOT NULL DEFAULT 'ui',
  old_values  JSON         NULL,
  new_values  JSON         NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_audit_entity  (entity_type, entity_id),
  KEY idx_audit_account (account_id),
  KEY idx_audit_date    (account_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ────────────────────────────────────────────────────────────────────────────
-- 6. PAGAMENTOS (Asaas) E NFS-e (NFE.io)
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS payments (
  id              VARCHAR(36)   NOT NULL DEFAULT (UUID()),
  account_id      VARCHAR(36)   NOT NULL,
  asaas_id        VARCHAR(100)  NOT NULL COMMENT 'ID do pagamento no Asaas',
  asaas_charge_id VARCHAR(100)  NULL,
  type            ENUM('pix','credit_card','subscription') NOT NULL,
  status          VARCHAR(50)   NOT NULL DEFAULT 'PENDING',
  amount          DECIMAL(10,2) NOT NULL,
  description     TEXT          NULL,
  pix_qr_code     TEXT          NULL,
  pix_copy_paste  TEXT          NULL,
  credits_amount_cents INT      NULL COMMENT 'preenchido quando este pagamento é uma compra de créditos (não assinatura) — ver credit_transactions',
  paid_at         DATETIME      NULL,
  created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_payments_asaas (asaas_id),
  KEY idx_payments_account (account_id),
  CONSTRAINT fk_payments_account FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS nfse_records (
  id           VARCHAR(36)  NOT NULL DEFAULT (UUID()),
  account_id   VARCHAR(36)  NOT NULL,
  payment_id   VARCHAR(36)  NOT NULL,
  nfeio_id     VARCHAR(100) NULL COMMENT 'ID da nota no NFE.io',
  status       VARCHAR(50)  NOT NULL DEFAULT 'pending',
  number       VARCHAR(50)  NULL,
  series       VARCHAR(10)  NULL,
  pdf_url      VARCHAR(500) NULL,
  xml_url      VARCHAR(500) NULL,
  error_msg    TEXT         NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_nfse_payment (payment_id),
  KEY idx_nfse_account (account_id),
  CONSTRAINT fk_nfse_payment FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ────────────────────────────────────────────────────────────────────────────
-- 7. CRÉDITOS — serviços pagos de terceiros (CPF, CNPJ, consulta processual...)
-- ────────────────────────────────────────────────────────────────────────────
--
-- Modelo de negócio: a intellsn contrata e paga as APIs externas com UMA conta
-- centralizada (não é o tenant quem assina a API de terceiro). O tenant compra
-- créditos pré-pagos na própria plataforma Foro (via Asaas — ver payments
-- acima), e cada uso de um serviço pago (consulta de CPF/CNPJ, consulta
-- processual, resumo de processo por IA) debita dessa carteira.
--
-- Isso é o que impede o "estouro de cartão" discutido com o usuário: o valor
-- debitado é sempre LIMITADO ao saldo que o próprio tenant pré-pagou — nunca
-- se chama a API externa sem crédito suficiente já debitado antes.
--
-- Importante: não existe endpoint de "solicitar reembolso" para o tenant.
-- Em caso de erro na chamada externa, o crédito é automaticamente devolvido
-- (ver credits.service.js::refund, chamado internamente pelo
-- external-lookup.service.js) e o usuário só vê uma mensagem genérica de
-- erro pedindo para contatar o suporte. Qualquer reembolso por insatisfação
-- com o resultado (não por falha técnica) é decisão manual da intellsn,
-- feita via PATCH /api/admin/accounts/:id/credits/adjust — nunca pelo tenant.

-- Carteira de créditos — um saldo por conta (1:1 com accounts).
CREATE TABLE IF NOT EXISTS credit_wallets (
  account_id      VARCHAR(36) NOT NULL,
  balance_cents   BIGINT      NOT NULL DEFAULT 0 COMMENT 'saldo em centavos de R$',
  updated_at      DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (account_id),
  CONSTRAINT fk_wallet_account FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Extrato (ledger) — toda movimentação de crédito é um registro aqui, nunca
-- só um UPDATE de saldo. Permite auditoria completa e reconciliação com o
-- que foi efetivamente gasto nos provedores externos.
CREATE TABLE IF NOT EXISTS credit_transactions (
  id                        VARCHAR(36)  NOT NULL DEFAULT (UUID()),
  account_id                VARCHAR(36)  NOT NULL,
  type                      ENUM('purchase','consumption','refund','adjustment') NOT NULL,
  amount_cents              BIGINT       NOT NULL COMMENT 'positivo = crédito, negativo = débito',
  balance_after_cents       BIGINT       NOT NULL COMMENT 'saldo resultante, para auditoria sem precisar somar tudo',
  service_key               VARCHAR(50)  NULL COMMENT 'preenchido só em consumption/refund — ver service_prices.service_key',
  reference_type            ENUM('payment','service_usage','platform_admin') NULL,
  reference_id              VARCHAR(36)  NULL COMMENT 'payments.id, service_usage_log.id ou platform_admins.id',
  note                      VARCHAR(500) NULL COMMENT 'motivo, obrigatório em adjustment',
  created_by_platform_admin VARCHAR(36)  NULL COMMENT 'preenchido só quando type=adjustment (ajuste manual via painel)',
  created_at                DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_credit_tx_account (account_id, created_at),
  KEY idx_credit_tx_service (service_key),
  CONSTRAINT fk_credit_tx_account FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Catálogo de serviços pagos e seus preços — fonte única de verdade (mesmo
-- padrão da tabela `plans`). Ajustar aqui muda o preço sem tocar em código.
CREATE TABLE IF NOT EXISTS service_prices (
  service_key        VARCHAR(50)  NOT NULL COMMENT 'cpf_lookup, cnpj_lookup, process_lookup, process_summary_ai',
  name                VARCHAR(100) NOT NULL,
  price_cents         INT          NOT NULL COMMENT 'quanto é debitado do tenant por uso',
  provider_cost_cents INT          NULL COMMENT 'quanto custa (aprox.) na API de terceiro — referência para calcular margem, não é cobrado diretamente',
  provider            VARCHAR(100) NULL COMMENT 'nome do provedor configurado (TrackJud, Dabra, etc.)',
  active              TINYINT(1)   NOT NULL DEFAULT 1,
  description         VARCHAR(255) NULL,
  created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (service_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Log de cada chamada a um serviço pago — para suporte, auditoria e
-- reconciliação (créditos vendidos vs. efetivamente gastos no provedor).
CREATE TABLE IF NOT EXISTS service_usage_log (
  id                   VARCHAR(36)  NOT NULL DEFAULT (UUID()),
  account_id           VARCHAR(36)  NOT NULL,
  user_id              VARCHAR(36)  NULL,
  service_key          VARCHAR(50)  NOT NULL,
  status               ENUM('success','not_found','failed') NOT NULL,
  credit_transaction_id VARCHAR(36) NULL COMMENT 'débito associado (NULL se falhou antes de debitar)',
  request_summary      JSON         NULL COMMENT 'parâmetros da consulta, sem dados sensíveis desnecessários',
  error_message        TEXT         NULL,
  created_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_usage_log_account (account_id, created_at),
  KEY idx_usage_log_service (service_key, created_at),
  CONSTRAINT fk_usage_log_account FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ────────────────────────────────────────────────────────────────────────────
-- 8. MÓDULOS — habilita/desabilita funcionalidades por conta (admin da plataforma)
-- ────────────────────────────────────────────────────────────────────────────
--
-- Cada funcionalidade do produto (CRM, consultas pagas, educação...) é um
-- "módulo". Por padrão todo módulo está ativo para toda conta — só existe uma
-- linha em account_modules quando um admin da plataforma desativou (ou
-- reativou) explicitamente um módulo para aquela conta específica (ver
-- modules.service.js::isEnabled, que trata "sem linha" como enabled=1).
-- Decisão do dono da plataforma: só a equipe da intellsn liga/desliga um
-- módulo — nunca o próprio tenant. Isso também abre caminho para vender
-- "pacotes" diferentes (ex: só educação, ou CRM sem pesquisa) sem duplicar código.

CREATE TABLE IF NOT EXISTS modules (
  module_key    VARCHAR(50)  NOT NULL COMMENT 'crm, pesquisa_cpf_cnpj, pesquisa_processual, educacao...',
  name          VARCHAR(100) NOT NULL,
  description   VARCHAR(255) NULL,
  display_order INT          NOT NULL DEFAULT 0,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (module_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Override por conta — "sem linha" para um module_key = módulo ativo (padrão).
-- Uma linha aqui só existe quando um admin da plataforma mudou o padrão.
CREATE TABLE IF NOT EXISTS account_modules (
  account_id                VARCHAR(36) NOT NULL,
  module_key                VARCHAR(50) NOT NULL,
  enabled                   TINYINT(1)  NOT NULL DEFAULT 1,
  updated_by_platform_admin VARCHAR(36) NULL COMMENT 'qual admin da plataforma fez a última alteração',
  updated_at                DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (account_id, module_key),
  CONSTRAINT fk_account_modules_account FOREIGN KEY (account_id) REFERENCES accounts(id)       ON DELETE CASCADE,
  CONSTRAINT fk_account_modules_module  FOREIGN KEY (module_key) REFERENCES modules(module_key) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ────────────────────────────────────────────────────────────────────────────
-- 9. EDUCAÇÃO — trilhas e aulas em vídeo (conteúdo da plataforma, não por tenant)
-- ────────────────────────────────────────────────────────────────────────────
--
-- Conteúdo educativo sobre tecnologia/automação/IA para escritórios de
-- advocacia. Diferente do CRM, o conteúdo NÃO é isolado por conta — é criado
-- pela equipe da intellsn (painel administrativo) e fica visível para toda
-- conta que tiver o módulo "educacao" ativo (ver seção 8).
--
-- Vídeo hospedado no Vimeo (privado, restrito por domínio) — aqui guardamos
-- só o ID do vídeo, nunca o arquivo. `video_provider` existe para não travar
-- em um único provedor caso isso mude no futuro (youtube/url genérica).

CREATE TABLE IF NOT EXISTS trilhas (
  id              VARCHAR(36)  NOT NULL DEFAULT (UUID()),
  title           VARCHAR(150) NOT NULL,
  description     TEXT         NULL,
  cover_image_url VARCHAR(500) NULL,
  display_order   INT          NOT NULL DEFAULT 0,
  published       TINYINT(1)   NOT NULL DEFAULT 0 COMMENT 'rascunhos (0) não aparecem para os tenants',
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS aulas (
  id               VARCHAR(36)  NOT NULL DEFAULT (UUID()),
  trilha_id        VARCHAR(36)  NOT NULL,
  title            VARCHAR(150) NOT NULL,
  description      TEXT         NULL,
  video_provider   ENUM('vimeo','youtube','url') NOT NULL DEFAULT 'vimeo',
  video_id         VARCHAR(255) NOT NULL COMMENT 'ID do vídeo no provedor, ou URL completa se provider=url',
  duration_seconds INT          NULL,
  display_order    INT          NOT NULL DEFAULT 0,
  published        TINYINT(1)   NOT NULL DEFAULT 0,
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_aulas_trilha (trilha_id, display_order),
  CONSTRAINT fk_aulas_trilha FOREIGN KEY (trilha_id) REFERENCES trilhas(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Progresso por usuário (não por conta — quem assiste é a pessoa, não o escritório).
CREATE TABLE IF NOT EXISTS aula_progresso (
  id                    VARCHAR(36) NOT NULL DEFAULT (UUID()),
  user_id               VARCHAR(36) NOT NULL,
  aula_id               VARCHAR(36) NOT NULL,
  last_position_seconds INT         NOT NULL DEFAULT 0,
  completed_at          DATETIME    NULL,
  updated_at            DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_progresso_user_aula (user_id, aula_id),
  CONSTRAINT fk_progresso_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_progresso_aula FOREIGN KEY (aula_id) REFERENCES aulas(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ────────────────────────────────────────────────────────────────────────────
-- 10. PROVAS DE CONCEITO — quiz curto vinculado a uma aula (módulo "provas_conceito")
-- ────────────────────────────────────────────────────────────────────────────
--
-- Reforça o conteúdo de uma aula de Educação com um teste rápido de múltipla
-- escolha. Criado pela equipe intellsn (CMS do painel admin) — no máximo um
-- quiz por aula. Pontos são concedidos na primeira vez que o usuário atinge
-- `passing_score_pct` (ver quizzes.service.js::submitAttempt) — tentativas
-- seguintes ficam no histórico mas não pontuam de novo.

CREATE TABLE IF NOT EXISTS quizzes (
  id                 VARCHAR(36)  NOT NULL DEFAULT (UUID()),
  aula_id            VARCHAR(36)  NOT NULL,
  title              VARCHAR(150) NOT NULL,
  passing_score_pct  TINYINT UNSIGNED NOT NULL DEFAULT 70,
  points_awarded     INT UNSIGNED NOT NULL DEFAULT 10 COMMENT 'pontos concedidos ao passar, uma vez por usuário',
  created_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_quizzes_aula (aula_id),
  CONSTRAINT fk_quizzes_aula FOREIGN KEY (aula_id) REFERENCES aulas(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS quiz_questions (
  id                 VARCHAR(36)  NOT NULL DEFAULT (UUID()),
  quiz_id            VARCHAR(36)  NOT NULL,
  prompt             TEXT         NOT NULL,
  options            JSON         NOT NULL COMMENT 'array de {id, label} — mesmo padrão de field_definitions.options',
  correct_option_id  VARCHAR(10)  NOT NULL,
  display_order      INT UNSIGNED NOT NULL DEFAULT 0,
  created_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_quiz_questions_quiz (quiz_id, display_order),
  CONSTRAINT fk_quiz_questions_quiz FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS quiz_attempts (
  id              VARCHAR(36)  NOT NULL DEFAULT (UUID()),
  quiz_id         VARCHAR(36)  NOT NULL,
  user_id         VARCHAR(36)  NOT NULL,
  account_id      VARCHAR(36)  NOT NULL COMMENT 'desnormalizado — soma pontos por conta sem join em users',
  score_pct       TINYINT UNSIGNED NOT NULL,
  passed          TINYINT(1)   NOT NULL,
  points_awarded  INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '0 se não passou, ou se já tinha passado antes',
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_quiz_attempts_user (user_id, created_at),
  KEY idx_quiz_attempts_account (account_id),
  CONSTRAINT fk_quiz_attempts_quiz    FOREIGN KEY (quiz_id)    REFERENCES quizzes(id)  ON DELETE CASCADE,
  CONSTRAINT fk_quiz_attempts_user    FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE CASCADE,
  CONSTRAINT fk_quiz_attempts_account FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- "Trava" de primeira aprovação: PK composta (quiz_id, user_id) garante, a
-- nível de banco, que só uma tentativa concorrente consegue inserir aqui —
-- a outra recebe ER_DUP_ENTRY e não pontua. Sem isso, um duplo clique ou duas
-- abas abertas conseguiam conceder os pontos duas vezes (quiz_attempts sozinha
-- não tem nenhuma trava de unicidade, já que várias tentativas são esperadas).
CREATE TABLE IF NOT EXISTS quiz_passes (
  quiz_id           VARCHAR(36)  NOT NULL,
  user_id           VARCHAR(36)  NOT NULL,
  account_id        VARCHAR(36)  NOT NULL,
  first_attempt_id  VARCHAR(36)  NOT NULL COMMENT 'quiz_attempts.id da tentativa que concedeu os pontos',
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (quiz_id, user_id),
  KEY idx_quiz_passes_account (account_id),
  CONSTRAINT fk_quiz_passes_quiz    FOREIGN KEY (quiz_id)    REFERENCES quizzes(id)  ON DELETE CASCADE,
  CONSTRAINT fk_quiz_passes_user    FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE CASCADE,
  CONSTRAINT fk_quiz_passes_account FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ────────────────────────────────────────────────────────────────────────────
-- 11. DESAFIOS SEMANAIS — conteúdo da plataforma, conclusão auto-declarada (módulo "desafios_semanais")
-- ────────────────────────────────────────────────────────────────────────────
--
-- Desafios publicados pela equipe intellsn, com janela de vigência. Conclusão
-- é auto-declarada pelo usuário (clica "concluí", sem verificação/evidência)
-- — decisão deliberada para manter simples no MVP.

CREATE TABLE IF NOT EXISTS weekly_challenges (
  id              VARCHAR(36)  NOT NULL DEFAULT (UUID()),
  title           VARCHAR(150) NOT NULL,
  description     TEXT         NOT NULL,
  attachment_url  VARCHAR(500) NULL COMMENT 'link externo opcional (ex: PDF) — não há upload de arquivo ainda',
  points_awarded  INT UNSIGNED NOT NULL DEFAULT 10,
  starts_at       DATE         NOT NULL,
  ends_at         DATE         NOT NULL,
  published       TINYINT(1)   NOT NULL DEFAULT 0,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_weekly_challenges_window (published, starts_at, ends_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS weekly_challenge_completions (
  id              VARCHAR(36)  NOT NULL DEFAULT (UUID()),
  challenge_id    VARCHAR(36)  NOT NULL,
  user_id         VARCHAR(36)  NOT NULL,
  account_id      VARCHAR(36)  NOT NULL COMMENT 'desnormalizado — mesmo motivo de quiz_attempts.account_id',
  points_awarded  INT UNSIGNED NOT NULL,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_challenge_completion_user (challenge_id, user_id),
  KEY idx_challenge_completions_account (account_id),
  CONSTRAINT fk_challenge_completions_challenge FOREIGN KEY (challenge_id) REFERENCES weekly_challenges(id) ON DELETE CASCADE,
  CONSTRAINT fk_challenge_completions_user      FOREIGN KEY (user_id)      REFERENCES users(id)             ON DELETE CASCADE,
  CONSTRAINT fk_challenge_completions_account   FOREIGN KEY (account_id)   REFERENCES accounts(id)          ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ────────────────────────────────────────────────────────────────────────────
-- 12. COMUNIDADE — feed de conquistas isolado por conta (módulo "comunidade")
-- ────────────────────────────────────────────────────────────────────────────
--
-- Feed social, mas DELIBERADAMENTE restrito à própria conta: escritórios de
-- advocacia costumam ser concorrentes entre si, então o feed de posts NUNCA é
-- cross-tenant (diferente do ranking de pontos, que é cross-tenant por opção
-- explícita do dono da plataforma — calculado por agregação sobre
-- quiz_attempts/weekly_challenge_completions, sem tabela própria).

CREATE TABLE IF NOT EXISTS community_posts (
  id                              VARCHAR(36) NOT NULL DEFAULT (UUID()),
  account_id                      VARCHAR(36) NOT NULL COMMENT 'feed isolado por conta — nunca cross-tenant',
  user_id                         VARCHAR(36) NOT NULL,
  content                         TEXT        NOT NULL,
  kind                            ENUM('conquista','mensagem') NOT NULL DEFAULT 'mensagem',
  related_quiz_attempt_id         VARCHAR(36) NULL COMMENT 'preenchido quando o post foi gerado automaticamente ao passar numa prova de conceito',
  related_challenge_completion_id VARCHAR(36) NULL COMMENT 'preenchido quando o post foi gerado automaticamente ao concluir um desafio',
  created_at                      DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_community_posts_account (account_id, created_at),
  CONSTRAINT fk_community_posts_account   FOREIGN KEY (account_id) REFERENCES accounts(id)                     ON DELETE CASCADE,
  CONSTRAINT fk_community_posts_user      FOREIGN KEY (user_id)    REFERENCES users(id)                        ON DELETE CASCADE,
  CONSTRAINT fk_community_posts_quiz      FOREIGN KEY (related_quiz_attempt_id)         REFERENCES quiz_attempts(id)                ON DELETE SET NULL,
  CONSTRAINT fk_community_posts_challenge FOREIGN KEY (related_challenge_completion_id) REFERENCES weekly_challenge_completions(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ════════════════════════════════════════════════════════════════════════════
-- SEEDS — dados iniciais
-- ════════════════════════════════════════════════════════════════════════════

-- ─── Planos disponíveis (fonte única de verdade para preço/recursos) ─────────
INSERT INTO plans (id, name, price, max_users, max_leads, ai_credits_week, lookups_week, purchasable, features, display_order) VALUES
  ('trial',    'Teste grátis', 0.00,   1,  100,  50,   5,  0, JSON_ARRAY('14 dias grátis', '50 créditos de IA por semana', 'Até 100 leads'), 0),
  ('starter',  'Starter',      129.90, 1,  500,  150,  10, 1, JSON_ARRAY('CRM com IA', '150 créditos de IA por semana', 'Até 500 leads', '1 usuário'), 1),
  ('pro',      'Pro',          199.90, 5,  NULL, 300,  15, 1, JSON_ARRAY('CRM com IA', '300 créditos de IA por semana', 'Leads ilimitados', '5 usuários'), 2),
  ('business', 'Business',     399.90, 15, NULL, 700,  20, 1, JSON_ARRAY('CRM com IA', '700 créditos de IA por semana', 'Leads ilimitados', '15 usuários'), 3)
ON DUPLICATE KEY UPDATE
  name = VALUES(name), price = VALUES(price), max_users = VALUES(max_users),
  max_leads = VALUES(max_leads), ai_credits_week = VALUES(ai_credits_week),
  lookups_week = VALUES(lookups_week), purchasable = VALUES(purchasable),
  features = VALUES(features), display_order = VALUES(display_order);

-- ─── Administrador da plataforma (equipe intellsn — gestão de todos os tenants) ─
-- Login: POST /api/auth/platform-login  { "email": "admin@intellsn.com.br", "password": "..." }
-- A senha abaixo já está em hash bcrypt (não é armazenada em texto puro em nenhum lugar).
INSERT INTO platform_admins (id, name, email, password_hash) VALUES
  (UUID(), 'Administrador Foro', 'admin@intellsn.com.br',
   '$2a$12$1ZllKUjAWNYVThWRPP2dteA3GwjvDJlN2xOWkstK7LEDgpQEF20dG')
ON DUPLICATE KEY UPDATE name = VALUES(name);

-- ─── Preços dos serviços pagos (créditos) ─────────────────────────────────────
-- Valores iniciais sugeridos com margem sobre o custo estimado do provedor.
-- Ajuste price_cents livremente — é lido em tempo real por credits.service.js,
-- sem precisar de deploy.
INSERT INTO service_prices (service_key, name, price_cents, provider_cost_cents, provider, description) VALUES
  ('cnpj_lookup',        'Consulta de CNPJ',               50,   0, 'CNPJ_PROVIDER configurável',  'Dados cadastrais de empresa via CNPJ'),
  ('cpf_lookup',         'Consulta de CPF',                100,  24, 'CPF_PROVIDER configurável',  'Situação cadastral de pessoa física via CPF'),
  ('process_lookup',     'Consulta processual',            100,  10, 'PROCESS_PROVIDER configurável', 'Busca de processos por CPF/CNPJ/OAB'),
  ('process_summary_ai', 'Resumo de processo por IA',       150, NULL, 'Anthropic Claude', 'Resumo em linguagem simples das movimentações do processo')
ON DUPLICATE KEY UPDATE
  name = VALUES(name), price_cents = VALUES(price_cents), provider_cost_cents = VALUES(provider_cost_cents),
  provider = VALUES(provider), description = VALUES(description);

-- ─── Catálogo de módulos (liga/desliga por conta, só pelo admin da plataforma) ─
INSERT INTO modules (module_key, name, description, display_order) VALUES
  ('crm',                  'CRM com IA',          'Gestão de leads, funil, notas, tarefas e chat com IA', 1),
  ('pesquisa_cpf_cnpj',    'Consulta de CPF/CNPJ','Consulta de dados cadastrais, paga em créditos',       2),
  ('pesquisa_processual',  'Consulta processual', 'Busca de processos por CPF/CNPJ e resumo por IA',      3),
  ('educacao',             'Educação',            'Trilhas e aulas em vídeo sobre tecnologia para escritórios', 4),
  ('provas_conceito',      'Provas de conceito',  'Quiz curto vinculado a uma aula de Educação, com pontuação', 5),
  ('desafios_semanais',    'Desafios semanais',   'Desafios publicados pela equipe intellsn, com pontuação',    6),
  ('comunidade',           'Comunidade',          'Feed de conquistas por escritório + ranking de pontos entre escritórios', 7)
ON DUPLICATE KEY UPDATE
  name = VALUES(name), description = VALUES(description), display_order = VALUES(display_order);

-- Observação: os campos de sistema (area_juridica, preferencia_contato,
-- descricao_caso, honorarios) NÃO são semeados aqui — são criados
-- dinamicamente por conta (tenant) no momento do cadastro, em
-- auth.service.js::_seedDefaultFields(), pois cada conta tem suas próprias
-- field_definitions isoladas.

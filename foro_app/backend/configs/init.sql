-- ─── Foro — Schema inicial ────────────────────────────────────────────────────
-- Executado automaticamente pelo Docker na primeira inicialização do container MySQL.
-- Para re-executar manualmente: docker exec -i foro_db mysql -u root -p foro_db < init.sql

SET NAMES utf8mb4;
SET time_zone = '-03:00';

-- ─── Contas (tenants) ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS accounts (
  id          VARCHAR(36)  NOT NULL DEFAULT (UUID()),
  name        VARCHAR(255) NOT NULL,
  slug        VARCHAR(100) NOT NULL,
  status      ENUM('active','suspended','cancelled') NOT NULL DEFAULT 'active',
  plan_id     VARCHAR(50)  NOT NULL DEFAULT 'starter',
  asaas_id    VARCHAR(100) NULL COMMENT 'Customer ID no Asaas',
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_accounts_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── Usuários ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            VARCHAR(36)  NOT NULL DEFAULT (UUID()),
  account_id    VARCHAR(36)  NOT NULL,
  name          VARCHAR(255) NOT NULL,
  email         VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role          ENUM('admin','user') NOT NULL DEFAULT 'user',
  active        TINYINT(1)   NOT NULL DEFAULT 1,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_users_email (email),
  KEY idx_users_account (account_id),
  CONSTRAINT fk_users_account FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── Definições de campo customizáveis por conta ──────────────────────────────
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

-- ─── Leads ────────────────────────────────────────────────────────────────────
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

-- ─── Valores dos campos customizados ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lead_field_values (
  id                   VARCHAR(36) NOT NULL DEFAULT (UUID()),
  account_id           VARCHAR(36) NOT NULL,
  lead_id              VARCHAR(36) NOT NULL,
  field_definition_id  VARCHAR(36) NOT NULL,
  value_text           TEXT        NULL,
  value_number         DECIMAL(15,4) NULL,
  value_date           DATE        NULL,
  value_boolean        TINYINT(1)  NULL,
  value_json           JSON        NULL,
  updated_at           DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_lfv (lead_id, field_definition_id),
  KEY idx_lfv_account (account_id),
  CONSTRAINT fk_lfv_lead  FOREIGN KEY (lead_id)             REFERENCES leads(id)            ON DELETE CASCADE,
  CONSTRAINT fk_lfv_field FOREIGN KEY (field_definition_id) REFERENCES field_definitions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── Notas ────────────────────────────────────────────────────────────────────
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

-- ─── Tarefas ──────────────────────────────────────────────────────────────────
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

-- ─── Conversas com a IA ───────────────────────────────────────────────────────
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

-- ─── Uso de IA (para cobrança) ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_usage (
  id              VARCHAR(36)    NOT NULL DEFAULT (UUID()),
  account_id      VARCHAR(36)    NOT NULL,
  user_id         VARCHAR(36)    NOT NULL,
  conversation_id VARCHAR(36)    NULL,
  model           VARCHAR(100)   NOT NULL,
  input_tokens    INT            NOT NULL DEFAULT 0,
  output_tokens   INT            NOT NULL DEFAULT 0,
  cost_usd        DECIMAL(10,6)  NOT NULL DEFAULT 0,
  created_at      DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_usage_account (account_id),
  KEY idx_usage_date    (account_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── Auditoria ────────────────────────────────────────────────────────────────
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

-- ─── Pagamentos ───────────────────────────────────────────────────────────────
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
  paid_at         DATETIME      NULL,
  created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_payments_asaas (asaas_id),
  KEY idx_payments_account (account_id),
  CONSTRAINT fk_payments_account FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── NFS-e emitidas ───────────────────────────────────────────────────────────
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

-- ─── Seed: campos de sistema padrão (inseridos via trigger ou manualmente) ─────
-- Esses campos são criados por conta ao registrar um novo tenant (ver accounts.service.js)

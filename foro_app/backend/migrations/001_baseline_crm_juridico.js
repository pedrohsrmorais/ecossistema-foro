/**
 * 001 — Baseline do CRM jurídico (processos, agenda, créditos semanais, novos planos).
 * Leva um banco criado por versões anteriores do init.sql ao schema atual.
 * Em banco novo (init.sql já completo) todos os passos são no-op.
 */
module.exports.up = async function up(db) {
  // plans: cotas semanais + flag de compra
  await db.addColumn('plans', 'ai_credits_week', "INT NOT NULL DEFAULT 0 COMMENT 'créditos de IA por semana'");
  await db.addColumn('plans', 'lookups_week', "INT NOT NULL DEFAULT 0 COMMENT 'consultas pagas por semana'");
  await db.addColumn('plans', 'purchasable', "TINYINT(1) NOT NULL DEFAULT 1 COMMENT '0 = plano interno (trial)'");

  // accounts: trial por padrão + âncora das janelas semanais
  await db.run("ALTER TABLE accounts ALTER COLUMN plan_id SET DEFAULT 'trial'");
  if (!(await db.columnExists('accounts', 'plan_started_at'))) {
    await db.addColumn('accounts', 'plan_started_at', "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'âncora das janelas semanais de créditos'");
    await db.run('UPDATE accounts SET plan_started_at = created_at');
  }

  // tasks: vínculo com processo / prazo processual
  await db.addColumn('tasks', 'case_id', "VARCHAR(36) NULL COMMENT 'processo vinculado (opcional)'");
  await db.addColumn('tasks', 'is_deadline', "TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1 = prazo processual'");
  await db.addIndex('tasks', 'idx_tasks_case', '(case_id)');

  // ai_usage: tokens de cache e créditos
  await db.addColumn('ai_usage', 'cache_creation_tokens', 'INT NOT NULL DEFAULT 0');
  await db.addColumn('ai_usage', 'cache_read_tokens', 'INT NOT NULL DEFAULT 0');
  await db.addColumn('ai_usage', 'credits', 'DECIMAL(10,3) NOT NULL DEFAULT 0');

  // tabelas do CRM jurídico
  await db.run(`CREATE TABLE IF NOT EXISTS cases (
  id                  VARCHAR(36)   NOT NULL DEFAULT (UUID()),
  account_id          VARCHAR(36)   NOT NULL,
  lead_id             VARCHAR(36)   NULL,
  case_number         VARCHAR(40)   NULL COMMENT 'número CNJ formatado; NULL para casos ainda sem número',
  title               VARCHAR(255)  NULL COMMENT 'apelido interno, ex: Ação trabalhista — Maria',
  tribunal            VARCHAR(20)   NULL,
  court_url           VARCHAR(500)  NULL COMMENT 'link do processo no tribunal',
  area                VARCHAR(100)  NULL,
  status              ENUM('ativo','suspenso','arquivado','encerrado') NOT NULL DEFAULT 'ativo',
  phase               VARCHAR(100)  NULL COMMENT 'fase atual (livre): conhecimento, recurso, execução...',
  client_role         VARCHAR(50)   NULL COMMENT 'polo do cliente: autor, réu, terceiro...',
  opposing_party      VARCHAR(255)  NULL,
  cause_value         DECIMAL(14,2) NULL,
  responsible_user_id VARCHAR(36)   NULL,
  deleted_at          DATETIME      NULL,
  created_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_cases_number (account_id, case_number),
  KEY idx_cases_account_status (account_id, status),
  KEY idx_cases_lead (lead_id),
  CONSTRAINT fk_cases_account FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  CONSTRAINT fk_cases_lead    FOREIGN KEY (lead_id)    REFERENCES leads(id)    ON DELETE SET NULL,
  CONSTRAINT fk_cases_user    FOREIGN KEY (responsible_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await db.run(`CREATE TABLE IF NOT EXISTS case_updates (
  id          VARCHAR(36)  NOT NULL DEFAULT (UUID()),
  account_id  VARCHAR(36)  NOT NULL,
  case_id     VARCHAR(36)  NOT NULL,
  user_id     VARCHAR(36)  NULL,
  update_date DATE         NOT NULL,
  text        TEXT         NOT NULL,
  source      VARCHAR(30)  NOT NULL DEFAULT 'manual' COMMENT 'manual | ai_chat | datajud | djen',
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_case_updates_case (case_id, update_date),
  KEY idx_case_updates_account (account_id),
  CONSTRAINT fk_case_updates_case FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await db.run(`CREATE TABLE IF NOT EXISTS events (
  id           VARCHAR(36)  NOT NULL DEFAULT (UUID()),
  account_id   VARCHAR(36)  NOT NULL,
  user_id      VARCHAR(36)  NOT NULL COMMENT 'quem criou / responsável',
  lead_id      VARCHAR(36)  NULL,
  case_id      VARCHAR(36)  NULL,
  type         ENUM('reuniao','audiencia','pericia','outro') NOT NULL DEFAULT 'reuniao',
  title        VARCHAR(255) NOT NULL,
  starts_at    DATETIME     NOT NULL,
  ends_at      DATETIME     NULL,
  location     VARCHAR(255) NULL,
  meeting_url  VARCHAR(500) NULL,
  notes        TEXT         NULL,
  status       ENUM('agendado','realizado','cancelado') NOT NULL DEFAULT 'agendado',
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_events_account_start (account_id, starts_at),
  KEY idx_events_lead (lead_id),
  KEY idx_events_case (case_id),
  CONSTRAINT fk_events_account FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  CONSTRAINT fk_events_user    FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE CASCADE,
  CONSTRAINT fk_events_lead    FOREIGN KEY (lead_id)    REFERENCES leads(id)    ON DELETE SET NULL,
  CONSTRAINT fk_events_case    FOREIGN KEY (case_id)    REFERENCES cases(id)    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  // catálogo de planos atual (trial / starter / pro / business)
  await db.run(`INSERT INTO plans (id, name, price, max_users, max_leads, ai_credits_week, lookups_week, purchasable, features, display_order) VALUES
  ('trial',    'Teste grátis', 0.00,   1,  100,  50,   5,  0, JSON_ARRAY('14 dias grátis', '50 créditos de IA por semana', 'Até 100 leads'), 0),
  ('starter',  'Starter',      129.90, 1,  500,  150,  10, 1, JSON_ARRAY('CRM com IA', '150 créditos de IA por semana', 'Até 500 leads', '1 usuário'), 1),
  ('pro',      'Pro',          199.90, 5,  NULL, 300,  15, 1, JSON_ARRAY('CRM com IA', '300 créditos de IA por semana', 'Leads ilimitados', '5 usuários'), 2),
  ('business', 'Business',     399.90, 15, NULL, 700,  20, 1, JSON_ARRAY('CRM com IA', '700 créditos de IA por semana', 'Leads ilimitados', '15 usuários'), 3)
ON DUPLICATE KEY UPDATE
  name = VALUES(name), price = VALUES(price), max_users = VALUES(max_users),
  max_leads = VALUES(max_leads), ai_credits_week = VALUES(ai_credits_week),
  lookups_week = VALUES(lookups_week), purchasable = VALUES(purchasable),
  features = VALUES(features), display_order = VALUES(display_order)`);
};

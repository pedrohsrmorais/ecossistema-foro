/**
 * 005 — Núcleo jurídico: áreas de atuação, partes do processo, responsáveis, kanban de processos editável,
 * comarca/vara/magistrado e módulo de Documentos (modelos ficam em arquivos; aqui ficam os documentos gerados).
 */
const areas = require('../configs/legal-areas');
const { v4: uuid } = require('uuid');

module.exports.up = async function up(db) {
  // ── cases: área, campos por área, dados do juízo e etapa do kanban
  await db.addColumn('cases', 'area_key', "VARCHAR(30) NOT NULL DEFAULT 'geral' COMMENT 'civel|trabalhista|criminal|contratacoes_publicas|consultivo|geral'");
  await db.addColumn('cases', 'details', "JSON NULL COMMENT 'campos específicos da área (ver configs/legal-areas.js)'");
  await db.addColumn('cases', 'comarca', 'VARCHAR(120) NULL');
  await db.addColumn('cases', 'vara', 'VARCHAR(120) NULL');
  await db.addColumn('cases', 'magistrate', 'VARCHAR(160) NULL');
  await db.addColumn('cases', 'stage_id', "VARCHAR(36) NULL COMMENT 'etapa do kanban (case_stages.id)'");
  await db.addIndex('cases', 'idx_cases_area_stage', '(account_id, area_key, stage_id)');
  await db.addColumn('users', 'oab_number', "VARCHAR(30) NULL COMMENT 'ex.: OAB/RS 12345 — usado na assinatura dos documentos'");

  await db.run(`CREATE TABLE IF NOT EXISTS case_stages (
    id         VARCHAR(36) NOT NULL DEFAULT (UUID()),
    account_id VARCHAR(36) NOT NULL,
    area_key   VARCHAR(30) NOT NULL DEFAULT 'geral',
    stage_key  VARCHAR(40) NOT NULL,
    label      VARCHAR(80) NOT NULL,
    color      VARCHAR(9)  NOT NULL DEFAULT '#64748b',
    position   INT         NOT NULL DEFAULT 0,
    is_final   TINYINT(1)  NOT NULL DEFAULT 0 COMMENT '1 = processo concluído nesta etapa',
    created_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_stage (account_id, area_key, stage_key),
    KEY idx_stage_order (account_id, area_key, position)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await db.run(`CREATE TABLE IF NOT EXISTS case_parties (
    id                  VARCHAR(36)  NOT NULL DEFAULT (UUID()),
    account_id          VARCHAR(36)  NOT NULL,
    case_id             VARCHAR(36)  NOT NULL,
    lead_id             VARCHAR(36)  NULL COMMENT 'quando a parte é um cliente do CRM',
    name                VARCHAR(255) NOT NULL,
    role                VARCHAR(40)  NOT NULL DEFAULT 'outro',
    document            VARCHAR(20)  NULL COMMENT 'CPF ou CNPJ (só dígitos)',
    email               VARCHAR(255) NULL,
    phone               VARCHAR(30)  NULL,
    address             VARCHAR(500) NULL,
    nationality         VARCHAR(60)  NULL,
    marital_status      VARCHAR(40)  NULL,
    profession          VARCHAR(100) NULL,
    responsible_user_id VARCHAR(36)  NULL COMMENT 'usuário do escritório responsável por esta parte',
    notes               TEXT         NULL,
    created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_parties_case (account_id, case_id),
    KEY idx_parties_lead (lead_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await db.run(`CREATE TABLE IF NOT EXISTS case_members (
    id         VARCHAR(36) NOT NULL DEFAULT (UUID()),
    account_id VARCHAR(36) NOT NULL,
    case_id    VARCHAR(36) NOT NULL,
    user_id    VARCHAR(36) NOT NULL,
    role       ENUM('responsavel','colaborador') NOT NULL DEFAULT 'colaborador',
    created_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_member (case_id, user_id),
    KEY idx_member_user (account_id, user_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await db.run(`CREATE TABLE IF NOT EXISTS documents (
    id               VARCHAR(36)  NOT NULL DEFAULT (UUID()),
    account_id       VARCHAR(36)  NOT NULL,
    case_id          VARCHAR(36)  NULL,
    lead_id          VARCHAR(36)  NULL,
    template_key     VARCHAR(80)  NULL,
    template_version INT          NULL,
    area_key         VARCHAR(30)  NOT NULL DEFAULT 'geral',
    title            VARCHAR(255) NOT NULL,
    content          LONGTEXT     NOT NULL,
    status           ENUM('rascunho','revisado','final') NOT NULL DEFAULT 'rascunho',
    ai_generated     TINYINT(1)   NOT NULL DEFAULT 0,
    open_flags       INT          NOT NULL DEFAULT 0 COMMENT 'pendências [PREENCHER]/[CONFERIR] no texto',
    created_by       VARCHAR(36)  NOT NULL,
    created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at       DATETIME     NULL,
    PRIMARY KEY (id),
    KEY idx_docs_case (account_id, case_id),
    KEY idx_docs_account (account_id, updated_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await db.run(`CREATE TABLE IF NOT EXISTS document_versions (
    id          VARCHAR(36)  NOT NULL DEFAULT (UUID()),
    account_id  VARCHAR(36)  NOT NULL,
    document_id VARCHAR(36)  NOT NULL,
    version_no  INT          NOT NULL,
    content     LONGTEXT     NOT NULL,
    note        VARCHAR(255) NULL,
    created_by  VARCHAR(36)  NOT NULL,
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_doc_version (document_id, version_no)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  // ── dados existentes: área a partir do texto livre, etapas padrão em todas as contas, etapa dos processos
  const [cases] = await db.run('SELECT id, area FROM cases WHERE area_key = ?', ['geral']);
  for (const c of cases) {
    const k = areas.guessAreaKey(c.area);
    if (k && k !== 'geral') await db.run('UPDATE cases SET area_key = ? WHERE id = ?', [k, c.id]);
  }
  const [accounts] = await db.run('SELECT id FROM accounts');
  for (const a of accounts) {
    for (const key of areas.AREA_KEYS) {
      for (const s of areas.defaultStages(key)) {
        await db.run(
          'INSERT IGNORE INTO case_stages (id, account_id, area_key, stage_key, label, color, position, is_final) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [uuid(), a.id, key, s.stage_key, s.label, s.color, s.position, s.is_final]
        );
      }
    }
  }
  await db.run(`UPDATE cases c JOIN case_stages s ON s.account_id = c.account_id AND s.area_key = c.area_key AND s.position = 0
                SET c.stage_id = s.id WHERE c.stage_id IS NULL AND c.status IN ('ativo','suspenso')`);
  await db.run(`UPDATE cases c JOIN case_stages s ON s.account_id = c.account_id AND s.area_key = c.area_key AND s.is_final = 1
                SET c.stage_id = s.id WHERE c.stage_id IS NULL AND c.status IN ('encerrado','arquivado')`);
  // o responsável principal atual vira "responsavel" em case_members
  await db.run(`INSERT IGNORE INTO case_members (id, account_id, case_id, user_id, role)
                SELECT UUID(), account_id, id, responsible_user_id, 'responsavel' FROM cases
                WHERE responsible_user_id IS NOT NULL AND deleted_at IS NULL`);
};

const crypto = require('crypto');

/**
 * 007 — Escritório (workspace): conta "rascunho" até o usuário criar o escritório,
 * dados cadastrais, código de entrada, pedidos de entrada e atividade dos usuários.
 */
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function genCode() { let s = ''; for (let i = 0; i < 8; i++) s += ALPHA[crypto.randomInt(0, ALPHA.length)]; return s; }

module.exports.up = async function up(db) {
  await db.addColumn('accounts', 'office_configured', "TINYINT(1) NOT NULL DEFAULT 1 COMMENT '0 = conta rascunho: usuário ainda não criou o escritório (CRM bloqueado)'");
  await db.addColumn('accounts', 'office_code', "VARCHAR(12) NULL COMMENT 'código para pedir entrada no escritório (o admin aprova)'");
  await db.addColumn('accounts', 'cnpj', "VARCHAR(18) NULL COMMENT 'autodeclarado, validado por dígito verificador, não único'");
  await db.addColumn('accounts', 'address', 'VARCHAR(255) NULL');
  await db.addColumn('accounts', 'city', 'VARCHAR(100) NULL');
  await db.addColumn('accounts', 'state', 'CHAR(2) NULL');
  await db.addColumn('accounts', 'office_phone', 'VARCHAR(30) NULL');

  await db.run(`CREATE TABLE IF NOT EXISTS office_join_requests (
    id          VARCHAR(36) NOT NULL DEFAULT (UUID()),
    account_id  VARCHAR(36) NOT NULL COMMENT 'escritório alvo',
    user_id     VARCHAR(36) NOT NULL,
    status      ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    decided_at  DATETIME NULL,
    decided_by  VARCHAR(36) NULL,
    PRIMARY KEY (id),
    KEY idx_join_account (account_id, status),
    KEY idx_join_user (user_id, status)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await db.run(`CREATE TABLE IF NOT EXISTS user_activity (
    user_id      VARCHAR(36) NOT NULL,
    day          DATE        NOT NULL,
    account_id   VARCHAR(36) NOT NULL,
    seconds      INT         NOT NULL DEFAULT 0 COMMENT 'tempo ativo na aba (heartbeat)',
    actions      INT         NOT NULL DEFAULT 0 COMMENT 'requisições de escrita (criar/editar/excluir)',
    last_seen_at DATETIME    NULL,
    last_ping_at DATETIME    NULL COMMENT 'último heartbeat (base do crédito de tempo)',
    PRIMARY KEY (user_id, day),
    KEY idx_activity_account (account_id, day)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  // contas existentes: já são escritórios configurados, com código próprio
  const [rows] = await db.run('SELECT id FROM accounts WHERE office_code IS NULL');
  for (const r of rows) {
    for (let i = 0; i < 5; i++) {
      try { await db.run('UPDATE accounts SET office_code = ? WHERE id = ?', [genCode(), r.id]); break; } catch (e) { if (e.code !== 'ER_DUP_ENTRY') throw e; }
    }
  }
  if (!(await db.indexExists('accounts', 'uk_accounts_office_code'))) await db.run('ALTER TABLE accounts ADD UNIQUE KEY uk_accounts_office_code (office_code)');
};

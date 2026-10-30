/**
 * 004 — Alertas de prazo (preferência do usuário + log de envios) e Suporte (chamados).
 */
module.exports.up = async function up(db) {
  await db.addColumn('users', 'notify_deadlines_email', "TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1 = recebe o resumo diário de prazos por e-mail'");

  // Um registro por usuário/dia/tipo: garante que o resumo sai UMA vez, mesmo com reinício ou 2 instâncias.
  await db.run(`CREATE TABLE IF NOT EXISTS notification_log (
    id        VARCHAR(36) NOT NULL DEFAULT (UUID()),
    user_id   VARCHAR(36) NOT NULL,
    kind      VARCHAR(30) NOT NULL,
    ref_date  DATE        NOT NULL,
    sent_at   DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_notif (user_id, kind, ref_date)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await db.run(`CREATE TABLE IF NOT EXISTS support_tickets (
    id         VARCHAR(36)  NOT NULL DEFAULT (UUID()),
    account_id VARCHAR(36)  NOT NULL,
    user_id    VARCHAR(36)  NOT NULL,
    category   VARCHAR(30)  NOT NULL DEFAULT 'duvida',
    subject    VARCHAR(200) NOT NULL,
    message    TEXT         NOT NULL,
    status     ENUM('aberto','respondido','fechado') NOT NULL DEFAULT 'aberto',
    email_sent TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '1 = e-mail para o suporte saiu; 0 = só registrado',
    created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_support_account (account_id, created_at),
    KEY idx_support_user (user_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  // consultas de prazo/agenda por conta
  await db.addIndex('tasks', 'idx_tasks_deadline', '(account_id, completed_at, due_date)');
};

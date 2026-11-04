/**
 * 015 — Etapas do funil do CRM Comercial editáveis por escritório (antes eram 5 fixas no código).
 * `leads.stage` continua guardando a CHAVE da etapa (stage_key), então nenhum lead precisa ser migrado.
 * kind: open (em andamento) | proposal (em negociação: entra no "previsto" de honorários) | won (convertido) | closed (encerrado).
 */
const DEFAULTS = [
  ['novo',       'Novo',       '#0ea5e9', 0, 'open'],
  ['em_contato', 'Em contato', '#f59e0b', 1, 'open'],
  ['proposta',   'Proposta',   '#a855f7', 2, 'proposal'],
  ['convertido', 'Convertido', '#22c55e', 3, 'won'],
  ['encerrado',  'Encerrado',  '#94a3b8', 4, 'closed'],
];

module.exports.up = async function up(db) {
  await db.run(`CREATE TABLE IF NOT EXISTS lead_stages (
    id         VARCHAR(36) NOT NULL DEFAULT (UUID()),
    account_id VARCHAR(36) NOT NULL,
    stage_key  VARCHAR(40) NOT NULL,
    label      VARCHAR(80) NOT NULL,
    color      VARCHAR(9)  NOT NULL DEFAULT '#64748b',
    position   INT         NOT NULL DEFAULT 0,
    kind       VARCHAR(10) NOT NULL DEFAULT 'open' COMMENT 'open | proposal | won | closed',
    created_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_lead_stage (account_id, stage_key),
    KEY idx_lead_stage_order (account_id, position),
    CONSTRAINT fk_lead_stages_account FOREIGN KEY (account_id) REFERENCES accounts (id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  for (const [key, label, color, pos, kind] of DEFAULTS) {
    await db.run(
      `INSERT IGNORE INTO lead_stages (id, account_id, stage_key, label, color, position, kind)
       SELECT UUID(), a.id, ?, ?, ?, ?, ? FROM accounts a`,
      [key, label, color, pos, kind]);
  }
};

/**
 * 017 — Importação/exportação de listas no CRM Comercial.
 *  - leads.document  : CPF/CNPJ (só dígitos) — base da deduplicação e do futuro enriquecimento.
 *  - leads.import_id : de qual importação o lead veio (permite "desfazer importação").
 *  - lead_imports    : uma linha por importação. Enquanto está "analisada" guarda o arquivo e as linhas lidas
 *                      (rascunho, apagado em 24 h ou ao concluir); depois guarda só o resumo e os erros.
 */
module.exports.up = async function up(db) {
  await db.addColumn('leads', 'document', "VARCHAR(20) NULL COMMENT 'CPF (11) ou CNPJ (14), só dígitos'");
  await db.addColumn('leads', 'import_id', 'VARCHAR(36) NULL');
  await db.addIndex('leads', 'idx_leads_document', '(account_id, document)');
  await db.addIndex('leads', 'idx_leads_import', '(import_id)');

  await db.run(`CREATE TABLE IF NOT EXISTS lead_imports (
    id          VARCHAR(36)  NOT NULL DEFAULT (UUID()),
    account_id  VARCHAR(36)  NOT NULL,
    user_id     VARCHAR(36)  NULL,
    file_name   VARCHAR(255) NOT NULL,
    file_size   INT          NOT NULL DEFAULT 0,
    status      VARCHAR(12)  NOT NULL DEFAULT 'analisada' COMMENT 'analisada | concluida | desfeita',
    model_key   VARCHAR(30)  NULL,
    sheet_index INT          NOT NULL DEFAULT 0,
    header_row  INT          NOT NULL DEFAULT 0,
    headers     JSON         NULL,
    \`rows\`      LONGTEXT     NULL COMMENT 'linhas lidas (rascunho) — apagado ao concluir',
    file_data   LONGBLOB     NULL COMMENT 'arquivo original (rascunho) — apagado ao concluir',
    total_rows  INT          NOT NULL DEFAULT 0,
    mapping     JSON         NULL,
    options     JSON         NULL,
    stats       JSON         NULL,
    problems    LONGTEXT     NULL COMMENT 'linhas rejeitadas/com aviso, para baixar',
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    finished_at DATETIME     NULL,
    undone_at   DATETIME     NULL,
    PRIMARY KEY (id),
    KEY idx_lead_imports_account (account_id, created_at),
    CONSTRAINT fk_lead_imports_account FOREIGN KEY (account_id) REFERENCES accounts (id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
};

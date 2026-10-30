/**
 * 006 — Modelos de documento do escritório, permissões por usuário e administrador principal.
 */
module.exports.up = async function up(db) {
  await db.addColumn('users', 'permissions', "JSON NULL COMMENT 'permissões definidas pelo admin: { templates_manage, ai_drafts, delete_records }'");
  await db.addColumn('accounts', 'owner_user_id', "VARCHAR(36) NULL COMMENT 'administrador principal do escritório (não pode ser rebaixado/desativado)'");

  await db.run(`CREATE TABLE IF NOT EXISTS office_templates (
    id          VARCHAR(36)  NOT NULL DEFAULT (UUID()),
    account_id  VARCHAR(36)  NOT NULL,
    title       VARCHAR(200) NOT NULL,
    area_key    VARCHAR(30)  NOT NULL DEFAULT 'geral',
    description VARCHAR(500) NULL,
    body        MEDIUMTEXT   NOT NULL,
    legal_basis JSON         NULL COMMENT 'dispositivos que a IA pode citar neste modelo',
    reviewed    TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '1 = admin confirmou que o modelo foi revisado',
    version     INT          NOT NULL DEFAULT 1,
    created_by  VARCHAR(36)  NOT NULL,
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at  DATETIME     NULL,
    PRIMARY KEY (id),
    KEY idx_office_tpl_account (account_id, deleted_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  // administrador principal = o admin mais antigo de cada conta
  await db.run(`UPDATE accounts a SET owner_user_id = (
      SELECT u.id FROM users u WHERE u.account_id = a.id AND u.role = 'admin' ORDER BY u.created_at ASC LIMIT 1)
    WHERE a.owner_user_id IS NULL`);
};

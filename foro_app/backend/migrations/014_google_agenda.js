/**
 * 014 — Integração com o Google Agenda: uma conexão por usuário (tokens CRIPTOGRAFADOS) e marcação dos
 * eventos que vieram do Google (source='google', visíveis só para o dono) ou que foram enviados a ele.
 */
module.exports.up = async function up(db) {
  await db.run(`CREATE TABLE IF NOT EXISTS google_connections (
    id                VARCHAR(36)  NOT NULL DEFAULT (UUID()),
    user_id           VARCHAR(36)  NOT NULL,
    account_id        VARCHAR(36)  NOT NULL,
    google_sub        VARCHAR(64)  NULL,
    google_email      VARCHAR(255) NULL,
    scopes            TEXT         NULL,
    access_token_enc  TEXT         NULL COMMENT 'AES-256-GCM (utils/secret-box.js)',
    refresh_token_enc TEXT         NULL COMMENT 'AES-256-GCM (utils/secret-box.js)',
    token_expires_at  DATETIME     NULL,
    status            VARCHAR(20)  NOT NULL DEFAULT 'active' COMMENT 'active | revoked (precisa reconectar)',
    status_reason     VARCHAR(120) NULL,
    last_sync_at      DATETIME(3)  NULL,
    last_sync_error   VARCHAR(160) NULL,
    created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_google_user (user_id),
    KEY idx_google_status (status)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await db.addColumn('events', 'source', "VARCHAR(10) NOT NULL DEFAULT 'foro' COMMENT 'foro | google (importado, somente leitura, privado do dono)'");
  await db.addColumn('events', 'google_event_id', 'VARCHAR(255) NULL');
  await db.addIndex('events', 'idx_events_google', '(user_id, google_event_id)');
};

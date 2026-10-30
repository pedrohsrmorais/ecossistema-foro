/**
 * 010 — Processos salvos: o documento (PDF) fica no S3/MinIO; aqui ficam só os METADADOS e o ponteiro (bucket/chave).
 */
module.exports.up = async function up(db) {
  await db.run(`CREATE TABLE IF NOT EXISTS saved_processes (
    id               VARCHAR(36)  NOT NULL DEFAULT (UUID()),
    account_id       VARCHAR(36)  NOT NULL COMMENT 'workspace (escritório ou espaço pessoal) dono do arquivo',
    saved_by         VARCHAR(36)  NOT NULL,
    source           VARCHAR(30)  NOT NULL DEFAULT 'mock' COMMENT 'provedor da consulta (mock enquanto em teste)',
    search_query     VARCHAR(200) NULL,
    numero_cnj       VARCHAR(30)  NOT NULL,
    tribunal         VARCHAR(30)  NULL,
    classe           VARCHAR(150) NULL,
    assunto          VARCHAR(200) NULL,
    parties          JSON         NULL,
    distributed_at   DATE         NULL,
    last_movement    VARCHAR(255) NULL,
    last_movement_at DATE         NULL,
    s3_bucket        VARCHAR(100) NOT NULL,
    s3_key           VARCHAR(500) NOT NULL,
    file_name        VARCHAR(255) NOT NULL,
    content_type     VARCHAR(100) NOT NULL DEFAULT 'application/pdf',
    size_bytes       BIGINT       NOT NULL DEFAULT 0,
    sha256           CHAR(64)     NOT NULL,
    pages            INT          NULL,
    case_id          VARCHAR(36)  NULL COMMENT 'processo do CRM ao qual foi vinculado (futuro)',
    created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at       DATETIME     NULL,
    PRIMARY KEY (id),
    KEY idx_saved_proc_account (account_id, created_at),
    KEY idx_saved_proc_number (account_id, numero_cnj),
    KEY idx_saved_proc_sha (account_id, sha256)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
};

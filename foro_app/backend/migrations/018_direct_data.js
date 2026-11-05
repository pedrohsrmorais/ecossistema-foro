/**
 * 018 — Consultas de CPF/CNPJ/processos via Direct Data + enriquecimento de listas.
 *  - lookup_cache     : última resposta paga por conta/tipo/documento (evita pagar duas vezes; expira em LOOKUP_CACHE_DAYS).
 *  - enrichment_jobs  : lote de enriquecimento de uma planilha de CPF/CNPJ (rascunho → rodando → concluída).
 *  - service_prices   : custo real do provedor + preço de processos acima do custo (só se ainda estava no valor padrão).
 */
module.exports.up = async function up(db) {
  await db.run(`CREATE TABLE IF NOT EXISTS lookup_cache (
    id           VARCHAR(36)  NOT NULL DEFAULT (UUID()),
    account_id   VARCHAR(36)  NOT NULL,
    kind         VARCHAR(12)  NOT NULL COMMENT 'cpf | cnpj | processos',
    document     VARCHAR(20)  NOT NULL COMMENT 'só dígitos',
    payload      LONGTEXT     NOT NULL COMMENT 'resposta normalizada (JSON)',
    consulta_uid VARCHAR(80)  NULL COMMENT 'metaDados.consultaUid da Direct Data (rastreio/estorno)',
    fetched_at   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_lookup_cache (account_id, kind, document),
    KEY idx_lookup_cache_fetched (fetched_at),
    CONSTRAINT fk_lookup_cache_account FOREIGN KEY (account_id) REFERENCES accounts (id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await db.run(`CREATE TABLE IF NOT EXISTS enrichment_jobs (
    id          VARCHAR(36)  NOT NULL DEFAULT (UUID()),
    account_id  VARCHAR(36)  NOT NULL,
    user_id     VARCHAR(36)  NULL,
    file_name   VARCHAR(255) NOT NULL,
    status      VARCHAR(14)  NOT NULL DEFAULT 'analisada' COMMENT 'analisada | rodando | concluida | interrompida | cancelada',
    sheet_index INT          NOT NULL DEFAULT 0,
    header_row  INT          NOT NULL DEFAULT 0,
    doc_col     INT          NULL,
    options     JSON         NULL,
    \`rows\`      LONGTEXT     NULL COMMENT 'linhas lidas da planilha (JSON)',
    results     LONGTEXT     NULL COMMENT 'resultado por linha (JSON)',
    analysis    JSON         NULL,
    progress    JSON         NULL,
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    started_at  DATETIME     NULL,
    finished_at DATETIME     NULL,
    PRIMARY KEY (id),
    KEY idx_enrichment_account (account_id, created_at),
    CONSTRAINT fk_enrichment_account FOREIGN KEY (account_id) REFERENCES accounts (id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  // custo real na Direct Data (referência de margem; não é cobrado do cliente)
  await db.run("UPDATE service_prices SET provider = 'Direct Data', provider_cost_cents = 16 WHERE service_key IN ('cpf_lookup','cnpj_lookup')");
  await db.run("UPDATE service_prices SET provider = 'Direct Data', provider_cost_cents = 150 WHERE service_key = 'process_lookup'");
  // consulta processual custa R$ 1,50 no provedor: o padrão antigo (R$ 1,00) daria prejuízo
  await db.run("UPDATE service_prices SET price_cents = 300 WHERE service_key = 'process_lookup' AND price_cents = 100");
};

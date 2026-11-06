/**
 * 019 — Cota semanal de consultas (CPF/CNPJ) por usuário.
 *  - lookup_usage : uma linha por consulta que conta na cota (cache, sem resultado e erro não contam).
 *  - plans.lookups_week : teste grátis 10, Starter 20, Pro 40, Business 60 (fase de testes).
 * Passou da cota → bloqueia até renovar (o caminho para mais é o plano Consulting). A carteira de créditos
 * não é mais usada para CPF/CNPJ.
 */
module.exports.up = async function up(db) {
  await db.run(`CREATE TABLE IF NOT EXISTS lookup_usage (
    id          VARCHAR(36)  NOT NULL DEFAULT (UUID()),
    account_id  VARCHAR(36)  NOT NULL,
    user_id     VARCHAR(36)  NOT NULL,
    kind        VARCHAR(12)  NOT NULL COMMENT 'cpf | cnpj',
    source      VARCHAR(12)  NOT NULL DEFAULT 'consulta' COMMENT 'consulta | lista',
    created_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    KEY idx_lookup_usage_user (account_id, user_id, created_at),
    CONSTRAINT fk_lookup_usage_account FOREIGN KEY (account_id) REFERENCES accounts (id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await db.run(`UPDATE plans SET lookups_week = CASE id
      WHEN 'trial' THEN 10 WHEN 'starter' THEN 20 WHEN 'pro' THEN 40 WHEN 'business' THEN 60 ELSE lookups_week END
    WHERE id IN ('trial','starter','pro','business')`);
};

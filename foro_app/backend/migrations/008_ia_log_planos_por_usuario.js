/**
 * 008 — Log de ações da IA (com desfazer) e plano por usuário (cada pessoa tem o próprio plano, pago pelo admin).
 */
module.exports.up = async function up(db) {
  await db.run(`CREATE TABLE IF NOT EXISTS ai_actions (
    id              VARCHAR(36)  NOT NULL DEFAULT (UUID()),
    account_id      VARCHAR(36)  NOT NULL,
    user_id         VARCHAR(36)  NOT NULL,
    conversation_id VARCHAR(36)  NULL,
    tool            VARCHAR(60)  NOT NULL,
    summary         VARCHAR(500) NOT NULL,
    entity          VARCHAR(30)  NULL COMMENT 'tabela afetada (leads, tasks, events, cases...)',
    entity_id       VARCHAR(36)  NULL,
    op              ENUM('insert','update','delete') NULL,
    before_json     LONGTEXT     NULL,
    after_json      LONGTEXT     NULL,
    status          ENUM('done','undone','partial','failed') NOT NULL DEFAULT 'done',
    undo_note       VARCHAR(300) NULL,
    created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    undone_at       DATETIME     NULL,
    undone_by       VARCHAR(36)  NULL,
    PRIMARY KEY (id),
    KEY idx_ai_actions_account (account_id, created_at),
    KEY idx_ai_actions_user (user_id, created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  // Plano por usuário (assento): o admin paga; cada usuário tem créditos de IA do próprio plano.
  await db.addColumn('users', 'plan_id', "VARCHAR(50) NULL COMMENT 'plano pago do usuário (NULL = sem plano; no teste grátis vale o trial)'");
  await db.addColumn('users', 'plan_started_at', "DATETIME NULL COMMENT 'âncora das janelas semanais de crédito deste usuário'");
  await db.addColumn('users', 'stripe_subscription_id', 'VARCHAR(64) NULL');
  await db.addColumn('users', 'subscription_status', 'VARCHAR(30) NULL');
  await db.addColumn('users', 'current_period_end', 'DATETIME NULL');
  await db.addColumn('users', 'cancel_at_period_end', 'TINYINT(1) NOT NULL DEFAULT 0');
  await db.addIndex('users', 'idx_users_stripe_sub', '(stripe_subscription_id)');

  // Contas que já pagavam um plano único: todos os usuários ativos herdam o plano (ninguém perde acesso);
  // a assinatura do Stripe passa a ser do administrador principal.
  await db.run(`UPDATE users u JOIN accounts a ON a.id = u.account_id
    SET u.plan_id = a.plan_id, u.plan_started_at = a.plan_started_at
    WHERE a.status = 'active' AND a.plan_id <> 'trial' AND u.plan_id IS NULL AND u.active = 1`);
  await db.run(`UPDATE users u JOIN accounts a ON a.owner_user_id = u.id
    SET u.stripe_subscription_id = a.stripe_subscription_id, u.subscription_status = a.subscription_status,
        u.current_period_end = a.current_period_end, u.cancel_at_period_end = a.cancel_at_period_end
    WHERE a.stripe_subscription_id IS NOT NULL AND u.stripe_subscription_id IS NULL`);
};

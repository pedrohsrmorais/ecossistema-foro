/**
 * 003 — Stripe (substitui o Asaas): ids do cliente/assinatura na conta, ligação dos planos aos preços
 * do Stripe (por lookup_key), faturas pagas em `payments` e tabela de eventos de webhook (idempotência).
 * As colunas do Asaas ficam (somente leitura/legado) para não perder histórico.
 */
module.exports.up = async function up(db) {
  // accounts: assinatura + novo status 'expired' (assinatura terminou / não paga)
  await db.run("ALTER TABLE accounts MODIFY status ENUM('trialing','active','suspended','cancelled','expired') NOT NULL DEFAULT 'trialing'");
  await db.addColumn('accounts', 'stripe_customer_id', "VARCHAR(64) NULL COMMENT 'cus_... no Stripe'");
  await db.addColumn('accounts', 'stripe_subscription_id', "VARCHAR(64) NULL COMMENT 'sub_... da assinatura vigente'");
  await db.addColumn('accounts', 'subscription_status', "VARCHAR(30) NULL COMMENT 'status no Stripe: active, past_due, canceled...'");
  await db.addColumn('accounts', 'current_period_end', "DATETIME NULL COMMENT 'fim do período já pago (próxima renovação)'");
  await db.addColumn('accounts', 'cancel_at_period_end', "TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1 = cancelamento agendado para o fim do período'");
  await db.addIndex('accounts', 'idx_accounts_stripe_customer', '(stripe_customer_id)');

  // plans: como achar o preço no Stripe. stripe_price_id (opcional) tem prioridade; senão usa o lookup_key.
  await db.addColumn('plans', 'stripe_price_id', "VARCHAR(64) NULL COMMENT 'price_... (opcional; sobrepõe o lookup_key)'");
  await db.addColumn('plans', 'stripe_lookup_key', "VARCHAR(100) NULL COMMENT 'lookup_key do preço no Stripe, ex: foro_pro_monthly_brl_v1'");
  for (const code of ['starter', 'pro', 'business']) {
    await db.run('UPDATE plans SET stripe_lookup_key = ? WHERE id = ? AND stripe_lookup_key IS NULL', [`foro_${code}_monthly_brl_v1`, code]);
  }

  // payments: faturas do Stripe (asaas_id deixa de ser obrigatório)
  await db.run('ALTER TABLE payments MODIFY asaas_id VARCHAR(100) NULL');
  await db.addColumn('payments', 'stripe_invoice_id', "VARCHAR(64) NULL COMMENT 'in_... — uma linha por fatura paga'");
  await db.addColumn('payments', 'stripe_payment_intent_id', 'VARCHAR(64) NULL');
  await db.addColumn('payments', 'hosted_invoice_url', 'VARCHAR(500) NULL');
  await db.addColumn('payments', 'invoice_pdf', 'VARCHAR(500) NULL');
  if (!(await db.indexExists('payments', 'uk_payments_stripe_invoice'))) {
    await db.run('ALTER TABLE payments ADD UNIQUE KEY uk_payments_stripe_invoice (stripe_invoice_id)');
  }

  // eventos de webhook já recebidos (Stripe reenvia; processamos cada evento uma única vez)
  await db.run(`CREATE TABLE IF NOT EXISTS stripe_events (
    id           VARCHAR(100) NOT NULL COMMENT 'evt_...',
    type         VARCHAR(100) NOT NULL,
    received_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    processed_at DATETIME     NULL,
    PRIMARY KEY (id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
};

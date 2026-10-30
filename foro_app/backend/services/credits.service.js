/**
 * credits.service.js
 *
 * Carteira de créditos pré-pagos por conta (tenant). Todo serviço pago de
 * terceiro (CPF, CNPJ, consulta processual, resumo por IA) é cobrado daqui —
 * NUNCA chame um provedor externo pago sem debitar antes (ver
 * external-lookup.service.js, que implementa esse wrapper).
 *
 * Modelo de negócio (confirmado com o dono da plataforma): a intellsn é quem
 * contrata e paga as APIs externas com uma conta própria e centralizada. O
 * tenant só compra créditos na própria Foro (via Stripe, a ser implementado quando as consultas forem liberadas); o saldo pré-pago é
 * o único limite de gasto possível — por isso nunca há risco de "estourar o
 * cartão" da intellsn por bug: o máximo debitável é o que já foi pago.
 *
 * IMPORTANTE — Não existe fluxo de reembolso self-service para o tenant.
 * `refund()` só é chamado internamente quando a chamada ao provedor externo
 * falha de forma dura (erro técnico), nunca a pedido do usuário. Qualquer
 * reembolso por insatisfação é decisão manual da intellsn via
 * `adminAdjust()`, exposto apenas no painel administrativo (ver
 * admin.service.js / PATCH /api/admin/accounts/:id/credits/adjust).
 */
const { v4: uuidv4 } = require('uuid');
const { query, transaction } = require('../configs/db.config');
const { AppError } = require('../middlewares/error.middleware');

/**
 * Garante que a conta tem uma linha em credit_wallets (lazy init) e retorna o saldo.
 */
async function getBalance(accountId) {
  await _ensureWallet(accountId);
  const [rows] = await query('SELECT balance_cents FROM credit_wallets WHERE account_id = ? LIMIT 1', [accountId]);
  return rows[0].balance_cents;
}

async function _ensureWallet(accountId) {
  await query(
    'INSERT INTO credit_wallets (account_id, balance_cents) VALUES (?, 0) ON DUPLICATE KEY UPDATE account_id = account_id',
    [accountId]
  );
}

async function getServicePrice(serviceKey) {
  const [rows] = await query('SELECT * FROM service_prices WHERE service_key = ? AND active = 1 LIMIT 1', [serviceKey]);
  if (!rows.length) throw new AppError(`Serviço "${serviceKey}" não disponível.`, 400);
  return rows[0];
}

async function listServicePrices() {
  const [rows] = await query('SELECT * FROM service_prices WHERE active = 1 ORDER BY name');
  return rows;
}

/**
 * Credita a carteira (compra de créditos confirmada, ou ajuste manual).
 * Sempre registrado no ledger (credit_transactions) — nunca um UPDATE solto de saldo.
 */
async function addCredits(accountId, amountCents, { referenceType = 'payment', referenceId = null, note = null } = {}) {
  if (amountCents <= 0) throw new AppError('Valor de crédito inválido.', 400);

  return transaction(async (conn) => {
    await conn.execute(
      'INSERT INTO credit_wallets (account_id, balance_cents) VALUES (?, 0) ON DUPLICATE KEY UPDATE account_id = account_id',
      [accountId]
    );
    const [[wallet]] = await conn.execute('SELECT balance_cents FROM credit_wallets WHERE account_id = ? FOR UPDATE', [accountId]);
    const newBalance = wallet.balance_cents + amountCents;

    await conn.execute('UPDATE credit_wallets SET balance_cents = ? WHERE account_id = ?', [newBalance, accountId]);

    const txId = uuidv4();
    await conn.execute(
      `INSERT INTO credit_transactions (id, account_id, type, amount_cents, balance_after_cents, reference_type, reference_id, note)
       VALUES (?, ?, 'purchase', ?, ?, ?, ?, ?)`,
      [txId, accountId, amountCents, newBalance, referenceType, referenceId, note]
    );

    return { transactionId: txId, balance_cents: newBalance };
  });
}

/**
 * Debita o custo de um serviço pago. Lançada ANTES de chamar o provedor
 * externo — ver external-lookup.service.js. Lança 402 se saldo insuficiente.
 */
async function debit(accountId, serviceKey, { referenceId = null } = {}) {
  const price = await getServicePrice(serviceKey);
  const cost = price.price_cents;

  return transaction(async (conn) => {
    await conn.execute(
      'INSERT INTO credit_wallets (account_id, balance_cents) VALUES (?, 0) ON DUPLICATE KEY UPDATE account_id = account_id',
      [accountId]
    );
    const [[wallet]] = await conn.execute('SELECT balance_cents FROM credit_wallets WHERE account_id = ? FOR UPDATE', [accountId]);

    if (wallet.balance_cents < cost) {
      throw new AppError('Créditos insuficientes. Adicione créditos para continuar.', 402);
    }

    const newBalance = wallet.balance_cents - cost;
    await conn.execute('UPDATE credit_wallets SET balance_cents = ? WHERE account_id = ?', [newBalance, accountId]);

    const txId = uuidv4();
    await conn.execute(
      `INSERT INTO credit_transactions (id, account_id, type, amount_cents, balance_after_cents, service_key, reference_type, reference_id)
       VALUES (?, ?, 'consumption', ?, ?, ?, 'service_usage', ?)`,
      [txId, accountId, -cost, newBalance, serviceKey, referenceId]
    );

    return { transactionId: txId, cost_cents: cost, balance_cents: newBalance };
  });
}

/**
 * Reverte um débito de consumo — chamado SÓ internamente quando a chamada ao
 * provedor externo falha de forma dura (timeout, 5xx, erro de rede). Nunca
 * exposto como endpoint para o tenant solicitar.
 */
async function refund(consumptionTransactionId, note = 'Falha técnica na chamada ao provedor externo') {
  return transaction(async (conn) => {
    const [[original]] = await conn.execute(
      "SELECT * FROM credit_transactions WHERE id = ? AND type = 'consumption' LIMIT 1",
      [consumptionTransactionId]
    );
    if (!original) return null; // nada a reverter (ou já revertido)

    const refundAmount = Math.abs(original.amount_cents);
    const [[wallet]] = await conn.execute('SELECT balance_cents FROM credit_wallets WHERE account_id = ? FOR UPDATE', [original.account_id]);
    const newBalance = wallet.balance_cents + refundAmount;

    await conn.execute('UPDATE credit_wallets SET balance_cents = ? WHERE account_id = ?', [newBalance, original.account_id]);

    const txId = uuidv4();
    await conn.execute(
      `INSERT INTO credit_transactions (id, account_id, type, amount_cents, balance_after_cents, service_key, reference_type, reference_id, note)
       VALUES (?, ?, 'refund', ?, ?, ?, 'service_usage', ?, ?)`,
      [txId, original.account_id, refundAmount, newBalance, original.service_key, consumptionTransactionId, note]
    );

    return { transactionId: txId, balance_cents: newBalance };
  });
}

/**
 * Ajuste manual de crédito pela equipe da intellsn (painel administrativo).
 * Usado para conceder reembolso por decisão pessoal do dono da plataforma,
 * ou para corrigir um saldo. SEMPRE exige o motivo e qual admin aplicou.
 */
async function adminAdjust(accountId, amountCents, note, platformAdminId) {
  if (!note || !note.trim()) throw new AppError('Informe o motivo do ajuste.', 400);
  if (!amountCents || amountCents === 0) throw new AppError('Valor do ajuste inválido.', 400);

  return transaction(async (conn) => {
    await conn.execute(
      'INSERT INTO credit_wallets (account_id, balance_cents) VALUES (?, 0) ON DUPLICATE KEY UPDATE account_id = account_id',
      [accountId]
    );
    const [[wallet]] = await conn.execute('SELECT balance_cents FROM credit_wallets WHERE account_id = ? FOR UPDATE', [accountId]);
    const newBalance = wallet.balance_cents + amountCents;
    if (newBalance < 0) throw new AppError('Ajuste deixaria o saldo negativo.', 400);

    await conn.execute('UPDATE credit_wallets SET balance_cents = ? WHERE account_id = ?', [newBalance, accountId]);

    const txId = uuidv4();
    await conn.execute(
      `INSERT INTO credit_transactions (id, account_id, type, amount_cents, balance_after_cents, reference_type, reference_id, note, created_by_platform_admin)
       VALUES (?, ?, 'adjustment', ?, ?, 'platform_admin', ?, ?, ?)`,
      [txId, accountId, amountCents, newBalance, platformAdminId, note, platformAdminId]
    );

    return { transactionId: txId, balance_cents: newBalance };
  });
}

async function listTransactions(accountId, { page = 1, limit = 30 } = {}) {
  const offset = (page - 1) * limit;
  const [rows] = await query(
    'SELECT * FROM credit_transactions WHERE account_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
    [accountId, limit, offset]
  );
  return rows;
}

module.exports = {
  getBalance, getServicePrice, listServicePrices,
  addCredits, debit, refund, adminAdjust, listTransactions,
};

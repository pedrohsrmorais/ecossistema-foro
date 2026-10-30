/**
 * payments.service.js — consultas de faturas/pagamentos da conta.
 * A cobrança em si (Checkout, Portal e webhook) está em stripe.service.js.
 */
const { query } = require('../configs/db.config');
const { AppError } = require('../middlewares/error.middleware');

const COLS = 'id, account_id, type, status, amount, description, hosted_invoice_url, invoice_pdf, paid_at, created_at';

async function list(accountId, page = 1, limit = 20) {
  const offset = (page - 1) * limit;
  const [rows] = await query(
    `SELECT ${COLS} FROM payments WHERE account_id = ? ORDER BY created_at DESC LIMIT ${Number(limit) | 0} OFFSET ${Number(offset) | 0}`,
    [accountId]
  );
  return rows;
}

async function getById(paymentId, accountId) {
  const [rows] = await query(`SELECT ${COLS} FROM payments WHERE id = ? AND account_id = ? LIMIT 1`, [paymentId, accountId]);
  if (!rows.length) throw new AppError('Pagamento não encontrado.', 404);
  return rows[0];
}

async function getNfse(paymentId, accountId) {
  const [rows] = await query('SELECT * FROM nfse_records WHERE payment_id = ? AND account_id = ? LIMIT 1', [paymentId, accountId]);
  if (!rows.length) throw new AppError('Nota fiscal não encontrada.', 404);
  return rows[0];
}

module.exports = { list, getById, getNfse };

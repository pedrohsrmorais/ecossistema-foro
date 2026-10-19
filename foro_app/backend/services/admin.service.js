/**
 * admin.service.js
 *
 * Operações do painel administrativo da plataforma (equipe intellsn).
 * Diferente dos demais services, aqui NÃO há account_id — o admin de
 * plataforma pode ver e gerenciar qualquer conta (tenant).
 */
const { query } = require('../configs/db.config');
const { AppError } = require('../middlewares/error.middleware');

const ALLOWED_STATUSES = ['trialing', 'active', 'suspended', 'cancelled'];

async function listAccounts() {
  const [rows] = await query(
    `SELECT a.id, a.name, a.slug, a.status, a.plan_id, a.trial_ends_at, a.created_at,
            p.name AS plan_name, p.price AS plan_price,
            (SELECT COUNT(*) FROM users u WHERE u.account_id = a.id) AS users_count,
            (SELECT COUNT(*) FROM leads l WHERE l.account_id = a.id AND l.deleted_at IS NULL) AS leads_count
     FROM accounts a
     LEFT JOIN plans p ON p.id = a.plan_id
     ORDER BY a.created_at DESC`
  );
  return rows;
}

async function getAccount(accountId) {
  const [rows] = await query(
    `SELECT a.*, p.name AS plan_name, p.price AS plan_price
     FROM accounts a LEFT JOIN plans p ON p.id = a.plan_id
     WHERE a.id = ? LIMIT 1`,
    [accountId]
  );
  if (!rows.length) throw new AppError('Conta não encontrada.', 404);

  const [users] = await query(
    'SELECT id, name, email, role, active, email_verified_at, phone_verified_at, created_at FROM users WHERE account_id = ? ORDER BY created_at',
    [accountId]
  );
  const [payments] = await query(
    'SELECT id, type, status, amount, created_at FROM payments WHERE account_id = ? ORDER BY created_at DESC LIMIT 20',
    [accountId]
  );

  return { ...rows[0], users, recent_payments: payments };
}

async function updateAccountStatus(accountId, status) {
  if (!ALLOWED_STATUSES.includes(status)) throw new AppError('Status inválido.', 400);
  await query('UPDATE accounts SET status = ? WHERE id = ?', [status, accountId]);
  return getAccount(accountId);
}

async function listPlans() {
  const [rows] = await query('SELECT * FROM plans ORDER BY display_order');
  return rows.map(r => ({ ...r, features: typeof r.features === 'string' ? JSON.parse(r.features) : r.features }));
}

module.exports = { listAccounts, getAccount, updateAccountStatus, listPlans };

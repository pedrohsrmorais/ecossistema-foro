/**
 * seats.service.js — plano por usuário (assento). Cada pessoa do escritório tem o próprio plano; o admin contrata e paga.
 * Regras: só sobe de plano (nunca reduz o plano de um funcionário); conta sincroniza o status a partir dos assentos.
 */
const { query } = require('../configs/db.config');
const { AppError } = require('../middlewares/error.middleware');

const TRIAL_MAX_USERS = 5; // no teste grátis cada pessoa ganha créditos: limita o custo do teste
const LIVE = new Set(['active', 'past_due']);

/** Limite de pessoas no escritório: só vale durante o teste grátis (depois cada pessoa é um assento pago). */
async function assertCanAddUser(accountId, conn) {
  const run = conn ? conn.execute.bind(conn) : query;
  if (conn) await conn.execute('SELECT id FROM accounts WHERE id = ? FOR UPDATE', [accountId]);
  const [[a]] = await run('SELECT status FROM accounts WHERE id = ? LIMIT 1', [accountId]);
  if (a?.status !== 'trialing') return;
  const [[{ n }]] = await run('SELECT COUNT(*) AS n FROM users WHERE account_id = ? AND active = 1', [accountId]);
  if (n >= TRIAL_MAX_USERS) {
    throw new AppError(`Durante o teste grátis o escritório pode ter até ${TRIAL_MAX_USERS} pessoas. Contrate um plano para continuar convidando.`, 403, 'TRIAL_USER_LIMIT');
  }
}

/** Recalcula o status/plano da conta a partir dos assentos pagos. */
async function syncAccount(accountId) {
  const [seats] = await query(
    `SELECT u.id, u.plan_id, u.subscription_status, p.price FROM users u JOIN plans p ON p.id = u.plan_id
     WHERE u.account_id = ? AND u.active = 1 AND u.plan_id IS NOT NULL`, [accountId]);
  const live = seats.filter(s => LIVE.has(s.subscription_status) || s.subscription_status == null);
  const [[acc]] = await query('SELECT status FROM accounts WHERE id = ? LIMIT 1', [accountId]);
  if (live.length) {
    const top = live.reduce((a, b) => (Number(b.price) > Number(a.price) ? b : a));
    await query(
      "UPDATE accounts SET status = 'active', plan_id = ?, plan_started_at = IF(status = 'active', plan_started_at, NOW()) WHERE id = ? AND status IN ('trialing','active','expired')",
      [top.plan_id, accountId]);
  } else if (acc?.status === 'active') {
    await query("UPDATE accounts SET status = 'expired' WHERE id = ?", [accountId]);
  }
}

async function list(accountId) {
  const [rows] = await query(
    `SELECT u.id AS user_id, u.name, u.email, u.role, u.active, u.plan_id, u.subscription_status, u.current_period_end, u.cancel_at_period_end,
            p.name AS plan_name, p.price AS plan_price, (a.owner_user_id = u.id) AS is_owner, a.status AS account_status
     FROM users u JOIN accounts a ON a.id = u.account_id LEFT JOIN plans p ON p.id = u.plan_id
     WHERE u.account_id = ? ORDER BY u.active DESC, u.name`, [accountId]);
  return rows.map(r => ({ ...r, active: Boolean(r.active), is_owner: Boolean(r.is_owner), plan_price: r.plan_price == null ? null : Number(r.plan_price), cancel_at_period_end: Boolean(r.cancel_at_period_end),
    on_trial: !r.plan_id && r.account_status === 'trialing' }));
}

module.exports = { TRIAL_MAX_USERS, LIVE, assertCanAddUser, syncAccount, list };

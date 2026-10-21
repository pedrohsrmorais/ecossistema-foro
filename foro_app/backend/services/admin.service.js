/**
 * admin.service.js
 *
 * Operações do painel administrativo da plataforma (equipe intellsn).
 * Diferente dos demais services, aqui NÃO há account_id — o admin de
 * plataforma pode ver e gerenciar qualquer conta (tenant).
 */
const { query } = require('../configs/db.config');
const { AppError } = require('../middlewares/error.middleware');
const creditsService = require('./credits.service');
const modulesService = require('./modules.service');

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
    'SELECT id, type, status, amount, credits_amount_cents, created_at FROM payments WHERE account_id = ? ORDER BY created_at DESC LIMIT 20',
    [accountId]
  );
  const credits_balance_cents = await creditsService.getBalance(accountId);
  const recent_credit_transactions = await creditsService.listTransactions(accountId, { limit: 20 });

  return { ...rows[0], users, recent_payments: payments, credits_balance_cents, recent_credit_transactions };
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

/**
 * Ajuste manual de créditos de uma conta — único caminho de "reembolso"
 * que existe no sistema, e só acionável pela equipe da intellsn aqui.
 */
async function adjustAccountCredits(accountId, amountCents, note, platformAdminId) {
  return creditsService.adminAdjust(accountId, amountCents, note, platformAdminId);
}

/**
 * Visão agregada de créditos: quanto foi vendido (comprado pelos tenants) vs.
 * quanto foi consumido, por serviço. Serve pra conferir se o gasto real nos
 * provedores externos está alinhado ao esperado — sinal de bug se divergir.
 */
async function getCreditsOverview() {
  const [totals] = await query(
    `SELECT
       SUM(CASE WHEN type = 'purchase'    THEN amount_cents ELSE 0 END) AS total_purchased_cents,
       SUM(CASE WHEN type = 'consumption' THEN -amount_cents ELSE 0 END) AS total_consumed_cents,
       SUM(CASE WHEN type = 'refund'      THEN amount_cents ELSE 0 END) AS total_refunded_cents,
       SUM(CASE WHEN type = 'adjustment'  THEN amount_cents ELSE 0 END) AS total_adjusted_cents
     FROM credit_transactions`
  );

  const [byService] = await query(
    `SELECT service_key,
            COUNT(*) AS usage_count,
            SUM(-amount_cents) AS consumed_cents
     FROM credit_transactions
     WHERE type = 'consumption'
     GROUP BY service_key
     ORDER BY consumed_cents DESC`
  );

  const [walletsTotal] = await query('SELECT SUM(balance_cents) AS total_balance_cents FROM credit_wallets');

  return { ...totals[0], by_service: byService, total_wallets_balance_cents: walletsTotal[0].total_balance_cents || 0 };
}

/**
 * Módulos (CRM, pesquisa, educação...) e seu estado para uma conta —
 * usado pela tela de detalhe de conta no painel administrativo.
 */
async function getAccountModules(accountId) {
  return modulesService.listForAccount(accountId);
}

/**
 * Liga/desliga um módulo para uma conta específica. Único caminho do
 * sistema que faz isso — decisão exclusiva da equipe da intellsn, nunca do
 * próprio tenant (ver modules.service.js e middlewares/modules.middleware.js).
 */
async function setAccountModule(accountId, moduleKey, enabled, platformAdminId) {
  return modulesService.setEnabled(accountId, moduleKey, enabled, platformAdminId);
}

module.exports = {
  listAccounts, getAccount, updateAccountStatus, listPlans,
  adjustAccountCredits, getCreditsOverview,
  getAccountModules, setAccountModule,
};

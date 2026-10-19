const { query } = require('../configs/db.config');

/**
 * Carrega o contexto do tenant (account) para cada requisição autenticada.
 * Injeta req.account = { id, name, status, plan_id }
 *
 * Garante que:
 *  - A conta existe e está ativa.
 *  - O account_id do token bate com uma conta real no banco.
 */
async function loadClientContext(req, res, next) {
  try {
    const accountId = req.user?.account_id;
    if (!accountId) {
      return res.status(401).json({ error: 'Conta não identificada no token.' });
    }

    const [rows] = await query(
      'SELECT id, name, status, plan_id FROM accounts WHERE id = ? LIMIT 1',
      [accountId]
    );

    if (!rows.length) {
      return res.status(401).json({ error: 'Conta não encontrada.' });
    }

    const account = rows[0];

    if (account.status === 'cancelled') {
      return res.status(403).json({ error: 'Conta cancelada. Entre em contato com o suporte.' });
    }

    if (account.status === 'suspended') {
      return res.status(403).json({ error: 'Conta suspensa. Verifique sua situação de pagamento.' });
    }

    req.account = account;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { loadClientContext };

const { query } = require('../configs/db.config');

/**
 * Carrega o contexto do tenant (account) para cada requisição autenticada.
 * Injeta req.account = { id, name, status, plan_id }
 *
 * Garante que:
 *  - A conta existe e está ativa.
 *  - O account_id do token bate com uma conta real no banco.
 */
// Rotas liberadas mesmo com o teste expirado: o usuário precisa conseguir ver os
// planos, assinar e sair — todo o resto fica bloqueado até assinar um plano.
const TRIAL_EXPIRED_ALLOWED = [/^\/plans/, /^\/payments/, /^\/settings\/plan/, /^\/users\/me/, /^\/auth\//, /^\/ai\/credits/, /^\/modules/, /^\/support/];

async function loadClientContext(req, res, next) {
  try {
    const accountId = req.user?.account_id;
    if (!accountId) {
      return res.status(401).json({ error: 'Conta não identificada no token.' });
    }

    const [rows] = await query(
      'SELECT id, name, status, plan_id, trial_ends_at, office_configured FROM accounts WHERE id = ? LIMIT 1',
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

    // Trial expirado e nenhuma assinatura foi contratada (status continua 'trialing').
    // O webhook do Stripe (invoice.paid) muda o status para 'active' ao confirmar o pagamento.
    // Assinatura terminada / não paga (webhook do Stripe marca 'expired'): mesmo bloqueio, mesma saída (/planos).
    if (account.status === 'expired' && !TRIAL_EXPIRED_ALLOWED.some(rx => rx.test(req.path))) {
      return res.status(403).json({ error: 'Sua assinatura terminou. Assine um plano para continuar.', code: 'SUBSCRIPTION_EXPIRED' });
    }

    const trialExpired = account.status === 'trialing' && account.trial_ends_at && new Date(account.trial_ends_at) < new Date();
    if (trialExpired && !TRIAL_EXPIRED_ALLOWED.some(rx => rx.test(req.path))) {
      return res.status(403).json({ error: 'Período de teste expirado. Assine um plano para continuar.', code: 'TRIAL_EXPIRED' });
    }

    req.account = { ...account, office_configured: Boolean(account.office_configured), trial_expired: Boolean(trialExpired), subscription_expired: account.status === 'expired' };
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { loadClientContext };

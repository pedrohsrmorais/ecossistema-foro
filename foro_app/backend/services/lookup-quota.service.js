/**
 * lookup-quota.service.js — cota SEMANAL de consultas de CPF/CNPJ, por usuário e por escritório.
 *
 *  • Limite = plans.lookups_week do plano do usuário (mesma regra de plano/janela dos créditos de IA:
 *    ai-credits.service.getStatus — teste grátis usa o plano "trial"; janela de 7 dias ancorada no plano).
 *  • Conta: cada consulta que realmente foi à Direct Data e trouxe resultado. NÃO conta: cache, documento
 *    sem resultado (DIRECT_DATA_CHARGE_NOT_FOUND=true passa a contar) e erro técnico.
 *  • Sem acúmulo. Passou da cota → 429 LOOKUP_QUOTA_EXHAUSTED até renovar; quem precisa de mais fala com a
 *    equipe pelo plano Consulting. A carteira de créditos não é usada para CPF/CNPJ.
 *  • reserve() grava antes de chamar a fonte e confere o total em seguida (seguro contra cliques/abas
 *    simultâneos); release() desfaz quando a consulta não deve contar.
 */
const { query } = require('../configs/db.config');
const { AppError } = require('../middlewares/error.middleware');
const aiCredits = require('./ai-credits.service');

const fmt = (d) => new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

async function status(accountId, userId) {
  const s = await aiCredits.getStatus(accountId, userId);
  const limit = s.has_plan ? Number(s.lookups_week) || 0 : 0;
  const [[r]] = await query('SELECT COUNT(*) AS n FROM lookup_usage WHERE account_id = ? AND user_id = ? AND created_at >= ?', [accountId, userId, s.window_start]);
  const used = Number(r.n);
  return { limit, used, remaining: Math.max(0, limit - used), window_start: s.window_start, renews_at: s.renews_at, has_plan: s.has_plan, plan_name: s.plan_name };
}

function exhaustedError(q) {
  if (!q.has_plan) {
    return new AppError('Você ainda não tem um plano. Peça ao administrador do escritório para contratar um plano para você.', 429, 'LOOKUP_NO_PLAN', { quota: q });
  }
  return new AppError(
    `Você já usou as ${q.limit} consultas desta semana. Elas renovam em ${fmt(q.renews_at)}. Precisa de mais? Fale com a gente pelo plano Consulting.`,
    429, 'LOOKUP_QUOTA_EXHAUSTED', { quota: q });
}

/** Garante que há pelo menos `n` consultas disponíveis (sem consumir). */
async function assertAvailable(accountId, userId, n = 1) {
  const q = await status(accountId, userId);
  if (q.remaining < n) throw exhaustedError(q);
  return q;
}

/** Consome 1 consulta da cota; lança 429 se não houver. Retorna o id para release(). */
async function reserve(accountId, userId, kind, source = 'consulta') {
  const q = await status(accountId, userId);
  if (q.remaining <= 0) throw exhaustedError(q);
  const [[{ id }]] = await query('SELECT UUID() AS id');
  await query('INSERT INTO lookup_usage (id, account_id, user_id, kind, source) VALUES (?, ?, ?, ?, ?)', [id, accountId, userId, kind, source]);
  const [[r]] = await query('SELECT COUNT(*) AS n FROM lookup_usage WHERE account_id = ? AND user_id = ? AND created_at >= ?', [accountId, userId, q.window_start]);
  if (Number(r.n) > q.limit) {
    await release(id);
    throw exhaustedError({ ...q, used: q.limit, remaining: 0 });
  }
  return id;
}

async function release(id) {
  if (id) await query('DELETE FROM lookup_usage WHERE id = ?', [id]);
}

module.exports = { status, reserve, release, assertAvailable, exhaustedError };

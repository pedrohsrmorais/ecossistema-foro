/**
 * ai-credits.service.js — REGRA ÚNICA entre tokens de IA e créditos de IA.
 *
 *   créditos = (tokens de ENTRADA TOTAIS + 5 × tokens de SAÍDA) ÷ 2.500
 *
 *   • "Entrada totais" = input_tokens + cache_creation_input_tokens + cache_read_input_tokens.
 *     O cache de prompt NÃO reduz o que o cliente paga em créditos; a economia
 *     do cache vira margem da plataforma (o preço do crédito foi calculado assim).
 *   • O 5 é a razão de preço saída/entrada do Claude Sonnet 4.6 ($15 ÷ $3 por 1M).
 *   • 1 crédito = 2.500 tokens de entrada = 500 tokens de saída.
 *   • Um turno de chat soma todas as chamadas ao modelo do turno (loop de tools).
 *
 * Renovação SEMANAL: cada conta tem janelas de 7 dias ancoradas em
 * accounts.plan_started_at (início do trial ou da assinatura do plano atual).
 * O saldo da semana = plans.ai_credits_week − SUM(ai_usage.credits na janela).
 * Sem acúmulo (o que sobra não passa para a semana seguinte) e sem cron:
 * a janela atual é calculada na hora a partir da âncora.
 */
const { query } = require('../configs/db.config');
const { AppError } = require('../middlewares/error.middleware');

const TOKENS_PER_CREDIT = 2500;
const OUTPUT_WEIGHT = 5;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// Tarifas Claude Sonnet 4.6 (USD por token) — usadas só para registrar custo real.
const PRICE = { in: 3e-6, out: 15e-6, cacheRead: 0.3e-6, cacheWrite: 3.75e-6 };

function computeCredits({ input = 0, cacheCreation = 0, cacheRead = 0, output = 0 }) {
  const totalIn = input + cacheCreation + cacheRead;
  const credits = (totalIn + OUTPUT_WEIGHT * output) / TOKENS_PER_CREDIT;
  return Math.round(credits * 1000) / 1000;
}

function computeCostUsd({ input = 0, cacheCreation = 0, cacheRead = 0, output = 0 }) {
  return input * PRICE.in + cacheCreation * PRICE.cacheWrite + cacheRead * PRICE.cacheRead + output * PRICE.out;
}

function currentWindow(anchor, now = new Date()) {
  const a = new Date(anchor).getTime();
  const idx = Math.max(0, Math.floor((now.getTime() - a) / WEEK_MS));
  const start = new Date(a + idx * WEEK_MS);
  const end = new Date(start.getTime() + WEEK_MS);
  return { index: idx, start, end };
}

/**
 * Créditos POR USUÁRIO: cada pessoa tem o plano (assento) que o admin contratou para ela.
 *  • com plano pago        → limite e janela semanal do plano do usuário (âncora users.plan_started_at)
 *  • teste grátis (trial)  → limite do plano "trial" para cada usuário
 *  • sem plano (conta paga, usuário sem assento) → 0 crédito; precisa pedir ao admin
 */
async function getStatus(accountId, userId) {
  const [rows] = await query(
    `SELECT a.plan_started_at AS acc_anchor, a.plan_id AS acc_plan, a.status, a.trial_ends_at, u.plan_id AS user_plan, u.plan_started_at AS user_anchor
     FROM accounts a LEFT JOIN users u ON u.id = ? AND u.account_id = a.id WHERE a.id = ? LIMIT 1`,
    [userId || null, accountId]
  );
  if (!rows.length) throw new AppError('Conta não encontrada.', 404);
  const acc = rows[0];
  let planId = null, anchor = acc.acc_anchor;
  if (acc.user_plan) { planId = acc.user_plan; anchor = acc.user_anchor || acc.acc_anchor; }
  else if (acc.status === 'trialing') planId = 'trial';
  else if (acc.status === 'active') {
    // Conta ativa sem NENHUM assento pago (concessão manual pela equipe da plataforma / legado): todos usam o plano da conta.
    const [[c]] = await query('SELECT COUNT(*) AS n FROM users WHERE account_id = ? AND active = 1 AND plan_id IS NOT NULL', [accountId]);
    if (c.n === 0) planId = acc.acc_plan;
  } else if (!userId) { planId = 'trial'; }
  let plan = null;
  if (planId) { const [p] = await query('SELECT id, name, ai_credits_week, lookups_week FROM plans WHERE id = ? LIMIT 1', [planId]); plan = p[0] || null; }
  const win = currentWindow(anchor);
  const limit = plan ? Number(plan.ai_credits_week) : 0;
  let used = 0;
  if (userId) {
    const [[r]] = await query('SELECT COALESCE(SUM(credits), 0) AS used FROM ai_usage WHERE account_id = ? AND user_id = ? AND created_at >= ?', [accountId, userId, win.start]);
    used = r.used;
  } else {
    const [[r]] = await query('SELECT COALESCE(SUM(credits), 0) AS used FROM ai_usage WHERE account_id = ? AND created_at >= ?', [accountId, win.start]);
    used = r.used;
  }
  const usedN = Math.round(Number(used) * 100) / 100;
  return {
    plan_id: plan?.id || null,
    plan_name: plan?.name || 'Sem plano',
    has_plan: Boolean(plan),
    weekly_limit: limit,
    used: usedN,
    remaining: Math.max(0, Math.round((limit - usedN) * 100) / 100),
    window_start: win.start,
    renews_at: win.end,
    lookups_week: plan?.lookups_week ?? 0,
    account_status: acc.status,
    trial_ends_at: acc.trial_ends_at,
    rule: { tokens_per_credit: TOKENS_PER_CREDIT, output_weight: OUTPUT_WEIGHT },
  };
}

/** Bloqueia o turno se a semana já esgotou (ou se o usuário não tem plano). O último turno pode ultrapassar levemente o saldo. */
async function assertHasCredits(accountId, userId) {
  const s = await getStatus(accountId, userId);
  if (!s.has_plan) {
    const err = new AppError('Você ainda não tem um plano de IA. Peça ao administrador do escritório para contratar um plano para você.', 402);
    err.code = 'AI_NO_PLAN';
    throw err;
  }
  if (s.remaining <= 0) {
    const err = new AppError(
      `Seus créditos de IA desta semana acabaram. Renovam em ${new Date(s.renews_at).toLocaleDateString('pt-BR')}.`,
      402
    );
    err.code = 'AI_CREDITS_EXHAUSTED';
    err.extra = { renews_at: s.renews_at };
    throw err;
  }
  return s;
}

module.exports = {
  TOKENS_PER_CREDIT, OUTPUT_WEIGHT, computeCredits, computeCostUsd, currentWindow, getStatus, assertHasCredits,
};

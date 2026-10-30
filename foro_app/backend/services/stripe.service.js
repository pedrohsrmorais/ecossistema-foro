/**
 * stripe.service.js — assinatura do Foro via Stripe (somente cartão).
 *
 * PLANO POR USUÁRIO: cada pessoa do escritório tem o próprio plano (1 assinatura Stripe por pessoa, todas no mesmo
 * cliente/cartão do escritório). Só administradores contratam; o plano de um usuário só SOBE (nunca é reduzido pelo app).
 *
 * Fluxo:
 *   1. POST /payments/checkout  → cria uma Checkout Session (página hospedada pelo Stripe: o cartão NUNCA passa
 *      pelo nosso servidor) e devolve a URL.
 *   2. O cliente paga no Stripe e volta para /planos?checkout=ok.
 *   3. O Stripe chama POST /webhooks/stripe (assinado). É o WEBHOOK que ativa o plano — nunca a volta do navegador.
 *   4. POST /payments/portal    → Portal do Cliente do Stripe (trocar de plano, atualizar cartão, cancelar, faturas).
 *
 * Eventos tratados (configure exatamente estes no Dashboard):
 *   checkout.session.completed · invoice.paid · invoice.payment_failed
 *   customer.subscription.updated · customer.subscription.deleted
 *
 * Compatível com as versões "basil/endive" da API do Stripe (campos movidos) e com as anteriores: os getters
 * abaixo tentam o formato novo e caem no antigo.
 */
const Stripe = require('stripe');
const { query } = require('../configs/db.config');
const { AppError } = require('../middlewares/error.middleware');
const nfseService = require('./nfse.service');

const PRICE_CACHE_TTL_MS = 10 * 60 * 1000;
const priceCache = new Map(); // planCode -> { id, at }
let _client = null;

function configured() { return Boolean(process.env.STRIPE_SECRET_KEY); }

function client() {
  if (!configured()) throw new AppError('Pagamentos indisponíveis no momento. Tente novamente em breve.', 503, 'PAYMENTS_UNAVAILABLE');
  if (!_client) {
    const opts = { maxNetworkRetries: 2, timeout: 20000, appInfo: { name: 'Foro', version: '1.0.0' } };
    // Só para testes automatizados (aponta o SDK para um Stripe simulado). Em produção NÃO defina.
    if (process.env.STRIPE_API_BASE) {
      const u = new URL(process.env.STRIPE_API_BASE);
      Object.assign(opts, { host: u.hostname, port: u.port || (u.protocol === 'https:' ? 443 : 80), protocol: u.protocol.replace(':', '') });
    }
    _client = new Stripe(process.env.STRIPE_SECRET_KEY, opts);
  }
  return _client;
}

const frontUrl = () => (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/+$/, '');
const toDate = (unix) => (unix ? new Date(unix * 1000) : null);
const stripeErr = (err, fallback) => {
  console.error('[stripe]', err.type || '', err.code || '', err.message);
  return new AppError(fallback, 502, 'STRIPE_ERROR');
};

// ─── Planos ↔ preços do Stripe ────────────────────────────────────────────────

async function _planRow(planCode) {
  const [rows] = await query('SELECT * FROM plans WHERE id = ? AND active = 1 LIMIT 1', [planCode]);
  return rows[0] || null;
}

/**
 * Descobre o price_... do plano: plans.stripe_price_id, senão busca pelo lookup_key.
 * Confere que o preço no Stripe bate com o catálogo (moeda, mensal, valor) — evita cobrar valor errado.
 */
async function resolvePriceId(plan) {
  const cached = priceCache.get(plan.id);
  if (cached && Date.now() - cached.at < PRICE_CACHE_TTL_MS) return cached.id;

  const stripe = client();
  let price;
  try {
    if (plan.stripe_price_id) price = await stripe.prices.retrieve(plan.stripe_price_id);
    else if (plan.stripe_lookup_key) price = (await stripe.prices.list({ lookup_keys: [plan.stripe_lookup_key], active: true, limit: 1 })).data[0];
  } catch (err) { throw stripeErr(err, 'Não foi possível consultar o preço do plano no Stripe.'); }

  if (!price) throw new AppError(`Plano "${plan.name}" ainda não está cadastrado no Stripe (lookup_key ${plan.stripe_lookup_key || '—'}).`, 503, 'PLAN_PRICE_NOT_CONFIGURED');
  const expected = Math.round(Number(plan.price) * 100);
  if (price.currency !== 'brl' || price.recurring?.interval !== 'month' || price.unit_amount !== expected) {
    console.error(`[stripe] preço ${price.id} diverge do catálogo: esperado brl/month/${expected}, veio ${price.currency}/${price.recurring?.interval}/${price.unit_amount}`);
    throw new AppError('O preço cadastrado no Stripe não confere com o plano. Fale com o suporte.', 503, 'PLAN_PRICE_MISMATCH');
  }
  priceCache.set(plan.id, { id: price.id, at: Date.now() });
  return price.id;
}

/** Inverso: price_... → código do plano (por stripe_price_id, lookup_key ou metadata.plan_code). */
async function planFromPrice(priceRef) {
  const priceId = typeof priceRef === 'string' ? priceRef : priceRef?.id;
  if (!priceId) return null;
  const [byId] = await query('SELECT id FROM plans WHERE stripe_price_id = ? LIMIT 1', [priceId]);
  if (byId.length) return byId[0].id;

  let price = typeof priceRef === 'object' && priceRef.lookup_key !== undefined ? priceRef : null;
  if (!price) {
    try { price = await client().prices.retrieve(priceId); } catch (err) { throw stripeErr(err, 'Falha ao consultar o preço no Stripe.'); }
  }
  if (price.lookup_key) {
    const [byKey] = await query('SELECT id FROM plans WHERE stripe_lookup_key = ? LIMIT 1', [price.lookup_key]);
    if (byKey.length) return byKey[0].id;
  }
  const code = price.metadata?.plan_code;
  if (code) {
    const [byCode] = await query('SELECT id FROM plans WHERE id = ? AND purchasable = 1 LIMIT 1', [code]);
    if (byCode.length) return byCode[0].id;
  }
  return null;
}

// ─── Cliente, Checkout e Portal ───────────────────────────────────────────────

async function _ensureCustomer(accountId, userEmail) {
  const [[acc]] = await query('SELECT id, name, stripe_customer_id FROM accounts WHERE id = ? LIMIT 1', [accountId]);
  if (!acc) throw new AppError('Conta não encontrada.', 404);
  if (acc.stripe_customer_id) return acc.stripe_customer_id;

  let customer;
  try {
    customer = await client().customers.create(
      { name: acc.name, email: userEmail, metadata: { account_id: accountId } },
      { idempotencyKey: `foro-customer-${accountId}` }
    );
  } catch (err) { throw stripeErr(err, 'Não foi possível iniciar o pagamento. Tente novamente.'); }

  // Dois cliques simultâneos: só o primeiro grava; o segundo lê o que ficou.
  await query('UPDATE accounts SET stripe_customer_id = ? WHERE id = ? AND stripe_customer_id IS NULL', [customer.id, accountId]);
  const [[fresh]] = await query('SELECT stripe_customer_id FROM accounts WHERE id = ? LIMIT 1', [accountId]);
  return fresh.stripe_customer_id;
}

const LIVE_SUB = new Set(['active', 'trialing', 'past_due']);

/**
 * Contrata (ou melhora) o plano de UMA pessoa do escritório. Só o admin chama (ver rota).
 *  • pessoa sem assinatura  → Checkout Session (cartão) → { url }
 *  • pessoa com assinatura  → troca o preço da assinatura (com proporcional) → { updated: true }; só aceita plano MAIOR.
 */
async function createCheckout(accountId, userEmail, planCode, targetUserId) {
  const plan = await _planRow(planCode);
  if (!plan || !plan.purchasable) throw new AppError('Plano inválido.', 400);
  if (!targetUserId) throw new AppError('Informe para qual usuário é o plano.', 422);

  const [[target]] = await query(
    `SELECT u.id, u.name, u.plan_id, u.stripe_subscription_id, u.subscription_status, p.price AS cur_price
     FROM users u LEFT JOIN plans p ON p.id = u.plan_id WHERE u.id = ? AND u.account_id = ? AND u.active = 1 LIMIT 1`, [targetUserId, accountId]);
  if (!target) throw new AppError('Usuário não encontrado neste escritório.', 404);

  const priceId = await resolvePriceId(plan);
  const live = target.stripe_subscription_id && LIVE_SUB.has(target.subscription_status);

  if (live) {
    if (target.plan_id === plan.id) throw new AppError('Esta pessoa já está neste plano.', 409, 'SAME_PLAN');
    if (Number(plan.price) <= Number(target.cur_price)) {
      throw new AppError('Não é possível reduzir o plano de um usuário do escritório. Você só pode contratar um plano melhor.', 403, 'NO_DOWNGRADE');
    }
    try {
      const stripe = client();
      const sub = await stripe.subscriptions.retrieve(target.stripe_subscription_id);
      const item = sub.items?.data?.[0];
      if (!item) throw new Error('assinatura sem item');
      await stripe.subscriptions.update(sub.id, {
        items: [{ id: item.id, price: priceId }],
        proration_behavior: 'always_invoice',
        metadata: { account_id: accountId, user_id: target.id, plan_code: plan.id },
      });
      return { updated: true };
    } catch (err) { throw stripeErr(err, 'Não foi possível melhorar o plano agora. Tente novamente.'); }
  }
  if (target.plan_id && Number(plan.price) < Number(target.cur_price)) {
    throw new AppError('Não é possível reduzir o plano de um usuário do escritório.', 403, 'NO_DOWNGRADE');
  }

  const customer = await _ensureCustomer(accountId, userEmail);
  const meta = { account_id: accountId, user_id: target.id, plan_code: plan.id };
  try {
    const session = await client().checkout.sessions.create({
      mode: 'subscription',
      customer,
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: accountId,
      subscription_data: { metadata: meta },
      metadata: meta,
      billing_address_collection: 'required',
      tax_id_collection: { enabled: true },           // CPF/CNPJ do escritório (útil para a NFS-e)
      customer_update: { name: 'auto', address: 'auto' },
      locale: 'pt-BR',
      success_url: `${frontUrl()}/planos?checkout=ok&user=${encodeURIComponent(target.id)}`,
      cancel_url: `${frontUrl()}/planos?checkout=cancelado`,
    });
    return { url: session.url };
  } catch (err) { throw stripeErr(err, 'Não foi possível abrir o pagamento. Tente novamente.'); }
}

async function createPortal(accountId) {
  const [[acc]] = await query('SELECT stripe_customer_id FROM accounts WHERE id = ? LIMIT 1', [accountId]);
  if (!acc?.stripe_customer_id) throw new AppError('Você ainda não tem assinatura.', 400, 'NO_CUSTOMER');
  try {
    const session = await client().billingPortal.sessions.create({ customer: acc.stripe_customer_id, return_url: `${frontUrl()}/planos` });
    return { url: session.url };
  } catch (err) {
    console.error('[stripe] portal:', err.message);
    throw new AppError('O portal de assinatura ainda não está disponível. Fale com o suporte.', 503, 'PORTAL_UNAVAILABLE');
  }
}

// ─── Webhook ──────────────────────────────────────────────────────────────────

/** Valida a assinatura sobre os bytes originais (req.rawBody) e devolve o evento. */
function constructEvent(rawBody, signature) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !configured()) throw new AppError('Webhook não configurado.', 503, 'WEBHOOK_NOT_CONFIGURED');
  try {
    return client().webhooks.constructEvent(rawBody, signature, secret);
  } catch (err) {
    throw new AppError('Assinatura do webhook inválida.', 400, 'BAD_SIGNATURE');
  }
}

// getters compatíveis com as várias versões da API
const invoiceSubId = (inv) => {
  const s = inv.parent?.subscription_details?.subscription ?? inv.subscription;
  return typeof s === 'string' ? s : s?.id || null;
};
const invoiceLine = (inv) => inv.lines?.data?.[0] || null;
const linePrice = (line) => line?.pricing?.price_details?.price ?? line?.price ?? null;
const subItem = (sub) => sub.items?.data?.[0] || null;
const subPeriodEnd = (sub) => toDate(subItem(sub)?.current_period_end ?? sub.current_period_end);

async function _accountByCustomer(customerRef) {
  const id = typeof customerRef === 'string' ? customerRef : customerRef?.id;
  if (!id) return null;
  const [rows] = await query('SELECT * FROM accounts WHERE stripe_customer_id = ? LIMIT 1', [id]);
  return rows[0] || null;
}

const seatsService = require('./seats.service');

/** Acha o assento (usuário) de uma assinatura: pelo id gravado, senão pelos metadados (inclusive consultando o Stripe). */
async function _seatBySub(subId, hintMeta) {
  if (!subId) return null;
  const [byId] = await query('SELECT * FROM users WHERE stripe_subscription_id = ? LIMIT 1', [subId]);
  if (byId.length) return byId[0];
  let userId = hintMeta?.user_id;
  if (!userId) {
    try { userId = (await client().subscriptions.retrieve(subId)).metadata?.user_id; } catch (err) { console.error('[stripe] retrieve sub:', err.message); }
  }
  if (!userId) return null;
  const [byUser] = await query('SELECT * FROM users WHERE id = ? LIMIT 1', [userId]);
  return byUser[0] || null;
}
const invoiceMeta = (inv) => inv.parent?.subscription_details?.metadata ?? inv.subscription_details?.metadata ?? invoiceLine(inv)?.metadata ?? null;

/**
 * Coloca o USUÁRIO no plano pago. A âncora das janelas semanais de crédito (plan_started_at) só reinicia quando ele
 * NÃO tinha assinatura ativa (1ª contratação ou reassinatura). Melhorar o plano no meio do ciclo mantém a janela.
 */
async function _activateSeat(user, planCode, { subscriptionId, periodEnd, cancelAtPeriodEnd }) {
  await query(
    `UPDATE users SET
       plan_started_at = IF(plan_id IS NOT NULL AND subscription_status = 'active', plan_started_at, NOW()),
       plan_id = ?, stripe_subscription_id = ?, subscription_status = 'active',
       current_period_end = COALESCE(?, current_period_end), cancel_at_period_end = ?
     WHERE id = ?`,
    [planCode, subscriptionId, periodEnd, cancelAtPeriodEnd ? 1 : 0, user.id]
  );
  await seatsService.syncAccount(user.account_id);
}

async function _expireSeat(user) {
  await query(
    "UPDATE users SET plan_id = NULL, subscription_status = 'canceled', stripe_subscription_id = NULL, cancel_at_period_end = 0 WHERE id = ?",
    [user.id]
  );
  await seatsService.syncAccount(user.account_id);
}

const HANDLERS = {
  async 'checkout.session.completed'(session) {
    if (session.mode !== 'subscription') return;
    const accountId = session.client_reference_id || session.metadata?.account_id;
    const userId = session.metadata?.user_id;
    if (!accountId) return;
    const customer = typeof session.customer === 'string' ? session.customer : session.customer?.id;
    const sub = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;
    await query('UPDATE accounts SET stripe_customer_id = COALESCE(stripe_customer_id, ?) WHERE id = ?', [customer, accountId]);
    // Só registra o id; QUEM ATIVA O PLANO é o invoice.paid (pagamento confirmado).
    if (userId && sub) await query('UPDATE users SET stripe_subscription_id = ? WHERE id = ? AND account_id = ?', [sub, userId, accountId]);
  },

  async 'invoice.paid'(inv) {
    const subId = invoiceSubId(inv);
    if (!subId) return; // cobrança avulsa: não é assinatura
    const account = await _accountByCustomer(inv.customer);
    if (!account) return console.warn('[stripe] invoice.paid de cliente desconhecido:', inv.customer);
    const user = await _seatBySub(subId, invoiceMeta(inv));
    if (!user || user.account_id !== account.id) throw new Error(`Fatura ${inv.id}: não achei o usuário da assinatura ${subId}.`);

    const line = invoiceLine(inv);
    const planCode = await planFromPrice(linePrice(line));
    if (!planCode) throw new Error(`Preço da fatura ${inv.id} não corresponde a nenhum plano do Foro.`);

    await _activateSeat(user, planCode, { subscriptionId: subId, periodEnd: toDate(line?.period?.end), cancelAtPeriodEnd: false });

    const paid = (inv.amount_paid || 0) / 100;
    if (paid > 0) {
      const [[plan]] = await query('SELECT name FROM plans WHERE id = ? LIMIT 1', [planCode]);
      const description = `Foro ${plan?.name || planCode} — ${user.name} (assinatura mensal)`;
      const pi = typeof inv.payment_intent === 'string' ? inv.payment_intent : inv.payment_intent?.id || null;
      const [ins] = await query(
        `INSERT IGNORE INTO payments (id, account_id, type, status, amount, description, stripe_invoice_id, stripe_payment_intent_id, hosted_invoice_url, invoice_pdf, paid_at)
         VALUES (UUID(), ?, 'credit_card', 'PAID', ?, ?, ?, ?, ?, ?, ?)`,
        [account.id, paid, description, inv.id, pi, inv.hosted_invoice_url || null, inv.invoice_pdf || null, new Date()]
      );
      if (ins.affectedRows) {
        const [[pay]] = await query('SELECT id FROM payments WHERE stripe_invoice_id = ? LIMIT 1', [inv.id]);
        nfseService.emitNfse(pay.id, account.id, paid, description).catch(e => console.error('[NFS-e] Falha ao emitir nota:', e.message));
      }
    }
  },

  async 'invoice.payment_failed'(inv) {
    const subId = invoiceSubId(inv);
    if (!subId) return;
    const user = await _seatBySub(subId, invoiceMeta(inv));
    if (!user) return;
    await query("UPDATE users SET subscription_status = 'past_due' WHERE id = ? AND stripe_subscription_id = ?", [user.id, subId]);
    console.warn(`[stripe] pagamento falhou — usuário ${user.id} (o Stripe reenvia a cobrança e avisa o cliente por e-mail)`);
  },

  async 'customer.subscription.updated'(sub) {
    const user = await _seatBySub(sub.id, sub.metadata);
    if (!user) return;
    if (user.stripe_subscription_id && user.stripe_subscription_id !== sub.id) return; // assinatura antiga

    if (['canceled', 'unpaid', 'incomplete_expired'].includes(sub.status)) return _expireSeat(user);
    if (sub.status === 'active') {
      const planCode = await planFromPrice(subItem(sub)?.price);
      if (!planCode) throw new Error(`Assinatura ${sub.id} com preço que não corresponde a nenhum plano do Foro.`);
      return _activateSeat(user, planCode, { subscriptionId: sub.id, periodEnd: subPeriodEnd(sub), cancelAtPeriodEnd: sub.cancel_at_period_end });
    }
    if (sub.status === 'past_due') {
      await query("UPDATE users SET subscription_status = 'past_due', cancel_at_period_end = ? WHERE id = ?", [sub.cancel_at_period_end ? 1 : 0, user.id]);
    }
    // 'incomplete' (1º pagamento pendente) e demais: nada a fazer — o plano só sobe no invoice.paid.
  },

  async 'customer.subscription.deleted'(sub) {
    const user = await _seatBySub(sub.id, sub.metadata);
    if (!user) return;
    if (user.stripe_subscription_id && user.stripe_subscription_id !== sub.id) return; // já reassinou com outra
    await _expireSeat(user);
  },
};

/**
 * Processa um evento já validado. Idempotente: cada evt_ roda uma vez (stripe_events). Se o processamento falhar,
 * a marca é removida e o erro sobe → o Stripe recebe 500 e reenvia o evento depois.
 */
async function handleEvent(event) {
  const [ins] = await query('INSERT IGNORE INTO stripe_events (id, type) VALUES (?, ?)', [event.id, event.type]);
  if (!ins.affectedRows) {
    const [[row]] = await query('SELECT processed_at, received_at FROM stripe_events WHERE id = ? LIMIT 1', [event.id]);
    const stale = row && !row.processed_at && Date.now() - new Date(row.received_at).getTime() > 5 * 60 * 1000;
    if (!stale) return { duplicate: true };
    await query('UPDATE stripe_events SET received_at = NOW() WHERE id = ?', [event.id]);
  }

  const handler = HANDLERS[event.type];
  try {
    if (handler) await handler(event.data.object);
    await query('UPDATE stripe_events SET processed_at = NOW() WHERE id = ?', [event.id]);
    return { handled: Boolean(handler) };
  } catch (err) {
    await query('DELETE FROM stripe_events WHERE id = ?', [event.id]).catch(() => {});
    throw err;
  }
}

module.exports = { configured, createCheckout, createPortal, constructEvent, handleEvent, resolvePriceId, planFromPrice };

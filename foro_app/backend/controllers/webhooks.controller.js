const crypto = require('crypto');
const stripeService = require('../services/stripe.service');
const nfseService = require('../services/nfse.service');

function safeEqual(a, b) {
  const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/**
 * Webhook do Stripe. A assinatura (Stripe-Signature) é validada sobre o corpo BRUTO (req.rawBody, guardado em server.js).
 * Só responde 200 depois de processar; se falhar devolve 500 e o Stripe reenvia (o evento só é "consumido" quando dá certo).
 */
async function stripe(req, res) {
  const event = stripeService.constructEvent(req.rawBody, req.headers['stripe-signature']); // 400 se assinatura inválida
  try {
    const result = await stripeService.handleEvent(event);
    res.status(200).json({ received: true, ...result });
  } catch (err) {
    console.error(`[Webhook Stripe] Falha ao processar ${event.type} (${event.id}):`, err.message);
    res.status(500).json({ error: 'Falha ao processar.' });
  }
}

/** Webhook do NFE.io — autenticado por token na URL (?token=NFEIO_WEBHOOK_TOKEN), pois o provedor não assina. */
async function nfeio(req, res) {
  const expected = process.env.NFEIO_WEBHOOK_TOKEN;
  if (!expected) return res.status(503).json({ error: 'Webhook não configurado.' });
  if (!safeEqual(req.query.token, expected)) return res.status(401).json({ error: 'Não autorizado.' });

  try {
    await nfseService.handleNfeioWebhook(req.body);
    res.status(200).json({ received: true });
  } catch (err) {
    console.error('[Webhook NFE.io] Erro ao processar evento:', err.message);
    res.status(500).json({ error: 'Falha ao processar.' });
  }
}

module.exports = { stripe, nfeio };

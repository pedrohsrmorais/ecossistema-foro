const crypto = require('crypto');
const paymentsService = require('../services/payments.service');
const nfseService = require('../services/nfse.service');

function safeEqual(a, b) {
  const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/**
 * Webhook do Asaas (legado — será substituído pelo Stripe). Exige o token configurado no painel do Asaas
 * (cabeçalho `asaas-access-token` == ASAAS_WEBHOOK_TOKEN). Sem o token configurado, rejeita tudo:
 * antes, qualquer pessoa podia forjar PAYMENT_CONFIRMED.
 * Só responde 200 depois de processar: se falhar, devolve 500 e o provedor reenvia.
 */
async function asaas(req, res) {
  const expected = process.env.ASAAS_WEBHOOK_TOKEN;
  if (!expected) return res.status(503).json({ error: 'Webhook não configurado.' });
  if (!safeEqual(req.headers['asaas-access-token'], expected)) return res.status(401).json({ error: 'Não autorizado.' });

  try {
    await paymentsService.handleAsaasWebhook(req.body);
    res.status(200).json({ received: true });
  } catch (err) {
    console.error('[Webhook Asaas] Erro ao processar evento:', err.message);
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

module.exports = { asaas, nfeio };

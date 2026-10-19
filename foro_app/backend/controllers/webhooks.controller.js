const paymentsService = require('../services/payments.service');
const nfseService = require('../services/nfse.service');

/**
 * Webhook do Asaas — recebe eventos de pagamento (PAYMENT_CONFIRMED, etc.)
 * e atualiza o status do pagamento + dispara emissão de NFS-e.
 *
 * Sem autenticação JWT — a validação é feita pelo IP ou token customizado do Asaas.
 */
async function asaas(req, res) {
  const event = req.body;

  // Responde rapidamente para o Asaas não retentar
  res.status(200).json({ received: true });

  try {
    await paymentsService.handleAsaasWebhook(event);
  } catch (err) {
    console.error('[Webhook Asaas] Erro ao processar evento:', err.message, event);
  }
}

/**
 * Webhook do NFE.io — notificações de status da nota (autorizada, rejeitada, etc.)
 */
async function nfeio(req, res) {
  const event = req.body;

  res.status(200).json({ received: true });

  try {
    await nfseService.handleNfeioWebhook(event);
  } catch (err) {
    console.error('[Webhook NFE.io] Erro ao processar evento:', err.message, event);
  }
}

module.exports = { asaas, nfeio };

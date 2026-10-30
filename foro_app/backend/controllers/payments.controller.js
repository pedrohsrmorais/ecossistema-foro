const { paging } = require('../utils/paging');
const paymentsService = require('../services/payments.service');
const stripeService = require('../services/stripe.service');

async function list(req, res) {
  const { page, limit } = paging(req.query.page, req.query.limit, { defaultLimit: 20 });
  res.json(await paymentsService.list(req.account.id, page, limit));
}

/** POST /payments/checkout { plan } → { url } (redirecionar o navegador para o Checkout do Stripe) */
async function checkout(req, res) {
  const { plan } = req.body;
  if (typeof plan !== 'string' || !plan) return res.status(422).json({ error: 'Informe o plano.' });
  res.json(await stripeService.createCheckout(req.account.id, req.user.email, plan));
}

/** POST /payments/portal → { url } (Portal do Cliente: trocar de plano, cartão, cancelar, faturas) */
async function portal(req, res) {
  res.json(await stripeService.createPortal(req.account.id));
}

async function getById(req, res) {
  res.json(await paymentsService.getById(req.params.id, req.account.id));
}

async function getNfse(req, res) {
  res.json(await paymentsService.getNfse(req.params.id, req.account.id));
}

module.exports = { list, checkout, portal, getById, getNfse };

const creditsService = require('../services/credits.service');
const paymentsService = require('../services/payments.service');

async function getBalance(req, res) {
  const balance_cents = await creditsService.getBalance(req.account.id);
  res.json({ balance_cents });
}

async function listPrices(req, res) {
  const prices = await creditsService.listServicePrices();
  res.json({ prices });
}

async function listTransactions(req, res) {
  const { page, limit } = req.query;
  const transactions = await creditsService.listTransactions(req.account.id, {
    page: page ? Number(page) : undefined,
    limit: limit ? Number(limit) : undefined,
  });
  res.json({ transactions });
}

/** POST /credits/purchase/pix — recarrega a carteira via PIX */
async function purchasePix(req, res) {
  const { amount, description } = req.body;
  const payment = await paymentsService.createCreditsPix(req.account.id, { amount, description });
  res.status(201).json(payment);
}

/** POST /credits/purchase/card — recarrega a carteira via cartão de crédito */
async function purchaseCard(req, res) {
  const { amount, description, card } = req.body;
  const payment = await paymentsService.createCreditsCard(req.account.id, { amount, description, card });
  res.status(201).json(payment);
}

module.exports = { getBalance, listPrices, listTransactions, purchasePix, purchaseCard };

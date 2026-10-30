const creditsService = require('../services/credits.service');

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

module.exports = { getBalance, listPrices, listTransactions };

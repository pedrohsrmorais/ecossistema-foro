const paymentsService = require('../services/payments.service');

async function list(req, res) {
  const { page = 1, limit = 20 } = req.query;
  const result = await paymentsService.list(req.account.id, +page, +limit);
  res.json(result);
}

async function createPix(req, res) {
  const { amount, description } = req.body;
  const payment = await paymentsService.createPix(req.account.id, { amount, description });
  res.status(201).json(payment);
}

async function createCard(req, res) {
  const { amount, description, card } = req.body;
  const payment = await paymentsService.createCard(req.account.id, { amount, description, card });
  res.status(201).json(payment);
}

async function createSubscription(req, res) {
  const { plan, billingType, card } = req.body;
  const subscription = await paymentsService.createSubscription(req.account.id, { plan, billingType, card });
  res.status(201).json(subscription);
}

async function getById(req, res) {
  const payment = await paymentsService.getById(req.params.id, req.account.id);
  res.json(payment);
}

async function getNfse(req, res) {
  const nfse = await paymentsService.getNfse(req.params.id, req.account.id);
  res.json(nfse);
}

module.exports = { list, createPix, createCard, createSubscription, getById, getNfse };

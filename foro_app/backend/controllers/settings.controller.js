const settingsService = require('../services/settings.service');

async function get(req, res) {
  const settings = await settingsService.get(req.account.id);
  res.json(settings);
}

async function update(req, res) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Acesso negado.' });
  const settings = await settingsService.update(req.account.id, req.body);
  res.json(settings);
}

async function getPlan(req, res) {
  const plan = await settingsService.getPlan(req.account.id);
  res.json(plan);
}

async function listPlans(req, res) {
  res.json(await settingsService.listPlans());
}

module.exports = { get, update, getPlan, listPlans };

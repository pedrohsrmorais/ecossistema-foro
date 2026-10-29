const eventsService = require('../services/events.service');

async function list(req, res) {
  const { from, to, lead_id, case_id, include_cancelled } = req.query;
  res.json(await eventsService.list(req.account.id, { from, to, lead_id, case_id, include_cancelled: include_cancelled === 'true' }));
}
async function create(req, res) { res.status(201).json(await eventsService.create(req.account.id, req.user.id, req.body)); }
async function update(req, res) { res.json(await eventsService.update(req.params.id, req.account.id, req.body)); }
async function remove(req, res) { await eventsService.remove(req.params.id, req.account.id); res.json({ message: 'Compromisso removido.' }); }

module.exports = { list, create, update, remove };

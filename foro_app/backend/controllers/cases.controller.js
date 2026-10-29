const casesService = require('../services/cases.service');

async function list(req, res) { res.json(await casesService.list(req.account.id, req.query)); }
async function getById(req, res) { res.json(await casesService.getById(req.params.id, req.account.id)); }
async function create(req, res) { res.status(201).json(await casesService.create(req.account.id, req.user.id, req.body)); }
async function update(req, res) { res.json(await casesService.update(req.params.id, req.account.id, req.body)); }
async function remove(req, res) { await casesService.remove(req.params.id, req.account.id); res.json({ message: 'Processo removido.' }); }
async function analyze(req, res) { res.json(casesService.analyzeNumber(req.query.number)); }
async function addUpdate(req, res) {
  res.status(201).json(await casesService.addUpdate(req.params.id, req.account.id, req.user.id, req.body));
}
async function deleteUpdate(req, res) {
  await casesService.deleteUpdate(req.params.id, req.params.updateId, req.account.id);
  res.json({ message: 'Andamento removido.' });
}

module.exports = { list, getById, create, update, remove, analyze, addUpdate, deleteUpdate };

const settingsService = require('../services/settings.service');

async function list(req, res) {
  const fields = await settingsService.listFields(req.account.id);
  res.json(fields);
}

async function create(req, res) {
  const field = await settingsService.createField(req.account.id, req.body);
  res.status(201).json(field);
}

async function update(req, res) {
  const field = await settingsService.updateField(req.params.id, req.account.id, req.body);
  res.json(field);
}

async function remove(req, res) {
  await settingsService.deleteField(req.params.id, req.account.id);
  res.json({ message: 'Campo removido.' });
}

async function reorder(req, res) {
  const { order } = req.body; // [{ id, display_order }]
  await settingsService.reorderFields(req.account.id, order);
  res.json({ message: 'Ordem atualizada.' });
}

module.exports = { list, create, update, remove, reorder };

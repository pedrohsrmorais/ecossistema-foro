const boards = require('../services/boards.service');

module.exports = {
  templates: async (_req, res) => res.json(Object.entries(boards.TEMPLATES).map(([id, t]) => ({ id, label: t.label, columns: t.cols.map(c => c[0]), groups: t.groups }))),
  list: async (req, res) => res.json(await boards.list(req.account.id)),
  get: async (req, res) => res.json(await boards.get(req.account.id, req.params.id)),
  create: async (req, res) => res.status(201).json(await boards.create(req.account.id, req.user.id, req.body || {})),
  update: async (req, res) => res.json(await boards.update(req.account.id, req.params.id, req.body || {})),
  remove: async (req, res) => { await boards.remove(req.account.id, req.params.id); res.json({ message: 'Quadro removido.' }); },

  addColumn: async (req, res) => res.status(201).json(await boards.addColumn(req.account.id, req.params.id, req.body || {})),
  reorderColumns: async (req, res) => { await boards.reorderColumns(req.account.id, req.params.id, req.body?.ids); res.json({ ok: true }); },
  updateColumn: async (req, res) => res.json(await boards.updateColumn(req.account.id, req.params.id, req.params.colId, req.body || {})),
  removeColumn: async (req, res) => { await boards.removeColumn(req.account.id, req.params.id, req.params.colId); res.json({ message: 'Coluna removida.' }); },

  addGroup: async (req, res) => res.status(201).json(await boards.addGroup(req.account.id, req.params.id, req.body || {})),
  updateGroup: async (req, res) => res.json(await boards.updateGroup(req.account.id, req.params.id, req.params.groupId, req.body || {})),
  removeGroup: async (req, res) => { await boards.removeGroup(req.account.id, req.params.id, req.params.groupId); res.json({ message: 'Grupo removido.' }); },

  addItem: async (req, res) => res.status(201).json(await boards.addItem(req.account.id, req.user.id, req.params.id, req.body || {})),
  updateItem: async (req, res) => res.json(await boards.updateItem(req.account.id, req.params.id, req.params.itemId, req.body || {})),
  removeItem: async (req, res) => { await boards.removeItem(req.account.id, req.params.id, req.params.itemId); res.json({ message: 'Item removido.' }); },
};

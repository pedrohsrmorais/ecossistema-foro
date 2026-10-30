const office = require('../services/office.service');
const permissions = require('../configs/permissions');

module.exports = {
  get: async (req, res) => res.json(await office.get(req.account.id, req.user)),
  create: async (req, res) => res.status(201).json(await office.create(req.user, req.body || {})),
  setGovernance: async (req, res) => res.json(await office.setGovernance(req.account.id, req.user, req.body?.member_defaults || {})),
  update: async (req, res) => res.json(await office.update(req.account.id, req.user, req.body || {})),
  regenerateCode: async (req, res) => res.json(await office.regenerateCode(req.account.id, req.user)),
  requestJoin: async (req, res) => res.status(201).json(await office.requestJoin(req.account.id, req.user, req.body?.code)),
  cancelRequest: async (req, res) => { await office.cancelRequest(req.user); res.json({ message: 'Pedido cancelado.' }); },
  listRequests: async (req, res) => res.json(await office.listRequests(req.account.id)),
  decide: async (req, res) => res.json(await office.decide(req.account.id, req.params.id, req.body?.approve === true, req.user.id)),
  activity: async (req, res) => res.json(await office.activityReport(req.account.id, req.query.days)),
  ping: async (req, res) => { await office.ping(req.user, req.account.id); res.json({ ok: true }); },
  permissionDefs: async (req, res) => res.json(permissions.DEFS),
};

module.exports.workspaces = {
  list: async (req, res) => res.json(await require('../services/workspaces.service').list(req.user)),
  switch: async (req, res) => res.json(await require('../services/workspaces.service').switchTo(req.user, req.body?.user_id)),
  leave: async (req, res) => res.json(await require('../services/workspaces.service').leave(req.user, req.params.id)),
};

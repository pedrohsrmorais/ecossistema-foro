const svc = require('../services/lead-import.service');
const { AppError } = require('../middlewares/error.middleware');

const send = (res, f) => {
  res.setHeader('Content-Type', f.type);
  res.setHeader('Content-Disposition', `attachment; filename="${f.filename}"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(f.buffer);
};
const fmt = (v) => (v === 'csv' ? 'csv' : 'xlsx');

module.exports = {
  models: (req, res) => res.json(svc.modelsInfo()),
  template: async (req, res) => send(res, await svc.template(req.params.key, fmt(req.query.format))),
  history: async (req, res) => res.json({ data: await svc.history(req.account.id, req.user) }),
  create: async (req, res) => {
    if (!Buffer.isBuffer(req.body) || !req.body.length) throw new AppError('Envie o arquivo da planilha (.xlsx ou .csv).', 422, 'NO_FILE');
    res.status(201).json(await svc.createBatch(req.account.id, req.user, { buffer: req.body, name: req.query.name }));
  },
  get: async (req, res) => res.json(await svc.get(req.account.id, req.params.id, req.user)),
  reparse: async (req, res) => res.json(await svc.reparse(req.account.id, req.params.id, req.user, req.body || {})),
  preview: async (req, res) => res.json(await svc.preview(req.account.id, req.user, req.params.id, req.body || {})),
  commit: async (req, res) => res.status(201).json(await svc.commit(req.account.id, req.user, req.params.id, req.body || {})),
  undo: async (req, res) => res.json(await svc.undo(req.account.id, req.user, req.params.id)),
  problems: async (req, res) => send(res, { buffer: await svc.problemsCsv(req.account.id, req.user, req.params.id), filename: 'linhas-com-problema.csv', type: 'text/csv; charset=utf-8' }),
  export: async (req, res) => {
    const { stage, search, assigned } = req.query;
    send(res, await svc.exportLeads(req.account.id, req.user, { stage, search, assigned, viewer: req.viewer, format: fmt(req.query.format) }));
  },
};

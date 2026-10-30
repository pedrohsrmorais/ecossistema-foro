const svc = require('../services/process-search.service');

const viewer = (req) => (req.user.role !== 'admin' && req.user.permissions?.view_scope === 'own' ? req.user.id : undefined);

function sendPdf(res, { buffer, stream, contentType, fileName, size, download }) {
  res.setHeader('Content-Type', contentType || 'application/pdf');
  res.setHeader('Content-Disposition', `${download ? 'attachment' : 'inline'}; filename="${String(fileName).replace(/[^\w.\-]/g, '_')}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, no-store');
  if (size != null) res.setHeader('Content-Length', size);
  if (buffer) return res.end(buffer);
  stream.on('error', () => res.destroy());
  stream.pipe(res);
}

module.exports = {
  search: async (req, res) => res.json(await svc.search(req.account.id, req.user.id, req.body?.q)),
  preview: async (req, res) => {
    const d = await svc.preview(req.account.id, req.user.id, req.query.ref);
    sendPdf(res, { buffer: d.buffer, contentType: d.contentType, fileName: d.fileName, size: d.buffer.length });
  },
  save: async (req, res) => {
    const r = await svc.save(req.account.id, req.user.id, req.body?.ref);
    res.status(r.already_saved ? 200 : 201).json(r);
  },
  list: async (req, res) => res.json(await svc.list(req.account.id, { q: req.query.q, page: req.query.page, limit: req.query.limit, viewerId: viewer(req) })),
  get: async (req, res) => res.json(await svc.get(req.account.id, req.params.id, viewer(req))),
  file: async (req, res) => {
    const f = await svc.file(req.account.id, req.params.id, viewer(req));
    sendPdf(res, { stream: f.stream, contentType: f.meta.content_type, fileName: f.meta.file_name, size: f.contentLength, download: req.query.download === '1' });
  },
  remove: async (req, res) => { await svc.remove(req.account.id, req.params.id, viewer(req)); res.json({ message: 'Processo removido da lista.' }); },
};

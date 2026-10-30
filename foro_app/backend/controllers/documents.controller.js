const docs = require('../services/documents.service');
const templates = require('../services/document-templates.service');

async function listTemplates(req, res) { res.json({ templates: templates.list(req.query.area_key), problems: templates.load().problems.length }); }
async function list(req, res) { res.json(await docs.list(req.account.id, req.query)); }
async function getById(req, res) { res.json(await docs.getById(req.params.id, req.account.id)); }
async function create(req, res) {
  const b = req.body || {};
  res.status(201).json(b.template_key ? await docs.create(req.account.id, req.user, b) : await docs.createBlank(req.account.id, req.user, b));
}
async function update(req, res) { res.json(await docs.update(req.params.id, req.account.id, req.user.id, req.body || {})); }
async function remove(req, res) { await docs.remove(req.params.id, req.account.id); res.json({ message: 'Documento removido.' }); }
async function draft(req, res) { res.json(await docs.draftWithAI(req.params.id, req.account.id, req.user, req.body || {})); }
async function getVersion(req, res) { res.json(await docs.getVersion(req.params.id, req.account.id, req.params.n)); }
async function restore(req, res) { res.json(await docs.restoreVersion(req.params.id, req.account.id, req.user.id, req.params.n)); }
async function exportDocx(req, res) {
  const { buffer, filename } = await docs.exportDocx(req.params.id, req.account.id);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"; filename*=UTF-8''${encodeURIComponent(filename)}`);
  res.send(buffer);
}
module.exports = { listTemplates, list, getById, create, update, remove, draft, getVersion, restore, exportDocx };

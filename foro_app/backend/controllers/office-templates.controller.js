const svc = require('../services/office-templates.service');
const permissions = require('../configs/permissions');

async function list(req, res) { res.json(await svc.list(req.account.id)); }
async function get(req, res) { res.json(await svc.get(req.params.id, req.account.id)); }
async function create(req, res) { res.status(201).json(await svc.create(req.account.id, req.user, req.body || {})); }
async function update(req, res) { res.json(await svc.update(req.params.id, req.account.id, req.user, req.body || {})); }
async function remove(req, res) { await svc.remove(req.params.id, req.account.id, req.user); res.json({ message: 'Modelo removido.' }); }
async function extract(req, res) { res.json(await svc.extractDocx(req.body?.data_base64)); }
async function convert(req, res) { res.json(await svc.convertWithAI(req.account.id, req.user, req.body || {})); }
async function check(req, res) { res.json(svc.checkBody(String(req.body?.body || ''), req.body?.area_key || 'geral')); }
async function permissionDefs(req, res) { res.json(permissions.DEFS); }

module.exports = { list, get, create, update, remove, extract, convert, check, permissionDefs };

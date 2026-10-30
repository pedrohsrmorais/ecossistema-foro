const casesService = require('../services/cases.service');

async function list(req, res) { res.json(await casesService.list(req.account.id, { ...req.query, viewer: req.viewer })); }
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

const parties = require('../services/case-parties.service');
const members = require('../services/case-members.service');
const stages = require('../services/case-stages.service');
const areas = require('../configs/legal-areas');

async function listParties(req, res) { res.json(await parties.list(req.params.id, req.account.id)); }
async function addParty(req, res) { res.status(201).json(await parties.add(req.params.id, req.account.id, req.body)); }
async function updateParty(req, res) { res.json(await parties.update(req.params.id, req.params.partyId, req.account.id, req.body)); }
async function removeParty(req, res) { await parties.remove(req.params.id, req.params.partyId, req.account.id); res.json({ message: 'Parte removida.' }); }
async function listMembers(req, res) { res.json(await members.list(req.params.id, req.account.id)); }
async function setMembers(req, res) { res.json(await members.set(req.params.id, req.account.id, req.body.members)); }
async function moveStage(req, res) { res.json(await casesService.update(req.params.id, req.account.id, { stage_id: req.body.stage_id })); }

async function areasMeta(req, res) {
  res.json(areas.AREA_KEYS.map(k => { const a = areas.get(k); return { key: k, label: a.label, short: a.short, description: a.description, fields: a.fields }; }));
}
async function stagesList(req, res) { res.json(await stages.list(req.account.id, req.query.area_key)); }
async function stagesCreate(req, res) { res.status(201).json(await stages.create(req.account.id, req.body)); }
async function stagesUpdate(req, res) { res.json(await stages.update(req.params.id, req.account.id, req.body)); }
async function stagesReorder(req, res) { res.json(await stages.reorder(req.account.id, req.body.area_key, req.body.ids)); }
async function stagesRemove(req, res) { await stages.remove(req.params.id, req.account.id, req.body?.move_to || req.query.move_to); res.json({ message: 'Etapa removida.' }); }
async function stagesReset(req, res) { res.json(await stages.resetArea(req.account.id, req.body.area_key)); }

module.exports = { listParties, addParty, updateParty, removeParty, listMembers, setMembers, moveStage, areasMeta,
  stagesList, stagesCreate, stagesUpdate, stagesReorder, stagesRemove, stagesReset, list, getById, create, update, remove, analyze, addUpdate, deleteUpdate };

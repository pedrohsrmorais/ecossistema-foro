const leadsService = require('../services/leads.service');

async function list(req, res) {
  const { stage, search, assigned, page = 1, limit = 50 } = req.query;
  const result = await leadsService.list(req.account.id, { stage, search, assigned, page: +page, limit: +limit });
  res.json(result);
}

async function create(req, res) {
  const lead = await leadsService.create(req.account.id, req.user.id, req.body, 'ui');
  res.status(201).json(lead);
}

async function getById(req, res) {
  const lead = await leadsService.getById(req.params.id, req.account.id);
  res.json(lead);
}

async function update(req, res) {
  const lead = await leadsService.update(req.params.id, req.account.id, req.user.id, req.body, 'ui');
  res.json(lead);
}

async function moveStage(req, res) {
  const { stage } = req.body;
  const lead = await leadsService.moveStage(req.params.id, req.account.id, req.user.id, stage, 'ui');
  res.json(lead);
}

async function archive(req, res) {
  const lead = await leadsService.archive(req.params.id, req.account.id, req.user.id, 'ui');
  res.json(lead);
}

async function softDelete(req, res) {
  await leadsService.softDelete(req.params.id, req.account.id, req.user.id);
  res.json({ message: 'Lead removido.' });
}

async function getFunnelSummary(req, res) {
  const summary = await leadsService.getFunnelSummary(req.account.id);
  res.json(summary);
}

// ─── Notas ────────────────────────────────────────────────────────────────────
async function listNotes(req, res) {
  const notes = await leadsService.listNotes(req.params.id, req.account.id);
  res.json(notes);
}

async function addNote(req, res) {
  const note = await leadsService.addNote(req.params.id, req.account.id, req.user.id, req.body.text, 'ui');
  res.status(201).json(note);
}

async function deleteNote(req, res) {
  await leadsService.deleteNote(req.params.noteId, req.account.id, req.user.id);
  res.json({ message: 'Nota removida.' });
}

// ─── Tarefas ──────────────────────────────────────────────────────────────────
async function listTasks(req, res) {
  const tasks = await leadsService.listTasksByLead(req.params.id, req.account.id);
  res.json(tasks);
}

async function createTask(req, res) {
  const task = await leadsService.createTask(req.params.id, req.account.id, req.user.id, req.body);
  res.status(201).json(task);
}

async function completeTask(req, res) {
  const task = await leadsService.completeTask(req.params.taskId, req.account.id, req.user.id);
  res.json(task);
}

async function listAllTasks(req, res) {
  const { pending_only, page = 1, limit = 50 } = req.query;
  const tasks = await leadsService.listAllTasks(req.account.id, req.user.id, {
    pendingOnly: pending_only === 'true',
    page: +page,
    limit: +limit,
  });
  res.json(tasks);
}

module.exports = {
  list, create, getById, update, moveStage, archive, softDelete, getFunnelSummary,
  listNotes, addNote, deleteNote,
  listTasks, createTask, completeTask, listAllTasks,
};

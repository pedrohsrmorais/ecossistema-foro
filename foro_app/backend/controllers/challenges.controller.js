const challengesService = require('../services/challenges.service');

// ─── Tenant (módulo "desafios_semanais") ───────────────────────────────────

async function listActive(req, res) {
  const challenges = await challengesService.listActive(req.user.id);
  res.json({ challenges });
}

async function complete(req, res) {
  const completion = await challengesService.complete(req.params.id, req.user.id, req.account.id);
  res.status(201).json({ completion });
}

// ─── CMS (admin da plataforma) ─────────────────────────────────────────────

async function adminList(req, res) {
  const challenges = await challengesService.adminList();
  res.json({ challenges });
}

async function create(req, res) {
  const challenge = await challengesService.create(req.body);
  res.status(201).json({ challenge });
}

async function update(req, res) {
  const challenge = await challengesService.update(req.params.id, req.body);
  res.json({ challenge });
}

async function remove(req, res) {
  await challengesService.remove(req.params.id);
  res.status(204).send();
}

module.exports = { listActive, complete, adminList, create, update, remove };

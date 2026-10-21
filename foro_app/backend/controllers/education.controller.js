const educationService = require('../services/education.service');

// ─── Tenant (módulo "educacao") ────────────────────────────────────────────

async function listTrilhas(req, res) {
  const trilhas = await educationService.listTrilhas(req.user.id);
  res.json({ trilhas });
}

async function getTrilha(req, res) {
  const trilha = await educationService.getTrilha(req.params.id, req.user.id);
  res.json({ trilha });
}

async function updateProgress(req, res) {
  const { last_position_seconds, completed } = req.body;
  const progress = await educationService.updateProgress(req.user.id, req.params.aulaId, { last_position_seconds, completed });
  res.json({ progress });
}

// ─── CMS (admin da plataforma) ─────────────────────────────────────────────

async function adminListTrilhas(req, res) {
  const trilhas = await educationService.adminListTrilhas();
  res.json({ trilhas });
}

async function adminGetTrilha(req, res) {
  const trilha = await educationService.adminGetTrilha(req.params.id);
  res.json({ trilha });
}

async function createTrilha(req, res) {
  const trilha = await educationService.createTrilha(req.body);
  res.status(201).json({ trilha });
}

async function updateTrilha(req, res) {
  const trilha = await educationService.updateTrilha(req.params.id, req.body);
  res.json({ trilha });
}

async function deleteTrilha(req, res) {
  await educationService.deleteTrilha(req.params.id);
  res.status(204).send();
}

async function createAula(req, res) {
  const aula = await educationService.createAula(req.params.id, req.body);
  res.status(201).json({ aula });
}

async function updateAula(req, res) {
  const aula = await educationService.updateAula(req.params.aulaId, req.body);
  res.json({ aula });
}

async function deleteAula(req, res) {
  await educationService.deleteAula(req.params.aulaId);
  res.status(204).send();
}

module.exports = {
  listTrilhas, getTrilha, updateProgress,
  adminListTrilhas, adminGetTrilha, createTrilha, updateTrilha, deleteTrilha, createAula, updateAula, deleteAula,
};

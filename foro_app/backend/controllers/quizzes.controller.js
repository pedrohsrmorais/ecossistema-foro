const quizzesService = require('../services/quizzes.service');

// ─── Tenant (módulo "provas_conceito") ─────────────────────────────────────

async function listAvailable(req, res) {
  const quizzes = await quizzesService.listAvailableForUser(req.user.id);
  res.json({ quizzes });
}

async function getQuizForAula(req, res) {
  const quiz = await quizzesService.getQuizForAula(req.params.aulaId, req.user.id);
  res.json({ quiz });
}

async function submitAttempt(req, res) {
  const { answers } = req.body;
  const attempt = await quizzesService.submitAttempt(req.params.id, req.user.id, req.account.id, answers);
  res.status(201).json({ attempt });
}

// ─── CMS (admin da plataforma) ─────────────────────────────────────────────

async function adminGetQuizForAula(req, res) {
  const quiz = await quizzesService.adminGetQuizForAula(req.params.aulaId);
  res.json({ quiz });
}

async function createQuiz(req, res) {
  const quiz = await quizzesService.createQuiz(req.params.aulaId, req.body);
  res.status(201).json({ quiz });
}

async function updateQuiz(req, res) {
  const quiz = await quizzesService.updateQuiz(req.params.id, req.body);
  res.json({ quiz });
}

async function deleteQuiz(req, res) {
  await quizzesService.deleteQuiz(req.params.id);
  res.status(204).send();
}

async function addQuestion(req, res) {
  const question = await quizzesService.addQuestion(req.params.id, req.body);
  res.status(201).json({ question });
}

async function updateQuestion(req, res) {
  const question = await quizzesService.updateQuestion(req.params.questionId, req.body);
  res.json({ question });
}

async function deleteQuestion(req, res) {
  await quizzesService.deleteQuestion(req.params.questionId);
  res.status(204).send();
}

module.exports = {
  listAvailable, getQuizForAula, submitAttempt,
  adminGetQuizForAula, createQuiz, updateQuiz, deleteQuiz,
  addQuestion, updateQuestion, deleteQuestion,
};

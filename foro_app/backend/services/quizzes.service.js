/**
 * quizzes.service.js
 *
 * Módulo "Provas de conceito" — um quiz curto de múltipla escolha vinculado
 * a UMA aula de Educação, pra reforçar o que foi visto no vídeo. Conteúdo é
 * da plataforma (criado no CMS do painel admin), igual Educação — só o
 * histórico de tentativas (quiz_attempts) é por usuário.
 *
 * Pontuação: concedida só na PRIMEIRA vez que o usuário atinge
 * passing_score_pct num quiz — tentativas seguintes ficam no histórico mas
 * não pontuam de novo (evita "farm" de pontos repetindo o mesmo quiz).
 */
const { v4: uuidv4 } = require('uuid');
const { query } = require('../configs/db.config');
const { AppError } = require('../middlewares/error.middleware');
const communityService = require('./community.service');

// ─── Tenant ────────────────────────────────────────────────────────────────

/** Todas as provas de conceito disponíveis (aulas publicadas com quiz), com o melhor resultado do usuário — pra tela de visão geral. */
async function listAvailableForUser(userId) {
  const [rows] = await query(
    `SELECT q.id AS quiz_id, q.title, q.points_awarded, q.passing_score_pct,
            a.id AS aula_id, a.title AS aula_title,
            t.id AS trilha_id, t.title AS trilha_title,
            ba.score_pct AS best_score_pct, ba.passed AS best_passed
     FROM quizzes q
     JOIN aulas a ON a.id = q.aula_id AND a.published = 1
     JOIN trilhas t ON t.id = a.trilha_id AND t.published = 1
     LEFT JOIN (
       SELECT quiz_id, MAX(passed) AS passed, MAX(score_pct) AS score_pct
       FROM quiz_attempts WHERE user_id = ? GROUP BY quiz_id
     ) ba ON ba.quiz_id = q.id
     ORDER BY t.display_order, a.display_order`,
    [userId]
  );
  return rows.map(r => ({ ...r, best_passed: Boolean(r.best_passed) }));
}

/** Quiz de uma aula (se existir), sem o gabarito — pra tela de "fazer a prova". */
async function getQuizForAula(aulaId, userId) {
  const [quizzes] = await query('SELECT * FROM quizzes WHERE aula_id = ? LIMIT 1', [aulaId]);
  if (!quizzes.length) return null;
  const quiz = quizzes[0];

  const [questions] = await query(
    'SELECT id, prompt, options, display_order FROM quiz_questions WHERE quiz_id = ? ORDER BY display_order',
    [quiz.id]
  );

  const [bestAttempt] = await query(
    `SELECT score_pct, passed, points_awarded, created_at FROM quiz_attempts
     WHERE quiz_id = ? AND user_id = ? ORDER BY passed DESC, score_pct DESC LIMIT 1`,
    [quiz.id, userId]
  );

  return {
    ...quiz,
    questions: questions.map(q => ({ ...q, options: typeof q.options === 'string' ? JSON.parse(q.options) : q.options })),
    best_attempt: bestAttempt[0] || null,
  };
}

/** Submete respostas, calcula nota e concede pontos se for a primeira vez que passa. */
async function submitAttempt(quizId, userId, accountId, answers) {
  const [quizzes] = await query('SELECT * FROM quizzes WHERE id = ? LIMIT 1', [quizId]);
  if (!quizzes.length) throw new AppError('Prova de conceito não encontrada.', 404);
  const quiz = quizzes[0];

  const [questions] = await query('SELECT id, correct_option_id FROM quiz_questions WHERE quiz_id = ?', [quizId]);
  if (!questions.length) throw new AppError('Essa prova de conceito ainda não tem perguntas.', 400);

  const answersMap = new Map((answers || []).map(a => [a.question_id, a.option_id]));
  const correctCount = questions.filter(q => answersMap.get(q.id) === q.correct_option_id).length;
  const scorePct = Math.round((correctCount / questions.length) * 100);
  const passed = scorePct >= quiz.passing_score_pct;

  let pointsAwarded = 0;
  if (passed) {
    const [alreadyPassed] = await query(
      'SELECT id FROM quiz_attempts WHERE quiz_id = ? AND user_id = ? AND passed = 1 LIMIT 1',
      [quizId, userId]
    );
    if (!alreadyPassed.length) pointsAwarded = quiz.points_awarded;
  }

  const attemptId = uuidv4();
  await query(
    `INSERT INTO quiz_attempts (id, quiz_id, user_id, account_id, score_pct, passed, points_awarded)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [attemptId, quizId, userId, accountId, scorePct, passed ? 1 : 0, pointsAwarded]
  );

  // Post automático de conquista só na primeira vez que pontua de verdade —
  // tentativa repetida (mesmo passando de novo) não gera post novo.
  if (pointsAwarded > 0) {
    await communityService.createAchievementPost(
      accountId, userId,
      `Concluiu a prova de conceito "${quiz.title}" e ganhou ${pointsAwarded} pontos.`,
      { quizAttemptId: attemptId }
    );
  }

  return { id: attemptId, score_pct: scorePct, passed, points_awarded: pointsAwarded, total_questions: questions.length, correct_count: correctCount };
}

// ─── CMS (admin da plataforma) ─────────────────────────────────────────────

function _parseQuestion(q) {
  return { ...q, options: typeof q.options === 'string' ? JSON.parse(q.options) : q.options };
}

async function adminGetQuizForAula(aulaId) {
  const [quizzes] = await query('SELECT * FROM quizzes WHERE aula_id = ? LIMIT 1', [aulaId]);
  if (!quizzes.length) return null;
  const quiz = quizzes[0];
  const [questions] = await query('SELECT * FROM quiz_questions WHERE quiz_id = ? ORDER BY display_order', [quiz.id]);
  return { ...quiz, questions: questions.map(_parseQuestion) };
}

async function createQuiz(aulaId, { title, passing_score_pct, points_awarded }) {
  const [aulas] = await query('SELECT id FROM aulas WHERE id = ? LIMIT 1', [aulaId]);
  if (!aulas.length) throw new AppError('Aula não encontrada.', 404);
  const [existing] = await query('SELECT id FROM quizzes WHERE aula_id = ? LIMIT 1', [aulaId]);
  if (existing.length) throw new AppError('Essa aula já tem uma prova de conceito.', 409);
  if (!title || !title.trim()) throw new AppError('Título é obrigatório.', 400);

  const id = uuidv4();
  await query(
    `INSERT INTO quizzes (id, aula_id, title, passing_score_pct, points_awarded) VALUES (?, ?, ?, ?, ?)`,
    [id, aulaId, title, passing_score_pct || 70, points_awarded || 10]
  );
  return adminGetQuizForAula(aulaId);
}

async function updateQuiz(id, { title, passing_score_pct, points_awarded }) {
  const [existing] = await query('SELECT aula_id FROM quizzes WHERE id = ? LIMIT 1', [id]);
  if (!existing.length) throw new AppError('Prova de conceito não encontrada.', 404);

  await query(
    `UPDATE quizzes SET
       title = COALESCE(?, title),
       passing_score_pct = COALESCE(?, passing_score_pct),
       points_awarded = COALESCE(?, points_awarded)
     WHERE id = ?`,
    [title || null, passing_score_pct, points_awarded, id]
  );
  return adminGetQuizForAula(existing[0].aula_id);
}

async function deleteQuiz(id) {
  await query('DELETE FROM quizzes WHERE id = ?', [id]); // cascade remove perguntas e tentativas
}

async function addQuestion(quizId, { prompt, options, correct_option_id, display_order }) {
  const [quizzes] = await query('SELECT id FROM quizzes WHERE id = ? LIMIT 1', [quizId]);
  if (!quizzes.length) throw new AppError('Prova de conceito não encontrada.', 404);
  if (!prompt || !prompt.trim()) throw new AppError('Pergunta é obrigatória.', 400);
  if (!Array.isArray(options) || options.length < 2) throw new AppError('A pergunta precisa de pelo menos 2 alternativas.', 400);
  if (!correct_option_id || !options.some(o => o.id === correct_option_id)) {
    throw new AppError('Selecione qual alternativa é a correta.', 400);
  }

  const id = uuidv4();
  await query(
    `INSERT INTO quiz_questions (id, quiz_id, prompt, options, correct_option_id, display_order)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, quizId, prompt, JSON.stringify(options), correct_option_id, display_order || 0]
  );
  const [rows] = await query('SELECT * FROM quiz_questions WHERE id = ? LIMIT 1', [id]);
  return _parseQuestion(rows[0]);
}

async function updateQuestion(id, { prompt, options, correct_option_id, display_order }) {
  const [existing] = await query('SELECT id FROM quiz_questions WHERE id = ? LIMIT 1', [id]);
  if (!existing.length) throw new AppError('Pergunta não encontrada.', 404);

  await query(
    `UPDATE quiz_questions SET
       prompt = COALESCE(?, prompt),
       options = COALESCE(?, options),
       correct_option_id = COALESCE(?, correct_option_id),
       display_order = COALESCE(?, display_order)
     WHERE id = ?`,
    [prompt || null, options ? JSON.stringify(options) : null, correct_option_id || null, display_order, id]
  );
  const [rows] = await query('SELECT * FROM quiz_questions WHERE id = ? LIMIT 1', [id]);
  return _parseQuestion(rows[0]);
}

async function deleteQuestion(id) {
  await query('DELETE FROM quiz_questions WHERE id = ?', [id]);
}

module.exports = {
  listAvailableForUser, getQuizForAula, submitAttempt,
  adminGetQuizForAula, createQuiz, updateQuiz, deleteQuiz,
  addQuestion, updateQuestion, deleteQuestion,
};

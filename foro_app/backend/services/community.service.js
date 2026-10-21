/**
 * community.service.js
 *
 * Módulo "Comunidade" — duas coisas DELIBERADAMENTE separadas:
 *
 * 1. Feed de conquistas (`community_posts`): isolado por conta. Escritórios
 *    de advocacia costumam ser concorrentes entre si, então o feed NUNCA
 *    mostra posts de outra conta — ver init.sql, seção 12.
 * 2. Ranking de pontos (`leaderboard`): esse SIM é cross-tenant, por decisão
 *    explícita do dono da plataforma — soma os pontos de provas de conceito
 *    (quiz_attempts) e desafios semanais (weekly_challenge_completions) por
 *    conta e ordena. Não existe tabela própria pra pontos: é só agregação
 *    das duas tabelas de origem, calculada na hora.
 */
const { v4: uuidv4 } = require('uuid');
const { query } = require('../configs/db.config');
const { AppError } = require('../middlewares/error.middleware');

// ─── Feed (isolado por conta) ───────────────────────────────────────────────

async function listFeed(accountId, limit = 30) {
  const [rows] = await query(
    `SELECT p.id, p.content, p.kind, p.created_at, p.user_id, u.name AS user_name
     FROM community_posts p
     JOIN users u ON u.id = p.user_id
     WHERE p.account_id = ?
     ORDER BY p.created_at DESC
     LIMIT ?`,
    [accountId, limit]
  );
  return rows;
}

async function createPost(accountId, userId, content) {
  if (!content || !content.trim()) throw new AppError('Escreva algo antes de publicar.', 400);
  if (content.length > 2000) throw new AppError('Mensagem muito longa (máximo 2000 caracteres).', 400);

  const id = uuidv4();
  await query(
    `INSERT INTO community_posts (id, account_id, user_id, content, kind) VALUES (?, ?, ?, ?, 'mensagem')`,
    [id, accountId, userId, content.trim()]
  );
  const [rows] = await query(
    `SELECT p.id, p.content, p.kind, p.created_at, p.user_id, u.name AS user_name
     FROM community_posts p JOIN users u ON u.id = p.user_id WHERE p.id = ? LIMIT 1`,
    [id]
  );
  return rows[0];
}

/** Gera automaticamente um post de "conquista" — chamado por outros serviços
 *  (quizzes/challenges) quando o usuário passa numa prova ou conclui um
 *  desafio. Nunca lançado por chamada direta do usuário. */
async function createAchievementPost(accountId, userId, content, { quizAttemptId, challengeCompletionId } = {}) {
  const id = uuidv4();
  await query(
    `INSERT INTO community_posts (id, account_id, user_id, content, kind, related_quiz_attempt_id, related_challenge_completion_id)
     VALUES (?, ?, ?, ?, 'conquista', ?, ?)`,
    [id, accountId, userId, content, quizAttemptId || null, challengeCompletionId || null]
  );
  return id;
}

async function deletePost(postId, accountId, userId, isAccountAdmin) {
  const [rows] = await query('SELECT user_id, account_id FROM community_posts WHERE id = ? LIMIT 1', [postId]);
  if (!rows.length) throw new AppError('Post não encontrado.', 404);
  if (rows[0].account_id !== accountId) throw new AppError('Post não encontrado.', 404);
  if (rows[0].user_id !== userId && !isAccountAdmin) throw new AppError('Você só pode apagar suas próprias publicações.', 403);

  await query('DELETE FROM community_posts WHERE id = ?', [postId]);
}

// ─── Ranking de pontos (cross-tenant, por opção do dono da plataforma) ─────

/** Top N contas por pontos totais + a posição da própria conta (mesmo fora do top N). */
async function leaderboard(viewerAccountId, limit = 10) {
  const [rows] = await query(
    `SELECT account_id, account_name, total_points, pos FROM (
       SELECT a.id AS account_id, a.name AS account_name,
              COALESCE(SUM(pts.points), 0) AS total_points,
              RANK() OVER (ORDER BY COALESCE(SUM(pts.points), 0) DESC) AS pos
       FROM accounts a
       LEFT JOIN (
         SELECT account_id, SUM(points_awarded) AS points FROM quiz_attempts GROUP BY account_id
         UNION ALL
         SELECT account_id, SUM(points_awarded) AS points FROM weekly_challenge_completions GROUP BY account_id
       ) pts ON pts.account_id = a.id
       GROUP BY a.id, a.name
     ) ranked
     WHERE pos <= ? OR account_id = ?
     ORDER BY pos`,
    [limit, viewerAccountId]
  );
  return rows;
}

// ─── Moderação (admin da plataforma) ───────────────────────────────────────

async function adminListRecentPosts(limit = 100) {
  const [rows] = await query(
    `SELECT p.id, p.content, p.kind, p.created_at, u.name AS user_name, a.name AS account_name, p.account_id
     FROM community_posts p
     JOIN users u ON u.id = p.user_id
     JOIN accounts a ON a.id = p.account_id
     ORDER BY p.created_at DESC
     LIMIT ?`,
    [limit]
  );
  return rows;
}

async function adminDeletePost(postId) {
  await query('DELETE FROM community_posts WHERE id = ?', [postId]);
}

module.exports = {
  listFeed, createPost, createAchievementPost, deletePost, leaderboard,
  adminListRecentPosts, adminDeletePost,
};

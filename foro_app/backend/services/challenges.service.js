/**
 * challenges.service.js
 *
 * Módulo "Desafios semanais" — desafios publicados pela equipe intellsn
 * (ex: "leia este artigo sobre automação"), com janela de vigência
 * (starts_at/ends_at). Conclusão é AUTO-DECLARADA pelo usuário — ele clica
 * "concluí" e pronto, sem verificação nem evidência anexada. Decisão
 * deliberada pra manter o MVP simples; ver diretrizes-frontend.md.
 *
 * Pontos são concedidos uma única vez por usuário por desafio (UNIQUE KEY em
 * weekly_challenge_completions garante isso a nível de banco).
 */
const { v4: uuidv4 } = require('uuid');
const { query } = require('../configs/db.config');
const { AppError } = require('../middlewares/error.middleware');
const communityService = require('./community.service');

// ─── Tenant ────────────────────────────────────────────────────────────────

/** Desafios publicados (mais recentes primeiro), com status de conclusão do usuário. */
async function listActive(userId) {
  const [rows] = await query(
    `SELECT c.id, c.title, c.description, c.attachment_url, c.points_awarded, c.starts_at, c.ends_at,
            (CURDATE() BETWEEN c.starts_at AND c.ends_at) AS is_current,
            wcc.id IS NOT NULL AS completed
     FROM weekly_challenges c
     LEFT JOIN weekly_challenge_completions wcc ON wcc.challenge_id = c.id AND wcc.user_id = ?
     WHERE c.published = 1
     ORDER BY c.starts_at DESC
     LIMIT 20`,
    [userId]
  );
  return rows.map(r => ({ ...r, is_current: Boolean(r.is_current), completed: Boolean(r.completed) }));
}

/** Marca um desafio como concluído pelo usuário (auto-declarado, idempotente). */
async function complete(challengeId, userId, accountId) {
  const [challenges] = await query('SELECT * FROM weekly_challenges WHERE id = ? AND published = 1 LIMIT 1', [challengeId]);
  if (!challenges.length) throw new AppError('Desafio não encontrado.', 404);

  const [existing] = await query(
    'SELECT * FROM weekly_challenge_completions WHERE challenge_id = ? AND user_id = ? LIMIT 1',
    [challengeId, userId]
  );
  if (existing.length) return { ...existing[0], already_completed: true };

  const id = uuidv4();
  await query(
    `INSERT INTO weekly_challenge_completions (id, challenge_id, user_id, account_id, points_awarded)
     VALUES (?, ?, ?, ?, ?)`,
    [id, challengeId, userId, accountId, challenges[0].points_awarded]
  );

  await communityService.createAchievementPost(
    accountId, userId,
    `Concluiu o desafio "${challenges[0].title}" e ganhou ${challenges[0].points_awarded} pontos.`,
    { challengeCompletionId: id }
  );

  return { id, challenge_id: challengeId, user_id: userId, points_awarded: challenges[0].points_awarded, already_completed: false };
}

// ─── CMS (admin da plataforma) ─────────────────────────────────────────────

async function adminList() {
  const [rows] = await query(
    `SELECT c.*, COUNT(wcc.id) AS total_conclusoes
     FROM weekly_challenges c LEFT JOIN weekly_challenge_completions wcc ON wcc.challenge_id = c.id
     GROUP BY c.id ORDER BY c.starts_at DESC`
  );
  return rows;
}

async function adminGet(id) {
  const [rows] = await query('SELECT * FROM weekly_challenges WHERE id = ? LIMIT 1', [id]);
  if (!rows.length) throw new AppError('Desafio não encontrado.', 404);
  return rows[0];
}

async function create({ title, description, attachment_url, points_awarded, starts_at, ends_at, published }) {
  if (!title || !title.trim()) throw new AppError('Título é obrigatório.', 400);
  if (!description || !description.trim()) throw new AppError('Descrição é obrigatória.', 400);
  if (!starts_at || !ends_at) throw new AppError('Informe o início e o fim da vigência.', 400);

  const id = uuidv4();
  await query(
    `INSERT INTO weekly_challenges (id, title, description, attachment_url, points_awarded, starts_at, ends_at, published)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, title, description, attachment_url || null, points_awarded || 10, starts_at, ends_at, published ? 1 : 0]
  );
  return adminGet(id);
}

async function update(id, { title, description, attachment_url, points_awarded, starts_at, ends_at, published }) {
  await adminGet(id); // 404 se não existir
  await query(
    `UPDATE weekly_challenges SET
       title = COALESCE(?, title),
       description = COALESCE(?, description),
       attachment_url = ?,
       points_awarded = COALESCE(?, points_awarded),
       starts_at = COALESCE(?, starts_at),
       ends_at = COALESCE(?, ends_at),
       published = COALESCE(?, published)
     WHERE id = ?`,
    [title || null, description || null, attachment_url ?? null, points_awarded, starts_at || null, ends_at || null, published, id]
  );
  return adminGet(id);
}

async function remove(id) {
  await query('DELETE FROM weekly_challenges WHERE id = ?', [id]);
}

module.exports = { listActive, complete, adminList, adminGet, create, update, remove };

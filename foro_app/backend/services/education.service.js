/**
 * education.service.js
 *
 * Módulo "Educação" — trilhas e aulas em vídeo sobre tecnologia/automação/IA
 * para escritórios de advocacia. Conteúdo NÃO é por conta (ver init.sql,
 * seção 9): é criado pela equipe da intellsn e visível para todo usuário
 * cuja conta tenha o módulo "educacao" ativo (gate feito na rota, via
 * middlewares/modules.middleware.js::requireModule('educacao')).
 *
 * O progresso (aula_progresso), esse sim é por usuário individual — cada
 * advogado/assistente tem o próprio progresso, mesmo dentro da mesma conta.
 */
const { v4: uuidv4 } = require('uuid');
const { query } = require('../configs/db.config');
const { AppError } = require('../middlewares/error.middleware');

// ─── Leitura (tenant) ──────────────────────────────────────────────────────

/** Lista trilhas publicadas, com contagem de aulas e progresso do usuário. */
async function listTrilhas(userId) {
  const [rows] = await query(
    `SELECT t.id, t.title, t.description, t.cover_image_url, t.display_order,
            COUNT(a.id) AS total_aulas,
            COUNT(ap.id) AS aulas_concluidas
     FROM trilhas t
     LEFT JOIN aulas a ON a.trilha_id = t.id AND a.published = 1
     LEFT JOIN aula_progresso ap ON ap.aula_id = a.id AND ap.user_id = ? AND ap.completed_at IS NOT NULL
     WHERE t.published = 1
     GROUP BY t.id
     ORDER BY t.display_order`,
    [userId]
  );
  return rows;
}

/** Detalhe de uma trilha publicada + aulas (com progresso individual do usuário). */
async function getTrilha(trilhaId, userId) {
  const [trilhas] = await query('SELECT * FROM trilhas WHERE id = ? AND published = 1 LIMIT 1', [trilhaId]);
  if (!trilhas.length) throw new AppError('Trilha não encontrada.', 404);

  const [aulas] = await query(
    `SELECT a.id, a.title, a.description, a.video_provider, a.video_id, a.duration_seconds, a.display_order,
            ap.last_position_seconds, ap.completed_at
     FROM aulas a
     LEFT JOIN aula_progresso ap ON ap.aula_id = a.id AND ap.user_id = ?
     WHERE a.trilha_id = ? AND a.published = 1
     ORDER BY a.display_order`,
    [userId, trilhaId]
  );

  return { ...trilhas[0], aulas };
}

/** Registra posição/conclusão de uma aula para o usuário logado (upsert). */
async function updateProgress(userId, aulaId, { last_position_seconds, completed }) {
  const [aulas] = await query('SELECT id FROM aulas WHERE id = ? AND published = 1 LIMIT 1', [aulaId]);
  if (!aulas.length) throw new AppError('Aula não encontrada.', 404);

  await query(
    `INSERT INTO aula_progresso (id, user_id, aula_id, last_position_seconds, completed_at)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       last_position_seconds = VALUES(last_position_seconds),
       completed_at = CASE WHEN VALUES(completed_at) IS NOT NULL THEN VALUES(completed_at) ELSE aula_progresso.completed_at END`,
    [uuidv4(), userId, aulaId, last_position_seconds || 0, completed ? new Date() : null]
  );

  const [rows] = await query('SELECT * FROM aula_progresso WHERE user_id = ? AND aula_id = ? LIMIT 1', [userId, aulaId]);
  return rows[0];
}

// ─── CMS (admin da plataforma) ────────────────────────────────────────────

async function adminListTrilhas() {
  const [rows] = await query(
    `SELECT t.*, COUNT(a.id) AS total_aulas
     FROM trilhas t LEFT JOIN aulas a ON a.trilha_id = t.id
     GROUP BY t.id ORDER BY t.display_order`
  );
  return rows;
}

async function adminGetTrilha(trilhaId) {
  const [trilhas] = await query('SELECT * FROM trilhas WHERE id = ? LIMIT 1', [trilhaId]);
  if (!trilhas.length) throw new AppError('Trilha não encontrada.', 404);

  const [aulas] = await query('SELECT * FROM aulas WHERE trilha_id = ? ORDER BY display_order', [trilhaId]);
  return { ...trilhas[0], aulas };
}

async function createTrilha({ title, description, cover_image_url, display_order, published }) {
  if (!title || !title.trim()) throw new AppError('Título é obrigatório.', 400);
  const id = uuidv4();
  await query(
    `INSERT INTO trilhas (id, title, description, cover_image_url, display_order, published)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, title, description || null, cover_image_url || null, display_order || 0, published ? 1 : 0]
  );
  return adminGetTrilha(id);
}

async function updateTrilha(id, { title, description, cover_image_url, display_order, published }) {
  const [existing] = await query('SELECT id FROM trilhas WHERE id = ? LIMIT 1', [id]);
  if (!existing.length) throw new AppError('Trilha não encontrada.', 404);

  await query(
    `UPDATE trilhas SET
       title = COALESCE(?, title),
       description = ?,
       cover_image_url = ?,
       display_order = COALESCE(?, display_order),
       published = COALESCE(?, published)
     WHERE id = ?`,
    [title || null, description ?? null, cover_image_url ?? null, display_order, published, id]
  );
  return adminGetTrilha(id);
}

async function deleteTrilha(id) {
  await query('DELETE FROM trilhas WHERE id = ?', [id]); // ON DELETE CASCADE remove as aulas
}

async function createAula(trilhaId, { title, description, video_provider, video_id, duration_seconds, display_order, published }) {
  const [trilhas] = await query('SELECT id FROM trilhas WHERE id = ? LIMIT 1', [trilhaId]);
  if (!trilhas.length) throw new AppError('Trilha não encontrada.', 404);
  if (!title || !title.trim()) throw new AppError('Título é obrigatório.', 400);
  if (!video_id || !video_id.trim()) throw new AppError('ID/URL do vídeo é obrigatório.', 400);

  const id = uuidv4();
  await query(
    `INSERT INTO aulas (id, trilha_id, title, description, video_provider, video_id, duration_seconds, display_order, published)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, trilhaId, title, description || null, video_provider || 'vimeo', video_id, duration_seconds || null, display_order || 0, published ? 1 : 0]
  );
  const [rows] = await query('SELECT * FROM aulas WHERE id = ? LIMIT 1', [id]);
  return rows[0];
}

async function updateAula(id, { title, description, video_provider, video_id, duration_seconds, display_order, published }) {
  const [existing] = await query('SELECT id FROM aulas WHERE id = ? LIMIT 1', [id]);
  if (!existing.length) throw new AppError('Aula não encontrada.', 404);

  await query(
    `UPDATE aulas SET
       title = COALESCE(?, title),
       description = ?,
       video_provider = COALESCE(?, video_provider),
       video_id = COALESCE(?, video_id),
       duration_seconds = ?,
       display_order = COALESCE(?, display_order),
       published = COALESCE(?, published)
     WHERE id = ?`,
    [title || null, description ?? null, video_provider || null, video_id || null, duration_seconds, display_order, published, id]
  );
  const [rows] = await query('SELECT * FROM aulas WHERE id = ? LIMIT 1', [id]);
  return rows[0];
}

async function deleteAula(id) {
  await query('DELETE FROM aulas WHERE id = ?', [id]);
}

module.exports = {
  listTrilhas, getTrilha, updateProgress,
  adminListTrilhas, adminGetTrilha, createTrilha, updateTrilha, deleteTrilha,
  createAula, updateAula, deleteAula,
};

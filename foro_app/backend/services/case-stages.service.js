/**
 * case-stages.service.js — etapas do kanban de processos (editáveis por conta, separadas por área).
 * Cada conta recebe as etapas padrão de cada área (configs/legal-areas.js) e pode renomear, recolorir,
 * reordenar, criar e remover. Um processo sempre está em UMA etapa da sua área.
 */
const { v4: uuidv4 } = require('uuid');
const { query } = require('../configs/db.config');
const { AppError } = require('../middlewares/error.middleware');
const areas = require('../configs/legal-areas');

/** Cria as etapas padrão de todas as áreas para uma conta nova. `exec(sql, params)` = conn.execute ou query. */
async function seedAccount(exec, accountId) {
  for (const key of areas.AREA_KEYS) {
    for (const s of areas.defaultStages(key)) {
      await exec(
        'INSERT IGNORE INTO case_stages (id, account_id, area_key, stage_key, label, color, position, is_final) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [uuidv4(), accountId, key, s.stage_key, s.label, s.color, s.position, s.is_final]
      );
    }
  }
}

function _assertArea(areaKey) {
  if (!areas.AREA_KEYS.includes(areaKey)) throw new AppError(`Área inválida. Use: ${areas.AREA_KEYS.join(', ')}.`, 422, 'VALIDATION');
}

async function list(accountId, areaKey) {
  const params = [accountId]; let where = 'account_id = ?';
  if (areaKey) { _assertArea(areaKey); where += ' AND area_key = ?'; params.push(areaKey); }
  const [rows] = await query(
    `SELECT s.*, (SELECT COUNT(*) FROM cases c WHERE c.stage_id = s.id AND c.deleted_at IS NULL) AS cases_count
     FROM case_stages s WHERE ${where.replace(/account_id/g, 's.account_id').replace(/area_key/g, 's.area_key')} ORDER BY s.area_key, s.position`,
    params
  );
  return rows;
}

async function get(id, accountId) {
  const [r] = await query('SELECT * FROM case_stages WHERE id = ? AND account_id = ? LIMIT 1', [id, accountId]);
  if (!r.length) throw new AppError('Etapa não encontrada.', 404);
  return r[0];
}

/** Primeira etapa (posição mais baixa) da área; cai em 'geral' se a conta não tiver a área. */
async function firstStageId(accountId, areaKey) {
  for (const k of [areaKey, 'geral']) {
    const [r] = await query('SELECT id FROM case_stages WHERE account_id = ? AND area_key = ? ORDER BY position LIMIT 1', [accountId, k]);
    if (r.length) return r[0].id;
  }
  return null;
}

const slug = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'etapa';
const COLOR = /^#[0-9a-fA-F]{6}$/;

async function create(accountId, { area_key, label, color, is_final }) {
  _assertArea(area_key);
  const name = String(label || '').trim();
  if (!name) throw new AppError('Informe o nome da etapa.', 422, 'VALIDATION');
  if (name.length > 80) throw new AppError('Nome da etapa muito longo (máx. 80).', 422, 'VALIDATION');
  if (color && !COLOR.test(color)) throw new AppError('Cor inválida (use #RRGGBB).', 422, 'VALIDATION');
  const [[{ n }]] = await query('SELECT COUNT(*) AS n FROM case_stages WHERE account_id = ? AND area_key = ?', [accountId, area_key]);
  if (n >= 15) throw new AppError('Limite de 15 etapas por área.', 422, 'VALIDATION');
  let key = slug(name);
  const [exists] = await query('SELECT stage_key FROM case_stages WHERE account_id = ? AND area_key = ? AND stage_key LIKE ?', [accountId, area_key, `${key}%`]);
  if (exists.some(e => e.stage_key === key)) key = `${key.slice(0, 34)}_${exists.length + 1}`;
  const [[{ pos }]] = await query('SELECT COALESCE(MAX(position), -1) + 1 AS pos FROM case_stages WHERE account_id = ? AND area_key = ?', [accountId, area_key]);
  const id = uuidv4();
  await query('INSERT INTO case_stages (id, account_id, area_key, stage_key, label, color, position, is_final) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [id, accountId, area_key, key, name, color || '#64748b', pos, is_final ? 1 : 0]);
  return get(id, accountId);
}

async function update(id, accountId, data) {
  await get(id, accountId);
  const f = []; const v = [];
  if (data.label !== undefined) {
    const name = String(data.label || '').trim();
    if (!name || name.length > 80) throw new AppError('Nome da etapa inválido (1 a 80 caracteres).', 422, 'VALIDATION');
    f.push('label = ?'); v.push(name);
  }
  if (data.color !== undefined) {
    if (!COLOR.test(data.color)) throw new AppError('Cor inválida (use #RRGGBB).', 422, 'VALIDATION');
    f.push('color = ?'); v.push(data.color);
  }
  if (data.is_final !== undefined) { f.push('is_final = ?'); v.push(data.is_final ? 1 : 0); }
  if (f.length) { v.push(id, accountId); await query(`UPDATE case_stages SET ${f.join(', ')} WHERE id = ? AND account_id = ?`, v); }
  return get(id, accountId);
}

/** Reordena: `ids` = lista completa dos ids da área na nova ordem. */
async function reorder(accountId, areaKey, ids) {
  _assertArea(areaKey);
  const current = await list(accountId, areaKey);
  if (!Array.isArray(ids) || ids.length !== current.length || new Set(ids).size !== ids.length || !ids.every(i => current.some(c => c.id === i))) {
    throw new AppError('Envie todos os ids das etapas da área, sem repetir.', 422, 'VALIDATION');
  }
  for (let i = 0; i < ids.length; i++) await query('UPDATE case_stages SET position = ? WHERE id = ? AND account_id = ?', [i, ids[i], accountId]);
  return list(accountId, areaKey);
}

/** Remove a etapa. Se houver processos nela, é preciso indicar `move_to` (outra etapa da mesma área). */
async function remove(id, accountId, moveTo) {
  const s = await get(id, accountId);
  const [[{ total }]] = await query('SELECT COUNT(*) AS total FROM case_stages WHERE account_id = ? AND area_key = ?', [accountId, s.area_key]);
  if (total <= 1) throw new AppError('Cada área precisa ter pelo menos uma etapa.', 409, 'LAST_STAGE');
  const [[{ used }]] = await query('SELECT COUNT(*) AS used FROM cases WHERE stage_id = ? AND deleted_at IS NULL', [id]);
  if (used > 0) {
    if (!moveTo) throw new AppError(`Há ${used} processo(s) nesta etapa. Escolha para onde movê-los.`, 409, 'STAGE_IN_USE');
    const dest = await get(moveTo, accountId);
    if (dest.area_key !== s.area_key || dest.id === s.id) throw new AppError('Escolha outra etapa da mesma área.', 422, 'VALIDATION');
    await query('UPDATE cases SET stage_id = ? WHERE stage_id = ? AND account_id = ?', [moveTo, id, accountId]);
  }
  await query('DELETE FROM case_stages WHERE id = ? AND account_id = ?', [id, accountId]);
  const rest = await list(accountId, s.area_key);
  for (let i = 0; i < rest.length; i++) await query('UPDATE case_stages SET position = ? WHERE id = ?', [i, rest[i].id]);
}

/** Restaura as etapas padrão da área (só se nenhum processo estiver em etapas que seriam apagadas). */
async function resetArea(accountId, areaKey) {
  _assertArea(areaKey);
  const [[{ used }]] = await query(
    'SELECT COUNT(*) AS used FROM cases c JOIN case_stages s ON s.id = c.stage_id WHERE s.account_id = ? AND s.area_key = ? AND c.deleted_at IS NULL', [accountId, areaKey]);
  if (used > 0) throw new AppError('Há processos nesta área. Mova-os ou ajuste as etapas manualmente.', 409, 'STAGE_IN_USE');
  await query('DELETE FROM case_stages WHERE account_id = ? AND area_key = ?', [accountId, areaKey]);
  for (const s of areas.defaultStages(areaKey)) {
    await query('INSERT INTO case_stages (id, account_id, area_key, stage_key, label, color, position, is_final) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [uuidv4(), accountId, areaKey, s.stage_key, s.label, s.color, s.position, s.is_final]);
  }
  return list(accountId, areaKey);
}

module.exports = { seedAccount, list, get, firstStageId, create, update, reorder, remove, resetArea };

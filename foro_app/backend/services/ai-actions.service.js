/**
 * ai-actions.service.js — log de tudo que a IA ESCREVEU no CRM, com "desfazer".
 *
 * Antes de cada ferramenta de escrita guardamos um retrato (snapshot) da linha afetada; depois da execução guardamos
 * o retrato "depois". Desfazer:
 *   • criou  → remove (soft delete em leads/processos/documentos; exclusão nas demais tabelas)
 *   • mudou  → devolve SÓ os campos que a IA alterou e que ainda estão como a IA deixou (se a pessoa editou depois,
 *              aquele campo é preservado e a ação vira "parcial")
 *   • apagou → restaura (leads: tira do lixo; tarefas/compromissos: recria a linha)
 * Limite conhecido: campos personalizados do lead (tabela à parte) não entram no retrato.
 */
const { v4: uuidv4 } = require('uuid');
const { query } = require('../configs/db.config');
const { AppError } = require('../middlewares/error.middleware');

const SOFT = new Set(['leads', 'cases', 'documents']);
const TABLES = new Set(['leads', 'lead_notes', 'tasks', 'events', 'cases', 'case_updates', 'case_parties', 'documents']);
const SKIP_COLS = new Set(['updated_at', 'created_at']);

const byId = (k) => (i) => i[k];
const newId = (i, r) => r?.id;
const SPEC = {
  create_lead: { entity: 'leads', op: 'insert', id: newId },
  update_lead: { entity: 'leads', op: 'update', id: byId('lead_id') },
  move_lead_stage: { entity: 'leads', op: 'update', id: byId('lead_id') },
  delete_lead: { entity: 'leads', op: 'delete', id: byId('lead_id') },
  add_note: { entity: 'lead_notes', op: 'insert', id: newId },
  create_task: { entity: 'tasks', op: 'insert', id: newId },
  complete_task: { entity: 'tasks', op: 'update', id: byId('task_id') },
  update_task: { entity: 'tasks', op: 'update', id: byId('task_id') },
  delete_task: { entity: 'tasks', op: 'delete', id: byId('task_id') },
  create_case: { entity: 'cases', op: 'insert', id: newId },
  update_case: { entity: 'cases', op: 'update', id: byId('case_id') },
  add_case_update: { entity: 'case_updates', op: 'insert', id: newId },
  add_party: { entity: 'case_parties', op: 'insert', id: newId },
  create_event: { entity: 'events', op: 'insert', id: newId },
  update_event: { entity: 'events', op: 'update', id: byId('event_id') },
  delete_event: { entity: 'events', op: 'delete', id: byId('event_id') },
  create_document: { entity: 'documents', op: 'insert', id: newId },
};
const isWriteTool = (name) => Boolean(SPEC[name]);

const norm = (row) => (row ? JSON.parse(JSON.stringify(row)) : null);
async function snapshot(entity, id, accountId) {
  if (!TABLES.has(entity) || !id) return null;
  const [r] = await query(`SELECT * FROM \`${entity}\` WHERE id = ? AND account_id = ? LIMIT 1`, [id, accountId]);
  return norm(r[0]);
}
const eq = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
function sqlValue(v) {
  if (typeof v === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z$/.test(v)) return new Date(v);
  if (v && typeof v === 'object') return JSON.stringify(v);
  return v;
}

/** Chamar ANTES de executar a ferramenta. Devolve um "token" para finish(). */
async function begin(tool, input, accountId) {
  const spec = SPEC[tool];
  if (!spec) return null;
  let before = null, targetId = null;
  if (spec.op !== 'insert') { targetId = spec.id(input || {}); before = await snapshot(spec.entity, targetId, accountId); }
  return { tool, spec, targetId, before };
}

/** Chamar DEPOIS: registra a ação (feita ou com falha). */
async function finish(token, ctx, { input, result, error, summary }) {
  if (!token) return null;
  const { spec } = token;
  const id = uuidv4();
  let entityId = token.targetId, after = null;
  if (!error) {
    if (spec.op === 'insert') entityId = spec.id(input || {}, result);
    after = spec.op === 'delete' && !SOFT.has(spec.entity) ? null : await snapshot(spec.entity, entityId, ctx.accountId);
  }
  const failed = Boolean(error);
  const undoable = !failed && entityId && (spec.op === 'insert' || token.before);
  await query(
    `INSERT INTO ai_actions (id, account_id, user_id, conversation_id, tool, summary, entity, entity_id, op, before_json, after_json, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, ctx.accountId, ctx.userId, ctx.conversationId || null, token.tool, String(summary || token.tool).slice(0, 500),
      undoable ? spec.entity : null, undoable ? entityId : null, spec.op,
      token.before ? JSON.stringify(token.before) : null, after ? JSON.stringify(after) : null, failed ? 'failed' : 'done']
  );
  return id;
}

async function list(accountId, user, { mine, status, page = 1, limit = 30 } = {}) {
  const cond = ['a.account_id = ?']; const params = [accountId];
  if (user.role !== 'admin' || mine) { cond.push('a.user_id = ?'); params.push(user.id); }
  if (status) { cond.push('a.status = ?'); params.push(status); }
  const off = (Math.max(1, Number(page)) - 1) * Math.min(Number(limit) || 30, 100);
  const lim = Math.min(Number(limit) || 30, 100);
  const [rows] = await query(
    `SELECT a.id, a.tool, a.summary, a.entity, a.entity_id, a.op, a.status, a.undo_note, a.created_at, a.undone_at, a.user_id, u.name AS user_name
     FROM ai_actions a LEFT JOIN users u ON u.id = a.user_id WHERE ${cond.join(' AND ')}
     ORDER BY a.created_at DESC LIMIT ${lim} OFFSET ${off}`, params);
  const [[{ total }]] = await query(`SELECT COUNT(*) AS total FROM ai_actions a WHERE ${cond.join(' AND ')}`, params);
  return { data: rows.map(r => ({ ...r, can_undo: r.status === 'done' && Boolean(r.entity_id) })), total };
}

async function _setStatus(id, status, note, actorId) {
  await query('UPDATE ai_actions SET status = ?, undo_note = ?, undone_at = NOW(), undone_by = ? WHERE id = ?', [status, note, actorId, id]);
}

async function undo(id, accountId, actor) {
  const [rows] = await query('SELECT * FROM ai_actions WHERE id = ? AND account_id = ? LIMIT 1', [id, accountId]);
  const a = rows[0];
  if (!a) throw new AppError('Ação não encontrada.', 404);
  if (actor.role !== 'admin' && a.user_id !== actor.id) throw new AppError('Você só pode desfazer ações feitas pela sua própria conversa.', 403);
  if (a.status !== 'done') throw new AppError(a.status === 'failed' ? 'Essa ação falhou, não há o que desfazer.' : 'Essa ação já foi desfeita.', 409, 'NOT_UNDOABLE');
  if (!a.entity || !a.entity_id || !TABLES.has(a.entity)) throw new AppError('Esta ação não pode ser desfeita automaticamente.', 409, 'NOT_UNDOABLE');

  const before = a.before_json ? JSON.parse(a.before_json) : null;
  const after = a.after_json ? JSON.parse(a.after_json) : null;
  const cur = await snapshot(a.entity, a.entity_id, accountId);
  const T = `\`${a.entity}\``;
  let status = 'undone', note = null;

  if (a.op === 'insert') {
    if (!cur || (SOFT.has(a.entity) && cur.deleted_at)) note = 'O registro já tinha sido removido.';
    else if (SOFT.has(a.entity)) await query(`UPDATE ${T} SET deleted_at = NOW() WHERE id = ? AND account_id = ?`, [a.entity_id, accountId]);
    else await query(`DELETE FROM ${T} WHERE id = ? AND account_id = ?`, [a.entity_id, accountId]);
  } else if (a.op === 'update') {
    if (!cur || (SOFT.has(a.entity) && cur.deleted_at)) throw new AppError('O registro foi removido depois da ação da IA; não dá para desfazer.', 409, 'NOT_UNDOABLE');
    const restore = {}, kept = [];
    for (const c of Object.keys(before || {})) {
      if (SKIP_COLS.has(c) || eq(before[c], after?.[c])) continue; // a IA não mexeu neste campo
      if (eq(cur[c], after?.[c])) restore[c] = before[c]; else kept.push(c);
    }
    const cols = Object.keys(restore);
    if (!cols.length && kept.length) throw new AppError('Estes campos foram editados depois da ação da IA, então mantive como estão: ' + kept.join(', ') + '.', 409, 'NOT_UNDOABLE');
    if (cols.length) await query(`UPDATE ${T} SET ${cols.map(c => `\`${c}\` = ?`).join(', ')} WHERE id = ? AND account_id = ?`, [...cols.map(c => sqlValue(restore[c])), a.entity_id, accountId]);
    if (kept.length) { status = 'partial'; note = 'Alguns campos foram editados depois e ficaram como estão: ' + kept.join(', ') + '.'; }
  } else if (a.op === 'delete') {
    if (SOFT.has(a.entity)) {
      if (!cur) throw new AppError('Registro não encontrado.', 404);
      await query(`UPDATE ${T} SET deleted_at = NULL WHERE id = ? AND account_id = ?`, [a.entity_id, accountId]);
    } else if (cur) note = 'O registro já existe.';
    else {
      if (!before) throw new AppError('Sem dados para restaurar.', 409, 'NOT_UNDOABLE');
      const cols = Object.keys(before);
      await query(`INSERT INTO ${T} (${cols.map(c => `\`${c}\``).join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`, cols.map(c => sqlValue(before[c])));
    }
  }
  await _setStatus(a.id, status, note, actor.id);
  const [[fresh]] = await query('SELECT id, tool, summary, status, undo_note, undone_at FROM ai_actions WHERE id = ?', [a.id]);
  return fresh;
}

module.exports = { isWriteTool, begin, finish, list, undo };

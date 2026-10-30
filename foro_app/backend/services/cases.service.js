/**
 * cases.service.js — processos, andamentos e (via tasks/events) prazos e agenda do processo.
 * Tudo isolado por account_id. Número CNJ validado/normalizado em utils/cnj.js.
 */
const { v4: uuidv4 } = require('uuid');
const { query } = require('../configs/db.config');
const { AppError } = require('../middlewares/error.middleware');
const cnj = require('../utils/cnj');
const areas = require('../configs/legal-areas');
const stagesService = require('./case-stages.service');
const partiesService = require('./case-parties.service');
const membersService = require('./case-members.service');

const STATUSES = ['ativo', 'suspenso', 'arquivado', 'encerrado'];

const SELECT = `SELECT c.*, l.name AS lead_name, l.phone AS lead_phone, l.email AS lead_email, u.name AS responsible_name,
    st.label AS stage_label, st.color AS stage_color, st.is_final AS stage_is_final,
    (SELECT MIN(t.due_date) FROM tasks t WHERE t.case_id = c.id AND t.is_deadline = 1 AND t.completed_at IS NULL AND t.due_date >= NOW()) AS next_deadline,
    (SELECT COUNT(*) FROM case_parties p WHERE p.case_id = c.id) AS parties_count
  FROM cases c
  LEFT JOIN leads l ON l.id = c.lead_id
  LEFT JOIN users u ON u.id = c.responsible_user_id
  LEFT JOIN case_stages st ON st.id = c.stage_id`;

function _cleanUrl(url) {
  if (url === undefined) return undefined;
  const v = String(url || '').trim();
  if (!v) return null;
  if (!/^https?:\/\//i.test(v)) throw new AppError('O link do processo deve começar com http:// ou https://.', 400);
  return v.slice(0, 500);
}

async function _assertLead(leadId, accountId) {
  if (!leadId) return;
  const [r] = await query('SELECT id FROM leads WHERE id = ? AND account_id = ? AND deleted_at IS NULL LIMIT 1', [leadId, accountId]);
  if (!r.length) throw new AppError('Contato não encontrado.', 404);
}

async function list(accountId, { status, search, lead_id, area_key, stage_id, limit = 200 } = {}) {
  const cond = ['c.account_id = ?', 'c.deleted_at IS NULL'];
  const params = [accountId];
  if (status) { cond.push('c.status = ?'); params.push(status); }
  if (lead_id) { cond.push('c.lead_id = ?'); params.push(lead_id); }
  if (area_key) { cond.push('c.area_key = ?'); params.push(area_key); }
  if (stage_id) { cond.push('c.stage_id = ?'); params.push(stage_id); }
  if (search) {
    cond.push('(c.case_number LIKE ? OR c.title LIKE ? OR l.name LIKE ? OR c.opposing_party LIKE ?)');
    const s = `%${search}%`; params.push(s, s, s, s);
  }
  const [rows] = await query(`${SELECT} WHERE ${cond.join(' AND ')} ORDER BY c.created_at DESC LIMIT ${Number(limit) | 0}`, params);
  return { data: rows, total: rows.length };
}

async function getById(id, accountId) {
  const [rows] = await query(`${SELECT} WHERE c.id = ? AND c.account_id = ? AND c.deleted_at IS NULL LIMIT 1`, [id, accountId]);
  if (!rows.length) throw new AppError('Processo não encontrado.', 404);
  const c = rows[0];
  const [updates] = await query('SELECT * FROM case_updates WHERE case_id = ? AND account_id = ? ORDER BY update_date DESC, created_at DESC', [id, accountId]);
  const [tasks] = await query('SELECT * FROM tasks WHERE case_id = ? AND account_id = ? ORDER BY completed_at IS NOT NULL, due_date ASC', [id, accountId]);
  const [events] = await query('SELECT * FROM events WHERE case_id = ? AND account_id = ? ORDER BY starts_at ASC', [id, accountId]);
  const [parties, members, docs] = await Promise.all([
    partiesService.list(id, accountId),
    membersService.list(id, accountId),
    query('SELECT id, title, status, template_key, open_flags, ai_generated, updated_at FROM documents WHERE case_id = ? AND account_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC', [id, accountId]).then(r => r[0]),
  ]);
  const area = areas.get(c.area_key);
  const details = typeof c.details === 'string' ? JSON.parse(c.details) : (c.details || {});
  return {
    ...c, details,
    number_valid: c.case_number ? cnj.isValid(c.case_number) : null, tribunal_name: cnj.tribunalOf(c.case_number)?.name || null, suggested_url: cnj.suggestedUrl(c.case_number),
    area_label: area.label, area_fields: area.fields, missing_fields: areas.missingFields(c.area_key, details),
    parties, members, documents: docs, updates, tasks, events,
  };
}

function _assertArea(key) {
  if (!areas.AREA_KEYS.includes(key)) throw new AppError(`Área inválida. Use: ${areas.AREA_KEYS.join(', ')}.`, 422, 'VALIDATION');
  return key;
}
const _t = (v, max) => (v === undefined || v === null || String(v).trim() === '' ? null : String(v).trim().slice(0, max));

/** Etapa precisa existir na conta e pertencer à área do processo. */
async function _stageOf(stageId, accountId, areaKey) {
  const s = await stagesService.get(stageId, accountId);
  if (s.area_key !== areaKey) throw new AppError('Essa etapa pertence a outra área.', 422, 'VALIDATION');
  return s;
}

async function create(accountId, userId, data) {
  const analyzed = cnj.analyze(data.case_number);
  if (!analyzed && !data.title) throw new AppError('Informe o número do processo ou um título.', 400);
  await _assertLead(data.lead_id, accountId);
  const status = data.status || 'ativo';
  if (!STATUSES.includes(status)) throw new AppError(`Status inválido. Use: ${STATUSES.join(', ')}.`, 400);

  if (analyzed) {
    const [dup] = await query('SELECT id FROM cases WHERE account_id = ? AND case_number = ? AND deleted_at IS NULL LIMIT 1', [accountId, analyzed.case_number]);
    if (dup.length) throw new AppError('Já existe um processo com esse número.', 409);
  }

  const id = uuidv4();
  const url = _cleanUrl(data.court_url) ?? analyzed?.suggested_url ?? null;
  const areaKey = data.area_key ? _assertArea(data.area_key) : (areas.guessAreaKey(data.area) || 'geral');
  const det = areas.sanitizeDetails(areaKey, data.details);
  if (det.errors.length) throw new AppError(det.errors.join(' '), 422, 'VALIDATION');
  const stageId = data.stage_id ? (await _stageOf(data.stage_id, accountId, areaKey)).id : await stagesService.firstStageId(accountId, areaKey);
  const responsibleId = data.responsible_user_id || userId;
  await query(
    `INSERT INTO cases (id, account_id, lead_id, case_number, title, tribunal, court_url, area, area_key, details, comarca, vara, magistrate, stage_id, status, phase, client_role, opposing_party, cause_value, responsible_user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, accountId, data.lead_id || null, analyzed?.case_number || null, data.title || null, analyzed?.tribunal || null, url,
      data.area || (areaKey !== 'geral' ? areas.get(areaKey).short : null), areaKey, JSON.stringify(det.value),
      _t(data.comarca, 120), _t(data.vara, 120), _t(data.magistrate, 160), stageId, status, data.phase || null, data.client_role || null, data.opposing_party || null,
      data.cause_value === '' || data.cause_value == null ? null : Number(data.cause_value), responsibleId]
  );
  await membersService.ensureResponsible(id, accountId, responsibleId);
  const created = await getById(id, accountId);
  return { ...created, number_valid: analyzed ? analyzed.valid : null };
}

const EDITABLE = ['title', 'area', 'status', 'phase', 'client_role', 'opposing_party', 'lead_id'];

async function update(id, accountId, data) {
  const current = await getById(id, accountId);
  const fields = []; const values = [];
  let areaKey = current.area_key;
  if (data.area_key !== undefined || (data.area !== undefined && data.area_key === undefined && areas.guessAreaKey(data.area) && areas.guessAreaKey(data.area) !== 'geral' && current.area_key === 'geral')) {
    const next = data.area_key !== undefined ? _assertArea(data.area_key) : areas.guessAreaKey(data.area);
    if (next !== current.area_key) {
      areaKey = next;
      // mudar de área: etapa volta à primeira da nova área e os campos antigos que não existem na nova são descartados
      fields.push('area_key = ?'); values.push(next);
      fields.push('stage_id = ?'); values.push(await stagesService.firstStageId(accountId, next));
      fields.push('details = ?'); values.push(JSON.stringify(areas.sanitizeDetails(next, current.details).value));
    }
  }
  if (data.details !== undefined) {
    const det = areas.sanitizeDetails(areaKey, data.details);
    if (det.errors.length) throw new AppError(det.errors.join(' '), 422, 'VALIDATION');
    const base = areaKey === current.area_key ? (current.details || {}) : areas.sanitizeDetails(areaKey, current.details).value;
    const merged = { ...base, ...det.value };
    for (const k of Object.keys(merged)) if (merged[k] === null) delete merged[k];
    const di = fields.findIndex(f => f === 'details = ?');
    if (di >= 0) values[di] = JSON.stringify(merged); else { fields.push('details = ?'); values.push(JSON.stringify(merged)); }
  }
  for (const k of ['comarca', 'vara', 'magistrate']) {
    if (data[k] !== undefined) { fields.push(`${k} = ?`); values.push(_t(data[k], k === 'magistrate' ? 160 : 120)); }
  }
  if (data.stage_id !== undefined && data.area_key === undefined) {
    const st = await _stageOf(data.stage_id, accountId, areaKey);
    fields.push('stage_id = ?'); values.push(st.id);
    if (st.is_final && !['encerrado', 'arquivado'].includes(data.status ?? current.status)) { fields.push('status = ?'); values.push('encerrado'); data = { ...data, status: undefined }; }
    else if (!st.is_final && current.status === 'encerrado' && data.status === undefined) { fields.push('status = ?'); values.push('ativo'); }
  }
  if (data.responsible_user_id !== undefined) {
    if (data.responsible_user_id) {
      const [u] = await query('SELECT id FROM users WHERE id = ? AND account_id = ? AND active = 1 LIMIT 1', [data.responsible_user_id, accountId]);
      if (!u.length) throw new AppError('Usuário responsável não encontrado ou inativo.', 404);
      await membersService.ensureResponsible(id, accountId, data.responsible_user_id);
    }
    fields.push('responsible_user_id = ?'); values.push(data.responsible_user_id || null);
  }
  for (const k of EDITABLE) {
    if (data[k] === undefined) continue;
    if (k === 'status' && !STATUSES.includes(data[k])) throw new AppError(`Status inválido. Use: ${STATUSES.join(', ')}.`, 400);
    if (k === 'lead_id') await _assertLead(data[k], accountId);
    fields.push(`${k} = ?`); values.push(data[k] === '' ? null : data[k]);
  }
  if (data.cause_value !== undefined) { fields.push('cause_value = ?'); values.push(data.cause_value === '' || data.cause_value === null ? null : Number(data.cause_value)); }
  if (data.court_url !== undefined) { fields.push('court_url = ?'); values.push(_cleanUrl(data.court_url)); }
  if (data.case_number !== undefined) {
    const a = cnj.analyze(data.case_number);
    if (a) {
      const [dup] = await query('SELECT id FROM cases WHERE account_id = ? AND case_number = ? AND id <> ? AND deleted_at IS NULL LIMIT 1', [accountId, a.case_number, id]);
      if (dup.length) throw new AppError('Já existe um processo com esse número.', 409);
    }
    fields.push('case_number = ?', 'tribunal = ?'); values.push(a?.case_number || null, a?.tribunal || null);
  }
  if (fields.length) {
    values.push(id, accountId);
    await query(`UPDATE cases SET ${fields.join(', ')} WHERE id = ? AND account_id = ?`, values);
  }
  return getById(id, accountId);
}

async function remove(id, accountId) {
  await getById(id, accountId);
  await query('UPDATE cases SET deleted_at = NOW() WHERE id = ? AND account_id = ?', [id, accountId]);
}

async function addUpdate(caseId, accountId, userId, { text, update_date }, source = 'manual') {
  await getById(caseId, accountId);
  if (!text || !String(text).trim()) throw new AppError('Descreva o andamento.', 400);
  const id = uuidv4();
  const date = update_date ? new Date(update_date) : new Date();
  if (Number.isNaN(date.getTime())) throw new AppError('Data inválida.', 400);
  await query(
    'INSERT INTO case_updates (id, account_id, case_id, user_id, update_date, text, source) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, accountId, caseId, userId, date.toISOString().slice(0, 10), String(text).trim(), source]
  );
  const [rows] = await query('SELECT * FROM case_updates WHERE id = ? LIMIT 1', [id]);
  return rows[0];
}

async function deleteUpdate(caseId, updateId, accountId) {
  await query('DELETE FROM case_updates WHERE id = ? AND case_id = ? AND account_id = ?', [updateId, caseId, accountId]);
}

/** Pré-visualização do número digitado (validade + tribunal + link sugerido) — usado pelo formulário. */
function analyzeNumber(input) {
  return cnj.analyze(input) || { case_number: '', tribunal: null, valid: false, suggested_url: null };
}

module.exports = { STATUSES, list, getById, create, update, remove, addUpdate, deleteUpdate, analyzeNumber };

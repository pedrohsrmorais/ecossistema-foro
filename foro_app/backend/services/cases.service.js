/**
 * cases.service.js — processos, andamentos e (via tasks/events) prazos e agenda do processo.
 * Tudo isolado por account_id. Número CNJ validado/normalizado em utils/cnj.js.
 */
const { v4: uuidv4 } = require('uuid');
const { query } = require('../configs/db.config');
const { AppError } = require('../middlewares/error.middleware');
const cnj = require('../utils/cnj');

const STATUSES = ['ativo', 'suspenso', 'arquivado', 'encerrado'];

const SELECT = `SELECT c.*, l.name AS lead_name, u.name AS responsible_name,
    (SELECT MIN(t.due_date) FROM tasks t WHERE t.case_id = c.id AND t.is_deadline = 1 AND t.completed_at IS NULL AND t.due_date >= NOW()) AS next_deadline
  FROM cases c
  LEFT JOIN leads l ON l.id = c.lead_id
  LEFT JOIN users u ON u.id = c.responsible_user_id`;

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

async function list(accountId, { status, search, lead_id, limit = 200 } = {}) {
  const cond = ['c.account_id = ?', 'c.deleted_at IS NULL'];
  const params = [accountId];
  if (status) { cond.push('c.status = ?'); params.push(status); }
  if (lead_id) { cond.push('c.lead_id = ?'); params.push(lead_id); }
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
  return { ...c, number_valid: c.case_number ? cnj.isValid(c.case_number) : null, tribunal_name: cnj.tribunalOf(c.case_number)?.name || null, suggested_url: cnj.suggestedUrl(c.case_number), updates, tasks, events };
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
  await query(
    `INSERT INTO cases (id, account_id, lead_id, case_number, title, tribunal, court_url, area, status, phase, client_role, opposing_party, cause_value, responsible_user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, accountId, data.lead_id || null, analyzed?.case_number || null, data.title || null, analyzed?.tribunal || null, url,
      data.area || null, status, data.phase || null, data.client_role || null, data.opposing_party || null,
      data.cause_value === '' || data.cause_value == null ? null : Number(data.cause_value), data.responsible_user_id || userId]
  );
  const created = await getById(id, accountId);
  return { ...created, number_valid: analyzed ? analyzed.valid : null };
}

const EDITABLE = ['title', 'area', 'status', 'phase', 'client_role', 'opposing_party', 'lead_id', 'responsible_user_id'];

async function update(id, accountId, data) {
  await getById(id, accountId);
  const fields = []; const values = [];
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

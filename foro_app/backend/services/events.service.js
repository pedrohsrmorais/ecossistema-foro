/** events.service.js — agenda (reuniões, audiências, perícias) com link de reunião. */
const { v4: uuidv4 } = require('uuid');
const { query } = require('../configs/db.config');
const { AppError } = require('../middlewares/error.middleware');

const TYPES = ['reuniao', 'audiencia', 'pericia', 'outro'];
const STATUSES = ['agendado', 'realizado', 'cancelado'];

const SELECT = `SELECT e.*, l.name AS lead_name, c.case_number, c.title AS case_title, u.name AS user_name
  FROM events e
  LEFT JOIN leads l ON l.id = e.lead_id
  LEFT JOIN cases c ON c.id = e.case_id
  LEFT JOIN users u ON u.id = e.user_id`;

function _date(v, label) {
  const d = new Date(v);
  if (!v || Number.isNaN(d.getTime())) throw new AppError(`${label} inválida.`, 400);
  return d;
}

function _url(v) {
  if (v === undefined) return undefined;
  const s = String(v || '').trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) throw new AppError('O link da reunião deve começar com http:// ou https://.', 400);
  return s.slice(0, 500);
}

async function _assertRefs(accountId, { lead_id, case_id }) {
  if (lead_id) {
    const [r] = await query('SELECT id FROM leads WHERE id = ? AND account_id = ? AND deleted_at IS NULL LIMIT 1', [lead_id, accountId]);
    if (!r.length) throw new AppError('Contato não encontrado.', 404);
  }
  if (case_id) {
    const [r] = await query('SELECT id FROM cases WHERE id = ? AND account_id = ? AND deleted_at IS NULL LIMIT 1', [case_id, accountId]);
    if (!r.length) throw new AppError('Processo não encontrado.', 404);
  }
}

async function list(accountId, { from, to, lead_id, case_id, include_cancelled = false, limit = 200 } = {}) {
  const cond = ['e.account_id = ?']; const params = [accountId];
  if (from) { cond.push('e.starts_at >= ?'); params.push(_date(from, 'Data inicial')); }
  if (to)   { cond.push('e.starts_at < ?');  params.push(_date(to, 'Data final')); }
  if (lead_id) { cond.push('e.lead_id = ?'); params.push(lead_id); }
  if (case_id) { cond.push('e.case_id = ?'); params.push(case_id); }
  if (!include_cancelled) cond.push("e.status <> 'cancelado'");
  const [rows] = await query(`${SELECT} WHERE ${cond.join(' AND ')} ORDER BY e.starts_at ASC LIMIT ${Number(limit) | 0}`, params);
  return rows;
}

async function getById(id, accountId) {
  const [rows] = await query(`${SELECT} WHERE e.id = ? AND e.account_id = ? LIMIT 1`, [id, accountId]);
  if (!rows.length) throw new AppError('Compromisso não encontrado.', 404);
  return rows[0];
}

async function create(accountId, userId, data) {
  const title = String(data.title || '').trim();
  if (!title) throw new AppError('Informe o título do compromisso.', 400);
  const type = data.type || 'reuniao';
  if (!TYPES.includes(type)) throw new AppError(`Tipo inválido. Use: ${TYPES.join(', ')}.`, 400);
  const starts = _date(data.starts_at, 'Data/hora de início');
  const ends = data.ends_at ? _date(data.ends_at, 'Data/hora de término') : null;
  if (ends && ends < starts) throw new AppError('O término não pode ser antes do início.', 400);
  await _assertRefs(accountId, data);
  const id = uuidv4();
  await query(
    `INSERT INTO events (id, account_id, user_id, lead_id, case_id, type, title, starts_at, ends_at, location, meeting_url, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, accountId, userId, data.lead_id || null, data.case_id || null, type, title, starts, ends,
      data.location || null, _url(data.meeting_url) ?? null, data.notes || null]
  );
  return getById(id, accountId);
}

async function update(id, accountId, data) {
  const current = await getById(id, accountId);
  const fields = []; const values = [];
  const set = (col, val) => { fields.push(`${col} = ?`); values.push(val); };
  if (data.title !== undefined) { if (!String(data.title).trim()) throw new AppError('Informe o título do compromisso.', 400); set('title', String(data.title).trim()); }
  if (data.type !== undefined) { if (!TYPES.includes(data.type)) throw new AppError('Tipo inválido.', 400); set('type', data.type); }
  if (data.status !== undefined) { if (!STATUSES.includes(data.status)) throw new AppError('Status inválido.', 400); set('status', data.status); }
  const starts = data.starts_at !== undefined ? _date(data.starts_at, 'Data/hora de início') : null;
  if (starts) set('starts_at', starts);
  if (data.ends_at !== undefined) {
    const ends = data.ends_at ? _date(data.ends_at, 'Data/hora de término') : null;
    if (ends && ends < (starts || new Date(current.starts_at))) throw new AppError('O término não pode ser antes do início.', 400);
    set('ends_at', ends);
  }
  if (data.location !== undefined) set('location', data.location || null);
  if (data.notes !== undefined) set('notes', data.notes || null);
  if (data.meeting_url !== undefined) set('meeting_url', _url(data.meeting_url));
  if (data.lead_id !== undefined || data.case_id !== undefined) {
    await _assertRefs(accountId, data);
    if (data.lead_id !== undefined) set('lead_id', data.lead_id || null);
    if (data.case_id !== undefined) set('case_id', data.case_id || null);
  }
  if (fields.length) { values.push(id, accountId); await query(`UPDATE events SET ${fields.join(', ')} WHERE id = ? AND account_id = ?`, values); }
  return getById(id, accountId);
}

async function remove(id, accountId) {
  await getById(id, accountId);
  await query('DELETE FROM events WHERE id = ? AND account_id = ?', [id, accountId]);
}

module.exports = { TYPES, STATUSES, list, getById, create, update, remove };

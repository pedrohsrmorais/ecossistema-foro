const { query, transaction } = require('../configs/db.config');
const { v4: uuidv4 } = require('uuid');
const { AppError } = require('../middlewares/error.middleware');

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function _auditLog(conn, { accountId, userId, entityType, entityId, action, channel, oldValues, newValues }) {
  await conn.execute(
    `INSERT INTO audit_events (id, account_id, user_id, entity_type, entity_id, action, channel, old_values, new_values)
     VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?, ?)`,
    [accountId, userId || null, entityType, entityId, action, channel,
      oldValues ? JSON.stringify(oldValues) : null,
      newValues ? JSON.stringify(newValues) : null]
  );
}

async function _setFieldValues(conn, leadId, accountId, fieldValues) {
  if (!fieldValues || typeof fieldValues !== 'object') return;
  for (const [name, value] of Object.entries(fieldValues)) {
    const [defs] = await conn.execute(
      'SELECT id, field_type FROM field_definitions WHERE account_id = ? AND name = ? AND active = 1 LIMIT 1',
      [accountId, name]
    );
    if (!defs.length) continue;
    const def = defs[0];
    const col = def.field_type === 'number' ? 'value_number'
              : def.field_type === 'date'   ? 'value_date'
              : def.field_type === 'boolean' ? 'value_boolean'
              : def.field_type === 'multiselect' ? 'value_json'
              : 'value_text';

    await conn.execute(
      `INSERT INTO lead_field_values (id, account_id, lead_id, field_definition_id, ${col})
       VALUES (UUID(), ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE ${col} = VALUES(${col})`,
      [accountId, leadId, def.id, col === 'value_json' ? JSON.stringify(value) : value]
    );
  }
}

async function _enrichLead(accountId, lead) {
  const [fieldRows] = await query(
    `SELECT fd.name, fd.label, fd.field_type,
            COALESCE(lfv.value_text, CAST(lfv.value_number AS CHAR), CAST(lfv.value_date AS CHAR),
                     CAST(lfv.value_boolean AS CHAR), CAST(lfv.value_json AS CHAR)) AS value
     FROM field_definitions fd
     LEFT JOIN lead_field_values lfv ON lfv.field_definition_id = fd.id AND lfv.lead_id = ?
     WHERE fd.account_id = ? AND fd.active = 1
     ORDER BY fd.display_order`,
    [lead.id, accountId]
  );
  lead.custom_fields = fieldRows.reduce((acc, f) => {
    acc[f.name] = { label: f.label, type: f.field_type, value: f.value };
    return acc;
  }, {});
  return lead;
}

// ─── CRUD ──────────────────────────────────────────────────────────────────────

async function list(accountId, { stage, search, assigned, page = 1, limit = 50, viewer }) {
  const conditions = ['l.account_id = ?', 'l.deleted_at IS NULL'];
  const params = [accountId];

  if (viewer)   { conditions.push('l.assigned_user_id = ?');   params.push(viewer); }
  if (stage)    { conditions.push('l.stage = ?');              params.push(stage); }
  if (assigned) { conditions.push('l.assigned_user_id = ?');   params.push(assigned); }
  if (search)   {
    conditions.push('(l.name LIKE ? OR l.phone LIKE ? OR l.email LIKE ?)');
    const s = `%${search}%`;
    params.push(s, s, s);
  }

  const offset = (page - 1) * limit;
  const where = conditions.join(' AND ');

  const [rows] = await query(
    `SELECT l.id, l.name, l.phone, l.email, l.stage, l.source, l.assigned_user_id,
            l.last_contact_at, l.created_at, u.name AS assigned_name,
            (SELECT COUNT(*) FROM cases c WHERE c.lead_id = l.id AND c.deleted_at IS NULL) AS cases_count
     FROM leads l
     LEFT JOIN users u ON u.id = l.assigned_user_id
     WHERE ${where}
     ORDER BY l.created_at DESC
     LIMIT ${Number(limit) | 0} OFFSET ${Number(offset) | 0}`,
    params
  );

  const [[{ total }]] = await query(`SELECT COUNT(*) AS total FROM leads l WHERE ${where}`, params);

  return { data: rows, total, page, limit };
}

async function _assertLeadLimit(accountId) {
  const [[plan]] = await query(
    'SELECT p.max_leads, p.name FROM accounts a JOIN plans p ON p.id = a.plan_id WHERE a.id = ? LIMIT 1', [accountId]
  );
  if (!plan || plan.max_leads == null) return;
  const [[{ total }]] = await query(
    'SELECT COUNT(*) AS total FROM leads WHERE account_id = ? AND deleted_at IS NULL', [accountId]
  );
  if (total >= plan.max_leads) {
    const err = new AppError(`Limite de ${plan.max_leads} leads do plano ${plan.name} atingido. Faça upgrade para cadastrar mais.`, 403);
    err.code = 'PLAN_LIMIT_LEADS';
    throw err;
  }
}

async function create(accountId, userId, data, channel = 'ui') {
  const { name, phone, email, stage = 'novo', source, assigned_user_id, custom_fields } = data;
  await _assertLeadLimit(accountId);
  const leadId = uuidv4();

  return transaction(async (conn) => {
    await conn.execute(
      `INSERT INTO leads (id, account_id, name, phone, email, stage, source, assigned_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [leadId, accountId, name || null, phone || null, email || null, stage, source || channel, assigned_user_id || userId]
    );
    await _setFieldValues(conn, leadId, accountId, custom_fields);
    await _auditLog(conn, { accountId, userId, entityType: 'lead', entityId: leadId, action: 'created', channel, newValues: data });
    const [[lead]] = await conn.execute('SELECT * FROM leads WHERE id = ? LIMIT 1', [leadId]);
    return lead;
  });
}

async function getById(leadId, accountId) {
  const [rows] = await query(
    `SELECT l.*, u.name AS assigned_name
     FROM leads l
     LEFT JOIN users u ON u.id = l.assigned_user_id
     WHERE l.id = ? AND l.account_id = ? AND l.deleted_at IS NULL LIMIT 1`,
    [leadId, accountId]
  );
  if (!rows.length) throw new AppError('Lead não encontrado.', 404);
  return _enrichLead(accountId, rows[0]);
}

async function update(leadId, accountId, userId, data, channel = 'ui') {
  const lead = await getById(leadId, accountId);
  const { name, phone, email, assigned_user_id, custom_fields } = data;

  await transaction(async (conn) => {
    const fields = [];
    const values = [];
    if (name             !== undefined) { fields.push('name = ?');             values.push(name); }
    if (phone            !== undefined) { fields.push('phone = ?');            values.push(phone); }
    if (email            !== undefined) { fields.push('email = ?');            values.push(email); }
    if (assigned_user_id !== undefined) { fields.push('assigned_user_id = ?'); values.push(assigned_user_id); }

    if (fields.length) {
      values.push(leadId, accountId);
      await conn.execute(`UPDATE leads SET ${fields.join(', ')} WHERE id = ? AND account_id = ?`, values);
    }

    await _setFieldValues(conn, leadId, accountId, custom_fields);
    await _auditLog(conn, { accountId, userId, entityType: 'lead', entityId: leadId, action: 'updated', channel, oldValues: lead, newValues: data });
  });

  // Lê DEPOIS do commit (dentro da transação o pool enxergava o valor antigo)
  return getById(leadId, accountId);
}

const VALID_STAGES = ['novo', 'em_contato', 'proposta', 'convertido', 'encerrado'];

async function moveStage(leadId, accountId, userId, stage, channel = 'ui') {
  if (!VALID_STAGES.includes(stage)) throw new AppError(`Etapa inválida. Use: ${VALID_STAGES.join(', ')}.`, 400);
  const [[old]] = await query('SELECT stage FROM leads WHERE id = ? AND account_id = ? AND deleted_at IS NULL LIMIT 1', [leadId, accountId]);
  if (!old) throw new AppError('Lead não encontrado.', 404);

  return transaction(async (conn) => {
    await conn.execute('UPDATE leads SET stage = ?, last_contact_at = NOW() WHERE id = ? AND account_id = ?', [stage, leadId, accountId]);
    await _auditLog(conn, { accountId, userId, entityType: 'lead', entityId: leadId, action: 'stage_moved', channel, oldValues: { stage: old.stage }, newValues: { stage } });
    const [[lead]] = await conn.execute('SELECT * FROM leads WHERE id = ? AND account_id = ? LIMIT 1', [leadId, accountId]);
    return lead;
  });
}

async function archive(leadId, accountId, userId, channel = 'ui') {
  await query('UPDATE leads SET archived_at = NOW() WHERE id = ? AND account_id = ?', [leadId, accountId]);
  const [rows] = await query('SELECT * FROM leads WHERE id = ? AND account_id = ? LIMIT 1', [leadId, accountId]);
  return rows[0];
}

async function softDelete(leadId, accountId, userId) {
  await query('UPDATE leads SET deleted_at = NOW() WHERE id = ? AND account_id = ?', [leadId, accountId]);
}

async function getFunnelSummary(accountId) {
  const [rows] = await query(
    `SELECT stage, COUNT(*) AS total FROM leads
     WHERE account_id = ? AND deleted_at IS NULL AND archived_at IS NULL
     GROUP BY stage ORDER BY MIN(created_at)`,
    [accountId]
  );
  return rows;
}

// ─── Notas ────────────────────────────────────────────────────────────────────

async function listNotes(leadId, accountId) {
  const [rows] = await query(
    `SELECT n.*, u.name AS user_name FROM lead_notes n
     JOIN users u ON u.id = n.user_id
     WHERE n.lead_id = ? AND n.account_id = ?
     ORDER BY n.created_at DESC`,
    [leadId, accountId]
  );
  return rows;
}

async function _assertLead(leadId, accountId) {
  const [rows] = await query('SELECT id FROM leads WHERE id = ? AND account_id = ? AND deleted_at IS NULL LIMIT 1', [leadId, accountId]);
  if (!rows.length) throw new AppError('Lead não encontrado.', 404);
}

async function addNote(leadId, accountId, userId, text, channel = 'ui') {
  await _assertLead(leadId, accountId);
  const id = uuidv4();
  await query(
    'INSERT INTO lead_notes (id, account_id, lead_id, user_id, text, channel) VALUES (?, ?, ?, ?, ?, ?)',
    [id, accountId, leadId, userId, text, channel]
  );
  const [rows] = await query('SELECT * FROM lead_notes WHERE id = ? LIMIT 1', [id]);
  return rows[0];
}

async function deleteNote(noteId, accountId, userId) {
  await query('DELETE FROM lead_notes WHERE id = ? AND account_id = ?', [noteId, accountId]);
}

// ─── Tarefas ──────────────────────────────────────────────────────────────────

async function listTasksByLead(leadId, accountId) {
  const [rows] = await query(
    `SELECT t.*, u.name AS user_name FROM tasks t
     JOIN users u ON u.id = t.user_id
     WHERE t.lead_id = ? AND t.account_id = ?
     ORDER BY t.due_date ASC`,
    [leadId, accountId]
  );
  return rows;
}

async function createTask(leadId, accountId, userId, { description, due_date, case_id, is_deadline }) {
  if (!description || !String(description).trim()) throw new AppError('Descreva a tarefa.', 400);
  if (leadId) await _assertLead(leadId, accountId);
  if (case_id) {
    const [c] = await query('SELECT id, lead_id FROM cases WHERE id = ? AND account_id = ? AND deleted_at IS NULL LIMIT 1', [case_id, accountId]);
    if (!c.length) throw new AppError('Processo não encontrado.', 404);
    if (!leadId) leadId = c[0].lead_id || null;
  }
  let due = null;
  if (due_date) {
    due = new Date(due_date);
    if (Number.isNaN(due.getTime())) throw new AppError('Data inválida.', 400);
  }
  const id = uuidv4();
  await query(
    'INSERT INTO tasks (id, account_id, lead_id, case_id, user_id, description, due_date, is_deadline) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [id, accountId, leadId || null, case_id || null, userId, String(description).trim(), due, is_deadline ? 1 : 0]
  );
  const [rows] = await query('SELECT * FROM tasks WHERE id = ? LIMIT 1', [id]);
  return rows[0];
}

async function completeTask(taskId, accountId, userId) {
  const [res] = await query('UPDATE tasks SET completed_at = NOW() WHERE id = ? AND account_id = ?', [taskId, accountId]);
  if (!res.affectedRows) throw new AppError('Tarefa não encontrada.', 404);
  const [rows] = await query('SELECT * FROM tasks WHERE id = ? AND account_id = ? LIMIT 1', [taskId, accountId]);
  return rows[0];
}

async function listAllTasks(accountId, userId, { pendingOnly = false, page = 1, limit = 50 }) {
  const conditions = ['t.account_id = ?'];
  const params = [accountId];
  if (pendingOnly) { conditions.push('t.completed_at IS NULL'); }
  const offset = (page - 1) * limit;

  const [rows] = await query(
    `SELECT t.*, u.name AS user_name, l.name AS lead_name, c.case_number AS case_number FROM tasks t
     JOIN users u ON u.id = t.user_id
     LEFT JOIN leads l ON l.id = t.lead_id
     LEFT JOIN cases c ON c.id = t.case_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY t.due_date ASC, t.created_at DESC
     LIMIT ${Number(limit) | 0} OFFSET ${Number(offset) | 0}`,
    params
  );
  return rows;
}

module.exports = {
  list, create, getById, update, moveStage, archive, softDelete, getFunnelSummary,
  listNotes, addNote, deleteNote,
  listTasksByLead, createTask, completeTask, listAllTasks,
};

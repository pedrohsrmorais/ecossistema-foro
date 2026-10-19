const { query, transaction } = require('../configs/db.config');
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

async function list(accountId, { stage, search, assigned, page = 1, limit = 50 }) {
  const conditions = ['l.account_id = ?', 'l.deleted_at IS NULL'];
  const params = [accountId];

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
            l.last_contact_at, l.created_at, u.name AS assigned_name
     FROM leads l
     LEFT JOIN users u ON u.id = l.assigned_user_id
     WHERE ${where}
     ORDER BY l.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  const [[{ total }]] = await query(`SELECT COUNT(*) AS total FROM leads l WHERE ${where}`, params);

  return { data: rows, total, page, limit };
}

async function create(accountId, userId, data, channel = 'ui') {
  const { name, phone, email, stage = 'novo', source, assigned_user_id, custom_fields } = data;

  return transaction(async (conn) => {
    const [res] = await conn.execute(
      `INSERT INTO leads (id, account_id, name, phone, email, stage, source, assigned_user_id)
       VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?)`,
      [accountId, name || null, phone || null, email || null, stage, source || channel, assigned_user_id || userId]
    );
    const [[lead]] = await conn.execute('SELECT * FROM leads WHERE id = LAST_INSERT_ID() LIMIT 1');
    // Busca o ID real (UUID)
    const [[{ id: leadId }]] = await conn.execute('SELECT id FROM leads WHERE account_id = ? ORDER BY created_at DESC LIMIT 1', [accountId]);

    await _setFieldValues(conn, leadId, accountId, custom_fields);
    await _auditLog(conn, { accountId, userId, entityType: 'lead', entityId: leadId, action: 'created', channel, newValues: data });

    return { ...lead, id: leadId };
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

  return transaction(async (conn) => {
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

    return getById(leadId, accountId);
  });
}

async function moveStage(leadId, accountId, userId, stage, channel = 'ui') {
  const [[old]] = await query('SELECT stage FROM leads WHERE id = ? AND account_id = ? LIMIT 1', [leadId, accountId]);
  if (!old) throw new AppError('Lead não encontrado.', 404);

  await query('UPDATE leads SET stage = ?, last_contact_at = NOW() WHERE id = ? AND account_id = ?', [stage, leadId, accountId]);

  const [rows] = await query('SELECT * FROM leads WHERE id = ? LIMIT 1', [leadId]);
  const { pool } = require('../configs/db.config');
  const conn = await pool.getConnection();
  await _auditLog(conn, { accountId, userId, entityType: 'lead', entityId: leadId, action: 'stage_moved', channel, oldValues: { stage: old.stage }, newValues: { stage } });
  conn.release();

  return rows[0];
}

async function archive(leadId, accountId, userId, channel = 'ui') {
  await query('UPDATE leads SET archived_at = NOW() WHERE id = ? AND account_id = ?', [leadId, accountId]);
  const [rows] = await query('SELECT * FROM leads WHERE id = ? LIMIT 1', [leadId]);
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

async function addNote(leadId, accountId, userId, text, channel = 'ui') {
  await query(
    'INSERT INTO lead_notes (id, account_id, lead_id, user_id, text, channel) VALUES (UUID(), ?, ?, ?, ?, ?)',
    [accountId, leadId, userId, text, channel]
  );
  const [rows] = await query('SELECT * FROM lead_notes WHERE account_id = ? AND lead_id = ? ORDER BY created_at DESC LIMIT 1', [accountId, leadId]);
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

async function createTask(leadId, accountId, userId, { description, due_date }) {
  await query(
    'INSERT INTO tasks (id, account_id, lead_id, user_id, description, due_date) VALUES (UUID(), ?, ?, ?, ?, ?)',
    [accountId, leadId, userId, description, due_date || null]
  );
  const [rows] = await query('SELECT * FROM tasks WHERE account_id = ? ORDER BY created_at DESC LIMIT 1', [accountId]);
  return rows[0];
}

async function completeTask(taskId, accountId, userId) {
  await query('UPDATE tasks SET completed_at = NOW() WHERE id = ? AND account_id = ?', [taskId, accountId]);
  const [rows] = await query('SELECT * FROM tasks WHERE id = ? LIMIT 1', [taskId]);
  return rows[0];
}

async function listAllTasks(accountId, userId, { pendingOnly = false, page = 1, limit = 50 }) {
  const conditions = ['t.account_id = ?'];
  const params = [accountId];
  if (pendingOnly) { conditions.push('t.completed_at IS NULL'); }
  const offset = (page - 1) * limit;

  const [rows] = await query(
    `SELECT t.*, u.name AS user_name, l.name AS lead_name FROM tasks t
     JOIN users u ON u.id = t.user_id
     LEFT JOIN leads l ON l.id = t.lead_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY t.due_date ASC, t.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  return rows;
}

module.exports = {
  list, create, getById, update, moveStage, archive, softDelete, getFunnelSummary,
  listNotes, addNote, deleteNote,
  listTasksByLead, createTask, completeTask, listAllTasks,
};

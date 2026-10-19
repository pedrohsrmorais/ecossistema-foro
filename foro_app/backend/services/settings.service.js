const { query } = require('../configs/db.config');
const { AppError } = require('../middlewares/error.middleware');

async function get(accountId) {
  const [rows] = await query('SELECT id, name, slug, status, plan_id FROM accounts WHERE id = ? LIMIT 1', [accountId]);
  if (!rows.length) throw new AppError('Conta não encontrada.', 404);
  return rows[0];
}

async function update(accountId, { name }) {
  if (name) await query('UPDATE accounts SET name = ? WHERE id = ?', [name, accountId]);
  return get(accountId);
}

async function getPlan(accountId) {
  const [rows] = await query(
    `SELECT a.plan_id, a.status, a.trial_ends_at, p.name, p.price, p.max_users, p.max_leads, p.features
     FROM accounts a JOIN plans p ON p.id = a.plan_id
     WHERE a.id = ? LIMIT 1`,
    [accountId]
  );
  if (!rows.length) throw new AppError('Conta não encontrada.', 404);

  const row = rows[0];
  return {
    current: row.plan_id,
    name: row.name,
    price: Number(row.price),
    max_users: row.max_users,
    max_leads: row.max_leads,
    features: typeof row.features === 'string' ? JSON.parse(row.features) : row.features,
    account_status: row.status,
    trial_ends_at: row.trial_ends_at,
  };
}

// ─── Campos customizáveis ─────────────────────────────────────────────────────

async function listFields(accountId) {
  const [rows] = await query(
    `SELECT id, name, label, field_type, options, required, collect_via_ai,
            ai_question_hint, display_order, active, is_system
     FROM field_definitions WHERE account_id = ? ORDER BY display_order`,
    [accountId]
  );
  return rows.map(r => ({ ...r, options: r.options ? JSON.parse(r.options) : null }));
}

async function createField(accountId, { name, label, field_type, options, required, collect_via_ai, ai_question_hint, display_order }) {
  await query(
    `INSERT INTO field_definitions (id, account_id, name, label, field_type, options, required, collect_via_ai, ai_question_hint, display_order)
     VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [accountId, name, label, field_type, options ? JSON.stringify(options) : null,
      required ? 1 : 0, collect_via_ai !== false ? 1 : 0, ai_question_hint || null, display_order || 0]
  );
  const [rows] = await query('SELECT * FROM field_definitions WHERE account_id = ? ORDER BY created_at DESC LIMIT 1', [accountId]);
  return rows[0];
}

async function updateField(fieldId, accountId, data) {
  const fields = [];
  const values = [];
  const allowed = ['label','options','required','collect_via_ai','ai_question_hint','display_order','active'];
  for (const key of allowed) {
    if (data[key] !== undefined) {
      fields.push(`${key} = ?`);
      values.push(key === 'options' ? JSON.stringify(data[key]) : data[key]);
    }
  }
  if (!fields.length) throw new AppError('Nenhum campo para atualizar.', 400);
  values.push(fieldId, accountId);
  await query(`UPDATE field_definitions SET ${fields.join(', ')} WHERE id = ? AND account_id = ?`, values);
  const [rows] = await query('SELECT * FROM field_definitions WHERE id = ? LIMIT 1', [fieldId]);
  return rows[0];
}

async function deleteField(fieldId, accountId) {
  const [rows] = await query('SELECT is_system FROM field_definitions WHERE id = ? AND account_id = ? LIMIT 1', [fieldId, accountId]);
  if (!rows.length) throw new AppError('Campo não encontrado.', 404);
  if (rows[0].is_system) throw new AppError('Campos de sistema não podem ser removidos.', 400);
  await query('DELETE FROM field_definitions WHERE id = ? AND account_id = ?', [fieldId, accountId]);
}

async function reorderFields(accountId, order) {
  for (const { id, display_order } of order) {
    await query('UPDATE field_definitions SET display_order = ? WHERE id = ? AND account_id = ?', [display_order, id, accountId]);
  }
}

module.exports = { get, update, getPlan, listFields, createField, updateField, deleteField, reorderFields };

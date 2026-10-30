const { query, transaction } = require('../configs/db.config');
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

async function getPlan(accountId, userId) {
  const [rows] = await query(
    `SELECT a.plan_id AS account_plan, a.status, a.trial_ends_at, a.stripe_customer_id,
            u.plan_id AS user_plan, u.subscription_status, u.current_period_end, u.cancel_at_period_end
     FROM accounts a LEFT JOIN users u ON u.id = ? AND u.account_id = a.id WHERE a.id = ? LIMIT 1`, [userId || null, accountId]);
  if (!rows.length) throw new AppError('Conta não encontrada.', 404);
  const row = rows[0];
  // plano "mostrado": o da pessoa; no teste, o trial; sem assento numa conta paga, o plano mais alto do escritório só como referência
  const shownId = row.user_plan || (row.status === 'trialing' ? 'trial' : row.account_plan);
  const [[p]] = await query('SELECT * FROM plans WHERE id = ? LIMIT 1', [shownId]);
  return {
    current: row.user_plan || (row.status === 'trialing' ? 'trial' : null),
    name: row.user_plan || row.status === 'trialing' ? p.name : 'Sem plano',
    price: row.user_plan ? Number(p.price) : 0,
    max_users: null,
    max_leads: p.max_leads,
    ai_credits_week: row.user_plan || row.status === 'trialing' ? p.ai_credits_week : 0,
    lookups_week: p.lookups_week,
    features: typeof p.features === 'string' ? JSON.parse(p.features) : p.features,
    account_status: row.status,
    trial_ends_at: row.trial_ends_at,
    subscription: {
      status: row.subscription_status,            // active | past_due | canceled | null (da pessoa)
      current_period_end: row.current_period_end,
      cancel_at_period_end: Boolean(row.cancel_at_period_end),
      can_manage: Boolean(row.stripe_customer_id), // o escritório já tem cliente no Stripe → admin abre o portal
    },
  };
}

/** Colunas JSON do MySQL já chegam como objeto via mysql2; strings (legado/TEXT) ainda precisam de parse. */
function parseJsonCol(v) {
  if (v == null) return null;
  if (typeof v !== 'string') return v;
  try { return JSON.parse(v); } catch { return null; }
}

// ─── Campos customizáveis ─────────────────────────────────────────────────────

async function listFields(accountId) {
  const [rows] = await query(
    `SELECT id, name, label, field_type, options, required, collect_via_ai,
            ai_question_hint, display_order, active, is_system
     FROM field_definitions WHERE account_id = ? ORDER BY display_order`,
    [accountId]
  );
  return rows.map(r => ({ ...r, options: parseJsonCol(r.options) }));
}

async function createField(accountId, { name, label, field_type, options, required, collect_via_ai, ai_question_hint, display_order }) {
  await query(
    `INSERT INTO field_definitions (id, account_id, name, label, field_type, options, required, collect_via_ai, ai_question_hint, display_order)
     VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [accountId, name, label, field_type, options ? JSON.stringify(options) : null,
      required ? 1 : 0, collect_via_ai !== false ? 1 : 0, ai_question_hint || null, display_order || 0]
  );
  const [rows] = await query('SELECT * FROM field_definitions WHERE account_id = ? AND name = ? LIMIT 1', [accountId, name]);
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
  const [result] = await query(`UPDATE field_definitions SET ${fields.join(', ')} WHERE id = ? AND account_id = ?`, values);
  const [rows] = await query('SELECT * FROM field_definitions WHERE id = ? AND account_id = ? LIMIT 1', [fieldId, accountId]);
  if (!rows.length) throw new AppError('Campo não encontrado.', 404);
  return rows[0];
}

async function deleteField(fieldId, accountId) {
  const [rows] = await query('SELECT is_system FROM field_definitions WHERE id = ? AND account_id = ? LIMIT 1', [fieldId, accountId]);
  if (!rows.length) throw new AppError('Campo não encontrado.', 404);
  if (rows[0].is_system) throw new AppError('Campos de sistema não podem ser removidos.', 400);
  await query('DELETE FROM field_definitions WHERE id = ? AND account_id = ?', [fieldId, accountId]);
}

async function reorderFields(accountId, order) {
  if (!Array.isArray(order) || !order.length || order.some(o => !o || typeof o.id !== 'string' || !Number.isInteger(o.display_order) || o.display_order < 0)) {
    throw new AppError('Envie "order" como lista de { id, display_order }.', 422);
  }
  await transaction(async (conn) => {
    for (const { id, display_order } of order) {
      await conn.execute('UPDATE field_definitions SET display_order = ? WHERE id = ? AND account_id = ?', [display_order, id, accountId]);
    }
  });
}

async function listPlans() {
  const [rows] = await query(
    `SELECT id, name, price, max_users, max_leads, ai_credits_week, lookups_week, features
     FROM plans WHERE active = 1 AND purchasable = 1 ORDER BY display_order`
  );
  return rows.map(r => ({ ...r, price: Number(r.price), features: typeof r.features === 'string' ? JSON.parse(r.features) : r.features }));
}

module.exports = { listPlans, get, update, getPlan, listFields, createField, updateField, deleteField, reorderFields };

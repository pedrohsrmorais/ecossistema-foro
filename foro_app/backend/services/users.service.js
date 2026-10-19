const bcrypt = require('bcryptjs');
const { query } = require('../configs/db.config');
const { AppError } = require('../middlewares/error.middleware');

async function listByAccount(accountId) {
  const [rows] = await query(
    'SELECT id, name, email, role, active, created_at FROM users WHERE account_id = ? ORDER BY name',
    [accountId]
  );
  return rows;
}

async function getById(userId, accountId) {
  const [rows] = await query(
    'SELECT id, name, email, role, active, created_at FROM users WHERE id = ? AND account_id = ? LIMIT 1',
    [userId, accountId]
  );
  if (!rows.length) throw new AppError('Usuário não encontrado.', 404);
  return rows[0];
}

async function update(userId, accountId, data) {
  const fields = [];
  const values = [];
  if (data.name  !== undefined) { fields.push('name = ?');   values.push(data.name); }
  if (data.role  !== undefined) { fields.push('role = ?');   values.push(data.role); }
  if (data.active !== undefined) { fields.push('active = ?'); values.push(data.active ? 1 : 0); }
  if (!fields.length) throw new AppError('Nenhum campo para atualizar.', 400);

  values.push(userId, accountId);
  await query(`UPDATE users SET ${fields.join(', ')} WHERE id = ? AND account_id = ?`, values);
  return getById(userId, accountId);
}

async function changePassword(userId, currentPassword, newPassword) {
  const [rows] = await query('SELECT password_hash FROM users WHERE id = ? LIMIT 1', [userId]);
  if (!rows.length) throw new AppError('Usuário não encontrado.', 404);

  const valid = await bcrypt.compare(currentPassword, rows[0].password_hash);
  if (!valid) throw new AppError('Senha atual incorreta.', 401);

  const newHash = await bcrypt.hash(newPassword, 12);
  await query('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, userId]);
}

async function deactivate(userId, accountId) {
  await query('UPDATE users SET active = 0 WHERE id = ? AND account_id = ?', [userId, accountId]);
}

module.exports = { listByAccount, getById, update, changePassword, deactivate };

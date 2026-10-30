const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { query, transaction } = require('../configs/db.config');
const { AppError } = require('../middlewares/error.middleware');
const authService = require('./auth.service');

const ROLES = ['admin', 'user'];
const COLS = 'id, name, email, role, active, oab_number, email_verified_at, created_at';

function _shape(u) {
  const { email_verified_at, ...rest } = u;
  return { ...rest, email_verified: Boolean(email_verified_at), pending_invite: !email_verified_at };
}

async function listByAccount(accountId) {
  const [rows] = await query(`SELECT ${COLS} FROM users WHERE account_id = ? ORDER BY active DESC, name`, [accountId]);
  return rows.map(_shape);
}

async function getById(userId, accountId) {
  const [rows] = await query(`SELECT ${COLS} FROM users WHERE id = ? AND account_id = ? LIMIT 1`, [userId, accountId]);
  if (!rows.length) throw new AppError('Usuário não encontrado.', 404);
  return _shape(rows[0]);
}

async function _countActive(accountId, conn) {
  const run = conn ? conn.execute.bind(conn) : query;
  const [[{ n }]] = await run('SELECT COUNT(*) AS n FROM users WHERE account_id = ? AND active = 1', [accountId]);
  return n;
}

async function _assertUserLimit(accountId, conn) {
  const run = conn ? conn.execute.bind(conn) : query;
  if (conn) await conn.execute('SELECT id FROM accounts WHERE id = ? FOR UPDATE', [accountId]); // serializa convites simultâneos
  const [[plan]] = await run('SELECT p.max_users, p.name FROM accounts a JOIN plans p ON p.id = a.plan_id WHERE a.id = ? LIMIT 1', [accountId]);
  if (!plan || plan.max_users == null) return;
  if ((await _countActive(accountId, conn)) >= plan.max_users) {
    throw new AppError(`Limite de ${plan.max_users} usuário(s) do plano ${plan.name} atingido. Faça upgrade para convidar mais pessoas.`, 403, 'PLAN_LIMIT_USERS');
  }
}

async function _activeAdmins(accountId, conn, exceptUserId) {
  const [[{ n }]] = await conn.execute(
    "SELECT COUNT(*) AS n FROM users WHERE account_id = ? AND active = 1 AND role = 'admin' AND id <> ?",
    [accountId, exceptUserId]
  );
  return n;
}

/**
 * Convida alguém para a conta: cria o usuário (senha aleatória inutilizável) e manda um link
 * de 72h para a pessoa definir a própria senha. Respeita o limite de usuários do plano.
 */
async function invite(accountId, inviter, { name, email, role = 'user' }) {
  if (!ROLES.includes(role)) throw new AppError('Perfil inválido.', 422);

  const [exists] = await query('SELECT id FROM users WHERE email = ? LIMIT 1', [email]);
  if (exists.length) throw new AppError('Este e-mail já está cadastrado.', 409);

  const userId = uuidv4();
  const unusable = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10);
  await transaction(async (conn) => {
    await _assertUserLimit(accountId, conn);
    await conn.execute(
      'INSERT INTO users (id, account_id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, accountId, name, email, unusable, role]
    );
  });

  const [[acc]] = await query('SELECT name FROM accounts WHERE id = ? LIMIT 1', [accountId]);
  const [[inv]] = await query('SELECT name FROM users WHERE id = ? LIMIT 1', [inviter.id]);
  try {
    await authService.sendInvite({ userId, email, inviterName: inv?.name, accountName: acc?.name });
  } catch (err) {
    // O usuário foi criado; o admin pode reenviar o convite depois.
    console.error('[users] Falha ao enviar convite:', err.message);
    const e = new AppError('Usuário criado, mas o e-mail do convite não pôde ser enviado. Use "Reenviar convite".', 502, 'INVITE_EMAIL_FAILED');
    e.extra = { user: await getById(userId, accountId) };
    throw e;
  }
  return getById(userId, accountId);
}

async function resendInvite(userId, accountId, inviter) {
  const [rows] = await query('SELECT id, email, email_verified_at, active FROM users WHERE id = ? AND account_id = ? LIMIT 1', [userId, accountId]);
  if (!rows.length) throw new AppError('Usuário não encontrado.', 404);
  const u = rows[0];
  if (u.email_verified_at) throw new AppError('Este usuário já aceitou o convite.', 400);
  if (!u.active) throw new AppError('Usuário inativo.', 400);
  const [[acc]] = await query('SELECT name FROM accounts WHERE id = ? LIMIT 1', [accountId]);
  const [[inv]] = await query('SELECT name FROM users WHERE id = ? LIMIT 1', [inviter.id]);
  await authService.sendInvite({ userId, email: u.email, inviterName: inv?.name, accountName: acc?.name });
}

async function update(userId, accountId, data, actorId) {
  const fields = [];
  const values = [];
  if (data.name !== undefined) {
    const n = String(data.name || '').trim();
    if (!n) throw new AppError('Nome não pode ficar vazio.', 422);
    fields.push('name = ?'); values.push(n);
  }
  if (data.oab_number !== undefined) {
    const o = String(data.oab_number || '').trim().slice(0, 30);
    fields.push('oab_number = ?'); values.push(o || null);
  }
  if (data.role !== undefined && !ROLES.includes(data.role)) throw new AppError('Perfil inválido.', 422);
  if (data.role !== undefined) { fields.push('role = ?'); values.push(data.role); }
  if (data.active !== undefined) { fields.push('active = ?'); values.push(data.active ? 1 : 0); }
  if (!fields.length) throw new AppError('Nenhum campo para atualizar.', 400);

  await transaction(async (conn) => {
    const [rows] = await conn.execute('SELECT id, role, active FROM users WHERE id = ? AND account_id = ? FOR UPDATE', [userId, accountId]);
    if (!rows.length) throw new AppError('Usuário não encontrado.', 404);
    const cur = rows[0];
    const losesAdmin = cur.active && cur.role === 'admin' &&
      ((data.role !== undefined && data.role !== 'admin') || (data.active !== undefined && !data.active));
    if (losesAdmin && (await _activeAdmins(accountId, conn, userId)) === 0) {
      throw new AppError('A conta precisa de pelo menos um administrador ativo.', 400, 'LAST_ADMIN');
    }
    if (actorId === userId && data.active === false) throw new AppError('Você não pode desativar a si mesmo.', 400);
    if (data.active && !cur.active) await _assertUserLimit(accountId, conn); // reativar também conta no limite
    await conn.execute(`UPDATE users SET ${fields.join(', ')} WHERE id = ? AND account_id = ?`, [...values, userId, accountId]);
  });
  return getById(userId, accountId);
}

async function changePassword(userId, currentPassword, newPassword) {
  const [rows] = await query('SELECT password_hash FROM users WHERE id = ? LIMIT 1', [userId]);
  if (!rows.length) throw new AppError('Usuário não encontrado.', 404);

  const valid = await bcrypt.compare(String(currentPassword || ''), rows[0].password_hash);
  if (!valid) throw new AppError('Senha atual incorreta.', 400);

  const newHash = await bcrypt.hash(newPassword, 12);
  await query('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, userId]);
}

async function deactivate(userId, accountId, actorId) {
  await update(userId, accountId, { active: false }, actorId);
}

module.exports = { listByAccount, getById, invite, resendInvite, update, changePassword, deactivate };

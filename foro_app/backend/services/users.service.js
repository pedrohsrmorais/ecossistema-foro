const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { query, transaction } = require('../configs/db.config');
const { AppError } = require('../middlewares/error.middleware');
const authService = require('./auth.service');

const permissions = require('../configs/permissions');
const ROLES = ['admin', 'user'];
const COLS = 'id, name, email, role, active, oab_number, permissions, email_verified_at, created_at, (SELECT a.owner_user_id FROM accounts a WHERE a.id = users.account_id) AS owner_user_id, (SELECT a.member_defaults FROM accounts a WHERE a.id = users.account_id) AS member_defaults';

function _shape(u) {
  const { email_verified_at, permissions: stored, owner_user_id, member_defaults, ...rest } = u;
  return { ...rest, is_owner: owner_user_id === u.id, permissions: permissions.resolve(u.role, stored, member_defaults), email_verified: Boolean(email_verified_at), pending_invite: !email_verified_at };
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

const seats = require('./seats.service');
const _assertUserLimit = (accountId, conn) => seats.assertCanAddUser(accountId, conn);

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

  const [[acct]] = await query('SELECT kind FROM accounts WHERE id = ? LIMIT 1', [accountId]);
  if (acct?.kind !== 'office') throw new AppError('Crie um escritório para convidar pessoas. O espaço pessoal é só seu.', 403, 'PERSONAL_SPACE');
  const [mine] = await query('SELECT id FROM users WHERE email = ? AND account_id = ? LIMIT 1', [email, accountId]);
  if (mine.length) throw new AppError('Esta pessoa já faz parte do escritório.', 409);

  // A pessoa já tem conta em outro workspace: ganha também uma participação neste escritório (entra direto, sem novo cadastro).
  const [known] = await query('SELECT id, person_id, name, phone, password_hash, email_verified_at, oab_number FROM users WHERE email = ? AND email_verified_at IS NOT NULL ORDER BY created_at ASC LIMIT 1', [email]);
  if (known.length) {
    const k = known[0];
    const memberId = uuidv4();
    await transaction(async (conn) => {
      await _assertUserLimit(accountId, conn);
      await conn.execute(
        'INSERT INTO users (id, account_id, person_id, name, email, phone, password_hash, role, email_verified_at, oab_number) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [memberId, accountId, k.person_id || k.id, k.name, email, k.phone, k.password_hash, role, k.email_verified_at, k.oab_number]
      );
    });
    const [[acc2]] = await query('SELECT name FROM accounts WHERE id = ? LIMIT 1', [accountId]);
    const [[inv2]] = await query('SELECT name FROM users WHERE id = ? LIMIT 1', [inviter.id]);
    Promise.resolve(require('./email.service').sendAddedToOfficeEmail(email, { inviterName: inv2?.name, accountName: acc2?.name })).catch(() => {});
    const out = await getById(memberId, accountId);
    return { ...out, added_existing: true };
  }
  const [anyRow] = await query('SELECT id FROM users WHERE email = ? LIMIT 1', [email]);
  if (anyRow.length) throw new AppError('Este e-mail tem um cadastro ainda não confirmado. Peça para a pessoa confirmar o e-mail e tente de novo.', 409);

  const userId = uuidv4();
  const unusable = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10);
  await transaction(async (conn) => {
    await _assertUserLimit(accountId, conn);
    await conn.execute(
      'INSERT INTO users (id, account_id, person_id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [userId, accountId, userId, name, email, unusable, role]
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
  if (data.permissions !== undefined) {
    fields.push("permissions = JSON_MERGE_PATCH(COALESCE(permissions, JSON_OBJECT()), CAST(? AS JSON))"); values.push(JSON.stringify(permissions.sanitize(data.permissions))); // mescla: só muda as chaves enviadas
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
    const [[acc]] = await conn.execute('SELECT owner_user_id FROM accounts WHERE id = ? LIMIT 1', [accountId]);
    if (acc?.owner_user_id === userId && ((data.role !== undefined && data.role !== 'admin') || (data.active !== undefined && !data.active))) {
      throw new AppError('O administrador principal do escritório não pode ser rebaixado nem desativado.', 400, 'OWNER_PROTECTED');
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
  await require('./person.service').syncCredentials(userId, { passwordHash: newHash });
}

async function deactivate(userId, accountId, actorId) {
  await update(userId, accountId, { active: false }, actorId);
}

module.exports = { listByAccount, getById, invite, resendInvite, update, changePassword, deactivate };

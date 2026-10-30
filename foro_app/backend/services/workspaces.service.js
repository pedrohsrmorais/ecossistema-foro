/**
 * workspaces.service.js — troca entre o espaço pessoal e os escritórios da MESMA pessoa.
 * Cada workspace é uma linha em users (mesmo person_id) com papel, permissões e plano próprios;
 * trocar = emitir um token para outra linha. Todo o resto (isolamento por conta, regras do escritório,
 * IA, plano) acompanha o workspace ativo automaticamente.
 */
const { v4: uuidv4 } = require('uuid');
const { query, transaction } = require('../configs/db.config');
const { AppError } = require('../middlewares/error.middleware');
const auth = require('./auth.service');

async function _ensurePersonal(user) {
  const [[me]] = await query('SELECT person_id, name, email, phone, password_hash, email_verified_at, oab_number FROM users WHERE id = ? LIMIT 1', [user.id]);
  const personId = me.person_id || user.id;
  const [has] = await query("SELECT 1 FROM users u JOIN accounts a ON a.id = u.account_id WHERE u.person_id = ? AND a.kind = 'personal' AND u.active = 1 LIMIT 1", [personId]);
  if (has.length) return;
  await transaction(async (conn) => {
    await auth.createPersonalSpace(conn, {
      userId: uuidv4(), personId, name: me.name, email: me.email, phone: me.phone, passwordHash: me.password_hash,
      emailVerifiedAt: me.email_verified_at, oab: me.oab_number, touch: false, // criado em segundo plano: não vira o "último workspace usado"
    });
  });
}

async function list(user) {
  await _ensurePersonal(user);
  const [[me]] = await query('SELECT person_id FROM users WHERE id = ? LIMIT 1', [user.id]);
  const [rows] = await query(
    `SELECT u.id AS user_id, u.account_id, u.role, a.kind, a.name, a.owner_user_id, a.status,
            (SELECT COUNT(*) FROM users x WHERE x.account_id = a.id AND x.active = 1) AS members
     FROM users u JOIN accounts a ON a.id = u.account_id
     WHERE u.person_id = ? AND u.active = 1 AND a.status NOT IN ('cancelled')
     ORDER BY (a.kind = 'personal') DESC, a.name ASC`, [me.person_id]);
  return rows.map(r => ({
    user_id: r.user_id, account_id: r.account_id, kind: r.kind, role: r.role,
    name: r.kind === 'personal' ? 'Espaço pessoal' : r.name,
    is_owner: r.owner_user_id === r.user_id, members: Number(r.members), is_current: r.user_id === user.id,
  }));
}

/** Troca de workspace: só para linhas da própria pessoa. Devolve o novo token. */
async function switchTo(user, targetUserId) {
  const [[me]] = await query('SELECT person_id FROM users WHERE id = ? LIMIT 1', [user.id]);
  const [rows] = await query(
    `SELECT u.id, u.account_id, u.role, u.email, u.name FROM users u JOIN accounts a ON a.id = u.account_id
     WHERE u.id = ? AND u.person_id = ? AND u.active = 1 AND a.status <> 'cancelled' LIMIT 1`, [targetUserId, me.person_id]);
  if (!rows.length) throw new AppError('Workspace não encontrado.', 404);
  const t = rows[0];
  await query('UPDATE users SET last_used_at = NOW(3) WHERE id = ?', [t.id]);
  return { token: auth.generateToken({ id: t.id, account_id: t.account_id, role: t.role, email: t.email }), user_id: t.id, account_id: t.account_id };
}

/** Sair de um escritório (desativa a participação). Não vale para o espaço pessoal nem para o dono. */
async function leave(user, targetUserId) {
  const [[me]] = await query('SELECT person_id FROM users WHERE id = ? LIMIT 1', [user.id]);
  const [rows] = await query(
    `SELECT u.id, u.account_id, u.role, a.kind, a.owner_user_id FROM users u JOIN accounts a ON a.id = u.account_id
     WHERE u.id = ? AND u.person_id = ? AND u.active = 1 LIMIT 1`, [targetUserId, me.person_id]);
  if (!rows.length) throw new AppError('Workspace não encontrado.', 404);
  const t = rows[0];
  if (t.kind === 'personal') throw new AppError('O espaço pessoal não pode ser abandonado.', 400);
  if (t.owner_user_id === t.id) throw new AppError('Quem criou o escritório não pode sair dele. Transfira a administração ou fale com o suporte.', 400, 'OWNER_CANNOT_LEAVE');
  if (t.role === 'admin') {
    const [[{ n }]] = await query("SELECT COUNT(*) AS n FROM users WHERE account_id = ? AND active = 1 AND role = 'admin' AND id <> ?", [t.account_id, t.id]);
    if (!n) throw new AppError('Você é o único administrador deste escritório.', 400);
  }
  await query('UPDATE users SET active = 0 WHERE id = ?', [t.id]);
  const personal = (await list({ id: me.person_id === user.id ? user.id : user.id })).find(w => w.kind === 'personal');
  return { switch_to: personal?.user_id || null };
}

module.exports = { list, switchTo, leave };

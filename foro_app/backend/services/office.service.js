const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { query, transaction } = require('../configs/db.config');
const { AppError } = require('../middlewares/error.middleware');
const { isValidCnpj } = require('../utils/documentValidator');

const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sem 0/O/1/I
function genCode() { let s = ''; for (let i = 0; i < 8; i++) s += ALPHA[crypto.randomInt(0, ALPHA.length)]; return s; }
const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

function _clean(data) {
  const out = {};
  if (data.name !== undefined) {
    const n = String(data.name || '').trim();
    if (n.length < 2) throw new AppError('Informe o nome do escritório.', 422);
    out.name = n.slice(0, 255);
  }
  if (data.cnpj !== undefined) {
    const d = String(data.cnpj || '').replace(/\D/g, '');
    if (d && !isValidCnpj(d)) throw new AppError('CNPJ inválido. Confira os números ou deixe em branco.', 422);
    out.cnpj = d ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : null;
  }
  for (const [k, max] of [['address', 255], ['city', 100], ['office_phone', 30]]) {
    if (data[k] !== undefined) out[k] = String(data[k] || '').trim().slice(0, max) || null;
  }
  if (data.state !== undefined) {
    const s = String(data.state || '').trim().toUpperCase();
    if (s && !UFS.includes(s)) throw new AppError('UF inválida.', 422);
    out.state = s || null;
  }
  return out;
}

async function _uniqueCode(conn) {
  for (let i = 0; i < 8; i++) {
    const c = genCode();
    const [r] = await conn.execute('SELECT 1 FROM accounts WHERE office_code = ? LIMIT 1', [c]);
    if (!r.length) return c;
  }
  throw new AppError('Não foi possível gerar o código. Tente novamente.', 500);
}

async function get(accountId, user) {
  const [[a]] = await query(
    `SELECT a.id, a.name, a.office_configured, a.office_code, a.cnpj, a.address, a.city, a.state, a.office_phone, a.owner_user_id, a.created_at,
            a.plan_id, p.name AS plan_name, p.max_users, a.status, a.trial_ends_at
     FROM accounts a JOIN plans p ON p.id = a.plan_id WHERE a.id = ? LIMIT 1`, [accountId]);
  if (!a) throw new AppError('Escritório não encontrado.', 404);
  const [[{ used }]] = await query('SELECT COUNT(*) AS used FROM users WHERE account_id = ? AND active = 1', [accountId]);
  const isAdmin = user.role === 'admin';
  const out = {
    configured: Boolean(a.office_configured), id: a.id, name: a.name, cnpj: a.cnpj, address: a.address, city: a.city, state: a.state, phone: a.office_phone,
    owner_user_id: a.owner_user_id, created_at: a.created_at,
    plan: { id: a.plan_id, name: a.plan_name, max_users: null, status: a.status, trial_ends_at: a.trial_ends_at },
    seats_used: used, is_admin: isAdmin,
  };
  if (isAdmin) {
    out.code = a.office_code;
    const [[{ n }]] = await query("SELECT COUNT(*) AS n FROM office_join_requests WHERE account_id = ? AND status = 'pending'", [accountId]);
    out.pending_requests = n;
  }
  if (!a.office_configured) {
    const [r] = await query(
      `SELECT r.id, r.created_at, t.name AS office_name FROM office_join_requests r JOIN accounts t ON t.id = r.account_id
       WHERE r.user_id = ? AND r.status = 'pending' ORDER BY r.created_at DESC LIMIT 1`, [user.id]);
    out.my_join_request = r[0] || null;
  }
  return out;
}

/** Cria o escritório: só nome é obrigatório. Vale para a conta rascunho do próprio usuário. */
async function create(accountId, user, data) {
  if (user.role !== 'admin') throw new AppError('Apenas o administrador pode criar o escritório.', 403);
  const clean = _clean({ ...data, name: data.name });
  await transaction(async (conn) => {
    const [[a]] = await conn.execute('SELECT office_configured FROM accounts WHERE id = ? FOR UPDATE', [accountId]);
    if (!a) throw new AppError('Conta não encontrada.', 404);
    if (a.office_configured) throw new AppError('Você já tem um escritório.', 409, 'OFFICE_EXISTS');
    const code = await _uniqueCode(conn);
    const trialEnds = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    const sets = Object.keys(clean).map(k => `${k} = ?`);
    await conn.execute(
      `UPDATE accounts SET ${sets.join(', ')}, office_configured = 1, office_code = ?, trial_ends_at = ?, plan_started_at = ? WHERE id = ?`,
      [...Object.values(clean), code, trialEnds, new Date(), accountId]);
    await conn.execute("UPDATE office_join_requests SET status = 'rejected', decided_at = NOW() WHERE user_id = ? AND status = 'pending'", [user.id]);
  });
  return get(accountId, user);
}

async function update(accountId, user, data) {
  const clean = _clean(data);
  if (!Object.keys(clean).length) throw new AppError('Nenhum campo para atualizar.', 400);
  const sets = Object.keys(clean).map(k => `${k} = ?`);
  await query(`UPDATE accounts SET ${sets.join(', ')} WHERE id = ? AND office_configured = 1`, [...Object.values(clean), accountId]);
  return get(accountId, user);
}

async function regenerateCode(accountId, user) {
  await transaction(async (conn) => {
    const code = await _uniqueCode(conn);
    await conn.execute('UPDATE accounts SET office_code = ? WHERE id = ? AND office_configured = 1', [code, accountId]);
    await conn.execute("UPDATE office_join_requests SET status = 'rejected', decided_at = NOW() WHERE account_id = ? AND status = 'pending'", [accountId]);
  });
  return get(accountId, user);
}

/** Usuário sem escritório pede para entrar usando o código. O admin do escritório aprova. */
async function requestJoin(accountId, user, rawCode) {
  const code = String(rawCode || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length < 6) throw new AppError('Código inválido.', 422);
  const [[mine]] = await query('SELECT office_configured FROM accounts WHERE id = ? LIMIT 1', [accountId]);
  if (mine?.office_configured) throw new AppError('Você já faz parte de um escritório.', 409);
  const [t] = await query("SELECT id, name, status FROM accounts WHERE office_code = ? AND office_configured = 1 LIMIT 1", [code]);
  if (!t.length || ['cancelled', 'suspended'].includes(t[0].status)) throw new AppError('Código não encontrado. Confira com o administrador do escritório.', 404, 'CODE_NOT_FOUND');
  const [dup] = await query("SELECT id FROM office_join_requests WHERE user_id = ? AND account_id = ? AND status = 'pending' LIMIT 1", [user.id, t[0].id]);
  if (dup.length) throw new AppError('Você já pediu para entrar neste escritório. Aguarde a aprovação.', 409);
  // um pedido pendente por vez
  await query("UPDATE office_join_requests SET status = 'rejected', decided_at = NOW() WHERE user_id = ? AND status = 'pending'", [user.id]);
  await query('INSERT INTO office_join_requests (id, account_id, user_id) VALUES (?, ?, ?)', [uuidv4(), t[0].id, user.id]);
  return { office_name: t[0].name };
}

async function cancelRequest(user) {
  await query("UPDATE office_join_requests SET status = 'rejected', decided_at = NOW() WHERE user_id = ? AND status = 'pending'", [user.id]);
}

async function listRequests(accountId) {
  const [rows] = await query(
    `SELECT r.id, r.created_at, u.name, u.email FROM office_join_requests r JOIN users u ON u.id = r.user_id
     WHERE r.account_id = ? AND r.status = 'pending' ORDER BY r.created_at ASC`, [accountId]);
  return rows;
}

async function decide(accountId, requestId, approve, actorId) {
  return transaction(async (conn) => {
    const [[r]] = await conn.execute("SELECT * FROM office_join_requests WHERE id = ? AND account_id = ? AND status = 'pending' FOR UPDATE", [requestId, accountId]);
    if (!r) throw new AppError('Pedido não encontrado.', 404);
    if (!approve) {
      await conn.execute("UPDATE office_join_requests SET status = 'rejected', decided_at = NOW(), decided_by = ? WHERE id = ?", [actorId, requestId]);
      return { status: 'rejected' };
    }
    await conn.execute('SELECT id FROM accounts WHERE id = ? FOR UPDATE', [accountId]);
    await require('./seats.service').assertCanAddUser(accountId, conn);
    const [[u]] = await conn.execute('SELECT id, account_id FROM users WHERE id = ? FOR UPDATE', [r.user_id]);
    if (!u) throw new AppError('Usuário não existe mais.', 404);
    const oldAccount = u.account_id;
    const [[old]] = await conn.execute('SELECT office_configured FROM accounts WHERE id = ? LIMIT 1', [oldAccount]);
    if (old?.office_configured) throw new AppError('Este usuário já entrou em outro escritório.', 409);
    await conn.execute("UPDATE users SET account_id = ?, role = 'user', permissions = NULL WHERE id = ?", [accountId, u.id]);
    await conn.execute("UPDATE office_join_requests SET status = 'approved', decided_at = NOW(), decided_by = ? WHERE id = ?", [actorId, requestId]);
    await conn.execute("UPDATE office_join_requests SET status = 'rejected', decided_at = NOW() WHERE user_id = ? AND status = 'pending'", [u.id]);
    // descarta a conta rascunho vazia
    const [[left]] = await conn.execute('SELECT COUNT(*) AS n FROM users WHERE account_id = ?', [oldAccount]);
    if (old && left.n === 0) await conn.execute('DELETE FROM accounts WHERE id = ? AND office_configured = 0', [oldAccount]);
    return { status: 'approved' };
  });
}

// ─── Atividade (tempo ativo na aba + ações) ───────────────────────────────────

const MAX_CREDIT = 90;
/** Heartbeat do front a cada ~60 s com a aba visível e interação recente. Crédito limitado pelo servidor. */
async function ping(user, accountId) {
  const [[row]] = await query('SELECT last_ping_at FROM user_activity WHERE user_id = ? AND day = CURDATE()', [user.id]);
  const now = Date.now();
  let credit = 30; // primeiro ping do dia
  if (row?.last_ping_at) {
    const diff = Math.floor((now - new Date(row.last_ping_at).getTime()) / 1000);
    credit = diff < 20 ? 0 : (diff <= MAX_CREDIT ? diff : 30);
  }
  await query(
    `INSERT INTO user_activity (user_id, day, account_id, seconds, last_seen_at, last_ping_at) VALUES (?, CURDATE(), ?, ?, NOW(), NOW())
     ON DUPLICATE KEY UPDATE seconds = seconds + VALUES(seconds), last_seen_at = NOW(), last_ping_at = NOW(), account_id = VALUES(account_id)`,
    [user.id, accountId, credit]);
}
async function countAction(userId, accountId) {
  await query(
    `INSERT INTO user_activity (user_id, day, account_id, actions, last_seen_at) VALUES (?, CURDATE(), ?, 1, NOW())
     ON DUPLICATE KEY UPDATE actions = actions + 1, last_seen_at = NOW()`, [userId, accountId]);
}

function level(secondsPerDay) {
  const m = secondsPerDay / 60;
  if (m <= 0) return 'inativo';
  if (m < 10) return 'baixo';
  if (m < 60) return 'médio';
  return 'alto';
}

async function activityReport(accountId, days = 30) {
  days = Math.min(Math.max(parseInt(days, 10) || 30, 1), 180);
  const [users] = await query('SELECT id, name, email, role, active FROM users WHERE account_id = ? ORDER BY active DESC, name', [accountId]);
  const [act] = await query(
    `SELECT user_id, SUM(seconds) AS seconds, SUM(actions) AS actions, SUM(seconds > 0) AS active_days, MAX(last_seen_at) AS last_seen
     FROM user_activity WHERE account_id = ? AND day > DATE_SUB(CURDATE(), INTERVAL ? DAY) GROUP BY user_id`, [accountId, days]);
  const [seen] = await query('SELECT user_id, MAX(last_seen_at) AS last_seen FROM user_activity WHERE account_id = ? GROUP BY user_id', [accountId]);
  const [ai] = await query(
    `SELECT user_id, SUM(credits) AS credits, COUNT(*) AS calls FROM ai_usage WHERE account_id = ? AND created_at > DATE_SUB(NOW(), INTERVAL ? DAY) GROUP BY user_id`, [accountId, days]);
  const [docs] = await query(
    `SELECT created_by AS user_id, COUNT(*) AS n FROM documents WHERE account_id = ? AND deleted_at IS NULL AND created_at > DATE_SUB(NOW(), INTERVAL ? DAY) GROUP BY created_by`, [accountId, days]);
  const [cases] = await query('SELECT responsible_user_id AS user_id, COUNT(*) AS n FROM cases WHERE account_id = ? AND deleted_at IS NULL GROUP BY responsible_user_id', [accountId]);
  const [series] = await query(
    `SELECT day, SUM(seconds) AS seconds FROM user_activity WHERE account_id = ? AND day > DATE_SUB(CURDATE(), INTERVAL ? DAY) GROUP BY day ORDER BY day`, [accountId, days]);
  const idx = (arr, k = 'user_id') => Object.fromEntries(arr.map(r => [r[k], r]));
  const A = idx(act), S = idx(seen), I = idx(ai), D = idx(docs), C = idx(cases);
  const list = users.map(u => {
    const a = A[u.id] || {};
    const seconds = Number(a.seconds || 0);
    return {
      user_id: u.id, name: u.name, email: u.email, role: u.role, active: Boolean(u.active),
      seconds, active_days: Number(a.active_days || 0), actions: Number(a.actions || 0),
      last_seen_at: S[u.id]?.last_seen || null,
      level: level(seconds / days),
      ai_credits: Number(I[u.id]?.credits || 0), ai_calls: Number(I[u.id]?.calls || 0),
      documents_created: Number(D[u.id]?.n || 0), cases_responsible: Number(C[u.id]?.n || 0),
    };
  });
  return { days, users: list, series: series.map(s => ({ day: s.day, seconds: Number(s.seconds) })) };
}

module.exports = { genCode, get, create, update, regenerateCode, requestJoin, cancelRequest, listRequests, decide, ping, countAction, activityReport };

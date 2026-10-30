const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { query, transaction } = require('../configs/db.config');
const { AppError } = require('../middlewares/error.middleware');
const { isValidCnpj } = require('../utils/documentValidator');
const permissions = require('../configs/permissions');

const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sem 0/O/1/I
function genCode() { let s = ''; for (let i = 0; i < 8; i++) s += ALPHA[crypto.randomInt(0, ALPHA.length)]; return s; }
const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

function _clean(data) {
  data = { ...data };
  if (data.email !== undefined && data.office_email === undefined) data.office_email = data.email;
  if (data.phone !== undefined && data.office_phone === undefined) data.office_phone = data.phone;
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
  for (const [k, max] of [['address', 255], ['city', 100], ['office_phone', 30], ['legal_name', 255], ['website', 255], ['address_number', 20], ['address_complement', 100], ['district', 100], ['oab_society', 40]]) {
    if (data[k] !== undefined) out[k] = String(data[k] || '').trim().slice(0, max) || null;
  }
  if (data.office_email !== undefined) {
    const e = String(data.office_email || '').trim().toLowerCase();
    if (e && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new AppError('E-mail do escritório inválido.', 422);
    out.office_email = e || null;
  }
  if (data.zip_code !== undefined) {
    const z = String(data.zip_code || '').replace(/\D/g, '');
    if (z && z.length !== 8) throw new AppError('CEP inválido (8 números).', 422);
    out.zip_code = z ? z.replace(/^(\d{5})(\d{3})$/, '$1-$2') : null;
  }
  if (data.founded_on !== undefined) {
    const f = String(data.founded_on || '').slice(0, 10);
    if (f && (!/^\d{4}-\d{2}-\d{2}$/.test(f) || isNaN(Date.parse(f)) || new Date(f) > new Date())) throw new AppError('Data de fundação inválida.', 422);
    out.founded_on = f || null;
  }
  for (const k of ['headcount_total', 'headcount_lawyers']) {
    if (data[k] !== undefined) {
      if (data[k] === null || data[k] === '') { out[k] = null; continue; }
      const n = Number(data[k]);
      if (!Number.isInteger(n) || n < 0 || n > 100000) throw new AppError('Quantidade de integrantes inválida.', 422);
      out[k] = n;
    }
  }
  if (data.practice_areas !== undefined) {
    const arr = Array.isArray(data.practice_areas) ? data.practice_areas : [];
    out.practice_areas = JSON.stringify([...new Set(arr.map(x => String(x || '').trim().slice(0, 60)).filter(Boolean))].slice(0, 20));
  }
  if (data.notes !== undefined) out.notes = String(data.notes || '').trim().slice(0, 2000) || null;
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

const PROFILE_COLS = `a.id, a.name, a.kind, a.office_configured, a.office_code, a.cnpj, a.address, a.city, a.state, a.office_phone, a.owner_user_id, a.created_at,
  a.legal_name, a.website, a.office_email, a.zip_code, a.address_number, a.address_complement, a.district, a.oab_society, a.founded_on,
  a.practice_areas, a.headcount_total, a.headcount_lawyers, a.notes, a.member_defaults, a.plan_id, p.name AS plan_name, a.status, a.trial_ends_at`;
const MAX_OWNED_OFFICES = 3; // evita criar escritórios em série só para ganhar teste grátis (cada um dá créditos de IA)

function _json(v, fallback) { if (v == null) return fallback; if (typeof v === 'object') return v; try { return JSON.parse(v); } catch { return fallback; } }

async function get(accountId, user) {
  const [[a]] = await query(`SELECT ${PROFILE_COLS} FROM accounts a JOIN plans p ON p.id = a.plan_id WHERE a.id = ? LIMIT 1`, [accountId]);
  if (!a) throw new AppError('Escritório não encontrado.', 404);
  const [[{ used }]] = await query('SELECT COUNT(*) AS used FROM users WHERE account_id = ? AND active = 1', [accountId]);
  const [[{ pend }]] = await query('SELECT COUNT(*) AS pend FROM users WHERE account_id = ? AND active = 1 AND email_verified_at IS NULL', [accountId]);
  const isAdmin = user.role === 'admin';
  const out = {
    configured: true, kind: a.kind, id: a.id, name: a.kind === 'personal' ? 'Espaço pessoal' : a.name, cnpj: a.cnpj, address: a.address, city: a.city, state: a.state, phone: a.office_phone,
    legal_name: a.legal_name, website: a.website, email: a.office_email, zip_code: a.zip_code, address_number: a.address_number, address_complement: a.address_complement,
    district: a.district, oab_society: a.oab_society, founded_on: a.founded_on ? new Date(a.founded_on).toISOString().slice(0, 10) : null,
    practice_areas: _json(a.practice_areas, []), headcount_total: a.headcount_total, headcount_lawyers: a.headcount_lawyers, notes: a.notes,
    owner_user_id: a.owner_user_id, created_at: a.created_at,
    plan: { id: a.plan_id, name: a.plan_name, max_users: null, status: a.status, trial_ends_at: a.trial_ends_at },
    seats_used: used, members_on_platform: used, pending_invites: pend, is_admin: isAdmin,
  };
  if (isAdmin && a.kind === 'office') {
    out.code = a.office_code;
    const [[{ n }]] = await query("SELECT COUNT(*) AS n FROM office_join_requests WHERE account_id = ? AND status = 'pending'", [accountId]);
    out.pending_requests = n;
    out.member_defaults = permissions.sanitize(_json(a.member_defaults, {}));
  }
  // pedido de entrada em andamento feito por esta pessoa (de qualquer workspace)
  const [r] = await query(
    `SELECT r.id, r.created_at, t.name AS office_name FROM office_join_requests r JOIN accounts t ON t.id = r.account_id
     JOIN users ru ON ru.id = r.user_id WHERE ru.person_id = (SELECT person_id FROM users WHERE id = ?) AND r.status = 'pending' ORDER BY r.created_at DESC LIMIT 1`, [user.id]);
  out.my_join_request = r[0] || null;
  return out;
}

/** Cria um NOVO escritório para a pessoa (ela vira admin/dona) e devolve o token do novo workspace. Vale a partir de qualquer workspace. */
async function create(user, data) {
  const clean = _clean({ ...data, name: data.name });
  const created = await transaction(async (conn) => {
    const [[me]] = await conn.execute('SELECT person_id, name, email, phone, password_hash, email_verified_at, oab_number FROM users WHERE id = ? FOR UPDATE', [user.id]);
    const personId = me.person_id || user.id;
    const [[{ owned }]] = await conn.execute(
      "SELECT COUNT(*) AS owned FROM accounts a JOIN users u ON u.id = a.owner_user_id WHERE u.person_id = ? AND a.kind = 'office' AND a.status <> 'cancelled'", [personId]);
    if (owned >= MAX_OWNED_OFFICES) throw new AppError(`Você já criou ${MAX_OWNED_OFFICES} escritórios. Fale com o suporte para criar mais.`, 403, 'OFFICE_LIMIT');
    const accountId = uuidv4();
    const userId = uuidv4();
    const code = await _uniqueCode(conn);
    const trialEnds = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    const slug = clean.name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').slice(0, 40);
    const cols = Object.keys(clean);
    await conn.execute(
      `INSERT INTO accounts (id, slug, plan_id, plan_started_at, trial_ends_at, office_configured, office_code, kind${cols.length ? ', ' + cols.join(', ') : ''}) VALUES (?, ?, 'trial', ?, ?, 1, ?, 'office'${cols.map(() => ', ?').join('')})`,
      [accountId, `${slug}-${accountId.slice(0, 8)}`, new Date(), trialEnds, code, ...Object.values(clean)]);
    await conn.execute(
      "INSERT INTO users (id, account_id, person_id, name, email, phone, password_hash, role, email_verified_at, oab_number, last_used_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'admin', ?, ?, NOW(3))",
      [userId, accountId, personId, me.name, me.email, me.phone, me.password_hash, me.email_verified_at, me.oab_number]);
    await conn.execute('UPDATE accounts SET owner_user_id = ? WHERE id = ?', [userId, accountId]);
    await require('./auth.service').seedAccount(conn, accountId);
    await conn.execute("UPDATE office_join_requests SET status = 'rejected', decided_at = NOW() WHERE user_id IN (SELECT id FROM users WHERE person_id = ?) AND status = 'pending'", [personId]);
    return { accountId, userId, email: me.email };
  });
  const token = require('./auth.service').generateToken({ id: created.userId, account_id: created.accountId, role: 'admin', email: created.email });
  return { token, user_id: created.userId, account_id: created.accountId };
}

async function update(accountId, user, data) {
  const [[acc]] = await query('SELECT kind FROM accounts WHERE id = ? LIMIT 1', [accountId]);
  if (acc?.kind !== 'office') throw new AppError('Os dados cadastrais valem para escritórios. Crie um escritório para preenchê-los.', 400, 'PERSONAL_SPACE');
  const clean = _clean(data);
  if (!Object.keys(clean).length) throw new AppError('Nenhum campo para atualizar.', 400);
  const sets = Object.keys(clean).map(k => `${k} = ?`);
  await query(`UPDATE accounts SET ${sets.join(', ')} WHERE id = ?`, [...Object.values(clean), accountId]);
  return get(accountId, user);
}

/** Governança: padrão de permissões dos membros deste escritório (cada pessoa ainda pode ter ajuste individual). */
async function setGovernance(accountId, user, memberDefaults) {
  const [[acc]] = await query('SELECT kind FROM accounts WHERE id = ? LIMIT 1', [accountId]);
  if (acc?.kind !== 'office') throw new AppError('Regras de governança valem para escritórios.', 400, 'PERSONAL_SPACE');
  const clean = permissions.sanitize(memberDefaults);
  await query('UPDATE accounts SET member_defaults = ? WHERE id = ?', [JSON.stringify(clean), accountId]);
  return get(accountId, user);
}

async function regenerateCode(accountId, user) {
  await transaction(async (conn) => {
    const code = await _uniqueCode(conn);
    await conn.execute("UPDATE accounts SET office_code = ? WHERE id = ? AND kind = 'office'", [code, accountId]);
    await conn.execute("UPDATE office_join_requests SET status = 'rejected', decided_at = NOW() WHERE account_id = ? AND status = 'pending'", [accountId]);
  });
  return get(accountId, user);
}

/** Pedido de entrada por código (a partir de qualquer workspace da pessoa). O admin do escritório aprova. */
async function requestJoin(accountId, user, rawCode) {
  const code = String(rawCode || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length < 6) throw new AppError('Código inválido.', 422);
  const [t] = await query("SELECT id, name, status FROM accounts WHERE office_code = ? AND kind = 'office' LIMIT 1", [code]);
  if (!t.length || ['cancelled', 'suspended'].includes(t[0].status)) throw new AppError('Código não encontrado. Confira com o administrador do escritório.', 404, 'CODE_NOT_FOUND');
  const [[me]] = await query('SELECT person_id FROM users WHERE id = ? LIMIT 1', [user.id]);
  const personId = me.person_id || user.id;
  const [member] = await query('SELECT 1 FROM users WHERE person_id = ? AND account_id = ? AND active = 1 LIMIT 1', [personId, t[0].id]);
  if (member.length) throw new AppError('Você já faz parte deste escritório.', 409, 'ALREADY_MEMBER');
  const [dup] = await query(
    "SELECT r.id FROM office_join_requests r JOIN users ru ON ru.id = r.user_id WHERE ru.person_id = ? AND r.account_id = ? AND r.status = 'pending' LIMIT 1", [personId, t[0].id]);
  if (dup.length) throw new AppError('Você já pediu para entrar neste escritório. Aguarde a aprovação.', 409);
  await query('INSERT INTO office_join_requests (id, account_id, user_id) VALUES (?, ?, ?)', [uuidv4(), t[0].id, user.id]);
  return { office_name: t[0].name };
}

async function cancelRequest(user) {
  await query("UPDATE office_join_requests SET status = 'rejected', decided_at = NOW() WHERE status = 'pending' AND user_id IN (SELECT id FROM users WHERE person_id = (SELECT person_id FROM (SELECT person_id FROM users WHERE id = ?) x))", [user.id]);
}

async function listRequests(accountId) {
  const [rows] = await query(
    `SELECT r.id, r.created_at, u.name, u.email FROM office_join_requests r JOIN users u ON u.id = r.user_id
     WHERE r.account_id = ? AND r.status = 'pending' ORDER BY r.created_at ASC`, [accountId]);
  return rows;
}

/** Aprovar = criar a participação da pessoa neste escritório (o espaço pessoal/outros escritórios dela continuam intactos). */
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
    const [[u]] = await conn.execute('SELECT id, person_id, name, email, phone, password_hash, email_verified_at, oab_number FROM users WHERE id = ? FOR UPDATE', [r.user_id]);
    if (!u) throw new AppError('Usuário não existe mais.', 404);
    const personId = u.person_id || u.id;
    const [[already]] = await conn.execute('SELECT id FROM users WHERE person_id = ? AND account_id = ? LIMIT 1', [personId, accountId]);
    if (already) {
      await conn.execute("UPDATE users SET active = 1, role = 'user', permissions = NULL, plan_id = NULL WHERE id = ?", [already.id]);
    } else {
      await conn.execute(
        "INSERT INTO users (id, account_id, person_id, name, email, phone, password_hash, role, email_verified_at, oab_number) VALUES (?, ?, ?, ?, ?, ?, ?, 'user', ?, ?)",
        [uuidv4(), accountId, personId, u.name, u.email, u.phone, u.password_hash, u.email_verified_at, u.oab_number]);
    }
    await conn.execute("UPDATE office_join_requests SET status = 'approved', decided_at = NOW(), decided_by = ? WHERE id = ?", [actorId, requestId]);
    await conn.execute("UPDATE office_join_requests SET status = 'rejected', decided_at = NOW() WHERE user_id = ? AND status = 'pending' AND id <> ?", [u.id, requestId]);
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

module.exports = { genCode, get, create, update, setGovernance, regenerateCode, requestJoin, cancelRequest, listRequests, decide, ping, countAction, activityReport };

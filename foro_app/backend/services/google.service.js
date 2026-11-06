/**
 * google.service.js — integração com o Google Agenda (OAuth 2.0 Authorization Code + refresh token).
 *
 * Escopos: openid, email, profile e calendar.events — NADA de Gmail (ver a Política de Privacidade em /privacidade).
 * Regras que a política promete e este arquivo cumpre:
 *  - tokens só no servidor e CRIPTOGRAFADOS (utils/secret-box.js); nunca vão ao navegador nem aos logs;
 *  - desconectar revoga no Google, apaga os tokens e apaga os eventos importados na hora;
 *  - eventos importados do Google são privados do dono e somente leitura no Foro;
 *  - o Foro só altera/apaga no Google os eventos que ELE criou (extendedProperties.private.foro_event_id) e só por ação da pessoa;
 *  - sincronização assíncrona (job a cada 15 min, botão "Sincronizar agora" e envio logo após criar/editar/excluir), sem travar a requisição.
 */
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../configs/db.config');
const googleConfig = require('../configs/google.config');
const box = require('../utils/secret-box');
const { AppError } = require('../middlewares/error.middleware');

const SCOPES = ['openid', 'email', 'profile', 'https://www.googleapis.com/auth/calendar.events'];
const CAL_SCOPE = SCOPES[3];
const TZ = 'America/Sao_Paulo';
const URLS = () => ({
  auth: process.env.GOOGLE_AUTH_URL || 'https://accounts.google.com/o/oauth2/v2/auth',
  token: process.env.GOOGLE_TOKEN_URL || 'https://oauth2.googleapis.com/token',
  revoke: process.env.GOOGLE_REVOKE_URL || 'https://oauth2.googleapis.com/revoke',
  api: (process.env.GOOGLE_API_BASE || 'https://www.googleapis.com/calendar/v3').replace(/\/$/, ''),
});
const COOKIE = 'foro_g_state';
const WINDOW = { backDays: 30, aheadDays: 180 };
const appUrl = () => (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/+$/, '');
const secure = () => appUrl().startsWith('https://');

// ─── conexão ─────────────────────────────────────────────────────────────────

async function _conn(userId) {
  const [r] = await query('SELECT * FROM google_connections WHERE user_id = ? LIMIT 1', [userId]);
  return r[0] || null;
}

async function status(userId) {
  const cfg = googleConfig.load();
  const c = await _conn(userId);
  let imported = 0;
  if (c) { const [[n]] = await query("SELECT COUNT(*) AS n FROM events WHERE user_id = ? AND source = 'google'", [userId]); imported = Number(n.n); }
  return {
    configured: cfg.configured,
    connected: Boolean(c),
    status: c ? c.status : null,                       // active | revoked
    email: c ? c.google_email : null,
    scopes: c ? String(c.scopes || '').split(' ').filter(Boolean) : [],
    last_sync_at: c ? c.last_sync_at : null,
    last_sync_error: c ? c.last_sync_error : null,
    imported_events: imported,
    required_scopes: SCOPES,
  };
}

/** Passo 1: devolve a URL do Google e o cookie de proteção (CSRF). O `state` é assinado e liga a volta ao usuário que começou. */
const RETURN_TO = { agenda: '/agenda', settings: '/settings' };
function start(user, returnTo = 'settings') {
  const cfg = googleConfig.load();
  const ret = RETURN_TO[returnTo] ? returnTo : 'settings';
  if (!cfg.configured) throw new AppError('A integração com o Google ainda não está configurada neste servidor.', 503);
  const nonce = crypto.randomBytes(16).toString('hex');
  const state = jwt.sign({ purpose: 'google-oauth', uid: user.id, aid: user.account_id, n: nonce, ret }, process.env.JWT_SECRET, { expiresIn: '10m' });
  const params = new URLSearchParams({
    client_id: cfg.clientId, redirect_uri: cfg.redirectUri, response_type: 'code', scope: SCOPES.join(' '),
    access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state,
  });
  if (user.email) params.set('login_hint', user.email);
  const cookie = `${COOKIE}=${nonce}; HttpOnly; SameSite=Lax; Path=/api/integrations/google; Max-Age=600${secure() ? '; Secure' : ''}`;
  return { url: `${URLS().auth}?${params}`, cookie };
}

const clearCookie = () => `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/api/integrations/google; Max-Age=0${secure() ? '; Secure' : ''}`;
const readCookie = (header, name) => {
  for (const part of String(header || '').split(';')) { const [k, ...v] = part.trim().split('='); if (k === name) return v.join('='); }
  return null;
};

async function _post(url, form) {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(form), signal: AbortSignal.timeout(15000) });
  let j = {}; try { j = await r.json(); } catch { /* corpo vazio */ }
  return { ok: r.ok, status: r.status, body: j };
}

const _idToken = (t) => { try { return JSON.parse(Buffer.from(String(t).split('.')[1], 'base64url').toString('utf8')); } catch { return {}; } };

/** Passo 2: o Google volta aqui. Retorna o caminho do app para onde redirecionar (nunca lança). */
async function callback(q, cookieHeader) {
  let st = null;
  try { st = jwt.verify(String(q.state || ''), process.env.JWT_SECRET); } catch { /* inválido/expirado: trata abaixo */ }
  // volta para a tela de onde a pessoa clicou (Agenda ou Configurações); só caminhos da lista fixa
  const path = RETURN_TO[st?.ret] || RETURN_TO.settings;
  const back = (r) => ({ redirect: `${appUrl()}${path}?google=${r}`, cookie: clearCookie() });
  if (q.error) return back(q.error === 'access_denied' ? 'negado' : 'erro');
  if (!st) return back('estado');
  const nonce = readCookie(cookieHeader, COOKIE);
  if (st.purpose !== 'google-oauth' || !nonce || nonce !== st.n) return back('estado');
  const cfg = googleConfig.load();
  if (!cfg.configured || !q.code) return back('erro');
  try {
    const [u] = await query('SELECT id, account_id, active FROM users WHERE id = ? AND account_id = ? LIMIT 1', [st.uid, st.aid]);
    if (!u.length || !u[0].active) return back('estado');
    const t = await _post(URLS().token, { code: String(q.code), client_id: cfg.clientId, client_secret: cfg.clientSecret, redirect_uri: cfg.redirectUri, grant_type: 'authorization_code' });
    if (!t.ok || !t.body.access_token) return back('erro');
    const granted = String(t.body.scope || '').split(' ');
    if (!granted.includes(CAL_SCOPE)) return back('escopo');   // a pessoa desmarcou a permissão da Agenda
    const claims = _idToken(t.body.id_token);
    const prev = await _conn(st.uid);
    const refresh = t.body.refresh_token || (prev && prev.refresh_token_enc ? box.decrypt(prev.refresh_token_enc) : null);
    if (!refresh) return back('erro');
    const expires = new Date(Date.now() + (Number(t.body.expires_in) || 3600) * 1000);
    await query(
      `INSERT INTO google_connections (id, user_id, account_id, google_sub, google_email, scopes, access_token_enc, refresh_token_enc, token_expires_at, status, status_reason, last_sync_error)
       VALUES (?,?,?,?,?,?,?,?,?, 'active', NULL, NULL)
       ON DUPLICATE KEY UPDATE account_id = VALUES(account_id), google_sub = VALUES(google_sub), google_email = VALUES(google_email), scopes = VALUES(scopes),
         access_token_enc = VALUES(access_token_enc), refresh_token_enc = VALUES(refresh_token_enc), token_expires_at = VALUES(token_expires_at),
         status = 'active', status_reason = NULL, last_sync_error = NULL`,
      [uuidv4(), st.uid, st.aid, claims.sub || null, claims.email || null, granted.join(' '), box.encrypt(t.body.access_token), box.encrypt(refresh), expires]);
    setImmediate(() => syncUser(st.uid).catch(() => {}));      // primeira importação, sem bloquear a volta
    return back('ok');
  } catch (e) {
    console.error('[google] falha no callback:', e.code || e.name);
    return back('erro');
  }
}

/** Access token válido (renova com o refresh token). Se o Google recusar (revogado/expirado), marca a conexão como "revoked". */
async function _token(conn) {
  if (conn.status !== 'active') throw new AppError('A conexão com o Google precisa ser refeita. Reconecte em Configurações → Integrações.', 409);
  const exp = conn.token_expires_at ? new Date(conn.token_expires_at).getTime() : 0;
  if (conn.access_token_enc && exp - Date.now() > 60_000) return box.decrypt(conn.access_token_enc);
  const cfg = googleConfig.load();
  const r = await _post(URLS().token, { client_id: cfg.clientId, client_secret: cfg.clientSecret, refresh_token: box.decrypt(conn.refresh_token_enc), grant_type: 'refresh_token' });
  if (!r.ok || !r.body.access_token) {
    if (r.body.error === 'invalid_grant' || r.status === 400 || r.status === 401) {
      await query("UPDATE google_connections SET status = 'revoked', status_reason = ?, access_token_enc = NULL WHERE id = ?", ['Acesso revogado ou expirado no Google', conn.id]);
      throw new AppError('O acesso ao Google foi revogado ou expirou. Reconecte em Configurações → Integrações.', 409);
    }
    throw new AppError('O Google não respondeu agora. Tente novamente em instantes.', 502);
  }
  await query('UPDATE google_connections SET access_token_enc = ?, token_expires_at = ? WHERE id = ?',
    [box.encrypt(r.body.access_token), new Date(Date.now() + (Number(r.body.expires_in) || 3600) * 1000), conn.id]);
  return r.body.access_token;
}

async function _api(conn, method, path, { params, body } = {}, retried = false) {
  const access = await _token(conn);
  const qs = params ? '?' + new URLSearchParams(params) : '';
  const r = await fetch(URLS().api + path + qs, {
    method, headers: { authorization: `Bearer ${access}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20000),
  });
  if (r.status === 401 && !retried) {                       // token velho demais: força renovação uma vez
    await query('UPDATE google_connections SET token_expires_at = NULL WHERE id = ?', [conn.id]);
    return _api({ ...(await _conn(conn.user_id)) }, method, path, { params, body }, true);
  }
  let json = null; try { json = await r.json(); } catch { /* 204 */ }
  return { ok: r.ok, status: r.status, body: json };
}

async function disconnect(userId) {
  const conn = await _conn(userId);
  if (!conn) return { disconnected: false };
  // 1) revoga no Google (melhor esforço), 2) apaga tokens e conexão, 3) apaga os eventos importados, 4) desvincula os que o Foro enviou
  try {
    const tok = conn.refresh_token_enc ? box.decrypt(conn.refresh_token_enc) : null;
    if (tok) await _post(URLS().revoke, { token: tok });
  } catch { /* segue: o importante é apagar do nosso lado */ }
  await query('DELETE FROM google_connections WHERE user_id = ?', [userId]);
  const [d] = await query("DELETE FROM events WHERE user_id = ? AND source = 'google'", [userId]);
  await query("UPDATE events SET google_event_id = NULL WHERE user_id = ? AND google_event_id IS NOT NULL", [userId]);
  return { disconnected: true, removed_imported_events: d.affectedRows };
}

// ─── Google → Foro (importação, somente leitura) ─────────────────────────────

const _running = new Set();

function _when(g) {
  if (g.dateTime) return { at: new Date(g.dateTime), allDay: false };
  if (g.date) return { at: new Date(`${g.date}T00:00:00-03:00`), allDay: true };
  return null;
}

async function syncUser(userId) {
  if (_running.has(userId)) return { skipped: true };
  _running.add(userId);
  try {
    const conn = await _conn(userId);
    if (!conn || conn.status !== 'active') return { skipped: true };
    const from = new Date(Date.now() - WINDOW.backDays * 864e5), to = new Date(Date.now() + WINDOW.aheadDays * 864e5);
    const seen = new Set(); let pageToken; let pages = 0; let imported = 0;
    try {
      do {
        const r = await _api(conn, 'GET', '/calendars/primary/events', { params: {
          singleEvents: 'true', orderBy: 'startTime', showDeleted: 'false', maxResults: '250',
          timeMin: from.toISOString(), timeMax: to.toISOString(), ...(pageToken ? { pageToken } : {}),
        } });
        if (!r.ok) throw new AppError(`google_${r.status}`, 502);
        for (const g of r.body.items || []) {
          if (g.status === 'cancelled' || !g.id) continue;
          if (g.extendedProperties?.private?.foro_event_id) continue;       // veio do Foro: não duplica
          const w = _when(g.start || {}); if (!w || Number.isNaN(w.at.getTime())) continue;
          const e = g.end ? _when(g.end) : null;
          const ends = e && !w.allDay && !Number.isNaN(e.at.getTime()) ? e.at : null;
          const link = g.hangoutLink || (g.conferenceData?.entryPoints || []).find(p => p.entryPointType === 'video')?.uri || null;
          seen.add(g.id);
          const [ex] = await query("SELECT id FROM events WHERE user_id = ? AND source = 'google' AND google_event_id = ? LIMIT 1", [userId, g.id]);
          const vals = [String(g.summary || '(sem título)').slice(0, 200), w.at, ends, g.location ? String(g.location).slice(0, 255) : null, link && /^https?:\/\//i.test(link) ? String(link).slice(0, 500) : null];
          if (ex.length) await query('UPDATE events SET title = ?, starts_at = ?, ends_at = ?, location = ?, meeting_url = ?, status = \'agendado\' WHERE id = ?', [...vals, ex[0].id]);
          else await query("INSERT INTO events (id, account_id, user_id, type, title, starts_at, ends_at, location, meeting_url, source, google_event_id) VALUES (?,?,?,'outro',?,?,?,?,?,'google',?)", [uuidv4(), conn.account_id, userId, ...vals, g.id]);
          imported++;
        }
        pageToken = r.body.nextPageToken; pages++;
      } while (pageToken && pages < 8);
    } catch (e) {
      await query('UPDATE google_connections SET last_sync_error = ? WHERE user_id = ?', [String(e.message || 'erro').slice(0, 150), userId]);
      throw e;
    }
    // o que sumiu do Google dentro da janela some do Foro
    const [mine] = await query("SELECT id, google_event_id FROM events WHERE user_id = ? AND source = 'google' AND starts_at >= ? AND starts_at < ?", [userId, from, to]);
    let removed = 0;
    for (const m of mine) if (!seen.has(m.google_event_id)) { await query('DELETE FROM events WHERE id = ?', [m.id]); removed++; }
    await query('UPDATE google_connections SET last_sync_at = NOW(3), last_sync_error = NULL WHERE user_id = ?', [userId]);
    return { imported, removed };
  } finally { _running.delete(userId); }
}

// ─── Foro → Google (só eventos criados no Foro, por ação da pessoa) ───────────

const _end = (ev) => ev.ends_at ? new Date(ev.ends_at) : new Date(new Date(ev.starts_at).getTime() + 3600_000);
function _body(ev) {
  const desc = [ev.meeting_url ? `Link: ${ev.meeting_url}` : null, 'Criado pelo Foro'].filter(Boolean).join('\n');   // não enviamos as observações internas
  return {
    summary: ev.title, location: ev.location || undefined, description: desc,
    start: { dateTime: new Date(ev.starts_at).toISOString(), timeZone: TZ }, end: { dateTime: _end(ev).toISOString(), timeZone: TZ },
    extendedProperties: { private: { foro_event_id: ev.id } },
  };
}
const _activeConn = async (userId) => { const c = await _conn(userId); return c && c.status === 'active' ? c : null; };

async function pushCreate(ev, { sync = true } = {}) {
  if (!sync || ev.source === 'google') return;
  const conn = await _activeConn(ev.user_id); if (!conn) return;
  const r = await _api(conn, 'POST', '/calendars/primary/events', { body: _body(ev) });
  if (r.ok && r.body?.id) await query('UPDATE events SET google_event_id = ? WHERE id = ?', [r.body.id, ev.id]);
  else console.error('[google] não enviou o evento ao Google Agenda:', r.status);
}

async function pushUpdate(ev) {
  if (!ev.google_event_id || ev.source === 'google') return;
  const conn = await _activeConn(ev.user_id); if (!conn) return;
  const body = { ..._body(ev) };
  delete body.extendedProperties;
  if (ev.status === 'cancelado') body.status = 'cancelled'; else body.status = 'confirmed';
  const r = await _api(conn, 'PATCH', `/calendars/primary/events/${encodeURIComponent(ev.google_event_id)}`, { body });
  if (!r.ok) console.error('[google] não atualizou o evento no Google Agenda:', r.status);
}

async function pushDelete(ev) {
  if (!ev.google_event_id || ev.source === 'google') return;
  const conn = await _activeConn(ev.user_id); if (!conn) return;
  const r = await _api(conn, 'DELETE', `/calendars/primary/events/${encodeURIComponent(ev.google_event_id)}`);
  if (!r.ok && r.status !== 404 && r.status !== 410) console.error('[google] não removeu o evento do Google Agenda:', r.status);
}

async function syncAll() {
  const [rows] = await query(
    `SELECT g.user_id FROM google_connections g JOIN users u ON u.id = g.user_id AND u.active = 1 JOIN accounts a ON a.id = u.account_id
     WHERE g.status = 'active' AND (a.status = 'active' OR (a.status = 'trialing' AND (a.trial_ends_at IS NULL OR a.trial_ends_at >= NOW())))`);
  let ok = 0, fail = 0;
  for (const r of rows) {
    try { await syncUser(r.user_id); ok++; } catch (e) { fail++; console.error('[google] sync falhou (código):', e.statusCode || e.code || e.name); }
    await new Promise(res => setTimeout(res, 300));
  }
  return { ok, fail };
}

module.exports = { SCOPES, status, start, callback, disconnect, syncUser, syncAll, pushCreate, pushUpdate, pushDelete, _conn };

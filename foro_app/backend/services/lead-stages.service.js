/**
 * lead-stages.service.js — etapas do funil do CRM Comercial (editáveis por escritório).
 * `leads.stage` guarda a CHAVE (stage_key). Cada etapa tem um "tipo" que dá significado ao Painel:
 *   open (em andamento) · proposal (em negociação: entra no "previsto" de honorários) · won (convertido) · closed (encerrado).
 */
const { v4: uuidv4 } = require('uuid');
const { query } = require('../configs/db.config');
const { AppError } = require('../middlewares/error.middleware');

const KINDS = ['open', 'proposal', 'won', 'closed'];
const DEFAULTS = [
  { stage_key: 'novo',       label: 'Novo',       color: '#0ea5e9', kind: 'open' },
  { stage_key: 'em_contato', label: 'Em contato', color: '#f59e0b', kind: 'open' },
  { stage_key: 'proposta',   label: 'Proposta',   color: '#a855f7', kind: 'proposal' },
  { stage_key: 'convertido', label: 'Convertido', color: '#22c55e', kind: 'won' },
  { stage_key: 'encerrado',  label: 'Encerrado',  color: '#94a3b8', kind: 'closed' },
];
const COLOR = /^#[0-9a-fA-F]{6}$/;
const MAX_STAGES = 15;

/** Etapas padrão de uma conta nova. `exec(sql, params)` = conn.execute ou query. */
async function seedAccount(exec, accountId) {
  for (let i = 0; i < DEFAULTS.length; i++) {
    const s = DEFAULTS[i];
    await exec('INSERT IGNORE INTO lead_stages (id, account_id, stage_key, label, color, position, kind) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [uuidv4(), accountId, s.stage_key, s.label, s.color, i, s.kind]);
  }
}

/** Lista as etapas (com contagem de leads). Se a conta não tiver nenhuma, cria as padrão. */
async function list(accountId) {
  const sql = `SELECT s.*, (SELECT COUNT(*) FROM leads l WHERE l.account_id = s.account_id AND l.stage = s.stage_key AND l.deleted_at IS NULL) AS leads_count
               FROM lead_stages s WHERE s.account_id = ? ORDER BY s.position`;
  let [rows] = await query(sql, [accountId]);
  if (!rows.length) { await seedAccount((q, p) => query(q, p), accountId); [rows] = await query(sql, [accountId]); }
  return rows;
}

async function get(id, accountId) {
  const [r] = await query('SELECT * FROM lead_stages WHERE id = ? AND account_id = ? LIMIT 1', [id, accountId]);
  if (!r.length) throw new AppError('Etapa não encontrada.', 404);
  return r[0];
}

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const slug = (s) => norm(s).replace(/ /g, '_').slice(0, 40) || 'etapa';

/**
 * Descobre a etapa a partir do que o usuário/IA mandou: chave exata, nome (sem acento/caixa) ou chave normalizada.
 * Devolve a linha da etapa ou null.
 */
async function resolve(accountId, input) {
  if (input === undefined || input === null || String(input).trim() === '') return null;
  const stages = await list(accountId);
  const raw = String(input).trim();
  return stages.find(s => s.stage_key === raw)
    || stages.find(s => norm(s.label) === norm(raw))
    || stages.find(s => s.stage_key === slug(raw))
    || null;
}

/** Como `resolve`, mas lança 400 listando as etapas válidas. */
async function mustResolve(accountId, input) {
  const s = await resolve(accountId, input);
  if (!s) {
    const all = await list(accountId);
    throw new AppError(`Etapa inválida. Use uma destas: ${all.map(x => x.label).join(', ')}.`, 400);
  }
  return s;
}

async function firstKey(accountId) { return (await list(accountId))[0].stage_key; }

function _validate({ label, color, kind }, partial) {
  const out = {};
  if (!partial || label !== undefined) {
    const name = String(label || '').trim();
    if (!name) throw new AppError('Informe o nome da etapa.', 422, 'VALIDATION');
    if (name.length > 80) throw new AppError('Nome da etapa muito longo (máx. 80).', 422, 'VALIDATION');
    out.label = name;
  }
  if (color !== undefined) {
    if (!COLOR.test(color)) throw new AppError('Cor inválida (use #RRGGBB).', 422, 'VALIDATION');
    out.color = color;
  }
  if (kind !== undefined) {
    if (!KINDS.includes(kind)) throw new AppError(`Tipo inválido. Use: ${KINDS.join(', ')}.`, 422, 'VALIDATION');
    out.kind = kind;
  }
  return out;
}

async function create(accountId, data) {
  const v = _validate(data, false);
  const all = await list(accountId);
  if (all.length >= MAX_STAGES) throw new AppError(`Limite de ${MAX_STAGES} etapas.`, 422, 'VALIDATION');
  if (all.some(s => norm(s.label) === norm(v.label))) throw new AppError('Já existe uma etapa com esse nome.', 409, 'DUPLICATE');
  let key = slug(v.label); const keys = new Set(all.map(s => s.stage_key));
  for (let i = 2; keys.has(key); i++) key = `${slug(v.label).slice(0, 35)}_${i}`;
  const id = uuidv4();
  await query('INSERT INTO lead_stages (id, account_id, stage_key, label, color, position, kind) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, accountId, key, v.label, v.color || '#64748b', all.length, v.kind || 'open']);
  return get(id, accountId);
}

async function update(id, accountId, data) {
  const s = await get(id, accountId);
  const v = _validate(data, true);
  if (v.label !== undefined) {
    const all = await list(accountId);
    if (all.some(o => o.id !== id && norm(o.label) === norm(v.label))) throw new AppError('Já existe uma etapa com esse nome.', 409, 'DUPLICATE');
  }
  const f = Object.keys(v);
  if (f.length) await query(`UPDATE lead_stages SET ${f.map(k => `${k} = ?`).join(', ')} WHERE id = ? AND account_id = ?`, [...f.map(k => v[k]), id, accountId]);
  return get(s.id, accountId);
}

async function reorder(accountId, ids) {
  const cur = await list(accountId);
  if (!Array.isArray(ids) || ids.length !== cur.length || new Set(ids).size !== ids.length || !ids.every(i => cur.some(c => c.id === i))) {
    throw new AppError('Envie todos os ids das etapas, sem repetir.', 422, 'VALIDATION');
  }
  for (let i = 0; i < ids.length; i++) await query('UPDATE lead_stages SET position = ? WHERE id = ? AND account_id = ?', [i, ids[i], accountId]);
  return list(accountId);
}

/** Remove a etapa; se houver leads nela, `moveTo` (id de outra etapa) é obrigatório. */
async function remove(id, accountId, moveTo) {
  const s = await get(id, accountId);
  const all = await list(accountId);
  if (all.length <= 1) throw new AppError('O funil precisa ter pelo menos uma etapa.', 409, 'LAST_STAGE');
  const used = Number(all.find(x => x.id === id).leads_count);
  if (used > 0) {
    if (!moveTo) throw new AppError(`Há ${used} lead(s) nesta etapa. Escolha para onde movê-los.`, 409, 'STAGE_IN_USE');
    const dest = await get(moveTo, accountId);
    if (dest.id === s.id) throw new AppError('Escolha outra etapa.', 422, 'VALIDATION');
    // inclui leads arquivados (deleted_at não importa): nenhum lead pode ficar numa chave que deixou de existir
    await query('UPDATE leads SET stage = ? WHERE account_id = ? AND stage = ?', [dest.stage_key, accountId, s.stage_key]);
  } else {
    await query('UPDATE leads SET stage = (SELECT stage_key FROM (SELECT stage_key FROM lead_stages WHERE account_id = ? AND id <> ? ORDER BY position LIMIT 1) t) WHERE account_id = ? AND stage = ?',
      [accountId, id, accountId, s.stage_key]); // só arquivados/excluídos podem sobrar aqui
  }
  await query('DELETE FROM lead_stages WHERE id = ? AND account_id = ?', [id, accountId]);
  const rest = await list(accountId);
  for (let i = 0; i < rest.length; i++) await query('UPDATE lead_stages SET position = ? WHERE id = ?', [i, rest[i].id]);
}

/** Restaura as 5 etapas padrão. Só é permitido se todos os leads estiverem em etapas que continuam existindo. */
async function reset(accountId) {
  const keys = DEFAULTS.map(d => d.stage_key);
  const [[{ orphan }]] = await query(`SELECT COUNT(*) AS orphan FROM leads WHERE account_id = ? AND stage NOT IN (${keys.map(() => '?').join(',')})`, [accountId, ...keys]);
  if (orphan > 0) throw new AppError(`Há ${orphan} lead(s) em etapas personalizadas. Mova-os antes de restaurar o padrão.`, 409, 'STAGE_IN_USE');
  await query('DELETE FROM lead_stages WHERE account_id = ?', [accountId]);
  await seedAccount((q, p) => query(q, p), accountId);
  return list(accountId);
}

module.exports = { KINDS, DEFAULTS, seedAccount, list, get, resolve, mustResolve, firstKey, create, update, reorder, remove, reset };

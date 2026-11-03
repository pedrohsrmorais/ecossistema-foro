/**
 * boards.service.js — quadros personalizáveis (estilo Monday).
 * Quadro → colunas tipadas + grupos + itens. Valores das células em board_items.vals (JSON { colunaId: valor }).
 */
const { v4: uuidv4 } = require('uuid');
const { query, transaction } = require('../configs/db.config');
const { AppError } = require('../middlewares/error.middleware');

const TYPES = ['text', 'number', 'status', 'date', 'person', 'checkbox', 'link', 'lead', 'case'];
const COLORS = ['slate', 'blue', 'green', 'amber', 'red', 'purple', 'pink', 'teal'];
const LIMITS = { boards: 50, columns: 30, groups: 20, items: 3000 };

const opt = (label, color) => ({ id: uuidv4().slice(0, 8), label, color });
const defaultStatus = () => ({ options: [opt('Não iniciado', 'slate'), opt('Em andamento', 'blue'), opt('Concluído', 'green'), opt('Travado', 'red')] });

// Modelos para começar (o escritório pode mudar tudo depois).
const TEMPLATES = {
  basico: { label: 'Quadro simples', groups: ['Itens'], cols: [['Status', 'status'], ['Responsável', 'person'], ['Prazo', 'date']] },
  clientes: { label: 'Acompanhamento de clientes', groups: ['Em andamento', 'Concluídos'], cols: [['Cliente', 'lead'], ['Processo', 'case'], ['Status', 'status'], ['Responsável', 'person'], ['Próximo contato', 'date']] },
  prazos: { label: 'Prazos e entregas', groups: ['Esta semana', 'Próximas'], cols: [['Status', 'status'], ['Processo', 'case'], ['Responsável', 'person'], ['Prazo', 'date'], ['Observações', 'text']] },
  vazio: { label: 'Em branco', groups: ['Itens'], cols: [] },
};

const _json = (v, f) => { if (v == null) return f; if (typeof v === 'object') return v; try { return JSON.parse(v); } catch { return f; } };
const _name = (v, label, max = 80) => {
  const s = String(v ?? '').trim();
  if (!s) throw new AppError(`Informe ${label}.`, 400);
  return s.slice(0, max);
};
const _color = (v, fb = 'blue') => (COLORS.includes(v) ? v : fb);

function _settings(type, input, current) {
  if (type !== 'status') return null;
  const src = input && Array.isArray(input.options) ? input.options : current?.options || defaultStatus().options;
  const seen = new Set();
  const options = src.map(o => {
    const label = String(o?.label ?? '').trim().slice(0, 40);
    if (!label) return null;
    let id = String(o?.id || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 20) || uuidv4().slice(0, 8);
    while (seen.has(id)) id = uuidv4().slice(0, 8);
    seen.add(id);
    return { id, label, color: _color(o?.color, 'slate') };
  }).filter(Boolean).slice(0, 12);
  if (!options.length) throw new AppError('A coluna de status precisa de ao menos uma opção.', 400);
  return { options };
}

// ─── leitura ──────────────────────────────────────────────────────────────────

async function _board(accountId, id) {
  const [r] = await query('SELECT * FROM boards WHERE id = ? AND account_id = ? AND deleted_at IS NULL LIMIT 1', [id, accountId]);
  if (!r.length) throw new AppError('Quadro não encontrado.', 404);
  return r[0];
}

async function list(accountId) {
  const [rows] = await query(
    `SELECT b.id, b.name, b.description, b.color, b.created_at, b.updated_at,
            (SELECT COUNT(*) FROM board_items i WHERE i.board_id = b.id AND i.deleted_at IS NULL) AS items_count,
            (SELECT COUNT(*) FROM board_columns c WHERE c.board_id = b.id) AS columns_count
       FROM boards b WHERE b.account_id = ? AND b.deleted_at IS NULL ORDER BY b.position, b.created_at`, [accountId]);
  return rows.map(r => ({ ...r, items_count: Number(r.items_count), columns_count: Number(r.columns_count) }));
}

async function get(accountId, id) {
  const b = await _board(accountId, id);
  const [cols] = await query('SELECT id, name, type, settings, position FROM board_columns WHERE board_id = ? ORDER BY position, created_at', [id]);
  const [groups] = await query('SELECT id, name, color, position FROM board_groups WHERE board_id = ? ORDER BY position, created_at', [id]);
  const [items] = await query(
    'SELECT id, group_id, name, vals, position, created_by, created_at, updated_at FROM board_items WHERE board_id = ? AND deleted_at IS NULL ORDER BY position, created_at', [id]);
  return {
    id: b.id, name: b.name, description: b.description, color: b.color, created_at: b.created_at, updated_at: b.updated_at,
    columns: cols.map(c => ({ ...c, settings: _json(c.settings, null) })),
    groups,
    items: items.map(i => ({ ...i, vals: _json(i.vals, {}) })),
  };
}

// ─── quadros ──────────────────────────────────────────────────────────────────

async function create(accountId, userId, data) {
  const name = _name(data.name, 'o nome do quadro', 120);
  const [[{ n }]] = await query('SELECT COUNT(*) AS n FROM boards WHERE account_id = ? AND deleted_at IS NULL', [accountId]);
  if (Number(n) >= LIMITS.boards) throw new AppError(`Limite de ${LIMITS.boards} quadros por escritório.`, 400);
  const tpl = TEMPLATES[data.template] || TEMPLATES.basico;
  const id = uuidv4();
  await transaction(async conn => {
    const q = (sql, p) => conn.execute(sql, p);
    await q('INSERT INTO boards (id, account_id, name, description, color, position, created_by) VALUES (?,?,?,?,?,?,?)',
      [id, accountId, name, data.description ? String(data.description).slice(0, 500) : null, _color(data.color), Number(n), userId]);
    for (let i = 0; i < tpl.groups.length; i++)
      await q('INSERT INTO board_groups (id, board_id, account_id, name, color, position) VALUES (?,?,?,?,?,?)', [uuidv4(), id, accountId, tpl.groups[i], COLORS[(i + 1) % COLORS.length], i]);
    for (let i = 0; i < tpl.cols.length; i++) {
      const [cname, ctype] = tpl.cols[i];
      await q('INSERT INTO board_columns (id, board_id, account_id, name, type, settings, position) VALUES (?,?,?,?,?,?,?)',
        [uuidv4(), id, accountId, cname, ctype, ctype === 'status' ? JSON.stringify(defaultStatus()) : null, i]);
    }
  });
  return get(accountId, id);
}

async function update(accountId, id, data) {
  await _board(accountId, id);
  const f = []; const v = [];
  if (data.name !== undefined) { f.push('name = ?'); v.push(_name(data.name, 'o nome do quadro', 120)); }
  if (data.description !== undefined) { f.push('description = ?'); v.push(data.description ? String(data.description).slice(0, 500) : null); }
  if (data.color !== undefined) { f.push('color = ?'); v.push(_color(data.color)); }
  if (f.length) await query(`UPDATE boards SET ${f.join(', ')} WHERE id = ? AND account_id = ?`, [...v, id, accountId]);
  return get(accountId, id);
}

async function remove(accountId, id) {
  await _board(accountId, id);
  await query('UPDATE boards SET deleted_at = NOW() WHERE id = ? AND account_id = ?', [id, accountId]);
}

// ─── colunas ──────────────────────────────────────────────────────────────────

async function addColumn(accountId, boardId, data) {
  await _board(accountId, boardId);
  const type = TYPES.includes(data.type) ? data.type : 'text';
  const name = _name(data.name, 'o nome da coluna');
  const [[{ n, p }]] = await query('SELECT COUNT(*) AS n, COALESCE(MAX(position), -1) AS p FROM board_columns WHERE board_id = ?', [boardId]);
  if (Number(n) >= LIMITS.columns) throw new AppError(`Limite de ${LIMITS.columns} colunas por quadro.`, 400);
  const id = uuidv4();
  const st = _settings(type, data.settings || (type === 'status' ? defaultStatus() : null));
  await query('INSERT INTO board_columns (id, board_id, account_id, name, type, settings, position) VALUES (?,?,?,?,?,?,?)',
    [id, boardId, accountId, name, type, st ? JSON.stringify(st) : null, Number(p) + 1]);
  return { id, name, type, settings: st, position: Number(p) + 1 };
}

async function updateColumn(accountId, boardId, colId, data) {
  await _board(accountId, boardId);
  const [r] = await query('SELECT * FROM board_columns WHERE id = ? AND board_id = ? LIMIT 1', [colId, boardId]);
  if (!r.length) throw new AppError('Coluna não encontrada.', 404);
  const col = r[0];
  const f = []; const v = [];
  if (data.name !== undefined) { f.push('name = ?'); v.push(_name(data.name, 'o nome da coluna')); }
  if (data.settings !== undefined && col.type === 'status') {
    const st = _settings('status', data.settings, _json(col.settings, null));
    // opção removida: limpa o valor nos itens que a usavam
    const keep = new Set(st.options.map(o => o.id));
    const old = (_json(col.settings, null)?.options || []).filter(o => !keep.has(o.id)).map(o => o.id);
    if (old.length) {
      await query(`UPDATE board_items SET vals = JSON_REMOVE(vals, '$."${colId}"') WHERE board_id = ? AND JSON_UNQUOTE(JSON_EXTRACT(vals, '$."${colId}"')) IN (${old.map(() => '?').join(',')})`, [boardId, ...old]);
    }
    f.push('settings = ?'); v.push(JSON.stringify(st));
  }
  if (f.length) await query(`UPDATE board_columns SET ${f.join(', ')} WHERE id = ?`, [...v, colId]);
  const [again] = await query('SELECT id, name, type, settings, position FROM board_columns WHERE id = ?', [colId]);
  return { ...again[0], settings: _json(again[0].settings, null) };
}

async function reorderColumns(accountId, boardId, ids) {
  await _board(accountId, boardId);
  if (!Array.isArray(ids)) throw new AppError('Envie a lista de colunas na nova ordem.', 400);
  const [cols] = await query('SELECT id FROM board_columns WHERE board_id = ?', [boardId]);
  const known = new Set(cols.map(c => c.id));
  const order = ids.filter(i => known.has(i));
  for (const c of cols) if (!order.includes(c.id)) order.push(c.id);
  for (let i = 0; i < order.length; i++) await query('UPDATE board_columns SET position = ? WHERE id = ?', [i, order[i]]);
}

async function removeColumn(accountId, boardId, colId) {
  await _board(accountId, boardId);
  const [r] = await query('SELECT id FROM board_columns WHERE id = ? AND board_id = ? LIMIT 1', [colId, boardId]);
  if (!r.length) throw new AppError('Coluna não encontrada.', 404);
  await query('DELETE FROM board_columns WHERE id = ?', [colId]);
  await query(`UPDATE board_items SET vals = JSON_REMOVE(vals, '$."${colId}"') WHERE board_id = ?`, [boardId]);
}

// ─── grupos ───────────────────────────────────────────────────────────────────

async function addGroup(accountId, boardId, data) {
  await _board(accountId, boardId);
  const name = _name(data.name || 'Novo grupo', 'o nome do grupo');
  const [[{ n, p }]] = await query('SELECT COUNT(*) AS n, COALESCE(MAX(position), -1) AS p FROM board_groups WHERE board_id = ?', [boardId]);
  if (Number(n) >= LIMITS.groups) throw new AppError(`Limite de ${LIMITS.groups} grupos por quadro.`, 400);
  const id = uuidv4();
  const color = _color(data.color, COLORS[(Number(n) + 1) % COLORS.length]);
  await query('INSERT INTO board_groups (id, board_id, account_id, name, color, position) VALUES (?,?,?,?,?,?)', [id, boardId, accountId, name, color, Number(p) + 1]);
  return { id, name, color, position: Number(p) + 1 };
}

async function updateGroup(accountId, boardId, groupId, data) {
  await _board(accountId, boardId);
  const f = []; const v = [];
  if (data.name !== undefined) { f.push('name = ?'); v.push(_name(data.name, 'o nome do grupo')); }
  if (data.color !== undefined) { f.push('color = ?'); v.push(_color(data.color)); }
  if (f.length) {
    const [res] = await query(`UPDATE board_groups SET ${f.join(', ')} WHERE id = ? AND board_id = ?`, [...v, groupId, boardId]);
    if (!res.affectedRows) throw new AppError('Grupo não encontrado.', 404);
  }
  const [r] = await query('SELECT id, name, color, position FROM board_groups WHERE id = ? AND board_id = ?', [groupId, boardId]);
  if (!r.length) throw new AppError('Grupo não encontrado.', 404);
  return r[0];
}

async function removeGroup(accountId, boardId, groupId) {
  await _board(accountId, boardId);
  const [[{ n }]] = await query('SELECT COUNT(*) AS n FROM board_groups WHERE board_id = ?', [boardId]);
  if (Number(n) <= 1) throw new AppError('O quadro precisa ter ao menos um grupo.', 400);
  const [r] = await query('SELECT id FROM board_groups WHERE id = ? AND board_id = ? LIMIT 1', [groupId, boardId]);
  if (!r.length) throw new AppError('Grupo não encontrado.', 404);
  await query('UPDATE board_items SET deleted_at = NOW() WHERE board_id = ? AND group_id = ? AND deleted_at IS NULL', [boardId, groupId]);
  await query('DELETE FROM board_groups WHERE id = ?', [groupId]);
}

// ─── itens ────────────────────────────────────────────────────────────────────

/** Valida e normaliza o valor de uma célula conforme o tipo da coluna. Retorna null para "vazio". */
async function _cell(accountId, col, value) {
  if (value === null || value === undefined || value === '') return null;
  switch (col.type) {
    case 'text': return String(value).slice(0, 500);
    case 'number': {
      const n = Number(value);
      if (!Number.isFinite(n) || Math.abs(n) > 1e15) throw new AppError(`“${col.name}” precisa ser um número.`, 400);
      return n;
    }
    case 'checkbox': return value === true || value === 'true' ? true : null;
    case 'date': {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value)) || Number.isNaN(new Date(value + 'T12:00:00').getTime())) throw new AppError(`“${col.name}” precisa ser uma data válida.`, 400);
      return String(value);
    }
    case 'link': {
      const s = String(value).trim();
      if (!/^https?:\/\//i.test(s)) throw new AppError(`“${col.name}” precisa começar com http:// ou https://.`, 400);
      return s.slice(0, 500);
    }
    case 'status': {
      const ok = (_json(col.settings, null)?.options || []).some(o => o.id === value);
      if (!ok) throw new AppError(`Opção inválida em “${col.name}”.`, 400);
      return String(value);
    }
    case 'person': {
      const [r] = await query('SELECT id FROM users WHERE id = ? AND account_id = ? AND active = 1 LIMIT 1', [value, accountId]);
      if (!r.length) throw new AppError(`Pessoa inválida em “${col.name}”.`, 400);
      return String(value);
    }
    case 'lead': {
      const [r] = await query('SELECT id, name FROM leads WHERE id = ? AND account_id = ? AND deleted_at IS NULL LIMIT 1', [typeof value === 'object' ? value.id : value, accountId]);
      if (!r.length) throw new AppError(`Contato inválido em “${col.name}”.`, 400);
      return { id: r[0].id, label: r[0].name || 'Sem nome' };
    }
    case 'case': {
      const [r] = await query('SELECT id, case_number, title FROM cases WHERE id = ? AND account_id = ? AND deleted_at IS NULL LIMIT 1', [typeof value === 'object' ? value.id : value, accountId]);
      if (!r.length) throw new AppError(`Processo inválido em “${col.name}”.`, 400);
      return { id: r[0].id, label: r[0].case_number || r[0].title };
    }
    default: return null;
  }
}

async function _applyVals(accountId, boardId, itemId, vals) {
  if (!vals || typeof vals !== 'object') return;
  const [cols] = await query('SELECT id, name, type, settings FROM board_columns WHERE board_id = ?', [boardId]);
  const byId = new Map(cols.map(c => [c.id, c]));
  for (const [colId, raw] of Object.entries(vals)) {
    const col = byId.get(colId);
    if (!col) throw new AppError('Coluna desconhecida.', 400);
    const val = await _cell(accountId, col, raw);
    if (val === null) await query(`UPDATE board_items SET vals = JSON_REMOVE(COALESCE(vals, JSON_OBJECT()), '$."${colId}"') WHERE id = ?`, [itemId]);
    else await query(`UPDATE board_items SET vals = JSON_SET(COALESCE(vals, JSON_OBJECT()), '$."${colId}"', CAST(? AS JSON)) WHERE id = ?`, [JSON.stringify(val), itemId]);
  }
}

async function _item(accountId, boardId, itemId) {
  const [r] = await query('SELECT id, group_id, name, vals, position, created_by, created_at, updated_at FROM board_items WHERE id = ? AND board_id = ? AND account_id = ? AND deleted_at IS NULL LIMIT 1', [itemId, boardId, accountId]);
  if (!r.length) throw new AppError('Item não encontrado.', 404);
  return { ...r[0], vals: _json(r[0].vals, {}) };
}

async function _assertGroup(boardId, groupId) {
  const [r] = await query('SELECT id FROM board_groups WHERE id = ? AND board_id = ? LIMIT 1', [groupId, boardId]);
  if (!r.length) throw new AppError('Grupo não encontrado.', 404);
}

async function addItem(accountId, userId, boardId, data) {
  await _board(accountId, boardId);
  const name = _name(data.name, 'o nome do item', 255);
  let groupId = data.group_id;
  if (groupId) await _assertGroup(boardId, groupId);
  else { const [g] = await query('SELECT id FROM board_groups WHERE board_id = ? ORDER BY position LIMIT 1', [boardId]); groupId = g[0]?.id; }
  if (!groupId) throw new AppError('O quadro não tem grupos.', 400);
  const [[{ n, p }]] = await query('SELECT COUNT(*) AS n, COALESCE(MAX(position), -1) AS p FROM board_items WHERE board_id = ? AND deleted_at IS NULL', [boardId]);
  if (Number(n) >= LIMITS.items) throw new AppError(`Limite de ${LIMITS.items} itens por quadro.`, 400);
  const id = uuidv4();
  await query('INSERT INTO board_items (id, board_id, account_id, group_id, name, vals, position, created_by) VALUES (?,?,?,?,?,JSON_OBJECT(),?,?)',
    [id, boardId, accountId, groupId, name, Number(p) + 1, userId]);
  try { await _applyVals(accountId, boardId, id, data.vals); }
  catch (e) { await query('DELETE FROM board_items WHERE id = ?', [id]); throw e; }
  return _item(accountId, boardId, id);
}

async function updateItem(accountId, boardId, itemId, data) {
  await _board(accountId, boardId);
  await _item(accountId, boardId, itemId);
  const f = []; const v = [];
  if (data.name !== undefined) { f.push('name = ?'); v.push(_name(data.name, 'o nome do item', 255)); }
  if (data.group_id !== undefined) {
    await _assertGroup(boardId, data.group_id);
    const [[{ p }]] = await query('SELECT COALESCE(MAX(position), -1) AS p FROM board_items WHERE board_id = ? AND deleted_at IS NULL', [boardId]);
    f.push('group_id = ?', 'position = ?'); v.push(data.group_id, Number(p) + 1);
  }
  if (f.length) await query(`UPDATE board_items SET ${f.join(', ')} WHERE id = ?`, [...v, itemId]);
  await _applyVals(accountId, boardId, itemId, data.vals);
  await query('UPDATE board_items SET updated_at = NOW() WHERE id = ?', [itemId]);
  return _item(accountId, boardId, itemId);
}

async function removeItem(accountId, boardId, itemId) {
  await _board(accountId, boardId);
  await _item(accountId, boardId, itemId);
  await query('UPDATE board_items SET deleted_at = NOW() WHERE id = ?', [itemId]);
}

module.exports = {
  TYPES, TEMPLATES, list, get, create, update, remove,
  addColumn, updateColumn, reorderColumns, removeColumn,
  addGroup, updateGroup, removeGroup,
  addItem, updateItem, removeItem,
};

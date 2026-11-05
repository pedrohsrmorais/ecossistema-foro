/**
 * lead-import.service.js — importação e exportação de listas no CRM Comercial.
 *
 * Fluxo (o servidor guarda o rascunho; nada vai para a tabela de leads antes do "Importar"):
 *   1. createBatch  — recebe o arquivo, lê, escolhe a linha do cabeçalho, reconhece o modelo e as colunas.
 *   2. preview      — aplica o mapeamento escolhido: limpa/valida cada linha e diz o que vai acontecer (novo,
 *                     duplicado, com erro…) sem gravar nada.
 *   3. commit       — grava tudo numa transação (ou nada). Cada lead guarda `import_id`.
 *   4. undo         — "desfazer importação": remove os leads criados por ela (menos os que já têm processo ou tarefa).
 * Exportação: exportLeads (CSV ou XLSX), no mesmo formato do "Modelo Foro" — dá para exportar, ajustar e importar de volta.
 */
const { v4: uuidv4 } = require('uuid');
const { query, transaction } = require('../configs/db.config');
const { AppError } = require('../middlewares/error.middleware');
const leadStages = require('./lead-stages.service');
const sheet = require('../utils/lead-sheet');
const N = require('../utils/lead-normalize');
const M = require('./lead-import.models');

const MAX_NEW_CUSTOM_FIELDS = 10;
const PREVIEW_ROWS = 100;
const PROBLEM_CAP = 5000;
const SOURCE_LABEL = { ui: 'Cadastro manual', ai_chat: 'Assistente IA', import: 'Importação', whatsapp: 'WhatsApp', api: 'API' };

/** Campos "extras" que o importador cria sozinho (campos personalizados do escritório). */
const FIXED_FIELDS = {
  company: { name: 'empresa', label: 'Empresa', type: 'text' },
  city: { name: 'cidade', label: 'Cidade', type: 'text' },
  state: { name: 'uf', label: 'UF', type: 'text' },
  cep: { name: 'cep', label: 'CEP', type: 'text' },
  address: { name: 'endereco', label: 'Endereço', type: 'text' },
  phone2: { name: 'telefone_2', label: 'Telefone 2', type: 'phone' },
  email2: { name: 'email_2', label: 'E-mail 2', type: 'email' },
};
const slug = (s) => N.strip(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'campo';
const json = (v) => (v === null || v === undefined ? null : JSON.stringify(v));
const parse = (v, fb = null) => { if (v === null || v === undefined) return fb; if (typeof v !== 'string') return v; try { return JSON.parse(v); } catch { return fb; } };
const bad = (msg, code = 'VALIDATION', status = 422) => new AppError(msg, status, code);

// ─── Modelos e planilhas-modelo ──────────────────────────────────────────────
function modelsInfo() {
  return {
    models: M.MODELS.map(m => ({ key: m.key, label: m.label, description: m.description, headers: m.headers })),
    targets: M.TARGETS.map(({ key, label, multi }) => ({ key, label, multi })),
    limits: { max_mb: Math.round(sheet.LIMITS.bytes / 1048576), max_rows: sheet.LIMITS.rows },
  };
}

async function template(modelKey, format = 'xlsx') {
  const m = M.MODEL_BY_KEY[modelKey];
  if (!m) throw new AppError('Modelo de importação não encontrado.', 404);
  const base = `modelo-importacao-${m.key.replace(/_/g, '-')}`;
  if (format === 'csv') return { buffer: sheet.toCsv(m.headers, m.examples), filename: `${base}.csv`, type: 'text/csv; charset=utf-8' };
  const help = [
    `Modelo "${m.label}"`,
    m.description,
    'As linhas que começam com (EXEMPLO) são ignoradas na importação — pode apagá-las ou deixá-las.',
    'Não precisa seguir exatamente estes nomes de coluna: o Foro reconhece variações (ex.: "Celular", "Fone", "E-mail 2") e mostra o mapeamento antes de importar.',
    'CPF/CNPJ: com ou sem pontuação. Telefone: com ou sem DDD/+55. UF: sigla ou nome do estado. Etapa: nome ou chave de uma etapa do seu funil.',
    'Linhas sem nome, telefone, e-mail ou CPF/CNPJ são recusadas; CPF/CNPJ e telefones inválidos são descartados (e anotados no lead).',
  ];
  const buffer = await sheet.toXlsx(m.headers, m.examples, { sheetName: 'Modelo', extraSheet: { name: 'Como preencher', lines: help } });
  return { buffer, filename: `${base}.xlsx`, type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
}

// ─── Rascunho (lead_imports) ─────────────────────────────────────────────────
const packRows = (r) => JSON.stringify({ rows: r.rows, num: r.numeric.map(x => x.map(b => (b ? '1' : '0')).join('')), lines: r.lines });
function unpackRows(text) {
  const o = parse(text, { rows: [], num: [], lines: [] });
  return { rows: o.rows, numeric: o.num.map(s => s.split('').map(c => c === '1')), lines: o.lines };
}

async function _row(accountId, id, user, { withData = false } = {}) {
  const [rows] = await query(
    `SELECT id, account_id, user_id, file_name, file_size, status, model_key, sheet_index, header_row, headers, ${withData ? '`rows`, file_data,' : ''}
            total_rows, mapping, options, stats, created_at, finished_at, undone_at
     FROM lead_imports WHERE id = ? AND account_id = ? LIMIT 1`, [id, accountId]);
  const b = rows[0];
  if (!b || (user.role !== 'admin' && b.user_id !== user.id)) throw new AppError('Importação não encontrada.', 404);
  return b;
}

/** Cabeçalhos limpos + linhas de dados (a partir da linha de cabeçalho escolhida). */
function _table(stored, headerRow) {
  const hr = Math.min(Math.max(Number(headerRow) || 0, 0), Math.max(stored.rows.length - 1, 0));
  const headers = (stored.rows[hr] || []).map((h, i) => N.clean(h).slice(0, 80) || `Coluna ${i + 1}`);
  const cap = sheet.LIMITS.rows;
  const data = stored.rows.slice(hr + 1, hr + 1 + cap);
  return {
    hr, headers, data,
    num: stored.numeric.slice(hr + 1, hr + 1 + cap),
    lines: stored.lines.slice(hr + 1, hr + 1 + cap),
    truncated: stored.rows.length - hr - 1 > cap,
  };
}

function _describe(b, stored) {
  const t = _table(stored, b.header_row);
  const detected = M.detectModel(t.headers, t.data);
  const suggestions = Object.fromEntries(M.MODELS.map(m => [m.key, M.suggestMapping(t.headers, t.data, m.key)]));
  const savedMap = parse(b.mapping);
  const modelKey = b.model_key && M.MODEL_BY_KEY[b.model_key] ? b.model_key : detected.key;
  const mapping = Array.isArray(savedMap) && savedMap.length === t.headers.length
    ? savedMap.map(target => ({ target, via: 'manual' }))
    : suggestions[modelKey];
  return {
    id: b.id, file_name: b.file_name, status: b.status,
    sheets: parse(b.stats, {})?.sheets || [], sheet: b.sheet_index, header_row: t.hr,
    header_candidates: stored.rows.slice(0, 10).map((r, i) => ({ index: i, line: stored.lines[i], preview: r.filter(Boolean).slice(0, 5).join(' · ') })),
    headers: t.headers,
    sample: t.data.slice(0, 8),
    total_rows: t.data.filter(r => r.some(c => String(c).trim())).length,
    truncated: t.truncated, max_rows: sheet.LIMITS.rows,
    detected: detected.key, model: modelKey, suggestions, mapping,
    options: parse(b.options, null),
  };
}

async function _purgeStale(accountId) {
  await query("DELETE FROM lead_imports WHERE account_id = ? AND status = 'analisada' AND created_at < (NOW() - INTERVAL 1 DAY)", [accountId]);
}

async function createBatch(accountId, user, { buffer, name }) {
  await _purgeStale(accountId);
  const fileName = String(name || 'planilha').replace(/[\\/]+/g, '_').slice(0, 200);
  let read = await sheet.readSheet(buffer, { sheet: 0 });
  let sheetNames = read.sheets;
  // primeira aba sem dados → tenta as seguintes
  for (let i = 1; read.rows.length < 2 && i < Math.min(sheetNames.length, 6); i++) read = await sheet.readSheet(buffer, { sheet: i });
  if (read.rows.length < 2) throw bad('A planilha está vazia ou só tem o cabeçalho.', 'EMPTY_SHEET');
  const stored = { rows: read.rows, numeric: read.numeric, lines: read.lines };
  const headerRow = M.guessHeaderRow(read.rows);
  const id = uuidv4();
  await query(
    `INSERT INTO lead_imports (id, account_id, user_id, file_name, file_size, status, sheet_index, header_row, \`rows\`, file_data, total_rows, stats)
     VALUES (?, ?, ?, ?, ?, 'analisada', ?, ?, ?, ?, ?, ?)`,
    [id, accountId, user.id, fileName, buffer.length, read.sheet, headerRow, packRows(stored), read.kind === 'xlsx' ? buffer : null,
      Math.max(read.rows.length - headerRow - 1, 0), json({ sheets: sheetNames, kind: read.kind })]);
  const b = await _row(accountId, id, user);
  return _describe(b, stored);
}

async function get(accountId, id, user) {
  const b = await _row(accountId, id, user, { withData: true });
  if (b.status !== 'analisada') return { id: b.id, file_name: b.file_name, status: b.status, stats: parse(b.stats, {}), finished_at: b.finished_at, undone_at: b.undone_at };
  return _describe(b, unpackRows(b.rows));
}

/** Troca a aba ou a linha do cabeçalho (relê o arquivo guardado). */
async function reparse(accountId, id, user, { sheet: sheetIndex, header_row: headerRow }) {
  const b = await _row(accountId, id, user, { withData: true });
  if (b.status !== 'analisada') throw bad('Esta importação já foi concluída.', 'ALREADY_DONE', 409);
  let stored = unpackRows(b.rows); let si = b.sheet_index; let hr = b.header_row;
  if (sheetIndex !== undefined && Number(sheetIndex) !== b.sheet_index) {
    if (!b.file_data) throw bad('Este arquivo (CSV) só tem uma aba.');
    const read = await sheet.readSheet(b.file_data, { sheet: Number(sheetIndex) });
    if (read.rows.length < 2) throw bad('Essa aba está vazia ou só tem o cabeçalho.', 'EMPTY_SHEET');
    stored = { rows: read.rows, numeric: read.numeric, lines: read.lines }; si = read.sheet; hr = M.guessHeaderRow(read.rows);
  }
  if (headerRow !== undefined) hr = Math.min(Math.max(Number(headerRow) || 0, 0), Math.max(stored.rows.length - 2, 0));
  await query('UPDATE lead_imports SET sheet_index = ?, header_row = ?, `rows` = ?, total_rows = ?, mapping = NULL, model_key = NULL WHERE id = ?',
    [si, hr, packRows(stored), Math.max(stored.rows.length - hr - 1, 0), id]);
  return get(accountId, id, user);
}

// ─── Avaliação (prévia e importação usam a mesma conta) ──────────────────────
function _cleanOptions(raw, { stages, users, user, scopeOwn }) {
  const o = raw && typeof raw === 'object' ? raw : {};
  const stageIn = o.stage ? String(o.stage) : '';
  const st = stageIn ? stages.find(s => s.stage_key === stageIn || N.normHeader(s.label) === N.normHeader(stageIn)) : stages[0];
  if (!st) throw bad('Etapa padrão inválida.');
  let assigned = user.id;
  if (!scopeOwn && o.assigned_user_id) {
    if (!users.some(u => u.id === o.assigned_user_id)) throw bad('Responsável padrão inválido.');
    assigned = o.assigned_user_id;
  }
  const onDup = ['skip', 'merge', 'create'].includes(o.on_duplicate) ? o.on_duplicate : 'skip';
  const ddd = o.default_ddd ? String(o.default_ddd).replace(/\D/g, '') : '';
  if (ddd && !N.DDDS.has(Number(ddd))) throw bad('DDD padrão inválido.');
  return {
    stage: st.stage_key, assigned_user_id: assigned, source: o.source ? N.clean(o.source).slice(0, 100) : 'import',
    on_duplicate: onDup, proper_names: o.proper_names !== false, default_ddd: ddd || null,
  };
}

const phoneKey = (raw) => { const p = N.normPhone(raw); if (p && p.valid) return N.digits(p.value); const d = N.digits(raw); return d.length >= 10 ? d.slice(-10) : null; };

async function _evaluate(accountId, user, b, stored, { model, mapping, options }) {
  const t = _table(stored, b.header_row);
  if (!M.MODEL_BY_KEY[model]) throw bad('Modelo de importação inválido.');
  if (!Array.isArray(mapping) || mapping.length !== t.headers.length || mapping.some(x => !M.TARGET_KEYS.has(x))) throw bad('Mapeamento de colunas inválido. Recarregue a importação.');
  if (!mapping.some(x => ['name', 'document', 'phone', 'email', 'free', 'company'].includes(x))) {
    throw bad('Escolha ao menos uma coluna de nome, telefone, e-mail ou CPF/CNPJ.', 'NO_IDENTIFYING_COLUMN');
  }
  const scopeOwn = user.role !== 'admin' && user.permissions?.view_scope === 'own';
  const [stages, [users], [existing], [[plan]], [[{ cur }]], [defs]] = await Promise.all([
    leadStages.list(accountId),
    query('SELECT id, name, email FROM users WHERE account_id = ? AND active = 1', [accountId]),
    query('SELECT id, name, phone, email, document FROM leads WHERE account_id = ? AND deleted_at IS NULL', [accountId]),
    query('SELECT p.max_leads, p.name FROM accounts a JOIN plans p ON p.id = a.plan_id WHERE a.id = ? LIMIT 1', [accountId]),
    query('SELECT COUNT(*) AS cur FROM leads WHERE account_id = ? AND deleted_at IS NULL', [accountId]),
    query('SELECT id, name, label, active FROM field_definitions WHERE account_id = ?', [accountId]),
  ]);
  const opts = _cleanOptions(options, { stages, users, user, scopeOwn });
  const stageByKey = new Map(stages.map(s => [s.stage_key, s]));
  const stageByLabel = new Map(stages.map(s => [N.normHeader(s.label), s]));
  const userByEmail = new Map(users.map(u => [String(u.email).toLowerCase(), u]));
  const userByName = new Map(); for (const u of users) { const k = N.normHeader(u.name); userByName.set(k, userByName.has(k) ? null : u); }

  const docMap = new Map(); const emailMap = new Map(); const phoneMap = new Map(); const nameMap = new Map();
  for (const l of existing) {
    if (l.name) nameMap.set(N.normHeader(l.name), l);
    if (l.document) docMap.set(l.document, l);
    if (l.email) emailMap.set(String(l.email).toLowerCase().trim(), l);
    const pk = l.phone ? phoneKey(l.phone) : null; if (pk) phoneMap.set(pk, l);
  }
  const seenDoc = new Map(); const seenEmail = new Map(); const seenPhone = new Map(); const seenName = new Map();
  const defByName = new Map(defs.map(d => [d.name, d]));

  const stats = { total: 0, vazias: 0, exemplo: 0, novos: 0, atualizar: 0, duplicadas_crm: 0, duplicadas_arquivo: 0, erros: 0, com_aviso: 0 };
  const out = []; const customLabels = new Set();

  t.data.forEach((cells, i) => {
    const line = t.lines[i];
    const built = M.buildRecord(cells, t.num[i] || [], t.headers, mapping, { properNames: opts.proper_names, defaultDdd: opts.default_ddd });
    if (built.empty) { stats.vazias++; return; }
    if (built.example) { stats.exemplo++; return; }
    stats.total++;
    const { rec, issues } = built;
    const item = { line, rec, issues: [...issues], cells, status: 'novo', motivo: null, lead: null };
    if (issues.some(x => x.level === 'erro')) { item.status = 'erro'; item.motivo = issues.find(x => x.level === 'erro').msg; stats.erros++; out.push(item); return; }

    // etapa
    if (rec.stage) {
      const st = stageByKey.get(rec.stage) || stageByLabel.get(N.normHeader(rec.stage));
      if (st) item.stage = st.stage_key; else item.issues.push({ level: 'aviso', msg: `Etapa «${rec.stage}» não existe no seu funil — usada «${stageByKey.get(opts.stage).label}»` });
    }
    item.stage = item.stage || opts.stage;
    // responsável
    item.assigned = opts.assigned_user_id;
    if (rec.assigned && !scopeOwn) {
      const u = userByEmail.get(rec.assigned.toLowerCase()) || userByName.get(N.normHeader(rec.assigned));
      if (u) item.assigned = u.id; else item.issues.push({ level: 'aviso', msg: `Responsável «${rec.assigned}» não encontrado na equipe — usado o responsável padrão` });
    }
    // duplicidade: CPF/CNPJ → e-mail → telefone
    const keys = [];
    if (rec.document) keys.push(['document', rec.document, docMap, seenDoc]);
    for (const e of rec.emails) keys.push(['e-mail', e, emailMap, seenEmail]);
    for (const p of rec.phones) { const pk = phoneKey(p); if (pk) keys.push(['telefone', pk, phoneMap, seenPhone]); }
    // linha sem nenhum contato/documento: só dá para comparar pelo nome (igualzinho)
    if (!keys.length && rec.name) keys.push(['nome', N.normHeader(rec.name), nameMap, seenName]);
    let crm = null; let crmBy = null; let fileDup = null; let fileBy = null;
    for (const [label, k, crmMap, seen] of keys) {
      if (!crm && crmMap.has(k)) { crm = crmMap.get(k); crmBy = label === 'document' ? 'CPF/CNPJ' : label; }
      if (!fileDup && seen.has(k)) { fileDup = seen.get(k); fileBy = label === 'document' ? 'CPF/CNPJ' : label; }
    }
    if (opts.on_duplicate !== 'create' && fileDup) {
      item.status = 'duplicada'; item.motivo = `Repetida na planilha (mesmo ${fileBy} da linha ${fileDup})`; stats.duplicadas_arquivo++; out.push(item); return;
    }
    if (crm && opts.on_duplicate === 'skip') {
      item.status = 'duplicada'; item.motivo = `Já existe no CRM (mesmo ${crmBy}${crm.name ? `: ${crm.name}` : ''})`; stats.duplicadas_crm++; out.push(item); return;
    }
    for (const [, k, , seen] of keys) if (!seen.has(k)) seen.set(k, line);
    if (crm && opts.on_duplicate === 'merge') { item.status = 'atualizar'; item.lead = crm; item.motivo = `Completa o lead existente (mesmo ${crmBy})`; stats.atualizar++; }
    else stats.novos++;
    if (item.issues.length) stats.com_aviso++;
    Object.keys(rec.custom).forEach(l => customLabels.add(l));
    out.push(item);
  });

  // campos extras que precisam existir
  const needed = new Map();
  const need = (f) => { if (!needed.has(f.name)) needed.set(f.name, f); };
  for (const it of out) {
    if (it.status !== 'novo' && it.status !== 'atualizar') continue;
    const r = it.rec;
    if (r.company && r.company !== r.name) need(FIXED_FIELDS.company);
    if (r.city) need(FIXED_FIELDS.city); if (r.state) need(FIXED_FIELDS.state); if (r.cep) need(FIXED_FIELDS.cep);
    if (r.address.length) need(FIXED_FIELDS.address);
    if (r.phones[1]) need(FIXED_FIELDS.phone2); if (r.emails[1]) need(FIXED_FIELDS.email2);
    for (const l of Object.keys(r.custom)) need({ name: slug(l), label: l.slice(0, 80), type: 'text' });
  }
  const toCreate = [...needed.values()].filter(f => !defByName.get(f.name) || !defByName.get(f.name).active);
  const newCustom = [...customLabels].filter(l => !defByName.get(slug(l)));
  if (newCustom.length > MAX_NEW_CUSTOM_FIELDS) throw bad(`Esta importação criaria ${newCustom.length} campos extras novos (limite de ${MAX_NEW_CUSTOM_FIELDS}). Ignore algumas colunas.`, 'TOO_MANY_FIELDS');

  const limit = { max: plan?.max_leads ?? null, plan: plan?.name || null, current: cur, creating: stats.novos, exceeded: plan?.max_leads != null && cur + stats.novos > plan.max_leads, remaining: plan?.max_leads != null ? Math.max(plan.max_leads - cur, 0) : null };
  return { items: out, stats, opts, fields_to_create: toCreate, limit, truncated: t.truncated, stages: stageByKey, defs: defByName };
}

const fmtItem = (it, stages) => ({
  line: it.line, status: it.status, motivo: it.motivo, issues: it.issues.map(x => x.msg),
  name: it.rec.name || null, document: it.rec.document ? N.formatDocument(it.rec.document) : null,
  phone: it.rec.phones[0] || null, email: it.rec.emails[0] || null,
  city: [it.rec.city, it.rec.state].filter(Boolean).join('/') || null,
  stage: it.stage ? stages.get(it.stage)?.label || null : null,
});
const problemOf = (it, headers) => ({
  line: it.line, status: it.status === 'novo' || it.status === 'atualizar' ? 'aviso' : it.status,
  motivo: it.motivo || it.issues.map(x => x.msg).join(' | '), cells: it.cells.map(c => String(c).slice(0, 300)),
});

async function _save(id, patch) {
  await query('UPDATE lead_imports SET model_key = ?, mapping = ?, options = ? WHERE id = ?', [patch.model, json(patch.mapping), json(patch.options), id]);
}

async function preview(accountId, user, id, body) {
  const b = await _row(accountId, id, user, { withData: true });
  if (b.status !== 'analisada') throw bad('Esta importação já foi concluída.', 'ALREADY_DONE', 409);
  const ev = await _evaluate(accountId, user, b, unpackRows(b.rows), body || {});
  await _save(id, { model: body.model, mapping: body.mapping, options: body.options || {} });
  const t = _table(unpackRows(b.rows), b.header_row);
  const problems = ev.items.filter(it => it.status !== 'novo' || it.issues.length).slice(0, PROBLEM_CAP).map(it => problemOf(it, t.headers));
  await query('UPDATE lead_imports SET problems = ? WHERE id = ?', [json(problems), id]);
  return {
    id, stats: ev.stats, limit: ev.limit, truncated: ev.truncated, options: ev.opts,
    fields_to_create: ev.fields_to_create.map(f => f.label),
    rows: ev.items.slice(0, PREVIEW_ROWS).map(it => fmtItem(it, ev.stages)),
    problems: ev.items.filter(it => it.status !== 'novo' || it.issues.length).slice(0, 300).map(it => fmtItem(it, ev.stages)),
  };
}

// ─── Gravação ────────────────────────────────────────────────────────────────
async function _ensureFields(conn, accountId, fields) {
  const ids = new Map(); const created = []; const reactivated = [];
  if (!fields.length) return { ids, created, reactivated };
  const [defs] = await conn.query('SELECT id, name, label, active FROM field_definitions WHERE account_id = ?', [accountId]);
  const byName = new Map(defs.map(d => [d.name, d]));
  const [[{ mx }]] = await conn.query('SELECT COALESCE(MAX(display_order), 0) AS mx FROM field_definitions WHERE account_id = ?', [accountId]);
  let order = mx;
  for (const f of fields) {
    const d = byName.get(f.name);
    if (d) {
      if (!d.active) { await conn.query('UPDATE field_definitions SET active = 1 WHERE id = ?', [d.id]); reactivated.push(d.label); }
      ids.set(f.name, d.id);
    } else {
      const fid = uuidv4();
      await conn.query(
        `INSERT INTO field_definitions (id, account_id, name, label, field_type, required, collect_via_ai, display_order, active, is_system)
         VALUES (?, ?, ?, ?, ?, 0, 0, ?, 1, 0)`, [fid, accountId, f.name, f.label, f.type || 'text', ++order]);
      ids.set(f.name, fid); created.push(f.label);
    }
  }
  return { ids, created, reactivated };
}

/** Valores extras (campos personalizados) de um registro: nome do campo → texto. */
function _extras(rec) {
  const x = {};
  if (rec.company && rec.company !== rec.name) x.empresa = rec.company;
  if (rec.city) x.cidade = rec.city;
  if (rec.state) x.uf = rec.state;
  if (rec.cep) x.cep = rec.cep;
  if (rec.address.length) x.endereco = rec.address.join(', ').slice(0, 500);
  if (rec.phones[1]) x.telefone_2 = rec.phones[1];
  if (rec.emails[1]) x.email_2 = rec.emails[1];
  for (const [label, v] of Object.entries(rec.custom)) x[slug(label)] = v;
  return x;
}
const _extraDefs = (rec) => {
  const out = [];
  const x = _extras(rec);
  for (const f of Object.values(FIXED_FIELDS)) if (x[f.name] !== undefined) out.push(f);
  for (const label of Object.keys(rec.custom)) out.push({ name: slug(label), label: label.slice(0, 80), type: 'text' });
  return out;
};
function _noteText(fileName, it) {
  const lines = [...it.rec.notes];
  if (it.rec.phones.length > 2) lines.push(`Outros telefones: ${it.rec.phones.slice(2).join(', ')}`);
  if (it.rec.emails.length > 2) lines.push(`Outros e-mails: ${it.rec.emails.slice(2).join(', ')}`);
  return lines.length ? `Importado de «${fileName}» (linha ${it.line}):\n- ${lines.join('\n- ')}`.slice(0, 5000) : null;
}

async function commit(accountId, user, id, body) {
  const b = await _row(accountId, id, user, { withData: true });
  if (b.status !== 'analisada') throw bad('Esta importação já foi concluída.', 'ALREADY_DONE', 409);
  const stored = unpackRows(b.rows);
  const ev = await _evaluate(accountId, user, b, stored, body || {});
  if (ev.limit.exceeded) {
    const e = new AppError(`O plano ${ev.limit.plan} permite ${ev.limit.max} leads e você tem ${ev.limit.current}. Esta importação criaria ${ev.limit.creating}. Remova linhas da planilha ou faça upgrade.`, 403, 'PLAN_LIMIT_LEADS');
    throw e;
  }
  const todo = ev.items.filter(it => it.status === 'novo' || it.status === 'atualizar');
  if (!todo.length) throw bad('Não há nenhuma linha para importar com este mapeamento.', 'NOTHING_TO_IMPORT');
  const t = _table(stored, b.header_row);

  const result = await transaction(async (conn) => {
    const [[lock]] = await conn.query('SELECT status FROM lead_imports WHERE id = ? FOR UPDATE', [id]);
    if (!lock || lock.status !== 'analisada') throw bad('Esta importação já foi concluída.', 'ALREADY_DONE', 409);

    const allDefs = new Map();
    for (const it of todo) for (const f of _extraDefs(it.rec)) allDefs.set(f.name, f);
    const { ids: fieldIds, created, reactivated } = await _ensureFields(conn, accountId, [...allDefs.values()]);

    const leadRows = []; const valueRows = []; const noteRows = []; const mergeOps = [];
    for (const it of todo) {
      const r = it.rec; const extras = _extras(r); const note = _noteText(b.file_name, it);
      if (it.status === 'novo') {
        const leadId = uuidv4();
        leadRows.push([leadId, accountId, r.name || null, r.phones[0] || null, r.emails[0] || null, r.document || null, it.stage, r.source || ev.opts.source, it.assigned, id]);
        for (const [name, v] of Object.entries(extras)) valueRows.push([uuidv4(), accountId, leadId, fieldIds.get(name), String(v).slice(0, 2000)]);
        if (note) noteRows.push([uuidv4(), accountId, leadId, user.id, note, 'ui']);
      } else mergeOps.push({ it, extras, note });
    }
    const chunk = async (sql, rows, size = 400) => { for (let i = 0; i < rows.length; i += size) await conn.query(sql, [rows.slice(i, i + size)]); };
    await chunk('INSERT INTO leads (id, account_id, name, phone, email, document, stage, source, assigned_user_id, import_id) VALUES ?', leadRows);
    await chunk('INSERT INTO lead_field_values (id, account_id, lead_id, field_definition_id, value_text) VALUES ?', valueRows);
    await chunk('INSERT INTO lead_notes (id, account_id, lead_id, user_id, text, channel) VALUES ?', noteRows);

    // completar leads existentes: só preenche o que está vazio, nunca sobrescreve
    let atualizados = 0;
    for (const { it, extras } of mergeOps) {
      const cur = it.lead; const r = it.rec; const sets = []; const vals = [];
      if (!cur.name && r.name) { sets.push('name = ?'); vals.push(r.name); }
      if (!cur.phone && r.phones[0]) { sets.push('phone = ?'); vals.push(r.phones[0]); }
      if (!cur.email && r.emails[0]) { sets.push('email = ?'); vals.push(r.emails[0]); }
      if (!cur.document && r.document) { sets.push('document = ?'); vals.push(r.document); }
      if (sets.length) await conn.query(`UPDATE leads SET ${sets.join(', ')} WHERE id = ? AND account_id = ?`, [...vals, cur.id, accountId]);
      for (const [name, v] of Object.entries(extras)) {
        await conn.query(
          `INSERT INTO lead_field_values (id, account_id, lead_id, field_definition_id, value_text) VALUES (?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE value_text = IF(value_text IS NULL OR value_text = '', VALUES(value_text), value_text)`,
          [uuidv4(), accountId, cur.id, fieldIds.get(name), String(v).slice(0, 2000)]);
      }
      const note = _noteText(b.file_name, it);
      await conn.query('INSERT INTO lead_notes (id, account_id, lead_id, user_id, text, channel) VALUES (?, ?, ?, ?, ?, ?)',
        [uuidv4(), accountId, cur.id, user.id, `Dados complementados pela importação «${b.file_name}» (linha ${it.line}).${note ? '\n' + note.split('\n').slice(1).join('\n') : ''}`, 'ui']);
      atualizados++;
    }

    const problems = ev.items.filter(it => it.status !== 'novo' || it.issues.length).slice(0, PROBLEM_CAP).map(it => problemOf(it, t.headers));
    const stats = { ...ev.stats, criados: leadRows.length, atualizados, campos_criados: created, campos_reativados: reactivated, modelo: body.model, arquivo: b.file_name };
    await conn.query(
      `UPDATE lead_imports SET status = 'concluida', model_key = ?, mapping = ?, options = ?, stats = ?, problems = ?, headers = ?, \`rows\` = NULL, file_data = NULL, finished_at = NOW() WHERE id = ?`,
      [body.model, json(body.mapping), json(ev.opts), json(stats), json(problems), json(t.headers), id]);
    await conn.query(
      `INSERT INTO audit_events (id, account_id, user_id, entity_type, entity_id, action, channel, new_values) VALUES (UUID(), ?, ?, 'lead_import', ?, 'imported', 'ui', ?)`,
      [accountId, user.id, id, json({ file: b.file_name, ...stats })]);
    return stats;
  });
  return { id, status: 'concluida', ...result, problemas: Math.min(ev.items.filter(it => it.status !== 'novo' || it.issues.length).length, PROBLEM_CAP) };
}

// ─── Desfazer / descartar / histórico / relatório ────────────────────────────
async function undo(accountId, user, id) {
  const b = await _row(accountId, id, user);
  if (b.status === 'analisada') { await query('DELETE FROM lead_imports WHERE id = ?', [id]); return { id, status: 'descartada', removidos: 0, mantidos: 0 }; }
  if (b.status === 'desfeita') throw bad('Esta importação já foi desfeita.', 'ALREADY_UNDONE', 409);
  return transaction(async (conn) => {
    const keep = `EXISTS (SELECT 1 FROM cases c WHERE c.lead_id = l.id AND c.deleted_at IS NULL) OR EXISTS (SELECT 1 FROM tasks t WHERE t.lead_id = l.id)`;
    const [[{ keep: mantidos }]] = await conn.query(`SELECT COUNT(*) AS keep FROM leads l WHERE l.import_id = ? AND l.account_id = ? AND l.deleted_at IS NULL AND (${keep})`, [id, accountId]);
    const [r] = await conn.query(`UPDATE leads l SET l.deleted_at = NOW() WHERE l.import_id = ? AND l.account_id = ? AND l.deleted_at IS NULL AND NOT (${keep})`, [id, accountId]);
    const stats = { ...parse(b.stats, {}), desfeita: { removidos: r.affectedRows, mantidos } };
    await conn.query("UPDATE lead_imports SET status = 'desfeita', undone_at = NOW(), stats = ? WHERE id = ?", [json(stats), id]);
    await conn.query(`INSERT INTO audit_events (id, account_id, user_id, entity_type, entity_id, action, channel, new_values) VALUES (UUID(), ?, ?, 'lead_import', ?, 'undone', 'ui', ?)`,
      [accountId, user.id, id, json({ removidos: r.affectedRows, mantidos })]);
    return { id, status: 'desfeita', removidos: r.affectedRows, mantidos };
  });
}

async function history(accountId, user) {
  const own = user.role !== 'admin';
  const [rows] = await query(
    `SELECT i.id, i.file_name, i.status, i.model_key, i.stats, i.created_at, i.finished_at, i.undone_at, u.name AS user_name,
            (SELECT COUNT(*) FROM leads l WHERE l.import_id = i.id AND l.deleted_at IS NULL) AS leads_ativos
     FROM lead_imports i LEFT JOIN users u ON u.id = i.user_id
     WHERE i.account_id = ? AND i.status <> 'analisada' ${own ? 'AND i.user_id = ?' : ''}
     ORDER BY i.created_at DESC LIMIT 30`, own ? [accountId, user.id] : [accountId]);
  return rows.map(r => ({ ...r, stats: parse(r.stats, {}) }));
}

async function problemsCsv(accountId, user, id) {
  const b = await _row(accountId, id, user, { withData: true });
  const [[p]] = await query('SELECT problems FROM lead_imports WHERE id = ?', [id]);
  const problems = parse(p?.problems, []);
  if (!problems.length) throw new AppError('Esta importação não teve linhas com problema.', 404);
  let headers = parse(b.headers, null);
  if (!headers && b.rows) headers = _table(unpackRows(b.rows), b.header_row).headers;
  const width = Math.max(...problems.map(x => x.cells.length));
  const head = ['Linha', 'Situação', 'Motivo', ...Array.from({ length: width }, (_, i) => (headers && headers[i]) || `Coluna ${i + 1}`)];
  const label = { erro: 'Recusada', duplicada: 'Duplicada (não importada)', aviso: 'Importada com aviso' };
  return sheet.toCsv(head, problems.map(x => [x.line, label[x.status] || x.status, x.motivo, ...x.cells]));
}

// ─── Exportação ──────────────────────────────────────────────────────────────
const EXPORT_CAP = 20000;
async function exportLeads(accountId, user, { stage, search, assigned, viewer, format = 'xlsx' }) {
  const where = ['l.account_id = ?', 'l.deleted_at IS NULL']; const params = [accountId];
  if (viewer) { where.push('l.assigned_user_id = ?'); params.push(viewer); }
  if (stage) { const st = await leadStages.resolve(accountId, stage); where.push('l.stage = ?'); params.push(st ? st.stage_key : stage); }
  if (assigned) { where.push('l.assigned_user_id = ?'); params.push(assigned); }
  if (search) { where.push('(l.name LIKE ? OR l.phone LIKE ? OR l.email LIKE ? OR l.document LIKE ?)'); const s = `%${search}%`; params.push(s, s, s, `%${N.digits(search) || search}%`); }
  const [[{ total }]] = await query(`SELECT COUNT(*) AS total FROM leads l WHERE ${where.join(' AND ')}`, params);
  if (total > EXPORT_CAP) throw bad(`Há ${total} leads; a exportação aceita até ${EXPORT_CAP} por vez. Use os filtros (etapa, responsável) para dividir.`, 'EXPORT_TOO_BIG', 413);

  const [leads] = await query(
    `SELECT l.id, l.name, l.document, l.phone, l.email, l.stage, l.source, l.created_at, l.last_contact_at, u.name AS assigned_name
     FROM leads l LEFT JOIN users u ON u.id = l.assigned_user_id WHERE ${where.join(' AND ')} ORDER BY l.created_at DESC`, params);
  const stages = new Map((await leadStages.list(accountId)).map(s => [s.stage_key, s.label]));
  const [defs] = await query('SELECT id, name, label FROM field_definitions WHERE account_id = ? AND active = 1 ORDER BY display_order', [accountId]);
  const values = new Map();
  if (leads.length && defs.length) {
    const [vs] = await query(
      `SELECT v.lead_id, v.field_definition_id AS fid, COALESCE(v.value_text, CAST(v.value_number AS CHAR), CAST(v.value_date AS CHAR), CAST(v.value_boolean AS CHAR), CAST(v.value_json AS CHAR)) AS value
       FROM lead_field_values v JOIN leads l ON l.id = v.lead_id WHERE ${where.join(' AND ')}`, params);
    for (const v of vs) { if (!values.has(v.lead_id)) values.set(v.lead_id, new Map()); values.get(v.lead_id).set(v.fid, v.value); }
  }
  const byName = new Map(defs.map(d => [d.name, d]));
  const val = (leadId, name) => { const d = byName.get(name); return d ? values.get(leadId)?.get(d.id) ?? '' : ''; };
  const fixed = new Set(['empresa', 'cidade', 'uf']);
  const extras = defs.filter(d => !fixed.has(d.name));
  const fmtDt = (d) => (d ? new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }) : '');
  const header = ['Nome', 'CPF/CNPJ', 'Telefone', 'E-mail', 'Empresa', 'Cidade', 'UF', 'Origem', 'Etapa', 'Responsável', ...extras.map(d => d.label), 'Criado em', 'Último contato'];
  const rows = leads.map(l => [
    l.name || '', l.document ? N.formatDocument(l.document) : '', l.phone || '', l.email || '',
    val(l.id, 'empresa'), val(l.id, 'cidade'), val(l.id, 'uf'),
    SOURCE_LABEL[l.source] || l.source || '', stages.get(l.stage) || l.stage, l.assigned_name || '',
    ...extras.map(d => values.get(l.id)?.get(d.id) ?? ''), fmtDt(l.created_at), fmtDt(l.last_contact_at),
  ]);
  await query(`INSERT INTO audit_events (id, account_id, user_id, entity_type, entity_id, action, channel, new_values) VALUES (UUID(), ?, ?, 'lead_export', ?, 'exported', 'ui', ?)`,
    [accountId, user.id, accountId, json({ count: rows.length, format, filtros: { stage: stage || null, search: search || null, assigned: assigned || null }, escopo: viewer ? 'own' : 'all' })]);
  const stamp = new Date().toISOString().slice(0, 10);
  if (format === 'csv') return { buffer: sheet.toCsv(header, rows), filename: `leads-${stamp}.csv`, type: 'text/csv; charset=utf-8', count: rows.length };
  return { buffer: await sheet.toXlsx(header, rows, { sheetName: 'Leads' }), filename: `leads-${stamp}.xlsx`, type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', count: rows.length };
}

module.exports = { modelsInfo, template, createBatch, get, reparse, preview, commit, undo, history, problemsCsv, exportLeads, FIXED_FIELDS };

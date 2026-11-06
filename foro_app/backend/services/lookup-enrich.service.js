/**
 * lookup-enrich.service.js — "Preencher informações": enriquece uma planilha de CPF/CNPJ com telefones e e-mails
 * (e nome/endereço quando faltam) consultando a Direct Data.
 *
 * Fluxo: createJob (lê a planilha, acha a coluna do documento) → analyze (conta quantas consultas serão pagas,
 * quantas já estão em cache e quanto da cota semanal do usuário sobra) → start (confirmando o nº de consultas;
 * bloqueia se a lista precisar de mais do que resta na cota; roda em segundo plano, 4 em paralelo) → progresso → download (.xlsx/.csv) ou envio ao importador do CRM.
 *
 * Só preenche o que está VAZIO e só consulta linhas que precisam (documento válido, não repetido, com algo a
 * preencher). O que já está em cache não conta de novo na cota, então retomar um lote interrompido não gasta o que já foi feito.
 * Planilhas e resultados ficam guardados 7 dias (dados pessoais) e são apagados depois.
 */
const { v4: uuidv4 } = require('uuid');
const { query } = require('../configs/db.config');
const { AppError } = require('../middlewares/error.middleware');
const N = require('../utils/lead-normalize');
const sheet = require('../utils/lead-sheet');
const M = require('./lead-import.models');
const quota = require('./lookup-quota.service');
const lookupService = require('./lookup.service');
const client = require('./direct-data.client');
const importService = require('./lead-import.service');

const CONCURRENCY = 4;
const RETENTION_DAYS = 7;
const maxRows = () => Number(process.env.MAX_ENRICH_ROWS) || 2000;
const bad = (msg, code = 'VALIDATION', status = 422, extra) => new AppError(msg, status, code, extra);
const json = (v) => (v === null || v === undefined ? null : JSON.stringify(v));
const parse = (v, fb = null) => { if (v === null || v === undefined) return fb; if (typeof v !== 'string') return v; try { return JSON.parse(v); } catch { return fb; } };
const running = new Set();

const OUT_HEADERS = ['CPF/CNPJ', 'Nome', 'Telefone', 'Telefone 2', 'E-mail', 'E-mail 2', 'Cidade', 'UF', 'CEP', 'Endereço', 'Situação da consulta'];
const TEMPLATE_HEADERS = ['CPF/CNPJ', 'Nome', 'Telefone', 'E-mail'];
const COL_RE = {
  document: /^(cpf|cnpj|cpf cnpj|cnpj cpf|documento|doc|cpf do .*|cnpj do .*)$/,
  name: /^(nome|nome completo|razao social|cliente|name)$/,
  phone: /^(telefone|celular|fone|whatsapp|tel|contato|telefone 1|celular 1)$/,
  email: /^(e mail|email|e mail 1|email 1)$/,
  city: /^(cidade|municipio)$/, state: /^(uf|estado)$/, cep: /^cep$/, address: /^(endereco|logradouro|rua)$/,
};
const FILL_KEYS = ['phone', 'email', 'name', 'address'];
const isExample = (row) => String(row.find(c => String(c).trim()) || '').trim().toUpperCase().startsWith('(EXEMPLO)');

// ─── Modelo de planilha ──────────────────────────────────────────────────────
async function template(format = 'xlsx') {
  const rows = [
    ['(EXEMPLO) 529.982.247-25', '(EXEMPLO) Maria da Silva', '', ''],
    ['(EXEMPLO) 11.222.333/0001-81', '', '', 'contato@empresa.com.br'],
  ];
  if (format === 'csv') return { buffer: sheet.toCsv(TEMPLATE_HEADERS, rows), contentType: 'text/csv; charset=utf-8', filename: 'modelo-enriquecimento.csv' };
  const buffer = await sheet.toXlsx(TEMPLATE_HEADERS, rows, {
    sheetName: 'Lista', widths: [28, 32, 22, 34],
    extraSheet: { name: 'Como preencher', lines: [
      'Como preencher',
      'CPF/CNPJ: obrigatório. Com ou sem pontos e traço. Pode misturar CPF e CNPJ na mesma coluna.',
      'Nome, Telefone, E-mail: opcionais. Se já souber, preencha: o Foro só consulta quem tem algo faltando e nunca sobrescreve o que você preencheu.',
      'Apague as linhas de exemplo (que começam com "(EXEMPLO)") antes de enviar.',
      'Tire os zeros da frente? Não precisa: se o Excel comeu os zeros do CPF, o Foro recompõe.',
      `Limite: ${maxRows()} linhas por lote. Cada consulta tem custo; antes de consultar o Foro mostra quantas serão feitas e quanto custa.`,
    ] },
  });
  return { buffer, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', filename: 'modelo-enriquecimento.xlsx' };
}

// ─── Leitura da planilha ─────────────────────────────────────────────────────
const normH = (h) => N.normHeader(h);
function detectColumns(headers, rows, numeric, headerRow) {
  const cols = {};
  headers.forEach((h, i) => { const nh = normH(h); for (const [k, re] of Object.entries(COL_RE)) if (cols[k] === undefined && re.test(nh)) cols[k] = i; });
  if (cols.document === undefined) { // pelo conteúdo: a coluna em que mais células são CPF/CNPJ válidos
    let best = -1; let bestN = 0;
    headers.forEach((_, i) => {
      let n = 0;
      rows.slice(headerRow + 1, headerRow + 41).forEach((r, ri) => { const d = N.normDocument(r[i], { numeric: numeric[headerRow + 1 + ri]?.[i] }); if (d?.valid) n++; });
      if (n > bestN) { bestN = n; best = i; }
    });
    if (best >= 0) cols.document = best;
  }
  return cols;
}

function _table(stored, headerRow) {
  const rows = stored.rows;
  const headers = (rows[headerRow] || []).map((h, i) => N.clean(h) || `Coluna ${i + 1}`);
  const body = [];
  for (let r = headerRow + 1; r < rows.length; r++) {
    if (isExample(rows[r])) continue;
    body.push({ line: stored.lines[r], cells: rows[r], num: stored.numeric[r] || [] });
  }
  return { headers, body };
}

async function _row(accountId, id, user, { withData = false } = {}) {
  const [r] = await query(`SELECT id, account_id, user_id, file_name, status, sheet_index, header_row, doc_col, options, analysis, progress, created_at, started_at, finished_at${withData ? ', `rows`, results' : ''} FROM enrichment_jobs WHERE id = ? AND account_id = ? LIMIT 1`, [id, accountId]);
  if (!r.length) throw bad('Lote não encontrado.', 'NOT_FOUND', 404);
  const row = r[0];
  if (user && user.role !== 'admin' && user.permissions?.view_scope === 'own' && row.user_id !== user.id) throw bad('Lote não encontrado.', 'NOT_FOUND', 404);
  return row;
}
const unpack = (text) => { const d = parse(text, { rows: [], num: [], lines: [] }); return { rows: d.rows, numeric: (d.num || []).map(s => [...s].map(c => c === '1')), lines: d.lines }; };
const pack = (r) => JSON.stringify({ rows: r.rows, num: r.numeric.map(x => x.map(b => (b ? '1' : '0')).join('')), lines: r.lines });

// ─── Análise ─────────────────────────────────────────────────────────────────
function _options(raw) {
  const o = raw || {};
  const fill = {};
  for (const k of FILL_KEYS) fill[k] = o.fill && k in o.fill ? !!o.fill[k] : (k === 'phone' || k === 'email');
  if (!Object.values(fill).some(Boolean)) throw bad('Marque ao menos uma coisa para preencher (telefone, e-mail…).', 'NOTHING_TO_FILL');
  return { fill };
}

/** Classifica cada linha e conta as consultas. Não grava nada e não chama o provedor. */
async function _evaluate(accountId, row, stored, { doc_col, options }) {
  const t = _table(stored, row.header_row);
  const cols = detectColumns(t.headers, stored.rows, stored.numeric, row.header_row);
  if (doc_col !== undefined && doc_col !== null) cols.document = Number(doc_col);
  if (cols.document === undefined || !Number.isInteger(cols.document) || cols.document < 0 || cols.document >= t.headers.length) {
    throw bad('Não encontrei a coluna do CPF/CNPJ. Escolha qual coluna tem o documento.', 'NO_DOC_COLUMN');
  }
  const fill = options.fill;
  const blank = (cells, c) => c === undefined || !String(cells[c] ?? '').trim();
  const needs = (cells) =>
    (fill.phone && blank(cells, cols.phone)) || (fill.email && blank(cells, cols.email)) || (fill.name && blank(cells, cols.name)) ||
    (fill.address && (blank(cells, cols.address) || blank(cells, cols.city) || blank(cells, cols.cep)));

  const items = []; const seen = new Map();
  const stats = { total: 0, invalidas: 0, repetidas: 0, completas: 0, em_cache: 0, consultar: 0, consultar_cpf: 0, consultar_cnpj: 0 };
  for (let i = 0; i < t.body.length && i < maxRows(); i++) {
    const b = t.body[i];
    if (b.cells.every(c => !String(c).trim())) continue;
    stats.total++;
    const d = N.normDocument(b.cells[cols.document], { numeric: b.num[cols.document] });
    const it = { i, line: b.line, doc: d?.digits || null, kind: d?.type || null, status: null };
    if (!d || !d.valid || !d.type) { it.status = 'invalida'; stats.invalidas++; }
    else if (seen.has(d.digits)) { it.status = 'repetida'; it.first = seen.get(d.digits); stats.repetidas++; }
    else {
      seen.set(d.digits, i);
      if (!needs(b.cells)) { it.status = 'completa'; stats.completas++; }
      else if (await lookupService.cacheGet(accountId, d.type, d.digits)) { it.status = 'cache'; stats.em_cache++; }
      else { it.status = 'consultar'; stats.consultar++; stats[`consultar_${d.type}`]++; }
    }
    items.push(it);
  }
  const truncated = t.body.length > maxRows();
  return { t, cols, items, stats, truncated };
}

/** Quanto da cota semanal do usuário a lista usa. */
async function _quote(accountId, user, stats) {
  const q = await quota.status(accountId, user.id);
  return { needed: stats.consultar, limit: q.limit, used: q.used, remaining: q.remaining, renews_at: q.renews_at, has_plan: q.has_plan, shortfall: Math.max(0, stats.consultar - q.remaining) };
}

async function _describe(accountId, user, row, ev, options) {
  return {
    id: row.id, file_name: row.file_name, status: row.status,
    headers: ev.t.headers, doc_col: ev.cols.document, detected: Object.fromEntries(Object.entries(ev.cols).map(([k, v]) => [k, ev.t.headers[v]])),
    sample: ev.t.body.slice(0, 5).map(b => b.cells),
    options, stats: ev.stats, truncated: ev.truncated, max_rows: maxRows(),
    quote: await _quote(accountId, user, ev.stats), configured: client.configured(),
  };
}

// ─── Criar / reanalisar ──────────────────────────────────────────────────────
async function createJob(accountId, user, { buffer, name }) {
  await query("DELETE FROM enrichment_jobs WHERE account_id = ? AND created_at < (NOW() - INTERVAL ? DAY)", [accountId, RETENTION_DAYS]);
  const fileName = String(name || 'planilha').replace(/[\\/]+/g, '_').slice(0, 200);
  let read = await sheet.readSheet(buffer, { sheet: 0 });
  for (let i = 1; read.rows.length < 2 && i < Math.min(read.sheets.length, 6); i++) read = await sheet.readSheet(buffer, { sheet: i });
  if (read.rows.length < 2) throw bad('A planilha está vazia ou só tem o cabeçalho.', 'EMPTY_SHEET');
  const stored = { rows: read.rows, numeric: read.numeric, lines: read.lines };
  const headerRow = M.guessHeaderRow(read.rows);
  const id = uuidv4();
  const row = { id, header_row: headerRow, file_name: fileName, status: 'analisada' };
  const options = _options(null);
  const ev = await _evaluate(accountId, row, stored, { options });
  await query(
    'INSERT INTO enrichment_jobs (id, account_id, user_id, file_name, status, sheet_index, header_row, doc_col, options, `rows`, analysis) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [id, accountId, user.id, fileName, 'analisada', read.sheet, headerRow, ev.cols.document, json(options), pack(stored), json(ev.stats)]);
  return _describe(accountId, user, row, ev, options);
}

async function analyze(accountId, user, id, body = {}) {
  const row = await _row(accountId, id, user, { withData: true });
  if (row.status !== 'analisada') throw bad('Este lote já foi iniciado.', 'ALREADY_STARTED', 409);
  const options = _options(body.options || parse(row.options));
  const stored = unpack(row.rows);
  const ev = await _evaluate(accountId, row, stored, { doc_col: body.doc_col ?? row.doc_col, options });
  await query('UPDATE enrichment_jobs SET doc_col = ?, options = ?, analysis = ? WHERE id = ?', [ev.cols.document, json(options), json(ev.stats), id]);
  return _describe(accountId, user, row, ev, options);
}

async function get(accountId, user, id) {
  const row = await _row(accountId, id, user, { withData: true });
  const progress = parse(row.progress, null);
  if (row.status === 'analisada' || row.status === 'interrompida') {
    const options = _options(parse(row.options));
    const ev = await _evaluate(accountId, row, unpack(row.rows), { doc_col: row.doc_col, options });
    return { ...(await _describe(accountId, user, row, ev, options)), progress };
  }
  return { id: row.id, file_name: row.file_name, status: row.status, options: parse(row.options), analysis: parse(row.analysis), progress, created_at: row.created_at, started_at: row.started_at, finished_at: row.finished_at };
}

async function history(accountId, user) {
  const own = user.role !== 'admin' && user.permissions?.view_scope === 'own';
  const [rows] = await query(
    `SELECT e.id, e.file_name, e.status, e.analysis, e.progress, e.created_at, e.finished_at, u.name AS user_name
     FROM enrichment_jobs e LEFT JOIN users u ON u.id = e.user_id
     WHERE e.account_id = ? AND e.status <> 'analisada' ${own ? 'AND e.user_id = ?' : ''} ORDER BY e.created_at DESC LIMIT 20`, own ? [accountId, user.id] : [accountId]);
  return rows.map(r => ({ id: r.id, file_name: r.file_name, status: r.status, analysis: parse(r.analysis), progress: parse(r.progress), created_at: r.created_at, finished_at: r.finished_at, user_name: r.user_name }));
}

async function discard(accountId, user, id) {
  const row = await _row(accountId, id, user);
  if (row.status === 'rodando' && running.has(id)) throw bad('Este lote está em andamento.', 'RUNNING', 409);
  await query('DELETE FROM enrichment_jobs WHERE id = ? AND account_id = ?', [id, accountId]);
  return { id, deleted: true };
}

// ─── Execução ────────────────────────────────────────────────────────────────
const addr0 = (d) => (d.enderecos || [])[0] || null;
function compact(kind, data) {
  const phones = lookupService.pickPhones(data.telefones || []);
  const a = addr0(data);
  return {
    nome: kind === 'cnpj' ? (data.nome_fantasia || data.razao_social || null) : (data.nome || null),
    telefones: phones.slice(0, 4), emails: (data.emails || []).slice(0, 4),
    cidade: a?.cidade || null, uf: a?.uf || null, cep: a?.cep || null,
    endereco: a ? [a.logradouro, a.numero, a.complemento, a.bairro].filter(Boolean).join(', ') || null : null,
  };
}

async function start(accountId, user, id, { confirm_queries } = {}) {
  if (!client.configured()) throw bad('As consultas ainda não foram configuradas na plataforma. Fale com o suporte.', 'DIRECT_DATA_NOT_CONFIGURED', 503);
  const row = await _row(accountId, id, user, { withData: true });
  if (row.status !== 'analisada' && row.status !== 'interrompida') throw bad('Este lote já foi iniciado.', 'ALREADY_STARTED', 409);
  const options = _options(parse(row.options));
  const ev = await _evaluate(accountId, row, unpack(row.rows), { doc_col: row.doc_col, options });
  const quote = await _quote(accountId, user, ev.stats);
  if (Number(confirm_queries) !== ev.stats.consultar) {
    throw bad('O número de consultas mudou desde a análise. Confira os valores e confirme de novo.', 'QUOTE_CHANGED', 409, { stats: ev.stats, quote });
  }
  if (ev.stats.consultar === 0 && ev.stats.em_cache === 0) throw bad('Não há nada para consultar neste lote.', 'NOTHING_TO_QUERY');
  if (quote.shortfall > 0) {
    const ren = new Date(quote.renews_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    throw bad(quote.has_plan
      ? `Esta lista precisa de ${quote.needed} consultas e você tem ${quote.remaining} disponíveis nesta semana (renovam em ${ren}). Reduza a lista ou fale com a gente pelo plano Consulting.`
      : 'Você ainda não tem um plano. Peça ao administrador do escritório para contratar um plano para você.',
    quote.has_plan ? 'LOOKUP_QUOTA_EXHAUSTED' : 'LOOKUP_NO_PLAN', 429, { quote });
  }

  const [r] = await query("UPDATE enrichment_jobs SET status = 'rodando', started_at = COALESCE(started_at, NOW()), finished_at = NULL, progress = ? WHERE id = ? AND status IN ('analisada','interrompida')",
    [json({ done: 0, total: ev.stats.consultar + ev.stats.em_cache, ok: 0, sem_resultado: 0, erros: 0, consultas: 0 }), id]);
  if (!r.affectedRows) throw bad('Este lote já foi iniciado.', 'ALREADY_STARTED', 409);
  const prior = parse(row.results, {}) || {};
  setImmediate(() => _run(accountId, user, id, ev, prior).catch(e => console.error('[enrich] job falhou:', e)));
  return { id, status: 'rodando', total: ev.stats.consultar + ev.stats.em_cache };
}

async function _run(accountId, user, id, ev, prior = {}) {
  running.add(id);
  const results = { ...prior }; // índice da linha → resultado (ao retomar, mantém o que já foi feito)
  const all = ev.items.filter(it => it.status === 'consultar' || it.status === 'cache');
  const todo = all.filter(it => !['ok', 'sem_resultado'].includes(results[it.i]?.s));
  const was = (s) => Object.values(results).filter(r => r.s === s).length;
  const prog = { done: all.length - todo.length, total: all.length, ok: was('ok'), sem_resultado: was('sem_resultado'), erros: 0, consultas: 0 };
  let stop = null; let cursor = 0; let lastSave = prog.done;
  const save = async (status) => query('UPDATE enrichment_jobs SET progress = ?, results = ?' + (status ? ", status = ?, finished_at = NOW()" : '') + ' WHERE id = ?',
    status ? [json(prog), json(results), status, id] : [json(prog), json(results), id]);

  const worker = async () => {
    while (!stop) {
      const it = todo[cursor++]; if (!it) return;
      try {
        const out = await lookupService.lookup(accountId, user.id, it.kind, it.doc, { source: 'lista', withQuota: false });
        results[it.i] = { s: 'ok', ...compact(it.kind, out.data), cached: out.cached };
        prog.ok++; if (out.counted) prog.consultas++;
      } catch (e) {
        if (e.code === 'LOOKUP_NOT_FOUND') { results[it.i] = { s: 'sem_resultado' }; prog.sem_resultado++; }
        else if (e.statusCode === 429) { stop = 'A cota semanal de consultas acabou durante o lote. O que já foi feito está salvo; retome quando a cota renovar ou fale com a gente pelo plano Consulting.'; results[it.i] = { s: 'pendente' }; cursor--; }
        else { results[it.i] = { s: 'erro' }; prog.erros++; }
      }
      prog.done++;
      if (prog.done - lastSave >= 20) { lastSave = prog.done; await save().catch(() => {}); }
    }
  };
  try {
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    prog.mensagem = stop || null;
    await save(stop ? 'interrompida' : 'concluida');
  } catch (e) {
    prog.mensagem = 'Erro inesperado no lote.';
    await save('interrompida').catch(() => {});
  } finally {
    running.delete(id);
  }
}

/** No boot: lotes que estavam rodando quando o servidor caiu ficam "interrompidos" (retomar não cobra o que já foi feito). */
async function recoverInterrupted() {
  const [r] = await query("UPDATE enrichment_jobs SET status = 'interrompida', finished_at = NOW() WHERE status = 'rodando'");
  return r.affectedRows;
}
async function purgeOld() {
  const [r] = await query('DELETE FROM enrichment_jobs WHERE created_at < (NOW() - INTERVAL ? DAY)', [RETENTION_DAYS]);
  return r.affectedRows;
}

// ─── Resultado ───────────────────────────────────────────────────────────────
async function _build(accountId, user, id) {
  const row = await _row(accountId, id, user, { withData: true });
  if (!['concluida', 'interrompida'].includes(row.status)) throw bad('O lote ainda não terminou.', 'NOT_FINISHED', 409);
  const stored = unpack(row.rows); const results = parse(row.results, {}) || {};
  const options = _options(parse(row.options));
  const ev = await _evaluate(accountId, row, stored, { doc_col: row.doc_col, options });
  const c = ev.cols; const t = ev.t;
  const recognized = new Set(Object.values(c));
  const extraIdx = t.headers.map((_, i) => i).filter(i => !recognized.has(i));
  const header = [...OUT_HEADERS, ...extraIdx.map(i => t.headers[i])];
  const val = (cells, k) => (c[k] === undefined ? '' : N.clean(cells[c[k]]));
  const rows = []; const tally = { preenchidas: 0, sem_resultado: 0, invalidas: 0, completas: 0, repetidas: 0, erros: 0 };
  const byI = new Map(ev.items.map(it => [it.i, it]));

  t.body.forEach((b, i) => {
    const it = byI.get(i); if (!it) return;
    const own = results[it.status === 'repetida' ? it.first : i];
    const cells = b.cells;
    const phones = []; const emails = [];
    const addPhone = (p) => { const n = N.normPhone(p); const v = n && n.valid ? n.value : N.clean(p); if (v && !phones.some(x => N.digits(x) === N.digits(v))) phones.push(v); };
    const addEmail = (e) => { const v = N.clean(e).toLowerCase(); if (v && !emails.includes(v)) emails.push(v); };
    N.splitPhones(val(cells, 'phone')).forEach(addPhone); N.splitEmails(val(cells, 'email')).forEach(addEmail);
    let situ; const filled = [];
    if (it.status === 'invalida') { situ = 'Documento inválido: não consultado'; tally.invalidas++; }
    else if (it.status === 'completa') { situ = 'Já estava completo: não consultado'; tally.completas++; }
    else if (it.status === 'repetida') { situ = `Repetido (mesmo documento da linha ${ev.items.find(x => x.i === it.first)?.line})`; tally.repetidas++; }
    if (own && own.s === 'ok') {
      if (!phones.length && own.telefones.length) filled.push('telefone'); if (!emails.length && own.emails.length) filled.push('e-mail');
      own.telefones.forEach(addPhone); own.emails.forEach(addEmail);
      if (it.status !== 'repetida') { situ = filled.length ? `Preenchido: ${filled.join(', ')}` : 'Consultado: nada novo para preencher'; if (filled.length) tally.preenchidas++; }
    } else if (own && own.s === 'sem_resultado') { situ = 'Sem resultado na fonte (não contou na cota)'; tally.sem_resultado++; }
    else if (own && own.s === 'erro') { situ = 'Erro na consulta (não contou na cota): tente de novo'; tally.erros++; }
    else if (own && own.s === 'pendente' || (!own && (it.status === 'consultar' || it.status === 'cache'))) { situ = 'Não consultado (lote interrompido)'; }
    const f = (x) => (own && own.s === 'ok' ? x : '');
    const name = val(cells, 'name') || N.properName(f(own?.nome) || '') || '';
    const docOut = it.doc ? N.formatDocument(it.doc) : N.clean(cells[c.document]);
    rows.push([
      docOut, name, phones[0] || '', phones[1] || '', emails[0] || '', emails[1] || '',
      val(cells, 'city') || N.properName(f(own?.cidade) || ''), val(cells, 'state') || f(own?.uf) || '', val(cells, 'cep') || f(own?.cep) || '',
      val(cells, 'address') || N.properName(f(own?.endereco) || ''), situ || '',
      ...extraIdx.map(x => N.clean(cells[x])),
    ]);
  });
  return { row, header, rows, tally };
}

async function download(accountId, user, id, format = 'xlsx') {
  const { row, header, rows } = await _build(accountId, user, id);
  const base = row.file_name.replace(/\.[a-z0-9]+$/i, '').replace(/[^\w.-]+/g, '_').slice(0, 80) || 'lista';
  if (format === 'csv') return { buffer: sheet.toCsv(header, rows), contentType: 'text/csv; charset=utf-8', filename: `${base}-enriquecida.csv` };
  const buffer = await sheet.toXlsx(header, rows, { sheetName: 'Enriquecida', widths: [26, 34, 20, 20, 32, 32, 20, 6, 12, 40, 36] });
  return { buffer, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', filename: `${base}-enriquecida.xlsx` };
}

/** Leva a planilha enriquecida para o assistente de importação do CRM (modelo/colunas/duplicados já resolvidos lá). */
async function toImport(accountId, user, id) {
  const { row, header, rows } = await _build(accountId, user, id);
  const buffer = await sheet.toXlsx(header, rows, { sheetName: 'Enriquecida' });
  return importService.createBatch(accountId, user, { buffer, name: `${row.file_name.replace(/\.[a-z0-9]+$/i, '')}-enriquecida.xlsx` });
}

module.exports = { template, createJob, analyze, get, history, discard, start, download, toImport, recoverInterrupted, purgeOld, OUT_HEADERS };

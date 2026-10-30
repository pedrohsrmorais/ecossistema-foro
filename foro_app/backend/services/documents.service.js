/**
 * documents.service.js — módulo de elaboração de documentos.
 *
 * Princípio anti-alucinação:
 *   1. O esqueleto vem de um MODELO pronto (document-templates.service) — a IA não inventa a estrutura.
 *   2. Dados do sistema ({{placeholders}}) são preenchidos sem IA; o que falta vira [PREENCHER: ...].
 *   3. A IA só preenche os trechos [[IA: ...]], com os dados do processo e uma lista CURADA de referências legais.
 *   4. Toda citação fora da lista vira [CONFERIR] (document-guard). Documentos nascem "rascunho" e a revisão é humana.
 */
const Anthropic = require('@anthropic-ai/sdk');
const { v4: uuidv4 } = require('uuid');
const { query, transaction } = require('../configs/db.config');
const { AppError } = require('../middlewares/error.middleware');
const templates = require('./document-templates.service');
const guard = require('./document-guard');
const areas = require('../configs/legal-areas');
const aiCredits = require('./ai-credits.service');
const casesService = require('./cases.service');
const partiesService = require('./case-parties.service');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MAX_DRAFT_TOKENS = 4000;
const MAX_CONTENT = 400000;
const STATUSES = ['rascunho', 'revisado', 'final'];
const CLIENT_ROLES = ['cliente', 'autor', 'empregado', 'investigado', 'orgao_publico'];
const OPPOSING_ROLES = ['reu', 'empregador', 'advogado_adverso', 'fornecedor', 'litisconsorte', 'vitima'];
const miss = (what) => `[PREENCHER: ${what}]`;
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

function _today() {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).map(x => [x.type, x.value]));
  return { iso: `${p.year}-${p.month}-${p.day}`, long: `${Number(p.day)} de ${MONTHS[Number(p.month) - 1]} de ${p.year}`, br: `${p.day}/${p.month}/${p.year}` };
}
const brl = (n) => n == null || n === '' ? null : Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Monta o dicionário de valores usado pelos {{placeholders}}. */
async function buildContext(accountId, user, caseId, extra = {}) {
  const [[acc]] = await query('SELECT name FROM accounts WHERE id = ? LIMIT 1', [accountId]);
  const [[u]] = await query('SELECT name, oab_number FROM users WHERE id = ? LIMIT 1', [user.id]);
  const t = _today();
  const ctx = {
    escritorio: acc?.name || '', advogado: { nome: u?.name || '', oab: u?.oab_number || '' },
    data: { hoje: t.br, extenso: t.long }, ...extra,
  };
  if (!caseId) return { ctx, c: null };
  const c = await casesService.getById(caseId, accountId);
  const cli = c.parties.find(p => CLIENT_ROLES.includes(p.role)) || null;
  const opp = c.parties.find(p => OPPOSING_ROLES.includes(p.role)) || null;
  Object.assign(ctx, {
    processo: {
      numero: c.case_number || '', titulo: c.title || '', tribunal: c.tribunal || '', comarca: c.comarca || '', vara: c.vara || '',
      magistrado: c.magistrate || '', area: c.area_label, fase: c.phase || '', valor_causa: brl(c.cause_value) || '',
    },
    cliente: cli ? { nome: cli.name, qualificacao: partiesService.qualify(cli), documento: partiesService.fmtDoc(cli.document) } : { nome: '', qualificacao: '', documento: '' },
    parte_contraria: opp ? { nome: opp.name, qualificacao: partiesService.qualify(opp) } : (c.opposing_party ? { nome: c.opposing_party, qualificacao: `**${c.opposing_party.toUpperCase()}**, ${miss('qualificação completa')}` } : { nome: '', qualificacao: '' }),
    detalhes: Object.fromEntries(c.area_fields.map(f => {
      const v = (c.details || {})[f.key];
      if (v === undefined || v === null || v === '') return [f.key, ''];
      if (Array.isArray(v)) return [f.key, v.join(', ')];
      if (f.type === 'date' && /^\d{4}-\d{2}-\d{2}/.test(String(v))) return [f.key, String(v).slice(0, 10).split('-').reverse().join('/')];
      return [f.key, v];
    })),
    __detLabels: Object.fromEntries(c.area_fields.map(f => [f.key, f.label.toLowerCase()])),
    cidade: c.comarca || '',
  });
  return { ctx, c };
}

function _lookup(ctx, pathStr) {
  return pathStr.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), ctx);
}
const LABELS = { 'cliente.qualificacao': 'qualificação do cliente', 'cliente.nome': 'nome do cliente', 'parte_contraria.qualificacao': 'qualificação da parte contrária', 'parte_contraria.nome': 'parte contrária',
  'processo.numero': 'número do processo', 'processo.vara': 'vara', 'processo.comarca': 'comarca', 'processo.tribunal': 'tribunal', 'processo.magistrado': 'magistrado', 'processo.valor_causa': 'valor da causa',
  'advogado.oab': 'OAB do advogado (Configurações > Perfil)', 'advogado.nome': 'nome do advogado', cidade: 'cidade / comarca' };

/** Substitui {{a.b}} pelos dados; ausente => [PREENCHER: ...]. Não toca em [[IA: ...]]. */
function fill(body, ctx) {
  return body.replace(/\{\{\s*([a-z0-9_.]+)\s*\}\}/gi, (_, key) => {
    const v = _lookup(ctx, key);
    if (v === undefined || v === null || v === '') {
      const d = key.startsWith('detalhes.') ? (ctx.__detLabels?.[key.slice(9)] || key.slice(9).replace(/_/g, ' ')) : (LABELS[key] || key.replace(/[._]/g, ' '));
      return miss(d);
    }
    return String(v);
  });
}

async function _get(id, accountId) {
  const [r] = await query('SELECT * FROM documents WHERE id = ? AND account_id = ? AND deleted_at IS NULL LIMIT 1', [id, accountId]);
  if (!r.length) throw new AppError('Documento não encontrado.', 404);
  return r[0];
}

async function list(accountId, { case_id, area_key, status, search, viewer } = {}) {
  const cond = ['d.account_id = ?', 'd.deleted_at IS NULL']; const params = [accountId];
  if (viewer) { cond.push('(d.created_by = ? OR (d.case_id IS NOT NULL AND (c.responsible_user_id = ? OR EXISTS (SELECT 1 FROM case_members m WHERE m.case_id = c.id AND m.user_id = ?))))'); params.push(viewer, viewer, viewer); }
  if (case_id) { cond.push('d.case_id = ?'); params.push(case_id); }
  if (area_key) { cond.push('d.area_key = ?'); params.push(area_key); }
  if (status) { cond.push('d.status = ?'); params.push(status); }
  if (search) { cond.push('d.title LIKE ?'); params.push(`%${String(search).slice(0, 80)}%`); }
  const [rows] = await query(
    `SELECT d.id, d.case_id, d.template_key, d.area_key, d.title, d.status, d.ai_generated, d.open_flags, d.created_at, d.updated_at,
            c.title AS case_title, c.case_number
     FROM documents d LEFT JOIN cases c ON c.id = d.case_id WHERE ${cond.join(' AND ')} ORDER BY d.updated_at DESC LIMIT 300`, params);
  return rows;
}

async function getById(id, accountId) {
  const d = await _get(id, accountId);
  const [versions] = await query('SELECT version_no, note, created_at FROM document_versions WHERE document_id = ? ORDER BY version_no DESC LIMIT 50', [id]);
  const tpl = d.template_key ? await templates.get(d.template_key, accountId) : null;
  return { ...d, versions, template: tpl ? { key: tpl.key, title: tpl.title, reviewed: tpl.reviewed, origin: tpl.origin, source: tpl.source, legal_basis: tpl.legal_basis } : null,
    pending_ai_slots: (d.content.match(new RegExp(guard.SLOT_SRC, 'g')) || []).length };
}

async function _saveVersion(conn, d, accountId, userId, note) {
  const [[m]] = await conn.query('SELECT COALESCE(MAX(version_no),0) AS n FROM document_versions WHERE document_id = ?', [d.id]);
  await conn.query('INSERT INTO document_versions (id, account_id, document_id, version_no, content, note, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [uuidv4(), accountId, d.id, m.n + 1, d.content, note || null, userId]);
}

/** Cria o documento a partir de um modelo (sem IA): estrutura + dados do sistema. */
async function create(accountId, user, { template_key, case_id, title, lead_id } = {}) {
  const tpl = await templates.get(template_key, accountId);
  if (!tpl) throw new AppError('Modelo não encontrado.', 404);
  if (case_id) await casesService.getById(case_id, accountId);
  const { ctx } = await buildContext(accountId, user, case_id || null);
  const content = fill(tpl.body, ctx);
  const id = uuidv4();
  const finalTitle = String(title || '').trim().slice(0, 255) || `${tpl.title}${ctx.processo?.titulo ? ' — ' + ctx.processo.titulo : ''}`.slice(0, 255);
  await transaction(async (conn) => {
    await conn.query(
      `INSERT INTO documents (id, account_id, case_id, lead_id, template_key, template_version, area_key, title, content, open_flags, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, accountId, case_id || null, lead_id || null, tpl.key, parseInt(tpl.version, 10) || 1, tpl.area, finalTitle, content, guard.countOpen(content), user.id]);
    await _saveVersion(conn, { id, content }, accountId, user.id, 'Criado a partir do modelo');
  });
  return getById(id, accountId);
}

async function createBlank(accountId, user, { title, case_id, area_key } = {}) {
  if (!String(title || '').trim()) throw new AppError('Informe um título.', 422, 'VALIDATION');
  if (case_id) await casesService.getById(case_id, accountId);
  const id = uuidv4();
  await query('INSERT INTO documents (id, account_id, case_id, area_key, title, content, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, accountId, case_id || null, areas.AREA_KEYS.includes(area_key) ? area_key : 'geral', String(title).trim().slice(0, 255), '', user.id]);
  return getById(id, accountId);
}

async function update(id, accountId, userId, { title, content, status, note } = {}) {
  const d = await _get(id, accountId);
  const sets = []; const vals = [];
  if (title !== undefined) { if (!String(title).trim()) throw new AppError('Título não pode ficar vazio.', 422, 'VALIDATION'); sets.push('title = ?'); vals.push(String(title).trim().slice(0, 255)); }
  if (status !== undefined) { if (!STATUSES.includes(status)) throw new AppError(`Status inválido. Use: ${STATUSES.join(', ')}.`, 422, 'VALIDATION'); sets.push('status = ?'); vals.push(status); }
  let contentChanged = false;
  if (content !== undefined) {
    if (typeof content !== 'string' || content.length > MAX_CONTENT) throw new AppError('Conteúdo inválido ou grande demais.', 422, 'VALIDATION');
    if (content !== d.content) { contentChanged = true; sets.push('content = ?', 'open_flags = ?'); vals.push(content, guard.countOpen(content)); }
  }
  if (!sets.length) return getById(id, accountId);
  await transaction(async (conn) => {
    await conn.query(`UPDATE documents SET ${sets.join(', ')} WHERE id = ? AND account_id = ?`, [...vals, id, accountId]);
    if (contentChanged) await _saveVersion(conn, { id, content }, accountId, userId, note || 'Edição manual');
  });
  return getById(id, accountId);
}

async function restoreVersion(id, accountId, userId, versionNo) {
  await _get(id, accountId);
  const [v] = await query('SELECT content FROM document_versions WHERE document_id = ? AND version_no = ? LIMIT 1', [id, Number(versionNo) || 0]);
  if (!v.length) throw new AppError('Versão não encontrada.', 404);
  return update(id, accountId, userId, { content: v[0].content, note: `Restaurada a versão ${versionNo}` });
}
async function getVersion(id, accountId, versionNo) {
  await _get(id, accountId);
  const [v] = await query('SELECT version_no, content, note, created_at FROM document_versions WHERE document_id = ? AND version_no = ? LIMIT 1', [id, Number(versionNo) || 0]);
  if (!v.length) throw new AppError('Versão não encontrada.', 404);
  return v[0];
}

async function remove(id, accountId) {
  await _get(id, accountId);
  await query('UPDATE documents SET deleted_at = NOW() WHERE id = ? AND account_id = ?', [id, accountId]);
}

// ─── IA: preenche só os trechos [[IA: ...]] ─────────────────────────────────

const DRAFT_SYSTEM = `Você redige trechos de peças e documentos jurídicos brasileiros para revisão de um advogado.
REGRAS INVIOLÁVEIS:
- Use APENAS os fatos e dados fornecidos em <dados>. Não invente fatos, datas, valores, nomes, números de processo, decisões ou jurisprudência.
- Cite SOMENTE os dispositivos legais listados em <referencias>. Não cite nenhuma outra lei, artigo, súmula, tema ou precedente. Se faltar base, escreva o argumento sem citação.
- Quando faltar um dado necessário, escreva [PREENCHER: o que falta] no lugar — nunca suponha.
- Texto formal, objetivo, em português jurídico brasileiro, sem floreios. Não repita o que já está no esqueleto.
- Responda APENAS com um objeto JSON: {"1":"texto do trecho 1","2":"texto do trecho 2",...}. Texto simples/Markdown, sem comentários fora do JSON.`;

function _extractJson(text) {
  const m = String(text).match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

async function draftWithAI(id, accountId, user, { instructions } = {}) {
  const aiService = require('./ai.service'); // lazy: ai.service -> ai-tools -> documents (evita ciclo)
  const d = await _get(id, accountId);
  const slotRe = () => new RegExp(guard.SLOT_SRC, 'g');
  const slots = [...d.content.matchAll(slotRe())];
  if (!slots.length) throw new AppError('Este documento não tem trechos para a IA preencher.', 422, 'NO_AI_SLOTS');
  if (slots.length > 25) throw new AppError('Trechos demais para uma única geração.', 422, 'VALIDATION');
  await aiCredits.assertHasCredits(accountId, user.id);

  const tpl = d.template_key ? await templates.get(d.template_key, accountId) : null;
  const area = areas.get(d.area_key);
  const { c } = await buildContext(accountId, user, d.case_id);
  const allowedIds = [...new Set([...(tpl?.legal_basis || []), ...area.refs.map(r => r.id)])];
  const refText = area.refs.filter(r => allowedIds.includes(r.id)).map(r => `- ${r.id}: ${r.note}`)
    .concat(allowedIds.filter(i => !area.refs.some(r => r.id === i)).map(i => `- ${i}`)).join('\n') || '(nenhuma referência fornecida — não cite dispositivos)';

  const dataBlock = c ? [
    `Processo: ${c.title || ''} | nº ${c.case_number || 'não informado'} | ${c.tribunal || ''} | comarca ${c.comarca || '—'} | vara ${c.vara || '—'} | área ${c.area_label}`,
    c.cause_value ? `Valor da causa: ${brl(c.cause_value)}` : '',
    c.parties.length ? 'Partes:\n' + c.parties.map(p => `- ${partiesService.ROLES[p.role] || p.role}: ${p.name}`).join('\n') : '',
    areas.describeDetails(c.area_key, c.details) ? 'Dados da área:\n' + areas.describeDetails(c.area_key, c.details) : '',
    c.updates?.length ? 'Andamentos recentes:\n' + c.updates.slice(0, 8).map(u => `- ${String(u.update_date || '').slice(0, 10)} ${u.text || ''}`.slice(0, 300)).join('\n') : '',
  ].filter(Boolean).join('\n') : '(documento sem processo vinculado: use apenas as instruções do usuário)';

  const prompt = `<modelo>${tpl?.title || d.title}</modelo>
<orientacao_da_area>${area.guidance || ''}</orientacao_da_area>
<dados>
${dataBlock}
</dados>
<referencias>
${refText}
</referencias>
${instructions ? `<instrucoes_do_usuario>${String(instructions).slice(0, 2000)}</instrucoes_do_usuario>\n` : ''}<trechos>
${slots.map((m, i) => `${i + 1}. ${m[1].trim()}`).join('\n')}
</trechos>`;

  const resp = await client.messages.create({
    model: aiService.MODEL, max_tokens: MAX_DRAFT_TOKENS,
    system: [{ type: 'text', text: DRAFT_SYSTEM }], messages: [{ role: 'user', content: prompt }],
  });
  const usage = { input: resp.usage?.input_tokens || 0, cacheCreation: resp.usage?.cache_creation_input_tokens || 0, cacheRead: resp.usage?.cache_read_input_tokens || 0, output: resp.usage?.output_tokens || 0 };
  const creditsUsed = await aiService.recordUsage(accountId, user.id, null, usage);

  const parsed = _extractJson(resp.content.filter(b => b.type === 'text').map(b => b.text).join('\n'));
  if (!parsed) throw new AppError('A IA não devolveu um texto utilizável. Tente de novo (os créditos desta tentativa foram consumidos).', 502, 'AI_BAD_OUTPUT');

  const flags = [];
  let i = 0;
  const content = d.content.replace(slotRe(), (whole) => {
    i += 1;
    const raw = parsed[String(i)];
    if (typeof raw !== 'string' || !raw.trim()) return whole; // slot não preenchido continua pendente
    const g = guard.guard(raw.trim(), allowedIds);
    flags.push(...g.flags);
    return g.text;
  });
  const left = (content.match(slotRe()) || []).length;

  await transaction(async (conn) => {
    await conn.query('UPDATE documents SET content = ?, ai_generated = 1, open_flags = ? WHERE id = ? AND account_id = ?', [content, guard.countOpen(content), id, accountId]);
    await _saveVersion(conn, { id, content }, accountId, user.id, 'Rascunho gerado pela IA');
  });
  const doc = await getById(id, accountId);
  return { document: doc, flagged_citations: [...new Set(flags)], unfilled_slots: left, credits_used: creditsUsed, credits: await aiCredits.getStatus(accountId, user.id) };
}

// ─── Exportação .docx ────────────────────────────────────────────────────────

function _runs(docx, text, base = {}) {
  const parts = []; const re = /(\*\*[^*]+\*\*|\[(?:PREENCHER|CONFERIR|IA)[^\]]*\])/g;
  let last = 0; let m;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(new docx.TextRun({ text: text.slice(last, m.index), ...base }));
    const tok = m[0];
    if (tok.startsWith('**')) parts.push(new docx.TextRun({ text: tok.slice(2, -2), bold: true, ...base }));
    else parts.push(new docx.TextRun({ text: tok, highlight: 'yellow', ...base }));
    last = m.index + tok.length;
  }
  if (last < text.length) parts.push(new docx.TextRun({ text: text.slice(last), ...base }));
  return parts;
}

async function exportDocx(id, accountId) {
  const docx = require('docx');
  const d = await _get(id, accountId);
  const FONT = 'Times New Roman';
  const out = [];
  for (const line of d.content.split(/\r?\n/)) {
    const t = line.trimEnd();
    if (!t.trim()) { out.push(new docx.Paragraph({ children: [] })); continue; }
    const h = t.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      out.push(new docx.Paragraph({ alignment: h[1].length === 1 ? docx.AlignmentType.CENTER : docx.AlignmentType.LEFT, spacing: { before: 240, after: 120 }, children: _runs(docx, h[2], { bold: true, font: FONT, size: 24 }) }));
      continue;
    }
    const li = t.match(/^\s*(?:[-*]|\d+[.)])\s+(.*)$/);
    out.push(new docx.Paragraph({
      alignment: li ? docx.AlignmentType.LEFT : docx.AlignmentType.JUSTIFIED, spacing: { after: 120, line: 360 },
      indent: li ? { left: 720, hanging: 360 } : { firstLine: 709 },
      children: _runs(docx, li ? `• ${li[1]}` : t, { font: FONT, size: 24 }),
    }));
  }
  const doc = new docx.Document({ creator: 'Foro', title: d.title, sections: [{ properties: { page: { margin: { top: 1700, bottom: 1134, left: 1700, right: 1134 } } }, children: out }] });
  return { buffer: await docx.Packer.toBuffer(doc), filename: `${d.title.replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_|_$/g, '').slice(0, 80) || 'documento'}.docx` };
}

/** Placeholders aceitos nos modelos. */
const PLACEHOLDERS = ['escritorio', 'cidade', 'advogado.nome', 'advogado.oab', 'data.hoje', 'data.extenso',
  'processo.numero', 'processo.titulo', 'processo.tribunal', 'processo.comarca', 'processo.vara', 'processo.magistrado', 'processo.area', 'processo.fase', 'processo.valor_causa',
  'cliente.nome', 'cliente.qualificacao', 'cliente.documento', 'parte_contraria.nome', 'parte_contraria.qualificacao'];

module.exports = { PLACEHOLDERS, buildContext, fill, list, getById, create, createBlank, update, remove, restoreVersion, getVersion, draftWithAI, exportDocx, STATUSES };

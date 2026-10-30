/**
 * office-templates.service.js — modelos de documento do ESCRITÓRIO (conta).
 *
 * - Visíveis a todos os usuários da conta; criados/editados por quem o admin liberou (templates_manage).
 * - "Importar": o usuário cola/envia uma peça pronta e a IA a transforma em modelo — troca dados do caso por
 *   {{campos}} e marca por [[IA: ...]] só os trechos que dependem do caso concreto. O texto restante é mantido;
 *   frases que a IA tenha alterado são sinalizadas para o usuário conferir antes de salvar.
 * - Os dispositivos legais que o próprio modelo já cita viram a lista permitida (legal_basis) para a IA naquele modelo.
 */
const Anthropic = require('@anthropic-ai/sdk');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../configs/db.config');
const { AppError } = require('../middlewares/error.middleware');
const areas = require('../configs/legal-areas');
const guard = require('./document-guard');
const templates = require('./document-templates.service');
const aiCredits = require('./ai-credits.service');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MAX_BODY = 60000;
const MAX_SOURCE = 20000;
const MAX_PER_ACCOUNT = 200;

function _placeholders() { return require('./documents.service').PLACEHOLDERS; }

/** Placeholders desconhecidos no corpo (viram [PREENCHER] no documento — avisamos o autor). */
function checkBody(body, areaKey) {
  const known = new Set([..._placeholders(), ...areas.get(areaKey).fields.map(f => `detalhes.${f.key}`)]);
  const unknown = [...new Set([...body.matchAll(/\{\{\s*([a-z0-9_.]+)\s*\}\}/gi)].map(m => m[1]).filter(k => !known.has(k)))];
  const slots = (body.match(new RegExp(guard.SLOT_SRC, 'g')) || []).length;
  return { unknown_placeholders: unknown, ai_slots: slots };
}

function _clean(data, areaKey) {
  const title = String(data.title || '').trim().slice(0, 200);
  if (!title) throw new AppError('Informe o título do modelo.', 422, 'VALIDATION');
  const body = String(data.body || '').replace(/\r\n/g, '\n').trim();
  if (!body) throw new AppError('O corpo do modelo não pode ficar vazio.', 422, 'VALIDATION');
  if (body.length > MAX_BODY) throw new AppError(`Modelo grande demais (máx. ${MAX_BODY} caracteres).`, 422, 'VALIDATION');
  return { title, body, description: data.description ? String(data.description).trim().slice(0, 500) : null, areaKey };
}
function _area(k) {
  const key = k || 'geral';
  if (!areas.AREA_KEYS.includes(key)) throw new AppError(`Área inválida. Use: ${areas.AREA_KEYS.join(', ')}.`, 422, 'VALIDATION');
  return key;
}

async function _row(id, accountId) {
  const [r] = await query('SELECT * FROM office_templates WHERE id = ? AND account_id = ? AND deleted_at IS NULL LIMIT 1', [id, accountId]);
  if (!r.length) throw new AppError('Modelo não encontrado.', 404);
  return r[0];
}
function _canEdit(row, user) {
  if (user.role === 'admin') return;
  if (row.created_by !== user.id) throw new AppError('Você só pode alterar os modelos que criou. Peça ao administrador.', 403, 'PERMISSION_DENIED');
}

async function list(accountId) {
  const [rows] = await query(
    `SELECT t.id, t.title, t.area_key, t.description, t.reviewed, t.version, t.legal_basis, t.created_by, t.updated_at, u.name AS created_by_name,
            CHAR_LENGTH(t.body) AS size
     FROM office_templates t LEFT JOIN users u ON u.id = t.created_by WHERE t.account_id = ? AND t.deleted_at IS NULL ORDER BY t.title`, [accountId]);
  return rows.map(r => ({ ...r, key: `o_${r.id}`, legal_basis: typeof r.legal_basis === 'string' ? JSON.parse(r.legal_basis || '[]') : (r.legal_basis || []) }));
}

async function get(id, accountId) {
  const r = await _row(id, accountId);
  return { ...templates.fromOffice(r), ...checkBody(r.body, r.area_key) };
}

async function create(accountId, user, data) {
  const areaKey = _area(data.area_key);
  const c = _clean(data, areaKey);
  const [[{ n }]] = await query('SELECT COUNT(*) AS n FROM office_templates WHERE account_id = ? AND deleted_at IS NULL', [accountId]);
  if (n >= MAX_PER_ACCOUNT) throw new AppError(`Limite de ${MAX_PER_ACCOUNT} modelos por escritório.`, 409, 'LIMIT');
  const id = uuidv4();
  const legal = Array.isArray(data.legal_basis) ? data.legal_basis.map(x => String(x).slice(0, 120)).slice(0, 60) : guard.citedRefIds(c.body);
  await query(
    'INSERT INTO office_templates (id, account_id, title, area_key, description, body, legal_basis, reviewed, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [id, accountId, c.title, areaKey, c.description, c.body, JSON.stringify(legal), user.role === 'admin' && data.reviewed === true ? 1 : 0, user.id]);
  return get(id, accountId);
}

async function update(id, accountId, user, data) {
  const row = await _row(id, accountId);
  _canEdit(row, user);
  const areaKey = _area(data.area_key ?? row.area_key);
  const c = _clean({ title: data.title ?? row.title, body: data.body ?? row.body, description: data.description === undefined ? row.description : data.description }, areaKey);
  const bodyChanged = c.body !== row.body.trim();
  let reviewed = row.reviewed;
  if (data.reviewed !== undefined) { if (user.role !== 'admin') throw new AppError('Só o administrador marca um modelo como revisado.', 403, 'PERMISSION_DENIED'); reviewed = data.reviewed ? 1 : 0; }
  else if (bodyChanged) reviewed = 0; // texto mudou: perde a marca de revisado
  const legal = Array.isArray(data.legal_basis) ? data.legal_basis.map(x => String(x).slice(0, 120)).slice(0, 60)
    : (bodyChanged && data.legal_basis === undefined ? [...new Set([...(typeof row.legal_basis === 'string' ? JSON.parse(row.legal_basis || '[]') : row.legal_basis || []), ...guard.citedRefIds(c.body)])] : null);
  await query(
    `UPDATE office_templates SET title = ?, area_key = ?, description = ?, body = ?, reviewed = ?, version = version + ?${legal ? ', legal_basis = ?' : ''} WHERE id = ? AND account_id = ?`,
    [c.title, areaKey, c.description, c.body, reviewed, bodyChanged ? 1 : 0, ...(legal ? [JSON.stringify(legal)] : []), id, accountId]);
  return get(id, accountId);
}

async function remove(id, accountId, user) {
  const row = await _row(id, accountId);
  _canEdit(row, user);
  await query('UPDATE office_templates SET deleted_at = NOW() WHERE id = ? AND account_id = ?', [id, accountId]);
}

// ─── Extração de texto de .docx ─────────────────────────────────────────────

async function extractDocx(base64) {
  const buf = Buffer.from(String(base64 || ''), 'base64');
  if (buf.length < 100 || buf.length > 3 * 1024 * 1024) throw new AppError('Arquivo inválido ou maior que 3 MB.', 422, 'VALIDATION');
  if (buf.slice(0, 2).toString() !== 'PK') throw new AppError('Envie um arquivo .docx (Word).', 422, 'VALIDATION');
  const mammoth = require('mammoth');
  let text;
  try { text = (await mammoth.extractRawText({ buffer: buf })).value; } catch { throw new AppError('Não foi possível ler o arquivo .docx.', 422, 'VALIDATION'); }
  text = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!text) throw new AppError('O arquivo não tem texto.', 422, 'VALIDATION');
  return { text: text.slice(0, MAX_SOURCE), truncated: text.length > MAX_SOURCE };
}

// ─── Conversão por IA: peça pronta -> modelo ────────────────────────────────

const CONVERT_SYSTEM = `Você transforma uma peça ou documento jurídico brasileiro já pronto em um MODELO reutilizável.
REGRAS INVIOLÁVEIS:
- Preserve o texto original PALAVRA POR PALAVRA em tudo que for padrão (fórmulas, fundamentos jurídicos, pedidos-padrão, cláusulas). NÃO reescreva, NÃO resuma, NÃO acrescente fundamentos, leis ou jurisprudência.
- Troque APENAS dados específicos do caso por estes campos: {{cliente.qualificacao}} (qualificação completa do cliente), {{cliente.nome}}, {{parte_contraria.qualificacao}}, {{parte_contraria.nome}}, {{processo.numero}}, {{processo.vara}}, {{processo.comarca}}, {{processo.tribunal}}, {{processo.magistrado}}, {{processo.valor_causa}}, {{advogado.nome}}, {{advogado.oab}}, {{cidade}}, {{data.extenso}}, {{escritorio}}.
- Parágrafos que narram fatos ou argumentos específicos do caso devem virar um único marcador [[IA: instrução curta e específica do que escrever ali, usando só os dados do caso]]. Use poucos marcadores, só onde o texto depende do caso.
- Não use nenhum outro campo {{...}}. Mantenha a formatação Markdown simples (# título, ## seções, listas).
- Responda APENAS com JSON: {"title":"...","description":"uma frase","area_key":"geral|civel|trabalhista|criminal|contratacoes_publicas|consultivo","body":"..."}.`;

const norm = (t) => String(t).toLowerCase().replace(/\s+/g, ' ').replace(/[“”"']/g, '').trim();

/** Frases do modelo (fora de campos/trechos) que não existem no original — a IA mexeu nelas. */
function modifiedFragments(body, original) {
  const o = norm(original);
  const stripped = body.replace(new RegExp(guard.SLOT_SRC, 'g'), '\n').replace(/\{\{[^}]+\}\}/g, '\n');
  return stripped.split(/\n|(?<=[.;:])\s+/).map(s => s.replace(/^[#>*\-\d.)\s]+/, '').trim()).filter(s => s.length >= 25 && !o.includes(norm(s))).slice(0, 12);
}

async function convertWithAI(accountId, user, { text, area_key }) {
  const aiService = require('./ai.service');
  const src = String(text || '').replace(/\r\n/g, '\n').trim();
  if (src.length < 80) throw new AppError('Cole o texto completo da peça (mínimo ~80 caracteres).', 422, 'VALIDATION');
  if (src.length > MAX_SOURCE) throw new AppError(`Texto grande demais (máx. ${MAX_SOURCE} caracteres). Divida a peça.`, 422, 'VALIDATION');
  await aiCredits.assertHasCredits(accountId);
  const resp = await client.messages.create({
    model: aiService.MODEL, max_tokens: 6000,
    system: [{ type: 'text', text: CONVERT_SYSTEM }],
    messages: [{ role: 'user', content: `<area_sugerida>${area_key || 'geral'}</area_sugerida>\n<peca>\n${src}\n</peca>` }],
  });
  const usage = { input: resp.usage?.input_tokens || 0, cacheCreation: resp.usage?.cache_creation_input_tokens || 0, cacheRead: resp.usage?.cache_read_input_tokens || 0, output: resp.usage?.output_tokens || 0 };
  const creditsUsed = await aiService.recordUsage(accountId, user.id, null, usage);
  const raw = resp.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
  const m = raw.match(/\{[\s\S]*\}/);
  let j = null; try { j = m && JSON.parse(m[0]); } catch { /* ignora */ }
  if (!j || typeof j.body !== 'string' || !j.body.trim()) throw new AppError('A IA não devolveu um modelo utilizável. Tente de novo (os créditos desta tentativa foram consumidos).', 502, 'AI_BAD_OUTPUT');
  const areaKey = areas.AREA_KEYS.includes(j.area_key) ? j.area_key : (areas.AREA_KEYS.includes(area_key) ? area_key : 'geral');
  const body = j.body.trim().slice(0, MAX_BODY);
  return {
    title: String(j.title || 'Modelo importado').slice(0, 200), description: j.description ? String(j.description).slice(0, 500) : null,
    area_key: areaKey, body,
    legal_basis: guard.citedRefIds(src),                    // o que a peça original já cita
    modified_fragments: modifiedFragments(body, src),       // frases que a IA alterou em relação ao original
    ...checkBody(body, areaKey),
    credits_used: creditsUsed, credits: await aiCredits.getStatus(accountId),
  };
}

module.exports = { list, get, create, update, remove, extractDocx, convertWithAI, checkBody, modifiedFragments };

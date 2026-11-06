/**
 * lookup.service.js — consultas de CPF, CNPJ e processos por documento (Direct Data) com cache por conta
 * e "Criar lead" a partir do resultado.
 *
 * Regras:
 *  - CPF/CNPJ consomem a COTA SEMANAL do usuário (lookup-quota.service.js); passou da cota → 429.
 *    Processos (desligado por ora) seguem na carteira de créditos (external-lookup.service.js).
 *  - Validar o dígito verificador acontece ANTES de consumir qualquer coisa.
 *  - Resposta em cache (LOOKUP_CACHE_DAYS, padrão 30) não conta de novo; `refresh: true` força nova consulta.
 *  - CPF/CNPJ sem resultado na fonte (404) e erro técnico não contam (DIRECT_DATA_CHARGE_NOT_FOUND=true faz o 404 contar).
 *  - LGPD: dados de pessoas físicas só devem ser consultados com finalidade legítima; cada consulta fica em
 *    service_usage_log (documento mascarado) e o cache expira sozinho.
 */
const { query } = require('../configs/db.config');
const { AppError } = require('../middlewares/error.middleware');
const { isValidCpf, isValidCnpj } = require('../utils/documentValidator');
const N = require('../utils/lead-normalize');
const externalLookup = require('./external-lookup.service');
const credits = require('./credits.service');
const quota = require('./lookup-quota.service');
const { v4: uuidv4 } = require('uuid');
const client = require('./direct-data.client');
const norm = require('./direct-data.normalize');
const leadsService = require('./leads.service');
const importService = require('./lead-import.service');

const KINDS = {
  cpf: { service: 'cpf_lookup', label: 'CPF', endpoint: () => 'cpf', normalize: norm.cpf, valid: (d) => d.length === 11 && isValidCpf(d) },
  cnpj: { service: 'cnpj_lookup', label: 'CNPJ', endpoint: () => 'cnpj', normalize: norm.cnpj, valid: (d) => d.length === 14 && isValidCnpj(d) },
  processos: {
    service: 'process_lookup', label: 'CPF/CNPJ', endpoint: (d) => (d.length === 11 ? 'processos_cpf' : 'processos_cnpj'), normalize: norm.processos,
    valid: (d) => (d.length === 11 && isValidCpf(d)) || (d.length === 14 && isValidCnpj(d)),
  },
};
const cacheDays = () => Number(process.env.LOOKUP_CACHE_DAYS) || 30;
const chargeNotFound = () => process.env.DIRECT_DATA_CHARGE_NOT_FOUND === 'true';
const mask = (d) => (d.length === 11 ? `${d.slice(0, 3)}.***.**${d.slice(-3, -1)}-${d.slice(-1)}` : `${d.slice(0, 2)}.***.***/****-${d.slice(-2)}`);

function parseDocument(kind, input) {
  const k = KINDS[kind];
  if (!k) throw new AppError('Tipo de consulta inválido.', 400);
  const d = N.digits(input);
  if (!k.valid(d)) throw new AppError(kind === 'processos' ? 'Informe um CPF ou CNPJ válido.' : `${k.label} inválido.`, 400, 'INVALID_DOCUMENT');
  return d;
}

// ─── Cache ───────────────────────────────────────────────────────────────────
async function cacheGet(accountId, kind, doc) {
  const [rows] = await query(
    'SELECT payload, consulta_uid, fetched_at FROM lookup_cache WHERE account_id = ? AND kind = ? AND document = ? AND fetched_at > (NOW(3) - INTERVAL ? DAY) LIMIT 1',
    [accountId, kind, doc, cacheDays()]);
  if (!rows.length) return null;
  let data; try { data = JSON.parse(rows[0].payload); } catch { return null; }
  return { data, uid: rows[0].consulta_uid, fetched_at: rows[0].fetched_at };
}
async function cachePut(accountId, kind, doc, data, uid) {
  try {
    await query(
      `INSERT INTO lookup_cache (id, account_id, kind, document, payload, consulta_uid, fetched_at) VALUES (UUID(), ?, ?, ?, ?, ?, NOW(3))
       ON DUPLICATE KEY UPDATE payload = VALUES(payload), consulta_uid = VALUES(consulta_uid), fetched_at = NOW(3)`,
      [accountId, kind, doc, JSON.stringify(data), uid || null]);
  } catch (e) { console.error('[lookup] falha ao gravar cache:', e.message); }
}
async function purgeExpired() {
  const [r] = await query('DELETE FROM lookup_cache WHERE fetched_at < (NOW(3) - INTERVAL ? DAY)', [cacheDays()]);
  return r.affectedRows;
}

// ─── Consulta ────────────────────────────────────────────────────────────────
async function priceOf(kind) { return (await credits.getServicePrice(KINDS[kind].service)).price_cents; }

async function logUsage(accountId, userId, kind, status, doc, errorMessage) {
  try {
    await query(
      `INSERT INTO service_usage_log (id, account_id, user_id, service_key, status, credit_transaction_id, request_summary, error_message)
       VALUES (?, ?, ?, ?, ?, NULL, ?, ?)`,
      [uuidv4(), accountId, userId || null, KINDS[kind].service, status, JSON.stringify({ kind, documento: mask(doc), cota: true }), errorMessage || null]);
  } catch (e) { console.error('[lookup] falha ao registrar uso:', e.message); }
}

/** CPF/CNPJ: consome 1 da cota semanal do usuário. */
async function quotaLookup(accountId, userId, kind, doc, source) {
  const k = KINDS[kind];
  const usageId = await quota.reserve(accountId, userId, kind, source);
  let r;
  try {
    r = await client.call(k.endpoint(doc), doc);
  } catch (err) {
    await quota.release(usageId);
    await logUsage(accountId, userId, kind, 'failed', doc, err.message);
    console.error(`[lookup] falha em ${kind} (conta ${accountId}):`, err.message);
    throw new AppError('Erro na requisição. Tente novamente em alguns minutos ou contate o suporte.', 502);
  }
  if (r.status === 'not_found') {
    if (!chargeNotFound()) await quota.release(usageId);
    await logUsage(accountId, userId, kind, 'not_found', doc);
    return { status: 'not_found', counted: chargeNotFound() };
  }
  const data = k.normalize(r.retorno);
  await cachePut(accountId, kind, doc, data, r.uid);
  await logUsage(accountId, userId, kind, 'success', doc);
  return { status: 'success', data, uid: r.uid, counted: true };
}

/**
 * @param {'consulta'|'lista'} source  de onde veio (tela de consulta ou enriquecimento de lista)
 * @returns {{ data, cached, fetched_at, counted, consulta_uid, quota? , price_cents?, charged_cents?, balance_cents? }}
 */
async function lookup(accountId, userId, kind, input, { refresh = false, source = 'consulta', withQuota = true } = {}) {
  const doc = parseDocument(kind, input);
  const k = KINDS[kind];
  const usesQuota = kind === 'cpf' || kind === 'cnpj';
  const q = async () => (usesQuota && withQuota ? { quota: await quota.status(accountId, userId) } : {});

  if (!refresh) {
    const hit = await cacheGet(accountId, kind, doc);
    if (hit) return { data: hit.data, cached: true, counted: false, fetched_at: hit.fetched_at, consulta_uid: hit.uid, ...(await q()) };
  }
  if (!client.configured()) throw new AppError('As consultas ainda não foram configuradas na plataforma. Fale com o suporte.', 503, 'DIRECT_DATA_NOT_CONFIGURED');

  if (usesQuota) {
    const out = await quotaLookup(accountId, userId, kind, doc, source);
    if (out.status === 'not_found') {
      throw new AppError(`Nenhum dado encontrado para este ${k.label}.${out.counted ? '' : ' Esta consulta não contou na sua cota.'}`, 404, 'LOOKUP_NOT_FOUND', withQuota ? await q() : undefined);
    }
    return { data: out.data, cached: false, counted: true, fetched_at: new Date().toISOString(), consulta_uid: out.uid || null, ...(await q()) };
  }

  // Processos (desligado nas rotas por enquanto): carteira de créditos.
  const price = await priceOf(kind);
  const out = await externalLookup.runPaidLookup({
    accountId, userId, serviceKey: k.service, detailed: true, refundOnNotFound: !chargeNotFound(),
    requestSummary: { kind, documento: mask(doc) },
    fn: async () => {
      const r = await client.call(k.endpoint(doc), doc);
      if (r.status === 'not_found') return { status: 'not_found', data: null };
      const data = k.normalize(r.retorno);
      await cachePut(accountId, kind, doc, data, r.uid);
      return { status: 'success', data: { ...data, _uid: r.uid } };
    },
  });
  if (out.status === 'not_found') throw new AppError(`Nenhum dado encontrado para este ${k.label}. Nenhum valor foi cobrado.`, 404, 'LOOKUP_NOT_FOUND', { balance_cents: out.balance_cents });
  const { _uid, ...data } = out.data;
  return { data, cached: false, counted: true, fetched_at: new Date().toISOString(), price_cents: price, charged_cents: out.cost_cents, balance_cents: out.balance_cents, consulta_uid: _uid || null };
}

/** Estado das consultas para a tela: cota semanal do usuário e se o provedor está configurado. */
async function status(accountId, userId) {
  return { configured: client.configured(), quota: await quota.status(accountId, userId), cache_days: cacheDays() };
}

// ─── Criar lead a partir de uma consulta ─────────────────────────────────────
const fmtAddress = (a) => [a.logradouro, a.numero, a.complemento, a.bairro].filter(Boolean).join(', ');
/** Telefone preferido: WhatsApp > celular > primeiro. */
function pickPhones(phones) {
  const score = (p) => (p.whatsapp ? 0 : /m[oó]vel|celular/i.test(p.tipo || '') ? 1 : 2);
  return [...phones].sort((a, b) => score(a) - score(b)).map(p => p.numero);
}
const brDate = (iso) => (iso ? iso.split('-').reverse().join('/') : null);

function leadFromLookup(kind, data) {
  const phones = pickPhones(data.telefones || []);
  const emails = data.emails || [];
  const addr = (data.enderecos || [])[0];
  const isCnpj = kind === 'cnpj';
  const name = N.properName(isCnpj ? (data.nome_fantasia || data.razao_social) : data.nome) || null;
  const fields = {};
  if (isCnpj && data.razao_social && N.properName(data.razao_social) !== name) fields.empresa = N.properName(data.razao_social);
  if (addr?.cidade) fields.cidade = N.properName(addr.cidade);
  if (addr?.uf) fields.uf = addr.uf;
  if (addr?.cep) fields.cep = addr.cep;
  if (addr && fmtAddress(addr)) fields.endereco = fmtAddress(addr).slice(0, 500);
  if (phones[1]) fields.telefone_2 = phones[1];
  if (emails[1]) fields.email_2 = emails[1];

  const note = [`Lead criado a partir da consulta de ${isCnpj ? 'CNPJ' : 'CPF'}.`];
  if (phones.length > 2) note.push(`Outros telefones: ${phones.slice(2).join(', ')}`);
  if (emails.length > 2) note.push(`Outros e-mails: ${emails.slice(2).join(', ')}`);
  if (isCnpj) {
    if (data.razao_social) note.push(`Razão social: ${data.razao_social}`);
    if (data.situacao_cadastral) note.push(`Situação: ${data.situacao_cadastral}${data.porte ? ` · ${data.porte}` : ''}`);
    if (data.cnae?.descricao) note.push(`Atividade: ${data.cnae.descricao} (CNAE ${data.cnae.codigo})`);
    if (data.data_fundacao) note.push(`Fundação: ${brDate(data.data_fundacao)}`);
    if (data.socios?.length) note.push(`Sócios: ${data.socios.slice(0, 8).map(s => `${s.nome}${s.cargo ? ` (${s.cargo})` : ''}`).join('; ')}`);
  }
  return { name, phone: phones[0] || null, email: emails[0] || null, document: data[kind], custom_fields: fields, note: note.join('\n') };
}

const FIELD_OF = { empresa: 'company', cidade: 'city', uf: 'state', cep: 'cep', endereco: 'address', telefone_2: 'phone2', email_2: 'email2' };

async function createLead(accountId, user, kind, input, { stage } = {}) {
  if (kind !== 'cpf' && kind !== 'cnpj') throw new AppError('Só é possível criar lead a partir de CPF ou CNPJ.', 400);
  const doc = parseDocument(kind, input);
  const hit = await cacheGet(accountId, kind, doc);
  if (!hit) throw new AppError('Consulte o documento primeiro; os dados da consulta expiraram ou ainda não existem.', 404, 'LOOKUP_NOT_CACHED');

  const [dup] = await query('SELECT id, name FROM leads WHERE account_id = ? AND document = ? AND deleted_at IS NULL LIMIT 1', [accountId, doc]);
  if (dup.length) throw new AppError('Já existe um lead com este documento.', 409, 'LEAD_EXISTS', { lead_id: dup[0].id, lead_name: dup[0].name });

  const f = leadFromLookup(kind, hit.data);
  if (!f.name && !f.phone && !f.email) throw new AppError('A consulta não trouxe nome, telefone nem e-mail para criar o lead.', 422, 'LOOKUP_EMPTY');
  const defs = Object.keys(f.custom_fields).map(n => importService.FIXED_FIELDS[FIELD_OF[n]]).filter(Boolean);
  if (defs.length) await importService.ensureCustomFields(accountId, defs);

  const lead = await leadsService.create(accountId, user.id, {
    name: f.name, phone: f.phone, email: f.email, document: f.document, stage, source: 'consulta', custom_fields: f.custom_fields,
  }, 'ui');
  await query('INSERT INTO lead_notes (id, account_id, lead_id, user_id, text, channel) VALUES (UUID(), ?, ?, ?, ?, ?)', [accountId, lead.id, user.id, f.note.slice(0, 5000), 'ui']);
  return lead;
}

module.exports = { lookup, status, createLead, cacheGet, cachePut, purgeExpired, parseDocument, priceOf, pickPhones, mask, KINDS };

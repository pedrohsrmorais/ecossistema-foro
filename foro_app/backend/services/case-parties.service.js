/**
 * case-parties.service.js — partes envolvidas no processo e seus responsáveis (no escritório).
 * Também monta a "qualificação" da parte (texto de peça) de forma determinística, sem IA.
 */
const { v4: uuidv4 } = require('uuid');
const { query } = require('../configs/db.config');
const { AppError } = require('../middlewares/error.middleware');
const { isValidCpf, isValidCnpj } = require('../utils/documentValidator');

const ROLES = {
  cliente: 'Cliente', autor: 'Autor / requerente', reu: 'Réu / requerido', litisconsorte: 'Litisconsorte',
  terceiro_interessado: 'Terceiro interessado', empregador: 'Empregador (reclamada)', empregado: 'Empregado (reclamante)',
  investigado: 'Investigado / acusado', vitima: 'Vítima', assistente_acusacao: 'Assistente de acusação',
  testemunha: 'Testemunha', perito: 'Perito', advogado_adverso: 'Advogado da parte contrária',
  orgao_publico: 'Órgão público', fornecedor: 'Fornecedor / licitante', outro: 'Outro',
};

const onlyDigits = (v) => String(v || '').replace(/\D/g, '');

function fmtDoc(d) {
  const x = onlyDigits(d);
  if (x.length === 11) return x.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  if (x.length === 14) return x.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  return d || '';
}

async function _assertUser(userId, accountId) {
  if (!userId) return;
  const [r] = await query('SELECT id FROM users WHERE id = ? AND account_id = ? AND active = 1 LIMIT 1', [userId, accountId]);
  if (!r.length) throw new AppError('Usuário responsável não encontrado ou inativo.', 404);
}

async function _assertCase(caseId, accountId) {
  const [r] = await query('SELECT id FROM cases WHERE id = ? AND account_id = ? AND deleted_at IS NULL LIMIT 1', [caseId, accountId]);
  if (!r.length) throw new AppError('Processo não encontrado.', 404);
}

function _clean(data, { partial = false } = {}) {
  const out = {};
  const str = (k, max) => { if (data[k] !== undefined) out[k] = data[k] === null || data[k] === '' ? null : String(data[k]).trim().slice(0, max); };
  if (data.name !== undefined || !partial) {
    const n = String(data.name || '').trim();
    if (!n) throw new AppError('Informe o nome da parte.', 422, 'VALIDATION');
    out.name = n.slice(0, 255);
  }
  if (data.role !== undefined) {
    if (!ROLES[data.role]) throw new AppError(`Papel inválido. Use: ${Object.keys(ROLES).join(', ')}.`, 422, 'VALIDATION');
    out.role = data.role;
  }
  if (data.document !== undefined) {
    const d = onlyDigits(data.document);
    if (d && !(d.length === 11 ? isValidCpf(d) : d.length === 14 ? isValidCnpj(d) : false)) throw new AppError('CPF/CNPJ inválido.', 422, 'VALIDATION');
    out.document = d || null;
  }
  str('email', 255); str('phone', 30); str('address', 500); str('nationality', 60); str('marital_status', 40); str('profession', 100); str('notes', 5000);
  return out;
}

async function list(caseId, accountId) {
  const [rows] = await query(
    `SELECT p.*, u.name AS responsible_name FROM case_parties p LEFT JOIN users u ON u.id = p.responsible_user_id
     WHERE p.case_id = ? AND p.account_id = ? ORDER BY p.created_at`, [caseId, accountId]);
  return rows.map(p => ({ ...p, role_label: ROLES[p.role] || p.role, document_formatted: fmtDoc(p.document) }));
}

async function add(caseId, accountId, data) {
  await _assertCase(caseId, accountId);
  const c = _clean(data);
  c.role = c.role || 'outro';
  if (data.lead_id) {
    const [l] = await query('SELECT id, name, phone, email FROM leads WHERE id = ? AND account_id = ? AND deleted_at IS NULL LIMIT 1', [data.lead_id, accountId]);
    if (!l.length) throw new AppError('Contato não encontrado.', 404);
    c.lead_id = l[0].id;
    c.phone = c.phone ?? l[0].phone; c.email = c.email ?? l[0].email;
  }
  await _assertUser(data.responsible_user_id, accountId);
  const id = uuidv4();
  const cols = ['id', 'account_id', 'case_id', 'responsible_user_id', ...Object.keys(c)];
  const vals = [id, accountId, caseId, data.responsible_user_id || null, ...Object.values(c)];
  await query(`INSERT INTO case_parties (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`, vals);
  return (await list(caseId, accountId)).find(p => p.id === id);
}

async function update(caseId, partyId, accountId, data) {
  const [ex] = await query('SELECT id FROM case_parties WHERE id = ? AND case_id = ? AND account_id = ? LIMIT 1', [partyId, caseId, accountId]);
  if (!ex.length) throw new AppError('Parte não encontrada.', 404);
  const c = _clean(data, { partial: true });
  if (data.responsible_user_id !== undefined) { await _assertUser(data.responsible_user_id, accountId); c.responsible_user_id = data.responsible_user_id || null; }
  const keys = Object.keys(c);
  if (!keys.length) throw new AppError('Nenhum campo para atualizar.', 400);
  await query(`UPDATE case_parties SET ${keys.map(k => `${k} = ?`).join(', ')} WHERE id = ? AND account_id = ?`, [...Object.values(c), partyId, accountId]);
  return (await list(caseId, accountId)).find(p => p.id === partyId);
}

async function remove(caseId, partyId, accountId) {
  const [r] = await query('DELETE FROM case_parties WHERE id = ? AND case_id = ? AND account_id = ?', [partyId, caseId, accountId]);
  if (!r.affectedRows) throw new AppError('Parte não encontrada.', 404);
}

const miss = (what) => `[PREENCHER: ${what}]`;

/**
 * Qualificação da parte para peças. Dado ausente vira [PREENCHER: ...] (nunca é inventado).
 *   PF: NOME, nacionalidade, estado civil, profissão, inscrito(a) no CPF sob o nº X, residente e domiciliado(a) em Y, e-mail Z.
 *   PJ (CNPJ): NOME, pessoa jurídica, inscrita no CNPJ sob o nº X, com sede em Y, e-mail Z.
 */
function qualify(p) {
  if (!p) return miss('parte');
  const d = onlyDigits(p.document);
  const name = `**${String(p.name).toUpperCase()}**`;
  const email = p.email ? `, endereço eletrônico ${p.email}` : `, endereço eletrônico ${miss('e-mail')}`;
  if (d.length === 14) {
    return `${name}, pessoa jurídica, inscrita no CNPJ sob o nº ${fmtDoc(d)}, com sede em ${p.address || miss('endereço da sede')}${email}`;
  }
  return `${name}, ${p.nationality || miss('nacionalidade')}, ${p.marital_status || miss('estado civil')}, ${p.profession || miss('profissão')}, `
    + `inscrito(a) no CPF sob o nº ${d.length === 11 ? fmtDoc(d) : miss('CPF')}, residente e domiciliado(a) em ${p.address || miss('endereço')}${email}`;
}

module.exports = { ROLES, list, add, update, remove, qualify, fmtDoc };

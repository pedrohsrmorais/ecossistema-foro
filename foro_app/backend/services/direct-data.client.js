/**
 * direct-data.client.js — cliente HTTP da Direct Data (https://apiv3.directd.com.br).
 *
 * Autenticação: `Authorization: Bearer ${DIRECT_DATA_TOKEN}` (painel → Configurações → Integrações).
 * NUNCA faz retry automático: cada chamada com retorno é cobrada. Timeout longo (60 s) porque a consulta de
 * CNPJ chegou a levar ~24 s. Quem chama (external-lookup.service) já debitou o crédito do cliente e estorna
 * se esta função lançar erro.
 *
 * Retorno: { status: 'success' | 'not_found', uid, retorno }.  Erros técnicos (rede, 5xx, 401…) são lançados.
 */
const axios = require('axios');
const { AppError } = require('../middlewares/error.middleware');

const baseUrl = () => String(process.env.DIRECT_DATA_BASE_URL || 'https://apiv3.directd.com.br').replace(/\/+$/, '');
const token = () => String(process.env.DIRECT_DATA_TOKEN || '').trim();
const timeout = () => Number(process.env.DIRECT_DATA_TIMEOUT_MS) || 60000;
const configured = () => token().length > 0;

const ENDPOINTS = {
  cpf: { path: '/api/CadastroPessoaFisica', param: 'CPF' },
  cnpj: { path: '/api/CadastroPessoaJuridica', param: 'CNPJ' },
  processos_cpf: { path: '/api/ProcessosJudiciaisSimplificada', param: 'Cpf' },
  processos_cnpj: { path: '/api/ProcessosJudiciaisSimplificada', param: 'Cnpj' },
};
const NOT_FOUND_RE = /n[aã]o\s+encontrad|sem\s+resultado|nenhum\s+(resultado|registro)/i;

async function call(kind, documentDigits) {
  if (!configured()) throw new AppError('As consultas ainda não foram configuradas na plataforma (DIRECT_DATA_TOKEN).', 503, 'DIRECT_DATA_NOT_CONFIGURED');
  const ep = ENDPOINTS[kind];
  if (!ep) throw new Error(`Consulta desconhecida: ${kind}`);
  let res;
  try {
    res = await axios.get(baseUrl() + ep.path, {
      params: { [ep.param]: documentDigits },
      headers: { Authorization: `Bearer ${token()}`, Accept: 'application/json' },
      timeout: timeout(),
      validateStatus: () => true,
    });
  } catch (e) {
    throw new Error(`Direct Data inacessível: ${e.code || e.message}`);
  }
  const meta = res.data?.metaDados || {};
  if (res.status === 404) return { status: 'not_found', uid: meta.consultaUid || null, retorno: null };
  if (res.status === 401) throw new Error('Direct Data recusou o token (401): confira DIRECT_DATA_TOKEN e a liberação de IP.');
  if (res.status < 200 || res.status >= 300) throw new Error(`Direct Data respondeu ${res.status}${meta.mensagem ? `: ${meta.mensagem}` : ''}`);
  const retorno = res.data?.retorno ?? null;
  const ok = meta.resultadoId === 1 || /^sucesso$/i.test(String(meta.resultado || ''));
  if (!ok) {
    if (NOT_FOUND_RE.test(`${meta.resultado || ''} ${meta.mensagem || ''}`) || retorno === null) return { status: 'not_found', uid: meta.consultaUid || null, retorno: null };
    throw new Error(`Direct Data: ${meta.resultado || 'resultado inesperado'}${meta.mensagem ? ` — ${meta.mensagem}` : ''}`);
  }
  if (retorno === null || typeof retorno !== 'object') throw new Error('Direct Data devolveu uma resposta sem dados.');
  return { status: 'success', uid: meta.consultaUid || null, retorno };
}

module.exports = { call, configured, ENDPOINTS };

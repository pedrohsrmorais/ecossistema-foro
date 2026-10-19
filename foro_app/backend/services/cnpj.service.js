/**
 * cnpj.service.js
 *
 * Consulta de dados cadastrais de CNPJ. Provedor configurável via env —
 * nenhum foi contratado ainda, então por padrão funciona em MODO MOCK
 * (retorna um dado de exemplo, sem custo e sem chamar nada externo), o que
 * permite testar todo o fluxo de créditos antes de assinar um provedor real.
 *
 * Para ativar um provedor de verdade, preencha no .env:
 *   CNPJ_PROVIDER_BASE_URL   (ex: a URL base da API escolhida)
 *   CNPJ_PROVIDER_API_KEY    (se o provedor exigir autenticação)
 *
 * Avisos de quem já pesquisou isso (ver documentation/plataforma-e-precificacao.md):
 *   - APIs públicas gratuitas de CNPJ costumam ter rate limit baixo por IP
 *     (ex: 3 req/min em alguns provedores testados) — não sirva de única
 *     fonte sem medir o limite real sob carga primeiro.
 *   - O formato de resposta (`data` abaixo) é devolvido como veio do
 *     provedor — campos variam conforme qual você configurar.
 */
const axios = require('axios');
const { AppError } = require('../middlewares/error.middleware');
const { isValidCnpj } = require('../utils/documentValidator');
const externalLookup = require('./external-lookup.service');

const BASE_URL = process.env.CNPJ_PROVIDER_BASE_URL || null;
const API_KEY = process.env.CNPJ_PROVIDER_API_KEY || null;

async function lookupCnpj(accountId, userId, cnpjInput) {
  const cnpj = String(cnpjInput).replace(/\D/g, '');

  // Validação de dígito verificador é gratuita — não gasta crédito.
  if (!isValidCnpj(cnpj)) {
    throw new AppError('CNPJ inválido.', 400);
  }

  return externalLookup.runPaidLookup({
    accountId, userId, serviceKey: 'cnpj_lookup',
    requestSummary: { cnpj },
    fn: () => _callProvider(cnpj),
  });
}

async function _callProvider(cnpj) {
  if (!BASE_URL) {
    console.warn('[cnpj.service] CNPJ_PROVIDER_BASE_URL não configurada — retornando dado MOCK.');
    return { status: 'success', data: _mock(cnpj) };
  }

  try {
    const headers = API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {};
    const { data } = await axios.get(`${BASE_URL}/${cnpj}`, { headers, timeout: 15000 });
    return { status: 'success', data };
  } catch (err) {
    if (err.response?.status === 404) return { status: 'not_found', data: null };
    throw err; // erro real de infraestrutura/provedor -> dispara reembolso automático
  }
}

function _mock(cnpj) {
  return {
    _mock: true,
    cnpj,
    razao_social: '(exemplo) Empresa Demonstração LTDA',
    nome_fantasia: '(exemplo) Demo Advocacia',
    situacao_cadastral: 'ATIVA',
    data_abertura: '2015-03-10',
    aviso: 'Nenhum provedor de CNPJ configurado — configure CNPJ_PROVIDER_BASE_URL no .env.',
  };
}

module.exports = { lookupCnpj };

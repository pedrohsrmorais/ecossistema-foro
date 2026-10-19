/**
 * cpf.service.js
 *
 * Consulta de situação cadastral de CPF. Provedor configurável via env —
 * nenhum foi contratado ainda, então por padrão funciona em MODO MOCK.
 *
 * Para ativar um provedor de verdade (ex: Dabra Data, CPF.CNPJ — avaliados
 * em documentation/plataforma-e-precificacao.md), preencha no .env:
 *   CPF_PROVIDER_BASE_URL
 *   CPF_PROVIDER_API_KEY
 *
 * IMPORTANTE (LGPD): validar o dígito verificador do CPF é gratuito e não
 * consulta nenhum dado pessoal — só confirma que o número é matematicamente
 * possível. A consulta de titularidade/situação cadastral de verdade exige
 * finalidade legítima e base legal adequada. Use esse recurso só para os
 * fins already descritos no seu termo de uso (onboarding de cliente,
 * compliance), não para qualquer finalidade.
 */
const axios = require('axios');
const { AppError } = require('../middlewares/error.middleware');
const { isValidCpf } = require('../utils/documentValidator');
const externalLookup = require('./external-lookup.service');

const BASE_URL = process.env.CPF_PROVIDER_BASE_URL || null;
const API_KEY = process.env.CPF_PROVIDER_API_KEY || null;

async function lookupCpf(accountId, userId, cpfInput) {
  const cpf = String(cpfInput).replace(/\D/g, '');

  if (!isValidCpf(cpf)) {
    throw new AppError('CPF inválido.', 400);
  }

  return externalLookup.runPaidLookup({
    accountId, userId, serviceKey: 'cpf_lookup',
    requestSummary: { cpf: _maskCpf(cpf) }, // nunca loga o CPF completo
    fn: () => _callProvider(cpf),
  });
}

async function _callProvider(cpf) {
  if (!BASE_URL) {
    console.warn('[cpf.service] CPF_PROVIDER_BASE_URL não configurada — retornando dado MOCK.');
    return { status: 'success', data: _mock(cpf) };
  }

  try {
    const headers = API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {};
    const { data } = await axios.get(`${BASE_URL}/${cpf}`, { headers, timeout: 15000 });
    return { status: 'success', data };
  } catch (err) {
    if (err.response?.status === 404) return { status: 'not_found', data: null };
    throw err;
  }
}

function _maskCpf(cpf) {
  return `${cpf.slice(0, 3)}.***.**${cpf.slice(-3, -1)}-${cpf.slice(-1)}`;
}

function _mock(cpf) {
  return {
    _mock: true,
    cpf,
    nome: '(exemplo) Nome Demonstração',
    situacao_cadastral: 'REGULAR',
    aviso: 'Nenhum provedor de CPF configurado — configure CPF_PROVIDER_BASE_URL no .env.',
  };
}

module.exports = { lookupCpf };

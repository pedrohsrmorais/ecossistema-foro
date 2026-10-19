/**
 * processo.service.js
 *
 * Consulta processual (busca por CPF/CNPJ) e resumo de processo por IA.
 *
 * Consulta: provedor configurável via env — nenhum foi contratado ainda,
 * então por padrão funciona em MODO MOCK. Para ativar um provedor real
 * (ex: TrackJud/Vigilant — avaliado em documentation/plataforma-e-precificacao.md):
 *   PROCESS_PROVIDER_BASE_URL
 *   PROCESS_PROVIDER_API_KEY
 *
 * Resumo por IA: usa o mesmo cliente Anthropic do chat interno (ai.service.js),
 * mas é uma chamada avulsa (sem tools, sem histórico) — cobrada via créditos
 * como um serviço de preço fixo, não por token como o chat. Por isso não
 * grava em ai_usage (que é só para o chat); o custo/consumo deste serviço
 * fica registrado em credit_transactions + service_usage_log.
 */
const Anthropic = require('@anthropic-ai/sdk');
const axios = require('axios');
const { AppError } = require('../middlewares/error.middleware');
const { isValidCpf, isValidCnpj } = require('../utils/documentValidator');
const externalLookup = require('./external-lookup.service');

const BASE_URL = process.env.PROCESS_PROVIDER_BASE_URL || null;
const API_KEY = process.env.PROCESS_PROVIDER_API_KEY || null;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const SUMMARY_MODEL = process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022';

// ─── Busca de processos por CPF/CNPJ ──────────────────────────────────────────

async function searchProcessos(accountId, userId, documentoInput) {
  const documento = String(documentoInput).replace(/\D/g, '');
  const isCpf = documento.length === 11;
  const isCnpj = documento.length === 14;

  if (!isCpf && !isCnpj) throw new AppError('Informe um CPF ou CNPJ.', 400);
  if (isCpf && !isValidCpf(documento)) throw new AppError('CPF inválido.', 400);
  if (isCnpj && !isValidCnpj(documento)) throw new AppError('CNPJ inválido.', 400);

  return externalLookup.runPaidLookup({
    accountId, userId, serviceKey: 'process_lookup',
    requestSummary: { documento, tipo: isCpf ? 'cpf' : 'cnpj' },
    fn: () => _callProvider(documento),
  });
}

async function _callProvider(documento) {
  if (!BASE_URL) {
    console.warn('[processo.service] PROCESS_PROVIDER_BASE_URL não configurada — retornando dado MOCK.');
    return { status: 'success', data: _mock(documento) };
  }

  try {
    const headers = API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {};
    const { data } = await axios.get(BASE_URL, { headers, params: { documento }, timeout: 20000 });
    const hasResults = Array.isArray(data?.processos) ? data.processos.length > 0 : Boolean(data);
    return { status: hasResults ? 'success' : 'not_found', data };
  } catch (err) {
    if (err.response?.status === 404) return { status: 'not_found', data: null };
    throw err; // erro real -> dispara reembolso automático do crédito
  }
}

function _mock(documento) {
  return {
    _mock: true,
    documento,
    processos: [
      {
        numero_cnj: '0000000-00.0000.0.00.0000',
        tribunal: '(exemplo) TJRS',
        classe: 'Procedimento Comum Cível',
        ultima_movimentacao: 'Audiência designada',
        data_ultima_movimentacao: '2026-09-15',
      },
    ],
    aviso: 'Nenhum provedor de consulta processual configurado — configure PROCESS_PROVIDER_BASE_URL no .env.',
  };
}

// ─── Resumo de processo por IA ────────────────────────────────────────────────

async function summarizeProcess(accountId, userId, processoData) {
  return externalLookup.runPaidLookup({
    accountId, userId, serviceKey: 'process_summary_ai',
    requestSummary: { numero_cnj: processoData?.numero_cnj || processoData?.numeroProcesso || null },
    fn: () => _callSummaryAi(processoData),
  });
}

async function _callSummaryAi(processoData) {
  const prompt = `Você é um assistente jurídico. Resuma o processo abaixo em linguagem simples, para um advogado que precisa entender rapidamente a situação atual — sem juridiquês excessivo.

Estruture a resposta em três pontos curtos: (1) o que é o processo, (2) a última movimentação relevante, (3) se há algum prazo ou ação pendente aparente nos dados. Se os dados não tiverem informação suficiente para algum ponto, diga isso em vez de inventar. Máximo 150 palavras.

Dados do processo (JSON do provedor de consulta processual):
${JSON.stringify(processoData, null, 2)}`;

  const response = await anthropic.messages.create({
    model: SUMMARY_MODEL,
    max_tokens: 500,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content.find(b => b.type === 'text')?.text || '';
  return { status: 'success', data: { summary: text } };
}

module.exports = { searchProcessos, summarizeProcess };

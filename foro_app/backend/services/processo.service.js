/**
 * processo.service.js
 *
 * Consulta processual (busca por CPF/CNPJ) e resumo de processo por IA.
 *
 * Consulta: Direct Data (ver lookup.service.js / direct-data.client.js).
 *
 * Resumo por IA: usa o mesmo cliente Anthropic do chat interno (ai.service.js),
 * mas é uma chamada avulsa (sem tools, sem histórico) — cobrada via créditos
 * como um serviço de preço fixo, não por token como o chat. Por isso não
 * grava em ai_usage (que é só para o chat); o custo/consumo deste serviço
 * fica registrado em credit_transactions + service_usage_log.
 */
const Anthropic = require('@anthropic-ai/sdk');
const { AppError } = require('../middlewares/error.middleware');
const externalLookup = require('./external-lookup.service');
const lookupService = require('./lookup.service');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const SUMMARY_MODEL = process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022';

// ─── Busca de processos por CPF/CNPJ (Direct Data: "Processos Judiciais - Simplificada") ───

const searchProcessos = (accountId, userId, documento, opts) => lookupService.lookup(accountId, userId, 'processos', documento, opts);

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

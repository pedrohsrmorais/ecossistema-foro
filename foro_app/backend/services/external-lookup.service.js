/**
 * external-lookup.service.js
 *
 * Wrapper único usado por TODO serviço pago de terceiro (CPF, CNPJ, consulta
 * processual...). Garante a regra de negócio combinada com o dono da
 * plataforma: nunca chamar a API externa sem debitar o crédito antes, e
 * nunca deixar o tenant sem resposta clara em caso de erro.
 *
 * Fluxo:
 *   1. Debita o crédito (credits.service.js::debit) — lança 402 se não há saldo.
 *   2. Executa a função `fn` (a chamada real ao provedor).
 *   3. Se `fn` resolver com { status: 'success' | 'not_found', data }: mantém o
 *      débito (o provedor foi chamado e, para a intellsn, isso tem custo
 *      real, mesmo quando o resultado é "não encontrado") e loga o uso.
 *   4. Se `fn` lançar um erro (timeout, 5xx, rede, parsing): devolve o
 *      crédito automaticamente, loga a falha, e lança um erro genérico —
 *      "Erro na requisição. Tente novamente ou contate o suporte." — nunca
 *      expõe detalhes técnicos ao tenant.
 *
 * NÃO existe aqui (nem em nenhum lugar da API) uma rota de "solicitar
 * reembolso" acionável pelo tenant. Reembolsos por insatisfação são
 * decisão manual da intellsn via o painel administrativo.
 */
const { v4: uuidv4 } = require('uuid');
const { query } = require('../configs/db.config');
const { AppError } = require('../middlewares/error.middleware');
const creditsService = require('./credits.service');

async function runPaidLookup({ accountId, userId, serviceKey, requestSummary, fn }) {
  const { transactionId } = await creditsService.debit(accountId, serviceKey, {});

  try {
    const result = await fn(); // { status: 'success' | 'not_found', data }

    await _logUsage({
      accountId, userId, serviceKey,
      status: result.status,
      creditTransactionId: transactionId,
      requestSummary,
    });

    return result.data;
  } catch (err) {
    // Erro técnico de verdade (não "não encontrado") — devolve o crédito.
    await creditsService.refund(transactionId, `Erro técnico: ${err.message}`);
    await _logUsage({
      accountId, userId, serviceKey,
      status: 'failed',
      creditTransactionId: null,
      requestSummary,
      errorMessage: err.message,
    });

    console.error(`[external-lookup] Falha em "${serviceKey}" (conta ${accountId}):`, err.message);
    throw new AppError('Erro na requisição. Tente novamente em alguns minutos ou contate o suporte.', 502);
  }
}

async function _logUsage({ accountId, userId, serviceKey, status, creditTransactionId, requestSummary, errorMessage }) {
  await query(
    `INSERT INTO service_usage_log (id, account_id, user_id, service_key, status, credit_transaction_id, request_summary, error_message)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [uuidv4(), accountId, userId || null, serviceKey, status, creditTransactionId,
      requestSummary ? JSON.stringify(requestSummary) : null, errorMessage || null]
  );
}

module.exports = { runPaidLookup };

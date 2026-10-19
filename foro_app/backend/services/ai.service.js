/**
 * ai.service.js
 *
 * Orquestra o chat com a IA interna do CRM.
 *
 * Fluxo por turno:
 *   1. Carrega histórico da conversa (limitado a N mensagens)
 *   2. Carrega campos customizados da conta (para o system prompt)
 *   3. Chama a API da Anthropic com tool_use habilitado
 *   4. Se a IA retornar tool_calls, executa cada uma e re-envia
 *   5. Persiste todas as mensagens e registra uso de tokens
 */

const Anthropic = require('@anthropic-ai/sdk');
const { query } = require('../configs/db.config');
const { TOOL_DEFINITIONS, executeTool } = require('./ai-tools.service');
const { AppError } = require('../middlewares/error.middleware');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MAX_HISTORY = 20;          // mensagens do histórico enviadas ao modelo
const MAX_TOOL_CALLS_PER_TURN = 8; // evita loops
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022';

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function _getOrCreateConversation(accountId, userId, conversationId) {
  if (conversationId) {
    const [rows] = await query(
      'SELECT id FROM ai_conversations WHERE id = ? AND account_id = ? AND user_id = ? LIMIT 1',
      [conversationId, accountId, userId]
    );
    if (rows.length) return conversationId;
  }
  await query(
    'INSERT INTO ai_conversations (id, account_id, user_id) VALUES (UUID(), ?, ?)',
    [accountId, userId]
  );
  const [rows] = await query(
    'SELECT id FROM ai_conversations WHERE account_id = ? AND user_id = ? ORDER BY started_at DESC LIMIT 1',
    [accountId, userId]
  );
  return rows[0].id;
}

async function _loadHistory(conversationId, limit = MAX_HISTORY) {
  const [rows] = await query(
    `SELECT role, content FROM ai_messages
     WHERE conversation_id = ? AND role IN ('user','assistant')
     ORDER BY created_at DESC LIMIT ?`,
    [conversationId, limit]
  );
  return rows.reverse();
}

async function _loadFieldSchema(accountId) {
  const [fields] = await query(
    `SELECT name, label, field_type, options, required, ai_question_hint
     FROM field_definitions WHERE account_id = ? AND active = 1 ORDER BY display_order`,
    [accountId]
  );
  if (!fields.length) return 'Nenhum campo customizado configurado.';
  return fields.map(f => {
    let desc = `- ${f.name} (${f.label}, tipo: ${f.field_type}${f.required ? ', obrigatório' : ''})`;
    if (f.options) {
      try { desc += ` — opções: ${JSON.parse(f.options).join(', ')}`; } catch {}
    }
    if (f.ai_question_hint) desc += ` — dica: "${f.ai_question_hint}"`;
    return desc;
  }).join('\n');
}

async function _saveMessage(conversationId, accountId, role, content, usage = null) {
  await query(
    `INSERT INTO ai_messages (id, conversation_id, account_id, role, content, input_tokens, output_tokens, model)
     VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?)`,
    [conversationId, accountId, role, typeof content === 'string' ? content : JSON.stringify(content),
      usage?.input_tokens || null, usage?.output_tokens || null, usage ? MODEL : null]
  );
}

async function _recordUsage(accountId, userId, conversationId, inputTokens, outputTokens) {
  const costPerInputToken  = 3e-6;  // $3 / 1M tokens (claude-3.5-sonnet)
  const costPerOutputToken = 15e-6; // $15 / 1M tokens
  const cost = (inputTokens * costPerInputToken) + (outputTokens * costPerOutputToken);
  await query(
    `INSERT INTO ai_usage (id, account_id, user_id, conversation_id, model, input_tokens, output_tokens, cost_usd)
     VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?)`,
    [accountId, userId, conversationId, MODEL, inputTokens, outputTokens, cost]
  );
}

// ─── Chat principal ────────────────────────────────────────────────────────────

async function chat({ accountId, userId, conversationId, userMessage }) {
  const convId = await _getOrCreateConversation(accountId, userId, conversationId);
  const history = await _loadHistory(convId);
  const fieldSchema = await _loadFieldSchema(accountId);

  const systemPrompt = `Você é o assistente interno do CRM Foro, um sistema de gestão de leads para escritórios de advocacia.

Seu papel é ajudar o usuário a gerenciar leads, notas e tarefas do CRM usando linguagem natural.
Você tem acesso a ferramentas para criar, atualizar, buscar e organizar leads.

CAMPOS CUSTOMIZADOS DESTA CONTA:
${fieldSchema}

REGRAS IMPORTANTES:
- Antes de executar qualquer ação de escrita (criar, atualizar, mover, encerrar), descreva o que vai fazer e peça confirmação — exceto quando o comando for claro e explícito (ex: "cria um lead: João Silva, 51 99999-1234").
- Se um nome de lead for ambíguo, liste as opções e peça escolha antes de agir.
- Se faltar um campo obrigatório, pergunte só o que está faltando.
- Nunca invente campos que não existem na configuração.
- Nunca acesse dados de outras contas.
- Não faça análises jurídicas, pareceres ou recomendações profissionais.
- Se o usuário pedir algo fora do escopo (ex: redigir petição), recuse de forma clara e útil.
- Responda sempre em português do Brasil.`;

  const messages = [
    ...history.map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: userMessage },
  ];

  await _saveMessage(convId, accountId, 'user', userMessage);

  // ─── Agentic loop ──────────────────────────────────────────────────────────
  let toolCallCount = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  while (true) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: systemPrompt,
      tools: TOOL_DEFINITIONS,
      messages,
    });

    totalInputTokens  += response.usage?.input_tokens  || 0;
    totalOutputTokens += response.usage?.output_tokens || 0;

    if (response.stop_reason === 'end_turn') {
      // Resposta final da IA
      const text = response.content.find(b => b.type === 'text')?.text || '';
      await _saveMessage(convId, accountId, 'assistant', text, {
        input_tokens: totalInputTokens, output_tokens: totalOutputTokens,
      });
      await _recordUsage(accountId, userId, convId, totalInputTokens, totalOutputTokens);

      return {
        conversation_id: convId,
        message: text,
        usage: { input_tokens: totalInputTokens, output_tokens: totalOutputTokens },
      };
    }

    if (response.stop_reason === 'tool_use') {
      const toolUseBlocks = response.content.filter(b => b.type === 'tool_use');
      if (!toolUseBlocks.length) break;

      // Adiciona resposta da IA com tool_calls ao histórico
      messages.push({ role: 'assistant', content: response.content });

      const toolResults = [];
      for (const toolUse of toolUseBlocks) {
        toolCallCount++;
        if (toolCallCount > MAX_TOOL_CALLS_PER_TURN) {
          toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id, content: 'Limite de chamadas de ferramenta atingido.' });
          continue;
        }

        let result;
        try {
          result = await executeTool(toolUse.name, toolUse.input, { accountId, userId });
        } catch (err) {
          result = { error: err.message };
        }

        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: JSON.stringify(result),
        });
      }

      messages.push({ role: 'user', content: toolResults });
      continue;
    }

    break;
  }

  throw new AppError('A IA não retornou uma resposta válida.', 500);
}

// ─── Histórico e uso ──────────────────────────────────────────────────────────

async function listConversations(accountId, userId, page = 1, limit = 20) {
  const offset = (page - 1) * limit;
  const [rows] = await query(
    `SELECT id, started_at, ended_at FROM ai_conversations
     WHERE account_id = ? AND user_id = ? ORDER BY started_at DESC LIMIT ? OFFSET ?`,
    [accountId, userId, limit, offset]
  );
  return rows;
}

async function getConversation(conversationId, accountId, userId) {
  const [convRows] = await query(
    'SELECT * FROM ai_conversations WHERE id = ? AND account_id = ? AND user_id = ? LIMIT 1',
    [conversationId, accountId, userId]
  );
  if (!convRows.length) throw new AppError('Conversa não encontrada.', 404);

  const [messages] = await query(
    `SELECT role, content, input_tokens, output_tokens, created_at
     FROM ai_messages WHERE conversation_id = ? ORDER BY created_at`,
    [conversationId]
  );

  return { ...convRows[0], messages };
}

async function clearConversation(conversationId, accountId, userId) {
  await query(
    'UPDATE ai_conversations SET ended_at = NOW() WHERE id = ? AND account_id = ? AND user_id = ?',
    [conversationId, accountId, userId]
  );
}

async function getUsageSummary(accountId, { from, to } = {}) {
  const conditions = ['account_id = ?'];
  const params = [accountId];
  if (from) { conditions.push('created_at >= ?'); params.push(from); }
  if (to)   { conditions.push('created_at <= ?'); params.push(to); }

  const [rows] = await query(
    `SELECT DATE(created_at) AS date, SUM(input_tokens) AS input_tokens,
            SUM(output_tokens) AS output_tokens, SUM(cost_usd) AS cost_usd
     FROM ai_usage WHERE ${conditions.join(' AND ')}
     GROUP BY DATE(created_at) ORDER BY date DESC`,
    params
  );
  return rows;
}

module.exports = { chat, listConversations, getConversation, clearConversation, getUsageSummary };

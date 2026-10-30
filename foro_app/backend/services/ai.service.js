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
const aiCredits = require('./ai-credits.service');
const { v4: uuidv4 } = require('uuid');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const TOOLS_CACHED = TOOL_DEFINITIONS.map((t, i) => (i === TOOL_DEFINITIONS.length - 1 ? { ...t, cache_control: { type: 'ephemeral' } } : t));
const MAX_HISTORY = 20;          // mensagens do histórico enviadas ao modelo
const MAX_TOOL_CALLS_PER_TURN = 8; // evita loops
const MAX_MODEL_CALLS_PER_TURN = MAX_TOOL_CALLS_PER_TURN + 2; // teto de chamadas ao modelo por mensagem (limita custo)
const inFlight = new Set(); // 1 mensagem por vez por usuário (evita rajadas paralelas furarem o saldo de créditos)
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
const MAX_OUTPUT_TOKENS = 1500; // teto por chamada: limita o custo de um turno

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function _getOrCreateConversation(accountId, userId, conversationId) {
  if (conversationId) {
    const [rows] = await query(
      'SELECT id FROM ai_conversations WHERE id = ? AND account_id = ? AND user_id = ? AND ended_at IS NULL LIMIT 1',
      [conversationId, accountId, userId]
    );
    if (rows.length) return conversationId;
  }
  const id = uuidv4();
  await query('INSERT INTO ai_conversations (id, account_id, user_id) VALUES (?, ?, ?)', [id, accountId, userId]);
  return id;
}

async function _loadHistory(conversationId, limit = MAX_HISTORY) {
  const [rows] = await query(
    `SELECT role, content FROM ai_messages
     WHERE conversation_id = ? AND role IN ('user','assistant')
     ORDER BY created_at DESC, id DESC LIMIT ${Number(limit) | 0}`,
    [conversationId]
  );
  const hist = rows.reverse();
  while (hist.length && hist[0].role !== 'user') hist.shift(); // a API exige começar por "user"
  return hist;
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
      try {
        const opts = typeof f.options === 'string' ? JSON.parse(f.options) : f.options; // coluna JSON já vem como array
        if (Array.isArray(opts) && opts.length) desc += ` — opções: ${opts.join(', ')}`;
      } catch {}
    }
    if (f.ai_question_hint) desc += ` — dica: "${f.ai_question_hint}"`;
    return desc;
  }).join('\n');
}

async function _saveMessage(conversationId, accountId, role, content, usage = null) {
  const id = uuidv4();
  await query(
    `INSERT INTO ai_messages (id, conversation_id, account_id, role, content, input_tokens, output_tokens, model)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, conversationId, accountId, role, typeof content === 'string' ? content : JSON.stringify(content),
      usage?.input_tokens || null, usage?.output_tokens || null, usage ? MODEL : null]
  );
  return id;
}

async function _recordUsage(accountId, userId, conversationId, u) {
  const credits = aiCredits.computeCredits(u);
  const cost = aiCredits.computeCostUsd(u);
  await query(
    `INSERT INTO ai_usage (id, account_id, user_id, conversation_id, model, input_tokens, output_tokens,
                           cache_creation_tokens, cache_read_tokens, credits, cost_usd, created_at)
     VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [accountId, userId, conversationId, MODEL, u.input, u.output, u.cacheCreation, u.cacheRead, credits, cost, new Date()]
  );
  return credits;
}

function _summarizeAction(name, input, result) {
  if (result?.error) return `Falhou: ${result.error}`;
  switch (name) {
    case 'create_lead':      return `Lead criado: ${result?.name || input.name || 'sem nome'}`;
    case 'update_lead':      return `Lead atualizado: ${result?.name || ''}`.trim();
    case 'move_lead_stage':  return `Lead movido para ${input.stage}`;
    case 'add_note':         return 'Nota adicionada';
    case 'create_task':      return `Tarefa criada: ${input.description}`;
    case 'complete_task':    return 'Tarefa concluída';
    case 'search_leads':     return `Busca: ${result?.data?.length ?? 0} lead(s)`;
    case 'get_lead':         return `Consultou lead: ${result?.name || ''}`.trim();
    case 'get_funnel_summary': return 'Consultou o funil';
    case 'list_tasks':       return `Consultou tarefas: ${Array.isArray(result) ? result.length : 0}`;
    case 'create_case':      return `Processo cadastrado: ${result?.case_number || result?.title || ''}`.trim();
    case 'update_case':      return 'Processo atualizado';
    case 'add_case_update':  return 'Andamento registrado';
    case 'get_case':         return `Consultou processo: ${result?.case_number || result?.title || ''}`.trim();
    case 'search_cases':     return `Busca de processos: ${result?.data?.length ?? 0}`;
    case 'create_event':     return `Agendado: ${result?.title || input.title}`;
    case 'list_events':      return `Consultou agenda: ${Array.isArray(result) ? result.length : 0} compromisso(s)`;
    default: return name;
  }
}

const WRITE_TOOLS = new Set(['create_lead','update_lead','move_lead_stage','add_note','create_task','complete_task','create_case','update_case','add_case_update','create_event']);

// ─── Chat principal ────────────────────────────────────────────────────────────

async function chat(args) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new AppError('O assistente de IA está indisponível no momento.', 503, 'AI_UNAVAILABLE');
  }
  const key = args.userId;
  if (inFlight.has(key)) throw new AppError('Aguarde a resposta anterior terminar antes de enviar outra mensagem.', 429, 'AI_BUSY');
  inFlight.add(key);
  try {
    return await _chat(args);
  } finally {
    inFlight.delete(key);
  }
}

async function _chat({ accountId, userId, conversationId, userMessage }) {
  // Regra de créditos: sem saldo na semana, nem chama o modelo (ver ai-credits.service.js)
  await aiCredits.assertHasCredits(accountId);

  const convId = await _getOrCreateConversation(accountId, userId, conversationId);
  const history = await _loadHistory(convId);
  const fieldSchema = await _loadFieldSchema(accountId);

  const today = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' });
  const systemPrompt = `Você é o assistente interno do CRM Foro, um sistema de gestão de leads para escritórios de advocacia.

Seu papel é ajudar o usuário a gerenciar contatos (leads), processos, andamentos, prazos, tarefas, notas e a agenda do escritório usando linguagem natural.
Você tem ferramentas para criar, atualizar e buscar tudo isso. Hoje é ${today} (fuso America/Sao_Paulo, -03:00); resolva datas relativas ("amanhã", "sexta") a partir dela.

CAMPOS CUSTOMIZADOS DESTA CONTA:
${fieldSchema}

ETAPAS DO FUNIL (use exatamente estes códigos): novo, em_contato, proposta, convertido, encerrado.

REGRAS IMPORTANTES:
- Antes de executar qualquer ação de escrita (criar, atualizar, mover, encerrar), descreva o que vai fazer e peça confirmação — exceto quando o comando for claro e explícito (ex: "cria um lead: João Silva, 51 99999-1234").
- Se um nome de lead for ambíguo, liste as opções e peça escolha antes de agir.
- Se faltar um campo obrigatório, pergunte só o que está faltando.
- Nunca invente campos que não existem na configuração.
- Nunca acesse dados de outras contas.
- Números de processo seguem o padrão CNJ; se a ferramenta indicar número inválido, avise o usuário.
- Não faça análises jurídicas, pareceres ou recomendações profissionais.
- Se o usuário pedir algo fora do escopo (ex: redigir petição), recuse de forma clara e útil.
- Responda sempre em português do Brasil.`;

  const messages = [
    ...history.map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: userMessage },
  ];

  const userMsgId = await _saveMessage(convId, accountId, 'user', userMessage);

  // ─── Agentic loop ──────────────────────────────────────────────────────────
  let toolCallCount = 0;
  let modelCalls = 0;
  const totals = { input: 0, cacheCreation: 0, cacheRead: 0, output: 0 };
  const actions = [];

  try {
  while (true) {
    if (++modelCalls > MAX_MODEL_CALLS_PER_TURN) {
      // Trava de segurança: o modelo insistiu em chamar ferramentas. Encerra o turno com o que já foi feito.
      const text = 'Fiz o que consegui neste turno, mas atingi o limite de ações por mensagem. Confira o resultado e me diga se devo continuar.';
      await _saveMessage(convId, accountId, 'assistant', text, { input_tokens: totals.input + totals.cacheCreation + totals.cacheRead, output_tokens: totals.output });
      const creditsUsed = await _recordUsage(accountId, userId, convId, totals);
      return {
        conversation_id: convId, message: text, actions,
        usage: { input_tokens: totals.input + totals.cacheCreation + totals.cacheRead, output_tokens: totals.output, credits_used: creditsUsed },
        credits: await aiCredits.getStatus(accountId),
      };
    }
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      // Prompt caching: cache_control no último bloco do system cacheia tools + system.
      system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
      tools: TOOLS_CACHED,
      messages,
    });

    totals.input         += response.usage?.input_tokens || 0;
    totals.cacheCreation += response.usage?.cache_creation_input_tokens || 0;
    totals.cacheRead     += response.usage?.cache_read_input_tokens || 0;
    totals.output        += response.usage?.output_tokens || 0;

    if (response.stop_reason === 'end_turn' || response.stop_reason === 'max_tokens') {
      // Resposta final da IA
      const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim()
        || 'Pronto.';
      await _saveMessage(convId, accountId, 'assistant', text, {
        input_tokens: totals.input + totals.cacheCreation + totals.cacheRead, output_tokens: totals.output,
      });
      const creditsUsed = await _recordUsage(accountId, userId, convId, totals);
      const credits = await aiCredits.getStatus(accountId);

      return {
        conversation_id: convId,
        message: text,
        actions,
        usage: {
          input_tokens: totals.input + totals.cacheCreation + totals.cacheRead,
          output_tokens: totals.output,
          credits_used: creditsUsed,
        },
        credits,
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
        actions.push({
          tool: toolUse.name,
          write: WRITE_TOOLS.has(toolUse.name),
          ok: !result?.error,
          summary: _summarizeAction(toolUse.name, toolUse.input, result),
          lead_id: toolUse.input?.lead_id || (toolUse.name === 'create_lead' ? result?.id : null) || null,
          case_id: toolUse.input?.case_id || (toolUse.name === 'create_case' ? result?.id : null) || null,
        });

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
  throw new AppError('A IA não retornou uma resposta válida.', 502, 'AI_BAD_RESPONSE');
  } catch (err) {
    // Falha no meio do turno (API fora do ar, limite de taxa...). Tokens já consumidos em chamadas
    // anteriores do mesmo turno AINDA custaram dinheiro e ações de escrita podem ter sido executadas:
    // registra o uso e remove a mensagem do usuário sem resposta para não sujar o histórico.
    if (totals.input + totals.cacheCreation + totals.cacheRead + totals.output > 0) {
      await _recordUsage(accountId, userId, convId, totals).catch(e => console.error('[ai] falha ao registrar uso:', e.message));
    }
    if (actions.length === 0) {
      await query('DELETE FROM ai_messages WHERE id = ?', [userMsgId]).catch(() => {});
    }
    if (err.statusCode) throw err;
    console.error('[ai] erro na chamada ao modelo:', err.status || '', err.message);
    const overloaded = err.status === 429 || err.status === 529 || err.status >= 500;
    throw new AppError(
      overloaded ? 'A IA está sobrecarregada no momento. Tente de novo em instantes.' : 'Não foi possível falar com a IA agora. Tente novamente.',
      503, 'AI_UPSTREAM_ERROR'
    );
  }
}

// ─── Histórico e uso ──────────────────────────────────────────────────────────

async function listConversations(accountId, userId, page = 1, limit = 20) {
  const offset = (page - 1) * limit;
  const [rows] = await query(
    `SELECT id, started_at, ended_at FROM ai_conversations
     WHERE account_id = ? AND user_id = ? ORDER BY started_at DESC LIMIT ${Number(limit) | 0} OFFSET ${Number(offset) | 0}`,
    [accountId, userId]
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
    `SELECT DATE(created_at) AS date, SUM(input_tokens + cache_creation_tokens + cache_read_tokens) AS input_tokens,
            SUM(output_tokens) AS output_tokens, SUM(credits) AS credits
     FROM ai_usage WHERE ${conditions.join(' AND ')}
     GROUP BY DATE(created_at) ORDER BY date DESC`,
    params
  );
  return rows;
}

module.exports = { chat, listConversations, getConversation, clearConversation, getUsageSummary };

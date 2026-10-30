const { paging } = require('../utils/paging');
const MAX_MESSAGE_CHARS = 4000; // evita uma única mensagem gigante consumir os créditos da semana
const aiService = require('../services/ai.service');
const aiCredits = require('../services/ai-credits.service');

/**
 * Recebe a mensagem do usuário, processa com a IA (com tool use),
 * persiste o histórico e retorna a resposta.
 *
 * Body: { message: string, conversation_id?: string }
 */
async function sendMessage(req, res) {
  const { message, conversation_id } = req.body;

  if (typeof message !== 'string' || !message.trim()) {
    return res.status(422).json({ error: 'Mensagem não pode estar vazia.' });
  }
  if (message.length > MAX_MESSAGE_CHARS) {
    return res.status(422).json({ error: `Mensagem muito longa (máximo ${MAX_MESSAGE_CHARS} caracteres).`, code: 'MESSAGE_TOO_LONG' });
  }

  const result = await aiService.chat({
    accountId: req.account.id,
    userId: req.user.id,
    conversationId: conversation_id,
    userMessage: message.trim(),
  });

  res.json(result);
}

async function listConversations(req, res) {
  const { page, limit } = paging(req.query.page, req.query.limit, { defaultLimit: 20 });
  const result = await aiService.listConversations(req.account.id, req.user.id, page, limit);
  res.json(result);
}

async function getConversation(req, res) {
  const conv = await aiService.getConversation(req.params.id, req.account.id, req.user.id);
  res.json(conv);
}

async function clearConversation(req, res) {
  await aiService.clearConversation(req.params.id, req.account.id, req.user.id);
  res.json({ message: 'Conversa encerrada.' });
}

async function getUsage(req, res) {
  const { from, to } = req.query;
  const usage = await aiService.getUsageSummary(req.account.id, { from, to });
  res.json(usage);
}

async function getCredits(req, res) {
  res.json(await aiCredits.getStatus(req.account.id));
}

module.exports = { getCredits, sendMessage, listConversations, getConversation, clearConversation, getUsage };

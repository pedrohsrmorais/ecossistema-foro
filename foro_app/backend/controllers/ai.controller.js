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

  if (!message || !message.trim()) {
    return res.status(422).json({ error: 'Mensagem não pode estar vazia.' });
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
  const { page = 1, limit = 20 } = req.query;
  const result = await aiService.listConversations(req.account.id, req.user.id, +page, +limit);
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

/**
 * support.service.js — chamados de suporte. Sempre grava no banco (nada se perde se o e-mail falhar)
 * e avisa a equipe por e-mail (SUPPORT_EMAIL) com Reply-To do cliente.
 */
const { v4: uuidv4 } = require('uuid');
const { query } = require('../configs/db.config');
const { AppError } = require('../middlewares/error.middleware');
const email = require('./email.service');

const CATEGORIES = ['duvida', 'problema', 'cobranca', 'sugestao', 'outro'];

function info() {
  return {
    email: process.env.SUPPORT_EMAIL || null,
    whatsapp: process.env.SUPPORT_WHATSAPP ? String(process.env.SUPPORT_WHATSAPP).replace(/\D/g, '') : null,
    hours: process.env.SUPPORT_HOURS || 'Segunda a sexta, 9h às 18h (horário de Brasília)',
    categories: CATEGORIES,
  };
}

async function list(accountId, userId) {
  const [rows] = await query(
    `SELECT id, category, subject, message, status, created_at FROM support_tickets
     WHERE account_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 20`,
    [accountId, userId]
  );
  return rows;
}

async function create({ accountId, user, account, body }) {
  const subject = String(body?.subject ?? '').trim();
  const message = String(body?.message ?? '').trim();
  const category = CATEGORIES.includes(body?.category) ? body.category : 'duvida';
  const page = body?.page ? String(body.page).slice(0, 120) : null;
  if (subject.length < 3) throw new AppError('Informe um assunto (mínimo 3 caracteres).', 422, 'VALIDATION');
  if (message.length < 10) throw new AppError('Descreva o que aconteceu (mínimo 10 caracteres).', 422, 'VALIDATION');
  if (subject.length > 200) throw new AppError('Assunto muito longo (máx. 200).', 422, 'VALIDATION');
  if (message.length > 5000) throw new AppError('Mensagem muito longa (máx. 5.000 caracteres).', 422, 'VALIDATION');

  const id = uuidv4();
  await query(
    'INSERT INTO support_tickets (id, account_id, user_id, category, subject, message) VALUES (?, ?, ?, ?, ?, ?)',
    [id, accountId, user.id, category, subject, message]
  );

  let emailed = false;
  const to = process.env.SUPPORT_EMAIL;
  if (to) {
    try {
      await email.sendSupportRequest(to, {
        fromName: user.name, fromEmail: user.email, accountName: account.name, planName: account.plan_id,
        category, subject, message, ticketId: id, page,
      });
      emailed = true;
      await query('UPDATE support_tickets SET email_sent = 1 WHERE id = ?', [id]);
    } catch (err) {
      console.error('[support] e-mail não enviado (chamado ficou registrado):', err.message);
    }
  } else {
    console.warn('[support] SUPPORT_EMAIL não configurado — chamado registrado só no banco.');
  }
  return { id, status: 'aberto', emailed, reply_to: user.email };
}

module.exports = { info, list, create, CATEGORIES };

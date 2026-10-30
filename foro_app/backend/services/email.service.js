/**
 * email.service.js
 *
 * Envio de e-mails transacionais via Resend (https://resend.com).
 *
 * Sem RESEND_API_KEY configurada, cai automaticamente em modo "dev" e apenas
 * loga o conteúdo no console — assim o fluxo de cadastro/verificação/reset de
 * senha continua funcionando localmente sem depender de uma chave real.
 *
 * Para ativar o envio de verdade:
 *   1. Crie uma conta em https://resend.com e verifique um domínio (ou use o
 *      domínio de teste onboarding@resend.dev para testes rápidos).
 *   2. Gere uma API Key em https://resend.com/api-keys.
 *   3. Preencha RESEND_API_KEY e EMAIL_FROM no .env (ou nas env vars do
 *      docker-compose) — nenhuma mudança de código é necessária.
 */

const { Resend } = require('resend');
const { AppError } = require('../middlewares/error.middleware');

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM || 'Foro <onboarding@resend.dev>';

const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

/**
 * Envia um e-mail. Em modo dev (sem chave configurada) apenas loga.
 */
async function _send({ to, subject, html, devFallbackText }) {
  if (!resend) {
    console.log(`[DEV — RESEND_API_KEY não configurada] E-mail para ${to}\nAssunto: ${subject}\n${devFallbackText}`);
    return { dev: true };
  }

  try {
    const { data, error } = await resend.emails.send({ from: EMAIL_FROM, to, subject, html });
    if (error) {
      console.error('[email.service] Resend retornou erro:', error);
      throw new Error(error.message || 'Falha ao enviar e-mail.');
    }
    return data;
  } catch (err) {
    console.error('[email.service] Falha ao enviar e-mail via Resend:', err.message);
    throw new AppError('Não foi possível enviar o e-mail agora. Tente novamente em instantes.', 502, 'EMAIL_SEND_FAILED');
  }
}

const SPAM_NOTE_TEXT = 'Não encontrou o e-mail? Confira também a caixa de spam / lixo eletrônico / lixeira.';
const SPAM_NOTE_HTML = `<p style="color:#475569; font-size: 13px; background:#f1f5f9; border-radius:8px; padding:10px 12px;">📬 <strong>Não encontrou este e-mail?</strong> Olhe também a caixa de <strong>spam</strong>, o <strong>lixo eletrônico</strong> e a <strong>lixeira</strong> — às vezes ele cai lá.</p>`;

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function sendVerificationEmail(to, code, expiresInMinutes) {
  return _send({
    to,
    subject: 'Confirme seu e-mail — Foro',
    devFallbackText: `Código de verificação: ${code} (expira em ${expiresInMinutes} min). ${SPAM_NOTE_TEXT}`,
    html: `
      <div style="font-family: sans-serif; max-width: 420px; margin: 0 auto;">
        <h2 style="color:#1e293b;">Confirme seu e-mail</h2>
        <p style="color:#475569;">Use o código abaixo para confirmar seu cadastro no Foro:</p>
        <p style="font-size: 32px; font-weight: 700; letter-spacing: 6px; color:#1e293b; text-align:center; margin: 24px 0;">${esc(code)}</p>
        <p style="color:#94a3b8; font-size: 13px;">Este código expira em ${esc(expiresInMinutes)} minutos. Se você não solicitou isso, ignore este e-mail.</p>
        ${SPAM_NOTE_HTML}
      </div>`,
  });
}

async function sendPasswordResetEmail(to, resetUrl, expiresInMinutes) {
  return _send({
    to,
    subject: 'Redefinição de senha — Foro',
    devFallbackText: `Link de redefinição: ${resetUrl} (expira em ${expiresInMinutes} min). ${SPAM_NOTE_TEXT}`,
    html: `
      <div style="font-family: sans-serif; max-width: 420px; margin: 0 auto;">
        <h2 style="color:#1e293b;">Redefinir senha</h2>
        <p style="color:#475569;">Recebemos uma solicitação para redefinir sua senha no Foro. Clique no botão abaixo:</p>
        <p style="text-align:center; margin: 24px 0;">
          <a href="${esc(resetUrl)}" style="background:#4f46e5; color:#fff; padding:12px 24px; border-radius:8px; text-decoration:none; font-weight:600;">Redefinir senha</a>
        </p>
        <p style="color:#94a3b8; font-size: 13px;">Este link expira em ${esc(expiresInMinutes)} minutos. Se você não solicitou isso, ignore este e-mail.</p>
        ${SPAM_NOTE_HTML}
      </div>`,
  });
}

async function sendInviteEmail(to, inviteUrl, { inviterName, accountName, expiresInHours }) {
  return _send({
    to,
    subject: `${inviterName || 'Alguém'} convidou você para o Foro`,
    devFallbackText: `Convite de ${inviterName} (${accountName}): ${inviteUrl} (expira em ${expiresInHours}h). ${SPAM_NOTE_TEXT}`,
    html: `
      <div style="font-family: sans-serif; max-width: 420px; margin: 0 auto;">
        <h2 style="color:#1e293b;">Você foi convidado(a) para o Foro</h2>
        <p style="color:#475569;"><strong>${esc(inviterName)}</strong> convidou você para a equipe <strong>${esc(accountName)}</strong>. Crie sua senha para entrar:</p>
        <p style="text-align:center; margin: 24px 0;">
          <a href="${esc(inviteUrl)}" style="background:#4f46e5; color:#fff; padding:12px 24px; border-radius:8px; text-decoration:none; font-weight:600;">Aceitar convite e criar senha</a>
        </p>
        <p style="color:#94a3b8; font-size: 13px;">O link expira em ${esc(expiresInHours)} horas. Se você não esperava este convite, ignore este e-mail.</p>
        ${SPAM_NOTE_HTML}
      </div>`,
  });
}

module.exports = { sendVerificationEmail, sendPasswordResetEmail, sendInviteEmail };

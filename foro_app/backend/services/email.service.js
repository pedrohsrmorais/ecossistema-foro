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

const KIND_LABEL = { prazo: 'Prazo', tarefa: 'Tarefa', audiencia: 'Audiência', pericia: 'Perícia', reuniao: 'Reunião', evento: 'Compromisso' };
const fmtWhen = (iso, withTime) => {
  const d = new Date(iso);
  const date = d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'short', day: '2-digit', month: '2-digit' });
  const time = d.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
  return withTime && time !== '00:00' ? `${date} às ${time}` : date;
};
function _rel(days) {
  if (days < 0) return `vencido há ${-days} dia${days === -1 ? '' : 's'}`;
  if (days === 0) return 'hoje';
  if (days === 1) return 'amanhã';
  return `em ${days} dias`;
}

/** Resumo diário de prazos e compromissos. `data` vem de deadlines.service.forUser. */
async function sendDeadlineDigest(to, { name, data, appUrl, isTest = false }) {
  const { overdue, today, upcoming, counts } = data;
  const section = (title, color, list) => !list.length ? '' : `
    <h3 style="margin:20px 0 6px; font-size:14px; color:${color};">${esc(title)} (${list.length})</h3>
    <table style="width:100%; border-collapse:collapse; font-size:14px;">${list.map(it => `
      <tr style="border-top:1px solid #e2e8f0;">
        <td style="padding:8px 6px; vertical-align:top; width:92px; color:#64748b; font-size:12px;">${esc(KIND_LABEL[it.kind] || 'Item')}</td>
        <td style="padding:8px 6px; color:#0f172a;">
          <a href="${esc(appUrl)}${it.case_id ? '/processos/' + esc(it.case_id) : (it.lead_id ? '/leads/' + esc(it.lead_id) : '/tasks')}" style="color:#0f172a; text-decoration:none; font-weight:600;">${esc(it.title)}</a>
          ${it.case_label || it.lead_name ? `<br><span style="color:#64748b; font-size:12px;">${esc([it.case_label, it.lead_name].filter(Boolean).join(' · '))}</span>` : ''}
        </td>
        <td style="padding:8px 6px; text-align:right; white-space:nowrap; font-size:12px; color:${color};">${esc(fmtWhen(it.at, it.kind !== 'prazo' && it.kind !== 'tarefa'))}<br>${esc(_rel(it.days))}</td>
      </tr>`).join('')}
    </table>`;

  const nothing = !overdue.length && !today.length && !upcoming.length;
  const parts = [];
  if (counts.overdue) parts.push(`${counts.overdue} vencido${counts.overdue > 1 ? 's' : ''}`);
  if (counts.today) parts.push(`${counts.today} para hoje`);
  const subject = (isTest ? '[Teste] ' : '') + (parts.length ? `Atenção: ${parts.join(' e ')} — Foro` : 'Seus prazos dos próximos dias — Foro');
  const text = [...overdue, ...today, ...upcoming].map(it => `- ${KIND_LABEL[it.kind]}: ${it.title} (${_rel(it.days)})`).join('\n') || 'Nada pendente.';

  return _send({
    to, subject,
    devFallbackText: `Resumo de prazos para ${name}:\n${text}`,
    html: `
      <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto;">
        <h2 style="color:#1e293b; margin-bottom:4px;">Bom dia, ${esc((name || '').split(' ')[0] || 'doutor(a)')}</h2>
        <p style="color:#475569; margin-top:0;">${nothing ? 'Você não tem prazos nem compromissos nos próximos 7 dias.' : 'Este é o seu resumo de prazos e compromissos.'}</p>
        ${section('Vencidos', '#b91c1c', overdue)}
        ${section('Hoje', '#b45309', today)}
        ${section('Próximos 7 dias', '#334155', upcoming)}
        <p style="text-align:center; margin: 28px 0 12px;">
          <a href="${esc(appUrl)}/dashboard" style="background:#4f46e5; color:#fff; padding:12px 24px; border-radius:8px; text-decoration:none; font-weight:600;">Abrir o Foro</a>
        </p>
        <p style="color:#94a3b8; font-size:12px;">Você recebe este resumo porque está ativo na conta do seu escritório. Para parar de receber, desative em Configurações → Notificações. Este aviso não substitui a conferência dos prazos no processo.</p>
        ${SPAM_NOTE_HTML}
      </div>`,
  });
}

/** Chamado de suporte → caixa do suporte, com Reply-To do usuário. */
async function sendSupportRequest(to, { fromName, fromEmail, accountName, planName, category, subject, message, ticketId, page }) {
  if (!resend) {
    console.log(`[DEV — RESEND_API_KEY não configurada] Suporte #${ticketId} de ${fromName} <${fromEmail}> (${accountName}): [${category}] ${subject}\n${message}`);
    return { dev: true };
  }
  const { error } = await resend.emails.send({
    from: EMAIL_FROM, to, replyTo: fromEmail,
    subject: `[Suporte Foro #${String(ticketId).slice(0, 8)}] ${subject}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px;">
        <p style="color:#64748b; font-size:13px; margin:0 0 12px;">
          <strong>${esc(fromName)}</strong> &lt;${esc(fromEmail)}&gt; · ${esc(accountName)} · plano ${esc(planName || '—')} · categoria ${esc(category)}${page ? ' · página ' + esc(page) : ''}
        </p>
        <div style="white-space:pre-wrap; color:#0f172a; border-left:3px solid #4f46e5; padding-left:12px;">${esc(message)}</div>
        <p style="color:#94a3b8; font-size:12px; margin-top:16px;">Responda este e-mail: a resposta vai direto para o cliente.</p>
      </div>`,
  });
  if (error) throw new Error(error.message || 'Falha ao enviar o e-mail de suporte.');
  return { sent: true };
}

module.exports = { sendVerificationEmail, sendPasswordResetEmail, sendInviteEmail, sendDeadlineDigest, sendSupportRequest };

/**
 * Resumo diário de prazos por e-mail.
 *
 * Roda a cada 10 min; a partir de DIGEST_HOUR (padrão 7h, Brasília) manda UM e-mail por usuário por dia
 * quando há algo vencido, para hoje ou nos próximos 3 dias. A trava é a tabela `notification_log`
 * (UNIQUE usuário+tipo+dia): vale mesmo com reinício do container ou duas instâncias.
 * Desligar: DEADLINE_DIGEST=off.
 */
const { query } = require('../configs/db.config');
const deadlines = require('../services/deadlines.service');
const email = require('../services/email.service');

const KIND = 'deadline_digest';
const HOUR = Number.isFinite(Number(process.env.DIGEST_HOUR)) && process.env.DIGEST_HOUR !== '' ? Number(process.env.DIGEST_HOUR) : 7;
const appUrl = () => (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/+$/, '');
const failures = new Map(); // `${userId}:${ymd}` → tentativas

async function runOnce(now = new Date()) {
  const { ymd, hour } = deadlines.brNow(now);
  if (hour < HOUR) return { skipped: 'antes do horário', sent: 0 };

  const [users] = await query(
    `SELECT u.id, u.name, u.email, u.role, u.account_id
     FROM users u JOIN accounts a ON a.id = u.account_id
     WHERE u.active = 1 AND u.email_verified_at IS NOT NULL AND u.notify_deadlines_email = 1
       AND (a.status = 'active' OR (a.status = 'trialing' AND (a.trial_ends_at IS NULL OR a.trial_ends_at >= ?)))
       AND NOT EXISTS (SELECT 1 FROM notification_log n WHERE n.user_id = u.id AND n.kind = ? AND n.ref_date = ?)`,
    [now, KIND, ymd]
  );

  let sent = 0;
  for (const u of users) {
    const fkey = `${u.id}:${ymd}`;
    if ((failures.get(fkey) || 0) >= 3) continue;
    // Reserva o envio do dia (atômico). Se outra instância já reservou, affectedRows = 0.
    const [r] = await query('INSERT IGNORE INTO notification_log (user_id, kind, ref_date) VALUES (?, ?, ?)', [u.id, KIND, ymd]);
    if (!r.affectedRows) continue;
    try {
      const data = await deadlines.forUser(u.account_id, u, { now });
      if (data.counts.urgent === 0) continue; // nada importante: mantém a reserva e não incomoda
      await email.sendDeadlineDigest(u.email, { name: u.name, data, appUrl: appUrl() });
      sent++;
    } catch (err) {
      failures.set(fkey, (failures.get(fkey) || 0) + 1);
      await query('DELETE FROM notification_log WHERE user_id = ? AND kind = ? AND ref_date = ?', [u.id, KIND, ymd]).catch(() => {});
      console.error(`[deadline-digest] falha para ${u.email}:`, err.message);
    }
  }
  if (failures.size > 5000) failures.clear();
  return { sent, candidates: users.length };
}

function start() {
  if (process.env.DEADLINE_DIGEST === 'off' || process.env.NODE_ENV === 'test') return;
  const tick = () => runOnce().then(r => { if (r.sent) console.log(`[deadline-digest] ${r.sent} resumo(s) enviado(s)`); }).catch(e => console.error('[deadline-digest]', e.message));
  setTimeout(tick, 30_000).unref();
  setInterval(tick, 10 * 60 * 1000).unref();
  console.log(`⏰ Resumo diário de prazos ativo (a partir das ${HOUR}h, Brasília)`);
}

module.exports = { start, runOnce };

/**
 * deadlines.service.js — "o que vence / acontece" para um usuário.
 *
 * Fonte única para o sino do app, o painel e o resumo diário por e-mail.
 *
 * Quem enxerga o quê:
 *  - Cada usuário vê as tarefas/prazos que criou ou que são de processos sob sua responsabilidade,
 *    e os compromissos que criou ou de processos sob sua responsabilidade.
 *  - Administradores da conta também veem TODOS os prazos processuais e audiências/perícias do escritório
 *    (quem responde pelo escritório não pode ser pego de surpresa).
 *
 * "Hoje" é sempre o dia de Brasília (sem horário de verão desde 2019, UTC-03:00), independente do fuso do servidor.
 */
const { query } = require('../configs/db.config');

const DAY = 864e5;
const TZ = 'America/Sao_Paulo';

/** { ymd: '2026-10-30', hour: 7 } no fuso de Brasília. */
function brNow(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' })
    .formatToParts(now).map(p => [p.type, p.value]));
  return { ymd: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
}
/** Meia-noite de Brasília do dia de `now`, como Date. */
function startOfDay(now = new Date()) {
  return new Date(`${brNow(now).ymd}T00:00:00-03:00`);
}

const EVENT_KIND = { audiencia: 'audiencia', pericia: 'pericia', reuniao: 'reuniao', outro: 'evento' };

function _label(row) { return row.case_number || row.case_title || null; }

/**
 * @returns {{ counts:{overdue,today,upcoming,urgent}, overdue:[], today:[], upcoming:[] }}
 *   upcoming = amanhã até `days` dias à frente. urgent = vencidos + hoje + próximos 3 dias.
 */
async function forUser(accountId, user, { days = 7, now = new Date() } = {}) {
  const start = startOfDay(now);
  const tomorrow = new Date(start.getTime() + DAY);
  const end = new Date(start.getTime() + (days + 1) * DAY);
  const urgentEnd = new Date(start.getTime() + 4 * DAY);
  const isAdmin = user.role === 'admin';

  const [tasks] = await query(
    `SELECT t.id, t.description AS title, t.due_date AS at, t.is_deadline, t.case_id, t.lead_id,
            c.case_number, c.title AS case_title, l.name AS lead_name
     FROM tasks t
     LEFT JOIN cases c ON c.id = t.case_id AND c.deleted_at IS NULL
     LEFT JOIN leads l ON l.id = t.lead_id
     WHERE t.account_id = ? AND t.completed_at IS NULL AND t.due_date IS NOT NULL AND t.due_date < ?
       AND (t.user_id = ? OR c.responsible_user_id = ?${isAdmin ? ' OR t.is_deadline = 1' : ''})
     ORDER BY t.due_date ASC LIMIT 300`,
    [accountId, end, user.id, user.id]
  );
  const [events] = await query(
    `SELECT e.id, e.title, e.starts_at AS at, e.type, e.case_id, e.lead_id, e.meeting_url,
            c.case_number, c.title AS case_title, l.name AS lead_name
     FROM events e
     LEFT JOIN cases c ON c.id = e.case_id AND c.deleted_at IS NULL
     LEFT JOIN leads l ON l.id = e.lead_id
     WHERE e.account_id = ? AND e.status = 'agendado' AND e.starts_at >= ? AND e.starts_at < ?
       AND (e.user_id = ? OR c.responsible_user_id = ?${isAdmin ? " OR e.type IN ('audiencia','pericia')" : ''})
     ORDER BY e.starts_at ASC LIMIT 300`,
    [accountId, start, end, user.id, user.id]
  );

  const items = [
    ...tasks.map(t => ({ id: t.id, kind: t.is_deadline ? 'prazo' : 'tarefa', title: t.title, at: t.at, case_id: t.case_id, case_label: _label(t), lead_id: t.lead_id, lead_name: t.lead_name })),
    ...events.map(e => ({ id: e.id, kind: EVENT_KIND[e.type] || 'evento', title: e.title, at: e.at, case_id: e.case_id, case_label: _label(e), lead_id: e.lead_id, lead_name: e.lead_name, meeting_url: e.meeting_url })),
  ].sort((a, b) => +new Date(a.at) - +new Date(b.at));

  const out = { overdue: [], today: [], upcoming: [] };
  let urgentUpcoming = 0;
  for (const it of items) {
    const at = new Date(it.at);
    it.days = Math.floor((startOfDay(at) - start) / DAY); // negativo = atrasado
    if (at < start) out.overdue.push(it);
    else if (at < tomorrow) out.today.push(it);
    else { out.upcoming.push(it); if (at < urgentEnd) urgentUpcoming++; }
  }
  return {
    counts: {
      overdue: out.overdue.length, today: out.today.length, upcoming: out.upcoming.length,
      urgent: out.overdue.length + out.today.length + urgentUpcoming,
    },
    ...out,
  };
}

module.exports = { forUser, brNow, startOfDay };

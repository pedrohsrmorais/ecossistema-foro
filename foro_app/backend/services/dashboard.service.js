/**
 * dashboard.service.js — números do Painel (uma chamada só).
 * Tudo isolado por account_id. Prazos/agenda vêm de deadlines.service (mesmas regras do sino e do e-mail).
 */
const { query } = require('../configs/db.config');
const deadlines = require('./deadlines.service');

const OPEN_STAGES = "('novo','em_contato','proposta')";

async function overview(accountId, user) {
  const alerts = await deadlines.forUser(accountId, user, { days: 7 });
  const [[leadStats]] = await query(
    `SELECT COUNT(*) AS total,
            SUM(created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)) AS new_30d,
            SUM(stage = 'convertido') AS converted,
            SUM(stage = 'convertido' AND NOT EXISTS (SELECT 1 FROM cases c WHERE c.lead_id = leads.id AND c.deleted_at IS NULL)) AS converted_no_case,
            SUM(stage IN ${OPEN_STAGES} AND COALESCE(last_contact_at, updated_at, created_at) < DATE_SUB(NOW(), INTERVAL 7 DAY)) AS stale
     FROM leads WHERE account_id = ? AND deleted_at IS NULL AND archived_at IS NULL`,
    [accountId]
  );
  const [funnel] = await query(
    `SELECT stage, COUNT(*) AS total FROM leads WHERE account_id = ? AND deleted_at IS NULL AND archived_at IS NULL GROUP BY stage`,
    [accountId]
  );
  const [weekly] = await query(
    `SELECT DATE_FORMAT(DATE_SUB(DATE(created_at), INTERVAL WEEKDAY(created_at) DAY), '%Y-%m-%d') AS week_start, COUNT(*) AS total
     FROM leads WHERE account_id = ? AND deleted_at IS NULL AND created_at >= DATE_SUB(CURDATE(), INTERVAL 7 WEEK)
     GROUP BY week_start ORDER BY week_start`,
    [accountId]
  );
  const [[caseStats]] = await query(
    `SELECT COUNT(*) AS total, SUM(status = 'ativo') AS active,
            COALESCE(SUM(CASE WHEN status = 'ativo' THEN cause_value END), 0) AS active_value,
            SUM(status = 'ativo' AND NOT EXISTS (SELECT 1 FROM tasks t WHERE t.case_id = cases.id AND t.is_deadline = 1 AND t.completed_at IS NULL)) AS active_no_deadline
     FROM cases WHERE account_id = ? AND deleted_at IS NULL`,
    [accountId]
  );
  const [byArea] = await query(
    `SELECT COALESCE(NULLIF(area, ''), 'Sem área') AS area, COUNT(*) AS total
     FROM cases WHERE account_id = ? AND deleted_at IS NULL AND status = 'ativo'
     GROUP BY 1 ORDER BY total DESC LIMIT 6`,
    [accountId]
  );
  const [[taskStats]] = await query(
    `SELECT COUNT(*) AS pending FROM tasks WHERE account_id = ? AND completed_at IS NULL AND is_deadline = 0`,
    [accountId]
  );
  // Honorários: campo personalizado "honorarios" do lead — previsto (em proposta) × fechado (convertido).
  const [fees] = await query(
    `SELECT l.stage, COALESCE(SUM(v.value_number), 0) AS total
     FROM lead_field_values v
     JOIN field_definitions f ON f.id = v.field_definition_id AND f.name = 'honorarios'
     JOIN leads l ON l.id = v.lead_id
     WHERE l.account_id = ? AND l.deleted_at IS NULL AND l.archived_at IS NULL AND l.stage IN ('proposta','convertido')
     GROUP BY l.stage`,
    [accountId]
  );
  const fee = (stage) => Number(fees.find(r => r.stage === stage)?.total || 0);

  const [stale] = await query(
    `SELECT id, name, stage, COALESCE(last_contact_at, updated_at, created_at) AS last_touch
     FROM leads WHERE account_id = ? AND deleted_at IS NULL AND archived_at IS NULL AND stage IN ${OPEN_STAGES}
       AND COALESCE(last_contact_at, updated_at, created_at) < DATE_SUB(NOW(), INTERVAL 7 DAY)
     ORDER BY last_touch ASC LIMIT 5`,
    [accountId]
  );
  const [convertedNoCase] = await query(
    `SELECT id, name FROM leads l WHERE account_id = ? AND deleted_at IS NULL AND archived_at IS NULL AND stage = 'convertido'
       AND NOT EXISTS (SELECT 1 FROM cases c WHERE c.lead_id = l.id AND c.deleted_at IS NULL)
     ORDER BY updated_at DESC LIMIT 5`,
    [accountId]
  );

  const n = (v) => Number(v || 0);
  const total = n(leadStats.total);
  return {
    alerts: { counts: alerts.counts, overdue: alerts.overdue.slice(0, 5), today: alerts.today.slice(0, 5), upcoming: alerts.upcoming.slice(0, 8) },
    leads: {
      total, new_30d: n(leadStats.new_30d), converted: n(leadStats.converted),
      conversion_rate: total ? Math.round((n(leadStats.converted) / total) * 100) : 0,
      stale: n(leadStats.stale), converted_no_case: n(leadStats.converted_no_case),
      funnel, weekly, stale_list: stale, converted_no_case_list: convertedNoCase,
    },
    cases: { total: n(caseStats.total), active: n(caseStats.active), active_value: n(caseStats.active_value), active_no_deadline: n(caseStats.active_no_deadline), by_area: byArea },
    tasks: { pending: n(taskStats.pending) },
    fees: { projected: fee('proposta'), closed: fee('convertido') },
  };
}

module.exports = { overview };

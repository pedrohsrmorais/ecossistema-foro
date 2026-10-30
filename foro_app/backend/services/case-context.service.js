/**
 * case-context.service.js — visão compacta e fundamentada de um processo para a IA.
 * Inclui as referências legais CURADAS da área: são as únicas que a IA pode citar.
 */
const casesService = require('./cases.service');
const areas = require('../configs/legal-areas');
const partiesService = require('./case-parties.service');

const d10 = (v) => (v ? new Date(v).toISOString().slice(0, 10) : null);

async function build(caseId, accountId) {
  const c = await casesService.getById(caseId, accountId);
  const area = areas.get(c.area_key);
  return {
    id: c.id, title: c.title, case_number: c.case_number, tribunal: c.tribunal_name || c.tribunal, comarca: c.comarca, vara: c.vara, magistrate: c.magistrate,
    area: { key: c.area_key, label: c.area_label }, stage: c.stage_label, status: c.status, phase: c.phase, cause_value: c.cause_value,
    client_role: c.client_role, opposing_party: c.opposing_party, responsible: c.responsible_name,
    area_details: areas.describeDetails(c.area_key, c.details) || '(nenhum dado específico da área preenchido)',
    missing_area_fields: c.missing_fields,
    parties: c.parties.map(p => ({ id: p.id, name: p.name, role: partiesService.ROLES[p.role] || p.role, responsible: p.responsible_name || null })),
    team: c.members.map(m => ({ name: m.name, role: m.role })),
    recent_updates: c.updates.slice(0, 8).map(u => ({ date: d10(u.update_date), text: String(u.text || '').slice(0, 400) })),
    open_tasks: c.tasks.filter(t => !t.completed_at).slice(0, 10).map(t => ({ description: t.description, due: d10(t.due_date), is_deadline: !!t.is_deadline })),
    upcoming_events: c.events.filter(e => new Date(e.starts_at) >= new Date()).slice(0, 5).map(e => ({ title: e.title, type: e.type, at: e.starts_at })),
    documents: c.documents.map(x => ({ title: x.title, status: x.status })),
    area_guidance: area.guidance || null,
    legal_refs_allowed: area.refs,
  };
}

module.exports = { build };

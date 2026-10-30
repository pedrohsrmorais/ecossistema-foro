import type { AlertKind } from '../api'

export const ALERT_KIND: Record<AlertKind, { label: string; pill: string }> = {
  prazo:     { label: 'Prazo',      pill: 'bg-red-100 text-red-700' },
  tarefa:    { label: 'Tarefa',     pill: 'bg-slate-100 text-slate-600' },
  audiencia: { label: 'Audiência',  pill: 'bg-purple-100 text-purple-700' },
  pericia:   { label: 'Perícia',    pill: 'bg-amber-100 text-amber-700' },
  reuniao:   { label: 'Reunião',    pill: 'bg-sky-100 text-sky-700' },
  evento:    { label: 'Compromisso', pill: 'bg-slate-100 text-slate-600' },
}

/** "vencido há 2 dias" · "hoje" · "amanhã" · "em 3 dias" */
export function relDays(days: number): string {
  if (days < 0) return `vencido há ${-days} dia${days === -1 ? '' : 's'}`
  if (days === 0) return 'hoje'
  if (days === 1) return 'amanhã'
  return `em ${days} dias`
}

export const alertLink = (a: { case_id: string | null; lead_id: string | null }) =>
  a.case_id ? `/processos/${a.case_id}` : a.lead_id ? `/leads/${a.lead_id}` : '/tasks'

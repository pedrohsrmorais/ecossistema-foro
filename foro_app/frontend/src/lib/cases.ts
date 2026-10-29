import type { CaseStatus, CrmEvent } from '../api'

export const CASE_STATUSES: { key: CaseStatus; label: string; bar: string; pill: string }[] = [
  { key: 'ativo',      label: 'Ativos',     bar: 'bg-green-500',  pill: 'bg-green-100 text-green-700' },
  { key: 'suspenso',   label: 'Suspensos',  bar: 'bg-amber-500',  pill: 'bg-amber-100 text-amber-700' },
  { key: 'arquivado',  label: 'Arquivados', bar: 'bg-slate-400',  pill: 'bg-slate-100 text-slate-600' },
  { key: 'encerrado',  label: 'Encerrados', bar: 'bg-brand-600',  pill: 'bg-brand-100 text-brand-700' },
]
export const caseStatus = (k: string) => CASE_STATUSES.find(s => s.key === k) ?? CASE_STATUSES[0]

export const EVENT_TYPES: Record<CrmEvent['type'], { label: string; pill: string }> = {
  reuniao:   { label: 'Reunião',   pill: 'bg-sky-100 text-sky-700' },
  audiencia: { label: 'Audiência', pill: 'bg-purple-100 text-purple-700' },
  pericia:   { label: 'Perícia',   pill: 'bg-amber-100 text-amber-700' },
  outro:     { label: 'Outro',     pill: 'bg-slate-100 text-slate-600' },
}

export const fmtDate = (v: string | null | undefined) => (v ? new Date(v).toLocaleDateString('pt-BR') : '—')
export const fmtTime = (v: string) => new Date(v).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

// Etapas do funil — mesmos códigos validados no backend (leads.service.js::VALID_STAGES)
export const STAGES = [
  { key: 'novo',       label: 'Novo',       bar: 'bg-sky-500',    pill: 'bg-sky-100 text-sky-700' },
  { key: 'em_contato', label: 'Em contato', bar: 'bg-amber-500',  pill: 'bg-amber-100 text-amber-700' },
  { key: 'proposta',   label: 'Proposta',   bar: 'bg-purple-500', pill: 'bg-purple-100 text-purple-700' },
  { key: 'convertido', label: 'Convertido', bar: 'bg-green-500',  pill: 'bg-green-100 text-green-700' },
  { key: 'encerrado',  label: 'Encerrado',  bar: 'bg-slate-400',  pill: 'bg-slate-100 text-slate-500' },
] as const

export const stageOf = (k: string) => STAGES.find(s => s.key === k) ?? STAGES[0]

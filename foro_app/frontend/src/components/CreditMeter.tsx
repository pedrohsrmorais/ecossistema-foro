import { useQuery } from '@tanstack/react-query'
import { Zap } from 'lucide-react'
import clsx from 'clsx'
import { aiApi } from '../api'

/** Medidor dos créditos de IA da semana + a regra tokens → créditos, sempre visível. */
export default function CreditMeter({ variant = 'dark' }: { variant?: 'dark' | 'light' }) {
  const { data } = useQuery({ queryKey: ['ai-credits'], queryFn: aiApi.getCredits, staleTime: 60_000 })
  if (!data) return null
  const dark = variant === 'dark'

  if (data.has_plan === false) {
    return (
      <div className={clsx('rounded-md px-3 py-2.5 text-xs', dark ? 'bg-white/5 text-brand-200' : 'bg-slate-50 border text-slate-600')}>
        <span className="flex items-center gap-1 font-medium"><Zap className="w-3 h-3 text-accent-400" /> Créditos IA</span>
        <p className="mt-1">Sem plano — peça ao administrador para contratar um para você.</p>
      </div>
    )
  }
  const pct = data.weekly_limit ? Math.min(100, (data.used / data.weekly_limit) * 100) : 100
  const low = data.remaining <= data.weekly_limit * 0.1
  const renews = new Date(data.renews_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  const fmt = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })

  return (
    <div
      className={clsx('rounded-md px-3 py-2.5', dark ? 'bg-white/5' : 'bg-slate-50 border')}
      title={`1 crédito = ${data.rule.tokens_per_credit.toLocaleString('pt-BR')} tokens de entrada ou ${data.rule.tokens_per_credit / data.rule.output_weight} tokens de saída. Créditos = (tokens de entrada + ${data.rule.output_weight} × tokens de saída) ÷ ${data.rule.tokens_per_credit.toLocaleString('pt-BR')}.`}
    >
      <div className={clsx('flex items-center justify-between text-xs mb-1.5', dark ? 'text-brand-200' : 'text-slate-600')}>
        <span className="flex items-center gap-1 font-medium"><Zap className="w-3 h-3 text-accent-400" /> Créditos IA</span>
        <span className="tabular-nums">{fmt(data.remaining)} / {fmt(data.weekly_limit)}</span>
      </div>
      <div className={clsx('h-1.5 rounded-full overflow-hidden', dark ? 'bg-white/10' : 'bg-slate-200')}>
        <div className={clsx('h-full rounded-full transition-all', low ? 'bg-red-400' : 'bg-accent-400')} style={{ width: `${100 - pct}%` }} />
      </div>
      <p className={clsx('text-[11px] mt-1.5', dark ? 'text-brand-300' : 'text-slate-400')}>Renova em {renews}</p>
    </div>
  )
}

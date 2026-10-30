import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Bell, AlertTriangle } from 'lucide-react'
import clsx from 'clsx'
import { alertsApi, type AlertItem } from '../api'
import { ALERT_KIND, alertLink, relDays } from '../lib/alerts'
import { fmtDate, fmtTime } from '../lib/cases'

/** Sino da barra lateral: vencidos (vermelho) e para hoje (âmbar). Atualiza a cada 5 min. */
export default function AlertsBell() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const { data } = useQuery({ queryKey: ['alerts'], queryFn: alertsApi.summary, refetchInterval: 5 * 60_000, staleTime: 60_000 })

  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', h); document.addEventListener('keydown', k)
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', k) }
  }, [open])

  const c = data?.counts
  const badge = (c?.overdue ?? 0) + (c?.today ?? 0)
  const red = (c?.overdue ?? 0) > 0

  const Row = ({ a }: { a: AlertItem }) => (
    <li>
      <Link to={alertLink(a)} onClick={() => setOpen(false)} className="flex items-start gap-2 px-3 py-2 hover:bg-slate-50">
        <span className={clsx('badge !py-0 mt-0.5 shrink-0', ALERT_KIND[a.kind].pill)}>{ALERT_KIND[a.kind].label}</span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm text-slate-800 truncate">{a.title}</span>
          <span className="block text-xs text-slate-500 truncate">{[a.case_label, a.lead_name].filter(Boolean).join(' · ') || fmtDate(a.at)}</span>
        </span>
        <span className={clsx('text-xs whitespace-nowrap', a.days < 0 ? 'text-red-600 font-medium' : a.days === 0 ? 'text-amber-700 font-medium' : 'text-slate-500')}>
          {relDays(a.days)}{a.kind !== 'prazo' && a.kind !== 'tarefa' ? ` · ${fmtTime(a.at)}` : ''}
        </span>
      </Link>
    </li>
  )
  const Block = ({ title, items, tone }: { title: string; items: AlertItem[]; tone: string }) => !items.length ? null : (
    <div>
      <p className={clsx('px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide', tone)}>{title} ({items.length})</p>
      <ul>{items.slice(0, 6).map(a => <Row key={a.kind + a.id} a={a} />)}</ul>
    </div>
  )

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(o => !o)} aria-label="Prazos e alertas" aria-expanded={open}
        className="relative p-1.5 rounded-md text-brand-300 hover:text-white hover:bg-white/10">
        <Bell className="w-5 h-5" />
        {badge > 0 && (
          <span className={clsx('absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold flex items-center justify-center text-white', red ? 'bg-red-500' : 'bg-amber-500')}>
            {badge > 9 ? '9+' : badge}
          </span>
        )}
      </button>
      {open && (
        <div className="fixed left-4 top-16 w-[360px] max-w-[calc(100vw-2rem)] max-h-[70vh] overflow-y-auto bg-white rounded-xl shadow-xl border z-50" role="dialog" aria-label="Prazos e alertas">
          <div className="px-3 py-2.5 border-b flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <p className="text-sm font-semibold text-slate-900 flex-1">Prazos e compromissos</p>
            <Link to="/dashboard" onClick={() => setOpen(false)} className="text-xs text-brand-600 hover:underline">Painel</Link>
          </div>
          {!data || (c!.overdue + c!.today + c!.upcoming === 0) ? (
            <p className="px-3 py-6 text-sm text-slate-500 text-center">Nada vencido nem agendado para os próximos 7 dias. 🎉</p>
          ) : (
            <div className="pb-2">
              <Block title="Vencidos" items={data.overdue} tone="text-red-600" />
              <Block title="Hoje" items={data.today} tone="text-amber-700" />
              <Block title="Próximos 7 dias" items={data.upcoming} tone="text-slate-500" />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

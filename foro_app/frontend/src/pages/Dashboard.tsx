import { useQuery } from '@tanstack/react-query'
import { leadsApi, tasksApi, eventsApi, casesApi } from '../api'
import { Users, CheckSquare, TrendingUp, Briefcase, Video } from 'lucide-react'
import { EVENT_TYPES, fmtDate, fmtTime } from '../lib/cases'
import { Link } from 'react-router-dom'
import { STAGES } from '../lib/stages'
import CreditMeter from '../components/CreditMeter'

export default function Dashboard() {
  const { data: funnel = [] } = useQuery({
    queryKey: ['funnel'],
    queryFn: () => leadsApi.getFunnelSummary(),
  })

  const { data: tasks = [] } = useQuery({
    queryKey: ['tasks-pending'],
    queryFn: () => tasksApi.listAll({ pending_only: true, limit: 5 }),
  })

  const { data: events = [] } = useQuery({
    queryKey: ['events', 'next'],
    queryFn: () => eventsApi.list({ from: new Date().toISOString(), to: new Date(Date.now() + 14 * 864e5).toISOString() }),
  })
  const { data: cases } = useQuery({ queryKey: ['cases', 'all'], queryFn: () => casesApi.list() })
  const activeCases = (cases?.data ?? []).filter(c => c.status === 'ativo')
  const deadlines = activeCases.filter(c => c.next_deadline).sort((a, b) => +new Date(a.next_deadline!) - +new Date(b.next_deadline!)).slice(0, 5)

  const total = funnel.reduce((acc: number, s: any) => acc + s.total, 0)
  const converted = funnel.find((s: any) => s.stage === 'convertido')?.total || 0

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold text-slate-900 mb-6">Painel</h1>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="card p-4 flex gap-3 items-center">
          <div className="w-10 h-10 rounded-lg bg-brand-100 flex items-center justify-center">
            <Users className="w-5 h-5 text-brand-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-900">{total}</p>
            <p className="text-sm text-slate-500">Total de leads</p>
          </div>
        </div>
        <div className="card p-4 flex gap-3 items-center">
          <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
            <TrendingUp className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-900">{converted}</p>
            <p className="text-sm text-slate-500">Convertidos</p>
          </div>
        </div>
        <div className="card p-4 flex gap-3 items-center">
          <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
            <CheckSquare className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-900">{Array.isArray(tasks) ? tasks.length : 0}</p>
            <p className="text-sm text-slate-500">Tarefas pendentes</p>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4 mb-4">
        <div className="card p-5">
          <h2 className="font-medium text-slate-900 mb-3">Próximos compromissos</h2>
          {events.length === 0 ? <p className="text-sm text-slate-400">Nada agendado nos próximos 14 dias. <Link to="/agenda" className="text-brand-600 underline">Abrir agenda</Link></p> : (
            <ul className="divide-y">
              {events.slice(0, 5).map(e => (
                <li key={e.id} className="flex items-center gap-2 py-2 text-sm">
                  <span className={`badge !py-0 ${EVENT_TYPES[e.type].pill}`}>{EVENT_TYPES[e.type].label}</span>
                  <span className="flex-1 truncate text-slate-800">{e.title}</span>
                  <span className="text-xs text-slate-500">{fmtDate(e.starts_at)} {fmtTime(e.starts_at)}</span>
                  {e.meeting_url && <a href={e.meeting_url} target="_blank" rel="noreferrer" className="text-brand-600"><Video className="w-4 h-4" /></a>}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="card p-5">
          <h2 className="font-medium text-slate-900 mb-3 flex items-center gap-1.5"><Briefcase className="w-4 h-4 text-slate-400" /> Prazos dos processos <span className="text-xs text-slate-400 font-normal">({activeCases.length} ativos)</span></h2>
          {deadlines.length === 0 ? <p className="text-sm text-slate-400">Nenhum prazo em aberto. <Link to="/processos" className="text-brand-600 underline">Ver processos</Link></p> : (
            <ul className="divide-y">
              {deadlines.map(c => (
                <li key={c.id} className="flex items-center gap-2 py-2 text-sm">
                  <Link to={`/processos/${c.id}`} className="flex-1 truncate font-mono text-slate-800 hover:underline">{c.case_number || c.title}</Link>
                  <span className="text-xs font-medium text-amber-700">{fmtDate(c.next_deadline)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_300px] gap-4">
      {/* Funil */}
      <div className="card p-5">
        <h2 className="font-medium text-slate-900 mb-4">Funil de leads</h2>
        {total === 0 ? (
          <p className="text-sm text-slate-400">Nenhum lead cadastrado ainda. Peça à IA ou adicione em <Link to="/leads" className="text-brand-600 underline">Leads</Link>.</p>
        ) : (
          <div className="space-y-3">
            {STAGES.map(st => {
              const n = funnel.find((f: any) => f.stage === st.key)?.total || 0
              return (
                <div key={st.key} className="flex items-center gap-3">
                  <span className="text-sm text-slate-600 w-28">{st.label}</span>
                  <div className="flex-1 bg-slate-100 rounded-full h-2.5 overflow-hidden">
                    <div className={`h-2.5 rounded-full transition-all ${st.bar}`} style={{ width: `${(n / total) * 100}%` }} />
                  </div>
                  <span className="text-sm font-medium text-slate-900 w-8 text-right">{n}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>
      <div className="space-y-4">
        <CreditMeter variant="light" />
        <Link to="/planos" className="btn-secondary w-full justify-center text-sm">Ver plano e créditos</Link>
      </div>
      </div>
    </div>
  )
}

import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { AlertTriangle, CalendarClock, Briefcase, Users, Banknote, UserX, FileWarning, Video } from 'lucide-react'
import clsx from 'clsx'
import { dashboardApi, type AlertItem } from '../api'
import { STAGES } from '../lib/stages'
import { ALERT_KIND, alertLink, relDays } from '../lib/alerts'
import { fmtDate, fmtTime } from '../lib/cases'
import CreditMeter from '../components/CreditMeter'

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const shortDate = (iso: string) => new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })

function Kpi({ icon: Icon, tone, value, label, sub, to }: { icon: typeof Users; tone: string; value: string | number; label: string; sub?: string; to?: string }) {
  const body = (
    <div className="card p-4 flex gap-3 items-center h-full hover:border-slate-300 transition-colors">
      <div className={clsx('w-10 h-10 rounded-lg flex items-center justify-center shrink-0', tone)}><Icon className="w-5 h-5" /></div>
      <div className="min-w-0">
        <p className="text-2xl font-bold text-slate-900 leading-tight">{value}</p>
        <p className="text-sm text-slate-500 truncate">{label}</p>
        {sub && <p className="text-xs text-slate-400 truncate">{sub}</p>}
      </div>
    </div>
  )
  return to ? <Link to={to}>{body}</Link> : body
}

function AlertRow({ a }: { a: AlertItem }) {
  const timed = a.kind !== 'prazo' && a.kind !== 'tarefa'
  return (
    <li>
      <Link to={alertLink(a)} className="flex items-center gap-2 py-2 text-sm hover:bg-slate-50 -mx-2 px-2 rounded">
        <span className={clsx('badge !py-0 shrink-0', ALERT_KIND[a.kind].pill)}>{ALERT_KIND[a.kind].label}</span>
        <span className="flex-1 min-w-0">
          <span className="block truncate text-slate-800">{a.title}</span>
          {(a.case_label || a.lead_name) && <span className="block truncate text-xs text-slate-500">{[a.case_label, a.lead_name].filter(Boolean).join(' · ')}</span>}
        </span>
        <span className={clsx('text-xs whitespace-nowrap text-right', a.days < 0 ? 'text-red-600 font-medium' : a.days === 0 ? 'text-amber-700 font-medium' : 'text-slate-500')}>
          {relDays(a.days)}<span className="block text-slate-400 font-normal">{fmtDate(a.at)}{timed ? ` ${fmtTime(a.at)}` : ''}</span>
        </span>
        {a.meeting_url && <Video className="w-4 h-4 text-brand-600 shrink-0" />}
      </Link>
    </li>
  )
}

export default function Dashboard() {
  const { data: d, isLoading, isError } = useQuery({ queryKey: ['dashboard'], queryFn: dashboardApi.get, refetchInterval: 5 * 60_000 })

  if (isLoading) return <div className="p-6 text-slate-400">Carregando painel…</div>
  if (isError || !d) return <div className="p-6 text-red-600">Não foi possível carregar o painel. Atualize a página.</div>

  const { alerts, leads, cases, fees } = d
  const urgent = [...alerts.overdue, ...alerts.today]
  const attention: { key: string; icon: typeof Users; text: string; to: string }[] = []
  if (leads.converted_no_case) attention.push({ key: 'cnc', icon: FileWarning, text: `${leads.converted_no_case} cliente${leads.converted_no_case > 1 ? 's convertidos' : ' convertido'} sem processo cadastrado`, to: '/leads' })
  if (cases.active_no_deadline) attention.push({ key: 'nod', icon: CalendarClock, text: `${cases.active_no_deadline} processo${cases.active_no_deadline > 1 ? 's ativos' : ' ativo'} sem nenhum prazo em aberto`, to: '/processos' })
  if (leads.stale) attention.push({ key: 'stale', icon: UserX, text: `${leads.stale} lead${leads.stale > 1 ? 's' : ''} sem contato há mais de 7 dias`, to: '/leads' })

  const totalLeads = leads.total
  const maxWeek = Math.max(1, ...leads.weekly.map(w => w.total))
  const maxArea = Math.max(1, ...cases.by_area.map(a => a.total))

  return (
    <div className="p-6 space-y-5">
      <h1 className="text-xl font-semibold text-slate-900">Painel</h1>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi icon={AlertTriangle} tone={alerts.counts.overdue ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'} value={alerts.counts.overdue}
          label="Prazos vencidos" sub={alerts.counts.today ? `${alerts.counts.today} para hoje` : 'nenhum para hoje'} to="/tasks" />
        <Kpi icon={CalendarClock} tone="bg-amber-100 text-amber-600" value={alerts.counts.upcoming + alerts.counts.today} label="Próximos 7 dias" sub="prazos, audiências e reuniões" to="/agenda" />
        <Kpi icon={Briefcase} tone="bg-brand-100 text-brand-600" value={cases.active} label="Processos ativos" sub={cases.active_value ? `${brl(cases.active_value)} em causa` : undefined} to="/processos" />
        <Kpi icon={Users} tone="bg-sky-100 text-sky-600" value={leads.new_30d} label="Leads novos (30 dias)" sub={`${leads.conversion_rate}% convertidos no total`} to="/leads" />
      </div>

      <div className="grid lg:grid-cols-[1fr_340px] gap-5">
        <div className="space-y-5">
          {/* Urgente */}
          <section className={clsx('card p-5', alerts.counts.overdue > 0 && 'border-red-200')}>
            <h2 className="font-medium text-slate-900 mb-2 flex items-center gap-1.5">
              <AlertTriangle className={clsx('w-4 h-4', alerts.counts.overdue ? 'text-red-500' : 'text-slate-400')} /> Atenção agora
              <span className="text-xs text-slate-400 font-normal">vencidos e de hoje</span>
            </h2>
            {urgent.length === 0 ? <p className="text-sm text-slate-500">Nada vencido nem para hoje. Bom trabalho!</p> : (
              <ul className="divide-y">{urgent.slice(0, 8).map(a => <AlertRow key={a.kind + a.id} a={a} />)}</ul>
            )}
            {urgent.length > 8 && <p className="text-xs text-slate-400 mt-2">E mais {urgent.length - 8}. Veja em <Link to="/tasks" className="text-brand-600 underline">Tarefas</Link>.</p>}
          </section>

          <section className="card p-5">
            <h2 className="font-medium text-slate-900 mb-2 flex items-center gap-1.5"><CalendarClock className="w-4 h-4 text-slate-400" /> Próximos 7 dias</h2>
            {alerts.upcoming.length === 0 ? <p className="text-sm text-slate-500">Nada agendado. <Link to="/agenda" className="text-brand-600 underline">Abrir agenda</Link></p> : (
              <ul className="divide-y">{alerts.upcoming.map(a => <AlertRow key={a.kind + a.id} a={a} />)}</ul>
            )}
          </section>

          {/* Funil */}
          <section className="card p-5">
            <h2 className="font-medium text-slate-900 mb-4">Funil de leads</h2>
            {totalLeads === 0 ? (
              <p className="text-sm text-slate-400">Nenhum lead cadastrado ainda. Peça à IA ou adicione em <Link to="/leads" className="text-brand-600 underline">Leads</Link>.</p>
            ) : (
              <div className="space-y-3">
                {STAGES.map(st => {
                  const n = leads.funnel.find(f => f.stage === st.key)?.total || 0
                  return (
                    <div key={st.key} className="flex items-center gap-3">
                      <span className="text-sm text-slate-600 w-24 sm:w-28">{st.label}</span>
                      <div className="flex-1 bg-slate-100 rounded-full h-2.5 overflow-hidden"><div className={`h-2.5 rounded-full ${st.bar}`} style={{ width: `${(n / totalLeads) * 100}%` }} /></div>
                      <span className="text-sm font-medium text-slate-900 w-8 text-right">{n}</span>
                    </div>
                  )
                })}
              </div>
            )}
            {leads.weekly.length > 1 && (
              <div className="mt-5 pt-4 border-t">
                <p className="text-xs text-slate-500 mb-2">Leads novos por semana</p>
                <div className="flex items-end gap-2 h-16">
                  {leads.weekly.map(w => (
                    <div key={w.week_start} className="flex-1 flex flex-col items-center justify-end h-full" title={`Semana de ${shortDate(w.week_start)}: ${w.total}`}>
                      <span className="text-[10px] text-slate-500">{w.total}</span>
                      <div className="w-full bg-sky-400 rounded-t" style={{ height: `${Math.max(4, (w.total / maxWeek) * 40)}px` }} />
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 mt-1">{leads.weekly.map(w => <span key={w.week_start} className="flex-1 text-center text-[10px] text-slate-400">{shortDate(w.week_start)}</span>)}</div>
              </div>
            )}
          </section>
        </div>

        <div className="space-y-5">
          <section className="card p-5">
            <h2 className="font-medium text-slate-900 mb-3">Precisa de atenção</h2>
            {attention.length === 0 ? <p className="text-sm text-slate-500">Tudo em dia por aqui.</p> : (
              <ul className="space-y-2">
                {attention.map(a => (
                  <li key={a.key}>
                    <Link to={a.to} className="flex items-start gap-2 text-sm text-slate-700 hover:text-slate-900 p-2 -mx-2 rounded hover:bg-slate-50">
                      <a.icon className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />{a.text}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {leads.converted_no_case_list.length > 0 && (
              <p className="text-xs text-slate-500 mt-3">Sem processo: {leads.converted_no_case_list.map((l, i) => (
                <span key={l.id}>{i > 0 && ', '}<Link to={`/leads/${l.id}`} className="text-brand-700 hover:underline">{l.name || 'Sem nome'}</Link></span>
              ))}</p>
            )}
          </section>

          <section className="card p-5">
            <h2 className="font-medium text-slate-900 mb-3 flex items-center gap-1.5"><Briefcase className="w-4 h-4 text-slate-400" /> Processos por área</h2>
            {cases.by_area.length === 0 ? <p className="text-sm text-slate-400">Nenhum processo ativo.</p> : (
              <ul className="space-y-2.5">
                {cases.by_area.map(a => (
                  <li key={a.area} className="flex items-center gap-2 text-sm">
                    <span className="w-28 truncate text-slate-600" title={a.area}>{a.area}</span>
                    <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden"><div className="h-2 rounded-full bg-brand-500" style={{ width: `${(a.total / maxArea) * 100}%` }} /></div>
                    <span className="w-6 text-right font-medium text-slate-900">{a.total}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {(fees.projected > 0 || fees.closed > 0) && (
            <section className="card p-5">
              <h2 className="font-medium text-slate-900 mb-3 flex items-center gap-1.5"><Banknote className="w-4 h-4 text-slate-400" /> Honorários</h2>
              <dl className="text-sm space-y-2">
                <div className="flex justify-between"><dt className="text-slate-500">Fechados (convertidos)</dt><dd className="font-semibold text-green-700">{brl(fees.closed)}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">Em proposta</dt><dd className="font-semibold text-slate-900">{brl(fees.projected)}</dd></div>
              </dl>
              <p className="text-xs text-slate-400 mt-2">Soma do campo “Honorários (R$)” dos leads.</p>
            </section>
          )}

          <CreditMeter variant="light" />
          <Link to="/planos" className="btn-secondary w-full justify-center text-sm">Ver plano e créditos</Link>
        </div>
      </div>
    </div>
  )
}

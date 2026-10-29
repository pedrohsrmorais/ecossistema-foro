import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Plus, Video, MapPin, Trash2, Check, Ban } from 'lucide-react'
import clsx from 'clsx'
import { eventsApi, type CrmEvent } from '../api'
import EventForm from '../components/EventForm'
import { EVENT_TYPES, fmtTime } from '../lib/cases'

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)

export default function Agenda() {
  const qc = useQueryClient()
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })
  const [showForm, setShowForm] = useState(false)

  const from = month
  const to = new Date(month.getFullYear(), month.getMonth() + 1, 1)
  const { data: events = [], isLoading } = useQuery({
    queryKey: ['events', from.toISOString()],
    queryFn: () => eventsApi.list({ from: from.toISOString(), to: to.toISOString() }),
  })

  const refresh = () => qc.invalidateQueries({ queryKey: ['events'] })
  const setStatus = useMutation({ mutationFn: ({ id, status }: { id: string; status: CrmEvent['status'] }) => eventsApi.update(id, { status }), onSuccess: refresh })
  const remove = useMutation({ mutationFn: (id: string) => eventsApi.remove(id), onSuccess: refresh })

  const days = useMemo(() => {
    const g = new Map<string, CrmEvent[]>()
    for (const e of events) {
      const k = new Date(e.starts_at).toLocaleDateString('en-CA') // AAAA-MM-DD no fuso local
      g.set(k, [...(g.get(k) || []), e])
    }
    return [...g.entries()]
  }, [events])

  const today = new Date().toLocaleDateString('en-CA')
  const title = month.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  const shift = (n: number) => setMonth(m => new Date(m.getFullYear(), m.getMonth() + n, 1))

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Agenda</h1>
          <p className="text-sm text-slate-500">Reuniões, audiências e perícias — com o link na mão</p>
        </div>
        <button className="btn-primary text-sm" onClick={() => setShowForm(true)}><Plus className="w-4 h-4" /> Novo compromisso</button>
      </div>

      <div className="flex items-center gap-2 mb-4">
        <button className="btn-secondary !px-2" onClick={() => shift(-1)}><ChevronLeft className="w-4 h-4" /></button>
        <h2 className="font-medium text-slate-900 w-48 text-center">{cap(title)}</h2>
        <button className="btn-secondary !px-2" onClick={() => shift(1)}><ChevronRight className="w-4 h-4" /></button>
        <button className="btn-ghost text-sm" onClick={() => { const d = new Date(); setMonth(new Date(d.getFullYear(), d.getMonth(), 1)) }}>Hoje</button>
      </div>

      {isLoading ? <div className="card p-8 text-center text-slate-400">Carregando…</div>
        : days.length === 0 ? (
          <div className="card p-10 text-center">
            <p className="text-slate-600 mb-1">Nada agendado neste mês.</p>
            <p className="text-sm text-slate-400">Clique em “Novo compromisso” ou peça à IA: “agenda reunião com a Maria amanhã às 15h”.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {days.map(([day, list]) => {
              const d = new Date(day + 'T12:00:00')
              return (
                <section key={day} className="card overflow-hidden">
                  <div className={clsx('flex items-center gap-2 px-4 py-2 border-b text-sm', day === today ? 'bg-accent-50 text-accent-800' : 'bg-slate-50 text-slate-600')}>
                    <span className="font-semibold">{cap(d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }))}</span>
                    {day === today && <span className="badge bg-accent-500 text-white">Hoje</span>}
                  </div>
                  <ul className="divide-y">
                    {list.map(e => (
                      <li key={e.id} className={clsx('group flex items-start gap-3 px-4 py-3', e.status !== 'agendado' && 'opacity-60')}>
                        <div className="w-24 shrink-0 text-sm tabular-nums text-slate-700">
                          {fmtTime(e.starts_at)}{e.ends_at && <span className="text-slate-400"> – {fmtTime(e.ends_at)}</span>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={clsx('badge !py-0', EVENT_TYPES[e.type].pill)}>{EVENT_TYPES[e.type].label}</span>
                            <span className={clsx('font-medium text-slate-900', e.status === 'cancelado' && 'line-through')}>{e.title}</span>
                            {e.status === 'realizado' && <span className="badge bg-green-100 text-green-700 !py-0">Realizado</span>}
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5 flex gap-3 flex-wrap">
                            {e.lead_name && e.lead_id && <Link to={`/leads/${e.lead_id}`} className="text-brand-600 hover:underline">{e.lead_name}</Link>}
                            {e.case_id && <Link to={`/processos/${e.case_id}`} className="text-brand-600 hover:underline font-mono">{e.case_number || e.case_title}</Link>}
                            {e.location && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{e.location}</span>}
                          </p>
                        </div>
                        {e.meeting_url && e.status === 'agendado' && (
                          <a href={e.meeting_url} target="_blank" rel="noreferrer" className="btn-primary !py-1.5 !px-3 text-xs shrink-0"><Video className="w-3.5 h-3.5" /> Entrar</a>
                        )}
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                          {e.status === 'agendado' && <button title="Marcar como realizado" onClick={() => setStatus.mutate({ id: e.id, status: 'realizado' })} className="p-1 text-slate-400 hover:text-green-600"><Check className="w-4 h-4" /></button>}
                          {e.status === 'agendado' && <button title="Cancelar" onClick={() => setStatus.mutate({ id: e.id, status: 'cancelado' })} className="p-1 text-slate-400 hover:text-amber-600"><Ban className="w-4 h-4" /></button>}
                          <button title="Excluir" onClick={() => confirm('Excluir este compromisso?') && remove.mutate(e.id)} className="p-1 text-slate-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              )
            })}
          </div>
        )}
      {showForm && <EventForm onClose={() => setShowForm(false)} />}
    </div>
  )
}

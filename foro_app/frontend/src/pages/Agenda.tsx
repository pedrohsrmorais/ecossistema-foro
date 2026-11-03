import { useState, useMemo, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Plus, Video, MapPin, Trash2, Check, Ban, X, List, CalendarDays } from 'lucide-react'
import clsx from 'clsx'
import { eventsApi, type CrmEvent } from '../api'
import EventForm from '../components/EventForm'
import { EVENT_TYPES, fmtTime } from '../lib/cases'

type View = 'lista' | 'mes' | 'semana' | 'dia'
const VIEWS: { id: View; label: string }[] = [
  { id: 'lista', label: 'Lista' }, { id: 'mes', label: 'Mês' }, { id: 'semana', label: 'Semana' }, { id: 'dia', label: 'Dia' },
]
const HOUR_PX = 48
const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const CHIP: Record<CrmEvent['type'], string> = {
  reuniao: 'bg-sky-100 border-sky-500 text-sky-900',
  audiencia: 'bg-purple-100 border-purple-500 text-purple-900',
  pericia: 'bg-amber-100 border-amber-500 text-amber-900',
  outro: 'bg-slate-100 border-slate-400 text-slate-800',
}

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)
const ymd = (d: Date) => d.toLocaleDateString('en-CA') // AAAA-MM-DD no fuso local
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const startOfWeek = (d: Date) => addDays(startOfDay(d), -d.getDay())
const pad = (n: number) => String(n).padStart(2, '0')
const hhmm = (mins: number) => `${pad(Math.floor(mins / 60) % 24)}:${pad(mins % 60)}`

function loadView(): View {
  try { const v = localStorage.getItem('foro.agenda.view'); if (v === 'lista' || v === 'mes' || v === 'semana' || v === 'dia') return v } catch { /* sem storage */ }
  return 'mes'
}

/** Posiciona eventos que se sobrepõem lado a lado (colunas). */
function layoutDay(list: CrmEvent[]) {
  const items = list.map(e => {
    const s = new Date(e.starts_at)
    const startMin = s.getHours() * 60 + s.getMinutes()
    const endRaw = e.ends_at ? new Date(e.ends_at) : null
    let endMin = endRaw ? (ymd(endRaw) === ymd(s) ? endRaw.getHours() * 60 + endRaw.getMinutes() : 24 * 60) : startMin + 60
    endMin = Math.max(endMin, startMin + 30)
    return { e, startMin, endMin, col: 0, cols: 1 }
  }).sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin)
  let cluster: typeof items = []
  let clusterEnd = -1
  const flush = () => { const n = Math.max(1, ...cluster.map(i => i.col + 1)); cluster.forEach(i => { i.cols = n }); cluster = [] }
  for (const it of items) {
    if (cluster.length && it.startMin >= clusterEnd) { flush(); clusterEnd = -1 }
    const used = new Set(cluster.filter(c => c.endMin > it.startMin).map(c => c.col))
    let col = 0; while (used.has(col)) col++
    it.col = col; cluster.push(it); clusterEnd = Math.max(clusterEnd, it.endMin)
  }
  flush()
  return items
}

export default function Agenda() {
  const qc = useQueryClient()
  const [view, setViewState] = useState<View>(loadView)
  const [cursor, setCursor] = useState(() => startOfDay(new Date()))
  const [form, setForm] = useState<null | { date?: string; start?: string; end?: string }>(null)
  const [detail, setDetail] = useState<CrmEvent | null>(null)
  const setView = (v: View) => { setViewState(v); try { localStorage.setItem('foro.agenda.view', v) } catch { /* sem storage */ } }

  // intervalo visível (mês: grade de 6 semanas completas; lista: o mês do cursor)
  const { from, to } = useMemo(() => {
    if (view === 'dia') return { from: startOfDay(cursor), to: addDays(startOfDay(cursor), 1) }
    if (view === 'semana') { const s = startOfWeek(cursor); return { from: s, to: addDays(s, 7) } }
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
    if (view === 'lista') return { from: first, to: new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1) }
    const s = startOfWeek(first); return { from: s, to: addDays(s, 42) }
  }, [view, cursor])

  const { data: events = [], isLoading } = useQuery({
    queryKey: ['events', view, from.toISOString()],
    queryFn: () => eventsApi.list({ from: from.toISOString(), to: to.toISOString() }),
  })

  const refresh = () => qc.invalidateQueries({ queryKey: ['events'] })
  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: CrmEvent['status'] }) => eventsApi.update(id, { status }),
    onSuccess: (_d, v) => { refresh(); setDetail(d => (d && d.id === v.id ? { ...d, status: v.status } : d)) },
  })
  const remove = useMutation({ mutationFn: (id: string) => eventsApi.remove(id), onSuccess: () => { refresh(); setDetail(null) } })

  const byDay = useMemo(() => {
    const g = new Map<string, CrmEvent[]>()
    for (const e of events) { const k = ymd(new Date(e.starts_at)); g.set(k, [...(g.get(k) || []), e]) }
    for (const l of g.values()) l.sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    return g
  }, [events])

  const today = ymd(new Date())
  const shift = (n: number) => setCursor(c =>
    view === 'dia' ? addDays(c, n) : view === 'semana' ? addDays(c, 7 * n) : new Date(c.getFullYear(), c.getMonth() + n, 1))

  const title = (() => {
    if (view === 'dia') return cap(cursor.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }))
    if (view === 'semana') {
      const a = startOfWeek(cursor), b = addDays(a, 6)
      const fmt = (d: Date, y = false) => d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', ...(y ? { year: 'numeric' } : {}) })
      return `${fmt(a)} – ${fmt(b, true)}`
    }
    return cap(cursor.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }))
  })()

  const openNew = (date?: string, start?: string, end?: string) => setForm({ date, start, end })
  const goDay = (d: Date) => { setCursor(startOfDay(d)); setView('dia') }

  return (
    <div className={clsx('p-4 sm:p-6', view === 'lista' ? 'max-w-4xl' : 'max-w-6xl')}>
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Agenda</h1>
          <p className="text-sm text-slate-500">Reuniões, audiências e perícias — com o link na mão</p>
        </div>
        <button className="btn-primary text-sm" onClick={() => openNew(view === 'lista' || view === 'mes' ? undefined : ymd(cursor))}><Plus className="w-4 h-4" /> Novo compromisso</button>
      </div>

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="flex items-center gap-1">
          <button className="btn-secondary !px-2" onClick={() => shift(-1)} aria-label="Anterior"><ChevronLeft className="w-4 h-4" /></button>
          <button className="btn-secondary !px-2" onClick={() => shift(1)} aria-label="Próximo"><ChevronRight className="w-4 h-4" /></button>
          <button className="btn-ghost text-sm" onClick={() => setCursor(startOfDay(new Date()))}>Hoje</button>
        </div>
        <h2 className="font-medium text-slate-900 flex-1 min-w-[10rem]" data-testid="agenda-title">{title}</h2>
        <div className="inline-flex rounded-lg border bg-white p-0.5" role="tablist">
          {VIEWS.map(v => (
            <button key={v.id} role="tab" aria-selected={view === v.id} data-testid={`agenda-view-${v.id}`} onClick={() => setView(v.id)}
              className={clsx('px-3 py-1 text-sm rounded-md font-medium flex items-center gap-1', view === v.id ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:text-slate-900')}>
              {v.id === 'lista' ? <List className="w-3.5 h-3.5" /> : v.id === 'mes' ? <CalendarDays className="w-3.5 h-3.5" /> : null}{v.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? <div className="card p-8 text-center text-slate-400">Carregando…</div>
        : view === 'lista' ? (
          <ListView byDay={byDay} today={today} onOpen={setDetail} onStatus={(id, status) => setStatus.mutate({ id, status })} onRemove={id => confirm('Excluir este compromisso?') && remove.mutate(id)} />
        ) : view === 'mes' ? (
          <MonthView cursor={cursor} from={from} byDay={byDay} today={today} onOpen={setDetail} onDay={goDay} onNew={d => openNew(d, '09:00', '10:00')} />
        ) : (
          <TimeGrid days={view === 'dia' ? [startOfDay(cursor)] : Array.from({ length: 7 }, (_, i) => addDays(from, i))}
            byDay={byDay} today={today} onOpen={setDetail} onDayClick={goDay}
            onSlot={(date, startMin) => openNew(date, hhmm(startMin), hhmm(startMin + 60))} />
        )}

      {!isLoading && events.length === 0 && view !== 'lista' && (
        <p className="text-xs text-slate-400 mt-3">Nada agendado neste período. Clique em um horário ou peça à IA: “agenda reunião com a Maria amanhã às 15h”.</p>
      )}

      {form && <EventForm onClose={() => setForm(null)} defaultDate={form.date} defaultStart={form.start} defaultEnd={form.end} />}
      {detail && (
        <EventDetail e={detail} onClose={() => setDetail(null)}
          onStatus={status => setStatus.mutate({ id: detail.id, status })}
          onRemove={() => confirm('Excluir este compromisso?') && remove.mutate(detail.id)} />
      )}
    </div>
  )
}

// ─── Lista (visão por dia, como antes) ───────────────────────────────────────

function ListView({ byDay, today, onOpen, onStatus, onRemove }: {
  byDay: Map<string, CrmEvent[]>; today: string; onOpen: (e: CrmEvent) => void
  onStatus: (id: string, s: CrmEvent['status']) => void; onRemove: (id: string) => void
}) {
  const days = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b))
  if (days.length === 0) return (
    <div className="card p-10 text-center">
      <p className="text-slate-600 mb-1">Nada agendado neste mês.</p>
      <p className="text-sm text-slate-400">Clique em “Novo compromisso” ou peça à IA: “agenda reunião com a Maria amanhã às 15h”.</p>
    </div>
  )
  return (
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
                <li key={e.id} data-testid="agenda-event" className={clsx('group flex items-start gap-3 px-4 py-3', e.status !== 'agendado' && 'opacity-60')}>
                  <div className="w-24 shrink-0 text-sm tabular-nums text-slate-700">
                    {fmtTime(e.starts_at)}{e.ends_at && <span className="text-slate-400"> – {fmtTime(e.ends_at)}</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={clsx('badge !py-0', EVENT_TYPES[e.type].pill)}>{EVENT_TYPES[e.type].label}</span>
                      <button className={clsx('font-medium text-slate-900 text-left hover:underline', e.status === 'cancelado' && 'line-through')} onClick={() => onOpen(e)}>{e.title}</button>
                      {e.status === 'realizado' && <span className="badge bg-green-100 text-green-700 !py-0">Realizado</span>}
                    </div>
                    <Links e={e} />
                  </div>
                  {e.meeting_url && e.status === 'agendado' && (
                    <a href={e.meeting_url} target="_blank" rel="noreferrer" className="btn-primary !py-1.5 !px-3 text-xs shrink-0"><Video className="w-3.5 h-3.5" /> Entrar</a>
                  )}
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity shrink-0">
                    {e.status === 'agendado' && <button title="Marcar como realizado" onClick={() => onStatus(e.id, 'realizado')} className="p-1 text-slate-400 hover:text-green-600"><Check className="w-4 h-4" /></button>}
                    {e.status === 'agendado' && <button title="Cancelar" onClick={() => onStatus(e.id, 'cancelado')} className="p-1 text-slate-400 hover:text-amber-600"><Ban className="w-4 h-4" /></button>}
                    <button title="Excluir" onClick={() => onRemove(e.id)} className="p-1 text-slate-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

function Links({ e }: { e: CrmEvent }) {
  return (
    <p className="text-xs text-slate-500 mt-0.5 flex gap-3 flex-wrap">
      {e.lead_name && e.lead_id && <Link to={`/crm-comercial/${e.lead_id}`} className="text-brand-600 hover:underline">{e.lead_name}</Link>}
      {e.case_id && <Link to={`/monitoramento-processual/${e.case_id}`} className="text-brand-600 hover:underline font-mono">{e.case_number || e.case_title}</Link>}
      {e.location && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{e.location}</span>}
    </p>
  )
}

// ─── Mês ─────────────────────────────────────────────────────────────────────

function MonthView({ cursor, from, byDay, today, onOpen, onDay, onNew }: {
  cursor: Date; from: Date; byDay: Map<string, CrmEvent[]>; today: string
  onOpen: (e: CrmEvent) => void; onDay: (d: Date) => void; onNew: (date: string) => void
}) {
  const cells = Array.from({ length: 42 }, (_, i) => addDays(from, i))
  return (
    <div className="card overflow-hidden" data-testid="agenda-month">
      <div className="grid grid-cols-7 bg-slate-50 border-b text-xs font-medium text-slate-500">
        {WEEKDAYS.map(w => <div key={w} className="px-2 py-1.5 text-center uppercase tracking-wide">{w}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {cells.map(d => {
          const k = ymd(d)
          const list = byDay.get(k) || []
          const out = d.getMonth() !== cursor.getMonth()
          return (
            <div key={k} data-testid="agenda-cell" data-date={k}
              className={clsx('group relative border-b border-r min-h-[5.5rem] sm:min-h-[7rem] p-1 min-w-0', out && 'bg-slate-50/60', (d.getDay() === 6) && 'border-r-0')}>
              <div className="flex items-center justify-between">
                <button onClick={() => onDay(d)} title="Ver o dia"
                  className={clsx('text-xs w-6 h-6 rounded-full flex items-center justify-center hover:bg-slate-200',
                    k === today ? 'bg-accent-500 text-white hover:bg-accent-600' : out ? 'text-slate-400' : 'text-slate-700')}>{d.getDate()}</button>
                <button onClick={() => onNew(k)} title="Novo compromisso neste dia" aria-label={`Novo compromisso em ${k}`}
                  className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-0.5 text-slate-400 hover:text-brand-600"><Plus className="w-3.5 h-3.5" /></button>
              </div>
              <div className="mt-0.5 space-y-0.5">
                {list.slice(0, 3).map(e => (
                  <button key={e.id} data-testid="agenda-event" onClick={() => onOpen(e)} title={`${fmtTime(e.starts_at)} ${e.title}`}
                    className={clsx('w-full text-left text-[11px] leading-tight rounded border-l-2 px-1 py-0.5 truncate block', CHIP[e.type], e.status !== 'agendado' && 'opacity-50', e.status === 'cancelado' && 'line-through')}>
                    <span className="tabular-nums hidden sm:inline">{fmtTime(e.starts_at)} </span>{e.title}
                  </button>
                ))}
                {list.length > 3 && <button onClick={() => onDay(d)} className="text-[11px] text-brand-600 hover:underline px-1">+{list.length - 3} mais</button>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Semana / Dia (grade de horários) ────────────────────────────────────────

function TimeGrid({ days, byDay, today, onOpen, onSlot, onDayClick }: {
  days: Date[]; byDay: Map<string, CrmEvent[]>; today: string
  onOpen: (e: CrmEvent) => void; onSlot: (date: string, startMin: number) => void; onDayClick: (d: Date) => void
}) {
  const scroller = useRef<HTMLDivElement>(null)
  const [now, setNow] = useState(() => new Date())
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(t) }, [])
  useEffect(() => { if (scroller.current) scroller.current.scrollTop = 7 * HOUR_PX }, [days.length])
  const single = days.length === 1
  const nowMin = now.getHours() * 60 + now.getMinutes()

  return (
    <div className="card overflow-hidden" data-testid="agenda-grid">
      <div ref={scroller} className="overflow-auto max-h-[70vh]">
        <div className={single ? '' : 'min-w-[44rem]'}>
          <div className="flex sticky top-0 z-20 bg-white border-b">
            <div className="w-12 shrink-0" />
            {days.map(d => {
              const k = ymd(d)
              return (
                <button key={k} onClick={() => !single && onDayClick(d)}
                  className={clsx('flex-1 min-w-0 py-1.5 text-center border-l text-xs', k === today ? 'text-accent-700 font-semibold' : 'text-slate-600', !single && 'hover:bg-slate-50')}>
                  <span className="uppercase tracking-wide">{WEEKDAYS[d.getDay()]}</span>{' '}
                  <span className={clsx('inline-flex w-6 h-6 items-center justify-center rounded-full text-sm', k === today && 'bg-accent-500 text-white')}>{d.getDate()}</span>
                </button>
              )
            })}
          </div>
          <div className="flex relative" style={{ height: 24 * HOUR_PX }}>
            <div className="w-12 shrink-0 relative">
              {Array.from({ length: 24 }, (_, h) => h).map(h => (
                <div key={h} className="absolute right-1 -translate-y-1/2 text-[10px] text-slate-400 tabular-nums" style={{ top: h * HOUR_PX }}>{h > 0 ? `${pad(h)}:00` : ''}</div>
              ))}
            </div>
            {days.map(d => {
              const k = ymd(d)
              const items = layoutDay(byDay.get(k) || [])
              return (
                <div key={k} data-testid="agenda-daycol" data-date={k} className="flex-1 min-w-0 border-l relative cursor-pointer"
                  onClick={ev => {
                    if (ev.target !== ev.currentTarget && !(ev.target as HTMLElement).dataset.slot) return
                    const y = ev.clientY - ev.currentTarget.getBoundingClientRect().top
                    onSlot(k, Math.min(23 * 60, Math.floor((y / HOUR_PX) * 2) * 30))
                  }}>
                  {Array.from({ length: 24 }, (_, h) => h).map(h => (
                    <div key={h} data-slot="1" className="absolute inset-x-0 border-t border-slate-100" style={{ top: h * HOUR_PX, height: HOUR_PX }} />
                  ))}
                  {items.map(({ e, startMin, endMin, col, cols }) => (
                    <button key={e.id} data-testid="agenda-event" onClick={ev => { ev.stopPropagation(); onOpen(e) }}
                      title={`${fmtTime(e.starts_at)} ${e.title}`}
                      className={clsx('absolute z-10 text-left text-[11px] leading-tight rounded border-l-4 px-1 py-0.5 overflow-hidden shadow-sm', CHIP[e.type], e.status !== 'agendado' && 'opacity-50')}
                      style={{ top: (startMin / 60) * HOUR_PX, height: Math.max(((endMin - startMin) / 60) * HOUR_PX - 2, 18), left: `calc(${(col / cols) * 100}% + 1px)`, width: `calc(${100 / cols}% - 3px)` }}>
                      <div className={clsx('font-medium truncate', e.status === 'cancelado' && 'line-through')}>{e.title}</div>
                      <div className="opacity-75 tabular-nums truncate">{fmtTime(e.starts_at)}{e.ends_at && ` – ${fmtTime(e.ends_at)}`}</div>
                    </button>
                  ))}
                  {k === today && (
                    <div className="absolute inset-x-0 z-10 pointer-events-none" style={{ top: (nowMin / 60) * HOUR_PX }}>
                      <div className="border-t-2 border-red-500 relative"><span className="absolute -left-1 -top-[5px] w-2 h-2 rounded-full bg-red-500" /></div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Detalhe do compromisso ──────────────────────────────────────────────────

function EventDetail({ e, onClose, onStatus, onRemove }: {
  e: CrmEvent; onClose: () => void; onStatus: (s: CrmEvent['status']) => void; onRemove: () => void
}) {
  const d = new Date(e.starts_at)
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="card w-full max-w-md p-5 animate-scale-in" onClick={ev => ev.stopPropagation()} data-testid="agenda-detail">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="min-w-0">
            <span className={clsx('badge !py-0', EVENT_TYPES[e.type].pill)}>{EVENT_TYPES[e.type].label}</span>
            <h2 className={clsx('font-semibold text-slate-900 mt-1 break-words', e.status === 'cancelado' && 'line-through')}>{e.title}</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700" aria-label="Fechar"><X className="w-4 h-4" /></button>
        </div>
        <p className="text-sm text-slate-600">
          {cap(d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }))}, {fmtTime(e.starts_at)}{e.ends_at && ` – ${fmtTime(e.ends_at)}`}
        </p>
        {e.status !== 'agendado' && <p className="mt-1"><span className={clsx('badge', e.status === 'realizado' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600')}>{e.status === 'realizado' ? 'Realizado' : 'Cancelado'}</span></p>}
        <Links e={e} />
        {e.notes && <p className="mt-3 text-sm text-slate-700 whitespace-pre-wrap">{e.notes}</p>}
        <div className="flex items-center gap-2 mt-4 flex-wrap">
          {e.meeting_url && e.status === 'agendado' && <a href={e.meeting_url} target="_blank" rel="noreferrer" className="btn-primary text-sm"><Video className="w-4 h-4" /> Entrar</a>}
          {e.status === 'agendado' && <button className="btn-secondary text-sm" onClick={() => onStatus('realizado')}><Check className="w-4 h-4" /> Realizado</button>}
          {e.status === 'agendado' && <button className="btn-secondary text-sm" onClick={() => onStatus('cancelado')}><Ban className="w-4 h-4" /> Cancelar</button>}
          {e.status !== 'agendado' && <button className="btn-secondary text-sm" onClick={() => onStatus('agendado')}>Reabrir</button>}
          <button className="btn-ghost text-sm text-red-600 ml-auto" onClick={onRemove}><Trash2 className="w-4 h-4" /> Excluir</button>
        </div>
      </div>
    </div>
  )
}

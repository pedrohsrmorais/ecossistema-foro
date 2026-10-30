import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Plus, CheckCircle2, Circle, Trash2, Sparkles, Briefcase, CalendarPlus, Video, ExternalLink } from 'lucide-react'
import clsx from 'clsx'
import { leadsApi, casesApi, eventsApi, type Task } from '../api'
import EventForm from '../components/EventForm'
import { EVENT_TYPES, fmtDate, fmtTime } from '../lib/cases'
import { EditableCell, StagePill } from '../components/crm'
import { useChat } from '../context/ChatContext'
import { stageOf } from '../lib/stages'

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_1fr] items-center gap-2 py-1.5 border-b last:border-0">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  )
}

export default function LeadDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { setOpen } = useChat()
  const [showEvent, setShowEvent] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [taskText, setTaskText] = useState('')
  const [taskDate, setTaskDate] = useState('')
  const [newCase, setNewCase] = useState('')
  const [linkId, setLinkId] = useState('')
  const [caseError, setCaseError] = useState('')

  const { data: lead, isLoading } = useQuery({ queryKey: ['lead', id], queryFn: () => leadsApi.getById(id!), enabled: !!id })
  const { data: notes = [] } = useQuery({ queryKey: ['lead-notes', id], queryFn: () => leadsApi.listNotes(id!), enabled: !!id })
  const { data: tasks = [] } = useQuery({ queryKey: ['lead-tasks', id], queryFn: () => leadsApi.listTasks(id!), enabled: !!id })

  const { data: cases } = useQuery({ queryKey: ['cases', 'lead', id], queryFn: () => casesApi.list({ lead_id: id }), enabled: !!id })
  const { data: unlinked } = useQuery({ queryKey: ['cases', 'unlinked'], queryFn: () => casesApi.list(), staleTime: 15_000 })
  const unlinkedCases = (unlinked?.data ?? []).filter(c => !c.lead_id && c.status !== 'arquivado' && c.status !== 'encerrado')
  const { data: events = [] } = useQuery({ queryKey: ['events', 'lead', id], queryFn: () => eventsApi.list({ lead_id: id, from: new Date(Date.now() - 864e5).toISOString() }), enabled: !!id })

  const refreshCases = () => { qc.invalidateQueries({ queryKey: ['cases'] }); qc.invalidateQueries({ queryKey: ['leads'] }) }
  const createCase = useMutation({
    mutationFn: (v: string) => {
      const digits = v.replace(/\D/g, '')
      return casesApi.create({ lead_id: id, ...(digits.length >= 15 ? { case_number: v } : { title: v }) })
    },
    onSuccess: () => { setNewCase(''); setCaseError(''); refreshCases() },
    onError: (e: any) => setCaseError(e?.response?.data?.error || 'Não foi possível cadastrar o processo.'),
  })
  const linkCase = useMutation({
    mutationFn: (caseId: string) => casesApi.update(caseId, { lead_id: id }),
    onSuccess: () => { setLinkId(''); setCaseError(''); refreshCases() },
    onError: (e: any) => setCaseError(e?.response?.data?.error || 'Não foi possível vincular.'),
  })
  const unlinkCase = useMutation({ mutationFn: (caseId: string) => casesApi.update(caseId, { lead_id: null }), onSuccess: refreshCases })

  const refreshLead = () => {
    qc.invalidateQueries({ queryKey: ['lead', id] })
    qc.invalidateQueries({ queryKey: ['leads'] })
    qc.invalidateQueries({ queryKey: ['funnel'] })
  }
  const update = useMutation({ mutationFn: (d: Record<string, unknown>) => leadsApi.update(id!, d), onSuccess: refreshLead })
  const move = useMutation({ mutationFn: (s: string) => leadsApi.moveStage(id!, s), onSuccess: refreshLead })
  const addNote = useMutation({
    mutationFn: (text: string) => leadsApi.addNote(id!, text),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['lead-notes', id] }); setNoteText('') },
  })
  const delNote = useMutation({
    mutationFn: (noteId: string) => leadsApi.deleteNote(id!, noteId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lead-notes', id] }),
  })
  const refreshTasks = () => { qc.invalidateQueries({ queryKey: ['lead-tasks', id] }); qc.invalidateQueries({ queryKey: ['tasks'] }); qc.invalidateQueries({ queryKey: ['tasks-pending'] }) }
  const addTask = useMutation({
    mutationFn: () => leadsApi.createTask(id!, { description: taskText.trim(), due_date: taskDate ? new Date(taskDate + 'T12:00:00').toISOString() : undefined }),
    onSuccess: () => { refreshTasks(); setTaskText(''); setTaskDate('') },
  })
  const doneTask = useMutation({ mutationFn: (t: Task) => leadsApi.completeTask(id!, t.id), onSuccess: refreshTasks })

  if (isLoading) return <div className="p-6 text-slate-400">Carregando…</div>
  if (!lead) return <div className="p-6 text-red-500">Lead não encontrado.</div>
  const st = stageOf(lead.stage)
  const custom = Object.entries(lead.custom_fields || {})

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center gap-3 mb-5">
        <button onClick={() => navigate('/leads')} className="btn-ghost p-1.5" title="Voltar"><ArrowLeft className="w-4 h-4" /></button>
        <span className={clsx('w-1 h-9 rounded-full', st.bar)} />
        <div className="flex-1 min-w-0">
          <EditableCell bold value={lead.name} placeholder="Lead sem nome" className="!text-xl !py-0.5" onSave={v => update.mutate({ name: v })} />
          <p className="text-xs text-slate-400 px-1.5">Criado em {new Date(lead.created_at).toLocaleDateString('pt-BR')}{lead.assigned_name ? ` · ${lead.assigned_name}` : ''}</p>
        </div>
        <div className="w-32"><StagePill stage={lead.stage} onChange={s => move.mutate(s)} /></div>
        <button className="btn-secondary text-sm" onClick={() => setOpen(true)}><Sparkles className="w-4 h-4 text-accent-500" /> Pedir à IA</button>
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        <div className="card p-5">
          <h2 className="font-medium text-slate-900 mb-2">Informações</h2>
          <dl>
            <Row label="Telefone"><EditableCell value={lead.phone} placeholder="Adicionar" onSave={v => update.mutate({ phone: v })} /></Row>
            <Row label="E-mail"><EditableCell value={lead.email} placeholder="Adicionar" onSave={v => update.mutate({ email: v })} /></Row>
            <Row label="Origem"><span className="px-1.5 text-sm text-slate-700">{({ ai_chat: 'Assistente IA', ui: 'Cadastro manual' } as Record<string, string>)[lead.source || ''] || lead.source || '—'}</span></Row>
            {custom.map(([key, f]) => (
              <Row key={key} label={f.label}>
                <EditableCell value={f.value} placeholder="Adicionar"
                  type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
                  onSave={v => update.mutate({ custom_fields: { [key]: v } })} />
              </Row>
            ))}
          </dl>
        </div>

        <div className="card p-5">
          <h2 className="font-medium text-slate-900 mb-3">Tarefas ({tasks.filter((t: Task) => !t.completed_at).length} pendentes)</h2>
          <form className="flex gap-2 mb-3" onSubmit={e => { e.preventDefault(); if (taskText.trim()) addTask.mutate() }}>
            <input className="input flex-1" placeholder="Nova tarefa…" value={taskText} onChange={e => setTaskText(e.target.value)} />
            <input type="date" className="input !w-36" value={taskDate} onChange={e => setTaskDate(e.target.value)} />
            <button className="btn-primary !px-3" disabled={!taskText.trim() || addTask.isPending}><Plus className="w-4 h-4" /></button>
          </form>
          {tasks.length === 0 ? <p className="text-sm text-slate-400">Nenhuma tarefa ainda.</p> : (
            <ul className="divide-y">
              {tasks.map((t: Task) => (
                <li key={t.id} className="flex items-center gap-2.5 py-2">
                  <button onClick={() => !t.completed_at && doneTask.mutate(t)} disabled={!!t.completed_at}>
                    {t.completed_at ? <CheckCircle2 className="w-5 h-5 text-green-500" /> : <Circle className="w-5 h-5 text-slate-300 hover:text-green-500 transition-colors" />}
                  </button>
                  <span className={clsx('flex-1 text-sm', t.completed_at ? 'line-through text-slate-400' : 'text-slate-800')}>{t.description}</span>
                  {t.due_date && <span className="text-xs text-slate-400">{new Date(t.due_date).toLocaleDateString('pt-BR')}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-5 mt-5">
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-medium text-slate-900 flex items-center gap-1.5"><Briefcase className="w-4 h-4 text-slate-400" /> Processos ({cases?.total ?? 0})</h2>
            <Link to="/processos" className="text-xs text-brand-600 hover:underline">Ver todos</Link>
          </div>
          {lead?.stage === 'convertido' && !cases?.data.length && (
            <p className="mb-3 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2">Cliente convertido sem processo. Cadastre abaixo para acompanhar prazos e andamentos.</p>
          )}
          {!cases?.data.length ? <p className="text-sm text-slate-400 mb-3">Nenhum processo ligado a este contato.</p> : (
            <ul className="divide-y mb-3">
              {cases.data.map(c => (
                <li key={c.id} className="flex items-center gap-2 py-2">
                  <Link to={`/processos/${c.id}`} className="flex-1 min-w-0 hover:underline">
                    <p className="text-sm font-mono text-slate-900 truncate">{c.case_number || c.title}</p>
                    <p className="text-xs text-slate-500">{[c.tribunal, c.area, c.phase].filter(Boolean).join(' · ') || c.status}{c.next_deadline ? ` · prazo ${fmtDate(c.next_deadline)}` : ''}</p>
                  </Link>
                  {c.court_url && <a href={c.court_url} target="_blank" rel="noreferrer" title="Abrir no tribunal" className="text-brand-600"><ExternalLink className="w-4 h-4" /></a>}
                  <button title="Desvincular deste contato" aria-label="Desvincular processo" className="text-slate-300 hover:text-red-500" onClick={() => { if (confirm('Desvincular este processo do contato? O processo não é apagado.')) unlinkCase.mutate(c.id) }}><Trash2 className="w-4 h-4" /></button>
                </li>
              ))}
            </ul>
          )}
          <form className="flex gap-2" onSubmit={e => { e.preventDefault(); if (newCase.trim()) createCase.mutate(newCase.trim()) }}>
            <input className="input !py-1.5 text-sm" placeholder="Novo processo: número CNJ ou título" value={newCase} onChange={e => setNewCase(e.target.value)} />
            <button className="btn-secondary !py-1.5 text-xs shrink-0" disabled={!newCase.trim() || createCase.isPending}><Plus className="w-3.5 h-3.5" /> Criar</button>
          </form>
          {unlinkedCases.length > 0 && (
            <div className="flex gap-2 mt-2">
              <select className="input !py-1.5 text-sm" value={linkId} onChange={e => setLinkId(e.target.value)} aria-label="Vincular processo existente">
                <option value="">Vincular processo existente…</option>
                {unlinkedCases.map(c => <option key={c.id} value={c.id}>{c.case_number || c.title || 'Sem título'}</option>)}
              </select>
              <button className="btn-secondary !py-1.5 text-xs shrink-0" disabled={!linkId || linkCase.isPending} onClick={() => linkCase.mutate(linkId)}>Vincular</button>
            </div>
          )}
          {caseError && <p className="text-xs text-red-600 mt-2">{caseError}</p>}
        </div>
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-medium text-slate-900 flex items-center gap-1.5"><CalendarPlus className="w-4 h-4 text-slate-400" /> Agenda</h2>
            <button className="btn-secondary !py-1 text-xs" onClick={() => setShowEvent(true)}><Plus className="w-3.5 h-3.5" /> Agendar</button>
          </div>
          {events.length === 0 ? <p className="text-sm text-slate-400">Nenhum compromisso com este contato.</p> : (
            <ul className="divide-y">
              {events.map(e => (
                <li key={e.id} className="flex items-center gap-2 py-2 text-sm">
                  <span className={clsx('badge !py-0', EVENT_TYPES[e.type].pill)}>{EVENT_TYPES[e.type].label}</span>
                  <span className="flex-1 truncate text-slate-800">{e.title}</span>
                  <span className="text-xs text-slate-500">{fmtDate(e.starts_at)} {fmtTime(e.starts_at)}</span>
                  {e.meeting_url && <a href={e.meeting_url} target="_blank" rel="noreferrer" className="text-brand-600" title="Entrar"><Video className="w-4 h-4" /></a>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="card p-5 mt-5">
        <h2 className="font-medium text-slate-900 mb-3">Notas ({notes.length})</h2>
        <div className="flex gap-2 mb-4">
          <textarea className="input flex-1 resize-none" rows={2} placeholder="Adicionar nota…" value={noteText} onChange={e => setNoteText(e.target.value)} />
          <button onClick={() => noteText.trim() && addNote.mutate(noteText.trim())} disabled={addNote.isPending || !noteText.trim()} className="btn-primary self-start">
            <Plus className="w-4 h-4" /> Salvar
          </button>
        </div>
        {notes.length === 0 ? <p className="text-sm text-slate-400">Nenhuma nota ainda.</p> : (
          <ul className="space-y-3">
            {notes.map((n: any) => (
              <li key={n.id} className="group text-sm border-l-2 border-accent-300 pl-3 flex gap-2">
                <div className="flex-1">
                  <p className="text-slate-800 whitespace-pre-wrap">{n.text}</p>
                  <p className="text-xs text-slate-400 mt-1">
                    {n.user_name} · {new Date(n.created_at).toLocaleString('pt-BR')}{n.channel !== 'ui' && ` · via ${n.channel === 'ai_chat' ? 'IA' : n.channel}`}
                  </p>
                </div>
                <button onClick={() => delNote.mutate(n.id)} title="Excluir nota" className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-600 self-start">
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {showEvent && <EventForm onClose={() => setShowEvent(false)} leadId={id} />}
      <p className="mt-4 text-xs text-slate-400"><Link to="/leads" className="underline">Voltar ao quadro</Link></p>
    </div>
  )
}

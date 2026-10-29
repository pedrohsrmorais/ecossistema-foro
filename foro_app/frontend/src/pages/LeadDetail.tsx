import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Plus, CheckCircle2, Circle, Trash2, Sparkles } from 'lucide-react'
import clsx from 'clsx'
import { leadsApi, type Task } from '../api'
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
  const [noteText, setNoteText] = useState('')
  const [taskText, setTaskText] = useState('')
  const [taskDate, setTaskDate] = useState('')

  const { data: lead, isLoading } = useQuery({ queryKey: ['lead', id], queryFn: () => leadsApi.getById(id!), enabled: !!id })
  const { data: notes = [] } = useQuery({ queryKey: ['lead-notes', id], queryFn: () => leadsApi.listNotes(id!), enabled: !!id })
  const { data: tasks = [] } = useQuery({ queryKey: ['lead-tasks', id], queryFn: () => leadsApi.listTasks(id!), enabled: !!id })

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
      <p className="mt-4 text-xs text-slate-400"><Link to="/leads" className="underline">Voltar ao quadro</Link></p>
    </div>
  )
}

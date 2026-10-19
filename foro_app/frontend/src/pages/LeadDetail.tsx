import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Plus } from 'lucide-react'
import { leadsApi } from '../api'
import { useState } from 'react'

export default function LeadDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [noteText, setNoteText] = useState('')

  const { data: lead, isLoading } = useQuery({
    queryKey: ['lead', id],
    queryFn: () => leadsApi.getById(id!),
    enabled: !!id,
  })

  const { data: notes = [] } = useQuery({
    queryKey: ['lead-notes', id],
    queryFn: () => leadsApi.listNotes(id!),
    enabled: !!id,
  })

  const { data: tasks = [] } = useQuery({
    queryKey: ['lead-tasks', id],
    queryFn: () => leadsApi.listTasks(id!),
    enabled: !!id,
  })

  const addNote = useMutation({
    mutationFn: (text: string) => leadsApi.addNote(id!, text),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lead-notes', id] })
      setNoteText('')
    },
  })

  if (isLoading) return <div className="p-6 text-slate-400">Carregando...</div>
  if (!lead) return <div className="p-6 text-red-500">Lead não encontrado.</div>

  return (
    <div className="p-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/leads')} className="btn-ghost p-1.5">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{lead.name || 'Lead sem nome'}</h1>
          <p className="text-sm text-slate-500">{lead.phone || lead.email || '—'}</p>
        </div>
        <span className="ml-auto badge bg-slate-100 text-slate-700 capitalize">{lead.stage}</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Dados do lead */}
        <div className="card p-5">
          <h2 className="font-medium text-slate-900 mb-4">Informações</h2>
          <dl className="space-y-3 text-sm">
            {lead.phone && (
              <div className="flex gap-2">
                <dt className="text-slate-500 w-28 shrink-0">Telefone</dt>
                <dd className="text-slate-900">{lead.phone}</dd>
              </div>
            )}
            {lead.email && (
              <div className="flex gap-2">
                <dt className="text-slate-500 w-28 shrink-0">E-mail</dt>
                <dd className="text-slate-900">{lead.email}</dd>
              </div>
            )}
            <div className="flex gap-2">
              <dt className="text-slate-500 w-28 shrink-0">Etapa</dt>
              <dd className="text-slate-900 capitalize">{lead.stage}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-slate-500 w-28 shrink-0">Criado em</dt>
              <dd className="text-slate-900">{new Date(lead.created_at).toLocaleDateString('pt-BR')}</dd>
            </div>
          </dl>

          {/* Campos customizados */}
          {lead.custom_fields && Object.keys(lead.custom_fields).length > 0 && (
            <>
              <hr className="my-4" />
              <h3 className="text-sm font-medium text-slate-700 mb-3">Campos customizados</h3>
              <dl className="space-y-3 text-sm">
                {Object.entries(lead.custom_fields).map(([key, field]) => (
                  field.value ? (
                    <div key={key} className="flex gap-2">
                      <dt className="text-slate-500 w-28 shrink-0">{field.label}</dt>
                      <dd className="text-slate-900">{field.value}</dd>
                    </div>
                  ) : null
                ))}
              </dl>
            </>
          )}
        </div>

        {/* Tarefas */}
        <div className="card p-5">
          <h2 className="font-medium text-slate-900 mb-4">Tarefas ({tasks.length})</h2>
          {tasks.length === 0 ? (
            <p className="text-sm text-slate-400">Nenhuma tarefa. Use a IA para criar.</p>
          ) : (
            <ul className="space-y-2">
              {tasks.map((task: any) => (
                <li key={task.id} className={`text-sm flex gap-2 ${task.completed_at ? 'line-through text-slate-400' : 'text-slate-700'}`}>
                  <span className="shrink-0">•</span>
                  <span>{task.description}</span>
                  {task.due_date && (
                    <span className="ml-auto text-xs text-slate-400 shrink-0">
                      {new Date(task.due_date).toLocaleDateString('pt-BR')}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Notas */}
      <div className="card p-5 mt-6">
        <h2 className="font-medium text-slate-900 mb-4">Notas ({notes.length})</h2>

        <div className="flex gap-2 mb-4">
          <textarea
            className="input flex-1 resize-none"
            rows={2}
            placeholder="Adicionar nota..."
            value={noteText}
            onChange={e => setNoteText(e.target.value)}
          />
          <button
            onClick={() => noteText.trim() && addNote.mutate(noteText.trim())}
            disabled={addNote.isPending || !noteText.trim()}
            className="btn-primary self-start"
          >
            <Plus className="w-4 h-4" /> Salvar
          </button>
        </div>

        {notes.length === 0 ? (
          <p className="text-sm text-slate-400">Nenhuma nota ainda.</p>
        ) : (
          <ul className="space-y-3">
            {notes.map((note: any) => (
              <li key={note.id} className="text-sm border-l-2 border-slate-200 pl-3">
                <p className="text-slate-800">{note.text}</p>
                <p className="text-xs text-slate-400 mt-1">
                  {note.user_name} · {new Date(note.created_at).toLocaleString('pt-BR')}
                  {note.channel !== 'ui' && ` · via ${note.channel}`}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

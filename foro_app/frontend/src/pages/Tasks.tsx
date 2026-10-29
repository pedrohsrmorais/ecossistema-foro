import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { CheckCircle2, Circle, ChevronDown, ChevronRight, CalendarClock } from 'lucide-react'
import clsx from 'clsx'
import { tasksApi, leadsApi, type Task } from '../api'

type GroupKey = 'late' | 'today' | 'upcoming' | 'nodate' | 'done'
const GROUPS: { key: GroupKey; label: string; bar: string }[] = [
  { key: 'late',     label: 'Atrasadas',   bar: 'bg-red-500' },
  { key: 'today',    label: 'Hoje',        bar: 'bg-amber-500' },
  { key: 'upcoming', label: 'Próximas',    bar: 'bg-sky-500' },
  { key: 'nodate',   label: 'Sem data',    bar: 'bg-slate-400' },
  { key: 'done',     label: 'Concluídas',  bar: 'bg-green-500' },
]

function groupOf(t: Task): GroupKey {
  if (t.completed_at) return 'done'
  if (!t.due_date) return 'nodate'
  const d = new Date(t.due_date); const now = new Date()
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const endToday = new Date(startToday.getTime() + 86_400_000)
  if (d < startToday) return 'late'
  if (d < endToday) return 'today'
  return 'upcoming'
}

export default function Tasks() {
  const qc = useQueryClient()
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({ done: true })
  const { data: tasks = [], isLoading } = useQuery({ queryKey: ['tasks'], queryFn: () => tasksApi.listAll({ pending_only: false, limit: 200 }) })

  const complete = useMutation({
    mutationFn: (t: Task) => leadsApi.completeTask(t.lead_id || 'sem-lead', t.id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tasks'] }); qc.invalidateQueries({ queryKey: ['tasks-pending'] }) },
  })

  const grouped = useMemo(() => {
    const g: Record<GroupKey, Task[]> = { late: [], today: [], upcoming: [], nodate: [], done: [] }
    for (const t of Array.isArray(tasks) ? tasks : []) g[groupOf(t)].push(t)
    return g
  }, [tasks])

  const pending = (Array.isArray(tasks) ? tasks : []).filter(t => !t.completed_at).length

  return (
    <div className="p-6 max-w-4xl">
      <h1 className="text-xl font-semibold text-slate-900">Tarefas</h1>
      <p className="text-sm text-slate-500 mb-5">{pending} pendente(s) · marque para concluir · peça à IA para agendar novas</p>

      {isLoading ? <div className="card p-8 text-center text-slate-400">Carregando…</div> : (
        <div className="space-y-5">
          {GROUPS.map(g => {
            const rows = grouped[g.key]
            if (rows.length === 0 && g.key !== 'today') return null
            const isCollapsed = collapsed[g.key]
            return (
              <section key={g.key} className="card overflow-hidden">
                <button onClick={() => setCollapsed(c => ({ ...c, [g.key]: !c[g.key] }))}
                  className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-slate-50 text-left">
                  {isCollapsed ? <ChevronRight className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
                  <span className={clsx('w-1 h-5 rounded-full', g.bar)} />
                  <span className="font-semibold text-slate-900">{g.label}</span>
                  <span className="text-xs text-slate-400">{rows.length}</span>
                </button>
                {!isCollapsed && (rows.length === 0
                  ? <p className="px-4 py-3 border-t text-sm text-slate-400">Nada para hoje.</p>
                  : <ul className="border-t divide-y">
                      {rows.map(t => (
                        <li key={t.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50/70">
                          <button onClick={() => !t.completed_at && complete.mutate(t)} disabled={!!t.completed_at}
                            title={t.completed_at ? 'Concluída' : 'Marcar como concluída'}>
                            {t.completed_at
                              ? <CheckCircle2 className="w-5 h-5 text-green-500" />
                              : <Circle className="w-5 h-5 text-slate-300 hover:text-green-500 transition-colors" />}
                          </button>
                          <div className="flex-1 min-w-0">
                            <p className={clsx('text-sm truncate', t.completed_at ? 'line-through text-slate-400' : 'text-slate-800')}>
                              {t.is_deadline ? <span className="badge bg-amber-100 text-amber-700 !py-0 mr-2">Prazo</span> : null}{t.description}
                            </p>
                            <p className="text-xs flex gap-3">
                              {t.lead_name && t.lead_id && <Link to={`/leads/${t.lead_id}`} className="text-brand-600 hover:underline">{t.lead_name}</Link>}
                              {t.case_id && <Link to={`/processos/${t.case_id}`} className="text-brand-600 hover:underline font-mono">{t.case_number || 'Processo'}</Link>}
                            </p>
                          </div>
                          {t.due_date && (
                            <span className={clsx('flex items-center gap-1 text-xs shrink-0', g.key === 'late' ? 'text-red-600' : 'text-slate-400')}>
                              <CalendarClock className="w-3.5 h-3.5" /> {new Date(t.due_date).toLocaleDateString('pt-BR')}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>)}
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}

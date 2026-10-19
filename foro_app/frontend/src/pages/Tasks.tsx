import { useQuery } from '@tanstack/react-query'
import { tasksApi } from '../api'
import { CheckCircle, Circle } from 'lucide-react'

export default function Tasks() {
  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => tasksApi.listAll({ pending_only: false }),
  })

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold text-slate-900 mb-6">Tarefas</h1>
      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-slate-400">Carregando...</div>
        ) : (Array.isArray(tasks) && tasks.length === 0) ? (
          <div className="p-8 text-center text-slate-400">Nenhuma tarefa criada ainda. Use a IA para criar tarefas.</div>
        ) : (
          <ul className="divide-y">
            {Array.isArray(tasks) && tasks.map((task: any) => (
              <li key={task.id} className="flex items-start gap-3 px-5 py-4">
                {task.completed_at
                  ? <CheckCircle className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
                  : <Circle className="w-5 h-5 text-slate-300 shrink-0 mt-0.5" />
                }
                <div className="flex-1">
                  <p className={`text-sm ${task.completed_at ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                    {task.description}
                  </p>
                  {task.lead_name && (
                    <p className="text-xs text-slate-500 mt-0.5">Lead: {task.lead_name}</p>
                  )}
                </div>
                {task.due_date && (
                  <span className="text-xs text-slate-400 shrink-0">
                    {new Date(task.due_date).toLocaleDateString('pt-BR')}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

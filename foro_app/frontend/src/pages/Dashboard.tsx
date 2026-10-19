import { useQuery } from '@tanstack/react-query'
import { leadsApi, tasksApi } from '../api'
import { Users, CheckSquare, TrendingUp } from 'lucide-react'

export default function Dashboard() {
  const { data: funnel = [] } = useQuery({
    queryKey: ['funnel'],
    queryFn: () => leadsApi.getFunnelSummary(),
  })

  const { data: tasks = [] } = useQuery({
    queryKey: ['tasks-pending'],
    queryFn: () => tasksApi.listAll({ pending_only: true, limit: 5 }),
  })

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

      {/* Funil */}
      <div className="card p-5">
        <h2 className="font-medium text-slate-900 mb-4">Funil de leads</h2>
        {funnel.length === 0 ? (
          <p className="text-sm text-slate-400">Nenhum lead cadastrado ainda.</p>
        ) : (
          <div className="space-y-3">
            {funnel.map((stage: any) => (
              <div key={stage.stage} className="flex items-center gap-3">
                <span className="text-sm text-slate-600 w-32 capitalize">{stage.stage.replace('_', ' ')}</span>
                <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
                  <div
                    className="h-2 bg-brand-500 rounded-full transition-all"
                    style={{ width: total > 0 ? `${(stage.total / total) * 100}%` : '0%' }}
                  />
                </div>
                <span className="text-sm font-medium text-slate-900 w-8 text-right">{stage.total}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
